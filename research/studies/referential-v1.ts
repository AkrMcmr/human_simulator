import protocolV1 from "../protocols/referential-v1.json" with { type: "json" };
import type { ActionIntent, DecisionTrace } from "../../packages/contracts/src/index.ts";
import { createSimulation, resolveModel, type ExperimentConfig, type SimulatorState } from "../../packages/simulation/src/index.ts";
import { DEFAULT_WORLD, advanceWorld, senseWorld, type Resource } from "../../packages/world/src/index.ts";
import { keyedRandom } from "../../packages/simulation/src/random.ts";
import { mean, summarizeSamples, type Summary } from "../../packages/evaluation/src/index.ts";

export type ReferentialProtocol = typeof protocolV1;
export const protocol = protocolV1;
export type Condition = "sound" | "muted" | "misdirected" | "scrambled";
export type RunResult = {
  condition: Condition; model: string; seed: number;
  meanHunger: number; foodIntake: number; firstFoodTick: Record<string, number>; meanFirstFoodTick: number;
  heardEvents: number; unseenHeardEvents: number; towardSourceFraction: number; foodAfterHearingFraction: number;
  contactTicks: number; closeFraction: number; vocalizations: number; minimumHealth: number;
};
export function referentialConfig(seed: number, modelId: string, soundEnabled: boolean, protocol: ReferentialProtocol = protocolV1): ExperimentConfig {
  return {
    name: "referential-v1", seed, horizon: protocol.horizon, model: modelId,
    world: { ...DEFAULT_WORLD, ...protocol.world, soundEnabled },
    resources: structuredClone(protocol.resources) as Resource[],
    agents: Object.entries(protocol.agents).map(([id, position]) => ({ id, position: { ...position }, parameters: {}, body: { ...protocol.body } })),
  };
}
/** Free world with narrow vision and scattered food. Interventions touch only what listeners hear: nothing, a wrong direction, or a wrong shape. */
export function runCondition(modelId: string, seed: number, condition: Condition, protocol: ReferentialProtocol = protocolV1): RunResult {
  const model = resolveModel(modelId);
  let state: SimulatorState = createSimulation(referentialConfig(seed, modelId, condition !== "muted", protocol));
  const ids = state.humans.map(h => h.id);
  const intervene = keyedRandom(seed, "referential/intervene", 0);
  const hungers: number[] = [];
  const firstFoodTick: Record<string, number> = {};
  let foodIntake = 0, heardEvents = 0, unseenHeardEvents = 0, towardChecks = 0, towardHits = 0, contactTicks = 0, closeTicks = 0, vocalizations = 0, minimumHealth = 1;
  const lastHeard: Record<string, number> = {};
  const heardBeforeFood: Record<string, boolean> = {};
  const pendingDirections: Record<string, { x: number; y: number } | null> = {};
  for (let tick = 0; tick < protocol.horizon; tick++) {
    const actions: Record<string, ActionIntent> = {}, traces: Record<string, DecisionTrace> = {};
    const before = new Map(state.world.animals.map(a => [a.id, { ...a.position }]));
    const humans = [...state.humans].sort((a, b) => a.id.localeCompare(b.id)).map(h => {
      if (h.body.health <= 0) return structuredClone(h);
      const observation = senseWorld(state.world, h.id, tick, keyedRandom(seed, "senses/" + h.id, tick));
      if (condition === "misdirected") observation.sounds = observation.sounds.map((s, i) => { const length = Math.hypot(s.relativePosition.x, s.relativePosition.y); const angle = intervene("dir-" + h.id + "-" + tick, i) * Math.PI * 2; return { ...s, relativePosition: { x: Math.cos(angle) * length, y: Math.sin(angle) * length } }; });
      if (condition === "scrambled") observation.sounds = observation.sounds.map((s, i) => ({ ...s, shape: { openness: intervene("o-" + h.id + "-" + tick, i), resonance: intervene("r-" + h.id + "-" + tick, i) } }));
      const result = model.decide(h, observation, keyedRandom(seed, "mind/" + h.id, tick));
      pendingDirections[h.id] = null;
      for (const s of observation.sounds) {
        heardEvents++;
        if (s.visibleSourceId === null) unseenHeardEvents++;
        lastHeard[h.id] = tick;
      }
      if (observation.sounds.length) { const loudest = [...observation.sounds].sort((a, b) => b.loudness - a.loudness)[0]; pendingDirections[h.id] = { ...loudest.relativePosition }; }
      if (result.action.kind === "vocalize") vocalizations++;
      actions[h.id] = result.action; traces[h.id] = result.trace;
      return result.human;
    });
    const advanced = advanceWorld(state.world, actions, tick);
    state = { ...state, tick: tick + 1, humans: humans.map(h => h.body.health <= 0 ? h : model.apply(h, advanced.effects[h.id])), world: advanced.world, traces, events: advanced.events };
    for (const animal of state.world.animals) {
      const direction = pendingDirections[animal.id];
      if (direction) {
        const prior = before.get(animal.id)!;
        const dx = animal.position.x - prior.x, dy = animal.position.y - prior.y;
        if (Math.hypot(dx, dy) > 1e-9) { towardChecks++; if (dx * direction.x + dy * direction.y > 0) towardHits++; }
      }
    }
    for (const e of advanced.events) if (e.kind === "food") {
      foodIntake += e.value;
      if (!(e.actorId in firstFoodTick)) { firstFoodTick[e.actorId] = tick + 1; heardBeforeFood[e.actorId] = e.actorId in lastHeard && tick + 1 - lastHeard[e.actorId] <= protocol.hearWindow; }
    }
    for (const h of state.humans) { hungers.push(h.body.hunger); minimumHealth = Math.min(minimumHealth, h.body.health); }
    if (advanced.events.some(e => e.kind === "contact")) contactTicks++;
    const [a, b] = state.world.animals;
    if (Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) < 4) closeTicks++;
  }
  for (const id of ids) if (!(id in firstFoodTick)) firstFoodTick[id] = protocol.horizon;
  const fed = ids.filter(id => firstFoodTick[id] < protocol.horizon);
  return {
    condition, model: model.id, seed,
    meanHunger: mean(hungers), foodIntake, firstFoodTick, meanFirstFoodTick: mean(ids.map(id => firstFoodTick[id])),
    heardEvents, unseenHeardEvents, towardSourceFraction: towardChecks ? towardHits / towardChecks : 0,
    foodAfterHearingFraction: fed.length ? fed.filter(id => heardBeforeFood[id]).length / fed.length : 0,
    contactTicks: contactTicks / protocol.horizon, closeFraction: closeTicks / protocol.horizon, vocalizations, minimumHealth,
  };
}
export type SeedResult = { seed: number; model: string } & Record<Condition, RunResult>;
export function runSeed(modelId: string, seed: number, protocol: ReferentialProtocol = protocolV1): SeedResult {
  return { seed, model: modelId, sound: runCondition(modelId, seed, "sound", protocol), muted: runCondition(modelId, seed, "muted", protocol), misdirected: runCondition(modelId, seed, "misdirected", protocol), scrambled: runCondition(modelId, seed, "scrambled", protocol) };
}
/** All values oriented so that higher supports the hypothesis that heard sounds guide foraging by their direction. */
export const MEASURES = ["forage-benefit", "direction-dependence", "shape-dependence", "latency-benefit", "latency-direction", "latency-shape", "contact-side-effect"] as const;
export function checkValue(id: string, r: SeedResult, protocol: ReferentialProtocol = protocolV1): number {
  const h = protocol.horizon;
  switch (id) {
    case "forage-benefit": return r.muted.meanHunger - r.sound.meanHunger;
    case "direction-dependence": return r.misdirected.meanHunger - r.sound.meanHunger;
    case "shape-dependence": return r.scrambled.meanHunger - r.sound.meanHunger;
    case "latency-benefit": return (r.muted.meanFirstFoodTick - r.sound.meanFirstFoodTick) / h;
    case "latency-direction": return (r.misdirected.meanFirstFoodTick - r.sound.meanFirstFoodTick) / h;
    case "latency-shape": return (r.scrambled.meanFirstFoodTick - r.sound.meanFirstFoodTick) / h;
    case "contact-side-effect": return r.muted.contactTicks - r.sound.contactTicks;
    default: throw new Error("Unknown check " + id);
  }
}
export type Check = { id: string; label?: string; minimum: number | null; values: number[]; summary: Summary; status: "pass" | "fail" | "reported" };
export function assessSeeds(name: string, results: SeedResult[], protocol: ReferentialProtocol = protocolV1) {
  const registered = new Map((protocol.checks as { id: string; label: string; minimum: number }[]).map(c => [c.id, c]));
  const checks: Check[] = MEASURES.map(id => {
    const values = results.map(r => checkValue(id, r, protocol));
    const summary = summarizeSamples(values, protocol.id + "/" + name + "/" + id);
    const c = registered.get(id);
    return { id, label: c?.label, minimum: c?.minimum ?? null, values, summary, status: c ? (summary.mean >= c.minimum ? "pass" : "fail") : "reported" };
  });
  const gated = checks.filter(c => c.minimum !== null);
  return { checks, established: gated.length > 0 && gated.every(c => c.status === "pass") };
}
/** Seed rounds keep thresholds fixed while later candidates are judged on seeds nobody has observed. */
export function seedsFor(name: "development" | "validation" | "pilot", protocol: ReferentialProtocol = protocolV1, round = "1"): number[] {
  if (name === "pilot") return protocol.pilotSeeds;
  const rounds = (protocol as unknown as { rounds?: Record<string, { developmentSeeds: number[]; validationSeeds: number[] }> }).rounds;
  const r = rounds?.[round];
  if (!r) throw new Error("Unknown seed round " + round + " for " + protocol.id);
  return name === "development" ? r.developmentSeeds : r.validationSeeds;
}
export function runReferentialPartition(name: "development" | "validation" | "pilot", modelId: string, protocol: ReferentialProtocol = protocolV1, round = "1") {
  resolveModel(modelId);
  const seeds = seedsFor(name, protocol, round);
  const results = seeds.map(seed => runSeed(modelId, seed, protocol));
  return { name, protocol: protocol.id, round, seeds, model: modelId, results, ...assessSeeds(name + "/" + round + "/" + modelId, results, protocol) };
}
