import protocolValence9 from "../protocols/valence-v9.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** valence-v9: the valence-v7 world with the strict-association candidate (a heard category warns only after the individual was poisoned where it was heard), its deaf control and the ceiling (decision 0045). */
export const protocol = protocolValence9 as unknown as ReferentialProtocol;
export function runValence9Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
