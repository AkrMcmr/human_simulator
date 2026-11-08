/**
 * BodySpec -> Skeleton. Segment lengths come from the ANSUR II regression (basis R); the
 * placement of joints relative to those lengths, the finger/foot/head subdivisions and the
 * placeholder surface radii are engineering assumptions (basis E) listed in docs/body/ANATOMY.md.
 * Pure function of the spec: the same spec always yields the same skeleton.
 */
import { type Bone, type BodySpec, type Sex, type Skeleton, type Vec3, validateSpec, vec3 } from "../../body-contracts/src/index.ts";
import { ANATOMY_VERSION, SKELETON_TEMPLATE, BONE_SEGMENTS, SEGMENT_TABLES, predictSegmentLengths, regressionFit, type SegmentLengths } from "../../body-anatomy/src/index.ts";

export const MORPH_VERSION = "0.1.0";
const TAU = Math.PI * 2;

/** Resolve the measured lengths, apply proportion z-values, and make the vertical chain equal the stature (basis E). */
export function resolveLengths(spec: BodySpec): SegmentLengths {
  const L = predictSegmentLengths(spec.sex, spec.statureM, spec.massKg);
  const sd = (key: string) => regressionFit(spec.sex, key).residualSd;
  const z = spec.proportions ?? {};
  // Uniform scaling of the vertical chain so that the generated stature equals the requested one.
  const chainKeys = ["footHeight", "shank", "thigh", "trunk", "headNeck"];
  const chain = chainKeys.reduce((s, k) => s + L[k], 0);
  for (const k of chainKeys) L[k] *= spec.statureM / chain;
  // Proportion adjustments trade length within the chain so stature stays fixed.
  const legShare = () => { const t = L.thigh / (L.thigh + L.shank); return [t, 1 - t]; };
  if (z.legLength) { const d = z.legLength * (sd("thigh") + sd("shank")); const [t, s] = legShare(); L.thigh += d * t; L.shank += d * s; L.trunk -= d; }
  if (z.sittingHeight) { const d = z.sittingHeight * sd("trunk"); const [t, s] = legShare(); L.trunk += d; L.thigh -= d * t; L.shank -= d * s; }
  if (z.armLength) for (const k of ["upperArm", "forearm", "hand"]) L[k] += z.armLength * sd(k);
  if (z.shoulderBreadth) L.shoulderBreadth += z.shoulderBreadth * sd("shoulderBreadth");
  if (z.hipBreadth) L.hipBreadth += z.hipBreadth * sd("hipBreadth");
  for (const [k, v] of Object.entries(L)) if (!(v > 0)) throw new Error(`Resolved length ${k} is not positive (${v}); the proportions are outside what the body can realize`);
  return L;
}

type Geometry = { offset: Vec3; tip: Vec3; radius: number };
const r = (circumference: number) => circumference / TAU;

/** Joint placement from the resolved lengths (basis E). Offsets are from the parent joint in the canonical frame; tips point along the segment. */
function geometry(L: SegmentLengths, sex: Sex): Record<string, Geometry> {
  const g: Record<string, Geometry> = {};
  const hipHeight = L.footHeight + L.shank + L.thigh;
  const hipJointSpacing = L.hipBreadth * 0.6;
  // Trunk and neck splits follow the base mesh's joint fractions so segment-wise mesh transfer stretches uniformly (basis E).
  const trunkSplit = { spine: 0.13, chest: 0.126, upperChest: 0.172, neck: 0.572 };
  const neckLength = L.headNeck * 0.42, headLength = L.headNeck * 0.58;
  const torsoRadius = r(L.waistCircumference) * 0.5;
  g.hips = { offset: vec3(0, hipHeight, 0), tip: vec3(0, L.trunk * trunkSplit.spine, 0), radius: r(L.buttockCircumference) * 0.5 };
  g.spine = { offset: g.hips.tip, tip: vec3(0, L.trunk * trunkSplit.chest, 0), radius: torsoRadius };
  g.chest = { offset: g.spine.tip, tip: vec3(0, L.trunk * trunkSplit.upperChest, 0), radius: r(L.chestCircumference) * 0.5 };
  g.upperChest = { offset: g.chest.tip, tip: vec3(0, L.trunk * trunkSplit.neck, 0), radius: r(L.chestCircumference) * 0.5 };
  g.neck = { offset: g.upperChest.tip, tip: vec3(0, neckLength, 0), radius: r(L.neckCircumference) };
  g.head = { offset: g.neck.tip, tip: vec3(0, headLength, 0), radius: r(L.headCircumference) };
  const ipd = Math.min(0.075, Math.max(0.055, L.interpupillary));
  g.leftEye = { offset: vec3(ipd / 2, headLength * 0.45, L.headLength * 0.4), tip: vec3(0, 0, 0.012), radius: 0.012 };
  g.rightEye = { offset: vec3(-ipd / 2, headLength * 0.45, L.headLength * 0.4), tip: vec3(0, 0, 0.012), radius: 0.012 };
  g.jaw = { offset: vec3(0, headLength * 0.1, 0.02), tip: vec3(0, -0.03, L.headLength * 0.35), radius: 0.02 };
  for (const side of ["left", "right"] as const) {
    const sx = side === "left" ? 1 : -1, p = (s: string) => side + s;
    g[p("Shoulder")] = { offset: vec3(sx * 0.03, L.trunk * trunkSplit.neck - 0.03, 0), tip: vec3(sx * (L.shoulderBreadth / 2 - 0.03), 0, 0), radius: 0.025 };
    g[p("UpperArm")] = { offset: g[p("Shoulder")].tip, tip: vec3(0, -L.upperArm, 0), radius: r(L.bicepsCircumference) };
    g[p("LowerArm")] = { offset: g[p("UpperArm")].tip, tip: vec3(0, -L.forearm, 0), radius: r(L.forearmCircumference) };
    const palm = L.hand * 0.52, fingerLengths = [0.22, 0.15, 0.11].map(f => L.hand * f);
    g[p("Hand")] = { offset: g[p("LowerArm")].tip, tip: vec3(0, -palm, 0), radius: r(L.handCircumference) * 0.6 };
    const spacing = L.handBreadth / 4;
    const fingers: [string, number, number][] = [["Index", 1.5, 1.0], ["Middle", 0.5, 1.05], ["Ring", -0.5, 0.97], ["Little", -1.5, 0.8]];
    for (const [name, lane, scale] of fingers) {
      let parentTip = vec3(sx * lane * spacing, -palm, 0);
      const segs = ["Proximal", "Intermediate", "Distal"];
      segs.forEach((seg, i) => {
        g[p(name + seg)] = { offset: i === 0 ? parentTip : g[p(name + segs[i - 1])].tip, tip: vec3(0, -fingerLengths[i] * scale, 0), radius: 0.008 };
      });
    }
    g[p("ThumbMetacarpal")] = { offset: vec3(sx * spacing * 1.8, -palm * 0.25, 0.01), tip: vec3(sx * L.hand * 0.17, -L.hand * 0.17, 0.01), radius: 0.011 };
    g[p("ThumbProximal")] = { offset: g[p("ThumbMetacarpal")].tip, tip: vec3(sx * L.hand * 0.1, -L.hand * 0.12, 0.005), radius: 0.009 };
    g[p("ThumbDistal")] = { offset: g[p("ThumbProximal")].tip, tip: vec3(sx * L.hand * 0.07, -L.hand * 0.1, 0.0), radius: 0.008 };
    g[p("UpperLeg")] = { offset: vec3(sx * hipJointSpacing / 2, 0, 0), tip: vec3(0, -L.thigh, 0), radius: r(L.thighCircumference) };
    g[p("LowerLeg")] = { offset: g[p("UpperLeg")].tip, tip: vec3(0, -L.shank, 0), radius: r(L.calfCircumference) };
    g[p("Foot")] = { offset: g[p("LowerLeg")].tip, tip: vec3(0, -L.footHeight, L.footLength * 0.55), radius: L.footBreadth * 0.4 };
    g[p("Toes")] = { offset: g[p("Foot")].tip, tip: vec3(0, 0, L.footLength * 0.2), radius: L.footBreadth * 0.35 };
  }
  void sex;
  return g;
}

export function buildSkeleton(input: BodySpec): Skeleton {
  const spec = validateSpec(input);
  const L = resolveLengths(spec);
  const g = geometry(L, spec.sex);
  const table = SEGMENT_TABLES[spec.sex];
  const bones: Bone[] = SKELETON_TEMPLATE.map(t => {
    const geo = g[t.id];
    if (!geo) throw new Error("No geometry for bone " + t.id);
    const length = Math.hypot(geo.tip.x, geo.tip.y, geo.tip.z);
    const seg = BONE_SEGMENTS[t.id];
    let segment: Bone["segment"] = null;
    if (seg) {
      const row = table[seg.row];
      const mass = spec.massKg * row.massFraction * seg.share;
      const com: Vec3 = { x: geo.tip.x * row.comFraction, y: geo.tip.y * row.comFraction, z: geo.tip.z * row.comFraction };
      segment = { mass, com, radiiOfGyration: { x: row.radii[0] * length, y: row.radii[2] * length, z: row.radii[1] * length } };
    }
    return { id: t.id, parent: t.parent, offset: geo.offset, tip: geo.tip, joint: { type: t.joint, dofs: t.dofs.map(d => ({ ...d })) }, segment, radius: geo.radius, core: t.core };
  });
  return { version: MORPH_VERSION, anatomyVersion: ANATOMY_VERSION, bones, statureM: spec.statureM, massKg: spec.massKg };
}

/** Whole-body checks used by tests and the CLI. */
export function skeletonSummary(skeleton: Skeleton) {
  const byId = new Map(skeleton.bones.map(b => [b.id, b]));
  const world = new Map<string, Vec3>();
  for (const b of skeleton.bones) {
    const p = b.parent ? world.get(b.parent)! : vec3();
    world.set(b.id, { x: p.x + b.offset.x, y: p.y + b.offset.y, z: p.z + b.offset.z });
  }
  const head = byId.get("head")!;
  const top = world.get("head")!.y + head.tip.y;
  let mass = 0, comY = 0;
  for (const b of skeleton.bones) if (b.segment) { mass += b.segment.mass; comY += b.segment.mass * (world.get(b.id)!.y + b.segment.com.y); }
  return { generatedStatureM: top, totalMassKg: mass, comHeightM: comY / mass, comHeightFraction: comY / mass / top, restPositions: world };
}

/** Girth targets (metres) for the surface fit: the regression circumferences plus foot breadth. */
export function girthTargets(input: BodySpec): Record<string, number> {
  const L = resolveLengths(validateSpec(input));
  const keys = ["chestCircumference", "waistCircumference", "buttockCircumference", "thighCircumference", "calfCircumference", "bicepsCircumference", "forearmCircumference", "wristCircumference", "ankleCircumference", "neckCircumference", "headCircumference", "handCircumference", "footBreadth"];
  return Object.fromEntries(keys.map(k => [k, L[k]]));
}
