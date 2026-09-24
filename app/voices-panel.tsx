"use client";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { voicePoints, voiceClusters, voiceDistinctness, agentColor } from "@/packages/observer/src/index.ts";
import type { Frame } from "@/packages/simulation/src/index.ts";

const COLORS = { good: "#62cc9e", bad: "#f06a6a", other: "#8aa0b0" } as const;
const LABELS = { good: "良い声（食べて無事の直後）", bad: "悪い声（毒・嫌悪の直後）", other: "その他の声" } as const;
const f = (n: number) => n.toFixed(2);
/** Two voices: the sounds a group emitted, coloured by the caller's valence context. Distinct clusters for good and bad are the two-word vocabulary the valence studies gate on; nothing here is shown to the individuals. */
export default function VoicesPanel({ frames }: { frames: Frame[] }) {
  const ids = useMemo(() => [...new Set(frames.flatMap(fr => fr.agents.map(a => a.id)))].sort(), [frames]);
  const [who, setWho] = useState("all");
  const points = useMemo(() => voicePoints(frames, who === "all" ? undefined : who), [frames, who]);
  const clusters = useMemo(() => voiceClusters(points), [points]);
  const distinct = voiceDistinctness(clusters);
  const recorded = frames.some(fr => fr.agents.some(a => a.valence !== null && a.valence !== undefined));
  return <section className="panel history-panel" aria-label="二つの声">
    <div className="section-row"><h2>二つの声</h2><span>表示中の時点まで · 発声 {points.length} 回</span></div>
    <div className="history-controls"><Tabs value={who} onValueChange={setWho}><TabsList><TabsTrigger value="all">全員</TabsTrigger>{ids.map(id => <TabsTrigger key={id} value={id}>個体 {id}</TabsTrigger>)}</TabsList></Tabs></div>
    {!points.length ? <p>まだ声がありません。実験を進めると、出された声を音の特徴の空間に置き、出した時の文脈（食べて無事・毒や嫌悪・その他）で色分けします。</p> : <>
      {!recorded && <p className="history-timing">このモデルは食事や毒の文脈を記録しないため、すべて「その他の声」になります。文脈は valence 系の候補モデルで記録されます。</p>}
      <svg className="sound-space" viewBox="0 0 240 120" role="img" aria-label="出された声の音響特徴。横が開き、縦が共鳴。色は出した時の文脈。語や意味ではありません">
        <rect x="8" y="8" width="224" height="104" fill="none" stroke="#304657" />
        {points.slice(-400).map((p, i) => <circle key={i} cx={8 + p.openness * 224} cy={112 - p.resonance * 104} r="2" fill={COLORS[p.context]} opacity=".55" />)}
        {clusters.filter(c => c.centroid && c.context !== "other").map(c => <g key={c.context}><circle cx={8 + c.centroid!.openness * 224} cy={112 - c.centroid!.resonance * 104} r={Math.max(4, c.dispersion * 224)} fill="none" stroke={COLORS[c.context]} strokeWidth="1.5" /><circle cx={8 + c.centroid!.openness * 224} cy={112 - c.centroid!.resonance * 104} r="3.5" fill={COLORS[c.context]} stroke="#102333" /></g>)}
        <text x="10" y="118" fill="#70899a" fontSize="7">開き →</text><text x="4" y="14" fill="#70899a" fontSize="7">共鳴 ↑</text>
      </svg>
      <dl className="detail-list">
        {clusters.map(c => <div key={c.context}><dt><i className="legend-line" style={{ background: COLORS[c.context] }} /> {LABELS[c.context]}</dt><dd>{c.count} 回{c.centroid ? ` · 重心 (${f(c.centroid.openness)}, ${f(c.centroid.resonance)}) · 散らばり ${f(c.dispersion)}` : ""}</dd></div>)}
        <div><dt>良い声と悪い声の重心の距離</dt><dd>{distinct === null ? "—（どちらかの声がまだ無い）" : f(distinct)}</dd></div>
      </dl>
      <p className="history-timing">研究では、聞き合える集団で両方の声が集まり（散らばりが音なしより0.12以上小さい）、重心の距離が0.25以上なら「2つの価値を持つ声」と呼びます（判断記録0037〜0047）。個体の色: {ids.map(id => <span key={id} style={{ color: agentColor(id) }}> {id}</span>)}</p>
    </>}
  </section>;
}
