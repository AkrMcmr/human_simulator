/** Shared loader for the ANSUR II public CSVs (Latin-1, mm, weightkg in hectograms). Raw files are not committed. */
import { readFileSync } from "node:fs";

export type Subject = { id: number; sex: "male" | "female"; ageYears: number; statureM: number; massKg: number; derived: Record<string, number> };

/** Derived segment lengths and girths in metres from ANSUR II columns (mm). Keys are the body-anatomy names. */
export const DERIVED_SEGMENTS: Record<string, { formula: string; compute: (c: (name: string) => number) => number }> = {
  upperArm: { formula: "acromionradialelength", compute: c => c("acromionradialelength") },
  forearm: { formula: "radialestylionlength", compute: c => c("radialestylionlength") },
  hand: { formula: "handlength", compute: c => c("handlength") },
  thigh: { formula: "trochanterionheight - lateralfemoralepicondyleheight", compute: c => c("trochanterionheight") - c("lateralfemoralepicondyleheight") },
  shank: { formula: "lateralfemoralepicondyleheight - lateralmalleolusheight", compute: c => c("lateralfemoralepicondyleheight") - c("lateralmalleolusheight") },
  footHeight: { formula: "lateralmalleolusheight", compute: c => c("lateralmalleolusheight") },
  footLength: { formula: "footlength", compute: c => c("footlength") },
  footBreadth: { formula: "footbreadthhorizontal", compute: c => c("footbreadthhorizontal") },
  trunk: { formula: "cervicaleheight - trochanterionheight", compute: c => c("cervicaleheight") - c("trochanterionheight") },
  headNeck: { formula: "stature - cervicaleheight", compute: c => c("stature") - c("cervicaleheight") },
  headLength: { formula: "headlength", compute: c => c("headlength") },
  shoulderBreadth: { formula: "biacromialbreadth", compute: c => c("biacromialbreadth") },
  hipBreadth: { formula: "bicristalbreadth", compute: c => c("bicristalbreadth") },
  sittingHeight: { formula: "sittingheight", compute: c => c("sittingheight") },
  handBreadth: { formula: "handbreadth", compute: c => c("handbreadth") },
  interpupillary: { formula: "interpupillarybreadth", compute: c => c("interpupillarybreadth") },
  chestCircumference: { formula: "chestcircumference", compute: c => c("chestcircumference") },
  waistCircumference: { formula: "waistcircumference", compute: c => c("waistcircumference") },
  buttockCircumference: { formula: "buttockcircumference", compute: c => c("buttockcircumference") },
  thighCircumference: { formula: "thighcircumference", compute: c => c("thighcircumference") },
  calfCircumference: { formula: "calfcircumference", compute: c => c("calfcircumference") },
  bicepsCircumference: { formula: "bicepscircumferenceflexed", compute: c => c("bicepscircumferenceflexed") },
  forearmCircumference: { formula: "forearmcircumferenceflexed", compute: c => c("forearmcircumferenceflexed") },
  wristCircumference: { formula: "wristcircumference", compute: c => c("wristcircumference") },
  ankleCircumference: { formula: "anklecircumference", compute: c => c("anklecircumference") },
  neckCircumference: { formula: "neckcircumference", compute: c => c("neckcircumference") },
  headCircumference: { formula: "headcircumference", compute: c => c("headcircumference") },
  handCircumference: { formula: "handcircumference", compute: c => c("handcircumference") },
  // cross-section depth (front-back) and breadth (side-side) at the trunk landmarks, for the surface fit's anisotropy
  waistBreadth: { formula: "waistbreadth", compute: c => c("waistbreadth") },
  waistDepth: { formula: "waistdepth", compute: c => c("waistdepth") },
  chestBreadth: { formula: "chestbreadth", compute: c => c("chestbreadth") },
  chestDepth: { formula: "chestdepth", compute: c => c("chestdepth") },
  buttockDepth: { formula: "buttockdepth", compute: c => c("buttockdepth") },
  hipBreadthStanding: { formula: "hipbreadth", compute: c => c("hipbreadth") },
};

export function loadAnsur2(path: string, sex: "male" | "female"): Subject[] {
  const text = readFileSync(path, "latin1");
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  const header = lines[0].split(",").map(h => h.trim().toLowerCase());
  const col = (row: string[], name: string) => {
    const i = header.indexOf(name.toLowerCase());
    if (i < 0) throw new Error("Missing column " + name);
    const v = Number(row[i]);
    if (!Number.isFinite(v)) throw new Error("Non-numeric " + name);
    return v;
  };
  const subjects: Subject[] = [];
  for (const line of lines.slice(1)) {
    const row = line.split(",");
    const id = Number(row[0]);
    if (!Number.isInteger(id)) continue;
    const c = (name: string) => col(row, name);
    const derived: Record<string, number> = {};
    for (const [key, def] of Object.entries(DERIVED_SEGMENTS)) derived[key] = def.compute(c) / 1000;
    subjects.push({ id, sex, ageYears: c("age"), statureM: c("stature") / 1000, massKg: c("weightkg") / 10, derived });
  }
  return subjects;
}
export const isDevelopment = (s: Subject) => s.id % 2 === 0;
export const isValidation = (s: Subject) => s.id % 2 === 1;
