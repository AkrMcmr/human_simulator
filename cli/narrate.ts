import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_SETTINGS, pairExperiment } from "../packages/experiments/src/index.ts";
import { runExperiment, restoreRun, MODEL_IDS } from "../packages/simulation/src/index.ts";
import { storyMarkdown } from "../packages/observer/src/index.ts";

/** Turn a recorded or freshly run two-person experiment into a plain-language story. Observer-only; no model state is changed. */
const args = process.argv.slice(2);
function option(name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error("Missing value for " + name);
  return value;
}
const input = option("--in", "");
let frames;
let heading: string;
if (input) {
  const restored = restoreRun(JSON.parse(readFileSync(resolve(input), "utf8")));
  frames = restored.frames;
  heading = `記録 ${input}（seed ${restored.config.seed}、モデル ${restored.state.model}、${restored.state.tick} ステップまで再現）`;
} else {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.seed = Number(option("--seed", "42"));
  settings.horizon = Number(option("--steps", "400"));
  settings.initialDistance = Number(option("--distance", "12"));
  settings.a.curiosity = Number(option("--curiosity-a", String(settings.a.curiosity)));
  settings.b.curiosity = Number(option("--curiosity-b", String(settings.b.curiosity)));
  settings.soundEnabled = !args.includes("--mute");
  const layout = option("--layout", "shared");
  if (layout !== "shared" && layout !== "separate") throw new Error("Layout must be shared or separate.");
  settings.resourceLayout = layout;
  settings.model = option("--model", settings.model);
  if (!MODEL_IDS.includes(settings.model)) throw new Error("Unknown model. Registered ids: " + MODEL_IDS.join(", "));
  frames = runExperiment(pairExperiment(settings)).frames;
  heading = `seed ${settings.seed}、${settings.horizon} ステップ、初期距離 ${settings.initialDistance}u、資源 ${layout}、音 ${settings.soundEnabled ? "あり" : "なし"}、モデル ${settings.model}`;
}
console.log(`_${heading}_\n`);
console.log(storyMarkdown(frames));
