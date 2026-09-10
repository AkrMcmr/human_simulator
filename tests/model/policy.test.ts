import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHuman } from "../../packages/human/src/index.ts";
import { predictedSafety } from "../../packages/human/src/predictive-policy.ts";
import { runEvaluation } from "../../packages/evaluation/src/index.ts";
import { trialRun, baselineModel, ablatedModel, candidateModel } from "../../research/studies/policy-v1.ts";

test("default policy preserves all recorded core-v1 measurements", () => {
  const saved = JSON.parse(readFileSync("research/baselines/v0.1.0-core-v1.json", "utf8"));
  // JSON records normalize negative zero; compare in the same serialized domain.
  assert.deepEqual(JSON.parse(JSON.stringify(runEvaluation().partitions)), saved.evaluation.partitions);
});

test("prediction bonus uses learned local evidence and falls away under bodily urgency", () => {
  const human = createHuman("A", {}, { hunger: 0, fatigue: 0, cold: 0 });
  assert.equal(predictedSafety("observe", human, 4, "B"), 0);
  human.peers.B = { lastSeen: 0, sightings: 20, harmAlpha: 1, harmBeta: 1,
    responses: { observe: { mean: 1, variance: 0, samples: 20 } } };
  const before = structuredClone(human);
  const positive = predictedSafety("observe", human, 4, "B");
  assert.ok(positive > 0 && positive <= .2);
  assert.equal(predictedSafety("observe", human, null, null), 0);
  assert.deepEqual(human, before);
  human.peers.B.responses.observe!.variance = 10;
  assert.ok(predictedSafety("observe", human, 4, "B") < positive);
  human.peers.B.responses.observe!.mean = -1;
  assert.ok(predictedSafety("observe", human, 4, "B") < 0);
  human.body.hunger = 1;
  assert.equal(Math.abs(predictedSafety("observe", human, 4, "B")), 0);
});

test("controlled reversal is reproducible and removing the bonus recovers baseline", () => {
  const baseline = trialRun(baselineModel, 2001, "reversal");
  assert.deepEqual(trialRun(ablatedModel, 2001, "reversal"), baseline);
  const candidate = trialRun(candidateModel, 2001, "reversal");
  assert.deepEqual(trialRun(candidateModel, 2001, "reversal"), candidate);
  assert.notDeepEqual(candidate.choices, baseline.choices);
});
