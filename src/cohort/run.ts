import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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

  const profilePath = resolve(dirname(cohortPath), "..", cohort.profile.replace(/^requirements\//, "requirements/"));
  // Cohort files currently live at repoRoot/cohorts, so profile should resolve from repo root.
  const resolvedProfile = resolve(cohort.profile);

  const sites = [];
  for (const site of cohort.sites) {
    const siteDir = join(outDir, site.id);
    try {
      const result = await auditSite(site.url, {
        outDir: siteDir,
        maxPages: cohort.settings.max_pages,
        maxDepth: cohort.settings.max_depth,
        profilePath: resolvedProfile,
      });

      sites.push({
        id: site.id,
        name: site.name,
        url: site.url,
        status: "PASS" as const,
        selectedSurfaces: result.surface.surfaces.length,
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

  const result = CohortResultSchema.parse({
    schema: "art/cohort-result/v1",
    cohortId: cohort.id,
    generatedAt: new Date().toISOString(),
    profileId: cohort.profile,
    aiCalls: 0,
    sites,
  });

  await writeFile(join(outDir, "summary.json"), JSON.stringify(result, null, 2));
  return result;
}
