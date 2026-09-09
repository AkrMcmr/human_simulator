import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runEvaluation, compareReports, currentModel, summarizeSamples, validateReport, type Report } from "../../packages/evaluation/src/index.ts";
import { VERSIONS } from "../../packages/simulation/src/index.ts";

const provenance = { commit: "test", tree: "test", dirty: false, modelHash: "test", environmentHash: "test", evaluatorHash: "test", dependencyLockHash: "test", runtime: "test", versions: VERSIONS };
const report = (): Report => ({ format: "human-world-lab/evaluation", schemaVersion: 1, provenance, evaluation: runEvaluation() });
const baseline = report();
const negativeControl: Report = { ...baseline, evaluation: runEvaluation({ learningRate: 0 }) };

test("paired-seed statistics retain sample count and do not substitute zero for missing data", () => {
  const result = summarizeSamples([1, 3], "known");
  assert.equal(result.n, 2); assert.equal(result.mean, 2); assert.equal(result.sd, Math.sqrt(2));
  assert.deepEqual(result.interval95, [1, 3]);
  assert.deepEqual(result, summarizeSamples([1, 3], "known"));
  assert.throws(() => summarizeSamples([], "missing"));
  assert.throws(() => summarizeSamples([NaN], "nan"));
});

test("evaluation measurements reproduce and development/validation seeds are disjoint", () => {
  assert.deepEqual(report(), baseline);
  const [dev, validation] = baseline.evaluation.partitions;
  assert.ok(dev.seeds.every(seed => !validation.seeds.includes(seed)));
  for (const part of baseline.evaluation.partitions) {
    assert.equal(part.checks.length, 10);
    for (const check of part.checks) assert.deepEqual(check.samples.map(s => s.seed), part.seeds);
  }
});

test("disabling transition learning causes detectable caution/prediction regressions but leaves lone-agent self-care unchanged", () => {
  const diff = compareReports(baseline, negativeControl);
  for (const name of ["development", "validation"]) {
    assert.equal(diff.find(c => c.partition === name && c.id === "safe-learning")?.status, "regressed");
    assert.equal(diff.find(c => c.partition === name && c.id === "prediction-gain")?.status, "regressed");
    for (const id of ["hunger-relief", "fatigue-relief", "cold-relief"]) assert.equal(diff.find(c => c.partition === name && c.id === id)?.delta.mean, 0);
  }
  const gain = negativeControl.evaluation.partitions[0].checks.find(c => c.id === "prediction-gain")!;
  assert.ok(gain.samples.every(s => s.details.transitionLearningOffMAE > 0 && s.observations > 0));
  assert.ok(gain.samples.every(s => s.value === 0));
  const all = compareReports(baseline, baseline);
  assert.ok(all.every(c => c.delta.mean === 0 && c.status === "within-tolerance"));
});

test("comparisons reject changed evaluators, unmatched seeds, missing samples, and fabricated summaries", () => {
  const changed = structuredClone(baseline); changed.provenance.evaluatorHash = "different";
  assert.throws(() => compareReports(baseline, changed), /Evaluator changed/);
  const environment = structuredClone(baseline); environment.provenance.environmentHash = "other-world";
  assert.throws(() => compareReports(baseline, environment), /Environment or RNG changed/);
  const reordered = structuredClone(baseline); reordered.evaluation.partitions[0].checks[0].samples.reverse();
  assert.throws(() => compareReports(baseline, reordered), /paired/);
  const missing = structuredClone(baseline); missing.evaluation.partitions[0].checks[0].samples = [];
  assert.throws(() => validateReport(missing));
  const forged = structuredClone(baseline); forged.evaluation.partitions[0].checks[0].summary.mean = 99;
  assert.throws(() => validateReport(forged), /Summary/);
  const protocol = structuredClone(baseline); protocol.evaluation.protocol.checks[0].minimum = -99;
  assert.throws(() => validateReport(protocol), /incompatible/);
});

test("non-finite physical outcomes stop the evaluation instead of becoming favorable scores", () => {
  assert.throws(() => runEvaluation({}, { ...currentModel, apply: (state, effect) => {
    const next = currentModel.apply(state, effect); next.body.hunger = NaN; return next;
  } }), /Invalid body|non-finite/);
});

test("CLI saves diagnostic failures and --check returns failure without overwriting a baseline", () => {
  const dir = mkdtempSync(join(tmpdir(), "human-world-eval-"));
  try {
    const params = join(dir, "parameters.json"), output = join(dir, "negative.json");
    writeFileSync(params, JSON.stringify({ learningRate: 0 }));
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "cli/evaluate.ts", "--parameters-file", params, "--out", output, "--check"], { encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr);
    validateReport(JSON.parse(readFileSync(output, "utf8")));
    assert.match(readFileSync(output.replace(/\.json$/, ".md"), "utf8"), /未達/);
    const before = readFileSync(output, "utf8");
    const overwrite = spawnSync(process.execPath, ["--experimental-strip-types", "cli/evaluate.ts", "--baseline", output, "--out", output], { encoding: "utf8" });
    assert.notEqual(overwrite.status, 0); assert.match(overwrite.stderr, /overwrite/);
    assert.equal(readFileSync(output, "utf8"), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
