import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { DEFAULT_FIXTURE_LIMITS } from "../src/experimental/adaptive/contracts.js";
import { runSession } from "../src/experimental/adaptive/executor.js";
import { FakeProvider, fixedScript } from "../src/experimental/adaptive/providers/fake.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

describe("page-writable denial channel", () => {
  it("page text passed to window.__artPolicy never reaches observations or denial records, and the volume is capped", async () => {
    const run = await runInTemp(harness, new FakeProvider(wait), "/malicious/spoof.html");
    try {
      await settle();
      const observations = await readFile(join(run.outDir, "observations.jsonl"), "utf8");
      assert.ok(!observations.includes("INJECTED-DENIAL-TEXT"), "no page text in model-facing observations");
      const seen = observations.split("\n").filter(Boolean).flatMap((line) => (JSON.parse(line) as { recentDenials: Array<{ detail: string }> }).recentDenials);
      assert.ok(seen.length > 0, "the model is still told that denials happened");
      assert.ok(seen.every((denial) => /^refused by the browser policy \(\w+\)$/.test(denial.detail)), "harness-authored detail only");
      const stored = await readFile(join(run.outDir, "denials.json"), "utf8");
      assert.ok(!stored.includes("INJECTED-DENIAL-TEXT"), "no page text in denial records either");
      assert.ok(run.denials.length <= 200, `denial records capped, got ${run.denials.length}`);
      assert.ok(run.result.denialCount >= 400, "overflow is still counted");
    } finally { await run.cleanup(); }
  });
});

describe("public mode", () => {
  it("refuses to start a session at runtime", async () => {
    await assert.rejects(
      runSession({
        config: { schema: "art/adaptive-session/v1", sessionId: "pub", startUrl: "https://example.org/", allowedOrigins: ["https://example.org"], mode: "public", publicTargets: ["https://example.org/"], limits: DEFAULT_FIXTURE_LIMITS },
        provider: new FakeProvider(wait), outDir: "/nonexistent/never-created", browser: harness.browser,
      }),
      /public mode is disabled pending hardening and owner approval/,
    );
  });
});
