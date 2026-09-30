import type { ActionKind, DecisionTrace, Observation, Score } from "../../contracts/src/index.ts";
import { keyedRandom } from "../../simulation/src/random.ts";
import type { HumanState } from "../../human/src/index.ts";
import { applyWorldEdit, senseWorld, DEFAULT_WORLD, type Resource, type WorldEdit } from "../../world/src/index.ts";
import { createSimulation, observeSimulation, stepSimulation, versionsFor, DEFAULT_MODEL_ID, type ExperimentConfig, type Frame, type Provenance, type SimulatorState } from "../../simulation/src/index.ts";

/**
 * Game layer ("はじまりのふたり"). It sits beside experiments: it builds configurations, lets the player edit
 * the world between steps through world.applyWorldEdit, and (lab mode only) edits memories as an explicit
 * experimenter intervention. It never changes how humans decide and never feeds scores back into them.
 */
export const GAME_VERSION = "0.1.0";
/** Mirrors the human model's selection rule: epsilon-uniform exploration + softmax(utility / 0.09). */
export const SOFTMAX_TEMPERATURE = 0.09;

export type Subject = "A" | "B";
export type MindEdit =
  | { kind: "eraseMemory"; subject: Subject }
  | { kind: "swapMemories" }
  | { kind: "setTrait"; subject: Subject; trait: "curiosity" | "caution"; value: number };
export type PlayerEdit =
  | { kind: "placeFood"; position: { x: number; y: number } }
  | { kind: "placeFire"; position: { x: number; y: number } }
  | { kind: "moveResource"; id: string; position: { x: number; y: number } }
  | { kind: "removeResource"; id: string };
export type PlayerAction =
  | { kind: "edit"; edit: PlayerEdit }
  | { kind: "mind"; edit: MindEdit }
  | { kind: "predict"; action: ActionKind; confidence: 1 | 2 | 3 };
export type Goal = { label: string; detail: string; evaluate: (frames: Frame[]) => { value: number; achieved: boolean; text: string } };
export type Stage = {
  id: string; order: number; mode: "predict" | "lab"; title: string; subtitle: string; story: string; hint: string;
  seeds: number[]; horizon: number; questions: { tick: number; subject: Subject }[]; budget: number;
  build: (seed: number) => ExperimentConfig; goal: Goal;
};
export type RoundResult = {
  question: number; tick: number; subject: Subject; guess: ActionKind; confidence: 1 | 2 | 3;
  actual: ActionKind; exploratory: boolean; probability: number; probabilities: Partial<Record<ActionKind, number>>;
  readPoints: number; hitPoints: number; points: number; topTerms: { action: ActionKind; terms: [string, number][] }[];
};
export type GameState = {
  stageId: string; seed: number; sim: SimulatorState; frames: Frame[]; log: PlayerAction[];
  question: number; budgetLeft: number; placed: number; labUsed: boolean;
  rounds: RoundResult[]; phase: "ask" | "done"; final: FinalScore | null;
};
export type FinalScore = { roundPoints: number; goalPoints: number; budgetPoints: number; total: number; goal: { value: number; achieved: boolean; text: string }; hits: number };

export const EDIT_COST: Record<PlayerEdit["kind"] | "mind", number> = { placeFood: 3, placeFire: 3, moveResource: 1, removeResource: 1, mind: 2 };

const hungry = (value: number) => ({ hunger: value });
const food = (id: string, x: number, y: number, amount = 1, radius = 1.8): Resource => ({ id, kind: "food", position: { x, y }, amount, radius });
const fire = (id: string, x: number, y: number): Resource => ({ id, kind: "warmth", position: { x, y }, amount: 1, radius: 3 });
const pair = (name: string, seed: number, horizon: number, a: { x: number; y: number }, b: { x: number; y: number }, resources: Resource[], body = {}, world = {}): ExperimentConfig => ({
  name, seed, horizon, model: DEFAULT_MODEL_ID, world: { ...DEFAULT_WORLD, ...world }, resources,
  agents: [{ id: "A", position: a, parameters: {}, body: { ...body } }, { id: "B", position: b, parameters: {}, body: { ...body } }],
});
const alternate = (ticks: number[]): { tick: number; subject: Subject }[] => ticks.map((tick, i) => ({ tick, subject: i % 2 === 0 ? "A" : "B" }));
// Game seeds are a separate range so play never mixes with research seeds (2001–8000 are observed research data).
const seeds = (base: number) => Array.from({ length: 12 }, (_, i) => base + i);

const decisions = (frames: Frame[]) => frames.filter((f) => f.tick > 0);
const contactFraction = (frames: Frame[]) => {
  const d = decisions(frames);
  return d.length ? d.filter((f) => f.events.some((e) => e.kind === "contact")).length / d.length : 0;
};
const lastBody = (frames: Frame[], id: string) => frames.at(-1)!.agents.find((a) => a.id === id)!.body;
const contactSteps = (frames: Frame[]) => decisions(frames).filter((f) => f.events.some((e) => e.kind === "contact")).length;
/** Fraction of steps within 6u, with a cap on the number of steps with contact pain. */
function together(frames: Frame[], minimum: number, maxContacts: number) {
  const d = decisions(frames).filter((f) => f.distance !== null);
  const near = d.length ? d.filter((f) => f.distance! < 6).length / d.length : 0;
  const contacts = contactSteps(frames);
  return { value: near, achieved: near >= minimum && contacts <= maxContacts, text: `6u 以内 ${Math.round(near * 100)}% · 接触 ${contacts} 回` };
}

export const STAGES: Stage[] = [
  {
    id: "morning", order: 1, mode: "predict", title: "ひとりの朝", subtitle: "チュートリアル",
    story: "A はお腹をすかせて目を覚ました。食料は遠く、A の目には見えていない。",
    hint: "A に見えないものは、A にとって存在しない。空腹が強くなるほど、探索や摂食が選ばれやすい。",
    seeds: seeds(90101), horizon: 200, budget: 4,
    questions: [1, 25, 50, 80, 110, 150].map((tick) => ({ tick, subject: "A" as const })),
    build: (seed) => ({
      name: "game/morning", seed, horizon: 200, model: DEFAULT_MODEL_ID, world: { ...DEFAULT_WORLD },
      resources: [food("food-far", 35, 5), fire("fire-near", 8, 22)],
      agents: [{ id: "A", position: { x: 6, y: 20 }, parameters: {}, body: hungry(0.55) }],
    }),
    goal: { label: "A の空腹を 40% 未満で終える", detail: "最後の時点の空腹", evaluate: (f) => { const v = lastBody(f, "A").hunger; return { value: v, achieved: v < 0.4, text: `空腹 ${Math.round(v * 100)}%` }; } },
  },
  {
    id: "two-tables", order: 2, mode: "predict", title: "ふたつの食卓", subtitle: "はじめての相手",
    story: "A と B が初めて出会う。食料は北西と南東に一つずつ。二人は相手をどう扱うだろう。",
    hint: "相手が近いと「観察」「接近」「離隔」が候補に入る。まだ危害の経験がなければ、好奇心が勝ちやすい。",
    seeds: seeds(90201), horizon: 300, budget: 6,
    questions: alternate([1, 30, 60, 95, 130, 170, 210, 255]),
    build: (seed) => pair("game/two-tables", seed, 300, { x: 14, y: 14 }, { x: 26, y: 14 }, [food("food-nw", 7, 7), food("food-se", 33, 21), fire("warm-n", 22, 5), fire("warm-s", 16, 24)]),
    goal: { label: "二人を出会わせる（6u 以内 30% 以上・接触 3 回まで）", detail: "何もしなければ二人はそれぞれの食卓から動かない", evaluate: (f) => together(f, 0.3, 3) },
  },
  {
    id: "one-spring", order: 3, mode: "predict", title: "ひとつの泉", subtitle: "取り合い",
    story: "食料は中央の一か所だけ。二人とも空腹だ。近づきすぎるとぶつかって痛い。",
    hint: "ぶつかった痛みは、その相手の危害の証拠として記憶される。証拠が増えると、近いほど危険と感じる。",
    seeds: seeds(90301), horizon: 300, budget: 6,
    questions: alternate([1, 25, 55, 85, 120, 160, 200, 250]),
    build: (seed) => pair("game/one-spring", seed, 300, { x: 12, y: 14 }, { x: 28, y: 14 }, [food("spring", 20, 14, 1, 2), fire("warm-n", 20, 4)], hungry(0.6)),
    goal: { label: "ぶつかったステップを 3% 未満に", detail: "接触痛の起きたステップの割合", evaluate: (f) => { const v = contactFraction(f); return { value: v, achieved: v < 0.03, text: `接触 ${(v * 100).toFixed(1)}%` }; } },
  },
  {
    id: "after-pain", order: 4, mode: "predict", title: "痛みのあと", subtitle: "ぶつからない近さ",
    story: "空腹の二人は、すぐ隣で同じ食料に手を伸ばしてしまう。ぶつかり合った記憶は、二人の距離をどう変えるだろう。",
    hint: "危害の記憶は、近くにいて何も起きない時間が続くと少しずつ薄れる。離れているだけでは更新されない。",
    seeds: seeds(90401), horizon: 360, budget: 6,
    questions: alternate([1, 20, 50, 90, 130, 180, 230, 290]),
    build: (seed) => pair("game/after-pain", seed, 360, { x: 19.4, y: 14 }, { x: 20.6, y: 14 }, [food("shared", 20, 15, 1, 1.4), fire("warm-w", 8, 8), food("far", 34, 22, 0.6)], hungry(0.7)),
    goal: { label: "離さずに痛みを減らす（6u 以内 60% 以上・接触 6 回まで）", detail: "近くにいる時間と、ぶつかったステップ数", evaluate: (f) => together(f, 0.6, 6) },
  },
  {
    id: "memory-lab", order: 5, mode: "lab", title: "記憶の実験室", subtitle: "禁じ手あり",
    story: "「痛みのあと」と同じ世界。ただしここでは、二人の記憶を消したり入れ替えたりできる。記録には必ず「記憶介入あり」と残る。",
    hint: "記憶を消すと、相手を初対面として扱う。入れ替えると、A は B が抱いていた記憶を持つ。本人には何が起きたか知らされない。",
    seeds: seeds(90501), horizon: 360, budget: 8,
    questions: alternate([1, 20, 50, 90, 130, 180, 230, 290]),
    build: (seed) => pair("game/memory-lab", seed, 360, { x: 19.4, y: 14 }, { x: 20.6, y: 14 }, [food("shared", 20, 15, 1, 1.4), fire("warm-w", 8, 8), food("far", 34, 22, 0.6)], hungry(0.7)),
    goal: { label: "離さずに痛みを減らす（6u 以内 60% 以上・接触 6 回まで）", detail: "近くにいる時間と、ぶつかったステップ数", evaluate: (f) => together(f, 0.6, 6) },
  },
];
export function stageById(id: string): Stage {
  const stage = STAGES.find((s) => s.id === id);
  if (!stage) throw new Error("Unknown stage: " + id);
  return stage;
}

/** Probability that the model's rule selects each candidate, from the recorded utilities (display/scoring only). */
export function choiceProbabilities(scores: Score[], exploration: number): Partial<Record<ActionKind, number>> {
  const best = Math.max(...scores.map((s) => s.utility));
  const weights = scores.map((s) => Math.exp((s.utility - best) / SOFTMAX_TEMPERATURE));
  const total = weights.reduce((a, b) => a + b, 0);
  const out: Partial<Record<ActionKind, number>> = {};
  scores.forEach((s, i) => { out[s.action] = exploration / scores.length + (1 - exploration) * weights[i] / total; });
  return out;
}

function runTo(state: GameState, tick: number): GameState {
  let sim = state.sim;
  const frames = [...state.frames];
  while (sim.tick < tick && sim.tick < sim.horizon) {
    sim = stepSimulation(sim);
    frames.push(observeSimulation(sim));
  }
  return { ...state, sim, frames };
}
/** Skip questions whose subject can no longer decide. */
function settle(state: GameState): GameState {
  const stage = stageById(state.stageId);
  let next = state;
  while (next.question < stage.questions.length) {
    const q = stage.questions[next.question];
    next = runTo(next, q.tick);
    const subject = next.sim.humans.find((h) => h.id === q.subject);
    if (subject && subject.body.health > 0 && next.sim.tick === q.tick) return next;
    next = { ...next, question: next.question + 1 };
  }
  return finish(runTo(next, stage.horizon));
}
function finish(state: GameState): GameState {
  const stage = stageById(state.stageId);
  const goal = stage.goal.evaluate(state.frames);
  const roundPoints = state.rounds.reduce((s, r) => s + r.points, 0);
  const goalPoints = goal.achieved ? 200 : 0;
  const budgetPoints = state.budgetLeft * 20;
  return { ...state, phase: "done", final: { roundPoints, goalPoints, budgetPoints, total: roundPoints + goalPoints + budgetPoints, goal, hits: state.rounds.filter((r) => r.guess === r.actual).length } };
}

export function startGame(stageId: string, seed: number): GameState {
  const stage = stageById(stageId);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error("Invalid seed");
  const sim = createSimulation(stage.build(seed));
  return settle({ stageId, seed, sim, frames: [observeSimulation(sim)], log: [], question: 0, budgetLeft: stage.budget, placed: 0, labUsed: false, rounds: [], phase: "ask", final: null });
}

export function currentQuestion(state: GameState): { tick: number; subject: Subject } | null {
  if (state.phase !== "ask") return null;
  return stageById(state.stageId).questions[state.question] ?? null;
}
export function editCost(action: PlayerAction): number {
  return action.kind === "edit" ? EDIT_COST[action.edit.kind] : action.kind === "mind" ? EDIT_COST.mind : 0;
}
function toWorldEdit(state: GameState, edit: PlayerEdit): WorldEdit {
  const at = (p: { x: number; y: number }) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
  switch (edit.kind) {
    case "placeFood": return { kind: "placeResource", resource: food("placed-" + (state.placed + 1), at(edit.position).x, at(edit.position).y, 1, 1.8) };
    case "placeFire": return { kind: "placeResource", resource: { ...fire("placed-" + (state.placed + 1), 0, 0), position: at(edit.position) } };
    case "moveResource": return { kind: "moveResource", id: edit.id, position: at(edit.position) };
    case "removeResource": return { kind: "removeResource", id: edit.id };
  }
}
/** Experimenter intervention on private memory. Never available outside lab stages; always flagged in the record. */
function applyMind(humans: HumanState[], edit: MindEdit): HumanState[] {
  const next = structuredClone(humans);
  const find = (id: Subject) => { const h = next.find((x) => x.id === id); if (!h) throw new Error("Unknown subject: " + id); return h; };
  if (edit.kind === "eraseMemory") { const h = find(edit.subject); h.peers = {}; h.pending = null; }
  if (edit.kind === "swapMemories") {
    const a = find("A"), b = find("B");
    const aboutB = a.peers.B, aboutA = b.peers.A;
    if (aboutA) a.peers.B = structuredClone(aboutA); else delete a.peers.B;
    if (aboutB) b.peers.A = structuredClone(aboutB); else delete b.peers.A;
    a.pending = null; b.pending = null;
  }
  if (edit.kind === "setTrait") {
    if (!Number.isFinite(edit.value) || edit.value < 0 || edit.value > 1) throw new Error("Trait must be within 0..1");
    find(edit.subject).parameters[edit.trait] = edit.value;
  }
  return next;
}

/** Pure reducer: the whole play is determined by stage, seed, and this action log. */
export function act(state: GameState, action: PlayerAction): GameState {
  const stage = stageById(state.stageId);
  const question = currentQuestion(state);
  if (!question) throw new Error("The game is over");
  if (action.kind === "edit" || action.kind === "mind") {
    if (action.kind === "mind" && stage.mode !== "lab") throw new Error("Memory interventions are only available in the lab");
    const cost = editCost(action);
    if (cost > state.budgetLeft) throw new Error("Not enough effort points");
    let sim = structuredClone(state.sim);
    let placed = state.placed;
    if (action.kind === "edit") {
      sim.world = applyWorldEdit(sim.world, toWorldEdit(state, action.edit));
      if (action.edit.kind === "placeFood" || action.edit.kind === "placeFire") placed++;
    } else sim.humans = applyMind(sim.humans, action.edit);
    // Replace the displayed frame at this tick so the map shows the edited world; traces are unchanged.
    const frames = [...state.frames.slice(0, -1), observeSimulation(sim)];
    return { ...state, sim, frames, placed, log: [...state.log, action], budgetLeft: state.budgetLeft - cost, labUsed: state.labUsed || action.kind === "mind" };
  }
  if (!["observe", "approach", "withdraw", "explore", "forage", "warm", "rest", "vocalize"].includes(action.action) || ![1, 2, 3].includes(action.confidence)) throw new Error("Invalid prediction");
  const subject = state.sim.humans.find((h) => h.id === question.subject)!;
  const stepped = stepSimulation(state.sim);
  const trace: DecisionTrace = stepped.traces[question.subject];
  const probabilities = choiceProbabilities(trace.scores, subject.parameters.exploration);
  const probability = probabilities[action.action] ?? 0;
  const hit = trace.selected === action.action;
  const readPoints = Math.round(100 * probability);
  const hitPoints = hit ? 50 * action.confidence : trace.exploratory ? 0 : -20 * (action.confidence - 1);
  const topTerms = [action.action, trace.selected].filter((a, i, all) => all.indexOf(a) === i).flatMap((a) => {
    const score = trace.scores.find((s) => s.action === a);
    return score ? [{ action: a, terms: Object.entries(score.terms).filter(([, v]) => Math.abs(v) > 0.005).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 4) as [string, number][] }] : [];
  });
  const round: RoundResult = {
    question: state.question, tick: question.tick, subject: question.subject, guess: action.action, confidence: action.confidence,
    actual: trace.selected, exploratory: trace.exploratory, probability, probabilities, readPoints, hitPoints, points: readPoints + hitPoints, topTerms,
  };
  return settle({ ...state, sim: stepped, frames: [...state.frames, observeSimulation(stepped)], log: [...state.log, action], rounds: [...state.rounds, round], question: state.question + 1 });
}

export type GameRecord = {
  format: "human-world-lab/game"; schemaVersion: 1;
  manifest: { game: string; versions: ReturnType<typeof versionsFor>; model: string; provenance: Provenance; labUsed: boolean };
  stageId: string; seed: number; log: PlayerAction[]; total: number | null;
};
export function recordGame(state: GameState, provenance: Provenance): GameRecord {
  return {
    format: "human-world-lab/game", schemaVersion: 1,
    manifest: { game: GAME_VERSION, versions: versionsFor(state.sim.model), model: state.sim.model, provenance: { ...provenance }, labUsed: state.labUsed },
    stageId: state.stageId, seed: state.seed, log: structuredClone(state.log), total: state.final?.total ?? null,
  };
}
/** Re-executes a record with the current engine; refuses other versions instead of silently migrating. */
export function replayGame(value: unknown): GameState {
  const r = value as GameRecord;
  if (!r || r.format !== "human-world-lab/game" || r.schemaVersion !== 1 || !r.manifest || !Array.isArray(r.log) || r.log.length > 200) throw new Error("この版では読み込めないゲーム記録です。");
  if (r.manifest.game !== GAME_VERSION || JSON.stringify(r.manifest.versions) !== JSON.stringify(versionsFor(r.manifest.model)) || r.manifest.model !== DEFAULT_MODEL_ID) {
    throw new Error("ゲームまたはモデルの版が異なる記録です。記録: game " + String(r.manifest.game) + " / " + JSON.stringify(r.manifest.versions));
  }
  let state = startGame(r.stageId, r.seed);
  for (const action of r.log) state = act(state, action);
  if (r.manifest.labUsed !== state.labUsed) throw new Error("記憶介入の記録が一致しません。");
  if (r.total !== null && r.total !== (state.final?.total ?? null)) throw new Error("同じ操作から同じ得点を再現できませんでした。");
  return state;
}

/**
 * What the subject is about to perceive at the question tick: the same pure senseWorld call with the same key
 * the engine will use, so it neither consumes randomness nor changes state. Shown to the player only.
 */
export function perceptionNow(state: GameState, subject: Subject): Observation | null {
  if (!state.sim.world.animals.some((a) => a.id === subject)) return null;
  return senseWorld(state.sim.world, subject, state.sim.tick, keyedRandom(state.sim.seed, "senses/" + subject, state.sim.tick));
}
