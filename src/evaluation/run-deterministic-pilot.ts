import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Browser } from "playwright";
import YAML from "yaml";
import { z } from "zod";
import { auditSite } from "../site/audit.js";
import { validatePublicTarget } from "../scope.js";

const execFileAsync = promisify(execFile);
const VIEWPORT = { width: 1440, height: 900 };

const CohortSchema = z.object({
  schema: z.literal("art/deterministic-evaluation-cohort/v1"),
  id: z.string().min(1),
  as_of: z.string().min(1),
  purpose: z.string().min(1),
  profile: z.string().min(1),
  settings: z.object({
    max_pages: z.number().int().positive().max(20),
    max_depth: z.number().int().nonnegative().max(3),
    max_surfaces: z.number().int().positive().max(5),
    journeys: z.literal(true),
    concurrency: z.number().int().min(1).max(2),
    delay_ms: z.number().int().min(1000).max(60_000),
  }),
  sites: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    url: z.string().url(),
  })).min(1).max(10),
});

type Cohort = z.infer<typeof CohortSchema>;
type Site = Cohort["sites"][number];

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function packageVersion(name: string): Promise<string> {
  const raw = JSON.parse(await readFile(resolve("node_modules", name, "package.json"), "utf8")) as { version: string };
  return raw.version;
}

async function repositoryMetadata(runnerPath: string) {
  const [{ stdout: gitSha }, { stdout: gitStatus }, { stdout: npmVersion }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"]),
    execFileAsync("git", ["status", "--porcelain"]),
    execFileAsync("npm", ["--version"]),
  ]);
  const runner = await readFile(runnerPath, "utf8");
  return {
    gitSha: gitSha.trim(),
    gitDirty: gitStatus.trim().length > 0,
    gitStatus: gitStatus.trim().split("\n").filter(Boolean),
    runnerSha256: sha256(runner),
    node: process.version,
    npm: npmVersion.trim(),
    engines: {
      playwright: await packageVersion("playwright"),
      axePlaywright: await packageVersion("@axe-core/playwright"),
      axeCore: await packageVersion("axe-core"),
    },
    aiCalls: 0,
  };
}

async function runBaseline(browser: Browser, site: Site, outDir: string) {
  await mkdir(outDir, { recursive: true });
  const requested = await validatePublicTarget(site.url);
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: "AccessibilityRedTeamEvaluation/0.1 (+public accessibility research)",
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(requested.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!response) throw new Error("Navigation returned no HTTP response");
    if (response.status() >= 400) throw new Error(`Target returned HTTP ${response.status()}`);
    await page.waitForTimeout(750);
    const finalUrl = await validatePublicTarget(page.url());
    if (finalUrl.hostname !== requested.hostname) {
      throw new Error(`Cross-host redirect blocked: ${requested.hostname} → ${finalUrl.hostname}`);
    }
    const results = await new AxeBuilder({ page }).analyze();
    await page.screenshot({ path: join(outDir, "page.png"), fullPage: true });
    const metadata = {
      schema: "art/baseline-axe-run/v1",
      siteId: site.id,
      requestedUrl: requested.toString(),
      finalUrl: finalUrl.toString(),
      retrievedAt: new Date().toISOString(),
      viewport: VIEWPORT,
      counts: {
        violations: results.violations.length,
        incomplete: results.incomplete.length,
        passes: results.passes.length,
        inapplicable: results.inapplicable.length,
        affectedNodes: results.violations.reduce((sum, rule) => sum + rule.nodes.length, 0),
      },
      artifacts: ["axe-results.json", "page.png"],
      aiCalls: 0,
    };
    await Promise.all([
      writeFile(join(outDir, "axe-results.json"), JSON.stringify(results, null, 2)),
      writeFile(join(outDir, "metadata.json"), JSON.stringify(metadata, null, 2)),
    ]);
    return metadata;
  } finally {
    await context.close();
  }
}

async function runSite(browser: Browser, cohort: Cohort, site: Site, outDir: string) {
  const siteDir = join(outDir, "sites", site.id);
  await mkdir(siteDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const errors: Array<{ arm: "baseline_axe" | "deterministic_observatory"; message: string }> = [];
  let baseline: Awaited<ReturnType<typeof runBaseline>> | null = null;
  let observatory: Awaited<ReturnType<typeof auditSite>> | null = null;

  try {
    baseline = await runBaseline(browser, site, join(siteDir, "baseline-axe"));
  } catch (error) {
    errors.push({ arm: "baseline_axe", message: error instanceof Error ? error.message : String(error) });
  }

  try {
    observatory = await auditSite(site.url, {
      outDir: join(siteDir, "deterministic-observatory"),
      maxPages: cohort.settings.max_pages,
      maxDepth: cohort.settings.max_depth,
      maxSurfaces: cohort.settings.max_surfaces,
      journeys: true,
      profilePath: resolve(cohort.profile),
    });
  } catch (error) {
    errors.push({ arm: "deterministic_observatory", message: error instanceof Error ? error.message : String(error) });
  }

  const summary = {
    schema: "art/deterministic-site-evaluation/v1",
    site,
    startedAt,
    completedAt: new Date().toISOString(),
    status: errors.length === 0 ? "PASS" : baseline || observatory ? "PARTIAL" : "ERROR",
    baseline: baseline ? { ...baseline.counts, path: "baseline-axe" } : null,
    observatory: observatory ? {
      selectedSurfaces: observatory.manifest.selectedSurfaces,
      staticFindings: observatory.triage.findings.length,
      affectedNodes: observatory.triage.findings.reduce((sum, finding) => sum + finding.occurrenceCount, 0),
      behavioralResults: observatory.journeyRuns.reduce((sum, run) => sum + run.results.length, 0),
      path: "deterministic-observatory",
      aiCalls: 0,
    } : null,
    errors,
    aiCalls: 0,
  };
  await writeFile(join(siteDir, "evaluation-summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  const cohortPath = resolve(valueAfter(args, "--cohort") ?? "evaluation/cohorts/nebuchadnezzar-deterministic-v1.yml");
  const outDir = resolve(valueAfter(args, "--out") ?? join("evaluation", "runs", `deterministic-pilot-${timestamp()}`));
  const cohort = CohortSchema.parse(YAML.parse(await readFile(cohortPath, "utf8")));
  await mkdir(dirname(outDir), { recursive: true });
  await mkdir(outDir, { recursive: false });

  const runnerPath = fileURLToPath(import.meta.url);
  const metadata = {
    schema: "art/deterministic-pilot-run/v1",
    cohortId: cohort.id,
    cohortPath,
    outputPath: outDir,
    startedAt: new Date().toISOString(),
    settings: cohort.settings,
    host: process.env.HOSTNAME ?? null,
    ...(await repositoryMetadata(runnerPath)),
  };
  await writeFile(join(outDir, "run-metadata.json"), JSON.stringify(metadata, null, 2));

  const browser = await chromium.launch({ headless: true });
  const summaries: Awaited<ReturnType<typeof runSite>>[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: cohort.settings.concurrency }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      const site = cohort.sites[index];
      if (!site) return;
      if (index > 0) await new Promise((done) => setTimeout(done, cohort.settings.delay_ms));
      summaries[index] = await runSite(browser, cohort, site, outDir);
    }
  });
  try {
    await Promise.all(workers);
  } finally {
    await browser.close();
  }

  const cohortSummary = {
    schema: "art/deterministic-cohort-evaluation/v1",
    cohortId: cohort.id,
    startedAt: metadata.startedAt,
    completedAt: new Date().toISOString(),
    gitSha: metadata.gitSha,
    runnerSha256: metadata.runnerSha256,
    engines: metadata.engines,
    aiCalls: 0,
    counts: {
      sites: summaries.length,
      passed: summaries.filter((site) => site.status === "PASS").length,
      partial: summaries.filter((site) => site.status === "PARTIAL").length,
      failed: summaries.filter((site) => site.status === "ERROR").length,
    },
    sites: summaries,
  };
  await writeFile(join(outDir, "cohort-summary.json"), JSON.stringify(cohortSummary, null, 2));
  console.log(JSON.stringify({ outputPath: outDir, counts: cohortSummary.counts }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
