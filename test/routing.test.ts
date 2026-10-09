import assert from "node:assert/strict";
import test from "node:test";
import { interpret, route, type Provider, type RoutingPolicy } from "../src/routing/route.js";
import { createEmitter, type TheatreEvent } from "../src/theatre/emit.js";
import type { SemanticExperimentInput } from "../src/evaluation/semantic-experiment.js";

const input: SemanticExperimentInput = {
  schema: "art/semantic-experiment-input/v1", experimentId: "e1", findingId: "f1", criterion: "2.5.3",
  evidence: [{ kind: "accessible_name", value: "Suche", sourceRef: "ev:1" }, { kind: "visible_text", value: "Suchen", sourceRef: "ev:2" }],
  decisionSpace: ["confirmed", "false_positive", "UNKNOWN"], instruction: "classify",
};

// Fixture provider: the only provider in the repo (ADR-0012 keeps real model adapters out until the re-entry gate opens).
function fixture(decision: string, tokens = 120, model = "fixture-small"): Provider & { calls: number } {
  return {
    model, calls: 0,
    async decide(i) {
      this.calls++;
      return { tokens, output: { schema: "art/semantic-experiment-output/v1", experimentId: i.experimentId, findingId: i.findingId,
        model, decision, rationale: "fixture", evidenceRefs: ["ev:1"], requiresHumanReview: false } };
    },
  };
}

function collect() {
  const events: TheatreEvent[] = [];
  return { events, emit: createEmitter({ run: "routing", sink: (line) => events.push(JSON.parse(line)) }) };
}

test("production policy routes every probe to NO_MODEL", () => {
  for (const probeId of ["axe.label-content-name-mismatch", "axe.color-contrast", "axe.unknown-rule"]) {
    assert.equal(route("incomplete-triage", probeId).tier, "NO_MODEL");
  }
  assert.match(route("incomplete-triage", "axe.color-contrast").reason, /visual_rendering/);
});

test("text-semantic rules route to the cheapest provider within the task ceiling, never above it", () => {
  const small = fixture("confirmed");
  const both: RoutingPolicy = { enabled: ["incomplete-triage"], providers: { SMALL_CLASSIFIER: small, FRONTIER_ESCALATION: fixture("confirmed", 9000, "frontier") } };
  assert.equal(route("incomplete-triage", "axe.label-content-name-mismatch", both).tier, "SMALL_CLASSIFIER");
  const frontierOnly: RoutingPolicy = { enabled: ["incomplete-triage"], providers: { FRONTIER_ESCALATION: fixture("confirmed", 9000, "frontier") } };
  const routed = route("incomplete-triage", "axe.label-content-name-mismatch", frontierOnly);
  assert.equal(routed.tier, "NO_MODEL");
  assert.match(routed.reason, /no provider at or below SMALL_CLASSIFIER/);
  assert.equal(route("incomplete-triage", "axe.color-contrast", both).tier, "NO_MODEL");
});

test("routed model decisions emit small-model events with tokens; failures and UNKNOWN fall back to review", async () => {
  const { events, emit } = collect();
  const policy = (provider: Provider): RoutingPolicy => ({ enabled: ["incomplete-triage"], providers: { SMALL_CLASSIFIER: provider } });
  const providers = [fixture("confirmed"), fixture("UNKNOWN"), fixture("invented"), fixture("confirmed")];

  assert.equal((await interpret(input, "axe.label-content-name-mismatch", "s", { policy: policy(providers[0]!), emit })).output?.decision, "confirmed");
  assert.equal((await interpret(input, "axe.label-content-name-mismatch", "s", { policy: policy(providers[1]!), emit })).output, null);
  assert.equal((await interpret(input, "axe.label-content-name-mismatch", "s", { policy: policy(providers[2]!), emit })).output, null);
  assert.equal((await interpret(input, "axe.color-contrast", "s", { policy: policy(providers[3]!), emit })).output, null);

  assert.deepEqual(events.map((e) => [e.actor, e.verdict]), [
    ["small-model", "explained"], ["small-model", "needs-review"], ["small-model", "needs-review"], ["code", "needs-review"],
  ]);
  const aiCalls = providers.reduce((n, p) => n + p.calls, 0);
  const modelEvents = events.filter((e) => e.actor !== "code" && e.actor !== "human");
  assert.equal(aiCalls, modelEvents.length);
  for (const event of modelEvents) assert.equal(typeof event.cost?.tokens, "number");
  assert.match(events[2]!.detail!, /failed: Decision outside bounded decision space/);
});
