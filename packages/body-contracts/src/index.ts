/**
 * Body track contracts. Imports nothing; every other body-* package imports this.
 * Units are SI (metres, kilograms, seconds) and angles are radians. The canonical
 * frame is right-handed, +Y up, +Z forward (glTF). See docs/body/FORMATS.md.
 */
export const BODY_CONTRACT_VERSION = "0.1.0";

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type Axis = "x" | "y" | "z";
export type Sex = "female" | "male";

/** Everything needed to generate one body. Unspecified proportions default to the regression median. */
export type ProportionKey = "sittingHeight" | "legLength" | "armLength" | "shoulderBreadth" | "hipBreadth";
export type BodySpec = {
  sex: Sex;
  ageYears: number;
  statureM: number;
  massKg: number;
  /** z-values (standard deviations of the reference residual) applied to the named segment group. */
  proportions?: Partial<Record<ProportionKey, number>>;
  seed: number;
};
export const SPEC_LIMITS = {
  ageYears: { min: 18, max: 100 },
  statureM: { min: 1.2, max: 2.2 },
  massKg: { min: 25, max: 200 },
  proportionZ: { min: -3, max: 3 },
} as const;

export type JointType = "ball" | "hinge" | "pivot" | "condyloid" | "saddle" | "fixed";
export type DofLimit = { axis: Axis; min: number; max: number };
export type SegmentInertia = {
  /** Segment mass in kilograms. */
  mass: number;
  /** Centre of mass, metres, in the bone's local rest frame (from the proximal joint). */
  com: Vec3;
  /** Radii of gyration, metres, about the local x/y/z axes through the centre of mass. */
  radiiOfGyration: Vec3;
};
export type Bone = {
  id: string;
  parent: string | null;
  /** Rest translation from the parent joint, metres, in the canonical frame (rest frames are axis-aligned). */
  offset: Vec3;
  /** Vector from this joint to the distal end of the segment, metres, local rest frame. */
  tip: Vec3;
  joint: { type: JointType; dofs: DofLimit[] };
  segment: SegmentInertia | null;
  /** Placeholder surface radius used by the provisional capsule surface, metres. */
  radius: number;
  /** Rig-Core (VRM humanoid) name this bone projects to, or null for Rig-Full-only bones. */
  core: string | null;
};
export type Skeleton = {
  version: string;
  anatomyVersion: string;
  bones: Bone[];
  /** Derived whole-body quantities for checks and display. */
  statureM: number;
  massKg: number;
};

export type JointAngles = Record<string, Partial<Record<Axis, number>>>;
export type Pose = {
  root: { position: Vec3; rotation: Quat };
  joints: JointAngles;
};

export type Fidelity = { morph: 0 | 1 | 2 | 3 | 4; motion: 0 | 1 | 2 | 3 | 4; physio: 0 | 1 | 2 | 3 | 4; response: 0 | 1 | 2 | 3 | 4 };
export type BodyConfig = { dt: number; seed: number; fidelity: Fidelity };
export const DEFAULT_CONFIG: BodyConfig = { dt: 1 / 120, seed: 1, fidelity: { morph: 1, motion: 1, physio: 0, response: 0 } };

export type CommandDomain = "morph" | "pose" | "dynamics" | "motor" | "grasp" | "face" | "physio" | "damage" | "surface" | "mind" | "runtime";
export type ViolationPolicy = "reject" | "clamp";
export type BodyCommand = {
  id: string;
  tick?: number;
  domain: CommandDomain;
  name: string;
  params: Record<string, unknown>;
};
export type RejectionReason = "out_of_range" | "conflict" | "unreachable" | "unsupported_fidelity" | "invalid_params" | "locked" | "unknown_command" | "past_tick";
export type EventKind = "accepted" | "rejected" | "contact" | "fall" | "injury" | "pain" | "threshold" | "reach" | "grasp" | "transition" | "custom";
export type BodyEvent = {
  tick: number;
  kind: EventKind;
  commandId?: string;
  payload: Record<string, unknown>;
};
export type BodyQuery = { domain: string; name: string; params?: Record<string, unknown> };
export type RandomSource = (purpose: string, index?: number) => number;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale3 = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const length3 = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };
export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
export function quatFromAxisAngle(axis: Axis, angle: number): Quat {
  const s = Math.sin(angle / 2), c = Math.cos(angle / 2);
  return { x: axis === "x" ? s : 0, y: axis === "y" ? s : 0, z: axis === "z" ? s : 0, w: c };
}
export function rotate3(q: Quat, v: Vec3): Vec3 {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}

/** Deterministic JSON with sorted object keys, so hashes do not depend on insertion order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Cannot serialize non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).filter(k => (value as Record<string, unknown>)[k] !== undefined).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalJson((value as Record<string, unknown>)[k])).join(",") + "}";
}
/** 64-bit FNV-1a (as two 32-bit lanes) over the canonical JSON. Pure JS so Node and browsers agree. */
export function stableHash(value: unknown): string {
  const text = canonicalJson(value);
  let h1 = 2166136261, h2 = 0x9747b28c;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h1 >>> 13);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

export const RNG_VERSION = "keyed-fnv-mulberry-v1";
/** Same algorithm as the parent repository's simulation RNG: seed / stream / tick / purpose keyed, stateless. */
export function keyedRandom(seed: number, stream: string, tick: number): RandomSource {
  return (purpose: string, index = 0) => {
    const key = seed + "|" + stream + "|" + tick + "|" + purpose + "|" + index;
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    let t = (h + 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function validateSpec(spec: unknown): BodySpec {
  if (!spec || typeof spec !== "object") throw new Error("BodySpec must be an object");
  const s = spec as Record<string, unknown>;
  if (s.sex !== "female" && s.sex !== "male") throw new Error("BodySpec.sex must be 'female' or 'male'");
  const num = (key: "ageYears" | "statureM" | "massKg") => {
    const v = s[key];
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`BodySpec.${key} must be a finite number`);
    const limit = SPEC_LIMITS[key];
    if (v < limit.min || v > limit.max) throw new Error(`BodySpec.${key}=${v} is outside the supported range ${limit.min}..${limit.max}`);
    return v;
  };
  const seed = s.seed;
  if (typeof seed !== "number" || !Number.isInteger(seed)) throw new Error("BodySpec.seed must be an integer");
  const proportions: Partial<Record<ProportionKey, number>> = {};
  if (s.proportions !== undefined) {
    if (!s.proportions || typeof s.proportions !== "object") throw new Error("BodySpec.proportions must be an object");
    for (const [key, value] of Object.entries(s.proportions as Record<string, unknown>)) {
      if (!["sittingHeight", "legLength", "armLength", "shoulderBreadth", "hipBreadth"].includes(key)) throw new Error("Unknown proportion: " + key);
      if (typeof value !== "number" || !Number.isFinite(value) || value < SPEC_LIMITS.proportionZ.min || value > SPEC_LIMITS.proportionZ.max) throw new Error(`BodySpec.proportions.${key} must be within ±3`);
      proportions[key as ProportionKey] = value;
    }
  }
  const out: BodySpec = { sex: s.sex, ageYears: num("ageYears"), statureM: num("statureM"), massKg: num("massKg"), seed };
  if (Object.keys(proportions).length) out.proportions = proportions;
  return out;
}
