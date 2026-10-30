import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ConfigSchema, amendLimits, countEvents, createCampaign, dirOf, invocationGate, type Limits, type State } from "../src/experimental/campaign/campaign.js";
import { resolveControl, signals } from "../src/experimental/campaign/controller.js";
import { milestones } from "../src/experimental/campaign/projection.js";

const limits: Limits = { claudeInvocations: 5, wallMinutes: 10, concurrency: 2, reportingReserveFraction: 0.2, tokenTarget: { input: 500_000, output: 60_000 } };
const usage = (used: number, inFlight = 0): State["usage"] => ({ claudeInvocations: used, claudeInFlight: inFlight, claudeFailed: 0, wallMs: 60_000, tokens: { input: 0, cacheCreation: 0, cacheRead: 0, output: 0, thinking: 0 }, tokenCallsWithUsage: 0, tokenCallsWithoutUsage: 0 });

describe("experimental campaign controller rules", () => {
  it("reserves the last invocations for finishing open work and counts in-flight calls", () => {
    assert.equal(invocationGate(limits, usage(3), "open").ok, true); // 4 <= floor(5*0.8)
    assert.equal(invocationGate(limits, usage(4), "open").ok, false);
    assert.equal(invocationGate(limits, usage(4), "finish").ok, true);
    assert.equal(invocationGate(limits, usage(4, 1), "finish").ok, false);
    assert.match((invocationGate(limits, usage(5), "finish") as { reason: string }).reason, /ceiling reached/);
  });

  it("extensions only raise ceilings, never below consumption, and leave everything else unchanged", () => {
    const next = amendLimits(limits, { claudeInvocations: 9 }, usage(5));
    assert.deepEqual({ ...next, claudeInvocations: 5 }, limits);
    assert.throws(() => amendLimits(limits, { claudeInvocations: 4 }, usage(2)), /cannot lower/);
    assert.throws(() => amendLimits(limits, { claudeInvocations: 5 }, usage(5, 1)), /below consumption/);
    assert.throws(() => amendLimits(limits, { wallMinutes: 0.5 }, usage(1)), /below consumption/);
  });

  it("refuses scope with live targets or URLs", () => {
    const base = JSON.parse(JSON.stringify({ schema: "art/campaign-config/v1", campaignId: "test-x", configVersion: 1, scopeVersion: 1, model: "claude-opus-5-5", limits,
      scope: { description: "d", viewports: ["390x844"], liveTargets: [], tasks: [{ id: "t", userReport: "r", keyText: "some key text", pages: ["second-a"] }] } }));
    assert.equal(ConfigSchema.safeParse(base).success, true);
    assert.equal(ConfigSchema.safeParse({ ...base, scope: { ...base.scope, liveTargets: ["https://example.org"] } }).success, false);
    assert.equal(ConfigSchema.safeParse({ ...base, scope: { ...base.scope, tasks: [{ ...base.scope.tasks[0], pages: ["https://x"] }] } }).success, false);
    assert.equal(ConfigSchema.safeParse({ ...base, limits: { ...limits, concurrency: 3 } }).success, false);
  });

  it("resolves a control given as page or unit id, else the only other page", () => {
    assert.equal(resolveControl("second-b", ["second-a", "second-b"], "second-a"), "second-b");
    assert.equal(resolveControl("baseline-shipping-second-b-390x844", ["second-a", "second-b"], "second-a"), "second-b");
    assert.equal(resolveControl(undefined, ["second-a", "second-b"], "second-a"), "second-b");
    assert.equal(resolveControl("second-a", ["second-a", "second-b", "x"], "second-a"), null);
  });

  it("derives baseline signals from measurements only", () => {
    const px = (min: number, p05: number, max: number) => ({ min, p05, p50: 248, max });
    assert.deepEqual(signals({ found: 0 }), ["text not found"]);
    assert.equal(signals({ found: 1, hitTest: { points: 16, topmost: 16, covered: 0, missing: 0, coverers: {} }, textPixels: px(52, 70, 248), referencePixels: { p50: 255 } }).length, 0);
    assert.match(signals({ found: 1, hitTest: { points: 16, topmost: 8, covered: 0, missing: 8, coverers: {} }, textPixels: px(52, 81, 255), referencePixels: { p50: 255 } })[0]!, /absent from hit testing/);
    assert.equal(signals({ found: 1, hitTest: { points: 4, topmost: 0, covered: 4, missing: 0, coverers: { "section#delivery.card": 4 } }, textPixels: px(239, 239, 239), referencePixels: { p50: 255 } }).length, 2);
  });

  it("milestones count against the plan and show paused work as blocked", () => {
    const t = (milestone: number, status: State["tasks"][number]["status"]) => ({ id: `${milestone}-${status}-${Math.random()}`, kind: "baseline" as const, milestone, label: "", status, deps: [], attempts: 0 });
    const m = milestones({ status: "budget_exhausted", planRevision: 1, tasks: [t(1, "done"), t(3, "done"), t(3, "failed"), t(4, "paused")] });
    assert.deepEqual(m.map((x) => x.state), ["complete", "planned", "partial", "blocked", "planned", "planned"]);
    assert.equal(m[2]!.note, "1/2 tasks in plan revision 1");
  });

  it("events keep their envelope and order under concurrent appends", async () => {
    const id = `test-${process.pid}`;
    const config = ConfigSchema.parse({ schema: "art/campaign-config/v1", campaignId: id, configVersion: 1, scopeVersion: 1, model: "claude-opus-5-5", limits,
      scope: { description: "d", viewports: ["390x844"], liveTargets: [], tasks: [{ id: "t", userReport: "r", keyText: "some key text", pages: ["second-a"] }] } });
    try {
      const store = await createCampaign(config);
      await Promise.all(Array.from({ length: 20 }, (_, i) => store.event("op", "x", { kind: "forged", seq: -1, i })));
      await store.save();
      const lines = (await readFile(join(dirOf(id), "events.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as { seq: number; kind: string });
      assert.deepEqual(lines.map((l) => l.seq), lines.map((_, i) => i + 1));
      assert.ok(lines.every((l) => l.kind === "op"));
      assert.equal((await countEvents(id)).lastSeq, store.state.lastEventSeq);
      await assert.rejects(createCampaign(config)); // an id cannot be reused
    } finally { await rm(dirOf(id), { recursive: true, force: true }); }
  });
});
