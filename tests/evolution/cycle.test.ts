import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { register, seal, run, decide, status, assess, validateSpec, type Spec } from "../../research/evolution/engine.ts";
import type { Report } from "../../packages/evaluation/src/index.ts";
import { conditions, runPair, assessRuns, protocol as worldProtocol } from "../../research/studies/world-v1.ts";
const spec: Spec = JSON.parse(readFileSync("research/evolution/specs/predictive-retrospective.json", "utf8"));
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "evolution-"));
  for (const p of ["packages", "research/protocols", "research/studies", "research/evolution/engine.ts", "research/evolution/models.ts", "cli/evolve.ts", "package-lock.json"]) {
    mkdirSync(dirname(resolve(root, p)), { recursive: true }); cpSync(p, resolve(root, p), { recursive: true });
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"], { cwd: root });
  return root;
}
test("cycle requires registration and sealing, preserves results and records lineage/next work", () => {
  const root = fixture();
  try {
    assert.throws(() => seal(root, spec.id));
    register(root, spec); assert.equal(status(root, spec.id).stage, "registered");
    assert.throws(() => register(root, spec));
    assert.throws(() => run(root, spec.id));
    seal(root, spec.id); assert.throws(() => seal(root, spec.id));
    const result = run(root, spec.id);
    assert.equal(result.assessment.regressionGate, true);
    assert.equal(result.assessment.improvementGate, false, "no primary target must not claim improvement");
    assert.equal(result.assessment.ablationExact, true);
    assert.throws(() => run(root, spec.id));
    assert.deepEqual(run(root, spec.id, true).assessment, result.assessment);
    assert.throws(() => decide(root, spec.id, "promote", "unsupported promotion"));
    const decision = decide(root, spec.id, "retain-candidate", "core regression only; normal-world study pending");
    assert.equal(decision.defaultChanged, false);
    assert.throws(() => decide(root, spec.id, "reject", "overwrite"));
    assert.equal(status(root, spec.id).stage, "decided");
    assert.deepEqual(status(root, spec.id).next, [spec.nextStudy]);
    register(root, { ...spec, id: "child-cycle", parentCycle: spec.id });
    assert.equal(status(root, "child-cycle").parent, spec.id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("changing frozen model or evaluation code requires a new cycle", () => {
  const root = fixture();
  try {
    register(root, spec); seal(root, spec.id);
    const p = resolve(root, "packages/human/src/index.ts"), old = readFileSync(p, "utf8");
    writeFileSync(p, old + "\n// changed candidate\n");
    assert.throws(() => run(root, spec.id), /Frozen source/);
    writeFileSync(p, old);
    const evaluator = resolve(root, "research/protocols/core-v1.json");
    writeFileSync(evaluator, readFileSync(evaluator, "utf8") + "\n");
    assert.throws(() => run(root, spec.id), /Frozen source/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("negative controls cannot pass the regression gate and forged summaries are rejected", () => {
  const baseline: Report = JSON.parse(readFileSync("research/baselines/v0.1.0-core-v1.json", "utf8"));
  const negative: Report = JSON.parse(readFileSync("research/controls/transition-learning-off.json", "utf8"));
  const result = assess(spec, baseline, negative, baseline);
  assert.equal(result.regressionGate, false);
  assert.ok(result.next.some(x => x.startsWith("Explain regression:")));
  const forged = structuredClone(baseline); forged.evaluation.partitions[0].checks[0].summary.mean = 99;
  assert.throws(() => assess(spec, baseline, forged, baseline), /Summary/);
  validateSpec({ ...spec, primary: [{ check: "prediction-gain", minimumGain: .1 }] });
  assert.throws(() => validateSpec({ ...spec, primary: [{ check: "invented-check", minimumGain: .1 }] }));
  assert.throws(() => validateSpec({ ...spec, id: "../escape" }));
});

test("a world-v1 study validates its own check ids, requires world evidence, and gates on both partitions", () => {
  const baseline: Report = JSON.parse(readFileSync("research/baselines/v0.1.0-core-v1.json", "utf8"));
  const worldSpec: Spec = { ...spec, id: "world-cycle", study: "world-v1", primary: [{ check: "contact-harm", minimumGain: .01 }] };
  validateSpec(worldSpec);
  assert.throws(() => validateSpec({ ...worldSpec, primary: [{ check: "prediction-gain", minimumGain: .01 }] }), /world-v1/);
  assert.throws(() => validateSpec({ ...spec, study: "invented" as "core-v1" }), /Unknown study/);
  assert.throws(() => assess(worldSpec, baseline, baseline, baseline), /requires matching evidence/);
  const condition = conditions().find(c => c.id === "shared/d6/low")!;
  const partition = (name: "development" | "validation", seed: number) => {
    const runs = [runPair(condition, seed)];
    return { name, seeds: [seed], models: { ...worldProtocol.models }, conditions: [condition.id], runs, ...assessRuns(name, runs) };
  };
  const world = { development: partition("development", worldProtocol.developmentSeeds[0]), validation: partition("validation", worldProtocol.validationSeeds[0]) };
  const result = assess(worldSpec, baseline, baseline, baseline, world);
  assert.equal(result.study, "world-v1");
  assert.equal(result.primary.length, 2);
  assert.ok(result.primary.every(p => p.partition === "development" || p.partition === "validation"));
  assert.equal(result.worldAblationExact, true);
  const broken = structuredClone(world); broken.validation.ablationExact = false; broken.validation.checks[0].status = "fail";
  const failed = assess(worldSpec, baseline, baseline, baseline, broken);
  assert.equal(failed.regressionGate, false);
  assert.ok(failed.failures.includes("world/validation/contact-harm"));
  assert.ok(failed.next.some(x => x.includes("normal world")));
  assert.throws(() => assess(spec, baseline, baseline, baseline, world), /requires matching evidence/);
});
