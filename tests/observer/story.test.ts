import test from "node:test";
import assert from "node:assert/strict";
import { runExperiment } from "../../packages/simulation/src/index.ts";
import { pairExperiment, DEFAULT_SETTINGS } from "../../packages/experiments/src/index.ts";
import { highlights, narrate, storyMarkdown, storyStats } from "../../packages/observer/src/index.ts";

const run = (overrides: Partial<typeof DEFAULT_SETTINGS> = {}) => runExperiment(pairExperiment({ ...structuredClone(DEFAULT_SETTINGS), horizon: 400, ...overrides })).frames;

test("narration is deterministic, observer-only, and never mutates frames", () => {
  const frames = run();
  const saved = structuredClone(frames);
  const a = narrate(frames), b = narrate(structuredClone(frames));
  assert.deepEqual(a, b);
  assert.deepEqual(frames, saved);
  assert.ok(a.paragraphs.length >= 3 && a.caveats.length === 2);
  assert.match(storyMarkdown(frames), /^# .+\n/);
  assert.match(storyMarkdown(frames), /見方の注意/);
});
test("highlights come from recorded facts: first sight, closest approach, voices, and only supplied frames", () => {
  const frames = run();
  const marks = highlights(frames);
  const first = marks.find(m => m.kind === "first-sight");
  assert.ok(first && first.tick === storyStats(frames).firstSight);
  const closest = marks.find(m => m.kind === "closest")!;
  assert.equal(closest.tick, storyStats(frames).minimumDistanceTick);
  assert.ok(marks.some(m => m.kind === "voice-heard"));
  const prefix = highlights(frames.slice(0, 51));
  assert.ok(prefix.every(m => m.tick <= 50));
  for (const m of prefix.filter(m => m.kind !== "closest")) assert.ok(marks.some(x => x.kind === m.kind && x.tick === m.tick && x.id === m.id), "prefix highlights persist: " + m.kind);
  assert.ok(marks.every(m => Number.isInteger(m.tick) && m.title && m.detail));
});
test("muting sound removes voice highlights and a fresh start yields an empty story", () => {
  const muted = highlights(run({ soundEnabled: false }));
  assert.ok(!muted.some(m => m.kind === "voice-heard" || m.kind === "voice-chain"));
  assert.equal(storyStats(run({ soundEnabled: false })).voiceChains, 0);
  const empty = narrate(run().slice(0, 1));
  assert.equal(empty.highlights.length, 0);
  assert.equal(empty.stats.ticks, 0);
});
test("wariness is reported only when pain raises the harm estimate, never for the first harmless approach", () => {
  const frames = run();
  const marks = highlights(frames);
  for (const w of marks.filter(m => m.kind === "wary")) {
    const before = frames.find(f => f.tick === w.tick - 1)!.agents.find(a => a.id === w.id)!;
    const at = frames.find(f => f.tick === w.tick)!.agents.find(a => a.id === w.id)!;
    const peer = w.title.match(/の (\S+) への/)![1];
    const prior = before.peerEvidence.find(p => p.id === peer)!.harmEstimate, now = at.peerEvidence.find(p => p.id === peer)!.harmEstimate;
    assert.ok(now > prior && now >= 0.3);
  }
  const firstPain = marks.find(m => m.kind === "first-pain");
  const firstWary = marks.find(m => m.kind === "wary");
  if (firstPain && firstWary) assert.ok(firstWary.tick > firstPain.tick, "wariness cannot precede the first pain");
  const hungry = highlights(runExperiment(pairExperiment({ ...structuredClone(DEFAULT_SETTINGS), horizon: 300, body: { hunger: 0.85 } })).frames);
  assert.ok(hungry.some(m => m.kind === "hunger-crisis"));
});
