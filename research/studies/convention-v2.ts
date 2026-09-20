import protocolConvention2 from "../protocols/convention-v2.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** convention-v2: convention-v1 with the hunger-based gates evaluated over the final third of the run, after the imitated food voice has had time to form (decision 0024). */
export const protocol = protocolConvention2 as unknown as ReferentialProtocol;
export function runConventionV2Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
