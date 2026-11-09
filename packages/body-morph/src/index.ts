/**
 * BodySpec -> Skeleton. Segment lengths come from the ANSUR II regression (basis R); the
 * placement of joints relative to those lengths, the finger/foot/head subdivisions and the
 * placeholder surface radii are engineering assumptions (basis E) listed in docs/body/ANATOMY.md.
 * Pure function of the spec: the same spec always yields the same skeleton.
 */
import { type Bone, type BodySpec, type Sex, type Skeleton, type Vec3, add3, scale3, validateSpec, vec3 } from "../../body-contracts/src/index.ts";
import { ANATOMY_VERSION, SKELETON_TEMPLATE, BONE_SEGMENTS, SEGMENT_TABLES, TRUNK_ROW_SPANS, TRUNK_BONES, BASE_MEASURES, neutralizedBase, mean3, predictSegmentLengths, regressionFit, type SegmentLengths } from "../../body-anatomy/src/index.ts";

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

/**
 * Joint placement (basis E). Segment lengths come from the regression; the directions and branch
 * offsets of the hands, feet, head features and shoulder girdle come from the straightened
 * reference body (base-skeleton.ts), scaled to the generated lengths, so the redistributable base
 * mesh fits the skeleton without re-posing. Offsets are from the parent joint; tips point along the segment.
 */
function geometry(L: SegmentLengths, sex: Sex): Record<string, Geometry> {
  const g: Record<string, Geometry> = {};
  const N = neutralizedBase().joints;
  const P = (name: string) => { const v = N[name]; if (!v) throw new Error("Reference body has no joint " + name); return v; };
  const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
  const down = (length: number): Vec3 => vec3(0, -length, 0);
  const hipMid = mean3([P("l-upper-leg"), P("r-upper-leg")]);
  const sTrunk = L.trunk / (P("neck").y - hipMid.y);
  const sHead = L.headNeck / (P("head-2").y - P("neck").y);
  const sHand = L.hand / BASE_MEASURES.handLengthM;
  const sFoot = L.footLength / BASE_MEASURES.footLengthM;
  const hipJointSpacing = L.hipBreadth * 0.65;
  const sHip = hipJointSpacing / (2 * Math.abs(P("l-upper-leg").x - hipMid.x));
  const hipHeight = L.footHeight + L.shank + L.thigh;
  const torsoRadius = r(L.waistCircumference) * 0.5;
  g.hips = { offset: vec3(0, hipHeight, 0), tip: scale3(sub(P("spine-4"), hipMid), sTrunk), radius: r(L.buttockCircumference) * 0.5 };
  g.spine = { offset: g.hips.tip, tip: scale3(sub(P("spine-3"), P("spine-4")), sTrunk), radius: torsoRadius };
  g.chest = { offset: g.spine.tip, tip: scale3(sub(P("spine-2"), P("spine-3")), sTrunk), radius: r(L.chestCircumference) * 0.5 };
  g.upperChest = { offset: g.chest.tip, tip: scale3(sub(P("neck"), P("spine-2")), sTrunk), radius: r(L.chestCircumference) * 0.5 };
  g.neck = { offset: g.upperChest.tip, tip: scale3(sub(P("head"), P("neck")), sHead), radius: r(L.neckCircumference) };
  g.head = { offset: g.neck.tip, tip: scale3(sub(P("head-2"), P("head")), sHead), radius: r(L.headCircumference) };
  g.leftEye = { offset: scale3(sub(P("l-eye"), P("head")), sHead), tip: vec3(0, 0, 0.012), radius: 0.012 };
  g.rightEye = { offset: scale3(sub(P("r-eye"), P("head")), sHead), tip: vec3(0, 0, 0.012), radius: 0.012 };
  const jawHinge = add3(P("head"), vec3(0, -0.005, 0.02));
  g.jaw = { offset: scale3(sub(jawHinge, P("head")), sHead), tip: scale3(sub(P("jaw"), jawHinge), sHead), radius: 0.02 };
  for (const side of ["left", "right"] as const) {
    const sx = side === "left" ? 1 : -1, s = side === "left" ? "l" : "r", p = (name: string) => side + name;
    const clavicle = scale3(sub(P(`${s}-clavicle`), P("neck")), sTrunk);
    g[p("Shoulder")] = { offset: add3(g.upperChest.tip, clavicle), tip: vec3(0, 0, 0), radius: 0.025 };
    const acromion = sub(P(`${s}-shoulder`), P(`${s}-clavicle`));
    const targetX = sx * (L.shoulderBreadth / 2 - 0.02);
    const k = (targetX - g[p("Shoulder")].offset.x) / acromion.x;
    g[p("Shoulder")].tip = scale3(acromion, k > 0 ? k : sTrunk);
    g[p("UpperArm")] = { offset: g[p("Shoulder")].tip, tip: down(L.upperArm), radius: r(L.bicepsCircumference) };
    g[p("LowerArm")] = { offset: g[p("UpperArm")].tip, tip: down(L.forearm), radius: r(L.forearmCircumference) };
    const wrist = P(`${s}-hand`), mcpMid = mean3([2, 3, 4, 5].map(f => P(`${s}-finger-${f}-1`)));
    g[p("Hand")] = { offset: g[p("LowerArm")].tip, tip: scale3(sub(mcpMid, wrist), sHand), radius: r(L.handCircumference) * 0.6 };
    const fingers: [string, number][] = [["Thumb", 1], ["Index", 2], ["Middle", 3], ["Ring", 4], ["Little", 5]];
    for (const [name, f] of fingers) {
      const segs = name === "Thumb" ? ["Metacarpal", "Proximal", "Distal"] : ["Proximal", "Intermediate", "Distal"];
      segs.forEach((seg, i) => {
        const j0 = P(`${s}-finger-${f}-${i + 1}`), j1 = P(`${s}-finger-${f}-${i + 2}`);
        g[p(name + seg)] = { offset: i === 0 ? scale3(sub(j0, wrist), sHand) : g[p(name + segs[i - 1])].tip, tip: scale3(sub(j1, j0), sHand), radius: name === "Thumb" ? 0.01 : 0.008 };
      });
    }
    g[p("UpperLeg")] = { offset: scale3(sub(P(`${s}-upper-leg`), hipMid), sHip), tip: down(L.thigh), radius: r(L.thighCircumference) };
    g[p("LowerLeg")] = { offset: g[p("UpperLeg")].tip, tip: down(L.shank), radius: r(L.calfCircumference) };
    const foot = sub(P(`${s}-foot-1`), P(`${s}-ankle`));
    g[p("Foot")] = { offset: g[p("LowerLeg")].tip, tip: vec3(foot.x * sFoot, -L.footHeight, foot.z * sFoot), radius: L.footBreadth * 0.4 };
    g[p("Toes")] = { offset: g[p("Foot")].tip, tip: scale3(sub(P(`${s}-foot-2`), P(`${s}-foot-1`)), sFoot), radius: L.footBreadth * 0.35 };
  }
  void sex;
  return g;
}

export function buildSkeleton(input: BodySpec): Skeleton {
  const spec = validateSpec(input);
  const L = resolveLengths(spec);
  const g = geometry(L, spec.sex);
  const table = SEGMENT_TABLES[spec.sex];
  // Trunk bones take de Leva's trunk rows in proportion to the height they span (basis E for the split).
  const trunkSpan = new Map<string, [number, number]>();
  let cursor = 0;
  for (const id of TRUNK_BONES) { const h = g[id].tip.y / L.trunk; trunkSpan.set(id, [cursor, cursor + h]); cursor += h; }
  const trunkSegment = (id: string, tip: Vec3, length: number): Bone["segment"] => {
    const [a, b] = trunkSpan.get(id)!;
    let mass = 0, bestRow = "middleTrunk", bestOverlap = 0;
    for (const [row, [r0, r1]] of Object.entries(TRUNK_ROW_SPANS[spec.sex])) {
      const overlap = Math.max(0, Math.min(b, r1) - Math.max(a, r0));
      mass += spec.massKg * table[row].massFraction * (overlap / (r1 - r0));
      if (overlap > bestOverlap) { bestOverlap = overlap; bestRow = row; }
    }
    const radii = table[bestRow].radii;
    return { mass, com: scale3(tip, 0.5), radiiOfGyration: { x: radii[0] * length, y: radii[2] * length, z: radii[1] * length } };
  };
  const bones: Bone[] = SKELETON_TEMPLATE.map(t => {
    const geo = g[t.id];
    if (!geo) throw new Error("No geometry for bone " + t.id);
    const length = Math.hypot(geo.tip.x, geo.tip.y, geo.tip.z);
    const seg = BONE_SEGMENTS[t.id];
    let segment: Bone["segment"] = null;
    if ((TRUNK_BONES as readonly string[]).includes(t.id)) segment = trunkSegment(t.id, geo.tip, length);
    else if (seg) {
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
  const keys = ["chestCircumference", "waistCircumference", "buttockCircumference", "thighCircumference", "calfCircumference", "bicepsCircumference", "forearmCircumference", "wristCircumference", "ankleCircumference", "neckCircumference", "headCircumference", "handCircumference", "footBreadth", "waistBreadth", "waistDepth", "chestBreadth", "chestDepth", "buttockDepth", "hipBreadthStanding"];
  return Object.fromEntries(keys.map(k => [k, L[k]]));
}
