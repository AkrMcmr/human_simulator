import protocolTransmission2 from "../protocols/transmission-v2.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** transmission-v2: transmission-v1 with adoption measured as the share of the newcomer's food calls that fall inside the incumbents' voice, hearing versus deaf newcomer (decision 0029). */
export const protocol = protocolTransmission2 as unknown as ReferentialProtocol;
export function runTransmissionV2Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
