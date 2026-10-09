import protocolPredator6 from "../protocols/predator-v6.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** predator-v6: the predator-v5 world and gates with contrast imitation of the threat voice (decision 0057), its deaf control and the innate-alarm ceiling; fresh seeds. */
export const protocol = protocolPredator6 as unknown as ReferentialProtocol;
export function runPredator6Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
