// Versioned investigation bundle (art/investigation-bundle/v1) and a dependency-free runtime validator.
// Shared by the workspace (bundler resolution, DOM) and the root node:test suite (NodeNext); keep it free of node, DOM and Vite APIs.

export const BUNDLE_SCHEMA = "art/investigation-bundle/v1";

export type Author = "model" | "coordinator";
export type Validity = "valid" | "invalid" | "no-pixels";
export type Hypothesis = { id: string; status: string; scope: string; evidence: string };
export type Probe = { attempt: string; author: Author; model?: string; mode: string; createdAt?: string; codeSha256: string; codePath: string; proposalPath?: string; hypotheses?: string[]; executed: string; outcome: string; outcomeSource: string };
export type Topmost = { tag: string; position: string; zIndex: string; background: string };
export type Measurement = { run: string; attempt: string; author: Author; target: string; viewport: string; scrollY?: number; topmost?: Topmost; pixelMin?: number; pixelP50?: number; artifactSha256?: string; validity: Validity; note?: string };
export type Criticism = { attempt: string; path: string; criticModel?: string; context: string; verdict: string; mostImportantChange?: string };
export type Revision = { attempt: string; respondsTo: string; claimedChanges: string[]; actuallyPresent: string; source: string };
export type Replay = { original: string; replay: string; artifactSha256: string[]; identical: boolean };
export type ProvenanceLink = { label: string; path: string; sha256: string };
export type Fact = { label: string; value: string };
export type Screenshot = { label: string; path: string; sha256: string; alt: string };
// One transfer case or replay. kind keeps a blind discovery result apart from a post-reveal reasoning replay.
export type TransferCase = { id: string; kind: "blind" | "post-reveal replay"; title: string; verdict: string; measured: string[]; inferredCorrectly: string[]; inferredIncorrectly: string[]; uncertainty: string[]; nextAction: string; facts?: Fact[]; screenshots?: Screenshot[]; provenance?: ProvenanceLink[] };
export type Transfer = { status: "pending"; note: string } | { status: "completed" | "failed"; note: string; summary?: string; sourceRevision?: string; facts?: Fact[]; provenance?: ProvenanceLink[]; cases?: TransferCase[] };
export type InvestigationBundle = {
  schema: typeof BUNDLE_SCHEMA;
  bundleId: string;
  caseId: string;
  title: string;
  question: string;
  scope: { target: string; singleUrl: boolean; liveLoadsUsed: number; liveLoadBudget: number; browser: string; deviceScaleFactor: number; viewportsTested: string[]; interactions: string; liveLoadWindow: string[]; note: string };
  sourceRevisions: { m1Code: string; evidence: string; plan: string; workspace: string };
  hardening: { commit: string; liveRunsPrecedeHardening: boolean; note: string; source: string };
  hypotheses: Hypothesis[];
  probes: Probe[];
  measurements: Measurement[];
  criticism: Criticism[];
  revisions: Revision[];
  replay: Replay[];
  conclusion: { judgeModel: string; judgeContext: string; summary: string; renderedContrastDesktop: { value: string; method: string }; aiContribution: string; invalid: string[]; source: string };
  uncertainties: string[];
  cost: { provider: string; model: string; m1Usd: number; cumulativeUsd: number; capUsd: number; designerCalls: number; source: string };
  omitted: string[];
  provenance: ProvenanceLink[];
  transfer: Transfer;
};
export type BundleResult = { ok: true; bundle: InvestigationBundle } | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;
const SHA256 = /^[0-9a-f]{64}$/, COMMIT = /^[0-9a-f]{40}$/, VIEWPORT = /^\d+x\d+$/;

export function validateBundle(x: unknown): BundleResult {
  const errors: string[] = [];
  const fail = (path: string, msg: string) => { errors.push(`${path}: ${msg}`); };
  const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
  const obj = (v: unknown, path: string): Obj | undefined => { if (isObj(v)) return v; fail(path, "expected object"); return undefined; };
  const str = (o: Obj, k: string, path: string, optional = false) => { const v = o[k]; if (v === undefined && optional) return; if (typeof v !== "string" || !v.trim()) fail(`${path}.${k}`, "expected non-empty string"); };
  const num = (o: Obj, k: string, path: string, optional = false) => { const v = o[k]; if (v === undefined && optional) return; if (typeof v !== "number" || !Number.isFinite(v)) fail(`${path}.${k}`, "expected finite number"); };
  const bool = (o: Obj, k: string, path: string) => { if (typeof o[k] !== "boolean") fail(`${path}.${k}`, "expected boolean"); };
  const match = (o: Obj, k: string, re: RegExp, path: string, optional = false) => { const v = o[k]; if (v === undefined && optional) return; if (typeof v !== "string" || !re.test(v)) fail(`${path}.${k}`, `expected ${re}`); };
  const oneOf = (o: Obj, k: string, allowed: readonly string[], path: string) => { const v = o[k]; if (typeof v !== "string" || !allowed.includes(v)) fail(`${path}.${k}`, `expected one of ${allowed.join("|")}`); };
  const repoPath = (o: Obj, k: string, path: string, optional = false) => { const v = o[k]; if (v === undefined && optional) return; if (typeof v !== "string" || !v || v.startsWith("/") || v.includes("..") || v.includes("://") || v.includes("\\")) fail(`${path}.${k}`, "expected repo-relative path"); };
  const strings = (o: Obj, k: string, path: string, optional = false) => { const v = o[k]; if (v === undefined && optional) return; if (!Array.isArray(v) || v.some(s => typeof s !== "string" || !s.trim())) fail(`${path}.${k}`, "expected array of non-empty strings"); };
  const list = (o: Obj, k: string, path: string, each: (item: Obj, p: string) => void, nonEmpty = true) => {
    const v = o[k];
    if (!Array.isArray(v)) { fail(`${path}.${k}`, "expected array"); return; }
    if (nonEmpty && !v.length) fail(`${path}.${k}`, "expected at least one entry");
    v.forEach((item, i) => { const p = `${path}.${k}[${i}]`; const it = obj(item, p); if (it) each(it, p); });
  };
  const provenance = (o: Obj, p: string) => { str(o, "label", p); repoPath(o, "path", p); match(o, "sha256", SHA256, p); };

  const b = obj(x, "bundle");
  if (!b) return { ok: false, errors };
  if (b.schema !== BUNDLE_SCHEMA) fail("bundle.schema", `expected ${BUNDLE_SCHEMA}`);
  for (const k of ["bundleId", "caseId", "title", "question"]) str(b, k, "bundle");

  const scope = obj(b.scope, "bundle.scope");
  if (scope) {
    for (const k of ["target", "browser", "interactions", "note"]) str(scope, k, "bundle.scope");
    bool(scope, "singleUrl", "bundle.scope");
    for (const k of ["liveLoadsUsed", "liveLoadBudget", "deviceScaleFactor"]) num(scope, k, "bundle.scope");
    if (typeof scope.liveLoadsUsed === "number" && typeof scope.liveLoadBudget === "number" && scope.liveLoadsUsed > scope.liveLoadBudget) fail("bundle.scope.liveLoadsUsed", "exceeds liveLoadBudget");
    strings(scope, "viewportsTested", "bundle.scope");
    if (Array.isArray(scope.viewportsTested) && scope.viewportsTested.some(v => typeof v !== "string" || !VIEWPORT.test(v))) fail("bundle.scope.viewportsTested", "expected WIDTHxHEIGHT entries");
    strings(scope, "liveLoadWindow", "bundle.scope");
  }
  const rev = obj(b.sourceRevisions, "bundle.sourceRevisions");
  if (rev) for (const k of ["m1Code", "evidence", "plan", "workspace"]) match(rev, k, COMMIT, "bundle.sourceRevisions");
  const hard = obj(b.hardening, "bundle.hardening");
  if (hard) { match(hard, "commit", COMMIT, "bundle.hardening"); bool(hard, "liveRunsPrecedeHardening", "bundle.hardening"); str(hard, "note", "bundle.hardening"); repoPath(hard, "source", "bundle.hardening"); }

  list(b, "hypotheses", "bundle", (h, p) => { for (const k of ["id", "status", "scope", "evidence"]) str(h, k, p); });
  list(b, "probes", "bundle", (pr, p) => {
    str(pr, "attempt", p); oneOf(pr, "author", ["model", "coordinator"], p); str(pr, "mode", p);
    if (pr.author === "model") str(pr, "model", p); else str(pr, "model", p, true);
    str(pr, "createdAt", p, true); match(pr, "codeSha256", SHA256, p); repoPath(pr, "codePath", p); repoPath(pr, "proposalPath", p, true);
    strings(pr, "hypotheses", p, true); str(pr, "executed", p); str(pr, "outcome", p); repoPath(pr, "outcomeSource", p);
  });
  list(b, "measurements", "bundle", (m, p) => {
    for (const k of ["run", "attempt"]) str(m, k, p);
    oneOf(m, "author", ["model", "coordinator"], p); oneOf(m, "validity", ["valid", "invalid", "no-pixels"], p);
    if (typeof m.target !== "string" || !(m.target === "live" || /^fixture:[\w-]+$/.test(m.target))) fail(`${p}.target`, "expected live or fixture:<name>");
    match(m, "viewport", VIEWPORT, p); num(m, "scrollY", p, true); num(m, "pixelMin", p, true); num(m, "pixelP50", p, true);
    match(m, "artifactSha256", SHA256, p, true); str(m, "note", p, true);
    if (m.topmost !== undefined) { const t = obj(m.topmost, `${p}.topmost`); if (t) for (const k of ["tag", "position", "zIndex", "background"]) str(t, k, `${p}.topmost`); }
    if (m.validity === "valid" && (typeof m.pixelMin !== "number" || typeof m.scrollY !== "number")) fail(p, "a valid measurement needs scrollY and pixelMin");
    if (m.validity !== "valid") str(m, "note", p);
  });
  list(b, "criticism", "bundle", (c, p) => { str(c, "attempt", p); repoPath(c, "path", p); str(c, "criticModel", p, true); str(c, "context", p); str(c, "verdict", p); str(c, "mostImportantChange", p, true); });
  list(b, "revisions", "bundle", (r, p) => { str(r, "attempt", p); str(r, "respondsTo", p); strings(r, "claimedChanges", p); str(r, "actuallyPresent", p); repoPath(r, "source", p); });
  list(b, "replay", "bundle", (r, p) => {
    str(r, "original", p); str(r, "replay", p); bool(r, "identical", p);
    if (!Array.isArray(r.artifactSha256) || r.artifactSha256.some(s => typeof s !== "string" || !SHA256.test(s))) fail(`${p}.artifactSha256`, "expected array of sha256");
  });
  const c = obj(b.conclusion, "bundle.conclusion");
  if (c) {
    for (const k of ["judgeModel", "judgeContext", "summary", "aiContribution"]) str(c, k, "bundle.conclusion");
    strings(c, "invalid", "bundle.conclusion"); repoPath(c, "source", "bundle.conclusion");
    const rc = obj(c.renderedContrastDesktop, "bundle.conclusion.renderedContrastDesktop");
    if (rc) { str(rc, "value", "bundle.conclusion.renderedContrastDesktop"); str(rc, "method", "bundle.conclusion.renderedContrastDesktop"); }
  }
  strings(b, "uncertainties", "bundle"); strings(b, "omitted", "bundle");
  const cost = obj(b.cost, "bundle.cost");
  if (cost) { for (const k of ["provider", "model"]) str(cost, k, "bundle.cost"); for (const k of ["m1Usd", "cumulativeUsd", "capUsd", "designerCalls"]) num(cost, k, "bundle.cost"); repoPath(cost, "source", "bundle.cost"); }
  list(b, "provenance", "bundle", provenance);
  const t = obj(b.transfer, "bundle.transfer");
  if (t) {
    oneOf(t, "status", ["pending", "completed", "failed"], "bundle.transfer"); str(t, "note", "bundle.transfer");
    if (t.status !== "pending") { str(t, "summary", "bundle.transfer", true); match(t, "sourceRevision", COMMIT, "bundle.transfer", true); if (t.facts !== undefined) list(t, "facts", "bundle.transfer", (f, p) => { str(f, "label", p); str(f, "value", p); }, false); if (t.provenance !== undefined) list(t, "provenance", "bundle.transfer", provenance, false);
      if (t.cases !== undefined) list(t, "cases", "bundle.transfer", (k, p) => {
        str(k, "id", p); oneOf(k, "kind", ["blind", "post-reveal replay"], p); str(k, "title", p); str(k, "verdict", p); str(k, "nextAction", p);
        for (const f of ["measured", "inferredCorrectly", "inferredIncorrectly", "uncertainty"]) strings(k, f, p);
        if (k.facts !== undefined) list(k, "facts", p, (f, q) => { str(f, "label", q); str(f, "value", q); }, false);
        if (k.screenshots !== undefined) list(k, "screenshots", p, (f, q) => { provenance(f, q); str(f, "alt", q); if (typeof f.path === "string" && !f.path.endsWith(".png")) fail(`${q}.path`, "expected a .png"); }, false);
        if (k.provenance !== undefined) list(k, "provenance", p, provenance, false);
      }, false); }
  }
  return errors.length ? { ok: false, errors } : { ok: true, bundle: x as InvestigationBundle };
}
