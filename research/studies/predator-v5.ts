import protocolPredator5 from "../protocols/predator-v5.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** predator-v5: the predator-v4 world and gates with the "afraid" imitation context for the threat voice (decision 0053), its deaf control and the innate-alarm ceiling; fresh seeds. */
export const protocol = protocolPredator5 as unknown as ReferentialProtocol;
export function runPredator5Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
