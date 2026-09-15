import protocol from "../protocols/signal-readiness-v1.json" with { type: "json" };
import type { Observation, SoundShape, ActionKind } from "../../packages/contracts/src/index.ts";
import { resolveModel } from "../../packages/simulation/src/models.ts";
import { keyedRandom } from "../../packages/simulation/src/random.ts";
import { summarizeSamples } from "../../packages/evaluation/src/index.ts";
export { protocol };
export type Condition = "paired" | "muted" | "shuffled" | "sound-memory-off";
export function schedule(seed: number, condition: Condition) {
  const sounds = Array.from({length: protocol.trials}, (_, i) => i % 2);
  if (condition === "shuffled") {
    const random = keyedRandom(seed, "signal/shuffle", 0);
    for (let i = sounds.length - 1; i > 0; i--) { const j = Math.floor(random("swap", i) * (i + 1)); [sounds[i], sounds[j]] = [sounds[j], sounds[i]]; }
  }
  return sounds;
}
function input(tick: number, distance: number, shape: SoundShape | null): Observation {
  return { tick, selfPosition: {x:10,y:14}, animals:[{trackId:"B",morphologySimilarity:0.98,relativePosition:{x:distance,y:0},relativeVelocity:{x:0,y:0}}], resources:[], sounds:shape ? [{visibleSourceId:"B",shape:{...shape},loudness:protocol.loudness}] : [] };
}
export function runSignalSeed(seed: number, condition: Condition) {
  const model = resolveModel(protocol.model);
  let state = model.create("A", {}, protocol.body);
  const order = schedule(seed, condition);
  const random = keyedRandom(seed, "signal/acoustics", 0);
  const shapes = [protocol.shapeA, protocol.shapeB].map((shape, i) => ({ openness:shape.openness + (random("openness",i)-.5)*protocol.shapeJitter, resonance:shape.resonance + (random("resonance",i)-.5)*protocol.shapeJitter }));
  for(let trial=0; trial<protocol.trials; trial++) {
    // Reset displacement and physiological drift are not learned as action consequences.
    state.pending=null; state.lastAction="observe"; state.body={...protocol.body};
    if(condition === "sound-memory-off") state.heardSounds=[];
    const cue = condition === "muted" ? null : shapes[order[trial]];
    const first=model.decide(state,input(trial*2,protocol.distance,cue),keyedRandom(seed,"signal/choice",trial));
    // A precedes closing; B precedes separation in paired trials. No semantic label enters Observation.
    const delta=trial%2===0 ? -protocol.delta : protocol.delta;
    state=model.decide(first.human,input(trial*2+1,protocol.distance+delta,null),keyedRandom(seed,"signal/feedback",trial)).human;
  }
  const categories=state.heardSounds.length;
  state.pending=null; state.lastAction="observe"; state.body={...protocol.body};
  if(condition === "sound-memory-off") state.heardSounds=[];
  const probe = (shape: SoundShape | null) => {
    // Each probe starts from exactly the same learned state; probes do not train subsequent probes.
    const result=model.decide(state,input(protocol.trials*2,protocol.distance,shape),keyedRandom(seed,"signal/probe",0));
    const score=(action: ActionKind) => result.trace.scores.find(s=>s.action===action)!.utility;
    return {margin:score("withdraw")-score("approach"), observe:score("observe"), selected:result.action.kind, scores:result.trace.scores};
  };
  const a=probe(condition === "muted" ? null : shapes[0]), b=probe(condition === "muted" ? null : shapes[1]);
  const novel=probe(condition === "muted" ? null : protocol.novelShape), silent=probe(null);
  return {seed,condition,categories,soundCounts:order.reduce((counts,n)=>{counts[n]++;return counts;},[0,0]),a,b,novel,silent,
    cueMargin:a.margin-b.margin, attentionNovelty:novel.observe-(a.observe+b.observe)/2,
    acousticEffect:a.observe-silent.observe};
}
export function runSignalPartition(split: "development" | "validation") {
  const seeds=split === "development" ? protocol.developmentSeeds : protocol.validationSeeds;
  const samples=seeds.map(seed=>({seed, conditions:Object.fromEntries(protocol.conditions.map(c=>[c,runSignalSeed(seed,c as Condition)]))}));
  const checks=protocol.diagnostics.map(c=>{
    const values=samples.map(s=>c.id === "categories" ? s.conditions.paired.categories : c.id === "attention" ? s.conditions.paired.attentionNovelty : s.conditions.paired.cueMargin-s.conditions.shuffled.cueMargin);
    const summary=summarizeSamples(values,"signal-readiness/"+split+"/"+c.id);
    return {...c,values,summary,status:summary.mean >= c.minimum ? "pass" : "fail"};
  });
  return {split,seeds,samples,checks,receiverAssociationReady:checks.every(c=>c.status==="pass"),communicationEstablished:false};
}
