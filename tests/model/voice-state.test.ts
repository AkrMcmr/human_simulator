import test from "node:test";
import assert from "node:assert/strict";
import { createHuman, decideWithOptions, decideHuman, predictedSafety } from "../../packages/human/src/index.ts";
import { decideVoiceState, decideVoiceStateOnly, VOICE_STATE } from "../../packages/human/src/voice-state.ts";
import { decideSignalSender } from "../../packages/human/src/signal-sender.ts";
import { runExperiment } from "../../packages/simulation/src/index.ts";
import { pairExperiment, DEFAULT_SETTINGS } from "../../packages/experiments/src/index.ts";
import { seedsFor, protocol } from "../../research/studies/signal-world-v1.ts";

const observation = (distance: number) => ({ tick: 0, selfPosition: { x: 10, y: 14 }, animals: [{ trackId: "B", relativePosition: { x: distance, y: 0 }, relativeVelocity: { x: 0, y: 0 }, morphologySimilarity: .98 }], resources: [], sounds: [] });
/** Deterministic random that forces the vocalize choice through the softmax draw with a fresh (non-repeated) base sound. */
function forcedVocalize(base: { openness: number; resonance: number }) {
  return (purpose: string) => {
    if (purpose === "epsilon") return 0.99;
    if (purpose === "exploratory-choice") return 0.99;
    if (purpose === "softmax") return 0.999999;
    if (purpose === "new-voice") return 0;
    if (purpose === "voice-openness") return base.openness;
    if (purpose === "voice-resonance") return base.resonance;
    if (purpose.startsWith("motor-noise")) return 0.5;
    return 0.5;
  };
}
function vocalizeWith(coupling: number, distance: number, hunger: number, harm: [number, number]) {
  const human = createHuman("A", { curiosity: 1 }, { hunger, fatigue: 0, cold: 0 });
  human.peers.B = { lastSeen: 0, sightings: 20, harmAlpha: harm[0], harmBeta: harm[1], responses: {} };
  // Any random stream picks the last action in score order; find the vocalize case by scanning draws.
  for (let draw = 0; draw <= 1; draw += 0.01) {
    const random = (purpose: string) => purpose === "softmax" ? draw : forcedVocalize({ openness: 0.5, resonance: 0.5 })(purpose);
    const result = decideWithOptions(human, observation(distance), random, { stateCoupling: coupling });
    if (result.action.kind === "vocalize" && result.action.sound) return { sound: result.action.sound, risk: result.trace.perceivedRisk };
  }
  throw new Error("vocalize never selected");
}
test("state coupling shifts the produced sound toward risk (openness) and bodily need (resonance) without touching decisions", () => {
  const calm = vocalizeWith(0.6, 8, 0, [1, 20]);
  const alarmed = vocalizeWith(0.6, 1.2, 0, [20, 1]);
  assert.ok(alarmed.risk > calm.risk);
  assert.ok(alarmed.sound.openness > calm.sound.openness, "higher risk opens the voice");
  const hungry = vocalizeWith(0.6, 8, 0.9, [1, 20]);
  assert.ok(hungry.sound.resonance > calm.sound.resonance, "need raises resonance");
  const uncoupled = vocalizeWith(0, 1.2, 0, [20, 1]);
  assert.ok(Math.abs(uncoupled.sound.openness - 0.5) < 1e-9, "coupling 0 reproduces the chosen base sound");
  const human = createHuman("A");
  const same = decideWithOptions(human, observation(5), () => 0.5, { outcomeBonus: predictedSafety, stateCoupling: 0.6 });
  const plain = decideHuman(human, observation(5), () => 0.5);
  assert.deepEqual(same.trace.scores, plain.trace.scores, "coupling changes only the sound, never utilities");
});
test("the coupled candidate differs from the uncoupled sender only through sounds, and the learning-off control keeps 0.2.0 decisions", () => {
  const human = createHuman("A");
  const obs = observation(3);
  assert.deepEqual(decideVoiceState(human, obs, () => 0.5).trace.scores, decideSignalSender(human, obs, () => 0.5).trace.scores);
  assert.deepEqual(decideVoiceStateOnly(human, obs, () => 0.5).trace.scores, decideHuman(human, obs, () => 0.5).trace.scores);
  assert.equal(VOICE_STATE.coupling, 0.6);
  const config = pairExperiment({ ...structuredClone(DEFAULT_SETTINGS), horizon: 150, initialDistance: 6 });
  const coupled = runExperiment({ ...config, model: "voice-state-0.6.0-experimental.1" });
  const uncoupled = runExperiment({ ...config, model: "signal-sender-0.5.0-experimental.1" });
  assert.notDeepEqual(coupled.state.humans.map(h => h.producedSounds), uncoupled.state.humans.map(h => h.producedSounds));
});
test("seed rounds are disjoint and round 2 is fresh", () => {
  const r1 = [...seedsFor("development", "1"), ...seedsFor("validation", "1")];
  const r2 = [...seedsFor("development", "2"), ...seedsFor("validation", "2")];
  assert.ok(r2.every(s => !r1.includes(s) && !protocol.pilotSeeds.includes(s)));
  assert.equal(new Set([...r1, ...r2]).size, r1.length + r2.length);
  assert.throws(() => seedsFor("development", "9" as "1"));
});
