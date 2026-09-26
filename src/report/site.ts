import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadJurisdictionProfile, loadSourceRegistry } from "../provenance/load.js";
import { resolveRequirement } from "../provenance/resolve.js";
import { AccessibilitySurfaceSchema } from "../scout/contracts.js";
import { TriageResultSchema } from "../triage/contracts.js";
import type { JourneyRun } from "../journeys/contracts.js";
import { summarizeJourneys } from "./journeys.js";
import { SiteAccessibilityReportV2Schema, type SiteAccessibilityReport } from "./site-contracts.js";

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]!);
}

function render(report: SiteAccessibilityReport): string {
  const findings = report.findings.map(({ finding, requirements }) => {
    const sources = requirements.flatMap((requirement) =>
      requirement.chain.map((link) => `
        <li>
          <strong>${esc(link.issuer)}</strong>: ${esc(link.assertion)}
          <div><a href="${esc(link.url)}">${esc(link.title)}</a> · ${esc(link.authorityClass)} · ${esc(link.strength)}</div>
        </li>`)
    ).join("");

    const requirementSummary = requirements.length
      ? requirements.map((requirement) =>
          `<span class="pill">${esc(requirement.status)} · WCAG ${esc(requirement.criterion)}</span>`
        ).join(" ")
      : '<span class="pill">NO WCAG MAPPING</span>';

    const evidence = finding.occurrences.slice(0, 4).map((occurrence) => `
      <div class="evidence">
        <div class="muted">${esc(occurrence.url)} · ${esc(occurrence.target.join(" "))}</div>
        <code>${esc(occurrence.html)}</code>
        ${occurrence.failureSummary ? `<p>${esc(occurrence.failureSummary)}</p>` : ""}
      </div>`
    ).join("");

    return `<article class="finding">
      <div class="top">
        <div>
          <div class="kicker">${esc(finding.probeId)} · ${esc(finding.impact)}</div>
          <h2>${esc(finding.help)}</h2>
        </div>
        <div class="count">${finding.affectedSurfaces}/${report.totalSurfaces}<small>surfaces</small></div>
      </div>
      <div class="pills">${requirementSummary}</div>
      <p><strong>${finding.occurrenceCount}</strong> observed occurrences · prevalence ${Math.round(finding.prevalence * 100)}% · ${esc(finding.templateLeverage)}</p>
      <details open>
        <summary>Why is this a requirement?</summary>
        ${sources ? `<ol class="chain">${sources}</ol>` : "<p>No binding source chain established for this finding under the selected profile.</p>"}
      </details>
      <details>
        <summary>Observed evidence</summary>
        ${evidence}
      </details>
    </article>`;
  }).join("");

  const journeys = report.journeys.map((journey) => `
    <article class="finding journey">
      <div class="top">
        <div>
          <div class="kicker">${esc(journey.journeyId)} · ${esc(journey.kind)}</div>
          <h2>${esc(journey.outcome.toUpperCase())}</h2>
        </div>
        <div class="count">${journey.affectedSurfaces}/${report.totalSurfaces}<small>surfaces</small></div>
      </div>
      <div class="pills"><span class="pill">BEHAVIORAL EVIDENCE</span><span class="pill">${esc(journey.journeyVersion)}</span></div>
      <p>${journey.summaries.map(esc).join(" · ")}</p>
      <details>
        <summary>Journey scope</summary>
        <p>Observed on: ${journey.surfaceIds.map(esc).join(", ") || "none"}.</p>
        <p>This section is behavioral test evidence. It is not automatically a WCAG/legal finding unless separately mapped and validated.</p>
      </details>
    </article>`
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accessibility Red Team · Site Report</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#171717;background:#f2f0ea}
*{box-sizing:border-box}body{margin:0}.wrap{max-width:1120px;margin:auto;padding:56px 24px 100px}
header{padding-bottom:36px;border-bottom:1px solid #aaa;margin-bottom:32px}.kicker{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#555}
h1{font-size:clamp(42px,8vw,84px);line-height:.9;letter-spacing:-.04em;margin:12px 0 18px}h2{font-size:24px;margin:4px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:28px 0 42px}.metric{background:#fff;border:1px solid #d2cec4;padding:18px}.metric b{font-size:34px;display:block}
.finding{background:#fff;border:1px solid #d2cec4;padding:24px;margin:16px 0}.journey{border-style:dashed}.top{display:flex;justify-content:space-between;gap:20px}.count{font-size:28px;text-align:right}.count small{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
.pill{display:inline-block;border:1px solid #999;border-radius:999px;padding:4px 8px;font-size:11px;margin:4px 4px 4px 0}.pills{margin:12px 0}.muted{color:#666;font-size:12px;margin-bottom:8px}
details{border-top:1px solid #ddd;padding-top:12px;margin-top:16px}summary{cursor:pointer;font-weight:700}.chain li{margin:12px 0}.evidence{background:#f5f5f5;padding:12px;margin:10px 0;overflow:auto}code{white-space:pre-wrap;word-break:break-word}a{color:inherit}
section.block{margin-top:50px}section.block>h2{font-size:30px;margin-bottom:14px}
footer{margin-top:48px;color:#555}
</style>
</head>
<body><main class="wrap">
<header>
<div class="kicker">Accessibility Red Team · evidence first · 0 AI calls</div>
<h1>Site accessibility snapshot</h1>
<p>${esc(report.entrypoint)}</p>
<p>Requirement profile: <strong>${esc(report.profileId)}</strong></p>
</header>
<section class="grid">
<div class="metric"><b>${report.totalSurfaces}</b>surfaces tested</div>
<div class="metric"><b>${report.summary.findings}</b>grouped findings</div>
<div class="metric"><b>${report.summary.needsReview}</b>static review items</div>
<div class="metric"><b>${report.summary.journeyNeedsReview}</b>journey review items</div>
</section>
<section class="block">
<h2>Deterministic findings</h2>
${findings || "<p>No reportable automated findings.</p>"}
</section>
<section class="block">
<h2>Behavioral journeys</h2>
${journeys || "<p>No journey evidence collected for this audit.</p>"}
</section>
<footer>
<p>Automated snapshot, not a certification of WCAG conformance. Behavioral journey evidence is reported separately from standards/provenance findings.</p>
</footer>
</main></body></html>`;
}

export async function buildSiteReport(options: {
  auditDir: string;
  profilePath: string;
  sourcesPath?: string;
  journeyRuns?: JourneyRun[];
}) {
  const [surfaceRaw, triageRaw, profile, registry] = await Promise.all([
    readFile(join(options.auditDir, "surface.json"), "utf8"),
    readFile(join(options.auditDir, "findings.json"), "utf8"),
    loadJurisdictionProfile(options.profilePath),
    loadSourceRegistry(options.sourcesPath),
  ]);

  const surface = AccessibilitySurfaceSchema.parse(JSON.parse(surfaceRaw));
  const triage = TriageResultSchema.parse(JSON.parse(triageRaw));
  const journeys = summarizeJourneys(options.journeyRuns ?? []);

  const findings = triage.findings.map((finding) => ({
    finding,
    requirements: finding.requirements.map((requirement) =>
      resolveRequirement(requirement.criterion, finding.tags, profile, registry)
    ),
  }));

  const report = SiteAccessibilityReportV2Schema.parse({
    schema: "art/site-accessibility-report/v2",
    generatedAt: new Date().toISOString(),
    profileId: profile.id,
    entrypoint: surface.entrypoint,
    totalSurfaces: triage.totalSurfaces,
    summary: {
      findings: findings.length,
      repeatedFindings: findings.filter(({ finding }) => finding.templateLeverage === "repeated").length,
      applicableFindings: findings.filter(({ requirements }) =>
        requirements.some((requirement) => requirement.status === "APPLICABLE")
      ).length,
      needsReview: findings.filter(({ finding }) => finding.outcome === "incomplete").length,
      journeyPasses: journeys.filter((journey) => journey.outcome === "pass").length,
      journeyNeedsReview: journeys.filter((journey) => journey.outcome === "incomplete").length,
      journeyViolations: journeys.filter((journey) => journey.outcome === "violation").length,
    },
    findings,
    journeys,
    aiCalls: 0,
  });

  await writeFile(join(options.auditDir, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(join(options.auditDir, "report.html"), render(report));
  return report;
}
