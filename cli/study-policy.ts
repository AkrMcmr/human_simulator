import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runPolicyPartition, baselineModel, candidateModel, protocol } from "../research/studies/policy-v1.ts";
import { runEvaluation, compareReports, type Report } from "../packages/evaluation/src/index.ts";
import { PREDICTIVE_POLICY, PREDICTIVE_POLICY_VERSION } from "../packages/human/src/predictive-policy.ts";
import { VERSIONS } from "../packages/simulation/src/index.ts";

const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--check") { options.set("--check", "true"); continue; }
  if (!["--split", "--out"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i])) throw new Error("Unknown/duplicate option or missing value: " + args[i]);
  options.set(args[i], args[++i]);
}
const split = options.get("--split") ?? "development";
if (split !== "development" && split !== "validation") throw new Error("--split must be development or validation");
if (JSON.stringify(PREDICTIVE_POLICY) !== JSON.stringify(protocol.candidate)) throw new Error("Candidate constants differ from the registered protocol");
const target = resolve(options.get("--out") ?? `outputs/policy-${split}.json`);
if (!target.endsWith(".json")) throw new Error("Output must be JSON");
function git(...args: string[]) { return execFileSync("git", args, { encoding: "utf8" }).trim(); }
function hash(paths: string[]) {
  const digest = createHash("sha256");
  for (const path of paths.sort()) { const bytes = readFileSync(path); digest.update(path + "\0" + bytes.length + "\0"); digest.update(bytes); }
  return digest.digest("hex");
}
const modelFiles = ["packages/human/src/index.ts", "packages/human/src/predictive-policy.ts"];
const evaluatorFiles = ["research/studies/policy-v1.ts", "research/protocols/policy-v1.json", "research/protocols/core-v1.json", "packages/evaluation/src/index.ts", "cli/study-policy.ts"];
const provenance = { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}"), dirty: git("status", "--porcelain") !== "", modelHash: hash(modelFiles), evaluatorHash: hash(evaluatorFiles), environmentHash: hash(["packages/contracts/src/index.ts", "packages/world/src/index.ts", "packages/simulation/src/random.ts"]), dependencyLockHash: hash(["package-lock.json"]), runtime: `Node ${process.version} / ${process.platform} / ${process.arch}`, versions: VERSIONS };
const baseline: Report = { format: "human-world-lab/evaluation", schemaVersion: 1, provenance, evaluation: runEvaluation({}, baselineModel) };
const candidate: Report = { ...baseline, provenance: { ...provenance, versions: { ...VERSIONS, human: PREDICTIVE_POLICY_VERSION } }, evaluation: runEvaluation({}, candidateModel) };
const coreComparison = compareReports(baseline, candidate);
const coreFailures = candidate.evaluation.partitions.flatMap(p => p.checks.filter(c => c.status === "fail").map(c => p.name + "/" + c.id));
const coreRegressions = coreComparison.filter(c => c.status === "regressed");
const policy = runPolicyPartition(split);
const failed = policy.checks.filter(c => c.status === "fail");
const gatesMet = !failed.length && policy.ablationExact && !coreFailures.length && !coreRegressions.length;
const output = { format: "human-world-lab/policy-study", schemaVersion: 1, protocol, provenance, variants: { baseline: VERSIONS.human, candidate: PREDICTIVE_POLICY_VERSION, ablated: "v0.1.0 with zero outcome bonus" }, policy, core: { baseline, candidate, comparison: coreComparison }, gatesMet, decision: "requires-review-not-default-promotion" };
mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
const lines = ["# 予測を行動選択へ接続する比較実験", "", `- 条件群: ${split}`, `- ソース: ${provenance.commit}`, `- 未コミット変更: ${provenance.dirty}`, `- モデルコードSHA256: ${provenance.modelHash}`, `- 評価器SHA256: ${provenance.evaluatorHash}`, `- 旧版: ${VERSIONS.human} / 候補: ${PREDICTIVE_POLICY_VERSION}`, `- シード: ${policy.seeds.join(", ")}`, "", "値はcandidate−baselineの最終48試行の距離変化。無関係条件は差の絶対値の負、null-bonusは候補効用寄与の最大絶対値の平均の負。全項目で高い方が良い方向。区間はシード単位のばらつきの目安で、人間データへの推論ではない。", "", "| 項目 | 平均 ± SD | 閾値 | 判定 |", "| --- | ---: | ---: | --- |"];
for (const c of policy.checks) lines.push(`| ${c.label} | ${c.summary.mean.toFixed(4)} ± ${c.summary.sd.toFixed(4)} | ${c.minimum} | ${c.status} |`);
lines.push("", `寄与無効と旧版の測定値が一致: ${policy.ablationExact}`, `core-v1未達: ${coreFailures.join(", ") || "なし"}`, `core-v1の許容幅を超える悪化: ${coreRegressions.map(c => c.partition + "/" + c.id).join(", ") || "なし"}`, `全ゲート達成: ${gatesMet}`, "", "## 旧版と候補の結果", "", "| 相手の反応 | 旧版の平均距離変化 | 候補の平均距離変化 |", "| --- | ---: | ---: |");
for (const row of policy.runs) { const avg = (variant: "baseline" | "candidate") => row.samples.reduce((s, x) => s + x[variant].finalOutcome, 0) / row.samples.length; lines.push(`| ${row.condition} | ${avg("baseline").toFixed(4)} | ${avg("candidate").toFixed(4)} |`); }
lines.push("", "## 解釈の範囲", "", "実験者が反応規則と試行リセットを与える制御課題。自分の動作と相手の移動の関係を利用する能力を調べている。実際の人間の認知、社会、自由行動での有効性を実証していない。デフォルトへの自動昇格はしない。", "");
writeFileSync(target.replace(/\.json$/, ".md"), lines.join("\n"));
console.log(JSON.stringify({ output: target, split, checks: policy.checks.map(c => ({ id: c.id, mean: c.summary.mean, status: c.status })), ablationExact: policy.ablationExact, coreFailures, coreRegressions: coreRegressions.map(c => c.partition + "/" + c.id), gatesMet }, null, 2));
if (options.has("--check") && !gatesMet) process.exitCode = 1;
