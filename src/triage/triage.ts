import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ProbeResultSchema, type ProbeResult } from "../contracts.js";
import { TriageResultSchema } from "./contracts.js";

export type SurfaceRun = {
  surfaceId: string;
  url: string;
  runDir: string;
};

function findingId(probeId: string, outcome: string): string {
  return "finding_" + createHash("sha256").update(`${probeId}:${outcome}`).digest("hex").slice(0, 12);
}

function impactRank(impact: ProbeResult["impact"]): number {
  return { critical: 5, serious: 4, moderate: 3, minor: 2, unknown: 1 }[impact];
}

export async function triageSurfaceRuns(surfaceRuns: SurfaceRun[], outPath: string) {
  const loaded = await Promise.all(surfaceRuns.map(async (surface) => {
    const raw = JSON.parse(await readFile(join(surface.runDir, "probe-results.json"), "utf8"));
    return { surface, probes: ProbeResultSchema.array().parse(raw) };
  }));

  const groups = new Map<string, {
    probe: ProbeResult;
    surfaces: Set<string>;
    occurrences: Array<{
      surfaceId: string;
      url: string;
      target: string[];
      html: string;
      failureSummary: string | null;
    }>;
  }>();

  for (const { surface, probes } of loaded) {
    for (const probe of probes) {
      if (probe.outcome !== "violation" && probe.outcome !== "incomplete") continue;
      const key = `${probe.probeId}:${probe.outcome}`;
      const existing = groups.get(key) ?? {
        probe,
        surfaces: new Set<string>(),
        occurrences: [],
      };

      if (impactRank(probe.impact) > impactRank(existing.probe.impact)) existing.probe = probe;
      existing.surfaces.add(surface.surfaceId);

      for (const node of probe.nodes) {
        existing.occurrences.push({
          surfaceId: surface.surfaceId,
          url: surface.url,
          target: node.target,
          html: node.html,
          failureSummary: node.failureSummary,
        });
      }

      groups.set(key, existing);
    }
  }

  const totalSurfaces = surfaceRuns.length;
  const findings = Array.from(groups.values())
    .map(({ probe, surfaces, occurrences }) => ({
      schema: "art/evidence-finding/v1" as const,
      findingId: findingId(probe.probeId, probe.outcome),
      probeId: probe.probeId,
      probeVersion: probe.probeVersion,
      outcome: probe.outcome as "violation" | "incomplete",
      impact: probe.impact,
      help: probe.help,
      helpUrl: probe.helpUrl,
      tags: probe.tags,
      requirements: probe.requirements,
      affectedSurfaces: surfaces.size,
      occurrenceCount: occurrences.length,
      prevalence: totalSurfaces === 0 ? 0 : surfaces.size / totalSurfaces,
      templateLeverage: surfaces.size > 1 ? "repeated" as const : "single_surface" as const,
      occurrences,
    }))
    .sort((a, b) =>
      impactRank(b.impact) - impactRank(a.impact) ||
      b.prevalence - a.prevalence ||
      a.probeId.localeCompare(b.probeId)
    );

  const result = TriageResultSchema.parse({
    schema: "art/triage-result/v1",
    generatedAt: new Date().toISOString(),
    totalSurfaces,
    findings,
    aiCalls: 0,
  });

  await writeFile(outPath, JSON.stringify(result, null, 2));
  return result;
}
