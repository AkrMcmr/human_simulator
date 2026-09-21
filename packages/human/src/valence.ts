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
/**
 * 0.12.0-experimental.2 (research decision 0039): taste aversion. In experimental.1 a poisoned or bad-voiced place
 * was only dropped from memory, and the default perception rewrites remembered places from what is visible every
 * tick, so food in sight was eaten regardless. Here an aversion is a remembered place (the eater's own poisoning,
 * and — in the full variant — the source of a heard bad-food voice) that keeps food within VALENCE.visitRadius out
 * of the forage targets for AVERSION.ticks, even when visible, unless hunger is at or above AVERSION.desperateAbove.
 * The "private" variant learns the same aversions from its own poisoning only and ignores heard bad voices as a
 * listener (it still produces both voices), so the difference between the two isolates the listener's use of the
 * bad voice. Voice production, valence learning and imitation are unchanged from experimental.1.
 */
export const VALENCE_AVERSION_VERSION = "0.12.0-experimental.2";
/**
 * 0.12.0-experimental.3 (research decision 0040): disgust. With taste aversion, poisoning becomes rare, so a voice
 * tied to the poisoned state alone has too few occasions to be shared (valence-v3). Here the bad state also arises
 * from perception: food in sight at an aversive place makes the individual disgusted (lastDisgust), which is a bad
 * context for the voice (bad-voice imitation, an extra urge to vocalize equal to the food-call utility) exactly as
 * being poisoned is. Comprehension mirrors production: a heard sound in the category this individual would itself
 * use as its bad voice (and not as its good voice) marks the source as aversive, in addition to the learned
 * estimate rule. "disgust-private" produces the same disgust calls but ignores heard bad voices as a listener.
 */
export const VALENCE_DISGUST_VERSION = "0.12.0-experimental.3";
/**
 * 0.12.0-experimental.4 (research decision 0041): disgust with restraint. In valence-v4 the disgusted individual
 * called on every tick it stood in sight of an aversive patch (900 calls per run), calling displaced foraging, and
 * second-hand aversions (from heard warnings) fed back into further warnings. Here disgust arises only from
 * first-hand aversions (the individual's own poisoning), and the urge to call comes at most once per
 * DISGUST.refractory ticks. Avoidance still follows both first-hand and heard aversions. "onset-private" is the
 * matching deaf control.
 */
export const VALENCE_ONSET_VERSION = "0.12.0-experimental.4";
export const AVERSION = { ticks: 600, desperateAbove: 0.95 };
export const DISGUST = { refractory: 50 };
export type ValenceMode = "drop" | "aversion" | "private" | "disgust" | "disgust-private" | "onset" | "onset-private";
export const VALENCE = { visitRadius: 3, memoryTicks: REFERENT.memoryTicks, maxRecent: REFERENT.maxRecent, badCall: FOOD_CALL.utility, warnAbove: 0.3 };
export type Valence = "good" | "bad";
type ValenceState = HumanState & {
  lastIntake?: number; lastPoison?: number; lastDisgust?: number;
  recentSounds?: { category: number; x: number; y: number; tick: number }[];
  valenceReferents?: Record<Valence, Record<number, Estimate>>;
  valenceHeard?: Record<Valence, Record<number, number>>;
  aversions?: { x: number; y: number; tick: number; firsthand?: boolean }[];
  lastDisgustCall?: number;
};
/** The valence of the last meal only (what eating did), used to judge remembered sound sources. */
export function mealValenceOf(human: HumanState): Valence | null {
  const h = human as ValenceState;
  if ((h.lastPoison ?? 0) > 0) return "bad";
  if ((h.lastIntake ?? 0) > 0) return "good";
  return null;
}
/** The valence context for the voice: poisoned or (experimental.3) disgusted is bad, eating well is good. */
export function valenceOf(human: HumanState): Valence | null {
  const h = human as ValenceState;
  if ((h.lastPoison ?? 0) > 0 || (h.lastDisgust ?? 0) > 0) return "bad";
  if ((h.lastIntake ?? 0) > 0) return "good";
  return null;
}
/** The heard category this individual would imitate for a valence, or null when none scores above the minimum. */
export function valenceCategory(human: HumanState, kind: Valence): number | null {
  const h = human as ValenceState;
  const heard = h.valenceHeard?.[kind] ?? {};
  const total = Object.values(heard).reduce((a, b) => a + b, 0);
  let best: { id: number; score: number } | null = null;
  for (const c of human.heardSounds) {
    const e = h.valenceReferents?.[kind]?.[c.id];
    const score = (e && e.samples > 0 ? e.mean : 0) + CONVENTION.heardWeight * ((heard[c.id] ?? 0) / Math.max(1, total));
    if (score > CONVENTION.minimumScore && (!best || score > best.score)) best = { id: c.id, score };
  }
  return best?.id ?? null;
}
export function valenceVoice(human: HumanState, kind: Valence): SoundShape | null {
  const id = valenceCategory(human, kind);
  const c = id === null ? undefined : human.heardSounds.find(x => x.id === id);
  return c ? { ...c.shape } : null;
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
export function decideValence(previous: HumanState, observation: Observation, random: RandomSource, mode: ValenceMode = "drop") {
  const human: ValenceState = structuredClone(previous);
  const self = observation.selfPosition;
  const onsetMode = mode === "onset" || mode === "onset-private";
  const disgustMode = mode === "disgust" || mode === "disgust-private" || onsetMode;
  const listens = mode !== "private" && mode !== "disgust-private" && mode !== "onset-private";
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => magnitude({ x: a.x - b.x, y: a.y - b.y }) <= VALENCE.visitRadius;
  const remember = (place: { x: number; y: number }, firsthand: boolean) => { if (mode !== "drop") (human.aversions ??= []).push({ x: place.x, y: place.y, tick: observation.tick, ...(onsetMode ? { firsthand } : {}) }); };
  // experimental.3: food in sight at a place already known as aversive is disgusting — a bad context without eating.
  // experimental.4: only first-hand aversions (own poisoning) disgust; heard warnings are avoided but not re-broadcast.
  if (disgustMode) {
    const live = (human.aversions ?? []).filter(a => observation.tick - a.tick <= AVERSION.ticks && (!onsetMode || a.firsthand));
    human.lastDisgust = live.length && observation.resources.some(r => r.kind === "food" && live.some(a => near(a, { x: self.x + r.relativePosition.x, y: self.y + r.relativePosition.y }))) ? 1 : 0;
  }
  const context = valenceOf(human);
  const meal = mealValenceOf(human);
  // Eating resolves remembered sound sources nearby: good or bad by what this meal did.
  const kept: NonNullable<ValenceState["recentSounds"]> = [];
  for (const m of human.recentSounds ?? []) {
    if (observation.tick - m.tick > VALENCE.memoryTicks) continue;
    if (meal && magnitude({ x: m.x - self.x, y: m.y - self.y }) <= VALENCE.visitRadius) {
      if (human.heardSounds.some(c => c.id === m.category) && human.parameters.learningRate > 0) {
        human.valenceReferents ??= { good: {}, bad: {} };
        for (const kind of ["good", "bad"] as Valence[]) {
          const e = human.valenceReferents[kind][m.category] ?? { mean: 0, variance: 1, samples: 0 };
          const outcome = kind === meal ? 1 : -1;
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
  if (meal === "bad") {
    for (const place of Object.values(human.places)) if (place.kind === "food" && near(place.position, self)) { place.strength = 0; remember(place.position, true); }
    remember(self, true);
  }
  if (context) {
    for (const s of observation.sounds) {
      const category = nearestHeardCategory(human, s);
      if (category !== null) { human.valenceHeard ??= { good: {}, bad: {} }; human.valenceHeard[context][category] = (human.valenceHeard[context][category] ?? 0) + 1; }
    }
  }
  // Hearing a bad-food voice from near a remembered food place drops that place as a target (not in the private variants).
  // experimental.3 also understands a heard sound in the category it would itself use as its bad voice (and not as its good voice).
  // In experimental.3 a sound in the category of the individual's own good voice is never a warning (valence-v3 showed learned bad estimates leaking onto the good voice and breaking it).
  const ownBad = disgustMode && listens ? valenceCategory(human, "bad") : null, ownGood = disgustMode && listens ? valenceCategory(human, "good") : null;
  if (listens) for (const s of observation.sounds) {
    const category = nearestHeardCategory(human, s);
    if (disgustMode && ownGood !== null && category === ownGood) continue;
    const e = category === null ? undefined : human.valenceReferents?.bad?.[category];
    const learned = !!e && e.samples > 0 && e.mean > VALENCE.warnAbove;
    const mirrored = ownBad !== null && category === ownBad;
    if (!learned && !mirrored) continue;
    const source = { x: self.x + s.relativePosition.x, y: self.y + s.relativePosition.y };
    for (const place of Object.values(human.places)) if (place.kind === "food" && near(place.position, source)) place.strength = 0;
    remember(source, false);
  }
  // experimental.2: aversive places keep nearby food out of the forage targets even when it is in sight.
  let perceived = observation;
  if (mode !== "drop" && human.aversions) {
    human.aversions = human.aversions.filter(a => observation.tick - a.tick <= AVERSION.ticks);
    if (human.aversions.length && human.body.hunger < AVERSION.desperateAbove) {
      const aversive = (position: { x: number; y: number }) => human.aversions!.some(a => near(a, position));
      for (const [key, place] of Object.entries(human.places)) if (place.kind === "food" && aversive(place.position)) delete human.places[key];
      perceived = { ...observation, resources: observation.resources.filter(r => r.kind !== "food" || !aversive({ x: self.x + r.relativePosition.x, y: self.y + r.relativePosition.y })) };
    }
  }
  const result = decideWithSenderOptions(human, perceived, random, {
    stateCoupling: CONVENTION.stateCoupling, satiationCall: FOOD_CALL.utility,
    chooseSound: (h) => chooseValenceVoice(h),
    soundOrienting: listens ? (h, sounds, r) => selectSafeFood(h, sounds, r) : (h, sounds, r) => selectByEstimates(h, sounds, (h as ValenceState).valenceReferents?.good, r, "valence-food"),
    ...(disgustMode && (human.lastDisgust ?? 0) > 0 && (!onsetMode || observation.tick - (human.lastDisgustCall ?? -Infinity) >= DISGUST.refractory) ? { callUrge: VALENCE.badCall } : {}),
  });
  const next = result.human as ValenceState;
  if (disgustMode) next.lastDisgust = human.lastDisgust ?? 0;
  if (onsetMode && (human.lastDisgust ?? 0) > 0 && result.action.kind === "vocalize") next.lastDisgustCall = observation.tick;
  next.recentSounds = [...(human.recentSounds ?? [])];
  for (const s of observation.sounds) {
    const category = nearestHeardCategory(next, s);
    if (category === null) continue;
    next.recentSounds.push({ category, x: self.x + s.relativePosition.x, y: self.y + s.relativePosition.y, tick: observation.tick });
  }
  if (next.recentSounds.length > VALENCE.maxRecent) next.recentSounds = next.recentSounds.slice(-VALENCE.maxRecent);
  return result;
}
export const decideValenceAversion = (h: HumanState, o: Observation, r: RandomSource) => decideValence(h, o, r, "aversion");
export const decideValencePrivate = (h: HumanState, o: Observation, r: RandomSource) => decideValence(h, o, r, "private");
export const decideValenceDisgust = (h: HumanState, o: Observation, r: RandomSource) => decideValence(h, o, r, "disgust");
export const decideValenceDisgustPrivate = (h: HumanState, o: Observation, r: RandomSource) => decideValence(h, o, r, "disgust-private");
export const decideValenceOnset = (h: HumanState, o: Observation, r: RandomSource) => decideValence(h, o, r, "onset");
export const decideValenceOnsetPrivate = (h: HumanState, o: Observation, r: RandomSource) => decideValence(h, o, r, "onset-private");
