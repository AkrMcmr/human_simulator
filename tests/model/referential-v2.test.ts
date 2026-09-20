import test from "node:test";
import assert from "node:assert/strict";
import { protocol as v2, runSeedV2, checkValueV2, assessSeedsV2 } from "../../research/studies/referential-v2.ts";
import { protocol as v1, referentialConfig } from "../../research/studies/referential-v1.ts";
import { createHuman, decideWithOptions, predictedSafety } from "../../packages/human/src/index.ts";
import { applyWithIntake, decideFoodCallOnly, FOOD_CALL } from "../../packages/human/src/forager-listener.ts";
import { runExperiment } from "../../packages/simulation/src/index.ts";

test("referential-v2 keeps the v1 world except food size, uses fresh seeds, and gates latency", () => {
  const all = [v2.pilotSeeds, v2.developmentSeeds, v2.validationSeeds].flat();
  assert.equal(new Set(all).size, all.length);
  const v1all = [v1.pilotSeeds, v1.developmentSeeds, v1.validationSeeds].flat();
  assert.ok(all.every(s => !v1all.includes(s)));
  assert.ok(v2.resources.filter(r => r.kind === "food").every(r => r.amount === 1 && r.radius === 2));
  assert.deepEqual(v2.world, v1.world);
  assert.ok(v2.checks.some(c => c.id === "latency-benefit") && v2.checks.every(c => Number.isFinite(c.minimum)));
  const config = referentialConfig(v2.pilotSeeds[0], "human-0.2.0", true, v2);
  assert.equal(config.resources!.find(r => r.id === "food-nw")!.amount, 1);
});
test("the food call adds vocalize utility only right after eating and its apply records intake", () => {
  const human = createHuman("A", {}, { hunger: .5 });
  const observation = { tick: 0, selfPosition: { x: 10, y: 14 }, animals: [], resources: [], sounds: [] };
  const fed = applyWithIntake(human, { ambientCold: .1, foodIntake: .04, exertion: 0, resting: false, collision: 0 }) as ReturnType<typeof createHuman> & { lastIntake?: number };
  assert.equal(fed.lastIntake, .04);
  const withCall = decideWithOptions(fed, observation, () => 0.5, { outcomeBonus: predictedSafety, satiationCall: FOOD_CALL.utility });
  const vocal = withCall.trace.scores.find(s => s.action === "vocalize")!;
  assert.equal(vocal.terms.satiationCall, FOOD_CALL.utility);
  const notFed = applyWithIntake(human, { ambientCold: .1, foodIntake: 0, exertion: 0, resting: false, collision: 0 });
  const silent = decideWithOptions(notFed, observation, () => 0.5, { outcomeBonus: predictedSafety, satiationCall: FOOD_CALL.utility });
  assert.equal(silent.trace.scores.find(s => s.action === "vocalize")!.terms.satiationCall, 0);
  assert.deepEqual(decideFoodCallOnly(notFed, observation, () => 0.5).action, silent.action);
  const run = runExperiment({ ...referentialConfig(v2.pilotSeeds[1], "food-call-only-0.8.0-experimental.1", true, v2), horizon: 120 });
  assert.equal(run.frames.length, 121);
});
test("v2 measures are oriented and assessed against the v2 protocol", () => {
  const r = runSeedV2("human-0.2.0", v2.pilotSeeds[2]);
  const faster = structuredClone(r); faster.sound.meanFirstFoodTick -= 90;
  assert.ok(checkValueV2("latency-benefit", faster) - checkValueV2("latency-benefit", r) > 0.09);
  assert.ok(checkValueV2("latency-direction", faster) > checkValueV2("latency-direction", r));
  const a = assessSeedsV2("test", [r]);
  assert.equal(a.checks.filter(c => c.minimum !== null).length, v2.checks.length);
});
