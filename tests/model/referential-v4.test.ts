import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { protocol as v4 } from "../../research/studies/referential-v4.ts";
import { protocol as v3 } from "../../research/studies/referential-v3.ts";
import { protocol as v2 } from "../../research/studies/referential-v2.ts";
import { protocol as v1, referentialConfig, runCondition, seedsFor } from "../../research/studies/referential-v1.ts";
import { createSimulation } from "../../packages/simulation/src/index.ts";

test("generalizing the arrival and closeness measures to N individuals leaves the two-person v3 values unchanged", () => {
  const saved = JSON.parse(readFileSync(new URL("../../research/results/referential-v3-pilot.json", import.meta.url), "utf8"));
  const partition = saved.partitions.find((p: { model: string }) => p.model === "eating-voice-blind-0.8.0-experimental.2");
  const before = partition.results.find((r: { seed: number }) => r.seed === v3.pilotSeeds[1]).sound;
  const now = runCondition("eating-voice-blind-0.8.0-experimental.2", v3.pilotSeeds[1], "sound", v3);
  assert.ok(Math.abs(now.arrivalDelay - before.arrivalDelay) < 1e-12 && Math.abs(now.closeFraction - before.closeFraction) < 1e-12 && now.patchesShared === before.patchesShared);
});
test("referential-v4 seeds are fresh and four individuals run in the spawning world with per-patch arrival delays", () => {
  const all = [v4.pilotSeeds, seedsFor("development", v4, "1"), seedsFor("validation", v4, "1")].flat();
  assert.equal(new Set(all).size, all.length);
  const earlier = [v1.pilotSeeds, v1.developmentSeeds, v1.validationSeeds, v2.pilotSeeds, seedsFor("development", v2, "1"), seedsFor("validation", v2, "1"), seedsFor("development", v2, "2"), seedsFor("validation", v2, "2"), seedsFor("development", v2, "3"), seedsFor("validation", v2, "3"), v3.pilotSeeds, seedsFor("development", v3, "1"), seedsFor("validation", v3, "1")].flat();
  assert.ok(all.every(s => !earlier.includes(s)));
  const state = createSimulation(referentialConfig(v4.pilotSeeds[0], "human-0.2.0", true, v4));
  assert.equal(state.humans.length, 4);
  assert.equal(state.world.parameters.foodSpawn?.amount, 4);
  const sound = runCondition("food-call-referent-0.8.0-experimental.3", v4.pilotSeeds[0], "sound", v4);
  assert.deepEqual(runCondition("food-call-referent-0.8.0-experimental.3", v4.pilotSeeds[0], "sound", v4), sound);
  assert.equal(Object.keys(sound.firstFoodTick).length, 4);
  assert.ok(sound.arrivalDelay >= 0 && sound.arrivalDelay <= 1 && sound.closeFraction >= 0 && sound.closeFraction <= 1);
  assert.deepEqual(v4.checks.map(c => c.id), ["arrival-benefit", "arrival-direction", "arrival-shape", "forage-benefit"], "contact is reported, not gated, with four foragers");
});
