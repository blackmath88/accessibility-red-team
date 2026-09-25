import type { AccessibilityReport } from "./contracts.js";

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]!);
}

function badge(status: string): string {
  return `<span class="badge">${esc(status.replaceAll("_", " "))}</span>`;
}

export function renderReportHtml(report: AccessibilityReport): string {
  const findings = report.findings.map((finding) => {
    const requirementBlocks = finding.requirements.length
      ? finding.requirements.map((requirement) => {
          const chain = requirement.chain.length
            ? `<ol class="chain">${requirement.chain.map((link) =>
                `<li><strong>${esc(link.issuer)}</strong> · ${esc(link.assertion)}
                  <div><a href="${esc(link.url)}">${esc(link.title)}</a> · ${esc(link.authorityClass)} · ${esc(link.strength)}</div>
                </li>`).join("")}</ol>`
            : "<p>No jurisdiction-specific source chain established for this criterion.</p>";

          return `<section class="requirement">
            <div class="row">${badge(requirement.status)} <strong>WCAG ${esc(requirement.standardVersion)} · ${esc(requirement.criterion)}</strong></div>
            <p>${esc(requirement.explanation)}</p>
            <details>
              <summary>Why is this a requirement?</summary>
              ${chain}
            </details>
          </section>`;
        }).join("")
      : "<p>No WCAG criterion mapping was supplied by the automated probe.</p>";

    const examples = finding.probe.nodes.slice(0, 3).map((node) =>
      `<div class="evidence"><code>${esc(node.html)}</code>${node.failureSummary ? `<p>${esc(node.failureSummary)}</p>` : ""}</div>`
    ).join("");

    return `<article class="finding">
      <div class="row"><h2>${esc(finding.probe.help)}</h2> ${badge(finding.probe.outcome)}</div>
      <p><strong>Probe:</strong> ${esc(finding.probe.probeId)} · <strong>Impact:</strong> ${esc(finding.probe.impact)}</p>
      ${requirementBlocks}
      <details><summary>Observed evidence</summary>${examples || "<p>No node evidence retained.</p>"}</details>
    </article>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accessibility Red Team Report</title>
<style>
:root{font-family:Inter,system-ui,sans-serif;color:#171717;background:#f5f3ee}
body{margin:0}.wrap{max-width:1040px;margin:auto;padding:56px 24px 96px}
header{border-bottom:1px solid #bbb;padding-bottom:32px;margin-bottom:36px}
.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px}
h1{font-size:clamp(36px,7vw,72px);line-height:.95;margin:12px 0}
h2{font-size:22px;margin:0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.metric,.finding{background:#fff;border:1px solid #d8d5ce}.metric{padding:18px}.metric b{font-size:32px;display:block}
.finding{padding:24px;margin:18px 0}.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.badge{font-size:11px;text-transform:uppercase;letter-spacing:.08em;border:1px solid #999;border-radius:999px;padding:4px 8px}
.requirement{border-top:1px solid #ddd;margin-top:18px;padding-top:18px}.chain li{margin:12px 0}
details{margin-top:14px}summary{cursor:pointer;font-weight:650}.evidence{margin-top:12px;padding:12px;background:#f2f2f2;overflow:auto}
code{white-space:pre-wrap;word-break:break-word}a{color:inherit}
</style>
</head>
<body><main class="wrap">
<header>
<div class="eyebrow">Accessibility Red Team · deterministic report · 0 AI calls</div>
<h1>Accessibility snapshot</h1>
<p>${esc(report.target.finalUrl)}</p>
<p>Profile: <strong>${esc(report.profileId)}</strong></p>
</header>
<section class="grid">
<div class="metric"><b>${report.summary.violations}</b>violations</div>
<div class="metric"><b>${report.summary.incomplete}</b>needs review</div>
<div class="metric"><b>${report.summary.applicable}</b>applicable criterion mappings</div>
<div class="metric"><b>${report.summary.bestPractice}</b>best-practice mappings</div>
</section>
<section>
${findings || "<p>No reportable automated findings.</p>"}
</section>
<footer><p>This is an automated accessibility snapshot, not a certification of WCAG conformance.</p></footer>
</main></body></html>`;
}
