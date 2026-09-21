import protocolValence6 from "../protocols/valence-v6.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** valence-v6: the valence-v5 world with the fast restrained caller, its deaf control, an innate-alarm ceiling control, and paired checks (decision 0042). */
export const protocol = protocolValence6 as unknown as ReferentialProtocol;
export function runValence6Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
