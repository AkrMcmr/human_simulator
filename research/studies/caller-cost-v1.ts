import protocolCaller from "../protocols/caller-cost-v1.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** caller-cost-v1: the four-forager world of referential-v5; the gate is whether a caller that learns its own outcomes gives up food calls when they can be heard (decision 0021). */
export const protocol = protocolCaller as unknown as ReferentialProtocol;
export function runCallerCostPartition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
