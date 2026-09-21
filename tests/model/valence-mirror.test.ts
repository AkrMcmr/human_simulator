import test from "node:test";
import assert from "node:assert/strict";
import { createHuman } from "../../packages/human/src/index.ts";
import { applyWithIntake } from "../../packages/human/src/forager-listener.ts";
import { decideValenceMirror, decideValenceMirrorPrivate, decideValenceOnsetFast, MIRROR } from "../../packages/human/src/valence.ts";
import { protocol as valence } from "../../research/studies/valence-v1.ts";
import { protocol as valence2 } from "../../research/studies/valence-v2.ts";
import { protocol as valence3 } from "../../research/studies/valence-v3.ts";
import { protocol as valence4 } from "../../research/studies/valence-v4.ts";
import { protocol as valence5 } from "../../research/studies/valence-v5.ts";
import { protocol as valence6 } from "../../research/studies/valence-v6.ts";
import { protocol as valence7 } from "../../research/studies/valence-v7.ts";
import { seedsFor, referentialConfig, runCondition } from "../../research/studies/referential-v1.ts";
import { HUMAN_MODELS, runExperiment } from "../../packages/simulation/src/index.ts";

type V = ReturnType<typeof createHuman> & { lastIntake?: number; lastPoison?: number; lastDisgust?: number; ownVoices?: { good?: { openness: number; resonance: number }; bad?: { openness: number; resonance: number } }; aversions?: { x: number; y: number; tick: number }[] };
const effect = (foodIntake: number, poison = 0) => ({ ambientCold: .3, foodIntake, exertion: 0, resting: false, collision: 0, ...(poison ? { poison } : {}) });
const patch = { id: "f", kind: "food" as const, strength: 1, relativePosition: { x: 1, y: 0 } };
const at = (tick: number, resources = [patch], sounds: { visibleSourceId: null; shape: { openness: number; resonance: number }; loudness: number; relativePosition: { x: number; y: number } }[] = []) => ({ tick, selfPosition: { x: 10, y: 14 }, animals: [], resources, sounds });

test("the mirror candidate remembers the sound it produced in each valence context and understands a heard sound near its own bad voice as a warning", () => {
  const h = createHuman("A", {}, { hunger: .6, fatigue: 0, cold: 0 }) as V;
  h.ownVoices = { good: { openness: .2, resonance: .3 }, bad: { openness: .7, resonance: .6 } };
  const nearBad = { visibleSourceId: null, shape: { openness: .72, resonance: .58 }, loudness: .8, relativePosition: { x: 2, y: 0 } };
  const nearGood = { visibleSourceId: null, shape: { openness: .22, resonance: .28 }, loudness: .8, relativePosition: { x: 2, y: 0 } };
  const warned = decideValenceMirror(h, at(5, [patch], [nearBad]), () => 0.5);
  assert.notEqual(warned.action.kind, "forage", "a sound like my own bad voice keeps me off the food at its source");
  assert.deepEqual((warned.human as V).aversions!.map(a => [a.x, a.y]), [[12, 14]]);
  assert.equal(decideValenceMirror(h, at(5, [patch], [nearGood]), () => 0.5).action.kind, "forage", "a sound like my own good voice is no warning");
  assert.equal(decideValenceMirrorPrivate(h, at(5, [patch], [nearBad]), () => 0.5).action.kind, "forage", "the deaf control ignores it");
  assert.equal(decideValenceOnsetFast(h, at(5, [patch], [nearBad]), () => 0.5).action.kind, "forage", "experimental.5 has no own-voice memory and needs an imitation target");
  const far = { ...nearBad, shape: { openness: .7 + MIRROR.radius + .05, resonance: .6 } };
  assert.equal(decideValenceMirror(h, at(5, [patch], [far]), () => 0.5).action.kind, "forage", "outside the radius: no warning");
  // Producing in a context records the own voice; with no imitation target the own voice is reused.
  const poisoned = applyWithIntake(createHuman("B", {}, { hunger: .6, fatigue: 0, cold: 0 }), effect(.04, .04)) as V;
  poisoned.ownVoices = { bad: { openness: .8, resonance: .2 } };
  let recorded: V | null = null;
  for (let k = 0; k < 60 && !recorded; k++) { const r = decideValenceMirror(poisoned, at(10, []), () => (k % 60) / 60); if (r.action.kind === "vocalize" && r.action.sound) recorded = r.human as V; }
  assert.ok(recorded, "the poisoned individual vocalizes for some draw");
  assert.ok(Math.hypot(recorded!.ownVoices!.bad!.openness - .8, recorded!.ownVoices!.bad!.resonance - .2) < 0.2, "with no imitation target the own bad voice is reproduced (state coupling and motor noise only nudge it) and re-recorded");
});
test("valence-v7 differs from v6 in food amount only, uses fresh seeds, registers the mirror models, and reports the desperate fraction", () => {
  assert.equal(HUMAN_MODELS["valence-mirror-0.12.0-experimental.6"].role, "candidate");
  assert.equal(HUMAN_MODELS["valence-mirror-private-0.12.0-experimental.6"].role, "control");
  const w7 = valence7.world as { foodSpawn?: { amount: number } };
  assert.deepEqual({ ...w7, foodSpawn: { ...w7.foodSpawn!, amount: 4 } }, valence6.world);
  assert.ok(valence7.resources.filter(r => r.kind === "food").every(r => r.amount === 6));
  assert.deepEqual(valence7.checks, valence6.checks);
  const used = [valence, valence2, valence3, valence4, valence5, valence6].flatMap(p => [p.pilotSeeds, seedsFor("development", p, "1"), seedsFor("validation", p, "1")].flat());
  const v7 = [valence7.pilotSeeds, seedsFor("development", valence7, "1"), seedsFor("validation", valence7, "1")].flat();
  assert.equal(new Set([...used, ...v7]).size, used.length + v7.length);
  const run = runCondition("valence-mirror-0.12.0-experimental.6", v7[0], "sound", { ...valence7, horizon: 400 } as typeof valence7);
  assert.ok(run.desperateFraction >= 0 && run.desperateFraction <= 1);
  const starving = runCondition("human-0.2.0", 1, "muted", { ...valence7, horizon: 200, agents: { A: { x: 2, y: 2 } }, body: { hunger: .97, fatigue: 0, cold: 0 }, resources: valence7.resources.filter(r => r.kind !== "food") } as typeof valence7);
  assert.ok(starving.desperateFraction > 0.5, "a lone individual starting at hunger 0.97 in a world without food is desperate most of the time");
  const short = runExperiment({ ...referentialConfig(v7[0], "valence-mirror-private-0.12.0-experimental.6", true, valence7), horizon: 100 });
  assert.equal(short.frames.length, 101);
});
