import test from "node:test";
import assert from "node:assert/strict";
import { soundBin, situationBin, mutualInformation, association, runCondition, runSeed, checkValue, assessSeeds, protocol } from "../../research/studies/signal-world-v1.ts";
import { createHuman } from "../../packages/human/src/index.ts";
import { chooseSignalSound, decideWithSenderOptions, decideSignalSenderOff, categoryScore } from "../../packages/human/src/signal-sender.ts";
import { decideSoundAssociation } from "../../packages/human/src/sound-association.ts";
import { runExperiment } from "../../packages/simulation/src/index.ts";
import { pairExperiment, DEFAULT_SETTINGS } from "../../packages/experiments/src/index.ts";

const used = [42, 43, 44, 45, 46, 47, 48, 49, 101, 102, 103, 104, 105, 106, 107, 108, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6101, 6102, 6103, 6104, 7001, 7002, 7003, 7004, 7005, 7006, 7007, 7008, 8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8101, 8102, 8103, 8104, 9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 11001, 11002, 11003, 11004, 11005, 11006, 11007, 11008, 12001, 12002, 12003, 12004, 12005, 12006, 12007, 12008, 13001, 13002, 13003, 13004, 13005, 13006, 13007, 13008];

test("signal-world-v1 seeds are fresh and its bins and information measure behave", () => {
  const all = [protocol.pilotSeeds, protocol.developmentSeeds, protocol.validationSeeds].flat();
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.every(s => !used.includes(s)));
  assert.equal(soundBin({ openness: 0, resonance: 0 }), "0-0");
  assert.equal(soundBin({ openness: 1, resonance: 0.5 }), "2-1");
  assert.equal(situationBin(null), null); assert.equal(situationBin(1), "near"); assert.equal(situationBin(5), "mid"); assert.equal(situationBin(9), "far");
  const dependent = Array.from({ length: 60 }, (_, i) => ({ x: String(i % 3), y: String(i % 3) }));
  assert.ok(Math.abs(mutualInformation(dependent) - Math.log2(3)) < 1e-9, "perfect dependence carries log2(3) bits");
  const independent = Array.from({ length: 60 }, (_, i) => ({ x: String(i % 3), y: String(Math.floor(i / 3) % 2) }));
  assert.ok(mutualInformation(independent) < 1e-9);
  const a = association(dependent, 1, "t");
  assert.ok(a.excess > 1.0 && a.permutationMean >= 0 && a.events === 60);
  assert.deepEqual(association(dependent, 1, "t"), a);
  assert.equal(association([], 1, "t").excess, 0);
});
test("free-world runs are reproducible, muting removes hearing, and scrambling keeps counts", () => {
  const seed = protocol.pilotSeeds[0];
  const sound = runCondition("human-0.2.0", seed, "sound");
  assert.deepEqual(runCondition("human-0.2.0", seed, "sound"), sound);
  const muted = runCondition("human-0.2.0", seed, "muted");
  assert.equal(Object.values(muted.heardEvents).reduce((a, b) => a + b, 0), 0);
  assert.equal(muted.listener.events, 0);
  assert.ok(Object.values(muted.vocalizations).reduce((a, b) => a + b, 0) > 0, "muting removes transmission, not vocalization");
  const scrambled = runCondition("human-0.2.0", seed, "scrambled");
  assert.ok(scrambled.listener.events > 0 && sound.listener.events > 0);
  assert.ok(Number.isFinite(sound.needBurden) && sound.contactTicks >= 0 && sound.closeFraction <= 1);
});
test("checks are oriented toward the hypotheses and a seed result covers three conditions", () => {
  const r = runSeed("human-0.2.0", protocol.pilotSeeds[1]);
  assert.equal(r.sound.condition, "sound"); assert.equal(r.muted.condition, "muted"); assert.equal(r.scrambled.condition, "scrambled");
  const stronger = structuredClone(r); stronger.sound.listener.excess += 1;
  assert.ok(checkValue("listener-association", stronger) > checkValue("listener-association", r));
  const heavier = structuredClone(r); heavier.sound.needBurden += 0.1;
  assert.ok(checkValue("need-side-effect", heavier) < checkValue("need-side-effect", r), "a heavier burden with sound counts against");
  assert.throws(() => checkValue("invented", r));
  const a = assessSeeds("test", [r]);
  assert.equal(a.checks.length, protocol.checks.length);
  assert.equal(typeof a.established, "boolean");
});
test("the sender chooses among learned categories by predicted risk reduction and learns what followed its sounds", () => {
  const human = createHuman("A", {}, { hunger: 0, fatigue: 0, cold: 0 }) as ReturnType<typeof createHuman> & { voiceResponses?: Record<string, Record<number, { mean: number; variance: number; samples: number }>> };
  human.peers.B = { lastSeen: 0, sightings: 10, harmAlpha: 6, harmBeta: 2, responses: {} };
  human.producedSounds = [{ id: 1, shape: { openness: 0.2, resonance: 0.2 }, samples: 5 }, { id: 2, shape: { openness: 0.8, resonance: 0.8 }, samples: 5 }];
  assert.equal(chooseSignalSound(human, "B", 2, () => 0.9), null, "nothing learned yet: default choice");
  human.voiceResponses = { B: { 1: { mean: 1.5, variance: 0.1, samples: 10 }, 2: { mean: -1.5, variance: 0.1, samples: 10 } } };
  assert.ok(categoryScore(human, "B", 2, human.voiceResponses.B[1])! > categoryScore(human, "B", 2, human.voiceResponses.B[2])!, "a sound followed by separation reduces risk more when the peer is close");
  const pick = chooseSignalSound(human, "B", 2, () => 0.9);
  assert.deepEqual(pick, human.producedSounds[0].shape);
  assert.equal(chooseSignalSound(human, "B", 2, () => 0.05), null, "exploration keeps the repertoire open");
  assert.equal(chooseSignalSound(human, null, null, () => 0.9), null);
  const observation = (distance: number) => ({ tick: 0, selfPosition: { x: 10, y: 14 }, animals: [{ trackId: "B", relativePosition: { x: distance, y: 0 }, relativeVelocity: { x: 0, y: 0 }, morphologySimilarity: .98 }], resources: [], sounds: [] });
  const withPending = structuredClone(human) as typeof human & { voicePending?: { peerId: string; category: number; distance: number } | null };
  withPending.voicePending = { peerId: "B", category: 1, distance: 2 };
  const learned = decideWithSenderOptions(withPending, observation(4), () => 0.5).human as typeof withPending;
  assert.ok(learned.voiceResponses!.B[1].samples === 11 && learned.voiceResponses!.B[1].mean > 1.5, "a +2 change pulls the estimate up from 1.5");
  assert.equal(learned.voicePending ?? null, null);
});
test("the sender-off control reproduces the receiver candidate exactly and the sender changes only vocal choices", () => {
  const config = pairExperiment({ ...structuredClone(DEFAULT_SETTINGS), horizon: 200, initialDistance: 6 });
  const receiver = runExperiment({ ...config, model: "sound-association-0.4.0-experimental.1" });
  const senderOff = runExperiment({ ...config, model: "signal-sender-off-0.5.0-experimental.1" });
  assert.deepEqual(senderOff.state.world, receiver.state.world);
  assert.deepEqual(senderOff.state.humans.map(h => h.body), receiver.state.humans.map(h => h.body));
  const human = createHuman("A");
  const observation = { tick: 0, selfPosition: { x: 10, y: 14 }, animals: [], resources: [], sounds: [] };
  assert.deepEqual(decideSignalSenderOff(human, observation, () => 0.5).action, decideSoundAssociation(human, observation, () => 0.5).action);
});
