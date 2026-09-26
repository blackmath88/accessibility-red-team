import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { scoutSite } from "../scout/scout.js";
import { scanUrl } from "../scan.js";
import { triageSurfaceRuns } from "../triage/triage.js";
import { buildSiteReport } from "../report/site.js";
import { runSafeJourneys } from "../journeys/engine.js";

export async function auditSite(input: string, options: {
  outDir?: string;
  maxPages?: number;
  maxDepth?: number;
  profilePath?: string;
  maxSurfaces?: number;
  journeys?: boolean;
} = {}) {
  const host = new URL(input).hostname.replace(/[^a-z0-9.-]/gi, "_");
  const outDir = resolve(options.outDir ?? join("runs", host));
  await mkdir(outDir, { recursive: true });

  const surfacePath = join(outDir, "surface.json");
  const surface = await scoutSite(input, {
    maxPages: options.maxPages ?? 20,
    maxDepth: options.maxDepth ?? 2,
    out: surfacePath,
  });

  const selectedSurfaces = surface.surfaces.slice(0, options.maxSurfaces ?? surface.surfaces.length);
  const runs = [];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const selected of selectedSurfaces) {
      const runDir = join(outDir, "surfaces", selected.surfaceId);
      await scanUrl(selected.url, runDir, { browser });
      if (options.journeys) {
        await runSafeJourneys(selected.url, runDir, {
          browser,
          surfaceId: selected.surfaceId,
        });
      }
      runs.push({
        surfaceId: selected.surfaceId,
        url: selected.url,
        runDir,
      });
    }
  } finally {
    await browser.close();
  }

  const triage = await triageSurfaceRuns(runs, join(outDir, "findings.json"));

  const manifest = {
    schema: "art/site-audit-manifest/v1",
    generatedAt: new Date().toISOString(),
    entrypoint: surface.entrypoint,
    finalEntrypoint: surface.finalEntrypoint,
    selectedSurfaces: runs.length,
    findings: triage.findings.length,
    aiCalls: 0,
    artifacts: {
      surface: "surface.json",
      findings: "findings.json",
      surfaceRuns: runs.map((run) => ({
        surfaceId: run.surfaceId,
        path: `surfaces/${run.surfaceId}`,
        journeys: options.journeys ? "journey-results.json" : null,
      })),
    },
  };

  await writeFile(join(outDir, "audit-manifest.json"), JSON.stringify(manifest, null, 2));

  const report = options.profilePath
    ? await buildSiteReport({
        auditDir: outDir,
        profilePath: resolve(options.profilePath),
      })
    : null;

  return { surface, triage, manifest, report };
}
