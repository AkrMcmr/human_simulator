import test from "node:test";
import assert from "node:assert/strict";
import { createHuman } from "../../packages/human/src/index.ts";
import { chooseImitatedFoodVoice, chooseContrastiveVoice, decideConvention, decideConventionNoImitation, CONVENTION, applyWithIntake } from "../../packages/human/src/forager-listener.ts";
import { protocol as convention } from "../../research/studies/convention-v1.ts";
import { protocol as v5 } from "../../research/studies/referential-v5.ts";
import { protocol as caller } from "../../research/studies/caller-cost-v1.ts";
import { seedsFor, runCondition, assessSeeds, referentialConfig, type SeedResult } from "../../research/studies/referential-v1.ts";
import { HUMAN_MODELS, runExperiment } from "../../packages/simulation/src/index.ts";

type Speaker = ReturnType<typeof createHuman> & { lastIntake?: number; soundReferents?: Record<number, { mean: number; variance: number; samples: number }>; eatingHeard?: Record<number, number> };
function eater(): Speaker {
  const base = createHuman("A", { curiosity: 1 }, { hunger: .5, fatigue: 0, cold: 0 });
  const h = applyWithIntake(base, { ambientCold: .1, foodIntake: .04, exertion: 0, resting: false, collision: 0 }) as Speaker;
  h.heardSounds = [{ id: 1, shape: { openness: .2, resonance: .3 }, samples: 5 }, { id: 2, shape: { openness: .6, resonance: .4 }, samples: 5 }];
  return h;
}
test("while eating, the speaker reproduces the heard category its own experience ties to food, and stays silent about it otherwise", () => {
  const h = eater();
  assert.equal(chooseImitatedFoodVoice(h), null, "no experience yet: default voice");
  h.soundReferents = { 1: { mean: -.5, variance: .1, samples: 4 }, 2: { mean: .6, variance: .1, samples: 4 } };
  assert.deepEqual(chooseImitatedFoodVoice(h), { openness: .6, resonance: .4 }, "the category credited with food is imitated");
  const heardOnly = eater(); heardOnly.eatingHeard = { 1: 9, 2: 1 };
  assert.deepEqual(chooseImitatedFoodVoice(heardOnly), { openness: .2, resonance: .3 }, "without referent estimates, the category most heard while eating is imitated");
  const notEating = { ...h, lastIntake: 0 } as Speaker;
  assert.equal(chooseImitatedFoodVoice(notEating), null);
});
test("the convention speaker counts sounds heard while eating, has no innate eating voice, and both variants share the decision structure", () => {
  const h = eater();
  const observation = { tick: 0, selfPosition: { x: 10, y: 14 }, animals: [], resources: [], sounds: [{ visibleSourceId: null, shape: { openness: .21, resonance: .31 }, loudness: .5, relativePosition: { x: 5, y: 0 } }] };
  const next = decideConvention(h, observation, () => 0.5).human as Speaker;
  assert.deepEqual(next.eatingHeard, { 1: 1 });
  const idle = decideConvention({ ...h, lastIntake: 0 } as Speaker, observation, () => 0.5).human as Speaker;
  assert.equal(idle.eatingHeard, undefined, "sounds heard while not eating are not counted");
  assert.deepEqual(decideConvention(h, observation, () => 0.5).trace.scores.map(s => s.action), decideConventionNoImitation(h, observation, () => 0.5).trace.scores.map(s => s.action));
  assert.equal(CONVENTION.stateCoupling, 0.2);
  assert.equal(HUMAN_MODELS["convention-0.10.0-experimental.1"].apply, applyWithIntake);
});
test("convention-v1 keeps the v5 world, uses fresh seeds, and the food-voice measures are computed and oriented", () => {
  assert.deepEqual(convention.world, v5.world); assert.deepEqual(convention.resources, v5.resources);
  const all = [convention.pilotSeeds, seedsFor("development", convention, "1"), seedsFor("validation", convention, "1")].flat();
  assert.equal(new Set(all).size, all.length);
  const earlier = [caller.pilotSeeds, seedsFor("development", caller, "1"), seedsFor("validation", caller, "1"), ...["1", "2", "3"].map(r => [...seedsFor("development", v5, r), ...seedsFor("validation", v5, r)])].flat();
  assert.ok(all.every(s => !earlier.includes(s)) && all.every(s => s >= 38000));
  assert.deepEqual(convention.checks.map(c => c.id), ["convergence-gain", "arbitrariness", "shape-dependence", "arrival-benefit", "forage-benefit"]);
  const run = runExperiment({ ...referentialConfig(convention.pilotSeeds[0], "convention-0.10.0-experimental.1", true, convention), horizon: 60 });
  assert.equal(run.frames.length, 61);
  const short = { ...convention, horizon: 600 } as typeof convention;
  const sound = runCondition("eating-voice-referent-0.8.0-experimental.3", convention.pilotSeeds[0], "sound", short);
  assert.ok(sound.foodVoiceSpread >= 0 && sound.foodVoiceSpread <= 1.5 && Object.values(sound.foodVoices).every(v => v.count > 0));
  assert.ok(sound.foodVoiceDispersion >= 0 && sound.foodVoiceDispersion <= 1);
  const fake = (dispersion: number, c: { openness: number; resonance: number }): SeedResult => ({ seed: 1, model: "m", sound: { ...sound, foodVoiceDispersion: dispersion, foodVoiceCentroid: c }, muted: { ...sound, foodVoiceDispersion: 0.5 }, misdirected: sound, scrambled: sound });
  const a = assessSeeds("t", [fake(0.1, { openness: .2, resonance: .2 }), fake(0.1, { openness: .8, resonance: .8 })], convention);
  const gain = a.checks.find(c => c.id === "convergence-gain")!, arb = a.checks.find(c => c.id === "arbitrariness")!;
  assert.ok(Math.abs(gain.summary.mean - 0.4) < 1e-9, "closer voices under sound score higher");
  assert.ok(arb.summary.mean > 0.4, "centroids that differ across seeds score as arbitrary");
  const same = assessSeeds("t", [fake(0.1, { openness: .5, resonance: .5 }), fake(0.1, { openness: .5, resonance: .5 })], convention);
  assert.equal(same.checks.find(c => c.id === "arbitrariness")!.summary.mean, 0);
});
test("the contrastive speaker imitates the food voice while eating and avoids it otherwise", () => {
  const h = eater();
  h.soundReferents = { 2: { mean: .6, variance: .1, samples: 4 } };
  h.producedSounds = [{ id: 1, shape: { openness: .1, resonance: .9 }, samples: 3 }, { id: 2, shape: { openness: .62, resonance: .41 }, samples: 3 }];
  assert.deepEqual(chooseContrastiveVoice(h), { openness: .6, resonance: .4 }, "eating: the food voice");
  const quiet = { ...h, lastIntake: 0 } as Speaker;
  assert.deepEqual(chooseContrastiveVoice(quiet), { openness: .1, resonance: .9 }, "not eating: the own category farthest from the food voice");
  const onlyNear = { ...quiet, producedSounds: [{ id: 2, shape: { openness: .62, resonance: .41 }, samples: 3 }] } as Speaker;
  assert.equal(chooseContrastiveVoice(onlyNear), null, "no category far enough: default voice");
  assert.equal(chooseContrastiveVoice(eater()), null, "no food voice known: default voice");
  assert.equal(HUMAN_MODELS["convention-contrast-0.10.0-experimental.2"].apply, applyWithIntake);
  const r2 = [...seedsFor("development", convention, "2"), ...seedsFor("validation", convention, "2")];
  const r1 = [convention.pilotSeeds, seedsFor("development", convention, "1"), seedsFor("validation", convention, "1")].flat();
  assert.ok(r2.every(s => !r1.includes(s)) && new Set(r2).size === 16);
});
