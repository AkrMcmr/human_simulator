import protocolV3 from "../protocols/referential-v3.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** referential-v3: recurring discovery. Food never regrows; a spent patch stays visible and a fresh one appears at the next fixed position (world 0.3.0). The primary measure is the second individual's arrival delay per patch. */
export const protocol = protocolV3 as unknown as ReferentialProtocol;
export function runReferentialV3Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
