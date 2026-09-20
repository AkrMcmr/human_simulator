import { clamp, soundDistance } from "../../contracts/src/index.ts";
import type { HeardSound, Observation, RandomSource } from "../../contracts/src/index.ts";
import type { Estimate, HumanState } from "./index.ts";
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
export function decideSelectiveForager(previous: HumanState, observation: Observation, random: RandomSource) {
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
  return decideWithSenderOptions(human, observation, random, { stateCoupling: VOICE_STATE.coupling, soundOrienting: (h, sounds, r) => selectSoundToFollow(h, sounds, r, observation.tick) });
}
/** Blind orienting on the full learning stack. */
export const decideForagerListener = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r, { stateCoupling: VOICE_STATE.coupling, soundOrienting: true });
/** Blind orienting alone on the default model: no coupling, no learning. */
export const decideForagerListenerOnly = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r, { sender: false, receiver: false, soundOrienting: true });
