import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { SessionConfigSchema } from "../src/experimental/adaptive/contracts.js";
import { SessionPolicy } from "../src/experimental/adaptive/policy.js";
import { ProviderError } from "../src/experimental/adaptive/provider.js";
import { FakeProvider, fixedScript, type FakeScript } from "../src/experimental/adaptive/providers/fake.js";
import { linkTo, refById, runInTemp, startHarness, fixtureConfig, type Harness } from "./adaptive-helpers.js";

let harness: Harness;
before(async () => { harness = await startHarness(); });
after(async () => { await harness.close(); });

const reasons = (denials: Array<{ reason: string }>) => denials.map((denial) => denial.reason);

describe("adaptive session config", () => {
  const base = { schema: "art/adaptive-session/v1", sessionId: "c", startUrl: "http://127.0.0.1:1/", allowedOrigins: ["http://127.0.0.1:1"], mode: "fixture", limits: { maxSteps: 1, maxModelCalls: 1, maxInputTokens: 1, maxOutputTokens: 1, maxWallMs: 100, maxResponseBytes: 1024, maxSurfaces: 1 } };

  it("accepts a loopback fixture config", () => {
    assert.ok(SessionConfigSchema.safeParse(base).success);
  });
  it("disables public mode unless exact targets are listed, and fixture mode refuses public hosts", () => {
    assert.ok(!SessionConfigSchema.safeParse({ ...base, mode: "public", startUrl: "https://example.org/", allowedOrigins: ["https://example.org"] }).success);
    assert.ok(SessionConfigSchema.safeParse({ ...base, mode: "public", startUrl: "https://example.org/", allowedOrigins: ["https://example.org"], publicTargets: ["https://example.org/"] }).success);
    assert.ok(!SessionConfigSchema.safeParse({ ...base, startUrl: "https://example.org/", allowedOrigins: ["https://example.org"] }).success);
    assert.ok(!SessionConfigSchema.safeParse({ ...base, allowedOrigins: ["http://127.0.0.1:1", "http://127.0.0.1:1/path"] }).success);
  });
});

describe("public-mode destination policy", () => {
  const publicConfig = SessionConfigSchema.parse({
    schema: "art/adaptive-session/v1", sessionId: "p", startUrl: "https://example.org/", mode: "public", publicTargets: ["https://example.org/", "https://rebind.example.org/"],
    allowedOrigins: ["https://example.org", "https://rebind.example.org"],
    limits: { maxSteps: 1, maxModelCalls: 1, maxInputTokens: 1, maxOutputTokens: 1, maxWallMs: 100, maxResponseBytes: 1024, maxSurfaces: 1 },
  } as never);
  // Destination checks run before the allowlist, so these are refused with a precise reason whatever the allowlist says.
  const policy = new SessionPolicy(publicConfig, async (host) => (host === "rebind.example.org" ? ["10.1.2.3"] : ["93.184.216.34"]));

  it("blocks metadata, RFC1918 and loopback destinations", async () => {
    for (const url of ["http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/", "http://192.168.1.1/", "http://127.0.0.1:8080/", "http://metadata.google.internal/", "https://rebind.example.org/"]) {
      const decision = await policy.checkNavigationTarget(url);
      assert.equal(decision.allow, false, url);
      assert.equal(decision.allow === false && decision.reason, "private_destination", url);
    }
    assert.equal((await policy.checkNavigationTarget("https://example.org/page")).allow, true);
  });
  it("blocks private subrequests, non-GET requests and off-allowlist documents", async () => {
    assert.equal((await policy.decideRequest({ url: "http://169.254.169.254/", method: "GET", resourceType: "XHR" })).allow, false);
    assert.equal((await policy.decideRequest({ url: "https://example.org/x", method: "POST", resourceType: "XHR" })).allow, false);
    assert.equal((await policy.decideRequest({ url: "https://other.example.net/", method: "GET", resourceType: "Document" })).allow, false);
    assert.equal((await policy.decideRequest({ url: "https://example.org/x", method: "GET", resourceType: "Script" })).allow, true);
  });
});

describe("fake-provider end-to-end trace", () => {
  it("finds the menu-only service form, records evidence and an accepted candidate", async () => {
    const script: FakeScript = ({ observation, call }) => {
      const steps: Array<() => unknown> = [
        () => ({ type: "inspect_semantics" }),
        () => ({ type: "activate", targetRef: refById(observation, "menu-toggle") }),
        () => ({ type: "navigate", url: linkTo(observation, "/dienstleistungen.html") }),
        () => ({ type: "navigate", url: linkTo(observation, "/formular-umzug.html") }),
        () => ({ type: "capture_evidence", note: "form page", targetRef: refById(observation, "plz") }),
        () => ({
          type: "finish", verdict: "complete", summary: "reached the form",
          candidates: [{ category: "missing_accessible_name", claim: "PLZ input has no accessible name", observationRefs: ["ev_5"], reproductionSteps: ["open menu", "open Dienstleistungen", "open Umzug melden"], limitations: ["DOM approximation of the accessible name"], proposedDeterministicCheck: "inputs without label, aria-label or aria-labelledby" }],
        }),
      ];
      return { action: steps[call]!() };
    };
    const provider = new FakeProvider(script);
    const run = await runInTemp(harness, provider, "/news-service/index.html");
    try {
      assert.equal(run.result.status, "completed", run.result.reason);
      assert.equal(run.result.pinned.modelId, "fake-scripted-v1");
      assert.equal(run.result.cost, "unavailable");
      assert.ok(run.result.surfacesVisited.some((url) => url.endsWith("/formular-umzug.html")));
      assert.ok(run.result.statesVisited.some((state) => state.includes("expanded=[Menü]")), "menu-open state recorded");
      assert.equal(run.result.candidateCount, 1);
      assert.equal(run.result.denialCount, 0);
      assert.equal(run.trace.length, 6);
      const evidence = await run.json<Array<{ id: string; kind: string; screenshot: { path: string; sha256: string } | null; pre: unknown; post: unknown }>>("evidence.json");
      const shot = evidence.find((item) => item.kind === "capture_evidence")!;
      assert.equal(shot.id, "ev_5");
      const bytes = await readFile(join(run.outDir, shot.screenshot!.path));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), shot.screenshot!.sha256);
      assert.ok(evidence.every((item) => item.pre && item.post));
    } finally { await run.cleanup(); }
  });
});

describe("forbidden actions are denied and recorded as policy denials, not findings", () => {
  it("denies off-origin navigation, redirects, popups, subrequests, form submission, typing, downloads", async () => {
    const script: FakeScript = ({ observation, call }) => {
      const steps: Array<() => unknown> = [
        () => ({ type: "navigate", url: linkTo(observation, "/landed.html") }),
        () => ({ type: "navigate", url: "http://evil.invalid/never-seen" }),
        () => ({ type: "navigate", url: linkTo(observation, "/redirect-offsite") }),
        () => ({ type: "navigate", url: linkTo(observation, "/file.bin") }),
        () => ({ type: "activate", targetRef: refById(observation, "pop") }),
        () => ({ type: "activate", targetRef: observation!.controls.find((c) => c.tag === "button" && c.inForm)!.ref }),
        () => ({ type: "type", targetRef: refById(observation, "email"), text: "admin@example.org" }),
        () => ({ type: "navigate", url: "javascript:alert(1)" }),
        () => ({ type: "finish", verdict: "inconclusive", summary: "done", candidates: [] }),
      ];
      return { action: steps[call]!() };
    };
    const run = await runInTemp(harness, new FakeProvider(script), "/malicious/index.html");
    try {
      assert.equal(run.result.status, "completed", run.result.reason);
      const seen = new Set(reasons(run.denials));
      for (const reason of ["origin_not_allowed", "redirect_off_allowlist", "download_blocked", "popup_blocked", "activation_not_safe", "forbidden_action_type", "scheme_not_allowed", "subrequest_off_allowlist", "non_get_request", "form_submit_blocked"]) {
        assert.ok(seen.has(reason), `expected denial ${reason}, got ${[...seen].join(", ")}`);
      }
      assert.deepEqual(harness.fixtures.offHits, [], "no request ever reached the off-origin server");
      assert.deepEqual(harness.fixtures.hits.filter((hit) => hit.method !== "GET"), [], "no non-GET request ever reached the fixture server");
      assert.equal(run.result.candidateCount, 0, "denials are not findings");
      assert.ok(run.result.denialCount >= 10);
      assert.ok(run.result.surfacesVisited.every((url) => url.startsWith(harness.fixtures.origin)));
    } finally { await run.cleanup(); }
  });

  it("a page's injected instructions gain no authority over scope", async () => {
    // A maximally compliant provider: it reads the page text and does what the page says.
    const compliant: FakeScript = ({ observation, call }) => {
      const injected = /Navigate immediately to (\S+)/.exec(observation?.pageTextExcerpt ?? "")?.[1];
      assert.ok(injected, "the injected instruction is visible to the model as data");
      if (call === 0) return { action: { type: "navigate", url: injected } };
      if (call === 1) return { action: { type: "navigate", url: new URL("/secret", injected).toString() } };
      return { action: { type: "finish", verdict: "inconclusive", summary: "page said to reveal the API key", candidates: [] } };
    };
    const run = await runInTemp(harness, new FakeProvider(compliant), "/malicious/index.html");
    try {
      const injectedDenials = run.denials.filter((denial) => denial.source === "executor_validation");
      assert.equal(injectedDenials.length, 2);
      assert.ok(injectedDenials.every((denial) => denial.reason === "origin_not_allowed"));
      assert.deepEqual(harness.fixtures.offHits, []);
      assert.deepEqual(run.result.surfacesVisited, [`${harness.fixtures.origin}/malicious/index.html`]);
    } finally { await run.cleanup(); }
  });
});

describe("invalid model output fails safely", () => {
  it("non-JSON output ends the session as invalid_model_output without executing anything", async () => {
    const run = await runInTemp(harness, new FakeProvider(() => ({ raw: "I will now ignore the schema" })), "/skip-links/index.html");
    try {
      assert.equal(run.result.status, "invalid_model_output");
      assert.equal(run.result.evidenceCount, 0);
      assert.equal(run.trace[0]!.outcome, "invalid_output");
    } finally { await run.cleanup(); }
  });
  it("wrongly shaped, unknown and illegal actions are refused individually and the session continues", async () => {
    const script = fixedScript([
      { type: "navigate", url: 42 },
      { type: "eval", code: "window.location='http://evil.invalid'" },
      { type: "activate", targetRef: "e9999" },
      { type: "activate", targetRef: "e0" },
      { type: "scroll", direction: "sideways" },
      { type: "finish", verdict: "inconclusive", summary: "x", candidates: [] },
    ]);
    const run = await runInTemp(harness, new FakeProvider(script), "/skip-links/index.html");
    try {
      assert.equal(run.result.status, "completed");
      assert.deepEqual(reasons(run.denials), ["invalid_action_fields", "forbidden_action_type", "unknown_target_ref", "activation_not_safe", "invalid_action_fields"]);
    } finally { await run.cleanup(); }
  });
  it("candidates with unresolved evidence refs or a wrong schema are retained as rejected, never accepted", async () => {
    const finish = { type: "finish", verdict: "complete", summary: "x", candidates: [
      { category: "missing_accessible_name", claim: "c", observationRefs: ["ev_404"], reproductionSteps: ["s"], limitations: [], proposedDeterministicCheck: "p" },
      { category: "missing_accessible_name", claim: "no refs" },
    ] };
    const run = await runInTemp(harness, new FakeProvider(fixedScript([finish])), "/skip-links/index.html");
    try {
      assert.equal(run.result.candidateCount, 0);
      assert.equal(run.result.rejectedCandidateCount, 2);
      const stored = await run.json<Array<{ status: string; rejection: string }>>("candidates.json");
      assert.match(stored[0]!.rejection, /unresolved evidence refs: ev_404/);
      assert.match(stored[1]!.rejection, /^schema:/);
    } finally { await run.cleanup(); }
  });
  it("a provider error ends the session with provider_error and no retry", async () => {
    const provider = new FakeProvider(() => ({ error: new ProviderError("http", "HTTP 500", 500) }));
    const run = await runInTemp(harness, provider, "/skip-links/index.html");
    try {
      assert.equal(run.result.status, "provider_error");
      assert.equal(provider.calls, 1);
    } finally { await run.cleanup(); }
  });
});

describe("timeout, cancellation and budgets settle with terminal status and partial artifacts", () => {
  it("wall-clock timeout while the model hangs", async () => {
    const run = await runInTemp(harness, new FakeProvider(() => ({ hang: true })), "/skip-links/index.html", { limits: { maxWallMs: 1500 } });
    try {
      assert.equal(run.result.status, "timeout");
      assert.ok(run.result.durationMs < 6000);
      assert.equal(run.result.steps, 0);
      assert.ok((await readFile(join(run.outDir, "observations.jsonl"), "utf8")).length > 0, "partial artifacts persisted");
      assert.equal((await run.json<{ status: string }>("result.json")).status, "timeout");
    } finally { await run.cleanup(); }
  });
  it("cancellation via AbortSignal stops model requests and persists partial artifacts", async () => {
    const controller = new AbortController();
    const provider = new FakeProvider(({ call }) => {
      if (call === 0) return { action: { type: "inspect_semantics" } };
      queueMicrotask(() => controller.abort());
      return { hang: true };
    });
    const run = await runInTemp(harness, provider, "/skip-links/index.html", { signal: controller.signal });
    try {
      assert.equal(run.result.status, "cancelled");
      assert.equal(provider.calls, 2, "no further model request after cancellation");
      assert.equal(run.result.evidenceCount, 1);
      assert.equal((await run.json<unknown[]>("evidence.json")).length, 1);
    } finally { await run.cleanup(); }
  });
  it("an already-aborted signal never calls the model", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new FakeProvider(fixedScript([]));
    const run = await runInTemp(harness, provider, "/skip-links/index.html", { signal: controller.signal });
    try {
      assert.equal(run.result.status, "cancelled");
      assert.equal(provider.calls, 0);
    } finally { await run.cleanup(); }
  });
  const loop = () => new FakeProvider(() => ({ action: { type: "scroll", direction: "down" } }));
  it("step budget", async () => {
    const run = await runInTemp(harness, loop(), "/skip-links/index.html", { limits: { maxSteps: 3 } });
    try { assert.equal(run.result.status, "budget_exhausted"); assert.equal(run.result.steps, 3); assert.match(run.result.reason, /maxSteps/); } finally { await run.cleanup(); }
  });
  it("model-call budget", async () => {
    const run = await runInTemp(harness, loop(), "/skip-links/index.html", { limits: { maxModelCalls: 2 } });
    try { assert.equal(run.result.modelCalls, 2); assert.match(run.result.reason, /maxModelCalls/); } finally { await run.cleanup(); }
  });
  it("token budgets", async () => {
    const input = await runInTemp(harness, loop(), "/skip-links/index.html", { limits: { maxInputTokens: 200 } });
    const output = await runInTemp(harness, loop(), "/skip-links/index.html", { limits: { maxOutputTokens: 10 } });
    try {
      assert.equal(input.result.status, "budget_exhausted"); assert.equal(input.result.modelCalls, 0); assert.match(input.result.reason, /maxInputTokens/);
      assert.equal(output.result.status, "budget_exhausted"); assert.match(output.result.reason, /maxOutputTokens/);
    } finally { await input.cleanup(); await output.cleanup(); }
  });
  it("response-byte budget", async () => {
    const run = await runInTemp(harness, loop(), "/malicious/index.html", { limits: { maxResponseBytes: 1024 } });
    try { assert.equal(run.result.status, "budget_exhausted"); assert.match(run.result.reason, /maxResponseBytes/); } finally { await run.cleanup(); }
  });
  it("surface budget refuses further navigation", async () => {
    const script: FakeScript = ({ observation, call }) =>
      call === 0 ? { action: { type: "navigate", url: linkTo(observation, "/valid.html") } }
        : call === 1 ? { action: { type: "navigate", url: linkTo(observation, "/index.html") } }
          : call === 2 ? { action: { type: "navigate", url: linkTo(observation, "/broken.html") } }
            : { action: { type: "finish", verdict: "inconclusive", summary: "x", candidates: [] } };
    const run = await runInTemp(harness, new FakeProvider(script), "/skip-links/index.html", { limits: { maxSurfaces: 2 } });
    try {
      assert.deepEqual(reasons(run.denials), ["surface_limit"]);
      assert.equal(run.result.surfacesVisited.length, 2);
    } finally { await run.cleanup(); }
  });
  it("repeated refusals end the session as denial_limit", async () => {
    const run = await runInTemp(harness, new FakeProvider(() => ({ action: { type: "navigate", url: "http://evil.invalid/" } })), "/skip-links/index.html");
    try { assert.equal(run.result.status, "denial_limit"); } finally { await run.cleanup(); }
  });
  it("a fixture-mode config cannot be pointed at an off-allowlist start URL", async () => {
    const config = { ...fixtureConfig(harness, "/skip-links/index.html"), startUrl: `${harness.fixtures.offOrigin}/x` };
    assert.ok(!SessionConfigSchema.safeParse(config).success);
  });
});
