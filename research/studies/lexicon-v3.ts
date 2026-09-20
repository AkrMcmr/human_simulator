import protocolLexicon3 from "../protocols/lexicon-v3.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** lexicon-v3: two small warm places on a 300-tick cycle with ambient cold 0.8, between the abundant warmth of v1 and the scarce warmth of v2 (decision 0034). */
export const protocol = protocolLexicon3 as unknown as ReferentialProtocol;
export function runLexiconV3Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
