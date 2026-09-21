import protocolValence7 from "../protocols/valence-v7.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** valence-v7: the rotting one-in-three-toxic world with richer patches (amount 6), the mirror-by-production candidate, its deaf control, the ceiling control and paired checks (decision 0043). */
export const protocol = protocolValence7 as unknown as ReferentialProtocol;
export function runValence7Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
