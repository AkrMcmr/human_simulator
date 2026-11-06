/**
 * Body segment inertial parameters as fractions.
 * basis R: de Leva, P. (1996). Adjustments to Zatsiorsky-Seluyanov's segment inertia parameters.
 * Journal of Biomechanics 29(9), 1223-1230. Mass fractions (% body mass), centre-of-mass position
 * (% segment length from the proximal end) and radii of gyration (% segment length; sagittal,
 * transverse, longitudinal) for young adults. Transcribed from the paper's summary table; verify
 * against Table 4 of the paper before any claim beyond R.
 * basis E: trunk subdivision across hips/spine/chest/upperChest, neck split from the head segment,
 * and the parameters assigned to those subdivisions.
 */
export const SEGMENT_SOURCE = "de Leva (1996) J Biomech 29(9):1223-1230, Zatsiorsky-Seluyanov adjusted parameters; trunk/neck subdivisions are engineering assumptions";
export const SEGMENT_VERSION = "0.1.0";
export type SegmentRow = { massFraction: number; comFraction: number; radii: [number, number, number]; basis: "R" | "E" };
export type SegmentTable = Record<string, SegmentRow>;

const male: SegmentTable = {
  head: { massFraction: 0.0694, comFraction: 0.5002, radii: [0.303, 0.315, 0.261], basis: "R" },
  trunk: { massFraction: 0.4346, comFraction: 0.4310, radii: [0.328, 0.306, 0.169], basis: "R" },
  upperTrunk: { massFraction: 0.1596, comFraction: 0.2999, radii: [0.505, 0.320, 0.465], basis: "R" },
  middleTrunk: { massFraction: 0.1633, comFraction: 0.4502, radii: [0.482, 0.383, 0.468], basis: "R" },
  lowerTrunk: { massFraction: 0.1117, comFraction: 0.6115, radii: [0.615, 0.551, 0.587], basis: "R" },
  upperArm: { massFraction: 0.0271, comFraction: 0.5772, radii: [0.285, 0.269, 0.158], basis: "R" },
  forearm: { massFraction: 0.0162, comFraction: 0.4574, radii: [0.276, 0.265, 0.121], basis: "R" },
  hand: { massFraction: 0.0061, comFraction: 0.7900, radii: [0.628, 0.513, 0.401], basis: "R" },
  thigh: { massFraction: 0.1416, comFraction: 0.4095, radii: [0.329, 0.329, 0.149], basis: "R" },
  shank: { massFraction: 0.0433, comFraction: 0.4395, radii: [0.255, 0.249, 0.103], basis: "R" },
  foot: { massFraction: 0.0137, comFraction: 0.4415, radii: [0.257, 0.245, 0.124], basis: "R" },
};
const female: SegmentTable = {
  head: { massFraction: 0.0668, comFraction: 0.4841, radii: [0.271, 0.295, 0.261], basis: "R" },
  trunk: { massFraction: 0.4257, comFraction: 0.3782, radii: [0.307, 0.292, 0.147], basis: "R" },
  upperTrunk: { massFraction: 0.1545, comFraction: 0.2077, radii: [0.746, 0.502, 0.718], basis: "R" },
  middleTrunk: { massFraction: 0.1465, comFraction: 0.4512, radii: [0.433, 0.354, 0.415], basis: "R" },
  lowerTrunk: { massFraction: 0.1247, comFraction: 0.4920, radii: [0.433, 0.402, 0.444], basis: "R" },
  upperArm: { massFraction: 0.0255, comFraction: 0.5754, radii: [0.278, 0.260, 0.148], basis: "R" },
  forearm: { massFraction: 0.0138, comFraction: 0.4559, radii: [0.261, 0.257, 0.094], basis: "R" },
  hand: { massFraction: 0.0056, comFraction: 0.7474, radii: [0.531, 0.454, 0.335], basis: "R" },
  thigh: { massFraction: 0.1478, comFraction: 0.3612, radii: [0.369, 0.364, 0.162], basis: "R" },
  shank: { massFraction: 0.0481, comFraction: 0.4416, radii: [0.271, 0.267, 0.093], basis: "R" },
  foot: { massFraction: 0.0129, comFraction: 0.4014, radii: [0.299, 0.279, 0.139], basis: "R" },
};
export const SEGMENT_TABLES: Record<"male" | "female", SegmentTable> = { male, female };

/**
 * Mapping from rig bones to table rows (basis E for the splits). The fractions divide a table
 * row's mass among several bones; they sum to 1 per row.
 */
export const BONE_SEGMENTS: Record<string, { row: string; share: number }> = {
  hips: { row: "lowerTrunk", share: 1 },
  spine: { row: "middleTrunk", share: 1 },
  chest: { row: "upperTrunk", share: 0.5 },
  upperChest: { row: "upperTrunk", share: 0.5 },
  neck: { row: "head", share: 0.2 },
  head: { row: "head", share: 0.8 },
  leftUpperArm: { row: "upperArm", share: 1 }, rightUpperArm: { row: "upperArm", share: 1 },
  leftLowerArm: { row: "forearm", share: 1 }, rightLowerArm: { row: "forearm", share: 1 },
  leftHand: { row: "hand", share: 1 }, rightHand: { row: "hand", share: 1 },
  leftUpperLeg: { row: "thigh", share: 1 }, rightUpperLeg: { row: "thigh", share: 1 },
  leftLowerLeg: { row: "shank", share: 1 }, rightLowerLeg: { row: "shank", share: 1 },
  leftFoot: { row: "foot", share: 1 }, rightFoot: { row: "foot", share: 1 },
};
