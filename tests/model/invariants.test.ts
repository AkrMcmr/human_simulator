import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSimulation, stepSimulation, runExperiment, observeSimulation, archiveRun, restoreRun } from "../../packages/simulation/src/index.ts";
import { pairExperiment, DEFAULT_SETTINGS, measure } from "../../packages/experiments/src/index.ts";
import { createWorld, senseWorld, advanceWorld } from "../../packages/world/src/index.ts";
import { createHuman, decideHuman } from "../../packages/human/src/index.ts";
import { keyedRandom } from "../../packages/simulation/src/random.ts";

const config = () => pairExperiment({ ...structuredClone(DEFAULT_SETTINGS), horizon: 100 });
const provenance = { sourceCommit: "test", sourceHash: "test", dependencyLockHash: "test", runtime: process.version, dirty: false };

test("same initial conditions reproduce the complete experiment, while a new seed changes it", () => {
  const a = runExperiment(config());
  assert.deepEqual(a, runExperiment(config()));
  assert.notDeepEqual(a.state, runExperiment({ ...config(), seed: 43 }).state);
});
test("agent iteration order does not decide who goes first", () => {
  const c = config();
  c.agents.push({ id: "C", position: { x: 20, y: 18 }, parameters: {}, body: {} });
  const a = createSimulation(c);
  const b = structuredClone(a);
  b.humans.reverse(); b.world.animals.reverse();
  assert.deepEqual(stepSimulation(a), stepSimulation(b));
});
test("changing only B's private state cannot leak into A's current decision", () => {
  const a = createSimulation(config());
  const b = structuredClone(a);
  b.humans.find((h) => h.id === "B")!.parameters.curiosity = 0;
  b.humans.find((h) => h.id === "B")!.body.hunger = 0.95;
  assert.deepEqual(stepSimulation(a).traces.A, stepSimulation(b).traces.A);
});
test("out-of-range animals are absent and invisible sound sources are not identified", () => {
  const w = createWorld([{ id: "A", position: { x: 1, y: 2 } }, { id: "B", position: { x: 15, y: 2 } }], { visionRadius: 4, hearingRadius: 20 });
  w.sounds.push({ sourceId: "B", position: { x: 15, y: 2 }, shape: { openness: 0.4, resonance: 0.7 }, tick: 1 });
  const obs = senseWorld(w, "A", 1, keyedRandom(42, "test", 1));
  assert.equal(obs.animals.length, 0);
  assert.equal(obs.sounds.length, 1);
  assert.equal(obs.sounds[0].visibleSourceId, null);
  assert.deepEqual(Object.keys(obs).sort(), ["animals", "resources", "selfPosition", "sounds", "tick"]);
});
test("sound reaches attention through acoustic novelty, with no word or intent label", () => {
  const w = createWorld([{ id: "A", position: { x: 10, y: 10 } }, { id: "B", position: { x: 12, y: 10 } }]);
  w.sounds.push({ sourceId: "B", position: { x: 12, y: 10 }, shape: { openness: 0.3, resonance: 0.5 }, tick: 1 });
  const obs = senseWorld(w, "A", 1, keyedRandom(42, "test", 1));
  const a = decideHuman(createHuman("A"), obs, keyedRandom(42, "mind/A", 1));
  w.parameters.soundEnabled = false;
  const muted = senseWorld(w, "A", 1, keyedRandom(42, "test", 1));
  const b = decideHuman(createHuman("A"), muted, keyedRandom(42, "mind/A", 1));
  assert.ok(a.trace.scores.find((s) => s.action === "observe")!.terms.auditoryOrienting > 0);
  assert.equal(b.trace.scores.find((s) => s.action === "observe")!.terms.auditoryOrienting, 0);
  assert.equal(createHuman("A").producedSounds.length, 0);
  assert.equal(a.human.heardSounds.length, 1);
});
test("an unexposed distant peer never becomes proven harmless just by waiting", () => {
  let h = createHuman("A");
  const w = createWorld([{ id: "A", position: { x: 8, y: 10 } }, { id: "B", position: { x: 20, y: 10 } }]);
  for (let i = 0; i < 20; i++) h = decideHuman(h, senseWorld(w, "A", i, keyedRandom(42, "sensor", i)), keyedRandom(42, "human", i)).human;
  assert.equal(h.peers.B.harmAlpha, 1);
  assert.equal(h.peers.B.harmBeta, 1);
  assert.ok(h.learnedTransitions > 0);
});
test("snapshot continuation is identical to uninterrupted simulation", () => {
  const all = runExperiment(config()).state;
  let resumed = JSON.parse(JSON.stringify(runExperiment(config(), 31).state));
  while (resumed.tick < resumed.horizon) resumed = stepSimulation(resumed);
  assert.deepEqual(resumed, all);
});
test("exported records are verifiable and tampered or incompatible checkpoints are rejected", () => {
  const run = runExperiment(config(), 40);
  const archive = archiveRun(config(), run.state, run.frames, provenance);
  assert.deepEqual(restoreRun(JSON.parse(JSON.stringify(archive))).state, run.state);
  archive.checkpoint.humans[0].body.hunger = 0.999;
  assert.throws(() => restoreRun(archive), /再現/);
  archive.schemaVersion = 99 as 1;
  assert.throws(() => restoreRun(archive), /読み込めない/);
});
test("observing a simulation cannot mutate it or advance randomness", () => {
  const state = runExperiment(config(), 10).state;
  const backup = structuredClone(state);
  const frame = observeSimulation(state);
  frame.world.animals[0].position.x = 999;
  frame.agents[0].body.health = 0;
  assert.deepEqual(state, backup);
  assert.equal(keyedRandom(7, "A", 5)("choice"), keyedRandom(7, "A", 5)("choice"));
});
test("scarce food is shared symmetrically when both eat simultaneously", () => {
  const w = createWorld([{ id: "A", position: { x: 10, y: 10 } }, { id: "B", position: { x: 11.2, y: 10 } }], {}, [
    { id: "food", kind: "food", position: { x: 10.6, y: 10 }, amount: 0.02, radius: 2 },
  ]);
  const next = advanceWorld(w, { A: { kind: "forage" }, B: { kind: "forage" } }, 0);
  assert.equal(next.effects.A.foodIntake, 0.01);
  assert.equal(next.effects.B.foodIntake, 0.01);
});
test("bounded bodies, finite data, and positions survive a complete run", () => {
  const run = runExperiment(pairExperiment());
  for (const frame of run.frames) {
    for (const h of frame.agents) for (const value of Object.values(h.body)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    for (const animal of frame.world.animals) {
      assert.ok(animal.position.x >= 0.6 && animal.position.x <= frame.world.parameters.width - 0.6);
      assert.ok(animal.position.y >= 0.6 && animal.position.y <= frame.world.parameters.height - 0.6);
    }
  }
  assert.ok(measure(run.frames).learnedTransitions > 0);
  assert.ok(measure(run.frames).vocalizations > 0);
  assert.equal(stepSimulation(run.state), run.state);
});
test("invalid parameters, duplicate identities, and impossible initial positions fail early", () => {
  assert.throws(() => createSimulation({ ...config(), seed: -1 }));
  const c = config(); c.agents[0].parameters.curiosity = 1.1;
  assert.throws(() => createSimulation(c));
  const d = config(); d.agents[1].id = d.agents[0].id;
  assert.throws(() => createSimulation(d));
  const e = config(); e.agents[0].position.x = -1;
  assert.throws(() => createSimulation(e));
});
test("the human and world packages depend only on the public contract", () => {
  for (const name of ["human", "world"]) {
    const source = readFileSync(new URL("../../packages/" + name + "/src/index.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    assert.ok(imports.every((path) => path === "../../contracts/src/index.ts"));
    assert.doesNotMatch(source, /\b(fetch|WebSocket|localStorage|document)\s*\(/);
  }
});
