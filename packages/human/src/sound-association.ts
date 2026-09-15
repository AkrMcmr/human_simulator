import { clamp, magnitude, soundDistance } from '../../contracts/src/index.ts';
import type { Observation, RandomSource } from '../../contracts/src/index.ts';
import { decideHuman, decideWithOptions, predictedSafety } from './index.ts';
import type { HumanState, OutcomeBonus } from './index.ts';

export const SOUND_ASSOCIATION_VERSION = '0.4.0-experimental.1';
export type SoundOptions = { association?: boolean; classification?: boolean; attention?: boolean; policy?: boolean };
/** Locally observed correlation, not a causal estimate of the other individual's intention. */
export function decideWithSoundOptions(previous:HumanState, observation:Observation, random:RandomSource, options:SoundOptions={}) {
  if(options.association===false) return decideHuman(previous,observation,random);
  const human=structuredClone(previous);
  const animals=observation.animals.filter(a=>a.morphologySimilarity>=.7)
    .sort((a,b)=>magnitude(a.relativePosition)-magnitude(b.relativePosition)||a.trackId.localeCompare(b.trackId));
  const peer=animals[0];
  const pending=human.soundPending;
  if(options.classification!==false && pending && observation.tick===pending.tick+1 && human.parameters.learningRate>0) {
    const seen=animals.find(a=>a.trackId===pending.peerId);
    // A removed/replaced category must not inherit an old pending association.
    if(seen && human.heardSounds.some(c=>c.id===pending.category)) {
      human.soundAssociations??={};
      const memories=human.soundAssociations[pending.peerId]??={};
      const e=memories[pending.category]??{mean:0,variance:1,samples:0};
      const residual=clamp(magnitude(seen.relativePosition)-pending.distance,-2,2)-e.mean;
      const rate=human.parameters.learningRate;
      e.mean+=rate*residual;
      e.variance=Math.max(0,(1-rate)*e.variance+rate*residual*residual);e.samples++;
      memories[pending.category]=e;
    }
  }
  human.soundPending=null;
  const sounds=peer?observation.sounds.filter(s=>s.visibleSourceId===peer.trackId && s.loudness>0):[];
  const sound=sounds.length===1?sounds[0]:null;
  const category=options.classification===false||!sound?null:[...human.heardSounds]
    .filter(c=>soundDistance(c.shape,sound.shape)<.18)
    .sort((a,b)=>soundDistance(a.shape,sound.shape)-soundDistance(b.shape,sound.shape)||a.id-b.id)[0];
  const estimate=peer&&category?human.soundAssociations?.[peer.trackId]?.[category.id]:undefined;
  const bonus:OutcomeBonus=(action,h,distance,id)=>{
    if(options.policy===false||!estimate||estimate.samples<4||distance===null||!id) return 0;
    const memory=h.peers[id];
    const harm=memory.harmAlpha/(memory.harmAlpha+memory.harmBeta);
    const risk=(d:number)=>clamp(clamp(1-d/12)*harm+(d<1.5?.25:0));
    const change=risk(Math.max(0,distance+clamp(estimate.mean,-2,2)))-risk(distance);
    const confidence=estimate.samples/(estimate.samples+8)/(1+estimate.variance);
    const budget=1-Math.max(h.body.hunger,h.body.fatigue,h.body.cold);
    const adjustment=clamp(4*h.parameters.caution*budget*confidence*change,-.2,.2);
    return action==='withdraw'?adjustment:action==='approach'?-adjustment:0;
  };
  const result=decideWithOptions(human,observation,random,{outcomeBonus:predictedSafety,signalBonus:bonus,
    auditoryClassification:options.classification,auditoryAttention:options.attention});
  if(sound&&peer&&options.classification!==false) {
    const learned=[...result.human.heardSounds].sort((a,b)=>soundDistance(a.shape,sound.shape)-soundDistance(b.shape,sound.shape)||a.id-b.id)[0];
    if(learned && soundDistance(learned.shape,sound.shape)<.18) result.human.soundPending={tick:observation.tick,peerId:peer.trackId,category:learned.id,distance:magnitude(peer.relativePosition)};
  }
  return result;
}
export const decideAssociationOff=(h:HumanState,o:Observation,r:RandomSource)=>decideWithSoundOptions(h,o,r,{association:false});
export const decideClassificationOff=(h:HumanState,o:Observation,r:RandomSource)=>decideWithSoundOptions(h,o,r,{classification:false});
export const decideAttentionOff=(h:HumanState,o:Observation,r:RandomSource)=>decideWithSoundOptions(h,o,r,{attention:false});
export const decideSoundPolicyOff=(h:HumanState,o:Observation,r:RandomSource)=>decideWithSoundOptions(h,o,r,{policy:false});

export const decideSoundAssociation=(h:HumanState,o:Observation,r:RandomSource)=>decideWithSoundOptions(h,o,r);
