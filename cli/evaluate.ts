import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runEvaluation, compareReports, validateReport, type Report } from "../packages/evaluation/src/index.ts";
import { VERSIONS } from "../packages/simulation/src/index.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(["--check"]), options = new Set(["--out", "--baseline", "--parameters-file"]);
const values = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  const name = args[i];
  if (flags.has(name)) { values.set(name, "true"); continue; }
  if (!options.has(name) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Unknown option or missing value: " + name);
  if (values.has(name)) throw new Error("Duplicate option: " + name);
  values.set(name, args[++i]);
}
function git(...argv: string[]) {
  try { return execFileSync("git", argv, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return "unavailable"; }
}
function files(path: string): string[] {
  return readdirSync(resolve(root, path), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path + "/" + entry.name) : [path + "/" + entry.name]);
}
function hash(paths: string[]) {
  const digest = createHash("sha256");
  for (const path of [...paths].sort()) { const bytes = readFileSync(resolve(root, path)); digest.update(path + "\0" + bytes.length + "\0"); digest.update(bytes); }
  return digest.digest("hex");
}
const parameterPath = values.get("--parameters-file");
const parameters = parameterPath ? JSON.parse(readFileSync(resolve(parameterPath), "utf8")) : {};
if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("Parameters must be a JSON object");
const report: Report = {
  format: "human-world-lab/evaluation", schemaVersion: 1,
  provenance: {
    commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}"), dirty: git("status", "--porcelain") !== "",
    modelHash: hash(["human", "world", "contracts", "simulation"].flatMap(name => files("packages/" + name + "/src"))),
    environmentHash: hash([...files("packages/world/src"), ...files("packages/contracts/src"), "packages/simulation/src/random.ts"]),
    evaluatorHash: hash([...files("packages/evaluation/src"), "research/protocols/core-v1.json", "cli/evaluate.ts"]),
    dependencyLockHash: hash(["package-lock.json"]), runtime: `Node ${process.version} / ${process.platform} / ${process.arch}`, versions: VERSIONS,
  },
  evaluation: runEvaluation(parameters),
};
validateReport(report);
const baselinePath = values.get("--baseline");
const baseline: unknown = baselinePath ? JSON.parse(readFileSync(resolve(baselinePath), "utf8")) : null;
if (baseline) validateReport(baseline);
const comparison = baseline ? compareReports(baseline as Report, report) : null;
const failures = report.evaluation.partitions.flatMap(p => p.checks.filter(c => c.status === "fail").map(c => p.name + "/" + c.id));
const regressions = comparison?.filter(c => c.status === "regressed") ?? [];
const output = { ...report, comparison: comparison ? { baseline: { path: relative(root, resolve(baselinePath!)), provenance: (baseline as Report).provenance, parameters: (baseline as Report).evaluation.parameters }, results: comparison } : null, decision: "requires-human-review" };
const target = resolve(values.get("--out") ?? "outputs/evaluation.json");
if (!target.endsWith(".json")) throw new Error("Output must end in .json");
if (baselinePath && resolve(baselinePath) === target) throw new Error("Refusing to overwrite the baseline with a candidate");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
const lines = ["# 基礎能力の評価", "", "工学的な仮説のチェックです。人間としての精度・言語の創発は未検証です。", "", `- モデル版: ${JSON.stringify(VERSIONS)}`, `- ソース: ${report.provenance.commit}`, `- 未コミット変更: ${report.provenance.dirty}`, `- モデルSHA256: ${report.provenance.modelHash}`, `- 評価器SHA256: ${report.provenance.evaluatorHash}`, `- パラメータ: ${JSON.stringify(report.evaluation.parameters)}`, "", "値はすべて高いほど良い方向。平均 ± 標本SD、区間はシードを単位としたブートストラップの目安。閾値は工学的仮定で、人間データ由来ではありません。", ""];
for (const part of report.evaluation.partitions) {
  lines.push(`## ${part.name}`, "", `シード: ${part.seeds.join(", ")}。各チェック n=${part.seeds.length}。`, "", "| 項目 | 平均 ± SD | 区間の目安 | 閾値 | 判定 |", "| --- | ---: | --- | ---: | --- |");
  for (const check of part.checks) {
    const s = check.summary;
    lines.push(`| ${check.label} | ${s.mean.toFixed(4)} ± ${s.sd.toFixed(4)} | ${s.interval95.map(x => x.toFixed(4)).join(" – ")} | ${check.minimum} | ${check.status === "pass" ? "達成" : "未達"} |`);
  }
  lines.push("");
}
if (comparison) {
  lines.push("## 旧版との差", "", "同じシードで candidate − baseline。許容幅を超えた平均差を表示し、統計的有意差や自動採用とは扱いません。", "", "| 条件 | 項目 | 平均差 | 判定 |", "| --- | --- | ---: | --- |");
  for (const c of comparison) lines.push(`| ${c.partition} | ${c.label} | ${c.delta.mean.toFixed(4)} | ${c.status} |`);
  lines.push("");
}
lines.push("## 判断", "", "自動採用しません。研究台帳に改善・悪化・仮定の増加・採否の理由を記録してください。", "", "確認シードはこの実行で観察済みになります。次の新規仮説には未使用条件を別途用意します。", "");
writeFileSync(target.replace(/\.json$/, ".md"), lines.join("\n"));
console.log(JSON.stringify({ output: target, modelHash: report.provenance.modelHash, evaluatorHash: report.provenance.evaluatorHash, checks: report.evaluation.partitions.map(p => ({ partition: p.name, passed: p.checks.filter(c => c.status === "pass").length, total: p.checks.length })), failures, regressions: regressions.map(c => c.partition + "/" + c.id), decision: "requires-human-review" }, null, 2));
if (values.has("--check") && (failures.length || regressions.length)) process.exitCode = 1;
