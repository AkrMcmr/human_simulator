import { magnitude } from "../../contracts/src/index.ts";
import type { HeardSound, Observation, RandomSource, SoundShape } from "../../contracts/src/index.ts";
import type { Estimate, HumanState } from "./index.ts";
import { decideWithSenderOptions } from "./signal-sender.ts";
import { nearestHeardCategory, FOOD_CALL, REFERENT, CONVENTION, CONTRAST } from "./forager-listener.ts";
import { separateFrom, selectByEstimates } from "./lexicon.ts";

/**
 * 0.12.0-experimental.1: two valences of one context (research decision 0037). Some food patches are toxic
 * (world 0.5.0) and look like any other food. Eating is the only way to find out, so the speaker's context is
 * "good" (intake without poison) or "bad" (poisoned intake), both transient. Each heard sound is remembered with
 * its source place; when the individual later eats within VALENCE.visitRadius of that place, the outcome credits
 * the sound's category as good or bad. Good-voice imitation while eating well, bad-voice imitation while
 * poisoned, avoidance of both otherwise, and explicit separation between the two voices. A hungry listener
 * follows sounds with a favorable good estimate; hearing a sound whose category is tied to bad food drops any
 * remembered food place near its source. Poisoned places are also dropped from the eater's own memory. State
 * coupling stays weak (0.2). No meaning, repertoire or success label is given.
 */
export const VALENCE_VERSION = "0.12.0-experimental.1";
export const VALENCE = { visitRadius: 3, memoryTicks: REFERENT.memoryTicks, maxRecent: REFERENT.maxRecent, badCall: FOOD_CALL.utility, warnAbove: 0.3 };
export type Valence = "good" | "bad";
type ValenceState = HumanState & {
  lastIntake?: number; lastPoison?: number;
  recentSounds?: { category: number; x: number; y: number; tick: number }[];
  valenceReferents?: Record<Valence, Record<number, Estimate>>;
  valenceHeard?: Record<Valence, Record<number, number>>;
};
export function valenceOf(human: HumanState): Valence | null {
  const h = human as ValenceState;
  if ((h.lastPoison ?? 0) > 0) return "bad";
  if ((h.lastIntake ?? 0) > 0) return "good";
  return null;
}
export function valenceVoice(human: HumanState, kind: Valence): SoundShape | null {
  const h = human as ValenceState;
  if (!human.heardSounds.length) return null;
  const heard = h.valenceHeard?.[kind] ?? {};
  const total = Object.values(heard).reduce((a, b) => a + b, 0);
  let best: { shape: SoundShape; score: number } | null = null;
  for (const c of human.heardSounds) {
    const e = h.valenceReferents?.[kind]?.[c.id];
    const score = (e && e.samples > 0 ? e.mean : 0) + CONVENTION.heardWeight * ((heard[c.id] ?? 0) / Math.max(1, total));
    if (score > CONVENTION.minimumScore && (!best || score > best.score)) best = { shape: { ...c.shape }, score };
  }
  return best?.shape ?? null;
}
export function chooseValenceVoice(human: HumanState): SoundShape | null {
  const context = valenceOf(human);
  const good = valenceVoice(human, "good"), bad = valenceVoice(human, "bad");
  if (context === "good") return good && bad ? separateFrom(good, bad) : good;
  if (context === "bad") return bad && good ? separateFrom(bad, good) : bad;
  const voices = [good, bad].filter((v): v is SoundShape => v !== null);
  if (!voices.length) return null;
  const far = human.producedSounds.map(c => ({ shape: { ...c.shape }, gap: Math.min(...voices.map(v => Math.hypot(c.shape.openness - v.openness, c.shape.resonance - v.resonance))) })).filter(c => c.gap >= CONTRAST.minimumGap).sort((a, b) => b.gap - a.gap)[0];
  return far?.shape ?? null;
}
/** Follow a sound only if its category is not tied to bad food; among the rest, prefer the best good estimate. */
export function selectSafeFood(human: HumanState, sounds: HeardSound[], random: RandomSource): HeardSound | null {
  const h = human as ValenceState;
  const safe = sounds.filter(s => { const c = nearestHeardCategory(human, s); const e = c === null ? undefined : h.valenceReferents?.bad?.[c]; return !(e && e.samples > 0 && e.mean > VALENCE.warnAbove); });
  return selectByEstimates(human, safe, h.valenceReferents?.good, random, "valence-food");
}
export function decideValence(previous: HumanState, observation: Observation, random: RandomSource) {
  const human: ValenceState = structuredClone(previous);
  const self = observation.selfPosition;
  const context = valenceOf(human);
  // Eating resolves remembered sound sources nearby: good or bad by what this meal did.
  const kept: NonNullable<ValenceState["recentSounds"]> = [];
  for (const m of human.recentSounds ?? []) {
    if (observation.tick - m.tick > VALENCE.memoryTicks) continue;
    if (context && magnitude({ x: m.x - self.x, y: m.y - self.y }) <= VALENCE.visitRadius) {
      if (human.heardSounds.some(c => c.id === m.category) && human.parameters.learningRate > 0) {
        human.valenceReferents ??= { good: {}, bad: {} };
        for (const kind of ["good", "bad"] as Valence[]) {
          const e = human.valenceReferents[kind][m.category] ?? { mean: 0, variance: 1, samples: 0 };
          const outcome = kind === context ? 1 : -1;
          const rate = human.parameters.learningRate;
          const residual = outcome - e.mean;
          e.mean += rate * residual;
          e.variance = Math.max(0, (1 - rate) * e.variance + rate * residual * residual);
          e.samples++;
          human.valenceReferents[kind][m.category] = e;
        }
      }
      continue;
    }
    kept.push(m);
  }
  human.recentSounds = kept;
  // A poisoned meal marks the place itself as no good in the eater's own memory.
  if (context === "bad") for (const place of Object.values(human.places)) if (place.kind === "food" && magnitude({ x: place.position.x - self.x, y: place.position.y - self.y }) <= VALENCE.visitRadius) place.strength = 0;
  if (context) {
    for (const s of observation.sounds) {
      const category = nearestHeardCategory(human, s);
      if (category !== null) { human.valenceHeard ??= { good: {}, bad: {} }; human.valenceHeard[context][category] = (human.valenceHeard[context][category] ?? 0) + 1; }
    }
  }
  // Hearing a bad-food voice from near a remembered food place drops that place as a target.
  for (const s of observation.sounds) {
    const category = nearestHeardCategory(human, s);
    const e = category === null ? undefined : human.valenceReferents?.bad?.[category];
    if (!e || e.samples === 0 || e.mean <= VALENCE.warnAbove) continue;
    const source = { x: self.x + s.relativePosition.x, y: self.y + s.relativePosition.y };
    for (const place of Object.values(human.places)) if (place.kind === "food" && magnitude({ x: place.position.x - source.x, y: place.position.y - source.y }) <= VALENCE.visitRadius) place.strength = 0;
  }
  const result = decideWithSenderOptions(human, observation, random, {
    stateCoupling: CONVENTION.stateCoupling, satiationCall: FOOD_CALL.utility,
    chooseSound: (h) => chooseValenceVoice(h),
    soundOrienting: (h, sounds, r) => selectSafeFood(h, sounds, r),
  });
  const next = result.human as ValenceState;
  next.recentSounds = [...(human.recentSounds ?? [])];
  for (const s of observation.sounds) {
    const category = nearestHeardCategory(next, s);
    if (category === null) continue;
    next.recentSounds.push({ category, x: self.x + s.relativePosition.x, y: self.y + s.relativePosition.y, tick: observation.tick });
  }
  if (next.recentSounds.length > VALENCE.maxRecent) next.recentSounds = next.recentSounds.slice(-VALENCE.maxRecent);
  return result;
}
