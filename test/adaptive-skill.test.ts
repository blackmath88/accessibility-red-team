import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { ACTION_TYPES, ActionSchema, CandidateFindingSchema, ModelDecisionSchema } from "../src/experimental/adaptive/contracts.js";
import { SKILL_PATH, SKILL_VERSION, actionFormatHint } from "../src/experimental/adaptive/executor.js";
import { FakeProvider, parseObservation, type FakeScript } from "../src/experimental/adaptive/providers/fake.js";
import { runInTemp, startHarness, type Harness } from "./adaptive-helpers.js";

const jsonLines = (markdown: string) =>
  [...markdown.matchAll(/```json\n([\s\S]*?)```/g)].flatMap((block) => block[1]!.split("\n").filter((line) => line.trim().startsWith("{")));

describe("skill v2 reply format", () => {
  it("is the skill the executor loads", () => {
    assert.equal(SKILL_VERSION, "adaptive-a11y-skill/v2");
    assert.match(SKILL_PATH, /adaptive-a11y-skill\.v2\.md$/);
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
    assert.match(skill, /modelCallsLeft` counts your remaining replies\. When it is 2 or less/);
    for (const category of ["missing_accessible_name", "skip_link_broken", "dialog_focus_not_returned"]) assert.ok(skill.includes(`\`${category}\``), category);
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
