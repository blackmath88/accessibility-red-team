import { execFileSync } from "node:child_process";

// The worker executes exactly the checked-out commit and refuses to run from a modified tree,
// so every run's recorded engine revision is reproducible.
export function cleanEngineRevision(cwd = process.cwd()): string {
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const revision = git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error(`Unexpected git revision: ${revision}`);
  const dirty = git("status", "--porcelain", "--untracked-files=no");
  if (dirty) throw new Error("Engine checkout has tracked modifications; refusing to run");
  return revision;
}
