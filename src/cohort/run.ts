import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { auditSite } from "../site/audit.js";
import { CohortResultSchema, CohortSchema } from "./contracts.js";

export async function runCohort(options: {
  cohortPath: string;
  outDir?: string;
}) {
  const cohortPath = resolve(options.cohortPath);
  const cohort = CohortSchema.parse(YAML.parse(await readFile(cohortPath, "utf8")));
  const outDir = resolve(options.outDir ?? join("runs", "cohorts", cohort.id));
  await mkdir(outDir, { recursive: true });

  const resolvedProfile = resolve(cohort.profile);
  const sites = [];
  const issueFamilies = new Map<string, {
    probeId: string;
    outcome: "violation" | "incomplete";
    municipalities: Set<string>;
    occurrenceCount: number;
  }>();

  for (const site of cohort.sites) {
    const siteDir = join(outDir, site.id);
    try {
      const result = await auditSite(site.url, {
        outDir: siteDir,
        maxPages: cohort.settings.max_pages,
        maxDepth: cohort.settings.max_depth,
        profilePath: resolvedProfile,
        maxSurfaces: cohort.settings.max_surfaces,
      });

      if (result.report) {
        for (const { finding } of result.report.findings) {
          const familyKey = `${finding.probeId}:${finding.outcome}`;
          const current = issueFamilies.get(familyKey) ?? {
            probeId: finding.probeId,
            outcome: finding.outcome,
            municipalities: new Set<string>(),
            occurrenceCount: 0,
          };
          current.municipalities.add(site.name);
          current.occurrenceCount += finding.occurrenceCount;
          issueFamilies.set(familyKey, current);
        }
      }

      sites.push({
        id: site.id,
        name: site.name,
        url: site.url,
        status: "PASS" as const,
        selectedSurfaces: result.manifest.selectedSurfaces,
        findings: result.report?.summary.findings ?? result.triage.findings.length,
        repeatedFindings: result.report?.summary.repeatedFindings ?? 0,
        needsReview: result.report?.summary.needsReview ?? 0,
        applicableFindings: result.report?.summary.applicableFindings ?? 0,
        reportPath: join(site.id, "report.html"),
      });
    } catch (error) {
      sites.push({
        id: site.id,
        name: site.name,
        url: site.url,
        status: "ERROR" as const,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const aggregated = Array.from(issueFamilies.values())
    .map((family) => ({
      probeId: family.probeId,
      outcome: family.outcome,
      municipalityCount: family.municipalities.size,
      occurrenceCount: family.occurrenceCount,
      municipalities: Array.from(family.municipalities).sort(),
    }))
    .sort((a, b) =>
      b.municipalityCount - a.municipalityCount ||
      b.occurrenceCount - a.occurrenceCount ||
      a.probeId.localeCompare(b.probeId) ||
      a.outcome.localeCompare(b.outcome)
    );

  const result = CohortResultSchema.parse({
    schema: "art/cohort-result/v1",
    cohortId: cohort.id,
    generatedAt: new Date().toISOString(),
    profileId: cohort.profile,
    aiCalls: 0,
    issueFamilies: aggregated,
    sites,
  });

  await writeFile(join(outDir, "summary.json"), JSON.stringify(result, null, 2));
  return result;
}
