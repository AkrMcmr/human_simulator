import protocolV1 from "../protocols/referential-v1.json" with { type: "json" };
import type { ActionIntent, DecisionTrace } from "../../packages/contracts/src/index.ts";
import type { HumanState } from "../../packages/human/src/index.ts";
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
  /** v3/v4: per food patch, each non-finder's first eating tick minus the finder's, capped (never arriving counts as the cap), as a fraction of the cap, averaged over the non-finders; then averaged over patches found early enough for a full window. 1 when no patch qualifies. */
  arrivalDelay: number; patchesFound: number; patchesShared: number; spawns: number;
  /** Vocalizations made by an individual that took in food on the previous tick (caller-cost-v1). */
  foodCalls: number;
  /** convention-v1: per individual, the mean shape of its food calls in the last third of the run. */
  foodVoices: Record<string, { openness: number; resonance: number; count: number }>;
  /** Mean pairwise distance between individuals' food-voice centroids (those with at least 5 calls); 1 when fewer than two qualify. */
  foodVoiceSpread: number;
  /** Mean of the qualifying centroids, or null. */
  foodVoiceCentroid: { openness: number; resonance: number } | null;
  /** Mean hunger over the last third of the run (convention-v2 measures function after the convention has formed). */
  lateMeanHunger: number;
  /** Mean cold over the last third of the run (lexicon-v1). */
  lateMeanCold: number;
  /** lexicon-v1: late calls made while sheltered (lastWarm), pooled over individuals: dispersion around their centroid and the centroid itself. */
  warmthVoiceDispersion: number; warmthVoiceCentroid: { openness: number; resonance: number } | null; warmthCalls: number;
  /** lexicon-v1: late calls made in neither context (not eating, not sheltered), pooled. A second voice used for everything outside food would coincide with the warmth voice; a warmth-specific voice would not. */
  otherVoiceCentroid: { openness: number; resonance: number } | null; otherCalls: number;
  /** transmission-v1: with a newcomer replaced mid-run, the distance between its late food voice and the incumbents' pooled late food voice (1 when either is missing), and its own late hunger. */
  newcomerDistance: number; newcomerLateHunger: number;
  /** Mean distance of every food call in the last third (all individuals pooled) to the pooled centroid; low when the group's food calls concentrate on one voice. 1 when fewer than 5 calls. */
  foodVoiceDispersion: number;
};
const arrivalCapOf = (protocol: ReferentialProtocol) => (protocol as unknown as { arrivalCap?: number }).arrivalCap ?? 300;
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
  const lateHungers: number[] = [];
  const firstFoodTick: Record<string, number> = {};
  let foodIntake = 0, heardEvents = 0, unseenHeardEvents = 0, towardChecks = 0, towardHits = 0, contactTicks = 0, closeTicks = 0, vocalizations = 0, minimumHealth = 1, foodCalls = 0;
  const lastHeard: Record<string, number> = {};
  const patchArrivals: Record<string, Record<string, number>> = {};
  let spawns = 0;
  const foodVoiceSums: Record<string, { openness: number; resonance: number; count: number }> = {};
  const lateFoodCalls: { openness: number; resonance: number }[] = [];
  const lateWarmthCalls: { openness: number; resonance: number }[] = [];
  const lateOtherCalls: { openness: number; resonance: number }[] = [];
  let otherCalls = 0;
  const lateColds: number[] = [];
  let warmthCalls = 0;
  const heardBeforeFood: Record<string, boolean> = {};
  const pendingDirections: Record<string, { x: number; y: number } | null> = {};
  const newcomer = (protocol as unknown as { newcomer?: { id: string; tick: number } }).newcomer;
  const config = referentialConfig(seed, modelId, condition !== "muted", protocol);
  const newcomerLate: number[] = [];
  const incomerCalls: { openness: number; resonance: number }[] = [];
  for (let tick = 0; tick < protocol.horizon; tick++) {
    if (newcomer && tick === newcomer.tick) {
      // Cultural transmission probe: one individual is replaced by a naive one at the same place. Observer-side intervention, no human learns of it.
      const initial = config.agents.find(a => a.id === newcomer.id)!;
      state = { ...state, humans: state.humans.map(h => h.id === newcomer.id ? model.create(newcomer.id, initial.parameters, initial.body) : h) };
    }
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
      if (result.action.kind === "vocalize") {
        vocalizations++;
        if ((h as HumanState & { lastWarm?: boolean }).lastWarm && ((h as HumanState & { lastIntake?: number }).lastIntake ?? 0) <= 0) {
          warmthCalls++;
          if (tick >= protocol.horizon * 2 / 3 && result.action.sound) lateWarmthCalls.push({ ...result.action.sound });
        } else if (!(h as HumanState & { lastWarm?: boolean }).lastWarm && ((h as HumanState & { lastIntake?: number }).lastIntake ?? 0) <= 0) {
          otherCalls++;
          if (tick >= protocol.horizon * 2 / 3 && result.action.sound) lateOtherCalls.push({ ...result.action.sound });
        }
        if (((h as HumanState & { lastIntake?: number }).lastIntake ?? 0) > 0) {
          foodCalls++;
          if (tick >= protocol.horizon * 2 / 3 && result.action.sound) { const v = foodVoiceSums[h.id] ??= { openness: 0, resonance: 0, count: 0 }; v.openness += result.action.sound.openness; v.resonance += result.action.sound.resonance; v.count++; if (newcomer && h.id === newcomer.id) incomerCalls.push({ ...result.action.sound }); else lateFoodCalls.push({ ...result.action.sound }); }
        }
      }
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
    for (const e of advanced.events) {
      if (e.kind === "spawn") spawns++;
      if (e.kind !== "food") continue;
      foodIntake += e.value;
      if (!(e.actorId in firstFoodTick)) { firstFoodTick[e.actorId] = tick + 1; heardBeforeFood[e.actorId] = e.actorId in lastHeard && tick + 1 - lastHeard[e.actorId] <= protocol.hearWindow; }
      const eater = advanced.world.animals.find(a => a.id === e.actorId)!;
      const patch = advanced.world.resources.find(r => r.kind === "food" && Math.hypot(r.position.x - eater.position.x, r.position.y - eater.position.y) <= r.radius);
      if (patch) { patchArrivals[patch.id] ??= {}; patchArrivals[patch.id][e.actorId] ??= tick + 1; }
    }
    for (const h of state.humans) { hungers.push(h.body.hunger); if (tick >= protocol.horizon * 2 / 3) { lateHungers.push(h.body.hunger); lateColds.push(h.body.cold); if (newcomer && h.id === newcomer.id) newcomerLate.push(h.body.hunger); } minimumHealth = Math.min(minimumHealth, h.body.health); }
    if (advanced.events.some(e => e.kind === "contact")) contactTicks++;
    const animals = state.world.animals;
    if (animals.some((a, i) => animals.slice(i + 1).some(b => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) < 4))) closeTicks++;
  }
  for (const id of ids) if (!(id in firstFoodTick)) firstFoodTick[id] = protocol.horizon;
  const fed = ids.filter(id => firstFoodTick[id] < protocol.horizon);
  const cap = arrivalCapOf(protocol);
  const delays: number[] = [];
  let patchesShared = 0;
  for (const arrivals of Object.values(patchArrivals)) {
    const ticks = Object.values(arrivals).sort((a, b) => a - b);
    if (ticks.length > 1) patchesShared++;
    if (ticks[0] > protocol.horizon - cap) continue;
    // Every individual other than the finder: its own arrival delay, or the cap when it never ate there.
    const others = ids.length - 1;
    const total = ticks.slice(1).reduce((sum, t) => sum + Math.min(cap, t - ticks[0]), 0) + (others - (ticks.length - 1)) * cap;
    delays.push(total / others / cap);
  }
  const foodVoices = Object.fromEntries(Object.entries(foodVoiceSums).map(([id, v]) => [id, { openness: v.openness / v.count, resonance: v.resonance / v.count, count: v.count }]));
  const qualifying = Object.values(foodVoices).filter(v => v.count >= 5);
  const pairs: number[] = [];
  for (let i = 0; i < qualifying.length; i++) for (let j = i + 1; j < qualifying.length; j++) pairs.push(Math.hypot(qualifying[i].openness - qualifying[j].openness, qualifying[i].resonance - qualifying[j].resonance));
  const foodVoiceCentroid = qualifying.length ? { openness: mean(qualifying.map(v => v.openness)), resonance: mean(qualifying.map(v => v.resonance)) } : null;
  const pool = (calls: { openness: number; resonance: number }[]) => {
    const centroid = calls.length >= 5 ? { openness: mean(calls.map(c => c.openness)), resonance: mean(calls.map(c => c.resonance)) } : null;
    return { centroid, dispersion: centroid ? mean(calls.map(c => Math.hypot(c.openness - centroid.openness, c.resonance - centroid.resonance))) : 1 };
  };
  const foodPool = pool(lateFoodCalls), warmthPool = pool(lateWarmthCalls), otherPool = pool(lateOtherCalls), incomerPool = pool(incomerCalls);
  // Without a newcomer, lateFoodCalls holds everyone; with one, it holds the incumbents and incomerCalls the newcomer.
  const newcomerDistance = newcomer && incomerPool.centroid && foodPool.centroid ? Math.hypot(incomerPool.centroid.openness - foodPool.centroid.openness, incomerPool.centroid.resonance - foodPool.centroid.resonance) : 1;
  const foodVoiceDispersion = foodPool.dispersion;
  return {
    condition, model: model.id, seed,
    foodVoices, foodVoiceSpread: pairs.length ? mean(pairs) : 1, foodVoiceCentroid, foodVoiceDispersion,
    lateMeanCold: lateColds.length ? mean(lateColds) : 0, warmthVoiceDispersion: warmthPool.dispersion, warmthVoiceCentroid: warmthPool.centroid, warmthCalls,
    otherVoiceCentroid: otherPool.centroid, otherCalls,
    newcomerDistance, newcomerLateHunger: newcomerLate.length ? mean(newcomerLate) : 0,
    meanHunger: mean(hungers), lateMeanHunger: lateHungers.length ? mean(lateHungers) : mean(hungers), foodIntake, firstFoodTick, meanFirstFoodTick: mean(ids.map(id => firstFoodTick[id])),
    heardEvents, unseenHeardEvents, towardSourceFraction: towardChecks ? towardHits / towardChecks : 0,
    foodAfterHearingFraction: fed.length ? fed.filter(id => heardBeforeFood[id]).length / fed.length : 0,
    contactTicks: contactTicks / protocol.horizon, closeFraction: closeTicks / protocol.horizon, vocalizations, minimumHealth,
    arrivalDelay: delays.length ? mean(delays) : 1, patchesFound: Object.keys(patchArrivals).length, patchesShared, spawns, foodCalls,
  };
}
export type SeedResult = { seed: number; model: string } & Record<Condition, RunResult>;
export function runSeed(modelId: string, seed: number, protocol: ReferentialProtocol = protocolV1): SeedResult {
  return { seed, model: modelId, sound: runCondition(modelId, seed, "sound", protocol), muted: runCondition(modelId, seed, "muted", protocol), misdirected: runCondition(modelId, seed, "misdirected", protocol), scrambled: runCondition(modelId, seed, "scrambled", protocol) };
}
/** All values oriented so that higher supports the hypothesis that heard sounds guide foraging. Protocol checks pick which measures gate; the rest are reported. */
export const MEASURES = ["forage-benefit", "direction-dependence", "shape-dependence", "latency-benefit", "latency-direction", "latency-shape", "arrival-benefit", "arrival-direction", "arrival-shape", "call-suppression", "convergence-gain", "arbitrariness", "convergence-warmth", "arbitrariness-warmth", "distinctness", "warmth-specificity", "cold-benefit", "cold-shape-dependence", "adoption-gain", "newcomer-benefit", "newcomer-shape", "contact-side-effect"] as const;
export function checkValue(id: string, r: SeedResult, protocol: ReferentialProtocol = protocolV1): number {
  const h = protocol.horizon;
  // A protocol may evaluate hunger over the final third only (hungerWindow "late"), after a learned convention has had time to form.
  const hunger = (x: RunResult) => (protocol as unknown as { hungerWindow?: string }).hungerWindow === "late" ? x.lateMeanHunger : x.meanHunger;
  switch (id) {
    case "forage-benefit": return hunger(r.muted) - hunger(r.sound);
    case "direction-dependence": return hunger(r.misdirected) - hunger(r.sound);
    case "shape-dependence": return hunger(r.scrambled) - hunger(r.sound);
    case "latency-benefit": return (r.muted.meanFirstFoodTick - r.sound.meanFirstFoodTick) / h;
    case "latency-direction": return (r.misdirected.meanFirstFoodTick - r.sound.meanFirstFoodTick) / h;
    case "latency-shape": return (r.scrambled.meanFirstFoodTick - r.sound.meanFirstFoodTick) / h;
    case "arrival-benefit": return r.muted.arrivalDelay - r.sound.arrivalDelay;
    case "arrival-direction": return r.misdirected.arrivalDelay - r.sound.arrivalDelay;
    case "arrival-shape": return r.scrambled.arrivalDelay - r.sound.arrivalDelay;
    // Fraction of food calls given up when others can hear them (muted callers pay no sharing cost).
    case "call-suppression": return (r.muted.foodCalls - r.sound.foodCalls) / Math.max(1, r.muted.foodCalls);
    // The group's food calls concentrate on one voice when individuals can hear each other (imitation) but not when muted.
    case "convergence-gain": return r.muted.foodVoiceDispersion - r.sound.foodVoiceDispersion;
    // Per seed: distance of this run's food-voice centroid from the across-seed mean centroid. Needs the whole seed set, so assessSeeds computes it; alone it is 0.
    case "arbitrariness": return 0;
    // lexicon-v1: the same two convention measures for calls made while sheltered, the distance between the two shared voices, and cold-based function.
    // Uninformative (fewer than 5 late sheltered calls in either condition) counts as no convergence.
    case "convergence-warmth": return r.muted.warmthVoiceCentroid && r.sound.warmthVoiceCentroid ? r.muted.warmthVoiceDispersion - r.sound.warmthVoiceDispersion : 0;
    // Distance between the warmth voice and the voice used in neither context; 0 when either is missing.
    case "warmth-specificity": return r.sound.warmthVoiceCentroid && r.sound.otherVoiceCentroid ? Math.hypot(r.sound.warmthVoiceCentroid.openness - r.sound.otherVoiceCentroid.openness, r.sound.warmthVoiceCentroid.resonance - r.sound.otherVoiceCentroid.resonance) : 0;
    case "arbitrariness-warmth": return 0;
    case "distinctness": return r.sound.foodVoiceCentroid && r.sound.warmthVoiceCentroid ? Math.hypot(r.sound.foodVoiceCentroid.openness - r.sound.warmthVoiceCentroid.openness, r.sound.foodVoiceCentroid.resonance - r.sound.warmthVoiceCentroid.resonance) : 0;
    case "cold-benefit": return r.muted.lateMeanCold - r.sound.lateMeanCold;
    case "cold-shape-dependence": return r.scrambled.lateMeanCold - r.sound.lateMeanCold;
    // transmission-v1: the newcomer's food voice lands nearer the incumbents' when it can hear them; and it fares no worse, and worse under scrambled shapes.
    case "adoption-gain": return r.muted.newcomerDistance - r.sound.newcomerDistance;
    case "newcomer-benefit": return r.muted.newcomerLateHunger - r.sound.newcomerLateHunger;
    case "newcomer-shape": return r.scrambled.newcomerLateHunger - r.sound.newcomerLateHunger;
    case "contact-side-effect": return r.muted.contactTicks - r.sound.contactTicks;
    default: throw new Error("Unknown check " + id);
  }
}
export type Check = { id: string; label?: string; minimum: number | null; values: number[]; summary: Summary; status: "pass" | "fail" | "reported" };
export function assessSeeds(name: string, results: SeedResult[], protocol: ReferentialProtocol = protocolV1) {
  const registered = new Map((protocol.checks as { id: string; label: string; minimum: number }[]).map(c => [c.id, c]));
  const spreadAcrossSeeds = (pick: (r: SeedResult) => { openness: number; resonance: number } | null) => {
    const centroids = results.map(pick).filter((c): c is { openness: number; resonance: number } => c !== null);
    const grand = centroids.length ? { openness: mean(centroids.map(c => c.openness)), resonance: mean(centroids.map(c => c.resonance)) } : null;
    return results.map(r => { const c = pick(r); return c && grand ? Math.hypot(c.openness - grand.openness, c.resonance - grand.resonance) : 0; });
  };
  const checks: Check[] = MEASURES.map(id => {
    const values = id === "arbitrariness" ? spreadAcrossSeeds(r => r.sound.foodVoiceCentroid)
      : id === "arbitrariness-warmth" ? spreadAcrossSeeds(r => r.sound.warmthVoiceCentroid)
      : results.map(r => checkValue(id, r, protocol));
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
