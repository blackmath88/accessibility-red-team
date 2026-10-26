import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { FakeProvider } from "../src/experimental/adaptive/providers/fake.js";
import { ProviderError } from "../src/experimental/adaptive/provider.js";
import { EVALUATOR_ANSWERS, scoreAnswer } from "../src/experimental/adaptive/replay/evaluator.js";
import { makeManifest, ReplayManifestSchema } from "../src/experimental/adaptive/replay/manifest.js";
import { FACTS, POINTS, VARIANTS, packetHash, packetMessages } from "../src/experimental/adaptive/replay/packets.js";
import { runFakeReplay, smokeScript, type ExtraAttempt } from "../src/experimental/adaptive/replay/runner.js";

const manifestPath = "src/experimental/adaptive/replay/manifest.json";

describe("synthetic decision replay", () => {
  it("validates the frozen JSON manifest, all 120 cells, and each exact model-visible hash", async () => {
    const manifest = ReplayManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
    assert.deepEqual(manifest, makeManifest());
    assert.equal(manifest.historicalExtraction.status, "blocked");
    const current = manifest.modelSlots.find((slot) => slot.id === "current")!;
    const stronger = manifest.modelSlots.find((slot) => slot.id === "stronger")!;
    assert.equal(current.status, "configured");
    const configured = JSON.parse(await readFile(current.source!, "utf8")) as { models: { baseline: { model: string } } };
    assert.equal(current.exactModel, configured.models.baseline.model);
    assert.equal(stronger.status, "unresolved");
    assert.equal(stronger.exactModel, null);
    assert.equal(new Set(manifest.requests.map((cell) => cell.packetSha256)).size, 6);
    for (const point of POINTS) for (const variant of VARIANTS) {
      const cells = manifest.requests.filter((cell) => cell.point === point && cell.variant === variant);
      assert.equal(cells.length, 20);
      assert.ok(cells.every((cell) => cell.packetSha256 === packetHash(packetMessages(point, variant))));
    }
    const duplicate = structuredClone(manifest);
    duplicate.requests[1] = duplicate.requests[0]!;
    assert.equal(ReplayManifestSchema.safeParse(duplicate).success, false);
    const tampered = structuredClone(manifest);
    tampered.requests[0]!.packetSha256 = "0".repeat(64);
    assert.equal(ReplayManifestSchema.safeParse(tampered).success, false);
  });

  it("preserves every observed fact in all three transformations", () => {
    for (const point of POINTS) for (const variant of VARIANTS) {
      const packet = JSON.parse(packetMessages(point, variant)[1]!.content) as { observations: Array<string | { factIndex: number; fact: string }>; frontier?: unknown };
      assert.deepEqual(packet.observations.map((item) => typeof item === "string" ? item : item.fact).sort(), [...FACTS[point]].sort());
      assert.equal("frontier" in packet, variant === "frontier_visible");
    }
  });

  it("runs 120 single responses through FakeProvider and scores action and interpretation independently", async () => {
    const manifest = makeManifest();
    const provider = new FakeProvider(smokeScript);
    const result = await runFakeReplay(manifest, provider);
    assert.deepEqual(result.counters, { totalRequests: 120, primaryRequests: 120, retries: 0, finishRejectionContinuations: 0, malformedResponses: 0, providerErrors: 0 });
    assert.equal(provider.requests.length, 120);
    const scores = result.records.map((record, index) => scoreAnswer(record.answer!, EVALUATOR_ANSWERS[manifest.requests[index]!.point]));
    assert.equal(scores.filter((score) => score.nextAction).length, 120);
    assert.equal(scores.filter((score) => score.evidenceInterpretation).length, 120);
    const key = EVALUATOR_ANSWERS.dialog_focus;
    assert.deepEqual(scoreAnswer({ action: key.action, interpretation: "unknown" }, key), { nextAction: true, evidenceInterpretation: false });
    assert.deepEqual(scoreAnswer({ action: { type: "finish", verdict: "inconclusive", summary: "", candidates: [] }, interpretation: key.interpretation }, key), { nextAction: false, evidenceInterpretation: true });
    assert.ok(result.records.every((record) => record.actualModel === "fake-scripted-v1"));
  });

  it("isolates evaluator answers from provider requests and tools, including counterfactual answer keys", async () => {
    const first = new FakeProvider(smokeScript);
    const second = new FakeProvider(smokeScript);
    const manifest = makeManifest();
    const a = await runFakeReplay(manifest, first);
    const counterfactual = { action: { type: "navigate" as const, url: "EVALUATOR_ONLY_SENTINEL" }, interpretation: "EVALUATOR_ONLY_SENTINEL" };
    assert.deepEqual(scoreAnswer(a.records[0]!.answer!, counterfactual), { nextAction: false, evidenceInterpretation: false });
    const originalKey = EVALUATOR_ANSWERS.missed_sibling;
    try {
      EVALUATOR_ANSWERS.missed_sibling = counterfactual;
      const b = await runFakeReplay(manifest, second);
      assert.deepEqual(b.records, a.records);
    } finally { EVALUATOR_ANSWERS.missed_sibling = originalKey; }
    assert.deepEqual(first.requests, second.requests);
    for (const request of first.requests) {
      assert.deepEqual(Object.keys(request).sort(), ["maxOutputTokens", "messages", "responseFormat", "temperature", "timeoutMs"]);
      const serialized = JSON.stringify(request);
      assert.doesNotMatch(serialized, /EVALUATOR_ONLY_SENTINEL|EVALUATOR_ANSWERS|expectedAnswer/);
    }
    for (const file of ["packets.ts", "manifest.ts", "runner.ts"]) {
      const code = await readFile(`src/experimental/adaptive/replay/${file}`, "utf8");
      assert.doesNotMatch(code, /from ["'].*evaluator|process\.env|providers\/mistral|fetch\(/i);
    }
    for (const file of ["executor.ts", "scheduler.ts", "providers/fake.ts"]) {
      assert.doesNotMatch(await readFile(`src/experimental/adaptive/${file}`, "utf8"), /replay\/evaluator/);
    }
  });

  it("refuses invalid supplemental requests before making any provider call", async () => {
    const manifest = makeManifest();
    const provider = new FakeProvider(smokeScript);
    await assert.rejects(runFakeReplay(manifest, provider, [{ requestId: "unknown", kind: "retry" }]), /unknown replay request/);
    const extraPrimary = { requestId: manifest.requests[0]!.id, kind: "primary" } as unknown as ExtraAttempt;
    await assert.rejects(runFakeReplay(manifest, provider, [extraPrimary]));
    assert.equal(provider.calls, 0);
  });

  it("counts malformed responses, retries, finish-rejection continuations, and provider errors separately", async () => {
    const manifest = makeManifest();
    const provider = new FakeProvider(({ call }) => call === 0 ? { raw: "not json" }
      : call === 1 ? { error: new ProviderError("timeout", "scripted timeout") }
        : { raw: JSON.stringify({ action: { type: "finish", verdict: "inconclusive", summary: "", candidates: [] }, interpretation: "unknown", rationale: "I believe this proves everything" }) });
    const result = await runFakeReplay(manifest, provider, [
      { requestId: manifest.requests[0]!.id, kind: "retry" },
      { requestId: manifest.requests[2]!.id, kind: "finish_rejection_continuation" },
      { requestId: manifest.requests[2]!.id, kind: "finish_rejection_continuation" },
    ]);
    assert.deepEqual(result.counters, { totalRequests: 123, primaryRequests: 120, retries: 1, finishRejectionContinuations: 2, malformedResponses: 1, providerErrors: 1 });
    assert.equal(result.records.filter((record) => record.kind === "primary").length, 120);
    assert.ok(result.records.every((record) => !JSON.stringify(record).includes("believe")));
    assert.ok(result.records.every((record) => !("belief" in record) && !(record.answer && "rationale" in record.answer)));
  });
});
