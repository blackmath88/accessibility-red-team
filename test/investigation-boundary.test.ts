import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { MeasurementBroker } from "../src/experimental/investigation/broker.js";
import { DEFAULT_LIMITS, runInSandbox, sandboxAvailable } from "../src/experimental/investigation/sandbox.js";

const available = sandboxAvailable().ok;

describe("investigation sandbox (bwrap) and measurement broker boundaries", { skip: available ? false : "bwrap not available" }, () => {
  let dir: string;
  let broker: MeasurementBroker;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "ail-test-"));
    broker = new MeasurementBroker({ runDir: dir, ledgerPath: join(dir, "ledger.json"), fixtureDir: "test/fixtures/investigation-boundary", liveAllowed: false, maxLiveLoads: 0, minGapMs: 10_000 });
  });
  after(async () => { await broker.close(); await rm(dir, { recursive: true, force: true }); });

  it("generated code has no network, host filesystem, environment or process spawning", async () => {
    const code = `export default async function () {
      const o = {};
      try { await fetch("https://www.bs.ch/", { signal: AbortSignal.timeout(2000) }); o.net = "REACHED"; } catch (e) { o.net = "blocked"; }
      const fs = await import("node:fs");
      const seen = (path) => { try { return fs.existsSync(path); } catch { return false; } }; // the permission model throws instead
      o.home = seen("/home"); o.repo = seen(${JSON.stringify(process.cwd())});
      try { fs.writeFileSync("/usr/x", "1"); o.write = "WROTE"; } catch { o.write = "denied"; }
      o.env = Object.keys(process.env).filter((k) => k !== "PWD");
      try { (await import("node:child_process")).execSync("id"); o.exec = "RAN"; } catch { o.exec = "blocked"; }
      try { (await import("node:child_process")).execFileSync("/usr/bin/id"); o.execFile = "RAN"; } catch { o.execFile = "blocked"; }
      try { new (await import("node:worker_threads")).Worker("/probe.mjs"); o.worker = "STARTED"; } catch { o.worker = "blocked"; }
      return o; }`;
    const out = await runInSandbox(code, {}, null);
    assert.equal(out.state, "completed", out.error ?? "");
    assert.deepEqual(out.result, { net: "blocked", home: false, repo: false, write: "denied", env: [], exec: "blocked", execFile: "blocked", worker: "blocked" });
  });

  it("the broker refuses unknown operations, live access when not enabled, traversal and oversized arguments", async () => {
    const code = `export default async function (broker) {
      const r = {}; const t = async (k, op, a) => { try { await broker.call(op, a); r[k] = "allowed"; } catch (e) { r[k] = e.message.slice(0, 60); } };
      await t("unknown", "evaluate", { js: "document.cookie" });
      await t("live", "open", { target: "live", viewport: "1440x900" });
      await t("traversal", "open", { target: "../../etc/passwd" });
      await t("badViewport", "open", { target: "forged", viewport: "9999x9999" });
      await t("noPage", "findText", { text: "x" });
      await t("fixture", "open", { target: "forged", viewport: "1440x900" });
      await t("tooManyPoints", "elementsFromPoint", { points: Array.from({ length: 21 }, () => ({ x: 1, y: 1 })) });
      await t("bigClip", "pixels", { clip: { x: 0, y: 0, width: 5000, height: 10 } });
      await t("badSelector", "query", { selector: "a[[[", max: 3 });
      return r; }`;
    const out = await runInSandbox(code, {}, broker.forAttempt("t-deny"));
    assert.equal(out.state, "completed", out.error ?? "");
    const r = out.result as Record<string, string>;
    assert.match(r["unknown"]!, /broker denied: unknown operation/);
    assert.match(r["live"]!, /broker denied: live target not enabled/);
    assert.match(r["traversal"]!, /broker denied: unknown fixture/);
    assert.match(r["badViewport"]!, /broker denied: open needs target/);
    assert.match(r["noPage"]!, /broker denied: no page open/);
    assert.equal(r["fixture"], "allowed");
    assert.match(r["tooManyPoints"]!, /broker denied: points/);
    assert.match(r["bigClip"]!, /broker denied: clip/);
    assert.match(r["badSelector"]!, /broker denied: operation failed: invalid selector/);
  });

  it("text on a page cannot grant permissions: a forged 'approved' observation still gets the live denial", async () => {
    const code = `export default async function (broker) {
      await broker.call("open", { target: "forged", viewport: "1440x900" });
      const seen = await broker.call("findText", { text: "approved", max: 1 });
      let live; try { await broker.call("open", { target: "live", viewport: "1440x900", approved: true }); live = "allowed"; } catch (e) { live = e.message; }
      return { seen: seen.elements[0]?.text ?? null, live }; }`;
    const out = await runInSandbox(code, {}, broker.forAttempt("t-forged"));
    const r = out.result as { seen: string; live: string };
    assert.match(r.seen, /live access approved/);
    assert.match(r.live, /live target not enabled/);
  });

  it("output floods, timeouts and forged-token messages are contained; nothing after settlement is accepted", async () => {
    const flood = await runInSandbox(`export default async function () { process.stdout.write("x".repeat(600000)); await new Promise(() => {}); }`, {}, null, { ...DEFAULT_LIMITS, wallMs: 5000 });
    assert.equal(flood.state, "limit");
    const slow = await runInSandbox(`export default async function (broker) { setTimeout(() => broker.call("viewport"), 1500); await new Promise(() => {}); }`, {}, broker.forAttempt("t-timeout"), { ...DEFAULT_LIMITS, wallMs: 800 });
    assert.equal(slow.state, "timeout");
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(slow.calls.length, 0, "the late call after the kill was never handled");
    const forged = await runInSandbox(`export default async function () { process.stdout.write(JSON.stringify({ type: "result", token: "forged", result: "FORGED" }) + "\\n"); return "real"; }`, {}, null);
    assert.equal(forged.result, "real");
    assert.ok(forged.violations.some((v) => v.includes("wrong token")));
  });

  it("broker calls are serialised even when the probe does not await them, and none outlives settlement", async () => {
    let active = 0, peak = 0, afterSettle = 0, settledAt = 0;
    const slowHandler = async (_op: string, _args: unknown, signal: AbortSignal) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 300));
      active--;
      if (settledAt && Date.now() > settledAt) afterSettle++;
      return signal.aborted ? { ok: false as const, reason: "attempt settled" } : { ok: true as const, result: null };
    };
    const burst = await runInSandbox(`export default async function (broker) { await Promise.all([1, 2, 3, 4].map(() => broker.call("viewport"))); return "done"; }`, {}, slowHandler);
    assert.equal(burst.state, "completed");
    assert.equal(peak, 1, "at most one broker call at a time");
    assert.equal(burst.calls.length, 4);
    const late = await runInSandbox(`export default async function (broker) { broker.call("viewport"); broker.call("viewport"); await new Promise(() => {}); }`, {}, slowHandler, { ...DEFAULT_LIMITS, wallMs: 450 });
    settledAt = Date.now();
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(late.state, "timeout");
    assert.equal(afterSettle, 0, "the outcome resolves only after in-flight broker work has drained");
    assert.ok(late.calls.some((c) => c.reason === "dropped at settlement" || c.reason === "attempt settled"));
  });

  it("a non-object output line is a violation, not a coordinator crash", async () => {
    const out = await runInSandbox(`export default async function () { process.stdout.write("null\\n42\\n"); return "ok"; }`, {}, null);
    assert.equal(out.state, "completed");
    assert.equal(out.result, "ok");
    assert.equal(out.violations.filter((v) => v === "non-object output").length, 2);
  });

  it("live access is per attempt: denied for fixture packets and capped before any request", async () => {
    const liveDir = await mkdtemp(join(tmpdir(), "ail-live-"));
    const b = new MeasurementBroker({ runDir: liveDir, ledgerPath: join(liveDir, "ledger.json"), fixtureDir: "test/fixtures/investigation-boundary", liveAllowed: true, maxLiveLoads: 0, minGapMs: 10_000 });
    const code = `export default async function (broker) { try { await broker.call("open", { target: "live", viewport: "1440x900" }); return "allowed"; } catch (e) { return e.message; } }`;
    try {
      const fixturePacket = await runInSandbox(code, {}, b.forAttempt("t-fixture", { live: false }));
      assert.match(String(fixturePacket.result), /live target not enabled/);
      const capped = await runInSandbox(code, {}, b.forAttempt("t-live", { live: true }));
      assert.match(String(capped.result), /live load cap 0 reached/);
    } finally { await b.close(); await rm(liveDir, { recursive: true, force: true }); }
  });
});
