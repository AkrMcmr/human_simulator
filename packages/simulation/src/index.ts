import { distance } from "../../contracts/src/index.ts";
import type { ActionIntent, Body, DecisionTrace, HumanParameters, Vec2 } from "../../contracts/src/index.ts";
import { CONTRACT_VERSION } from "../../contracts/src/index.ts";
import { applyPhysicalEffect, createHuman, decideHuman, HUMAN_VERSION } from "../../human/src/index.ts";
import type { HumanState, VoiceCategory } from "../../human/src/index.ts";
import { advanceWorld, createWorld, senseWorld, WORLD_VERSION } from "../../world/src/index.ts";
import type { Resource, WorldEvent, WorldParameters, WorldState } from "../../world/src/index.ts";
import { keyedRandom, RNG_VERSION } from "./random.ts";

export const SIMULATION_VERSION = "0.1.0";
export const VERSIONS = { contracts: CONTRACT_VERSION, human: HUMAN_VERSION, world: WORLD_VERSION, simulation: SIMULATION_VERSION, rng: RNG_VERSION };
export type AgentInitial = { id: string; position: Vec2; parameters: Partial<HumanParameters>; body: Partial<Body> };
export type ExperimentConfig = {
  name: string; seed: number; horizon: number; world: Partial<WorldParameters>;
  agents: AgentInitial[]; resources?: Resource[];
};
export type SimulatorState = {
  tick: number; seed: number; horizon: number; humans: HumanState[]; world: WorldState;
  traces: Record<string, DecisionTrace>; events: WorldEvent[];
};
export type AgentView = {
  id: string; body: Body; action: string; producedSounds: VoiceCategory[]; heardSounds: VoiceCategory[];
  learnedTransitions: number; trace: DecisionTrace | null;
  peerEvidence: { id: string; harmEstimate: number; closeEvidence: number }[];
};
export type Frame = {
  tick: number; world: WorldState; agents: AgentView[]; distance: number | null; events: WorldEvent[];
};
export type Provenance = {
  sourceCommit: string; sourceHash: string; dependencyLockHash: string; runtime: string; dirty: boolean;
};
export type RunArchive = {
  format: "human-world-lab/run"; schemaVersion: 1;
  manifest: { versions: typeof VERSIONS; provenance: Provenance; timeUnit: "abstract-tick"; schedule: "simultaneous-v1" };
  config: ExperimentConfig; checkpoint: SimulatorState; frames: Frame[];
};
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const unit = (x: unknown) => finite(x) && x >= 0 && x <= 1;
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

export function validateConfig(value: unknown): asserts value is ExperimentConfig {
  if (!object(value) || typeof value.name !== "string" || !Number.isInteger(value.seed) || !Number.isInteger(value.horizon)
      || !finite(value.horizon) || value.horizon < 1 || value.horizon > 10000 || !object(value.world)
      || !Array.isArray(value.agents) || value.agents.length < 1 || value.agents.length > 32) throw new Error("実験設定の形式が正しくありません。");
  if (!finite(value.seed) || value.seed < 0 || value.seed > 4294967295) throw new Error("シードは0〜4294967295の整数で指定してください。");
  const width = value.world.width ?? 40, height = value.world.height ?? 28;
  if (!finite(width) || !finite(height) || width < 10 || height < 10 || width > 200 || height > 200) throw new Error("舞台の大きさが範囲外です。");
  for (const key of ["ambientCold", "acousticNoise"]) {
    if (value.world[key] !== undefined && !unit(value.world[key])) throw new Error("環境パラメータが範囲外です: " + key);
  }
  for (const key of ["visionRadius", "hearingRadius"]) {
    if (value.world[key] !== undefined && (!finite(value.world[key]) || (value.world[key] as number) < 0 || (value.world[key] as number) > 400)) throw new Error("知覚範囲が不正です。");
  }
  if (value.world.soundEnabled !== undefined && typeof value.world.soundEnabled !== "boolean") throw new Error("音の伝達設定が不正です。");
  const ids = new Set<string>();
  for (const a of value.agents) {
    if (!object(a) || typeof a.id !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(a.id) || ["__proto__", "constructor", "prototype"].includes(a.id) || ids.has(a.id)
        || !object(a.position) || !finite(a.position.x) || !finite(a.position.y)
        || a.position.x < 0.6 || a.position.x > width - 0.6 || a.position.y < 0.6 || a.position.y > height - 0.6
        || !object(a.parameters) || !object(a.body)) throw new Error("個体の初期設定が不正です。");
    ids.add(a.id);
    for (const [key, v] of Object.entries(a.parameters)) {
      if (!["curiosity", "caution", "learningRate", "exploration", "memoryDecay"].includes(key) || !unit(v)) throw new Error("人間のパラメータが範囲外です: " + key);
    }
    for (const [key, v] of Object.entries(a.body)) {
      if (!["hunger", "fatigue", "cold", "health"].includes(key) || !unit(v)) throw new Error("身体の初期値が不正です。");
    }
  }
  if (value.resources !== undefined) {
    if (!Array.isArray(value.resources)) throw new Error("資源設定が不正です。");
    const resourceIds = new Set<string>();
    for (const r of value.resources) {
      if (!object(r) || typeof r.id !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(r.id) || ["__proto__", "constructor", "prototype"].includes(r.id) || resourceIds.has(r.id)
        || !["food", "warmth"].includes(r.kind as string) || !object(r.position)
        || !finite(r.position.x) || !finite(r.position.y) || r.position.x < 0 || r.position.x > width || r.position.y < 0 || r.position.y > height
        || !unit(r.amount) || !finite(r.radius) || r.radius <= 0 || r.radius > 100) throw new Error("資源設定が不正です。");
      resourceIds.add(r.id);
    }
  }
}
export function createSimulation(config: ExperimentConfig): SimulatorState {
  validateConfig(config);
  const initial = [...config.agents].sort((a, b) => a.id.localeCompare(b.id));
  return {
    tick: 0, seed: config.seed, horizon: config.horizon,
    humans: initial.map((a) => createHuman(a.id, a.parameters, a.body)),
    world: createWorld(initial.map((a) => ({ id: a.id, position: a.position })), config.world, config.resources),
    traces: {}, events: [],
  };
}
export function stepSimulation(previous: SimulatorState): SimulatorState {
  if (previous.tick >= previous.horizon) return previous;
  const actions: Record<string, ActionIntent> = {};
  const traces: Record<string, DecisionTrace> = {};
  const humans = [...previous.humans].sort((a, b) => a.id.localeCompare(b.id)).map((h) => {
    if (h.body.health <= 0) return structuredClone(h);
    const observation = senseWorld(previous.world, h.id, previous.tick, keyedRandom(previous.seed, "senses/" + h.id, previous.tick));
    const result = decideHuman(h, observation, keyedRandom(previous.seed, "mind/" + h.id, previous.tick));
    actions[h.id] = result.action;
    traces[h.id] = result.trace;
    return result.human;
  });
  const advanced = advanceWorld(previous.world, actions, previous.tick);
  return {
    tick: previous.tick + 1, seed: previous.seed, horizon: previous.horizon,
    humans: humans.map((h) => h.body.health <= 0 ? h : applyPhysicalEffect(h, advanced.effects[h.id])),
    world: advanced.world, traces, events: advanced.events,
  };
}
export function observeSimulation(state: SimulatorState): Frame {
  return {
    tick: state.tick, world: structuredClone(state.world), events: structuredClone(state.events),
    distance: state.world.animals.length === 2 ? distance(state.world.animals[0].position, state.world.animals[1].position) : null,
    agents: state.humans.map((h) => ({
      id: h.id, body: { ...h.body }, action: h.lastAction, producedSounds: structuredClone(h.producedSounds),
      heardSounds: structuredClone(h.heardSounds), learnedTransitions: h.learnedTransitions,
      trace: state.traces[h.id] ? structuredClone(state.traces[h.id]) : null,
      peerEvidence: Object.entries(h.peers).map(([id, m]) => ({
        id, harmEstimate: m.harmAlpha / (m.harmAlpha + m.harmBeta), closeEvidence: m.harmAlpha + m.harmBeta - 2,
      })),
    })),
  };
}
export function runExperiment(config: ExperimentConfig, steps = config.horizon): { state: SimulatorState; frames: Frame[] } {
  let state = createSimulation(config);
  const frames = [observeSimulation(state)];
  for (let i = 0; i < Math.min(steps, config.horizon); i++) {
    state = stepSimulation(state);
    frames.push(observeSimulation(state));
  }
  return { state, frames };
}
export function archiveRun(config: ExperimentConfig, state: SimulatorState, frames: Frame[], provenance: Provenance): RunArchive {
  return {
    format: "human-world-lab/run", schemaVersion: 1,
    manifest: { versions: { ...VERSIONS }, provenance: { ...provenance }, timeUnit: "abstract-tick", schedule: "simultaneous-v1" },
    config: structuredClone(config), checkpoint: structuredClone(state), frames: structuredClone(frames),
  };
}
/**
 * Re-execute imported archives from their initial config and verify the checkpoint.
 * This avoids trusting arbitrary serialized private state. v0.1 files are bounded.
 * Files made by other model versions must be viewed with that version, not silently migrated.
 */
export function restoreRun(value: unknown): { config: ExperimentConfig; state: SimulatorState; frames: Frame[]; provenance: Provenance } {
  if (!object(value) || value.format !== "human-world-lab/run" || value.schemaVersion !== 1 || !object(value.manifest)
      || JSON.stringify(value.manifest.versions) !== JSON.stringify(VERSIONS) || !object(value.checkpoint)
      || !Number.isInteger(value.checkpoint.tick) || !finite(value.checkpoint.tick) || value.checkpoint.tick < 0
      || !object(value.manifest.provenance)) throw new Error("この版では読み込めない実験記録です。");
  validateConfig(value.config);
  if (value.checkpoint.tick > value.config.horizon) throw new Error("記録のステップ数が不正です。");
  const reconstructed = runExperiment(value.config, value.checkpoint.tick);
  if (JSON.stringify(reconstructed.state) !== JSON.stringify(value.checkpoint)) throw new Error("同じ初期条件から記録を再現できませんでした。モデルの版・計算環境・ファイルの変更を確認してください。");
  return { config: structuredClone(value.config), ...reconstructed, provenance: value.manifest.provenance as Provenance };
}
