import test from "node:test";
import assert from "node:assert/strict";
import { protocol as tv1 } from "../../research/studies/transmission-v1.ts";
import { protocol as conv2 } from "../../research/studies/convention-v2.ts";
import { protocol as lex2 } from "../../research/studies/lexicon-v2.ts";
import { seedsFor, runCondition, checkValue, type SeedResult } from "../../research/studies/referential-v1.ts";

test("transmission-v1 keeps the convention-v2 world, replaces D at tick 1500, uses fresh seeds, and its measures are oriented", () => {
  assert.deepEqual(tv1.world, conv2.world); assert.deepEqual(tv1.resources, conv2.resources); assert.deepEqual(tv1.agents, conv2.agents);
  assert.deepEqual((tv1 as unknown as { newcomer: { id: string; tick: number } }).newcomer, { id: "D", tick: 1500 });
  assert.deepEqual(tv1.checks.map(c => c.id), ["convergence-gain", "arbitrariness", "adoption-gain", "newcomer-benefit", "newcomer-shape"]);
  const all = [tv1.pilotSeeds, seedsFor("development", tv1, "1"), seedsFor("validation", tv1, "1")].flat();
  const used = [lex2.pilotSeeds, seedsFor("development", lex2, "1"), seedsFor("validation", lex2, "1")].flat();
  assert.ok(all.every(s => !used.includes(s)) && new Set(all).size === all.length && all.every(s => s >= 50000));
  // A short run with the newcomer at tick 30: the replaced individual restarts naive (no heard categories) while the others keep theirs.
  const short = { ...tv1, horizon: 60, newcomer: { id: "D", tick: 30 } } as unknown as typeof tv1;
  const r = runCondition("eating-voice-referent-0.8.0-experimental.3", tv1.pilotSeeds[0], "sound", short);
  assert.ok(Number.isFinite(r.newcomerDistance) && Number.isFinite(r.newcomerLateHunger) && r.newcomerDistance >= 0 && r.newcomerDistance <= 1.5);
  const seed: SeedResult = { seed: 1, model: "m", sound: { ...r, newcomerDistance: 0.1, newcomerLateHunger: 0.3 }, muted: { ...r, newcomerDistance: 0.5, newcomerLateHunger: 0.4 }, misdirected: r, scrambled: { ...r, newcomerLateHunger: 0.45 } };
  assert.ok(Math.abs(checkValue("adoption-gain", seed, tv1) - 0.4) < 1e-9, "a newcomer voice nearer the incumbents under sound scores higher");
  assert.ok(Math.abs(checkValue("newcomer-benefit", seed, tv1) - 0.1) < 1e-9 && Math.abs(checkValue("newcomer-shape", seed, tv1) - 0.15) < 1e-9);
});
test("without a newcomer the transmission measures are inert and earlier protocols are unchanged", () => {
  const short = { ...conv2, horizon: 300 } as typeof conv2;
  const r = runCondition("human-0.2.0", 50101, "sound", short);
  assert.equal(r.newcomerDistance, 1); assert.equal(r.newcomerLateHunger, 0);
});
