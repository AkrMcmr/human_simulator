import protocolValence from "../protocols/valence-v1.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** valence-v1: the four-forager spawning world where every second spawned patch is toxic; gates on a shared good-food voice, a shared bad-food voice, their distinctness, and less poison eaten when voices are audible (decision 0037). */
export const protocol = protocolValence as unknown as ReferentialProtocol;
export function runValencePartition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
