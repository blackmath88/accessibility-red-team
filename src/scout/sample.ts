import type { DiscoveredPage } from "./contracts.js";

const PRIORITY = ["home", "form", "search", "directory", "service", "article", "unknown"] as const;

export function selectRepresentativeSurfaces(pages: DiscoveredPage[], maxPerKind = 2): DiscoveredPage[] {
  const selected: DiscoveredPage[] = [];
  const seenFingerprints = new Set<string>();

  for (const kind of PRIORITY) {
    const candidates = pages
      .filter((p) => p.kind === kind)
      .sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        if (a.internalLinks !== b.internalLinks) return b.internalLinks - a.internalLinks;
        return a.url.localeCompare(b.url);
      });

    let taken = 0;
    for (const page of candidates) {
      if (taken >= maxPerKind) break;
      if (seenFingerprints.has(`${kind}:${page.structuralFingerprint}`)) continue;
      seenFingerprints.add(`${kind}:${page.structuralFingerprint}`);
      selected.push(page);
      taken += 1;
    }
  }

  return selected;
}
