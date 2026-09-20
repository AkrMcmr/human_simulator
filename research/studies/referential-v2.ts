import protocolV2 from "../protocols/referential-v2.json" with { type: "json" };
import { runReferentialPartition, runSeed, checkValue, assessSeeds, type ReferentialProtocol } from "./referential-v1.ts";
/** referential-v2: same evaluator as v1 with the v2 protocol (larger food patches, latency as the primary measure). */
export const protocol = protocolV2 as unknown as ReferentialProtocol;
export const runReferentialV2Partition = (name: "development" | "validation" | "pilot", modelId: string) => runReferentialPartition(name, modelId, protocol);
export const runSeedV2 = (modelId: string, seed: number) => runSeed(modelId, seed, protocol);
export const checkValueV2 = (id: string, r: ReturnType<typeof runSeedV2>) => checkValue(id, r, protocol);
export const assessSeedsV2 = (name: string, results: ReturnType<typeof runSeedV2>[]) => assessSeeds(name, results, protocol);
