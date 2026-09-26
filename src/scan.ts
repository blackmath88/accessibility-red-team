import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import type { Result as AxeRuleResult } from "axe-core";
import { chromium, type Browser, type Page } from "playwright";

import {
  ProbeResultSchema,
  ScanSummarySchema,
  SurfaceSnapshotSchema,
  type ProbeResult,
} from "./contracts.js";
import { validatePublicTarget } from "./scope.js";
import { buildCoverageManifest } from "./capability.js";
import { requirementsFromAxeTags } from "./wcag.js";

const VIEWPORT = { width: 1440, height: 900 };

function impact(value: string | null | undefined) {
  if (value === "minor" || value === "moderate" || value === "serious" || value === "critical") {
    return value;
  }
  return "unknown" as const;
}

function normalizeTarget(target: AxeRuleResult["nodes"][number]["target"]): string[] {
  return target.map((part) => Array.isArray(part) ? part.join(" >>iframe>> ") : String(part));
}

function normalizeRule(
  rule: AxeRuleResult,
  outcome: "violation" | "incomplete" | "pass" | "inapplicable",
  surfaceId: string,
): ProbeResult {
  return ProbeResultSchema.parse({
    schema: "art/probe-result/v1",
    probeId: `axe.${rule.id}`,
    probeVersion: "axe-core/4.13",
    surfaceId,
    stateId: "initial",
    outcome,
    impact: impact(rule.impact),
    help: rule.help,
    helpUrl: rule.helpUrl,
    tags: rule.tags,
    requirements: requirementsFromAxeTags(rule.tags),
    nodes: rule.nodes.map((node) => ({
      target: normalizeTarget(node.target),
      html: node.html,
      failureSummary: node.failureSummary ?? null,
    })),
  });
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(750);
}

export async function scanUrl(
  input: string,
  outDir: string,
  options: { browser?: Browser } = {},
): Promise<void> {
  const target = await validatePublicTarget(input);
  const runId = randomUUID();
  const surfaceId = "surface_root";

  await mkdir(outDir, { recursive: true });

  const ownsBrowser = !options.browser;
  const browser = options.browser ?? await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: "AccessibilityRedTeam/0.1 (+public accessibility research)",
    });
    const page = await context.newPage();

    const response = await page.goto(target.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    if (!response) throw new Error("Navigation returned no HTTP response.");
    if (response.status() >= 400) throw new Error(`Target returned HTTP ${response.status()}.`);

    await settle(page);

    const finalTarget = await validatePublicTarget(page.url());
    if (finalTarget.hostname !== target.hostname) {
      throw new Error(`Cross-host redirect blocked: ${target.hostname} → ${finalTarget.hostname}`);
    }

    const html = await page.content();
    const screenshotName = "page.png";
    await page.screenshot({ path: join(outDir, screenshotName), fullPage: true });

    const snapshot = SurfaceSnapshotSchema.parse({
      schema: "art/surface-snapshot/v1",
      runId,
      surfaceId,
      stateId: "initial",
      requestedUrl: target.toString(),
      finalUrl: finalTarget.toString(),
      title: await page.title(),
      language: await page.locator("html").getAttribute("lang"),
      retrievedAt: new Date().toISOString(),
      contentSha256: createHash("sha256").update(html).digest("hex"),
      htmlBytes: Buffer.byteLength(html, "utf8"),
      viewport: VIEWPORT,
      screenshot: screenshotName,
    });

    const axe = await new AxeBuilder({ page }).analyze();

    const results: ProbeResult[] = [
      ...axe.violations.map((r) => normalizeRule(r, "violation", surfaceId)),
      ...axe.incomplete.map((r) => normalizeRule(r, "incomplete", surfaceId)),
      ...axe.passes.map((r) => normalizeRule(r, "pass", surfaceId)),
      ...axe.inapplicable.map((r) => normalizeRule(r, "inapplicable", surfaceId)),
    ];

    const criteria = Array.from(
      new Set(results.flatMap((r) => r.requirements.map((req) => req.criterion))),
    ).sort();

    const summary = ScanSummarySchema.parse({
      schema: "art/scan-summary/v1",
      runId,
      requestedUrl: target.toString(),
      finalUrl: finalTarget.toString(),
      counts: {
        violations: axe.violations.length,
        incomplete: axe.incomplete.length,
        passes: axe.passes.length,
        inapplicable: axe.inapplicable.length,
      },
      wcagCriteriaObserved: criteria,
    });

    const coverage = buildCoverageManifest();

    const manifest = {
      schema: "art/run-manifest/v1",
      runId,
      createdAt: new Date().toISOString(),
      scanner: {
        name: "accessibility-red-team",
        version: "0.1.0",
      },
      engines: {
        playwright: "1.63.0",
        axePlaywright: "4.13.0",
        axeCore: "4.13.0",
      },
      profile: null,
      aiCalls: 0,
      artifacts: ["snapshot.json", "probe-results.json", "summary.json", "coverage.json", screenshotName],
    };

    await Promise.all([
      writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2)),
      writeFile(join(outDir, "snapshot.json"), JSON.stringify(snapshot, null, 2)),
      writeFile(join(outDir, "probe-results.json"), JSON.stringify(results, null, 2)),
      writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2)),
      writeFile(join(outDir, "coverage.json"), JSON.stringify(coverage, null, 2)),
    ]);

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (ownsBrowser) await browser.close();
  }
}
