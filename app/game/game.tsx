"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ACTION_LABELS, type ActionKind } from "../../packages/contracts/src/index.ts";
import type { Frame, Provenance } from "../../packages/simulation/src/index.ts";
import {
  STAGES, EDIT_COST, act, currentQuestion, perceptionNow, recordGame, replayGame, stageById, startGame,
  type GameState, type MindEdit, type PlayerAction, type RoundResult, type Stage, type Subject,
} from "../../packages/game/src/index.ts";
import { TERM_LABELS } from "../../packages/game/src/labels.ts";

/** Display layer only: every change goes through the pure game reducer; nothing here touches the engine directly. */
const ACTIONS: ActionKind[] = ["observe", "approach", "withdraw", "explore", "forage", "warm", "rest", "vocalize"];
const ACTION_ICONS: Record<ActionKind, string> = { observe: "👁", approach: "→", withdraw: "←", explore: "✦", forage: "🍎", warm: "🔥", rest: "☾", vocalize: "♪" };
const COLORS: Record<string, string> = { A: "#4fd1e8", B: "#f5b44b" };
const CONFIDENCE: { value: 1 | 2 | 3; label: string; note: string }[] = [
  { value: 1, label: "たぶん", note: "当たり +50 / 外れ 0" },
  { value: 2, label: "きっと", note: "当たり +100 / 外れ −20" },
  { value: 3, label: "絶対", note: "当たり +150 / 外れ −40" },
];
type Tool = "none" | "placeFood" | "placeFire" | "moveResource" | "removeResource";
const pct = (n: number) => Math.round(n * 100) + "%";

function readBest(key: string): number | null {
  try { const v = localStorage.getItem("hwl-game-best/" + key); return v === null ? null : Number(v); } catch { return null; }
}
function writeBest(key: string, value: number) {
  try { localStorage.setItem("hwl-game-best/" + key, String(value)); } catch { /* per-viewer convenience only */ }
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StageSelect({ onStart }: { onStart: (stage: Stage) => void }) {
  // Read per-viewer best scores after mount so server and client render the same first HTML.
  const [bests, setBests] = useState<Record<string, number | null>>({});
  useEffect(() => { setBests(Object.fromEntries(STAGES.map((s) => [s.id, readBest(s.id)]))); }, []);
  return <div className="g-stages">
    <div className="g-hero">
      <p className="g-eyebrow">A GAME ON THE HUMAN WORLD LAB MODEL</p>
      <h1>はじまりのふたり</h1>
      <p>言葉も約束もない二人を、命令せずに見守る。あなたにできるのは、世界に食料や焚き火を置くことと、<strong>二人が次に何をするかを読み当てること</strong>だけ。</p>
      <p className="g-muted">二人は台本ではなく、このリポジトリの人間モデル（既定 0.2.0）の計算で動きます。見えるのは自分の周りだけ。空腹・寒さ・疲れ・相手との経験から、毎ステップ行動を選びます。</p>
    </div>
    <div className="g-stage-grid">
      {STAGES.map((s) => { const best = bests[s.id] ?? null; return <button key={s.id} className={`g-stage-card ${s.mode === "lab" ? "lab" : ""}`} onClick={() => onStart(s)}>
        <span className="g-stage-no">{s.mode === "lab" ? "LAB" : `STAGE ${s.order}`}</span>
        <strong>{s.title}</strong><small>{s.subtitle}</small>
        <p>{s.story}</p>
        <span className="g-goal">🎯 {s.goal.label}</span>
        <span className="g-best">{best === null ? "未プレイ" : `ベスト ${best} 点`}</span>
      </button>; })}
    </div>
    <p className="g-disclaimer">これは未校正の探索モデルです。本物の人間の気持ちや信頼を再現したものではありません。ゲームの出来事は、モデルが人間に近いことの証拠にはなりません。</p>
  </div>;
}

function WorldView({ frame, state, eye, subject, tool, selected, onPick }: {
  frame: Frame; state: GameState; eye: boolean; subject: Subject; tool: Tool; selected: string | null;
  onPick: (p: { x: number; y: number }, resourceId: string | null) => void;
}) {
  const { world } = frame;
  const w = world.parameters.width * 20, h = world.parameters.height * 20;
  const perceived = eye ? perceptionNow(state, subject) : null;
  const live = eye && frame.tick === state.sim.tick;
  const self = perceived?.selfPosition;
  const animals = eye && self && perceived && live
    ? [{ id: subject, position: self }, ...perceived.animals.map((a) => ({ id: a.trackId, position: { x: self.x + a.relativePosition.x, y: self.y + a.relativePosition.y } }))]
    : world.animals;
  const resources = eye && self && perceived && live
    ? perceived.resources.map((r) => { const real = world.resources.find((x) => x.id === r.id); return { id: r.id, kind: r.kind, amount: r.strength, radius: real?.radius ?? 1.5, position: { x: self.x + r.relativePosition.x, y: self.y + r.relativePosition.y } }; })
    : world.resources;
  const svg = useRef<SVGSVGElement>(null);
  function click(e: React.MouseEvent<SVGSVGElement>) {
    if (tool === "none" || !svg.current) return;
    const box = svg.current.getBoundingClientRect();
    const p = { x: (e.clientX - box.left) / box.width * world.parameters.width, y: (e.clientY - box.top) / box.height * world.parameters.height };
    const hit = world.resources.find((r) => Math.hypot(r.position.x - p.x, r.position.y - p.y) < Math.max(1.2, r.radius * 0.7));
    onPick({ x: Math.min(world.parameters.width - 0.6, Math.max(0.6, p.x)), y: Math.min(world.parameters.height - 0.6, Math.max(0.6, p.y)) }, hit?.id ?? null);
  }
  const vision = world.parameters.visionRadius * 20;
  const subjectPos = world.animals.find((a) => a.id === subject)?.position;
  return <div className={`g-map ${tool !== "none" ? "editing" : ""}`}>
    <svg ref={svg} viewBox={`0 0 ${w} ${h}`} onClick={click} role="img" aria-label={eye ? `${subject} に見えているもの` : "世界全体"}>
      <defs>
        <radialGradient id="g-night" cx="50%" cy="45%" r="75%"><stop offset="0" stopColor="#18324a" /><stop offset="1" stopColor="#0a1622" /></radialGradient>
        <radialGradient id="g-fire"><stop offset="0" stopColor="#ffb86b" stopOpacity=".55" /><stop offset="1" stopColor="#ff7a3d" stopOpacity="0" /></radialGradient>
        <radialGradient id="g-food"><stop offset="0" stopColor="#7ee0a8" stopOpacity=".35" /><stop offset="1" stopColor="#7ee0a8" stopOpacity="0" /></radialGradient>
        <mask id="g-vision"><rect width={w} height={h} fill="#fff" />{subjectPos && <circle cx={subjectPos.x * 20} cy={subjectPos.y * 20} r={vision} fill="#000" />}</mask>
      </defs>
      <rect width={w} height={h} fill="url(#g-night)" />
      {Array.from({ length: 36 }, (_, i) => <circle key={i} cx={(i * 197) % w} cy={(i * 113) % h} r={i % 3 === 0 ? 1.4 : 0.8} fill="#cfe3ff" opacity={0.15 + (i % 5) * 0.05} />)}
      {resources.map((r) => <g key={r.id} transform={`translate(${r.position.x * 20} ${r.position.y * 20})`} className={selected === r.id ? "g-selected" : ""}>
        <circle r={r.radius * 20} fill={r.kind === "food" ? "url(#g-food)" : "url(#g-fire)"} />
        <circle r={r.radius * 20} fill="none" stroke={r.kind === "food" ? "#7ee0a8" : "#ff9d5c"} strokeOpacity=".35" strokeDasharray="4 6" />
        {r.kind === "food"
          ? <g opacity={0.3 + r.amount * 0.7}><circle r="8" fill="#e8584f" /><path d="M0 -8 q3 -6 7 -6" stroke="#7ee0a8" strokeWidth="2.5" fill="none" /></g>
          : <g className="g-flame"><path d="M0 -14 C8 -4 9 4 0 9 C-9 4 -8 -4 0 -14Z" fill="#ff9d5c" /><path d="M0 -6 C4 0 4 4 0 7 C-4 4 -4 0 0 -6Z" fill="#ffe08a" /></g>}
      </g>)}
      {!eye && state.frames.length > 1 && world.animals.map((a) => <polyline key={"t" + a.id} points={state.frames.slice(Math.max(0, frame.tick - 60), frame.tick + 1).flatMap((f) => f.world.animals.filter((p) => p.id === a.id).map((p) => `${p.position.x * 20},${p.position.y * 20}`)).join(" ")} fill="none" stroke={COLORS[a.id]} strokeOpacity=".3" strokeWidth="2" />)}
      {animals.map((a) => { const agent = frame.agents.find((x) => x.id === a.id); const sound = !eye && agent?.action === "vocalize" && frame.tick > 0; const hurt = !eye && frame.events.some((e) => e.kind === "contact" && e.actorId === a.id); return <g key={a.id} transform={`translate(${a.position.x * 20} ${a.position.y * 20})`}>
        {sound && <><circle r="26" fill="none" stroke={COLORS[a.id]} opacity=".6" className="g-ring" /><circle r="38" fill="none" stroke={COLORS[a.id]} opacity=".3" className="g-ring late" /></>}
        {hurt && <circle r="22" fill="#ff4d6d" opacity=".35" />}
        <circle r="16" fill={COLORS[a.id]} opacity=".15" />
        <circle r="10" fill={COLORS[a.id]} stroke="#0a1622" strokeWidth="3" />
        <text y="-20" textAnchor="middle" fill={COLORS[a.id]} fontSize="14" fontWeight="700">{a.id}</text>
        {!eye && agent && frame.tick > 0 && <text y="30" textAnchor="middle" fill="#dbe7f0" fontSize="13">{ACTION_ICONS[agent.action as ActionKind]}</text>}
      </g>; })}
      {eye && <rect width={w} height={h} fill="#050b12" opacity=".78" mask="url(#g-vision)" />}
      {eye && subjectPos && <circle cx={subjectPos.x * 20} cy={subjectPos.y * 20} r={vision} fill="none" stroke={COLORS[subject]} strokeOpacity=".5" strokeDasharray="6 6" />}
    </svg>
    <div className="g-map-caption">{eye ? (live ? `${subject} の目：見える範囲（半径 ${world.parameters.visionRadius}u）の外は、${subject} にとって存在しない` : "再生中は世界全体を表示") : `世界全体 · t=${frame.tick}`}</div>
  </div>;
}

function Meters({ state, subject }: { state: GameState; subject: Subject }) {
  const human = state.sim.humans.find((h) => h.id === subject);
  if (!human) return null;
  const other = state.sim.world.animals.find((a) => a.id !== subject), self = state.sim.world.animals.find((a) => a.id === subject)!;
  const d = other ? Math.hypot(other.position.x - self.position.x, other.position.y - self.position.y) : null;
  const rows: [string, number, string][] = [["空腹", human.body.hunger, "#e8584f"], ["寒さ", human.body.cold, "#6fb7ff"], ["疲れ", human.body.fatigue, "#b69cff"], ["健康", human.body.health, "#7ee0a8"]];
  return <div className="g-meters">
    {rows.map(([label, v, c]) => <div key={label} className="g-meter"><span>{label}</span><div><i style={{ width: pct(v), background: c }} /></div><output>{pct(v)}</output></div>)}
    <p className="g-muted">{d === null ? "相手はいない" : d <= state.sim.world.parameters.visionRadius ? `相手との距離 ${d.toFixed(1)}u（見えている）` : `相手との距離 ${d.toFixed(1)}u（見えていない）`}</p>
  </div>;
}

function Reveal({ round, onNext, last }: { round: RoundResult; onNext: () => void; last: boolean }) {
  const hit = round.guess === round.actual;
  const probs = ACTIONS.filter((a) => round.probabilities[a] !== undefined).sort((a, b) => (round.probabilities[b] ?? 0) - (round.probabilities[a] ?? 0));
  return <div className={`g-reveal ${hit ? "hit" : "miss"}`}>
    <div className="g-reveal-head"><span className="g-big">{hit ? "的中！" : "はずれ"}</span><strong>{round.points >= 0 ? "+" : ""}{round.points} 点</strong></div>
    <p>{round.subject} は <b>{ACTION_ICONS[round.actual]} {ACTION_LABELS[round.actual]}</b> を選んだ{round.exploratory ? "（気まぐれの試行。外れても減点なし）" : ""}。あなたの予想は {ACTION_ICONS[round.guess]} {ACTION_LABELS[round.guess]}。</p>
    <div className="g-probs"><small>モデルの計算では、各行動が選ばれる確率はこうだった</small>
      {probs.map((a) => <div key={a} className={`g-prob ${a === round.actual ? "actual" : ""} ${a === round.guess ? "guess" : ""}`}><span>{ACTION_ICONS[a]} {ACTION_LABELS[a]}</span><div><i style={{ width: pct(round.probabilities[a] ?? 0) }} /></div><output>{pct(round.probabilities[a] ?? 0)}</output></div>)}
      {round.probabilities[round.guess] === undefined && <p className="g-muted">あなたの予想した行動は、このとき候補にすらなかった（{round.subject} は必要なものを知らないか、相手が見えていない）。</p>}
    </div>
    <p className="g-score-line">読みの確かさ {round.readPoints}（予想した行動の確率 × 100）＋ 自信の賭け {round.hitPoints >= 0 ? "+" : ""}{round.hitPoints}</p>
    <div className="g-terms">{round.topTerms.map((t) => <div key={t.action}><small>{ACTION_LABELS[t.action]} を押し上げた／引き下げた理由</small>{t.terms.map(([k, v]) => <span key={k} className={v >= 0 ? "up" : "down"}>{TERM_LABELS[k] ?? k} {v >= 0 ? "+" : ""}{v.toFixed(2)}</span>)}</div>)}</div>
    <button className="g-primary" onClick={onNext}>{last ? "結果を見る" : "時間を進める ▶"}</button>
  </div>;
}

/** saveMode "copy" is for hosts that block downloads (the static page): the record goes to the clipboard instead. */
export default function Game({ provenance, labHref, saveMode = "download" }: { provenance: Provenance; labHref?: string; saveMode?: "download" | "copy" }) {
  const [stageId, setStageId] = useState<string | null>(null);
  const [seedIndex, setSeedIndex] = useState(0);
  const [state, setState] = useState<GameState | null>(null);
  const [shown, setShown] = useState(0);
  const [revealed, setRevealed] = useState<RoundResult | null>(null);
  const [eye, setEye] = useState(false);
  const [confidence, setConfidence] = useState<1 | 2 | 3>(1);
  const [tool, setTool] = useState<Tool>("none");
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [trait, setTrait] = useState(0.5);
  const fileRef = useRef<HTMLInputElement>(null);
  const stage = stageId ? stageById(stageId) : null;
  const question = state ? currentQuestion(state) : null;
  const [playing, setPlaying] = useState(true);
  const atEnd = !state || shown >= state.frames.length - 1;
  const animating = playing && !atEnd;
  const frame = state ? state.frames[Math.min(shown, state.frames.length - 1)] : null;

  useEffect(() => {
    if (!animating) return;
    const id = setInterval(() => setShown((n) => n + 1), 45);
    return () => clearInterval(id);
  }, [animating]);
  useEffect(() => { if (atEnd && playing) setPlaying(false); }, [atEnd, playing]);
  useEffect(() => {
    if (!state?.final || !stage) return;
    const key = stage.id;
    const best = readBest(key);
    if (best === null || state.final.total > best) writeBest(key, state.final.total);
  }, [state?.final, stage]);

  const hitsSoFar = useMemo(() => state?.rounds.filter((r) => r.guess === r.actual).length ?? 0, [state]);
  const scoreSoFar = useMemo(() => state?.rounds.reduce((s, r) => s + r.points, 0) ?? 0, [state]);

  function begin(s: Stage, index = 0) {
    const next = startGame(s.id, s.seeds[index % s.seeds.length]);
    setStageId(s.id); setSeedIndex(index % s.seeds.length); setState(next); setShown(0); setPlaying(true); setRevealed(null); setEye(false); setTool("none"); setSelected(null); setMessage("");
  }
  function apply(action: PlayerAction) {
    if (!state) return;
    try { const next = act(state, action); setState(next); setMessage(""); return next; } catch (e) { setMessage((e as Error).message === "Not enough effort points" ? "手間ポイントが足りません。" : (e as Error).message); }
  }
  function pick(p: { x: number; y: number }, resourceId: string | null) {
    if (!state) return;
    if (tool === "placeFood" || tool === "placeFire") { if (apply({ kind: "edit", edit: { kind: tool, position: p } })) setTool("none"); }
    if (tool === "removeResource") { if (!resourceId) { setMessage("取り除く食料か焚き火をクリックしてください。"); return; } if (apply({ kind: "edit", edit: { kind: "removeResource", id: resourceId } })) setTool("none"); }
    if (tool === "moveResource") {
      if (!selected) { if (!resourceId) { setMessage("まず動かすものをクリックしてください。"); return; } setSelected(resourceId); setMessage("次に、置きたい場所をクリック。"); return; }
      if (apply({ kind: "edit", edit: { kind: "moveResource", id: selected, position: p } })) { setTool("none"); setSelected(null); }
    }
  }
  function mind(edit: MindEdit) { apply({ kind: "mind", edit }); }
  function predict(action: ActionKind) {
    if (!state) return;
    const before = state.frames.length;
    const next = apply({ kind: "predict", action, confidence });
    if (next) { setRevealed(next.rounds.at(-1)!); setShown(before); setPlaying(false); setTool("none"); setSelected(null); setEye(false); }
  }
  function next() { setRevealed(null); setPlaying(true); }
  async function load(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error("記録が大きすぎます。");
      const restored = replayGame(JSON.parse(await file.text()));
      const s = stageById(restored.stageId);
      setStageId(s.id); setSeedIndex(Math.max(0, s.seeds.indexOf(restored.seed))); setState(restored); setShown(restored.frames.length - 1); setPlaying(false); setRevealed(null);
      setMessage("記録を最初から再計算し、同じ得点になることを確認しました。");
    } catch (e) { setMessage((e as Error).message); } finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  return <div className="g-shell">
    <header className="g-top">
      <button className="g-brand" onClick={() => { setStageId(null); setState(null); }}>🔥 はじまりのふたり</button>
      <nav>{state && stage && <span className="g-chip">{stage.mode === "lab" ? "実験室" : `STAGE ${stage.order}`} · 世界 #{seedIndex + 1}</span>}
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void load(e.target.files?.[0])} />
        <button className="g-ghost" onClick={() => fileRef.current?.click()}>記録を再生</button>
        {labHref && <a className="g-ghost" href={labHref}>研究用の実験室へ</a>}</nav>
    </header>
    {message && <div className="g-toast" role="status">{message}<button onClick={() => setMessage("")} aria-label="閉じる">×</button></div>}
    {!state || !stage || !frame ? <StageSelect onStart={(s) => begin(s)} /> : <main className="g-play">
      <section className="g-left">
        <div className="g-story"><strong>{stage.title}</strong><span>{stage.story}</span></div>
        <WorldView frame={frame} state={state} eye={eye && atEnd && !revealed} subject={question?.subject ?? "A"} tool={!atEnd || revealed ? "none" : tool} selected={selected} onPick={pick} />
        <div className="g-hud">
          <span>t = {frame.tick} / {stage.horizon}</span>
          <span>🎯 {stage.goal.label}</span>
          <span>得点 {scoreSoFar} · 的中 {hitsSoFar}/{state.rounds.length}</span>
        </div>
        <p className="g-hint">💡 {stage.hint}</p>
      </section>
      <aside className="g-right">
        {revealed ? <Reveal round={revealed} onNext={next} last={state.phase === "done"} />
        : !atEnd ? <div className="g-wait"><p>時間が流れています…</p><button onClick={() => setShown(state.frames.length - 1)}>スキップ ⏭</button></div>
        : state.phase === "done" && state.final ? <div className="g-final">
          <p className="g-eyebrow">RESULT</p>
          <h2>{state.final.total} 点</h2>
          <dl>
            <div><dt>読み（{state.rounds.length} 問中 {state.final.hits} 的中）</dt><dd>{state.final.roundPoints}</dd></div>
            <div><dt>目標：{stage.goal.label}<br /><small>{state.final.goal.text}</small></dt><dd>{state.final.goal.achieved ? "達成 +200" : "未達 0"}</dd></div>
            <div><dt>残った手間ポイント × 20</dt><dd>{state.final.budgetPoints}</dd></div>
          </dl>
          {state.labUsed && <p className="g-lab-flag">🧪 記憶介入あり — 通常の記録とは別枠です</p>}
          <div className="g-row">
            <button className="g-primary" onClick={() => begin(stage, seedIndex)}>同じ世界でもう一度</button>
            <button onClick={() => begin(stage, seedIndex + 1)}>別の世界で</button>
          </div>
          <div className="g-row">
            <button onClick={() => { const record = recordGame(state, provenance); if (saveMode === "download") { download(`hajimari-${stage.id}-${state.seed}.json`, record); return; } navigator.clipboard.writeText(JSON.stringify(record)).then(() => setMessage("記録をクリップボードにコピーしました。.json として保存すると再生できます。"), () => setMessage("コピーできませんでした。この画面ではクリップボードが使えません。")); }}>{saveMode === "download" ? "記録を保存" : "記録をコピー"}</button>
            <button onClick={() => { setStageId(null); setState(null); }}>ステージを選ぶ</button>
          </div>
          <p className="g-muted">記録はステージ・世界番号・あなたの操作だけで、同じ結果を誰でも再計算できます（npm run game -- --file 記録.json）。</p>
        </div> : question && <div className="g-ask">
          <p className="g-eyebrow">QUESTION {state.question + 1} / {stage.questions.length}</p>
          <h2><span style={{ color: COLORS[question.subject] }}>{question.subject}</span> は次に何をする？</h2>
          <div className="g-view-toggle"><button className={!eye ? "on" : ""} onClick={() => setEye(false)}>世界全体</button><button className={eye ? "on" : ""} onClick={() => setEye(true)}>{question.subject} の目</button></div>
          <Meters state={state} subject={question.subject} />
          <div className="g-actions">{ACTIONS.map((a) => <button key={a} onClick={() => predict(a)}><span>{ACTION_ICONS[a]}</span>{ACTION_LABELS[a]}</button>)}</div>
          <div className="g-confidence"><small>自信</small>{CONFIDENCE.map((c) => <button key={c.value} className={confidence === c.value ? "on" : ""} onClick={() => setConfidence(c.value)} title={c.note}>{c.label}</button>)}<small className="g-muted">{CONFIDENCE[confidence - 1].note}</small></div>
          <div className="g-tools">
            <div className="g-tools-head"><strong>世界に手を加える</strong><span>手間 {state.budgetLeft} pt</span></div>
            <p className="g-muted">予想の前に置いたものも、{question.subject} の判断に影響します。本人に見えていなければ、ないのと同じです。</p>
            <div className="g-tool-row">
              {([["placeFood", "🍎 食料を置く"], ["placeFire", "🔥 焚き火を置く"], ["moveResource", "↔ 動かす"], ["removeResource", "✕ 取り除く"]] as [Tool, string][]).map(([t, label]) =>
                <button key={t} className={tool === t ? "on" : ""} disabled={EDIT_COST[t as keyof typeof EDIT_COST] > state.budgetLeft} onClick={() => { setTool(tool === t ? "none" : t); setSelected(null); setEye(false); if (tool !== t) setMessage(t === "moveResource" ? "動かすものをクリックしてください。" : t === "removeResource" ? "取り除くものをクリックしてください。" : "置きたい場所を地図でクリックしてください。"); }}>{label}<small>{EDIT_COST[t as keyof typeof EDIT_COST]}pt</small></button>)}
            </div>
            {stage.mode === "lab" && <div className="g-lab">
              <div className="g-tools-head"><strong>🧪 禁じ手：記憶と性質（各 {EDIT_COST.mind}pt）</strong></div>
              <p className="g-muted">本人には何が起きたか知らされません。使うと記録に「記憶介入あり」と残ります。</p>
              <div className="g-tool-row">
                <button disabled={EDIT_COST.mind > state.budgetLeft} onClick={() => mind({ kind: "eraseMemory", subject: "A" })}>A の記憶を消す</button>
                <button disabled={EDIT_COST.mind > state.budgetLeft} onClick={() => mind({ kind: "eraseMemory", subject: "B" })}>B の記憶を消す</button>
                <button disabled={EDIT_COST.mind > state.budgetLeft} onClick={() => mind({ kind: "swapMemories" })}>互いの記憶を入れ替える</button>
              </div>
              <div className="g-trait"><label>値 {trait.toFixed(2)}<input type="range" min={0} max={1} step={0.05} value={trait} onChange={(e) => setTrait(Number(e.target.value))} /></label>
                {(["A", "B"] as Subject[]).flatMap((s) => (["caution", "curiosity"] as const).map((t) => <button key={s + t} disabled={EDIT_COST.mind > state.budgetLeft} onClick={() => mind({ kind: "setTrait", subject: s, trait: t, value: trait })}>{s} の{t === "caution" ? "警戒" : "好奇心"}を {trait.toFixed(2)} に</button>))}
              </div>
              {(() => { const a = state.sim.humans.find((h) => h.id === "A")?.peers.B; return <p className="g-muted">A の中の「B は危ない」度合い: {a ? (a.harmAlpha / (a.harmAlpha + a.harmBeta)).toFixed(2) : "記憶なし（初対面扱い）"}</p>; })()}
            </div>}
          </div>
        </div>}
      </aside>
    </main>}
    <footer className="g-foot">未校正の探索モデル（human 0.2.0 · world 0.2.0 · game 0.1.0）。人間の再現ではありません · 実行中にAIや外部サービスは使いません</footer>
  </div>;
}
