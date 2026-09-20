import { add, clamp, magnitude, soundDistance } from "../../contracts/src/index.ts";
import type { ActionIntent, ActionKind, Body, DecisionTrace, HeardSound, HumanParameters, Observation, PhysicalEffect, RandomSource, Score, SoundShape, Vec2 } from "../../contracts/src/index.ts";

/** Default model. 0.2.0 adds the predicted-safety utility term to every action; 0.1.0 remains callable as decideLegacyHuman. */
export const HUMAN_VERSION = "0.2.0";
export const LEGACY_HUMAN_VERSION = "0.1.0";
export const DEFAULT_PARAMETERS: HumanParameters = {
  curiosity: 0.6, caution: 0.65, learningRate: 0.18, exploration: 0.08, memoryDecay: 0.002,
};
export type Estimate = { mean: number; variance: number; samples: number };
export type VoiceCategory = { id: number; shape: SoundShape; samples: number };
export type PeerMemory = {
  lastSeen: number; sightings: number; harmAlpha: number; harmBeta: number;
  responses: Partial<Record<ActionKind, Estimate>>;
};
export type HumanState = {
  id: string; parameters: HumanParameters; body: Body;
  peers: Record<string, PeerMemory>;
  places: Record<string, { kind: "food" | "warmth"; position: Vec2; strength: number; seen: number }>;
  producedSounds: VoiceCategory[]; heardSounds: VoiceCategory[];
  lastAction: ActionKind; lastPain: number;
  explorationTarget: Vec2 | null;
  pending: { peerId: string; distance: number; predictedDelta: number; action: ActionKind } | null;
  learnedTransitions: number;
  /** Candidate-only extension. Absent from default/legacy checkpoints. */
  soundAssociations?: Record<string, Record<number, Estimate>>;
  soundPending?: { tick: number; peerId: string; category: number; distance: number } | null;
};

export function createHuman(id: string, parameters: Partial<HumanParameters> = {}, body: Partial<Body> = {}): HumanState {
  return {
    id, parameters: { ...DEFAULT_PARAMETERS, ...parameters },
    body: { hunger: 0.24, fatigue: 0.15, cold: 0.1, health: 1, ...body },
    peers: {}, places: {}, producedSounds: [], heardSounds: [], lastAction: "observe",
    lastPain: 0, explorationTarget: null, pending: null, learnedTransitions: 0,
  };
}

function rememberSound(categories: VoiceCategory[], shape: SoundShape, threshold = 0.18): void {
  const nearest = [...categories].sort((a, b) => soundDistance(a.shape, shape) - soundDistance(b.shape, shape))[0];
  if (nearest && (soundDistance(nearest.shape, shape) < threshold || categories.length >= 16)) {
    nearest.samples++;
    const rate = 1 / nearest.samples;
    nearest.shape.openness += rate * (shape.openness - nearest.shape.openness);
    nearest.shape.resonance += rate * (shape.resonance - nearest.shape.resonance);
  } else {
    categories.push({ id: categories.length + 1, shape: { ...shape }, samples: 1 });
  }
}

/** Pure transition. This function has no access to WorldState or another HumanState. */
export type OutcomeBonus = (action: ActionKind, human: HumanState, peerDistance: number | null, peerId: string | null) => number;

/**
 * Predicted-safety term (default since 0.2.0; candidate 0.2.0-experimental.1 before adoption).
 * Uses the individual's own learned distance change per action toward the tracked peer, weighted by
 * experience count, prediction variance, caution, and bodily slack. Uncalibrated engineering assumption;
 * evidence: research/decisions/0003 (controlled task) and 0004 (normal world).
 */
export const PREDICTIVE_POLICY = { gain: 4, cap: .2, minimumSamples: 4, priorSamples: 8 };
export const predictedSafety: OutcomeBonus = (action, human, peerDistance, peerId) => {
  if (peerDistance === null || peerId === null) return 0;
  const memory = human.peers[peerId];
  const estimate = memory?.responses[action];
  if (!estimate || estimate.samples < PREDICTIVE_POLICY.minimumSamples) return 0;
  const confidence = estimate.samples / (estimate.samples + PREDICTIVE_POLICY.priorSamples) / (1 + estimate.variance);
  const harm = memory.harmAlpha / (memory.harmAlpha + memory.harmBeta);
  const risk = (distance: number) => clamp(clamp(1 - distance / 12) * harm + (distance < 1.5 ? .25 : 0));
  const future = Math.max(0, peerDistance + clamp(estimate.mean, -2, 2));
  const bodilyBudget = 1 - Math.max(human.body.hunger, human.body.fatigue, human.body.cold);
  return clamp(PREDICTIVE_POLICY.gain * human.parameters.caution * confidence * bodilyBudget * (risk(peerDistance) - risk(future)), -PREDICTIVE_POLICY.cap, PREDICTIVE_POLICY.cap);
};

/**
 * Forgetting of harm evidence per step (rate = memoryDecay).
 * - toward-prior (0.1.0/0.2.0): alpha-1 and beta-1 shrink, so the estimate drifts toward the Beta(1,1) prior of 0.5.
 * - keep-estimate (candidate): the evidence total shrinks by the same factor but the estimate alpha/(alpha+beta) is kept,
 *   so confidence fades without the belief drifting. Uncalibrated engineering assumption.
 */
export type Forgetting = "toward-prior" | "keep-estimate";
/** Candidate hook: choose the base shape of a vocalization from the individual's own produced categories; null keeps the default random reuse. */
export type SoundChoice = (human: HumanState, peerId: string | null, peerDistance: number | null, random: RandomSource) => SoundShape | null;
/**
 * State-coupled voice (user-specified innate capacity, decided 2026-09-20): a share of the produced sound's
 * features leaks the speaker's current state. Openness follows perceived risk, resonance follows the strongest
 * bodily need. No meaning is attached; this only makes the sound carry information the individual did not choose to send.
 */
export type DecideOptions = { outcomeBonus?: OutcomeBonus; forgetting?: Forgetting; auditoryClassification?: boolean; auditoryAttention?: boolean; signalBonus?: OutcomeBonus; chooseSound?: SoundChoice; stateCoupling?: number;
  /** Candidate hook (0.7.0-experimental.*): when hungry with no remembered food, explore toward a heard sound. `true` picks the loudest (innate, category-blind); a function picks which sound to follow, or null for none. */
  soundOrienting?: boolean | ((human: HumanState, sounds: HeardSound[], random: RandomSource) => HeardSound | null);
  /** Candidate hook (0.11.0-experimental.*): when cold (>0.4) with no remembered warm place, and not already orienting for food, explore toward a heard sound; same shape as soundOrienting. */
  warmthOrienting?: boolean | ((human: HumanState, sounds: HeardSound[], random: RandomSource) => HeardSound | null);
  /** Candidate hook (0.8.0-experimental.*): extra vocalize utility right after eating (a "food call" tendency). Requires the candidate's apply to record lastIntake. */
  satiationCall?: number;
  /** Candidate term (0.11.0-experimental.*): extra utility of vocalizing on the tick after being sheltered (lastWarm), the warmth counterpart of satiationCall. */
  shelterCall?: number;
  /** Candidate perception (0.11.0-experimental.5): distance below which a heard sound joins an existing heard category. Default 0.18 (the 0.1.0 value); smaller means finer hearing. */
  auditoryResolution?: number;
  /** Candidate hook (0.8.0-experimental.2): the eating state also leaks into the voice, pulling both features toward the high corner while the individual has just eaten. Requires lastIntake from the candidate's apply. */
  eatingCoupling?: number };

/** Default model (human 0.2.0). Pass another OutcomeBonus for experiments; `() => 0` is the ablated control. */
export function decideHuman(previous: HumanState, observation: Observation, random: RandomSource, outcomeBonus: OutcomeBonus = predictedSafety) {
  return decideWithOptions(previous, observation, random, { outcomeBonus });
}
/** Previous default (human 0.1.0): no outcome term at all. Kept so recorded 0.1.0 runs and baselines stay reproducible. */
export function decideLegacyHuman(previous: HumanState, observation: Observation, random: RandomSource) {
  return decideWithOptions(previous, observation, random, {});
}

export function decideWithOptions(previous: HumanState, observation: Observation, random: RandomSource, options: DecideOptions): {
  human: HumanState; action: ActionIntent; trace: DecisionTrace;
} {
  const outcomeBonus = options.outcomeBonus;
  const forgetting: Forgetting = options.forgetting ?? "toward-prior";
  const human: HumanState = structuredClone(previous);
  const p = human.parameters;
  const animals = [...observation.animals]
    .filter((a) => a.morphologySimilarity >= 0.7)
    .sort((a, b) => magnitude(a.relativePosition) - magnitude(b.relativePosition) || a.trackId.localeCompare(b.trackId));
  const peer = animals[0] ?? null;
  const peerDistance = peer ? magnitude(peer.relativePosition) : null;
  const peerPosition = peer ? add(observation.selfPosition, peer.relativePosition) : null;
  let predictionError: number | null = null;

  for (const m of Object.values(human.peers)) {
    if (forgetting === "toward-prior") {
      m.harmAlpha = 1 + (m.harmAlpha - 1) * (1 - p.memoryDecay);
      m.harmBeta = 1 + (m.harmBeta - 1) * (1 - p.memoryDecay);
    } else {
      const total = m.harmAlpha + m.harmBeta;
      const estimate = m.harmAlpha / total;
      const shrunk = 2 + (total - 2) * (1 - p.memoryDecay);
      m.harmAlpha = estimate * shrunk;
      m.harmBeta = (1 - estimate) * shrunk;
    }
  }
  for (const visible of animals) {
    const m = human.peers[visible.trackId] ?? {
      lastSeen: observation.tick, sightings: 0, harmAlpha: 1, harmBeta: 1, responses: {},
    };
    m.lastSeen = observation.tick;
    m.sightings++;
    human.peers[visible.trackId] = m;
  }
  // Learn from the next locally observed transition. The world's semantic labels never enter here.
  if (human.pending) {
    const pending = human.pending;
    const seen = animals.find((a) => a.trackId === pending.peerId);
    if (seen && p.learningRate > 0) {
      const nowDistance = magnitude(seen.relativePosition);
      const delta = clamp(nowDistance - pending.distance, -2, 2);
      const m = human.peers[pending.peerId];
      const estimate = m.responses[pending.action] ?? { mean: 0, variance: 1, samples: 0 };
      predictionError = delta - pending.predictedDelta;
      const residual = delta - estimate.mean;
      estimate.mean += p.learningRate * residual;
      estimate.variance = Math.max(0, (1 - p.learningRate) * estimate.variance + p.learningRate * residual * residual);
      estimate.samples++;
      m.responses[pending.action] = estimate;
      human.learnedTransitions++;
      // Lack of harm at a distance does not constitute evidence of harmless intent.
      if (Math.min(pending.distance, nowDistance) < 2.5) {
        if (human.lastPain > 0.001) m.harmAlpha += 1;
        else m.harmBeta += 1;
      }
    }
  }
  for (const cue of observation.resources) {
    human.places[cue.id] = { kind: cue.kind, position: add(observation.selfPosition, cue.relativePosition), strength: cue.strength, seen: observation.tick };
  }
  for (const [key, place] of Object.entries(human.places)) {
    if (observation.tick - place.seen > 600) delete human.places[key];
  }
  let auditoryNovelty = 0;
  for (const heard of observation.sounds) {
    const closest = [...human.heardSounds].sort((a, b) => soundDistance(a.shape, heard.shape) - soundDistance(b.shape, heard.shape))[0];
    const novelty = closest && soundDistance(closest.shape, heard.shape) < 0.18 ? 1 / Math.sqrt(1 + closest.samples) : 1;
    auditoryNovelty = Math.max(auditoryNovelty, novelty * heard.loudness);
    if (options.auditoryClassification !== false) rememberSound(human.heardSounds, heard.shape, options.auditoryResolution ?? 0.18);
  }

  if (options.auditoryAttention === false) auditoryNovelty = 0;

  const memory = peer ? human.peers[peer.trackId] : null;
  const uncertainty = memory ? 1 / Math.sqrt(1 + memory.sightings / 8) : 1;
  const harmEstimate = memory ? memory.harmAlpha / (memory.harmAlpha + memory.harmBeta) : 0.5;
  const proximity = peerDistance === null ? 0 : clamp(1 - peerDistance / 12);
  const closing = peer && peerDistance && peerDistance > 0
    ? -(peer.relativePosition.x * peer.relativeVelocity.x + peer.relativePosition.y * peer.relativeVelocity.y) / peerDistance : 0;
  const perceivedRisk = peer ? clamp(proximity * harmEstimate + Math.max(0, closing) * 0.2 + (peerDistance! < 1.5 ? 0.25 : 0)) : 0;
  const entries = Object.values(human.places);
  const nearestPlace = (kind: "food" | "warmth") => entries
    .filter((place) => place.kind === kind && place.strength > 0.01)
    .sort((a, b) => magnitude({ x: a.position.x - observation.selfPosition.x, y: a.position.y - observation.selfPosition.y })
      - magnitude({ x: b.position.x - observation.selfPosition.x, y: b.position.y - observation.selfPosition.y }))[0] ?? null;
  const food = nearestPlace("food");
  const warmth = nearestPlace("warmth");
  if (!human.explorationTarget || magnitude({
    x: human.explorationTarget.x - observation.selfPosition.x,
    y: human.explorationTarget.y - observation.selfPosition.y,
  }) < 1 || observation.tick % 24 === 0) {
    const angle = random("exploration-heading") * Math.PI * 2;
    human.explorationTarget = {
      x: observation.selfPosition.x + Math.cos(angle) * 6,
      y: observation.selfPosition.y + Math.sin(angle) * 6,
    };
  }
  const orientToward = (hook: DecideOptions["soundOrienting"]) => {
    const target = typeof hook === "function" ? hook(human, observation.sounds, random) : [...observation.sounds].sort((a, b) => b.loudness - a.loudness)[0];
    const length = target ? magnitude(target.relativePosition) : 0;
    if (target && length > 0) human.explorationTarget = { x: observation.selfPosition.x + target.relativePosition.x / length * 6, y: observation.selfPosition.y + target.relativePosition.y / length * 6 };
  };
  if (options.soundOrienting && !food && human.body.hunger > 0.4 && observation.sounds.length > 0) orientToward(options.soundOrienting);
  else if (options.warmthOrienting && !warmth && human.body.cold > 0.4 && observation.sounds.length > 0) orientToward(options.warmthOrienting);
  const scores: Score[] = [];
  const addScore = (action: ActionKind, terms: Record<string, number>) => {
    if (outcomeBonus) terms = { ...terms, predictedSafety: outcomeBonus(action, human, peerDistance, peer?.trackId ?? null) };
    if (options.signalBonus) terms = { ...terms, signalPrediction: options.signalBonus(action, human, peerDistance, peer?.trackId ?? null) };
    scores.push({ action, utility: Object.values(terms).reduce((sum, v) => sum + v, 0), terms });
  };
  const inertia = (action: ActionKind) => human.lastAction === action ? 0.06 : 0;
  const bodilyNeed = Math.max(human.body.hunger, human.body.fatigue, human.body.cold);
  addScore("observe", { base: 0.06, uncertainty: peer ? uncertainty * p.caution * 0.65 : 0, auditoryOrienting: auditoryNovelty * 0.35, continuity: inertia("observe"), opportunityCost: -bodilyNeed * 0.1 });
  addScore("explore", { curiosity: p.curiosity * (peer ? 0.12 : 0.48), resourceSearch: !food ? human.body.hunger * 0.7 : 0, cost: -0.08, continuity: inertia("explore") });
  addScore("rest", { fatigue: human.body.fatigue * 1.45, danger: -perceivedRisk * p.caution * 0.7, continuity: inertia("rest"), cost: -0.25 });
  if (food) addScore("forage", { hunger: human.body.hunger * 1.65, continuity: inertia("forage"), cost: -0.2 });
  if (warmth) addScore("warm", { cold: human.body.cold * 1.6, continuity: inertia("warm"), cost: -0.2 });
  if (peer) {
    addScore("approach", { curiosity: p.curiosity * (0.16 + uncertainty * 0.56), danger: -perceivedRisk * p.caution * 1.15, tooClose: peerDistance! < 2.4 ? -0.65 : 0, continuity: inertia("approach"), cost: -0.06 });
    addScore("withdraw", { danger: perceivedRisk * p.caution * 1.25, personalSpace: peerDistance! < 1.8 ? 0.24 : 0, continuity: inertia("withdraw"), cost: -0.22 });
  }
  const voiceResponse = memory?.responses.vocalize;
  addScore("vocalize", {
    vocalExploration: p.curiosity * 0.33,
    responseExploration: peer ? p.curiosity * (voiceResponse ? 0.16 / Math.sqrt(1 + voiceResponse.samples) : 0.35) : 0,
    learnedChange: peer && voiceResponse ? p.curiosity * Math.min(0.2, Math.abs(voiceResponse.mean) * 0.2) : 0,
    danger: -perceivedRisk * p.caution * 0.22,
    fatigue: -human.body.fatigue * 0.1, cost: -0.07,
    ...(options.satiationCall ? { satiationCall: ((human as HumanState & { lastIntake?: number }).lastIntake ?? 0) > 0 ? options.satiationCall : 0 } : {}),
    ...(options.shelterCall ? { shelterCall: (human as HumanState & { lastWarm?: boolean }).lastWarm ? options.shelterCall : 0 } : {}),
  });
  const ordered = [...scores].sort((a, b) => b.utility - a.utility || a.action.localeCompare(b.action));
  const exploratory = random("epsilon") < p.exploration;
  let selected: ActionKind;
  if (exploratory) selected = scores[Math.floor(random("exploratory-choice") * scores.length)].action;
  else {
    const weights = scores.map((s) => Math.exp((s.utility - ordered[0].utility) / 0.09));
    let draw = random("softmax") * weights.reduce((a, b) => a + b, 0);
    selected = scores[scores.length - 1].action;
    for (let i = 0; i < scores.length; i++) {
      draw -= weights[i];
      if (draw <= 0) { selected = scores[i].action; break; }
    }
  }
  const action: ActionIntent = { kind: selected };
  if (selected === "approach" && peerPosition) action.target = peerPosition;
  if (selected === "withdraw" && peerPosition) action.target = {
    x: observation.selfPosition.x + (observation.selfPosition.x - peerPosition.x) * 3,
    y: observation.selfPosition.y + (observation.selfPosition.y - peerPosition.y) * 3,
  };
  if (selected === "forage" && food) action.target = { ...food.position };
  if (selected === "warm" && warmth) action.target = { ...warmth.position };
  if (selected === "explore") action.target = { ...human.explorationTarget };
  if (selected === "vocalize") {
    const known = human.producedSounds;
    const chosen = options.chooseSound?.(human, peer?.trackId ?? null, peerDistance, random) ?? null;
    const repeat = known.length > 0 && random("new-voice") > 0.35;
    const base = chosen ?? (repeat ? known[Math.floor(random("voice-category") * known.length)].shape : {
      openness: random("voice-openness"), resonance: random("voice-resonance"),
    });
    const coupling = options.stateCoupling ?? 0;
    let expressed = coupling > 0
      ? { openness: (1 - coupling) * base.openness + coupling * clamp(perceivedRisk * 2), resonance: (1 - coupling) * base.resonance + coupling * bodilyNeed }
      : base;
    const eating = options.eatingCoupling ?? 0;
    if (eating > 0 && ((human as HumanState & { lastIntake?: number }).lastIntake ?? 0) > 0) expressed = { openness: (1 - eating) * expressed.openness + eating * 0.9, resonance: (1 - eating) * expressed.resonance + eating * 0.9 };
    action.sound = {
      openness: clamp(expressed.openness + (random("motor-noise-o") - 0.5) * 0.07),
      resonance: clamp(expressed.resonance + (random("motor-noise-r") - 0.5) * 0.07),
    };
    rememberSound(human.producedSounds, action.sound, 0.14);
  }
  human.pending = peer ? {
    peerId: peer.trackId, distance: peerDistance!, action: selected,
    predictedDelta: memory?.responses[selected]?.mean ?? 0,
  } : null;
  human.lastAction = selected;
  const trace: DecisionTrace = {
    tick: observation.tick, observation: structuredClone(observation), selected, exploratory,
    scores: ordered, perceivedRisk, uncertainty, peerDistance, peerTrackId: peer?.trackId ?? null,
    predictionError, learnedSamples: human.learnedTransitions,
  };
  return { human, action, trace };
}

/** Abstract homeostasis per fixed model tick, not calibrated human physiology. */
export function applyPhysicalEffect(previous: HumanState, effect: PhysicalEffect): HumanState {
  const human: HumanState = structuredClone(previous);
  const body = human.body;
  body.hunger = clamp(body.hunger + 0.002 + effect.exertion * 0.0007 - effect.foodIntake);
  body.fatigue = clamp(body.fatigue + 0.001 + effect.exertion * 0.002 - (effect.resting ? 0.025 : 0));
  body.cold = clamp(body.cold + (effect.ambientCold - body.cold) * 0.025 - effect.exertion * 0.0006);
  const stress = Math.max(0, body.hunger - 0.9) + Math.max(0, body.cold - 0.85) + Math.max(0, body.fatigue - 0.95);
  body.health = clamp(body.health - stress * 0.006 - effect.collision * 0.006 + (stress === 0 ? 0.00015 : 0));
  human.lastPain = effect.collision;
  return human;
}
