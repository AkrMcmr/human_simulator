import protocolPredator2 from "../protocols/predator-v2.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** predator-v2: the predator-v1 world with the threat candidate (flight, threat voice, strict-association warning), its deaf control and the innate-alarm ceiling; whole-run paired gate (decision 0050). */
export const protocol = protocolPredator2 as unknown as ReferentialProtocol;
export function runPredator2Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
