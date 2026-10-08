import protocolPredatorTransmission from "../protocols/predator-transmission-v1.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** predator-transmission-v1: the predator-v5 world with a naive newcomer replacing D at tick 1500 of 4500; does it adopt both voices and the warning's meaning without teaching (decision 0055)? */
export const protocol = protocolPredatorTransmission as unknown as ReferentialProtocol;
export function runPredatorTransmissionPartition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
