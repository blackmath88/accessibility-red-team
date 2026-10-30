import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { validateBundle, type InvestigationBundle } from "../control-center/src/investigationBundle.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const bundlePath = "docs/experiments/basel-m1/investigation-bundle.json";
const raw = JSON.parse(readFileSync(root + bundlePath, "utf8")) as InvestigationBundle;
const sha256 = (path: string) => createHash("sha256").update(readFileSync(root + path)).digest("hex");
const clone = () => structuredClone(raw) as unknown as Record<string, any>;
const errorsOf = (x: unknown) => { const r = validateBundle(x); assert.equal(r.ok, false); return r.ok ? [] : r.errors; };

describe("Basel M1 investigation bundle", () => {
  it("validates the committed bundle", () => {
    const r = validateBundle(raw);
    assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
  });

  it("rejects malformed variants", () => {
    assert.ok(errorsOf(null).length);
    const wrongSchema = clone(); wrongSchema.schema = "art/investigation-bundle/v0";
    assert.ok(errorsOf(wrongSchema).some(e => e.startsWith("bundle.schema")));
    const badAuthor = clone(); badAuthor.probes[0].author = "unknown";
    assert.ok(errorsOf(badAuthor).some(e => e.includes("probes[0].author")));
    const badSha = clone(); badSha.probes[1].codeSha256 = "242c3c";
    assert.ok(errorsOf(badSha).some(e => e.includes("probes[1].codeSha256")));
    const absolute = clone(); absolute.provenance[0].path = "/etc/passwd";
    assert.ok(errorsOf(absolute).some(e => e.includes("provenance[0].path")));
    const escape = clone(); escape.provenance[0].path = "../outside";
    assert.ok(errorsOf(escape).some(e => e.includes("provenance[0].path")));
    const validWithoutPixels = clone(); const m = validWithoutPixels.measurements.find((x: any) => x.validity === "valid"); delete m.pixelMin;
    assert.ok(errorsOf(validWithoutPixels).some(e => e.includes("valid measurement")));
    const noTransfer = clone(); delete noTransfer.transfer;
    assert.ok(errorsOf(noTransfer).some(e => e.startsWith("bundle.transfer")));
    const badTarget = clone(); badTarget.measurements[0].target = "somewhere";
    assert.ok(errorsOf(badTarget).some(e => e.includes("measurements[0].target")));
  });

  it("accepts a filled transfer slot", () => {
    const filled = clone(); filled.transfer = { status: "completed", note: "filled", summary: "result" };
    assert.ok(validateBundle(filled).ok);
  });

  it("keeps blind transfer cases apart from replays and pins their evidence", () => {
    const t = raw.transfer as any;
    assert.deepEqual(t.cases.map((c: any) => c.kind), ["post-reveal replay", "blind"]);
    for (const c of t.cases) for (const l of [...(c.provenance ?? []), ...(c.screenshots ?? [])]) assert.equal(sha256(l.path), l.sha256, l.path);
    const badKind = clone(); badKind.transfer.cases[1].kind = "benchmark";
    assert.ok(errorsOf(badKind).some(e => e.includes("cases[1].kind")));
    const notPng = clone(); notPng.transfer.cases[1].screenshots[0].path = "docs/experiments/ail-transfer/README.md";
    assert.ok(errorsOf(notPng).some(e => e.includes("screenshots[0].path")));
  });

  it("points every provenance path at a committed file whose sha256 matches", () => {
    const paths = [
      ...raw.provenance.map(p => p.path), ...raw.probes.flatMap(p => [p.codePath, p.outcomeSource, ...(p.proposalPath ? [p.proposalPath] : [])]),
      ...raw.criticism.map(c => c.path), ...raw.revisions.map(r => r.source), raw.conclusion.source, raw.cost.source, raw.hardening.source,
    ];
    for (const path of paths) assert.ok(existsSync(root + path), `missing ${path}`);
    for (const p of raw.provenance) assert.equal(sha256(p.path), p.sha256, p.path);
    for (const p of raw.probes) assert.equal(sha256(p.codePath), p.codeSha256, `${p.attempt} ${p.codePath}`);
  });

  it("matches the recorded measurements and keeps the M1 boundaries visible", () => {
    const measurements = JSON.parse(readFileSync(root + "docs/experiments/basel-m1/evidence/measurements.json", "utf8")) as Record<string, { codeSha256: string; measurements: { scrollY?: number; pixels?: { min?: number | null } }[] }>;
    for (const m of raw.measurements.filter(x => x.pixelMin !== undefined)) {
      const run = measurements[`${m.run}:${m.target.replace(/^fixture:/, "")}@${m.viewport}`];
      assert.ok(run, `${m.run} ${m.target} ${m.viewport}`);
      assert.ok(run.measurements.some(r => r.scrollY === m.scrollY && r.pixels?.min === m.pixelMin), `${m.run} ${m.viewport} ${m.scrollY}`);
    }
    const mobile = raw.measurements.filter(m => m.target === "live" && m.viewport === "390x844" && m.validity === "valid");
    assert.ok(mobile.length);
    for (const m of mobile) assert.equal(m.author, "coordinator");
    const desktop = raw.measurements.filter(m => m.target === "live" && m.validity === "valid" && m.author === "model");
    assert.deepEqual([...new Set(desktop.map(m => m.viewport))].sort(), ["1280x800", "1440x900"]);
    assert.ok(raw.hardening.liveRunsPrecedeHardening);
    assert.equal(raw.scope.liveLoadsUsed, JSON.parse(readFileSync(root + "docs/experiments/basel-m1/evidence/live-ledger.json", "utf8")).loads.length);
  });
});
