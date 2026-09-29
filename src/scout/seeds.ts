import { validatePublicTarget } from "../scope.js";
import { candidateScore, eligibleInternalLink, normalizeUrl } from "./links.js";
import { backoffDecision } from "../control-center/execution-policy.js";
import type { ExecutionPolicy } from "../control-center/contracts.js";
import type { NetworkPolicyEvent } from "../network-policy.js";

const MAX_TEXT_BYTES = 2 * 1024 * 1024;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: URL, policy?: ExecutionPolicy, events: NetworkPolicyEvent[] = []): Promise<{ url: string; text: string } | null> {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      if (policy) await wait(policy.delayMs);
      const response = await fetch(url, { headers: { "user-agent": "AccessibilityRedTeam/0.1 (+public accessibility research)" }, redirect: "follow", signal: controller.signal });
      if (policy) {
        const decision = backoffDecision(response.status, response.headers.get("retry-after"), attempt, policy);
        if (response.status === 429 || response.status === 503) events.push({ url: url.toString(), status: response.status, attempt, decision: decision.reason, delayMs: decision.delayMs, at: new Date().toISOString() });
        if (decision.retry) { await response.body?.cancel(); await wait(decision.delayMs); continue; }
      }
      if (!response.ok) return null;

      const finalUrl = await validatePublicTarget(response.url); if (finalUrl.hostname !== url.hostname) return null;

      const text = await response.text(); if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) return null;
      return { url: finalUrl.toString(), text };
    } catch { return null; } finally { clearTimeout(timer); }
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

export async function discoverSeedUrls(root: URL, maxSeeds = 200, policy?: ExecutionPolicy, events: NetworkPolicyEvent[] = []): Promise<{
  seeds: Array<{ url: string; score: number; source: "robots" | "sitemap" }>;
  sitemapUrls: string[];
}> {
  const robots = await fetchText(new URL("/robots.txt", root), policy, events);
  const advertised = robots ? parseRobotsSitemaps(robots.text) : [];

  const pending = Array.from(new Set([
    ...advertised,
    new URL("/sitemap.xml", root).toString(),
    new URL("/sitemap_index.xml", root).toString(),
  ].filter((url) => eligibleInternalLink(url, root))));

  const found = new Map<string, { url: string; score: number; source: "robots" | "sitemap" }>();
  const visitedSitemaps = new Set<string>();

  while (pending.length && visitedSitemaps.size < 12 && found.size < maxSeeds) {
    const candidate = normalizeUrl(pending.shift()!);
    if (visitedSitemaps.has(candidate)) continue;
    visitedSitemaps.add(candidate);

    const sitemap = await fetchText(new URL(candidate), policy, events);
    if (!sitemap) continue;

    for (const raw of parseSitemapLocations(sitemap.text)) {
      if (!eligibleInternalLink(raw, root)) continue;
      const normalized = normalizeUrl(raw);

      if (/\.xml(?:$|\?)/i.test(normalized)) {
        if (!visitedSitemaps.has(normalized) && !pending.includes(normalized)) pending.push(normalized);
        continue;
      }
      if (/\.pdf(?:$|\?)/i.test(normalized)) continue;
      if (found.size >= maxSeeds) break;

      found.set(normalized, {
        url: normalized,
        score: candidateScore(normalized, "") + 3,
        source: advertised.includes(candidate) ? "robots" : "sitemap",
      });
    }
  }

  return { seeds: Array.from(found.values()), sitemapUrls: Array.from(visitedSitemaps) };
}
