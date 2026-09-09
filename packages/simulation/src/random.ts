import type { RandomSource } from "../../contracts/src/index.ts";
export const RNG_VERSION = "keyed-fnv-mulberry-v1";
/**
 * Stateless, keyed random draws. UI reads, agent array order, and other agents'
 * extra draws cannot advance this agent's stream. Checkpoint needs seed + tick.
 */
export function keyedRandom(seed: number, stream: string, tick: number): RandomSource {
  return (purpose: string, index = 0) => {
    const key = seed + "|" + stream + "|" + tick + "|" + purpose + "|" + index;
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    let t = (h + 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
