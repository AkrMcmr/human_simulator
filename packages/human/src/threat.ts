import { magnitude } from "../../contracts/src/index.ts";
import type { Observation, RandomSource, SoundShape, Vec2 } from "../../contracts/src/index.ts";
import type { HumanState } from "./index.ts";
import { decideReferentLearner, nearestHeardCategory, foodVoiceOf, FOOD_CALL, CONVENTION, CONTRAST } from "./forager-listener.ts";
import { separateFrom } from "./lexicon.ts";
import { ALARM } from "./valence.ts";

/**
 * 0.13.0-experimental.1 (research decision 0050): a dangerous animal as the second referent. Built on the food-voice
 * convention (imitation while eating, contrast elsewhere; convention-contrast 0.10.0-experimental.2) with three
 * additions. (1) Innate threat perception: a dissimilar animal in sight within THREAT.reach is a risk that grows as it
 * nears; the individual withdraws away from it, and the risk leaks into its voice through the state coupling.
 * (2) A threat voice: while a threat is in sight the individual has an urge to call and imitates the categories it
 * has heard while threatened, kept apart from the food voice; while eating it imitates the food voice kept apart from
 * the threat voice; otherwise it avoids both. (3) Strict associative comprehension: a heard category counts a hit
 * when a threat is seen or pain suffered within THREAT.associationTicks of hearing it, a miss otherwise; a category
 * with at least one hit and more hits than misses is a warning, and hearing one makes the individual withdraw from
 * its source for THREAT.fleeTicks. No meaning is given to any sound. "deaf" learns and produces the same but never
 * acts on a heard warning; "alarm" is the ceiling: an innate fixed alarm sound when a threat is in sight, and
 * withdrawal from any alarm-shaped sound.
 */
export const THREAT_VERSION = "0.13.0-experimental.1";
export const THREAT = { reach: 6, callUrge: FOOD_CALL.utility, associationTicks: 30, fleeTicks: 20, heardMemory: 40 };
export type ThreatMode = "full" | "deaf" | "alarm";
type ThreatState = HumanState & {
  lastIntake?: number; lastPain: number;
  eatingHeard?: Record<number, number>; threatHeard?: Record<number, number>;
  heardLog?: { category: number; x: number; y: number; tick: number; resolved: boolean }[];
  alarms?: Record<number, { hit: number; miss: number }>;
  fleeFrom?: Vec2 | null; fleeUntil?: number;
};
export function threatOf(observation: Observation): { risk: number; position: Vec2 } | null {
  const seen = observation.animals.filter(a => a.morphologySimilarity < 0.7).map(a => ({ a, d: magnitude(a.relativePosition) })).filter(x => x.d <= THREAT.reach).sort((p, q) => p.d - q.d)[0];
  if (!seen) return null;
  return { risk: Math.min(1, Math.max(0, 1 - seen.d / THREAT.reach)), position: { x: observation.selfPosition.x + seen.a.relativePosition.x, y: observation.selfPosition.y + seen.a.relativePosition.y } };
}
/** The heard category this individual reproduces when threatened: the share of each category heard while a threat was in sight. */
export function threatVoiceOf(human: HumanState): SoundShape | null {
  const h = human as ThreatState;
  const heard = h.threatHeard ?? {}; const total = Object.values(heard).reduce((a, b) => a + b, 0);
  let best: { shape: SoundShape; score: number } | null = null;
  for (const c of human.heardSounds) {
    const score = CONVENTION.heardWeight * ((heard[c.id] ?? 0) / Math.max(1, total));
    if (score > CONVENTION.minimumScore && (!best || score > best.score)) best = { shape: { ...c.shape }, score };
  }
  return best?.shape ?? null;
}
export function isAlarmCategory(human: HumanState, category: number): boolean {
  const a = (human as ThreatState).alarms?.[category];
  return !!a && a.hit >= 1 && a.hit > a.miss;
}
/** Voice choice by context: threat in sight → threat voice (apart from the food voice); eating → food voice (apart from the threat voice); otherwise a produced sound far from both, or null. */
export function chooseThreatVoice(human: HumanState, threatened: boolean): SoundShape | null {
  const food = foodVoiceOf(human), threat = threatVoiceOf(human);
  if (threatened) return threat ? (food ? separateFrom(threat, food) : threat) : null;
  if (((human as ThreatState).lastIntake ?? 0) > 0) return food ? (threat ? separateFrom(food, threat) : food) : null;
  const voices = [food, threat].filter((v): v is SoundShape => v !== null);
  if (!voices.length) return null;
  const far = human.producedSounds.map(c => ({ shape: { ...c.shape }, gap: Math.min(...voices.map(v => Math.hypot(c.shape.openness - v.openness, c.shape.resonance - v.resonance))) })).filter(c => c.gap >= CONTRAST.minimumGap).sort((a, b) => b.gap - a.gap)[0];
  return far?.shape ?? null;
}
export function decideThreat(previous: HumanState, observation: Observation, random: RandomSource, mode: ThreatMode = "full") {
  const human: ThreatState = structuredClone(previous);
  const self = observation.selfPosition;
  const threat = threatOf(observation);
  const attacked = human.lastPain > 0.5;
  // Context counts for imitation: categories heard while eating (food voice) and while a threat is in sight (threat voice).
  for (const s of observation.sounds) {
    const category = nearestHeardCategory(human, s);
    if (category === null) continue;
    if ((human.lastIntake ?? 0) > 0) { human.eatingHeard ??= {}; human.eatingHeard[category] = (human.eatingHeard[category] ?? 0) + 1; }
    if (threat) { human.threatHeard ??= {}; human.threatHeard[category] = (human.threatHeard[category] ?? 0) + 1; }
  }
  // Strict association: each heard sound is logged; a threat seen or pain suffered within the window resolves open entries as hits, expiry as misses.
  if (mode !== "alarm") {
    human.heardLog = (human.heardLog ?? []).filter(e => observation.tick - e.tick <= THREAT.associationTicks + 1);
    if (threat || attacked) for (const e of human.heardLog) if (!e.resolved) { e.resolved = true; const a = (human.alarms ??= {})[e.category] ??= { hit: 0, miss: 0 }; a.hit++; }
    for (const e of human.heardLog) if (!e.resolved && observation.tick - e.tick > THREAT.associationTicks) { e.resolved = true; const a = (human.alarms ??= {})[e.category] ??= { hit: 0, miss: 0 }; a.miss++; }
    for (const s of observation.sounds) {
      const category = nearestHeardCategory(human, s);
      if (category === null) continue;
      const source = { x: self.x + s.relativePosition.x, y: self.y + s.relativePosition.y };
      if (!human.heardLog.some(e => e.category === category && !e.resolved && Math.hypot(e.x - source.x, e.y - source.y) <= 3)) human.heardLog.push({ category, ...source, tick: observation.tick, resolved: false });
    }
    if (human.heardLog.length > THREAT.heardMemory) human.heardLog = human.heardLog.slice(-THREAT.heardMemory);
  }
  // Comprehension: a heard warning (learned category, or the innate alarm shape for the ceiling) starts a flight from its source.
  if (mode !== "deaf") for (const s of observation.sounds) {
    const category = nearestHeardCategory(human, s);
    const warning = mode === "alarm" ? Math.hypot(s.shape.openness - ALARM.shape.openness, s.shape.resonance - ALARM.shape.resonance) < ALARM.radius : category !== null && isAlarmCategory(human, category);
    if (!warning) continue;
    human.fleeFrom = { x: self.x + s.relativePosition.x, y: self.y + s.relativePosition.y }; human.fleeUntil = observation.tick + THREAT.fleeTicks;
  }
  const fleeing = human.fleeFrom && (human.fleeUntil ?? -1) >= observation.tick ? human.fleeFrom : null;
  if (!fleeing) { human.fleeFrom = null; human.fleeUntil = undefined; }
  const chooseSound = mode === "alarm" ? (h: HumanState) => threat ? { ...ALARM.shape } : chooseThreatVoice(h, false) : (h: HumanState) => chooseThreatVoice(h, !!threat);
  return decideReferentLearner(human, observation, random, FOOD_CALL.utility, undefined, {
    stateCoupling: CONVENTION.stateCoupling, chooseSound, threat, fleeFrom: fleeing, ...(threat ? { callUrge: THREAT.callUrge } : {}),
  });
}
export const decideThreatFull = (h: HumanState, o: Observation, r: RandomSource) => decideThreat(h, o, r, "full");
export const decideThreatDeaf = (h: HumanState, o: Observation, r: RandomSource) => decideThreat(h, o, r, "deaf");
export const decideThreatAlarm = (h: HumanState, o: Observation, r: RandomSource) => decideThreat(h, o, r, "alarm");
