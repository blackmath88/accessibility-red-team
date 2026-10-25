import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BudgetedProvider, worstCaseSpend } from "../src/experimental/adaptive/budget.js";
import { DEFAULT_CONFIG_PATH, LiveTrialConfigSchema, confirmHashOf, loadConfig, plan, runLive } from "../src/experimental/adaptive/live-trial.js";
import { ProviderError, type ModelProvider, type ModelRequest } from "../src/experimental/adaptive/provider.js";

const SENTINEL = "sk-TEST-SENTINEL-never-printed-0123456789";
const env = { ADAPTIVE_MISTRAL_API_KEY: SENTINEL };
const noNetwork = (async () => { throw new Error("network must not be used"); }) as typeof fetch;

const chat = (content: string, usage = { prompt_tokens: 900, completion_tokens: 40 }, model = "mistral-small-2603") =>
  new Response(JSON.stringify({ model, choices: [{ message: { role: "assistant", content } }], usage }), { status: 200, headers: { "content-type": "application/json" } });

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full)); else out.push(full);
  }
  return out;
}

describe("Mistral fixture trial configuration", () => {
  it("the committed configuration is valid, pinned, and its worst case is within the spend cap", async () => {
    const config = await loadConfig(DEFAULT_CONFIG_PATH);
    assert.equal(config.model, "mistral-small-2603");
    assert.ok(worstCaseSpend(config.pricing, config.trial) <= config.trial.maxSpend);
    assert.ok(config.trial.maxCalls <= config.fixtures.length * config.session.maxModelCalls + (config.preflight ? 1 : 0));
  });

  it("rejects aliases, plain http and token caps whose worst case exceeds the spend cap", async () => {
    const base = await loadConfig(DEFAULT_CONFIG_PATH);
    assert.equal(LiveTrialConfigSchema.safeParse({ ...base, model: "mistral-small-latest" }).success, false);
    assert.equal(LiveTrialConfigSchema.safeParse({ ...base, baseUrl: "http://api.mistral.ai" }).success, false);
    assert.equal(LiveTrialConfigSchema.safeParse({ ...base, trial: { ...base.trial, maxInputTokens: 10_000_000 } }).success, false);
  });

  it("the dry-run plan says whether the key is set without ever showing it", async () => {
    const config = await loadConfig(DEFAULT_CONFIG_PATH);
    const withKey = plan(config, env, "abc");
    assert.ok(withKey.keyPresent);
    assert.ok(!withKey.lines.join("\n").includes(SENTINEL));
    assert.match(withKey.lines.join("\n"), /set \(value not shown\)/);
    assert.match(plan(config, {}, "abc").lines.join("\n"), /NOT SET/);
    assert.notEqual(confirmHashOf(config, "abc"), confirmHashOf(config, "def"), "the hash binds the code too");
  });

  it("a live run refuses a wrong confirm hash or a missing key before any network use", async () => {
    const config = await loadConfig(DEFAULT_CONFIG_PATH);
    await assert.rejects(runLive({ config, confirm: "0000000000000000", env, fetch: noNetwork, codeSha: "abc" }), /--confirm does not match/);
    await assert.rejects(runLive({ config, confirm: confirmHashOf(config, "abc"), env: {}, fetch: noNetwork, codeSha: "abc" }), /is not set/);
  });
});

describe("trial-wide budget", () => {
  const fake = (respond: () => Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }>): ModelProvider => ({
    id: "fake-real", requestedModel: "m", capabilities: { jsonObject: true, jsonSchema: false, toolCalling: false, vision: false, verified: false },
    complete: async (request: ModelRequest) => ({ ...(await respond()), requestedModel: "m", returnedModel: "m", latencyMs: 1, parameters: { temperature: request.temperature, maxOutputTokens: request.maxOutputTokens, responseFormat: request.responseFormat } }),
  });
  const request = (chars = 4000, maxOutputTokens = 100): ModelRequest => ({ messages: [{ role: "user", content: "x".repeat(chars) }], maxOutputTokens, temperature: 0, responseFormat: "json_object", timeoutMs: 1000 });
  const pricing = { currency: "USD", inputPerMillion: 1, outputPerMillion: 10 };
  const budget = { maxCalls: 2, maxInputTokens: 1_000_000, maxOutputTokens: 1_000_000, maxSpend: 100, maxWallMs: 60_000, minCallIntervalMs: 0 };

  it("refuses the call after maxCalls and stays stopped", async () => {
    const provider = new BudgetedProvider(fake(async () => ({ text: "{}", usage: { inputTokens: 10, outputTokens: 1 } })), pricing, budget);
    await provider.complete(request()); await provider.complete(request());
    await assert.rejects(provider.complete(request()), (error: unknown) => error instanceof ProviderError && error.kind === "budget");
    assert.equal(provider.ledger.calls, 2);
    assert.match(provider.ledger.stopReason ?? "", /maxCalls/);
  });

  it("refuses a call whose worst case would break the spend cap, before sending it", async () => {
    let sent = 0;
    const provider = new BudgetedProvider(fake(async () => { sent += 1; return { text: "{}" }; }), pricing, { ...budget, maxCalls: 10, maxSpend: 0.001 });
    // 1500 input tokens (1000 estimated x 1.5) at 1/M + 100 output at 10/M = 0.0025 > 0.001
    await assert.rejects(provider.complete(request()), /spend cap/);
    assert.equal(sent, 0);
  });

  it("counts the reserved worst case for failed calls and calls without reported usage, and real usage otherwise", async () => {
    let mode: "fail" | "nousage" | "usage" = "fail";
    const provider = new BudgetedProvider(fake(async () => {
      if (mode === "fail") throw new ProviderError("timeout", "slow");
      return mode === "nousage" ? { text: "{}" } : { text: "{}", usage: { inputTokens: 7, outputTokens: 3 } };
    }), pricing, { ...budget, maxCalls: 10 });
    await assert.rejects(provider.complete(request()));
    assert.equal(provider.ledger.inputTokens, 1500); assert.equal(provider.ledger.outputTokens, 100);
    mode = "nousage"; await provider.complete(request());
    assert.equal(provider.ledger.inputTokens, 3000); assert.equal(provider.ledger.estimatedCalls, 1);
    mode = "usage"; await provider.complete(request());
    assert.equal(provider.ledger.inputTokens, 3007); assert.equal(provider.ledger.outputTokens, 203);
  });

  it("spaces calls by minCallIntervalMs", async () => {
    const waits: number[] = [];
    let clock = 0;
    const provider = new BudgetedProvider(fake(async () => ({ text: "{}" })), pricing, { ...budget, maxCalls: 5, minCallIntervalMs: 1000 }, () => clock, async (ms) => { waits.push(ms); clock += ms; });
    await provider.complete(request()); await provider.complete(request());
    assert.deepEqual(waits, [1000]);
  });
});

describe("live run plumbing against a fake Mistral endpoint (no network)", () => {
  it("runs the preflight and both result sets into separate directories, never writes the key, and stops at the trial budget", async () => {
    const out = await mkdtemp(join(tmpdir(), "art-live-"));
    try {
      const base = await loadConfig(DEFAULT_CONFIG_PATH);
      const config = LiveTrialConfigSchema.parse({ ...base, fixtures: ["skip-links"], outRoot: out, session: { ...base.session, maxModelCalls: 3, maxWallMs: 60_000 }, trial: { ...base.trial, maxCalls: 3 } });
      const seenAuth: boolean[] = [];
      const urls = new Set<string>();
      const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
        urls.add(String(input));
        seenAuth.push(new Headers(init?.headers).get("authorization") === `Bearer ${SENTINEL}`);
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        if (body.messages.some((message) => message.content.includes('{"ok": true}'))) return chat('{"ok": true}', { prompt_tokens: 20, completion_tokens: 5 });
        return chat(JSON.stringify({ action: { type: "inspect_semantics" }, rationale: "look first" }));
      }) as typeof fetch;
      const result = await runLive({ config, confirm: confirmHashOf(config, "test-sha"), env, fetch: fakeFetch, codeSha: "test-sha", id: "t1" });
      assert.deepEqual([...urls], ["https://api.mistral.ai/v1/chat/completions"], "the model API is the only URL fetched");
      assert.ok(seenAuth.length > 0 && seenAuth.every(Boolean), "the key is sent only as the bearer header");
      assert.equal(result.preflight?.["jsonObjectHonoured"], true);
      assert.ok(result.ledger.calls <= 3, `trial cap held: ${result.ledger.calls}`);
      assert.ok((await stat(join(result.dir, "real-model", "skip-links", "B", "arm.json"))).isFile());
      assert.ok((await stat(join(result.dir, "scripted-reference", "skip-links", "B", "arm.json"))).isFile());
      const realArm = JSON.parse(await readFile(join(result.dir, "real-model", "skip-links", "B", "arm.json"), "utf8")) as { pinned: { implementation: string; modelId: string } };
      const scriptedArm = JSON.parse(await readFile(join(result.dir, "scripted-reference", "skip-links", "B", "arm.json"), "utf8")) as { pinned: { implementation: string } };
      assert.match(realArm.pinned.implementation, /real model \(mistral:mistral-small-2603\)/);
      assert.match(scriptedArm.pinned.implementation, /scripted explorer/);
      const report = await readFile(join(result.dir, "report.md"), "utf8");
      assert.match(report, /## Real model results/);
      assert.match(report, /## Scripted reference \(NOT model results\)/);
      assert.match(report, /## Scoring caveats/);
      for (const file of await walk(result.dir)) {
        if (/\.(png|jpe?g)$/.test(file)) continue;
        assert.ok(!(await readFile(file, "utf8")).includes(SENTINEL), `key leaked into ${file}`);
      }
    } finally { await rm(out, { recursive: true, force: true }); }
  });
});
