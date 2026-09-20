import protocolTransmission from "../protocols/transmission-v1.json" with { type: "json" };
import { runReferentialPartition, type ReferentialProtocol } from "./referential-v1.ts";

/** transmission-v1: the convention-v2 world with one individual replaced by a naive newcomer at tick 1500; gates on the incumbents' convention and the newcomer's adoption and benefit (decision 0028). */
export const protocol = protocolTransmission as unknown as ReferentialProtocol;
export function runTransmissionPartition(name: "development" | "validation" | "pilot", modelId: string, round = "1") {
  return runReferentialPartition(name, modelId, protocol, round);
}
