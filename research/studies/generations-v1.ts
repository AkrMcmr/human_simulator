import protocolGenerations from "../protocols/generations-v1.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** generations-v1: the convention-v2 world over 3600 ticks with every original individual replaced in turn; gates on the late convention and its continuity with the voice the founders made (decision 0030). */
export const protocol = protocolGenerations as unknown as ReferentialProtocol;
export function runGenerationsPartition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
