import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, stableHash, validateSpec, keyedRandom, quatFromAxisAngle, rotate3, quatMultiply } from "../../packages/body-contracts/src/index.ts";
import { keyedRandom as parentKeyedRandom } from "../../packages/simulation/src/random.ts";

test("T1: canonical JSON ignores key order and undefined, and the hash is stable", () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 3, c: undefined }] }), '{"a":[2,{"d":3}],"b":1}');
  assert.equal(stableHash({ b: 1, a: 2 }), stableHash({ a: 2, b: 1 }));
  assert.notEqual(stableHash({ a: 1 }), stableHash({ a: 2 }));
  assert.throws(() => canonicalJson({ a: Number.NaN }), /non-finite/);
});
test("T1: BodySpec validation enforces the adult-only, bounded ranges (BR-06, NFR-04)", () => {
  const ok = validateSpec({ sex: "female", ageYears: 30, statureM: 1.6, massKg: 55, seed: 1, proportions: { legLength: 1 } });
  assert.deepEqual(ok, { sex: "female", ageYears: 30, statureM: 1.6, massKg: 55, seed: 1, proportions: { legLength: 1 } });
  assert.throws(() => validateSpec({ sex: "male", ageYears: 17, statureM: 1.6, massKg: 55, seed: 1 }), /ageYears/);
  assert.throws(() => validateSpec({ sex: "male", ageYears: 30, statureM: 2.5, massKg: 55, seed: 1 }), /statureM/);
  assert.throws(() => validateSpec({ sex: "other", ageYears: 30, statureM: 1.6, massKg: 55, seed: 1 }), /sex/);
  assert.throws(() => validateSpec({ sex: "male", ageYears: 30, statureM: 1.6, massKg: 55, seed: 1.5 }), /seed/);
  assert.throws(() => validateSpec({ sex: "male", ageYears: 30, statureM: 1.6, massKg: 55, seed: 1, proportions: { legLength: 4 } }), /±3/);
  assert.throws(() => validateSpec({ sex: "male", ageYears: 30, statureM: 1.6, massKg: 55, seed: 1, proportions: { nose: 1 } }), /Unknown proportion/);
});
test("T0: the body RNG is the same keyed generator as the parent repository's simulation", () => {
  const a = keyedRandom(42, "body", 7), b = parentKeyedRandom(42, "body", 7);
  for (let i = 0; i < 20; i++) assert.equal(a("test", i), b("test", i));
});
test("rotation helpers follow the documented sign conventions (+Y toward +Z about +X, +X toward +Y about +Z, +Z toward +X about +Y)", () => {
  const near = (v: { x: number; y: number; z: number }, e: [number, number, number]) => { assert.ok(Math.abs(v.x - e[0]) < 1e-9 && Math.abs(v.y - e[1]) < 1e-9 && Math.abs(v.z - e[2]) < 1e-9, JSON.stringify(v)); };
  near(rotate3(quatFromAxisAngle("x", Math.PI / 2), { x: 0, y: 1, z: 0 }), [0, 0, 1]);
  near(rotate3(quatFromAxisAngle("z", Math.PI / 2), { x: 1, y: 0, z: 0 }), [0, 1, 0]);
  near(rotate3(quatFromAxisAngle("y", Math.PI / 2), { x: 0, y: 0, z: 1 }), [1, 0, 0]);
  const q = quatMultiply(quatFromAxisAngle("x", 0.3), quatFromAxisAngle("x", 0.4));
  near(rotate3(q, { x: 0, y: 1, z: 0 }), [0, Math.cos(0.7), Math.sin(0.7)]);
});
