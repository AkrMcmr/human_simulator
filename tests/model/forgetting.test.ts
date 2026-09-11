import test from "node:test";
import assert from "node:assert/strict";
import { createHuman, decideHuman, decideWithOptions } from "../../packages/human/src/index.ts";
import { decideKeepEstimate, decideKeepEstimateAblated } from "../../packages/human/src/forgetting-policy.ts";
import { runExperiment } from "../../packages/simulation/src/index.ts";
import { pairExperiment, DEFAULT_SETTINGS } from "../../packages/experiments/src/index.ts";

const observation = (distance: number) => ({ tick: 0, selfPosition: { x: 10, y: 14 }, animals: [{ trackId: "B", relativePosition: { x: distance, y: 0 }, relativeVelocity: { x: 0, y: 0 }, morphologySimilarity: .98 }], resources: [], sounds: [] });
const random = () => 0.5;
function withEvidence(alpha: number, beta: number) {
  const human = createHuman("A");
  human.peers.B = { lastSeen: 0, sightings: 5, harmAlpha: alpha, harmBeta: beta, responses: {} };
  return human;
}
test("keep-estimate forgetting shrinks confidence at the default rate but leaves the harm estimate unchanged", () => {
  const start = withEvidence(1.5, 40);
  const estimate = (h: typeof start) => h.peers.B.harmAlpha / (h.peers.B.harmAlpha + h.peers.B.harmBeta);
  const kept = decideKeepEstimate(start, observation(8), random).human;
  const drifted = decideHuman(start, observation(8), random).human;
  assert.ok(Math.abs(estimate(kept) - estimate(start)) < 1e-12);
  assert.ok(estimate(drifted) > estimate(start), "the 0.2.0 rule drifts toward the 0.5 prior");
  const total = (h: typeof start) => h.peers.B.harmAlpha + h.peers.B.harmBeta;
  assert.ok(Math.abs(total(kept) - total(drifted)) < 1e-12, "both rules forget the same amount of evidence");
  assert.ok(total(kept) < total(start));
  const prior = decideKeepEstimate(withEvidence(1, 1), observation(8), random).human;
  assert.deepEqual([prior.peers.B.harmAlpha, prior.peers.B.harmBeta], [1, 1]);
});
test("the ablated candidate is exactly human 0.2.0 and the candidate differs only through forgetting", () => {
  const config = pairExperiment({ ...structuredClone(DEFAULT_SETTINGS), horizon: 150, initialDistance: 6 });
  const base = runExperiment({ ...config, model: "human-0.2.0" });
  const ablated = runExperiment({ ...config, model: "forgetting-keep-estimate-ablated-0.3.0-experimental.1" });
  assert.deepEqual(ablated.state.world, base.state.world);
  assert.deepEqual(ablated.state.humans, base.state.humans);
  const human = withEvidence(3, 9);
  assert.deepEqual(decideKeepEstimateAblated(human, observation(3), random), decideHuman(human, observation(3), random));
  const zeroDecay = createHuman("A", { memoryDecay: 0 }); zeroDecay.peers.B = { lastSeen: 0, sightings: 5, harmAlpha: 3, harmBeta: 9, responses: {} };
  assert.deepEqual(decideWithOptions(zeroDecay, observation(3), random, { outcomeBonus: undefined, forgetting: "keep-estimate" }), decideWithOptions(zeroDecay, observation(3), random, { forgetting: "toward-prior" }));
});
