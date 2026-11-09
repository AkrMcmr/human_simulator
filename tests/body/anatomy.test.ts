import test from "node:test";
import assert from "node:assert/strict";
import { SKELETON_TEMPLATE, VRM_REQUIRED_BONES, SEGMENT_TABLES, BONE_SEGMENTS, TRUNK_ROW_SPANS, ROM_DEGREES, predictSegmentLengths, REGRESSION_KEYS, POPULATION, regressionFit } from "../../packages/body-anatomy/src/index.ts";

test("T2: the rig template is the 55-bone VRM humanoid set with unique ids and parents before children", () => {
  assert.equal(SKELETON_TEMPLATE.length, 55);
  const seen = new Set<string>();
  for (const b of SKELETON_TEMPLATE) {
    assert.ok(!seen.has(b.id), "duplicate " + b.id);
    if (b.parent !== null) assert.ok(seen.has(b.parent), `${b.id} before its parent ${b.parent}`);
    seen.add(b.id);
  }
  const cores = SKELETON_TEMPLATE.map(b => b.core).filter((c): c is string => c !== null);
  assert.equal(new Set(cores).size, cores.length);
  for (const required of VRM_REQUIRED_BONES) assert.ok(cores.includes(required), "missing VRM bone " + required);
});
test("T2: every degree of freedom has min <= max within ±π, and mirrored limits are mirrored", () => {
  const byId = new Map(SKELETON_TEMPLATE.map(b => [b.id, b]));
  for (const b of SKELETON_TEMPLATE) for (const d of b.joint === "fixed" ? [] : b.dofs) {
    assert.ok(d.min <= d.max, `${b.id}.${d.axis}`);
    assert.ok(d.min >= -Math.PI - 1e-9 && d.max <= Math.PI + 1e-9, `${b.id}.${d.axis}`);
  }
  for (const b of SKELETON_TEMPLATE) if (b.side === "left") {
    const r = byId.get(b.id.replace("left", "right"))!;
    for (const d of b.dofs) {
      const rd = r.dofs.find(x => x.axis === d.axis)!;
      if (d.axis === "x") assert.deepEqual([rd.min, rd.max], [d.min, d.max]);
      else assert.deepEqual([rd.min, rd.max], [-d.max + 0, -d.min + 0], `${b.id}.${d.axis}`);
    }
  }
  assert.ok(ROM_DEGREES.hip.flexion.degrees > 0 && ROM_DEGREES.knee.flexion.basis === "R");
});
test("T2: segment mass fractions sum to the whole body for each sex, and every mapped row exists", () => {
  for (const sex of ["male", "female"] as const) {
    let total = 0;
    for (const [bone, map] of Object.entries(BONE_SEGMENTS)) { const row = SEGMENT_TABLES[sex][map.row]; assert.ok(row, `${sex} ${bone} -> ${map.row}`); total += row.massFraction * map.share; }
    for (const [row, [a, b]] of Object.entries(TRUNK_ROW_SPANS[sex])) { assert.ok(a < b && a >= 0 && b <= 1, `${sex} ${row} span`); total += SEGMENT_TABLES[sex][row].massFraction; }
    assert.ok(Math.abs(total - 1) < 0.002, `${sex} total ${total}`);
  }
});
test("T2: the anthropometric regression predicts positive lengths at the reference medians and covers all keys", () => {
  for (const sex of ["male", "female"] as const) {
    const pop = POPULATION[sex];
    const L = predictSegmentLengths(sex, pop.statureM.p50, pop.massKg.p50);
    for (const key of REGRESSION_KEYS) { assert.ok(L[key] > 0, `${sex} ${key}`); assert.ok(regressionFit(sex, key).n > 500); }
    const chain = L.footHeight + L.shank + L.thigh + L.trunk + L.headNeck;
    assert.ok(Math.abs(chain / pop.statureM.p50 - 1) < 0.03, `${sex} vertical chain ${chain} vs stature ${pop.statureM.p50}`);
  }
});
