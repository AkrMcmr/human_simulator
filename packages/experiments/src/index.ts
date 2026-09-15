import type { Body, HumanParameters } from "../../contracts/src/index.ts";
import { DEFAULT_PARAMETERS } from "../../human/src/index.ts";
import type { ExperimentConfig, Frame } from "../../simulation/src/index.ts";
import { DEFAULT_MODEL_ID, runExperiment } from "../../simulation/src/index.ts";
import { DEFAULT_WORLD } from "../../world/src/index.ts";
export type PairSettings = {
  seed: number; horizon: number; initialDistance: number; ambientCold: number; soundEnabled: boolean;
  resourceLayout: "shared" | "separate";
  a: HumanParameters; b: HumanParameters;
  /** Registered human model id used by both individuals. Both decide endogenously with the same rules. */
  model: string;
  /** Initial bodily state shared by both individuals; empty means the model's defaults. */
  body: Partial<Body>;
};
export const DEFAULT_SETTINGS: PairSettings = {
  seed: 42, horizon: 400, initialDistance: 12, ambientCold: 0.36, soundEnabled: true, resourceLayout: "shared",
  a: { ...DEFAULT_PARAMETERS }, b: { ...DEFAULT_PARAMETERS }, model: DEFAULT_MODEL_ID, body: {},
};
export function pairExperiment(settings: PairSettings = DEFAULT_SETTINGS): ExperimentConfig {
  return {
    name: "first-encounter-v1", seed: settings.seed, horizon: settings.horizon, model: settings.model,
    world: { ...DEFAULT_WORLD, ambientCold: settings.ambientCold, soundEnabled: settings.soundEnabled },
    resources: settings.resourceLayout === "shared" ? [
      { id: "food-center", kind: "food", position: { x: 20, y: 13 }, amount: 1, radius: 2 },
      { id: "food-east", kind: "food", position: { x: 27, y: 9 }, amount: 0.8, radius: 1.6 },
      { id: "warm-n", kind: "warmth", position: { x: 22, y: 5 }, amount: 1, radius: 3 },
      { id: "warm-s", kind: "warmth", position: { x: 16, y: 24 }, amount: 1, radius: 3 },
    ] : undefined,
    agents: [
      { id: "A", position: { x: 20 - settings.initialDistance / 2, y: 14 }, parameters: { ...settings.a }, body: { ...settings.body } },
      { id: "B", position: { x: 20 + settings.initialDistance / 2, y: 14 }, parameters: { ...settings.b }, body: { ...settings.body } },
    ],
  };
}
export type Metrics = {
  ticks: number; meanDistance: number; closeFraction: number; vocalizations: number; heardSounds: number;
  meanRisk: number; predictionMAE: number; learnedTransitions: number; minimumHealth: number;
};
export function measure(frames: Frame[]): Metrics {
  const decisions = frames.filter((f) => f.tick > 0);
  const traces = decisions.flatMap((f) => f.agents.flatMap((a) => a.trace ? [a.trace] : []));
  const distances = decisions.flatMap((f) => f.distance === null ? [] : [f.distance]);
  const errors = traces.flatMap((t) => t.predictionError === null ? [] : [Math.abs(t.predictionError)]);
  const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  return {
    ticks: decisions.length, meanDistance: avg(distances),
    closeFraction: distances.length ? distances.filter((d) => d < 4).length / distances.length : 0,
    vocalizations: traces.filter((t) => t.selected === "vocalize").length,
    heardSounds: traces.reduce((n, t) => n + t.observation.sounds.length, 0),
    meanRisk: avg(traces.map((t) => t.perceivedRisk)), predictionMAE: avg(errors),
    learnedTransitions: frames.at(-1)?.agents.reduce((n, a) => n + a.learnedTransitions, 0) ?? 0,
    minimumHealth: Math.min(1, ...frames.flatMap((f) => f.agents.map((a) => a.body.health))),
  };
}
export const COMPARISON_LEVELS = [0.15, 0.55, 0.9];
export type ComparisonRow = { curiosity: number; seeds: number[]; results: Metrics[] };
export function compareCuriosity(settings: PairSettings, seeds = [42, 43, 44, 45, 46, 47, 48, 49]): ComparisonRow[] {
  return COMPARISON_LEVELS.map((curiosity) => ({
    curiosity, seeds,
    results: seeds.map((seed) => measure(runExperiment(pairExperiment({
      ...settings, seed, a: { ...settings.a, curiosity }, b: { ...settings.b, curiosity },
    })).frames)),
  }));
}
export function summarize(values: number[]): { mean: number; sd: number } {
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const variance = values.length > 1 ? values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (values.length - 1) : 0;
  return { mean, sd: Math.sqrt(variance) };
}
