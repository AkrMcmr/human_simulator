import protocolConvention from "../protocols/convention-v1.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** convention-v1: the four-forager world of referential-v5; gates on convergence and arbitrariness of imitated food voices plus their use by listeners (decision 0022). */
export const protocol = protocolConvention as unknown as ReferentialProtocol;
export function runConventionPartition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
