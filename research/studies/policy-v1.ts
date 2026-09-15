import protocol from "../protocols/policy-v1.json" with { type: "json" };
import { createHuman, decideHuman, decideLegacyHuman, applyPhysicalEffect } from "../../packages/human/src/index.ts";
import { decidePredictive } from "../../packages/human/src/predictive-policy.ts";
import type { Observation } from "../../packages/contracts/src/index.ts";
import { keyedRandom } from "../../packages/simulation/src/random.ts";
import { mean, summarizeSamples, type ModelAdapter } from "../../packages/evaluation/src/index.ts";

export { protocol };
// The registered baseline of this study is human 0.1.0, which has no outcome term.
export const baselineModel: ModelAdapter = { create: createHuman, decide: decideLegacyHuman, apply: applyPhysicalEffect };
export const candidateModel: ModelAdapter = { ...baselineModel, decide: decidePredictive };
export const ablatedModel: ModelAdapter = { ...baselineModel, decide: (h, o, r) => decideHuman(h, o, r, () => 0) };
export type Condition = "standard" | "reversed" | "reversal" | "uncontrollable";
function input(tick: number, distance: number, velocity = 0): Observation {
  return { tick, selfPosition: { x: 10, y: 14 }, animals: [{ trackId: "B", morphologySimilarity: .98, relativePosition: { x: distance, y: 0 }, relativeVelocity: { x: velocity, y: 0 } }], resources: [], sounds: [] };
}
export function trialRun(model: ModelAdapter, seed: number, condition: Condition) {
  let state = model.create("A", protocol.parameters, protocol.body);
  const outcomes: number[] = [], bonuses: number[] = [];
  const choices: Record<string, number> = {};
  const environment = keyedRandom(seed, "policy-v1/environment", 0);
  for (let trial = 0; trial < protocol.trials; trial++) {
    // Experimental resets are not action consequences. Never score their displacement.
    state.pending = null; state.body = { ...protocol.body }; state.lastAction = "observe";
    const result = model.decide(state, input(trial * 2, protocol.distance), keyedRandom(seed, "policy-v1/choice", trial));
    const reverse = condition === "reversed" || (condition === "reversal" && trial >= protocol.reversalAt);
    const selected = result.action.kind;
    const useful = reverse ? "observe" : "withdraw";
    const counterproductive = reverse ? "withdraw" : "observe";
    const delta = (condition === "uncontrollable" ? (environment("independent", trial) < .5 ? -protocol.delta : protocol.delta) : selected === useful ? protocol.delta : selected === counterproductive ? -protocol.delta : protocol.otherDelta) + (environment("noise", trial) - .5) * protocol.noise;
    outcomes.push(delta);
    const nonzero = result.trace.scores.map(s => Math.abs(s.terms.predictedSafety ?? 0));
    bonuses.push(Math.max(...nonzero));
    if (trial >= protocol.trials - protocol.window) choices[selected] = (choices[selected] ?? 0) + 1;
    state = model.decide(result.human, input(trial * 2 + 1, protocol.distance + delta, delta), keyedRandom(seed, "policy-v1/feedback", trial)).human;
  }
  return { finalOutcome: mean(outcomes.slice(-protocol.window)), earlyOutcome: mean(outcomes.slice(0, protocol.window)), finalMaximumBonus: mean(bonuses.slice(-protocol.window)), choices, trials: protocol.trials, measuredTrials: protocol.window };
}
export function runPolicyPartition(name: "development" | "validation") {
  const seeds = name === "development" ? protocol.developmentSeeds : protocol.validationSeeds;
  const conditions: Condition[] = ["standard", "reversed", "reversal", "uncontrollable"];
  const runs = conditions.map(condition => ({ condition, samples: seeds.map(seed => ({ seed, baseline: trialRun(baselineModel, seed, condition), candidate: trialRun(candidateModel, seed, condition), ablated: trialRun(ablatedModel, seed, condition) })) }));
  const checks = protocol.checks.map(check => {
    const row = runs.find(r => r.condition === (check.id === "null-bonus" ? "uncontrollable" : check.id))!;
    const values = row.samples.map(s => check.id === "null-bonus" ? -s.candidate.finalMaximumBonus : check.id === "uncontrollable" ? -Math.abs(s.candidate.finalOutcome - s.baseline.finalOutcome) : s.candidate.finalOutcome - s.baseline.finalOutcome);
    const summary = summarizeSamples(values, "policy-v1/" + name + "/" + check.id);
    return { ...check, summary, status: summary.mean >= check.minimum ? "pass" : "fail" };
  });
  const ablationExact = runs.every(row => row.samples.every(s => JSON.stringify(s.baseline) === JSON.stringify(s.ablated)));
  return { name, seeds, runs, checks, ablationExact };
}
