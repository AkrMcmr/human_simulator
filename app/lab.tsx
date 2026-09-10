"use client";

import Link from "next/link";
import DecisionHistory from "./decision-history";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Play, Pause, RotateCcw, SkipForward, Download, Upload, SlidersHorizontal, ArrowRight, FlaskConical, Eye, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACTION_LABELS, type HumanParameters } from "@/packages/contracts/src/index.ts";
import { DEFAULT_PARAMETERS } from "@/packages/human/src/index.ts";
import { createSimulation, observeSimulation, stepSimulation, archiveRun, restoreRun, runExperiment, HUMAN_MODELS, MODEL_IDS, resolveModel, type Frame, type Provenance } from "@/packages/simulation/src/index.ts";
import { DEFAULT_SETTINGS, pairExperiment, measure, summarize, COMPARISON_LEVELS, type PairSettings, type ComparisonRow } from "@/packages/experiments/src/index.ts";
import { agentColor, eventLines } from "@/packages/observer/src/index.ts";

const fmt = (n: number, digits = 2) => n.toFixed(digits);
const pct = (n: number) => Math.round(n * 100) + "%";
function Choice({ label, value, values, onChange }: { label: string; value: string; values: [string, string][]; onChange: (s: string) => void }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{values.map(([v, text]) => <SelectItem key={v} value={v}>{text}</SelectItem>)}</SelectContent></Select>;
}
function Range({ label, value, min = 0, max = 1, step = .05, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (n: number) => void }) {
  return <div className="range-field"><div><span>{label}</span><output>{fmt(value, max > 1 ? 0 : 2)}</output></div><Slider aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={([n]) => onChange(n)} /></div>;
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function WorldMap({ frame, history, view }: { frame: Frame; history: Frame[]; view: string }) {
  const { world } = frame;
  const observation = frame.agents.find(a => a.id === view)?.trace?.observation;
  const self = observation?.selfPosition;
  const animals = view === "all" ? world.animals : self && observation ? [{ id: view, position: self }, ...observation.animals.map(a => ({ id: a.trackId, position: { x: self.x + a.relativePosition.x, y: self.y + a.relativePosition.y } }))] : [];
  const resources = view === "all" ? world.resources : self && observation ? observation.resources.map(r => ({ id: r.id, kind: r.kind, amount: r.strength, radius: 1, position: { x: self.x + r.relativePosition.x, y: self.y + r.relativePosition.y } })) : [];
  const w = world.parameters.width * 20, h = world.parameters.height * 20;
  return <div className="map-wrap"><svg className="world-map" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={view === "all" ? "二人の位置・移動軌跡と資源" : `個体${view}が直前の判断で見たもの`}>
    <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#21384b" strokeWidth=".7" /></pattern></defs>
    <rect width={w} height={h} fill="#102333" /><rect x="12" y="12" width={w - 24} height={h - 24} rx="8" fill="url(#grid)" stroke="#304657" />
    {view === "all" && frame.world.animals.map(a => <polyline key={a.id} points={history.slice(-90).flatMap(f => f.world.animals.filter(p => p.id === a.id).map(p => `${p.position.x * 20},${p.position.y * 20}`)).join(" ")} fill="none" stroke={agentColor(a.id)} strokeWidth="2" opacity=".35" />)}
    {resources.map(r => <g key={r.id} transform={`translate(${r.position.x * 20} ${r.position.y * 20})`}><circle r={r.radius * 20} fill={r.kind === "food" ? "#62cc9e" : "#f2a36c"} opacity=".07" stroke={r.kind === "food" ? "#62cc9e" : "#f2a36c"} strokeWidth="2" />{r.kind === "food" ? <rect x="-6" y="-6" width="12" height="12" rx="3" fill="#74d6ac" opacity={.2 + r.amount * .8} /> : <path d="M-6 5 Q-10 -1 -4 -7 M1 5 Q-3 -1 3 -7 M8 5 Q4 -1 10 -7" fill="none" stroke="#f2a36c" strokeWidth="2" />}<text y="25" textAnchor="middle" fill="#9caebb" fontSize="10">{r.kind === "food" ? "食料" : "暖かい場所"}</text></g>)}
    {animals.map(a => <g key={a.id} transform={`translate(${a.position.x * 20} ${a.position.y * 20})`}>{view === "all" && frame.agents.find(p => p.id === a.id)?.action === "vocalize" && <><circle r="28" fill="none" stroke={agentColor(a.id)} opacity=".55" /><circle r="38" fill="none" stroke={agentColor(a.id)} opacity=".22" /></>}<circle r="17" fill={agentColor(a.id)} opacity=".13" /><circle r="10" fill={agentColor(a.id)} stroke="#102333" strokeWidth="3" /><text y="-24" textAnchor="middle" fill={agentColor(a.id)} fontSize="13" fontWeight="600">{a.id}</text></g>)}
    <text x="28" y={h - 25} fill="#70899a" fontSize="10">{world.parameters.width} × {world.parameters.height} · 抽象空間</text>
    {view !== "all" && !observation && <text x={w / 2} y={h / 2} textAnchor="middle" fill="#c4d2dd" fontSize="15">1ステップ進めると、最初の知覚が表示されます</text>}
  </svg><div className="map-legend"><span><i style={{ background: agentColor("A") }} />個体 A</span><span><i style={{ background: agentColor("B") }} />個体 B</span><span className="map-caption">{view === "all" ? "世界の状態 · 軌跡は直近90ステップ" : `判断入力 t=${observation?.tick ?? "—"} · 見えているもののみ`}</span></div></div>;
}
function Mind({ frame, id, onChange }: { frame: Frame; id: string; onChange: (id: string) => void }) {
  const a = frame.agents.find(a => a.id === id)!;
  const t = a.trace;
  return <aside className="panel mind-panel"><div className="panel-heading"><Eye size={16} /><h2>個体の内側</h2></div><Tabs value={id} onValueChange={onChange}><TabsList className="full-tabs"><TabsTrigger value="A">個体 A</TabsTrigger><TabsTrigger value="B">個体 B</TabsTrigger></TabsList></Tabs>
    <section className="mind-section"><div className="action-heading"><span className="agent-dot" style={{ background: agentColor(id) }}>{id}</span><div><small>直前に選んだ行動</small><h3>{t ? ACTION_LABELS[t.selected] : "まだ行動していません"}</h3></div></div><p className="caption">{t ? `t=${t.tick} の知覚から選択${t.exploratory ? " · 探索による試行" : ""}` : "再生すると判断が始まります。"}</p>
    {([['hunger', '空腹'], ['fatigue', '疲労'], ['cold', '寒さ'], ['health', '健康']] as const).map(([key, label]) => <div className="body-meter" key={key}><span>{label}</span><div><i style={{ width: pct(a.body[key]), background: key === "health" ? "#44a787" : agentColor(id) }} /></div><output>{pct(a.body[key])}</output></div>)}</section>
    <section className="mind-section"><h3>相手についての推定</h3><dl className="detail-list"><div><dt>現在の危険度</dt><dd>{t ? fmt(t.perceivedRisk) : "—"}</dd></div><div><dt>相手への不確実さ</dt><dd>{t ? fmt(t.uncertainty) : "—"}</dd></div><div><dt>知覚した距離</dt><dd>{t?.peerDistance != null ? fmt(t.peerDistance, 1) : "視認なし"}</dd></div><div><dt>学習した遷移</dt><dd>{a.learnedTransitions}</dd></div><div><dt>距離予測の誤差</dt><dd>{t?.predictionError != null ? fmt(t.predictionError, 3) : "—"}</dd></div></dl><p className="caption">近距離での観測量: {fmt(a.peerEvidence.reduce((s, p) => s + p.closeEvidence, 0), 1)}。遠くて危険度が低くても、安全を学習したとは限りません。</p></section>
    <section className="mind-section"><h3>行動候補の評価</h3>{t ? [...t.scores].sort((a, b) => b.utility - a.utility).slice(0, 5).map(s => <div className={`score-row ${s.action === t.selected ? 'chosen' : ''}`} key={s.action}><span>{ACTION_LABELS[s.action]}{s.action === t.selected && " ←"}</span><output>{fmt(s.utility, 3)}</output></div>) : <p className="caption">身体・好奇心・警戒などの重みを表示します。</p>}<p className="caption">評価値は確率ではありません。全候補と内訳はJSONに記録されます。</p></section>
    <section className="mind-section"><h3>聞いた音のまとまり <span className="count">{a.heardSounds.length}</span></h3><svg className="sound-space" viewBox="0 0 240 105" role="img" aria-label="音響特徴のまとまり。語や意味ではありません"><path d="M20 8 V85 H230" stroke="#d8e1e7" fill="none" />{a.heardSounds.map((s, i) => <circle key={i} cx={25 + s.shape.openness * 195} cy={80 - s.shape.resonance * 65} r={Math.min(9, 3 + Math.sqrt(s.samples))} fill={agentColor(id)} opacity=".7" />)}<text x="140" y="102" fill="#73828e" fontSize="10">開き →</text></svg><p className="caption">連続した音響特徴の分類です。共有音素・言葉・意味はまだありません。</p></section>
  </aside>;
}
export default function Lab({ provenance }: { provenance: Provenance }) {
  const [draft, setDraft] = useState<PairSettings>(() => structuredClone(DEFAULT_SETTINGS));
  const [initial] = useState(() => {
    const config = pairExperiment(DEFAULT_SETTINGS);
    const state = createSimulation(config);
    return { config, state, frames: [observeSimulation(state)] };
  });
  const [activeConfig, setActiveConfig] = useState(initial.config);
  const configRef = useRef(initial.config);
  const engineRef = useRef(initial.state);
  const historyRef = useRef([...initial.frames]);
  const [frames, setFrames] = useState<Frame[]>(initial.frames);
  const [cursor, setCursor] = useState(0); const cursorRef = useRef(0);
  const [running, setRunning] = useState(false); const [speed, setSpeed] = useState("4");
  const [tab, setTab] = useState("observe"); const [person, setPerson] = useState("A"); const [editing, setEditing] = useState("a"); const [view, setView] = useState("all");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0);
  const [comparison, setComparison] = useState<ComparisonRow[]>([]); const [comparisonSettings, setComparisonSettings] = useState<PairSettings | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const frame = frames[cursor]; const seen = useMemo(() => frames.slice(0, cursor + 1), [frames, cursor]);
  const metrics = useMemo(() => measure(seen), [seen]); const lines = useMemo(() => eventLines(seen).slice(-9).reverse(), [seen]);
  const hasDraftChanges = JSON.stringify(pairExperiment(draft)) !== JSON.stringify(activeConfig);
  const setPosition = useCallback((n: number) => { cursorRef.current = n; setCursor(n); }, []);
  const advance = useCallback((count: number) => {
    const history = historyRef.current; let pos = cursorRef.current;
    for (let i = 0; i < count; i++) {
      if (pos < history.length - 1) { pos++; continue; }
      if (engineRef.current.tick >= engineRef.current.horizon) { setRunning(false); break; }
      engineRef.current = stepSimulation(engineRef.current); history.push(observeSimulation(engineRef.current)); pos++;
    }
    setFrames([...history]); setPosition(pos);
  }, [setPosition]);
  useEffect(() => { if (!running) return; const interval = setInterval(() => advance(Number(speed)), 100); return () => clearInterval(interval); }, [running, speed, advance]);
  function reset(apply: boolean) {
    try {
      const config = apply ? pairExperiment(draft) : configRef.current;
      const state = createSimulation(config); setRunning(false); configRef.current = config; setActiveConfig(config); engineRef.current = state;
      historyRef.current = [observeSimulation(state)]; setFrames([...historyRef.current]); setPosition(0); setMessage(apply ? "新しい初期条件を適用しました。" : "同じ初期条件に戻しました。");
    } catch (e) { setMessage((e as Error).message); }
  }
  const change = <K extends keyof PairSettings>(key: K, value: PairSettings[K]) => setDraft(d => ({ ...d, [key]: value }));
  const params = draft[editing as "a" | "b"];
  function parameter(key: keyof HumanParameters, value: number) { change(editing as "a" | "b", { ...params, [key]: value }); }
  async function compare() {
    setRunning(false); setBusy(true); setProgress(0); setComparison([]); const settings = structuredClone(draft); setComparisonSettings(settings);
    try {
      const seeds = Array.from({ length: 8 }, (_, i) => (settings.seed + i) >>> 0); const rows: ComparisonRow[] = [];
      for (const curiosity of COMPARISON_LEVELS) {
        const row: ComparisonRow = { curiosity, seeds, results: [] };
        for (const seed of seeds) {
          await new Promise(resolve => setTimeout(resolve, 0));
          row.results.push(measure(runExperiment(pairExperiment({ ...settings, seed, a: { ...settings.a, curiosity }, b: { ...settings.b, curiosity } })).frames));
          setProgress(rows.length * 8 + row.results.length);
        }
        rows.push(row); setComparison([...rows]);
      }
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  async function importFile(file?: File) {
    if (!file) return; setRunning(false); setMessage("記録を初期条件から再計算して検証しています…");
    try {
      if (file.size > 35_000_000) throw new Error("この画面では35MB以下の記録を読み込めます。");
      const data = JSON.parse(await file.text());
      if (data.config?.horizon > 1200 || data.config?.agents?.length !== 2 || data.config.agents.map((a: {id: string}) => a.id).sort().join() !== "A,B") throw new Error("この画面では個体A・Bの二人、1200ステップまでの記録を読み込めます。");
      const restored = restoreRun(data); configRef.current = restored.config; setActiveConfig(restored.config); engineRef.current = restored.state; historyRef.current = restored.frames; setFrames([...restored.frames]); setPosition(restored.state.tick);
      const a = restored.config.agents.find(a => a.id === 'A')!, b = restored.config.agents.find(a => a.id === 'B')!;
      setDraft({ ...structuredClone(DEFAULT_SETTINGS), seed: restored.config.seed, horizon: restored.config.horizon, initialDistance: Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y), ambientCold: restored.state.world.parameters.ambientCold, soundEnabled: restored.state.world.parameters.soundEnabled, resourceLayout: restored.config.resources?.some(r => r.id === 'food-center') ? 'shared' : 'separate', a: { ...DEFAULT_PARAMETERS, ...a.parameters }, b: { ...DEFAULT_PARAMETERS, ...b.parameters }, model: restored.state.model, body: { ...a.body } });
      setMessage("記録の再現を確認して読み込みました。再生または続きの実行ができます。"); setTab("observe");
    } catch (e) { setMessage((e as Error).message); } finally { if (inputRef.current) inputRef.current.value = ""; }
  }
  return <div className="lab-shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark"><Activity size={22} /></span><span>HUMAN WORLD LAB<small>人間モデル実験室</small></span></Link><span className="version-pill"><i />探索モデル {resolveModel(activeConfig.model).label}</span></header>
    <main><div className="page-heading"><div><p className="eyebrow">EXPERIMENT 001 / FIRST ENCOUNTER</p><h1>最初の出会い<span>二人の知覚と学習を観察する</span></h1></div><div className="heading-actions"><input ref={inputRef} type="file" accept=".json,application/json" hidden onChange={e => void importFile(e.target.files?.[0])} /><Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}><Upload />記録を開く</Button><Button variant="outline" onClick={() => download(`encounter-seed${configRef.current.seed}-t${engineRef.current.tick}.json`, archiveRun(configRef.current, engineRef.current, historyRef.current, provenance))}><Download />JSONを書き出す</Button></div></div>
    <div className="workspace"><aside className="panel settings-panel"><div className="panel-heading"><SlidersHorizontal size={16} /><h2>実験条件</h2></div><fieldset disabled={busy}><label className="field-label" htmlFor="seed">乱数シード</label><Input id="seed" type="number" min={0} max={4294967295} value={draft.seed} onChange={e => change("seed", Number(e.target.value))} /><p className="caption">同じモデル・条件・シードで再現</p><label className="field-label">実行ステップ</label><Choice label="実行ステップ" value={String(draft.horizon)} values={[200,400,800,1200].map(n => [String(n), `${n} ステップ`])} onChange={s => change("horizon", Number(s))} /><label className="field-label">人間モデル</label><Choice label="人間モデル" value={draft.model} values={MODEL_IDS.map(id => [id, HUMAN_MODELS[id].label])} onChange={s => change("model", s)} /><p className="caption">二人とも同じ規則で判断します。候補・対照は実験用で、既定版ではありません。</p>
    <div className="settings-divider" /><h3>個体の性質</h3><Tabs value={editing} onValueChange={setEditing}><TabsList className="full-tabs"><TabsTrigger value="a">個体 A</TabsTrigger><TabsTrigger value="b">個体 B</TabsTrigger></TabsList></Tabs><Range label="好奇心" value={params.curiosity} onChange={n => parameter("curiosity", n)} /><Range label="警戒傾向" value={params.caution} onChange={n => parameter("caution", n)} /><Range label="学習率" value={params.learningRate} onChange={n => parameter("learningRate", n)} step={.01} /><Button size="sm" variant="ghost" className="copy-button" onClick={() => change(editing === 'a' ? 'b' : 'a', { ...params })}>もう一人にも同じ値を適用<ArrowRight /></Button>
    <div className="settings-divider" /><h3>舞台</h3><Range label="二人の初期距離" value={draft.initialDistance} min={3} max={26} step={1} onChange={n => change("initialDistance", n)} /><Range label="環境の寒さ" value={draft.ambientCold} onChange={n => change("ambientCold", n)} /><label className="field-label">食料の配置</label><Choice label="食料の配置" value={draft.resourceLayout} values={[["shared", "中央に共有の食料"], ["separate", "離れた二つの食料"]]} onChange={s => change("resourceLayout", s as PairSettings['resourceLayout'])} /><div className="switch-field"><label htmlFor="sound">音を相手に伝える</label><Switch id="sound" checked={draft.soundEnabled} onCheckedChange={n => change("soundEnabled", n)} /></div><p className="caption">オフでも発声は可能。音の伝達だけを止めます。</p></fieldset><div className="apply-box"><Button disabled={busy} className="w-full" onClick={() => reset(true)}><FlaskConical />この条件で新しい実験</Button><p className="caption">{hasDraftChanges ? "変更あり · 次の実験で適用されます" : "現在の実験と同じ条件です"}<br />新しい実験は画面内の記録を置き換えます。</p></div></aside>
    <section className="center-column"><Tabs value={tab} onValueChange={s => { setTab(s); if (s !== 'observe') setRunning(false); }}><TabsList className="main-tabs"><TabsTrigger value="observe">観察</TabsTrigger><TabsTrigger value="compare">条件比較</TabsTrigger><TabsTrigger value="notes">設計メモ</TabsTrigger></TabsList></Tabs>
    {message && <div className="notice" role="status">{message}<Button variant="ghost" size="xs" aria-label="通知を閉じる" onClick={() => setMessage("")}>×</Button></div>}
    {tab === 'observe' && <><div className="panel stage-panel"><div className="transport"><div className="transport-buttons"><Button disabled={busy} size="sm" onClick={() => { if (!running && cursorRef.current >= activeConfig.horizon) setPosition(0); setRunning(!running); }}>{running ? <Pause /> : <Play />}{running ? "停止" : "再生"}</Button><Button disabled={busy || running || cursor >= activeConfig.horizon} variant="outline" size="icon-sm" aria-label="1ステップ進む" onClick={() => advance(1)}><SkipForward /></Button><Button disabled={busy} variant="ghost" size="icon-sm" aria-label="同じ条件で最初に戻す" onClick={() => reset(false)}><RotateCcw /></Button><Choice label="実行速度" value={speed} values={[["1","1×"],["4","4×"],["12","12×"]]} onChange={setSpeed} /></div><div className="tick-status"><span className={running ? 'live-dot active' : 'live-dot'} />{running ? "実行中" : cursor < frames.length - 1 ? "記録を表示" : cursor >= activeConfig.horizon ? "完了" : "一時停止"}<strong>{cursor}<span> / {activeConfig.horizon}</span></strong></div></div>
    <WorldMap frame={frame} history={seen} view={view} /><div className="view-bar"><span><Eye size={14} /> 観察する視点</span><Choice label="視点" value={view} values={[["all","世界全体"],["A","個体 A の知覚"],["B","個体 B の知覚"]]} onChange={setView} /></div><div className="metric-strip"><div><small>二人の距離</small><strong>{frame.distance === null ? "—" : fmt(frame.distance, 1)}<em>u</em></strong></div><div><small>発声した回数</small><strong>{metrics.vocalizations}</strong></div><div><small>音を聞いた回数</small><strong>{metrics.heardSounds}</strong></div><div><small>近距離の割合</small><strong>{pct(metrics.closeFraction)}</strong></div></div></div>
    <div className="panel timeline-panel"><div className="section-row"><h2>危険度の推定</h2><span className="caption">A <i className="legend-line cyan" /> B <i className="legend-line amber" /> 0–1</span></div><svg className="risk-chart" viewBox="0 0 660 95" preserveAspectRatio="none" role="img" aria-label="記録された危険度の時系列"><path d="M0 10H660 M0 45H660 M0 80H660" stroke="#edf1f4" fill="none" />{['A','B'].map(id => <polyline key={id} points={frames.map(f => `${f.tick / Math.max(1, activeConfig.horizon) * 660},${80 - (f.agents.find(a => a.id === id)?.trace?.perceivedRisk ?? 0) * 70}`).join(' ')} stroke={agentColor(id)} fill="none" strokeWidth="2" />)}<path d={`M${cursor / activeConfig.horizon * 660} 4V88`} stroke="#70818f" strokeDasharray="3 3" /></svg><Slider aria-label="記録をさかのぼる" value={[cursor]} min={0} max={Math.max(1, frames.length - 1)} step={1} disabled={frames.length <= 1} onValueChange={([n]) => { setRunning(false); setPosition(n); }} /><div className="timeline-labels"><span>t = 0</span><span>記録をさかのぼる</span><span>t = {frames.length - 1}</span></div></div>
    <DecisionHistory frames={seen} id={person} onPerson={setPerson} onSeek={tick => { setRunning(false); setPosition(tick); }} />
    <div className="panel events-panel"><div className="section-row"><h2>観察ログ</h2><span className="caption">実際の行動・知覚から生成</span></div>{lines.length ? lines.map((line, i) => <div className="event-row" key={`${line.tick}-${line.id}-${i}`}><time>t {String(line.tick).padStart(3,'0')}</time><span className="event-agent" style={{ color: agentColor(line.id) }}>{line.id}</span><span>{line.text}</span></div>) : <div className="empty-state"><Activity size={24} /><p>まだ出会いは始まっていません。</p><span>再生すると、選んだ行動と新しい知覚がここに残ります。</span></div>}</div></>}
    {tab === 'compare' && <div className="panel comparison-panel"><p className="eyebrow">CONTROLLED EXPERIMENT</p><h2>好奇心が変わると、どうなる？</h2><p>二人の好奇心を3段階に変え、各条件を同じ8個のシードで実行します。それ以外は左の設定を固定します。</p><div className="comparison-actions"><Button disabled={busy} onClick={() => void compare()}><FlaskConical />{busy ? `計算中 ${progress} / 24` : "24回の実験を実行"}</Button><Button variant="outline" disabled={busy || comparison.length !== 3} onClick={() => download('curiosity-comparison.json', { format: 'human-world-lab/comparison', settings: comparisonSettings, provenance, rows: comparison })}><Download />結果を書き出す</Button></div>{comparisonSettings && <p className="caption">各条件 n=8 · {comparisonSettings.horizon} ステップ · 開始シード {comparisonSettings.seed} · 表示は平均 ± 標本標準偏差</p>}{comparison.length > 0 ? <><div className="comparison-cards">{comparison.map(row => { const d = summarize(row.results.map(r => r.meanDistance)); return <article key={row.curiosity}><small>好奇心 {fmt(row.curiosity)}</small><strong>{fmt(d.mean,1)}<em>u</em></strong><span>平均距離 · ± {fmt(d.sd,1)}</span><div className="comparison-bar"><i style={{ width: `${Math.min(100, d.mean / 40 * 100)}%` }} /></div><p>近距離 {pct(summarize(row.results.map(r => r.closeFraction)).mean)}</p></article>; })}</div><div className="table-scroll"><table><thead><tr><th>好奇心</th><th>発声回数</th><th>危険度</th><th>距離予測の絶対誤差</th></tr></thead><tbody>{comparison.map(r => <tr key={r.curiosity}><td>{fmt(r.curiosity)}</td>{(['vocalizations','meanRisk','predictionMAE'] as const).map(key => { const s = summarize(r.results.map(m => m[key])); return <td key={key}>{fmt(s.mean)} ± {fmt(s.sd)}</td>; })}</tr>)}</tbody></table></div></> : <div className="empty-state"><FlaskConical size={30} /><p>一つの物語より、複数の実験を。</p><span>条件を変えたときの傾向とばらつきを比較できます。</span></div>}<div className="model-note">この比較で分かるのは、このモデルの挙動です。人間への妥当性や因果関係の実証ではありません。予測誤差は相手を連続して視認した場面だけで測ります。</div></div>}
    {tab === 'notes' && <div className="panel notes-panel"><p className="eyebrow">A MODEL THAT CAN EVOLVE</p><h2>固定するのは、問いと境界。</h2><p>知覚 → 内部状態の更新 → 行動選択 → 世界の変化 → フィードバック。この循環を、観察可能で差し替え可能なモジュールとして実装しています。実行時にLLMは使いません。</p><h3>生まれた時点で与えているもの</h3><p>成人相当を想定した移動・発声の能力、空腹・寒さ・疲労への対処、同種らしさを見分ける能力。好奇心・警戒傾向・学習率と効用式は、実装上の仮定です。</p><h3>今、学習するもの</h3><p>自分の行動の後に相手との距離がどう変化したか、近くにいた相手と危害が結びついたか、聞いた音にどんな特徴のまとまりがあるか。相手の思考や意図は渡しません。これらは相関の学習で、意図の理解ではありません。</p><h3>まだ入っていないもの</h3><p>音と対象・目的の対応、共有語彙、文法、社会的規範、愛着、性欲、生殖、育児、世代交代。発声が増えても「言語が生まれた」とは判定しません。</p><h3>次に改善するための約束</h3><ul><li>人間・世界・実行エンジン・実験・表示の責務を分離する。</li><li>モデルと実験条件の版を記録し、同条件で比較する。</li><li>仮定、学習の結果、実証済みの性質を区別する。</li><li>単位は抽象的なステップと距離。現実の秒やメートルに換算しない。</li></ul><h3>調査の出発点</h3><p className="reference-links"><a href="https://act-r.psy.cmu.edu/about/" target="_blank" rel="noreferrer">ACT-R</a><a href="https://www.pyoudeyer.com/connectionScienceOudeyer05.pdf" target="_blank" rel="noreferrer">音声の自己組織化</a><a href="https://www.jasss.org/22/3/6.html" target="_blank" rel="noreferrer">モデルの検証</a></p><p className="caption">比較・調査する候補です。この初版が各理論を再現しているという意味ではありません。</p><div className="model-note">探索モデル {resolveModel(activeConfig.model).version} · 計算の基盤を検証する段階です。高精度な人間モデルとしての校正・実証はこれから行います。</div></div>}
    </section><Mind frame={frame} id={person} onChange={setPerson} /></div></main><footer><span><Volume2 size={13} /> 音は特徴量として計算され、実際の音声は再生しません</span><span>記録はこの画面内で保持 · 残すときはJSONを書き出す</span></footer>
  </div>;
}
