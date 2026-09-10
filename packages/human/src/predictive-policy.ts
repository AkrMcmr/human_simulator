import type { Observation, RandomSource } from "../../contracts/src/index.ts";
import { decideHuman, predictedSafety, PREDICTIVE_POLICY, type HumanState } from "./index.ts";

/**
 * Historical entry point of the candidate that became the default in human 0.2.0.
 * The computation is identical to decideHuman's default; the id stays so recorded studies remain reproducible.
 */
export const PREDICTIVE_POLICY_VERSION = "0.2.0-experimental.1";
export { predictedSafety, PREDICTIVE_POLICY };
export function decidePredictive(human: HumanState, observation: Observation, random: RandomSource) {
  return decideHuman(human, observation, random, predictedSafety);
}
