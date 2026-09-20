import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSignalWorldPartition, protocol } from "../research/studies/signal-world-v1.ts";
import { HUMAN_MODELS, versionsFor, VERSIONS } from "../packages/simulation/src/index.ts";

/** Free-world signal diagnostics for one or more registered models. Establishment is judged per model. */
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const options = new Map<string, string>();
const modelIds: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--check") { options.set("--check", "true"); continue; }
  if (args[i] === "--model") { if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Missing value for --model"); modelIds.push(args[++i]); continue; }
  if (!["--split", "--out", "--round"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i])) throw new Error("Unknown/duplicate option or missing value: " + args[i]);
  options.set(args[i], args[++i]);
}
const split = options.get("--split") ?? "development";
if (split !== "development" && split !== "validation" && split !== "pilot") throw new Error("--split must be development, validation, or pilot");
if (!modelIds.length) modelIds.push(protocol.models.baseline);
for (const id of modelIds) if (!Object.hasOwn(HUMAN_MODELS, id)) throw new Error("Unregistered model: " + id);
const target = resolve(options.get("--out") ?? `outputs/signal-world-${split}.json`);
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
  evaluatorHash: hash(["research/studies/signal-world-v1.ts", "research/protocols/signal-world-v1.json", "packages/evaluation/src/index.ts", "packages/experiments/src/index.ts", "cli/study-signal-world.ts"]),
  environmentHash: hash([...files("packages/contracts/src"), ...files("packages/world/src"), "packages/simulation/src/index.ts", "packages/simulation/src/random.ts"]),
  dependencyLockHash: hash(["package-lock.json"]), runtime: `Node ${process.version} / ${process.platform} / ${process.arch}`, versions: VERSIONS,
};
const round = (options.get("--round") ?? "1") as keyof typeof protocol.rounds;
if (!Object.hasOwn(protocol.rounds, round)) throw new Error("Unknown seed round: " + String(round));
const partitions = modelIds.map(id => runSignalWorldPartition(split, id, round));
const output = { format: "human-world-lab/signal-world-study", schemaVersion: 1, protocol, provenance, round, seedUse: split === "pilot" ? "pilot seeds: scale check only, not a gate" : split, models: Object.fromEntries(modelIds.map(id => [id, versionsFor(id).human])), partitions, established: Object.fromEntries(partitions.map(p => [p.model, p.established])), decision: "diagnostics-of-registered-models-not-default-promotion" };
mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
const f = (x: number, d = 4) => x.toFixed(d);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const lines = ["# 自由worldでの最小合図の診断（signal-world-v1）", "", `- 条件群: ${split}（シード群ラウンド${round}）`, `- ソース: ${provenance.commit}`, `- 未コミット変更: ${provenance.dirty}`, `- モデルコードSHA256: ${provenance.modelHash}`, `- 評価器SHA256: ${provenance.evaluatorHash}`, `- 環境SHA256: ${provenance.environmentHash}`, `- シード: ${partitions[0].seeds.join(", ")}`, `- 実行: ${protocol.horizon}ステップ、初期距離${protocol.initialDistance}u、資源${protocol.resourceLayout}、二人とも同じモデル。対照は音なしと、聞こえる音の特徴をでたらめに置き換える介入`, "", "値はシードごとの超過相互情報量（bit）または差の平均 ± 標本SD。高いほど仮説の方向。相関の強さであり、意味の理解や意図ではない。", ""];
for (const p of partitions) {
  lines.push(`## ${p.model}`, "", "| 現象 | 項目 | 平均 ± SD | 閾値 | 判定 |", "| --- | --- | ---: | ---: | --- |");
  for (const c of p.checks) lines.push(`| ${c.phenomenon} | ${c.label} | ${f(c.summary.mean)} ± ${f(c.summary.sd)} | ${c.minimum} | ${c.status} |`);
  const s = (k: "sound" | "muted" | "scrambled", pick: (r: (typeof p.results)[number]["sound"]) => number) => f(avg(p.results.map(r => pick(r[k]))), 3);
  lines.push("", `合図の成立: ${p.established}`, "", "| 指標 | 音あり | 音なし | でたらめ音 |", "| --- | ---: | ---: | ---: |",
    `| 聞き手の生の相互情報量 / 並べ替え平均 | ${s("sound", r => r.listener.mi)} / ${s("sound", r => r.listener.permutationMean)} | — | ${s("scrambled", r => r.listener.mi)} / ${s("scrambled", r => r.listener.permutationMean)} |`,
    `| 発し手の生の相互情報量 / 並べ替え平均 | ${s("sound", r => r.speaker.mi)} / ${s("sound", r => r.speaker.permutationMean)} | ${s("muted", r => r.speaker.mi)} / ${s("muted", r => r.speaker.permutationMean)} | ${s("scrambled", r => r.speaker.mi)} / ${s("scrambled", r => r.speaker.permutationMean)} |`,
    `| 聞いた回数（A+B） | ${s("sound", r => Object.values(r.heardEvents).reduce((a, b) => a + b, 0))} | 0 | ${s("scrambled", r => Object.values(r.heardEvents).reduce((a, b) => a + b, 0))} |`,
    `| 発声回数（A+B） | ${s("sound", r => Object.values(r.vocalizations).reduce((a, b) => a + b, 0))} | ${s("muted", r => Object.values(r.vocalizations).reduce((a, b) => a + b, 0))} | ${s("scrambled", r => Object.values(r.vocalizations).reduce((a, b) => a + b, 0))} |`,
    `| 接触ステップ割合 | ${s("sound", r => r.contactTicks)} | ${s("muted", r => r.contactTicks)} | ${s("scrambled", r => r.contactTicks)} |`,
    `| 4u未満の割合 | ${s("sound", r => r.closeFraction)} | ${s("muted", r => r.closeFraction)} | ${s("scrambled", r => r.closeFraction)} |`,
    `| 身体要求の負担 | ${s("sound", r => r.needBurden)} | ${s("muted", r => r.needBurden)} | ${s("scrambled", r => r.needBurden)} |`, "");
}
lines.push("## 解釈の範囲", "", "音に意味・正解・成功ラベルを与えない自由worldでの診断。超過相互情報量は「聞いた音の区分と次の行動」「距離区分と出した音の区分」の相関の強さで、並べ替え基準を引いた値。成立の判定は事前登録した3項目と副作用で、分類数や発声回数は数えない。人間の言語や意図の再現ではない。", "");
writeFileSync(target.replace(/\.json$/, ".md"), lines.join("\n"));
console.log(JSON.stringify({ output: target, split, partitions: partitions.map(p => ({ model: p.model, established: p.established, checks: p.checks.map(c => ({ id: c.id, mean: c.summary.mean, status: c.status })) })) }, null, 2));
if (options.has("--check") && !partitions.every(p => p.established)) process.exitCode = 1;
