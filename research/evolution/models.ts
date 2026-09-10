import { createHuman, decideHuman, applyPhysicalEffect } from "../../packages/human/src/index.ts";
import { decidePredictive } from "../../packages/human/src/predictive-policy.ts";
import type { ModelAdapter } from "../../packages/evaluation/src/index.ts";

// Add new implementations here; old entries remain reproducible until explicitly retired.
export const models: Record<string, ModelAdapter> = {
  "human-0.1.0": { create: createHuman, decide: decideHuman, apply: applyPhysicalEffect },
  "predictive-0.2.0-experimental.1": { create: createHuman, decide: decidePredictive, apply: applyPhysicalEffect },
  "predictive-ablated-0.2.0-experimental.1": { create: createHuman, decide: (h, o, r) => decideHuman(h, o, r, () => 0), apply: applyPhysicalEffect },
};
