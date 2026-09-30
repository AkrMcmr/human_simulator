import test from "node:test";
import assert from "node:assert/strict";
import { applyWorldEdit, createWorld } from "../../packages/world/src/index.ts";
import { runExperiment, createSimulation, stepSimulation } from "../../packages/simulation/src/index.ts";
import { createHuman, decideHuman } from "../../packages/human/src/index.ts";
import { keyedRandom } from "../../packages/simulation/src/random.ts";
import { STAGES, act, choiceProbabilities, currentQuestion, perceptionNow, recordGame, replayGame, stageById, startGame, type PlayerAction } from "../../packages/game/src/index.ts";

const provenance = { sourceCommit: "test", sourceHash: "test", dependencyLockHash: "test", runtime: process.version, dirty: false };
const finish = (stageId: string, seed: number, actions: PlayerAction[]) => {
  let s = startGame(stageId, seed);
  for (const a of actions) s = act(s, a);
  while (currentQuestion(s)) s = act(s, { kind: "predict", action: "forage", confidence: 2 });
  return s;
};

test("world edits are pure, validated, and visible to the next perception", () => {
  const w = createWorld([{ id: "A", position: { x: 5, y: 5 } }]);
  const before = structuredClone(w);
  const placed = applyWorldEdit(w, { kind: "placeResource", resource: { id: "x", kind: "food", position: { x: 7, y: 5 }, amount: 1, radius: 1.8 } });
  assert.deepEqual(w, before);
  assert.equal(placed.resources.at(-1)!.id, "x");
  assert.deepEqual(applyWorldEdit(placed, { kind: "moveResource", id: "x", position: { x: 9, y: 9 } }).resources.at(-1)!.position, { x: 9, y: 9 });
  assert.equal(applyWorldEdit(placed, { kind: "removeResource", id: "x" }).resources.some((r) => r.id === "x"), false);
  assert.equal(applyWorldEdit(w, { kind: "setAmbientCold", value: 0.8 }).parameters.ambientCold, 0.8);
  assert.equal(applyWorldEdit(placed, { kind: "setResourceAmount", id: "x", amount: 0.2 }).resources.at(-1)!.amount, 0.2);
  for (const bad of [
    { kind: "placeResource", resource: { id: "x", kind: "food", position: { x: 1, y: 1 }, amount: 1, radius: 1 } },
    { kind: "placeResource", resource: { id: "y", kind: "food", position: { x: 999, y: 1 }, amount: 1, radius: 1 } },
    { kind: "placeResource", resource: { id: "__proto__", kind: "food", position: { x: 1, y: 1 }, amount: 1, radius: 1 } },
    { kind: "moveResource", id: "missing", position: { x: 1, y: 1 } },
    { kind: "setResourceAmount", id: "x", amount: 2 },
    { kind: "setAmbientCold", value: Number.NaN },
  ] as const) assert.throws(() => applyWorldEdit(placed, bad as never));
});

test("adding the world edit API leaves normal runs unchanged (same frames as before edits exist)", () => {
  const config = { name: "t", seed: 7, horizon: 40, world: {}, agents: [{ id: "A", position: { x: 10, y: 10 }, parameters: {}, body: {} }, { id: "B", position: { x: 20, y: 10 }, parameters: {}, body: {} }] };
  const a = runExperiment(config), b = runExperiment(config);
  assert.deepEqual(a, b);
  // A game with no player edits matches the plain simulation step for step.
  const stage = stageById("two-tables");
  const plain = runExperiment(stage.build(stage.seeds[0]));
  const played = finish("two-tables", stage.seeds[0], []);
  assert.deepEqual(played.sim, plain.state);
  assert.deepEqual(played.frames, plain.frames);
});

test("a placed resource is perceived at the same tick and can change the decision", () => {
  const stage = stageById("morning");
  const s = startGame("morning", stage.seeds[0]);
  const edited = act(s, { kind: "edit", edit: { kind: "placeFood", position: { x: 8, y: 20 } } });
  assert.equal(edited.budgetLeft, stage.budget - 3);
  assert.ok(perceptionNow(edited, "A")!.resources.some((r) => r.id === "placed-1"));
  assert.ok(!perceptionNow(s, "A")!.resources.some((r) => r.id === "placed-1"));
  // The untouched state is not mutated by the reducer.
  assert.equal(s.sim.world.resources.length, 2);
});

test("peeking at the subject's perception does not change the engine or its randomness", () => {
  const s = startGame("one-spring", 90301);
  const copy = structuredClone(s);
  perceptionNow(s, "A"); perceptionNow(s, "B");
  assert.deepEqual(s, copy);
  assert.deepEqual(stepSimulation(s.sim), stepSimulation(copy.sim));
  // The peeked perception is exactly what the engine hands the human at that tick.
  assert.deepEqual(perceptionNow(s, "A"), stepSimulation(s.sim).traces.A.observation);
});

test("choice probabilities follow the model's selection rule", () => {
  const h = createHuman("A", {}, { hunger: 0.5 });
  const obs = { tick: 3, selfPosition: { x: 5, y: 5 }, animals: [{ trackId: "B", relativePosition: { x: 3, y: 0 }, relativeVelocity: { x: 0, y: 0 }, morphologySimilarity: .98 }], resources: [{ id: "f", kind: "food" as const, relativePosition: { x: 2, y: 2 }, strength: 1 }], sounds: [] };
  const counts: Record<string, number> = {};
  let trace;
  const n = 4000;
  for (let i = 0; i < n; i++) { const r = decideHuman(h, obs, keyedRandom(i, "prob", 0)); trace = r.trace; counts[r.trace.selected] = (counts[r.trace.selected] ?? 0) + 1; }
  const p = choiceProbabilities(trace!.scores, h.parameters.exploration);
  assert.ok(Math.abs(Object.values(p).reduce((a, b) => a + b!, 0) - 1) < 1e-9);
  for (const [action, prob] of Object.entries(p)) assert.ok(Math.abs((counts[action] ?? 0) / n - prob!) < 0.03, action);
});

test("same stage, seed and action log replay to the same score; records from other versions are refused", () => {
  const actions: PlayerAction[] = [
    { kind: "edit", edit: { kind: "moveResource", id: "food-nw", position: { x: 18, y: 13 } } },
    { kind: "predict", action: "forage", confidence: 3 },
    { kind: "edit", edit: { kind: "placeFire", position: { x: 20, y: 20 } } },
  ];
  const a = finish("two-tables", 90201, actions);
  const record = recordGame(a, provenance);
  const b = replayGame(JSON.parse(JSON.stringify(record)));
  assert.equal(b.final!.total, a.final!.total);
  assert.deepEqual(b.rounds, a.rounds);
  assert.throws(() => replayGame({ ...record, manifest: { ...record.manifest, game: "0.0.1" } }));
  assert.throws(() => replayGame({ ...record, total: (record.total ?? 0) + 1 }));
  assert.throws(() => replayGame({ ...record, manifest: { ...record.manifest, versions: { ...record.manifest.versions, world: "0.1.0" } } }));
});

test("memory interventions exist only in the lab and are flagged in the record", () => {
  const s = startGame("after-pain", 90401);
  assert.throws(() => act(s, { kind: "mind", edit: { kind: "eraseMemory", subject: "A" } }));
  const lab = act(startGame("memory-lab", 90501), { kind: "mind", edit: { kind: "eraseMemory", subject: "A" } });
  assert.equal(lab.labUsed, true);
  assert.deepEqual(lab.sim.humans.find((h) => h.id === "A")!.peers, {});
  assert.equal(recordGame(lab, provenance).manifest.labUsed, true);
  const swapped = act(startGame("memory-lab", 90501), { kind: "mind", edit: { kind: "swapMemories" } });
  const before = startGame("memory-lab", 90501).sim.humans;
  assert.deepEqual(swapped.sim.humans.find((h) => h.id === "A")!.peers.B, before.find((h) => h.id === "B")!.peers.A);
});

test("effort budget is enforced and every stage finishes with a score", () => {
  let s = startGame("morning", 90101);
  s = act(s, { kind: "edit", edit: { kind: "placeFood", position: { x: 8, y: 20 } } });
  assert.throws(() => act(s, { kind: "edit", edit: { kind: "placeFood", position: { x: 9, y: 20 } } }));
  for (const stage of STAGES) {
    const done = finish(stage.id, stage.seeds[1], []);
    assert.equal(done.phase, "done");
    assert.equal(done.rounds.length, stage.questions.length);
    assert.equal(done.frames.at(-1)!.tick, stage.horizon);
    assert.ok(Number.isFinite(done.final!.total));
  }
});

test("a world edit never reaches the other human's private state", () => {
  const sim = createSimulation(stageById("two-tables").build(90201));
  const edited = { ...sim, world: applyWorldEdit(sim.world, { kind: "placeResource", resource: { id: "q", kind: "food", position: { x: 1, y: 1 }, amount: 1, radius: 1 } }) };
  assert.deepEqual(edited.humans, sim.humans);
  assert.deepEqual(stepSimulation(edited).traces.A.observation.animals, stepSimulation(sim).traces.A.observation.animals);
});
