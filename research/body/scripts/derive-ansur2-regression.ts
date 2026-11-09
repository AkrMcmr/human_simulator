/**
 * Derive per-sex linear regressions (segment length ~ 1 + stature + mass) from the
 * ANSUR II public CSVs, using only the development split (even subject ids).
 * The raw CSVs stay outside Git; this script records their SHA-256 so the
 * derivation can be checked. Usage:
 *   node --experimental-strip-types research/body/scripts/derive-ansur2-regression.ts <male.csv> <female.csv>
 * Writes packages/body-anatomy/src/data/ansur2-regression.json.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAnsur2, DERIVED_SEGMENTS, isDevelopment, type Subject } from "./ansur2.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const [malePath, femalePath] = process.argv.slice(2);
if (!malePath || !femalePath) throw new Error("Usage: derive-ansur2-regression.ts <male.csv> <female.csv>");

type Fit = { coefficients: [number, number, number]; residualSd: number; r2: number; n: number; mean: number };

function ols(rows: Subject[], key: string): Fit {
  // Normal equations for y = b0 + b1*stature + b2*mass.
  const X = rows.map(r => [1, r.statureM, r.massKg]);
  const y = rows.map(r => r.derived[key]);
  const n = rows.length;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const b = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let p = 0; p < 3; p++) { b[p] += X[i][p] * y[i]; for (let q = 0; q < 3; q++) A[p][q] += X[i][p] * X[i][q]; }
  const coef = solve3(A, b);
  const mean = y.reduce((s, v) => s + v, 0) / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) { const pred = coef[0] + coef[1] * X[i][1] + coef[2] * X[i][2]; ssRes += (y[i] - pred) ** 2; ssTot += (y[i] - mean) ** 2; }
  return { coefficients: [coef[0], coef[1], coef[2]], residualSd: Math.sqrt(ssRes / (n - 3)), r2: 1 - ssRes / ssTot, n, mean };
}
function solve3(A: number[][], b: number[]): [number, number, number] {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let pivot = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}
function percentile(sorted: number[], p: number) { const i = (sorted.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const sd = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (sorted.length - 1));
  return { mean, sd, p5: percentile(sorted, 0.05), p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), n: sorted.length };
}

const files = { male: resolve(malePath), female: resolve(femalePath) };
const hashes = Object.fromEntries(Object.entries(files).map(([k, p]) => [k, createHash("sha256").update(readFileSync(p)).digest("hex")]));
const out: Record<string, unknown> = {
  format: "human-body/anthropometry-regression",
  version: "0.2.0",
  source: {
    name: "ANSUR II public working databases (2012)",
    publisher: "U.S. Army Natick Soldier RD&E Center; cleared for unlimited public release",
    obtainedFrom: "GitHub mirror senihberkay/US-Army-ANSUR-II (files 'ANSUR II MALE Public.csv', 'ANSUR II FEMALE Public.csv')",
    originalDistribution: "https://www.openlab.psu.edu/ansur2/",
    units: "lengths mm, weightkg in hectograms (converted to m and kg here)",
    sha256: hashes,
    split: "development = even subjectid; validation = odd subjectid (protocol morph-v1)",
    basis: "R",
    limitation: "Military sample (age, fitness); not a civilian population. Analyse sexes separately.",
  },
  model: "segmentLengthM = b0 + b1 * statureM + b2 * massKg, fitted by ordinary least squares on the development split only",
  segments: {} as Record<string, unknown>,
  population: {} as Record<string, unknown>,
};
for (const sex of ["male", "female"] as const) {
  const subjects = loadAnsur2(files[sex], sex).filter(isDevelopment);
  const fits: Record<string, Fit> = {};
  for (const key of Object.keys(DERIVED_SEGMENTS)) fits[key] = ols(subjects, key);
  (out.segments as Record<string, unknown>)[sex] = fits;
  (out.population as Record<string, unknown>)[sex] = { statureM: summary(subjects.map(s => s.statureM)), massKg: summary(subjects.map(s => s.massKg)), ageYears: summary(subjects.map(s => s.ageYears)) };
}
const target = resolve(root, "packages/body-anatomy/src/data/ansur2-regression.json");
writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log("wrote", target);
for (const sex of ["male", "female"]) for (const [k, f] of Object.entries((out.segments as Record<string, Record<string, Fit>>)[sex])) console.log(sex, k.padEnd(22), "n=" + f.n, "r2=" + f.r2.toFixed(3), "sd=" + (f.residualSd * 1000).toFixed(1) + "mm");
