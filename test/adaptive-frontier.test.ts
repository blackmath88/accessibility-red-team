import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { DEFAULT_CONDITION, ExplorationConditionSchema, FrontierLedgerSchema, type EvidenceRecord, type FrontierLedger, type Observation } from "../src/experimental/adaptive/contracts.js";
import { runSession } from "../src/experimental/adaptive/executor.js";
import { Frontier } from "../src/experimental/adaptive/frontier.js";
import { FakeProvider, type FakeScript } from "../src/experimental/adaptive/providers/fake.js";
import { fixtureConfig, linkTo, runInTemp, startHarness, type Harness } from "./adaptive-helpers.js";

let harness: Harness;
before(async () => { harness = await startHarness(); });
after(async () => { await harness.close(); });

const ledgerOf = async (outDir: string) => FrontierLedgerSchema.parse(JSON.parse(await readFile(join(outDir, "frontier.json"), "utf8")));
const pageBy = (ledger: FrontierLedger, suffix: string) => {
  const page = ledger.pages.find((item) => item.url.endsWith(suffix));
  if (!page) throw new Error(`no ledger page ${suffix}`);
  return page;
};
const obligationOf = (ledger: FrontierLedger, pageId: string, probe: string) => ledger.obligations.find((item) => item.pageId === pageId && item.probe === probe)!;

// Every executed obligation must point at evidence the executor recorded on that page with a probing action (navigation is not a probe).
async function assertProvenance(ledger: FrontierLedger, outDir: string): Promise<void> {
  const evidence = JSON.parse(await readFile(join(outDir, "evidence.json"), "utf8")) as EvidenceRecord[];
  for (const obligation of ledger.obligations.filter((item) => item.status === "executed")) {
    assert.ok(obligation.evidenceIds.length > 0, `${obligation.id} executed without evidence`);
    const page = ledger.pages.find((item) => item.id === obligation.pageId)!;
    for (const id of obligation.evidenceIds) {
      const record = evidence.find((item) => item.id === id);
      assert.ok(record, `${obligation.id} cites unknown ${id}`);
      assert.notEqual(record.kind, "navigate", `${obligation.id} executed by a navigation`);
      assert.equal(String(record.pre["url"]).split("#")[0], page.url.split("#")[0], `${obligation.id} evidence on another page`);
    }
  }
}

describe("exploration condition", () => {
  it("defaults to condition A and refuses flags that are not implemented yet", async () => {
    assert.deepEqual(ExplorationConditionSchema.parse(DEFAULT_CONDITION), DEFAULT_CONDITION);
    const outDir = await mkdtemp(join(tmpdir(), "art-adaptive-"));
    try {
      for (const condition of [{ ...DEFAULT_CONDITION, ledgerVisible: true }, { ...DEFAULT_CONDITION, selector: "scheduler" as const }]) {
        await assert.rejects(runSession({ config: fixtureConfig(harness, "/skip-links/index.html"), provider: new FakeProvider(() => ({ action: { type: "finish", verdict: "complete", summary: "" } })), outDir, browser: harness.browser, codeSha: "test", condition }), /not implemented yet/);
      }
    } finally { await rm(outDir, { recursive: true, force: true }); }
  });
});

describe("trial-3 skip-link regression: a working sibling does not make the broken sibling tested", () => {
  it("visits valid.html, finishes complete, and the ledger still shows broken.html discovered, visible, unvisited and pending", async () => {
    const script: FakeScript = ({ call, observation }) => call === 0
      ? { action: { type: "navigate", url: linkTo(observation, "/valid.html") } }
      : { action: { type: "finish", verdict: "complete", summary: "All pages and all skip links were fully tested; nothing remains.", candidates: [] } };
    const run = await runInTemp(harness, new FakeProvider(script), "/skip-links/index.html");
    try {
      assert.equal(run.result.status, "completed");
      assert.ok(run.result.artifacts.includes("frontier.json"));
      const ledger = await ledgerOf(run.outDir);
      const broken = pageBy(ledger, "/broken.html");
      assert.equal(broken.discovery.kind, "link");
      assert.equal(broken.discovery.step, 0);
      assert.equal(broken.modelVisible, true);
      assert.equal(broken.firstModelVisibleStep, 0);
      assert.equal(broken.visited, false);
      assert.equal(obligationOf(ledger, broken.id, "skip_link").status, "pending");
      // Visited is not tested: valid.html was loaded but nothing probed it.
      const valid = pageBy(ledger, "/valid.html");
      assert.equal(valid.visited, true);
      assert.equal(obligationOf(ledger, valid.id, "skip_link").status, "pending");
      // The finish summary claims full coverage; the ledger ignores it.
      assert.equal(ledger.completion.byStatus.executed, 0);
      assert.ok(ledger.completion.remaining > 0);
      assert.equal(ledger.completion.terminalStatus, "completed");
      assert.equal(ledger.condition.selector, "model");
      assert.equal(ledger.modelVisibleClipping.length, 0);
    } finally { await run.cleanup(); }
  });
});

describe("frontier ledger provenance", () => {
  it("an obligation becomes executed only after its probe ran and evidence was recorded", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "art-adaptive-"));
    const seen: FrontierLedger[] = [];
    const script: FakeScript = async ({ call, observation }) => {
      if (call > 0) seen.push(await ledgerOf(outDir));
      const steps = [
        () => ({ type: "navigate", url: linkTo(observation, "/valid.html") }),
        () => ({ type: "inspect_semantics" }),
        () => ({ type: "finish", verdict: "complete", summary: "everything tested", candidates: [] }),
      ];
      return { action: steps[call]!() };
    };
    try {
      const result = await runSession({ config: fixtureConfig(harness, "/skip-links/index.html"), provider: new FakeProvider(script), outDir, browser: harness.browser, codeSha: "test" });
      assert.equal(result.status, "completed");
      // frontier.json as written after the navigation turn: the page was loaded (ev_1) but nothing probed it yet.
      const navigated = pageBy(seen[0]!, "/valid.html");
      assert.equal(navigated.visited, false, "visited is learned from the next observation, not from the model's request");
      assert.equal(obligationOf(seen[0]!, navigated.id, "skip_link").status, "pending");
      assert.equal(seen[0]!.completion.byStatus.executed, 0, "a navigation is not a probe");
      const ledger = await ledgerOf(outDir);
      const valid = pageBy(ledger, "/valid.html");
      assert.deepEqual(obligationOf(ledger, valid.id, "skip_link").evidenceIds, ["ev_2"]);
      assert.equal(obligationOf(ledger, valid.id, "semantics").status, "executed");
      // The start page has no skip link: deferred with a reason, not executed and not silently dropped.
      const start = pageBy(ledger, "/index.html");
      assert.equal(obligationOf(ledger, start.id, "skip_link").status, "deferred");
      assert.ok(ledger.completion.exclusions.some((item) => item.obligationId === obligationOf(ledger, start.id, "skip_link").id));
      assert.equal(obligationOf(ledger, pageBy(ledger, "/broken.html").id, "skip_link").status, "pending");
      assert.deepEqual(seen.at(-1)!.obligations, ledger.obligations, "the finish turn changed no obligation");
      await assertProvenance(ledger, outDir);
    } finally { await rm(outDir, { recursive: true, force: true }); }
  });

  it("a refused navigation blocks the target page's obligations", async () => {
    const script: FakeScript = ({ call, observation }) => call === 0
      ? { action: { type: "navigate", url: observation!.links.find((link) => link.href.endsWith("/valid.html"))!.href } }
      : { action: { type: "finish", verdict: "inconclusive", summary: "", candidates: [] } };
    const run = await runInTemp(harness, new FakeProvider(script), "/skip-links/index.html", { limits: { maxSurfaces: 1 } });
    try {
      assert.deepEqual(run.denials.map((denial) => denial.reason), ["surface_limit"]);
      const ledger = await ledgerOf(run.outDir);
      const valid = pageBy(ledger, "/valid.html");
      assert.equal(valid.modelVisible, false, "no surfaces left, so legal.navigate never listed it");
      for (const obligation of ledger.obligations.filter((item) => item.pageId === valid.id)) {
        assert.equal(obligation.status, "blocked");
        assert.match(obligation.reason ?? "", /surface_limit/);
      }
      assert.equal(obligationOf(ledger, pageBy(ledger, "/broken.html").id, "skip_link").status, "pending");
      assert.ok(ledger.modelVisibleClipping.length > 0, "the hidden links are reported");
    } finally { await run.cleanup(); }
  });

  it("cancellation still writes frontier.json with the terminal status", async () => {
    const controller = new AbortController();
    const provider = new FakeProvider(({ call }) => {
      if (call === 0) return { action: { type: "inspect_semantics" } };
      queueMicrotask(() => controller.abort());
      return { hang: true };
    });
    const run = await runInTemp(harness, provider, "/skip-links/index.html", { signal: controller.signal });
    try {
      assert.equal(run.result.status, "cancelled");
      const ledger = await ledgerOf(run.outDir);
      assert.equal(ledger.completion.terminalStatus, "cancelled");
      assert.equal(obligationOf(ledger, pageBy(ledger, "/index.html").id, "semantics").status, "executed");
      await assertProvenance(ledger, run.outDir);
    } finally { await run.cleanup(); }
  });
});

describe("frontier ledger bounds and model text", () => {
  const observation = (url: string, links: string[]): Observation => ({
    step: 0, url, title: "", lang: null, timestamp: "", headings: [], landmarks: [], controls: [], skipLinks: [], dialogs: [], focus: null, lastActivated: null,
    links: links.map((href, index) => ({ ref: `e${index}`, name: "", hasAccessibleName: false, href, visible: true, sameOrigin: true, navigable: true, denyReason: null, selectorHint: "a" })),
    pageTextExcerpt: "", evidence: [], recentActions: [], finalCall: false, recentDenials: [], budget: { stepsLeft: 1, modelCallsLeft: 1, wallMsLeft: 1, surfacesLeft: 1 },
    legal: { navigate: links, activate: [], simple: [] },
  });

  it("drops pages and obligations past the bounds and says so", () => {
    const frontier = new Frontier("b", DEFAULT_CONDITION, (url) => url, { maxPages: 2, maxStates: 1, maxObligations: 3 });
    const links = ["http://f.test/a", "http://f.test/b", "http://f.test/c", "http://f.test/d"];
    frontier.observe({ step: 0, observation: observation("http://f.test/", links), discoveredNow: links, previous: null });
    frontier.observe({ step: 1, observation: observation("http://f.test/a", []), discoveredNow: [], previous: { type: "navigate", targetRef: null, step: 0 } });
    const ledger = frontier.snapshot();
    assert.equal(ledger.pages.length, 2);
    assert.deepEqual(ledger.truncated, { pages: true, states: true, obligations: true });
    assert.deepEqual(ledger.dropped, { pages: 3, states: 1, obligations: 1 });
    assert.equal(ledger.obligations.length, 3);
  });

  it("a denial for a URL the model made up never creates a page", () => {
    const frontier = new Frontier("d", DEFAULT_CONDITION, (url) => url);
    frontier.observe({ step: 0, observation: observation("http://f.test/", []), discoveredNow: [], previous: null });
    frontier.recordDenials([{ id: "den_1", step: 0, timestamp: "", source: "executor_validation", reason: "url_not_discovered", detail: "", url: "http://f.test/secret", attemptedAction: { type: "navigate", url: "http://f.test/secret" } }]);
    const ledger = frontier.snapshot();
    assert.equal(ledger.pages.length, 1);
    assert.equal(ledger.completion.byStatus.blocked, 0);
  });
});

describe("fixture ground truth is not reachable from the tester's browser", () => {
  it("GET /<fixture>/truth.json returns 404 through the contained browser", async () => {
    const context = await harness.browser.newContext();
    try {
      const page = await context.newPage();
      for (const fixture of ["skip-links", "news-service", "menu-dialog"]) {
        const response = await page.goto(`${harness.fixtures.origin}/${fixture}/truth.json`);
        assert.equal(response?.status(), 404, fixture);
      }
    } finally { await context.close(); }
  });
});
