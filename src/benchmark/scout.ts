import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { scoutSite } from "../scout/scout.js";

const CorpusSchema = z.object({
  schema: z.literal("art/scout-corpus/v1"),
  as_of: z.string(),
  sites: z.array(z.object({
    id: z.string(),
    name: z.string(),
    url: z.string().url(),
    shape: z.string(),
    rationale: z.string(),
    expectations: z.object({
      min_discovered_pages: z.number().int().nonnegative(),
      should_include_kinds: z.array(z.string()),
    }),
  })),
});

export async function runScoutCorpus(options: {
  corpusPath?: string;
  outDir?: string;
  maxPages?: number;
  maxDepth?: number;
} = {}) {
  const corpusPath = resolve(options.corpusPath ?? "benchmarks/sites.yml");
  const outDir = resolve(options.outDir ?? "runs/benchmark-scout");
  const corpus = CorpusSchema.parse(YAML.parse(await readFile(corpusPath, "utf8")));
  await mkdir(outDir, { recursive: true });

  const results = [];
  for (const site of corpus.sites) {
    const siteOut = join(outDir, site.id + ".json");
    try {
      const result = await scoutSite(site.url, {
        maxPages: options.maxPages ?? 12,
        maxDepth: options.maxDepth ?? 2,
        out: siteOut,
      });
      const kinds = new Set(result.surfaces.map((surface) => surface.kind));
      const checks = {
        minDiscoveredPages: result.discoveredPages >= site.expectations.min_discovered_pages,
        expectedKinds: site.expectations.should_include_kinds.every((kind) => kinds.has(kind as never)),
      };
      results.push({
        id: site.id,
        name: site.name,
        status: checks.minDiscoveredPages && checks.expectedKinds ? "PASS" : "REVIEW",
        discoveredPages: result.discoveredPages,
        selectedSurfaces: result.surfaces.length,
        kinds: Array.from(kinds),
        strategy: result.strategy.mode,
        checks,
      });
    } catch (error) {
      results.push({
        id: site.id,
        name: site.name,
        status: "ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = {
    schema: "art/scout-corpus-result/v1",
    generatedAt: new Date().toISOString(),
    corpusAsOf: corpus.as_of,
    aiCalls: 0,
    results,
  };
  await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}
