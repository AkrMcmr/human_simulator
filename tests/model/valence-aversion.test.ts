import test from "node:test";
import assert from "node:assert/strict";
import { createHuman } from "../../packages/human/src/index.ts";
import { applyWithIntake } from "../../packages/human/src/forager-listener.ts";
import { decideValence, decideValenceAversion, decideValencePrivate, AVERSION, VALENCE } from "../../packages/human/src/valence.ts";
import { protocol as valence2 } from "../../research/studies/valence-v2.ts";
import { protocol as valence3 } from "../../research/studies/valence-v3.ts";
import { protocol as valence } from "../../research/studies/valence-v1.ts";
import { seedsFor, referentialConfig } from "../../research/studies/referential-v1.ts";
import { HUMAN_MODELS, runExperiment } from "../../packages/simulation/src/index.ts";

type V = ReturnType<typeof createHuman> & { lastIntake?: number; lastPoison?: number; aversions?: { x: number; y: number; tick: number }[]; valenceReferents?: { good: Record<number, { mean: number; variance: number; samples: number }>; bad: Record<number, { mean: number; variance: number; samples: number }> } };
const effect = (foodIntake: number, poison = 0) => ({ ambientCold: .3, foodIntake, exertion: 0, resting: false, collision: 0, ...(poison ? { poison } : {}) });
const patch = { id: "f", kind: "food" as const, strength: 1, relativePosition: { x: 1, y: 0 } };
const at = (tick: number, resources = [patch]) => ({ tick, selfPosition: { x: 10, y: 14 }, animals: [], resources, sounds: [] });
const hungry = () => createHuman("A", {}, { hunger: .8, fatigue: 0, cold: 0 });

test("a poisoned meal makes the eater avoid the visible patch for AVERSION.ticks, while experimental.1 keeps eating it", () => {
  const poisoned = applyWithIntake(hungry(), effect(.04, .04)) as V;
  const drop = decideValence(poisoned, at(10), () => 0.5);
  assert.equal(drop.action.kind, "forage", "experimental.1: the visible patch is eaten again (memory is rewritten from sight)");
  const averse = decideValenceAversion(poisoned, at(10), () => 0.5);
  assert.notEqual(averse.action.kind, "forage", "experimental.2: the poisoned place is not a forage target even in sight");
  assert.ok((averse.human as V).aversions!.length >= 1 && (averse.human as V).aversions!.every(a => a.tick === 10));
  const later = { ...(averse.human as V), lastPoison: 0, lastIntake: 0 } as V;
  assert.notEqual(decideValenceAversion(later, at(10 + AVERSION.ticks), () => 0.5).action.kind, "forage", "still avoided at the edge of the window");
  assert.equal(decideValenceAversion(later, at(11 + AVERSION.ticks), () => 0.5).action.kind, "forage", "the aversion expires");
  const desperate = { ...later, body: { ...later.body, hunger: AVERSION.desperateAbove } } as V;
  assert.equal(decideValenceAversion(desperate, at(20), () => 0.5).action.kind, "forage", "starving overrides the aversion");
  const far = decideValenceAversion(later, at(20, [{ ...patch, relativePosition: { x: VALENCE.visitRadius + 1.5, y: 0 } }]), () => 0.5);
  assert.equal(far.action.kind, "forage", "food beyond the visit radius of the aversive place is still taken");
});
test("a heard bad-food voice makes the full variant avoid food near its source; the private variant ignores it", () => {
  const h = hungry() as V;
  h.heardSounds = [{ id: 1, shape: { openness: .7, resonance: .6 }, samples: 5 }];
  h.valenceReferents = { good: {}, bad: { 1: { mean: .8, variance: .1, samples: 4 } } };
  const bad = { visibleSourceId: null, shape: { openness: .7, resonance: .6 }, loudness: .8, relativePosition: { x: 2, y: 0 } };
  const observation = { ...at(5), sounds: [bad] };
  const full = decideValenceAversion(h, observation, () => 0.5);
  assert.notEqual(full.action.kind, "forage", "the patch next to the bad voice's source is not taken");
  assert.deepEqual((full.human as V).aversions!.map(a => [a.x, a.y]), [[12, 14]], "the source place is remembered as aversive");
  const priv = decideValencePrivate(h, observation, () => 0.5);
  assert.equal(priv.action.kind, "forage", "private: the heard bad voice does not change foraging");
  assert.equal((priv.human as V).aversions, undefined);
  const drop = decideValence(h, observation, () => 0.5);
  assert.equal(drop.action.kind, "forage", "experimental.1: dropping memory does not stop eating food in sight");
});
test("the aversion models are registered, valence-v3 seeds are fresh, and the world is valence-v2's", () => {
  assert.equal(HUMAN_MODELS["valence-aversion-0.12.0-experimental.2"].apply, applyWithIntake);
  assert.equal(HUMAN_MODELS["valence-private-0.12.0-experimental.2"].role, "control");
  assert.deepEqual(valence3.world, valence2.world);
  const used = [valence.pilotSeeds, seedsFor("development", valence, "1"), seedsFor("validation", valence, "1"), valence2.pilotSeeds, seedsFor("development", valence2, "1"), seedsFor("validation", valence2, "1")].flat();
  const v3 = [...seedsFor("development", valence3, "1"), ...seedsFor("validation", valence3, "1")];
  assert.equal(new Set([...used, ...v3]).size, used.length + v3.length);
  const run = runExperiment({ ...referentialConfig(v3[0], "valence-aversion-0.12.0-experimental.2", true, valence3), horizon: 200 });
  assert.equal(run.frames.length, 201);
});
