/**
 * Derive the compact base-mesh asset from the MakeHuman base mesh (CC0 1.0 assets).
 *   node --experimental-strip-types research/body/scripts/derive-base-mesh.ts <base.obj>
 * Keeps only the "body" group (skin), triangulates its quads, converts decimetres to metres
 * and records the centroids of the joint helper cubes. Writes assets/body/base-mesh/makehuman-base.json.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const path = process.argv[2];
if (!path) throw new Error("Usage: derive-base-mesh.ts <base.obj>");
const bytes = readFileSync(path);
const text = bytes.toString("latin1");
const verts: number[][] = []; const groups = new Map<string, number[][]>(); let current = "default";
for (const line of text.split("\n")) {
  if (line.startsWith("v ")) verts.push(line.trim().split(/\s+/).slice(1, 4).map(Number));
  else if (line.startsWith("g ")) { current = line.slice(2).trim(); if (!groups.has(current)) groups.set(current, []); }
  else if (line.startsWith("f ")) { const idx = line.trim().split(/\s+/).slice(1).map(t => Number(t.split("/")[0]) - 1); if (!groups.has(current)) groups.set(current, []); groups.get(current)!.push(idx); }
}
const body = groups.get("body");
if (!body) throw new Error("No 'body' group");
const used = [...new Set(body.flat())].sort((a, b) => a - b);
const remap = new Map(used.map((v, i) => [v, i]));
const positions: number[] = [];
for (const v of used) positions.push(+(verts[v][0] / 10).toFixed(5), +(verts[v][1] / 10).toFixed(5), +(verts[v][2] / 10).toFixed(5));
const triangles: number[] = [];
for (const f of body) {
  const m = f.map(i => remap.get(i)!);
  for (let k = 1; k + 1 < m.length; k++) triangles.push(m[0], m[k], m[k + 1]);
}
const joints: Record<string, number[]> = {};
for (const [g, faces] of groups) if (g.startsWith("joint-")) {
  const vs = [...new Set(faces.flat())]; const c = [0, 0, 0];
  for (const i of vs) { c[0] += verts[i][0]; c[1] += verts[i][1]; c[2] += verts[i][2]; }
  joints[g.slice(6)] = c.map(x => +(x / vs.length / 10).toFixed(5));
}
const asset = {
  format: "human-body/base-mesh", version: "0.1.0",
  source: {
    name: "MakeHuman base mesh (makehuman/data/3dobjs/base.obj), 'body' group and joint helper centroids",
    project: "https://github.com/makehumancommunity/makehuman",
    license: "CC0-1.0 (MakeHuman assets; see LICENSE.md section C of the MakeHuman repository)",
    obtained: "raw.githubusercontent.com/makehumancommunity/makehuman/master, 2026-11-08",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    units: "converted from decimetres to metres; +Y up, +Z forward (face direction)",
    pose: "as modelled: arms roughly 40 degrees from the body, legs slightly apart",
  },
  vertexCount: used.length, triangleCount: triangles.length / 3, positions, triangles, joints,
};
const target = resolve(root, "assets/body/base-mesh/makehuman-base.json");
writeFileSync(target, JSON.stringify(asset) + "\n");
console.log("wrote", target, "vertices", used.length, "triangles", triangles.length / 3, "joints", Object.keys(joints).length);

// Small companion file for body-anatomy: joint centroids and a few mesh measures (metres), no geometry.
const bodyPositions = used.map(v => verts[v].map(x => x / 10));
const ground = joints["ground"][1];
const top = Math.max(...bodyPositions.map(p => p[1]));
const footVerts = bodyPositions.filter(p => p[1] - ground < 0.03 && p[0] > 0);
const footLengthM = Math.max(...footVerts.map(p => p[2])) - Math.min(...footVerts.map(p => p[2]));
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const measures = {
  statureM: +(top - ground).toFixed(5),
  groundY: +ground.toFixed(5),
  handLengthM: +dist(joints["l-hand"], joints["l-finger-3-4"]).toFixed(5),
  footLengthM: +footLengthM.toFixed(5),
  headLengthM: +(joints["head-2"][1] - joints["head"][1]).toFixed(5),
};
const companion = { format: "human-body/base-joints", version: asset.version, source: { ...asset.source, derivedBy: "research/body/scripts/derive-base-mesh.ts", basis: "E (modelled reference body, not a measured person)" }, joints, measures };
const companionTarget = resolve(root, "packages/body-anatomy/src/data/base-joints.json");
writeFileSync(companionTarget, JSON.stringify(companion, null, 1) + "\n");
console.log("wrote", companionTarget, JSON.stringify(measures));
