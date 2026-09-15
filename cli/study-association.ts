import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { protocol, runAssociationPartition } from "../research/studies/sound-association-v1.ts";
const root=resolve(import.meta.dirname,"..");
const args=process.argv.slice(2), options=new Map<string,string>();
for(let i=0;i<args.length;i++) {
  const key=args[i];
  if(options.has(key)) throw Error("Duplicate option: "+key);
  if(key==="--check") {options.set(key,"true");continue;}
  if(!["--split","--out","--model"].includes(key)||!args[i+1]||args[i+1].startsWith("--")) throw Error("Unknown option or missing value: "+key);
  options.set(key,args[++i]);
}
const split=options.get("--split")??"development";
if(split!=="development"&&split!=="validation") throw Error("Invalid split");
const target=resolve(options.get("--out")??`outputs/sound-association-${split}.json`), markdown=target.replace(/\.json$/,".md");
if(!target.endsWith(".json")||existsSync(target)||existsSync(markdown)) throw Error("Output must be new JSON/Markdown paths");
const git=(...argv:string[])=>execFileSync("git",argv,{cwd:root,encoding:"utf8"}).trim();
const paths=git("ls-files","packages","research/studies/sound-association-v1.ts","research/protocols/sound-association-v1.json","research/protocols/core-v1.json","cli/study-association.ts","package-lock.json").split("\n").sort();
const sourceHash=createHash("sha256"); for(const path of paths) sourceHash.update(path+"\0"+readFileSync(resolve(root,path),"utf8")+"\0");
const provenance={commit:git("rev-parse","HEAD"),tree:git("rev-parse","HEAD^{tree}"),dirty:git("status","--porcelain")!=="",sourceHash:sourceHash.digest("hex"),sourceFiles:paths,runtime:process.version};
const model=options.get("--model")??protocol.baseline;
const result=runAssociationPartition(split,model);
const report={format:"human-world-lab/sound-association-summary",schemaVersion:1,protocol,provenance,result};
mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(result,null,2));
const passed=result.checks[0].summary.mean>=protocol.minimumAssociation&&result.checks[1].summary.mean>=protocol.minimumReversedAssociation&&result.checks[2].summary.mean<=protocol.controlTolerance;
if(options.has("--check")&&!passed)process.exitCode=1;
