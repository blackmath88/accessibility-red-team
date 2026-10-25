import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { DEFAULT_CONDITION, type EvidenceRecord, type ExplorationCondition, type FrontierObligation, type Limits } from "../src/experimental/adaptive/contracts.js";
import { runSession } from "../src/experimental/adaptive/executor.js";
import { FakeProvider, type FakeScript } from "../src/experimental/adaptive/providers/fake.js";
import { auditObligation, recoverLedger } from "../src/experimental/adaptive/replay/accounting.js";
import { FrontierScheduler } from "../src/experimental/adaptive/scheduler.js";
import { fixtureConfig, refById, startHarness, type Harness } from "./adaptive-helpers.js";

const HIDDEN: ExplorationCondition = { ...DEFAULT_CONDITION, completionAccounting: true, incrementalCandidates: true };
const VISIBLE: ExplorationCondition = { ...HIDDEN, ledgerVisible: true };
const finish = { action: { type: "finish", verdict: "inconclusive", summary: "No adjudication claimed", candidates: [] } };
let harness: Harness;
before(async () => { harness = await startHarness(); });
after(async () => { await harness.close(); });

async function localRun(script: FakeScript, options: { condition?: ExplorationCondition; limits?: Partial<Limits>; signal?: AbortSignal; path?: string } = {}) {
  const outDir = await mkdtemp(join(tmpdir(), "art-replay-accounting-"));
  const provider = new FakeProvider(script);
  try {
    const result = await runSession({ config: fixtureConfig(harness, options.path ?? "/skip-links/index.html", options.limits),
      outDir, provider, condition: options.condition ?? VISIBLE, signal: options.signal, browser: harness.browser, codeSha: "test" });
    const ledger = recoverLedger(await readFile(join(outDir, "frontier.json"), "utf8"));
    const evidence = JSON.parse(await readFile(join(outDir, "evidence.json"), "utf8")) as EvidenceRecord[];
    return { outDir, provider, result, ledger, evidence, cleanup: () => rm(outDir, { recursive: true, force: true }) };
  } catch (error) { await rm(outDir, { recursive: true, force: true }); throw error; }
}

describe("execution, assessment, and follow-up accounting", () => {
  const executed: FrontierObligation = { id: "o1", pageId: "p1", stateId: null, probe: "semantics", subject: null, applicability: "known", status: "executed", evidenceIds: ["ev_1"], reason: null };

  it("a recorded inspection remains unassessed and is never barrier adjudication", async () => {
    const run = await localRun(({ call }) => call === 0 ? { action: { type: "inspect_semantics" } } : finish);
    try {
      const obligation = run.ledger.obligations.find((item) => item.probe === "semantics" && item.status === "executed")!;
      assert.ok(obligation.evidenceIds.every((id) => run.evidence.some((record) => record.id === id)));
      assert.deepEqual(auditObligation(obligation), { obligationId: obligation.id, execution_status: "executed", assessment_outcome: "unassessed", follow_up_required: true, barrier_adjudication: null });
      assert.equal(run.result.completion?.outcome, "partial");
    } finally { await run.cleanup(); }
  });

  it("inconclusive/incomplete assessments keep follow-up open without mutating execution obligations", () => {
    const before = structuredClone(executed);
    for (const outcome of ["incomplete", "inconclusive", "error", "violation"] as const) {
      const audit = auditObligation(executed, { obligationId: "o1", outcome, evidenceIds: ["ev_1"] });
      assert.equal(audit.execution_status, "executed");
      assert.equal(audit.assessment_outcome, outcome);
      assert.equal(audit.follow_up_required, true);
      assert.equal(audit.barrier_adjudication, null);
    }
    assert.deepEqual(executed, before);
    for (const outcome of ["pass", "inapplicable"] as const) assert.equal(auditObligation(executed, { obligationId: "o1", outcome, evidenceIds: ["ev_1"] }).follow_up_required, false);
    assert.throws(() => auditObligation(executed, { obligationId: "o1", outcome: "pass", evidenceIds: ["ev_missing"] }), /recorded evidence/);
    const pending = { ...executed, status: "pending" as const, evidenceIds: [] };
    assert.equal(auditObligation(pending).follow_up_required, true);
    assert.throws(() => auditObligation(pending, { obligationId: "o1", outcome: "pass", evidenceIds: ["ev_1"] }), /executed obligation/);
  });

  it("ledger-hidden and visible conditions remain attributable with equal executed/pending work", async () => {
    const runs = [];
    try {
      for (const condition of [HIDDEN, VISIBLE]) runs.push(await localRun(({ call }) => call === 0 ? { action: { type: "inspect_semantics" } } : finish, { condition }));
      const [hidden, visible] = runs;
      assert.equal(hidden!.ledger.condition.ledgerVisible, false);
      assert.equal(visible!.ledger.condition.ledgerVisible, true);
      assert.deepEqual(hidden!.ledger.obligations, visible!.ledger.obligations);
      for (const [index, run] of runs.entries()) {
        assert.ok(run.provider.requests.every((request) => {
          const observation = JSON.parse([...request.messages].reverse().find((message) => message.role === "user")!.content.split("\n").slice(1).join("\n"));
          return ("frontier" in observation) === (index === 1);
        }));
        assert.equal(run.result.artifacts.includes("frontier-shown.jsonl"), index === 1);
      }
    } finally { await Promise.all(runs.map((run) => run.cleanup())); }
  });
});

describe("short contained localhost continuations", () => {
  it("records late evidence before a forced finish after a denied malformed action", async () => {
    const run = await localRun(({ call }) => call === 0 ? { action: { type: "navigate" } }
      : call === 1 ? { action: { type: "inspect_semantics" } }
        : call === 2 ? { action: { type: "capture_evidence", note: "late evidence" } } : finish, { limits: { maxModelCalls: 4 } });
    try {
      assert.equal(run.result.modelCalls, 4);
      assert.equal(run.result.status, "completed");
      assert.equal(run.result.completion?.outcome, "partial");
      assert.equal(run.evidence.at(-1)?.note, "late evidence");
      assert.equal(run.evidence.at(-1)?.step, 2);
      const trace = (await readFile(join(run.outDir, "trace.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      assert.deepEqual(trace.map((step) => step.outcome), ["denied", "executed", "executed", "finished"]);
      assert.ok(run.ledger.completion.remaining > 0);
    } finally { await run.cleanup(); }
  });

  it("repeated finish proposals in fresh continuation sessions never erase recovered pending work", async () => {
    const runs = [];
    try {
      // The executor accepts finish and stops; a controller continuation is a new, separately accounted browser session.
      for (let attempt = 0; attempt < 2; attempt += 1) runs.push(await localRun(() => ({ action: { type: "finish", verdict: "complete", summary: "everything done" } })));
      for (const run of runs) {
        assert.equal(run.result.modelCalls, 1);
        assert.equal(run.result.completion?.proposal, "complete");
        assert.equal(run.result.completion?.outcome, "partial");
        assert.ok(run.ledger.completion.remaining > 0);
      }
      assert.deepEqual(runs[0]!.ledger.obligations, runs[1]!.ledger.obligations);
    } finally { await Promise.all(runs.map((run) => run.cleanup())); }
  });

  it("unexpected dialog state is captured before finish with focus-return evidence still attributable", async () => {
    const run = await localRun(({ call, observation }) => {
      if (call === 0) return { action: { type: "activate", targetRef: refById(observation, "help-btn") } };
      if (call === 1) { assert.ok(observation!.dialogs.some((dialog) => dialog.visible && dialog.containsFocus)); return { action: { type: "escape" } }; }
      if (call === 2) {
        assert.ok(!observation!.dialogs.some((dialog) => dialog.visible));
        assert.equal(observation!.focus?.isBody, true);
        return { action: { type: "capture_evidence", targetRef: refById(observation, "help-btn"), note: "focus on body after Escape" } };
      }
      return finish;
    }, { path: "/menu-dialog/index.html" });
    try {
      const dialog = run.ledger.obligations.find((item) => item.probe === "dialog_focus_return")!;
      assert.equal(dialog.status, "executed");
      assert.deepEqual(dialog.evidenceIds, ["ev_1", "ev_2"]);
      assert.equal(run.evidence.at(-1)?.note, "focus on body after Escape");
      assert.equal(auditObligation(dialog).follow_up_required, true);
    } finally { await run.cleanup(); }
  });

  it("cancellation fences a late response and preserves already recorded evidence", async () => {
    const controller = new AbortController();
    const run = await localRun(({ call }) => {
      if (call === 0) return { action: { type: "inspect_semantics" } };
      controller.abort();
      return { action: { type: "capture_evidence", note: "must not execute after cancellation" } };
    }, { signal: controller.signal });
    try {
      assert.equal(run.result.status, "cancelled");
      assert.equal(run.result.completion?.outcome, "cancelled");
      assert.equal(run.evidence.length, 1);
      assert.ok(!JSON.stringify(run.evidence).includes("must not execute"));
      assert.equal(run.ledger.completion.terminalStatus, "cancelled");
    } finally { await run.cleanup(); }
  });

  it("budget expiry persists an exhausted ledger instead of closing pending obligations", async () => {
    const run = await localRun(() => ({ action: { type: "inspect_semantics" } }), { limits: { maxModelCalls: 2 } });
    try {
      assert.equal(run.result.modelCalls, 2);
      assert.equal(run.result.status, "budget_exhausted");
      assert.equal(run.result.completion?.outcome, "exhausted");
      assert.ok(run.ledger.obligations.some((item) => item.status === "pending"));
    } finally { await run.cleanup(); }
  });

  it("wall budget expiry cancels an outstanding fake response and keeps prior evidence", async () => {
    const run = await localRun(({ call }) => call === 0 ? { action: { type: "inspect_semantics" } } : { hang: true }, { limits: { maxWallMs: 1500 } });
    try {
      assert.equal(run.result.status, "timeout");
      assert.equal(run.result.completion?.outcome, "exhausted");
      assert.equal(run.evidence.length, 1);
      assert.ok(run.ledger.completion.remaining > 0);
      assert.equal(run.ledger.completion.terminalStatus, "timeout");
    } finally { await run.cleanup(); }
  });

  it("recovers validated artifacts and starts a fresh scheduler run without claiming resumable execution", async () => {
    const interrupted = await localRun(({ call }) => call === 0 ? { action: { type: "inspect_semantics" } } : finish);
    const recovered = recoverLedger(await readFile(join(interrupted.outDir, "frontier.json"), "utf8"));
    const outDir = await mkdtemp(join(tmpdir(), "art-replay-recovery-"));
    try {
      assert.ok(recovered.completion.remaining > 0);
      const saved = JSON.stringify(recovered);
      assert.throws(() => recoverLedger('{"schema":"art/adaptive-frontier/v1"}'));
      const result = await runSession({ config: fixtureConfig(harness, "/skip-links/index.html"), provider: new FrontierScheduler({ maxPagesPerSource: 6 }),
        outDir, browser: harness.browser, codeSha: "test", condition: { ...VISIBLE, selector: "scheduler" } });
      assert.equal(result.completion?.outcome, "complete_within_scope");
      assert.equal(result.usage.inputTokens, 0);
      assert.equal(JSON.stringify(recovered), saved, "new execution must not modify the old recovered artifact");
      assert.equal(await readFile(join(interrupted.outDir, "frontier.json"), "utf8"), JSON.stringify(recovered, null, 2));
      const fresh = recoverLedger(await readFile(join(outDir, "frontier.json"), "utf8"));
      assert.ok(fresh.pages.some((page) => page.visited && page.url.endsWith("/broken.html")));
      assert.ok(fresh.obligations.filter((item) => item.status === "executed").every((item) => auditObligation(item).assessment_outcome === "unassessed"));
    } finally { await interrupted.cleanup(); await rm(outDir, { recursive: true, force: true }); }
  });
});
