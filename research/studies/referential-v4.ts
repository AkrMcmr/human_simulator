import protocolV4 from "../protocols/referential-v4.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** referential-v4: the recurring-discovery world of v3 with four individuals, so a needy listener hears several voices from different places at once and choosing among them by type can matter. */
export const protocol = protocolV4 as unknown as ReferentialProtocol;
export function runReferentialV4Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
