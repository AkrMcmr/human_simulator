import protocolPredator from "../protocols/predator-v1.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** predator-v1: the food world of valence-v7 without poison plus one scripted predator (world 0.8.0); measures attacks, their foreseeability and threat calls (decision 0049). */
export const protocol = protocolPredator as unknown as ReferentialProtocol;
export function runPredatorPartition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
