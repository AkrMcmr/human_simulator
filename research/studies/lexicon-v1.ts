import protocolLexicon from "../protocols/lexicon-v1.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** lexicon-v1: the four-forager world with moving food and a moving warm place (world 0.4.0); gates on two shared conventional voices, their distinctness, and their late-window use (decision 0025). */
export const protocol = protocolLexicon as unknown as ReferentialProtocol;
export function runLexiconPartition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
