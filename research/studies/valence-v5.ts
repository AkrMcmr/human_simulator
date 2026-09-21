import protocolValence5 from "../protocols/valence-v5.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** valence-v5: the rotting world with one toxic patch in three, the restrained disgust-call candidate and its deaf control (decision 0041). */
export const protocol = protocolValence5 as unknown as ReferentialProtocol;
export function runValence5Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
