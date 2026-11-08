/**
 * Fit the redistributable base mesh (MakeHuman, CC0) to a generated skeleton.
 * Each base-mesh vertex is expressed in the local frame of its nearest base-mesh bone
 * segments (axial fraction + two radial coordinates), then re-placed in the generated
 * skeleton's bone frames at the bind pose with the segment length and a per-bone radial
 * scale that matches the measured girths (basis E for the blending and landmarks;
 * the girth targets come from the body-anatomy regression, basis R/M).
 */
import { type JointAngles, type Pose, type Quat, type Skeleton, type Vec3, add3, length3, rotate3, scale3, vec3 } from "../../body-contracts/src/index.ts";
import { forwardKinematics, restPose, jointRotation } from "../../body-kinematics/src/index.ts";
import asset from "../../../assets/body/base-mesh/makehuman-base.json" with { type: "json" };

export const BASE_MESH = asset as { format: string; version: string; source: Record<string, string>; vertexCount: number; triangleCount: number; positions: number[]; triangles: number[]; joints: Record<string, number[]> };
const J = (name: string): Vec3 => { const j = BASE_MESH.joints[name]; if (!j) throw new Error("Base mesh has no joint " + name); return vec3(j[0], j[1], j[2]); };
const mid = (...names: string[]): Vec3 => scale3(names.map(J).reduce((a, b) => add3(a, b), vec3()), 1 / names.length);

/** Generated bone -> base-mesh segment [proximal, distal]. Eyes and jaw are not skinned separately (the head carries them). */
function segmentEndpoints(bone: string): [Vec3, Vec3] | null {
  const side = bone.startsWith("left") ? "l" : bone.startsWith("right") ? "r" : null;
  const name = side ? bone.slice(side === "l" ? 4 : 5) : bone;
  const finger: Record<string, number> = { Thumb: 1, Index: 2, Middle: 3, Ring: 4, Little: 5 };
  if (!side) {
    switch (bone) {
      case "hips": return [mid("l-upper-leg", "r-upper-leg"), J("spine-4")];
      case "spine": return [J("spine-4"), J("spine-3")];
      case "chest": return [J("spine-3"), J("spine-2")];
      case "upperChest": return [J("spine-2"), J("neck")];
      case "neck": return [J("neck"), J("head")];
      case "head": return [J("head"), J("head-2")];
      default: return null;
    }
  }
  const s = side + "-";
  switch (name) {
    case "Shoulder": return [J(s + "clavicle"), J(s + "shoulder")];
    case "UpperArm": return [J(s + "shoulder"), J(s + "elbow")];
    case "LowerArm": return [J(s + "elbow"), J(s + "hand")];
    case "Hand": return [J(s + "hand"), mid(s + "finger-2-1", s + "finger-3-1", s + "finger-4-1", s + "finger-5-1")];
    case "UpperLeg": return [J(s + "upper-leg"), J(s + "knee")];
    case "LowerLeg": return [J(s + "knee"), J(s + "ankle")];
    case "Foot": return [J(s + "ankle"), J(s + "foot-1")];
    case "Toes": return [J(s + "foot-1"), J(s + "foot-2")];
    default: {
      const m = /^(Thumb|Index|Middle|Ring|Little)(Metacarpal|Proximal|Intermediate|Distal)$/.exec(name);
      if (!m) return null;
      const f = finger[m[1]];
      const idx = m[1] === "Thumb" ? { Metacarpal: 1, Proximal: 2, Distal: 3 }[m[2] as "Metacarpal" | "Proximal" | "Distal"]! : { Proximal: 1, Intermediate: 2, Distal: 3 }[m[2] as "Proximal" | "Intermediate" | "Distal"]!;
      return [J(`${s}finger-${f}-${idx}`), J(`${s}finger-${f}-${idx + 1}`)];
    }
  }
}

type Frame = { origin: Vec3; axis: Vec3; p: Vec3; q: Vec3; length: number };
const cross = (a: Vec3, b: Vec3): Vec3 => vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const normalize = (v: Vec3) => scale3(v, 1 / length3(v));
/** Perpendicular basis from a fixed reference per bone so base-mesh and generated frames correspond. */
function frame(origin: Vec3, distal: Vec3, bone: string): Frame {
  const d = add3(distal, scale3(origin, -1));
  const length = length3(d); const axis = scale3(d, 1 / length);
  const ref = /Foot|Toes|Eye|jaw/.test(bone) ? vec3(0, 1, 0) : vec3(0, 0, 1);
  let p = add3(ref, scale3(axis, -dot(ref, axis)));
  if (length3(p) < 1e-6) p = vec3(1, 0, 0);
  p = normalize(p);
  return { origin, axis, p, q: cross(axis, p), length };
}
function pointSegmentDistance(v: Vec3, f: Frame) {
  const rel = add3(v, scale3(f.origin, -1));
  const u = Math.min(f.length, Math.max(0, dot(rel, f.axis)));
  return length3(add3(rel, scale3(f.axis, -u)));
}

/** The bind pose: joint angles that bring the generated skeleton's limbs to the base mesh's modelled directions (basis E). */
export function baseMeshBindPose(): Pose {
  const pose = restPose();
  const angleFromDown = (a: Vec3, b: Vec3) => { const d = add3(b, scale3(a, -1)); return Math.atan2(Math.abs(d.x), -d.y); };
  const arm = angleFromDown(J("l-shoulder"), J("l-elbow")), leg = angleFromDown(J("l-upper-leg"), J("l-knee"));
  pose.joints.leftUpperArm = { z: arm }; pose.joints.rightUpperArm = { z: -arm };
  pose.joints.leftUpperLeg = { z: leg }; pose.joints.rightUpperLeg = { z: -leg };
  return pose;
}

/** Girth landmarks: bone and axial fraction (or a scanned range) where a circumference is measured, on both meshes (basis E). */
export type Landmark = { key: string; bone: string; u: number | [number, number]; pick: "at" | "max" | "min"; filter: string[] };
export const LANDMARKS: Landmark[] = [
  { key: "buttockCircumference", bone: "leftUpperLeg", u: 0, pick: "at", filter: ["hips", "leftUpperLeg", "rightUpperLeg", "spine"] },
  { key: "waistCircumference", bone: "chest", u: 0.15, pick: "at", filter: ["hips", "spine", "chest", "upperChest"] },
  { key: "chestCircumference", bone: "upperChest", u: [0.05, 0.45], pick: "max", filter: ["chest", "upperChest", "spine"] },
  { key: "neckCircumference", bone: "neck", u: [0.2, 0.8], pick: "min", filter: ["neck", "head", "upperChest"] },
  { key: "headCircumference", bone: "head", u: [0.3, 0.9], pick: "max", filter: ["head", "neck"] },
  { key: "bicepsCircumference", bone: "leftUpperArm", u: 0.5, pick: "at", filter: ["leftUpperArm", "leftShoulder", "leftLowerArm"] },
  { key: "forearmCircumference", bone: "leftLowerArm", u: [0.1, 0.5], pick: "max", filter: ["leftLowerArm", "leftUpperArm", "leftHand"] },
  { key: "wristCircumference", bone: "leftLowerArm", u: 0.95, pick: "at", filter: ["leftLowerArm", "leftHand"] },
  { key: "handCircumference", bone: "leftHand", u: 0.6, pick: "at", filter: ["leftHand"] },
  { key: "thighCircumference", bone: "leftUpperLeg", u: 0.15, pick: "at", filter: ["leftUpperLeg", "hips", "leftLowerLeg"] },
  { key: "calfCircumference", bone: "leftLowerLeg", u: [0.2, 0.6], pick: "max", filter: ["leftLowerLeg", "leftUpperLeg", "leftFoot"] },
  { key: "ankleCircumference", bone: "leftLowerLeg", u: 0.95, pick: "at", filter: ["leftLowerLeg", "leftFoot"] },
];
/**
 * Radial scale profile per bone: control points (axial fraction u, landmark key). The scale at a vertex
 * is interpolated between the control points of its bone, so one bone can follow two girths
 * (e.g. the thigh follows the buttock girth at the hip and the thigh girth below it). Basis E.
 */
const RADIAL_PROFILE: Record<string, [number, string][]> = {
  hips: [[0, "buttockCircumference"], [1, "waistCircumference"]],
  spine: [[0, "waistCircumference"], [1, "waistCircumference"]],
  chest: [[0, "waistCircumference"], [1, "chestCircumference"]],
  upperChest: [[0, "chestCircumference"], [1, "chestCircumference"]],
  neck: [[0, "neckCircumference"], [1, "neckCircumference"]],
  head: [[0, "headCircumference"], [1, "headCircumference"]],
  Shoulder: [[0, "chestCircumference"], [1, "chestCircumference"]],
  UpperArm: [[0, "bicepsCircumference"], [1, "bicepsCircumference"]],
  LowerArm: [[0, "forearmCircumference"], [0.5, "forearmCircumference"], [1, "wristCircumference"]],
  Hand: [[0, "wristCircumference"], [0.6, "handCircumference"], [1, "handCircumference"]],
  UpperLeg: [[0, "buttockCircumference"], [0.15, "thighCircumference"], [1, "thighCircumference"]],
  LowerLeg: [[0, "calfCircumference"], [0.5, "calfCircumference"], [1, "ankleCircumference"]],
  Foot: [[0, "ankleCircumference"], [0.3, "footBreadth"], [1, "footBreadth"]],
  Toes: [[0, "footBreadth"], [1, "footBreadth"]],
};
function profileFor(bone: string): [number, string][] {
  const name = bone.replace(/^(left|right)/, "");
  if (RADIAL_PROFILE[bone]) return RADIAL_PROFILE[bone];
  if (RADIAL_PROFILE[name]) return RADIAL_PROFILE[name];
  if (/Thumb|Index|Middle|Ring|Little/.test(name)) return [[0, "handCircumference"], [1, "handCircumference"]];
  return [[0, "headCircumference"], [1, "headCircumference"]]; // eyes, jaw
}
function scaleAt(profile: [number, string][], scale: Record<string, number>, u: number): number {
  if (u <= profile[0][0]) return scale[profile[0][1]];
  for (let i = 1; i < profile.length; i++) {
    const [u0, k0] = profile[i - 1], [u1, k1] = profile[i];
    if (u <= u1) { const f = (u - u0) / (u1 - u0); return scale[k0] + (scale[k1] - scale[k0]) * f; }
  }
  return scale[profile[profile.length - 1][1]];
}

export type FittedMesh = {
  positions: Float32Array; normals: Float32Array; joints: Uint16Array; weights: Float32Array; indices: Uint32Array;
  boneOrder: string[]; vertexCount: number; triangleCount: number; bindPose: Pose;
  /** Measured girths (m) of the fitted mesh at the landmarks, next to their targets. */
  girths: Record<string, { measured: number; target: number }>;
};

export type Ring = { a: number; b: number; f: number }[][]; // per cut triangle: two edge hits
/** Cross-section of the mesh with the plane through `point` with normal `n`, over triangles whose vertices all pass `keep`. Returns the perimeter and the cut edges (a ring that can be re-measured on a deformed copy of the mesh). */
export function sliceCircumference(positions: ArrayLike<number>, triangles: ArrayLike<number>, point: Vec3, n: Vec3, keep: (vertex: number) => boolean): { perimeter: number; ring: Ring } {
  const side = (i: number) => (positions[i * 3] - point.x) * n.x + (positions[i * 3 + 1] - point.y) * n.y + (positions[i * 3 + 2] - point.z) * n.z;
  const ring: Ring = [];
  for (let t = 0; t < triangles.length; t += 3) {
    const ids = [triangles[t], triangles[t + 1], triangles[t + 2]];
    if (!ids.every(keep)) continue;
    const s = ids.map(side);
    const hits: { a: number; b: number; f: number }[] = [];
    for (let k = 0; k < 3; k++) {
      const a = ids[k], b = ids[(k + 1) % 3], sa = s[k], sb = s[(k + 1) % 3];
      if ((sa < 0 && sb >= 0) || (sa >= 0 && sb < 0)) hits.push({ a, b, f: sa / (sa - sb) });
    }
    if (hits.length === 2) ring.push(hits);
  }
  return { perimeter: ringLength(positions, ring), ring };
}
export function ringLength(positions: ArrayLike<number>, ring: Ring): number {
  const at = (h: { a: number; b: number; f: number }): Vec3 => vec3(
    positions[h.a * 3] + (positions[h.b * 3] - positions[h.a * 3]) * h.f,
    positions[h.a * 3 + 1] + (positions[h.b * 3 + 1] - positions[h.a * 3 + 1]) * h.f,
    positions[h.a * 3 + 2] + (positions[h.b * 3 + 2] - positions[h.a * 3 + 2]) * h.f);
  let total = 0;
  for (const [h0, h1] of ring) total += length3(add3(at(h1), scale3(at(h0), -1)));
  return total;
}
function measure(positions: ArrayLike<number>, triangles: ArrayLike<number>, frames: Map<string, Frame>, dominant: Uint16Array, order: string[], lm: Landmark): { perimeter: number; ring: Ring } {
  const f = frames.get(lm.bone)!;
  const allowed = new Set(lm.filter.map(b => order.indexOf(b)));
  const keep = (v: number) => allowed.has(dominant[v]);
  const at = (u: number) => sliceCircumference(positions, triangles, add3(f.origin, scale3(f.axis, u * f.length)), f.axis, keep);
  if (typeof lm.u === "number") return at(lm.u);
  let best: { perimeter: number; ring: Ring } | null = null;
  for (let i = 0; i <= 12; i++) {
    const c = at(lm.u[0] + ((lm.u[1] - lm.u[0]) * i) / 12);
    if (c.perimeter <= 0) continue;
    if (!best || (lm.pick === "max" ? c.perimeter > best.perimeter : c.perimeter < best.perimeter)) best = c;
  }
  return best ?? { perimeter: 0, ring: [] };
}

type BaseBinding = { frames: Map<string, Frame>; joints: Uint16Array; weights: Float32Array; dominant: Uint16Array; local: Float32Array; girths: Record<string, number>; rings: Record<string, Ring>; footBreadth: number };
let cachedBinding: { order: string; binding: BaseBinding } | null = null;
/** Skin the base mesh to its own segments (nearest two, inverse-distance^4) and precompute local coordinates. Cached per bone order. */
function bindBaseMesh(order: string[]): BaseBinding {
  const key = order.join(",");
  if (cachedBinding && cachedBinding.order === key) return cachedBinding.binding;
  const frames = new Map<string, Frame>();
  for (const bone of order) { const ends = segmentEndpoints(bone); if (ends) frames.set(bone, frame(ends[0], ends[1], bone)); }
  const framed = order.map((b, i) => [b, i] as const).filter(([b]) => frames.has(b));
  const n = BASE_MESH.vertexCount, P = BASE_MESH.positions;
  const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4), dominant = new Uint16Array(n), local = new Float32Array(n * 6);
  const at = (v: number) => vec3(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
  // Pass 1: raw nearest segment, to estimate each segment's typical surface distance (its "radius").
  const samples = new Map<number, number[]>();
  for (let v = 0; v < n; v++) {
    let best = -1, bd = Infinity;
    for (const [bone, index] of framed) { const d = pointSegmentDistance(at(v), frames.get(bone)!); if (d < bd) { bd = d; best = index; } }
    if (!samples.has(best)) samples.set(best, []);
    samples.get(best)!.push(bd);
  }
  const radiusOf = new Map<number, number>();
  for (const [, index] of framed) { const d = (samples.get(index) ?? [0.01]).sort((a, b) => a - b); radiusOf.set(index, Math.max(0.01, d[Math.floor(d.length * 0.75)])); }
  // Pass 2: nearest two segments by distance normalised with the segment radius; the torso is then re-assigned by axial position so wide, short trunk segments form clean bands.
  const torso = ["hips", "spine", "chest", "upperChest", "neck", "head"].map(b => order.indexOf(b));
  const neckTop = J("neck").y + 0.3 * (J("head").y - J("neck").y);
  const chainBounds = [{ y: J("spine-4").y, width: 0.05 }, { y: J("spine-3").y, width: 0.05 }, { y: J("spine-2").y, width: 0.05 }, { y: J("neck").y, width: 0.04 }, { y: neckTop, width: 0.015 }];
  for (let v = 0; v < n; v++) {
    const pos = at(v);
    let b1 = -1, d1 = Infinity, b2 = -1, d2 = Infinity;
    for (const [bone, index] of framed) {
      const d = pointSegmentDistance(pos, frames.get(bone)!) / radiusOf.get(index)!;
      if (d < d1) { b2 = b1; d2 = d1; b1 = index; d1 = d; } else if (d < d2) { b2 = index; d2 = d; }
    }
    let w1 = 1 / Math.max(d1, 1e-4) ** 4, w2 = 1 / Math.max(d2, 1e-4) ** 4;
    if (torso.includes(b1)) {
      // The trunk, neck and head are vertical in the base mesh: assign bands by height with soft boundaries
      // (basis E). The neck/head boundary sits at the bottom of the jaw so the whole face follows the head.
      let i = 0;
      while (i < chainBounds.length && pos.y >= chainBounds[i].y) i++;
      const chosen = torso[i];
      let neighbour = chosen, blend = 0;
      const below = i > 0 ? chainBounds[i - 1] : null, above = i < chainBounds.length ? chainBounds[i] : null;
      const dBelow = below ? pos.y - below.y : Infinity, dAbove = above ? above.y - pos.y : Infinity;
      if (dBelow <= dAbove && below && dBelow < below.width) { neighbour = torso[i - 1]; blend = 0.5 * (1 - dBelow / below.width); }
      else if (above && dAbove < above.width) { neighbour = torso[i + 1]; blend = 0.5 * (1 - dAbove / above.width); }
      b1 = chosen; b2 = neighbour; w1 = 1 - blend; w2 = blend;
    }
    joints[v * 4] = b1; weights[v * 4] = w1 / (w1 + w2); weights[v * 4 + 1] = w2 / (w1 + w2); dominant[v] = b1;
    joints[v * 4 + 1] = weights[v * 4 + 1] > 0 ? b2 : 0; // glTF: a zero weight must reference joint 0
    for (const [slot, index] of [[0, b1], [1, b2]] as const) {
      const f = frames.get(order[index])!; const rel = add3(pos, scale3(f.origin, -1));
      local[v * 6 + slot * 3] = dot(rel, f.axis) / f.length; local[v * 6 + slot * 3 + 1] = dot(rel, f.p); local[v * 6 + slot * 3 + 2] = dot(rel, f.q);
    }
  }
  const girths: Record<string, number> = {}, rings: Record<string, Ring> = {};
  for (const lm of LANDMARKS) { const m = measure(P, BASE_MESH.triangles, frames, dominant, order, lm); girths[lm.key] = m.perimeter; rings[lm.key] = m.ring; }
  const footIndex = order.indexOf("leftFoot"), toesIndex = order.indexOf("leftToes");
  let minX = Infinity, maxX = -Infinity;
  for (let v = 0; v < n; v++) if (dominant[v] === footIndex || dominant[v] === toesIndex) { minX = Math.min(minX, P[v * 3]); maxX = Math.max(maxX, P[v * 3]); }
  const binding = { frames, joints, weights, dominant, local, girths, rings, footBreadth: maxX - minX };
  cachedBinding = { order: key, binding };
  return binding;
}

export type GirthTargets = Record<string, number>; // metres, keys as LANDMARKS plus footBreadth

export function buildFittedSurface(skeleton: Skeleton, targets: GirthTargets): FittedMesh {
  const order = skeleton.bones.map(b => b.id);
  const base = bindBaseMesh(order);
  const bindPose = baseMeshBindPose();
  const world = forwardKinematics(skeleton, bindPose);
  const frames = new Map<string, Frame>();
  for (const b of skeleton.bones) if (base.frames.has(b.id)) { const t = world.get(b.id)!; frames.set(b.id, frame(t.position, add3(t.position, rotate3(t.rotation, b.tip)), b.id)); }
  // Radial scales per landmark, refined by fixed-point iteration because blended vertices pull girths toward neighbouring bones.
  const scale: Record<string, number> = {};
  for (const lm of LANDMARKS) scale[lm.key] = targets[lm.key] / base.girths[lm.key];
  scale.footBreadth = targets.footBreadth / base.footBreadth;
  const profiles = new Map(order.map(b => [b, profileFor(b)]));
  const n = BASE_MESH.vertexCount;
  const positions = new Float32Array(n * 3);
  const place = () => {
    for (const v of Object.values(scale)) if (!(v > 0) || !Number.isFinite(v)) throw new Error("Radial scale is not positive");
    for (let v = 0; v < n; v++) {
      let out = vec3();
      for (const slot of [0, 1]) {
        const bone = order[base.joints[v * 4 + slot]], w = base.weights[v * 4 + slot];
        const f = frames.get(bone)!;
        const u = base.local[v * 6 + slot * 3], s = base.local[v * 6 + slot * 3 + 1], t = base.local[v * 6 + slot * 3 + 2];
        const k = scaleAt(profiles.get(bone)!, scale, u);
        const p = add3(f.origin, add3(scale3(f.axis, u * f.length), scale3(add3(scale3(f.p, s), scale3(f.q, t)), k)));
        out = add3(out, scale3(p, w));
      }
      positions[v * 3] = out.x; positions[v * 3 + 1] = out.y; positions[v * 3 + 2] = out.z;
    }
  };
  for (let iteration = 0; iteration < 8; iteration++) {
    place();
    for (const lm of LANDMARKS) { const measured = ringLength(positions, base.rings[lm.key]); if (measured > 0) scale[lm.key] = Math.min(2.0, Math.max(0.6, scale[lm.key] * targets[lm.key] / measured)); }
  }
  place();
  const indices = Uint32Array.from(BASE_MESH.triangles);
  const normals = vertexNormals(positions, indices);
  const girths: FittedMesh["girths"] = {};
  for (const lm of LANDMARKS) girths[lm.key] = { measured: ringLength(positions, base.rings[lm.key]), target: targets[lm.key] };
  return { positions, normals, joints: base.joints, weights: base.weights, indices, boneOrder: order, vertexCount: n, triangleCount: indices.length / 3, bindPose, girths };
}

export function vertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const pa = vec3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]), pb = vec3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]), pc = vec3(positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]);
    const nrm = cross(add3(pb, scale3(pa, -1)), add3(pc, scale3(pa, -1)));
    for (const i of [a, b, c]) { normals[i * 3] += nrm.x; normals[i * 3 + 1] += nrm.y; normals[i * 3 + 2] += nrm.z; }
  }
  for (let i = 0; i < normals.length; i += 3) { const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1; normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l; }
  return normals;
}
/** 4x4 column-major inverse bind matrices for a bind pose (world = T * R per bone). */
export function inverseBindMatrices(skeleton: Skeleton, bindPose: Pose | undefined): Float32Array {
  const world = forwardKinematics(skeleton, bindPose ?? restPose());
  const out = new Float32Array(skeleton.bones.length * 16);
  skeleton.bones.forEach((b, i) => {
    const t = world.get(b.id)!; const q: Quat = { x: -t.rotation.x, y: -t.rotation.y, z: -t.rotation.z, w: t.rotation.w }; // conjugate
    const c0 = rotate3(q, vec3(1, 0, 0)), c1 = rotate3(q, vec3(0, 1, 0)), c2 = rotate3(q, vec3(0, 0, 1));
    const tr = rotate3(q, scale3(t.position, -1));
    out.set([c0.x, c0.y, c0.z, 0, c1.x, c1.y, c1.z, 0, c2.x, c2.y, c2.z, 0, tr.x, tr.y, tr.z, 1], i * 16);
  });
  return out;
}
export { jointRotation as bindJointRotation };
export type { JointAngles };
