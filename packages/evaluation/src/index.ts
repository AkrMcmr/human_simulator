import protocol from "../../../research/protocols/core-v1.json" with { type: "json" };
import type { Body, HumanParameters, Observation, ActionKind } from "../../contracts/src/index.ts";
import { createHuman, decideHuman, applyPhysicalEffect, DEFAULT_PARAMETERS } from "../../human/src/index.ts";
import { createWorld, advanceWorld, senseWorld } from "../../world/src/index.ts";
import { keyedRandom } from "../../simulation/src/random.ts";

export { protocol };
export const EVALUATOR_VERSION = "0.1.1";
export type ModelAdapter = { create: typeof createHuman; decide: typeof decideHuman; apply: typeof applyPhysicalEffect };
export const currentModel: ModelAdapter = { create: createHuman, decide: decideHuman, apply: applyPhysicalEffect };
export type Sample = { seed: number; value: number; observations: number; details: Record<string, number> };
export type Summary = { n: number; mean: number; sd: number; interval95: [number, number] };
export type CheckResult = { id: string; label: string; domain: string; unit: string; minimum: number; regressionTolerance: number; samples: Sample[]; summary: Summary; status: "pass" | "fail" };
export type Partition = { name: "development" | "validation"; seeds: number[]; checks: CheckResult[] };
export type Evaluation = { evaluatorVersion: string; protocol: typeof protocol; parameters: HumanParameters; partitions: Partition[] };
export const mean = (xs: number[]) => {
  if (!xs.length || xs.some(x => !Number.isFinite(x))) throw new Error("Missing or non-finite measurements");
  return xs.reduce((a, b) => a + b, 0) / xs.length;
};
export function summarizeSamples(values: number[], key: string): Summary {
  const avg = mean(values);
  const sd = values.length > 1 ? Math.sqrt(values.reduce((s, x) => s + (x - avg) ** 2, 0) / (values.length - 1)) : 0;
  const random = keyedRandom(20260909, "evaluation/bootstrap/" + key, 0);
  const boot = Array.from({ length: protocol.bootstrapReplicates }, (_, b) => mean(values.map((_, i) => values[Math.floor(random("sample", b * values.length + i) * values.length)]))).sort((a, b) => a - b);
  return { n: values.length, mean: avg, sd, interval95: [boot[Math.floor(boot.length * .025)], boot[Math.min(boot.length - 1, Math.floor(boot.length * .975))]] };
}
function observation(tick: number, distance: number, velocity = 0): Observation {
  return { tick, selfPosition: { x: 10, y: 14 }, animals: [{ trackId: "B", relativePosition: { x: distance, y: 0 }, relativeVelocity: { x: velocity, y: 0 }, morphologySimilarity: .98 }], resources: [], sounds: [] };
}
function probe(model: ModelAdapter, state: ReturnType<typeof createHuman>, tick: number) {
  const standardized = structuredClone(state);
  standardized.body = { hunger: .1, fatigue: .1, cold: .1, health: 1 };
  standardized.parameters.learningRate = 0;
  const result = model.decide(standardized, observation(tick, protocol.exposure.nearDistance), keyedRandom(0, "evaluation/probe", tick));
  const score = (kind: ActionKind) => {
    const value = result.trace.scores.find(s => s.action === kind)?.utility;
    if (value === undefined) throw new Error("Required action unavailable in probe: " + kind);
    return value;
  };
  return { risk: result.trace.perceivedRisk, margin: score("withdraw") - score("approach") };
}
function caution(model: ModelAdapter, parameters: HumanParameters, seed: number) {
  const e = protocol.exposure;
  function expose(distance: number, harmful: boolean, learningRate: number, recover = false) {
    let state = model.create("A", { ...parameters, learningRate }, { hunger: .1, fatigue: .1, cold: .1 });
    const feedbackRandom = keyedRandom(seed, "evaluation/contact", 0);
    let painEvents = 0;
    const n = e.steps + (recover ? e.recoverySteps : 0);
    for (let tick = 0; tick <= n; tick++) {
      const result = model.decide(state, observation(tick, distance), keyedRandom(seed, "evaluation/caution", tick));
      state = result.human;
      if (tick < n) {
        const pain = harmful && tick < e.steps && feedbackRandom("pain", tick) < e.painProbability ? e.painMagnitude : 0;
        if (pain) painEvents++;
        state = model.apply(state, { ambientCold: .1, foodIntake: 0, exertion: 0, resting: false, collision: pain });
      }
    }
    return { ...probe(model, state, n + 1), painEvents };
  }
  const safe = expose(e.nearDistance, false, parameters.learningRate);
  const harmful = expose(e.nearDistance, true, parameters.learningRate);
  const frozen = expose(e.nearDistance, false, 0);
  const far = expose(e.farDistance, false, parameters.learningRate);
  const recovered = expose(e.nearDistance, true, parameters.learningRate, true);
  const fresh = probe(model, model.create("A", parameters), 0);
  const sample = (value: number, details: Record<string, number>, observations = e.steps): Sample => ({ seed, value, observations, details });
  return {
    "safe-learning": sample(frozen.risk - safe.risk, { learning: safe.risk, transitionLearningOff: frozen.risk }),
    "danger-discrimination": sample(harmful.risk - safe.risk, { harmful: harmful.risk, safe: safe.risk, painEvents: harmful.painEvents }),
    "caution-policy": sample(harmful.margin - safe.margin, { harmfulMargin: harmful.margin, safeMargin: safe.margin }),
    "far-no-evidence": sample(-Math.abs(far.risk - fresh.risk), { farExposure: far.risk, fresh: fresh.risk }),
    "risk-recovery": sample(harmful.risk - recovered.risk, { before: harmful.risk, after: recovered.risk, recoveryObservations: e.recoverySteps }, e.recoverySteps),
  };
}
function prediction(model: ModelAdapter, parameters: HumanParameters, seed: number) {
  const p = protocol.prediction;
  const random = keyedRandom(seed, "evaluation/motion", 0);
  const distances = [p.initialDistance];
  for (let tick = 0; tick < p.phaseSteps * 2; tick++) distances.push(distances.at(-1)! + (tick < p.phaseSteps ? p.step : -p.step) + (random("noise", tick) - .5) * p.noise);
  function measure(learningRate: number) {
    let state = model.create("A", { ...parameters, learningRate });
    const errors: number[] = [];
    for (let tick = 0; tick < distances.length; tick++) {
      // Score the forecast made before the outcome; do not rely on trace.predictionError,
      // which v0.1 intentionally leaves null when transition learning is disabled.
      if (tick > 0) {
        if (!state.pending) throw new Error("No pre-outcome forecast in visible trajectory");
        errors.push(Math.abs(distances[tick] - distances[tick - 1] - state.pending.predictedDelta));
      }
      state = model.decide(state, observation(tick, distances[tick], tick ? distances[tick] - distances[tick - 1] : 0), keyedRandom(seed, "evaluation/predictor", tick)).human;
    }
    return { stationary: mean(errors.slice(p.phaseSteps - p.window, p.phaseSteps)), reversalEarly: mean(errors.slice(p.phaseSteps, p.phaseSteps + 10)), reversalLate: mean(errors.slice(-p.window)) };
  }
  const learned = measure(parameters.learningRate), frozen = measure(0);
  return {
    "prediction-gain": { seed, value: frozen.stationary - learned.stationary, observations: p.window, details: { learningMAE: learned.stationary, transitionLearningOffMAE: frozen.stationary } },
    "prediction-reversal": { seed, value: learned.reversalEarly - learned.reversalLate, observations: p.window, details: { earlyMAE: learned.reversalEarly, lateMAE: learned.reversalLate, earlyObservations: 10, lateObservations: p.window } },
  };
}
function body(model: ModelAdapter, parameters: HumanParameters, seed: number, need: "hunger" | "fatigue" | "cold"): Sample {
  const b = protocol.body;
  function condition(disconnected: boolean) {
    const initialBody: Body = { hunger: b.otherNeeds, fatigue: b.otherNeeds, cold: b.otherNeeds, health: 1, [need]: b.initialNeed };
    let state = model.create("A", parameters, initialBody);
    let world = createWorld([{ id: "A", position: { x: 10, y: 14 } }], { ambientCold: need === "cold" ? b.coldEnvironment : .1 }, need === "fatigue" ? [] : [{ id: "relief", kind: need === "hunger" ? "food" : "warmth", position: { x: 14, y: 14 }, amount: 1, radius: 2 }]);
    const needs: number[] = [];
    let minimumHealth = 1, selectedRelief = 0, appliedRelief = 0;
    const relief: ActionKind = need === "hunger" ? "forage" : need === "fatigue" ? "rest" : "warm";
    for (let tick = 0; tick < b.steps; tick++) {
      if (state.body.health > 0) {
        const input = senseWorld(world, "A", tick, keyedRandom(seed, "evaluation/body-senses", tick));
        const result = model.decide(state, input, keyedRandom(seed, "evaluation/body-mind", tick));
        if (result.action.kind === relief) selectedRelief++;
        if (!disconnected && result.action.kind === relief) appliedRelief++;
        const next = advanceWorld(world, { A: disconnected ? { kind: "observe" } : result.action }, tick);
        state = model.apply(result.human, next.effects.A); world = next.world;
      }
      const values = Object.values(state.body);
      if (values.some(x => !Number.isFinite(x) || x < 0 || x > 1)) throw new Error("Invalid body in " + need);
      needs.push(state.body[need]); minimumHealth = Math.min(minimumHealth, state.body.health);
    }
    return { need: mean(needs.slice(-b.window)), minimumHealth, alive: Number(state.body.health > 0), selectedRelief, appliedRelief };
  }
  const active = condition(false), disconnected = condition(true);
  // A dead active subject cannot receive a good score through reduced physiological updates.
  const value = active.alive ? disconnected.need - active.need : -1;
  return { seed, value, observations: b.window, details: { activeNeed: active.need, disconnectedNeed: disconnected.need, activeMinimumHealth: active.minimumHealth, disconnectedMinimumHealth: disconnected.minimumHealth, activeAlive: active.alive, disconnectedAlive: disconnected.alive, selectedRelief: active.selectedRelief, appliedRelief: active.appliedRelief, disconnectedSelectedRelief: disconnected.selectedRelief, disconnectedAppliedRelief: disconnected.appliedRelief } };
}
export function runEvaluation(overrides: Partial<HumanParameters> = {}, model: ModelAdapter = currentModel): Evaluation {
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in DEFAULT_PARAMETERS) || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid parameter: " + key);
  }
  const parameters = { ...DEFAULT_PARAMETERS, ...overrides };
  const partitions = (["development", "validation"] as const).map(name => {
    const seeds = [...(name === "development" ? protocol.developmentSeeds : protocol.validationSeeds)];
    const runs = seeds.map(seed => ({ ...caution(model, parameters, seed), ...prediction(model, parameters, seed), "hunger-relief": body(model, parameters, seed, "hunger"), "fatigue-relief": body(model, parameters, seed, "fatigue"), "cold-relief": body(model, parameters, seed, "cold") }));
    return { name, seeds, checks: protocol.checks.map(check => {
      const samples = runs.map(run => run[check.id as keyof typeof run]);
      const summary = summarizeSamples(samples.map(s => s.value), name + "/" + check.id);
      return { ...check, samples, summary, status: summary.mean >= check.minimum ? "pass" as const : "fail" as const };
    }) };
  });
  return { evaluatorVersion: EVALUATOR_VERSION, protocol: structuredClone(protocol), parameters, partitions };
}
export type Provenance = { commit: string; tree: string; dirty: boolean; modelHash: string; environmentHash: string; evaluatorHash: string; dependencyLockHash: string; runtime: string; versions: Record<string, string> };
export type Report = { format: "human-world-lab/evaluation"; schemaVersion: 1; provenance: Provenance; evaluation: Evaluation };
export type Comparison = { partition: string; id: string; label: string; delta: Summary; status: "improved" | "regressed" | "within-tolerance" };
export function validateReport(value: unknown): asserts value is Report {
  const r = value as Report;
  if (!r || r.format !== "human-world-lab/evaluation" || r.schemaVersion !== 1 || !r.provenance || !r.evaluation || typeof r.provenance.environmentHash !== "string" || !r.provenance.environmentHash || typeof r.provenance.evaluatorHash !== "string" || !r.provenance.evaluatorHash || JSON.stringify(r.evaluation.protocol) !== JSON.stringify(protocol) || r.evaluation.evaluatorVersion !== EVALUATOR_VERSION) throw new Error("Invalid or incompatible evaluation report");
  if (!Array.isArray(r.evaluation.partitions) || r.evaluation.partitions.length !== 2) throw new Error("Missing partitions");
  for (const [index, name] of (["development", "validation"] as const).entries()) {
    const part = r.evaluation.partitions[index], seeds = name === "development" ? protocol.developmentSeeds : protocol.validationSeeds;
    if (part.name !== name || JSON.stringify(part.seeds) !== JSON.stringify(seeds) || !Array.isArray(part.checks) || part.checks.length !== protocol.checks.length) throw new Error("Mismatched partition or seeds");
    for (const [i, definition] of protocol.checks.entries()) {
      const check = part.checks[i];
      if (!check || check.id !== definition.id || check.minimum !== definition.minimum || check.regressionTolerance !== definition.regressionTolerance || !Array.isArray(check.samples) || check.samples.length !== seeds.length) throw new Error("Missing or changed check");
      for (const [j, sample] of check.samples.entries()) if (!sample || sample.seed !== seeds[j] || !Number.isFinite(sample.value) || !Number.isInteger(sample.observations) || sample.observations < 1 || !sample.details || Object.values(sample.details).some(v => !Number.isFinite(v))) throw new Error("Invalid paired measurements");
      const summary = summarizeSamples(check.samples.map(s => s.value), name + "/" + check.id);
      if (JSON.stringify(summary) !== JSON.stringify(check.summary) || check.status !== (summary.mean >= definition.minimum ? "pass" : "fail")) throw new Error("Summary does not match measurements");
    }
  }
}
export function compareReports(baseline: Report, candidate: Report): Comparison[] {
  validateReport(baseline); validateReport(candidate);
  if (baseline.provenance.evaluatorHash !== candidate.provenance.evaluatorHash) throw new Error("Evaluator changed: rerun both models using the same evaluator");
  if (baseline.provenance.environmentHash !== candidate.provenance.environmentHash) throw new Error("Environment or RNG changed: compare both human models with the same world, contracts, and random generator");
  return candidate.evaluation.partitions.flatMap((part, p) => part.checks.map((check, c) => {
    const old = baseline.evaluation.partitions[p].checks[c];
    const delta = summarizeSamples(check.samples.map((s, i) => s.value - old.samples[i].value), "comparison/" + part.name + "/" + check.id);
    return { partition: part.name, id: check.id, label: check.label, delta, status: delta.mean < -check.regressionTolerance ? "regressed" as const : delta.mean > check.regressionTolerance ? "improved" as const : "within-tolerance" as const };
  }));
}
