import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { STAGES, GAME_VERSION, replayGame, startGame, act, currentQuestion, recordGame } from "../packages/game/src/index.ts";

/** Same engine as the /game screen. `--file` re-executes a saved play; `--stage --seed` plays a fixed demo script. */
const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const file = option("--file");
if (file) {
  const state = replayGame(JSON.parse(readFileSync(resolve(file), "utf8")));
  console.log(JSON.stringify({ game: GAME_VERSION, stage: state.stageId, seed: state.seed, labUsed: state.labUsed, final: state.final, rounds: state.rounds.map((r) => ({ tick: r.tick, subject: r.subject, guess: r.guess, actual: r.actual, probability: Number(r.probability.toFixed(3)), points: r.points })) }, null, 2));
} else if (option("--stage")) {
  // Demo: always predicts "observe" with confidence 1 and makes no edits. Useful as a do-nothing reference.
  let state = startGame(option("--stage")!, Number(option("--seed") ?? STAGES.find((s) => s.id === option("--stage"))?.seeds[0]));
  while (currentQuestion(state)) state = act(state, { kind: "predict", action: "observe", confidence: 1 });
  const out = option("--out");
  if (out) { mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(resolve(out), JSON.stringify(recordGame(state, { sourceCommit: "cli", sourceHash: "cli", dependencyLockHash: "cli", runtime: process.version, dirty: false }))); }
  console.log(JSON.stringify(state.final, null, 2));
} else {
  console.log("game " + GAME_VERSION + "\n" + STAGES.map((s) => `${s.id}\t${s.mode}\t${s.title}\t目標: ${s.goal.label}`).join("\n"));
  console.log("\nusage: npm run game -- --file play.json | --stage <id> [--seed n] [--out play.json]");
}
