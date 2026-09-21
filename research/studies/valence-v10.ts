import protocolValence10 from "../protocols/valence-v10.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** valence-v10: the seven-slot rotting world with one toxic patch in two, the episode-counted strict-association candidate, its deaf control and the ceiling (decision 0046). */
export const protocol = protocolValence10 as unknown as ReferentialProtocol;
export function runValence10Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
