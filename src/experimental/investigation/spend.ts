// Experimental investigation slice (ADR-0015). Aggregate owner-cap accounting for paid designer calls.
//
// Fails closed: a missing prior-ledger directory, an expected ledger that cannot be read or parsed, or an amount that is
// not a finite non-negative number throws, so a paid call is refused. Only a run directory without a ledger file at all
// (e.g. a replay-only directory) is treated as contributing nothing. Paths are absolute, anchored at the repository root.
import { readdir, readFile, stat } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const OWNER_CAP_USD = 5;

export type SpendPart = { source: string; spend: number };

const amount = (v: unknown, where: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error(`ledger ${where}: spend must be a finite non-negative number`);
  return v;
};
const absent = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "ENOENT";

async function readJson(path: string): Promise<unknown> {
  let raw: string;
  try { raw = await readFile(path, "utf8"); } catch (e) { throw new Error(`ledger ${path} unreadable: ${(e as NodeJS.ErrnoException).code ?? e}`); }
  try { return JSON.parse(raw); } catch { throw new Error(`ledger ${path} is not valid JSON`); }
}

// Earlier experiments: <priorDir>/<run>/ledger.json with {consultant:{spend}, direct?:{spend}}. At least one required.
export async function priorLedgers(priorDir: string): Promise<SpendPart[]> {
  if (!priorDir) throw new Error("AIL_PRIOR_LEDGERS not set: the aggregate owner cap needs the earlier ledgers");
  const parts: SpendPart[] = [];
  for (const d of await readdir(priorDir)) {
    if (!(await stat(join(priorDir, d))).isDirectory()) continue;
    const path = join(priorDir, d, "ledger.json");
    const exists = await stat(path).then(() => true, (e) => { if (absent(e)) return false; throw e; });
    if (!exists) continue;
    const j = await readJson(path) as { consultant?: { spend?: unknown }; direct?: { spend?: unknown } };
    if (!j || typeof j !== "object" || !j.consultant) throw new Error(`ledger ${path}: missing consultant`);
    parts.push({ source: path, spend: amount(j.consultant.spend, path) + (j.direct === undefined ? 0 : amount(j.direct?.spend, path)) });
  }
  if (parts.length === 0) throw new Error("no prior ledgers under AIL_PRIOR_LEDGERS: refusing paid calls");
  return parts;
}

// Investigation runs: <root>/<run>/designer-ledger-*.json with {spend}. A missing root contributes nothing.
export async function runLedgers(roots: string[]): Promise<SpendPart[]> {
  const parts: SpendPart[] = [];
  for (const root of roots) {
    const runs = await readdir(root).catch((e) => { if (absent(e)) return [] as string[]; throw e; });
    for (const d of runs) {
      if (!(await stat(join(root, d))).isDirectory()) continue;
      for (const f of await readdir(join(root, d))) {
        if (!/^designer-ledger.*\.json$/.test(f)) continue;
        const path = join(root, d, f);
        parts.push({ source: path, spend: amount((await readJson(path) as { spend?: unknown })?.spend, path) });
      }
    }
  }
  return parts;
}

export const INVESTIGATION_RUN_ROOTS = [join(REPO_ROOT, "runs/ail-m1"), join(REPO_ROOT, "runs/ail-transfer")];

// Run ledgers live under runs/ (gitignored), so other checkouts' ledgers are not visible here. AIL_EXTRA_RUN_ROOTS
// (path-delimited) names them; each must exist. AIL_MIN_PRIOR_USD is the last reported aggregate: a computed total below
// it means ledgers are missing, and paid calls are refused.
export async function ownerSpend(env: Record<string, string | undefined> = process.env, roots = INVESTIGATION_RUN_ROOTS) {
  const extra = (env["AIL_EXTRA_RUN_ROOTS"] ?? "").split(delimiter).filter(Boolean);
  for (const r of extra) if (!(await stat(r).then((st) => st.isDirectory(), () => false))) throw new Error(`AIL_EXTRA_RUN_ROOTS entry ${r} is not a directory`);
  const parts = [...await priorLedgers(env["AIL_PRIOR_LEDGERS"] ?? ""), ...await runLedgers([...roots, ...extra])];
  const total = parts.reduce((a, p) => a + p.spend, 0);
  const floor = env["AIL_MIN_PRIOR_USD"] === undefined ? null : Number(env["AIL_MIN_PRIOR_USD"]);
  if (floor === null || !Number.isFinite(floor) || floor < 0) throw new Error("AIL_MIN_PRIOR_USD (last reported aggregate spend) is required");
  if (total + 1e-9 < floor) throw new Error(`ledgers sum to USD ${total.toFixed(4)}, below the reported USD ${floor}: ledgers are missing`);
  return { total, parts };
}
