import protocol from "../protocols/history-v1.json" with { type: "json" };
import type { Body, Observation } from "../../packages/contracts/src/index.ts";
import type { HumanState } from "../../packages/human/src/index.ts";
import { createWorld, advanceWorld, senseWorld } from "../../packages/world/src/index.ts";
import { keyedRandom } from "../../packages/simulation/src/random.ts";
import { resolveModel, type HumanModel } from "../../packages/simulation/src/index.ts";
import { mean, summarizeSamples, type Summary } from "../../packages/evaluation/src/index.ts";

export { protocol };
export type History = "harm" | "safe";
export type Intervention = "retain" | "erase" | "swap";
export type Layout = "shared" | "separate";
export type FreeResult = { layout: Layout; meanRisk: number; withdrawFraction: number; closeTicks: number; contactTicks: number; closeEvidenceGain: number; finalProbe: Probe; finalProbeHighNeed: Probe; meanDistance: number; visibleFraction: number };
export type Probe = { risk: number; margin: number; harmEstimate: number; predictedSafetyWithdraw: number; predictedSafetyApproach: number };
export type SubjectResult = {
  history: History; intervention: Intervention; painEvents: number;
  probe: Probe; highNeedProbe: Probe;
  forced: { checkpoints: Record<string, number>; final: Probe } | null;
  free: Record<Layout, FreeResult> | null;
};
export type SeedResult = { seed: number; model: string; subjects: SubjectResult[] };

function observation(tick: number, distance: number): Observation {
  return { tick, selfPosition: { x: 10, y: 14 }, animals: [{ trackId: "B", relativePosition: { x: distance, y: 0 }, relativeVelocity: { x: 0, y: 0 }, morphologySimilarity: .98 }], resources: [], sounds: [] };
}
const harmEstimate = (state: HumanState) => state.peers.B ? state.peers.B.harmAlpha / (state.peers.B.harmAlpha + state.peers.B.harmBeta) : .5;
const closeEvidence = (state: HumanState) => state.peers.B ? state.peers.B.harmAlpha + state.peers.B.harmBeta - 2 : 0;
/** Same perception and body for every subject; transition learning is frozen so the probe itself does not teach. */
export function probe(model: HumanModel, state: HumanState, body: Body = protocol.probe.body): Probe {
  const standardized = structuredClone(state);
  standardized.body = { ...body };
  standardized.parameters.learningRate = 0;
  standardized.pending = null;
  const result = model.decide(standardized, observation(10_000, protocol.probe.distance), keyedRandom(0, "history-v1/probe", 0));
  const score = (kind: string) => { const s = result.trace.scores.find(s => s.action === kind); if (!s) throw new Error("Probe lacks action " + kind); return s; };
  return { risk: result.trace.perceivedRisk, margin: score("withdraw").utility - score("approach").utility, harmEstimate: harmEstimate(state), predictedSafetyWithdraw: score("withdraw").terms.predictedSafety ?? 0, predictedSafetyApproach: score("approach").terms.predictedSafety ?? 0 };
}
/** Phase 1: the experimenter presents the peer at a fixed near distance and, for a harm history, applies contact pain at random steps. */
export function induceHistory(model: HumanModel, seed: number, history: History) {
  const h = protocol.history;
  let state = model.create("A", {}, h.body);
  const pain = keyedRandom(seed, "history-v1/pain", 0);
  let painEvents = 0;
  for (let tick = 0; tick <= h.steps; tick++) {
    state = model.decide(state, observation(tick, h.distance), keyedRandom(seed, "history-v1/induce", tick)).human;
    if (tick < h.steps) {
      const collision = history === "harm" && pain("pain", tick) < h.painProbability ? h.painMagnitude : 0;
      if (collision) painEvents++;
      state = model.apply(state, { ambientCold: .1, foodIntake: 0, exertion: 0, resting: false, collision });
    }
  }
  return { state, painEvents };
}
/** Experimenter intervention on the subject's memory of the peer. The subject receives no label about what happened. */
export function intervene(state: HumanState, kind: Intervention, donor: HumanState): HumanState {
  const next = structuredClone(state);
  next.pending = null;
  if (kind === "erase") next.peers = {};
  if (kind === "swap") next.peers = structuredClone(donor.peers);
  return next;
}
/** Phase 2a: the peer stays near and harmless regardless of the subject's choices. */
export function forcedRecovery(model: HumanModel, seed: number, initial: HumanState) {
  const f = protocol.forcedRecovery;
  let state = structuredClone(initial);
  state.pending = null;
  const checkpoints: Record<string, number> = {};
  for (let tick = 1; tick <= f.steps; tick++) {
    state = model.decide(state, observation(20_000 + tick, protocol.history.distance), keyedRandom(seed, "history-v1/forced", tick)).human;
    state = model.apply(state, { ambientCold: .1, foodIntake: 0, exertion: 0, resting: false, collision: 0 });
    if (f.checkpoints.includes(tick)) checkpoints[String(tick)] = probe(model, state).risk;
  }
  return { checkpoints, final: probe(model, state) };
}
/** Phase 2b: both individuals decide endogenously in a small world; the peer is a fresh individual. */
export function freePhase(model: HumanModel, seed: number, initial: HumanState, layout: Layout): FreeResult {
  const f = protocol.freePhase;
  const l = f.layouts[layout];
  let a = structuredClone(initial);
  a.pending = null; a.body = { ...a.body, ...f.body }; a.places = {}; a.explorationTarget = null; a.lastAction = "observe";
  let b = model.create("B", {}, f.body);
  let world = createWorld([{ id: "A", position: l.positions.A }, { id: "B", position: l.positions.B }], {}, l.resources as Parameters<typeof createWorld>[2]);
  const startEvidence = closeEvidence(a);
  const risks: number[] = [], distances: number[] = [];
  let withdraw = 0, visible = 0, closeTicks = 0, contactTicks = 0;
  for (let tick = 0; tick < f.steps; tick++) {
    const ra = model.decide(a, senseWorld(world, "A", tick, keyedRandom(seed, "history-v1/free/" + layout + "/senses/A", tick)), keyedRandom(seed, "history-v1/free/" + layout + "/mind/A", tick));
    const rb = model.decide(b, senseWorld(world, "B", tick, keyedRandom(seed, "history-v1/free/" + layout + "/senses/B", tick)), keyedRandom(seed, "history-v1/free/" + layout + "/mind/B", tick));
    risks.push(ra.trace.perceivedRisk);
    if (ra.trace.peerTrackId) { visible++; if (ra.action.kind === "withdraw") withdraw++; }
    const advanced = advanceWorld(world, { A: ra.action, B: rb.action }, tick);
    world = advanced.world;
    a = model.apply(ra.human, advanced.effects.A); b = model.apply(rb.human, advanced.effects.B);
    const d = Math.hypot(world.animals[0].position.x - world.animals[1].position.x, world.animals[0].position.y - world.animals[1].position.y);
    distances.push(d);
    if (d < f.closeDistance) closeTicks++;
    if (advanced.events.some(e => e.kind === "contact" && e.actorId === "A")) contactTicks++;
  }
  return { layout, meanRisk: mean(risks), withdrawFraction: visible ? withdraw / visible : 0, visibleFraction: visible / f.steps, closeTicks, contactTicks, closeEvidenceGain: closeEvidence(a) - startEvidence, finalProbe: probe(model, a), finalProbeHighNeed: probe(model, a, protocol.probe.highNeedBody), meanDistance: mean(distances) };
}
export function runSeed(modelId: string, seed: number): SeedResult {
  const model = resolveModel(modelId);
  const induced = { harm: induceHistory(model, seed, "harm"), safe: induceHistory(model, seed, "safe") };
  const subjects: SubjectResult[] = [];
  for (const history of ["harm", "safe"] as History[]) for (const intervention of protocol.interventions as Intervention[]) {
    const donor = induced[history === "harm" ? "safe" : "harm"].state;
    const state = intervene(induced[history].state, intervention, donor);
    const retain = intervention === "retain";
    subjects.push({
      history, intervention, painEvents: induced[history].painEvents,
      probe: probe(model, state), highNeedProbe: probe(model, state, protocol.probe.highNeedBody),
      forced: retain ? forcedRecovery(model, seed, state) : null,
      free: retain ? { shared: freePhase(model, seed, state, "shared"), separate: freePhase(model, seed, state, "separate") } : null,
    });
  }
  return { seed, model: model.id, subjects };
}
export function subject(result: SeedResult, history: History, intervention: Intervention): SubjectResult {
  const s = result.subjects.find(s => s.history === history && s.intervention === intervention);
  if (!s) throw new Error("Missing subject " + history + "/" + intervention);
  return s;
}
/** Oriented so that higher is better for every check. */
export function checkValue(id: string, r: SeedResult): number {
  const harm = subject(r, "harm", "retain"), safe = subject(r, "safe", "retain");
  switch (id) {
    case "history-risk": return harm.probe.risk - safe.probe.risk;
    case "history-policy": return harm.probe.margin - safe.probe.margin;
    case "erase-removes": { const gap = Math.abs(subject(r, "harm", "erase").probe.risk - subject(r, "safe", "erase").probe.risk); return gap === 0 ? 0 : -gap; }
    case "swap-reverses": return subject(r, "safe", "swap").probe.risk - subject(r, "harm", "swap").probe.risk;
    case "forced-recovery": return harm.probe.risk - harm.forced!.final.risk;
    case "free-fixation-separate": return harm.free!.separate.finalProbe.risk - harm.forced!.final.risk;
    case "shared-keeps-updating": return harm.free!.shared.closeEvidenceGain - harm.free!.separate.closeEvidenceGain;
    default: throw new Error("Unknown check " + id);
  }
}
export function exploratoryValues(r: SeedResult) {
  const harm = subject(r, "harm", "retain"), safe = subject(r, "safe", "retain");
  const margin = (p: Probe) => p.margin, psMargin = (p: Probe) => p.predictedSafetyWithdraw - p.predictedSafetyApproach;
  const layout = (l: Layout) => ({
    harmRiskDrop: harm.probe.risk - harm.free![l].finalProbe.risk, harmCloseEvidenceGain: harm.free![l].closeEvidenceGain, harmCloseTicks: harm.free![l].closeTicks, harmWithdrawFraction: harm.free![l].withdrawFraction, harmContactTicks: harm.free![l].contactTicks, harmMeanDistance: harm.free![l].meanDistance, harmVisibleFraction: harm.free![l].visibleFraction,
    safeRiskDrop: safe.probe.risk - safe.free![l].finalProbe.risk, safeCloseEvidenceGain: safe.free![l].closeEvidenceGain, safeWithdrawFraction: safe.free![l].withdrawFraction, safeMeanDistance: safe.free![l].meanDistance,
    marginDifferenceLowNeed: margin(harm.free![l].finalProbe) - margin(safe.free![l].finalProbe), marginDifferenceHighNeed: margin(harm.free![l].finalProbeHighNeed) - margin(safe.free![l].finalProbeHighNeed),
    predictedSafetyMarginLowNeed: psMargin(harm.free![l].finalProbe) - psMargin(safe.free![l].finalProbe), predictedSafetyMarginHighNeed: psMargin(harm.free![l].finalProbeHighNeed) - psMargin(safe.free![l].finalProbeHighNeed),
    harmEstimateAfterFree: harm.free![l].finalProbe.harmEstimate,
  });
  return {
    afterHistory: { marginDifference: harm.probe.margin - safe.probe.margin, predictedSafetyMarginDifference: psMargin(harm.probe) - psMargin(safe.probe), harmEstimateHarm: harm.probe.harmEstimate, harmEstimateSafe: safe.probe.harmEstimate, painEvents: harm.painEvents },
    forced: { harmRiskDrop: harm.probe.risk - harm.forced!.final.risk, checkpoints: harm.forced!.checkpoints, harmEstimateAfterForced: harm.forced!.final.harmEstimate },
    shared: layout("shared"), separate: layout("separate"),
  };
}
export type Check = (typeof protocol.checks)[number] & { values: number[]; summary: Summary; status: "pass" | "fail" };
export function assessSeeds(name: string, results: SeedResult[]) {
  const checks: Check[] = protocol.checks.map(check => {
    const values = results.map(r => checkValue(check.id, r));
    const summary = summarizeSamples(values, "history-v1/" + name + "/" + check.id);
    return { ...check, values, summary, status: summary.mean >= check.minimum ? "pass" as const : "fail" as const };
  });
  const exploratory = results.map(r => ({ seed: r.seed, ...exploratoryValues(r) }));
  return { checks, exploratory };
}
export function runHistoryPartition(name: "development" | "validation" | "pilot", modelId: string = protocol.model) {
  const seeds = name === "development" ? protocol.developmentSeeds : name === "validation" ? protocol.validationSeeds : protocol.pilotSeeds;
  const results = seeds.map(seed => runSeed(modelId, seed));
  return { name, seeds, model: modelId, results, ...assessSeeds(name + "/" + modelId, results) };
}
