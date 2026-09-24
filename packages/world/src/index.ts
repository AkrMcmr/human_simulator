import { clamp, distance } from "../../contracts/src/index.ts";
import type { ActionIntent, Observation, PhysicalEffect, RandomSource, SoundShape, Vec2 } from "../../contracts/src/index.ts";
export const WORLD_VERSION = "0.8.0";
export type WorldParameters = {
  width: number; height: number; visionRadius: number; hearingRadius: number;
  acousticNoise: number; ambientCold: number; soundEnabled: boolean;
  /** Food regrowth per tick (0.3.0; omitted means the 0.2.0 constant 0.003). */
  foodRegeneration?: number;
  /** 0.3.0: when a food patch falls to `depletedBelow` it is marked spent (still visible, never regrows) and a fresh patch appears at the next position of this fixed sequence. Omitted: no spawning (0.2.0 behavior). */
  foodSpawn?: { amount: number; radius: number; depletedBelow: number; positions: Vec2[]; /** 0.5.0: every n-th spawned patch is toxic (1-based count; omitted: none). */ toxicEvery?: number; /** 0.6.0: a patch alive this many ticks without being depleted rots (spent, nothing left) and the next patch appears, so an avoided patch does not hold a slot forever. Omitted: patches last until eaten (0.5.0 behavior). */ lifetime?: number };
  /** 0.8.0: scripted dangerous animals. Each patrols its waypoints in order (no randomness); when a human is within chaseRadius it moves toward the nearest one instead. A human within contact distance takes `harm` as collision each tick and an "attack" event is recorded. Humans see it as an animal of low morphological similarity. Omitted: no predators (the 0.7.0 behavior). */
  predators?: { id: string; waypoints: Vec2[]; speed: number; chaseRadius: number; harm: number }[];
  /** 0.7.0: poison from toxic food reaches the eater this many ticks after the bite (0 or omitted: the same tick, the 0.5.0 behavior). While it is latent the eater neither feels it nor knows the food was toxic. */
  poisonDelay?: number;
  /** 0.4.0: every `lifetime` ticks the warm place goes out (stays visible, spent, gives no warmth) and a fresh one appears at the next fixed position. Omitted: warm places are permanent (0.3.0 behavior). */
  warmthCycle?: { lifetime: number; radius: number; positions: Vec2[]; /** Warm places alive after each cycle (default 1). */ count?: number };
};
export type PhysicalAnimal = { id: string; position: Vec2; velocity: Vec2; /** 0.8.0: scripted dangerous animal; omitted means a human. */ kind?: "predator" };
export type Resource = { id: string; kind: "food" | "warmth"; position: Vec2; amount: number; radius: number; spent?: boolean; /** 0.5.0: eating here poisons (looks like any other food). */ toxic?: boolean; /** 0.6.0: tick the patch appeared (initial patches: 0). */ since?: number };
export type SoundEmission = { sourceId: string; position: Vec2; shape: SoundShape; tick: number };
export type WorldEvent = { tick: number; kind: "sound" | "contact" | "food" | "spawn" | "attack"; actorId: string; value: number };
export type WorldState = {
  parameters: WorldParameters; animals: PhysicalAnimal[]; resources: Resource[]; sounds: SoundEmission[];
  /** Number of food patches spawned so far (0.3.0, only with foodSpawn). */
  spawned?: number;
  /** Number of warm places cycled so far (0.4.0, only with warmthCycle). */
  warmed?: number;
  /** 0.7.0: poison eaten but not yet felt (only with poisonDelay). */
  pendingPoison?: { id: string; due: number; amount: number }[];
  /** 0.8.0: next waypoint index per predator. */
  predatorProgress?: Record<string, number>;
};
export const DEFAULT_WORLD: WorldParameters = {
  width: 40, height: 28, visionRadius: 16, hearingRadius: 20,
  acousticNoise: 0.06, ambientCold: 0.36, soundEnabled: true,
};
export function createWorld(animals: { id: string; position: Vec2 }[], parameters: Partial<WorldParameters> = {}, resources?: Resource[]): WorldState {
  const p = { ...DEFAULT_WORLD, ...parameters };
  return {
    parameters: p,
    animals: [...animals.map((a) => ({ ...structuredClone(a), velocity: { x: 0, y: 0 } })), ...(p.predators ?? []).map((s) => ({ id: s.id, position: { ...s.waypoints[0] }, velocity: { x: 0, y: 0 }, kind: "predator" as const }))].sort((a, b) => a.id.localeCompare(b.id)),
    resources: resources ? structuredClone(resources) : [
      { id: "food-nw", kind: "food", position: { x: 7, y: 7 }, amount: 1, radius: 1.6 },
      { id: "food-se", kind: "food", position: { x: 33, y: 21 }, amount: 1, radius: 1.6 },
      { id: "warm-n", kind: "warmth", position: { x: 22, y: 5 }, amount: 1, radius: 3 },
      { id: "warm-s", kind: "warmth", position: { x: 16, y: 24 }, amount: 1, radius: 3 },
    ],
    sounds: [],
  };
}
/** Sensor boundary: only physical, locally observable cues leave the world. */
export function senseWorld(world: WorldState, id: string, tick: number, random: RandomSource): Observation {
  const self = world.animals.find((a) => a.id === id);
  if (!self) throw new Error("Unknown physical animal: " + id);
  const visible = world.animals.filter((a) => a.id !== id && distance(a.position, self.position) <= world.parameters.visionRadius).sort((a, b) => a.id.localeCompare(b.id));
  const observation: Observation = {
    tick, selfPosition: { ...self.position },
    animals: visible.map((a) => ({
      trackId: a.id,
      relativePosition: { x: a.position.x - self.position.x, y: a.position.y - self.position.y },
      relativeVelocity: { x: a.velocity.x - self.velocity.x, y: a.velocity.y - self.velocity.y },
      morphologySimilarity: a.kind === "predator" ? 0.2 : 0.98,
    })),
    resources: world.resources.filter((r) => distance(r.position, self.position) <= world.parameters.visionRadius)
      .map((r) => ({ id: r.id, kind: r.kind, relativePosition: { x: r.position.x - self.position.x, y: r.position.y - self.position.y }, strength: r.amount })),
    sounds: [],
  };
  if (world.parameters.soundEnabled) {
    observation.sounds = world.sounds.filter((s) => s.sourceId !== id && distance(s.position, self.position) < world.parameters.hearingRadius)
      .map((s) => ({
        visibleSourceId: visible.some((a) => a.id === s.sourceId) ? s.sourceId : null,
        loudness: 1 - distance(s.position, self.position) / world.parameters.hearingRadius,
        relativePosition: { x: s.position.x - self.position.x, y: s.position.y - self.position.y },
        shape: {
          openness: clamp(s.shape.openness + (random("sound-" + s.sourceId, 0) - 0.5) * world.parameters.acousticNoise),
          resonance: clamp(s.shape.resonance + (random("sound-" + s.sourceId, 1) - 0.5) * world.parameters.acousticNoise),
        },
      }));
  }
  return observation;
}
export function advanceWorld(previous: WorldState, actions: Record<string, ActionIntent>, tick: number): {
  world: WorldState; effects: Record<string, PhysicalEffect>; events: WorldEvent[];
} {
  const world = structuredClone(previous);
  const p = world.parameters;
  const effects: Record<string, PhysicalEffect> = {};
  const events: WorldEvent[] = [];
  const before = new Map(previous.animals.map((a) => [a.id, a]));
  world.animals.sort((a, b) => a.id.localeCompare(b.id));
  world.sounds = [];
  // 0.8.0: predators move first, by script — toward the nearest human within reach, otherwise along their waypoints.
  for (const pred of world.animals) {
    if (pred.kind !== "predator") continue;
    const spec = p.predators?.find((s) => s.id === pred.id);
    if (!spec) continue;
    const humans = world.animals.filter((a) => a.kind !== "predator");
    const nearest = humans.map((h) => ({ h, d: distance(h.position, pred.position) })).sort((a, b) => a.d - b.d || a.h.id.localeCompare(b.h.id))[0];
    let target: Vec2;
    if (nearest && nearest.d <= spec.chaseRadius) target = nearest.h.position;
    else {
      const progress = world.predatorProgress ??= {};
      let i = progress[pred.id] ?? 0;
      if (distance(pred.position, spec.waypoints[i % spec.waypoints.length]) < 0.6) i = (i + 1) % spec.waypoints.length;
      progress[pred.id] = i;
      target = spec.waypoints[i % spec.waypoints.length];
    }
    const dx = target.x - pred.position.x, dy = target.y - pred.position.y, length = Math.hypot(dx, dy);
    if (length > 1e-9) {
      const speed = Math.min(length, spec.speed);
      pred.position.x = clamp(pred.position.x + dx / length * speed, 0.6, p.width - 0.6);
      pred.position.y = clamp(pred.position.y + dy / length * speed, 0.6, p.height - 0.6);
    }
  }
  for (const animal of world.animals) {
    if (animal.kind === "predator") continue;
    const action = actions[animal.id] ?? { kind: "observe" };
    effects[animal.id] = { ambientCold: p.ambientCold, foodIntake: 0, exertion: 0, resting: action.kind === "rest", collision: 0 };
    if (action.target) {
      if (!Number.isFinite(action.target.x) || !Number.isFinite(action.target.y)) throw new Error("Non-finite motor target");
      const dx = action.target.x - animal.position.x;
      const dy = action.target.y - animal.position.y;
      const length = Math.hypot(dx, dy);
      const speed = Math.min(length, action.kind === "withdraw" ? 0.65 : 0.45);
      if (length > 0) {
        animal.position.x = clamp(animal.position.x + dx / length * speed, 0.6, p.width - 0.6);
        animal.position.y = clamp(animal.position.y + dy / length * speed, 0.6, p.height - 0.6);
        effects[animal.id].exertion = speed;
      }
    }
  }
  // Symmetric contact corrections calculated before any correction is applied.
  const corrections = new Map(world.animals.map((a) => [a.id, { x: 0, y: 0 }]));
  for (let i = 0; i < world.animals.length; i++) for (let j = i + 1; j < world.animals.length; j++) {
    const a = world.animals[i], b = world.animals[j];
    const d = distance(a.position, b.position);
    if (d < 1.1) {
      const unit = d > 0 ? { x: (a.position.x - b.position.x) / d, y: (a.position.y - b.position.y) / d } : { x: 1, y: 0 };
      const force = (1.1 - d) / 2;
      corrections.get(a.id)!.x += unit.x * force; corrections.get(a.id)!.y += unit.y * force;
      corrections.get(b.id)!.x -= unit.x * force; corrections.get(b.id)!.y -= unit.y * force;
      if (effects[a.id]) effects[a.id].collision += force; if (effects[b.id]) effects[b.id].collision += force;
      if (a.kind !== "predator" && b.kind !== "predator") events.push({ tick: tick + 1, kind: "contact", actorId: a.id, value: force }, { tick: tick + 1, kind: "contact", actorId: b.id, value: force });
      // 0.8.0: a predator in contact with a human hurts it.
      for (const [pred, human] of [[a, b], [b, a]] as const) if (pred.kind === "predator" && human.kind !== "predator") {
        const harm = p.predators?.find((s) => s.id === pred.id)?.harm ?? 0;
        if (harm > 0) { effects[human.id].collision += harm; events.push({ tick: tick + 1, kind: "attack", actorId: human.id, value: harm }); }
      }
    }
  }
  for (const animal of world.animals) {
    const c = corrections.get(animal.id)!;
    animal.position.x = clamp(animal.position.x + c.x, 0.6, p.width - 0.6);
    animal.position.y = clamp(animal.position.y + c.y, 0.6, p.height - 0.6);
    const old = before.get(animal.id)!;
    animal.velocity = { x: animal.position.x - old.position.x, y: animal.position.y - old.position.y };
    if (animal.kind === "predator") continue;
    const action = actions[animal.id];
    if (action?.kind === "vocalize" && action.sound) {
      effects[animal.id].exertion += 0.15;
      if (p.soundEnabled) world.sounds.push({ sourceId: animal.id, position: { ...animal.position }, shape: { ...action.sound }, tick: tick + 1 });
      events.push({ tick: tick + 1, kind: "sound", actorId: animal.id, value: p.soundEnabled ? 1 : 0 });
    }
    for (const shelter of world.resources.filter((r) => r.kind === "warmth" && !r.spent)) {
      if (distance(animal.position, shelter.position) <= shelter.radius) effects[animal.id].ambientCold = 0.02;
    }
  }
  for (const resource of world.resources.filter((r) => r.kind === "food")) {
    const eaters = world.animals.filter((a) => actions[a.id]?.kind === "forage" && distance(a.position, resource.position) <= resource.radius);
    const total = Math.min(resource.amount, eaters.length * 0.04);
    for (const eater of eaters) {
      const portion = total / eaters.length;
      effects[eater.id].foodIntake += portion;
      if (resource.toxic && portion > 0) {
        if (p.poisonDelay) (world.pendingPoison ??= []).push({ id: eater.id, due: tick + 1 + p.poisonDelay, amount: portion });
        else effects[eater.id].poison = (effects[eater.id].poison ?? 0) + portion;
      }
      if (portion > 0) events.push({ tick: tick + 1, kind: "food", actorId: eater.id, value: portion });
    }
    if (resource.spent) { resource.amount = 0; continue; }
    // Patches above 1 (0.3.0 protocols) only shrink; patches within [0, 1] keep the 0.2.0 bound.
    resource.amount = clamp(resource.amount - total + (p.foodRegeneration ?? 0.003), 0, Math.max(1, resource.amount));
    // 0.6.0: a patch that has stood `lifetime` ticks rots the same way a depleted one is spent.
    const rotten = p.foodSpawn?.lifetime !== undefined && tick + 1 - (resource.since ?? 0) >= p.foodSpawn.lifetime;
    if (p.foodSpawn && (resource.amount <= p.foodSpawn.depletedBelow || rotten)) {
      // Spent patches stay visible with nothing left, so a remembered place is corrected by seeing it empty.
      resource.spent = true; resource.amount = 0;
      const n = world.spawned ?? 0;
      const position = p.foodSpawn.positions[n % p.foodSpawn.positions.length];
      const toxic = p.foodSpawn.toxicEvery ? (n + 1) % p.foodSpawn.toxicEvery === 0 : false;
      world.resources.push({ id: "food-spawn-" + (n + 1), kind: "food", position: { ...position }, amount: p.foodSpawn.amount, radius: p.foodSpawn.radius, ...(toxic ? { toxic: true } : {}), ...(p.foodSpawn.lifetime !== undefined ? { since: tick + 1 } : {}) });
      world.spawned = n + 1;
      events.push({ tick: tick + 1, kind: "spawn", actorId: "food-spawn-" + (n + 1), value: p.foodSpawn.amount });
    }
  }
  if (p.warmthCycle && (tick + 1) % p.warmthCycle.lifetime === 0) {
    // The warm place goes out: it stays visible with nothing left so a remembered place is corrected by seeing it cold.
    for (const r of world.resources) if (r.kind === "warmth" && !r.spent) { r.spent = true; r.amount = 0; }
    for (let k = 0; k < (p.warmthCycle.count ?? 1); k++) {
      const n = world.warmed ?? 0;
      const position = p.warmthCycle.positions[n % p.warmthCycle.positions.length];
      world.resources.push({ id: "warm-cycle-" + (n + 1), kind: "warmth", position: { ...position }, amount: 1, radius: p.warmthCycle.radius });
      world.warmed = n + 1;
      events.push({ tick: tick + 1, kind: "spawn", actorId: "warm-cycle-" + (n + 1), value: 1 });
    }
  }
  // 0.7.0: latent poison comes due.
  if (world.pendingPoison?.length) {
    const due = world.pendingPoison.filter((q) => q.due <= tick + 1);
    world.pendingPoison = world.pendingPoison.filter((q) => q.due > tick + 1);
    for (const q of due) if (effects[q.id]) effects[q.id].poison = (effects[q.id].poison ?? 0) + q.amount;
  }
  return { world, effects, events };
}
