import protocolPredator3 from "../protocols/predator-v3.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** predator-v3: the predator-v2 1.6.0 world with the cry-while-fleeing candidate (decision 0051), its deaf control and the innate-alarm ceiling; paired gate "deaf − candidate" of 1.0 attack per run. */
export const protocol = protocolPredator3 as unknown as ReferentialProtocol;
export function runPredator3Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
