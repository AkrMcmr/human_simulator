import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation, runExperiment, archiveRun, restoreRun, observeSimulation, versionsFor, VERSIONS, DEFAULT_MODEL_ID, HUMAN_MODELS, MODEL_IDS } from "../../packages/simulation/src/index.ts";
import { pairExperiment, DEFAULT_SETTINGS, measure } from "../../packages/experiments/src/index.ts";
import { models as evolutionModels } from "../../research/evolution/models.ts";

const config = (model?: string) => {
  const c = pairExperiment({ ...structuredClone(DEFAULT_SETTINGS), horizon: 120 });
  if (model === undefined) delete c.model; else c.model = model;
  return c;
};
const provenance = { sourceCommit: "test", sourceHash: "test", dependencyLockHash: "test", runtime: process.version, dirty: false };

test("omitting the model selects the default 0.2.0, and the archive records that version", () => {
  const implicit = runExperiment(config());
  const explicit = runExperiment(config(DEFAULT_MODEL_ID));
  assert.equal(implicit.state.model, DEFAULT_MODEL_ID);
  assert.equal(DEFAULT_MODEL_ID, "human-0.2.0");
  assert.deepEqual(implicit.state, explicit.state);
  const archive = archiveRun(config(), implicit.state, implicit.frames, provenance);
  assert.equal(archive.manifest.model, DEFAULT_MODEL_ID);
  assert.deepEqual(archive.manifest.versions, VERSIONS);
  assert.equal(archive.manifest.versions.human, "0.2.0");
  assert.ok(implicit.frames.some(f => f.agents.some(a => a.trace && a.trace.scores.some(s => "predictedSafety" in s.terms))));
});
test("the legacy model is selected only by name, and its archive names 0.1.0", () => {
  const legacy = runExperiment(config("human-0.1.0"));
  const archive = archiveRun(config("human-0.1.0"), legacy.state, legacy.frames, provenance);
  assert.equal(archive.manifest.versions.human, "0.1.0");
  assert.notEqual(archive.manifest.versions.human, VERSIONS.human);
  assert.deepEqual(restoreRun(JSON.parse(JSON.stringify(archive))).state, legacy.state);
  assert.ok(legacy.frames.every(f => f.agents.every(a => !a.trace || a.trace.scores.every(s => !("predictedSafety" in s.terms)))));
  assert.notDeepEqual(legacy.state.world, runExperiment(config()).state.world);
});
test("a legacy or candidate archive cannot be replayed as the default model or under another version", () => {
  const legacy = runExperiment(config("human-0.1.0"));
  const archive = archiveRun(config("human-0.1.0"), legacy.state, legacy.frames, provenance);
  const relabeled = JSON.parse(JSON.stringify(archive)); delete relabeled.config.model;
  assert.throws(() => restoreRun(relabeled), /読み込めない/);
  const renamed = JSON.parse(JSON.stringify(archive)); renamed.config.model = DEFAULT_MODEL_ID; renamed.checkpoint.model = DEFAULT_MODEL_ID; renamed.manifest.model = DEFAULT_MODEL_ID;
  assert.throws(() => restoreRun(renamed), /読み込めない/);
  const forgedVersion = JSON.parse(JSON.stringify(archive)); forgedVersion.manifest.versions.human = "0.2.0";
  assert.throws(() => restoreRun(forgedVersion), /読み込めない/);
  const oldFormat = JSON.parse(JSON.stringify(archive)); oldFormat.manifest.versions.simulation = "0.1.0";
  assert.throws(() => restoreRun(oldFormat), /読み込めない/);
  const candidate = runExperiment(config("predictive-0.2.0-experimental.1"));
  assert.deepEqual(candidate.state.world, runExperiment(config()).state.world);
  assert.equal(archiveRun(config("predictive-0.2.0-experimental.1"), candidate.state, candidate.frames, provenance).manifest.versions.human, "0.2.0-experimental.1");
});
test("unknown model ids are rejected before any simulation runs", () => {
  assert.throws(() => createSimulation(config("human-9.9.9")), /未知の人間モデル/);
  assert.throws(() => createSimulation({ ...config(), model: 3 as unknown as string }), /モデルID/);
  assert.throws(() => versionsFor("nope"));
});
test("the ablated control reproduces the legacy model's world, bodies, and actions", () => {
  const baseline = runExperiment(config("human-0.1.0"));
  const ablated = runExperiment(config("predictive-ablated-0.2.0-experimental.1"));
  assert.deepEqual(ablated.state.world, baseline.state.world);
  assert.deepEqual(ablated.state.humans, baseline.state.humans);
  assert.deepEqual(measure(ablated.frames), measure(baseline.frames));
  assert.deepEqual(observeSimulation(ablated.state).agents.map(a => a.action), observeSimulation(baseline.state).agents.map(a => a.action));
});
test("the evolution registry and the simulation registry point at the same implementations", () => {
  for (const [id, adapter] of Object.entries(evolutionModels)) {
    assert.ok(MODEL_IDS.includes(id), "unregistered in simulation: " + id);
    assert.equal(adapter.create, HUMAN_MODELS[id].create);
    assert.equal(adapter.apply, HUMAN_MODELS[id].apply);
    // Ablated controls are closures; compare their decisions rather than identity.
    const human = HUMAN_MODELS[id].create("A");
    const observation = { tick: 0, selfPosition: { x: 10, y: 14 }, animals: [], resources: [], sounds: [] };
    const random = () => 0.5;
    assert.deepEqual(adapter.decide(human, observation, random), HUMAN_MODELS[id].decide(human, observation, random));
  }
});
