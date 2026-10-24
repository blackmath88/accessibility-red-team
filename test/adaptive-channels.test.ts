import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { FakeProvider, fixedScript } from "../src/experimental/adaptive/providers/fake.js";
import { runInTemp, startHarness, type Harness } from "./adaptive-helpers.js";

let harness: Harness;
before(async () => { harness = await startHarness(); });
after(async () => { await harness.close(); });

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));
const wait = fixedScript([{ type: "scroll", direction: "down" }, { type: "scroll", direction: "down" }, { type: "finish", verdict: "inconclusive", summary: "x", candidates: [] }]);

describe("page channels that bypass page-level request interception are closed", () => {
  it("WebSocket, SharedWorker, dedicated worker and service worker attempts never reach any server, and the refusals are recorded", async () => {
    const run = await runInTemp(harness, new FakeProvider(wait), "/malicious/index.html");
    try {
      await settle();
      assert.deepEqual(harness.fixtures.offHits, [], "no request or WebSocket upgrade reached the off origin");
      assert.ok(!harness.fixtures.hits.some((hit) => hit.path === "/malicious/sw.js"), "service worker script was never requested");
      assert.ok(!harness.fixtures.hits.some((hit) => hit.path === "/malicious/shared-worker.js"), "the SharedWorker script was never requested");
      const reasons = new Set(run.denials.map((denial) => denial.reason));
      assert.ok(reasons.has("websocket"), "WebSocket refusal recorded");
      assert.ok(reasons.has("worker_blocked"), "SharedWorker refusal recorded");
    } finally { await run.cleanup(); }
  });

  it("the sandbox browser is launched without the SharedWorker feature", async () => {
    const context = await harness.browser.newContext({ serviceWorkers: "block" });
    try {
      const page = await context.newPage();
      await page.goto("about:blank");
      assert.equal(await page.evaluate(() => typeof (globalThis as { SharedWorker?: unknown }).SharedWorker), "undefined", "feature removed at browser level");
    } finally { await context.close(); }
  });
});
