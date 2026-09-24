import test from "node:test";
import assert from "node:assert/strict";
import { voicePoints, voiceClusters, voiceDistinctness } from "../../packages/observer/src/index.ts";
import { runExperiment, observeSimulation, createSimulation, valenceOf, type Frame } from "../../packages/simulation/src/index.ts";
import { referentialConfig } from "../../research/studies/referential-v1.ts";
import { protocol as valence6 } from "../../research/studies/valence-v6.ts";
import { applyWithIntake } from "../../packages/human/src/forager-listener.ts";
import { createHuman } from "../../packages/human/src/index.ts";

test("the observer labels each emitted sound with the caller's valence context of the previous frame and summarizes the two voices", () => {
  const mk = (tick: number, valence: "good" | "bad" | null, sounds: { sourceId: string; openness: number; resonance: number }[]): Frame => ({
    tick, distance: null, events: [],
    world: { parameters: {} as Frame["world"]["parameters"], animals: [], resources: [], sounds: sounds.map(s => ({ sourceId: s.sourceId, position: { x: 0, y: 0 }, shape: { openness: s.openness, resonance: s.resonance }, tick })) },
    agents: [{ id: "A", body: { hunger: 0, fatigue: 0, cold: 0, health: 1 }, action: "vocalize", producedSounds: [], heardSounds: [], learnedTransitions: 0, trace: null, peerEvidence: [], valence }],
  });
  const frames = [mk(0, "good", []), mk(1, "bad", [{ sourceId: "A", openness: .2, resonance: .2 }]), mk(2, null, [{ sourceId: "A", openness: .8, resonance: .8 }]), mk(3, "good", [{ sourceId: "A", openness: .5, resonance: .5 }])];
  const points = voicePoints(frames);
  assert.deepEqual(points.map(p => p.context), ["good", "bad", "other"], "a sound at tick t carries the context of frame t-1");
  const clusters = voiceClusters(points);
  assert.deepEqual(clusters.map(c => [c.context, c.count]), [["good", 1], ["bad", 1], ["other", 1]]);
  assert.ok(Math.abs(voiceDistinctness(clusters)! - Math.hypot(.6, .6)) < 1e-9);
  assert.equal(voiceDistinctness(voiceClusters(voicePoints(frames, "B"))), null, "no sounds for an absent individual");
});
test("frames record a valence context for candidates that track intake and poison, and null for the default model", () => {
  const plain = observeSimulation(createSimulation(referentialConfig(1, "human-0.2.0", true, valence6)));
  assert.ok(plain.agents.every(a => a.valence === null));
  assert.equal(valenceOf(applyWithIntake(createHuman("A"), { ambientCold: .3, foodIntake: .04, exertion: 0, resting: false, collision: 0 })), "good");
  assert.equal(valenceOf(applyWithIntake(createHuman("A"), { ambientCold: .3, foodIntake: .04, poison: .04, exertion: 0, resting: false, collision: 0 })), "bad");
  const run = runExperiment({ ...referentialConfig(80001, "valence-onset-fast-0.12.0-experimental.5", true, valence6), horizon: 400 });
  const points = voicePoints(run.frames);
  assert.ok(points.length > 0 && points.some(p => p.context === "good"), "the two-voice candidate emits good-context calls within 400 ticks");
});
