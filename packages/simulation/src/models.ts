import type { Observation, RandomSource } from "../../contracts/src/index.ts";
import { applyPhysicalEffect, createHuman, decideHuman, HUMAN_VERSION } from "../../human/src/index.ts";
import { decidePredictive, PREDICTIVE_POLICY_VERSION } from "../../human/src/predictive-policy.ts";
import type { HumanState } from "../../human/src/index.ts";

/**
 * Explicit registry of runnable human models. The default entry is the only one the
 * simulation uses when a configuration omits `model`; candidates and controls must be named.
 * Entries are never silently re-pointed: a behavior change gets a new id and version.
 */
export type HumanModel = {
  id: string; version: string; role: "default" | "candidate" | "control"; label: string;
  create: typeof createHuman;
  decide: (human: HumanState, observation: Observation, random: RandomSource) => ReturnType<typeof decideHuman>;
  apply: typeof applyPhysicalEffect;
};
export const DEFAULT_MODEL_ID = "human-0.1.0";
export const HUMAN_MODELS: Readonly<Record<string, HumanModel>> = Object.freeze({
  "human-0.1.0": { id: "human-0.1.0", version: HUMAN_VERSION, role: "default", label: "既定 0.1.0", create: createHuman, decide: decideHuman, apply: applyPhysicalEffect },
  "predictive-0.2.0-experimental.1": { id: "predictive-0.2.0-experimental.1", version: PREDICTIVE_POLICY_VERSION, role: "candidate", label: "候補 予測効用 0.2.0-experimental.1", create: createHuman, decide: decidePredictive, apply: applyPhysicalEffect },
  "predictive-ablated-0.2.0-experimental.1": { id: "predictive-ablated-0.2.0-experimental.1", version: PREDICTIVE_POLICY_VERSION + "+ablated", role: "control", label: "対照 候補の寄与無効", create: createHuman, decide: (h, o, r) => decideHuman(h, o, r, () => 0), apply: applyPhysicalEffect },
});
export const MODEL_IDS = Object.freeze(Object.keys(HUMAN_MODELS));
export function resolveModel(id: string | undefined): HumanModel {
  const key = id ?? DEFAULT_MODEL_ID;
  if (!Object.hasOwn(HUMAN_MODELS, key)) throw new Error("未知の人間モデルIDです: " + String(id));
  return HUMAN_MODELS[key];
}
