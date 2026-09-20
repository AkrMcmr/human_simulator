import protocolGenerations2 from "../protocols/generations-v2.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** generations-v2: generations-v1 with a wider pre-replacement window (800-1600), replacements at 1600-2800 and a 4000-tick run (decision 0032). */
export const protocol = protocolGenerations2 as unknown as ReferentialProtocol;
export function runGenerationsV2Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
