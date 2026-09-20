import test from "node:test";
import assert from "node:assert/strict";
import { createHuman, decideWithOptions, predictedSafety } from "../../packages/human/src/index.ts";
import { applyWithIntake, EATING_VOICE, decideEatingSelective, decideEatingBlind } from "../../packages/human/src/forager-listener.ts";
import { seedsFor, protocol as v1 } from "../../research/studies/referential-v1.ts";
import { protocol as v2 } from "../../research/studies/referential-v2.ts";
import { runExperiment } from "../../packages/simulation/src/index.ts";
import { referentialConfig } from "../../research/studies/referential-v1.ts";

function vocalSound(human: ReturnType<typeof createHuman>, eatingCoupling: number) {
  const observation = { tick: 0, selfPosition: { x: 10, y: 14 }, animals: [], resources: [], sounds: [] };
  // Force the exploratory branch and scan its uniform choice until vocalize is the selected action.
  for (let choice = 0; choice < 1; choice += 0.05) {
    const random = (purpose: string) => purpose === "epsilon" ? 0.01 : purpose === "exploratory-choice" ? choice : purpose === "new-voice" ? 0 : purpose.startsWith("voice-") ? 0.2 : 0.5;
    const r = decideWithOptions(human, observation, random, { outcomeBonus: predictedSafety, stateCoupling: 0.6, eatingCoupling });
    if (r.action.kind === "vocalize" && r.action.sound) return r.action.sound;
  }
  throw new Error("no vocalize");
}
test("the eating state pulls the voice toward the high corner only right after eating", () => {
  const base = createHuman("A", { curiosity: 1 }, { hunger: .5, fatigue: 0, cold: 0 });
  const fed = applyWithIntake(base, { ambientCold: .1, foodIntake: .04, exertion: 0, resting: false, collision: 0 });
  const hungry = applyWithIntake(base, { ambientCold: .1, foodIntake: 0, exertion: 0, resting: false, collision: 0 });
  const fedSound = vocalSound(fed, EATING_VOICE.coupling), hungrySound = vocalSound(hungry, EATING_VOICE.coupling);
  assert.ok(fedSound.openness > hungrySound.openness + 0.3 && fedSound.resonance > hungrySound.resonance + 0.2, "eating voices separate from exploring voices");
  assert.deepEqual(vocalSound(fed, 0), vocalSound(hungry, 0), "without eating coupling the voice ignores intake");
});
test("eating-voice candidates run in the referential world and seed rounds are fresh", () => {
  const r1 = [...seedsFor("development", v2, "1"), ...seedsFor("validation", v2, "1")];
  const r2 = [...seedsFor("development", v2, "2"), ...seedsFor("validation", v2, "2")];
  assert.ok(r2.every(s => !r1.includes(s) && !v2.pilotSeeds.includes(s)));
  assert.deepEqual(seedsFor("development", v1, "1"), v1.developmentSeeds);
  assert.throws(() => seedsFor("development", v1, "2"));
  const human = createHuman("A");
  const observation = { tick: 0, selfPosition: { x: 10, y: 14 }, animals: [], resources: [], sounds: [] };
  assert.deepEqual(decideEatingSelective(human, observation, () => 0.5).trace.scores.map(s => s.action), decideEatingBlind(human, observation, () => 0.5).trace.scores.map(s => s.action));
  const run = runExperiment({ ...referentialConfig(seedsFor("development", v2, "2")[0], "eating-voice-selective-0.8.0-experimental.2", true, v2), horizon: 100 });
  assert.equal(run.frames.length, 101);
});
