import protocol from "../protocols/world-v1.json" with { type: "json" };
import type { ActionKind, Body } from "../../packages/contracts/src/index.ts";
import { pairExperiment, DEFAULT_SETTINGS } from "../../packages/experiments/src/index.ts";
import { runExperiment, resolveModel, type Frame } from "../../packages/simulation/src/index.ts";
import { mean, summarizeSamples, type Summary } from "../../packages/evaluation/src/index.ts";

export { protocol };
export type Layout = "shared" | "separate";
export type Condition = { id: string; resourceLayout: Layout; initialDistance: number; bodilyNeed: "low" | "high"; body: Partial<Body> };
export type WorldMetrics = {
  ticks: number; needBurden: number; minimumHealth: number; reliefFraction: number; foodIntake: number;
  contactTicks: number; contactForce: number; closeFraction: number; visibleFraction: number; meanDistance: number;
  withdrawFraction: number; approachFraction: number; meanRisk: number; predictionMAE: number; vocalizations: number;
  bonusActiveFraction: number; bonusMagnitude: number; actions: Record<ActionKind, number>;
};
export type Variant = "baseline" | "candidate" | "ablated";
export type Run = { condition: string; seed: number; baseline: WorldMetrics; candidate: WorldMetrics; ablated: WorldMetrics; ablationExact: boolean };
export type Check = (typeof protocol.checks)[number] & { samples: number; summary: Summary; status: "pass" | "fail" };

export function conditions(): Condition[] {
  const list: Condition[] = [];
  for (const resourceLayout of protocol.factors.resourceLayout as Layout[]) for (const initialDistance of protocol.factors.initialDistance) for (const [bodilyNeed, body] of Object.entries(protocol.factors.bodilyNeed) as ["low" | "high", Partial<Body>][]) {
    list.push({ id: `${resourceLayout}/d${initialDistance}/${bodilyNeed}`, resourceLayout, initialDistance, bodilyNeed, body });
  }
  return list;
}
export function measureWorld(frames: Frame[]): WorldMetrics {
  const decided = frames.filter(f => f.tick > 0);
  if (!decided.length) throw new Error("No decisions to measure");
  const traces = decided.flatMap(f => f.agents.flatMap(a => a.trace ? [a.trace] : []));
  const peerTraces = traces.filter(t => t.peerTrackId !== null);
  const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const actions = Object.fromEntries((["observe", "approach", "withdraw", "explore", "forage", "warm", "rest", "vocalize"] as ActionKind[]).map(k => [k, 0])) as Record<ActionKind, number>;
  for (const t of traces) actions[t.selected]++;
  const bonuses = traces.map(t => Math.abs(t.scores.find(s => s.action === t.selected)?.terms.predictedSafety ?? 0));
  const relief = new Set(protocol.reliefActions as ActionKind[]);
  const metrics: WorldMetrics = {
    ticks: decided.length,
    needBurden: avg(decided.flatMap(f => f.agents.map(a => Math.max(a.body.hunger, a.body.fatigue, a.body.cold)))),
    minimumHealth: Math.min(1, ...frames.flatMap(f => f.agents.map(a => a.body.health))),
    reliefFraction: traces.filter(t => relief.has(t.selected)).length / traces.length,
    foodIntake: decided.reduce((n, f) => n + f.events.filter(e => e.kind === "food").reduce((s, e) => s + e.value, 0), 0),
    contactTicks: decided.filter(f => f.events.some(e => e.kind === "contact")).length / decided.length,
    contactForce: decided.reduce((n, f) => n + f.events.filter(e => e.kind === "contact").reduce((s, e) => s + e.value, 0), 0),
    closeFraction: avg(decided.map(f => f.distance !== null && f.distance < protocol.closeDistance ? 1 : 0)),
    visibleFraction: peerTraces.length / traces.length,
    meanDistance: avg(decided.flatMap(f => f.distance === null ? [] : [f.distance])),
    withdrawFraction: peerTraces.length ? peerTraces.filter(t => t.selected === "withdraw").length / peerTraces.length : 0,
    approachFraction: peerTraces.length ? peerTraces.filter(t => t.selected === "approach").length / peerTraces.length : 0,
    meanRisk: avg(traces.map(t => t.perceivedRisk)),
    predictionMAE: avg(traces.flatMap(t => t.predictionError === null ? [] : [Math.abs(t.predictionError)])),
    vocalizations: actions.vocalize,
    bonusActiveFraction: avg(bonuses.map(b => b > 0 ? 1 : 0)),
    bonusMagnitude: avg(bonuses),
    actions,
  };
  for (const [key, value] of Object.entries(metrics)) if (key !== "actions" && !Number.isFinite(value)) throw new Error("Non-finite metric: " + key);
  return metrics;
}
export function runCondition(modelId: string, condition: Condition, seed: number) {
  resolveModel(modelId);
  const config = pairExperiment({ ...structuredClone(DEFAULT_SETTINGS), seed, horizon: protocol.horizon, initialDistance: condition.initialDistance, resourceLayout: condition.resourceLayout, body: condition.body, model: modelId });
  const { state, frames } = runExperiment(config);
  return { metrics: measureWorld(frames), final: { world: state.world, bodies: state.humans.map(h => ({ id: h.id, body: h.body, lastAction: h.lastAction })), actions: frames.filter(f => f.tick > 0).map(f => f.agents.map(a => a.action).join(",")) } };
}
export function runPair(condition: Condition, seed: number): Run {
  const baseline = runCondition(protocol.models.baseline, condition, seed);
  const candidate = runCondition(protocol.models.candidate, condition, seed);
  const ablated = runCondition(protocol.models.ablated, condition, seed);
  const ablationExact = JSON.stringify(baseline) === JSON.stringify(ablated);
  return { condition: condition.id, seed, baseline: baseline.metrics, candidate: candidate.metrics, ablated: ablated.metrics, ablationExact };
}
export function difference(check: (typeof protocol.checks)[number], run: Run): number {
  const metric = check.metric as keyof Omit<WorldMetrics, "actions">;
  const b = run.baseline[metric], c = run.candidate[metric];
  return check.direction === "baseline-minus-candidate" ? b - c : c - b;
}
export function inScope(check: (typeof protocol.checks)[number], run: Run) {
  return check.scope === "all" || run.condition.startsWith(check.scope + "/");
}
export function assessRuns(name: string, runs: Run[]) {
  const checks: Check[] = protocol.checks.map(check => {
    const values = runs.filter(run => inScope(check, run)).map(run => difference(check, run));
    const summary = summarizeSamples(values, "world-v1/" + name + "/" + check.id);
    return { ...check, samples: values.length, summary, status: summary.mean >= check.minimum ? "pass" as const : "fail" as const };
  });
  const perCondition = conditions().filter(c => runs.some(r => r.condition === c.id)).map(c => {
    const rows = runs.filter(r => r.condition === c.id);
    const metric = (variant: Variant, key: keyof Omit<WorldMetrics, "actions">) => mean(rows.map(r => r[variant][key]));
    const keys = ["contactTicks", "meanRisk", "withdrawFraction", "approachFraction", "closeFraction", "visibleFraction", "needBurden", "reliefFraction", "minimumHealth", "predictionMAE", "vocalizations", "bonusActiveFraction", "bonusMagnitude"] as const;
    return { condition: c.id, n: rows.length, baseline: Object.fromEntries(keys.map(k => [k, metric("baseline", k)])), candidate: Object.fromEntries(keys.map(k => [k, metric("candidate", k)])) };
  });
  return { checks, ablationExact: runs.every(r => r.ablationExact), perCondition };
}
export function runWorldPartition(name: "development" | "validation") {
  const seeds = name === "development" ? protocol.developmentSeeds : protocol.validationSeeds;
  const runs: Run[] = [];
  for (const condition of conditions()) for (const seed of seeds) runs.push(runPair(condition, seed));
  return { name, seeds, conditions: conditions().map(c => c.id), runs, ...assessRuns(name, runs) };
}
