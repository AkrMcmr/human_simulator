import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runReferentialPartition, protocol as protocolV1, type ReferentialProtocol, assessPaired } from "../research/studies/referential-v1.ts";
import protocolV2 from "../research/protocols/referential-v2.json" with { type: "json" };
import protocolV3 from "../research/protocols/referential-v3.json" with { type: "json" };
import protocolV4 from "../research/protocols/referential-v4.json" with { type: "json" };
import protocolV5 from "../research/protocols/referential-v5.json" with { type: "json" };
import protocolCaller from "../research/protocols/caller-cost-v1.json" with { type: "json" };
import protocolConvention from "../research/protocols/convention-v1.json" with { type: "json" };
import protocolConvention2 from "../research/protocols/convention-v2.json" with { type: "json" };
import protocolLexicon from "../research/protocols/lexicon-v1.json" with { type: "json" };
import protocolLexicon2 from "../research/protocols/lexicon-v2.json" with { type: "json" };
import protocolLexicon3 from "../research/protocols/lexicon-v3.json" with { type: "json" };
import protocolTransmission from "../research/protocols/transmission-v1.json" with { type: "json" };
import protocolTransmission2 from "../research/protocols/transmission-v2.json" with { type: "json" };
import protocolGenerations from "../research/protocols/generations-v1.json" with { type: "json" };
import protocolGenerations2 from "../research/protocols/generations-v2.json" with { type: "json" };
import protocolValence from "../research/protocols/valence-v1.json" with { type: "json" };
import protocolValence2 from "../research/protocols/valence-v2.json" with { type: "json" };
import protocolValence3 from "../research/protocols/valence-v3.json" with { type: "json" };
import protocolValence4 from "../research/protocols/valence-v4.json" with { type: "json" };
import protocolValence5 from "../research/protocols/valence-v5.json" with { type: "json" };
import protocolValence6 from "../research/protocols/valence-v6.json" with { type: "json" };
import protocolValence7 from "../research/protocols/valence-v7.json" with { type: "json" };
import protocolValence8 from "../research/protocols/valence-v8.json" with { type: "json" };
import protocolValence9 from "../research/protocols/valence-v9.json" with { type: "json" };
import protocolValence10 from "../research/protocols/valence-v10.json" with { type: "json" };
import protocolValence11 from "../research/protocols/valence-v11.json" with { type: "json" };
import protocolPredator from "../research/protocols/predator-v1.json" with { type: "json" };
import { HUMAN_MODELS, versionsFor, VERSIONS } from "../packages/simulation/src/index.ts";

/** Information-asymmetry foraging diagnostics for one or more registered models. */
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const options = new Map<string, string>();
const modelIds: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--check") { options.set("--check", "true"); continue; }
  if (args[i] === "--model") { if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Missing value for --model"); modelIds.push(args[++i]); continue; }
  if (!["--split", "--out", "--protocol", "--round"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i])) throw new Error("Unknown/duplicate option or missing value: " + args[i]);
  options.set(args[i], args[++i]);
}
const protocolName = options.get("--protocol") ?? "v1";
const protocols: Record<string, ReferentialProtocol> = { v1: protocolV1, v2: protocolV2 as unknown as ReferentialProtocol, v3: protocolV3 as unknown as ReferentialProtocol, v4: protocolV4 as unknown as ReferentialProtocol, v5: protocolV5 as unknown as ReferentialProtocol, caller: protocolCaller as unknown as ReferentialProtocol, convention: protocolConvention as unknown as ReferentialProtocol, convention2: protocolConvention2 as unknown as ReferentialProtocol, lexicon: protocolLexicon as unknown as ReferentialProtocol, lexicon2: protocolLexicon2 as unknown as ReferentialProtocol, lexicon3: protocolLexicon3 as unknown as ReferentialProtocol, transmission: protocolTransmission as unknown as ReferentialProtocol, transmission2: protocolTransmission2 as unknown as ReferentialProtocol, generations: protocolGenerations as unknown as ReferentialProtocol, generations2: protocolGenerations2 as unknown as ReferentialProtocol, valence: protocolValence as unknown as ReferentialProtocol, valence2: protocolValence2 as unknown as ReferentialProtocol, valence3: protocolValence3 as unknown as ReferentialProtocol, valence4: protocolValence4 as unknown as ReferentialProtocol, valence5: protocolValence5 as unknown as ReferentialProtocol, valence6: protocolValence6 as unknown as ReferentialProtocol, valence7: protocolValence7 as unknown as ReferentialProtocol, valence8: protocolValence8 as unknown as ReferentialProtocol, valence9: protocolValence9 as unknown as ReferentialProtocol, valence10: protocolValence10 as unknown as ReferentialProtocol, valence11: protocolValence11 as unknown as ReferentialProtocol, predator: protocolPredator as unknown as ReferentialProtocol };
if (!Object.hasOwn(protocols, protocolName)) throw new Error("--protocol must be one of " + Object.keys(protocols).join(", "));
const protocol: ReferentialProtocol = protocols[protocolName];
const split = options.get("--split") ?? "development";
if (split !== "development" && split !== "validation" && split !== "pilot") throw new Error("--split must be development, validation, or pilot");
if (!modelIds.length) modelIds.push(protocol.models.baseline);
for (const id of modelIds) if (!Object.hasOwn(HUMAN_MODELS, id)) throw new Error("Unregistered model: " + id);
const target = resolve(options.get("--out") ?? `outputs/${protocol.id}-${split}.json`);
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
  evaluatorHash: hash(["research/studies/referential-v1.ts", "research/protocols/referential-v1.json", "research/protocols/referential-v2.json", "research/protocols/referential-v3.json", "research/protocols/referential-v4.json", "research/protocols/referential-v5.json", "research/protocols/caller-cost-v1.json", "research/protocols/convention-v1.json", "research/protocols/convention-v2.json", "research/protocols/lexicon-v1.json", "research/protocols/lexicon-v2.json", "research/protocols/lexicon-v3.json", "research/protocols/transmission-v1.json", "research/protocols/transmission-v2.json", "research/protocols/generations-v1.json", "research/protocols/generations-v2.json", "research/protocols/valence-v1.json", "research/protocols/valence-v2.json", "research/protocols/valence-v3.json", "research/protocols/valence-v4.json", "research/protocols/valence-v5.json", "research/protocols/valence-v6.json", "research/protocols/valence-v7.json", "research/protocols/valence-v8.json", "research/protocols/valence-v9.json", "research/protocols/valence-v10.json", "research/protocols/valence-v11.json", "research/protocols/predator-v1.json", "packages/evaluation/src/index.ts", "cli/study-referential.ts"]),
  environmentHash: hash([...files("packages/contracts/src"), ...files("packages/world/src"), "packages/simulation/src/index.ts", "packages/simulation/src/random.ts"]),
  dependencyLockHash: hash(["package-lock.json"]), runtime: `Node ${process.version} / ${process.platform} / ${process.arch}`, versions: VERSIONS,
};
const round = options.get("--round") ?? "1";
const partitions = modelIds.map(id => runReferentialPartition(split, id, protocol, round));
const paired = assessPaired(protocol, partitions);
const output = { format: "human-world-lab/referential-study", schemaVersion: 1, protocol, provenance, round, seedUse: split === "pilot" ? "pilot seeds: scale check only, not a gate" : split, models: Object.fromEntries(modelIds.map(id => [id, versionsFor(id).human])), partitions, paired, established: Object.fromEntries(partitions.map(p => [p.model, p.established])), decision: "diagnostics-of-registered-models-not-default-promotion" };
mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
const f = (x: number, d = 4) => x.toFixed(d);
const spawn = (protocol.world as unknown as { foodSpawn?: { amount: number; positions: unknown[] } }).foodSpawn;
const wcen = (p: (typeof partitions)[number], k: "sound" | "muted" | "misdirected" | "scrambled") => { const cs = p.results.map(r => r[k].warmthVoiceCentroid).filter((c): c is { openness: number; resonance: number } => c !== null); return cs.length ? `${f(avg(cs.map(c => c.openness)), 2)},${f(avg(cs.map(c => c.resonance)), 2)}` : "—"; };
const ecen = (p: (typeof partitions)[number], k: "sound" | "muted" | "misdirected" | "scrambled") => { const cs = p.results.map(r => r[k].earlyVoiceCentroid).filter((c): c is { openness: number; resonance: number } => c !== null); return cs.length ? `${f(avg(cs.map(c => c.openness)), 2)},${f(avg(cs.map(c => c.resonance)), 2)}` : "—"; };
const cen = (p: (typeof partitions)[number], k: "sound" | "muted" | "misdirected" | "scrambled") => { const cs = p.results.map(r => r[k].foodVoiceCentroid).filter((c): c is { openness: number; resonance: number } => c !== null); return cs.length ? `${f(avg(cs.map(c => c.openness)), 2)},${f(avg(cs.map(c => c.resonance)), 2)}` : "—"; };
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const lines = [`# 情報の非対称がある採餌課題（${protocol.id}）`, "", `- 条件群: ${split}（シード群ラウンド${round}）`, `- ソース: ${provenance.commit}`, `- 未コミット変更: ${provenance.dirty}`, `- モデルコードSHA256: ${provenance.modelHash}`, `- 評価器SHA256: ${provenance.evaluatorHash}`, `- 環境SHA256: ${provenance.environmentHash}`, `- シード: ${partitions[0].seeds.join(", ")}`, `- 実行: ${protocol.horizon}ステップ、視界${protocol.world.visionRadius}u、聴覚${protocol.world.hearingRadius}u、食料${protocol.resources.filter(r => r.kind === "food").length}か所（各${protocol.resources.find(r => r.kind === "food")?.amount}）${spawn ? `、尽きると次の場所に${spawn.amount}が現れる（${spawn.positions.length}か所の列、再生なし）` : ""}、初期空腹${protocol.body.hunger}、${Object.keys(protocol.agents).length}人全員が同じモデル。対照は音なし、方向をでたらめにする介入、音の特徴をでたらめにする介入`, "", "値はシードごとの差の平均 ± 標本SD。高いほど「声が食料の手掛かりとして働く」方向。人間の言語や意図の再現ではない。", ""];
for (const p of partitions) {
  lines.push(`## ${p.model}`, "", "| 項目 | 平均 ± SD | 閾値 | 判定 |", "| --- | ---: | ---: | --- |");
  for (const c of p.checks) lines.push(`| ${c.label ?? c.id} | ${f(c.summary.mean)} ± ${f(c.summary.sd)} | ${c.minimum ?? "報告のみ"} | ${c.status} |`);
  const s = (k: "sound" | "muted" | "misdirected" | "scrambled", pick: (r: (typeof p.results)[number]["sound"]) => number, d = 3) => f(avg(p.results.map(r => pick(r[k]))), d);
  lines.push("", `成立: ${p.established}`, "", "| 指標 | 音あり | 音なし | でたらめ方向 | でたらめ特徴 |", "| --- | ---: | ---: | ---: | ---: |",
    `| 空腹の平均（後ろ3分の1） | ${s("sound", r => r.lateMeanHunger)} | ${s("muted", r => r.lateMeanHunger)} | ${s("misdirected", r => r.lateMeanHunger)} | ${s("scrambled", r => r.lateMeanHunger)} |`,
    `| 空腹の平均 | ${s("sound", r => r.meanHunger)} | ${s("muted", r => r.meanHunger)} | ${s("misdirected", r => r.meanHunger)} | ${s("scrambled", r => r.meanHunger)} |`,
    `| 初回摂食までのステップ（平均） | ${s("sound", r => r.meanFirstFoodTick, 0)} | ${s("muted", r => r.meanFirstFoodTick, 0)} | ${s("misdirected", r => r.meanFirstFoodTick, 0)} | ${s("scrambled", r => r.meanFirstFoodTick, 0)} |`,
    `| 見つけた個体以外の到着遅れ（上限比） | ${s("sound", r => r.arrivalDelay)} | ${s("muted", r => r.arrivalDelay)} | ${s("misdirected", r => r.arrivalDelay)} | ${s("scrambled", r => r.arrivalDelay)} |`,
    `| 見つかった食料 / 複数が食べた食料 / 出現 | ${s("sound", r => r.patchesFound, 1)} / ${s("sound", r => r.patchesShared, 1)} / ${s("sound", r => r.spawns, 1)} | ${s("muted", r => r.patchesFound, 1)} / ${s("muted", r => r.patchesShared, 1)} / ${s("muted", r => r.spawns, 1)} | ${s("misdirected", r => r.patchesFound, 1)} / ${s("misdirected", r => r.patchesShared, 1)} / ${s("misdirected", r => r.spawns, 1)} | ${s("scrambled", r => r.patchesFound, 1)} / ${s("scrambled", r => r.patchesShared, 1)} / ${s("scrambled", r => r.spawns, 1)} |`,
    `| 摂食量の合計 | ${s("sound", r => r.foodIntake)} | ${s("muted", r => r.foodIntake)} | ${s("misdirected", r => r.foodIntake)} | ${s("scrambled", r => r.foodIntake)} |`,
    `| 聞いた回数 / 音源が見えなかった回数 | ${s("sound", r => r.heardEvents, 0)} / ${s("sound", r => r.unseenHeardEvents, 0)} | 0 / 0 | ${s("misdirected", r => r.heardEvents, 0)} / ${s("misdirected", r => r.unseenHeardEvents, 0)} | ${s("scrambled", r => r.heardEvents, 0)} / ${s("scrambled", r => r.unseenHeardEvents, 0)} |`,
    `| 音を聞いた直後に音源の方へ動いた割合 | ${s("sound", r => r.towardSourceFraction)} | — | ${s("misdirected", r => r.towardSourceFraction)} | ${s("scrambled", r => r.towardSourceFraction)} |`,
    `| 初回摂食が聞いた直後（${protocol.hearWindow}ステップ以内）だった割合 | ${s("sound", r => r.foodAfterHearingFraction)} | — | ${s("misdirected", r => r.foodAfterHearingFraction)} | ${s("scrambled", r => r.foodAfterHearingFraction)} |`,
    `| 発声回数 / うち食後の呼び声 | ${s("sound", r => r.vocalizations, 0)} / ${s("sound", r => r.foodCalls, 0)} | ${s("muted", r => r.vocalizations, 0)} / ${s("muted", r => r.foodCalls, 0)} | ${s("misdirected", r => r.vocalizations, 0)} / ${s("misdirected", r => r.foodCalls, 0)} | ${s("scrambled", r => r.vocalizations, 0)} / ${s("scrambled", r => r.foodCalls, 0)} |`,
    `| 食後の声の散らばり（全員の声の重心からの平均距離） | ${s("sound", r => r.foodVoiceDispersion, 3)} | ${s("muted", r => r.foodVoiceDispersion, 3)} | ${s("misdirected", r => r.foodVoiceDispersion, 3)} | ${s("scrambled", r => r.foodVoiceDispersion, 3)} |`,
    `| 食後の声の個体間の広がり / 重心（開き,共鳴） | ${s("sound", r => r.foodVoiceSpread, 2)} / ${cen(p, "sound")} | ${s("muted", r => r.foodVoiceSpread, 2)} / ${cen(p, "muted")} | ${s("misdirected", r => r.foodVoiceSpread, 2)} / ${cen(p, "misdirected")} | ${s("scrambled", r => r.foodVoiceSpread, 2)} / ${cen(p, "scrambled")} |`,
    `| 暖かい場所での声の散らばり / 重心 / 回数 | ${s("sound", r => r.warmthVoiceDispersion, 3)} / ${wcen(p, "sound")} / ${s("sound", r => r.warmthCalls, 0)} | ${s("muted", r => r.warmthVoiceDispersion, 3)} / ${wcen(p, "muted")} / ${s("muted", r => r.warmthCalls, 0)} | ${s("misdirected", r => r.warmthVoiceDispersion, 3)} / ${wcen(p, "misdirected")} / ${s("misdirected", r => r.warmthCalls, 0)} | ${s("scrambled", r => r.warmthVoiceDispersion, 3)} / ${wcen(p, "scrambled")} / ${s("scrambled", r => r.warmthCalls, 0)} |`,
    `| 寒さの平均（後ろ3分の1） | ${s("sound", r => r.lateMeanCold)} | ${s("muted", r => r.lateMeanCold)} | ${s("misdirected", r => r.lateMeanCold)} | ${s("scrambled", r => r.lateMeanCold)} |`,
    `| 新参者の声の距離 / 新参者の空腹（後ろ3分の1） | ${s("sound", r => r.newcomerDistance, 3)} / ${s("sound", r => r.newcomerLateHunger)} | ${s("muted", r => r.newcomerDistance, 3)} / ${s("muted", r => r.newcomerLateHunger)} | ${s("misdirected", r => r.newcomerDistance, 3)} / ${s("misdirected", r => r.newcomerLateHunger)} | ${s("scrambled", r => r.newcomerDistance, 3)} / ${s("scrambled", r => r.newcomerLateHunger)} |`,
    `| 入れ替え前の声の重心 / 回数 | ${ecen(p, "sound")} / ${s("sound", r => r.earlyCalls, 0)} | ${ecen(p, "muted")} / ${s("muted", r => r.earlyCalls, 0)} | ${ecen(p, "misdirected")} / ${s("misdirected", r => r.earlyCalls, 0)} | ${ecen(p, "scrambled")} / ${s("scrambled", r => r.earlyCalls, 0)} |`,
    `| 毒の摂食（全体 / 後ろ3分の1） / 悪い食料の声の回数 | ${s("sound", r => r.poisonIntake, 2)} / ${s("sound", r => r.latePoisonIntake, 2)} / ${s("sound", r => r.badCalls, 0)} | ${s("muted", r => r.poisonIntake, 2)} / ${s("muted", r => r.latePoisonIntake, 2)} / ${s("muted", r => r.badCalls, 0)} | ${s("misdirected", r => r.poisonIntake, 2)} / ${s("misdirected", r => r.latePoisonIntake, 2)} / ${s("misdirected", r => r.badCalls, 0)} | ${s("scrambled", r => r.poisonIntake, 2)} / ${s("scrambled", r => r.latePoisonIntake, 2)} / ${s("scrambled", r => r.badCalls, 0)} |`,
    `| 接触ステップ割合 | ${s("sound", r => r.contactTicks)} | ${s("muted", r => r.contactTicks)} | ${s("misdirected", r => r.contactTicks)} | ${s("scrambled", r => r.contactTicks)} |`,
    `| 4u未満の割合 | ${s("sound", r => r.closeFraction)} | ${s("muted", r => r.closeFraction)} | ${s("misdirected", r => r.closeFraction)} | ${s("scrambled", r => r.closeFraction)} |`,
    `| 最低健康 | ${s("sound", r => r.minimumHealth)} | ${s("muted", r => r.minimumHealth)} | ${s("misdirected", r => r.minimumHealth)} | ${s("scrambled", r => r.minimumHealth)} |`, "");
}
if (paired.length) {
  lines.push("## 対比較（同じシード・同じ条件で、参照モデル − 候補モデル）", "", "| 項目 | 候補 | 参照 | 指標 | 平均 ± SD | 閾値 | 判定 |", "| --- | --- | --- | --- | ---: | ---: | --- |");
  for (const c of paired) lines.push(`| ${c.label ?? c.id} | ${c.candidate} | ${c.reference} | ${c.condition}.${c.field} | ${f(c.summary.mean)} ± ${f(c.summary.sd)} | ${c.minimum ?? "報告のみ"} | ${c.status} |`);
  lines.push("");
}
lines.push("## 解釈の範囲", "", `音に意味・正解・成功ラベルを与えない自由worldでの診断。方向への定位は生得の知覚と探索傾向。成立の判定は事前登録した${protocol.checks.length}項目で、音の種類への依存（でたらめ特徴で利益が減る）がなければ「定位による手掛かり利用」に留まる。人間の言語や意図の再現ではない。`, "");
writeFileSync(target.replace(/\.json$/, ".md"), lines.join("\n"));
console.log(JSON.stringify({ output: target, split, partitions: partitions.map(p => ({ model: p.model, established: p.established, checks: p.checks.map(c => ({ id: c.id, mean: c.summary.mean, status: c.status })) })) }, null, 2));
if (options.has("--check") && !partitions.some(p => p.established)) process.exitCode = 1;
