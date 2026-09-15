"use client";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ACTION_LABELS, type ActionKind } from "@/packages/contracts/src/index.ts";
import { decisionHistory } from "@/packages/observer/src/index.ts";
import type { Frame } from "@/packages/simulation/src/index.ts";
const number = (n: number | null) => n === null ? "—" : n.toFixed(3);
const termNames: Record<string, string> = { base: "基礎", uncertainty: "不確実さ", auditoryOrienting: "音への注意", continuity: "行動の継続", opportunityCost: "身体要求との競合", curiosity: "好奇心", danger: "警戒", tooClose: "至近距離", cost: "負担", predictedSafety: "予測による安全性", hunger: "空腹", cold: "寒さ", fatigue: "疲労", distance: "距離", resourceSearch: "資源の探索", personalSpace: "距離の確保", vocalExploration: "発声の探索", responseExploration: "反応の探索", learnedChange: "学習した変化" };
export default function DecisionHistory({ frames, id, onPerson, onSeek }: { frames: Frame[]; id: string; onPerson: (id: string) => void; onSeek: (tick: number) => void }) {
  const [peer, setPeer] = useState("all");
  const peers = useMemo(() => [...new Set(frames.flatMap(f => f.agents.find(a => a.id === id)?.peerEvidence.map(p => p.id) ?? []))], [frames, id]);
  const activePeer = peers.includes(peer) ? peer : "all";
  const rows = useMemo(() => decisionHistory(frames, id, activePeer === "all" ? undefined : activePeer), [frames, id, activePeer]);
  const latest = rows.at(-1);
  const selected = latest?.scores.find(s => s.action === latest.selected);
  return <section className="panel history-panel" aria-label="経験と判断の履歴">
    <div className="section-row"><h2>経験から判断へ</h2><span>表示中の時点まで</span></div>
    <div className="history-controls"><Tabs value={id} onValueChange={onPerson}><TabsList><TabsTrigger value="A">個体 A</TabsTrigger><TabsTrigger value="B">個体 B</TabsTrigger></TabsList></Tabs>
      <Select value={activePeer} onValueChange={setPeer}><SelectTrigger aria-label="履歴の相手"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">すべての相手</SelectItem>{peers.map(p => <SelectItem key={p} value={p}>相手 {p}</SelectItem>)}</SelectContent></Select>
    </div>
    {!latest ? <p>まだ判断の記録がありません。実験を進めると、経験・予測・評価・結果を表示します。</p> : <>
      <p className="history-timing">判断 t={latest.decisionTick} → 身体・世界の結果 t={latest.frameTick}。距離の予測結果は、その後の本人の知覚が記録されてから表示します。</p>
      <div className="history-summary"><div><span>相手 {latest.peerId ?? "視認なし"} の危害推定</span><strong>{number(latest.harmEstimate)}</strong><small>近接の証拠量 {number(latest.evidence)}</small></div><div><span>その場の危険度</span><strong>{number(latest.risk)}</strong><small>距離も含めた評価</small></div><div><span>選択した行動</span><strong>{ACTION_LABELS[latest.selected]}</strong><small>{latest.exploratory ? "探索による試行" : "効用に基づく確率的選択"}</small></div></div>
      <details open><summary>相手ごとの行動予測と効用</summary><div className="table-scroll"><table><caption>判断 t={latest.decisionTick} で使える学習済みの予測</caption><thead><tr><th>行動</th><th>距離変化の平均</th><th>分散</th><th>経験数</th><th>予測の効用</th><th>効用合計</th></tr></thead><tbody>{latest.scores.map(s => { const estimate = latest.forecasts[s.action]; return <tr key={s.action}><th scope="row">{ACTION_LABELS[s.action]}{s.action === latest.selected ? "（選択）" : ""}</th><td>{number(estimate?.mean ?? null)}</td><td>{number(estimate?.variance ?? null)}</td><td>{estimate?.samples ?? "未学習"}</td><td>{number(s.terms.predictedSafety ?? null)}</td><td>{number(s.utility)}</td></tr>; })}</tbody></table></div><p>距離変化は正が離れる方向。未学習の欄は「—」です。モデルは未学習時の選択行動について、距離変化0を予測します。分散と経験数は予測の重み付けに使う量で、人間データへの信頼区間ではありません。</p></details>
      <details><summary>選択した行動の効用内訳</summary><dl className="history-terms">{Object.entries(selected?.terms ?? {}).map(([key, value]) => <div key={key}><dt>{termNames[key] ?? key}</dt><dd>{number(value)}</dd></div>)}</dl><p>効用は確率ではありません。最も高い行動が毎回選ばれるわけではありません。</p></details>
      <div className="table-scroll history-log"><table><caption>直近12回の判断。時点を押すと記録へ戻ります。</caption><thead><tr><th>判断時点</th><th>相手</th><th>危害推定</th><th>行動</th><th>予測 Δu</th><th>次の知覚 Δu</th><th>接触痛</th><th>摂食量</th></tr></thead><tbody>{rows.slice(-12).reverse().map(row => <tr key={row.frameTick}><td><Button size="sm" variant="ghost" onClick={() => onSeek(row.frameTick)}>t={row.decisionTick}</Button></td><td>{row.peerId ?? "—"}</td><td>{number(row.harmEstimate)}</td><td>{ACTION_LABELS[row.selected as ActionKind]}</td><td>{number(row.predictedDelta)}</td><td>{row.feedback === "observed" ? number(row.observedDelta) : row.feedback === "peer-not-seen" ? "再視認なし" : row.feedback === "awaiting-observation" ? "次の知覚待ち" : "予測なし"}</td><td>{number(row.contact)}</td><td>{number(row.food)}</td></tr>)}</tbody></table></div>
      <p>接触痛・摂食量は行動直後の世界の記録です。距離の変化には二人の動きが含まれるため、この行動だけの因果効果とは限りません。近接の証拠量は忘却で減衰し、整数の回数ではありません。</p>
    </>}
  </section>;
}
