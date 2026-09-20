import test from "node:test";
import assert from "node:assert/strict";
import { createHuman } from "../../packages/human/src/index.ts";
import { decideLearnedCaller, callModulation, CALLER, applyWithIntake, FOOD_CALL } from "../../packages/human/src/forager-listener.ts";
import { protocol as caller } from "../../research/studies/caller-cost-v1.ts";
import { protocol as v5 } from "../../research/studies/referential-v5.ts";
import { seedsFor, runSeed, checkValue, referentialConfig } from "../../research/studies/referential-v1.ts";
import { HUMAN_MODELS, runExperiment } from "../../packages/simulation/src/index.ts";

type Caller = ReturnType<typeof createHuman> & { callOutcomes?: { call: { mean: number; samples: number }; silent: { mean: number; samples: number } }; callPending?: { called: boolean; tick: number; hunger: number } | null; lastIntake?: number };
const observation = (tick: number) => ({ tick, selfPosition: { x: 10, y: 14 }, animals: [], resources: [], sounds: [] });

test("the learned caller records a call-or-silence choice while eating and credits its later hunger change to that choice", () => {
  const base = createHuman("A", { curiosity: 1 }, { hunger: .5, fatigue: 0, cold: 0 });
  const fed = applyWithIntake(base, { ambientCold: .1, foodIntake: .04, exertion: 0, resting: false, collision: 0 }) as Caller;
  const first = decideLearnedCaller(fed, observation(0), () => 0.5).human as Caller;
  assert.ok(first.callPending && first.callPending.tick === 0 && Math.abs(first.callPending.hunger - fed.body.hunger) < 1e-9, "a choice is pending after an eating tick");
  const resolved = decideLearnedCaller({ ...first, body: { ...first.body, hunger: first.body.hunger - 0.2 }, lastIntake: 0 } as Caller, observation(CALLER.window), () => 0.5).human as Caller;
  const bucket = first.callPending!.called ? resolved.callOutcomes!.call : resolved.callOutcomes!.silent;
  assert.ok(bucket.samples === 1 && bucket.mean > 0, "hunger relief after the choice is a positive outcome");
  assert.equal(resolved.callPending, null);
  const idle = createHuman("B", {}, { hunger: .5 }) as Caller;
  assert.equal((decideLearnedCaller(idle, observation(0), () => 0.5).human as Caller).callPending, null, "no choice is recorded when not eating");
});
test("the call utility is scaled by the learned advantage of calling, and is unchanged until both choices are sampled", () => {
  const h = createHuman("A") as Caller;
  assert.equal(callModulation(h), 1);
  h.callOutcomes = { call: { mean: -0.1, variance: 0, samples: 5 }, silent: { mean: 0.1, variance: 0, samples: 2 } } as Caller["callOutcomes"];
  assert.equal(callModulation(h), 1, "silence not yet sampled enough");
  h.callOutcomes!.silent.samples = 5;
  assert.ok(callModulation(h) < 0.3 && callModulation(h) >= CALLER.floor, "calling that is followed by more hunger than silence is suppressed");
  h.callOutcomes = { call: { mean: 0.1, variance: 0, samples: 5 }, silent: { mean: -0.1, variance: 0, samples: 5 } } as Caller["callOutcomes"];
  assert.ok(callModulation(h) > 1.5 && callModulation(h) <= CALLER.ceiling, "calling that pays off is amplified");
  assert.ok(FOOD_CALL.utility * callModulation(h) > FOOD_CALL.utility);
  assert.equal(HUMAN_MODELS["learned-caller-0.9.0-experimental.1"].apply, applyWithIntake);
});
test("caller-cost-v1 keeps the v5 world, uses fresh seeds, counts food calls, and orients call suppression", () => {
  assert.deepEqual(caller.world, v5.world); assert.deepEqual(caller.resources, v5.resources); assert.deepEqual(caller.agents, v5.agents);
  const all = [caller.pilotSeeds, seedsFor("development", caller, "1"), seedsFor("validation", caller, "1")].flat();
  assert.equal(new Set(all).size, all.length);
  const earlier = ["1", "2", "3"].flatMap(r => [...seedsFor("development", v5, r), ...seedsFor("validation", v5, r)]);
  assert.ok(all.every(s => !earlier.includes(s)) && all.every(s => s >= 36000));
  assert.deepEqual(caller.checks.map(c => c.id), ["call-suppression"]);
  const run = runExperiment({ ...referentialConfig(caller.pilotSeeds[0], "learned-caller-0.9.0-experimental.1", true, caller), horizon: 60 });
  assert.equal(run.frames.length, 61);
  const r = runSeed("eating-voice-referent-0.8.0-experimental.3", caller.pilotSeeds[0], { ...caller, horizon: 300 } as typeof caller);
  assert.ok(Number.isFinite(checkValue("call-suppression", r, caller)));
  const quieter = structuredClone(r); quieter.sound.foodCalls = Math.max(0, quieter.muted.foodCalls - 5);
  assert.ok(checkValue("call-suppression", quieter, caller) >= checkValue("call-suppression", r, caller) || quieter.muted.foodCalls === 0);
});
