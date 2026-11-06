/**
 * Normal joint ranges of motion in degrees, measured from the anatomical neutral position.
 * basis R: values as commonly tabulated from AAOS (1965) "Joint Motion: Method of Measuring
 * and Recording" and clinical goniometry references (Norkin & White). They are population
 * norms for healthy adults, not individual limits. Transcribed from secondary tables; verify
 * against the primary source before any claim beyond R (see docs/body/VALIDATION.md).
 * basis E: the split of total spine/neck motion across rig segments, finger, eye and jaw values.
 */
export type RomEntry = { degrees: number; basis: "R" | "E"; note?: string };
export type JointRom = Record<string, RomEntry>;
export const ROM_SOURCE = "AAOS (1965) joint motion norms as tabulated in clinical goniometry references; spine/neck splits and finger/eye/jaw values are engineering assumptions";
export const ROM_VERSION = "0.1.0";

export const ROM_DEGREES: Record<string, JointRom> = {
  hip: {
    flexion: { degrees: 120, basis: "R" }, extension: { degrees: 30, basis: "R" },
    abduction: { degrees: 45, basis: "R" }, adduction: { degrees: 30, basis: "R" },
    internalRotation: { degrees: 45, basis: "R" }, externalRotation: { degrees: 45, basis: "R" },
  },
  knee: { flexion: { degrees: 135, basis: "R" }, extension: { degrees: 0, basis: "R", note: "hyperextension not modelled" } },
  ankle: {
    dorsiflexion: { degrees: 20, basis: "R" }, plantarflexion: { degrees: 50, basis: "R" },
    inversion: { degrees: 35, basis: "R" }, eversion: { degrees: 15, basis: "R" },
  },
  toes: { dorsiflexion: { degrees: 70, basis: "R", note: "first MTP" }, plantarflexion: { degrees: 45, basis: "R" } },
  shoulder: {
    flexion: { degrees: 180, basis: "R" }, extension: { degrees: 60, basis: "R" },
    abduction: { degrees: 180, basis: "R" }, adduction: { degrees: 45, basis: "R" },
    internalRotation: { degrees: 70, basis: "R" }, externalRotation: { degrees: 90, basis: "R" },
  },
  clavicle: {
    elevation: { degrees: 30, basis: "E" }, depression: { degrees: 10, basis: "E" },
    protraction: { degrees: 20, basis: "E" }, retraction: { degrees: 20, basis: "E" },
  },
  elbow: { flexion: { degrees: 150, basis: "R" }, extension: { degrees: 0, basis: "R" } },
  forearm: { pronation: { degrees: 80, basis: "R" }, supination: { degrees: 80, basis: "R" } },
  wrist: {
    flexion: { degrees: 80, basis: "R" }, extension: { degrees: 70, basis: "R" },
    radialDeviation: { degrees: 20, basis: "R" }, ulnarDeviation: { degrees: 30, basis: "R" },
  },
  fingerMcp: { flexion: { degrees: 90, basis: "R" }, extension: { degrees: 30, basis: "R" }, abduction: { degrees: 20, basis: "E" }, adduction: { degrees: 20, basis: "E" } },
  fingerPip: { flexion: { degrees: 100, basis: "R" }, extension: { degrees: 0, basis: "R" } },
  fingerDip: { flexion: { degrees: 80, basis: "R" }, extension: { degrees: 10, basis: "E" } },
  thumbCmc: { flexion: { degrees: 15, basis: "R" }, extension: { degrees: 20, basis: "R" }, abduction: { degrees: 70, basis: "R" }, adduction: { degrees: 0, basis: "E" } },
  thumbMcp: { flexion: { degrees: 50, basis: "R" }, extension: { degrees: 0, basis: "E" } },
  thumbIp: { flexion: { degrees: 80, basis: "R" }, extension: { degrees: 20, basis: "E" } },
  cervicalTotal: {
    flexion: { degrees: 50, basis: "R" }, extension: { degrees: 60, basis: "R" },
    lateralFlexion: { degrees: 45, basis: "R" }, rotation: { degrees: 80, basis: "R" },
  },
  thoracolumbarTotal: {
    flexion: { degrees: 80, basis: "R" }, extension: { degrees: 25, basis: "R" },
    lateralFlexion: { degrees: 35, basis: "R" }, rotation: { degrees: 45, basis: "R" },
  },
  eye: { adduction: { degrees: 45, basis: "E" }, abduction: { degrees: 45, basis: "E" }, elevation: { degrees: 35, basis: "E" }, depression: { degrees: 45, basis: "E" } },
  jaw: { opening: { degrees: 25, basis: "E" }, closing: { degrees: 0, basis: "E" } },
};

/** How the total spine and neck ranges are shared among rig segments (basis E). Fractions sum to 1 per chain. */
export const SPINE_SHARE: Record<string, number> = { spine: 0.5, chest: 0.3, upperChest: 0.2 };
export const NECK_SHARE: Record<string, number> = { neck: 0.6, head: 0.4 };
