import { clamp, magnitude, soundDistance } from "../../contracts/src/index.ts";
import type { HeardSound, Observation, PhysicalEffect, RandomSource } from "../../contracts/src/index.ts";
import { applyPhysicalEffect } from "./index.ts";
import type { Estimate, HumanState, SoundChoice } from "./index.ts";
import { decideWithSenderOptions } from "./signal-sender.ts";
import { VOICE_STATE } from "./voice-state.ts";

/**
 * Sound-guided foraging candidates (research decision 0014). A hungry individual with no remembered food may
 * explore toward a heard sound (sound localization, contracts 0.2.0).
 * - 0.7.0-experimental.1 (blind): always toward the loudest sound. Innate, category-blind.
 * - 0.7.0-experimental.2 (selective): learns, per own heard-sound category, how its hunger changed in the
 *   OUTCOME_WINDOW steps after following that category, and follows only categories with a favorable estimate
 *   (with exploration). No meaning is given; the mapping is the individual's own experienced consequence.
 */
export const FORAGER_LISTENER_VERSION = "0.7.0-experimental.1";
export const SELECTIVE_FORAGER_VERSION = "0.7.0-experimental.2";
export const SELECTIVE = { outcomeWindow: 30, exploreRate: 0.15, unknownFollowRate: 0.5, hungerThreshold: 0.4, outcomeScale: 0.3 };
/**
 * 0.8.0-experimental.*: food call. Right after a step in which the individual ate, vocalizing gains extra utility, so
 * voices tend to be produced at food. An innate emission tendency (research decision 0015), not a meaning.
 */
export const FOOD_CALL_VERSION = "0.8.0-experimental.1";
export const FOOD_CALL = { utility: 0.45 };
/** 0.8.0-experimental.2: the eating state also leaks into the voice (research decision 0016). */
export const EATING_VOICE_VERSION = "0.8.0-experimental.2";
export const EATING_VOICE = { coupling: 0.7 };
/** Candidate-only apply: remembers how much was eaten in the last step. The default apply does not record this. */
export function applyWithIntake(previous: HumanState, effect: PhysicalEffect): HumanState {
  const next = applyPhysicalEffect(previous, effect) as HumanState & { lastIntake?: number };
  next.lastIntake = effect.foodIntake;
  return next;
}
type ForagerState = HumanState & { orientOutcomes?: Record<number, Estimate>; orientPending?: { category: number; tick: number; hunger: number } | null };

export function nearestHeardCategory(human: HumanState, sound: HeardSound): number | null {
  const nearest = [...human.heardSounds].sort((a, b) => soundDistance(a.shape, sound.shape) - soundDistance(b.shape, sound.shape) || a.id - b.id)[0];
  return nearest && soundDistance(nearest.shape, sound.shape) < 0.18 ? nearest.id : null;
}
/** Which heard sound to follow, if any. Records the choice so the outcome can be learned later. */
export function selectSoundToFollow(human: HumanState, sounds: HeardSound[], random: RandomSource, tick: number): HeardSound | null {
  const state = human as ForagerState;
  const scored = sounds.map(s => { const category = nearestHeardCategory(human, s); const e = category === null ? undefined : state.orientOutcomes?.[category]; return { sound: s, category, mean: e?.mean ?? null }; });
  const known = scored.filter(x => x.mean !== null) as { sound: HeardSound; category: number; mean: number }[];
  let choice: { sound: HeardSound; category: number | null } | null = null;
  if (known.length) {
    const best = known.reduce((a, b) => b.mean > a.mean ? b : a);
    if (best.mean > 0 || random("orient-explore") < SELECTIVE.exploreRate) choice = best;
  } else if (random("orient-unknown") < SELECTIVE.unknownFollowRate) {
    choice = [...scored].sort((a, b) => b.sound.loudness - a.sound.loudness)[0];
  }
  if (choice && choice.category !== null && !state.orientPending) state.orientPending = { category: choice.category, tick, hunger: human.body.hunger };
  return choice?.sound ?? null;
}
export function decideSelectiveForager(previous: HumanState, observation: Observation, random: RandomSource, satiationCall?: number, eatingCoupling?: number) {
  const human: ForagerState = structuredClone(previous);
  const pending = human.orientPending;
  if (pending && observation.tick - pending.tick >= SELECTIVE.outcomeWindow) {
    // Outcome of following that category: hunger relief over the window, scaled to about [-1, 1]. Learned only when the category still exists.
    if (human.heardSounds.some(c => c.id === pending.category) && human.parameters.learningRate > 0) {
      human.orientOutcomes ??= {};
      const e = human.orientOutcomes[pending.category] ?? { mean: 0, variance: 1, samples: 0 };
      const outcome = clamp((pending.hunger - human.body.hunger) / SELECTIVE.outcomeScale, -1, 1);
      const rate = human.parameters.learningRate;
      const residual = outcome - e.mean;
      e.mean += rate * residual;
      e.variance = Math.max(0, (1 - rate) * e.variance + rate * residual * residual);
      e.samples++;
      human.orientOutcomes[pending.category] = e;
    }
    human.orientPending = null;
  }
  return decideWithSenderOptions(human, observation, random, { stateCoupling: VOICE_STATE.coupling, soundOrienting: (h, sounds, r) => selectSoundToFollow(h, sounds, r, observation.tick), satiationCall, eatingCoupling });
}
/** Eating-coupled voice + food call + selective orienting on the full stack. */
export const decideEatingSelective = (h: HumanState, o: Observation, r: RandomSource) => decideSelectiveForager(h, o, r, FOOD_CALL.utility, EATING_VOICE.coupling);
/** Eating-coupled voice + food call + blind orienting: the sound type is available but not used. */
export const decideEatingBlind = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r, { stateCoupling: VOICE_STATE.coupling, soundOrienting: true, satiationCall: FOOD_CALL.utility, eatingCoupling: EATING_VOICE.coupling });
/** Food call + blind orienting on the full stack. */
export const decideFoodCallForager = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r, { stateCoupling: VOICE_STATE.coupling, soundOrienting: true, satiationCall: FOOD_CALL.utility });
/** Food call + selective orienting on the full stack. */
export const decideFoodCallSelective = (h: HumanState, o: Observation, r: RandomSource) => decideSelectiveForager(h, o, r, FOOD_CALL.utility);
/** Food call alone on the default model: voices at food, but nobody follows them. */
export const decideFoodCallOnly = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r, { sender: false, receiver: false, satiationCall: FOOD_CALL.utility });
/** Blind orienting on the full learning stack. */
export const decideForagerListener = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r, { stateCoupling: VOICE_STATE.coupling, soundOrienting: true });
/** Blind orienting alone on the default model: no coupling, no learning. */
export const decideForagerListenerOnly = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r, { sender: false, receiver: false, soundOrienting: true });

/**
 * 0.8.0-experimental.3: referent learning. Every heard sound is remembered with the place it came from. When the
 * listener later passes within REFERENT.visitRadius of that place, the sound's category is credited if food is
 * seen there and debited if not. Hungry listeners without a known food place follow sounds whose category has a
 * favorable estimate. Learning happens on every visit, not only after deliberate following (research decision 0017).
 */
export const REFERENT_LEARNER_VERSION = "0.8.0-experimental.3";
export const REFERENT = { visitRadius: 3, memoryTicks: 90, maxRecent: 12, exploreRate: 0.15, unknownFollowRate: 0.5 };
type ReferentState = HumanState & { soundReferents?: Record<number, Estimate>; recentSounds?: { category: number; x: number; y: number; tick: number }[] };
export function selectByReferent(human: HumanState, sounds: HeardSound[], random: RandomSource): HeardSound | null {
  const state = human as ReferentState;
  const scored = sounds.map(s => { const category = nearestHeardCategory(human, s); const e = category === null ? undefined : state.soundReferents?.[category]; return { sound: s, mean: e && e.samples > 0 ? e.mean : null }; });
  const known = scored.filter(x => x.mean !== null) as { sound: HeardSound; mean: number }[];
  if (known.length) {
    const best = known.reduce((a, b) => b.mean > a.mean ? b : a);
    return best.mean > 0 || random("referent-explore") < REFERENT.exploreRate ? best.sound : null;
  }
  return random("referent-unknown") < REFERENT.unknownFollowRate ? [...scored].sort((a, b) => b.sound.loudness - a.sound.loudness)[0].sound : null;
}
export function decideReferentLearner(previous: HumanState, observation: Observation, random: RandomSource, satiationCall?: number, eatingCoupling?: number, extra: { stateCoupling?: number; chooseSound?: SoundChoice } = {}) {
  const human: ReferentState = structuredClone(previous);
  const self = observation.selfPosition;
  const foodHere = observation.resources.filter(r => r.kind === "food" && r.strength > 0.01).map(r => ({ x: self.x + r.relativePosition.x, y: self.y + r.relativePosition.y }));
  const kept: NonNullable<ReferentState["recentSounds"]> = [];
  for (const m of human.recentSounds ?? []) {
    if (observation.tick - m.tick > REFERENT.memoryTicks) continue;
    if (magnitude({ x: m.x - self.x, y: m.y - self.y }) <= REFERENT.visitRadius) {
      // Resolved by visiting the place the sound came from: was there food?
      if (human.heardSounds.some(c => c.id === m.category) && human.parameters.learningRate > 0) {
        human.soundReferents ??= {};
        const e = human.soundReferents[m.category] ?? { mean: 0, variance: 1, samples: 0 };
        const outcome = foodHere.some(f => magnitude({ x: f.x - m.x, y: f.y - m.y }) <= REFERENT.visitRadius) ? 1 : -1;
        const rate = human.parameters.learningRate;
        const residual = outcome - e.mean;
        e.mean += rate * residual;
        e.variance = Math.max(0, (1 - rate) * e.variance + rate * residual * residual);
        e.samples++;
        human.soundReferents[m.category] = e;
      }
      continue;
    }
    kept.push(m);
  }
  human.recentSounds = kept;
  const result = decideWithSenderOptions(human, observation, random, { stateCoupling: extra.stateCoupling ?? VOICE_STATE.coupling, soundOrienting: (h, sounds, r) => selectByReferent(h, sounds, r), satiationCall, eatingCoupling, chooseSound: extra.chooseSound });
  // Remember where each heard sound came from, classified with the categories updated by this decision.
  const next = result.human as ReferentState;
  next.recentSounds = [...(human.recentSounds ?? [])];
  for (const s of observation.sounds) {
    const category = nearestHeardCategory(next, s);
    if (category === null) continue;
    next.recentSounds.push({ category, x: self.x + s.relativePosition.x, y: self.y + s.relativePosition.y, tick: observation.tick });
  }
  if (next.recentSounds.length > REFERENT.maxRecent) next.recentSounds = next.recentSounds.slice(-REFERENT.maxRecent);
  return result;
}
/** Referent learner on the eating-coupled voice with food calls. */
export const decideEatingReferent = (h: HumanState, o: Observation, r: RandomSource) => decideReferentLearner(h, o, r, FOOD_CALL.utility, EATING_VOICE.coupling);
/** Referent learner without eating coupling: voices at food are not acoustically distinct, so referents should not separate. */
export const decideFoodCallReferent = (h: HumanState, o: Observation, r: RandomSource) => decideReferentLearner(h, o, r, FOOD_CALL.utility, undefined);

/**
 * 0.9.0-experimental.1: the caller learns what its own food call costs it (research decision 0021). While eating,
 * an individual either calls or stays silent; CALLER.window ticks later the change in its own hunger is credited
 * to that choice. The innate food-call utility is scaled by the learned advantage of calling over staying
 * silent. Nothing about listeners, meaning, or success is given; only the caller's own later hunger.
 */
export const LEARNED_CALLER_VERSION = "0.9.0-experimental.1";
export const CALLER = { window: 60, minimumSamples: 3, gain: 4, floor: 0, ceiling: 2 };
type CallerState = HumanState & { lastIntake?: number; callOutcomes?: { call: Estimate; silent: Estimate }; callPending?: { called: boolean; tick: number; hunger: number } | null };
/** Multiplier on the innate food-call utility from the caller's own experience: 1 until both choices have been tried. */
export function callModulation(human: HumanState): number {
  const o = (human as CallerState).callOutcomes;
  if (!o || o.call.samples < CALLER.minimumSamples || o.silent.samples < CALLER.minimumSamples) return 1;
  return clamp(1 + CALLER.gain * (o.call.mean - o.silent.mean), CALLER.floor, CALLER.ceiling);
}
export function decideLearnedCaller(previous: HumanState, observation: Observation, random: RandomSource) {
  const human: CallerState = structuredClone(previous);
  const pending = human.callPending;
  if (pending && observation.tick - pending.tick >= CALLER.window) {
    if (human.parameters.learningRate > 0) {
      human.callOutcomes ??= { call: { mean: 0, variance: 1, samples: 0 }, silent: { mean: 0, variance: 1, samples: 0 } };
      const e = pending.called ? human.callOutcomes.call : human.callOutcomes.silent;
      const relief = pending.hunger - human.body.hunger; // positive when the choice was followed by less hunger
      const rate = human.parameters.learningRate;
      const residual = relief - e.mean;
      e.mean += rate * residual;
      e.variance = Math.max(0, (1 - rate) * e.variance + rate * residual * residual);
      e.samples++;
    }
    human.callPending = null;
  }
  const eating = (human.lastIntake ?? 0) > 0;
  const result = decideReferentLearner(human, observation, random, FOOD_CALL.utility * callModulation(human), EATING_VOICE.coupling);
  const next = result.human as CallerState;
  next.callPending = human.callPending ?? null;
  if (eating && !next.callPending) next.callPending = { called: result.action.kind === "vocalize", tick: observation.tick, hunger: human.body.hunger };
  return result;
}

/**
 * 0.10.0-experimental.1: a conventional food voice (research decision 0022). No innate acoustic region marks
 * eating. While eating, the speaker reproduces the heard-sound category that its own experience ties to food:
 * the category with the best referent estimate (soundReferents, learned by visiting sound sources) plus the
 * share of sounds heard while it was itself eating. State coupling is weak (0.2) so the region can be arbitrary.
 * Listeners are the referent learners of 0.8.0-experimental.3. Nothing shared is given: each individual only
 * imitates what it heard and credits what it saw.
 */
export const CONVENTION_VERSION = "0.10.0-experimental.1";
export const CONVENTION = { stateCoupling: 0.2, heardWeight: 0.5, minimumScore: 0.05 };
type ConventionState = ReferentState & { lastIntake?: number; eatingHeard?: Record<number, number> };
/** Which heard category to reproduce while eating, or null to fall back to the default voice. */
export function chooseImitatedFoodVoice(human: HumanState): { openness: number; resonance: number } | null {
  const state = human as ConventionState;
  if ((state.lastIntake ?? 0) <= 0 || !human.heardSounds.length) return null;
  const heardTotal = Object.values(state.eatingHeard ?? {}).reduce((a, b) => a + b, 0);
  let best: { shape: { openness: number; resonance: number }; score: number } | null = null;
  for (const c of human.heardSounds) {
    const e = state.soundReferents?.[c.id];
    const score = (e && e.samples > 0 ? e.mean : 0) + CONVENTION.heardWeight * ((state.eatingHeard?.[c.id] ?? 0) / Math.max(1, heardTotal));
    if (score > CONVENTION.minimumScore && (!best || score > best.score)) best = { shape: { ...c.shape }, score };
  }
  return best?.shape ?? null;
}
export function decideConvention(previous: HumanState, observation: Observation, random: RandomSource, imitate = true) {
  const human: ConventionState = structuredClone(previous);
  if ((human.lastIntake ?? 0) > 0) {
    for (const s of observation.sounds) {
      const category = nearestHeardCategory(human, s);
      if (category !== null) { human.eatingHeard ??= {}; human.eatingHeard[category] = (human.eatingHeard[category] ?? 0) + 1; }
    }
  }
  return decideReferentLearner(human, observation, random, FOOD_CALL.utility, undefined, { stateCoupling: CONVENTION.stateCoupling, chooseSound: imitate ? (h) => chooseImitatedFoodVoice(h) : undefined });
}
/** Control: same weak coupling, same listener, no imitation, so food voices stay each speaker's own. */
export const decideConventionNoImitation = (h: HumanState, o: Observation, r: RandomSource) => decideConvention(h, o, r, false);
