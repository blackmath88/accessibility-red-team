import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { scanUrl } from "./scan.js";
import { scoutSite } from "./scout/scout.js";
import { buildReport } from "./report/build.js";
import { buildPublicationExport } from "./report/publication.js";
import { buildIntegrityOnlyPublicationExport } from "./report/local-integrity.js";
import { buildApprovedLocalPublicationExport, prepareLocalReviewRequest, recordLocalApproval, REVIEW_NAMESPACE } from "./report/local-approval.js";
import { auditSite } from "./site/audit.js";
import { compareSiteReports } from "./watch/compare.js";
import { runCohort } from "./cohort/run.js";
import { mineCandidates } from "./learning/mine.js";
import { runSafeJourneys } from "./journeys/engine.js";
import { ExecutionPolicySchema } from "./control-center/contracts.js";
import { CohortSchema } from "./cohort/contracts.js";
import { ScanSummarySchema } from "./contracts.js";
import { createEmitter, jsonlFile, noopEmit, type Emit } from "./theatre/emit.js";

function usage(): never {
  console.error([
    "Usage:",
    "  npm run scan -- <url> [--out runs/<name>] [--no-events]",
    "  npm run scout -- <url> [--out runs/<name>/surface.json] [--max-pages 20] [--max-depth 2]",
    "  npm run report -- <run-dir> --profile requirements/profiles/ch.federal.yml",
    "  npm run publication:export -- <legacy-report.json> <candidate-set.json> --authority <trusted-authority.json> --out <publication-report.json>",
    "  npm run publication:export-local -- <legacy-report.json> <candidate-set.json> --bindings <local-evidence-bindings.json> --evidence-root <dir> --out <publication-report.json>",
    "  npm run publication:review-request -- <legacy-report.json> <candidate-set.json> --bindings <bindings.json> --evidence-root <dir> --candidate <id> --reviewer <principal> --note <text> --out <request.json>",
    "  npm run publication:review-record -- <request.json> <request.json.sig> --allowed-signers <allowed_signers> --approvals <approvals.jsonl>",
    "  npm run publication:export-approved -- <legacy-report.json> <candidate-set.json> --bindings <bindings.json> --evidence-root <dir> --allowed-signers <allowed_signers> --approvals <approvals.jsonl> --out <publication-report.json>",
    "  npm run audit -- <url> [--out runs/<name>] [--max-pages 20] [--max-depth 2] [--profile requirements/profiles/ch.federal.yml] [--journeys]",
    "  npm run journey -- <url> [--out runs/<name>]",
    "  npm run watch -- <previous-report.json> <current-report.json> [--out watch.json]",
    "  npm run cohort -- cohorts/zh-small-pilot.yml [--out runs/cohorts/zh-small-pilot]",
    "  (scan/scout/audit/cohort/watch with --out, and report, also write events.jsonl; --no-events disables)",
    "  npm run learn -- <cohort-summary.json> [--out candidates.json] [--min-municipalities 2] [--min-occurrences 3]",
  ].join("\n"));
  process.exit(2);
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function exactFlagValues(values: string[], expectedFlags: readonly string[]): Record<string, string> | undefined {
  if (values.length !== expectedFlags.length * 2) return undefined;
  const suppliedFlags = values.filter((_, index) => index % 2 === 0);
  if (suppliedFlags.some((flag) => !expectedFlags.includes(flag)) || new Set(suppliedFlags).size !== expectedFlags.length
    || values.some((value, index) => index % 2 === 1 && value.startsWith("--"))) return undefined;
  return Object.fromEntries(expectedFlags.map((flag) => [flag, values[values.indexOf(flag) + 1]!]));
}

const [command, ...args] = process.argv.slice(2);
if (!command) usage();

// Theatre events go to <dir>/events.jsonl whenever an output dir is given; --no-events disables.
function emitterFor(dir: string | undefined, run: string): Emit {
  if (!dir || args.includes("--no-events")) return noopEmit;
  return createEmitter({ run, sink: jsonlFile(join(dir, "events.jsonl")) });
}

function tracked<T>(emit: Emit, run: string, detail: string, work: () => Promise<T>, partial?: (result: T) => boolean): Promise<T> {
  const started = Date.now();
  const runEvent = (verdict: "start" | "end" | "partial", eventDetail: string) =>
    emit({ stage: "run", actor: "code", subject: { kind: "run", id: run }, verdict, detail: eventDetail, ...(verdict === "start" ? {} : { cost: { ms: Date.now() - started } }) });
  runEvent("start", detail);
  return work().then(
    (result) => { runEvent(partial?.(result) ? "partial" : "end", detail); return result; },
    (error) => { runEvent("partial", error instanceof Error ? error.message : String(error)); throw error; },
  );
}

if (command === "scan") {
  const url = args.find((arg) => !arg.startsWith("--"));
  if (!url) usage();
  const outDir = valueAfter(args, "--out")
    ? resolve(valueAfter(args, "--out")!)
    : resolve("runs", new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_"));

  const runId = randomUUID();
  const emit = emitterFor(valueAfter(args, "--out") && outDir, runId);
  tracked(emit, runId, `scan · ${url}`, () => scanUrl(url, outDir, { runId, emit })).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
} else if (command === "scout") {
  const url = args.find((arg) => !arg.startsWith("--"));
  if (!url) usage();
  const maxPages = Number(valueAfter(args, "--max-pages") ?? "20");
  const maxDepth = Number(valueAfter(args, "--max-depth") ?? "2");
  const out = valueAfter(args, "--out")
    ? resolve(valueAfter(args, "--out")!)
    : resolve("runs", new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_"), "surface.json");

  const emit = emitterFor(valueAfter(args, "--out") && dirname(out), basename(dirname(out)));
  tracked(emit, basename(dirname(out)), `scout · ${url}`, () => scoutSite(url, { maxPages, maxDepth, out, emit }))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else if (command === "report") {
  const runDir = args.find((arg) => !arg.startsWith("--"));
  const profilePath = valueAfter(args, "--profile");
  if (!runDir || !profilePath) usage();

  // report has no --out: it writes into <run-dir>, so events do too.
  const run = ScanSummarySchema.parse(JSON.parse(readFileSync(join(resolve(runDir), "summary.json"), "utf8"))).runId;
  const emit = emitterFor(resolve(runDir), run);
  tracked(emit, run, `report · ${basename(resolve(runDir))}`, () => buildReport({
    runDir: resolve(runDir),
    profilePath: resolve(profilePath),
    emit,
  }))
    .then((result) => console.log(JSON.stringify(result.summary, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else if (command === "publication-export") {
  const sourceReportPath = args[0];
  const candidatesPath = args[1];
  const flags = args.slice(2);
  if (flags.length !== 4 || ![flags[0], flags[2]].every((flag) => flag === "--authority" || flag === "--out")
    || flags[0] === flags[2] || flags[1]?.startsWith("--") || flags[3]?.startsWith("--")) usage();
  const authorityPath = flags[flags.indexOf("--authority") + 1];
  const outPath = flags[flags.indexOf("--out") + 1];
  if (!sourceReportPath || sourceReportPath.startsWith("--") || !candidatesPath || candidatesPath.startsWith("--") || !authorityPath || !outPath) usage();

  buildPublicationExport({
    sourceReportPath: resolve(sourceReportPath),
    candidatesPath: resolve(candidatesPath),
    authorityPath: resolve(authorityPath),
    outPath: resolve(outPath),
  })
    .then((result) => console.log(JSON.stringify(result.summary, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else if (command === "publication-export-local") {
  const sourceReportPath = args[0];
  const candidatesPath = args[1];
  const flags = args.slice(2);
  const expectedFlags = ["--bindings", "--evidence-root", "--out"];
  const suppliedFlags = flags.filter((_, index) => index % 2 === 0);
  if (flags.length !== 6 || suppliedFlags.some((flag) => !expectedFlags.includes(flag))
    || new Set(suppliedFlags).size !== expectedFlags.length || flags.some((value, index) => index % 2 === 1 && value.startsWith("--"))) usage();
  const bindingsPath = flags[flags.indexOf("--bindings") + 1];
  const evidenceRoot = flags[flags.indexOf("--evidence-root") + 1];
  const outPath = flags[flags.indexOf("--out") + 1];
  if (!sourceReportPath || sourceReportPath.startsWith("--") || !candidatesPath || candidatesPath.startsWith("--")
    || !bindingsPath || !evidenceRoot || !outPath) usage();

  buildIntegrityOnlyPublicationExport({
    sourceReportPath: resolve(sourceReportPath),
    candidatesPath: resolve(candidatesPath),
    bindingsPath: resolve(bindingsPath),
    evidenceRoot: resolve(evidenceRoot),
    outPath: resolve(outPath),
  })
    .then((result) => console.log(JSON.stringify({ ...result.export.summary, verifiedEvidenceRefs: result.verifiedEvidenceRefs.length,
      reviewerAuthority: "unavailable" }, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else if (command === "publication-review-request") {
  const sourceReportPath = args[0];
  const candidatesPath = args[1];
  const values = exactFlagValues(args.slice(2), ["--bindings", "--evidence-root", "--candidate", "--reviewer", "--note", "--out"]);
  if (!sourceReportPath || sourceReportPath.startsWith("--") || !candidatesPath || candidatesPath.startsWith("--") || !values) usage();
  prepareLocalReviewRequest({
    sourceReportPath: resolve(sourceReportPath), candidatesPath: resolve(candidatesPath),
    bindingsPath: resolve(values["--bindings"]!), evidenceRoot: resolve(values["--evidence-root"]!),
    candidateId: values["--candidate"]!, reviewerId: values["--reviewer"]!, note: values["--note"]!, outPath: resolve(values["--out"]!),
  }).then((result) => console.log(JSON.stringify({ ...result, request: undefined, signingNamespace: REVIEW_NAMESPACE }, null, 2)))
    .catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
} else if (command === "publication-review-record") {
  const requestPath = args[0];
  const signaturePath = args[1];
  const values = exactFlagValues(args.slice(2), ["--allowed-signers", "--approvals"]);
  if (!requestPath || requestPath.startsWith("--") || !signaturePath || signaturePath.startsWith("--") || !values) usage();
  recordLocalApproval({ requestPath: resolve(requestPath), signaturePath: resolve(signaturePath),
    allowedSignersPath: resolve(values["--allowed-signers"]!), approvalsPath: resolve(values["--approvals"]!) })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
} else if (command === "publication-export-approved") {
  const sourceReportPath = args[0];
  const candidatesPath = args[1];
  const values = exactFlagValues(args.slice(2), ["--bindings", "--evidence-root", "--allowed-signers", "--approvals", "--out"]);
  if (!sourceReportPath || sourceReportPath.startsWith("--") || !candidatesPath || candidatesPath.startsWith("--") || !values) usage();
  buildApprovedLocalPublicationExport({ sourceReportPath: resolve(sourceReportPath), candidatesPath: resolve(candidatesPath),
    bindingsPath: resolve(values["--bindings"]!), evidenceRoot: resolve(values["--evidence-root"]!),
    allowedSignersPath: resolve(values["--allowed-signers"]!), approvalsPath: resolve(values["--approvals"]!), outPath: resolve(values["--out"]!) })
    .then((result) => console.log(JSON.stringify({ ...result.export.summary, verifiedEvidenceRefs: result.verifiedEvidenceRefs,
      verifiedApprovals: result.verifiedApprovals }, null, 2)))
    .catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
} else if (command === "audit") {
  const url = args.find((arg) => !arg.startsWith("--"));
  if (!url) usage();
  const maxPages = Number(valueAfter(args, "--max-pages") ?? "20");
  const maxDepth = Number(valueAfter(args, "--max-depth") ?? "2");
  const outDir = valueAfter(args, "--out") ? resolve(valueAfter(args, "--out")!) : undefined;
  const profilePath = valueAfter(args, "--profile");

  const journeys = args.includes("--journeys");
  const executionPolicy = args.includes("--host-safe") ? ExecutionPolicySchema.parse({
    perHostConcurrency: 1,
    delayMs: Number(valueAfter(args, "--delay-ms") ?? "5000"),
    maxRetries: Number(valueAfter(args, "--max-retries") ?? "3"),
    baseBackoffMs: Number(valueAfter(args, "--base-backoff-ms") ?? "2000"),
    maxBackoffMs: Number(valueAfter(args, "--max-backoff-ms") ?? "60000"),
  }) : undefined;

  const run = basename(outDir ?? new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_"));
  const emit = emitterFor(outDir, run);
  tracked(emit, run, `audit · ${url}`, () => auditSite(url, { outDir, maxPages, maxDepth, profilePath, journeys, executionPolicy, emit }))
    .then((result) => console.log(JSON.stringify(result.manifest, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else if (command === "journey") {
  const url = args.find((arg) => !arg.startsWith("--"));
  if (!url) usage();
  const outDir = valueAfter(args, "--out")
    ? resolve(valueAfter(args, "--out")!)
    : resolve("runs", new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_"), "journey");

  runSafeJourneys(url, outDir)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else if (command === "watch") {
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const previousPath = positional[0];
  const currentPath = positional[1];
  if (!previousPath || !currentPath) usage();

  const outPath = valueAfter(args, "--out")
    ? resolve(valueAfter(args, "--out")!)
    : resolve("watch.json");

  const run = basename(dirname(outPath));
  const emit = emitterFor(valueAfter(args, "--out") && dirname(outPath), run);
  tracked(emit, run, `watch · ${basename(previousPath)} → ${basename(currentPath)}`, () => compareSiteReports({
    previousPath: resolve(previousPath),
    currentPath: resolve(currentPath),
    outPath,
    emit,
  }))
    .then((result) => console.log(JSON.stringify(result.summary, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else if (command === "cohort") {
  const cohortPath = args.find((arg) => !arg.startsWith("--"));
  if (!cohortPath) usage();
  const outDir = valueAfter(args, "--out");

  const cohort = CohortSchema.parse(YAML.parse(readFileSync(resolve(cohortPath), "utf8")));
  const emit = emitterFor(outDir && resolve(outDir), cohort.id);
  tracked(emit, cohort.id, `${cohort.id} · profile ${basename(cohort.profile)} · ${cohort.sites.length} sites`, () => runCohort({
    cohortPath: resolve(cohortPath),
    outDir: outDir ? resolve(outDir) : undefined,
    emit,
  }), (result) => result.sites.some((site) => site.status === "ERROR"))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else if (command === "learn") {
  const summaryPath = args.find((arg) => !arg.startsWith("--"));
  if (!summaryPath) usage();

  const outPath = valueAfter(args, "--out")
    ? resolve(valueAfter(args, "--out")!)
    : resolve("candidates.json");
  const minMunicipalities = Number(valueAfter(args, "--min-municipalities") ?? "2");
  const minOccurrences = Number(valueAfter(args, "--min-occurrences") ?? "3");

  mineCandidates({
    cohortSummaryPath: resolve(summaryPath),
    outPath,
    minMunicipalities,
    minOccurrences,
  })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else {
  usage();
}
