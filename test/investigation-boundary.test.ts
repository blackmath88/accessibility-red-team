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
      o.home = fs.existsSync("/home"); o.repo = fs.existsSync(${JSON.stringify(process.cwd())});
      try { fs.writeFileSync("/usr/x", "1"); o.write = "WROTE"; } catch { o.write = "denied"; }
      o.env = Object.keys(process.env).filter((k) => k !== "PWD");
      try { (await import("node:child_process")).execSync("id"); o.exec = "RAN"; } catch { o.exec = "blocked"; }
      return o; }`;
    const out = await runInSandbox(code, {}, null);
    assert.equal(out.state, "completed", out.error ?? "");
    assert.deepEqual(out.result, { net: "blocked", home: false, repo: false, write: "denied", env: [], exec: "blocked" });
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
});
