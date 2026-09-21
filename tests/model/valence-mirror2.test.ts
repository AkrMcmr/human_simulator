import test from "node:test";
import assert from "node:assert/strict";
import { createHuman } from "../../packages/human/src/index.ts";
import { applyWithIntake } from "../../packages/human/src/forager-listener.ts";
import { decideValenceMirror2, decideValenceMirror } from "../../packages/human/src/valence.ts";
import { SEPARATION } from "../../packages/human/src/lexicon.ts";
import { protocol as valence } from "../../research/studies/valence-v1.ts";
import { protocol as valence2 } from "../../research/studies/valence-v2.ts";
import { protocol as valence3 } from "../../research/studies/valence-v3.ts";
import { protocol as valence4 } from "../../research/studies/valence-v4.ts";
import { protocol as valence5 } from "../../research/studies/valence-v5.ts";
import { protocol as valence6 } from "../../research/studies/valence-v6.ts";
import { protocol as valence7 } from "../../research/studies/valence-v7.ts";
import { protocol as valence8 } from "../../research/studies/valence-v8.ts";
import { seedsFor, runCondition } from "../../research/studies/referential-v1.ts";
import { HUMAN_MODELS } from "../../packages/simulation/src/index.ts";

type V = ReturnType<typeof createHuman> & { lastIntake?: number; lastPoison?: number; ownVoices?: { good?: { openness: number; resonance: number }; bad?: { openness: number; resonance: number } } };
const effect = (foodIntake: number, poison = 0) => ({ ambientCold: .3, foodIntake, exertion: 0, resting: false, collision: 0, ...(poison ? { poison } : {}) });
const at = (tick: number) => ({ tick, selfPosition: { x: 10, y: 14 }, animals: [], resources: [], sounds: [] });
const dist = (a: { openness: number; resonance: number }, b: { openness: number; resonance: number }) => Math.hypot(a.openness - b.openness, a.resonance - b.resonance);

test("the corrected mirror records the chosen shape, not the coupled output, so a reused own voice does not drift; the bad voice is kept apart from the good one", () => {
  // Hungry and eating well: state coupling pulls resonance toward bodily need, so the expressed sound differs from the remembered voice.
  const fed = applyWithIntake(createHuman("A", {}, { hunger: .9, fatigue: 0, cold: 0 }), effect(.04)) as V;
  fed.ownVoices = { good: { openness: .2, resonance: .1 }, bad: { openness: .8, resonance: .8 } };
  let v6: V | null = null, v7: V | null = null;
  for (let k = 0; k < 80 && !(v6 && v7); k++) {
    const r7 = decideValenceMirror2(fed, at(10), () => k / 80); if (!v7 && r7.action.kind === "vocalize") v7 = r7.human as V;
    const r6 = decideValenceMirror(fed, at(10), () => k / 80); if (!v6 && r6.action.kind === "vocalize") v6 = r6.human as V;
  }
  assert.ok(v6 && v7, "both vocalize for some draw");
  assert.deepEqual(v7!.ownVoices!.good, { openness: .2, resonance: .1 }, "experimental.7 keeps the remembered good voice exactly");
  assert.ok(dist(v6!.ownVoices!.good!, { openness: .2, resonance: .1 }) > 0.02, "experimental.6 recorded the coupled output and drifted");
  // A remembered bad voice too close to the good voice is pushed to the minimum gap when reused.
  const poisoned = applyWithIntake(createHuman("B", {}, { hunger: .6, fatigue: 0, cold: 0 }), effect(.04, .04)) as V;
  poisoned.ownVoices = { good: { openness: .5, resonance: .5 }, bad: { openness: .55, resonance: .5 } };
  let after: V | null = null;
  for (let k = 0; k < 80 && !after; k++) { const r = decideValenceMirror2(poisoned, at(10), () => k / 80); if (r.action.kind === "vocalize") after = r.human as V; }
  assert.ok(after, "vocalizes for some draw");
  assert.ok(Math.abs(dist(after!.ownVoices!.bad!, after!.ownVoices!.good!) - SEPARATION.minimumGap) < 1e-9, "the reused bad voice sits at the minimum gap from the good voice");
});
test("in the muted condition the corrected mirror's voices stay individual (pooled dispersion above 0.12), unlike experimental.6 whose voices collapsed onto the coupling target", () => {
  const seed = seedsFor("development", valence8, "1")[0];
  const short = { ...valence8, horizon: 1200 } as typeof valence8;
  const m7 = runCondition("valence-mirror-private-0.12.0-experimental.7", seed, "muted", short);
  const m6 = runCondition("valence-mirror-private-0.12.0-experimental.6", seed, "muted", short);
  assert.ok(m7.foodVoiceDispersion > 0.12, `experimental.7 muted good-voice dispersion ${m7.foodVoiceDispersion.toFixed(3)} stays individual`);
  assert.ok(m6.foodVoiceDispersion < m7.foodVoiceDispersion, "experimental.6 is more collapsed");
});
test("valence-v8 reuses the valence-v7 world on fresh seeds and registers the corrected models", () => {
  assert.equal(HUMAN_MODELS["valence-mirror-0.12.0-experimental.7"].role, "candidate");
  assert.equal(HUMAN_MODELS["valence-mirror-private-0.12.0-experimental.7"].role, "control");
  assert.deepEqual(valence8.world, valence7.world); assert.deepEqual(valence8.resources, valence7.resources); assert.deepEqual(valence8.checks, valence7.checks);
  const used = [valence, valence2, valence3, valence4, valence5, valence6, valence7].flatMap(p => [p.pilotSeeds, seedsFor("development", p, "1"), seedsFor("validation", p, "1")].flat());
  const v8 = [...seedsFor("development", valence8, "1"), ...seedsFor("validation", valence8, "1")];
  assert.equal(new Set([...used, ...v8]).size, used.length + v8.length);
});
