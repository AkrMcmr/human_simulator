import { decideSoundAssociation, decideAssociationOff, decideClassificationOff, decideAttentionOff, decideSoundPolicyOff } from "../../packages/human/src/sound-association.ts";
import { decideSignalSender, decideSignalSenderOnly, decideSignalSenderOff } from "../../packages/human/src/signal-sender.ts";
import { createHuman, decideHuman, decideLegacyHuman, applyPhysicalEffect } from "../../packages/human/src/index.ts";
import { decidePredictive } from "../../packages/human/src/predictive-policy.ts";
import { decideKeepEstimate, decideKeepEstimateAblated } from "../../packages/human/src/forgetting-policy.ts";
import type { ModelAdapter } from "../../packages/evaluation/src/index.ts";

// Add new implementations here; old entries remain reproducible until explicitly retired.
// Must agree with packages/simulation/src/models.ts (checked by tests/model/selection.test.ts).
export const models: Record<string, ModelAdapter> = {
  "human-0.2.0": { create: createHuman, decide: decideHuman, apply: applyPhysicalEffect },
  "human-0.1.0": { create: createHuman, decide: decideLegacyHuman, apply: applyPhysicalEffect },
  "predictive-0.2.0-experimental.1": { create: createHuman, decide: decidePredictive, apply: applyPhysicalEffect },
  "predictive-ablated-0.2.0-experimental.1": { create: createHuman, decide: (h, o, r) => decideHuman(h, o, r, () => 0), apply: applyPhysicalEffect },
  "forgetting-keep-estimate-0.3.0-experimental.1": { create: createHuman, decide: decideKeepEstimate, apply: applyPhysicalEffect },
  "forgetting-keep-estimate-ablated-0.3.0-experimental.1": { create: createHuman, decide: decideKeepEstimateAblated, apply: applyPhysicalEffect },
  "sound-association-0.4.0-experimental.1": { create: createHuman, decide: decideSoundAssociation, apply: applyPhysicalEffect },
  "sound-association-off-0.4.0-experimental.1": { create: createHuman, decide: decideAssociationOff, apply: applyPhysicalEffect },
  "sound-classification-off-0.4.0-experimental.1": { create: createHuman, decide: decideClassificationOff, apply: applyPhysicalEffect },
  "sound-attention-off-0.4.0-experimental.1": { create: createHuman, decide: decideAttentionOff, apply: applyPhysicalEffect },
  "sound-policy-off-0.4.0-experimental.1": { create: createHuman, decide: decideSoundPolicyOff, apply: applyPhysicalEffect },
  "signal-sender-0.5.0-experimental.1": { create: createHuman, decide: decideSignalSender, apply: applyPhysicalEffect },
  "signal-sender-only-0.5.0-experimental.1": { create: createHuman, decide: decideSignalSenderOnly, apply: applyPhysicalEffect },
  "signal-sender-off-0.5.0-experimental.1": { create: createHuman, decide: decideSignalSenderOff, apply: applyPhysicalEffect },
};
