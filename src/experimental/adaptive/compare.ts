// Comparison of two sealed arms against fixture ground truth. Machine-readable JSON plus a readable markdown rendering.
// "Verified" means: matched to a seeded defect in the fixture's ground truth. Findings with no match are reported as false
// alarms only within the categories ground truth speaks about; everything else is listed as out of scope, not judged.
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { readArm, type ArmFinding, type ArmSummary } from "./arms.js";
import type { ObserverReport } from "./observer.js";
import { loadTruth, type FixtureName, type Truth } from "../../../test/fixtures/adaptive-sites/server.js";

const TRUTH_CATEGORIES = new Set(["missing_accessible_name", "skip_link_broken", "dialog_focus_not_returned"]);

type ArmScore = {
  surfacesVisited: string[];
  truthSurfacesCovered: string[];
  hiddenSurfacesReached: string[];
  statesVisited: string[];
  truthStatesReached: string[];
  componentsVisited: number;
  findingsReported: number;
  verifiedDefects: string[];
  missedDefects: string[];
  falseAlarms: string[];
  duplicates: number;
  occurrencesPerDefect: Record<string, number>;
  evidenceQuality: { occurrences: number; withTargetIdentity: number; withScreenshot: number; evidenceRefsResolved: boolean };
  needsReview: number;
  deniedActions: Record<string, number>;
  offOriginRequests: number;
  nonGetRequests: number;
  usage: ArmSummary["usage"];
  terminal: string;
  sealRootSha256: string;
};

export const FixtureComparisonSchema = z.object({
  schema: z.literal("art/adaptive-comparison/v1"),
  fixture: z.string(),
  heldOut: z.boolean(),
  truth: z.object({ surfaces: z.number(), hiddenSurfaces: z.array(z.string()), states: z.array(z.string()), defects: z.array(z.string()), detectorTraps: z.array(z.string()) }),
  A: z.custom<ArmScore>(),
  B: z.custom<ArmScore>(),
  dynamicAdvantage: z.object({ surfacesOnlyB: z.array(z.string()), hiddenSurfacesOnlyB: z.array(z.string()), statesOnlyB: z.array(z.string()), defectsOnlyB: z.array(z.string()), defectsOnlyA: z.array(z.string()), reachedStateBaselineMissed: z.boolean(), comparable: z.boolean() }),
  observer: z.object({ hypotheses: z.number(), byKind: z.record(z.string(), z.number()) }),
  pinned: z.object({ A: z.custom<ArmSummary["pinned"]>(), B: z.custom<ArmSummary["pinned"]>() }),
});
export type FixtureComparison = z.infer<typeof FixtureComparisonSchema>;

function matches(finding: ArmFinding, defect: Truth["defects"][number]): boolean {
  return finding.category === defect.category && finding.occurrences.some((occurrence) => (defect.path === "*" || occurrence.path === defect.path) && occurrence.locator.includes(defect.match));
}

function truthStates(states: string[]): string[] {
  const out = new Set<string>();
  for (const state of states) {
    if (/expanded=\[[^\]]+\]/.test(state)) out.add("menu-open");
    if (/dialogs=[1-9]/.test(state)) out.add("dialog-open");
  }
  return [...out];
}

type Json = unknown;
const asRecord = (value: Json): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);

// An evidence ref is "<file inside the sealed arm dir>#<fragment>". It resolves only when that file exists, parses, and holds the record the
// fragment names: arm B "evidence.json#<evidenceId>", arm A "probe-results.json#<probeId>/<nodeIndex>" or "journey-results.json#<journeyId>".
export async function evidenceRefResolves(dir: string, ref: string): Promise<boolean> {
  const hash = ref.indexOf("#");
  if (hash <= 0) return false;
  const file = ref.slice(0, hash);
  const fragment = ref.slice(hash + 1);
  const full = resolve(dir, file);
  const rel = relative(resolve(dir), full);
  if (isAbsolute(file) || rel.startsWith("..") || !fragment) return false;
  let json: Json;
  try { json = JSON.parse(await readFile(full, "utf8")) as Json; } catch { return false; }
  if (file.endsWith("evidence.json")) return Array.isArray(json) && json.some((record) => asRecord(record)?.["id"] === fragment);
  if (file.endsWith("probe-results.json")) {
    const [probeId, nodeIndex] = fragment.split("/");
    const row = Array.isArray(json) ? json.map(asRecord).find((record) => record?.["probeId"] === probeId) : null;
    const nodes = row?.["nodes"];
    return Array.isArray(nodes) && /^\d+$/.test(nodeIndex ?? "") && Number(nodeIndex) < nodes.length;
  }
  if (file.endsWith("journey-results.json")) {
    const results = asRecord(json)?.["results"];
    return Array.isArray(results) && results.some((result) => asRecord(result)?.["journeyId"] === fragment);
  }
  return false;
}

async function evidenceRefsResolve(dir: string, summary: ArmSummary): Promise<boolean> {
  const refs = summary.findings.filter((finding) => TRUTH_CATEGORIES.has(finding.category)).flatMap((finding) => finding.occurrences.map((occurrence) => occurrence.evidenceRef));
  return (await Promise.all(refs.map((ref) => evidenceRefResolves(dir, ref)))).every(Boolean);
}

function score(summary: ArmSummary, truth: Truth, sealRootSha256: string, evidenceRefsResolved: boolean): ArmScore {
  const surfaces = [...new Set(summary.surfaces.map((surface) => surface.path))];
  const inScope = summary.findings.filter((finding) => TRUTH_CATEGORIES.has(finding.category));
  const verified = new Map<string, ArmFinding[]>();
  const falseAlarms: string[] = [];
  for (const finding of inScope) {
    const hit = truth.defects.filter((defect) => matches(finding, defect));
    if (!hit.length) falseAlarms.push(`${finding.id} (${finding.category} @ ${finding.occurrences.map((occurrence) => occurrence.path).join(",")})`);
    for (const defect of hit) verified.set(defect.id, [...(verified.get(defect.id) ?? []), finding]);
  }
  const occurrences = inScope.flatMap((finding) => finding.occurrences);
  const denied: Record<string, number> = {};
  for (const denial of summary.denials) denied[denial.reason] = (denied[denial.reason] ?? 0) + 1;
  const reached = truthStates(summary.states);
  return {
    surfacesVisited: surfaces,
    truthSurfacesCovered: truth.surfaces.filter((path) => surfaces.includes(path)),
    hiddenSurfacesReached: truth.hiddenSurfaces.filter((path) => surfaces.includes(path)),
    statesVisited: summary.states,
    truthStatesReached: truth.states.filter((state) => reached.includes(state)),
    componentsVisited: summary.components.length,
    findingsReported: summary.findings.length,
    verifiedDefects: truth.defects.filter((defect) => verified.has(defect.id)).map((defect) => defect.id),
    missedDefects: truth.defects.filter((defect) => !verified.has(defect.id)).map((defect) => defect.id),
    falseAlarms,
    duplicates: [...verified.values()].reduce((sum, list) => sum + Math.max(0, list.length - 1), 0),
    occurrencesPerDefect: Object.fromEntries(truth.defects.map((defect) => [defect.id, new Set((verified.get(defect.id) ?? []).flatMap((finding) => finding.occurrences.filter((occurrence) => (defect.path === "*" || occurrence.path === defect.path) && occurrence.locator.includes(defect.match)).map((occurrence) => occurrence.path))).size])),
    evidenceQuality: {
      occurrences: occurrences.length,
      withTargetIdentity: occurrences.filter((occurrence) => occurrence.hasTarget).length,
      withScreenshot: occurrences.filter((occurrence) => occurrence.hasScreenshot).length,
      evidenceRefsResolved,
    },
    needsReview: summary.needsReview.length,
    deniedActions: denied,
    offOriginRequests: summary.contained.offOriginRequests,
    nonGetRequests: summary.contained.nonGetRequests,
    usage: summary.usage,
    terminal: summary.terminal,
    sealRootSha256,
  };
}

export async function compareFixture(fixture: FixtureName, dirA: string, dirB: string, observer: ObserverReport): Promise<FixtureComparison> {
  const truth = await loadTruth(fixture);
  const [a, b] = await Promise.all([readArm(dirA, "A"), readArm(dirB, "B")]);
  const A = score(a.summary, truth, a.seal.rootSha256, await evidenceRefsResolve(dirA, a.summary));
  const B = score(b.summary, truth, b.seal.rootSha256, await evidenceRefsResolve(dirB, b.summary));
  const only = <T>(x: T[], y: T[]) => x.filter((item) => !y.includes(item));
  const dynamicAdvantage = {
    surfacesOnlyB: only(B.surfacesVisited, A.surfacesVisited),
    hiddenSurfacesOnlyB: only(B.hiddenSurfacesReached, A.hiddenSurfacesReached),
    statesOnlyB: only(B.truthStatesReached, A.truthStatesReached),
    defectsOnlyB: only(B.verifiedDefects, A.verifiedDefects),
    defectsOnlyA: only(A.verifiedDefects, B.verifiedDefects),
    reachedStateBaselineMissed: false,
    // A difference only counts when both arms ran to completion; a crashed arm proves nothing about what it would have reached.
    comparable: A.terminal === "completed" && B.terminal === "completed",
  };
  dynamicAdvantage.reachedStateBaselineMissed = dynamicAdvantage.comparable && (dynamicAdvantage.hiddenSurfacesOnlyB.length > 0 || dynamicAdvantage.statesOnlyB.length > 0 || dynamicAdvantage.defectsOnlyB.length > 0);
  const byKind: Record<string, number> = {};
  for (const hypothesis of observer.hypotheses) byKind[hypothesis.kind] = (byKind[hypothesis.kind] ?? 0) + 1;
  return FixtureComparisonSchema.parse({
    schema: "art/adaptive-comparison/v1", fixture, heldOut: Boolean(truth.heldOut),
    truth: { surfaces: truth.surfaces.length, hiddenSurfaces: truth.hiddenSurfaces, states: truth.states, defects: truth.defects.map((defect) => defect.id), detectorTraps: truth.detectorTraps.map((trap) => trap.id) },
    A, B, dynamicAdvantage, observer: { hypotheses: observer.hypotheses.length, byKind }, pinned: { A: a.summary.pinned, B: b.summary.pinned },
  });
}

const list = (items: string[]) => (items.length ? items.join(", ") : "–");

export const SCRIPTED_ARM_B = "adaptive harness with the scripted fake provider (no model, no network). Cost: unavailable (no model priced)";

export function renderMarkdown(trialId: string, comparisons: FixtureComparison[], extras: { candidate?: unknown; armB?: string; title?: string } = {}): string {
  const lines = [`# ${extras.title ?? "Adaptive fixture trial"} \`${trialId}\``, "", `Arm A = existing deterministic scanner + safe journeys. Arm B = ${extras.armB ?? SCRIPTED_ARM_B}. Fixture truth is the only source of "verified".`, ""];
  lines.push("| fixture | held-out | surfaces A / B / truth | hidden reached A / B | states A / B | verified A / B | missed A / B | false alarms A / B | duplicates A / B | denied A / B | B model calls | B tokens |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const c of comparisons) {
    const n = (x: Record<string, number>) => Object.values(x).reduce((s, v) => s + v, 0);
    lines.push(`| ${c.fixture} | ${c.heldOut ? "yes" : "no"} | ${c.A.surfacesVisited.length} / ${c.B.surfacesVisited.length} / ${c.truth.surfaces} | ${c.A.hiddenSurfacesReached.length} / ${c.B.hiddenSurfacesReached.length} of ${c.truth.hiddenSurfaces.length} | ${c.A.truthStatesReached.length} / ${c.B.truthStatesReached.length} of ${c.truth.states.length} | ${c.A.verifiedDefects.length} / ${c.B.verifiedDefects.length} of ${c.truth.defects.length} | ${c.A.missedDefects.length} / ${c.B.missedDefects.length} | ${c.A.falseAlarms.length} / ${c.B.falseAlarms.length} | ${c.A.duplicates} / ${c.B.duplicates} | ${n(c.A.deniedActions)} / ${n(c.B.deniedActions)} | ${c.B.usage.modelCalls} | ${c.B.usage.inputTokens + c.B.usage.outputTokens}${c.B.usage.tokensEstimated ? " (est.)" : ""} |`);
  }
  lines.push("");
  lines.push("## How to read these numbers", "",
    "- **Arm A's off-origin count is 0 by construction.** Arm A has no browser policy; its browser can only reach a forward proxy that refuses everything except the one mapped fixture host. The number that tells you whether A tried to leave is its proxy refusals (\"denied\" for A in the table), not `offOriginRequests`. Only arm B's off-origin count is evidence about containment by the harness itself.",
    "- **\"B verified, A missed\" is partly a scoring artifact.** Arm A's dialog journeys that end `incomplete` are filed under needs-review, which is deliberately not credited as a finding, while arm B's candidate for the same defect is scored against the seeded truth. A's miss therefore reflects what the scoring credits, not only what A observed.", "");
  for (const c of comparisons) {
    lines.push(`## ${c.fixture}${c.heldOut ? " (held-out)" : ""}`, "");
    lines.push(`- Verified A: ${list(c.A.verifiedDefects)}; B: ${list(c.B.verifiedDefects)}. Missed A: ${list(c.A.missedDefects)}; B: ${list(c.B.missedDefects)}.`);
    lines.push(`- Dynamic arm reached something the baseline missed: **${!c.dynamicAdvantage.comparable ? `not comparable (arm A ended ${c.A.terminal}, arm B ended ${c.B.terminal})` : c.dynamicAdvantage.reachedStateBaselineMissed ? "yes" : "no"}** (hidden surfaces only B: ${list(c.dynamicAdvantage.hiddenSurfacesOnlyB)}; states only B: ${list(c.dynamicAdvantage.statesOnlyB)}; defects only B: ${list(c.dynamicAdvantage.defectsOnlyB)}; defects only A: ${list(c.dynamicAdvantage.defectsOnlyA)}).`);
    lines.push(`- False alarms A: ${list(c.A.falseAlarms)}; B: ${list(c.B.falseAlarms)}.`);
    lines.push(`- Evidence quality (occurrences / with target identity / with screenshot): A ${c.A.evidenceQuality.occurrences}/${c.A.evidenceQuality.withTargetIdentity}/${c.A.evidenceQuality.withScreenshot}; B ${c.B.evidenceQuality.occurrences}/${c.B.evidenceQuality.withTargetIdentity}/${c.B.evidenceQuality.withScreenshot}.`);
    lines.push(`- Denied actions A: ${JSON.stringify(c.A.deniedActions)}; B: ${JSON.stringify(c.B.deniedActions)}. Off-origin requests that reached a server: A ${c.A.offOriginRequests}, B ${c.B.offOriginRequests}; non-GET: A ${c.A.nonGetRequests}, B ${c.B.nonGetRequests}.`);
    lines.push(`- Needs review (not credited as findings) A: ${c.A.needsReview}, B: ${c.B.needsReview}. Evidence refs all resolve to recorded evidence: A ${c.A.evidenceQuality.evidenceRefsResolved ? "yes" : "NO"}, B ${c.B.evidenceQuality.evidenceRefsResolved ? "yes" : "NO"}.`);
    lines.push(`- Terminal: A ${c.A.terminal}, B ${c.B.terminal}. Wall ms A ${c.A.usage.wallMs}, B ${c.B.usage.wallMs}. Observer hypotheses: ${JSON.stringify(c.observer.byKind)}.`);
    lines.push(`- Sealed: A \`${c.A.sealRootSha256.slice(0, 16)}…\`, B \`${c.B.sealRootSha256.slice(0, 16)}…\`.`, "");
  }
  if (extras.candidate) lines.push("## Observer candidate (validated, not promoted)", "", "```json", JSON.stringify(extras.candidate, null, 2), "```", "");
  return lines.join("\n");
}
