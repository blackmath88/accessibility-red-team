// Evaluator-side funnel scoring for the frontier benchmark. Reads a finished session's artifacts and fixture ground truth; nothing here is
// reachable from the tester, the scheduler or the rule table. Per seeded defect instance it scores, in separate columns, exploration
// (discovered -> model-visible -> selected -> visited -> probe executed) and interpretation (interpreted -> evidence-backed reported).
// Credit needs both the required probe and a reported, evidence-backed finding matched by the same rule compare.ts uses.
// No credit for visits without the probe, duplicates or self-reported coverage. Unmatched accepted findings are unadjudicated.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { matches } from "./compare.js";
import { FrontierLedgerSchema, type EvidenceRecord, type FrontierProbe, type SessionResult, type StoredCandidate } from "./contracts.js";
import { classifyCompletion } from "./frontier.js";
import type { Truth } from "../../../test/fixtures/adaptive-sites/server.js";

export const FUNNEL_VERSION = "frontier-funnel/v1";

const PROBE_FOR: Record<string, FrontierProbe> = {
  skip_link_broken: "skip_link", missing_accessible_name: "semantics", dialog_focus_not_returned: "dialog_focus_return", focus_not_moved_to_dialog: "dialog_focus_return",
};

export type DefectFunnel = {
  defectId: string; category: string; path: string;
  exploration: { discovered: boolean; modelVisible: boolean; selected: boolean; visited: boolean; probeExecuted: boolean };
  interpretation: { interpreted: boolean; reported: boolean };
  credited: boolean;
};

export type SessionFunnel = {
  schema: typeof FUNNEL_VERSION;
  fixture: string; condition: string; terminal: string; comparable: boolean;
  defects: DefectFunnel[];
  prematureCompletion: boolean; proposal: "complete" | "inconclusive" | null; completionOutcome: string;
  coverage: { pagesVisited: number; pagesDiscovered: number; statesSeen: number; probesExecuted: number; probesTotal: number };
  duplicates: number; deniedActions: Record<string, number>;
  unadjudicated: Array<{ candidateId: string; category: string; paths: string[] }>;
  modelCalls: number; inputTokens: number; outputTokens: number;
};

const pathOf = (url: string) => { try { return new URL(url).pathname; } catch { return url.split("#")[0]!; } };

export async function scoreSession(dir: string, truth: Truth, condition: string, maxPagesPerSource: number): Promise<SessionFunnel> {
  const json = async <T>(name: string) => JSON.parse(await readFile(join(dir, name), "utf8")) as T;
  const result = await json<SessionResult>("result.json");
  const ledger = FrontierLedgerSchema.parse(await json("frontier.json"));
  const evidence = await json<EvidenceRecord[]>("evidence.json");
  const candidates = await json<StoredCandidate[]>("candidates.json");
  const trace = (await readFile(join(dir, "trace.jsonl"), "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as { action: Record<string, unknown> | null });
  const navigated = new Set(trace.filter((step) => step.action?.["type"] === "navigate" && typeof step.action["url"] === "string").map((step) => pathOf(step.action!["url"] as string)));
  const finish = [...trace].reverse().find((step) => step.action?.["type"] === "finish");
  const proposal = (finish?.action?.["verdict"] as "complete" | "inconclusive" | undefined) ?? null;

  // Each stored candidate as a finding with occurrences, exactly as arm B summarises it for compare.ts.
  const findings = candidates.map((candidate) => {
    const finding = candidate.finding as { category?: string; observationRefs?: string[] } | null;
    const records = (finding?.observationRefs ?? []).map((ref) => evidence.find((item) => item.id === ref)).filter((item): item is EvidenceRecord => Boolean(item));
    return {
      candidate, category: finding?.category ?? "",
      occurrences: records.map((item) => ({ path: pathOf(item.url), locator: `${item.target?.selectorHint ?? ""} ${item.note ?? ""}`.trim(), kind: item.kind })),
    };
  });

  const defects = truth.defects.map((defect): DefectFunnel => {
    const page = ledger.pages.find((item) => pathOf(item.url) === defect.path);
    const isStart = defect.path === truth.startPath;
    const probe = PROBE_FOR[defect.category];
    const subject = defect.match.replace(/^#/, "");
    const probeExecuted = Boolean(page && probe && ledger.obligations.some((item) => item.pageId === page.id && item.probe === probe && item.status === "executed"
      && (probe !== "dialog_focus_return" || (item.subject ?? "").includes(subject))));
    const onPage = findings.filter((finding) => finding.category === defect.category && finding.occurrences.some((occurrence) => occurrence.path === defect.path));
    const reported = findings.some((finding) => finding.candidate.status === "candidate" && matches(finding, defect) && finding.occurrences.some((occurrence) => occurrence.kind !== "navigate"));
    const exploration = { discovered: Boolean(page), modelVisible: isStart || Boolean(page?.modelVisible), selected: isStart || navigated.has(defect.path), visited: Boolean(page?.visited), probeExecuted };
    return { defectId: defect.id, category: defect.category, path: defect.path, exploration, interpretation: { interpreted: onPage.length > 0, reported }, credited: probeExecuted && reported };
  });

  const completion = classifyCompletion(ledger, { status: result.status, cancelled: result.status === "cancelled", proposal, maxPagesPerSource });
  const denied: Record<string, number> = {};
  for (const denial of await json<Array<{ reason: string }>>("denials.json")) denied[denial.reason] = (denied[denial.reason] ?? 0) + 1;
  return {
    schema: FUNNEL_VERSION, fixture: truth.fixture, condition, terminal: result.status,
    // Malicious fixtures and errored sessions are not comparable across conditions.
    comparable: truth.fixture !== "malicious" && (result.status === "completed" || result.status === "budget_exhausted"),
    defects, prematureCompletion: proposal === "complete" && completion.outcome !== "complete_within_scope", proposal, completionOutcome: completion.outcome,
    coverage: {
      pagesVisited: ledger.pages.filter((page) => page.visited).length, pagesDiscovered: ledger.pages.length, statesSeen: ledger.states.length,
      probesExecuted: ledger.obligations.filter((item) => item.status === "executed").length, probesTotal: ledger.obligations.length,
    },
    duplicates: candidates.filter((item) => item.status === "duplicate").length, deniedActions: denied,
    unadjudicated: findings.filter((finding) => finding.candidate.status === "candidate" && !truth.defects.some((defect) => matches(finding, defect)))
      .map((finding) => ({ candidateId: finding.candidate.id, category: finding.category, paths: [...new Set(finding.occurrences.map((occurrence) => occurrence.path))] })),
    modelCalls: result.modelCalls, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
  };
}

const yn = (value: boolean) => value ? "yes" : "–";

export function renderFunnelTable(rows: SessionFunnel[]): string[] {
  const out = [
    "| fixture | condition | defect | discovered | visible | selected | visited | probe ran | interpreted | reported | credited | premature finish | completion | pages v/d | probes run/total | dup | unadjudicated | terminal |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    for (const defect of row.defects) {
      const e = defect.exploration; const i = defect.interpretation;
      out.push(`| ${row.fixture} | ${row.condition} | ${defect.defectId} | ${yn(e.discovered)} | ${yn(e.modelVisible)} | ${yn(e.selected)} | ${yn(e.visited)} | ${yn(e.probeExecuted)} | ${yn(i.interpreted)} | ${yn(i.reported)} | **${defect.credited ? "1" : "0"}** | ${yn(row.prematureCompletion)} | ${row.completionOutcome} | ${row.coverage.pagesVisited}/${row.coverage.pagesDiscovered} | ${row.coverage.probesExecuted}/${row.coverage.probesTotal} | ${row.duplicates} | ${row.unadjudicated.length} | ${row.terminal}${row.comparable ? "" : " (not comparable)"} |`);
    }
  }
  return out;
}
