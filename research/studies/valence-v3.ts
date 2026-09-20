import protocolValence3 from "../protocols/valence-v3.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** valence-v3: the valence-v2 rotting world with the taste-aversion candidate and its private-aversion control (decision 0039). */
export const protocol = protocolValence3 as unknown as ReferentialProtocol;
export function runValence3Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
