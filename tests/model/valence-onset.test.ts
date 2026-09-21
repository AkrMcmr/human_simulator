import test from "node:test";
import assert from "node:assert/strict";
import { createHuman } from "../../packages/human/src/index.ts";
import { applyWithIntake } from "../../packages/human/src/forager-listener.ts";
import { decideValenceOnset, decideValenceOnsetPrivate, decideValenceDisgust, DISGUST } from "../../packages/human/src/valence.ts";
import { protocol as valence } from "../../research/studies/valence-v1.ts";
import { protocol as valence2 } from "../../research/studies/valence-v2.ts";
import { protocol as valence3 } from "../../research/studies/valence-v3.ts";
import { protocol as valence4 } from "../../research/studies/valence-v4.ts";
import { protocol as valence5 } from "../../research/studies/valence-v5.ts";
import { seedsFor, referentialConfig, runCondition, checkValue, type SeedResult } from "../../research/studies/referential-v1.ts";
import { HUMAN_MODELS, runExperiment } from "../../packages/simulation/src/index.ts";

type V = ReturnType<typeof createHuman> & { lastIntake?: number; lastPoison?: number; lastDisgust?: number; lastDisgustCall?: number; aversions?: { x: number; y: number; tick: number; firsthand?: boolean }[]; valenceHeard?: { good: Record<number, number>; bad: Record<number, number> } };
const effect = (foodIntake: number, poison = 0) => ({ ambientCold: .3, foodIntake, exertion: 0, resting: false, collision: 0, ...(poison ? { poison } : {}) });
const patch = { id: "f", kind: "food" as const, strength: 1, relativePosition: { x: 1, y: 0 } };
const at = (tick: number, resources = [patch], sounds: { visibleSourceId: null; shape: { openness: number; resonance: number }; loudness: number; relativePosition: { x: number; y: number } }[] = []) => ({ tick, selfPosition: { x: 10, y: 14 }, animals: [], resources, sounds });
const urge = (r: ReturnType<typeof decideValenceOnset>) => r.trace.scores.find(s => s.action === "vocalize")!.terms.callUrge;

test("the restrained caller urges a disgust call at most once per refractory period, and only from first-hand aversions", () => {
  const poisoned = applyWithIntake(createHuman("A", {}, { hunger: .6, fatigue: 0, cold: 0 }), effect(.04, .04)) as V;
  const calm = { ...(decideValenceOnset(poisoned, at(10), () => 0.5).human as V), lastPoison: 0, lastIntake: 0 } as V;
  assert.ok(calm.aversions!.every(a => a.firsthand === true), "own poisoning is first-hand");
  const first = decideValenceOnset(calm, at(30), () => 0.5);
  assert.equal((first.human as V).lastDisgust, 1); assert.ok(urge(first)! > 0, "the first sight urges a call");
  const called = { ...(first.human as V), lastDisgustCall: 30 } as V;
  const soon = decideValenceOnset(called, at(30 + DISGUST.refractory - 1), () => 0.5);
  assert.equal((soon.human as V).lastDisgust, 1, "still disgusted"); assert.equal(urge(soon), undefined, "but no urge inside the refractory period");
  assert.ok(urge(decideValenceOnset(called, at(30 + DISGUST.refractory), () => 0.5))! > 0, "the urge returns after the refractory period");
  const flood = decideValenceDisgust({ ...called, aversions: called.aversions!.map(a => ({ x: a.x, y: a.y, tick: a.tick })) } as V, at(31), () => 0.5);
  assert.ok(urge(flood)! > 0, "experimental.3 urges on every disgusted tick");
  // A heard warning is avoided but does not disgust or get re-broadcast.
  const h = createHuman("A", {}, { hunger: .6, fatigue: 0, cold: 0 }) as V;
  h.heardSounds = [{ id: 1, shape: { openness: .2, resonance: .3 }, samples: 5 }, { id: 2, shape: { openness: .7, resonance: .6 }, samples: 5 }];
  h.valenceHeard = { good: { 1: 6 }, bad: { 2: 5 } };
  const badSound = { visibleSourceId: null, shape: { openness: .7, resonance: .6 }, loudness: .8, relativePosition: { x: 2, y: 0 } };
  const warned = decideValenceOnset(h, at(5, [patch], [badSound]), () => 0.5);
  assert.notEqual(warned.action.kind, "forage", "the source of my own bad voice is avoided");
  assert.deepEqual((warned.human as V).aversions!.map(a => a.firsthand), [false]);
  const later = decideValenceOnset({ ...(warned.human as V) } as V, at(20), () => 0.5);
  assert.equal((later.human as V).lastDisgust, 0, "a second-hand aversion does not disgust"); assert.equal(urge(later), undefined);
  assert.notEqual(later.action.kind, "forage", "but the place stays avoided");
  assert.equal(decideValenceOnsetPrivate(h, at(5, [patch], [badSound]), () => 0.5).action.kind, "forage", "the deaf control ignores the warning");
});
test("valence-v5 differs from v4 only in the toxic ratio, uses fresh seeds, and registers the onset models", () => {
  assert.equal(HUMAN_MODELS["valence-onset-0.12.0-experimental.4"].apply, applyWithIntake);
  assert.equal(HUMAN_MODELS["valence-onset-private-0.12.0-experimental.4"].role, "control");
  const w5 = valence5.world as { foodSpawn?: { toxicEvery?: number } };
  assert.deepEqual({ ...w5, foodSpawn: { ...w5.foodSpawn!, toxicEvery: 2 } }, valence4.world);
  assert.equal(w5.foodSpawn!.toxicEvery, 3);
  assert.deepEqual(valence5.checks.map(c => c.id), ["convergence-gain", "arbitrariness", "convergence-bad", "valence-distinctness", "poisoning-benefit", "poisoning-shape", "forage-benefit"]);
  assert.deepEqual(valence5.checks.filter(c => !c.id.startsWith("poisoning")), valence4.checks.filter(c => !c.id.startsWith("poison")));
  assert.deepEqual(valence5.checks.filter(c => c.id.startsWith("poisoning")).map(c => c.minimum), [1, 1]);
  const used = [valence, valence2, valence3, valence4].flatMap(p => [p.pilotSeeds, seedsFor("development", p, "1"), seedsFor("validation", p, "1")].flat());
  const v5 = [valence5.pilotSeeds, seedsFor("development", valence5, "1"), seedsFor("validation", valence5, "1")].flat();
  assert.equal(new Set([...used, ...v5]).size, used.length + v5.length);
  const run = runExperiment({ ...referentialConfig(v5[0], "valence-onset-0.12.0-experimental.4", true, valence5), horizon: 150 });
  assert.equal(run.frames.length, 151);
});
test("poisonings count distinct (individual, toxic patch) pairs: a patch eaten over many ticks by one individual is one poisoning", () => {
  // A lone default forager standing on a toxic patch keeps eating it: many poisoned ticks, one poisoning.
  const lone = { ...valence5, horizon: 300, agents: { A: { x: 33, y: 23 } }, body: { hunger: .9, fatigue: 0, cold: 0 } } as typeof valence5;
  const run = runCondition("human-0.2.0", 1, "muted", lone);
  assert.ok(run.poisonIntake > 0.2, "the toxic patch was eaten repeatedly");
  assert.equal(run.poisonings, 1, "but it counts as one poisoning");
  assert.deepEqual(run.poisoningKinds, { first: 1, simultaneous: 0, unwarned: 0, warned: 0 }, "a lone eater's poisoning is a first poisoning");
  const group = runCondition("valence-alarm-ceiling-0.12.0-experimental.5", 80001, "sound", { ...valence5, horizon: 1500 } as typeof valence5);
  const k = group.poisoningKinds;
  assert.equal(k.first + k.simultaneous + k.unwarned + k.warned, group.poisonings, "every poisoning is classified exactly once");
  const mutedGroup = runCondition("valence-alarm-ceiling-0.12.0-experimental.5", 80001, "muted", { ...valence5, horizon: 1500 } as typeof valence5);
  assert.equal(mutedGroup.poisoningKinds.warned, 0, "nobody is warned when muted");
  assert.ok(run.latePoisonings <= 1);
  const mk = (late: number) => ({ latePoisonings: late }) as unknown as SeedResult["sound"];
  const r = { seed: 1, model: "m", sound: mk(2), muted: mk(5), misdirected: mk(5), scrambled: mk(4) } as SeedResult;
  assert.equal(checkValue("poisoning-benefit", r, valence5), 3); assert.equal(checkValue("poisoning-shape", r, valence5), 2);
});
