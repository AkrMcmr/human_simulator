import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { runEvaluation, compareReports, type Report } from "../../packages/evaluation/src/index.ts";
import { models } from "./models.ts";

export type Spec = {
  id: string; parentCycle: string | null; registration: "prospective" | "retrospective";
  hypothesis: string; mechanism: string; falsifier: string; assumptions: string[];
  baseline: string; candidate: string; ablated: string;
  primary: { check: string; minimumGain: number }[];
  nextStudy: string;
};
export type Snapshot = { commit: string; tree: string; dirty: boolean; hash: string };
export type Cycle = {
  schemaVersion: 1; spec: Spec; specHash: string; registered: Snapshot;
  evaluationHash: string; sealed?: Snapshot;
};
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function files(root: string, path: string): string[] {
  return readdirSync(resolve(root, path), { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(root, path + "/" + e.name) : [path + "/" + e.name]);
}
function hashFiles(root: string, paths: string[]) {
  return digest([...new Set(paths)].sort().map(p => [p, readFileSync(resolve(root, p), "utf8")]));
}
function evaluationHash(root: string) {
  return hashFiles(root, [...files(root, "packages/evaluation/src"), ...files(root, "packages/contracts/src"), ...files(root, "packages/world/src"), "packages/simulation/src/random.ts", "research/protocols/core-v1.json", "research/evolution/engine.ts", "cli/evolve.ts", "package-lock.json"]);
}
function snapshot(root: string): Snapshot {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  return { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}"), dirty: git("status", "--porcelain") !== "", hash: hashFiles(root, [...files(root, "packages/human/src"), "research/evolution/models.ts"]) };
}
export function validateSpec(s: Spec) {
  if (!s || !/^[a-z][a-z0-9-]{2,70}$/.test(s.id) || !["prospective", "retrospective"].includes(s.registration)) throw Error("Invalid cycle id or registration kind");
  if (s.parentCycle !== null && !/^[a-z][a-z0-9-]{2,70}$/.test(s.parentCycle)) throw Error("Invalid parent cycle");
  for (const field of ["hypothesis", "mechanism", "falsifier", "nextStudy"] as const) if (typeof s[field] !== "string" || !s[field].trim()) throw Error("Missing " + field);
  if (!Array.isArray(s.assumptions) || !s.assumptions.length || s.assumptions.some(x => typeof x !== "string" || !x.trim())) throw Error("Record assumptions");
  for (const id of [s.baseline, s.candidate, s.ablated]) if (typeof id !== "string" || !id.trim()) throw Error("Missing model id");
  if (new Set([s.baseline, s.candidate, s.ablated]).size !== 3) throw Error("Use distinct model identities");
  const protocol = json(resolve(import.meta.dirname, "../protocols/core-v1.json"));
  if (!Array.isArray(s.primary) || new Set(s.primary.map(p => p.check)).size !== s.primary.length || s.primary.some(p => !protocol.checks.some((c: {id: string}) => c.id === p.check) || !Number.isFinite(p.minimumGain) || p.minimumGain <= 0)) throw Error("Invalid primary gain criterion");
}
function saveNew(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}
function loadCycle(root: string, id: string): { dir: string; cycle: Cycle } {
  if (!/^[a-z][a-z0-9-]{2,70}$/.test(id)) throw Error("Invalid cycle id");
  const dir = resolve(root, "research/evolution/cycles", id);
  const cycle = json(dir + "/registration.json") as Cycle;
  validateSpec(cycle.spec);
  if (cycle.schemaVersion !== 1 || cycle.spec.id !== id || cycle.specHash !== digest(cycle.spec)) throw Error("Registration changed");
  return { dir, cycle };
}
export function register(root: string, spec: Spec) {
  validateSpec(spec);
  if (spec.parentCycle) loadCycle(root, spec.parentCycle);
  const cycle: Cycle = { schemaVersion: 1, spec: structuredClone(spec), specHash: digest(spec), registered: snapshot(root), evaluationHash: evaluationHash(root) };
  saveNew(resolve(root, "research/evolution/cycles", spec.id, "registration.json"), cycle);
  return cycle;
}
export function seal(root: string, id: string) {
  const { dir, cycle } = loadCycle(root, id);
  if (evaluationHash(root) !== cycle.evaluationHash) throw Error("Evaluator/environment changed since registration; create a new cycle");
  for (const key of [cycle.spec.baseline, cycle.spec.candidate, cycle.spec.ablated]) if (!Object.hasOwn(models, key)) throw Error("Register implementation in models.ts: " + key);
  const sealed = snapshot(root);
  saveNew(dir + "/seal.json", { specHash: cycle.specHash, evaluationHash: cycle.evaluationHash, sealed });
  return sealed;
}
export function assess(spec: Spec, baseline: Report, candidate: Report, ablated: Report) {
  const comparison = compareReports(baseline, candidate);
  compareReports(baseline, ablated);
  const failures = candidate.evaluation.partitions.flatMap(p => p.checks.filter(c => c.status === "fail").map(c => p.name + "/" + c.id));
  const regressions = comparison.filter(c => c.status === "regressed");
  const ablationExact = JSON.stringify(baseline.evaluation.partitions) === JSON.stringify(ablated.evaluation.partitions);
  const primary = spec.primary.flatMap(p => comparison.filter(c => c.id === p.check).map(c => ({ partition: c.partition, check: p.check, gain: c.delta.mean, minimumGain: p.minimumGain, passed: c.delta.mean >= p.minimumGain })));
  const regressionGate = !failures.length && !regressions.length && ablationExact;
  const improvementGate = regressionGate && primary.length > 0 && primary.every(p => p.passed);
  const next = [
    ...failures.map(id => "Restore required capability: " + id),
    ...regressions.map(c => "Explain regression: " + c.partition + "/" + c.id),
    ...(!ablationExact ? ["Explain why disabling the new mechanism does not recover the parent model"] : []),
    ...primary.filter(p => !p.passed).map(p => "Revise or reject hypothesis: " + p.partition + "/" + p.check),
    spec.nextStudy,
  ];
  return { comparison, failures, regressions, ablationExact, primary, regressionGate, improvementGate, next };
}
export function run(root: string, id: string, replay = false) {
  const { dir, cycle } = loadCycle(root, id);
  if (!replay && (existsSync(dir + "/result.json") || existsSync(dir + "/decision.json"))) throw Error("Cycle already evaluated; preserve evidence and create a child cycle");
  const lock = json(dir + "/seal.json");
  const current = snapshot(root);
  if (lock.specHash !== cycle.specHash || lock.evaluationHash !== cycle.evaluationHash || current.hash !== lock.sealed.hash || evaluationHash(root) !== cycle.evaluationHash) throw Error("Frozen source or protocol changed; create a new cycle");
  const report = (model: string): Report => ({ format: "human-world-lab/evaluation", schemaVersion: 1, provenance: { ...current, modelHash: current.hash, evaluatorHash: cycle.evaluationHash, environmentHash: cycle.evaluationHash, dependencyLockHash: hashFiles(root, ["package-lock.json"]), runtime: process.version, versions: { human: model } }, evaluation: runEvaluation({}, models[model]) });
  const baseline = report(cycle.spec.baseline), candidate = report(cycle.spec.candidate), ablated = report(cycle.spec.ablated);
  const assessment = assess(cycle.spec, baseline, candidate, ablated);
  const result = { schemaVersion: 1, specHash: cycle.specHash, sealedHash: lock.sealed.hash, evaluatorHash: cycle.evaluationHash, seedUse: "core-v1 seeds already observed; regression evidence only", baseline, candidate, ablated, assessment };
  if (replay) {
    const saved = json(dir + "/result.json");
    if (digest(saved) !== json(dir + "/next.json").resultHash || saved.specHash !== cycle.specHash || saved.sealedHash !== lock.sealed.hash || saved.evaluatorHash !== cycle.evaluationHash) throw Error("Saved evidence changed");
    for (const key of ["baseline", "candidate", "ablated"] as const) if (digest(saved[key].evaluation) !== digest(result[key].evaluation)) throw Error("Replay mismatch: " + key);
    if (digest(saved.assessment) !== digest(assessment)) throw Error("Replay assessment mismatch");
    return result;
  }
  saveNew(dir + "/result.json", result);
  saveNew(dir + "/next.json", { cycle: id, resultHash: digest(result), tasks: assessment.next });
  return result;
}
export function decide(root: string, id: string, outcome: string, reason: string) {
  const { dir, cycle } = loadCycle(root, id);
  if (!["retain-candidate", "revise", "reject"].includes(outcome) || !reason?.trim()) throw Error("Use retain-candidate/revise/reject and a reason; this command does not promote defaults");
  const result = json(dir + "/result.json");
  const lock = json(dir + "/seal.json");
  if (result.specHash !== cycle.specHash || result.sealedHash !== lock.sealed.hash || result.evaluatorHash !== cycle.evaluationHash) throw Error("Evidence does not match registration");
  const assessment = assess(cycle.spec, result.baseline, result.candidate, result.ablated);
  if (digest(assessment) !== digest(result.assessment)) throw Error("Assessment changed");
  if (digest(result) !== json(dir + "/next.json").resultHash) throw Error("Result changed after evaluation");
  if (outcome === "retain-candidate" && (!assessment.regressionGate || (cycle.spec.primary.length > 0 && !assessment.improvementGate))) throw Error("Failed regression gate: revise or reject");
  const decision = { outcome, reason, resultHash: digest(result), specHash: cycle.specHash, source: snapshot(root), defaultChanged: false };
  saveNew(dir + "/decision.json", decision);
  return decision;
}
export function status(root: string, id: string) {
  const { dir, cycle } = loadCycle(root, id);
  return { id, parent: cycle.spec.parentCycle, hypothesis: cycle.spec.hypothesis, stage: existsSync(dir + "/decision.json") ? "decided" : existsSync(dir + "/result.json") ? "evaluated" : existsSync(dir + "/seal.json") ? "sealed" : "registered", decision: existsSync(dir + "/decision.json") ? json(dir + "/decision.json").outcome : null, next: existsSync(dir + "/next.json") ? json(dir + "/next.json").tasks : [cycle.spec.nextStudy] };
}
