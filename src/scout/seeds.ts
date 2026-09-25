import { validatePublicTarget } from "../scope.js";
import { candidateScore, eligibleInternalLink, normalizeUrl } from "./links.js";

const MAX_TEXT_BYTES = 2 * 1024 * 1024;

async function fetchText(url: URL): Promise<{ url: string; text: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "AccessibilityRedTeam/0.1 (+public accessibility research)" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const finalUrl = await validatePublicTarget(response.url);
    if (finalUrl.hostname !== url.hostname) return null;

    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) return null;
    return { url: finalUrl.toString(), text };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function parseRobotsSitemaps(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*Sitemap\s*:\s*(\S+)\s*$/i)?.[1])
    .filter((value): value is string => Boolean(value));
}

export function parseSitemapLocations(xml: string): string[] {
  const locations: string[] = [];
  const regex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  for (const match of xml.matchAll(regex)) {
    if (match[1]) locations.push(match[1].replace(/&amp;/g, "&").trim());
  }
  return locations;
}

export async function discoverSeedUrls(root: URL, maxSeeds = 200): Promise<{
  seeds: Array<{ url: string; score: number; source: "robots" | "sitemap" }>;
  sitemapUrls: string[];
}> {
  const robotsUrl = new URL("/robots.txt", root);
  const robots = await fetchText(robotsUrl);

  const advertised = robots ? parseRobotsSitemaps(robots.text) : [];
  const sitemapCandidates = [
    ...advertised,
    new URL("/sitemap.xml", root).toString(),
    new URL("/sitemap_index.xml", root).toString(),
  ];

  const sitemapUrls = Array.from(new Set(sitemapCandidates))
    .filter((url) => eligibleInternalLink(url, root));

  const found = new Map<string, { url: string; score: number; source: "robots" | "sitemap" }>();
  const visitedSitemaps = new Set<string>();

  for (const candidate of sitemapUrls.slice(0, 10)) {
    const normalizedCandidate = normalizeUrl(candidate);
    if (visitedSitemaps.has(normalizedCandidate)) continue;
    visitedSitemaps.add(normalizedCandidate);

    const sitemap = await fetchText(new URL(normalizedCandidate));
    if (!sitemap) continue;

    for (const raw of parseSitemapLocations(sitemap.text)) {
      if (found.size >= maxSeeds) break;
      if (!eligibleInternalLink(raw, root)) continue;

      const normalized = normalizeUrl(raw);
      if (/\.xml(?:$|\?)/i.test(normalized)) {
        if (!visitedSitemaps.has(normalized) && visitedSitemaps.size < 10) {
          sitemapUrls.push(normalized);
        }
        continue;
      }
      if (/\.pdf(?:$|\?)/i.test(normalized)) continue;

      found.set(normalized, {
        url: normalized,
        score: candidateScore(normalized, "") + 3,
        source: advertised.includes(candidate) ? "robots" : "sitemap",
      });
    }
  }

  return { seeds: Array.from(found.values()), sitemapUrls: Array.from(visitedSitemaps) };
}
