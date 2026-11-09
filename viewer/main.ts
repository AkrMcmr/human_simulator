/**
 * Minimal three.js viewer. Runs the same BodyRuntime as the CLI in the browser: the sliders
 * send morph/pose commands, the runtime applies them at tick boundaries, and the displayed
 * bones follow the runtime's pose. Rendering never writes back into the runtime.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BodySpec, Skeleton } from "../packages/body-contracts/src/index.ts";
import { BodyRuntime, VERSIONS } from "../packages/body-runtime/src/index.ts";
import { jointRotation } from "../packages/body-kinematics/src/index.ts";
import { inverseBindMatrices, type SurfaceMesh } from "../packages/body-surface/src/index.ts";

const $ = <T>(id: string) => document.getElementById(id) as unknown as T;
const canvas = $<HTMLCanvasElement>("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202428);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
const view = new URLSearchParams(location.search).get("view") ?? "front"; // front | side | back | hands | head, for QA screenshots
const presets: Record<string, [number[], number[]]> = { front: [[0.8, 1.2, 3.2], [0, 0.95, 0]], side: [[3.0, 1.1, 0.4], [0, 0.95, 0]], back: [[-0.6, 1.2, -3.2], [0, 0.95, 0]], hands: [[0.95, 1.0, 1.1], [0.62, 0.9, 0.12]], head: [[0.5, 1.65, 1.0], [0, 1.6, 0.05]] };
const [eye, target] = presets[view] ?? presets.front;
camera.position.set(eye[0], eye[1], eye[2]);
const controls = new OrbitControls(camera, canvas);
controls.target.set(target[0], target[1], target[2]);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 4, 3); scene.add(sun);
scene.add(new THREE.GridHelper(4, 16, 0x556677, 0x334455));

const runtime = new BodyRuntime({ seed: 1 });
let commandCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++commandCounter}`;
let mesh: THREE.SkinnedMesh | null = null;
let bones: THREE.Bone[] = [];
let boneIndex = new Map<string, number>();

$<HTMLDivElement>("versions").textContent = Object.entries(VERSIONS).map(([k, v]) => `${k} ${v}`).join(" · ");

function log(line: string) { const el = $<HTMLDivElement>("log"); el.textContent = (line + "\n" + el.textContent).split("\n").slice(0, 40).join("\n"); }
function drain(sinceTick: number) {
  const events = runtime.query({ domain: "query", name: "events" }) as { tick: number; kind: string; commandId?: string; payload: Record<string, unknown> }[];
  for (const e of events.filter(e => e.tick >= sinceTick)) log(`t${e.tick} ${e.kind} ${e.commandId ?? ""} ${e.kind === "rejected" ? String(e.payload.reason) + ": " + String(e.payload.detail) : e.payload.clamped ? "clamped " + (e.payload.clampedAxes as string[]).join(",") : ""}`);
}

function readSpec(): BodySpec {
  const z = (id: string) => Number($<HTMLInputElement>(id).value);
  const proportions: BodySpec["proportions"] = {};
  if (z("legLength")) proportions.legLength = z("legLength");
  if (z("shoulderBreadth")) proportions.shoulderBreadth = z("shoulderBreadth");
  return { sex: $<HTMLSelectElement>("sex").value as BodySpec["sex"], ageYears: 30, statureM: z("stature"), massKg: z("mass"), seed: 1, ...(Object.keys(proportions).length ? { proportions } : {}) };
}
function buildThreeBody(skeleton: Skeleton, surface: SurfaceMesh) {
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
  bones = skeleton.bones.map(b => { const bone = new THREE.Bone(); bone.name = b.id; bone.position.set(b.offset.x, b.offset.y, b.offset.z); return bone; });
  boneIndex = new Map(skeleton.bones.map((b, i) => [b.id, i]));
  skeleton.bones.forEach((b, i) => { if (b.parent) bones[boneIndex.get(b.parent)!].add(bones[i]); });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(surface.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(surface.normals, 3));
  geometry.setAttribute("skinIndex", new THREE.BufferAttribute(surface.joints, 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(surface.weights, 4));
  geometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
  const material = new THREE.MeshStandardMaterial({ color: 0xd9b596, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
  mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(bones[0]);
  const ibm = inverseBindMatrices(skeleton, surface.bindPose);
  const inverses = skeleton.bones.map((_, i) => new THREE.Matrix4().fromArray(ibm, i * 16));
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  scene.add(mesh);
}
function applyPose() {
  const pose = runtime.query({ domain: "query", name: "pose" }) as { joints: Record<string, Record<string, number>> } | null;
  if (!pose || !mesh) return;
  for (const [id, i] of boneIndex) { const q = jointRotation(pose.joints[id]); bones[i].quaternion.set(q.x, q.y, q.z, q.w); }
}
function regenerate() {
  const spec = readSpec();
  const tick = runtime.tick;
  runtime.enqueue({ id: nextId("create"), domain: "morph", name: "create", params: { spec } });
  runtime.step();
  drain(tick);
  const skeleton = runtime.skeleton;
  if (!skeleton) return;
  const surface = runtime.query({ domain: "query", name: "surface", params: { kind: $<HTMLSelectElement>("surface").value } }) as SurfaceMesh;
  buildThreeBody(skeleton, surface);
  if (surface.bindPose) { runtime.enqueue({ id: nextId("bind"), domain: "pose", name: "setPose", params: { joints: surface.bindPose.joints } }); runtime.step(); }
  buildJointSliders(skeleton, surface);
  applyPose();
  if (surface.girths) log("girths: " + Object.entries(surface.girths).map(([k, v]) => `${k.replace("Circumference", "")} ${(v.measured * 100).toFixed(1)}/${(v.target * 100).toFixed(1)}cm`).join(", "));
}
const JOINT_SLIDERS: [string, "x" | "y" | "z", string][] = [
  ["leftUpperArm", "z", "左肩 外転"], ["leftUpperArm", "x", "左肩 屈曲"], ["leftLowerArm", "x", "左肘 屈曲"], ["rightUpperArm", "z", "右肩 外転"],
  ["leftUpperLeg", "x", "左股 屈曲"], ["leftLowerLeg", "x", "左膝 屈曲"], ["leftFoot", "x", "左足首"], ["spine", "x", "腰 屈曲"], ["chest", "y", "胸 回旋"], ["neck", "y", "首 回旋"], ["head", "x", "頭 屈曲"], ["jaw", "x", "顎"],
];
function buildJointSliders(skeleton: Skeleton, surface: SurfaceMesh) {
  const box = $<HTMLFieldSetElement>("joints");
  box.querySelectorAll("label").forEach(l => l.remove());
  const byId = new Map(skeleton.bones.map(b => [b.id, b]));
  for (const [bone, axis, label] of JOINT_SLIDERS) {
    const dof = byId.get(bone)?.joint.dofs.find(d => d.axis === axis);
    if (!dof) continue;
    const current = surface.bindPose?.joints[bone]?.[axis] ?? 0;
    const el = document.createElement("label");
    const deg = (r: number) => (r * 180 / Math.PI).toFixed(0) + "°";
    el.innerHTML = `${label} <span class="value">${deg(current)}</span><input type="range" min="${dof.min}" max="${dof.max}" step="0.01" value="${current}" />`;
    const input = el.querySelector("input")!, value = el.querySelector("span")!;
    input.addEventListener("input", () => {
      const tick = runtime.tick;
      runtime.enqueue({ id: nextId("joint"), domain: "pose", name: "setJoint", params: { bone, angles: { [axis]: Number(input.value) } } });
      runtime.step(); drain(tick); value.textContent = deg(Number(input.value)); applyPose();
    });
    box.appendChild(el);
  }
}
for (const id of ["stature", "mass", "legLength", "shoulderBreadth"]) {
  const input = $<HTMLInputElement>(id), show = () => { $<HTMLSpanElement>(id + "-v").textContent = input.value; };
  input.addEventListener("input", show); show();
}
$<HTMLButtonElement>("regenerate").addEventListener("click", regenerate);
// QA: ?sex=female&stature=1.62&mass=60 preselects a body
{ const q = new URLSearchParams(location.search); for (const [key, id] of [["sex", "sex"], ["stature", "stature"], ["mass", "mass"], ["legLength", "legLength"], ["shoulderBreadth", "shoulderBreadth"]] as const) { const v = q.get(key); if (v !== null) { const el = $<HTMLInputElement>(id); el.value = v; el.dispatchEvent(new Event("input")); } } }
function resize() { const w = canvas.clientWidth || 800, h = canvas.clientHeight || 600; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener("resize", resize);
resize();
regenerate();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
