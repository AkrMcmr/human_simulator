/**
 * Body track CLI (B1). Subcommands:
 *   generate --sex male|female --stature <m> --mass <kg> [--age 30] [--seed 1] [--leg-length z] ... --out spec.json
 *   info     --spec spec.json
 *   export   --spec spec.json --out body.glb [--pose rest|a|t]
 *   run      --spec spec.json --steps <n> --out run.json      (demo: A-pose at tick 1, checkpoint every 60 ticks)
 *   replay   --run run.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { BodySpec, ProportionKey } from "../packages/body-contracts/src/index.ts";
import { buildSkeleton, resolveLengths, skeletonSummary } from "../packages/body-morph/src/index.ts";
import { buildSurface } from "../packages/body-surface/src/index.ts";
import { namedPose } from "../packages/body-kinematics/src/index.ts";
import { BodyRuntime, VERSIONS } from "../packages/body-runtime/src/index.ts";
import { exportGlb, readRunFile, readSpecFile, writeRunFile, writeSpecFile } from "../packages/body-io/src/index.ts";

const [command, ...rest] = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith("--") || !rest[i + 1] || rest[i + 1].startsWith("--") || options.has(rest[i])) throw new Error("Unknown/duplicate option or missing value: " + rest[i]);
  options.set(rest[i], rest[++i]);
}
const need = (k: string) => { const v = options.get(k); if (v === undefined) throw new Error(`Missing ${k}`); return v; };
const num = (k: string, fallback?: number) => { const v = options.get(k); if (v === undefined) { if (fallback === undefined) throw new Error(`Missing ${k}`); return fallback; } const n = Number(v); if (!Number.isFinite(n)) throw new Error(`${k} must be a number`); return n; };
const write = (path: string, data: string | Uint8Array) => { const p = resolve(path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data); console.log("wrote", p); };
const loadSpec = () => readSpecFile(readFileSync(resolve(need("--spec")), "utf8"));

switch (command) {
  case "generate": {
    const proportions: Partial<Record<ProportionKey, number>> = {};
    const map: Record<string, ProportionKey> = { "--leg-length": "legLength", "--sitting-height": "sittingHeight", "--arm-length": "armLength", "--shoulder-breadth": "shoulderBreadth", "--hip-breadth": "hipBreadth" };
    for (const [flag, key] of Object.entries(map)) if (options.has(flag)) proportions[key] = num(flag);
    const spec: BodySpec = { sex: need("--sex") as BodySpec["sex"], ageYears: num("--age", 30), statureM: num("--stature"), massKg: num("--mass"), seed: num("--seed", 1), ...(Object.keys(proportions).length ? { proportions } : {}) };
    buildSkeleton(spec); // validates
    write(need("--out"), writeSpecFile(spec));
    break;
  }
  case "info": {
    const spec = loadSpec(); const sk = buildSkeleton(spec); const s = skeletonSummary(sk); const L = resolveLengths(spec);
    console.log(JSON.stringify({ versions: VERSIONS, spec, bones: sk.bones.length, generatedStatureM: s.generatedStatureM, totalMassKg: s.totalMassKg, comHeightFraction: s.comHeightFraction, lengthsM: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, Number(v.toFixed(4))])) }, null, 2));
    break;
  }
  case "export": {
    const spec = loadSpec(); const sk = buildSkeleton(spec); const pose = (options.get("--pose") ?? "a") as "rest" | "a" | "t";
    if (!["rest", "a", "t"].includes(pose)) throw new Error("--pose must be rest, a or t");
    write(need("--out"), exportGlb(sk, buildSurface(sk), namedPose(sk, pose), { pose, versions: VERSIONS }));
    break;
  }
  case "run": {
    const spec = loadSpec(); const steps = num("--steps", 120);
    const rt = new BodyRuntime({ seed: spec.seed });
    rt.enqueue({ id: "create", domain: "morph", name: "create", params: { spec } });
    const a = namedPose(buildSkeleton(spec), "a");
    rt.enqueue({ id: "a-pose", domain: "pose", name: "setPose", tick: 1, params: { joints: a.joints } });
    for (let t = 60; t <= steps; t += 60) rt.enqueue({ id: "cp" + t, domain: "runtime", name: "checkpoint", tick: t, params: { label: "t" + t } });
    rt.step(steps);
    write(need("--out"), writeRunFile(rt.exportRun()));
    console.log("events", JSON.stringify(rt.query({ domain: "query", name: "events" })));
    break;
  }
  case "replay": {
    const { record, runtime } = readRunFile(readFileSync(resolve(need("--run")), "utf8"));
    console.log(`replayed ${record.commands.length} commands to tick ${runtime.tick}; ${record.checkpoints.length} checkpoints reproduced`);
    break;
  }
  default:
    throw new Error("Usage: body <generate|info|export|run|replay> ...");
}
