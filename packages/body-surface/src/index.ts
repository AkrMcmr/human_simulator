/**
 * Provisional surface: one capsule per bone, rigidly skinned to that bone. This is a placeholder
 * so that the pipeline (skeleton -> skinned glTF) can be validated end to end. It is NOT a
 * body mesh and makes no claim about body shape (FR-MORPH-02 is only partly met; see
 * docs/body/FIDELITY.md). A redistributable base mesh replaces it in a later increment.
 */
import type { Skeleton, Vec3 } from "../../body-contracts/src/index.ts";
import { add3, length3, scale3, vec3 } from "../../body-contracts/src/index.ts";

export const SURFACE_VERSION = "0.1.0-capsule-placeholder";
export type SurfaceMesh = {
  positions: Float32Array; normals: Float32Array; joints: Uint16Array; weights: Float32Array; indices: Uint32Array;
  /** Bone ids in joint-index order (matches skeleton.bones order). */
  boneOrder: string[];
  vertexCount: number; triangleCount: number;
};

const SEGMENTS = 8, CAP_RINGS = 2;
function basis(axis: Vec3): [Vec3, Vec3] {
  const helper = Math.abs(axis.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const v = vec3(axis.y * helper.z - axis.z * helper.y, axis.z * helper.x - axis.x * helper.z, axis.x * helper.y - axis.y * helper.x);
  const vn = scale3(v, 1 / length3(v));
  const w = vec3(axis.y * vn.z - axis.z * vn.y, axis.z * vn.x - axis.x * vn.z, axis.x * vn.y - axis.y * vn.x);
  return [vn, w];
}

export function buildSurface(skeleton: Skeleton): SurfaceMesh {
  const restWorld = new Map<string, Vec3>();
  for (const b of skeleton.bones) restWorld.set(b.id, add3(b.parent ? restWorld.get(b.parent)! : vec3(), b.offset));
  const positions: number[] = [], normals: number[] = [], joints: number[] = [], weights: number[] = [], indices: number[] = [];
  skeleton.bones.forEach((bone, boneIndex) => {
    const L = length3(bone.tip);
    if (L < 1e-4) return;
    const base = restWorld.get(bone.id)!;
    const axis = scale3(bone.tip, 1 / L);
    const [u, v] = basis(axis);
    const r = bone.radius;
    const start = positions.length / 3;
    const rings: { center: Vec3; radius: number; normalAxial: number }[] = [];
    // bottom cap (pole at -r), cylinder, top cap (pole at L + r)
    for (let i = CAP_RINGS; i >= 1; i--) { const a = (i / CAP_RINGS) * (Math.PI / 2); rings.push({ center: add3(base, scale3(axis, -r * Math.sin(a))), radius: r * Math.cos(a), normalAxial: -Math.sin(a) }); }
    rings.push({ center: base, radius: r, normalAxial: 0 });
    rings.push({ center: add3(base, scale3(axis, L)), radius: r, normalAxial: 0 });
    for (let i = 1; i <= CAP_RINGS; i++) { const a = (i / CAP_RINGS) * (Math.PI / 2); rings.push({ center: add3(base, scale3(axis, L + r * Math.sin(a))), radius: r * Math.cos(a), normalAxial: Math.sin(a) }); }
    for (const ring of rings) for (let s = 0; s < SEGMENTS; s++) {
      const t = (s / SEGMENTS) * Math.PI * 2;
      const radial = add3(scale3(u, Math.cos(t)), scale3(v, Math.sin(t)));
      const p = add3(ring.center, scale3(radial, ring.radius));
      const nRadial = Math.sqrt(Math.max(0, 1 - ring.normalAxial ** 2));
      const n = add3(scale3(radial, nRadial), scale3(axis, ring.normalAxial));
      positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z); joints.push(boneIndex, 0, 0, 0); weights.push(1, 0, 0, 0);
    }
    for (let ri = 0; ri < rings.length - 1; ri++) for (let s = 0; s < SEGMENTS; s++) {
      const a = start + ri * SEGMENTS + s, b = start + ri * SEGMENTS + ((s + 1) % SEGMENTS), c = a + SEGMENTS, d = b + SEGMENTS;
      indices.push(a, b, d, a, d, c);
    }
  });
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), joints: new Uint16Array(joints), weights: new Float32Array(weights), indices: new Uint32Array(indices), boneOrder: skeleton.bones.map(b => b.id), vertexCount: positions.length / 3, triangleCount: indices.length / 3 };
}
