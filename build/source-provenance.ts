import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
export function sourceProvenance() {
  const git = (...args: string[]) => {
    try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { return "uncommitted"; }
  };
  return {
    sourceCommit: git("rev-parse", "HEAD"), sourceHash: git("rev-parse", "HEAD^{tree}"),
    dependencyLockHash: createHash("sha256").update(readFileSync("package-lock.json")).digest("hex"),
    runtime: "JavaScript / browser", dirty: git("status", "--porcelain") !== "",
  };
}
