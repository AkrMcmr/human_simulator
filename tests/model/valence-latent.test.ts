import test from "node:test";
import assert from "node:assert/strict";
import { createHuman } from "../../packages/human/src/index.ts";
import { advanceWorld, createWorld, WORLD_VERSION } from "../../packages/world/src/index.ts";
import { applyWithIntake } from "../../packages/human/src/forager-listener.ts";
import { decideValenceLatent, decideValenceLatentPrivate, decideValenceLatentAlarm, isWarningCategory, DIGEST, ALARM } from "../../packages/human/src/valence.ts";
import { protocol as valence } from "../../research/studies/valence-v1.ts";
import { protocol as valence2 } from "../../research/studies/valence-v2.ts";
import { protocol as valence3 } from "../../research/studies/valence-v3.ts";
import { protocol as valence4 } from "../../research/studies/valence-v4.ts";
import { protocol as valence5 } from "../../research/studies/valence-v5.ts";
import { protocol as valence6 } from "../../research/studies/valence-v6.ts";
import { protocol as valence7 } from "../../research/studies/valence-v7.ts";
import { protocol as valence8 } from "../../research/studies/valence-v8.ts";
import { protocol as valence9 } from "../../research/studies/valence-v9.ts";
import { protocol as valence10 } from "../../research/studies/valence-v10.ts";
import { protocol as valence11 } from "../../research/studies/valence-v11.ts";
import { seedsFor, runCondition, referentialConfig } from "../../research/studies/referential-v1.ts";
import { HUMAN_MODELS, createSimulation, runExperiment } from "../../packages/simulation/src/index.ts";

type V = ReturnType<typeof createHuman> & { lastIntake?: number; lastPoison?: number; lastDisgust?: number; warnings?: Record<number, { poisoned: number; safe: number }>; aversions?: { x: number; y: number; tick: number; firsthand?: boolean }[]; recentMeals?: { x: number; y: number; tick: number; categories: number[]; resolved: boolean }[]; recentSounds?: { category: number; x: number; y: number; tick: number }[] };
const effect = (foodIntake: number, poison = 0) => ({ ambientCold: .3, foodIntake, exertion: 0, resting: false, collision: 0, ...(poison ? { poison } : {}) });
const patch = { id: "f", kind: "food" as const, strength: 1, relativePosition: { x: 1, y: 0 } };
const shape = { openness: .7, resonance: .6 };
const call = { visibleSourceId: null, shape, loudness: .8, relativePosition: { x: 2, y: 0 } };
const at = (tick: number, self = { x: 10, y: 14 }, resources: (typeof patch)[] = [patch], sounds: (typeof call)[] = []) => ({ tick, selfPosition: self, animals: [], resources, sounds });

test("world 0.7.0: with poisonDelay the poison of a toxic bite arrives that many ticks later; without it the 0.5.0 behavior holds", () => {
  assert.equal(WORLD_VERSION, "0.7.0");
  const animals = [{ id: "A", position: { x: 7, y: 5 } }];
  const toxic = [{ id: "f", kind: "food" as const, position: { x: 7, y: 5 }, amount: 6, radius: 2, toxic: true }];
  let w = createWorld(animals, { foodRegeneration: 0, poisonDelay: 3 }, toxic);
  const poisons: number[] = [];
  for (let t = 0; t < 6; t++) { const step = advanceWorld(w, { A: { kind: t === 0 ? "forage" : "rest" } }, t); w = step.world; poisons.push(step.effects.A.poison ?? 0); }
  assert.deepEqual(poisons.map(p => +p.toFixed(2)), [0, 0, 0, 0.04, 0, 0], "one bite at tick 0 is felt at tick 3");
  assert.deepEqual(w.pendingPoison, [], "nothing stays pending");
  const immediate = advanceWorld(createWorld(animals, { foodRegeneration: 0 }, toxic), { A: { kind: "forage" } }, 0);
  assert.ok(Math.abs((immediate.effects.A.poison ?? 0) - 0.04) < 1e-9, "no delay: the same tick");
  assert.throws(() => createSimulation({ ...referentialConfig(1, "human-0.2.0", true, valence11), world: { ...valence11.world, poisonDelay: -1 } } as Parameters<typeof createSimulation>[0]), /毒の潜伏/);
});
test("the evaluator counts a poisoning when toxic food is eaten, so a latent world still attributes it to the patch", () => {
  const lone = { ...valence11, horizon: 300, agents: { A: { x: 33, y: 23 } }, body: { hunger: .9, fatigue: 0, cold: 0 } } as typeof valence11;
  const run = runCondition("human-0.2.0", 1, "muted", lone);
  assert.equal(run.poisonings, 1, "one poisoning at the toxic patch even though the poison arrives 40 ticks later");
  assert.ok(run.poisonIntake > 0.2);
});
test("the latent-aware eater blames the meal, not the place where the poison strikes, and counts the categories heard at the meal", () => {
  const h = createHuman("A", {}, { hunger: .6, fatigue: 0, cold: 0 }) as V;
  h.heardSounds = [{ id: 1, shape: { ...shape }, samples: 5 }];
  // Eat at (10,14) while a call sounds from (12,14): a meal with category 1 is recorded, and the good voice is the context.
  const heard = decideValenceLatent(h, at(5, { x: 10, y: 14 }, [patch], [call]), () => 0.5).human as V;
  const fed = applyWithIntake(heard, effect(.04)) as V;
  const ate = decideValenceLatent(fed, at(6, { x: 10, y: 14 }, [patch], [call]), () => 0.5).human as V;
  assert.equal(ate.recentMeals!.length, 1); assert.deepEqual(ate.recentMeals![0].categories, [1]); assert.equal(ate.recentMeals![0].resolved, false);
  assert.equal(ate.aversions, undefined, "no aversion while the meal is open");
  // Walk away; the poison arrives at tick 40 while standing far from the patch.
  const away = { ...ate, lastIntake: 0, lastPoison: 0 } as V;
  const walked = decideValenceLatent(away, at(30, { x: 25, y: 20 }, []), () => 0.5).human as V;
  const sick = applyWithIntake({ ...walked, lastIntake: 0 } as V, effect(0, .04)) as V;
  const blamed = decideValenceLatent(sick, at(46, { x: 25, y: 20 }, []), () => 0.5).human as V;
  assert.deepEqual(blamed.aversions!.map(a => [a.x, a.y, a.firsthand]), [[10, 14, true]], "the meal place becomes aversive, not the current position");
  assert.deepEqual(blamed.warnings, { 1: { poisoned: 1, safe: 0 } }); assert.ok(isWarningCategory(blamed, 1));
  assert.equal(blamed.recentMeals![0].resolved, true);
  assert.equal(blamed.lastDisgust, 0, "no aversive food in sight: no bad-voice context");
  // Further poison ticks from the same meal add no aversion at the current position.
  const again = decideValenceLatent(applyWithIntake({ ...blamed, lastIntake: 0 } as V, effect(0, .04)) as V, at(47, { x: 25, y: 21 }, []), () => 0.5).human as V;
  assert.equal(again.aversions!.length, 1);
  // Back at the patch: disgust, and the category heard there warns.
  const back = decideValenceLatent({ ...again, lastPoison: 0 } as V, at(60, { x: 10, y: 14 }, [patch]), () => 0.5);
  assert.equal((back.human as V).lastDisgust, 1); assert.notEqual(back.action.kind, "forage");
  // A meal that stays open past the digest window counts its categories safe.
  const h2 = createHuman("B", {}, { hunger: .6, fatigue: 0, cold: 0 }) as V; h2.heardSounds = [{ id: 1, shape: { ...shape }, samples: 5 }];
  const heard2 = decideValenceLatent(h2, at(5, { x: 10, y: 14 }, [patch], [call]), () => 0.5).human as V;
  const ate2 = decideValenceLatent(applyWithIntake(heard2, effect(.04)) as V, at(6, { x: 10, y: 14 }, [patch], [call]), () => 0.5).human as V;
  const safe = decideValenceLatent({ ...ate2, lastIntake: 0 } as V, at(6 + DIGEST.window + 1, { x: 30, y: 20 }, []), () => 0.5).human as V;
  assert.deepEqual(safe.warnings, { 1: { poisoned: 0, safe: 1 } });
  // The deaf control ignores a heard warning; the latent ceiling alarms only when disgusted.
  const warnedListener = createHuman("C", {}, { hunger: .6, fatigue: 0, cold: 0 }) as V; warnedListener.heardSounds = [{ id: 1, shape: { ...shape }, samples: 5 }]; warnedListener.warnings = { 1: { poisoned: 1, safe: 0 } };
  assert.notEqual(decideValenceLatent(warnedListener, at(5, { x: 10, y: 14 }, [patch], [call]), () => 0.5).action.kind, "forage");
  assert.equal(decideValenceLatentPrivate(warnedListener, at(5, { x: 10, y: 14 }, [patch], [call]), () => 0.5).action.kind, "forage");
  const alarm = { ...call, shape: { ...ALARM.shape } };
  assert.notEqual(decideValenceLatentAlarm(createHuman("D", {}, { hunger: .6, fatigue: 0, cold: 0 }), at(5, { x: 10, y: 14 }, [patch], [alarm]), () => 0.5).action.kind, "forage", "the latent ceiling understands the innate alarm");
});
test("valence-v11 adds only the poison delay to the valence-v10 world, on fresh seeds, and registers the latent models", () => {
  assert.equal(HUMAN_MODELS["valence-assoc-0.12.0-experimental.10"].role, "candidate");
  assert.equal(HUMAN_MODELS["valence-alarm-ceiling-0.12.0-experimental.10"].role, "control");
  const w11 = valence11.world as { poisonDelay?: number };
  assert.equal(w11.poisonDelay, 40);
  const { poisonDelay: _d, ...rest } = w11 as { poisonDelay?: number; foodSpawn: { positions: { x: number; y: number }[]; toxicEvery: number } }; void _d;
  const w10 = valence10.world as { foodSpawn: { positions: { x: number; y: number }[] } };
  assert.equal(rest.foodSpawn.positions.length, 13, "thirteen spawn positions, coprime with toxicEvery 2, so a position alternates between toxic and wholesome");
  assert.deepEqual(rest.foodSpawn.positions.slice(0, 12), w10.foodSpawn.positions);
  assert.deepEqual({ ...rest, foodSpawn: { ...rest.foodSpawn, positions: w10.foodSpawn.positions } }, valence10.world);
  assert.deepEqual(valence11.resources, valence10.resources); assert.deepEqual(valence11.checks, valence10.checks);
  const used = [valence, valence2, valence3, valence4, valence5, valence6, valence7, valence8, valence9, valence10].flatMap(q => [q.pilotSeeds, seedsFor("development", q, "1"), seedsFor("validation", q, "1")].flat());
  const v11 = [valence11.pilotSeeds, seedsFor("development", valence11, "1"), seedsFor("validation", valence11, "1")].flat();
  assert.equal(new Set([...used, ...v11]).size, used.length + v11.length);
  const run = runExperiment({ ...referentialConfig(v11[0], "valence-assoc-0.12.0-experimental.10", true, valence11), horizon: 200 });
  assert.equal(run.frames.length, 201);
});
