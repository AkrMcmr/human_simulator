import test from "node:test";
import assert from "node:assert/strict";
import { createHuman } from "../../packages/human/src/index.ts";
import { applyWithIntake } from "../../packages/human/src/forager-listener.ts";
import { decideValenceAssoc, decideValenceAssocPrivate, decideValenceAssoc2, decideValenceAssoc2Private, isWarningCategory, ASSOCIATION } from "../../packages/human/src/valence.ts";
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
import { seedsFor, referentialConfig } from "../../research/studies/referential-v1.ts";
import { HUMAN_MODELS, runExperiment } from "../../packages/simulation/src/index.ts";

type V = ReturnType<typeof createHuman> & { lastIntake?: number; lastPoison?: number; warnings?: Record<number, { poisoned: number; safe: number }>; aversions?: { x: number; y: number; tick: number }[]; recentSounds?: { category: number; x: number; y: number; tick: number }[]; valenceHeard?: unknown; ownVoices?: unknown };
const effect = (foodIntake: number, poison = 0) => ({ ambientCold: .3, foodIntake, exertion: 0, resting: false, collision: 0, ...(poison ? { poison } : {}) });
const patch = { id: "f", kind: "food" as const, strength: 1, relativePosition: { x: 1, y: 0 } };
const shape = { openness: .7, resonance: .6 };
const call = { visibleSourceId: null, shape, loudness: .8, relativePosition: { x: 2, y: 0 } };
const at = (tick: number, resources = [patch], sounds: (typeof call)[] = []) => ({ tick, selfPosition: { x: 10, y: 14 }, animals: [], resources, sounds });
const listener = () => { const h = createHuman("A", {}, { hunger: .6, fatigue: 0, cold: 0 }) as V; h.heardSounds = [{ id: 1, shape: { ...shape }, samples: 5 }]; return h; };

test("a heard category warns only after the individual was poisoned where it was heard, and stops when safe meals outnumber poisonings", () => {
  const fresh = listener();
  assert.equal(decideValenceAssoc(fresh, at(5, [patch], [call]), () => 0.5).action.kind, "forage", "never poisoned there: the call means nothing yet, the food is eaten");
  // Hear the call at tick 5, then be poisoned at tick 6 next to its source: one poisoned association.
  const heard = decideValenceAssoc(fresh, at(5, [patch], [call]), () => 0.5).human as V;
  const poisonedThere = applyWithIntake({ ...heard, body: { ...heard.body } } as V, effect(.04, .04)) as V;
  const learned = decideValenceAssoc(poisonedThere, at(6, [patch]), () => 0.5).human as V;
  assert.deepEqual(learned.warnings, { 1: { poisoned: 1, safe: 0 } });
  assert.ok(isWarningCategory(learned, 1));
  const calm = { ...learned, lastPoison: 0, lastIntake: 0 } as V;
  const warned = decideValenceAssoc(calm, { ...at(700, [patch], [call]), selfPosition: { x: 30, y: 20 } }, () => 0.5);
  assert.notEqual(warned.action.kind, "forage", "now the same category heard elsewhere keeps the listener off the food at its source");
  assert.ok((warned.human as V).aversions!.some(a => a.x === 32 && a.y === 20));
  // Two safe meals where the category was heard outweigh the one poisoning.
  let h = { ...learned, lastPoison: 0, lastIntake: 0 } as V;
  for (const t of [800, 900]) {
    const again = decideValenceAssoc({ ...h, aversions: [] } as V, { ...at(t, [], [call]), selfPosition: { x: 20, y: 5 } }, () => 0.5).human as V;
    const fed = applyWithIntake(again, effect(.04)) as V;
    h = decideValenceAssoc(fed, { ...at(t + 1, []), selfPosition: { x: 22, y: 5 } }, () => 0.5).human as V;
  }
  assert.deepEqual(h.warnings, { 1: { poisoned: 1, safe: 2 } });
  assert.equal(isWarningCategory(h, 1), false, "safe meals outnumber poisonings: no longer a warning");
  assert.equal(learned.ownVoices, undefined, "no own-voice matching in experimental.8");
});
test("the deaf control learns the same associations but never acts on a heard warning", () => {
  const h = listener(); h.warnings = { 1: { poisoned: 2, safe: 0 } };
  assert.equal(decideValenceAssocPrivate(h, at(5, [patch], [call]), () => 0.5).action.kind, "forage");
  assert.notEqual(decideValenceAssoc(h, at(5, [patch], [call]), () => 0.5).action.kind, "forage");
});
test("valence-v9 reuses the valence-v7 world on fresh seeds and registers the association models", () => {
  assert.equal(HUMAN_MODELS["valence-assoc-0.12.0-experimental.8"].role, "candidate");
  assert.equal(HUMAN_MODELS["valence-assoc-private-0.12.0-experimental.8"].role, "control");
  assert.deepEqual(valence9.world, valence7.world); assert.deepEqual(valence9.resources, valence7.resources); assert.deepEqual(valence9.checks, valence7.checks);
  const used = [valence, valence2, valence3, valence4, valence5, valence6, valence7, valence8].flatMap(p => [p.pilotSeeds, seedsFor("development", p, "1"), seedsFor("validation", p, "1")].flat());
  const v9 = [...seedsFor("development", valence9, "1"), ...seedsFor("validation", valence9, "1")];
  assert.equal(new Set([...used, ...v9]).size, used.length + v9.length);
  const run = runExperiment({ ...referentialConfig(v9[0], "valence-assoc-0.12.0-experimental.8", true, valence9), horizon: 200 });
  assert.equal(run.frames.length, 201);
});
test("episode counting: a peer calling every tick while the listener eats counts one safe outcome per place and visit, not one per tick", () => {
  let h8 = listener(), h9 = listener();
  // Ten ticks: hear the call (source 2u away) and eat at the patch each tick.
  for (let t = 0; t < 10; t++) {
    const fed8 = applyWithIntake(h8, effect(.04)) as V, fed9 = applyWithIntake(h9, effect(.04)) as V;
    h8 = decideValenceAssoc(fed8, at(t, [patch], [call]), () => 0.5).human as V;
    h9 = decideValenceAssoc2(fed9, at(t, [patch], [call]), () => 0.5).human as V;
  }
  assert.ok((h8.warnings?.[1]?.safe ?? 0) >= 8, `experimental.8 counts nearly every tick (${h8.warnings?.[1]?.safe})`);
  assert.equal(h9.warnings?.[1]?.safe, 1, "experimental.9 counts the visit once");
  assert.equal(h9.recentSounds!.filter(m => m.category === 1).length, 1, "one memory per category and place");
  // After the cooldown the same place can be counted again.
  const later = applyWithIntake({ ...h9 } as V, effect(.04)) as V;
  const again = decideValenceAssoc2(later, at(10 + ASSOCIATION.cooldownTicks + 1, [patch], [call]), () => 0.5).human as V;
  const again2 = decideValenceAssoc2(applyWithIntake(again, effect(.04)) as V, at(12 + ASSOCIATION.cooldownTicks, [patch], [call]), () => 0.5).human as V;
  assert.equal(again2.warnings?.[1]?.safe, 2, "a new visit after the cooldown counts once more");
  // A poisoning where the category was heard still makes it a warning, and the deaf control ignores it.
  const p = listener(); p.warnings = { 1: { poisoned: 1, safe: 0 } };
  assert.notEqual(decideValenceAssoc2(p, at(5, [patch], [call]), () => 0.5).action.kind, "forage");
  assert.equal(decideValenceAssoc2Private(p, at(5, [patch], [call]), () => 0.5).action.kind, "forage");
  assert.equal(HUMAN_MODELS["valence-assoc-0.12.0-experimental.9"].role, "candidate");
  const w10 = valence10.world as { foodSpawn?: { toxicEvery?: number } };
  assert.equal(w10.foodSpawn!.toxicEvery, 2);
  assert.deepEqual({ ...w10, foodSpawn: { ...w10.foodSpawn!, toxicEvery: 3 } }, valence9.world);
  assert.equal(valence10.resources.filter(r => r.kind === "food").length, 9, "nine live food slots");
  const food = (q: typeof valence9) => q.resources.filter(r => r.kind === "food");
  assert.deepEqual(food(valence10).slice(0, food(valence9).length), food(valence9), "the valence-v9 patches are unchanged and two are added");
  assert.deepEqual(valence10.resources.filter(r => r.kind === "warmth"), valence9.resources.filter(r => r.kind === "warmth"));
  const used = [valence, valence2, valence3, valence4, valence5, valence6, valence7, valence8, valence9].flatMap(q => [q.pilotSeeds, seedsFor("development", q, "1"), seedsFor("validation", q, "1")].flat());
  const v10 = [valence10.pilotSeeds, seedsFor("development", valence10, "1"), seedsFor("validation", valence10, "1")].flat();
  assert.equal(new Set([...used, ...v10]).size, used.length + v10.length);
});
