import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { MeasurementBroker } from "../src/experimental/investigation/broker.js";

// Hostile pages on local servers only: the broker must count exactly its own top-level load and stop every
// page-initiated navigation and popup request before it leaves the browser.
const PAGES: Record<string, string> = {
  reload: `<p>reload</p><script>setTimeout(() => location.reload(), 50)</script>`,
  meta: `<meta http-equiv="refresh" content="0;url=/refresh-target"><p>meta</p>`,
  away: `<p>away</p><script>setTimeout(() => { location.href = "/away-target"; }, 50)</script>`,
  popup: `<p>popup</p><script>window.open("/popup-target"); window.open("OTHER/popup-other")</script>`,
  mixed: `<p>mixed</p><img src="/same.png"><img src="OTHER/cross.png">`,
};

describe("broker navigation and popup containment (local servers)", () => {
  let dir: string, server: Server, other: Server, base = "", otherBase = "";
  const hits: string[] = [], otherHits: string[] = [];
  const listen = (s: Server) => new Promise<string>((r) => s.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "ail-nav-"));
    other = createServer((req, res) => { otherHits.push(req.url ?? ""); res.end("x"); });
    otherBase = await listen(other);
    server = createServer((req, res) => {
      hits.push(req.url ?? "");
      const page = PAGES[(req.url ?? "/").slice(1)];
      res.setHeader("content-type", page ? "text/html" : "image/png");
      res.end(page ? `<!doctype html>${page.replaceAll("OTHER", otherBase)}` : "");
    });
    base = await listen(server);
  });
  after(async () => { server.close(); other.close(); await rm(dir, { recursive: true, force: true }); });

  const openLive = async (page: string, resourcePolicy: "same-origin" | "cross-origin-get" = "same-origin") => {
    const ledgerPath = join(dir, `${page}-ledger.json`);
    const b = new MeasurementBroker({ runDir: dir, ledgerPath, fixtureDir: dir, liveAllowed: true, maxLiveLoads: 5, minGapMs: 0, resourcePolicy, liveUrl: `${base}/${page}` });
    try {
      const reply = await b.forAttempt(`t-${page}`, { live: true })("open", { target: "live", viewport: "390x844" });
      await new Promise((r) => setTimeout(r, 500));
      const ledger = JSON.parse(await readFile(ledgerPath, "utf8")) as { loads: unknown[] };
      return { reply, loads: ledger.loads.length, blocked: [...b.blocked] };
    } finally { await b.close(); }
  };
  const count = (path: string) => hits.filter((h) => h === path).length;

  it("a page-initiated reload is stopped: one counted load, one document request", async () => {
    const r = await openLive("reload");
    assert.equal(r.reply.ok, false, "a page that navigates itself is not measured");
    assert.match((r.reply as { reason: string }).reason, /own top-level navigation/);
    assert.equal(r.loads, 1);
    assert.equal(count("/reload"), 1);
    assert.ok(r.blocked.some((x) => x.kind === "navigation"));
  });

  it("meta refresh and location changes never reach the server", async () => {
    for (const p of ["meta", "away"]) {
      const r = await openLive(p);
      assert.equal(r.loads, 1);
      assert.equal(count(`/${p}`), 1);
      assert.equal(r.reply.ok, false);
      assert.ok(r.blocked.some((x) => x.kind === "navigation"), p);
    }
    assert.equal(count("/refresh-target"), 0);
    assert.equal(count("/away-target"), 0);
  });

  it("popup requests are stopped before leaving the browser, same-origin and cross-origin", async () => {
    const r = await openLive("popup");
    assert.equal(r.reply.ok, true);
    assert.equal(count("/popup-target"), 0);
    assert.equal(otherHits.filter((h) => h === "/popup-other").length, 0);
    assert.ok(r.blocked.some((x) => x.kind === "popup" || x.kind === "unattributed")); // the popup's first request precedes its Page
  });

  it("the sub-resource policy is explicit: same-origin blocks cross-origin GETs, cross-origin-get allows them", async () => {
    const strict = await openLive("mixed", "same-origin");
    assert.equal((strict.reply as { result: { resourcePolicy: string } }).result.resourcePolicy, "same-origin");
    assert.ok(count("/same.png") >= 1);
    assert.equal(otherHits.filter((h) => h === "/cross.png").length, 0);
    assert.ok(strict.blocked.some((x) => x.kind === "origin"));
    const loose = await openLive("mixed", "cross-origin-get");
    assert.equal((loose.reply as { result: { resourcePolicy: string } }).result.resourcePolicy, "cross-origin-get");
    assert.equal(otherHits.filter((h) => h === "/cross.png").length, 1);
  });
});
