import test from "node:test";
import assert from "node:assert/strict";
import { protocol as gen } from "../../research/studies/generations-v1.ts";
import { protocol as conv2 } from "../../research/studies/convention-v2.ts";
import { protocol as tv2 } from "../../research/studies/transmission-v2.ts";
import { seedsFor, runCondition, checkValue, LINEAGE_SPAN, ADOPTION_RADIUS, type SeedResult } from "../../research/studies/referential-v1.ts";

test("generations-v1 replaces every founder in turn, measures an early voice, uses fresh seeds, and orients lineage continuity", () => {
  assert.deepEqual(gen.world, conv2.world); assert.deepEqual(gen.resources, conv2.resources); assert.equal(gen.horizon, 3600);
  const x = gen as unknown as { newcomers: { id: string; tick: number }[]; earlyWindow: [number, number] };
  assert.deepEqual(x.newcomers.map(n => n.id), ["A", "B", "C", "D"]); assert.ok(x.newcomers.every(n => n.tick >= x.earlyWindow[1]) && x.newcomers.at(-1)!.tick <= gen.horizon * 2 / 3);
  assert.deepEqual(gen.checks.map(c => c.id), ["convergence-gain", "arbitrariness", "lineage-continuity", "shape-dependence", "forage-benefit"]);
  const all = [gen.pilotSeeds, seedsFor("development", gen, "1"), seedsFor("validation", gen, "1")].flat();
  const used = [tv2.pilotSeeds, seedsFor("development", tv2, "1"), seedsFor("validation", tv2, "1"), seedsFor("development", tv2, "2"), seedsFor("validation", tv2, "2")].flat();
  assert.ok(all.every(s => !used.includes(s)) && new Set(all).size === all.length && all.every(s => s >= 56000));
  // Short run: two replacements and an early window inside 120 ticks; the measures compute.
  const short = { ...gen, horizon: 120, newcomers: [{ id: "A", tick: 40 }, { id: "B", tick: 60 }], earlyWindow: [20, 40] } as unknown as typeof gen;
  const r = runCondition("eating-voice-referent-0.8.0-experimental.3", gen.pilotSeeds[0], "sound", short);
  assert.ok(Number.isFinite(r.earlyCalls) && (r.earlyVoiceCentroid === null || Number.isFinite(r.earlyVoiceCentroid.openness)));
  const near = { openness: .3, resonance: .3 };
  const seed: SeedResult = { seed: 1, model: "m", sound: { ...r, earlyVoiceCentroid: near, foodVoiceCentroid: { openness: .35, resonance: .3 }, foodVoiceDispersion: 0.05 }, muted: r, misdirected: r, scrambled: r };
  assert.ok(Math.abs(checkValue("lineage-continuity", seed, gen) - (LINEAGE_SPAN - 0.05)) < 1e-9, "a late voice near the early one scores near the span");
  assert.equal(checkValue("lineage-continuity", { ...seed, sound: { ...seed.sound, foodVoiceDispersion: ADOPTION_RADIUS + 0.01 } }, gen), 0, "no late convention: no continuity");
  assert.equal(checkValue("lineage-continuity", { ...seed, sound: { ...seed.sound, earlyVoiceCentroid: null } }, gen), 0);
  assert.equal(checkValue("lineage-continuity", { ...seed, sound: { ...seed.sound, foodVoiceCentroid: { openness: .9, resonance: .9 } } }, gen), 0, "a late voice far from the early one scores 0");
});
test("a single-newcomer protocol still works through the generalized replacement list", () => {
  const short = { ...tv2, horizon: 60, newcomer: { id: "D", tick: 30 } } as unknown as typeof tv2;
  const r = runCondition("human-0.2.0", 56101, "sound", short);
  assert.ok(Number.isFinite(r.newcomerLateHunger) && r.earlyVoiceCentroid === null && r.earlyCalls === 0);
});
