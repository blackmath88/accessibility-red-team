import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ProbeResultSchema, ScanSummarySchema } from "../contracts.js";
import { loadJurisdictionProfile, loadSourceRegistry } from "../provenance/load.js";
import { resolveProbeRequirements } from "../provenance/resolve.js";
import { AccessibilityReportSchema } from "./contracts.js";
import { renderReportHtml } from "./html.js";

export async function buildReport(options: {
  runDir: string;
  profilePath: string;
  sourcesPath?: string;
}) {
  const probesRaw = JSON.parse(await readFile(join(options.runDir, "probe-results.json"), "utf8"));
  const summaryRaw = JSON.parse(await readFile(join(options.runDir, "summary.json"), "utf8"));

  const probes = ProbeResultSchema.array().parse(probesRaw);
  const scanSummary = ScanSummarySchema.parse(summaryRaw);
  const profile = await loadJurisdictionProfile(options.profilePath);
  const registry = await loadSourceRegistry(options.sourcesPath);

  const reportable = probes.filter((probe) => probe.outcome === "violation" || probe.outcome === "incomplete");
  const findings = reportable.map((probe) => ({
    probe,
    requirements: resolveProbeRequirements(probe, profile, registry),
  }));

  const resolutions = findings.flatMap((finding) => finding.requirements);
  const report = AccessibilityReportSchema.parse({
    schema: "art/accessibility-report/v1",
    generatedAt: new Date().toISOString(),
    profileId: profile.id,
    target: {
      requestedUrl: scanSummary.requestedUrl,
      finalUrl: scanSummary.finalUrl,
    },
    summary: {
      violations: reportable.filter((finding) => finding.outcome === "violation").length,
      incomplete: reportable.filter((finding) => finding.outcome === "incomplete").length,
      applicable: resolutions.filter((resolution) => resolution.status === "APPLICABLE").length,
      bestPractice: resolutions.filter((resolution) => resolution.status === "BEST_PRACTICE").length,
      unknownApplicability: resolutions.filter((resolution) => resolution.status === "UNKNOWN").length,
    },
    findings,
    aiCalls: 0,
  });

  await writeFile(join(options.runDir, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(join(options.runDir, "report.html"), renderReportHtml(report));
  return report;
}
