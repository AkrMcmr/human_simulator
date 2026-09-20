import { decideSoundAssociation, decideAssociationOff, decideClassificationOff, decideAttentionOff, decideSoundPolicyOff, SOUND_ASSOCIATION_VERSION } from "../../human/src/sound-association.ts";
import { decideSignalSender, decideSignalSenderOnly, decideSignalSenderOff, SIGNAL_SENDER_VERSION } from "../../human/src/signal-sender.ts";
import { decideVoiceState, decideVoiceStateReceiver, decideVoiceStateOnly, VOICE_STATE_VERSION } from "../../human/src/voice-state.ts";
import { decideForagerListener, decideForagerListenerOnly, decideSelectiveForager, decideFoodCallForager, decideFoodCallSelective, decideFoodCallOnly, decideEatingSelective, decideEatingBlind, decideEatingReferent, decideFoodCallReferent, decideLearnedCaller, decideConvention, decideConventionNoImitation, decideConventionContrast, applyWithIntake, FORAGER_LISTENER_VERSION, SELECTIVE_FORAGER_VERSION, FOOD_CALL_VERSION, EATING_VOICE_VERSION, REFERENT_LEARNER_VERSION, LEARNED_CALLER_VERSION, CONVENTION_VERSION } from "../../human/src/forager-listener.ts";
import type { Observation, RandomSource } from "../../contracts/src/index.ts";
import { applyPhysicalEffect, createHuman, decideHuman, decideLegacyHuman, HUMAN_VERSION, LEGACY_HUMAN_VERSION } from "../../human/src/index.ts";
import { decidePredictive, PREDICTIVE_POLICY_VERSION } from "../../human/src/predictive-policy.ts";
import { decideKeepEstimate, decideKeepEstimateAblated, KEEP_ESTIMATE_FORGETTING_VERSION } from "../../human/src/forgetting-policy.ts";
import type { HumanState } from "../../human/src/index.ts";

/**
 * Explicit registry of runnable human models. The default entry is the only one the
 * simulation uses when a configuration omits `model`; other entries must be named.
 * Entries are never silently re-pointed: a behavior change gets a new id and version.
 */
export type HumanModel = {
  id: string; version: string; role: "default" | "legacy" | "candidate" | "control"; label: string;
  create: typeof createHuman;
  decide: (human: HumanState, observation: Observation, random: RandomSource) => ReturnType<typeof decideHuman>;
  apply: typeof applyPhysicalEffect;
};
export const DEFAULT_MODEL_ID = "human-0.2.0";
export const HUMAN_MODELS: Readonly<Record<string, HumanModel>> = Object.freeze({
  "human-0.2.0": { id: "human-0.2.0", version: HUMAN_VERSION, role: "default", label: "既定 0.2.0（予測効用あり）", create: createHuman, decide: decideHuman, apply: applyPhysicalEffect },
  "human-0.1.0": { id: "human-0.1.0", version: LEGACY_HUMAN_VERSION, role: "legacy", label: "旧既定 0.1.0", create: createHuman, decide: decideLegacyHuman, apply: applyPhysicalEffect },
  "predictive-0.2.0-experimental.1": { id: "predictive-0.2.0-experimental.1", version: PREDICTIVE_POLICY_VERSION, role: "candidate", label: "候補 0.2.0-experimental.1（0.2.0と同じ計算）", create: createHuman, decide: decidePredictive, apply: applyPhysicalEffect },
  "predictive-ablated-0.2.0-experimental.1": { id: "predictive-ablated-0.2.0-experimental.1", version: PREDICTIVE_POLICY_VERSION + "+ablated", role: "control", label: "対照 予測効用の寄与無効", create: createHuman, decide: (h, o, r) => decideHuman(h, o, r, () => 0), apply: applyPhysicalEffect },
  "forgetting-keep-estimate-0.3.0-experimental.1": { id: "forgetting-keep-estimate-0.3.0-experimental.1", version: KEEP_ESTIMATE_FORGETTING_VERSION, role: "candidate", label: "候補 忘却は確信だけ薄れる 0.3.0-experimental.1", create: createHuman, decide: decideKeepEstimate, apply: applyPhysicalEffect },
  "forgetting-keep-estimate-ablated-0.3.0-experimental.1": { id: "forgetting-keep-estimate-ablated-0.3.0-experimental.1", version: KEEP_ESTIMATE_FORGETTING_VERSION + "+ablated", role: "control", label: "対照 忘却則を旧版に戻した候補（0.2.0と同じ計算）", create: createHuman, decide: decideKeepEstimateAblated, apply: applyPhysicalEffect },
  "sound-association-0.4.0-experimental.1": { id: "sound-association-0.4.0-experimental.1", version: SOUND_ASSOCIATION_VERSION, role: "candidate", label: "音条件付き距離予測", create: createHuman, decide: decideSoundAssociation, apply: applyPhysicalEffect },
  "sound-association-off-0.4.0-experimental.1": { id: "sound-association-off-0.4.0-experimental.1", version: SOUND_ASSOCIATION_VERSION + "+sound-association-off", role: "control", label: "音の関連学習なし", create: createHuman, decide: decideAssociationOff, apply: applyPhysicalEffect },
  "sound-classification-off-0.4.0-experimental.1": { id: "sound-classification-off-0.4.0-experimental.1", version: SOUND_ASSOCIATION_VERSION + "+sound-classification-off", role: "control", label: "音の分類なし", create: createHuman, decide: decideClassificationOff, apply: applyPhysicalEffect },
  "sound-attention-off-0.4.0-experimental.1": { id: "sound-attention-off-0.4.0-experimental.1", version: SOUND_ASSOCIATION_VERSION + "+sound-attention-off", role: "control", label: "音への注意なし", create: createHuman, decide: decideAttentionOff, apply: applyPhysicalEffect },
  "sound-policy-off-0.4.0-experimental.1": { id: "sound-policy-off-0.4.0-experimental.1", version: SOUND_ASSOCIATION_VERSION + "+sound-policy-off", role: "control", label: "音予測の効用寄与なし", create: createHuman, decide: decideSoundPolicyOff, apply: applyPhysicalEffect },
  "signal-sender-0.5.0-experimental.1": { id: "signal-sender-0.5.0-experimental.1", version: SIGNAL_SENDER_VERSION, role: "candidate", label: "候補 発し手の音選択＋受信側の音条件付き予測", create: createHuman, decide: decideSignalSender, apply: applyPhysicalEffect },
  "signal-sender-only-0.5.0-experimental.1": { id: "signal-sender-only-0.5.0-experimental.1", version: SIGNAL_SENDER_VERSION + "+receiver-off", role: "control", label: "対照 発し手の音選択のみ（受信側なし）", create: createHuman, decide: decideSignalSenderOnly, apply: applyPhysicalEffect },
  "signal-sender-off-0.5.0-experimental.1": { id: "signal-sender-off-0.5.0-experimental.1", version: SIGNAL_SENDER_VERSION + "+sender-off", role: "control", label: "対照 発し手の音選択なし（受信側候補と同じ計算）", create: createHuman, decide: decideSignalSenderOff, apply: applyPhysicalEffect },
  "voice-state-0.6.0-experimental.1": { id: "voice-state-0.6.0-experimental.1", version: VOICE_STATE_VERSION, role: "candidate", label: "候補 状態連動の声＋発し手学習＋受信側学習", create: createHuman, decide: decideVoiceState, apply: applyPhysicalEffect },
  "voice-state-receiver-0.6.0-experimental.1": { id: "voice-state-receiver-0.6.0-experimental.1", version: VOICE_STATE_VERSION + "+sender-off", role: "control", label: "対照 状態連動の声＋受信側学習のみ", create: createHuman, decide: decideVoiceStateReceiver, apply: applyPhysicalEffect },
  "voice-state-only-0.6.0-experimental.1": { id: "voice-state-only-0.6.0-experimental.1", version: VOICE_STATE_VERSION + "+learning-off", role: "control", label: "対照 状態連動の声のみ（学習なし）", create: createHuman, decide: decideVoiceStateOnly, apply: applyPhysicalEffect },
  "forager-listener-0.7.0-experimental.1": { id: "forager-listener-0.7.0-experimental.1", version: FORAGER_LISTENER_VERSION, role: "candidate", label: "候補 声の方向へ探索＋状態連動の声＋学習", create: createHuman, decide: decideForagerListener, apply: applyPhysicalEffect },
  "forager-listener-only-0.7.0-experimental.1": { id: "forager-listener-only-0.7.0-experimental.1", version: FORAGER_LISTENER_VERSION + "+orienting-only", role: "control", label: "対照 声の方向へ探索のみ（既定0.2.0に追加）", create: createHuman, decide: decideForagerListenerOnly, apply: applyPhysicalEffect },
  "selective-forager-0.7.0-experimental.2": { id: "selective-forager-0.7.0-experimental.2", version: SELECTIVE_FORAGER_VERSION, role: "candidate", label: "候補 結果を学んで声の種類を選んで探索", create: createHuman, decide: (h, o, r) => decideSelectiveForager(h, o, r), apply: applyPhysicalEffect },
  "food-call-forager-0.8.0-experimental.1": { id: "food-call-forager-0.8.0-experimental.1", version: FOOD_CALL_VERSION, role: "candidate", label: "候補 食後の呼び声＋声の方向へ探索＋学習", create: createHuman, decide: decideFoodCallForager, apply: applyWithIntake },
  "food-call-selective-0.8.0-experimental.1": { id: "food-call-selective-0.8.0-experimental.1", version: FOOD_CALL_VERSION + "+selective", role: "candidate", label: "候補 食後の呼び声＋種類を選んで探索＋学習", create: createHuman, decide: decideFoodCallSelective, apply: applyWithIntake },
  "food-call-only-0.8.0-experimental.1": { id: "food-call-only-0.8.0-experimental.1", version: FOOD_CALL_VERSION + "+call-only", role: "control", label: "対照 食後の呼び声のみ（既定0.2.0に追加、追従なし）", create: createHuman, decide: decideFoodCallOnly, apply: applyWithIntake },
  "eating-voice-selective-0.8.0-experimental.2": { id: "eating-voice-selective-0.8.0-experimental.2", version: EATING_VOICE_VERSION, role: "candidate", label: "候補 食べている状態が声に漏れる＋呼び声＋種類を選んで探索", create: createHuman, decide: decideEatingSelective, apply: applyWithIntake },
  "eating-voice-blind-0.8.0-experimental.2": { id: "eating-voice-blind-0.8.0-experimental.2", version: EATING_VOICE_VERSION + "+blind", role: "control", label: "対照 食べている状態が声に漏れる＋呼び声＋盲目的な定位", create: createHuman, decide: decideEatingBlind, apply: applyWithIntake },
  "eating-voice-referent-0.8.0-experimental.3": { id: "eating-voice-referent-0.8.0-experimental.3", version: REFERENT_LEARNER_VERSION, role: "candidate", label: "候補 声の出所に食料があったかを学び、種類で追う（食べている状態が声に漏れる）", create: createHuman, decide: decideEatingReferent, apply: applyWithIntake },
  "food-call-referent-0.8.0-experimental.3": { id: "food-call-referent-0.8.0-experimental.3", version: REFERENT_LEARNER_VERSION + "+no-eating-voice", role: "control", label: "対照 同じ学習、食べている状態は声に漏れない", create: createHuman, decide: decideFoodCallReferent, apply: applyWithIntake },
  "convention-0.10.0-experimental.1": { id: "convention-0.10.0-experimental.1", version: CONVENTION_VERSION, role: "candidate", label: "候補 食べている時、自分の経験が食料と結びつけた聞いた声を真似て出す（生得の食後の声なし、状態連動0.2）", create: createHuman, decide: (h, o, r) => decideConvention(h, o, r), apply: applyWithIntake },
  "convention-no-imitation-0.10.0-experimental.1": { id: "convention-no-imitation-0.10.0-experimental.1", version: CONVENTION_VERSION + "+no-imitation", role: "control", label: "対照 同じ弱い状態連動と聞き手、真似はしない", create: createHuman, decide: decideConventionNoImitation, apply: applyWithIntake },
  "convention-contrast-0.10.0-experimental.2": { id: "convention-contrast-0.10.0-experimental.2", version: "0.10.0-experimental.2", role: "candidate", label: "候補 食べている時は食料の声を真似、食べていない時はその声を避ける（対比）", create: createHuman, decide: decideConventionContrast, apply: applyWithIntake },
  "learned-caller-0.9.0-experimental.1": { id: "learned-caller-0.9.0-experimental.1", version: LEARNED_CALLER_VERSION, role: "candidate", label: "候補 出所評価＋食べる声に、食後の呼び声が自分の空腹に何をもたらしたかの学習を足す", create: createHuman, decide: decideLearnedCaller, apply: applyWithIntake },
});
export const MODEL_IDS = Object.freeze(Object.keys(HUMAN_MODELS));
export function resolveModel(id: string | undefined): HumanModel {
  const key = id ?? DEFAULT_MODEL_ID;
  if (!Object.hasOwn(HUMAN_MODELS, key)) throw new Error("未知の人間モデルIDです: " + String(id));
  return HUMAN_MODELS[key];
}
