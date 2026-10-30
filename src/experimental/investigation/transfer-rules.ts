// Experimental investigation slice (ADR-0015). Naming and freeze rules for the blind transfer stage, kept separate so
// they can be tested without running the CLI.
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
