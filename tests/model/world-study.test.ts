import test from "node:test";
import assert from "node:assert/strict";
import { conditions, runPair, measureWorld, assessRuns, difference, inScope, protocol } from "../../research/studies/world-v1.ts";
import { runExperiment } from "../../packages/simulation/src/index.ts";
import { pairExperiment, DEFAULT_SETTINGS } from "../../packages/experiments/src/index.ts";

test("the M1 protocol spans 8 pre-registered conditions with disjoint, previously unused seeds", () => {
  const list = conditions();
  assert.equal(list.length, 8);
  assert.equal(new Set(list.map(c => c.id)).size, 8);
  assert.ok(protocol.developmentSeeds.every(s => !protocol.validationSeeds.includes(s)));
  const used = [42, 43, 44, 45, 46, 47, 48, 49, 101, 102, 103, 104, 105, 106, 107, 108, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008];
  assert.ok([...protocol.developmentSeeds, ...protocol.validationSeeds].every(s => !used.includes(s)));
  assert.ok(protocol.checks.some(c => c.role === "primary") && protocol.checks.every(c => Number.isFinite(c.minimum)));
});
test("a paired run is reproducible and the ablated control matches the baseline exactly", () => {
  const condition = conditions().find(c => c.id === "shared/d6/low")!;
  const first = runPair(condition, protocol.developmentSeeds[0]);
  assert.deepEqual(runPair(condition, protocol.developmentSeeds[0]), first);
  assert.equal(first.ablationExact, true);
  assert.deepEqual(first.ablated, first.baseline);
  assert.equal(first.baseline.bonusActiveFraction, 0);
  assert.equal(first.baseline.ticks, protocol.horizon);
});
test("checks are oriented so that higher is better, scope filters conditions, and gates evaluate the registered thresholds", () => {
  const shared = conditions().find(c => c.id === "shared/d6/low")!;
  const separate = conditions().find(c => c.id === "separate/d6/low")!;
  const runs = [runPair(shared, 4001), runPair(separate, 4001)];
  const primary = protocol.checks.find(c => c.role === "primary")!;
  assert.ok(inScope(primary, runs[0]) && !inScope(primary, runs[1]));
  const harm = { ...runs[0], candidate: { ...runs[0].candidate, contactTicks: runs[0].baseline.contactTicks + 0.1 } };
  assert.ok(difference(primary, harm) < 0, "more contact must count as worse");
  const health = protocol.checks.find(c => c.id === "health-safety")!;
  const weaker = { ...runs[0], candidate: { ...runs[0].candidate, minimumHealth: runs[0].baseline.minimumHealth - 0.5 } };
  assert.ok(difference(health, weaker) < 0);
  const result = assessRuns("test", runs);
  assert.equal(result.checks.find(c => c.id === primary.id)!.samples, 1);
  assert.equal(result.checks.find(c => c.id === health.id)!.samples, 2);
  assert.deepEqual(result.perCondition.map(r => r.condition), ["shared/d6/low", "separate/d6/low"]);
});
test("metrics stay finite and reject empty histories", () => {
  const frames = runExperiment(pairExperiment({ ...structuredClone(DEFAULT_SETTINGS), horizon: 30 })).frames;
  const m = measureWorld(frames);
  for (const [key, value] of Object.entries(m)) if (key !== "actions") assert.ok(Number.isFinite(value), key);
  assert.equal(Object.values(m.actions).reduce((a, b) => a + b, 0), 60);
  assert.throws(() => measureWorld(frames.slice(0, 1)));
});
