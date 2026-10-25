import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { DEFAULT_CONDITION, type EvidenceRecord, type ExplorationCondition, type Limits, type Observation, type StoredCandidate } from "../src/experimental/adaptive/contracts.js";
import { runSession } from "../src/experimental/adaptive/executor.js";
import { FrontierScheduler, SCHEDULER_VERSION } from "../src/experimental/adaptive/scheduler.js";
import { FakeProvider } from "../src/experimental/adaptive/providers/fake.js";
import { fixtureConfig, startHarness, type Harness } from "./adaptive-helpers.js";

let harness: Harness;
before(async () => { harness = await startHarness(); });
after(async () => { await harness.close(); });

export const CONDITION_D: ExplorationCondition = { ...DEFAULT_CONDITION, ledgerVisible: true, completionAccounting: true, incrementalCandidates: true, selector: "scheduler" };

async function runD(path: string, limits: Partial<Limits> = {}) {
  const outDir = await mkdtemp(join(tmpdir(), "art-adaptive-"));
  const provider = new FrontierScheduler({ maxPagesPerSource: CONDITION_D.sampling.maxPagesPerSource });
  const result = await runSession({ config: fixtureConfig(harness, path, limits), provider, outDir, browser: harness.browser, codeSha: "test", condition: CONDITION_D });
  const json = async <T>(name: string) => JSON.parse(await readFile(join(outDir, name), "utf8")) as T;
  return { result, outDir, json, cleanup: () => rm(outDir, { recursive: true, force: true }) };
}

const accepted = async (run: Awaited<ReturnType<typeof runD>>) => {
  const evidence = await run.json<EvidenceRecord[]>("evidence.json");
  return (await run.json<StoredCandidate[]>("candidates.json")).filter((item) => item.status === "candidate").map((item) => {
    const finding = item.finding as { category: string; observationRefs: string[] };
    return { category: finding.category, locators: finding.observationRefs.map((ref) => evidence.find((record) => record.id === ref)!).map((record) => `${new URL(record.url).pathname} ${record.target?.selectorHint ?? ""} ${record.note ?? ""}`) };
  });
};

describe("deterministic scheduler (condition D)", () => {
  it("visits the unvisited sibling and reports the broken skip link with evidence, with no model call", async () => {
    const run = await runD("/skip-links/index.html");
    try {
      assert.equal(run.result.pinned.modelId, SCHEDULER_VERSION);
      assert.deepEqual(run.result.usage, { inputTokens: 0, outputTokens: 0, estimated: false });
      assert.equal(run.result.condition.selector, "scheduler");
      assert.ok(run.result.surfacesVisited.some((url) => url.endsWith("/broken.html")));
      const found = await accepted(run);
      assert.ok(found.some((item) => item.category === "skip_link_broken" && item.locators.some((locator) => locator.startsWith("/skip-links/broken.html") && locator.includes("#content"))), JSON.stringify(found));
      assert.ok(!found.some((item) => item.locators.some((locator) => locator.startsWith("/skip-links/valid.html"))), "no claim about the working sibling");
      assert.equal(run.result.completion?.outcome, "complete_within_scope", JSON.stringify(run.result.completion));
    } finally { await run.cleanup(); }
  });

  it("opens the menu, follows the revealed pages and reports the unlabeled field", async () => {
    const run = await runD("/news-service/index.html");
    try {
      const found = await accepted(run);
      assert.ok(found.some((item) => item.category === "missing_accessible_name" && item.locators.some((locator) => locator.startsWith("/news-service/formular-umzug.html") && locator.includes("plz"))), JSON.stringify(found));
    } finally { await run.cleanup(); }
  });

  it("at the benchmark's 12-call cap, a finding captured just before the forced final call is submitted with finish", async () => {
    const run = await runD("/news-service/index.html", { maxModelCalls: 12, maxSteps: 24 });
    try {
      assert.equal(run.result.modelCalls, 12);
      const found = await accepted(run);
      assert.ok(found.some((item) => item.category === "missing_accessible_name" && item.locators.some((locator) => locator.includes("plz"))), JSON.stringify(found));
    } finally { await run.cleanup(); }
  });

  it("probes the dialog and reports focus not returned on the dialog trigger, not the menu", async () => {
    const run = await runD("/menu-dialog/index.html");
    try {
      const found = await accepted(run);
      const returned = found.filter((item) => item.category === "dialog_focus_not_returned");
      assert.equal(returned.length, 1, JSON.stringify(found));
      assert.ok(returned[0]!.locators.some((locator) => locator.includes("help-btn")));
      assert.ok(!found.some((item) => item.locators.some((locator) => locator.includes("menu-btn") && item.category.startsWith("dialog"))));
    } finally { await run.cleanup(); }
  });

  it("refuses mislabelled runs: scheduler without its flags or provider, and the scheduler under selector model", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "art-adaptive-"));
    const scheduler = new FrontierScheduler({ maxPagesPerSource: 6 });
    const base = { config: fixtureConfig(harness, "/skip-links/index.html"), outDir, browser: harness.browser, codeSha: "test" };
    try {
      await assert.rejects(runSession({ ...base, provider: scheduler, condition: { ...CONDITION_D, ledgerVisible: false } }), /needs ledgerVisible/);
      await assert.rejects(runSession({ ...base, provider: new FakeProvider(() => ({ action: { type: "unknown", reason: "" } })), condition: CONDITION_D }), /needs the frontier-scheduler provider/);
      await assert.rejects(runSession({ ...base, provider: scheduler, condition: { ...CONDITION_D, selector: "model" } }), /needs selector=scheduler/);
    } finally { await rm(outDir, { recursive: true, force: true }); }
  });
});

describe("scheduler ordering never depends on URLs or text", () => {
  type ViewPage = { id: string; url: string; visited: boolean; current: boolean; discoveredOn?: string | null };
  const observation = (input: ViewPage[], extra: Partial<Observation> = {}): Observation => {
    const pages = input.map((page) => ({ discoveredOn: page.current ? null : "p1", ...page }));
    return {
    step: 0, url: pages.find((page) => page.current)!.url, title: "", lang: null, timestamp: "", headings: [], landmarks: [], controls: [], links: [], skipLinks: [], dialogs: [], focus: null, lastActivated: null,
    pageTextExcerpt: "", evidence: [], recentActions: [], finalCall: false, recentDenials: [], budget: { stepsLeft: 9, modelCallsLeft: 9, wallMsLeft: 9, surfacesLeft: 9 },
    legal: { navigate: pages.filter((page) => !page.current).map((page) => page.url), activate: [], simple: [] },
    frontier: { pages, outstanding: [], outcomes: [], remaining: 0, truncated: { pages: false, outstanding: false, outcomes: false, ledger: false }, dropped: { pages: 0, outstanding: 0, outcomes: 0 } },
    ...extra,
    };
  };

  it("uses only the pages the view shows this turn, not pages it remembers (same information as condition B)", () => {
    const scheduler = new FrontierScheduler({ maxPagesPerSource: 6 });
    const start = { id: "p1", url: "/start.html", visited: true, current: true };
    const budget = (surfacesLeft: number) => ({ budget: { stepsLeft: 9, modelCallsLeft: 9, wallMsLeft: 9, surfacesLeft } });
    assert.equal(scheduler.decide(observation([start, { id: "p2", url: "/x.html", visited: false, current: false }], budget(0)))["type"], "finish");
    assert.equal(scheduler.decide(observation([start], budget(9)))["type"], "finish", "p2 is not in this turn's view");
  });

  it("takes the sampling source from the view's discoveredOn", () => {
    const scheduler = new FrontierScheduler({ maxPagesPerSource: 2 });
    const pages = [
      { id: "p1", url: "/s.html", visited: true, current: false, discoveredOn: null }, { id: "p2", url: "/b.html", visited: true, current: false, discoveredOn: "p1" },
      { id: "p3", url: "/c.html", visited: true, current: true, discoveredOn: "p1" }, { id: "p4", url: "/d.html", visited: false, current: false, discoveredOn: "p2" },
    ];
    assert.deepEqual(scheduler.decide(observation(pages)), { type: "navigate", url: "/d.html" }, "p4 is the first page found on p2, so it is in scope");
  });

  it("a dialog probe cut off by the final call still yields its rule finding in finish", () => {
    const scheduler = new FrontierScheduler({ maxPagesPerSource: 6 });
    const page = [{ id: "p1", url: "/s.html", visited: true, current: true }];
    const trigger = { ref: "e1", tag: "button", role: null, type: "button", name: "", id: "t", visible: true, expanded: null, controls: "d", controlsRole: "dialog", haspopup: "dialog", href: null, inForm: false, disabled: false, hasAccessibleName: true, safeToActivate: true, safetyReason: "ok", selectorHint: "button#t" };
    const first = observation(page, { controls: [trigger], legal: { navigate: [], activate: ["e1"], simple: [] } });
    first.frontier!.outstanding = [{ id: "o3", pageId: "p1", probe: "dialog_focus_return", status: "pending", applicability: "known", targetRef: "e1", reason: null }];
    assert.deepEqual(scheduler.decide(first), { type: "activate", targetRef: "e1" });
    const final = observation(page, {
      controls: [trigger], finalCall: true, dialogs: [{ role: "dialog", name: "", visible: true, containsFocus: false }],
      recentActions: [{ step: 0, type: "activate", targetRef: "e1", url: null, direction: null, outcome: "executed", result: "done; recorded ev_1", stateChanged: true, evidenceIds: ["ev_1"] }],
    });
    const action = scheduler.decide(final) as { type: string; candidates: Array<{ category: string; observationRefs: string[] }> };
    assert.equal(action.type, "finish");
    assert.deepEqual(action.candidates.map((item) => [item.category, item.observationRefs]), [["focus_not_moved_to_dialog", ["ev_1"]]]);
  });

  for (const names of [["/z-broken.html", "/a-valid.html"], ["/a-valid.html", "/z-broken.html"]]) {
    it(`visits pages in discovery order: ${names.join(" then ")}`, () => {
      const scheduler = new FrontierScheduler({ maxPagesPerSource: 6 });
      const pages = [{ id: "p1", url: "/start.html", visited: true, current: true }, { id: "p2", url: names[0]!, visited: false, current: false }, { id: "p3", url: names[1]!, visited: false, current: false }, { id: "p10", url: "/m.html", visited: false, current: false }];
      assert.deepEqual(scheduler.decide(observation(pages)), { type: "navigate", url: names[0] });
    });
  }

  it("the scheduler and the rule table never touch fixture truth or the filesystem", async () => {
    for (const file of ["scheduler.ts", "frontier-rules.ts"]) {
      // Code only: comments may say what the module must not do.
      const code = (await readFile(join("src/experimental/adaptive", file), "utf8")).split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
      assert.doesNotMatch(code, /truth|node:fs|readFile|fixtures\/adaptive-sites|server\.js|\bbroken\b|\bvalid\b/i, file);
      assert.doesNotMatch(code, /from "\.\/(funnel|compare|arms|frontier-compare)\.js"/, `${file} imports evaluator code`);
    }
  });
});
