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

test("world 0.8.0: a predator patrols its waypoints by script, chases a human within reach, hurts it on contact, and looks dissimilar", () => {
  assert.equal(WORLD_VERSION, "0.8.0");
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
  const seen = senseWorld(chase, "A", 12, keyedRandom(1, "s", 0));
  assert.deepEqual(seen.animals.map(a => [a.trackId, a.morphologySimilarity]), [["P", 0.2]], "the predator is seen as a dissimilar animal");
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
  assert.ok(run.attacks >= 0 && run.lateAttacks <= run.attacks && run.foreseeableAttacks <= run.attacks && run.attackHarm >= run.attacks * 5 - 1e-9);
  const frames = runExperiment({ ...referentialConfig(predator.pilotSeeds[0], "human-0.2.0", true, predator), horizon: 50 }).frames;
  assert.ok(frames.every(f => f.world.animals.some(a => a.kind === "predator")), "the predator is part of every frame");
  assert.equal(frames.at(-1)!.agents.length, 4, "the predator is not an agent");
});
