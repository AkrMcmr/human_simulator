/**
 * Joint layout of the reference body (MakeHuman base mesh joint helpers, CC0; basis E: a modelled
 * reference, not a measured person). Used by body-morph to place hands, feet, head features and
 * the shoulder girdle so that the generated skeleton matches the redistributable base mesh, and
 * by body-surface to bind that mesh. Limb chains are straightened to the anatomical neutral
 * (arms hanging, legs vertical) while hands and feet keep their modelled orientation.
 */
import { type Axis, type JointAngles, type Quat, type Vec3, IDENTITY_QUAT, add3, length3, quatMultiply, rotate3, scale3, vec3 } from "../../body-contracts/src/index.ts";
import base from "./data/base-joints.json" with { type: "json" };

export const BASE_JOINTS: Record<string, [number, number, number]> = base.joints as unknown as Record<string, [number, number, number]>;
export const BASE_MEASURES = base.measures as { statureM: number; groundY: number; handLengthM: number; footLengthM: number; headLengthM: number };
export const BASE_JOINTS_SOURCE = base.source;
export const baseJoint = (name: string): Vec3 => { const j = BASE_JOINTS[name]; if (!j) throw new Error("Reference body has no joint " + name); return vec3(j[0], j[1], j[2]); };
const DOWN = vec3(0, -1, 0);
const normalize = (v: Vec3) => scale3(v, 1 / length3(v));
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
/** Shortest rotation taking unit vector a to unit vector b. */
export function quatFromTo(a: Vec3, b: Vec3): Quat {
  const c = cross(a, b), d = dot(a, b);
  if (d < -0.999999) return { x: 0, y: 0, z: 1, w: 0 };
  const q = { x: c.x, y: c.y, z: c.z, w: 1 + d };
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}
export const mean3 = (points: Vec3[]): Vec3 => scale3(points.reduce((a, b) => add3(a, b), vec3()), 1 / points.length);

export type NeutralBase = {
  /** Joint positions (metres, reference frame) after straightening the limbs. */
  joints: Record<string, Vec3>;
  /** Joint angles (our conventions, DOF-restricted) that bring the straightened skeleton back toward the modelled pose. */
  bindAngles: JointAngles;
};
let cached: NeutralBase | null = null;
export function neutralizedBase(): NeutralBase {
  if (cached) return cached;
  const P: Record<string, Vec3> = {};
  for (const k of Object.keys(BASE_JOINTS)) P[k] = baseJoint(k);
  const bind: JointAngles = {};
  const rotateAbout = (pivot: string, q: Quat, names: string[]) => { for (const n of names) P[n] = add3(P[pivot], rotate3(q, add3(P[n], scale3(P[pivot], -1)))); };
  const dir = (a: string, b: string) => normalize(add3(P[b], scale3(P[a], -1)));
  const set = (bone: string, axis: Axis, value: number) => { bind[bone] = { ...(bind[bone] ?? {}), [axis]: value }; };
  for (const s of ["l", "r"] as const) {
    const side = s === "l" ? "left" : "right", sign = s === "l" ? 1 : -1;
    const names = Object.keys(P);
    const fingers = names.filter(n => n.startsWith(`${s}-finger-`));
    const hand = [`${s}-hand`, `${s}-hand-2`, `${s}-hand-3`, ...fingers];
    const arm = [`${s}-elbow`, ...hand];
    // shoulder: abduction in the frontal plane
    const upper = dir(`${s}-shoulder`, `${s}-elbow`);
    set(`${side}UpperArm`, "z", sign * Math.atan2(Math.abs(upper.x), -upper.y));
    rotateAbout(`${s}-shoulder`, quatFromTo(upper, DOWN), arm);
    // elbow: flexion (forward is -x)
    const fore = dir(`${s}-elbow`, `${s}-hand`);
    set(`${side}LowerArm`, "x", -Math.atan2(fore.z, -fore.y));
    rotateAbout(`${s}-elbow`, quatFromTo(fore, DOWN), hand);
    // wrist: flexion only; fingers keep their orientation relative to the palm
    const mcp = mean3([2, 3, 4, 5].map(f => P[`${s}-finger-${f}-1`]));
    const palm = normalize(add3(mcp, scale3(P[`${s}-hand`], -1)));
    set(`${side}Hand`, "x", -Math.atan2(palm.z, -palm.y));
    rotateAbout(`${s}-hand`, quatFromTo(palm, DOWN), hand.filter(n => n !== `${s}-hand`));
    // hip and knee; the foot keeps its orientation relative to the shank
    const foot = names.filter(n => n.startsWith(`${s}-foot-`) || n.startsWith(`${s}-toe-`));
    const leg = [`${s}-knee`, `${s}-ankle`, ...foot];
    const thigh = dir(`${s}-upper-leg`, `${s}-knee`);
    set(`${side}UpperLeg`, "z", sign * Math.atan2(Math.abs(thigh.x), -thigh.y));
    rotateAbout(`${s}-upper-leg`, quatFromTo(thigh, DOWN), leg);
    const shank = dir(`${s}-knee`, `${s}-ankle`);
    set(`${side}LowerLeg`, "x", Math.max(0, Math.atan2(-shank.z, -shank.y)));
    rotateAbout(`${s}-knee`, quatFromTo(shank, DOWN), [`${s}-ankle`, ...foot]);
  }
  cached = { joints: P, bindAngles: bind };
  return cached;
}
export { IDENTITY_QUAT as BASE_IDENTITY, quatMultiply as baseQuatMultiply };
