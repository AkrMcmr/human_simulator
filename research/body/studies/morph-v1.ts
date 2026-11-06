/**
 * morph-v1: compare body-anatomy's regression predictions with measured ANSUR II subjects
 * on one split. The protocol (thresholds, segments, baseline) is fixed in morph-v1.json.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import protocol from "../protocols/morph-v1.json" with { type: "json" };
import { loadAnsur2, isDevelopment, isValidation, type Subject } from "../scripts/ansur2.ts";
import { predictSegmentLengths, ANATOMY_VERSION, REGRESSION_SOURCE } from "../../../packages/body-anatomy/src/index.ts";
import { stableHash } from "../../../packages/body-contracts/src/index.ts";
import { regression } from "../../../packages/body-anatomy/src/index.ts";

export { protocol };
export type Split = "development" | "validation";
export type SegmentResult = { segment: string; sex: "male" | "female"; n: number; mape: number; p90ape: number; meanMeasuredM: number; fixedRatioMape: number | null; primary: boolean; checks: { mape: "pass" | "fail" | "n/a"; p90ape: "pass" | "fail" | "n/a"; vsFixedRatio: "pass" | "fail" | "n/a" } };
export type Report = {
  format: "human-body/morph-study"; protocol: typeof protocol; split: Split; anatomyVersion: string; regressionHash: string; regressionSource: unknown;
  dataSha256: Record<string, string>; results: SegmentResult[]; status: "pass" | "fail"; failures: string[];
};

const percentile = (sorted: number[], p: number) => { const i = (sorted.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

export function runMorphStudy(paths: { male: string; female: string }, split: Split): Report {
  const dataSha256 = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, createHash("sha256").update(readFileSync(p)).digest("hex")]));
  for (const sex of ["male", "female"] as const) if (dataSha256[sex] !== protocol.data.sha256[sex]) throw new Error(`${sex} CSV hash ${dataSha256[sex]} differs from the protocol's ${protocol.data.sha256[sex]}`);
  const filter = split === "development" ? isDevelopment : isValidation;
  const results: SegmentResult[] = [];
  const segments = [...Object.keys(protocol.primarySegments), ...protocol.reportedOnlySegments];
  const ratios = protocol.fixedRatioBaseline.ratios as Record<string, number | undefined>;
  for (const sex of ["male", "female"] as const) {
    const subjects: Subject[] = loadAnsur2(paths[sex], sex).filter(filter);
    const predictions = subjects.map(s => predictSegmentLengths(sex, s.statureM, s.massKg));
    for (const segment of segments) {
      const ape: number[] = [], fixedApe: number[] = [];
      subjects.forEach((s, i) => {
        const measured = s.derived[segment];
        if (!(measured > 0)) return;
        ape.push(Math.abs(predictions[i][segment] - measured) / measured);
        if (ratios[segment] !== undefined) fixedApe.push(Math.abs(ratios[segment]! * s.statureM - measured) / measured);
      });
      const sorted = [...ape].sort((a, b) => a - b);
      const mape = ape.reduce((a, b) => a + b, 0) / ape.length, p90ape = percentile(sorted, 0.9);
      const fixedRatioMape = fixedApe.length ? fixedApe.reduce((a, b) => a + b, 0) / fixedApe.length : null;
      const primary = segment in protocol.primarySegments;
      results.push({
        segment, sex, n: ape.length, mape, p90ape, meanMeasuredM: subjects.reduce((a, s) => a + s.derived[segment], 0) / subjects.length, fixedRatioMape, primary,
        checks: {
          mape: primary ? (mape <= protocol.metrics.mape.threshold ? "pass" : "fail") : "n/a",
          p90ape: primary ? (p90ape <= protocol.metrics.p90ape.threshold ? "pass" : "fail") : "n/a",
          vsFixedRatio: primary && fixedRatioMape !== null ? (mape <= fixedRatioMape ? "pass" : "fail") : "n/a",
        },
      });
    }
  }
  const failures = results.flatMap(r => Object.entries(r.checks).filter(([, v]) => v === "fail").map(([k]) => `${r.sex} ${r.segment} ${k}`));
  return { format: "human-body/morph-study", protocol, split, anatomyVersion: ANATOMY_VERSION, regressionHash: stableHash((regression as { segments: unknown }).segments), regressionSource: REGRESSION_SOURCE, dataSha256, results, status: failures.length ? "fail" : "pass", failures };
}

export function renderMarkdown(report: Report): string {
  const pct = (v: number | null) => v === null ? "–" : (v * 100).toFixed(2) + "%";
  const lines = [
    `# morph-v1 (${report.split}): ${report.status.toUpperCase()}`, "",
    `Protocol \`${report.protocol.id}\` v${report.protocol.version}, registered ${report.protocol.registered}. Anatomy ${report.anatomyVersion}, regression hash \`${report.regressionHash}\`. Data: ${report.protocol.data.name}, split rule: ${report.protocol.split.rule}.`, "",
    `Thresholds (primary segments): MAPE ≤ ${pct(report.protocol.metrics.mape.threshold)}, P90 APE ≤ ${pct(report.protocol.metrics.p90ape.threshold)}, regression MAPE ≤ fixed-ratio MAPE.`, "",
    "| Sex | Segment | n | Mean measured (m) | MAPE | P90 APE | Fixed-ratio MAPE | MAPE | P90 | vs ratio |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...report.results.map(r => `| ${r.sex} | ${r.segment}${r.primary ? "" : " (reported only)"} | ${r.n} | ${r.meanMeasuredM.toFixed(3)} | ${pct(r.mape)} | ${pct(r.p90ape)} | ${pct(r.fixedRatioMape)} | ${r.checks.mape} | ${r.checks.p90ape} | ${r.checks.vsFixedRatio} |`),
    "",
    report.failures.length ? `Failures: ${report.failures.join(", ")}` : "All primary checks passed.",
    "",
    `Claim scope: ${report.protocol.claims}`,
  ];
  return lines.join("\n") + "\n";
}
