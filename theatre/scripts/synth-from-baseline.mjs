#!/usr/bin/env node
// Dev-only. Expands a cohort baseline (art/cohort-baseline/v1) into a shaped event log
// so the theatre can be developed before the pipeline emits real events.
// Counts (sites, surfaces, findings, needsReview, issue families, occurrences) are real;
// per-event ordering and timing follow the documented host-safety policy (5 s between navigations).
//
//   node theatre/scripts/synth-from-baseline.mjs benchmarks/baselines/zh-small-pilot-2026-09-26.json \
//        > theatre/runs/zh-small-pilot-2026-09-26.events.jsonl

import { readFileSync } from "node:fs";

const [, , baselinePath] = process.argv;
if (!baselinePath) { console.error("usage: synth-from-baseline.mjs <baseline.json>"); process.exit(1); }
const b = JSON.parse(readFileSync(baselinePath, "utf8"));
const run = `${b.cohortId}-${b.capturedAt.slice(0, 10)}`;

// deterministic PRNG so the log is reproducible
let seed = 20260926;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

let t = new Date(b.capturedAt).getTime() - 20 * 60 * 1000; // run started ~20 min before capture
const out = [];
const emit = (stage, actor, subject, verdict, detail, cost, dtMs = 0) => {
  t += dtMs;
  const e = { ts: new Date(t).toISOString(), run, stage, actor, subject, verdict };
  if (detail) e.detail = detail;
  if (cost) e.cost = cost;
  out.push(e);
};

const kinds = ["home", "contact", "form", "news", "search", "pdf-list", "services", "council"];
const totalOcc = b.leadingIssueFamilies.reduce((s, f) => s + f.occurrenceCount, 0);
const totalFindings = b.sites.reduce((s, x) => s + x.findings, 0);
const occPerFinding = totalOcc / totalFindings;

emit("run", "code", { kind: "run", id: run }, "start", `${b.cohortId} · profile ${b.profileId.split("/").pop()} · ${b.sites.length} sites`);

for (const site of b.sites) {
  const S = { kind: "site", id: site.id, site: site.id };
  // SCOUT — discover ~3x the selected surfaces, select the representative ones
  const discovered = site.surfaces * 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < discovered; i++) {
    emit("scout", "code", { kind: "surface", id: `${site.id}/p${i + 1}`, site: site.id }, "discovered", `${pick(kinds)} · depth ${1 + Math.floor(rnd() * 3)}`, undefined, 40 + rnd() * 120);
  }
  const selectedIdx = new Set();
  while (selectedIdx.size < site.surfaces) selectedIdx.add(Math.floor(rnd() * discovered));
  for (let i = 0; i < discovered; i++) {
    const sel = selectedIdx.has(i);
    emit("scout", "code", { kind: "surface", id: `${site.id}/p${i + 1}`, site: site.id }, sel ? "selected" : "skipped", sel ? "representative · targeted" : "duplicate template", undefined, 5);
  }

  // PROBE — per selected surface: navigation (5 s policy), then axe nodes
  const surfaceIds = [...selectedIdx].map((i) => `${site.id}/p${i + 1}`);
  const siteOcc = Math.round(site.findings * occPerFinding);
  const findingsPerSurface = Math.ceil(site.findings / site.surfaces);
  let obsCount = 0;
  const findings = [];
  for (const [sIdx, sid] of surfaceIds.entries()) {
    emit("probe", "code", { kind: "surface", id: sid, site: site.id }, "pass", "navigate · axe-core 4.10 · 61 rules", { ms: 1800 + rnd() * 1400 }, 5000);
    const nObs = Math.max(2, Math.round(siteOcc / site.surfaces * (0.6 + rnd() * 0.8)));
    for (let k = 0; k < nObs; k++) {
      const fam = pick(b.leadingIssueFamilies);
      obsCount++;
      emit("probe", "code", { kind: "observation", id: `${sid}/${fam.probeId}#${k + 1}`, site: site.id }, fam.outcome, fam.probeId, undefined, 8 + rnd() * 25);
    }
    // inapplicable / pass rules as a handful of events so the drop ratio is honest
    for (let k = 0; k < 6; k++) emit("probe", "code", { kind: "observation", id: `${sid}/rule#${k}`, site: site.id }, k < 4 ? "pass" : "inapplicable", pick(["axe.html-has-lang", "axe.image-alt", "axe.button-name", "axe.document-title", "axe.frame-title", "axe.video-caption"]), undefined, 4);
    // TRIAGE for this surface: fold into findings
    for (let f = 0; f < findingsPerSurface && findings.length < site.findings; f++) {
      const fam = pick(b.leadingIssueFamilies);
      const fid = `${site.id}/f${findings.length + 1}`;
      const repeated = findings.length < site.repeatedFindings;
      findings.push({ fid, fam, repeated });
      emit("triage", "code", { kind: "finding", id: fid, site: site.id }, "finding", `${fam.probeId} · ${fam.outcome} · ${repeated ? "repeated" : "single_surface"}`, undefined, 30);
    }
  }
  // remaining observations merge into findings or get dropped
  const merges = Math.max(0, obsCount - findings.length);
  for (let m = 0; m < merges; m++) {
    const f = pick(findings);
    const dropped = rnd() < 0.08;
    emit("triage", "code", { kind: "observation", id: `${site.id}/obs#${m + 1}`, site: site.id }, dropped ? "dropped" : "merged", dropped ? "below occurrence floor" : `→ ${f.fid} · ${f.fam.probeId}`, undefined, 2 + rnd() * 6);
  }
  // INTERPRET — deterministic pilot: no model; needsReview goes to a human later
  for (const [i, f] of findings.entries()) {
    const needs = i < site.needsReview;
    emit("interpret", "code", { kind: "finding", id: f.fid, site: site.id }, needs ? "needs-review" : "explained", needs ? `${f.fam.probeId} · ${f.fam.outcome} · human review required` : `${f.fam.probeId} · template explanation`, undefined, 15);
  }
  // VERIFY — provenance claims; municipal applicability intentionally not asserted → blocked
  for (const f of findings) {
    emit("verify", "code", { kind: "claim", id: `${f.fid}/wcag`, site: site.id }, "supported", "WCAG criterion ← axe tag", undefined, 6);
    emit("verify", "code", { kind: "claim", id: `${f.fid}/applicability`, site: site.id }, "blocked", "municipal applicability not asserted (research profile)", undefined, 6);
  }
  emit("report", "code", S, "written", `${site.name} · ${site.findings} findings · ${site.needsReview} needs review · 0 applicable`, { ms: 220 }, 400);
  // WATCH — first baseline: everything NEW
  for (const f of findings) emit("watch", "code", { kind: "finding", id: f.fid, site: site.id }, "new", "no prior run", undefined, 3);
  // HUMAN — needs-review items get a decision in the control center
  for (let i = 0; i < site.needsReview; i++) emit("interpret", "human", { kind: "finding", id: findings[i].fid, site: site.id }, "escalated", "operator queued for manual check", undefined, 1500 + rnd() * 4000);
}

emit("run", "code", { kind: "run", id: run }, "end", `aiCalls ${b.aiCalls} · events ${out.length + 1}`, { ms: t - (new Date(b.capturedAt).getTime() - 20 * 60 * 1000) }, 500);
process.stdout.write(out.map((e) => JSON.stringify(e)).join("\n") + "\n");
