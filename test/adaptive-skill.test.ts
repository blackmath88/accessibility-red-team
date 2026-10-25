import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { ACTION_TYPES, ACTION_TYPES_V4, ActionSchema, ActionV4Schema, CandidateFindingSchema, DEFAULT_CONDITION, ModelDecisionSchema, type Observation } from "../src/experimental/adaptive/contracts.js";
import { SKILL_PATH, SKILL_V4_PATH, SKILL_VERSION, actionFormatHint, sha256, skillFor } from "../src/experimental/adaptive/executor.js";
import { FakeProvider, parseObservation, type FakeScript } from "../src/experimental/adaptive/providers/fake.js";
import { runInTemp, startHarness, type Harness } from "./adaptive-helpers.js";

const jsonLines = (markdown: string) =>
  [...markdown.matchAll(/```json\n([\s\S]*?)```/g)].flatMap((block) => block[1]!.split("\n").filter((line) => line.trim().startsWith("{")));

describe("skill v3 reply format", () => {
  it("is the skill the executor loads", () => {
    assert.equal(SKILL_VERSION, "adaptive-a11y-skill/v3");
    assert.match(SKILL_PATH, /adaptive-a11y-skill\.v3\.md$/);
  });

  it("every example is a valid decision with a valid action, and every action type has one", async () => {
    const skill = await readFile(SKILL_PATH, "utf8");
    const examples = jsonLines(skill).filter((line) => !line.includes("<action type>"));
    const seen = new Set<string>();
    for (const line of examples) {
      const decision = ModelDecisionSchema.parse(JSON.parse(line));
      const action = ActionSchema.parse(decision.action);
      seen.add(action.type);
      if (action.type === "finish") for (const candidate of action.candidates) CandidateFindingSchema.parse(candidate);
    }
    assert.deepEqual([...seen].sort(), [...ACTION_TYPES].sort());
  });

  it("names the key and the finishing rule, and offers the categories the comparison scores", async () => {
    const skill = await readFile(SKILL_PATH, "utf8");
    assert.match(skill, /The action name goes in the key \*\*`type`\*\*/);
    assert.match(skill, /When `finalCall` is `true`, this is your last reply/);
    for (const category of ["missing_accessible_name", "skip_link_broken", "dialog_focus_not_returned"]) assert.ok(skill.includes(`\`${category}\``), category);
  });
});

describe("skill v4 (frontier conditions)", () => {
  it("is selected only when a condition flag is on; condition A keeps v3", () => {
    assert.deepEqual(skillFor(DEFAULT_CONDITION), { path: SKILL_PATH, version: SKILL_VERSION });
    for (const flag of ["ledgerVisible", "completionAccounting", "incrementalCandidates"] as const) {
      assert.deepEqual(skillFor({ ...DEFAULT_CONDITION, [flag]: true }), { path: SKILL_V4_PATH, version: "adaptive-a11y-skill/v4" }, flag);
    }
  });

  it("every example is a valid v4 decision, every v4 action type has one, and candidates validate", async () => {
    const skill = await readFile(SKILL_V4_PATH, "utf8");
    const seen = new Set<string>();
    for (const line of jsonLines(skill).filter((item) => !item.includes("<action type>"))) {
      const action = ActionV4Schema.parse(ModelDecisionSchema.parse(JSON.parse(line)).action);
      seen.add(action.type);
      if (action.type === "finish") for (const candidate of action.candidates) CandidateFindingSchema.parse(candidate);
      if (action.type === "report_candidate") CandidateFindingSchema.parse(action.candidate);
    }
    assert.deepEqual([...seen].sort(), [...ACTION_TYPES_V4].sort());
  });

  it("describes the frontier as optional, finish as a proposal, and carries no host or port", async () => {
    const skill = await readFile(SKILL_V4_PATH, "utf8");
    assert.match(skill, /## The frontier \(when present\)/);
    assert.match(skill, /\*\*Finish is a proposal\.\*\*/);
    assert.match(skill, /Visiting a page is not testing it/);
    assert.doesNotMatch(skill, /127\.0|localhost|:\d{2,5}\//);
  });

  it("leaves skill v3 untouched", async () => {
    // The pinned hash of skill v3 as used in trial 3; any edit to the file breaks the historical baseline.
    assert.equal(sha256(await readFile(SKILL_PATH, "utf8")), "54ad045f8cbfae8a210b2318caeb62f31448606eb717055f5446bdef4b6efbf7");
  });
});

describe("refusal feedback for malformed actions", () => {
  // Shapes the real model sent in the first Mistral fixture trial (runs/adaptive-live/2026-10-25T14-13-30-590Z).
  const recorded: Array<[unknown, RegExp]> = [
    [{ actionType: "activate", targetRef: "e1" }, /under "actionType".*\{"type": "activate", "targetRef": "<a ref from legal\.activate>"\}/],
    [{ action: "activate", targetRef: "e5" }, /under "action".*"type": "activate"/],
    [{ name: "inspect_semantics" }, /under "name".*\{"type": "inspect_semantics"\}/],
    [{ op: "activate", targetRef: "e1" }, /under "op".*"type": "activate"/],
    [{ capture_evidence: { note: "x" } }, /used as an object key.*"type": "capture_evidence"/],
    [{ type: "click", targetRef: "e1" }, /"click" is not an action type.*allowed types: inspect_semantics/],
    [{ targetRef: "e1" }, /has no "type".*allowed types/],
    ["activate", /has no "type"/],
  ];
  for (const [raw, expected] of recorded) {
    it(`explains ${JSON.stringify(raw)}`, () => assert.match(actionFormatHint(raw), expected));
  }
});

describe("the model sees the refusal hint and can recover", () => {
  let harness: Harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.close(); });

  it("a mis-keyed action is refused, the next observation carries the hint, and a corrected action runs", async () => {
    const hints: string[] = [];
    const script: FakeScript = ({ call, request }) => {
      const observation = parseObservation(request);
      if (call === 1) hints.push(...(observation?.recentDenials ?? []).map((denial) => denial.detail));
      if (call === 0) return { action: { actionType: "inspect_semantics" } };
      if (call === 1) return { action: { type: "inspect_semantics" } };
      return { action: { type: "finish", verdict: "inconclusive", summary: "done", candidates: [] } };
    };
    const run = await runInTemp(harness, new FakeProvider(script), "/skip-links/index.html");
    try {
      assert.equal(run.denials[0]?.reason, "forbidden_action_type");
      assert.ok(hints.some((hint) => hint.includes('{"type": "inspect_semantics"}')), `hint shown to the model: ${JSON.stringify(hints)}`);
      assert.equal(run.trace[1]?.["outcome"], "executed");
      assert.equal(run.result.status, "completed");
    } finally { await run.cleanup(); }
  });
});

describe("action history and the finish-only final call", () => {
  let harness: Harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.close(); });

  const RESULT = /^(done(; recorded ev_\d+(, ev_\d+)*)?|refused: [a-z_]+|the action failed in the browser|reply was not valid JSON in the required shape)$/;

  it("each observation carries the model's last actions, their evidence and whether anything changed", async () => {
    const seen: Observation[] = [];
    const script: FakeScript = ({ call, observation }) => {
      seen.push(observation!);
      if (call === 0) return { action: { type: "inspect_semantics" } };
      if (call === 1) return { action: { type: "inspect_semantics" } };
      if (call === 2) return { action: { type: "activate", targetRef: observation!.controls.find((control) => control.id === "menu-btn")!.ref } };
      return { action: { type: "finish", verdict: "inconclusive", summary: "done", candidates: [] } };
    };
    const run = await runInTemp(harness, new FakeProvider(script), "/menu-dialog/index.html");
    try {
      assert.deepEqual(seen[0]!.recentActions, []);
      const history = seen[3]!.recentActions;
      assert.deepEqual(history.map((entry) => [entry.step, entry.type, entry.outcome]), [[0, "inspect_semantics", "executed"], [1, "inspect_semantics", "executed"], [2, "activate", "executed"]]);
      assert.deepEqual(history[0]!.evidenceIds, ["ev_1"]);
      assert.equal(history[0]!.result, "done; recorded ev_1");
      assert.equal(history[1]!.stateChanged, false, "a repeated inspection changes nothing");
      assert.equal(history[2]!.stateChanged, true, "opening the menu does");
      assert.equal(history[2]!.targetRef, seen[2]!.controls.find((control) => control.id === "menu-btn")!.ref);
      assert.deepEqual(seen[3]!.evidence.slice(0, 2).map((item) => [item.id, item.kind, item.targetRef]), [["ev_1", "inspect_semantics", null], ["ev_2", "inspect_semantics", null]]);
      assert.equal(run.result.status, "completed");
    } finally { await run.cleanup(); }
  });

  it("keeps page text out of the history, including refused activations on a hostile page", async () => {
    const seen: Observation[] = [];
    const script: FakeScript = ({ call, observation }) => {
      seen.push(observation!);
      const popup = observation!.controls.find((control) => control.id === "pop")!.ref;
      if (call < 3) return { action: [{ type: "activate", targetRef: popup }, { actionType: "scroll" }, { type: "focus_next" }][call] };
      return { action: { type: "finish", verdict: "inconclusive", summary: "done", candidates: [] } };
    };
    const run = await runInTemp(harness, new FakeProvider(script), "/malicious/index.html");
    try {
      const history = seen.at(-1)!.recentActions;
      assert.deepEqual(history.map((entry) => entry.type), ["activate", "malformed", "focus_next"]);
      assert.equal(history[1]!.result, "refused: forbidden_action_type");
      for (const entry of history) assert.match(entry.result, RESULT);
      const names = seen.flatMap((observation) => [...observation.controls, ...observation.links].map((element) => element.name)).filter((name) => name.length > 2);
      const shown = JSON.stringify(history);
      for (const name of names) assert.ok(!shown.includes(name), `page text "${name}" leaked into recentActions`);
    } finally { await run.cleanup(); }
  });

  it("the final call offers only finish, with a larger output allowance, and anything else ends the session with no candidates", async () => {
    const provider = new FakeProvider(() => ({ action: { type: "scroll", direction: "down" } }));
    const run = await runInTemp(harness, provider, "/skip-links/index.html", { limits: { maxModelCalls: 3 } });
    try {
      const observations = provider.requests.map((request) => parseObservation(request)!);
      assert.deepEqual(observations.map((observation) => observation.finalCall), [false, false, true]);
      assert.deepEqual(observations[2]!.legal, { navigate: [], activate: [], simple: ["finish"] });
      assert.deepEqual(provider.requests.map((request) => request.maxOutputTokens), [600, 600, 1500]);
      assert.match(provider.requests[2]!.messages[0]!.content, /This is your final reply in this session/);
      assert.doesNotMatch(provider.requests[1]!.messages[0]!.content, /This is your final reply/);
      assert.equal(run.denials.at(-1)?.reason, "finish_required");
      assert.equal(run.result.status, "budget_exhausted");
      assert.match(run.result.reason, /maxModelCalls 3 reached; the final call did not finish \(refused: finish_required\)/);
      assert.deepEqual(await run.json<unknown[]>("candidates.json"), []);
    } finally { await run.cleanup(); }
  });

  it("a finish on the final call can cite evidence recorded several steps earlier", async () => {
    const script: FakeScript = ({ call, observation }) => {
      if (call === 0) return { action: { type: "capture_evidence", note: "skip link target missing" } };
      if (!observation!.finalCall) return { action: { type: "scroll", direction: call % 2 ? "down" : "up" } };
      const cited = observation!.evidence.find((item) => item.note === "skip link target missing")!.id;
      return { action: { type: "finish", verdict: "complete", summary: "one finding", candidates: [{
        category: "skip_link_broken", claim: "The skip link target does not exist.", observationRefs: [cited],
        reproductionSteps: ["Open the page"], limitations: ["DOM summary"], proposedDeterministicCheck: "check the skip link target id",
      }] } };
    };
    const run = await runInTemp(harness, new FakeProvider(script), "/skip-links/index.html", { limits: { maxModelCalls: 9 } });
    try {
      const candidates = await run.json<Array<{ status: string; finding: { observationRefs: string[] } }>>("candidates.json");
      assert.equal(run.result.status, "completed");
      assert.equal(run.result.modelCalls, 9);
      assert.deepEqual(candidates.map((candidate) => [candidate.status, candidate.finding.observationRefs]), [["candidate", ["ev_1"]]]);
    } finally { await run.cleanup(); }
  });

  it("with a one-call budget the first call is already the final one", async () => {
    const provider = new FakeProvider(() => ({ action: { type: "finish", verdict: "inconclusive", summary: "nothing", candidates: [] } }));
    const run = await runInTemp(harness, provider, "/skip-links/index.html", { limits: { maxModelCalls: 1 } });
    try {
      assert.equal(parseObservation(provider.requests[0]!)!.finalCall, true);
      assert.equal(run.result.status, "completed");
    } finally { await run.cleanup(); }
  });
});
