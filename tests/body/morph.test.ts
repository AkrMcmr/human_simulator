import test from "node:test";
import assert from "node:assert/strict";
import { stableHash, type BodySpec } from "../../packages/body-contracts/src/index.ts";
import { buildSkeleton, skeletonSummary, resolveLengths } from "../../packages/body-morph/src/index.ts";

const male: BodySpec = { sex: "male", ageYears: 30, statureM: 1.75, massKg: 80, seed: 1 };
const female: BodySpec = { sex: "female", ageYears: 30, statureM: 1.62, massKg: 60, seed: 1 };

test("FR-MORPH-06: the same spec yields the same skeleton; a different spec yields a different one", () => {
  assert.equal(stableHash(buildSkeleton(male)), stableHash(buildSkeleton({ ...male })));
  assert.notEqual(stableHash(buildSkeleton(male)), stableHash(buildSkeleton({ ...male, massKg: 81 })));
  assert.notEqual(stableHash(buildSkeleton(male)), stableHash(buildSkeleton(female)));
});
test("FR-MORPH-01 / FR-DYN-01: stature is reproduced, mass sums to the spec, and the standing centre of mass is at a plausible height", () => {
  for (const spec of [male, female]) {
    const s = skeletonSummary(buildSkeleton(spec));
    assert.ok(Math.abs(s.generatedStatureM - spec.statureM) < 1e-6, `${spec.sex} stature ${s.generatedStatureM}`);
    assert.ok(Math.abs(s.totalMassKg / spec.massKg - 1) < 0.005, `${spec.sex} mass ${s.totalMassKg}`);
    assert.ok(s.comHeightFraction > 0.52 && s.comHeightFraction < 0.6, `${spec.sex} com fraction ${s.comHeightFraction}`);
  }
});
test("T2: segment-to-stature ratios stay inside broad anthropometric bands across the supported range", () => {
  for (const sex of ["male", "female"] as const) for (const statureM of [1.5, 1.65, 1.8, 1.95]) for (const massKg of [50, 70, 95]) {
    const L = resolveLengths({ sex, ageYears: 30, statureM, massKg, seed: 1 });
    const ratio = (k: string) => L[k] / statureM;
    assert.ok(ratio("thigh") > 0.19 && ratio("thigh") < 0.30, `thigh ${ratio("thigh")}`);
    assert.ok(ratio("shank") > 0.20 && ratio("shank") < 0.30, `shank ${ratio("shank")}`);
    assert.ok(ratio("upperArm") > 0.15 && ratio("upperArm") < 0.22, `upperArm ${ratio("upperArm")}`);
    assert.ok(ratio("forearm") > 0.12 && ratio("forearm") < 0.18, `forearm ${ratio("forearm")}`);
    assert.ok(ratio("hand") > 0.09 && ratio("hand") < 0.13, `hand ${ratio("hand")}`);
    assert.ok(ratio("trunk") > 0.30 && ratio("trunk") < 0.40, `trunk (cervicale to trochanterion) ${ratio("trunk")}`);
  }
});
test("proportion z-values move the named segments monotonically and keep stature fixed", () => {
  const base = resolveLengths(male), longLegs = resolveLengths({ ...male, proportions: { legLength: 2 } }), shortLegs = resolveLengths({ ...male, proportions: { legLength: -2 } });
  assert.ok(shortLegs.thigh < base.thigh && base.thigh < longLegs.thigh);
  assert.ok(shortLegs.trunk > base.trunk && base.trunk > longLegs.trunk);
  for (const L of [longLegs, shortLegs]) assert.ok(Math.abs(L.footHeight + L.shank + L.thigh + L.trunk + L.headNeck - male.statureM) < 1e-9);
  const wide = resolveLengths({ ...male, proportions: { shoulderBreadth: 1.5, hipBreadth: -1 } });
  assert.ok(wide.shoulderBreadth > base.shoulderBreadth && wide.hipBreadth < base.hipBreadth);
  assert.ok(Math.abs(skeletonSummary(buildSkeleton({ ...male, proportions: { legLength: 2 } })).generatedStatureM - male.statureM) < 1e-6);
});
test("BR-06: minors and out-of-range bodies are refused at generation", () => {
  assert.throws(() => buildSkeleton({ ...male, ageYears: 12 }), /ageYears/);
  assert.throws(() => buildSkeleton({ ...male, massKg: 10 }), /massKg/);
});
