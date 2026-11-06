import test from "node:test";
import assert from "node:assert/strict";
import type { BodyCommand, BodySpec } from "../../packages/body-contracts/src/index.ts";
import { BodyRuntime, VERSIONS } from "../../packages/body-runtime/src/index.ts";

const spec: BodySpec = { sex: "female", ageYears: 28, statureM: 1.63, massKg: 58, seed: 5 };
const create = (id = "create"): BodyCommand => ({ id, domain: "morph", name: "create", params: { spec } });
const set = (id: string, bone: string, angles: Record<string, number>, tick?: number, onViolation?: string): BodyCommand => ({ id, domain: "pose", name: "setJoint", tick, params: { bone, angles, ...(onViolation ? { onViolation } : {}) } });
const checkpoint = (id: string, tick: number, label = id): BodyCommand => ({ id, domain: "runtime", name: "checkpoint", tick, params: { label } });
function scripted(order: "ab" | "ba") {
  const rt = new BodyRuntime({ seed: 9 });
  rt.enqueue(create());
  const a = set("a", "leftUpperArm", { z: 0.5 }, 1), b = set("b", "rightUpperArm", { z: -0.5 }, 1);
  for (const c of order === "ab" ? [a, b] : [b, a]) rt.enqueue(c);
  rt.enqueue(checkpoint("cp1", 1)); rt.enqueue(checkpoint("cp2", 3));
  rt.step(4);
  return rt;
}

test("T0 / FR-REC-01: a run replays from its record with identical checkpoints and events", () => {
  const rt = scripted("ab");
  const record = JSON.parse(JSON.stringify(rt.exportRun()));
  const replayed = BodyRuntime.replay(record);
  assert.equal(replayed.tick, 4);
  assert.deepEqual(replayed.exportRun().checkpoints.map(c => c.hash), record.checkpoints.map((c: { hash: string }) => c.hash));
  assert.deepEqual(record.manifest.versions, VERSIONS);
});
test("T0: enqueue order within a tick does not change the result", () => {
  const ab = scripted("ab").exportRun(), ba = scripted("ba").exportRun();
  assert.deepEqual(ab.checkpoints.map(c => c.hash), ba.checkpoints.map(c => c.hash));
  const sortEvents = (e: typeof ab.events) => [...e].sort((x, y) => x.tick - y.tick || String(x.commandId).localeCompare(String(y.commandId)));
  assert.deepEqual(sortEvents(ab.events), sortEvents(ba.events));
});
test("conflicting writes in the same tick are both rejected; a past tick and a duplicate id are rejected on enqueue", () => {
  const rt = new BodyRuntime();
  rt.enqueue(create()); rt.step();
  rt.enqueue(set("x1", "leftLowerLeg", { x: 0.2 })); rt.enqueue(set("x2", "leftLowerLeg", { x: 0.4 })); rt.enqueue(set("y", "rightLowerLeg", { x: 0.3 }));
  rt.step();
  const events = rt.query({ domain: "query", name: "events" }) as { kind: string; commandId?: string; payload: { reason?: string } }[];
  assert.deepEqual(events.filter(e => e.commandId === "x1" || e.commandId === "x2").map(e => [e.kind, e.payload.reason]), [["rejected", "conflict"], ["rejected", "conflict"]]);
  assert.equal(events.find(e => e.commandId === "y")!.kind, "accepted");
  assert.equal(rt.pose!.joints.leftLowerLeg, undefined);
  assert.equal(rt.enqueue(set("past", "leftLowerLeg", { x: 0.1 }, 0))!.payload.reason, "past_tick");
  assert.equal(rt.enqueue(set("y", "leftLowerLeg", { x: 0.1 }))!.payload.reason, "invalid_params");
});
test("FR-KIN-01 via commands: clamp is reported, reject refuses, and invalid axes are invalid", () => {
  const rt = new BodyRuntime();
  rt.enqueue(create()); rt.enqueue(set("c", "leftLowerLeg", { x: 5 }, 1)); rt.enqueue(set("r", "rightLowerLeg", { x: 5 }, 1, "reject")); rt.enqueue(set("i", "leftLowerLeg", { y: 0.1 }, 2)); rt.step(3);
  const e = (id: string) => (rt.query({ domain: "query", name: "events" }) as { commandId?: string; kind: string; payload: Record<string, unknown> }[]).find(x => x.commandId === id)!;
  assert.equal(e("c").kind, "accepted"); assert.equal(e("c").payload.clamped, true);
  assert.equal(e("r").payload.reason, "out_of_range");
  assert.equal(e("i").payload.reason, "invalid_params");
  assert.ok(rt.pose!.joints.leftLowerLeg.x! < 5 && rt.pose!.joints.rightLowerLeg === undefined);
});
test("FR-REC-02: restoring a checkpoint and continuing matches the uninterrupted run", () => {
  const full = new BodyRuntime({ seed: 2 });
  full.enqueue(create()); full.enqueue(set("p1", "spine", { x: 0.2 }, 1)); full.enqueue(checkpoint("c1", 2)); full.enqueue(set("p2", "head", { y: 0.3 }, 3)); full.enqueue(checkpoint("c2", 4)); full.step(5);
  const cp = full.exportRun().checkpoints[0];
  const resumed = new BodyRuntime({ seed: 2 });
  resumed.restore(JSON.parse(JSON.stringify(cp)));
  assert.equal(resumed.tick, 2);
  resumed.enqueue(set("p2", "head", { y: 0.3 }, 3)); resumed.enqueue(checkpoint("c2", 4)); resumed.step(3);
  assert.equal(resumed.snapshot("end").hash, full.snapshot("end").hash);
  assert.equal(resumed.exportRun().checkpoints[0].hash, full.exportRun().checkpoints[1].hash);
  const tampered = JSON.parse(JSON.stringify(cp)); tampered.pose.joints.spine.x = 0.25;
  assert.throws(() => new BodyRuntime().restore(tampered), /hash/);
});
test("NFR-05: records from another version, component or regression are refused instead of migrated", () => {
  const record = scripted("ab").exportRun();
  const other = JSON.parse(JSON.stringify(record)); other.version = "0.0.9";
  assert.throws(() => BodyRuntime.replay(other), /no silent migration/);
  const component = JSON.parse(JSON.stringify(record)); component.manifest.versions.anatomy = "9.9.9";
  assert.throws(() => BodyRuntime.replay(component), /anatomy/);
  const regression = JSON.parse(JSON.stringify(record)); regression.manifest.regressionHash = "0";
  assert.throws(() => BodyRuntime.replay(regression), /regression/);
  const edited = JSON.parse(JSON.stringify(record)); edited.checkpoints[0].hash = "deadbeef00000000";
  assert.throws(() => BodyRuntime.replay(edited), /does not reproduce/);
});
test("unsupported fidelity and missing body are rejected with the documented reasons", () => {
  const rt = new BodyRuntime({ fidelity: { morph: 0, motion: 0, physio: 0, response: 0 } });
  rt.enqueue(create()); rt.enqueue(set("p", "spine", { x: 0.1 }, 0)); rt.step();
  const reasons = (rt.query({ domain: "query", name: "events" }) as { payload: { reason: string } }[]).map(e => e.payload.reason);
  assert.deepEqual(reasons, ["unsupported_fidelity", "invalid_params"]);
});
