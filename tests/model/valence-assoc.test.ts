import test from "node:test";
import assert from "node:assert/strict";
import { createHuman } from "../../packages/human/src/index.ts";
import { applyWithIntake } from "../../packages/human/src/forager-listener.ts";
import { decideValenceAssoc, decideValenceAssocPrivate, isWarningCategory } from "../../packages/human/src/valence.ts";
import { protocol as valence } from "../../research/studies/valence-v1.ts";
import { protocol as valence2 } from "../../research/studies/valence-v2.ts";
import { protocol as valence3 } from "../../research/studies/valence-v3.ts";
import { protocol as valence4 } from "../../research/studies/valence-v4.ts";
import { protocol as valence5 } from "../../research/studies/valence-v5.ts";
import { protocol as valence6 } from "../../research/studies/valence-v6.ts";
import { protocol as valence7 } from "../../research/studies/valence-v7.ts";
import { protocol as valence8 } from "../../research/studies/valence-v8.ts";
import { protocol as valence9 } from "../../research/studies/valence-v9.ts";
import { seedsFor, referentialConfig } from "../../research/studies/referential-v1.ts";
import { HUMAN_MODELS, runExperiment } from "../../packages/simulation/src/index.ts";

type V = ReturnType<typeof createHuman> & { lastIntake?: number; lastPoison?: number; warnings?: Record<number, { poisoned: number; safe: number }>; aversions?: { x: number; y: number; tick: number }[]; valenceHeard?: unknown; ownVoices?: unknown };
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
