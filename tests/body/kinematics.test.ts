import test from "node:test";
import assert from "node:assert/strict";
import type { BodySpec, Vec3 } from "../../packages/body-contracts/src/index.ts";
import { buildSkeleton, skeletonSummary } from "../../packages/body-morph/src/index.ts";
import { forwardKinematics, applyLimits, restPose, tipPosition, namedPose } from "../../packages/body-kinematics/src/index.ts";

const spec: BodySpec = { sex: "male", ageYears: 30, statureM: 1.75, massKg: 80, seed: 1 };
const near = (a: Vec3, b: Vec3, tol = 1e-9) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < tol, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

test("FR-KIN-02: forward kinematics in the rest pose reproduces the summed offsets", () => {
  const sk = buildSkeleton(spec);
  const world = forwardKinematics(sk, restPose());
  const rest = skeletonSummary(sk).restPositions;
  for (const b of sk.bones) near(world.get(b.id)!.position, rest.get(b.id)!);
  const foot = sk.bones.find(b => b.id === "leftFoot")!;
  assert.ok(Math.abs(tipPosition(foot, world.get("leftFoot")!).y) < 1e-9, "the foot tip rests on the ground");
  const hand = sk.bones.find(b => b.id === "leftIndexDistal")!;
  assert.ok(tipPosition(hand, world.get("leftIndexDistal")!).z > world.get("leftHand")!.position.z + 0.03, "fingers point forward in the neutral pose, as on the reference body");
});
test("FR-KIN-02: a known hip flexion moves the knee forward by the thigh length (analytic check)", () => {
  const sk = buildSkeleton(spec);
  const thigh = sk.bones.find(b => b.id === "leftUpperLeg")!;
  const L = -thigh.tip.y;
  const world = forwardKinematics(sk, { ...restPose(), joints: { leftUpperLeg: { x: -Math.PI / 2 } } });
  const hip = world.get("leftUpperLeg")!.position, knee = world.get("leftLowerLeg")!.position;
  near(knee, { x: hip.x, y: hip.y, z: hip.z + L }, 1e-9);
  const t = forwardKinematics(sk, namedPose(sk, "t"));
  const elbowL = t.get("leftLowerArm")!.position, shoulderL = t.get("leftUpperArm")!.position;
  assert.ok(elbowL.x > shoulderL.x + 0.2 && Math.abs(elbowL.y - shoulderL.y) < 1e-9, "T-pose raises the left arm to the +X side");
  const elbowR = t.get("rightLowerArm")!.position, shoulderR = t.get("rightUpperArm")!.position;
  assert.ok(elbowR.x < shoulderR.x - 0.2, "and the right arm to the -X side");
});
test("FR-KIN-01: limits clamp or reject, and unknown bones or axes are invalid", () => {
  const sk = buildSkeleton(spec);
  const clamped = applyLimits(sk, { leftLowerLeg: { x: 3 } }, "clamp");
  assert.equal(clamped.clamped.length, 1); assert.ok(clamped.joints.leftLowerLeg.x! < 3 && clamped.violations.length === 0);
  const rejected = applyLimits(sk, { leftLowerLeg: { x: 3 } }, "reject");
  assert.equal(rejected.violations.length, 1);
  assert.equal(applyLimits(sk, { leftLowerLeg: { y: 0.1 } }, "clamp").invalid[0].reason, "axis is not a degree of freedom of this joint");
  assert.equal(applyLimits(sk, { nose: { x: 0.1 } }, "clamp").invalid[0].reason, "unknown bone");
  assert.equal(applyLimits(sk, { leftLowerLeg: { x: -0.1 } }, "clamp").clamped[0].applied, 0, "the knee does not hyperextend");
});
