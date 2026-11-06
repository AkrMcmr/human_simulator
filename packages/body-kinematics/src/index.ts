/**
 * Forward kinematics and joint limits. Knows nothing about dynamics or rendering.
 * Joint angles are intrinsic x, then y, then z rotations in the bone's local rest frame.
 */
import { type Axis, type Bone, type JointAngles, type Pose, type Quat, type Skeleton, type Vec3, type ViolationPolicy, IDENTITY_QUAT, add3, clamp, quatFromAxisAngle, quatMultiply, rotate3, vec3 } from "../../body-contracts/src/index.ts";

export const KINEMATICS_VERSION = "0.1.0";
export type Transform = { position: Vec3; rotation: Quat };
export type LimitResult = { joints: JointAngles; clamped: { bone: string; axis: Axis; requested: number; applied: number }[]; violations: { bone: string; axis: Axis; requested: number; min: number; max: number }[]; invalid: { bone: string; axis?: string; reason: string }[] };

export function restPose(): Pose { return { root: { position: vec3(), rotation: IDENTITY_QUAT }, joints: {} }; }

/** Validate angles against the skeleton's DOFs. With `clamp` the result is inside the limits; with `reject` violations are reported and the angles returned unchanged. */
export function applyLimits(skeleton: Skeleton, joints: JointAngles, policy: ViolationPolicy): LimitResult {
  const byId = new Map(skeleton.bones.map(b => [b.id, b]));
  const out: JointAngles = {};
  const result: LimitResult = { joints: out, clamped: [], violations: [], invalid: [] };
  for (const [boneId, angles] of Object.entries(joints)) {
    const bone = byId.get(boneId);
    if (!bone) { result.invalid.push({ bone: boneId, reason: "unknown bone" }); continue; }
    const applied: Partial<Record<Axis, number>> = {};
    for (const [axis, value] of Object.entries(angles) as [Axis, number][]) {
      const dof = bone.joint.dofs.find(d => d.axis === axis);
      if (!dof) { result.invalid.push({ bone: boneId, axis, reason: "axis is not a degree of freedom of this joint" }); continue; }
      if (typeof value !== "number" || !Number.isFinite(value)) { result.invalid.push({ bone: boneId, axis, reason: "angle must be a finite number" }); continue; }
      if (value < dof.min || value > dof.max) {
        if (policy === "clamp") { const c = clamp(value, dof.min, dof.max); result.clamped.push({ bone: boneId, axis, requested: value, applied: c }); applied[axis] = c; }
        else { result.violations.push({ bone: boneId, axis, requested: value, min: dof.min, max: dof.max }); applied[axis] = value; }
      } else applied[axis] = value;
    }
    out[boneId] = applied;
  }
  return result;
}

export function jointRotation(angles: Partial<Record<Axis, number>> | undefined): Quat {
  if (!angles) return IDENTITY_QUAT;
  let q = IDENTITY_QUAT;
  for (const axis of ["x", "y", "z"] as const) if (angles[axis]) q = quatMultiply(q, quatFromAxisAngle(axis, angles[axis]!));
  return q;
}

/** World transforms of every bone for a pose. Bones are visited in template order (parents first). */
export function forwardKinematics(skeleton: Skeleton, pose: Pose): Map<string, Transform> {
  const world = new Map<string, Transform>();
  for (const bone of skeleton.bones) {
    const local = jointRotation(pose.joints[bone.id]);
    const parent: Transform = bone.parent ? world.get(bone.parent)! : pose.root;
    if (bone.parent && !parent) throw new Error("Parent not yet visited: " + bone.parent);
    world.set(bone.id, { position: add3(parent.position, rotate3(parent.rotation, bone.offset)), rotation: quatMultiply(parent.rotation, local) });
  }
  return world;
}
export function tipPosition(bone: Bone, transform: Transform): Vec3 { return add3(transform.position, rotate3(transform.rotation, bone.tip)); }

/** Convenience: an A-pose (arms 45 degrees from the body) and a T-pose expressed as joint angles. */
export function namedPose(skeleton: Skeleton, name: "rest" | "a" | "t"): Pose {
  const pose = restPose();
  if (name === "rest") return pose;
  const abduction = name === "a" ? Math.PI / 4 : Math.PI / 2;
  pose.joints.leftUpperArm = { z: abduction };
  pose.joints.rightUpperArm = { z: -abduction };
  pose.joints = applyLimits(skeleton, pose.joints, "clamp").joints;
  return pose;
}
