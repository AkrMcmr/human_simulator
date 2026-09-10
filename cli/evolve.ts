import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { register, seal, run, decide, status } from "../research/evolution/engine.ts";
const root = resolve(import.meta.dirname, "..");
const [command, ...args] = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  if (!["--spec", "--id", "--outcome", "--reason"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i])) throw Error("Invalid or duplicate option " + args[i]);
  options.set(args[i], args[i + 1]);
}
const id = options.get("--id") ?? "";
let output: unknown;
switch (command) {
  case "register": output = register(root, JSON.parse(readFileSync(resolve(options.get("--spec") ?? ""), "utf8"))); break;
  case "seal": output = seal(root, id); break;
  case "run": case "replay": { const result = run(root, id, command === "replay"); output = result.assessment; if (!result.assessment.regressionGate || (result.assessment.primary.length > 0 && !result.assessment.improvementGate)) process.exitCode = 1; break; }
  case "decide": output = decide(root, id, options.get("--outcome") ?? "", options.get("--reason") ?? ""); break;
  case "status": case "next": {
    const directory = resolve(root, "research/evolution/cycles");
    output = id ? status(root, id) : existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => status(root, e.name)) : [];
    break;
  }
  default: throw Error("Usage: evolve register --spec FILE | seal/run/replay/status/next --id ID | decide --id ID --outcome retain-candidate/revise/reject --reason TEXT");
}
console.log(JSON.stringify(output, null, 2));
