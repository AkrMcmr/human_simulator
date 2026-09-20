import test from "node:test";
import assert from "node:assert/strict";
import { protocol as v2 } from "../../research/studies/convention-v2.ts";
import { protocol as v1 } from "../../research/studies/convention-v1.ts";
import { seedsFor, checkValue, runCondition, type SeedResult } from "../../research/studies/referential-v1.ts";

test("convention-v2 keeps the v1 world and thresholds, uses fresh seeds, and gates hunger over the final third", () => {
  assert.deepEqual(v2.world, v1.world); assert.deepEqual(v2.resources, v1.resources); assert.deepEqual(v2.checks, v1.checks);
  assert.equal((v2 as unknown as { hungerWindow: string }).hungerWindow, "late");
  const fresh = [...seedsFor("development", v2, "1"), ...seedsFor("validation", v2, "1")];
  const used = [v1.pilotSeeds, seedsFor("development", v1, "1"), seedsFor("validation", v1, "1"), seedsFor("development", v1, "2"), seedsFor("validation", v1, "2")].flat();
  assert.ok(fresh.every(s => !used.includes(s)) && new Set(fresh).size === 16 && fresh.every(s => s >= 42000));
  const short = { ...v2, horizon: 300 } as typeof v2;
  const r = runCondition("human-0.2.0", 42001, "sound", short);
  assert.ok(Number.isFinite(r.lateMeanHunger) && r.lateMeanHunger >= 0 && r.lateMeanHunger <= 1);
  const seed: SeedResult = { seed: 1, model: "m", sound: { ...r, meanHunger: 0.5, lateMeanHunger: 0.3 }, muted: { ...r, meanHunger: 0.5, lateMeanHunger: 0.4 }, misdirected: r, scrambled: { ...r, meanHunger: 0.5, lateMeanHunger: 0.45 } };
  assert.ok(Math.abs(checkValue("forage-benefit", seed, v2) - 0.1) < 1e-9, "v2 uses late hunger");
  assert.ok(Math.abs(checkValue("shape-dependence", seed, v2) - 0.15) < 1e-9);
  assert.equal(checkValue("forage-benefit", seed, v1), 0, "v1 still uses whole-run hunger");
});
