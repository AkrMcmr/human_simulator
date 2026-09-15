import test from "node:test";
import assert from "node:assert/strict";
import { schedule, runSignalSeed, protocol } from "../../research/studies/signal-readiness-v1.ts";
test("sound shuffling preserves exposure counts and uses a different association schedule",()=>{
 const paired=schedule(42,"paired"), shuffled=schedule(42,"shuffled");
 assert.deepEqual([...paired].sort(),[...shuffled].sort());
 assert.notDeepEqual(paired,shuffled);
 assert.deepEqual(shuffled,schedule(42,"shuffled"));
 assert.equal(paired.length,protocol.trials);
 assert.equal(new Set([...protocol.developmentSeeds,...protocol.validationSeeds]).size,16);
});
test("muting removes acoustic effects; deleting sound memory removes familiarity while repeated runs reproduce",()=>{
 const paired=runSignalSeed(42,"paired"), muted=runSignalSeed(42,"muted"), erased=runSignalSeed(42,"sound-memory-off");
 assert.deepEqual(paired,runSignalSeed(42,"paired"));
 assert.equal(muted.categories,0); assert.equal(muted.acousticEffect,0);
 assert.equal(erased.attentionNovelty,0);
 assert.ok(paired.attentionNovelty>0);
 assert.ok(paired.categories>=2);
 for(const row of [paired,muted,erased])assert.ok([row.cueMargin,row.attentionNovelty,row.acousticEffect].every(Number.isFinite));
});
