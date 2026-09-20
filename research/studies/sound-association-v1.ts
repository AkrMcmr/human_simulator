import protocol from '../protocols/sound-association-v1.json' with { type: 'json' };
import type { Observation, SoundShape } from '../../packages/contracts/src/index.ts';
import { resolveModel } from '../../packages/simulation/src/models.ts';
import { keyedRandom } from '../../packages/simulation/src/random.ts';
import { summarizeSamples } from '../../packages/evaluation/src/index.ts';
export { protocol };
export type Split = 'development' | 'validation';
export type Condition = 'paired' | 'shuffled' | 'muted' | 'reversed';
export function associationInput(tick: number, distance: number, shape: SoundShape | null): Observation {
  return {tick,selfPosition:{x:10,y:14},animals:[{trackId:'B',morphologySimilarity:.98,relativePosition:{x:distance,y:0},relativeVelocity:{x:0,y:0}}],resources:[],sounds:shape?[{visibleSourceId:'B',shape:{...shape},loudness:protocol.loudness,relativePosition:{x:distance,y:0}}]:[]};
}
export function runAssociationSeed(seed: number, split: Split, modelId: string, condition: Condition) {
  const model=resolveModel(modelId);
  let state=model.create('A',{},protocol.body);
  const rng=keyedRandom(seed,'association/shapes',0);
  const shapes=(split==='development'?protocol.developmentShapes:protocol.validationShapes).map((s,i)=>({openness:s.openness+(rng('o',i)-.5)*protocol.jitter,resonance:s.resonance+(rng('r',i)-.5)*protocol.jitter}));
  const order=Array.from({length:protocol.trials},(_,i)=>i%2);
  if(condition==='shuffled') {
    const r=keyedRandom(seed,'association/shuffle',0);
    for(let i=order.length-1;i>0;i--){const j=Math.floor(r('swap',i)*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  }
  // Separate pending extensions are cleared at experimental resets, including future candidate state.
  const reset=()=>{state.pending=null; if('soundPending' in state) state.soundPending=null; state.lastAction='observe';state.body={...protocol.body};};
  const phases=condition==='reversed'?2:1;
  for(let phase=0;phase<phases;phase++) for(let trial=0;trial<protocol.trials;trial++) {
    reset();const tick=(phase*protocol.trials+trial)*2;
    const shape=condition==='muted'?null:shapes[order[trial]];
    const cue=model.decide(state,associationInput(tick,protocol.distance,shape),keyedRandom(seed,'association/choice',tick));
    const delta=(trial%2===0?-1:1)*protocol.delta*(phase===1?-1:1);
    state=model.decide(cue.human,associationInput(tick+1,protocol.distance+delta,null),keyedRandom(seed,'association/choice',tick+1)).human;
  }
  reset();
  const probe=(shape:SoundShape|null)=>{
    const d=model.decide(state,associationInput(phases*protocol.trials*2,protocol.distance,shape),keyedRandom(seed,'association/probe',0));
    const score=(a:string)=>d.trace.scores.find(s=>s.action===a)!.utility;
    return {margin:score('withdraw')-score('approach'),observe:score('observe')};
  };
  const a=probe(condition==='muted'?null:shapes[0]),b=probe(condition==='muted'?null:shapes[1]);
  return {seed,margin:a.margin-b.margin,observeDifference:a.observe-b.observe};
}
export function runAssociationPartition(split:Split, modelId:string) {
  const seeds=split==='development'?protocol.developmentSeeds:protocol.validationSeeds;
  const conditions=['paired','shuffled','muted','reversed'] as const;
  const results=seeds.map(seed=>Object.fromEntries(conditions.map(c=>[c,runAssociationSeed(seed,split,modelId,c)])));
  const aggregate=(id:string,values:number[])=>({id,summary:summarizeSamples(values,'association/'+split+'/'+id)});
  return {split,model:modelId,seeds,checks:[
    aggregate('association',results.map(r=>r.paired.margin-r.shuffled.margin)),
    aggregate('reversal',results.map(r=>-r.reversed.margin)),
    aggregate('muted',results.map(r=>Math.abs(r.muted.margin))),
    aggregate('paired',results.map(r=>r.paired.margin)),
  ]};
}
