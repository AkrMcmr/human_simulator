import protocolValence4 from "../protocols/valence-v4.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** valence-v4: the valence-v2 rotting world with the disgust-call candidate, its deaf control, and unit-based poison gates (decision 0040). */
export const protocol = protocolValence4 as unknown as ReferentialProtocol;
export function runValence4Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
