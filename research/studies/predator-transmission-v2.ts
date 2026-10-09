import protocolPredatorTransmission2 from "../protocols/predator-transmission-v2.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** predator-transmission-v2: predator-transmission-v1 with the newcomer living 6000 ticks (horizon 7500, replacement at 1500); decision 0056. */
export const protocol = protocolPredatorTransmission2 as unknown as ReferentialProtocol;
export function runPredatorTransmission2Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
