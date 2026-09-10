import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorldPartition, protocol } from "../research/studies/world-v1.ts";
import { runEvaluation, compareReports, type Report } from "../packages/evaluation/src/index.ts";
import { HUMAN_MODELS, versionsFor, VERSIONS } from "../packages/simulation/src/index.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--check") { options.set("--check", "true"); continue; }
  if (!["--split", "--out"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i])) throw new Error("Unknown/duplicate option or missing value: " + args[i]);
  options.set(args[i], args[++i]);
}
const split = options.get("--split") ?? "development";
if (split !== "development" && split !== "validation") throw new Error("--split must be development or validation");
const target = resolve(options.get("--out") ?? `outputs/world-${split}.json`);
if (!target.endsWith(".json")) throw new Error("Output must be JSON");
for (const id of Object.values(protocol.models)) if (!Object.hasOwn(HUMAN_MODELS, id)) throw new Error("Protocol names an unregistered model: " + id);
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
  evaluatorHash: hash(["research/studies/world-v1.ts", "research/protocols/world-v1.json", "research/protocols/core-v1.json", "packages/evaluation/src/index.ts", "packages/experiments/src/index.ts", "cli/study-world.ts"]),
  environmentHash: hash([...files("packages/contracts/src"), ...files("packages/world/src"), "packages/simulation/src/index.ts", "packages/simulation/src/random.ts"]),
  dependencyLockHash: hash(["package-lock.json"]), runtime: `Node ${process.version} / ${process.platform} / ${process.arch}`, versions: VERSIONS,
};
const models = { baseline: HUMAN_MODELS[protocol.models.baseline], candidate: HUMAN_MODELS[protocol.models.candidate] };
const coreBaseline: Report = { format: "human-world-lab/evaluation", schemaVersion: 1, provenance: { ...provenance, versions: versionsFor(models.baseline.id) }, evaluation: runEvaluation({}, models.baseline) };
const coreCandidate: Report = { format: "human-world-lab/evaluation", schemaVersion: 1, provenance: { ...provenance, versions: versionsFor(models.candidate.id) }, evaluation: runEvaluation({}, models.candidate) };
const coreComparison = compareReports(coreBaseline, coreCandidate);
const coreFailures = coreCandidate.evaluation.partitions.flatMap(p => p.checks.filter(c => c.status === "fail").map(c => p.name + "/" + c.id));
const coreRegressions = coreComparison.filter(c => c.status === "regressed");
const world = runWorldPartition(split);
const primaryMet = world.checks.filter(c => c.role === "primary").every(c => c.status === "pass");
const sideEffectsMet = world.checks.filter(c => c.role === "side-effect").every(c => c.status === "pass") && world.ablationExact && !coreFailures.length && !coreRegressions.length;
const gatesMet = primaryMet && sideEffectsMet;
const output = { format: "human-world-lab/world-study", schemaVersion: 1, protocol, provenance, variants: { baseline: versionsFor(protocol.models.baseline).human, candidate: versionsFor(protocol.models.candidate).human, ablated: versionsFor(protocol.models.ablated).human }, world, core: { baseline: coreBaseline, candidate: coreCandidate, comparison: coreComparison }, primaryMet, sideEffectsMet, gatesMet, decision: "requires-review-not-default-promotion" };
mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
const f = (x: number, d = 4) => x.toFixed(d);
const lines = ["# 通常worldでの三版比較（M1）", "", `- 条件群: ${split}`, `- ソース: ${provenance.commit}`, `- 未コミット変更: ${provenance.dirty}`, `- モデルコードSHA256: ${provenance.modelHash}`, `- 評価器SHA256: ${provenance.evaluatorHash}`, `- 環境SHA256: ${provenance.environmentHash}`, `- 旧版: ${protocol.models.baseline} / 候補: ${protocol.models.candidate} / 寄与無効: ${protocol.models.ablated}`, `- シード: ${world.seeds.join(", ")}`, `- 条件: ${world.conditions.join(", ")}`, `- 実行長: ${protocol.horizon}ステップ、二人とも同じモデルで判断`, "", "値は条件×シードの対ごとの差の平均 ± 標本SD。方向は全項目で高いほど良い側にそろえている。区間や有意差の主張はしない。人間データへの推論ではない。", "", "| 役割 | 項目 | 範囲 | n | 平均 ± SD | 閾値 | 判定 |", "| --- | --- | --- | ---: | ---: | ---: | --- |"];
for (const c of world.checks) lines.push(`| ${c.role} | ${c.label} | ${c.scope} | ${c.samples} | ${f(c.summary.mean)} ± ${f(c.summary.sd)} | ${c.minimum} | ${c.status} |`);
lines.push("", `寄与無効と旧版の最終world・身体・行動系列・指標が一致: ${world.ablationExact}`, `core-v1未達: ${coreFailures.join(", ") || "なし"}`, `core-v1の許容幅を超える悪化: ${coreRegressions.map(c => c.partition + "/" + c.id).join(", ") || "なし"}`, `主要効果の達成: ${primaryMet}`, `副作用条件の達成: ${sideEffectsMet}`, `全ゲート達成: ${gatesMet}`, "", "## 条件別の旧版→候補（8シード平均）", "", "| 条件 | 接触ステップ割合 | 危険度平均 | 離隔割合 | 接近割合 | 4u未満割合 | 視認割合 | 要求負担 | 生活技能割合 | 予測誤差 | 候補の寄与が非ゼロの割合 | 寄与の平均絶対値 |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
const arrow = (row: (typeof world.perCondition)[number], key: keyof (typeof row)["baseline"], d = 3) => `${f(row.baseline[key], d)}→${f(row.candidate[key], d)}`;
for (const row of world.perCondition) lines.push(`| ${row.condition} | ${arrow(row, "contactTicks")} | ${arrow(row, "meanRisk")} | ${arrow(row, "withdrawFraction")} | ${arrow(row, "approachFraction")} | ${arrow(row, "closeFraction")} | ${arrow(row, "visibleFraction")} | ${arrow(row, "needBurden")} | ${arrow(row, "reliefFraction")} | ${arrow(row, "predictionMAE")} | ${f(row.candidate.bonusActiveFraction, 3)} | ${f(row.candidate.bonusMagnitude, 4)} |`);
lines.push("", "## 解釈の範囲", "", "二人とも同じ規則で内生的に判断する抽象的な二人worldでの工学的比較。資源が分かれた配置では二人がほとんど出会わないため、主要効果は資源共有の配置で判定し、分離配置は副作用の対照として扱う。近接や発声の増減そのものを良し悪しとしない。人間の認知・社会への妥当性、混在モデル（片方だけ候補）の挙動は未検証。デフォルトへの自動昇格はしない。", "");
writeFileSync(target.replace(/\.json$/, ".md"), lines.join("\n"));
console.log(JSON.stringify({ output: target, split, checks: world.checks.map(c => ({ id: c.id, role: c.role, n: c.samples, mean: c.summary.mean, status: c.status })), ablationExact: world.ablationExact, coreFailures, coreRegressions: coreRegressions.map(c => c.partition + "/" + c.id), primaryMet, sideEffectsMet, gatesMet }, null, 2));
if (options.has("--check") && !gatesMet) process.exitCode = 1;
