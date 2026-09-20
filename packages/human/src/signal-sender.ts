import { clamp, magnitude, soundDistance } from "../../contracts/src/index.ts";
import type { Observation, RandomSource, SoundShape } from "../../contracts/src/index.ts";
import type { Estimate, HumanState, SoundChoice } from "./index.ts";
import { decideWithSoundOptions } from "./sound-association.ts";

/**
 * Candidate 0.5.0-experimental.1: the speaker learns, per produced sound category and per peer, how the
 * distance to that peer changed after the sound, and chooses which category to produce by the same
 * risk-reduction estimate the default model already uses for actions. No fixed meaning is attached to any
 * sound; the mapping is the individual's own locally observed correlation. Combined with the receiver
 * candidate (sound-association) unless disabled through options.
 */
export const SIGNAL_SENDER_VERSION = "0.5.0-experimental.1";
export const SENDER = { minimumSamples: 4, priorSamples: 8, temperature: 0.05, exploreNew: 0.2, gain: 4, cap: .2 };
export type SenderOptions = { sender?: boolean; receiver?: boolean; stateCoupling?: number };
type SenderState = HumanState & { voiceResponses?: Record<string, Record<number, Estimate>>; voicePending?: { peerId: string; category: number; distance: number } | null };

function riskAt(human: HumanState, peerId: string, distance: number) {
  const m = human.peers[peerId];
  const harm = m ? m.harmAlpha / (m.harmAlpha + m.harmBeta) : .5;
  return clamp(clamp(1 - distance / 12) * harm + (distance < 1.5 ? .25 : 0));
}
/** Score of producing category k now: predicted risk reduction, weighted by experience and inverse variance. */
export function categoryScore(human: HumanState, peerId: string, distance: number, estimate: Estimate | undefined): number | null {
  if (!estimate || estimate.samples < SENDER.minimumSamples) return null;
  const confidence = estimate.samples / (estimate.samples + SENDER.priorSamples) / (1 + estimate.variance);
  const future = Math.max(0, distance + clamp(estimate.mean, -2, 2));
  const budget = 1 - Math.max(human.body.hunger, human.body.fatigue, human.body.cold);
  return clamp(SENDER.gain * human.parameters.caution * budget * confidence * (riskAt(human, peerId, distance) - riskAt(human, peerId, future)), -SENDER.cap, SENDER.cap);
}
export const chooseSignalSound: SoundChoice = (human, peerId, peerDistance, random) => {
  if (peerId === null || peerDistance === null) return null;
  const responses = (human as SenderState).voiceResponses?.[peerId];
  if (!responses) return null;
  const scored = human.producedSounds.map(c => ({ shape: c.shape, score: categoryScore(human, peerId, peerDistance, responses[c.id]) })).filter((x): x is { shape: SoundShape; score: number } => x.score !== null);
  if (!scored.length) return null;
  // Keep trying new or unscored sounds sometimes so learned preferences do not freeze the repertoire.
  if (random("signal-explore") < SENDER.exploreNew) return null;
  const top = Math.max(...scored.map(s => s.score));
  const weights = scored.map(s => Math.exp((s.score - top) / SENDER.temperature));
  let draw = random("signal-softmax") * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scored.length; i++) { draw -= weights[i]; if (draw <= 0) return scored[i].shape; }
  return scored[scored.length - 1].shape;
};
export function decideWithSenderOptions(previous: HumanState, observation: Observation, random: RandomSource, options: SenderOptions = {}) {
  const human: SenderState = structuredClone(previous);
  const animals = observation.animals.filter(a => a.morphologySimilarity >= .7).sort((a, b) => magnitude(a.relativePosition) - magnitude(b.relativePosition) || a.trackId.localeCompare(b.trackId));
  const peer = animals[0];
  // Learn what followed the last produced category: the next locally observed distance to the same peer.
  const pending = human.voicePending;
  if (options.sender !== false && pending && human.parameters.learningRate > 0) {
    const seen = animals.find(a => a.trackId === pending.peerId);
    if (seen && human.producedSounds.some(c => c.id === pending.category)) {
      human.voiceResponses ??= {};
      const memories = human.voiceResponses[pending.peerId] ??= {};
      const e = memories[pending.category] ?? { mean: 0, variance: 1, samples: 0 };
      const residual = clamp(magnitude(seen.relativePosition) - pending.distance, -2, 2) - e.mean;
      const rate = human.parameters.learningRate;
      e.mean += rate * residual;
      e.variance = Math.max(0, (1 - rate) * e.variance + rate * residual * residual);
      e.samples++;
      memories[pending.category] = e;
    }
  }
  human.voicePending = null;
  const result = decideWithSoundOptions(human, observation, random, { association: options.receiver !== false, chooseSound: options.sender === false ? undefined : chooseSignalSound, stateCoupling: options.stateCoupling });
  if (options.sender !== false && result.action.kind === "vocalize" && result.action.sound && peer) {
    const produced = [...result.human.producedSounds].sort((a, b) => soundDistance(a.shape, result.action.sound!) - soundDistance(b.shape, result.action.sound!) || a.id - b.id)[0];
    if (produced && soundDistance(produced.shape, result.action.sound) < .14) (result.human as SenderState).voicePending = { peerId: peer.trackId, category: produced.id, distance: magnitude(peer.relativePosition) };
  }
  return result;
}
export const decideSignalSender = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r);
/** Sender only: the receiver-side association is off, so any speaker structure cannot come from listener learning. */
export const decideSignalSenderOnly = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r, { receiver: false });
/** Ablated control: sender off, receiver on, i.e. the receiver candidate under a distinct id. */
export const decideSignalSenderOff = (h: HumanState, o: Observation, r: RandomSource) => decideWithSenderOptions(h, o, r, { sender: false });
