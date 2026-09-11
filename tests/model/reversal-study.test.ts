import test from "node:test";
import assert from "node:assert/strict";
import { expose, probe, trajectory, gapTrajectory, runSeed, checkValue, assessSeeds, compareModels, runReversalPartition, protocol } from "../../research/studies/reversal-v1.ts";
import { resolveModel } from "../../packages/simulation/src/index.ts";

const model = resolveModel(protocol.model);
const used = [42, 43, 44, 45, 46, 47, 48, 49, 101, 102, 103, 104, 105, 106, 107, 108, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6101, 6102, 6103, 6104, 7001, 7002, 7003, 7004, 7005, 7006, 7007, 7008];

test("reversal-v1 seeds are fresh and disjoint across pilot, development, and validation", () => {
  const all = [protocol.pilotSeeds, protocol.developmentSeeds, protocol.validationSeeds].flat();
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.every(s => !used.includes(s)));
  assert.ok(protocol.checks.every(c => ["capability", "property"].includes(c.role) && ["none", "lower", "higher"].includes(c.preferred)));
});
test("exposure adds exactly one piece of close-range evidence per step and pain only in harmful blocks", () => {
  const start = model.create("A", {}, protocol.exposure.body);
  const safe = expose(model, protocol.pilotSeeds[0], "t/safe", start, 10, false, protocol.exposure.distance);
  assert.equal(safe.painEvents, 0);
  assert.ok(Math.abs(safe.state.peers.B.harmBeta - 1 - 10) < 0.2 && safe.state.peers.B.harmAlpha < 1.001);
  const harm = expose(model, protocol.pilotSeeds[0], "t/harm", start, 10, true, protocol.exposure.distance);
  assert.ok(harm.painEvents > 0);
  assert.ok(Math.abs(harm.state.peers.B.harmAlpha - 1 - harm.painEvents) < 0.2);
  const far = expose(model, protocol.pilotSeeds[0], "t/far", safe.state, 10, false, protocol.gap.farDistance);
  assert.ok(far.state.peers.B.harmBeta < safe.state.peers.B.harmBeta, "no close-range evidence at a distance; memory only decays");
  assert.deepEqual(expose(model, protocol.pilotSeeds[0], "t/safe", start, 10, false, protocol.exposure.distance), safe);
});
test("probes are pure, trajectories record every registered checkpoint, and gaps cover every length", () => {
  const start = model.create("A", {}, protocol.exposure.body);
  const before = structuredClone(start);
  probe(model, start);
  assert.deepEqual(start, before);
  const t = trajectory(model, protocol.pilotSeeds[1], 60, "safe-to-harm");
  assert.deepEqual(Object.keys(t.probes).map(Number).sort((a, b) => a - b), protocol.probeAt);
  assert.ok(t.probes["30"].risk > t.probes["0"].risk, "harm after a safe history raises risk");
  const g = gapTrajectory(model, protocol.pilotSeeds[1]);
  assert.deepEqual(g.map(x => x.gap), protocol.gap.lengths);
});
test("check values are oriented, reproducible, identical for 0.1.0, and comparisons honor preferred direction", () => {
  const r = runSeed(protocol.model, protocol.pilotSeeds[2]);
  assert.deepEqual(runSeed(protocol.model, protocol.pilotSeeds[2]), r);
  assert.ok(checkValue("lag-safe-to-harm", r) > 0 && checkValue("recovery-after-harm", r) > 0 && checkValue("gap-fading", r) > 0);
  assert.throws(() => checkValue("invented", r));
  const legacy = runSeed("human-0.1.0", protocol.pilotSeeds[2]);
  for (const c of protocol.checks) assert.equal(checkValue(c.id, legacy), checkValue(c.id, r), c.id + " should not depend on the predicted-safety term with a stationary peer");
  const a = assessSeeds("test", [r]);
  assert.equal(a.checks.length, protocol.checks.length);
  const base = runReversalPartition("pilot", protocol.model), same = runReversalPartition("pilot", "human-0.1.0");
  const cmp = compareModels(base, same);
  assert.ok(cmp.every(c => c.delta.mean === 0 && c.status === "within-tolerance"));
  const worse = structuredClone(same); worse.checks[0].values = worse.checks[0].values.map(v => v - 1); worse.checks[0].summary.mean -= 1;
  assert.equal(compareModels(base, worse)[0].status, "regressed");
  const better = structuredClone(same); const gi = protocol.checks.findIndex(c => c.id === "gap-fading"); better.checks[gi].values = better.checks[gi].values.map(v => v - 0.05); better.checks[gi].summary.mean -= 0.05;
  assert.ok(compareModels(base, better)[gi].delta.mean > 0, "lower gap-fading counts as positive when preferred is lower");
});
