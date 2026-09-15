import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runHistoryPartition, protocol } from "../research/studies/history-v1.ts";
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
if (split !== "development" && split !== "validation" && split !== "pilot") throw new Error("--split must be development, validation, or pilot");
const target = resolve(options.get("--out") ?? `outputs/history-${split}.json`);
if (!target.endsWith(".json")) throw new Error("Output must be JSON");
for (const id of [protocol.model, protocol.referenceModel]) if (!Object.hasOwn(HUMAN_MODELS, id)) throw new Error("Protocol names an unregistered model: " + id);
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
  evaluatorHash: hash(["research/studies/history-v1.ts", "research/protocols/history-v1.json", "packages/evaluation/src/index.ts", "cli/study-history.ts"]),
  environmentHash: hash([...files("packages/contracts/src"), ...files("packages/world/src"), "packages/simulation/src/random.ts"]),
  dependencyLockHash: hash(["package-lock.json"]), runtime: `Node ${process.version} / ${process.platform} / ${process.arch}`, versions: VERSIONS,
};
const subject = runHistoryPartition(split, protocol.model);
const reference = runHistoryPartition(split, protocol.referenceModel);
const failed = subject.checks.filter(c => c.status === "fail");
const gatesMet = failed.length === 0;
const output = { format: "human-world-lab/history-study", schemaVersion: 1, protocol, provenance, versions: { subject: versionsFor(protocol.model).human, reference: versionsFor(protocol.referenceModel).human }, seedUse: split === "pilot" ? "pilot seeds: scale check only, not a gate" : split, subject, reference, gatesMet, decision: "phenomena-of-the-default-model-not-a-candidate-comparison" };
mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
const f = (x: number, d = 4) => x.toFixed(d);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const lines = ["# 経験履歴と記憶介入の実験（M2）", "", `- 条件群: ${split}`, `- ソース: ${provenance.commit}`, `- 未コミット変更: ${provenance.dirty}`, `- モデルコードSHA256: ${provenance.modelHash}`, `- 評価器SHA256: ${provenance.evaluatorHash}`, `- 環境SHA256: ${provenance.environmentHash}`, `- 判定モデル: ${protocol.model} / 参照: ${protocol.referenceModel}`, `- シード: ${subject.seeds.join(", ")}`, `- 履歴形成: ${protocol.history.steps}ステップ、距離${protocol.history.distance}u、危害条件では確率${protocol.history.painProbability}で接触痛。強制近接${protocol.forcedRecovery.steps}ステップ、自由行動${protocol.freePhase.steps}ステップ（食料共有/分離）`, "", "値はシードごとの差の平均 ± 標本SD。全項目で高いほど仮説の方向。人間の信頼・恐怖の再現ではない。", "", "| 現象 | 項目 | 判定モデル 平均 ± SD | 参照0.1.0 平均 ± SD | 閾値 | 判定 |", "| --- | --- | ---: | ---: | ---: | --- |"];
for (const [i, c] of subject.checks.entries()) lines.push(`| ${c.phenomenon} | ${c.label} | ${f(c.summary.mean)} ± ${f(c.summary.sd)} | ${f(reference.checks[i].summary.mean)} ± ${f(reference.checks[i].summary.sd)} | ${c.minimum} | ${c.status} |`);
lines.push("", `全ゲート達成（判定モデル）: ${gatesMet}`, "", "## 探索的な観察（判定モデル、シード平均）", "");
const ex = subject.exploratory;
const fk = (pick: (e: (typeof ex)[number]) => number) => f(avg(ex.map(pick)));
lines.push("| 指標 | 食料共有 | 食料分離 |", "| --- | ---: | ---: |",
  `| 危害履歴の危険度低下（自由行動後） | ${fk(e => e.shared.harmRiskDrop)} | ${fk(e => e.separate.harmRiskDrop)} |`,
  `| 危害履歴の近接証拠の増加 | ${fk(e => e.shared.harmCloseEvidenceGain)} | ${fk(e => e.separate.harmCloseEvidenceGain)} |`,
  `| 危害履歴の2.5u未満ステップ数 | ${fk(e => e.shared.harmCloseTicks)} | ${fk(e => e.separate.harmCloseTicks)} |`,
  `| 危害履歴の離隔割合 | ${fk(e => e.shared.harmWithdrawFraction)} | ${fk(e => e.separate.harmWithdrawFraction)} |`,
  `| 無害履歴の離隔割合 | ${fk(e => e.shared.safeWithdrawFraction)} | ${fk(e => e.separate.safeWithdrawFraction)} |`,
  `| 危害履歴の平均距離 | ${fk(e => e.shared.harmMeanDistance)} | ${fk(e => e.separate.harmMeanDistance)} |`,
  `| 評価差（履歴あり−なし）低要求 | ${fk(e => e.shared.marginDifferenceLowNeed)} | ${fk(e => e.separate.marginDifferenceLowNeed)} |`,
  `| 評価差（履歴あり−なし）高要求（空腹0.8） | ${fk(e => e.shared.marginDifferenceHighNeed)} | ${fk(e => e.separate.marginDifferenceHighNeed)} |`,
  `| 予測効用の評価差 低要求 | ${fk(e => e.shared.predictedSafetyMarginLowNeed)} | ${fk(e => e.separate.predictedSafetyMarginLowNeed)} |`,
  `| 予測効用の評価差 高要求 | ${fk(e => e.shared.predictedSafetyMarginHighNeed)} | ${fk(e => e.separate.predictedSafetyMarginHighNeed)} |`,
  "", `強制近接での危険度低下: ${fk(e => e.forced.harmRiskDrop)}（チェックポイント24/48/96の危険度: ${["24", "48", "96"].map(k => fk(e => e.forced.checkpoints[k])).join(" / ")}）`, `履歴直後の危害推定: 危害 ${fk(e => e.afterHistory.harmEstimateHarm)} / 無害 ${fk(e => e.afterHistory.harmEstimateSafe)}、履歴中の痛み回数 ${fk(e => e.afterHistory.painEvents)}`, `履歴直後の予測効用の評価差: ${fk(e => e.afterHistory.predictedSafetyMarginDifference)}（履歴形成中は相手が動かないので0になる設計）`,
  "", "## 解釈の範囲", "", "危害の記憶と回避の関係を、実験者が履歴と記憶を操作して調べた工学的な確認。本人へ条件名・敵味方ラベルは渡さない。P1は0.1.0でも同じ値になる（履歴形成とプローブで予測効用が0のため）。自由行動の結果は相手が新規個体で、二人とも同じモデル。人間の信頼・愛着・恐怖の再現とは呼ばない。", "");
writeFileSync(target.replace(/\.json$/, ".md"), lines.join("\n"));
console.log(JSON.stringify({ output: target, split, checks: subject.checks.map(c => ({ id: c.id, mean: c.summary.mean, status: c.status })), reference: reference.checks.map(c => ({ id: c.id, mean: c.summary.mean })), gatesMet }, null, 2));
if (options.has("--check") && !gatesMet) process.exitCode = 1;
