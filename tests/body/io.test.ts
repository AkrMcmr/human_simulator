import test from "node:test";
import assert from "node:assert/strict";
import type { BodySpec } from "../../packages/body-contracts/src/index.ts";
import { buildSkeleton } from "../../packages/body-morph/src/index.ts";
import { buildSurface } from "../../packages/body-surface/src/index.ts";
import { namedPose } from "../../packages/body-kinematics/src/index.ts";
import { BodyRuntime } from "../../packages/body-runtime/src/index.ts";
import { writeSpecFile, readSpecFile, writeSkeletonFile, readSkeletonFile, writeRunFile, readRunFile, exportGlb, inspectGlb, LIMITS } from "../../packages/body-io/src/index.ts";

const spec: BodySpec = { sex: "male", ageYears: 40, statureM: 1.8, massKg: 85, seed: 11 };

test("T1: spec and skeleton files round-trip and refuse wrong formats, versions and bounds", () => {
  assert.deepEqual(readSpecFile(writeSpecFile(spec)), spec);
  assert.throws(() => readSpecFile('{"format":"human-body/pose","version":"0.1.0"}'), /Expected format/);
  assert.throws(() => readSpecFile('{"format":"human-body/spec","version":"9.0.0","spec":{}}'), /version/);
  assert.throws(() => readSpecFile("x".repeat(LIMITS.fileBytes + 1)), /size limit/);
  const sk = buildSkeleton(spec);
  assert.deepEqual(readSkeletonFile(writeSkeletonFile(sk)), sk);
  const many = JSON.parse(writeSkeletonFile(sk)); many.skeleton.bones = Array.from({ length: LIMITS.bones + 1 }, (_, i) => ({ ...sk.bones[0], id: "b" + i }));
  assert.throws(() => readSkeletonFile(many), /Too many bones/);
  const orphan = JSON.parse(writeSkeletonFile(sk)); orphan.skeleton.bones[1].parent = "missing";
  assert.throws(() => readSkeletonFile(orphan), /Parent must precede/);
});
test("T1 / FR-REC-01: a run file is validated, bounded and replayed", () => {
  const rt = new BodyRuntime({ seed: 4 });
  rt.enqueue({ id: "c", domain: "morph", name: "create", params: { spec } }); rt.enqueue({ id: "k", domain: "runtime", name: "checkpoint", tick: 2, params: { label: "k" } }); rt.step(3);
  const text = writeRunFile(rt.exportRun());
  assert.equal(readRunFile(text).runtime.tick, 3);
  const bad = JSON.parse(text); bad.manifest.finalTick = -1;
  assert.throws(() => readRunFile(bad), /finalTick/);
});
test("FR-SURF-01 (placeholder) / glTF: the GLB is well formed, every vertex is fully weighted, and the skin covers all 55 bones", () => {
  const sk = buildSkeleton(spec), surface = buildSurface(sk);
  for (let i = 0; i < surface.vertexCount; i++) { let s = 0; for (let k = 0; k < 4; k++) s += surface.weights[i * 4 + k]; assert.ok(Math.abs(s - 1) < 1e-6); assert.ok(surface.joints[i * 4] < sk.bones.length); }
  for (let i = 0; i < surface.indices.length; i++) assert.ok(surface.indices[i] < surface.vertexCount);
  const glb = exportGlb(sk, surface, namedPose(sk, "a"), { test: true });
  const { json, binaryLength } = inspectGlb(glb);
  assert.equal(glb.byteLength % 4, 0); assert.ok(binaryLength > 0);
  const g = json as { asset: { version: string }; nodes: { name: string; rotation?: number[] }[]; skins: { joints: number[] }[]; accessors: { count: number; min?: number[]; max?: number[] }[]; bufferViews: { byteOffset: number }[]; meshes: unknown[] };
  assert.equal(g.asset.version, "2.0"); assert.equal(g.skins[0].joints.length, 55); assert.equal(g.nodes.length, 56); assert.equal(g.meshes.length, 1);
  assert.ok(g.nodes.find(n => n.name === "leftUpperArm")!.rotation, "the exported pose is written as node rotations");
  for (const v of g.bufferViews) assert.equal(v.byteOffset % 4, 0);
  assert.equal(g.accessors[0].count, surface.vertexCount); assert.ok(g.accessors[0].min && g.accessors[0].max);
  assert.ok(g.accessors[0].max![1] <= spec.statureM + 0.2 && g.accessors[0].min![1] >= -0.2, "the surface stays near the stature box");
  assert.deepEqual(inspectGlb(exportGlb(sk, surface)).json, inspectGlb(exportGlb(sk, surface)).json, "export is deterministic");
});
