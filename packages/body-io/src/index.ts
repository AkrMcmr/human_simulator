/**
 * Canonical file formats (validated, size-limited) and glTF 2.0 binary export.
 * Untrusted input is schema-checked and bounded before anything is built from it (NFR-06).
 */
import { type BodySpec, type Pose, type Skeleton, validateSpec } from "../../body-contracts/src/index.ts";
import { MORPH_VERSION } from "../../body-morph/src/index.ts";
import { jointRotation } from "../../body-kinematics/src/index.ts";
import { type SurfaceMesh, inverseBindMatrices } from "../../body-surface/src/index.ts";
import { BodyRuntime, RUN_FORMAT, RUNTIME_VERSION, type RunRecord } from "../../body-runtime/src/index.ts";

export const IO_VERSION = "0.1.0";
export const LIMITS = { fileBytes: 16 * 1024 * 1024, bones: 512, commands: 1_000_000, events: 2_000_000, checkpoints: 100_000, vertices: 2_000_000 } as const;
export const FORMATS = { spec: "human-body/spec", skeleton: "human-body/skeleton", pose: "human-body/pose", run: RUN_FORMAT } as const;

function parse(text: string | object, format: string): Record<string, unknown> {
  if (typeof text === "string" && text.length > LIMITS.fileBytes) throw new Error("File exceeds the size limit");
  const obj = typeof text === "string" ? JSON.parse(text) : text;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("Expected a JSON object");
  if ((obj as Record<string, unknown>).format !== format) throw new Error(`Expected format ${format}, got ${String((obj as Record<string, unknown>).format)}`);
  return obj as Record<string, unknown>;
}

export function writeSpecFile(spec: BodySpec) { return JSON.stringify({ format: FORMATS.spec, version: "0.1.0", spec }, null, 2) + "\n"; }
export function readSpecFile(text: string | object): BodySpec {
  const obj = parse(text, FORMATS.spec);
  if (obj.version !== "0.1.0") throw new Error("Unsupported spec version " + String(obj.version));
  return validateSpec(obj.spec);
}

export function writeSkeletonFile(skeleton: Skeleton) { return JSON.stringify({ format: FORMATS.skeleton, version: MORPH_VERSION, skeleton }, null, 2) + "\n"; }
export function readSkeletonFile(text: string | object): Skeleton {
  const obj = parse(text, FORMATS.skeleton);
  if (obj.version !== MORPH_VERSION) throw new Error("Unsupported skeleton version " + String(obj.version));
  const s = obj.skeleton as Skeleton;
  if (!s || !Array.isArray(s.bones)) throw new Error("skeleton.bones must be an array");
  if (s.bones.length > LIMITS.bones) throw new Error("Too many bones");
  const seen = new Set<string>();
  for (const b of s.bones) {
    if (typeof b.id !== "string" || seen.has(b.id)) throw new Error("Bone ids must be unique strings");
    if (b.parent !== null && !seen.has(b.parent)) throw new Error("Parent must precede child: " + b.id);
    for (const v of [b.offset, b.tip]) for (const k of ["x", "y", "z"] as const) if (typeof v?.[k] !== "number" || !Number.isFinite(v[k])) throw new Error("Bone vectors must be finite");
    if (!Array.isArray(b.joint?.dofs)) throw new Error("Bone joint.dofs must be an array");
    seen.add(b.id);
  }
  return s;
}

export function writePoseFile(pose: Pose, tick: number) { return JSON.stringify({ format: FORMATS.pose, version: "0.1.0", tick, pose }, null, 2) + "\n"; }
export function readPoseFile(text: string | object): { tick: number; pose: Pose } {
  const obj = parse(text, FORMATS.pose);
  const pose = obj.pose as Pose;
  if (!pose?.root || !pose.joints || typeof pose.joints !== "object") throw new Error("pose must have root and joints");
  return { tick: Number(obj.tick ?? 0), pose };
}

export function writeRunFile(record: RunRecord) { return JSON.stringify(record) + "\n"; }
/** Validate the structure and bounds of a run record, then replay it. Returns the replayed runtime. */
export function readRunFile(text: string | object): { record: RunRecord; runtime: BodyRuntime } {
  const obj = parse(text, FORMATS.run) as unknown as RunRecord;
  if (obj.version !== RUNTIME_VERSION) throw new Error(`Run version ${obj.version} is not ${RUNTIME_VERSION}`);
  if (!Array.isArray(obj.commands) || obj.commands.length > LIMITS.commands) throw new Error("commands missing or too many");
  if (!Array.isArray(obj.events) || obj.events.length > LIMITS.events) throw new Error("events missing or too many");
  if (!Array.isArray(obj.checkpoints) || obj.checkpoints.length > LIMITS.checkpoints) throw new Error("checkpoints missing or too many");
  if (!obj.manifest || !Number.isInteger(obj.manifest.finalTick) || obj.manifest.finalTick < 0 || obj.manifest.finalTick > 10_000_000) throw new Error("manifest.finalTick invalid");
  return { record: obj, runtime: BodyRuntime.replay(obj) };
}

// ---------------------------------------------------------------- glTF 2.0 (GLB)

const GLTF_COMPONENT = { FLOAT: 5126, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125 } as const;
const pad4 = (n: number) => (n + 3) & ~3;

type Accessor = { bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] };

/** Build a binary glTF with the skeleton as nodes and the surface as a skinned mesh. `pose` (if given) is written as node rotations; the bind pose is the rest pose. */
export function exportGlb(skeleton: Skeleton, surface: SurfaceMesh, pose?: Pose, extras: Record<string, unknown> = {}): Uint8Array {
  if (surface.vertexCount > LIMITS.vertices) throw new Error("Too many vertices");
  if (surface.boneOrder.length !== skeleton.bones.length) throw new Error("Surface and skeleton disagree on bones");
  const ibm = inverseBindMatrices(skeleton, surface.bindPose);
  const posed = pose ?? surface.bindPose;
  const chunks: Uint8Array[] = []; const bufferViews: { buffer: 0; byteOffset: number; byteLength: number; target?: number }[] = []; const accessors: Accessor[] = [];
  let offset = 0;
  const push = (data: Float32Array | Uint16Array | Uint32Array, componentType: number, type: string, count: number, target?: number, minmax?: boolean) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const view = { buffer: 0 as const, byteOffset: offset, byteLength: bytes.byteLength, ...(target ? { target } : {}) };
    bufferViews.push(view);
    chunks.push(bytes); offset += pad4(bytes.byteLength);
    const acc: Accessor = { bufferView: bufferViews.length - 1, componentType, count, type };
    if (minmax) {
      const n = type === "VEC3" ? 3 : type === "VEC4" ? 4 : 1; const min = Array(n).fill(Infinity), max = Array(n).fill(-Infinity);
      for (let i = 0; i < count; i++) for (let k = 0; k < n; k++) { const v = (data as Float32Array)[i * n + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
      acc.min = min; acc.max = max;
    }
    accessors.push(acc); return accessors.length - 1;
  };
  const vc = surface.vertexCount;
  const aPos = push(surface.positions, GLTF_COMPONENT.FLOAT, "VEC3", vc, 34962, true);
  const aNrm = push(surface.normals, GLTF_COMPONENT.FLOAT, "VEC3", vc, 34962);
  const aJnt = push(surface.joints, GLTF_COMPONENT.UNSIGNED_SHORT, "VEC4", vc, 34962);
  const aWgt = push(surface.weights, GLTF_COMPONENT.FLOAT, "VEC4", vc, 34962);
  const aIdx = push(surface.indices, GLTF_COMPONENT.UNSIGNED_INT, "SCALAR", surface.indices.length, 34963);
  const aIbm = push(ibm, GLTF_COMPONENT.FLOAT, "MAT4", skeleton.bones.length);

  
  const index = new Map(skeleton.bones.map((b, i) => [b.id, i]));
  const nodes: Record<string, unknown>[] = skeleton.bones.map(b => {
    const children = skeleton.bones.filter(c => c.parent === b.id).map(c => index.get(c.id)!);
    const q = posed ? jointRotation(posed.joints[b.id]) : null;
    const node: Record<string, unknown> = { name: b.id, translation: [b.offset.x, b.offset.y, b.offset.z], extras: { core: b.core, jointType: b.joint.type } };
    if (q && (q.x || q.y || q.z)) node.rotation = [q.x, q.y, q.z, q.w];
    if (children.length) node.children = children;
    return node;
  });
  const meshNode = nodes.length;
  nodes.push({ name: "surface", mesh: 0, skin: 0 });
  const gltf = {
    asset: { version: "2.0", generator: `human-body io ${IO_VERSION}`, extras: { ...extras, surface: surface.kind, skeletonVersion: skeleton.version, anatomyVersion: skeleton.anatomyVersion, statureM: skeleton.statureM, massKg: skeleton.massKg } },
    scene: 0, scenes: [{ nodes: [0, meshNode] }], nodes,
    meshes: [{ name: surface.kind, primitives: [{ attributes: { POSITION: aPos, NORMAL: aNrm, JOINTS_0: aJnt, WEIGHTS_0: aWgt }, indices: aIdx, mode: 4 }] }],
    skins: [{ name: "body", skeleton: 0, joints: skeleton.bones.map((_, i) => i), inverseBindMatrices: aIbm }],
    accessors, bufferViews, buffers: [{ byteLength: offset }],
  };
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLen = pad4(json.byteLength), binLen = offset;
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new Uint8Array(total); const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4e4f534a, true); out.set(json, 20); for (let i = 20 + json.byteLength; i < 20 + jsonLen; i++) out[i] = 0x20;
  const binStart = 20 + jsonLen; dv.setUint32(binStart, binLen, true); dv.setUint32(binStart + 4, 0x004e4942, true);
  let cursor = binStart + 8;
  for (const c of chunks) { out.set(c, cursor); cursor += pad4(c.byteLength); }
  return out;
}

/** Minimal structural check of a GLB produced here (magic, chunk alignment, JSON parse). */
export function inspectGlb(glb: Uint8Array): { json: Record<string, unknown>; binaryLength: number } {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) throw new Error("Not a GLB v2");
  if (dv.getUint32(8, true) !== glb.byteLength) throw new Error("GLB length mismatch");
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a || jsonLen % 4) throw new Error("Bad JSON chunk");
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)));
  const binLen = dv.getUint32(20 + jsonLen, true);
  if (dv.getUint32(24 + jsonLen, true) !== 0x004e4942 || binLen % 4) throw new Error("Bad BIN chunk");
  return { json, binaryLength: binLen };
}
