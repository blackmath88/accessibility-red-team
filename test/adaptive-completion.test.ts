import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { DEFAULT_CONDITION, type ExplorationCondition, type Limits, type Observation, type StoredCandidate } from "../src/experimental/adaptive/contracts.js";
import { runSession } from "../src/experimental/adaptive/executor.js";
import { Frontier, type CompactLog } from "../src/experimental/adaptive/frontier.js";
import { FakeProvider, type FakeScript } from "../src/experimental/adaptive/providers/fake.js";
import { fixtureConfig, linkTo, startHarness, type Harness } from "./adaptive-helpers.js";

let harness: Harness;
before(async () => { harness = await startHarness(); });
after(async () => { await harness.close(); });

const ACCOUNTING: ExplorationCondition = { ...DEFAULT_CONDITION, completionAccounting: true };
const INCREMENTAL: ExplorationCondition = { ...DEFAULT_CONDITION, completionAccounting: true, incrementalCandidates: true };
const VISIBLE: ExplorationCondition = { ...DEFAULT_CONDITION, ledgerVisible: true, completionAccounting: true, incrementalCandidates: true };

async function run(path: string, script: FakeScript, condition?: ExplorationCondition, options: { limits?: Partial<Limits>; signal?: AbortSignal } = {}) {
  const outDir = await mkdtemp(join(tmpdir(), "art-adaptive-"));
  const provider = new FakeProvider(script);
  const result = await runSession({ config: fixtureConfig(harness, path, options.limits), provider, outDir, browser: harness.browser, codeSha: "test", condition, signal: options.signal });
  const lines = async (name: string) => (await readFile(join(outDir, name), "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  return {
    result, outDir, provider, lines,
    candidates: async () => JSON.parse(await readFile(join(outDir, "candidates.json"), "utf8")) as StoredCandidate[],
    cleanup: () => rm(outDir, { recursive: true, force: true }),
  };
}

const finish = (verdict: "complete" | "inconclusive" = "complete", candidates: unknown[] = []) => ({ action: { type: "finish", verdict, summary: "All pages and skip links were fully tested.", candidates } });
const finding = (ref: string, category = "skip_link_broken") => ({
  category, claim: "The skip link target does not exist.", observationRefs: [ref], reproductionSteps: ["Open the page"], limitations: ["DOM summary"], proposedDeterministicCheck: "skip link href resolves",
});

describe("completion accounting: finish is a proposal", () => {
  const visitValidThenFinish: FakeScript = ({ call, observation }) => call === 0 ? { action: { type: "navigate", url: linkTo(observation, "/valid.html") } } : finish();

  it("trial-3 regression: a 'complete' finish with broken.html unvisited is recorded as partial", async () => {
    const r = await run("/skip-links/index.html", visitValidThenFinish, ACCOUNTING);
    try {
      assert.equal(r.result.status, "completed");
      assert.equal(r.result.completion?.outcome, "partial");
      assert.equal(r.result.completion?.proposal, "complete");
      assert.ok(r.result.completion!.pending.some((item) => item.url.endsWith("/broken.html") && item.probe === "skip_link"));
      assert.equal(r.result.pinned.skillVersion, "adaptive-a11y-skill/v4");
      assert.deepEqual(r.result.condition, ACCOUNTING);
    } finally { await r.cleanup(); }
  });

  it("with the flag off, completion is null and the skill stays v3", async () => {
    const r = await run("/skip-links/index.html", visitValidThenFinish);
    try {
      assert.equal(r.result.completion, null);
      assert.equal(r.result.pinned.skillVersion, "adaptive-a11y-skill/v3");
      assert.deepEqual(r.result.condition, DEFAULT_CONDITION);
    } finally { await r.cleanup(); }
  });

  it("probing every reachable page is complete within scope", async () => {
    const steps = [
      () => ({ type: "inspect_semantics" }),
      (o: Observation) => ({ type: "navigate", url: linkTo(o, "/valid.html") }),
      () => ({ type: "inspect_semantics" }),
      (o: Observation) => ({ type: "navigate", url: o.legal.navigate.find((url) => url.endsWith("/index.html"))! }),
      (o: Observation) => ({ type: "navigate", url: o.legal.navigate.find((url) => url.endsWith("/broken.html"))! }),
      () => ({ type: "inspect_semantics" }),
    ];
    const r = await run("/skip-links/index.html", ({ call, observation }) => call < steps.length ? { action: steps[call]!(observation!) } : finish("inconclusive"), ACCOUNTING);
    try {
      assert.equal(r.result.completion?.outcome, "complete_within_scope", JSON.stringify(r.result.completion));
      assert.deepEqual(r.result.completion?.pending, []);
      assert.equal(r.result.completion?.proposal, "inconclusive");
    } finally { await r.cleanup(); }
  });

  it("with every remaining obligation refused by policy the outcome is blocked, and unreachable pages are excluded", async () => {
    const steps = [() => ({ type: "inspect_semantics" }), (o: Observation) => ({ type: "navigate", url: linkTo(o, "/valid.html") })];
    const r = await run("/skip-links/index.html", ({ call, observation }) => call < steps.length ? { action: steps[call]!(observation!) } : finish(), ACCOUNTING, { limits: { maxSurfaces: 1 } });
    try {
      const completion = r.result.completion!;
      assert.equal(completion.outcome, "blocked", JSON.stringify(completion));
      assert.equal(completion.blocked, 2);
      assert.ok(completion.exclusions.some((item) => /surface_limit/.test(item.reason)));
      assert.ok(completion.exclusions.some((item) => /^not reachable/.test(item.reason)), "broken.html was never offered or visited");
    } finally { await r.cleanup(); }
  });

  it("the sampling rule keeps the first N pages per discovery source in discovery order and excludes the rest", () => {
    const links = ["/a", "/b", "/c", "/d"];
    const observation: Observation = {
      step: 0, url: "/", title: "", lang: null, timestamp: "", headings: [], landmarks: [], controls: [], skipLinks: [], dialogs: [], focus: null, lastActivated: null,
      links: links.map((href, index) => ({ ref: `e${index}`, name: "", hasAccessibleName: false, href, visible: true, sameOrigin: true, navigable: true, denyReason: null, selectorHint: "a" })),
      pageTextExcerpt: "", evidence: [], recentActions: [], finalCall: false, recentDenials: [], budget: { stepsLeft: 1, modelCallsLeft: 1, wallMsLeft: 1, surfacesLeft: 1 },
      legal: { navigate: links, activate: [], simple: [] },
    };
    const frontier = new Frontier("s", ACCOUNTING, (url) => url);
    frontier.observe({ step: 0, observation, discoveredNow: links, previous: null });
    const completion = frontier.completion({ status: "completed", cancelled: false, proposal: "complete", maxPagesPerSource: 2 });
    assert.equal(completion.outcome, "partial");
    assert.deepEqual([...new Set(completion.pending.map((item) => item.pageId))], ["p1", "p2", "p3"]);
    const sampled = completion.exclusions.filter((item) => /^sampled out/.test(item.reason)).length;
    assert.equal(sampled, 4, "two obligations each on p4 and p5");
  });

  it("cancellation yields completion cancelled", async () => {
    const controller = new AbortController();
    const r = await run("/skip-links/index.html", ({ call }) => {
      if (call === 0) return { action: { type: "inspect_semantics" } };
      queueMicrotask(() => controller.abort());
      return { hang: true };
    }, ACCOUNTING, { signal: controller.signal });
    try {
      assert.equal(r.result.status, "cancelled");
      assert.equal(r.result.completion?.outcome, "cancelled");
    } finally { await r.cleanup(); }
  });
});

describe("incremental candidates", () => {
  it("a reported candidate survives a budget-exhausted end", async () => {
    const r = await run("/skip-links/index.html", ({ call, observation }) => {
      if (call === 0) return { action: { type: "navigate", url: linkTo(observation, "/broken.html") } };
      if (call === 1) return { action: { type: "capture_evidence", note: "skip link target missing" } };
      if (call === 2) return { action: { type: "report_candidate", candidate: finding("ev_2") } };
      return { action: { type: "scroll", direction: "down" } };
    }, INCREMENTAL, { limits: { maxModelCalls: 5 } });
    try {
      assert.equal(r.result.status, "budget_exhausted");
      assert.equal(r.result.completion?.outcome, "exhausted");
      assert.equal(r.result.candidateCount, 1);
      assert.deepEqual((await r.candidates()).map((item) => [item.id, item.status, item.step]), [["cand_1", "candidate", 2]]);
      const history = (await r.lines("trace.jsonl")).map((step) => step["outcome"]);
      assert.equal(history[2], "executed");
    } finally { await r.cleanup(); }
  });

  it("repeat reports of the same category and target are duplicates, not double-counted, including at finish", async () => {
    const r = await run("/skip-links/broken.html", ({ call }) => {
      if (call === 0) return { action: { type: "capture_evidence", note: "skip link" } };
      if (call === 1 || call === 2) return { action: { type: "report_candidate", candidate: finding("ev_1") } };
      return finish("complete", [finding("ev_1"), finding("ev_1", "missing_accessible_name")]);
    }, INCREMENTAL);
    try {
      const stored = await r.candidates();
      assert.deepEqual(stored.map((item) => [item.id, item.status, item.duplicateOf ?? null]), [
        ["cand_1", "candidate", null], ["cand_2", "duplicate", "cand_1"], ["cand_3", "duplicate", "cand_1"], ["cand_4", "candidate", null],
      ]);
      assert.equal(r.result.candidateCount, 2);
      assert.equal(r.result.rejectedCandidateCount, 0);
    } finally { await r.cleanup(); }
  });

  it("malformed and unresolved candidates are rejected exactly as finish candidates are", async () => {
    const bad = [{ category: "x" }, finding("ev_99")];
    const r = await run("/skip-links/broken.html", ({ call }) => call < 2 ? { action: { type: "report_candidate", candidate: bad[call] } } : finish("inconclusive", bad), INCREMENTAL);
    try {
      const stored = await r.candidates();
      assert.deepEqual(stored.map((item) => item.status), ["rejected", "rejected", "rejected", "rejected"]);
      assert.equal(stored[0]!.rejection, stored[2]!.rejection);
      assert.equal(stored[1]!.rejection, stored[3]!.rejection);
      assert.match(stored[1]!.rejection!, /unresolved evidence refs: ev_99/);
    } finally { await r.cleanup(); }
  });

  it("with the flag off, report_candidate is refused like any unknown type", async () => {
    const r = await run("/skip-links/broken.html", ({ call }) => call === 0 ? { action: { type: "report_candidate", candidate: finding("ev_1") } } : finish("inconclusive"));
    try {
      const denials = JSON.parse(await readFile(join(r.outDir, "denials.json"), "utf8")) as Array<{ reason: string; detail: string }>;
      assert.equal(denials[0]?.reason, "forbidden_action_type");
      assert.doesNotMatch(denials[0]!.detail.split("allowed types:")[1]!, /report_candidate/, "the allowed list is condition A's");
      assert.deepEqual(await r.candidates(), []);
    } finally { await r.cleanup(); }
  });
});

describe("compact frontier in the observation", () => {
  const script: FakeScript = ({ call, observation }) => [
    () => ({ action: { type: "inspect_semantics" } }),
    () => ({ action: { type: "navigate", url: linkTo(observation, "/valid.html") } }),
  ][call]?.() ?? finish("inconclusive");
  // Fields that differ between any two runs whatever the condition.
  const stable = (line: Record<string, unknown>) => ({ ...line, timestamp: null, budget: { ...(line["budget"] as object), wallMsLeft: null } });

  it("the ledger-hidden control sees exactly condition A's observations", async () => {
    const a = await run("/skip-links/index.html", script);
    const hidden = await run("/skip-links/index.html", script, INCREMENTAL);
    try {
      const [left, right] = [await a.lines("observations.jsonl"), await hidden.lines("observations.jsonl")];
      assert.equal(left.length, 3);
      assert.deepEqual(right.map(stable), left.map(stable));
      assert.ok(left.every((line) => !("frontier" in line)));
    } finally { await a.cleanup(); await hidden.cleanup(); }
  });

  it("with ledgerVisible the model sees harness-authored frontier facts and every turn is logged", async () => {
    const r = await run("/skip-links/index.html", script, VISIBLE);
    try {
      const observations = (await r.lines("observations.jsonl")) as unknown as Observation[];
      const first = observations[0]!.frontier!;
      assert.deepEqual(first.pages.map((page) => [page.id, page.visited, page.current]), [["p1", true, true], ["p2", false, false], ["p3", false, false]]);
      assert.ok(first.outstanding.some((item) => item.pageId === "p3" && item.probe === "skip_link" && item.status === "pending"));
      const later = observations[2]!.frontier!;
      assert.deepEqual(later.outcomes.map((item) => [item.probe, item.evidenceIds]), [["semantics", ["ev_1"]]]);
      // Visited, legal this turn, or discovered earlier on a known page (the executor accepts any discovered URL).
      for (const page of later.pages) assert.ok(page.visited || observations[2]!.legal.navigate.includes(page.url) || later.pages.some((other) => other.id === page.discoveredOn), page.url);
      const shown = (await r.lines("frontier-shown.jsonl")) as unknown as CompactLog[];
      assert.deepEqual(shown.map((line) => line.step), [0, 1, 2]);
      assert.ok(r.result.artifacts.includes("frontier-shown.jsonl"));
      // No page text: element names and link text never reach the compact view.
      const text = JSON.stringify(observations.map((observation) => observation.frontier));
      for (const name of observations.flatMap((observation) => observation.links.map((link) => link.name)).filter((name) => name.length > 3)) assert.ok(!text.includes(name), name);
    } finally { await r.cleanup(); }
  });

  it("on a sibling page the model still sees the unvisited siblings and their pending work (review M1)", async () => {
    const seen: Observation[] = [];
    const r = await run("/dev-k1/index.html", ({ call, observation }) => {
      seen.push(observation!);
      return call === 0 ? { action: { type: "navigate", url: linkTo(observation, "/s/a3.html") } } : finish("inconclusive");
    }, VISIBLE);
    try {
      const onSibling = seen[1]!;
      const siblings = ["/s/f8.html", "/s/m2.html", "/s/q5.html"];
      for (const suffix of siblings) assert.ok(!onSibling.legal.navigate.some((url) => url.endsWith(suffix)), "precondition: not legal on the sibling page");
      const shown = onSibling.frontier!.pages.filter((page) => siblings.some((suffix) => page.url.endsWith(suffix)));
      assert.equal(shown.length, 3);
      assert.ok(shown.every((page) => !page.visited && page.discoveredOn === "p1"));
      const target = shown.find((page) => page.url.endsWith("/s/m2.html"))!;
      assert.ok(onSibling.frontier!.outstanding.some((item) => item.pageId === target.id && item.probe === "skip_link" && item.status === "pending"));
    } finally { await r.cleanup(); }
  });

  it("clipping by the compact bound and links that are not legal this turn are flagged and logged", () => {
    const observation = (url: string, links: string[], legal = links): Observation => ({
      step: 0, url, title: "", lang: null, timestamp: "", headings: [], landmarks: [], controls: [], skipLinks: [], dialogs: [], focus: null, lastActivated: null,
      links: links.map((href, index) => ({ ref: `e${index}`, name: "", hasAccessibleName: false, href, visible: true, sameOrigin: true, navigable: true, denyReason: null, selectorHint: "a" })),
      pageTextExcerpt: "", evidence: [], recentActions: [], finalCall: false, recentDenials: [], budget: { stepsLeft: 1, modelCallsLeft: 1, wallMsLeft: 1, surfacesLeft: 1 },
      legal: { navigate: legal, activate: [], simple: [] },
    });
    const frontier = new Frontier("c", VISIBLE, (url) => url, undefined, { pages: 2, outstanding: 2, outcomes: 1 });
    const links = ["/a", "/b", "/c", "/d"];
    frontier.observe({ step: 0, observation: observation("/", links), discoveredNow: links, previous: null });
    // No surfaces left: unvisited pages that are not legal this turn are not shown.
    const { view, log } = frontier.compact({ ...observation("/", links, ["/a", "/b", "/c"]), budget: { stepsLeft: 1, modelCallsLeft: 1, wallMsLeft: 1, surfacesLeft: 0 } });
    assert.deepEqual(view.pages.map((page) => page.id), ["p1", "p2"]);
    assert.deepEqual(view.truncated, { pages: true, outstanding: true, outcomes: false, ledger: false });
    assert.equal(view.dropped.pages, 2);
    assert.deepEqual(log.clipped.pages, ["p3", "p4"]);
    assert.deepEqual(log.notShown.pages, ["p5"]);
    assert.ok(log.notShown.obligations.length > 0);
  });
});
