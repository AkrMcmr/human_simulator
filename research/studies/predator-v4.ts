import protocolPredator4 from "../protocols/predator-v4.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** predator-v4: the predator-v3 world and controls with the within-reach association candidate (decision 0052); paired gate "deaf − candidate" of 1.0 attack per run, fresh seeds. */
export const protocol = protocolPredator4 as unknown as ReferentialProtocol;
export function runPredator4Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
