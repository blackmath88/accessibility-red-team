// Experimental investigation slice (ADR-0015). Naming and freeze rules for the blind transfer stage, kept separate so
// they can be tested without running the CLI.
import { open, rm } from "node:fs/promises";
import { join } from "node:path";
export const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/; // runs, attempts, from
export const SUFFIX = /^[a-z0-9]{1,20}$/; // conclusion suffix: no hyphen, so every conclusion file matches CONCLUSION_FILE
export const CONCLUSION_FILE = /^conclusion(-[a-z0-9]{1,20})?\.json$/;
export const conclusionFileName = (suffix: string) => (suffix ? `conclusion-${suffix}.json` : "conclusion.json");
// A dot cannot occur in an attempt name, so a conclude ledger can never collide with a design ledger.
export const concludeLedgerName = (attempt: string, suffix: string) => `${attempt}.conclude${suffix}`;

// Duplicate detection: drop comment-only lines and block comments that start a line, and collapse whitespace runs.
// Deliberately conservative: text inside strings or regex literals is left alone, so different probes are not merged;
// a comment appended after code on the same line still counts as a change.
export function normalise(code: string): string {
  return code.replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

// One exclusive lock per run, shared by conclude and reveal: a conclusion call that started before a reveal can no
// longer write after it. Created with O_EXCL; a second holder is refused rather than queued. A lock left by a killed
// process stays and must be removed by hand after checking that no call is in flight (its pid is inside).
export async function withRunLock<T>(dir: string, what: string, fn: () => Promise<T>): Promise<T> {
  const path = join(dir, "run.lock");
  const h = await open(path, "wx").catch((e: NodeJS.ErrnoException) => {
    throw e.code === "EEXIST" ? new Error(`run is locked by another conclude or reveal (${path}); refusing ${what}`) : e;
  });
  try {
    await h.writeFile(JSON.stringify({ pid: process.pid, what, at: new Date().toISOString() }));
    await h.close();
    return await fn();
  } finally {
    await rm(path, { force: true });
  }
}
