import { decideSoundAssociation, decideAssociationOff, decideClassificationOff, decideAttentionOff, decideSoundPolicyOff } from "../../packages/human/src/sound-association.ts";
import { decideSignalSender, decideSignalSenderOnly, decideSignalSenderOff } from "../../packages/human/src/signal-sender.ts";
import { decideVoiceState, decideVoiceStateReceiver, decideVoiceStateOnly } from "../../packages/human/src/voice-state.ts";
import { decideLexicon, decideLexiconTransient, decideLexiconMemory, decideLexiconSeparate, decideLexiconFine } from "../../packages/human/src/lexicon.ts";
import { decideForagerListener, decideForagerListenerOnly, decideSelectiveForager, decideFoodCallForager, decideFoodCallSelective, decideFoodCallOnly, decideEatingSelective, decideEatingBlind, decideEatingReferent, decideFoodCallReferent, decideLearnedCaller, decideConvention, decideConventionNoImitation, decideConventionContrast, applyWithIntake } from "../../packages/human/src/forager-listener.ts";
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
  "voice-state-0.6.0-experimental.1": { create: createHuman, decide: decideVoiceState, apply: applyPhysicalEffect },
  "voice-state-receiver-0.6.0-experimental.1": { create: createHuman, decide: decideVoiceStateReceiver, apply: applyPhysicalEffect },
  "voice-state-only-0.6.0-experimental.1": { create: createHuman, decide: decideVoiceStateOnly, apply: applyPhysicalEffect },
  "forager-listener-0.7.0-experimental.1": { create: createHuman, decide: decideForagerListener, apply: applyPhysicalEffect },
  "forager-listener-only-0.7.0-experimental.1": { create: createHuman, decide: decideForagerListenerOnly, apply: applyPhysicalEffect },
  "selective-forager-0.7.0-experimental.2": { create: createHuman, decide: (h, o, r) => decideSelectiveForager(h, o, r), apply: applyPhysicalEffect },
  "food-call-forager-0.8.0-experimental.1": { create: createHuman, decide: decideFoodCallForager, apply: applyWithIntake },
  "food-call-selective-0.8.0-experimental.1": { create: createHuman, decide: decideFoodCallSelective, apply: applyWithIntake },
  "food-call-only-0.8.0-experimental.1": { create: createHuman, decide: decideFoodCallOnly, apply: applyWithIntake },
  "eating-voice-selective-0.8.0-experimental.2": { create: createHuman, decide: decideEatingSelective, apply: applyWithIntake },
  "eating-voice-blind-0.8.0-experimental.2": { create: createHuman, decide: decideEatingBlind, apply: applyWithIntake },
  "eating-voice-referent-0.8.0-experimental.3": { create: createHuman, decide: decideEatingReferent, apply: applyWithIntake },
  "food-call-referent-0.8.0-experimental.3": { create: createHuman, decide: decideFoodCallReferent, apply: applyWithIntake },
  "learned-caller-0.9.0-experimental.1": { create: createHuman, decide: decideLearnedCaller, apply: applyWithIntake },
  "convention-0.10.0-experimental.1": { create: createHuman, decide: (h, o, r) => decideConvention(h, o, r), apply: applyWithIntake },
  "convention-no-imitation-0.10.0-experimental.1": { create: createHuman, decide: decideConventionNoImitation, apply: applyWithIntake },
  "convention-contrast-0.10.0-experimental.2": { create: createHuman, decide: decideConventionContrast, apply: applyWithIntake },
  "lexicon-0.11.0-experimental.1": { create: createHuman, decide: (h, o, r) => decideLexicon(h, o, r), apply: applyWithIntake },
  "lexicon-0.11.0-experimental.2": { create: createHuman, decide: decideLexiconTransient, apply: applyWithIntake },
  "lexicon-0.11.0-experimental.3": { create: createHuman, decide: decideLexiconMemory, apply: applyWithIntake },
  "lexicon-0.11.0-experimental.4": { create: createHuman, decide: decideLexiconSeparate, apply: applyWithIntake },
  "lexicon-0.11.0-experimental.5": { create: createHuman, decide: decideLexiconFine, apply: applyWithIntake },
};
