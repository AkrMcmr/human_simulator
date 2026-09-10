import test from "node:test";
import assert from "node:assert/strict";
import { induceHistory, intervene, probe, freePhase, forcedRecovery, runSeed, checkValue, assessSeeds, protocol } from "../../research/studies/history-v1.ts";
import { resolveModel } from "../../packages/simulation/src/index.ts";

const model = resolveModel(protocol.model);
const used = [42, 43, 44, 45, 46, 47, 48, 49, 101, 102, 103, 104, 105, 106, 107, 108, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008];

test("history-v1 seeds are fresh and pilot, development, and validation are disjoint", () => {
  const groups = [protocol.pilotSeeds, protocol.developmentSeeds, protocol.validationSeeds];
  const all = groups.flat();
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.every(s => !used.includes(s)));
  assert.ok(protocol.checks.every(c => Number.isFinite(c.minimum)));
});
test("harm and safe histories differ only through experienced pain, and interventions act on peer memory alone", () => {
  const harm = induceHistory(model, protocol.pilotSeeds[0], "harm"), safe = induceHistory(model, protocol.pilotSeeds[0], "safe");
  assert.ok(harm.painEvents > 0 && safe.painEvents === 0);
  assert.ok(harm.state.peers.B.harmAlpha > safe.state.peers.B.harmAlpha);
  assert.equal(harm.state.peers.B.sightings, safe.state.peers.B.sightings);
  const erased = intervene(harm.state, "erase", safe.state);
  assert.deepEqual(erased.peers, {});
  assert.deepEqual(erased.body, harm.state.body);
  const swapped = intervene(harm.state, "swap", safe.state);
  assert.deepEqual(swapped.peers, safe.state.peers);
  assert.deepEqual(intervene(harm.state, "retain", safe.state).peers, harm.state.peers);
});
test("the probe standardizes body and freezes learning without mutating the subject", () => {
  const { state } = induceHistory(model, protocol.pilotSeeds[1], "harm");
  const before = structuredClone(state);
  const p = probe(model, state);
  assert.deepEqual(state, before);
  assert.ok(p.risk > 0 && Number.isFinite(p.margin));
  assert.deepEqual(probe(model, state), p);
  const hungry = probe(model, state, protocol.probe.highNeedBody);
  assert.equal(hungry.risk, p.risk, "risk does not depend on body; only utilities may");
});
test("phase two is reproducible and the free phase has two layouts with distinct proximity", () => {
  const { state } = induceHistory(model, protocol.pilotSeeds[2], "harm");
  const forced = forcedRecovery(model, protocol.pilotSeeds[2], state);
  assert.deepEqual(forcedRecovery(model, protocol.pilotSeeds[2], state), forced);
  assert.ok(forced.final.risk < probe(model, state).risk);
  const shared = freePhase(model, protocol.pilotSeeds[2], state, "shared"), separate = freePhase(model, protocol.pilotSeeds[2], state, "separate");
  assert.deepEqual(freePhase(model, protocol.pilotSeeds[2], state, "shared"), shared);
  assert.ok(shared.meanDistance < separate.meanDistance);
  assert.ok(shared.visibleFraction > 0 && separate.visibleFraction > 0);
});
test("check values are oriented toward the hypothesis and assessments summarize every seed", () => {
  const r = runSeed(protocol.model, protocol.pilotSeeds[3]);
  assert.deepEqual(runSeed(protocol.model, protocol.pilotSeeds[3]), r);
  assert.equal(r.subjects.length, 6);
  const swappedHarm = r.subjects.find(s => s.history === "harm" && s.intervention === "swap")!;
  const retainedSafe = r.subjects.find(s => s.history === "safe" && s.intervention === "retain")!;
  assert.equal(swappedHarm.probe.risk, retainedSafe.probe.risk, "swapping in the safe memory yields the safe subject's perception");
  assert.equal(checkValue("erase-removes", r), 0);
  assert.ok(checkValue("history-risk", r) > 0);
  const a = assessSeeds("test", [r]);
  assert.equal(a.checks.length, protocol.checks.length);
  assert.ok(a.checks.every(c => c.values.length === 1));
  assert.throws(() => checkValue("invented", r));
});
