import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { z } from "zod";

// Deterministic census of what frozen evidence leaves unresolved. It reads existing run directories only:
// no network, no browser, no model. Its output is the measured basis for deciding whether any bounded
// semantic (Morrow) task is justified — see docs/MORROW_EXECUTION_ARCHITECTURE.md and ADR-0012.

export const CENSUS_VERSION = "1.0.0";

// Which kind of judgement would resolve an axe "incomplete" (needs review) result. Provisional and
// deliberately small: anything not listed is reported as `unclassified` rather than guessed.
export const Modality = z.enum([
  "visual_rendering", // needs rendered pixels (contrast over images/gradients, overlap); a text model cannot decide
  "media_content", // needs audio/video content
  "tooling_limit", // the engine could not inspect (e.g. cross-origin frame); fix the tooling, not the judgement
  "behavioral_state", // needs interaction/focus behaviour; belongs to deterministic journeys
  "text_semantic", // decidable in principle from DOM text/structure — the only candidates for a text model
  "unclassified",
]);
export type Modality = z.infer<typeof Modality>;

export const AXE_INCOMPLETE_MODALITY: Readonly<Record<string, Modality>> = {
  "color-contrast": "visual_rendering",
  "color-contrast-enhanced": "visual_rendering",
  "link-in-text-block": "visual_rendering",
  "target-size": "visual_rendering",
  "css-orientation-lock": "visual_rendering",
  "video-caption": "media_content",
  "audio-caption": "media_content",
  "no-autoplay-audio": "media_content",
  "frame-tested": "tooling_limit",
  "aria-hidden-focus": "behavioral_state",
  "scrollable-region-focusable": "behavioral_state",
  "nested-interactive": "behavioral_state",
  "label-content-name-mismatch": "text_semantic",
  "identical-links-same-purpose": "text_semantic",
  "p-as-heading": "text_semantic",
  "th-has-data-cells": "text_semantic",
  "td-headers-attr": "text_semantic",
  "table-duplicate-name": "text_semantic",
  "empty-heading": "text_semantic",
  "aria-allowed-role": "text_semantic",
};

// Re-entry gate for an offline Morrow experiment (ADR-0012). All must hold for one text_semantic rule.
export const REENTRY_GATE = { minNodeShareOfUnresolved: 0.2, minSites: 3 } as const;

type Source = "baseline_axe" | "observatory_probe";
type RuleCount = { results: number; nodes: number; sites: Set<string> };

const ProbeFile = z.array(z.object({ probeId: z.string(), outcome: z.string(), nodes: z.array(z.unknown()) }).passthrough());
const AxeFile = z.object({ incomplete: z.array(z.object({ id: z.string(), nodes: z.array(z.unknown()) }).passthrough()) }).passthrough();
const JourneyFile = z.object({ results: z.array(z.object({ journeyId: z.string(), outcome: z.string(), summary: z.string() }).passthrough()) }).passthrough();
const SurfaceFile = z.object({ schema: z.literal("art/accessibility-surface/v1"), surfaces: z.array(z.object({ kind: z.string() }).passthrough()) }).passthrough();

export type EvidenceFile = { path: string; json: unknown };

export function siteOf(path: string): string {
  const parts = path.split(/[\\/]/);
  const i = parts.indexOf("sites");
  return i >= 0 && parts[i + 1] ? parts[i + 1]! : "(single-site run)";
}

export function modalityOf(ruleId: string): Modality {
  return AXE_INCOMPLETE_MODALITY[ruleId] ?? "unclassified";
}

export function buildCensus(files: EvidenceFile[], generatedAt = new Date().toISOString()) {
  const axe = new Map<string, RuleCount>();
  const journeys = new Map<string, { outcomes: Record<string, number>; sites: Set<string>; incompleteSummaries: Map<string, number> }>();
  const kinds: Record<string, number> = {};
  const sites = new Set<string>();
  const scanned = { baseline_axe: 0, observatory_probe: 0, journey: 0, surface: 0, skipped: 0 };

  const addAxe = (source: Source, site: string, ruleId: string, nodes: number) => {
    const key = `${source}\u0000${ruleId}`;
    const entry = axe.get(key) ?? { results: 0, nodes: 0, sites: new Set<string>() };
    entry.results += 1; entry.nodes += nodes; entry.sites.add(site); axe.set(key, entry);
  };

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const name = file.path.split(/[\\/]/).at(-1);
    const site = siteOf(file.path);
    if (name === "probe-results.json") {
      const parsed = ProbeFile.safeParse(file.json); if (!parsed.success) { scanned.skipped += 1; continue; }
      scanned.observatory_probe += 1; sites.add(site);
      for (const probe of parsed.data) if (probe.outcome === "incomplete") addAxe("observatory_probe", site, probe.probeId, probe.nodes.length);
    } else if (name === "axe-results.json") {
      const parsed = AxeFile.safeParse(file.json); if (!parsed.success) { scanned.skipped += 1; continue; }
      scanned.baseline_axe += 1; sites.add(site);
      for (const rule of parsed.data.incomplete) addAxe("baseline_axe", site, rule.id, rule.nodes.length);
    } else if (name === "journey-results.json") {
      const parsed = JourneyFile.safeParse(file.json); if (!parsed.success) { scanned.skipped += 1; continue; }
      scanned.journey += 1; sites.add(site);
      for (const result of parsed.data.results) {
        const entry = journeys.get(result.journeyId) ?? { outcomes: {}, sites: new Set<string>(), incompleteSummaries: new Map<string, number>() };
        entry.outcomes[result.outcome] = (entry.outcomes[result.outcome] ?? 0) + 1; entry.sites.add(site);
        if (result.outcome === "incomplete") entry.incompleteSummaries.set(result.summary, (entry.incompleteSummaries.get(result.summary) ?? 0) + 1);
        journeys.set(result.journeyId, entry);
      }
    } else if (name === "surface.json") {
      const parsed = SurfaceFile.safeParse(file.json); if (!parsed.success) { scanned.skipped += 1; continue; }
      scanned.surface += 1; sites.add(site);
      for (const surface of parsed.data.surfaces) kinds[surface.kind] = (kinds[surface.kind] ?? 0) + 1;
    }
  }

  const axeRules = [...axe.entries()].map(([key, value]) => {
    const [source, ruleId] = key.split("\u0000") as [Source, string];
    return { source, ruleId, modality: modalityOf(ruleId), results: value.results, nodes: value.nodes, sites: value.sites.size };
  }).sort((a, b) => a.source.localeCompare(b.source) || b.nodes - a.nodes || a.ruleId.localeCompare(b.ruleId));

  // The gate is evaluated on observatory evidence (what the pipeline actually produces), not the root-page baseline.
  const observatory = axeRules.filter((rule) => rule.source === "observatory_probe");
  const unresolvedNodes = observatory.reduce((sum, rule) => sum + rule.nodes, 0);
  const byModality = Object.fromEntries(Modality.options.map((m) => {
    const nodes = observatory.filter((rule) => rule.modality === m).reduce((sum, rule) => sum + rule.nodes, 0);
    return [m, { nodes, share: unresolvedNodes ? round(nodes / unresolvedNodes) : 0 }];
  })) as Record<Modality, { nodes: number; share: number }>;
  const candidates = observatory.filter((rule) => rule.modality === "text_semantic").map((rule) => ({
    ruleId: rule.ruleId, nodes: rule.nodes, sites: rule.sites, share: unresolvedNodes ? round(rule.nodes / unresolvedNodes) : 0,
    meetsGate: unresolvedNodes > 0 && rule.nodes / unresolvedNodes >= REENTRY_GATE.minNodeShareOfUnresolved && rule.sites >= REENTRY_GATE.minSites,
  })).sort((a, b) => b.nodes - a.nodes || a.ruleId.localeCompare(b.ruleId));

  const totalSurfaces = Object.values(kinds).reduce((a, b) => a + b, 0);
  return {
    schema: "art/ambiguity-census/v1" as const,
    censusVersion: CENSUS_VERSION,
    generatedAt,
    aiCalls: 0 as const,
    scannedFiles: scanned,
    sites: sites.size,
    axeIncomplete: { rules: axeRules, observatoryUnresolvedNodes: unresolvedNodes, observatoryByModality: byModality },
    journeys: [...journeys.entries()].map(([journeyId, value]) => ({
      journeyId, sites: value.sites.size, outcomes: value.outcomes,
      topIncompleteReasons: [...value.incompleteSummaries.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3)
        .map(([summary, count]) => ({ summary, count })),
    })).sort((a, b) => a.journeyId.localeCompare(b.journeyId)),
    surfaces: { selected: totalSurfaces, byKind: kinds, unknownShare: totalSurfaces ? round((kinds.unknown ?? 0) / totalSurfaces) : 0 },
    semanticReentry: {
      gate: REENTRY_GATE,
      textSemanticCandidates: candidates,
      frequencyGateMet: candidates.some((candidate) => candidate.meetsGate),
      note: "Frequency is necessary, not sufficient: human labels and a tried deterministic baseline are also required (ADR-0012).",
    },
  };
}

export type AmbiguityCensus = ReturnType<typeof buildCensus>;

const round = (value: number) => Math.round(value * 1000) / 1000;
const EVIDENCE_FILES = new Set(["probe-results.json", "axe-results.json", "journey-results.json", "surface.json"]);

export async function readEvidenceFiles(root: string): Promise<EvidenceFile[]> {
  const found: EvidenceFile[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && EVIDENCE_FILES.has(entry.name)) {
        let json: unknown = null;
        try { json = JSON.parse(await readFile(path, "utf8")); } catch { /* counted as skipped by buildCensus */ }
        found.push({ path: relative(root, path).split(sep).join("/"), json });
      }
    }
  }
  await walk(root);
  return found;
}
