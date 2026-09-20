import protocolLexicon2 from "../protocols/lexicon-v2.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** lexicon-v2: lexicon-v1 with scarce, hard-to-find warmth (one small warm place on a 300-tick cycle, ambient cold 0.8), so warmth also carries an information asymmetry (decision 0027). */
export const protocol = protocolLexicon2 as unknown as ReferentialProtocol;
export function runLexiconV2Partition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
