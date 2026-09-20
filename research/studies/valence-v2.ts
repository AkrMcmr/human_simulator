import protocolValence2 from "../protocols/valence-v2.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** valence-v2: valence-v1 in the rotting-food world (0.6.0, patches vanish after 500 ticks), so an avoided toxic patch no longer blocks the spawn sequence (decision 0038). */
export const protocol = protocolValence2 as unknown as ReferentialProtocol;
export function runValence2Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
