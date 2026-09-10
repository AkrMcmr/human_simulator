import { clamp } from "../../contracts/src/index.ts";
import type { Observation, RandomSource } from "../../contracts/src/index.ts";
import { decideHuman, type HumanState, type OutcomeBonus } from "./index.ts";

/** Experimental policy. The default three-argument decideHuman remains v0.1.0. */
export const PREDICTIVE_POLICY_VERSION = "0.2.0-experimental.1";
export const PREDICTIVE_POLICY = { gain: 4, cap: .2, minimumSamples: 4, priorSamples: 8 };
export const predictedSafety: OutcomeBonus = (action, human, peerDistance, peerId) => {
  if (peerDistance === null || peerId === null) return 0;
  const memory = human.peers[peerId];
  const estimate = memory?.responses[action];
  if (!estimate || estimate.samples < PREDICTIVE_POLICY.minimumSamples) return 0;
  const confidence = estimate.samples / (estimate.samples + PREDICTIVE_POLICY.priorSamples) / (1 + estimate.variance);
  const harm = memory.harmAlpha / (memory.harmAlpha + memory.harmBeta);
  const risk = (distance: number) => clamp(clamp(1 - distance / 12) * harm + (distance < 1.5 ? .25 : 0));
  const future = Math.max(0, peerDistance + clamp(estimate.mean, -2, 2));
  const bodilyBudget = 1 - Math.max(human.body.hunger, human.body.fatigue, human.body.cold);
  return clamp(PREDICTIVE_POLICY.gain * human.parameters.caution * confidence * bodilyBudget * (risk(peerDistance) - risk(future)), -PREDICTIVE_POLICY.cap, PREDICTIVE_POLICY.cap);
};
export function decidePredictive(human: HumanState, observation: Observation, random: RandomSource) {
  return decideHuman(human, observation, random, predictedSafety);
}
