/**
 * Run the morph-v1 anthropometric comparison on one split.
 *   npm run study:body-morph -- --male <csv> --female <csv> --split development --out outputs/morph-development.json [--check]
 * Raw ANSUR II files are not in the repository (see research/body/README.md for how to obtain them).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runMorphStudy, renderMarkdown, type Split } from "../research/body/studies/morph-v1.ts";

const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--check") { options.set("--check", "true"); continue; }
  if (!["--split", "--out", "--male", "--female"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i])) throw new Error("Unknown/duplicate option or missing value: " + args[i]);
  options.set(args[i], args[++i]);
}
const split = (options.get("--split") ?? "development") as Split;
if (split !== "development" && split !== "validation") throw new Error("--split must be development or validation");
const male = options.get("--male"), female = options.get("--female");
if (!male || !female) throw new Error("--male and --female CSV paths are required");
const target = resolve(options.get("--out") ?? `outputs/morph-${split}.json`);
if (!target.endsWith(".json")) throw new Error("Output must be JSON");

const report = runMorphStudy({ male: resolve(male), female: resolve(female) }, split);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
writeFileSync(target.replace(/\.json$/, ".md"), renderMarkdown(report));
console.log(renderMarkdown(report));
console.log("wrote", target);
if (options.has("--check") && report.status !== "pass") process.exit(1);
