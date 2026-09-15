import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync,writeFileSync,existsSync,mkdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { protocol,runAssociationPartition } from '../research/studies/sound-association-v1.ts';
import { runEvaluation, summarizeSamples } from '../packages/evaluation/src/index.ts';
import { resolveModel } from '../packages/simulation/src/models.ts';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--out'||!args[1].endsWith('.json'))throw Error('Usage: review-association --out NEW.json');
const target=resolve(args[1]);if(existsSync(target))throw Error('Refusing to overwrite evidence');
const root=resolve(import.meta.dirname,'..');
const git=(...argv:string[])=>execFileSync('git',argv,{cwd:root,encoding:'utf8'}).trim();
const files=git('ls-files','packages','research/studies/sound-association-v1.ts','research/protocols/sound-association-v1.json','research/protocols/core-v1.json','cli/review-association.ts','package-lock.json').split('\n').sort();
const hash=createHash('sha256');for(const f of files)hash.update(f+'\0'+readFileSync(resolve(root,f),'utf8')+'\0');
const provenance={commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),dirty:git('status','--porcelain')!=='',sourceHash:hash.digest('hex'),sourceFiles:files,runtime:process.version};
const ids=[protocol.baseline,protocol.candidate,...['sound-association-off','sound-classification-off','sound-attention-off','sound-policy-off'].map(n=>n+'-0.4.0-experimental.1')];
const partitions=(['development','validation'] as const).map(split=>{
 const results=ids.map(id=>runAssociationPartition(split,id));
 const metric=(index:number,id:string)=>results[index].checks.find(c=>c.id===id)!.summary.mean;
 const checks=[
  {id:'association',pass:metric(1,'association')>=protocol.minimumAssociation},
  {id:'reversal',pass:metric(1,'reversal')>=protocol.minimumReversedAssociation},
  {id:'muted',pass:metric(1,'muted')<=protocol.controlTolerance},
  ...[0,2,3,5].map(i=>({id:ids[i]+'/no-cue-effect',pass:Math.abs(metric(i,'paired'))<=protocol.controlTolerance})),
  {id:'attention-independent',pass:Math.abs(metric(4,'paired')-metric(1,'paired'))<=protocol.controlTolerance},
 ];
 return {split,results,checks};
});
const baseline=runEvaluation({},resolveModel(protocol.baseline));
const candidate=runEvaluation({},resolveModel(protocol.candidate));
const core=candidate.partitions.map((part,p)=>({split:part.name,checks:part.checks.map((c,i)=>{
 const b=baseline.partitions[p].checks[i];
 const delta=summarizeSamples(c.samples.map((s,j)=>s.value-b.samples[j].value),'sound/core/'+part.name+'/'+c.id);
 return {id:c.id,minimum:c.minimum,regressionTolerance:c.regressionTolerance,baseline:b.summary,candidate:c.summary,delta,pass:c.status==='pass'&&delta.mean>=-c.regressionTolerance};
})}));
const failures=[...partitions.flatMap(p=>p.checks.filter(c=>!c.pass).map(c=>p.split+'/'+c.id)),...core.flatMap(p=>p.checks.filter(c=>!c.pass).map(c=>'core/'+p.split+'/'+c.id))];
const report={format:'human-world-lab/sound-association-review-summary',schemaVersion:1,protocol,provenance,partitions,core,failures,decision:failures.length?'revise':'retain-candidate',limits:'Controlled receiver only; core seeds are previously observed. No sender learning or free-world benefit established.'};
mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:target,failures,decision:report.decision,partitions:partitions.map(p=>({split:p.split,candidate:p.results[1].checks,checks:p.checks}))},null,2));
if(failures.length)process.exitCode=1;
