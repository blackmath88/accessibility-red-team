// Local frontier comparison: no API, no model. Runs the development fixtures under
//   A-standin       condition A flags, driven by the scripted explorer (a stand-in for a model; NOT model results)
//   hidden-standin  ledger-hidden control flags, same script
//   B-standin       condition B flags (frontier visible), same script; the script does not read the frontier
//   D               the deterministic scheduler (frontier-scheduler/v1 + frontier-rules/v1), no model calls
// A, the control and B can only differ here through harness accounting, not behaviour; real A/B/C comparisons need a model and are
// pending owner approval (see trials/frontier-benchmark.v1.json, dry run only).
//   npm run adaptive:frontier-local [-- --fixtures skip-links,dev-k1]
// Artifacts go to runs/frontier-local/<id>/ (gitignored): per session its own directory with frontier.json, plus funnel.json and
// comparison.md. Ground truth is read here, after each session, by the evaluator only.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DEFAULT_CONDITION, DEFAULT_FIXTURE_LIMITS, type ExplorationCondition, type Limits } from "./contracts.js";
import { codeSha, runSession } from "./executor.js";
import { launchContainedBrowser } from "./containment.js";
import { FUNNEL_VERSION, renderFunnelTable, scoreSession, type SessionFunnel } from "./funnel.js";
import { RULES_VERSION } from "./frontier-rules.js";
import type { ModelProvider } from "./provider.js";
import { FakeProvider } from "./providers/fake.js";
import { FrontierScheduler, SCHEDULER_VERSION } from "./scheduler.js";
import { exploratoryScript } from "./scripted-policy.js";
import { startFixtures } from "../../../test/fixtures/adaptive-sites/server.js";
import { FRONTIER_DEV_FIXTURES, loadDevTruth, type FrontierDevFixture } from "../../../test/fixtures/adaptive-sites/variants.js";

export const CONDITIONS: Record<"A" | "hidden" | "B" | "D", ExplorationCondition> = {
  A: DEFAULT_CONDITION,
  hidden: { ...DEFAULT_CONDITION, completionAccounting: true, incrementalCandidates: true },
  B: { ...DEFAULT_CONDITION, ledgerVisible: true, completionAccounting: true, incrementalCandidates: true },
  D: { ...DEFAULT_CONDITION, ledgerVisible: true, completionAccounting: true, incrementalCandidates: true, selector: "scheduler" },
};

type LocalCondition = { label: string; condition: ExplorationCondition; provider: () => ModelProvider };
export const LOCAL_CONDITIONS: LocalCondition[] = [
  { label: "A-standin", condition: CONDITIONS.A, provider: () => new FakeProvider(exploratoryScript()) },
  { label: "hidden-standin", condition: CONDITIONS.hidden, provider: () => new FakeProvider(exploratoryScript()) },
  { label: "B-standin", condition: CONDITIONS.B, provider: () => new FakeProvider(exploratoryScript()) },
  { label: "D", condition: CONDITIONS.D, provider: () => new FrontierScheduler({ maxPagesPerSource: CONDITIONS.D.sampling.maxPagesPerSource }) },
];

export async function runLocalComparison(options: { outRoot?: string; id?: string; fixtures?: FrontierDevFixture[]; conditions?: string[]; limits?: Partial<Limits> } = {}) {
  const id = options.id ?? new Date().toISOString().replace(/[:.]/g, "-");
  const dir = resolve(options.outRoot ?? "runs/frontier-local", id);
  await mkdir(dir, { recursive: true });
  const fixtures = options.fixtures ?? [...FRONTIER_DEV_FIXTURES];
  const conditions = LOCAL_CONDITIONS.filter((item) => !options.conditions || options.conditions.includes(item.label));
  const limits: Limits = { ...DEFAULT_FIXTURE_LIMITS, ...options.limits };
  const sha = codeSha();
  const server = await startFixtures();
  const contained = await launchContainedBrowser([server.origin]).catch(async (error) => { await server.close(); throw error; });
  const rows: SessionFunnel[] = [];
  try {
    for (const fixture of fixtures) {
      const truth = await loadDevTruth(fixture);
      for (const item of conditions) {
        const sessionDir = join(dir, fixture, item.label);
        await runSession({
          config: { schema: "art/adaptive-session/v1", sessionId: `${fixture}-${item.label}`, startUrl: `${server.origin}${truth.startPath}`, allowedOrigins: [server.origin], mode: "fixture", publicTargets: [], limits },
          provider: item.provider(), outDir: sessionDir, browser: contained.browser, codeSha: sha, condition: item.condition,
        });
        rows.push(await scoreSession(sessionDir, truth, item.label, item.condition));
      }
    }
  } finally {
    await contained.close();
    await server.close();
  }
  await writeFile(join(dir, "funnel.json"), JSON.stringify({ schema: FUNNEL_VERSION, id, codeSha: sha, limits, conditions: conditions.map(({ label, condition }) => ({ label, condition })), rows }, null, 2));
  const markdown = renderComparison(id, sha, rows);
  await writeFile(join(dir, "comparison.md"), markdown);
  return { dir, rows, markdown };
}

export function renderComparison(id: string, sha: string, rows: SessionFunnel[]): string {
  const tally = (label: string, leaky?: boolean) => {
    const defects = rows.filter((row) => row.condition === label && (leaky === undefined || row.leaky === leaky)).flatMap((row) => row.defects);
    return `${defects.filter((defect) => defect.credited).length} / ${defects.length}`;
  };
  const notComparable = (label: string) => { const own = rows.filter((row) => row.condition === label); return `${own.filter((row) => !row.comparable).length} of ${own.length} sessions`; };
  const labels = [...new Set(rows.map((row) => row.condition))];
  return [
    `# Frontier comparison \`${id}\` (local, no model)`, "",
    `Code \`${sha}\`. Development fixtures only (none is held out). Funnel ${FUNNEL_VERSION}; scheduler ${SCHEDULER_VERSION}; rule table ${RULES_VERSION}.`, "",
    "## Which results are which", "",
    "- **Historical live trials 1–3** (real Mistral model): recorded in docs/experiments/ADAPTIVE_MISTRAL.md. Not re-run and not re-scored here.",
    "- **This run: new local scripted and scheduler sessions.** A-standin, hidden-standin and B-standin are driven by the scripted explorer (scripted-policy.ts), a stand-in for a model. It does not read the frontier and picks some links by text, so differences between these three come from harness accounting, not from model behaviour. D is the deterministic scheduler: no model calls, cost 0, interpretation by the rule table (a separate mechanism, an open design decision).",
    "- **Pending API comparisons** (A, B and C with real models): not run. They need owner approval of the dry-run plan in trials/frontier-benchmark.v1.json.", "",
    "## Credited defects (probe ran and evidence-backed report matched)", "",
    "Neutral = development variants with neutral names; leaky = legacy fixtures whose URLs or link text reveal the defect (models can read it, the scheduler does not). Not comparable = sessions that ended in an error, invalid output, denial limit or cancellation (timeouts and other budget ends are comparable).", "",
    ...labels.map((label) => `- ${label}: ${tally(label)} (neutral ${tally(label, false)}, leaky ${tally(label, true)}; not comparable ${notComparable(label)})`), "",
    "## Funnel per seeded defect", "",
    "Exploration columns: discovered, visible, selected, visited, probe ran. Interpretation columns: interpreted, reported. Unadjudicated findings are neither verified nor false positives.", "",
    ...renderFunnelTable(rows), "",
  ].join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
  const fixtures = flag("fixtures")?.split(",") as FrontierDevFixture[] | undefined;
  const result = await runLocalComparison({ ...(fixtures ? { fixtures } : {}), ...(flag("id") ? { id: flag("id")! } : {}) });
  console.log(result.markdown);
  console.log(`artifacts: ${result.dir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
