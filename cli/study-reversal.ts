import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runReversalPartition, compareModels, protocol } from "../research/studies/reversal-v1.ts";
import { HUMAN_MODELS, versionsFor, VERSIONS } from "../packages/simulation/src/index.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--check") { options.set("--check", "true"); continue; }
  if (!["--split", "--out", "--model", "--baseline-model"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i])) throw new Error("Unknown/duplicate option or missing value: " + args[i]);
  options.set(args[i], args[++i]);
}
const split = options.get("--split") ?? "development";
if (split !== "development" && split !== "validation" && split !== "pilot") throw new Error("--split must be development, validation, or pilot");
const modelId = options.get("--model") ?? protocol.model;
const baselineId = options.get("--baseline-model") ?? null;
for (const id of [modelId, baselineId].filter((x): x is string => !!x)) if (!Object.hasOwn(HUMAN_MODELS, id)) throw new Error("Unregistered model: " + id);
const target = resolve(options.get("--out") ?? `outputs/reversal-${split}.json`);
if (!target.endsWith(".json")) throw new Error("Output must be JSON");
function git(...argv: string[]) { try { return execFileSync("git", argv, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "unavailable"; } }
function files(path: string): string[] { return readdirSync(resolve(root, path), { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path + "/" + e.name) : [path + "/" + e.name]); }
function hash(paths: string[]) {
  const digest = createHash("sha256");
  for (const path of [...paths].sort()) { const bytes = readFileSync(resolve(root, path)); digest.update(path + "\0" + bytes.length + "\0"); digest.update(bytes); }
  return digest.digest("hex");
}
const provenance = {
  commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}"), dirty: git("status", "--porcelain") !== "",
  modelHash: hash([...files("packages/human/src"), "packages/simulation/src/models.ts"]),
  evaluatorHash: hash(["research/studies/reversal-v1.ts", "research/protocols/reversal-v1.json", "packages/evaluation/src/index.ts", "cli/study-reversal.ts"]),
  environmentHash: hash([...files("packages/contracts/src"), ...files("packages/world/src"), "packages/simulation/src/random.ts"]),
  dependencyLockHash: hash(["package-lock.json"]), runtime: `Node ${process.version} / ${process.platform} / ${process.arch}`, versions: VERSIONS,
};
const subject = runReversalPartition(split, modelId);
const baseline = baselineId ? runReversalPartition(split, baselineId) : null;
const comparison = baseline ? compareModels(baseline, subject) : null;
const capabilityFailures = subject.checks.filter(c => c.role === "capability" && c.status === "fail").map(c => c.id);
const propertyFailures = subject.checks.filter(c => c.role === "property" && c.status === "fail").map(c => c.id);
const regressions = comparison?.filter(c => c.status === "regressed").map(c => c.id) ?? [];
const gatesMet = !capabilityFailures.length && !regressions.length && (baseline ? true : !propertyFailures.length);
const output = { format: "human-world-lab/reversal-study", schemaVersion: 1, protocol, provenance, versions: { subject: versionsFor(modelId).human, baseline: baselineId ? versionsFor(baselineId).human : null }, seedUse: split === "pilot" ? "pilot seeds: scale check only, not a gate" : split, subject, baseline, comparison, capabilityFailures, propertyFailures, regressions, gatesMet, decision: baseline ? "paired-comparison-requires-review" : "phenomena-of-the-model-not-a-candidate-comparison" };
mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
const f = (x: number, d = 4) => x.toFixed(d);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const lines = ["# 相手の反応の途中変化と忘却（reversal-v1）", "", `- 条件群: ${split}`, `- ソース: ${provenance.commit}`, `- 未コミット変更: ${provenance.dirty}`, `- モデルコードSHA256: ${provenance.modelHash}`, `- 評価器SHA256: ${provenance.evaluatorHash}`, `- 環境SHA256: ${provenance.environmentHash}`, `- 対象モデル: ${modelId}${baselineId ? ` / 旧版: ${baselineId}` : ""}`, `- シード: ${subject.seeds.join(", ")}`, `- 提示: 距離${protocol.exposure.distance}u、危害ブロックでは確率${protocol.exposure.painProbability}で接触痛。履歴長 ${protocol.historyLengths.join("/")}、切替後${protocol.reversedSteps}ステップ。無接触期間は距離${protocol.gap.farDistance}uで ${protocol.gap.lengths.join("/")} ステップ`, "", "値はシードごとの値の平均 ± 標本SD。高いほど予測した現象が強い。人間の信頼や許しの再現ではない。", "", "| 役割 | 項目 | 平均 ± SD | 閾値 | 判定 |", "| --- | --- | ---: | ---: | --- |"];
for (const c of subject.checks) lines.push(`| ${c.role} | ${c.label} | ${f(c.summary.mean)} ± ${f(c.summary.sd)} | ${c.minimum} | ${c.status} |`);
if (comparison && baseline) {
  lines.push("", "## 旧版との対比較", "", "deltaは各項目のpreferredの向き（noneは対象−旧版）。capabilityの低下が許容幅を超えると悪化。", "", "| 項目 | 役割 | 好ましい向き | 旧版 平均 | 対象 平均 | 差の平均 ± SD | 判定 |", "| --- | --- | --- | ---: | ---: | ---: | --- |");
  for (const [i, c] of comparison.entries()) lines.push(`| ${c.id} | ${c.role} | ${c.preferred} | ${f(baseline.checks[i].summary.mean)} | ${f(subject.checks[i].summary.mean)} | ${f(c.delta.mean)} ± ${f(c.delta.sd)} | ${c.status} |`);
}
lines.push("", `capability未達: ${capabilityFailures.join(", ") || "なし"}`, `property未達: ${propertyFailures.join(", ") || "なし"}`, `旧版からの悪化: ${regressions.join(", ") || "なし"}`, `ゲート達成: ${gatesMet}`, "", "## 危険度の軌跡（対象モデル、シード平均）", "", "| 履歴 | 方向 | " + protocol.probeAt.map(s => `切替後${s}`).join(" | ") + " |", "| ---: | --- | " + protocol.probeAt.map(() => "---:").join(" | ") + " |");
const combos = subject.results[0].trajectories.map(t => [t.history, t.direction] as const);
for (const [history, direction] of combos) lines.push(`| ${history} | ${direction} | ` + protocol.probeAt.map(s => f(avg(subject.results.map(r => r.trajectories.find(t => t.history === history && t.direction === direction)!.probes[String(s)].risk)), 3)).join(" | ") + " |");
lines.push("", "無接触期間後の危険度（無害60ステップの後、相手は8uで可視）: " + protocol.gap.lengths.map(g => `${g}ステップ ${f(avg(subject.results.map(r => r.gaps.find(x => x.gap === g)!.probe.risk)), 3)}`).join(" / "), "", "## 解釈の範囲", "", "実験者が提示距離と痛みを操作する制御課題。相手は動かないため予測効用は0で、0.1.0と0.2.0は同じ値になる。更新の遅れと忘却は計算規則の性質で、人間の信頼・許しの再現とは呼ばない。", "");
writeFileSync(target.replace(/\.json$/, ".md"), lines.join("\n"));
console.log(JSON.stringify({ output: target, split, model: modelId, baseline: baselineId, checks: subject.checks.map(c => ({ id: c.id, role: c.role, mean: c.summary.mean, status: c.status })), comparison: comparison?.map(c => ({ id: c.id, delta: c.delta.mean, status: c.status })) ?? null, capabilityFailures, propertyFailures, regressions, gatesMet }, null, 2));
if (options.has("--check") && !gatesMet) process.exitCode = 1;
