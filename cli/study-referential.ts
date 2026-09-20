import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runReferentialPartition, protocol } from "../research/studies/referential-v1.ts";
import { HUMAN_MODELS, versionsFor, VERSIONS } from "../packages/simulation/src/index.ts";

/** Information-asymmetry foraging diagnostics for one or more registered models. */
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const options = new Map<string, string>();
const modelIds: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--check") { options.set("--check", "true"); continue; }
  if (args[i] === "--model") { if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Missing value for --model"); modelIds.push(args[++i]); continue; }
  if (!["--split", "--out"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i])) throw new Error("Unknown/duplicate option or missing value: " + args[i]);
  options.set(args[i], args[++i]);
}
const split = options.get("--split") ?? "development";
if (split !== "development" && split !== "validation" && split !== "pilot") throw new Error("--split must be development, validation, or pilot");
if (!modelIds.length) modelIds.push(protocol.models.baseline);
for (const id of modelIds) if (!Object.hasOwn(HUMAN_MODELS, id)) throw new Error("Unregistered model: " + id);
const target = resolve(options.get("--out") ?? `outputs/referential-${split}.json`);
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
  evaluatorHash: hash(["research/studies/referential-v1.ts", "research/protocols/referential-v1.json", "packages/evaluation/src/index.ts", "cli/study-referential.ts"]),
  environmentHash: hash([...files("packages/contracts/src"), ...files("packages/world/src"), "packages/simulation/src/index.ts", "packages/simulation/src/random.ts"]),
  dependencyLockHash: hash(["package-lock.json"]), runtime: `Node ${process.version} / ${process.platform} / ${process.arch}`, versions: VERSIONS,
};
const partitions = modelIds.map(id => runReferentialPartition(split, id));
const output = { format: "human-world-lab/referential-study", schemaVersion: 1, protocol, provenance, seedUse: split === "pilot" ? "pilot seeds: scale check only, not a gate" : split, models: Object.fromEntries(modelIds.map(id => [id, versionsFor(id).human])), partitions, established: Object.fromEntries(partitions.map(p => [p.model, p.established])), decision: "diagnostics-of-registered-models-not-default-promotion" };
mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
const f = (x: number, d = 4) => x.toFixed(d);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const lines = ["# 情報の非対称がある採餌課題（referential-v1）", "", `- 条件群: ${split}`, `- ソース: ${provenance.commit}`, `- 未コミット変更: ${provenance.dirty}`, `- モデルコードSHA256: ${provenance.modelHash}`, `- 評価器SHA256: ${provenance.evaluatorHash}`, `- 環境SHA256: ${provenance.environmentHash}`, `- シード: ${partitions[0].seeds.join(", ")}`, `- 実行: ${protocol.horizon}ステップ、視界${protocol.world.visionRadius}u、聴覚${protocol.world.hearingRadius}u、食料3か所（各0.6）、初期空腹${protocol.body.hunger}、二人とも同じモデル。対照は音なし、方向をでたらめにする介入、音の特徴をでたらめにする介入`, "", "値はシードごとの差の平均 ± 標本SD。高いほど「声が食料の手掛かりとして働く」方向。人間の言語や意図の再現ではない。", ""];
for (const p of partitions) {
  lines.push(`## ${p.model}`, "", "| 項目 | 平均 ± SD | 閾値 | 判定 |", "| --- | ---: | ---: | --- |");
  for (const c of p.checks) lines.push(`| ${c.label ?? c.id} | ${f(c.summary.mean)} ± ${f(c.summary.sd)} | ${c.minimum ?? "報告のみ"} | ${c.status} |`);
  const s = (k: "sound" | "muted" | "misdirected" | "scrambled", pick: (r: (typeof p.results)[number]["sound"]) => number, d = 3) => f(avg(p.results.map(r => pick(r[k]))), d);
  lines.push("", `成立: ${p.established}`, "", "| 指標 | 音あり | 音なし | でたらめ方向 | でたらめ特徴 |", "| --- | ---: | ---: | ---: | ---: |",
    `| 空腹の平均 | ${s("sound", r => r.meanHunger)} | ${s("muted", r => r.meanHunger)} | ${s("misdirected", r => r.meanHunger)} | ${s("scrambled", r => r.meanHunger)} |`,
    `| 初回摂食までのステップ（平均） | ${s("sound", r => r.meanFirstFoodTick, 0)} | ${s("muted", r => r.meanFirstFoodTick, 0)} | ${s("misdirected", r => r.meanFirstFoodTick, 0)} | ${s("scrambled", r => r.meanFirstFoodTick, 0)} |`,
    `| 摂食量の合計 | ${s("sound", r => r.foodIntake)} | ${s("muted", r => r.foodIntake)} | ${s("misdirected", r => r.foodIntake)} | ${s("scrambled", r => r.foodIntake)} |`,
    `| 聞いた回数 / 音源が見えなかった回数 | ${s("sound", r => r.heardEvents, 0)} / ${s("sound", r => r.unseenHeardEvents, 0)} | 0 / 0 | ${s("misdirected", r => r.heardEvents, 0)} / ${s("misdirected", r => r.unseenHeardEvents, 0)} | ${s("scrambled", r => r.heardEvents, 0)} / ${s("scrambled", r => r.unseenHeardEvents, 0)} |`,
    `| 音を聞いた直後に音源の方へ動いた割合 | ${s("sound", r => r.towardSourceFraction)} | — | ${s("misdirected", r => r.towardSourceFraction)} | ${s("scrambled", r => r.towardSourceFraction)} |`,
    `| 初回摂食が聞いた直後（${protocol.hearWindow}ステップ以内）だった割合 | ${s("sound", r => r.foodAfterHearingFraction)} | — | ${s("misdirected", r => r.foodAfterHearingFraction)} | ${s("scrambled", r => r.foodAfterHearingFraction)} |`,
    `| 接触ステップ割合 | ${s("sound", r => r.contactTicks)} | ${s("muted", r => r.contactTicks)} | ${s("misdirected", r => r.contactTicks)} | ${s("scrambled", r => r.contactTicks)} |`,
    `| 4u未満の割合 | ${s("sound", r => r.closeFraction)} | ${s("muted", r => r.closeFraction)} | ${s("misdirected", r => r.closeFraction)} | ${s("scrambled", r => r.closeFraction)} |`,
    `| 最低健康 | ${s("sound", r => r.minimumHealth)} | ${s("muted", r => r.minimumHealth)} | ${s("misdirected", r => r.minimumHealth)} | ${s("scrambled", r => r.minimumHealth)} |`, "");
}
lines.push("## 解釈の範囲", "", "音に意味・正解・成功ラベルを与えない自由worldでの診断。方向への定位は生得の知覚と探索傾向。成立の判定は事前登録した4項目で、音の種類への依存（でたらめ特徴で利益が減る）がなければ「定位による手掛かり利用」に留まる。人間の言語や意図の再現ではない。", "");
writeFileSync(target.replace(/\.json$/, ".md"), lines.join("\n"));
console.log(JSON.stringify({ output: target, split, partitions: partitions.map(p => ({ model: p.model, established: p.established, checks: p.checks.map(c => ({ id: c.id, mean: c.summary.mean, status: c.status })) })) }, null, 2));
if (options.has("--check") && !partitions.some(p => p.established)) process.exitCode = 1;
