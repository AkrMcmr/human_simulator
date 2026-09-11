import protocol from "../protocols/reversal-v1.json" with { type: "json" };
import type { Observation } from "../../packages/contracts/src/index.ts";
import type { HumanState } from "../../packages/human/src/index.ts";
import { keyedRandom } from "../../packages/simulation/src/random.ts";
import { resolveModel, type HumanModel } from "../../packages/simulation/src/index.ts";
import { summarizeSamples, type Summary } from "../../packages/evaluation/src/index.ts";

export { protocol };
export type Direction = "safe-to-harm" | "harm-to-safe";
export type Probe = { risk: number; harmEstimate: number; evidence: number };
export type Trajectory = { history: number; direction: Direction; painEvents: number; probes: Record<string, Probe> };
export type GapResult = { gap: number; probe: Probe };
export type SeedResult = { seed: number; model: string; trajectories: Trajectory[]; gaps: GapResult[] };

function observation(tick: number, distance: number): Observation {
  return { tick, selfPosition: { x: 10, y: 14 }, animals: [{ trackId: "B", relativePosition: { x: distance, y: 0 }, relativeVelocity: { x: 0, y: 0 }, morphologySimilarity: .98 }], resources: [], sounds: [] };
}
export function probe(model: HumanModel, state: HumanState): Probe {
  const standardized = structuredClone(state);
  standardized.body = { ...protocol.probe.body };
  standardized.parameters.learningRate = 0;
  standardized.pending = null;
  const result = model.decide(standardized, observation(50_000, protocol.probe.distance), keyedRandom(0, "reversal-v1/probe", 0));
  const peer = state.peers.B;
  return { risk: result.trace.perceivedRisk, harmEstimate: peer ? peer.harmAlpha / (peer.harmAlpha + peer.harmBeta) : .5, evidence: peer ? peer.harmAlpha + peer.harmBeta - 2 : 0 };
}
/** Experimenter-presented peer at a fixed distance; pain is applied only in harmful blocks. Returns the state after `steps` learning steps. */
export function expose(model: HumanModel, seed: number, stream: string, initial: HumanState, steps: number, harmful: boolean, distance: number, onStep?: (step: number, state: HumanState) => void) {
  let state = structuredClone(initial);
  state.pending = null;
  const pain = keyedRandom(seed, "reversal-v1/pain/" + stream, 0);
  let painEvents = 0;
  onStep?.(0, state);
  for (let step = 1; step <= steps; step++) {
    // Perceive, then experience the outcome of standing at this distance; the next perception closes the learning loop.
    state = model.decide(state, observation(step, distance), keyedRandom(seed, "reversal-v1/mind/" + stream, step)).human;
    const collision = harmful && pain("pain", step) < protocol.exposure.painProbability ? protocol.exposure.painMagnitude : 0;
    if (collision) painEvents++;
    state = model.apply(state, { ambientCold: .1, foodIntake: 0, exertion: 0, resting: false, collision });
    state = model.decide(state, observation(step, distance), keyedRandom(seed, "reversal-v1/settle/" + stream, step)).human;
    state.pending = null;
    onStep?.(step, state);
  }
  return { state, painEvents };
}
export function trajectory(model: HumanModel, seed: number, history: number, direction: Direction): Trajectory {
  const e = protocol.exposure;
  const start = model.create("A", {}, e.body);
  const first = expose(model, seed, `history/${history}/${direction}`, start, history, direction === "harm-to-safe", e.distance);
  const probes: Record<string, Probe> = {};
  const second = expose(model, seed, `reversed/${history}/${direction}`, first.state, protocol.reversedSteps, direction === "safe-to-harm", e.distance, (step, state) => {
    if (protocol.probeAt.includes(step)) probes[String(step)] = probe(model, state);
  });
  return { history, direction, painEvents: first.painEvents + second.painEvents, probes };
}
export function gapTrajectory(model: HumanModel, seed: number): GapResult[] {
  const e = protocol.exposure, g = protocol.gap;
  const safe = expose(model, seed, "gap/safe", model.create("A", {}, e.body), g.afterSafeSteps, false, e.distance).state;
  return g.lengths.map(gap => ({ gap, probe: probe(model, expose(model, seed, "gap/far", safe, gap, false, g.farDistance).state) }));
}
export function runSeed(modelId: string, seed: number): SeedResult {
  const model = resolveModel(modelId);
  const trajectories: Trajectory[] = [];
  for (const history of protocol.historyLengths) for (const direction of ["safe-to-harm", "harm-to-safe"] as Direction[]) {
    if (history === 0 && direction === "harm-to-safe") continue; // nothing to recover from
    trajectories.push(trajectory(model, seed, history, direction));
  }
  return { seed, model: model.id, trajectories, gaps: gapTrajectory(model, seed) };
}
export function at(r: SeedResult, history: number, direction: Direction, step: number): Probe {
  const t = r.trajectories.find(t => t.history === history && t.direction === direction);
  const p = t?.probes[String(step)];
  if (!p) throw new Error(`Missing probe ${history}/${direction}/${step}`);
  return p;
}
export function gapAt(r: SeedResult, gap: number): Probe {
  const g = r.gaps.find(g => g.gap === gap);
  if (!g) throw new Error("Missing gap " + gap);
  return g.probe;
}
/** Oriented so that higher means the predicted phenomenon is stronger. */
export function checkValue(id: string, r: SeedResult): number {
  const last = protocol.reversedSteps;
  switch (id) {
    case "lag-safe-to-harm": return at(r, 0, "safe-to-harm", last).risk - at(r, 60, "safe-to-harm", last).risk;
    case "lag-grows-with-history": return at(r, 60, "safe-to-harm", last).risk - at(r, 240, "safe-to-harm", last).risk;
    case "recovery-after-harm": return at(r, 60, "harm-to-safe", 0).risk - at(r, 60, "harm-to-safe", last).risk;
    case "recovery-slows-with-history": return at(r, 240, "harm-to-safe", last).risk - at(r, 60, "harm-to-safe", last).risk;
    case "gap-fading": return gapAt(r, 480).risk - gapAt(r, 0).risk;
    default: throw new Error("Unknown check " + id);
  }
}
export type Check = (typeof protocol.checks)[number] & { values: number[]; summary: Summary; status: "pass" | "fail" };
export function assessSeeds(name: string, results: SeedResult[]) {
  const checks: Check[] = protocol.checks.map(check => {
    const values = results.map(r => checkValue(check.id, r));
    const summary = summarizeSamples(values, "reversal-v1/" + name + "/" + check.id);
    return { ...check, values, summary, status: summary.mean >= check.minimum ? "pass" as const : "fail" as const };
  });
  return { checks };
}
export type ReversalPartition = ReturnType<typeof runReversalPartition>;
export function runReversalPartition(name: "development" | "validation" | "pilot", modelId: string = protocol.model) {
  const seeds = name === "development" ? protocol.developmentSeeds : name === "validation" ? protocol.validationSeeds : protocol.pilotSeeds;
  const results = seeds.map(seed => runSeed(modelId, seed));
  return { name, seeds, model: modelId, results, ...assessSeeds(name + "/" + modelId, results) };
}
/** Paired comparison of two models on the same seeds, oriented by each check's preferred direction (none → candidate minus baseline). */
export function compareModels(baseline: ReversalPartition, candidate: ReversalPartition) {
  if (JSON.stringify(baseline.seeds) !== JSON.stringify(candidate.seeds)) throw new Error("Seeds differ");
  return protocol.checks.map((check, i) => {
    const deltas = baseline.checks[i].values.map((b, j) => { const c = candidate.checks[i].values[j]; return check.preferred === "lower" ? b - c : c - b; });
    const summary = summarizeSamples(deltas, "reversal-v1/compare/" + baseline.name + "/" + check.id);
    const raw = candidate.checks[i].summary.mean - baseline.checks[i].summary.mean;
    return { id: check.id, role: check.role, preferred: check.preferred, delta: summary, rawDelta: raw, status: check.role === "capability" && raw < -check.regressionTolerance ? "regressed" as const : Math.abs(raw) <= check.regressionTolerance ? "within-tolerance" as const : "changed" as const };
  });
}
