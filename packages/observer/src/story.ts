import { ACTION_LABELS } from "../../contracts/src/index.ts";
import type { Frame, AgentView } from "../../simulation/src/index.ts";

/**
 * Observer-only narration. Reads recorded frames and turns them into plain-language highlights.
 * Nothing here feeds back into the humans; every statement is derived from what the frames already contain.
 * Labels such as "warmth eased" describe numbers, not human feelings or the success of a signal.
 */
export type HighlightKind = "first-sight" | "closest" | "first-pain" | "wary" | "eased" | "avoidance" | "voice-heard" | "voice-chain" | "prediction-ready" | "hunger-crisis" | "hunger-relief" | "health-drop";
export type Highlight = { tick: number; id: string | null; kind: HighlightKind; title: string; detail: string };
export type StoryStats = {
  ticks: number; firstSight: number | null; closeFraction: number; minimumDistance: number | null; minimumDistanceTick: number | null;
  contactEvents: number; vocalizations: Record<string, number>; heard: Record<string, number>; voiceChains: number;
  finalHarm: Record<string, { peer: string; estimate: number; evidence: number }[]>; minimumHealth: number; learnedTransitions: number;
};
export type Story = { title: string; paragraphs: string[]; caveats: string[]; highlights: Highlight[]; stats: StoryStats };

const f = (x: number, d = 2) => x.toFixed(d);
const agent = (frame: Frame, id: string) => frame.agents.find(a => a.id === id);
const harm = (a: AgentView | undefined, peer: string) => a?.peerEvidence.find(p => p.id === peer);

export function highlights(frames: Frame[]): Highlight[] {
  const out: Highlight[] = [];
  const ids = frames[0]?.agents.map(a => a.id) ?? [];
  const decided = frames.filter(fr => fr.tick > 0);
  if (!decided.length) return out;
  // Closest approach of the pair.
  let closest: Frame | null = null;
  for (const fr of decided) if (fr.distance !== null && (closest === null || fr.distance < closest.distance!)) closest = fr;
  const seen = new Set<string>();
  const painSeen = new Set<string>();
  const wary = new Map<string, number>();
  const eased = new Set<string>();
  const heardSeen = new Set<string>();
  const chainSeen = new Set<string>();
  const predictionSeen = new Set<string>();
  const crisis = new Map<string, number>();
  const relieved = new Set<string>();
  const healthSeen = new Set<string>();
  const lastHeard = new Map<string, number>();
  const withdrawRun = new Map<string, { start: number; length: number }>();
  const avoidanceReported = new Set<string>();
  for (const [index, fr] of decided.entries()) {
    for (const id of ids) {
      const a = agent(fr, id);
      if (!a) continue;
      const t = a.trace;
      if (t?.peerTrackId && !seen.has(id)) {
        seen.add(id);
        out.push({ tick: fr.tick, id, kind: "first-sight", title: `${id} が同種らしい相手 ${t.peerTrackId} を初めて見た`, detail: `距離 ${f(t.peerDistance ?? 0, 1)}u。相手について何も知らないので、危害の推定は0.50から始まります。` });
      }
      const pain = fr.events.filter(e => e.kind === "contact" && e.actorId === id).reduce((s, e) => s + e.value, 0);
      if (pain > 0 && !painSeen.has(id)) {
        painSeen.add(id);
        const peer = t?.peerTrackId ?? ids.find(x => x !== id) ?? "";
        // The pain is learned at the next decision, so its effect shows in the following frame when that frame is supplied.
        const after = decided[index + 1] ? harm(agent(decided[index + 1], id), peer)?.harmEstimate : undefined;
        out.push({ tick: fr.tick, id, kind: "first-pain", title: `${id} が初めて接触の痛みを受けた`, detail: `相手 ${peer} との至近距離での接触。${after === undefined ? "次の判断で危害の推定が上がります。" : `次の判断で危害の推定が ${f(harm(a, peer)?.harmEstimate ?? .5)} から ${f(after)} になりました。`}` });
      }
      const priorFrame = decided[index - 1];
      for (const p of a.peerEvidence) {
        const key = id + "→" + p.id;
        const prior = priorFrame ? harm(agent(priorFrame, id), p.id)?.harmEstimate : undefined;
        // Harmless proximity lowers the estimate from its 0.5 prior; only pain raises it. Wariness means a rise that reaches 0.3.
        if (!wary.has(key) && prior !== undefined && p.harmEstimate > prior + 0.02 && p.harmEstimate >= 0.3) {
          wary.set(key, fr.tick);
          out.push({ tick: fr.tick, id, kind: "wary", title: `${id} の ${p.id} への警戒が形になった`, detail: `近くで受けた痛みの証拠が積み重なり、危害の推定が ${f(prior)} から ${f(p.harmEstimate)} に。以後は離れる行動の評価が上がります。` });
        }
        if (wary.has(key) && !eased.has(key) && p.harmEstimate <= 0.15 && fr.tick > wary.get(key)!) {
          eased.add(key);
          out.push({ tick: fr.tick, id, kind: "eased", title: `${id} の ${p.id} への警戒がほどけた`, detail: `痛みのない近接が続き、危害の推定が ${f(p.harmEstimate)} まで下がりました（近接の証拠量 ${f(p.closeEvidence, 1)}）。忘却だけでは戻らず、実際に近づいた経験が必要です。` });
        }
      }
      if (t && t.observation.sounds.length > 0) {
        lastHeard.set(id, fr.tick);
        if (!heardSeen.has(id)) {
          heardSeen.add(id);
          const s = t.observation.sounds[0];
          out.push({ tick: fr.tick, id, kind: "voice-heard", title: `${id} に相手の声が初めて届いた`, detail: `音の特徴は開き ${f(s.shape.openness)}・共鳴 ${f(s.shape.resonance)}、聞こえた強さ ${f(s.loudness)}。${s.visibleSourceId ? `声の主 ${s.visibleSourceId} は見えています。` : "声の主は見えていません。"}` });
        }
      }
      if (t?.selected === "vocalize" && lastHeard.has(id) && fr.tick - lastHeard.get(id)! <= 3 && fr.tick !== lastHeard.get(id) && !chainSeen.has(id)) {
        chainSeen.add(id);
        out.push({ tick: fr.tick, id, kind: "voice-chain", title: `${id} が声を聞いた直後に声を出した`, detail: `t=${lastHeard.get(id)} に聞き、t=${fr.tick} に発声。音の新しさが注意を引き、好奇心が発声を後押ししただけかもしれません。呼びかけと返事の成立とは判定しません。` });
      }
      const snapshot = a.memorySnapshot;
      if (snapshot && !predictionSeen.has(id)) {
        for (const [peer, memory] of Object.entries(snapshot.peers)) {
          const ready = Object.entries(memory.responses).filter(([, e]) => e && e.samples >= 4);
          if (ready.length) {
            predictionSeen.add(id);
            const [action, estimate] = ready.sort((x, y) => y[1]!.samples - x[1]!.samples)[0];
            out.push({ tick: fr.tick, id, kind: "prediction-ready", title: `${id} が「${ACTION_LABELS[action as keyof typeof ACTION_LABELS]}」の後に相手 ${peer} がどう動くかを予測し始めた`, detail: `${estimate!.samples} 回の経験から、距離変化の平均 ${f(estimate!.mean, 2)}u。ここから予測が行動の評価に加わります。` });
            break;
          }
        }
      }
      if (a.body.hunger >= 0.8 && !crisis.has(id)) {
        crisis.set(id, fr.tick);
        out.push({ tick: fr.tick, id, kind: "hunger-crisis", title: `${id} の空腹が危険な水準に達した`, detail: `空腹 ${f(a.body.hunger)}。0.9を超えると健康が削られます。記憶した食料の場所があれば、摂食の評価が高まります。` });
      }
      if (crisis.has(id) && !relieved.has(id) && a.body.hunger < 0.5 && fr.tick > crisis.get(id)!) {
        relieved.add(id);
        out.push({ tick: fr.tick, id, kind: "hunger-relief", title: `${id} が空腹の危機を切り抜けた`, detail: `t=${crisis.get(id)} の危機から ${fr.tick - crisis.get(id)!} ステップで空腹が ${f(a.body.hunger)} まで戻りました。` });
      }
      if (a.body.health < 0.9 && !healthSeen.has(id)) {
        healthSeen.add(id);
        out.push({ tick: fr.tick, id, kind: "health-drop", title: `${id} の健康が目に見えて落ちた`, detail: `健康 ${f(a.body.health)}。空腹・寒さ・疲労の限界超えか、接触の痛みが続いた結果です。` });
      }
      const run = withdrawRun.get(id) ?? { start: fr.tick, length: 0 };
      if (a.action === "withdraw") { if (run.length === 0) run.start = fr.tick; run.length++; } else run.length = 0;
      withdrawRun.set(id, run);
      if (run.length >= 5 && !avoidanceReported.has(id)) {
        avoidanceReported.add(id);
        out.push({ tick: run.start, id, kind: "avoidance", title: `${id} が相手から離れ続けた`, detail: `t=${run.start} から ${run.length} ステップ連続で「距離を取る」を選択。警戒と距離の予測が重なった時に起きやすい行動です。` });
      }
    }
    if (closest && fr === closest && index > 0) {
      out.push({ tick: fr.tick, id: null, kind: "closest", title: "二人が最も近づいた", detail: `距離 ${f(fr.distance!, 2)}u。1.1u未満では体が触れ、接触の痛みとして記録されます。` });
    }
  }
  return out.sort((x, y) => x.tick - y.tick || (x.id ?? "").localeCompare(y.id ?? ""));
}

export function storyStats(frames: Frame[]): StoryStats {
  const ids = frames[0]?.agents.map(a => a.id) ?? [];
  const decided = frames.filter(fr => fr.tick > 0);
  const distances = decided.flatMap(fr => fr.distance === null ? [] : [{ tick: fr.tick, d: fr.distance }]);
  const closest = distances.reduce<{ tick: number; d: number } | null>((best, x) => best === null || x.d < best.d ? x : best, null);
  const traces = (id: string) => decided.flatMap(fr => { const t = agent(fr, id)?.trace; return t ? [t] : []; });
  let firstSight: number | null = null;
  for (const fr of decided) if (fr.agents.some(a => a.trace?.peerTrackId)) { firstSight = fr.tick; break; }
  let voiceChains = 0;
  for (const id of ids) {
    let last = -10;
    for (const fr of decided) { const t = agent(fr, id)?.trace; if (!t) continue; if (t.observation.sounds.length) last = fr.tick; else if (t.selected === "vocalize" && fr.tick - last <= 3) { voiceChains++; last = -10; } }
  }
  const last = frames.at(-1)!;
  return {
    ticks: decided.length, firstSight,
    closeFraction: distances.length ? distances.filter(x => x.d < 4).length / distances.length : 0,
    minimumDistance: closest?.d ?? null, minimumDistanceTick: closest?.tick ?? null,
    contactEvents: decided.filter(fr => fr.events.some(e => e.kind === "contact")).length,
    vocalizations: Object.fromEntries(ids.map(id => [id, traces(id).filter(t => t.selected === "vocalize").length])),
    heard: Object.fromEntries(ids.map(id => [id, traces(id).filter(t => t.observation.sounds.length > 0).length])),
    voiceChains,
    finalHarm: Object.fromEntries(ids.map(id => [id, (agent(last, id)?.peerEvidence ?? []).map(p => ({ peer: p.id, estimate: p.harmEstimate, evidence: p.closeEvidence }))])),
    minimumHealth: Math.min(1, ...frames.flatMap(fr => fr.agents.map(a => a.body.health))),
    learnedTransitions: last.agents.reduce((n, a) => n + a.learnedTransitions, 0),
  };
}

/** Plain-language summary of a recorded run. Deterministic; the same frames always yield the same text. */
export function narrate(frames: Frame[]): Story {
  const stats = storyStats(frames);
  const marks = highlights(frames);
  const ids = frames[0]?.agents.map(a => a.id) ?? [];
  const paragraphs: string[] = [];
  if (stats.ticks === 0) {
    return { title: "まだ出会いは始まっていません", paragraphs: ["再生すると、二人が何を見て、何を選び、何を学んだかをここに要約します。"], caveats: [], highlights: [], stats };
  }
  const pct = (x: number) => Math.round(x * 100) + "%";
  paragraphs.push(stats.firstSight === null
    ? `${stats.ticks} ステップの記録です。二人は一度も相手を視界に入れませんでした。それぞれが食料と暖を求めて動き、相手についての記憶は空のままです。`
    : `${stats.ticks} ステップの記録です。二人は t=${stats.firstSight} に初めて互いを見て、そのあと距離4u未満で過ごした時間は ${pct(stats.closeFraction)}、最も近づいたのは t=${stats.minimumDistanceTick}（${f(stats.minimumDistance ?? 0, 1)}u）でした。体が触れて痛みが記録されたステップは ${stats.contactEvents} 回です。`);
  const voices = ids.map(id => `${id} が ${stats.vocalizations[id]} 回`).join("、");
  const heard = ids.map(id => `${id} に ${stats.heard[id]} 回`).join("、");
  paragraphs.push(`声は ${voices} 出し、相手の声が届いたのは ${heard} です。声を聞いた直後（3ステップ以内）に声を出した場面は ${stats.voiceChains} 回ありました。これは音の新しさへの注意と好奇心で説明できる範囲で、呼びかけと返事の成立とは判定しません。`);
  const harmLines = ids.flatMap(id => stats.finalHarm[id].map(p => `${id} から見た ${p.peer} は ${f(p.estimate)}（近接の証拠量 ${f(p.evidence, 1)}）`));
  paragraphs.push(harmLines.length
    ? `終了時の危害の推定は ${harmLines.join("、")} です。0.50 は何も知らない状態、0 に近いほど「近くにいても痛みはなかった」という経験が積もった状態を表します。学習した距離の遷移は合計 ${stats.learnedTransitions} 件、最低の健康は ${f(stats.minimumHealth)} でした。`
    : `相手についての記憶はまだありません。学習した距離の遷移は ${stats.learnedTransitions} 件、最低の健康は ${f(stats.minimumHealth)} でした。`);
  const caveats = [
    "近さや発声の多さは、それ自体が良い結果ではありません。二人は同じ計算規則で判断していて、相手の気持ちや意図は渡されていません。",
    "「警戒」「ほどけた」は危害推定の数値の説明で、人間の恐怖や信頼の再現ではありません。同じ条件と乱数シードなら、この記録は誰が実行しても同じになります。",
  ];
  return { title: stats.firstSight === null ? "出会わなかった二人" : stats.contactEvents === 0 ? "触れずに近づいた二人" : marks.some(m => m.kind === "eased") ? "痛みのあとに警戒がほどけた二人" : marks.some(m => m.kind === "wary") ? "痛みを学んで距離を取った二人" : "近づいて、触れて、学んだ二人", paragraphs, caveats, highlights: marks, stats };
}

export function storyMarkdown(frames: Frame[]): string {
  const story = narrate(frames);
  const lines = [`# ${story.title}`, "", ...story.paragraphs.flatMap(p => [p, ""]), "## 見どころ", ""];
  if (!story.highlights.length) lines.push("目立った出来事はまだありません。", "");
  for (const h of story.highlights) lines.push(`- t=${h.tick}${h.id ? ` ${h.id}` : ""}: **${h.title}** ${h.detail}`);
  lines.push("", "## 見方の注意", "", ...story.caveats.map(c => `- ${c}`), "");
  return lines.join("\n");
}
