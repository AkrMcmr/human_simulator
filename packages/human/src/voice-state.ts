import type { Observation, RandomSource } from "../../contracts/src/index.ts";
import type { HumanState } from "./index.ts";
import { decideWithSenderOptions } from "./signal-sender.ts";

/**
 * Candidate 0.6.0-experimental.1: state-coupled voice (user-specified innate capacity, research decision 0013)
 * on top of the sender and receiver learning candidates. COUPLING is the share of each produced sound that
 * follows the speaker's state rather than the chosen base sound; uncalibrated engineering assumption.
 */
export const VOICE_STATE_VERSION = "0.6.0-experimental.1";
export const VOICE_STATE = { coupling: 0.6 };
/** Full stack: coupled voice, sender learning, receiver association. */
export const decideVoiceState = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r, { stateCoupling: VOICE_STATE.coupling });
/** Coupled voice with receiver association but no sender learning. */
export const decideVoiceStateReceiver = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r, { stateCoupling: VOICE_STATE.coupling, sender: false });
/** Coupled voice alone on the default model: structure in the world, but nobody learns from it. */
export const decideVoiceStateOnly = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r, { stateCoupling: VOICE_STATE.coupling, sender: false, receiver: false });
