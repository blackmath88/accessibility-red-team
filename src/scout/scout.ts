import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { AccessibilitySurfaceSchema, type DiscoveredPage } from "./contracts.js";
import { inspectPage } from "./classify.js";
import { candidateScore, eligibleInternalLink, normalizeUrl } from "./links.js";
import { selectRepresentativeSurfaces } from "./sample.js";
import { discoverSeedUrls } from "./seeds.js";
import { validatePublicTarget } from "../scope.js";

export type ScoutOptions = {
  maxPages?: number;
  maxDepth?: number;
  out?: string;
};

type QueueItem = { url: string; depth: number; score: number; order: number };

export async function scoutSite(input: string, options: ScoutOptions = {}) {
  const start = await validatePublicTarget(input);
  const maxPages = options.maxPages ?? 20;
  const maxDepth = options.maxDepth ?? 2;
  const out = options.out ?? resolve("runs", start.hostname, "surface.json");

  const browser = await chromium.launch({ headless: true });
  const discovered: DiscoveredPage[] = [];
  const seen = new Set<string>();
  const queued = new Set<string>();
  const queue: QueueItem[] = [{ url: normalizeUrl(start.toString()), depth: 0, score: 1000, order: 0 }];
  queued.add(queue[0]!.url);
  let order = 1;

  const seedDiscovery = await discoverSeedUrls(start, Math.max(maxPages * 8, 50));
  for (const seed of seedDiscovery.seeds) {
    if (queued.has(seed.url)) continue;
    queued.add(seed.url);
    queue.push({
      url: seed.url,
      depth: 1,
      score: seed.score,
      order: order++,
    });
  }
  let finalEntrypoint = start.toString();

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: "AccessibilityRedTeam/0.1 (+public accessibility research)",
    });

    while (queue.length && discovered.length < maxPages) {
      queue.sort((a, b) => b.score - a.score || a.depth - b.depth || a.order - b.order);
      const next = queue.shift()!;
      if (seen.has(next.url) || next.depth > maxDepth) continue;
      seen.add(next.url);

      const page = await context.newPage();
      try {
        const response = await page.goto(next.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
        if (!response || response.status() >= 400) continue;
        await page.waitForTimeout(250);

        const finalUrl = normalizeUrl(page.url());
        const validated = await validatePublicTarget(finalUrl);
        if (validated.hostname !== start.hostname) continue;
        if (next.depth === 0) finalEntrypoint = finalUrl;

        const inspected = await inspectPage(page, finalUrl);
        discovered.push({
          url: finalUrl,
          title: inspected.title,
          kind: inspected.kind,
          reason: inspected.reason,
          depth: next.depth,
          structuralFingerprint: inspected.structuralFingerprint,
          hasForm: inspected.hasForm,
          pdfLinks: inspected.pdfLinks,
          internalLinks: inspected.internalLinks,
        });

        if (next.depth < maxDepth) {
          const links = await page.locator("a[href]").evaluateAll((anchors) =>
            anchors.map((a) => ({
              href: (a as HTMLAnchorElement).href,
              label: (a.textContent ?? "").trim().slice(0, 160),
            })),
          );

          for (const link of links) {
            if (!eligibleInternalLink(link.href, start)) continue;
            const url = normalizeUrl(link.href);
            if (seen.has(url) || queued.has(url)) continue;
            queued.add(url);
            queue.push({
              url,
              depth: next.depth + 1,
              score: candidateScore(url, link.label),
              order: order++,
            });
          }
        }
      } catch {
        // Discovery is best-effort; an individual broken page must not abort the site.
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  const strategy = {
    mode: discovered[0]?.internalLinks && discovered[0].internalLinks <= 80 ? "broad" as const : "targeted" as const,
    maxPages,
    maxDepth,
    reason: discovered[0]?.internalLinks && discovered[0].internalLinks <= 80
      ? `Small/shallow entrypoint: broad bounded discovery with ${seedDiscovery.seeds.length} sitemap seeds available.`
      : `Larger entrypoint: priority queue favors service and interactive surfaces; ${seedDiscovery.seeds.length} sitemap seeds available.`,
  };

  const representatives = selectRepresentativeSurfaces(discovered);
  const result = AccessibilitySurfaceSchema.parse({
    schema: "art/accessibility-surface/v1",
    entrypoint: start.toString(),
    finalEntrypoint,
    discoveredAt: new Date().toISOString(),
    strategy,
    discoveredPages: discovered.length,
    surfaces: representatives.map((page, index) => ({
      ...page,
      surfaceId: `surface_${String(index + 1).padStart(2, "0")}`,
      selectionReason: `representative ${page.kind} surface; unique structural fingerprint within selected sample`,
    })),
  });

  await mkdir(resolve(out, ".."), { recursive: true });
  await writeFile(out, JSON.stringify(result, null, 2));
  return result;
}
