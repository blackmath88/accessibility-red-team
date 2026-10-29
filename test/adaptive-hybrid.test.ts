import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Observation } from "../src/experimental/adaptive/contracts.js";
import { HybridProvider, shouldConsult, validateAdvisory, type HybridLogEntry } from "../src/experimental/adaptive/hybrid.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "../src/experimental/adaptive/provider.js";
import { OBSERVATION_MARKER } from "../src/experimental/adaptive/providers/fake.js";

const entry = (stateChanged: boolean, type = "inspect_semantics") => ({ step: 0, type, targetRef: null, url: null, direction: null, outcome: "executed", result: "done", stateChanged, evidenceIds: [] });
const observation = (over: Partial<Observation> = {}): Observation => ({
  step: 3, url: "u", title: "t", lang: "de", timestamp: "x", headings: [], landmarks: [], links: [], controls: [], skipLinks: [], dialogs: [], focus: null,
  lastActivated: null, pageTextExcerpt: "", evidence: [{ id: "ev_1", step: 0, kind: "inspect_semantics", targetRef: null, note: null }],
  recentActions: [entry(false), entry(false), entry(false)], finalCall: false, recentDenials: [],
  budget: { stepsLeft: 10, modelCallsLeft: 8, wallMsLeft: 1000, surfacesLeft: 3 },
  legal: { navigate: ["http://fixture/a.html"], activate: ["e2"], simple: ["inspect_semantics", "finish"] }, ...over,
} as Observation);

class Scripted implements ModelProvider {
  readonly capabilities = { jsonObject: true, jsonSchema: false, toolCalling: false, vision: false, verified: false };
  readonly requests: ModelRequest[] = [];
  constructor(readonly id: string, readonly requestedModel: string, private readonly reply: string) {}
  async complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    return { text: this.reply, requestedModel: this.requestedModel, returnedModel: this.requestedModel, usage: { inputTokens: 10, outputTokens: 5 }, latencyMs: 1 } as ModelResponse;
  }
}
const request = (o: Observation): ModelRequest => ({ messages: [{ role: "system", content: "skill" }, { role: "user", content: `${OBSERVATION_MARKER}\n${JSON.stringify(o)}` }], maxOutputTokens: 600, temperature: 0, responseFormat: "json_object", timeoutMs: 30_000 });

describe("hybrid-escalation/v1", () => {
  it("consults only after three no-progress actions, never on the final call, at most twice and with a cooldown", () => {
    assert.match(shouldConsult(observation(), 0, 3, -Infinity)!, /no-progress/);
    assert.equal(shouldConsult(observation({ recentActions: [entry(false), entry(true), entry(false)] }), 0, 3, -Infinity), null);
    assert.equal(shouldConsult(observation({ recentActions: [entry(false), entry(false)] }), 0, 3, -Infinity), null);
    assert.equal(shouldConsult(observation({ finalCall: true }), 0, 3, -Infinity), null);
    assert.equal(shouldConsult(observation(), 2, 9, 0), null);
    assert.equal(shouldConsult(observation(), 1, 4, 2), null, "cooldown of 3 local decisions");
    assert.ok(shouldConsult(observation(), 1, 5, 2));
  });

  it("drops unknown evidence refs and illegal suggested actions; rejects malformed advisories", () => {
    const o = observation();
    const ok = validateAdvisory(JSON.stringify({ interpretation: "x", suggestedAction: { type: "navigate", url: "http://fixture/a.html" }, evidenceRefs: ["ev_1", "ev_9"], confidence: "medium" }), o)!;
    assert.deepEqual(ok.evidenceRefs, ["ev_1"]);
    assert.deepEqual(ok.suggestedAction, { type: "navigate", url: "http://fixture/a.html" });
    const illegal = validateAdvisory(JSON.stringify({ interpretation: "x", suggestedAction: { type: "navigate", url: "http://elsewhere/" }, evidenceRefs: [], confidence: "low" }), o)!;
    assert.equal(illegal.suggestedAction, null);
    assert.ok(illegal.dropped.some((d) => d.includes("not legal")));
    assert.equal(validateAdvisory("not json", o), null);
    assert.equal(validateAdvisory(JSON.stringify({ interpretation: "x", confidence: "sure" }), o), null);
    assert.equal(validateAdvisory(JSON.stringify({ interpretation: "x", confidence: "low", extra: 1 }), o), null);
  });

  it("logs consult then local in order and passes the advisory to the local model as advisory text only", async () => {
    const local = new Scripted("local", "qwen", '{"action":{"type":"inspect_semantics"}}');
    const consultant = new Scripted("mistral", "mistral-small-2603", JSON.stringify({ interpretation: "focus left the dialog", evidenceRefs: ["ev_1"], confidence: "high" }));
    const log: HybridLogEntry[] = [];
    const hybrid = new HybridProvider(local, consultant, async (e) => { log.push(e); });
    for (let i = 0; i < 3; i += 1) await hybrid.complete(request(observation({ recentActions: [entry(true)] })));
    await hybrid.complete(request(observation()));
    assert.deepEqual(log.map((e) => e.kind), ["local", "local", "local", "consult", "local"]);
    assert.equal(log[3]!.outcome, "advisory_delivered");
    assert.equal(log[4]!.outcome, "ok_with_advisory");
    assert.equal(consultant.requests.length, 1);
    assert.doesNotMatch(consultant.requests[0]!.messages[0]!.content, /skill/, "the consultant gets its own system prompt, not the tester skill");
    const last = local.requests.at(-1)!.messages.at(-1)!;
    assert.match(last.content, /^ADVISORY .*advisory only/);
    assert.equal(local.requests[0]!.messages.length, 2, "no advisory without a trigger");
  });
});

describe("repeat-guard repair (opt-in executor option)", async () => {
  const { mkdtemp, rm, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { runSession } = await import("../src/experimental/adaptive/executor.js");
  const { FakeProvider } = await import("../src/experimental/adaptive/providers/fake.js");
  const { fixtureConfig, startHarness } = await import("./adaptive-helpers.js");
  const { CONDITIONS } = await import("../src/experimental/adaptive/frontier-compare.js");
  const harness = await startHarness();
  // The s1 failure: the same capture on the same element, again and again, in an unchanged page state.
  const looping = () => new FakeProvider(({ call }) => call < 3 ? { action: { type: "capture_evidence", targetRef: "e1", note: "x" } } : { action: { type: "finish", verdict: "inconclusive", summary: "", candidates: [] } });
  const run = async (guard: boolean) => {
    const outDir = await mkdtemp(join(tmpdir(), "art-adaptive-"));
    try {
      await runSession({ config: fixtureConfig(harness, "/dev-k1/index.html"), provider: looping(), outDir, browser: harness.browser, codeSha: "test", condition: CONDITIONS.B, refuseRepeatInSameState: guard });
      return (await readFile(join(outDir, "trace.jsonl"), "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as { outcome: string; detail: string });
    } finally { await rm(outDir, { recursive: true, force: true }); }
  };
  it("is off by default: identical captures all execute", async () => {
    assert.deepEqual((await run(false)).slice(0, 3).map((t) => t.outcome), ["executed", "executed", "executed"]);
  });
  it("refuses an identical capture in the identical state and names the evidence it already produced", async () => {
    const trace = await run(true);
    assert.deepEqual(trace.slice(0, 3).map((t) => t.outcome), ["executed", "denied", "denied"]);
    assert.match(trace[1]!.detail, /^repeated_in_same_state: already done at step 0 .*ev_1/);
    await harness.close();
  });
});
