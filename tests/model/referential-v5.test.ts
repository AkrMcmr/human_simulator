import test from "node:test";
import assert from "node:assert/strict";
import { protocol as v5 } from "../../research/studies/referential-v5.ts";
import { protocol as v4 } from "../../research/studies/referential-v4.ts";
import { protocol as v3 } from "../../research/studies/referential-v3.ts";
import { protocol as v2 } from "../../research/studies/referential-v2.ts";
import { protocol as v1, seedsFor, checkValue, runSeed } from "../../research/studies/referential-v1.ts";

test("referential-v5 keeps the v4 world, gates sound type on hunger, and uses fresh seeds", () => {
  assert.deepEqual(v5.world, v4.world); assert.deepEqual(v5.resources, v4.resources); assert.deepEqual(v5.agents, v4.agents); assert.equal(v5.horizon, v4.horizon);
  assert.deepEqual(v5.checks.map(c => c.id), ["arrival-benefit", "arrival-direction", "shape-dependence", "forage-benefit"]);
  assert.equal(v5.checks.find(c => c.id === "shape-dependence")!.minimum, 0.03);
  const all = [...seedsFor("development", v5, "1"), ...seedsFor("validation", v5, "1")];
  assert.equal(new Set(all).size, all.length);
  const earlier = [v1.pilotSeeds, v1.developmentSeeds, v1.validationSeeds, v2.pilotSeeds, seedsFor("development", v2, "1"), seedsFor("validation", v2, "1"), seedsFor("development", v2, "2"), seedsFor("validation", v2, "2"), seedsFor("development", v2, "3"), seedsFor("validation", v2, "3"), v3.pilotSeeds, seedsFor("development", v3, "1"), seedsFor("validation", v3, "1"), v4.pilotSeeds, seedsFor("development", v4, "1"), seedsFor("validation", v4, "1")].flat();
  assert.ok(all.every(s => !earlier.includes(s)));
  assert.equal(v5.pilotSeeds.length, 0);
});
test("hunger-based shape dependence is oriented so that worse hunger under scrambled shapes scores higher", () => {
  const r = runSeed("human-0.2.0", seedsFor("development", v3, "1")[0], v3);
  const worse = structuredClone(r); worse.scrambled.meanHunger += 0.1;
  assert.ok(checkValue("shape-dependence", worse, v5) > checkValue("shape-dependence", r, v5));
});
