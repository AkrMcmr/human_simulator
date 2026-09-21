import test from "node:test";
import assert from "node:assert/strict";
import { createHuman } from "../../packages/human/src/index.ts";
import { applyWithIntake } from "../../packages/human/src/forager-listener.ts";
import { decideValenceOnsetFast, decideValenceAlarm, decideValenceOnset, ALARM, DISGUST_FAST, DISGUST } from "../../packages/human/src/valence.ts";
import { protocol as valence } from "../../research/studies/valence-v1.ts";
import { protocol as valence2 } from "../../research/studies/valence-v2.ts";
import { protocol as valence3 } from "../../research/studies/valence-v3.ts";
import { protocol as valence4 } from "../../research/studies/valence-v4.ts";
import { protocol as valence5 } from "../../research/studies/valence-v5.ts";
import { protocol as valence6 } from "../../research/studies/valence-v6.ts";
import { seedsFor, assessPaired, referentialConfig, type SeedResult } from "../../research/studies/referential-v1.ts";
import { HUMAN_MODELS, runExperiment } from "../../packages/simulation/src/index.ts";

type V = ReturnType<typeof createHuman> & { lastIntake?: number; lastPoison?: number; lastDisgust?: number; lastDisgustCall?: number; aversions?: { x: number; y: number; tick: number; firsthand?: boolean }[] };
const effect = (foodIntake: number, poison = 0) => ({ ambientCold: .3, foodIntake, exertion: 0, resting: false, collision: 0, ...(poison ? { poison } : {}) });
const patch = { id: "f", kind: "food" as const, strength: 1, relativePosition: { x: 1, y: 0 } };
const at = (tick: number, resources = [patch], sounds: { visibleSourceId: null; shape: { openness: number; resonance: number }; loudness: number; relativePosition: { x: number; y: number } }[] = []) => ({ tick, selfPosition: { x: 10, y: 14 }, animals: [], resources, sounds });
const urge = (r: ReturnType<typeof decideValenceOnset>) => r.trace.scores.find(s => s.action === "vocalize")!.terms.callUrge;

test("the fast caller has a 10-tick refractory period while the restrained one keeps 50; the alarm ceiling calls the fixed alarm sound when poisoned and avoids the source of any alarm-like sound", () => {
  assert.equal(DISGUST_FAST.refractory, 10); assert.equal(DISGUST.refractory, 50);
  const poisoned = applyWithIntake(createHuman("A", {}, { hunger: .6, fatigue: 0, cold: 0 }), effect(.04, .04)) as V;
  const calm = { ...(decideValenceOnsetFast(poisoned, at(10), () => 0.5).human as V), lastPoison: 0, lastIntake: 0, lastDisgustCall: 30 } as V;
  assert.equal(urge(decideValenceOnsetFast(calm, at(35), () => 0.5)), undefined, "inside the fast refractory period");
  assert.ok(urge(decideValenceOnsetFast(calm, at(40), () => 0.5))! > 0, "after 10 ticks the fast caller may call again");
  assert.equal(urge(decideValenceOnset(calm, at(40), () => 0.5)), undefined, "the restrained caller still waits");
  let alarmSeen = false;
  for (let k = 0; k < 40 && !alarmSeen; k++) {
    const alarmed = decideValenceAlarm(poisoned, at(10), () => k / 40);
    if (alarmed.action.kind === "vocalize" && alarmed.action.sound) { alarmSeen = true; assert.ok(Math.hypot(alarmed.action.sound.openness - ALARM.shape.openness, alarmed.action.sound.resonance - ALARM.shape.resonance) < ALARM.radius, "poisoned: the innate alarm (state coupling only nudges it)"); }
  }
  assert.ok(alarmSeen, "the poisoned ceiling individual vocalizes for some random draw");
  const listener = createHuman("A", {}, { hunger: .6, fatigue: 0, cold: 0 }) as V;
  const alarm = { visibleSourceId: null, shape: { ...ALARM.shape }, loudness: .8, relativePosition: { x: 2, y: 0 } };
  const heard = decideValenceAlarm(listener, at(5, [patch], [alarm]), () => 0.5);
  assert.notEqual(heard.action.kind, "forage", "the ceiling listener avoids food at the alarm's source without any learning");
  assert.equal(decideValenceOnsetFast(listener, at(5, [patch], [alarm]), () => 0.5).action.kind, "forage", "the learning candidate has no bad category yet and eats");
});
test("paired checks compare two models on the same seeds and condition, and valence-v6 is registered on fresh seeds", () => {
  const mk = (seed: number, late: number) => ({ seed, model: "m", sound: { latePoisonings: late, poisonings: late + 1 }, muted: {}, misdirected: {}, scrambled: {} }) as unknown as SeedResult;
  const partitions = [
    { model: "valence-onset-fast-0.12.0-experimental.5", results: [mk(1, 2), mk(2, 1)] },
    { model: "valence-onset-fast-private-0.12.0-experimental.5", results: [mk(2, 3), mk(1, 3)] },
  ];
  const paired = assessPaired(valence6, partitions);
  assert.deepEqual(paired.map(p => [p.id, p.status]), [["comprehension-benefit", "pass"], ["comprehension-benefit-all", "reported"], ["ceiling-gap", "skipped"]]);
  assert.deepEqual(paired[0].values, [1, 2], "reference minus candidate, matched by seed");
  assert.equal(paired[1].values.length, 2);
  assert.equal(assessPaired(valence5, partitions).length, 0, "protocols without paired specs have none");
  assert.equal(HUMAN_MODELS["valence-alarm-ceiling-0.12.0-experimental.5"].role, "control");
  assert.equal(HUMAN_MODELS["valence-onset-fast-0.12.0-experimental.5"].role, "candidate");
  assert.deepEqual(valence6.world, valence5.world); assert.deepEqual(valence6.checks, valence5.checks);
  const used = [valence, valence2, valence3, valence4, valence5].flatMap(p => [p.pilotSeeds, seedsFor("development", p, "1"), seedsFor("validation", p, "1")].flat());
  const v6 = [...seedsFor("development", valence6, "1"), ...seedsFor("validation", valence6, "1")];
  assert.equal(new Set([...used, ...v6]).size, used.length + v6.length);
  const run = runExperiment({ ...referentialConfig(v6[0], "valence-alarm-ceiling-0.12.0-experimental.5", true, valence6), horizon: 150 });
  assert.equal(run.frames.length, 151);
});
