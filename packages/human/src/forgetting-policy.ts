import type { Observation, RandomSource } from "../../contracts/src/index.ts";
import { decideWithOptions, predictedSafety, type HumanState } from "./index.ts";

/**
 * Candidate: harm evidence forgets its confidence but keeps its estimate.
 * Everything else equals human 0.2.0. Evidence: research/decisions/0007 (prospective).
 */
export const KEEP_ESTIMATE_FORGETTING_VERSION = "0.3.0-experimental.1";
export function decideKeepEstimate(human: HumanState, observation: Observation, random: RandomSource) {
  return decideWithOptions(human, observation, random, { outcomeBonus: predictedSafety, forgetting: "keep-estimate" });
}
/** Ablated control: the new forgetting rule removed, i.e. exactly human 0.2.0 under a distinct id. */
export function decideKeepEstimateAblated(human: HumanState, observation: Observation, random: RandomSource) {
  return decideWithOptions(human, observation, random, { outcomeBonus: predictedSafety, forgetting: "toward-prior" });
}
