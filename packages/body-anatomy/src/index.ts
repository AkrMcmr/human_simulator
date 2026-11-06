/**
 * Immutable anatomical data: the rig template, joint limits, segment inertia and the
 * anthropometric regression. No randomness, no state. Every table carries its basis
 * (U/E/R/M) and source; see docs/body/ANATOMY.md and docs/body/VALIDATION.md.
 */
import type { Axis, DofLimit, JointType, Sex } from "../../body-contracts/src/index.ts";
import { ROM_DEGREES, ROM_SOURCE, ROM_VERSION, SPINE_SHARE, NECK_SHARE } from "./data/rom.ts";
import { SEGMENT_TABLES, SEGMENT_SOURCE, SEGMENT_VERSION, BONE_SEGMENTS } from "./data/segments.ts";
import regression from "./data/ansur2-regression.json" with { type: "json" };

export const ANATOMY_VERSION = "0.1.0";
export { ROM_DEGREES, ROM_SOURCE, ROM_VERSION, SPINE_SHARE, NECK_SHARE, SEGMENT_TABLES, SEGMENT_SOURCE, SEGMENT_VERSION, BONE_SEGMENTS, regression };

export type Side = "left" | "right" | "center";
export type TemplateBone = { id: string; parent: string | null; core: string | null; side: Side; joint: JointType; dofs: DofLimit[]; segmentRow: string | null };

const deg = (d: number) => (d * Math.PI) / 180;
const rom = (joint: string, motion: string) => {
  const entry = ROM_DEGREES[joint]?.[motion];
  if (!entry) throw new Error(`No ROM for ${joint}.${motion}`);
  return deg(entry.degrees);
};
/** A limit whose sign flips between sides: `left` is the [min, max] pair for the left side. */
const z0 = (v: number) => (v === 0 ? 0 : v); // no negative zero: it survives in memory but not in JSON
const mirrored = (side: Side, axis: Axis, left: [number, number]): DofLimit => side === "right" ? { axis, min: z0(-left[1]), max: z0(-left[0]) } : { axis, min: z0(left[0]), max: z0(left[1]) };
const limit = (axis: Axis, min: number, max: number): DofLimit => ({ axis, min: z0(min), max: z0(max) });

/**
 * Sign conventions in the canonical frame (+X left, +Y up, +Z forward), rest = anatomical neutral:
 * about X, +Y moves toward +Z (upright flexion is +x; a hanging limb's flexion is -x; a forward
 * pointing foot's plantarflexion is +x). About Z, +X moves toward +Y (left-side abduction is +z).
 * About Y, +Z moves toward +X (a left turn is +y; left-limb external rotation is +y).
 */
function spineDofs(share: number): DofLimit[] {
  return [limit("x", -rom("thoracolumbarTotal", "extension") * share, rom("thoracolumbarTotal", "flexion") * share),
    limit("y", -rom("thoracolumbarTotal", "rotation") * share, rom("thoracolumbarTotal", "rotation") * share),
    limit("z", -rom("thoracolumbarTotal", "lateralFlexion") * share, rom("thoracolumbarTotal", "lateralFlexion") * share)];
}
function neckDofs(share: number): DofLimit[] {
  return [limit("x", -rom("cervicalTotal", "extension") * share, rom("cervicalTotal", "flexion") * share),
    limit("y", -rom("cervicalTotal", "rotation") * share, rom("cervicalTotal", "rotation") * share),
    limit("z", -rom("cervicalTotal", "lateralFlexion") * share, rom("cervicalTotal", "lateralFlexion") * share)];
}
function limb(side: "left" | "right"): TemplateBone[] {
  const S = side, p = (s: string) => side + s;
  const finger = (name: string): TemplateBone[] => [
    { id: p(name + "Proximal"), parent: p("Hand"), core: p(name + "Proximal"), side: S, joint: "condyloid", segmentRow: null,
      dofs: [limit("x", -rom("fingerMcp", "flexion"), rom("fingerMcp", "extension")), mirrored(S, "z", [-rom("fingerMcp", "adduction"), rom("fingerMcp", "abduction")])] },
    { id: p(name + "Intermediate"), parent: p(name + "Proximal"), core: p(name + "Intermediate"), side: S, joint: "hinge", segmentRow: null, dofs: [limit("x", -rom("fingerPip", "flexion"), rom("fingerPip", "extension"))] },
    { id: p(name + "Distal"), parent: p(name + "Intermediate"), core: p(name + "Distal"), side: S, joint: "hinge", segmentRow: null, dofs: [limit("x", -rom("fingerDip", "flexion"), rom("fingerDip", "extension"))] },
  ];
  return [
    { id: p("Shoulder"), parent: "upperChest", core: p("Shoulder"), side: S, joint: "ball", segmentRow: null,
      dofs: [mirrored(S, "y", [-rom("clavicle", "protraction"), rom("clavicle", "retraction")]), mirrored(S, "z", [-rom("clavicle", "depression"), rom("clavicle", "elevation")])] },
    { id: p("UpperArm"), parent: p("Shoulder"), core: p("UpperArm"), side: S, joint: "ball", segmentRow: "upperArm",
      dofs: [limit("x", -rom("shoulder", "flexion"), rom("shoulder", "extension")), mirrored(S, "y", [-rom("shoulder", "internalRotation"), rom("shoulder", "externalRotation")]), mirrored(S, "z", [-rom("shoulder", "adduction"), rom("shoulder", "abduction")])] },
    { id: p("LowerArm"), parent: p("UpperArm"), core: p("LowerArm"), side: S, joint: "hinge", segmentRow: "forearm",
      dofs: [limit("x", -rom("elbow", "flexion"), rom("elbow", "extension")), mirrored(S, "y", [-rom("forearm", "pronation"), rom("forearm", "supination")])] },
    { id: p("Hand"), parent: p("LowerArm"), core: p("Hand"), side: S, joint: "condyloid", segmentRow: "hand",
      dofs: [limit("x", -rom("wrist", "flexion"), rom("wrist", "extension")), mirrored(S, "z", [-rom("wrist", "ulnarDeviation"), rom("wrist", "radialDeviation")])] },
    { id: p("ThumbMetacarpal"), parent: p("Hand"), core: p("ThumbMetacarpal"), side: S, joint: "saddle", segmentRow: null,
      dofs: [limit("x", -rom("thumbCmc", "flexion"), rom("thumbCmc", "extension")), mirrored(S, "z", [-rom("thumbCmc", "adduction"), rom("thumbCmc", "abduction")])] },
    { id: p("ThumbProximal"), parent: p("ThumbMetacarpal"), core: p("ThumbProximal"), side: S, joint: "hinge", segmentRow: null, dofs: [limit("x", -rom("thumbMcp", "flexion"), rom("thumbMcp", "extension"))] },
    { id: p("ThumbDistal"), parent: p("ThumbProximal"), core: p("ThumbDistal"), side: S, joint: "hinge", segmentRow: null, dofs: [limit("x", -rom("thumbIp", "flexion"), rom("thumbIp", "extension"))] },
    ...finger("Index"), ...finger("Middle"), ...finger("Ring"), ...finger("Little"),
    { id: p("UpperLeg"), parent: "hips", core: p("UpperLeg"), side: S, joint: "ball", segmentRow: "thigh",
      dofs: [limit("x", -rom("hip", "flexion"), rom("hip", "extension")), mirrored(S, "y", [-rom("hip", "internalRotation"), rom("hip", "externalRotation")]), mirrored(S, "z", [-rom("hip", "adduction"), rom("hip", "abduction")])] },
    { id: p("LowerLeg"), parent: p("UpperLeg"), core: p("LowerLeg"), side: S, joint: "hinge", segmentRow: "shank", dofs: [limit("x", -rom("knee", "extension"), rom("knee", "flexion"))] },
    { id: p("Foot"), parent: p("LowerLeg"), core: p("Foot"), side: S, joint: "condyloid", segmentRow: "foot",
      dofs: [limit("x", -rom("ankle", "dorsiflexion"), rom("ankle", "plantarflexion")), mirrored(S, "z", [-rom("ankle", "inversion"), rom("ankle", "eversion")])] },
    { id: p("Toes"), parent: p("Foot"), core: p("Toes"), side: S, joint: "hinge", segmentRow: null, dofs: [limit("x", -rom("toes", "dorsiflexion"), rom("toes", "plantarflexion"))] },
  ];
}
/** Rig-Full for B1 equals the 55-bone VRM 1.0 humanoid set; Rig-Core is the projection through `core`. Parents precede children. */
export const SKELETON_TEMPLATE: readonly TemplateBone[] = [
  { id: "hips", parent: null, core: "hips", side: "center", joint: "fixed", dofs: [], segmentRow: "lowerTrunk" },
  { id: "spine", parent: "hips", core: "spine", side: "center", joint: "ball", dofs: spineDofs(SPINE_SHARE.spine), segmentRow: "middleTrunk" },
  { id: "chest", parent: "spine", core: "chest", side: "center", joint: "ball", dofs: spineDofs(SPINE_SHARE.chest), segmentRow: "upperTrunk" },
  { id: "upperChest", parent: "chest", core: "upperChest", side: "center", joint: "ball", dofs: spineDofs(SPINE_SHARE.upperChest), segmentRow: "upperTrunk" },
  { id: "neck", parent: "upperChest", core: "neck", side: "center", joint: "ball", dofs: neckDofs(NECK_SHARE.neck), segmentRow: "head" },
  { id: "head", parent: "neck", core: "head", side: "center", joint: "ball", dofs: neckDofs(NECK_SHARE.head), segmentRow: "head" },
  { id: "leftEye", parent: "head", core: "leftEye", side: "left", joint: "ball", segmentRow: null, dofs: [limit("x", -rom("eye", "elevation"), rom("eye", "depression")), mirrored("left", "y", [-rom("eye", "adduction"), rom("eye", "abduction")])] },
  { id: "rightEye", parent: "head", core: "rightEye", side: "right", joint: "ball", segmentRow: null, dofs: [limit("x", -rom("eye", "elevation"), rom("eye", "depression")), mirrored("right", "y", [-rom("eye", "adduction"), rom("eye", "abduction")])] },
  { id: "jaw", parent: "head", core: "jaw", side: "center", joint: "hinge", segmentRow: null, dofs: [limit("x", -rom("jaw", "closing"), rom("jaw", "opening"))] },
  ...limb("left"), ...limb("right"),
];
export const TEMPLATE_BY_ID: ReadonlyMap<string, TemplateBone> = new Map(SKELETON_TEMPLATE.map(b => [b.id, b]));
/** VRM 1.0 required humanoid bones; every Rig-Core projection must provide these. */
export const VRM_REQUIRED_BONES = ["hips", "spine", "head", "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"] as const;

export type SegmentLengths = Record<string, number>;
type Fit = { coefficients: [number, number, number]; residualSd: number; r2: number; n: number; mean: number };
const fits = regression.segments as unknown as Record<Sex, Record<string, Fit>>;
export const REGRESSION_KEYS = Object.keys(fits.male);
/** Linear prediction of segment lengths and girths (metres) from sex, stature and mass. Basis R (ANSUR II development split). */
export function predictSegmentLengths(sex: Sex, statureM: number, massKg: number): SegmentLengths {
  const out: SegmentLengths = {};
  for (const [key, fit] of Object.entries(fits[sex])) out[key] = fit.coefficients[0] + fit.coefficients[1] * statureM + fit.coefficients[2] * massKg;
  return out;
}
export function regressionFit(sex: Sex, key: string): Fit {
  const fit = fits[sex][key];
  if (!fit) throw new Error("No regression for " + key);
  return fit;
}
export const POPULATION = regression.population as Record<Sex, Record<"statureM" | "massKg" | "ageYears", { mean: number; sd: number; p5: number; p50: number; p95: number; n: number }>>;
export const REGRESSION_SOURCE = regression.source;
