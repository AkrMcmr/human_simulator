/** Public signals shared by human, world, and runner. Never put a peer's mind here. */
export const CONTRACT_VERSION = "0.1.0";
export type Vec2 = { x: number; y: number };
/** Two continuous, normalized acoustic features; these are not phonemes or words. */
export type SoundShape = { openness: number; resonance: number };
export type ActionKind = "observe" | "approach" | "withdraw" | "explore" | "forage" | "warm" | "rest" | "vocalize";
export type Body = { hunger: number; fatigue: number; cold: number; health: number };
export type HumanParameters = {
  curiosity: number;
  caution: number;
  learningRate: number;
  exploration: number;
  memoryDecay: number;
};
export type VisualAnimal = {
  trackId: string;
  relativePosition: Vec2;
  relativeVelocity: Vec2;
  morphologySimilarity: number;
};
export type ResourceCue = {
  id: string;
  kind: "food" | "warmth";
  relativePosition: Vec2;
  strength: number;
};
export type HeardSound = {
  /** The speaker can only be identified when also visually tracked. */
  visibleSourceId: string | null;
  shape: SoundShape;
  loudness: number;
};
export type Observation = {
  tick: number;
  selfPosition: Vec2;
  animals: VisualAnimal[];
  resources: ResourceCue[];
  sounds: HeardSound[];
};
export type ActionIntent = {
  kind: ActionKind;
  target?: Vec2;
  sound?: SoundShape;
};
export type PhysicalEffect = {
  ambientCold: number;
  foodIntake: number;
  exertion: number;
  resting: boolean;
  collision: number;
};
export type Score = { action: ActionKind; utility: number; terms: Record<string, number> };
export type DecisionTrace = {
  tick: number;
  observation: Observation;
  selected: ActionKind;
  exploratory: boolean;
  scores: Score[];
  perceivedRisk: number;
  uncertainty: number;
  peerDistance: number | null;
  peerTrackId: string | null;
  predictionError: number | null;
  learnedSamples: number;
};
export type RandomSource = (purpose: string, index?: number) => number;
export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const magnitude = (v: Vec2) => Math.hypot(v.x, v.y);
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const soundDistance = (a: SoundShape, b: SoundShape) => Math.hypot(a.openness - b.openness, a.resonance - b.resonance);
export const ACTION_LABELS: Record<ActionKind, string> = {
  observe: "観察", approach: "接近", withdraw: "距離を取る", explore: "探索",
  forage: "食料を探す", warm: "暖を取る", rest: "休息", vocalize: "発声",
};
