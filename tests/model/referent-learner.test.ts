import test from "node:test";
import assert from "node:assert/strict";
import { createHuman } from "../../packages/human/src/index.ts";
import { selectByReferent, decideReferentLearner, decideEatingReferent, decideFoodCallReferent, REFERENT, applyWithIntake } from "../../packages/human/src/forager-listener.ts";
import { protocol as v2 } from "../../research/studies/referential-v2.ts";
import { referentialConfig, seedsFor } from "../../research/studies/referential-v1.ts";
import { runExperiment, HUMAN_MODELS } from "../../packages/simulation/src/index.ts";

type Learner = ReturnType<typeof createHuman> & { soundReferents?: Record<number, { mean: number; variance: number; samples: number }>; recentSounds?: { category: number; x: number; y: number; tick: number }[] };
function learner(hunger = 0.7): Learner {
  const h = createHuman("A", {}, { hunger }) as Learner;
  h.heardSounds = [{ id: 1, shape: { openness: .2, resonance: .2 }, samples: 5 }, { id: 2, shape: { openness: .8, resonance: .8 }, samples: 5 }];
  return h;
}
const low = { visibleSourceId: null, shape: { openness: .2, resonance: .2 }, loudness: .5, relativePosition: { x: 5, y: 0 } };
const high = { visibleSourceId: null, shape: { openness: .8, resonance: .8 }, loudness: .9, relativePosition: { x: -5, y: 0 } };

test("the referent selector follows categories whose source places held food, and unknown categories only by chance", () => {
  const h = learner();
  assert.equal(selectByReferent(h, [low, high], () => 0.9), null, "unknown: declined above the follow rate");
  assert.equal(selectByReferent(h, [low, high], () => 0.1), high, "unknown: the loudest is followed below the follow rate");
  const known = learner(); known.soundReferents = { 1: { mean: .6, variance: .1, samples: 3 }, 2: { mean: -.8, variance: .1, samples: 3 } };
  assert.equal(selectByReferent(known, [low, high], () => 0.9), low, "the category credited with food wins even when quieter");
  const bad = learner(); bad.soundReferents = { 2: { mean: -.8, variance: .1, samples: 3 } };
  assert.equal(selectByReferent(bad, [high], () => 0.9), null, "a debited category is not followed");
  assert.equal(selectByReferent(bad, [high], () => 0.05), high, "unless exploring");
});
test("visiting a remembered sound source credits its category when food is seen there and debits it otherwise", () => {
  const h = learner();
  const heard = decideReferentLearner(h, { tick: 0, selfPosition: { x: 10, y: 14 }, animals: [], resources: [], sounds: [low, high] }, () => 0.5).human as Learner;
  assert.deepEqual(heard.recentSounds!.map(m => [m.category, m.x, m.y, m.tick]), [[1, 15, 14, 0], [2, 5, 14, 0]], "each heard sound is remembered with its absolute source place");
  // Walk to the low sound's place: food visible within the visit radius.
  const atLowWithFood = decideReferentLearner(heard, { tick: 20, selfPosition: { x: 15, y: 14 }, animals: [], resources: [{ id: "f", kind: "food", strength: 1, relativePosition: { x: 1, y: 0 } }], sounds: [] }, () => 0.5).human as Learner;
  assert.ok(atLowWithFood.soundReferents![1].samples === 1 && atLowWithFood.soundReferents![1].mean > 0, "food at the source credits the category");
  assert.equal(atLowWithFood.soundReferents![2], undefined, "the unvisited category is untouched");
  assert.deepEqual(atLowWithFood.recentSounds!.map(m => m.category), [2], "a resolved memory is dropped");
  // Walk to the high sound's place with nothing there.
  const atHighEmpty = decideReferentLearner(atLowWithFood, { tick: 40, selfPosition: { x: 5, y: 14 }, animals: [], resources: [], sounds: [] }, () => 0.5).human as Learner;
  assert.ok(atHighEmpty.soundReferents![2].samples === 1 && atHighEmpty.soundReferents![2].mean < 0, "no food at the source debits the category");
  assert.equal(atHighEmpty.recentSounds!.length, 0);
  // Memories expire without a visit.
  const stale = decideReferentLearner(heard, { tick: REFERENT.memoryTicks + 1, selfPosition: { x: 30, y: 30 }, animals: [], resources: [], sounds: [] }, () => 0.5).human as Learner;
  assert.equal(stale.recentSounds!.length, 0);
  assert.equal(stale.soundReferents, undefined, "expiry teaches nothing");
});
test("the referent memory is bounded and the eating/food-call variants share the decision structure", () => {
  let h: Learner = learner();
  for (let tick = 0; tick < REFERENT.maxRecent + 5; tick++) h = decideReferentLearner(h, { tick, selfPosition: { x: 10 + tick * 0.01, y: 14 }, animals: [], resources: [], sounds: [{ ...low, relativePosition: { x: 20, y: tick } }] }, () => 0.5).human as Learner;
  assert.equal(h.recentSounds!.length, REFERENT.maxRecent);
  const base = createHuman("A", { curiosity: 1 }, { hunger: .5, fatigue: 0, cold: 0 });
  const fed = applyWithIntake(base, { ambientCold: .1, foodIntake: .04, exertion: 0, resting: false, collision: 0 });
  const observation = { tick: 0, selfPosition: { x: 10, y: 14 }, animals: [], resources: [], sounds: [] };
  assert.deepEqual(decideEatingReferent(fed, observation, () => 0.5).trace.scores.map(s => s.action), decideFoodCallReferent(fed, observation, () => 0.5).trace.scores.map(s => s.action));
  assert.equal(HUMAN_MODELS["eating-voice-referent-0.8.0-experimental.3"].apply, applyWithIntake);
  assert.equal(HUMAN_MODELS["food-call-referent-0.8.0-experimental.3"].apply, applyWithIntake);
});
test("referential-v2 round 3 seeds are fresh and the referent candidates run in the referential world", () => {
  const earlier = [v2.pilotSeeds, seedsFor("development", v2, "1"), seedsFor("validation", v2, "1"), seedsFor("development", v2, "2"), seedsFor("validation", v2, "2")].flat();
  const r3 = [...seedsFor("development", v2, "3"), ...seedsFor("validation", v2, "3")];
  assert.equal(new Set([...earlier, ...r3]).size, earlier.length + r3.length);
  const run = runExperiment({ ...referentialConfig(r3[0], "eating-voice-referent-0.8.0-experimental.3", true, v2), horizon: 120 });
  assert.equal(run.frames.length, 121);
  const last = run.state.humans as Learner[];
  assert.ok(last.every(h => Array.isArray(h.recentSounds)), "the referent memory is part of the saved human state");
});
