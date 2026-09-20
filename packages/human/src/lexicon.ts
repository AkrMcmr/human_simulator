import { magnitude, soundDistance } from "../../contracts/src/index.ts";
import type { HeardSound, Observation, RandomSource, SoundShape } from "../../contracts/src/index.ts";
import type { Estimate, HumanState } from "./index.ts";
import { decideWithSenderOptions } from "./signal-sender.ts";
import { nearestHeardCategory, FOOD_CALL, REFERENT, CONVENTION, CONTRAST } from "./forager-listener.ts";

/**
 * 0.11.0-experimental.1: two referents (research decision 0025). The conventional-voice machinery of
 * 0.10.0-experimental.2 is generalized from one context (eating) to two (eating, being sheltered). Each heard
 * sound is remembered with its source place; visiting the place credits or debits the sound's category
 * separately for food and for warmth, depending on what is seen there. While eating the speaker imitates the
 * heard category its experience ties to food, while sheltered the one tied to warmth, and otherwise avoids
 * both. Cold listeners without a known warm place follow sounds whose warmth estimate is favorable, as hungry
 * ones do for food. No meaning, repertoire, or success label is given; state coupling stays weak (0.2).
 */
export const LEXICON_VERSION = "0.11.0-experimental.1";
export const LEXICON = { shelterCall: FOOD_CALL.utility, visitRadius: REFERENT.visitRadius, memoryTicks: REFERENT.memoryTicks, maxRecent: REFERENT.maxRecent };
export type Referent = "food" | "warmth";
type LexiconState = HumanState & {
  lastIntake?: number; lastWarm?: boolean;
  recentSounds?: { category: number; x: number; y: number; tick: number }[];
  referents?: Record<Referent, Record<number, Estimate>>;
  contextHeard?: Record<Referent, Record<number, number>>;
};
export const TRANSIENT = { coldAbove: 0.3 };
/**
 * Which need is being satisfied right now. Eating is transient by nature (intake happens only while eating);
 * with `transient`, being sheltered counts only while the body is still cold (0.11.0-experimental.2, decision 0026),
 * so the warmth context is the act of warming up rather than the hours spent sitting warm.
 */
export function contextOf(human: HumanState, transient = false): Referent | null {
  const h = human as LexiconState;
  if ((h.lastIntake ?? 0) > 0) return "food";
  if (h.lastWarm && (!transient || human.body.cold > TRANSIENT.coldAbove)) return "warmth";
  return null;
}
/** The heard category this individual's experience ties to the referent, or null. */
export function voiceFor(human: HumanState, kind: Referent): SoundShape | null {
  const h = human as LexiconState;
  if (!human.heardSounds.length) return null;
  const heard = h.contextHeard?.[kind] ?? {};
  const total = Object.values(heard).reduce((a, b) => a + b, 0);
  let best: { shape: SoundShape; score: number } | null = null;
  for (const c of human.heardSounds) {
    const e = h.referents?.[kind]?.[c.id];
    const score = (e && e.samples > 0 ? e.mean : 0) + CONVENTION.heardWeight * ((heard[c.id] ?? 0) / Math.max(1, total));
    if (score > CONVENTION.minimumScore && (!best || score > best.score)) best = { shape: { ...c.shape }, score };
  }
  return best?.shape ?? null;
}
/** In a context, imitate that context's voice; outside both, avoid both voices (farthest own category, at least CONTRAST.minimumGap from each). */
export function chooseLexiconVoice(human: HumanState, transient = false, separate = false): SoundShape | null {
  const context = contextOf(human, transient);
  const food = voiceFor(human, "food"), warmth = voiceFor(human, "warmth");
  if (context === "food") return separate && food && warmth ? separateFrom(food, warmth) : food;
  if (context === "warmth") return separate && warmth && food ? separateFrom(warmth, food) : warmth;
  const voices = [food, warmth].filter((v): v is SoundShape => v !== null);
  if (!voices.length) return null;
  const far = human.producedSounds.map(c => ({ shape: { ...c.shape }, gap: Math.min(...voices.map(v => soundDistance(c.shape, v))) })).filter(c => c.gap >= CONTRAST.minimumGap).sort((a, b) => b.gap - a.gap)[0];
  return far?.shape ?? null;
}
/** Follow the sound whose category has the best estimate for the referent; unknown categories by chance, negative ones only when exploring. */
export function selectByEstimates(human: HumanState, sounds: HeardSound[], estimates: Record<number, Estimate> | undefined, random: RandomSource, purpose: string): HeardSound | null {
  if (!sounds.length) return null;
  const scored = sounds.map(s => { const category = nearestHeardCategory(human, s); const e = category === null ? undefined : estimates?.[category]; return { sound: s, mean: e && e.samples > 0 ? e.mean : null }; });
  const known = scored.filter(x => x.mean !== null) as { sound: HeardSound; mean: number }[];
  if (known.length) {
    const best = known.reduce((a, b) => b.mean > a.mean ? b : a);
    return best.mean > 0 || random(purpose + "-explore") < REFERENT.exploreRate ? best.sound : null;
  }
  return random(purpose + "-unknown") < REFERENT.unknownFollowRate ? [...scored].sort((a, b) => b.sound.loudness - a.sound.loudness)[0].sound : null;
}
export const MEMORY_CREDIT = { recentTicks: 300 };
/**
 * 0.11.0-experimental.3 (research decision 0031): three changes to the two-referent learner. (1) When a sound's
 * source is visited, the referent is judged from the individual's own place memory (a food or warm place seen
 * there within MEMORY_CREDIT.recentTicks), not only from what is in view this tick, so a warm place that went out
 * between hearing and arriving still counts. (2) Hearing while sheltered is counted toward the warmth context
 * whenever sheltered (persistent learning). (3) The shelter call and the warmth voice are produced only while
 * still cold (transient calling), so the soundscape is not flooded.
 */
export type LexiconMode = "persistent" | "transient" | "memory" | "separate" | "fine";
/** 0.11.0-experimental.5 (research decision 0036): the separating speaker with finer hearing, so voices 0.2 apart fall into different heard categories. */
export const FINE_HEARING = { auditoryResolution: 0.09 };
/**
 * 0.11.0-experimental.4 (research decision 0033): explicit separation. When the voice a speaker is about to imitate
 * for one context lies within SEPARATION.minimumGap of the voice it ties to the other context, it displaces its
 * production away from the other voice along the line between them (or along the openness axis when they
 * coincide) until the gap is met. A candidate-level assumption that speakers avoid confusable signals; nothing
 * about the listener or the world is given.
 */
export const SEPARATION = { minimumGap: 0.3 };
export function separateFrom(voice: SoundShape, other: SoundShape): SoundShape {
  const dx = voice.openness - other.openness, dy = voice.resonance - other.resonance;
  const d = Math.hypot(dx, dy);
  if (d >= SEPARATION.minimumGap) return voice;
  const ux = d > 1e-9 ? dx / d : (other.openness <= 0.5 ? 1 : -1), uy = d > 1e-9 ? dy / d : 0;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  return { openness: clamp01(other.openness + ux * SEPARATION.minimumGap), resonance: clamp01(other.resonance + uy * SEPARATION.minimumGap) };
}
export function decideLexicon(previous: HumanState, observation: Observation, random: RandomSource, mode: LexiconMode | boolean = "persistent") {
  const transient = mode === true || mode === "transient" || mode === "memory" || mode === "separate" || mode === "fine";
  const memory = mode === "memory" || mode === "separate" || mode === "fine";
  const separate = mode === "separate" || mode === "fine";
  const fine = mode === "fine";
  const human: LexiconState = structuredClone(previous);
  const self = observation.selfPosition;
  const seen: Record<Referent, { x: number; y: number }[]> = { food: [], warmth: [] };
  for (const r of observation.resources) if (r.strength > 0.01) seen[r.kind].push({ x: self.x + r.relativePosition.x, y: self.y + r.relativePosition.y });
  if (memory) for (const place of Object.values(human.places)) if (place.strength > 0.01 && observation.tick - place.seen <= MEMORY_CREDIT.recentTicks) seen[place.kind].push({ x: place.position.x, y: place.position.y });
  const kept: NonNullable<LexiconState["recentSounds"]> = [];
  for (const m of human.recentSounds ?? []) {
    if (observation.tick - m.tick > LEXICON.memoryTicks) continue;
    if (magnitude({ x: m.x - self.x, y: m.y - self.y }) <= LEXICON.visitRadius) {
      if (human.heardSounds.some(c => c.id === m.category) && human.parameters.learningRate > 0) {
        human.referents ??= { food: {}, warmth: {} };
        for (const kind of ["food", "warmth"] as Referent[]) {
          const e = human.referents[kind][m.category] ?? { mean: 0, variance: 1, samples: 0 };
          const outcome = seen[kind].some(f => magnitude({ x: f.x - m.x, y: f.y - m.y }) <= LEXICON.visitRadius) ? 1 : -1;
          const rate = human.parameters.learningRate;
          const residual = outcome - e.mean;
          e.mean += rate * residual;
          e.variance = Math.max(0, (1 - rate) * e.variance + rate * residual * residual);
          e.samples++;
          human.referents[kind][m.category] = e;
        }
      }
      continue;
    }
    kept.push(m);
  }
  human.recentSounds = kept;
  // Learning context: with memory mode, hearing counts toward warmth whenever sheltered; the produced voice still follows the transient context.
  const context = contextOf(human, memory ? false : transient);
  if (context) {
    for (const s of observation.sounds) {
      const category = nearestHeardCategory(human, s);
      if (category !== null) { human.contextHeard ??= { food: {}, warmth: {} }; human.contextHeard[context][category] = (human.contextHeard[context][category] ?? 0) + 1; }
    }
  }
  const result = decideWithSenderOptions(human, observation, random, {
    stateCoupling: CONVENTION.stateCoupling, satiationCall: FOOD_CALL.utility,
    // With transient contexts the shelter call is silenced once the body is warm; the core term only checks lastWarm.
    shelterCall: transient && human.body.cold <= TRANSIENT.coldAbove ? 0 : LEXICON.shelterCall,
    chooseSound: (h) => chooseLexiconVoice(h, transient, separate),
    auditoryResolution: fine ? FINE_HEARING.auditoryResolution : undefined,
    soundOrienting: (h, sounds, r) => selectByEstimates(h, sounds, (h as LexiconState).referents?.food, r, "lexicon-food"),
    warmthOrienting: (h, sounds, r) => selectByEstimates(h, sounds, (h as LexiconState).referents?.warmth, r, "lexicon-warmth"),
  });
  const next = result.human as LexiconState;
  next.recentSounds = [...(human.recentSounds ?? [])];
  for (const s of observation.sounds) {
    const category = nearestHeardCategory(next, s);
    if (category === null) continue;
    next.recentSounds.push({ category, x: self.x + s.relativePosition.x, y: self.y + s.relativePosition.y, tick: observation.tick });
  }
  if (next.recentSounds.length > LEXICON.maxRecent) next.recentSounds = next.recentSounds.slice(-LEXICON.maxRecent);
  return result;
}
/** 0.11.0-experimental.2: the same lexicon with the warmth context limited to warming up while still cold. */
export const decideLexiconTransient = (h: HumanState, o: Observation, r: RandomSource) => decideLexicon(h, o, r, "transient");
/** 0.11.0-experimental.3: memory-based referent credit, persistent learning context, transient calling. */
export const decideLexiconMemory = (h: HumanState, o: Observation, r: RandomSource) => decideLexicon(h, o, r, "memory");
/** 0.11.0-experimental.4: memory credit plus explicit separation of the two context voices. */
export const decideLexiconSeparate = (h: HumanState, o: Observation, r: RandomSource) => decideLexicon(h, o, r, "separate");
/** 0.11.0-experimental.5: memory credit, explicit separation, and finer hearing (0.09). */
export const decideLexiconFine = (h: HumanState, o: Observation, r: RandomSource) => decideLexicon(h, o, r, "fine");
