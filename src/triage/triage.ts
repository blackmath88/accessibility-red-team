import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ProbeResultSchema, type ProbeResult } from "../contracts.js";
import { TriageResultSchema } from "./contracts.js";
import type { Emit } from "../theatre/emit.js";
import { atOf } from "../theatre/schema.js";

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

export async function triageSurfaceRuns(surfaceRuns: SurfaceRun[], outPath: string, emit: Emit = () => {}) {
  const loaded = await Promise.all(surfaceRuns.map(async (surface) => {
    const raw = JSON.parse(await readFile(join(surface.runDir, "probe-results.json"), "utf8"));
    return { surface, probes: ProbeResultSchema.array().parse(raw) };
  }));

  const groups = new Map<string, {
    probe: ProbeResult;
    surfaces: Set<string>;
    refs: string[];
    occurrences: Array<{
      surfaceId: string;
      url: string;
      target: string[];
      html: string;
      failureSummary: string | null;
    }>;
  }>();

  for (const { surface, probes } of loaded) {
    const surfaceRef = surface.url.replace(/\/$/, "");
    const site = new URL(surface.url).hostname;
    for (const probe of probes) {
      if (probe.outcome !== "violation" && probe.outcome !== "incomplete") {
        emit({
          stage: "triage", actor: "code", verdict: "dropped",
          subject: { kind: "observation", id: `${surfaceRef}/${probe.probeId}`, site }, ...(probe.nodes[0] ? { at: atOf(probe.nodes[0]) } : {}),
          detail: `${probe.probeId} · ${probe.outcome}`,
        });
        continue;
      }
      const key = `${probe.probeId}:${probe.outcome}`;
      const existing = groups.get(key) ?? {
        probe,
        surfaces: new Set<string>(),
        refs: [],
        occurrences: [],
      };
      existing.refs.push(...probe.nodes.map((_, index) => `${surfaceRef}/${probe.probeId}#${index + 1}`));

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
    .map(({ probe, surfaces, refs, occurrences }) => ({
      refs,
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

  // The first occurrence opens the finding; every further one is folded into it.
  for (const { refs, ...finding } of findings) {
    const site = new URL(finding.occurrences[0]?.url ?? surfaceRuns[0]!.url).hostname;
    const detail = `${finding.probeId} · ${finding.templateLeverage}`;
    emit({ stage: "triage", actor: "code", verdict: "finding", subject: { kind: "finding", id: `${site}/${finding.probeId}:${finding.outcome}`, site }, detail });
    for (const [index, id] of refs.entries()) {
      if (index > 0) emit({ stage: "triage", actor: "code", verdict: "merged", subject: { kind: "observation", id, site }, at: atOf(finding.occurrences[index]!), detail });
    }
  }

  const result = TriageResultSchema.parse({
    schema: "art/triage-result/v1",
    generatedAt: new Date().toISOString(),
    totalSurfaces,
    findings: findings.map(({ refs: _refs, ...finding }) => finding),
    aiCalls: 0,
  });

  await writeFile(outPath, JSON.stringify(result, null, 2));
  return result;
}
