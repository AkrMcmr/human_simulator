import test from "node:test";
import assert from "node:assert/strict";
import type { BodySpec } from "../../packages/body-contracts/src/index.ts";
import { stableHash } from "../../packages/body-contracts/src/index.ts";
import { buildSkeleton, girthTargets } from "../../packages/body-morph/src/index.ts";
import { buildSurface, BASE_MESH } from "../../packages/body-surface/src/index.ts";
import { exportGlb, inspectGlb } from "../../packages/body-io/src/index.ts";

const specs: BodySpec[] = [
  { sex: "male", ageYears: 30, statureM: 1.75, massKg: 80, seed: 1 },
  { sex: "female", ageYears: 30, statureM: 1.62, massKg: 60, seed: 1 },
  { sex: "male", ageYears: 45, statureM: 1.92, massKg: 105, seed: 1 },
  { sex: "female", ageYears: 22, statureM: 1.52, massKg: 48, seed: 1 },
];

test("the base-mesh asset is the CC0 MakeHuman body with its provenance recorded", () => {
  assert.equal(BASE_MESH.format, "human-body/base-mesh");
  assert.match(BASE_MESH.source.license, /CC0/);
  assert.equal(BASE_MESH.vertexCount * 3, BASE_MESH.positions.length);
  assert.equal(BASE_MESH.triangleCount * 3, BASE_MESH.triangles.length);
  assert.ok(BASE_MESH.joints["l-shoulder"] && BASE_MESH.joints["pelvis"] && BASE_MESH.joints["head-2"]);
});
test("FR-MORPH-02: the fitted mesh is fully weighted, finite, deterministic, and spans the stature", () => {
  for (const spec of specs) {
    const sk = buildSkeleton(spec);
    const s = buildSurface(sk, { kind: "mesh", girths: girthTargets(spec) });
    assert.equal(s.vertexCount, BASE_MESH.vertexCount);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < s.vertexCount; i++) {
      let w = 0; for (let k = 0; k < 4; k++) w += s.weights[i * 4 + k];
      assert.ok(Math.abs(w - 1) < 1e-5);
      for (let k = 0; k < 3; k++) assert.ok(Number.isFinite(s.positions[i * 3 + k]));
      minY = Math.min(minY, s.positions[i * 3 + 1]); maxY = Math.max(maxY, s.positions[i * 3 + 1]);
    }
    assert.ok(Math.abs(maxY - spec.statureM) < 0.04 * spec.statureM, `${spec.sex} ${spec.statureM}: top of mesh at ${maxY}`);
    assert.ok(Math.abs(minY) < 0.04, `${spec.sex}: sole at ${minY}`);
    assert.equal(stableHash(Array.from(s.positions.subarray(0, 300))), stableHash(Array.from(buildSurface(sk, { kind: "mesh", girths: girthTargets(spec) }).positions.subarray(0, 300))));
  }
});
test("FR-MORPH-02: chest, waist and thigh girths match the regression targets within 3%, and trunk cross-sections match the measured depth/breadth aspect", () => {
  for (const spec of specs) {
    const s = buildSurface(buildSkeleton(spec), { kind: "mesh", girths: girthTargets(spec) });
    for (const key of ["chestCircumference", "waistCircumference", "thighCircumference"]) {
      const g = s.girths![key];
      assert.ok(Math.abs(g.measured / g.target - 1) <= 0.03, `${spec.sex} ${spec.statureM}m ${spec.massKg}kg ${key}: measured ${g.measured.toFixed(3)} target ${g.target.toFixed(3)}`);
    }
    for (const key of ["buttockCircumference", "waistCircumference", "chestCircumference"]) {
      const g = s.girths![key];
      assert.ok(g.aspect && g.aspectTarget && Math.abs(g.aspect / g.aspectTarget - 1) <= 0.05, `${spec.sex} ${key} depth/breadth aspect ${g.aspect} vs target ${g.aspectTarget}`);
    }
    for (const key of ["buttockCircumference", "calfCircumference", "bicepsCircumference", "headCircumference", "neckCircumference"]) {
      const g = s.girths![key];
      assert.ok(Math.abs(g.measured / g.target - 1) <= 0.08, `${spec.sex} ${key} (reported band 8%): measured ${g.measured.toFixed(3)} target ${g.target.toFixed(3)}`);
    }
  }
});
test("the fitted mesh exports as a skinned GLB bound in the base-mesh pose", () => {
  const spec = specs[0]; const sk = buildSkeleton(spec);
  const s = buildSurface(sk, { kind: "mesh", girths: girthTargets(spec) });
  const { json } = inspectGlb(exportGlb(sk, s));
  const g = json as { nodes: { name: string; rotation?: number[] }[]; meshes: { name: string }[]; accessors: { count: number }[]; skins: { inverseBindMatrices: number }[] };
  assert.equal(g.meshes[0].name, "mesh");
  assert.ok(g.nodes.find(n => n.name === "leftUpperArm")!.rotation, "the bind pose abducts the arms like the base mesh");
  assert.equal(g.accessors[g.skins[0].inverseBindMatrices].count, 55);
});
