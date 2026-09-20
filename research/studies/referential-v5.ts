import protocolV5 from "../protocols/referential-v5.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** referential-v5: the four-forager world of v4; sound-type use is gated on hunger (cost avoidance) instead of arrival delay (decision 0020). */
export const protocol = protocolV5 as unknown as ReferentialProtocol;
export function runReferentialV5Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
