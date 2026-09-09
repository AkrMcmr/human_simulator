import { add, clamp, magnitude, soundDistance } from "../../contracts/src/index.ts";
import type { ActionIntent, ActionKind, Body, DecisionTrace, HumanParameters, Observation, PhysicalEffect, RandomSource, Score, SoundShape, Vec2 } from "../../contracts/src/index.ts";

export const HUMAN_VERSION = "0.1.0";
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
export function decideHuman(previous: HumanState, observation: Observation, random: RandomSource): {
  human: HumanState; action: ActionIntent; trace: DecisionTrace;
} {
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
    m.harmAlpha = 1 + (m.harmAlpha - 1) * (1 - p.memoryDecay);
    m.harmBeta = 1 + (m.harmBeta - 1) * (1 - p.memoryDecay);
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
    rememberSound(human.heardSounds, heard.shape);
  }

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
  const scores: Score[] = [];
  const addScore = (action: ActionKind, terms: Record<string, number>) => {
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
    const repeat = known.length > 0 && random("new-voice") > 0.35;
    const base = repeat ? known[Math.floor(random("voice-category") * known.length)].shape : {
      openness: random("voice-openness"), resonance: random("voice-resonance"),
    };
    action.sound = {
      openness: clamp(base.openness + (random("motor-noise-o") - 0.5) * 0.07),
      resonance: clamp(base.resonance + (random("motor-noise-r") - 0.5) * 0.07),
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
