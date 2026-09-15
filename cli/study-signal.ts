import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { protocol, runSignalPartition } from "../research/studies/signal-readiness-v1.ts";
const root=resolve(import.meta.dirname,"..");
const args=process.argv.slice(2), options=new Map<string,string>();
for(let i=0;i<args.length;i++) {
  const key=args[i];
  if(options.has(key)) throw Error("Duplicate option: "+key);
  if(key==="--check") {options.set(key,"true");continue;}
  if(!["--split","--out"].includes(key)||!args[i+1]||args[i+1].startsWith("--")) throw Error("Unknown option or missing value: "+key);
  options.set(key,args[++i]);
}
const split=options.get("--split")??"development";
if(split!=="development"&&split!=="validation") throw Error("Invalid split");
const target=resolve(options.get("--out")??`outputs/signal-readiness-${split}.json`), markdown=target.replace(/\.json$/,".md");
if(!target.endsWith(".json")||existsSync(target)||existsSync(markdown)) throw Error("Output must be new JSON/Markdown paths");
const git=(...argv:string[])=>execFileSync("git",argv,{cwd:root,encoding:"utf8"}).trim();
const paths=git("ls-files","packages","research/studies/signal-readiness-v1.ts","research/protocols/signal-readiness-v1.json","research/protocols/core-v1.json","cli/study-signal.ts","package-lock.json").split("\n").sort();
const sourceHash=createHash("sha256"); for(const path of paths) sourceHash.update(path+"\0"+readFileSync(resolve(root,path),"utf8")+"\0");
const provenance={commit:git("rev-parse","HEAD"),tree:git("rev-parse","HEAD^{tree}"),dirty:git("status","--porcelain")!=="",sourceHash:sourceHash.digest("hex"),sourceFiles:paths,runtime:process.version};
const result=runSignalPartition(split);
const report={format:"human-world-lab/signal-readiness",schemaVersion:1,protocol,provenance,result};
mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
const lines=["# M3: 音を距離調整に使えるか（受信側の準備診断）","",`モデル: ${protocol.model} / ${split} / ソース: ${provenance.commit}`,"", "| 診断 | 平均 | 閾値 | 結果 |","| --- | ---: | ---: | --- |",...result.checks.map(c=>`| ${c.meaning} | ${c.summary.mean.toFixed(6)} | ${c.minimum} | ${c.status} |`),"",`受信側の関連利用条件を達成: ${result.receiverAssociationReady}`,"合図の創発は未検証。実験者が音と距離変化を提示しており、送信者は学習していない。","音分類と新奇音への注意が成立しても、音と結果を結びつけた距離調整とは区別する。","確認シードを一度観察した後は既知の回帰条件として扱う。",""];
writeFileSync(markdown,lines.join("\n"),{flag:"wx"});
console.log(JSON.stringify({output:target,checks:result.checks,receiverAssociationReady:result.receiverAssociationReady},null,2));
if(options.has("--check")&&!result.receiverAssociationReady)process.exitCode=1;
