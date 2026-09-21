import protocolValence8 from "../protocols/valence-v8.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** valence-v8: the valence-v7 world with the corrected mirror-by-production candidate (own voice recorded before coupling, bad voice kept apart from the good one), its deaf control and the ceiling (decision 0044). */
export const protocol = protocolValence8 as unknown as ReferentialProtocol;
export function runValence8Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
