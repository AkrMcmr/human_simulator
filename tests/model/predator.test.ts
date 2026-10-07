import test from "node:test";
import assert from "node:assert/strict";
import { advanceWorld, createWorld, senseWorld, WORLD_VERSION } from "../../packages/world/src/index.ts";
import { keyedRandom } from "../../packages/simulation/src/random.ts";
import { protocol as predator } from "../../research/studies/predator-v1.ts";
import { protocol as valence7 } from "../../research/studies/valence-v7.ts";
import { protocol as valence11 } from "../../research/studies/valence-v11.ts";
import { seedsFor, runCondition, referentialConfig } from "../../research/studies/referential-v1.ts";
import { createSimulation, runExperiment } from "../../packages/simulation/src/index.ts";

const spec = { id: "P", waypoints: [{ x: 5, y: 5 }, { x: 15, y: 5 }], speed: 0.5, chaseRadius: 4, harm: 5 };

test("world 0.9.0: a predator patrols its waypoints by script, chases a human within reach at its chase speed, hurts it on contact, leaves a bitten individual alone for a while, and looks dissimilar", () => {
  assert.equal(WORLD_VERSION, "0.10.0");
  let w = createWorld([{ id: "A", position: { x: 30, y: 20 } }], { predators: [spec] }, []);
  const pred = () => w.animals.find(a => a.id === "P")!;
  assert.deepEqual(pred().position, { x: 5, y: 5 }); assert.equal(pred().kind, "predator");
  for (let t = 0; t < 10; t++) w = advanceWorld(w, { A: { kind: "rest" } }, t).world;
  assert.ok(Math.abs(pred().position.x - 10) < 1e-9 && pred().position.y === 5, "ten ticks at speed 0.5 along the first leg");
  for (let t = 10; t < 30; t++) w = advanceWorld(w, { A: { kind: "rest" } }, t).world;
  assert.ok(pred().position.x < 15, "after reaching the second waypoint it turns back toward the first");
  let chase = createWorld([{ id: "A", position: { x: 8, y: 5 } }], { predators: [spec] }, []);
  let harmed = 0, attackEvents = 0;
  for (let t = 0; t < 12; t++) { const step = advanceWorld(chase, { A: { kind: "rest" } }, t); chase = step.world; harmed += step.effects.A.collision; attackEvents += step.events.filter(e => e.kind === "attack" && e.actorId === "A").length; }
  assert.ok(attackEvents >= 1 && harmed >= 5, `the predator reached and hurt the resting human (${attackEvents} attack ticks, collision ${harmed.toFixed(1)})`);
  // With a cooldown the predator bites once and returns to its patrol for that many ticks.
  let calm = createWorld([{ id: "A", position: { x: 8, y: 5 } }], { predators: [{ ...spec, cooldown: 30 }] }, []);
  const bites: number[] = [];
  for (let t = 0; t < 60; t++) { const step = advanceWorld(calm, { A: { kind: "rest" } }, t); calm = step.world; if (step.events.some(e => e.kind === "attack")) bites.push(t); }
  assert.ok(bites.length >= 1 && bites.length <= 2, `one bite, then a pause of 30 ticks (${bites.join(",")})`);
  if (bites.length === 2) assert.ok(bites[1] - bites[0] > 30);
  // 0.9.0: chaseSpeed applies while chasing (declared in 0.8.0 but unused until 0.9.0: predator-v2 pilots 4-5 chased at the patrol speed).
  let fast = createWorld([{ id: "A", position: { x: 8, y: 5 } }], { predators: [{ ...spec, speed: 0.2, chaseSpeed: 1.2, chaseRadius: 3 }] }, []);
  const p0 = { ...fast.animals.find(a => a.id === "P")!.position };
  fast = advanceWorld(fast, { A: { kind: "rest" } }, 0).world;
  assert.ok(Math.abs(fast.animals.find(a => a.id === "P")!.position.x - p0.x - 1.2) < 1e-9, "a human within the chase radius is approached at chaseSpeed");
  let slow = createWorld([{ id: "A", position: { x: 20, y: 5 } }], { predators: [{ ...spec, speed: 0.2, chaseSpeed: 1.2, chaseRadius: 3 }] }, []);
  slow = advanceWorld(slow, { A: { kind: "rest" } }, 0).world;
  assert.ok(Math.abs(slow.animals.find(a => a.id === "P")!.position.x - p0.x - 0.2) < 1e-9, "out of reach it patrols at speed");
  // 0.9.0: with victimMemory the predator leaves the individual it just bit alone and turns to the next nearest one.
  let pack = createWorld([{ id: "A", position: { x: 6.5, y: 5 } }, { id: "B", position: { x: 8.5, y: 5 } }], { predators: [{ ...spec, speed: 0.2, chaseSpeed: 1.2, chaseRadius: 3, cooldown: 2, victimMemory: 100 }] }, []);
  const victims: string[] = [];
  for (let t = 0; t < 40; t++) { const step = advanceWorld(pack, { A: { kind: "rest" }, B: { kind: "rest" } }, t); pack = step.world; for (const e of step.events) if (e.kind === "attack") victims.push(e.actorId); }
  assert.deepEqual(victims.slice(0, 2), ["A", "B"], `A first, then B, and A not again within the memory (${victims.join(",")})`);
  assert.equal(victims.filter(v => v === "A").length, 1);
  assert.throws(() => createSimulation({ ...referentialConfig(1, "human-0.2.0", true, predator), world: { ...predator.world, predators: [{ ...spec, victimMemory: 1.5 }] } } as Parameters<typeof createSimulation>[0]), /危険な動物/);
  // 0.10.0: a sound attached to a non-vocalize action is emitted (a cry while fleeing); without a sound nothing is emitted.
  const crying = advanceWorld(createWorld([{ id: "A", position: { x: 20, y: 10 } }], { soundEnabled: true }, []), { A: { kind: "withdraw", target: { x: 25, y: 10 }, sound: { openness: 0.1, resonance: 0.1 } } }, 0);
  assert.equal(crying.world.sounds.length, 1); assert.ok(Math.abs(crying.world.animals[0].position.x - 20.65) < 1e-9, "it moved at flight speed while crying");
  assert.equal(advanceWorld(createWorld([{ id: "A", position: { x: 20, y: 10 } }], { soundEnabled: true }, []), { A: { kind: "withdraw", target: { x: 25, y: 10 } } }, 0).world.sounds.length, 0);
  const seen = senseWorld(chase, "A", 12, keyedRandom(1, "s", 0));
  assert.deepEqual(seen.animals.map(a => [a.trackId, a.morphologySimilarity]), [["P", 0.2]], "the predator is seen as a dissimilar animal");
  // A stalking predator (visibility 2) is unseen at 4 units even though the world's vision radius is larger.
  const stalk = createWorld([{ id: "A", position: { x: 9, y: 5 } }], { visionRadius: 5, predators: [{ ...spec, visibility: 2 }] }, []);
  assert.equal(senseWorld(stalk, "A", 0, keyedRandom(1, "s", 0)).animals.length, 0, "4 units away: unseen");
  const close = createWorld([{ id: "A", position: { x: 6.5, y: 5 } }], { visionRadius: 5, predators: [{ ...spec, visibility: 2 }] }, []);
  assert.equal(senseWorld(close, "A", 0, keyedRandom(1, "s", 0)).animals.length, 1, "1.5 units away: seen");
  const plain = createWorld([{ id: "A", position: { x: 8, y: 5 } }], {}, []);
  assert.equal(plain.animals.length, 1, "no predators: the 0.7.0 world");
  assert.throws(() => createSimulation({ ...referentialConfig(1, "human-0.2.0", true, predator), world: { ...predator.world, predators: [{ ...spec, harm: -1 }] } } as Parameters<typeof createSimulation>[0]), /危険な動物/);
  assert.throws(() => createSimulation({ ...referentialConfig(1, "human-0.2.0", true, predator), world: { ...predator.world, predators: [{ ...spec, id: "A" }] } } as Parameters<typeof createSimulation>[0]), /重複/);
});
test("the evaluator counts attacks, late attacks, foreseeable attacks and threat calls; predator-v1 reuses the valence-v7 food world without poison on fresh seeds", () => {
  const w = predator.world as unknown as { predators?: unknown[]; foodSpawn: { toxicEvery?: number } };
  assert.equal(w.predators!.length, 1); assert.equal(w.foodSpawn.toxicEvery, undefined);
  assert.ok(predator.resources.every(r => !(r as { toxic?: boolean }).toxic));
  const used = [valence7, valence11].flatMap(q => [q.pilotSeeds, seedsFor("development", q, "1"), seedsFor("validation", q, "1")].flat());
  const p1 = [predator.pilotSeeds, seedsFor("development", predator, "1"), seedsFor("validation", predator, "1")].flat();
  assert.equal(new Set([...used, ...p1]).size, used.length + p1.length);
  const run = runCondition("human-0.2.0", predator.pilotSeeds[0], "muted", { ...predator, horizon: 600 } as typeof predator);
  const harm = (predator.world as unknown as { predators: { harm: number }[] }).predators[0].harm;
  assert.ok(run.attacks >= 0 && run.lateAttacks <= run.attacks && run.foreseeableAttacks <= run.attacks && Math.abs(run.attackHarm - run.attacks * harm) < 1e-6);
  const frames = runExperiment({ ...referentialConfig(predator.pilotSeeds[0], "human-0.2.0", true, predator), horizon: 50 }).frames;
  assert.ok(frames.every(f => f.world.animals.some(a => a.kind === "predator")), "the predator is part of every frame");
  assert.equal(frames.at(-1)!.agents.length, 4, "the predator is not an agent");
});
