import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { DEFAULT_SETTINGS, pairExperiment, measure, compareCuriosity, summarize } from "../packages/experiments/src/index.ts";
import { archiveRun, runExperiment, restoreRun, stepSimulation, observeSimulation } from "../packages/simulation/src/index.ts";

const args = process.argv.slice(2);
function option(name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error("Missing value for " + name);
  return value;
}
function git(...args: string[]): string {
  try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "uncommitted"; }
}
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
const provenance = {
  sourceCommit: git("rev-parse", "HEAD"),
  sourceHash: git("rev-parse", "HEAD^{tree}"),
  dependencyLockHash: existsSync("package-lock.json") ? createHash("sha256").update(readFileSync("package-lock.json")).digest("hex") : "none",
  runtime: "Node " + process.version + " / " + process.platform + " / " + process.arch,
  dirty: git("status", "--porcelain") !== "",
};
let output: unknown;
if (args.includes("--compare")) {
  const seeds = Array.from({ length: 8 }, (_, i) => (settings.seed + i) >>> 0);
  const rows = compareCuriosity(settings, seeds);
  output = { format: "human-world-lab/comparison", provenance, settings, seeds, rows,
    summary: rows.map((row) => ({
      curiosity: row.curiosity,
      meanDistance: summarize(row.results.map((m) => m.meanDistance)),
      closeFraction: summarize(row.results.map((m) => m.closeFraction)),
      vocalizations: summarize(row.results.map((m) => m.vocalizations)),
    })),
  };
  console.log(JSON.stringify((output as { summary: unknown }).summary, null, 2));
} else {
  let config = pairExperiment(settings);
  const resume = option("--resume", "");
  let run;
  if (resume) {
    const restored = restoreRun(JSON.parse(readFileSync(resolve(resume), "utf8")));
    config = restored.config;
    let state = restored.state;
    const frames = restored.frames;
    while (state.tick < state.horizon) { state = stepSimulation(state); frames.push(observeSimulation(state)); }
    run = { state, frames };
  } else {
    run = runExperiment(config);
  }
  output = archiveRun(config, run.state, run.frames, provenance);
  console.log(JSON.stringify(measure(run.frames), null, 2));
}
const out = option("--out", "");
if (out) {
  const target = resolve(out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
  console.log("Saved: " + target);
}
