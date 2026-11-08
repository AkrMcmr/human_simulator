/**
 * Fixed-step runtime: command queue, tick-boundary application, conflict rejection,
 * checkpoints and the `human-body/run` record with replay verification.
 * No wall clock, no Math.random, no platform APIs (see docs/body/ARCHITECTURE.md).
 */
import { type BodyCommand, type BodyConfig, type BodyEvent, type BodyQuery, type BodySpec, type JointAngles, type Pose, type RejectionReason, type Skeleton, type ViolationPolicy, BODY_CONTRACT_VERSION, DEFAULT_CONFIG, RNG_VERSION, keyedRandom, stableHash, validateSpec } from "../../body-contracts/src/index.ts";
import { ANATOMY_VERSION, ROM_VERSION, SEGMENT_VERSION, regression } from "../../body-anatomy/src/index.ts";
import { MORPH_VERSION, buildSkeleton, girthTargets } from "../../body-morph/src/index.ts";
import { KINEMATICS_VERSION, applyLimits, forwardKinematics, restPose, tipPosition } from "../../body-kinematics/src/index.ts";
import { SURFACE_VERSION, buildSurface, type SurfaceKind } from "../../body-surface/src/index.ts";

export const RUNTIME_VERSION = "0.1.0";
export const RUN_FORMAT = "human-body/run";
export const VERSIONS = Object.freeze({
  contracts: BODY_CONTRACT_VERSION, anatomy: ANATOMY_VERSION, rom: ROM_VERSION, segments: SEGMENT_VERSION,
  regression: (regression as { version: string }).version, morph: MORPH_VERSION, kinematics: KINEMATICS_VERSION,
  surface: SURFACE_VERSION, runtime: RUNTIME_VERSION, rng: RNG_VERSION,
});
export const REGRESSION_HASH = stableHash((regression as { segments: unknown }).segments);

export type Checkpoint = { tick: number; label: string; hash: string; spec: BodySpec | null; pose: Pose | null };
export type RunRecord = {
  format: typeof RUN_FORMAT; version: string;
  config: BodyConfig;
  commands: BodyCommand[]; events: BodyEvent[]; checkpoints: Checkpoint[];
  manifest: { versions: typeof VERSIONS; regressionHash: string; finalTick: number; mind: { kind: string; deterministic: boolean } | null };
};
type State = { tick: number; spec: BodySpec | null; skeleton: Skeleton | null; pose: Pose | null };

/** Commands that write the same key in the same tick conflict and are all rejected (order independence). */
function conflictKeys(command: BodyCommand): string[] {
  const p = command.params;
  switch (command.domain + "." + command.name) {
    case "morph.create": return ["spec"];
    case "pose.setJoint": return ["joint:" + String(p.bone)];
    case "pose.setPose": return Object.keys((p.joints as JointAngles | undefined) ?? {}).map(b => "joint:" + b);
    case "runtime.checkpoint": return ["checkpoint:" + String(p.label ?? "")];
    default: return [];
  }
}
const PRIORITY: Record<string, number> = { "morph.create": 0, "pose.setPose": 1, "pose.setJoint": 1, "runtime.checkpoint": 9 };

export class BodyRuntime {
  readonly config: BodyConfig;
  private state: State = { tick: 0, spec: null, skeleton: null, pose: null };
  private queue: BodyCommand[] = [];
  private log: BodyCommand[] = [];
  private events: BodyEvent[] = [];
  private checkpoints: Checkpoint[] = [];
  private ids = new Set<string>();

  constructor(config: Partial<BodyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config, fidelity: { ...DEFAULT_CONFIG.fidelity, ...(config.fidelity ?? {}) } };
    if (!(this.config.dt > 0) || !Number.isFinite(this.config.dt)) throw new Error("dt must be positive");
    if (!Number.isInteger(this.config.seed)) throw new Error("seed must be an integer");
  }
  get tick() { return this.state.tick; }
  get skeleton() { return this.state.skeleton; }
  get pose() { return this.state.pose; }
  get spec() { return this.state.spec; }

  /** Queue a command. Without `tick` it applies at the next step. A past tick or duplicate id is rejected immediately. */
  enqueue(command: BodyCommand): BodyEvent | null {
    if (!command || typeof command.id !== "string" || !command.id) throw new Error("Command needs a string id");
    if (this.ids.has(command.id)) return this.reject(command, "invalid_params", "duplicate command id");
    this.ids.add(command.id);
    const tick = command.tick ?? this.state.tick;
    if (!Number.isInteger(tick) || tick < this.state.tick) return this.reject(command, "past_tick", `tick ${tick} is before the current tick ${this.state.tick}`);
    const resolved = { ...command, tick };
    this.queue.push(resolved);
    this.log.push(resolved);
    return null;
  }

  /** Advance `ticks` steps. Commands due at the current tick are applied at the boundary, then the tick increments. */
  step(ticks = 1) {
    for (let i = 0; i < ticks; i++) {
      const due = this.queue.filter(c => c.tick === this.state.tick);
      this.queue = this.queue.filter(c => c.tick !== this.state.tick);
      due.sort((a, b) => (PRIORITY[a.domain + "." + a.name] ?? 5) - (PRIORITY[b.domain + "." + b.name] ?? 5) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const owners = new Map<string, string[]>();
      for (const c of due) for (const key of conflictKeys(c)) owners.set(key, [...(owners.get(key) ?? []), c.id]);
      const conflicting = new Set<string>();
      for (const [key, ids] of owners) if (ids.length > 1) { for (const id of ids) conflicting.add(id); void key; }
      for (const c of due) {
        if (conflicting.has(c.id)) { this.reject(c, "conflict", "another command writes the same state in this tick"); continue; }
        this.apply(c);
      }
      this.state.tick++;
    }
  }

  private apply(c: BodyCommand) {
    const name = c.domain + "." + c.name;
    switch (name) {
      case "morph.create": {
        if (this.config.fidelity.morph < 1) return this.reject(c, "unsupported_fidelity", "morph fidelity 0 has no generated bodies");
        let spec: BodySpec;
        try { spec = validateSpec(c.params.spec); } catch (e) { return this.reject(c, "invalid_params", (e as Error).message); }
        try { this.state.skeleton = buildSkeleton(spec); } catch (e) { return this.reject(c, "out_of_range", (e as Error).message); }
        this.state.spec = spec; this.state.pose = restPose();
        return this.accept(c, { statureM: spec.statureM, bones: this.state.skeleton.bones.length });
      }
      case "pose.setJoint":
      case "pose.setPose": {
        if (!this.state.skeleton || !this.state.pose) return this.reject(c, "invalid_params", "no body: send morph.create first");
        const policy = (c.params.onViolation ?? "clamp") as ViolationPolicy;
        if (policy !== "clamp" && policy !== "reject") return this.reject(c, "invalid_params", "onViolation must be clamp or reject");
        const joints: JointAngles = name === "pose.setJoint" ? { [String(c.params.bone)]: c.params.angles as JointAngles[string] } : (c.params.joints as JointAngles);
        if (!joints || typeof joints !== "object") return this.reject(c, "invalid_params", "joints must be an object");
        for (const v of Object.values(joints)) if (!v || typeof v !== "object") return this.reject(c, "invalid_params", "angles must be an object of axis -> radians");
        const result = applyLimits(this.state.skeleton, joints, policy);
        if (result.invalid.length) return this.reject(c, "invalid_params", result.invalid.map(i => `${i.bone}${i.axis ? "." + i.axis : ""}: ${i.reason}`).join("; "));
        if (result.violations.length) return this.reject(c, "out_of_range", result.violations.map(v => `${v.bone}.${v.axis}=${v.requested.toFixed(3)} outside [${v.min.toFixed(3)}, ${v.max.toFixed(3)}]`).join("; "));
        for (const [bone, angles] of Object.entries(result.joints)) this.state.pose.joints[bone] = { ...(this.state.pose.joints[bone] ?? {}), ...angles };
        return this.accept(c, { clamped: result.clamped.length > 0, clampedAxes: result.clamped.map(x => `${x.bone}.${x.axis}`) });
      }
      case "runtime.checkpoint": {
        const label = String(c.params.label ?? "");
        const cp = this.snapshot(label);
        this.checkpoints.push(cp);
        return this.accept(c, { hash: cp.hash });
      }
      default: return this.reject(c, "unknown_command", name);
    }
  }
  private accept(c: BodyCommand, payload: Record<string, unknown>) { const e: BodyEvent = { tick: this.state.tick, kind: "accepted", commandId: c.id, payload }; this.events.push(e); return e; }
  private reject(c: BodyCommand, reason: RejectionReason, detail: string) { const e: BodyEvent = { tick: this.state.tick, kind: "rejected", commandId: c.id, payload: { reason, detail } }; this.events.push(e); return e; }

  snapshot(label = ""): Checkpoint {
    const spec = this.state.spec ? structuredClone(this.state.spec) : null;
    const pose = this.state.pose ? structuredClone(this.state.pose) : null;
    return { tick: this.state.tick, label, spec, pose, hash: stableHash({ tick: this.state.tick, spec, pose }) };
  }
  /** Restore a checkpoint (the skeleton is regenerated from the spec). Pending commands at or after the checkpoint tick are kept. */
  restore(checkpoint: Checkpoint) {
    if (checkpoint.spec) validateSpec(checkpoint.spec);
    const skeleton = checkpoint.spec ? buildSkeleton(checkpoint.spec) : null;
    const pose = checkpoint.pose ? structuredClone(checkpoint.pose) : null;
    const hash = stableHash({ tick: checkpoint.tick, spec: checkpoint.spec, pose });
    if (hash !== checkpoint.hash) throw new Error("Checkpoint hash does not match its content");
    this.state = { tick: checkpoint.tick, spec: checkpoint.spec ? structuredClone(checkpoint.spec) : null, skeleton, pose };
    this.queue = this.queue.filter(c => (c.tick ?? 0) >= checkpoint.tick);
  }
  random(stream: string) { return keyedRandom(this.config.seed, stream, this.state.tick); }

  query(q: BodyQuery): unknown {
    const name = q.domain + "." + q.name;
    switch (name) {
      case "query.versions": return { ...VERSIONS, regressionHash: REGRESSION_HASH };
      case "query.spec": return this.state.spec ? { spec: this.state.spec, skeletonHash: stableHash(this.state.skeleton), bones: this.state.skeleton!.bones.length } : null;
      case "query.pose": {
        if (!this.state.skeleton || !this.state.pose) return null;
        const world = forwardKinematics(this.state.skeleton, this.state.pose);
        return { tick: this.state.tick, joints: this.state.pose.joints, world: Object.fromEntries(this.state.skeleton.bones.map(b => [b.id, { ...world.get(b.id)!, tip: tipPosition(b, world.get(b.id)!) }])) };
      }
      case "query.rom": return this.state.skeleton ? Object.fromEntries(this.state.skeleton.bones.map(b => [b.id, b.joint.dofs])) : null;
      case "query.surface": return this.state.skeleton ? buildSurface(this.state.skeleton, { kind: (q.params?.kind as SurfaceKind | undefined) ?? "mesh", girths: girthTargets(this.state.spec!) }) : null;
      case "query.events": return this.events.slice();
      default: throw new Error("Unknown query " + name);
    }
  }

  exportRun(): RunRecord {
    return {
      format: RUN_FORMAT, version: RUNTIME_VERSION, config: structuredClone(this.config),
      commands: structuredClone(this.log), events: structuredClone(this.events), checkpoints: structuredClone(this.checkpoints),
      manifest: { versions: { ...VERSIONS }, regressionHash: REGRESSION_HASH, finalTick: this.state.tick, mind: null },
    };
  }
  /** Re-run a record from its config and commands; every recorded checkpoint must hash identically. */
  static replay(record: RunRecord): BodyRuntime {
    if (record.format !== RUN_FORMAT) throw new Error("Not a human-body/run record");
    if (record.version !== RUNTIME_VERSION) throw new Error(`Record version ${record.version} does not match runtime ${RUNTIME_VERSION}; no silent migration`);
    for (const [k, v] of Object.entries(record.manifest.versions)) if ((VERSIONS as Record<string, string>)[k] !== v) throw new Error(`Component ${k} version ${v} differs from ${(VERSIONS as Record<string, string>)[k]}`);
    if (record.manifest.regressionHash !== REGRESSION_HASH) throw new Error("Anthropometric regression differs from the recorded one");
    const runtime = new BodyRuntime(record.config);
    const immediate: BodyEvent[] = [];
    for (const c of record.commands) { const e = runtime.enqueue(c); if (e) immediate.push(e); }
    runtime.step(record.manifest.finalTick);
    if (runtime.checkpoints.length !== record.checkpoints.length) throw new Error("Checkpoint count differs on replay");
    record.checkpoints.forEach((cp, i) => { if (runtime.checkpoints[i].hash !== cp.hash || runtime.checkpoints[i].tick !== cp.tick) throw new Error(`Checkpoint ${i} (${cp.label}) does not reproduce`); });
    if (stableHash(runtime.events) !== stableHash(record.events)) throw new Error("Event log does not reproduce");
    return runtime;
  }
}
