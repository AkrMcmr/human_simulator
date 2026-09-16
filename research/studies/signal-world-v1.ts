import protocol from "../protocols/signal-world-v1.json" with { type: "json" };
import type { ActionIntent, DecisionTrace, SoundShape } from "../../packages/contracts/src/index.ts";
import { pairExperiment, DEFAULT_SETTINGS } from "../../packages/experiments/src/index.ts";
import { createSimulation, resolveModel, type SimulatorState } from "../../packages/simulation/src/index.ts";
import { advanceWorld, senseWorld } from "../../packages/world/src/index.ts";
import { keyedRandom } from "../../packages/simulation/src/random.ts";
import { mean, summarizeSamples, type Summary } from "../../packages/evaluation/src/index.ts";

export { protocol };
export type Condition = "sound" | "muted" | "scrambled";
export type Pair = { x: string; y: string; late: boolean };
export type Association = { events: number; mi: number; permutationMean: number; excess: number };
export type RunResult = {
  condition: Condition; model: string; seed: number;
  listener: Association; listenerLate: Association; speaker: Association;
  needBurden: number; contactTicks: number; closeFraction: number;
  vocalizations: Record<string, number>; heardEvents: Record<string, number>; categories: Record<string, number>;
};

/** Experimenter-side grid over the two acoustic features; independent of any individual's own categories. */
export function soundBin(shape: SoundShape): string {
  const g = protocol.soundGrid;
  const cell = (v: number) => Math.min(g - 1, Math.floor(Math.max(0, Math.min(0.999999, v)) * g));
  return `${cell(shape.openness)}-${cell(shape.resonance)}`;
}
export function situationBin(distance: number | null): string | null {
  if (distance === null) return null;
  return distance < protocol.speakerSituations.near ? "near" : distance > protocol.speakerSituations.far ? "far" : "mid";
}
const JOIN = "|";
export function mutualInformation(pairs: { x: string; y: string }[]): number {
  if (pairs.length < 2) return 0;
  const n = pairs.length, px = new Map<string, number>(), py = new Map<string, number>(), pxy = new Map<string, number>();
  for (const p of pairs) { px.set(p.x, (px.get(p.x) ?? 0) + 1); py.set(p.y, (py.get(p.y) ?? 0) + 1); pxy.set(p.x + JOIN + p.y, (pxy.get(p.x + JOIN + p.y) ?? 0) + 1); }
  let mi = 0;
  for (const [key, c] of pxy) { const [x, y] = key.split(JOIN); const pj = c / n; mi += pj * Math.log2(pj / ((px.get(x)! / n) * (py.get(y)! / n))); }
  return Math.max(0, mi);
}
/** Excess over a within-sample permutation baseline: label shuffles keep both marginals and remove any dependence. */
export function association(pairs: { x: string; y: string }[], seed: number, stream: string): Association {
  const mi = mutualInformation(pairs);
  if (pairs.length < 2) return { events: pairs.length, mi: 0, permutationMean: 0, excess: 0 };
  const random = keyedRandom(seed, "signal-world/permutation/" + stream, 0);
  let total = 0;
  for (let p = 0; p < protocol.permutations; p++) {
    const ys = pairs.map(q => q.y);
    for (let i = ys.length - 1; i > 0; i--) { const j = Math.floor(random("swap", p * pairs.length + i) * (i + 1)); [ys[i], ys[j]] = [ys[j], ys[i]]; }
    total += mutualInformation(pairs.map((q, i) => ({ x: q.x, y: ys[i] })));
  }
  const permutationMean = total / protocol.permutations;
  return { events: pairs.length, mi, permutationMean, excess: mi - permutationMean };
}
const response = (kind: string) => kind === "approach" || kind === "withdraw" ? kind : "other";

/** Free two-person world; the only interventions are muting or scrambling what listeners hear. Both individuals use the same model. */
export function runCondition(modelId: string, seed: number, condition: Condition): RunResult {
  const model = resolveModel(modelId);
  const config = pairExperiment({ ...structuredClone(DEFAULT_SETTINGS), seed, horizon: protocol.horizon, initialDistance: protocol.initialDistance, resourceLayout: protocol.resourceLayout as "shared" | "separate", soundEnabled: condition !== "muted", model: modelId });
  let state: SimulatorState = createSimulation(config);
  const ids = state.humans.map(h => h.id);
  const listenerPairs: Pair[] = [], speakerPairs: Pair[] = [];
  const vocalizations: Record<string, number> = {}, heardEvents: Record<string, number> = {};
  const burdens: number[] = []; let contactTicks = 0, closeTicks = 0;
  const scramble = keyedRandom(seed, "signal-world/scramble", 0);
  for (let tick = 0; tick < protocol.horizon; tick++) {
    const actions: Record<string, ActionIntent> = {}, traces: Record<string, DecisionTrace> = {};
    const late = tick >= protocol.lateFrom;
    const humans = [...state.humans].sort((a, b) => a.id.localeCompare(b.id)).map(h => {
      if (h.body.health <= 0) return structuredClone(h);
      const observation = senseWorld(state.world, h.id, tick, keyedRandom(seed, "senses/" + h.id, tick));
      if (condition === "scrambled") observation.sounds = observation.sounds.map((s, i) => ({ ...s, shape: { openness: scramble("o-" + h.id + "-" + tick, i), resonance: scramble("r-" + h.id + "-" + tick, i) } }));
      const result = model.decide(h, observation, keyedRandom(seed, "mind/" + h.id, tick));
      for (const s of observation.sounds) if (s.visibleSourceId !== null) { heardEvents[h.id] = (heardEvents[h.id] ?? 0) + 1; listenerPairs.push({ x: soundBin(s.shape), y: response(result.action.kind), late }); }
      if (result.action.kind === "vocalize" && result.action.sound) {
        vocalizations[h.id] = (vocalizations[h.id] ?? 0) + 1;
        const situation = situationBin(result.trace.peerDistance);
        if (situation) speakerPairs.push({ x: situation, y: soundBin(result.action.sound), late });
      }
      actions[h.id] = result.action; traces[h.id] = result.trace;
      return result.human;
    });
    const advanced = advanceWorld(state.world, actions, tick);
    state = { ...state, tick: tick + 1, humans: humans.map(h => h.body.health <= 0 ? h : model.apply(h, advanced.effects[h.id])), world: advanced.world, traces, events: advanced.events };
    for (const h of state.humans) burdens.push(Math.max(h.body.hunger, h.body.fatigue, h.body.cold));
    if (advanced.events.some(e => e.kind === "contact")) contactTicks++;
    const [a, b] = state.world.animals;
    if (Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) < 4) closeTicks++;
  }
  return {
    condition, model: model.id, seed,
    listener: association(listenerPairs, seed, "listener"), listenerLate: association(listenerPairs.filter(p => p.late), seed, "listener-late"),
    speaker: association(speakerPairs, seed, "speaker"),
    needBurden: mean(burdens), contactTicks: contactTicks / protocol.horizon, closeFraction: closeTicks / protocol.horizon,
    vocalizations: Object.fromEntries(ids.map(id => [id, vocalizations[id] ?? 0])), heardEvents: Object.fromEntries(ids.map(id => [id, heardEvents[id] ?? 0])),
    categories: Object.fromEntries(state.humans.map(h => [h.id, h.heardSounds.length])),
  };
}
export type SeedResult = { seed: number; model: string; sound: RunResult; muted: RunResult; scrambled: RunResult };
export function runSeed(modelId: string, seed: number): SeedResult {
  return { seed, model: modelId, sound: runCondition(modelId, seed, "sound"), muted: runCondition(modelId, seed, "muted"), scrambled: runCondition(modelId, seed, "scrambled") };
}
export function checkValue(id: string, r: SeedResult): number {
  switch (id) {
    case "listener-association": return r.sound.listener.excess - r.scrambled.listener.excess;
    case "listener-holdout": return r.sound.listenerLate.excess - r.scrambled.listenerLate.excess;
    case "speaker-selection": return r.sound.speaker.excess;
    case "need-side-effect": return r.muted.needBurden - r.sound.needBurden;
    default: throw new Error("Unknown check " + id);
  }
}
export type Check = (typeof protocol.checks)[number] & { values: number[]; summary: Summary; status: "pass" | "fail" };
export function assessSeeds(name: string, results: SeedResult[]) {
  const checks: Check[] = protocol.checks.map(check => {
    const values = results.map(r => checkValue(check.id, r));
    const summary = summarizeSamples(values, "signal-world/" + name + "/" + check.id);
    return { ...check, values, summary, status: summary.mean >= check.minimum ? "pass" as const : "fail" as const };
  });
  const established = checks.every(c => c.status === "pass");
  return { checks, established };
}
export function runSignalWorldPartition(name: "development" | "validation" | "pilot", modelId: string) {
  resolveModel(modelId);
  const seeds = name === "development" ? protocol.developmentSeeds : name === "validation" ? protocol.validationSeeds : protocol.pilotSeeds;
  const results = seeds.map(seed => runSeed(modelId, seed));
  return { name, seeds, model: modelId, results, ...assessSeeds(name + "/" + modelId, results) };
}
