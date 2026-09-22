import test from "node:test";
import assert from "node:assert/strict";
import { advanceWorld, createWorld, WORLD_VERSION } from "../../packages/world/src/index.ts";
import { protocol as v3 } from "../../research/studies/referential-v3.ts";
import { protocol as v2 } from "../../research/studies/referential-v2.ts";
import { protocol as v1, referentialConfig, runCondition, runSeed, checkValue, seedsFor, MEASURES } from "../../research/studies/referential-v1.ts";
import { createSimulation, runExperiment } from "../../packages/simulation/src/index.ts";

test("world 0.3.0: without foodSpawn the 0.2.0 food economy is unchanged; with it a spent patch stays visible and the next patch appears in sequence", () => {
  assert.equal(WORLD_VERSION, "0.7.0");
  const animals = [{ id: "A", position: { x: 7, y: 5 } }, { id: "B", position: { x: 30, y: 20 } }];
  const legacy = createWorld(animals, {}, [{ id: "f", kind: "food", position: { x: 7, y: 5 }, amount: 0.05, radius: 2 }]);
  let w = legacy;
  for (let t = 0; t < 3; t++) w = advanceWorld(w, { A: { kind: "forage" } }, t).world;
  assert.equal(w.resources.length, 1);
  // 0.05 -> 0.013 -> 0.003 -> 0.003: regrowth stays 0.003 and nothing is spent.
  assert.ok(Math.abs(w.resources[0].amount - 0.003) < 1e-9 && w.resources[0].spent === undefined, "regrowth stays 0.003 and nothing is spent");
  const spawning = createWorld(animals, { foodRegeneration: 0, foodSpawn: { amount: 4, radius: 2, depletedBelow: 0.01, positions: [{ x: 20, y: 3 }, { x: 5, y: 22 }] } }, [{ id: "f", kind: "food", position: { x: 7, y: 5 }, amount: 0.05, radius: 2 }]);
  const step1 = advanceWorld(spawning, { A: { kind: "forage" } }, 0);
  assert.equal(step1.world.resources.length, 1, "0.05 - 0.04 = 0.01 is not yet below the threshold");
  const step2 = advanceWorld(step1.world, { A: { kind: "forage" } }, 1);
  const [spent, fresh] = step2.world.resources;
  assert.ok(spent.spent === true && spent.amount === 0, "the emptied patch is marked spent and stays in the world");
  assert.deepEqual([fresh.id, fresh.position, fresh.amount, fresh.radius], ["food-spawn-1", { x: 20, y: 3 }, 4, 2]);
  assert.equal(step2.world.spawned, 1);
  assert.ok(step2.events.some(e => e.kind === "spawn" && e.actorId === "food-spawn-1" && e.value === 4));
  const step3 = advanceWorld(step2.world, { A: { kind: "forage" } }, 2);
  assert.equal(step3.world.resources.length, 2, "a spent patch never regrows or respawns again");
  assert.equal(step3.effects.A.foodIntake, 0);
});
test("referential-v3 seeds are fresh, the config builds the spawning world, and runs are reproducible with recurring discoveries", () => {
  const all = [v3.pilotSeeds, seedsFor("development", v3, "1"), seedsFor("validation", v3, "1")].flat();
  assert.equal(new Set(all).size, all.length);
  const earlier = [v1.pilotSeeds, v1.developmentSeeds, v1.validationSeeds, v2.pilotSeeds, seedsFor("development", v2, "1"), seedsFor("validation", v2, "1"), seedsFor("development", v2, "2"), seedsFor("validation", v2, "2"), seedsFor("development", v2, "3"), seedsFor("validation", v2, "3")].flat();
  assert.ok(all.every(s => !earlier.includes(s)));
  const config = referentialConfig(v3.pilotSeeds[0], "human-0.2.0", true, v3);
  const state = createSimulation(config);
  assert.equal(state.world.parameters.foodRegeneration, 0);
  assert.equal(state.world.parameters.foodSpawn?.positions.length, 12);
  assert.equal(state.world.resources.filter(r => r.kind === "food").length, 1);
  const run = runExperiment({ ...config, horizon: 50 });
  assert.equal(run.frames.length, 51);
  const sound = runCondition("eating-voice-blind-0.8.0-experimental.2", v3.pilotSeeds[0], "sound", v3);
  assert.deepEqual(runCondition("eating-voice-blind-0.8.0-experimental.2", v3.pilotSeeds[0], "sound", v3), sound);
  assert.ok(sound.spawns >= 1 && sound.patchesFound >= 1 && sound.arrivalDelay >= 0 && sound.arrivalDelay <= 1);
});
test("arrival measures are oriented so that a shorter second arrival under sound scores higher, and v3 gates on them", () => {
  const r = runSeed("human-0.2.0", v3.pilotSeeds[1], v3);
  for (const id of MEASURES) assert.ok(Number.isFinite(checkValue(id, r, v3)), id);
  const better = structuredClone(r); better.sound.arrivalDelay = Math.max(0, better.sound.arrivalDelay - 0.2);
  assert.ok(checkValue("arrival-benefit", better, v3) > checkValue("arrival-benefit", r, v3));
  assert.ok(checkValue("arrival-direction", better, v3) > checkValue("arrival-direction", r, v3));
  assert.ok(checkValue("arrival-shape", better, v3) > checkValue("arrival-shape", r, v3));
  assert.deepEqual(v3.checks.map(c => c.id), ["arrival-benefit", "arrival-direction", "arrival-shape", "forage-benefit", "contact-side-effect"]);
});
