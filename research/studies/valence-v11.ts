import protocolValence11 from "../protocols/valence-v11.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** valence-v11: the valence-v10 world with latent poison (world 0.7.0, 40 ticks), the latent-aware strict-association candidate, its deaf control and the latent-aware ceiling (decision 0047). */
export const protocol = protocolValence11 as unknown as ReferentialProtocol;
export function runValence11Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
