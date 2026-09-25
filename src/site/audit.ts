import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { scoutSite } from "../scout/scout.js";
import { scanUrl } from "../scan.js";
import { triageSurfaceRuns } from "../triage/triage.js";

export async function auditSite(input: string, options: {
  outDir?: string;
  maxPages?: number;
  maxDepth?: number;
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

  const runs = [];
  for (const selected of surface.surfaces) {
    const runDir = join(outDir, "surfaces", selected.surfaceId);
    await scanUrl(selected.url, runDir);
    runs.push({
      surfaceId: selected.surfaceId,
      url: selected.url,
      runDir,
    });
  }

  const triage = await triageSurfaceRuns(runs, join(outDir, "findings.json"));

  const manifest = {
    schema: "art/site-audit-manifest/v1",
    generatedAt: new Date().toISOString(),
    entrypoint: surface.entrypoint,
    finalEntrypoint: surface.finalEntrypoint,
    selectedSurfaces: surface.surfaces.length,
    findings: triage.findings.length,
    aiCalls: 0,
    artifacts: {
      surface: "surface.json",
      findings: "findings.json",
      surfaceRuns: runs.map((run) => ({
        surfaceId: run.surfaceId,
        path: `surfaces/${run.surfaceId}`,
      })),
    },
  };

  await writeFile(join(outDir, "audit-manifest.json"), JSON.stringify(manifest, null, 2));
  return { surface, triage, manifest };
}
