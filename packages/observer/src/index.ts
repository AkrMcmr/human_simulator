import { ACTION_LABELS } from "../../contracts/src/index.ts";
import type { Frame } from "../../simulation/src/index.ts";
export { highlights, narrate, storyMarkdown, storyStats, type Highlight, type HighlightKind, type Story, type StoryStats } from "./story.ts";
export const agentColor = (id: string) => id === "A" ? "#31c4df" : "#f5b44b";
export function eventLines(frames: Frame[]): { tick: number; id: string; text: string }[] {
  const lines: { tick: number; id: string; text: string }[] = [];
  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    for (const agent of frame.agents) {
      const prior = frames[i - 1].agents.find((a) => a.id === agent.id);
      if (agent.trace?.peerTrackId && !prior?.trace?.peerTrackId) lines.push({ tick: frame.tick, id: agent.id, text: "同種らしい相手を視認" });
      if (agent.action !== prior?.action) lines.push({
        tick: frame.tick, id: agent.id,
        text: (ACTION_LABELS[agent.action as keyof typeof ACTION_LABELS] ?? agent.action) + (agent.trace?.exploratory ? "を試行" : "を選択"),
      });
      if (agent.heardSounds.length > (prior?.heardSounds.length ?? 0)) lines.push({ tick: frame.tick, id: agent.id, text: "新しい音のまとまりを記録" });
    }
  }
  return lines.slice(-60);
}


/** Align decision t, physical outcome t+1, and the next perception at t+1 (stored in frame t+2).
 * Only supplied frames are used: passing a prefix cannot reveal a later observation.
 */
export function decisionHistory(frames: Frame[], id: string, peerId?: string) {
  return frames.flatMap((frame, index) => {
    const agent = frame.agents.find(a => a.id === id), trace = agent?.trace;
    if (!agent || !trace || trace.tick !== frame.tick - 1) return [];
    if (peerId && trace.peerTrackId !== peerId) return [];
    const pending = agent.memorySnapshot?.pending;
    const next = frames[index + 1]?.agents.find(a => a.id === id)?.trace;
    const target = pending && next?.tick === trace.tick + 1
      ? next.observation.animals.find(a => a.trackId === pending.peerId) : undefined;
    const observedDelta = target && pending ? Math.hypot(target.relativePosition.x, target.relativePosition.y) - pending.distance : null;
    const learningDelta = observedDelta === null ? null : Math.min(2, Math.max(-2, observedDelta));
    const predictedDelta = pending?.predictedDelta ?? null;
    const prior = frames[index - 1]?.agents.find(a => a.id === id);
    const peer = trace.peerTrackId ? agent.memorySnapshot?.peers[trace.peerTrackId] : undefined;
    return [{ frameTick: frame.tick, decisionTick: trace.tick, peerId: trace.peerTrackId,
      selected: trace.selected, exploratory: trace.exploratory, risk: trace.perceivedRisk,
      harmEstimate: peer ? peer.harmAlpha / (peer.harmAlpha + peer.harmBeta) : null,
      evidence: peer ? peer.harmAlpha + peer.harmBeta - 2 : null,
      forecasts: structuredClone(peer?.responses ?? {}), scores: structuredClone(trace.scores),
      predictedDelta, observedDelta, learningDelta,
      residual: predictedDelta !== null && learningDelta !== null ? learningDelta - predictedDelta : null,
      feedback: !pending ? "no-prediction" : !next || next.tick !== trace.tick + 1 ? "awaiting-observation" : !target ? "peer-not-seen" : "observed",
      bodyBefore: prior ? { ...prior.body } : null,
      bodyAfter: { ...agent.body },
      contact: frame.events.filter(e => e.actorId === id && e.kind === "contact").reduce((s, e) => s + e.value, 0),
      food: frame.events.filter(e => e.actorId === id && e.kind === "food").reduce((s, e) => s + e.value, 0),
    }];
  });
}

/**
 * Two voices: every sound emitted in the frames, labelled with the valence context its caller was in when it
 * decided to call (the frame before the sound appears). Pooled centroid and dispersion per context, so a viewer can
 * see whether a group's good-food voice and bad-food voice sit apart. Display only; nothing here feeds a human.
 */
export type VoicePoint = { tick: number; id: string; openness: number; resonance: number; context: "good" | "bad" | "other" };
export type VoiceCluster = { context: "good" | "bad" | "other"; count: number; centroid: { openness: number; resonance: number } | null; dispersion: number };
export function voicePoints(frames: Frame[], id?: string): VoicePoint[] {
  const points: VoicePoint[] = [];
  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i], previous = frames[i - 1];
    for (const s of frame.world.sounds) {
      if (s.tick !== frame.tick || (id && s.sourceId !== id)) continue;
      const caller = previous.agents.find(a => a.id === s.sourceId);
      const context = caller?.valence === "good" ? "good" : caller?.valence === "bad" ? "bad" : "other";
      points.push({ tick: frame.tick, id: s.sourceId, openness: s.shape.openness, resonance: s.shape.resonance, context });
    }
  }
  return points;
}
export function voiceClusters(points: VoicePoint[]): VoiceCluster[] {
  return (["good", "bad", "other"] as const).map(context => {
    const p = points.filter(x => x.context === context);
    if (!p.length) return { context, count: 0, centroid: null, dispersion: 0 };
    const centroid = { openness: p.reduce((a, x) => a + x.openness, 0) / p.length, resonance: p.reduce((a, x) => a + x.resonance, 0) / p.length };
    const dispersion = p.reduce((a, x) => a + Math.hypot(x.openness - centroid.openness, x.resonance - centroid.resonance), 0) / p.length;
    return { context, count: p.length, centroid, dispersion };
  });
}
/** Distance between the good and bad centroids (the "distinctness" the studies gate on), or null when either voice is missing. */
export function voiceDistinctness(clusters: VoiceCluster[]): number | null {
  const good = clusters.find(c => c.context === "good")?.centroid, bad = clusters.find(c => c.context === "bad")?.centroid;
  return good && bad ? Math.hypot(good.openness - bad.openness, good.resonance - bad.resonance) : null;
}
