// Two independent assessment arms over equivalent fixture targets, each in its own server, browser and output directory.
//   Arm A: the existing deterministic scanner + safe journeys, reused unmodified, pinned to a commit and configuration.
//   Arm B: the adaptive harness driven by the scripted fake provider.
// Neither arm receives anything from the other. Each arm is sealed (sha256 over every artifact) before anything compares them.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { chromium, type Browser } from "playwright";
import { z } from "zod";
import { runSafeJourneys } from "../../journeys/engine.js";
import type { JourneyResult } from "../../journeys/contracts.js";
import { inspectPage } from "../../scout/classify.js";
import { candidateScore, eligibleInternalLink, normalizeUrl } from "../../scout/links.js";
import { selectRepresentativeSurfaces } from "../../scout/sample.js";
import type { DiscoveredPage } from "../../scout/contracts.js";
import { scanUrl } from "../../scan.js";
import { portOf, startFixtureProxy, startFixtures, type FixtureName } from "../../../test/fixtures/adaptive-sites/server.js";
import { DEFAULT_FIXTURE_LIMITS, type EvidenceRecord, type Limits, type PolicyDenial, type SessionResult, type StoredCandidate } from "./contracts.js";
import { codeSha, runSession, sha256 } from "./executor.js";
import { isContainedBrowser, launchContainedBrowser, type ContainedBrowser } from "./containment.js";
import type { ModelProvider } from "./provider.js";
import { FakeProvider } from "./providers/fake.js";
import { exploratoryScript } from "./scripted-policy.js";


// ---------------------------------------------------------------- shared shapes

export const ArmIdSchema = z.enum(["A", "B"]);
export type ArmId = z.infer<typeof ArmIdSchema>;

export const OccurrenceSchema = z.strictObject({
  path: z.string(),
  // Free text used to match the occurrence to a seeded defect: selector hints / html snippets / notes. Never a verdict.
  locator: z.string(),
  evidenceRef: z.string(),
  hasScreenshot: z.boolean(),
  hasTarget: z.boolean(),
});

export const ArmFindingSchema = z.strictObject({
  id: z.string(),
  arm: ArmIdSchema,
  category: z.string(),
  source: z.string(),
  claim: z.string(),
  occurrences: z.array(OccurrenceSchema).min(1),
});
export type ArmFinding = z.infer<typeof ArmFindingSchema>;

export const ArmDenialSchema = z.strictObject({ source: z.string(), reason: z.string(), detail: z.string(), url: z.string().nullable() });

export const ArmSurfaceSchema = z.strictObject({
  path: z.string(),
  kind: z.string().nullable(),
  classificationReason: z.string().nullable(),
  hasForm: z.boolean().nullable(),
  substantiveFormFields: z.number().nullable(),
  title: z.string().nullable(),
});

export const ArmSummarySchema = z.strictObject({
  schema: z.literal("art/adaptive-arm/v1"),
  arm: ArmIdSchema,
  fixture: z.string(),
  startPath: z.string(),
  pinned: z.strictObject({ codeSha: z.string(), configHash: z.string(), implementation: z.string(), skillVersion: z.string().nullable(), modelId: z.string().nullable() }),
  limits: z.strictObject({ maxSurfaces: z.number(), maxWallMs: z.number() }),
  startedAt: z.string(),
  durationMs: z.number(),
  terminal: z.string(),
  surfaces: z.array(ArmSurfaceSchema),
  states: z.array(z.string()),
  components: z.array(z.string()),
  findings: z.array(ArmFindingSchema),
  needsReview: z.array(z.strictObject({ source: z.string(), path: z.string(), summary: z.string(), detail: z.record(z.string(), z.unknown()) })),
  outOfScope: z.strictObject({ axeViolationRules: z.array(z.string()), journeyViolations: z.array(z.string()) }),
  rejectedCandidates: z.number(),
  denials: z.array(ArmDenialSchema),
  usage: z.strictObject({ wallMs: z.number(), modelCalls: z.number(), inputTokens: z.number(), outputTokens: z.number(), tokensEstimated: z.boolean(), cost: z.literal("unavailable") }),
  journeys: z.array(z.strictObject({ path: z.string(), results: z.array(z.record(z.string(), z.unknown())) })),
  contained: z.strictObject({ offOriginRequests: z.number(), nonGetRequests: z.number() }),
});
export type ArmSummary = z.infer<typeof ArmSummarySchema>;

export type ArmLimits = { maxSurfaces: number; maxWallMs: number };
export const DEFAULT_ARM_LIMITS: ArmLimits = { maxSurfaces: 8, maxWallMs: 60_000 };

const pathOf = (url: string) => { try { return new URL(url).pathname; } catch { return url; } };
const hashJson = (value: unknown) => sha256(JSON.stringify(value));

// ---------------------------------------------------------------- sealing

export const SealSchema = z.strictObject({
  schema: z.literal("art/adaptive-seal/v1"),
  arm: ArmIdSchema,
  sealedAt: z.string(),
  files: z.array(z.strictObject({ path: z.string(), sha256: z.string(), bytes: z.number() })),
  rootSha256: z.string(),
});
export type Seal = z.infer<typeof SealSchema>;

async function listFiles(root: string, dir = root, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await listFiles(root, full, out);
    else if (entry.isFile()) out.push(relative(root, full));
  }
  return out.sort();
}

async function digest(dir: string): Promise<Seal["files"]> {
  const files: Seal["files"] = [];
  for (const path of await listFiles(dir)) {
    if (path === "seal.json") continue;
    const bytes = await readFile(join(dir, path));
    files.push({ path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: (await stat(join(dir, path))).size });
  }
  return files;
}

const rootOf = (files: Seal["files"]) => sha256(files.map((file) => `${file.path}\0${file.sha256}`).join("\n"));

export async function sealArm(dir: string, arm: ArmId): Promise<Seal> {
  const files = await digest(dir);
  const seal: Seal = { schema: "art/adaptive-seal/v1", arm, sealedAt: new Date().toISOString(), files, rootSha256: rootOf(files) };
  await writeFile(join(dir, "seal.json"), JSON.stringify(seal, null, 2));
  return seal;
}

export class SealError extends Error {}

export async function verifySeal(dir: string): Promise<Seal> {
  let seal: Seal;
  try { seal = SealSchema.parse(JSON.parse(await readFile(join(dir, "seal.json"), "utf8"))); } catch { throw new SealError(`${dir} is not sealed`); }
  const now = await digest(dir);
  const expected = new Map(seal.files.map((file) => [file.path, file.sha256]));
  const problems = [
    ...now.filter((file) => expected.get(file.path) !== file.sha256).map((file) => (expected.has(file.path) ? `modified: ${file.path}` : `added: ${file.path}`)),
    ...seal.files.filter((file) => !now.some((candidate) => candidate.path === file.path)).map((file) => `missing: ${file.path}`),
  ];
  if (problems.length || rootOf(now) !== seal.rootSha256) throw new SealError(`seal mismatch in ${dir}: ${problems.join(", ") || "root hash differs"}`);
  return seal;
}

// ---------------------------------------------------------------- Arm A: deterministic scanner and journeys

// scanUrl prints its summary to stdout; the CLI owns stdout. Reference-counted so that concurrent arms restore it correctly.
let quiet = 0;
let realLog: typeof console.log | null = null;
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  if (quiet++ === 0) { realLog = console.log; console.log = () => undefined; }
  try { return await fn(); } finally { if (--quiet === 0 && realLog) { console.log = realLog; realLog = null; } }
}

const NAME_RULES = new Set(["axe.link-name", "axe.button-name", "axe.label", "axe.input-button-name", "axe.select-name", "axe.aria-command-name"]);

type ProbeRow = { probeId: string; outcome: string; nodes: Array<{ target: string[]; html: string }> };

export type RunArmOptions = { outDir: string; limits?: Partial<ArmLimits>; codeSha?: string };

const A_HOST = "203.0.113.10";
const A_OFF_HOST = "203.0.113.99";

export async function runArmA(fixture: FixtureName, truthStartPath: string, options: RunArmOptions): Promise<ArmSummary> {
  const limits = { ...DEFAULT_ARM_LIMITS, ...options.limits };
  const { outDir } = options;
  await mkdir(outDir, { recursive: true });
  const startedAtMs = Date.now();
  const deadline = startedAtMs + limits.maxWallMs;

  // The production scanner refuses loopback targets and cannot be edited, so the loopback fixture is exposed under a public-looking
  // address through a forward proxy that refuses everything else. The proxy is the containment layer for this arm.
  const fixtures = await startFixtures({ publicHost: A_HOST, offPublicHost: A_OFF_HOST });
  const proxy = await startFixtureProxy({ [new URL(fixtures.origin).host]: { port: portOf(fixtures.origin) } });
  let browser: Browser | null = null;
  const surfaces: ArmSummary["surfaces"] = [];
  const findings: ArmFinding[] = [];
  const needsReview: ArmSummary["needsReview"] = [];
  const journeys: ArmSummary["journeys"] = [];
  const components: string[] = [];
  const axeOther = new Set<string>();
  const journeyOther: string[] = [];
  let terminal = "completed";
  const startUrl = `${fixtures.origin}${truthStartPath}`;

  try {
    const launched = await chromium.launch({ headless: true, proxy: { server: proxy.url } });
    browser = launched;
    // Discovery reuses the scout building blocks: link scoring, eligibility, normalisation, inspection/classification and sampling.
    const root = new URL(startUrl);
    const pages: DiscoveredPage[] = [];
    const seen = new Set<string>();
    const queue: Array<{ url: string; depth: number; score: number; order: number }> = [{ url: normalizeUrl(startUrl), depth: 0, score: 1000, order: 0 }];
    const details = new Map<string, { substantive: number }>();
    let order = 1;
    const context = await launched.newContext({ viewport: { width: 1440, height: 900 } });
    while (queue.length && pages.length < limits.maxSurfaces) {
      if (Date.now() > deadline) { terminal = "timeout"; break; }
      queue.sort((a, b) => b.score - a.score || a.depth - b.depth || a.order - b.order);
      const next = queue.shift()!;
      if (seen.has(next.url) || next.depth > 2) continue;
      seen.add(next.url);
      const page = await context.newPage();
      try {
        const response = await page.goto(next.url, { waitUntil: "domcontentloaded", timeout: 15_000 });
        if (!response || response.status() >= 400) continue;
        await page.waitForTimeout(150);
        const finalUrl = normalizeUrl(page.url());
        const inspected = await inspectPage(page, finalUrl);
        pages.push({
          url: finalUrl, title: inspected.title, kind: inspected.kind, reason: inspected.reason, depth: next.depth, structuralFingerprint: inspected.structuralFingerprint,
          hasForm: inspected.hasForm, pdfLinks: inspected.pdfLinks, internalLinks: inspected.internalLinks,
        });
        details.set(finalUrl, { substantive: inspected.substantiveFormFields });
        const links = await page.$$eval("a[href]", (anchors) => anchors.map((anchor) => ({ href: (anchor as HTMLAnchorElement).href, label: (anchor.textContent ?? "").trim() })));
        for (const link of links) {
          if (!eligibleInternalLink(link.href, root)) continue;
          const url = normalizeUrl(link.href);
          if (seen.has(url) || queue.some((item) => item.url === url)) continue;
          queue.push({ url, depth: next.depth + 1, score: candidateScore(url, link.label), order: order++ });
        }
      } catch { /* an unreachable page is simply not discovered */ } finally { await page.close().catch(() => undefined); }
    }
    await context.close();

    const selected = selectRepresentativeSurfaces(pages, limits.maxSurfaces).slice(0, limits.maxSurfaces);
    for (const [index, surface] of selected.entries()) {
      if (Date.now() > deadline) { terminal = "timeout"; break; }
      const dir = join(outDir, `surface-${index}`);
      const path = pathOf(surface.url);
      surfaces.push({ path, kind: surface.kind, classificationReason: surface.reason, hasForm: surface.hasForm, substantiveFormFields: details.get(surface.url)?.substantive ?? null, title: surface.title });
      await quietly(() => scanUrl(surface.url, dir, { browser: launched }));
      const run = await runSafeJourneys(surface.url, dir, { browser: launched, surfaceId: `surface_${index}` });
      journeys.push({ path, results: run.results as unknown as Array<Record<string, unknown>> });

      const probes = JSON.parse(await readFile(join(dir, "probe-results.json"), "utf8")) as ProbeRow[];
      for (const probe of probes.filter((row) => row.outcome === "violation")) {
        if (!NAME_RULES.has(probe.probeId)) { axeOther.add(probe.probeId); continue; }
        for (const [nodeIndex, node] of probe.nodes.entries()) {
          findings.push({
            id: `A.${index}.${probe.probeId}.${nodeIndex}`, arm: "A", category: "missing_accessible_name", source: probe.probeId, claim: `${probe.probeId} violation`,
            occurrences: [{ path, locator: `${node.target.join(" ")} ${node.html}`, evidenceRef: `surface-${index}/probe-results.json#${probe.probeId}/${nodeIndex}`, hasScreenshot: true, hasTarget: node.target.length > 0 }],
          });
        }
      }
      for (const result of run.results as JourneyResult[]) {
        if (result.outcome !== "inapplicable") components.push(`journey:${result.kind}@${path}:${result.outcome}`);
        const ref = `surface-${index}/journey-results.json#${result.journeyId}`;
        if (result.kind === "skip_link" && result.outcome === "violation") {
          findings.push({
            id: `A.${index}.${result.journeyId}`, arm: "A", category: "skip_link_broken", source: result.journeyId, claim: result.summary,
            occurrences: [{ path, locator: JSON.stringify(result.evidence), evidenceRef: ref, hasScreenshot: false, hasTarget: false }],
          });
        } else if (result.outcome === "violation") {
          journeyOther.push(`${result.journeyId}@${path}`);
        } else if (result.outcome === "incomplete" || result.outcome === "error") {
          needsReview.push({ source: result.journeyId, path, summary: result.summary, detail: { kind: result.kind, outcome: result.outcome, evidence: result.evidence, ref } });
        }
      }
    }
  } catch (error) {
    terminal = "error";
    needsReview.push({ source: "arm_a", path: truthStartPath, summary: `arm A failed: ${(error instanceof Error ? error.message : String(error)).split("\n")[0]}`, detail: {} });
  } finally {
    await browser?.close().catch(() => undefined);
    await proxy.close();
    await fixtures.close();
  }

  const config = { ...limits, scanner: "scanUrl+runSafeJourneys", discovery: "scout building blocks", axe: "4.13" };
  const summary: ArmSummary = {
    schema: "art/adaptive-arm/v1", arm: "A", fixture, startPath: truthStartPath,
    pinned: { codeSha: options.codeSha ?? codeSha(), configHash: hashJson(config), implementation: "src/scan.ts scanUrl + src/journeys/engine.ts runSafeJourneys (+ scout link/classify/sample helpers)", skillVersion: null, modelId: null },
    limits, startedAt: new Date(startedAtMs).toISOString(), durationMs: Date.now() - startedAtMs, terminal, surfaces,
    states: surfaces.map((surface) => `${surface.path}#initial`), components, findings, needsReview,
    outOfScope: { axeViolationRules: [...axeOther].sort(), journeyViolations: journeyOther },
    rejectedCandidates: 0,
    denials: proxy.refused.map((entry) => ({ source: "fixture_proxy", reason: "refused_by_proxy", detail: entry, url: null })),
    usage: { wallMs: Date.now() - startedAtMs, modelCalls: 0, inputTokens: 0, outputTokens: 0, tokensEstimated: false, cost: "unavailable" },
    journeys,
    contained: { offOriginRequests: fixtures.offHits.length, nonGetRequests: fixtures.hits.filter((hit) => hit.method !== "GET" && hit.method !== "HEAD").length },
  };
  await writeFile(join(outDir, "arm.json"), JSON.stringify(ArmSummarySchema.parse(summary), null, 2));
  return summary;
}

// ---------------------------------------------------------------- Arm B: adaptive harness with the scripted fake provider

// sessionLimits overrides the executor budgets (model calls, tokens, steps) for arm B's session; maxSurfaces and maxWallMs come from limits.
export type RunArmBOptions = RunArmOptions & { provider?: ModelProvider; browser?: Browser; sessionLimits?: Partial<Omit<Limits, "maxSurfaces" | "maxWallMs">> };

export async function runArmB(fixture: FixtureName, truthStartPath: string, options: RunArmBOptions): Promise<ArmSummary> {
  const limits = { ...DEFAULT_ARM_LIMITS, ...options.limits };
  const { outDir } = options;
  await mkdir(outDir, { recursive: true });
  const fixtures = await startFixtures();
  let contained: ContainedBrowser | null = null;
  const provider = options.provider ?? new FakeProvider(exploratoryScript());
  const sessionLimits = { ...DEFAULT_FIXTURE_LIMITS, ...options.sessionLimits, maxSurfaces: limits.maxSurfaces, maxWallMs: limits.maxWallMs };
  let result: SessionResult;
  const sessionDir = join(outDir, "session");
  try {
    // Launched inside the try so that a launch failure still closes the fixture servers.
    // Arm B's own browser sits behind a containment proxy for the fixture origin, so worker and WebSocket traffic cannot leave either.
    if (options.browser && !isContainedBrowser(options.browser)) throw new Error("runArmB refuses a browser that was not launched with launchContainedBrowser");
    const browser = options.browser ?? (contained = await launchContainedBrowser([fixtures.origin])).browser;
    result = await runSession({
      config: {
        schema: "art/adaptive-session/v1", sessionId: `${fixture}-B`, startUrl: `${fixtures.origin}${truthStartPath}`, allowedOrigins: [fixtures.origin], mode: "fixture", publicTargets: [],
        limits: sessionLimits,
      },
      provider, outDir: sessionDir, browser, codeSha: options.codeSha,
    });
  } finally {
    await contained?.close();
    await fixtures.close();
  }

  const evidence = JSON.parse(await readFile(join(sessionDir, "evidence.json"), "utf8")) as EvidenceRecord[];
  const denials = JSON.parse(await readFile(join(sessionDir, "denials.json"), "utf8")) as PolicyDenial[];
  const candidates = JSON.parse(await readFile(join(sessionDir, "candidates.json"), "utf8")) as StoredCandidate[];
  const findings: ArmFinding[] = [];
  for (const candidate of candidates.filter((item) => item.status === "candidate")) {
    const finding = candidate.finding as { category: string; claim: string; observationRefs: string[] };
    findings.push({
      id: `B.${candidate.id}`, arm: "B", category: finding.category, source: "adaptive_candidate", claim: finding.claim,
      occurrences: finding.observationRefs.map((ref) => {
        const item = evidence.find((record) => record.id === ref)!;
        return { path: pathOf(item.url), locator: `${item.target?.selectorHint ?? ""} ${item.note ?? ""}`.trim(), evidenceRef: `session/evidence.json#${ref}`, hasScreenshot: Boolean(item.screenshot), hasTarget: Boolean(item.target) };
      }),
    });
  }
  const config = { ...limits, sessionLimits };
  const states = result.statesVisited;
  const summary: ArmSummary = {
    schema: "art/adaptive-arm/v1", arm: "B", fixture, startPath: truthStartPath,
    pinned: { codeSha: result.pinned.codeSha, configHash: hashJson(config), implementation: provider.id === "fake" ? "src/experimental/adaptive executor + scripted explorer (fake provider)" : `src/experimental/adaptive executor + real model (${provider.id}:${provider.requestedModel})`, skillVersion: result.pinned.skillVersion, modelId: result.pinned.modelId },
    limits, startedAt: result.startedAt, durationMs: result.durationMs, terminal: result.status,
    surfaces: result.surfacesVisited.map((url) => ({ path: pathOf(url), kind: null, classificationReason: null, hasForm: null, substantiveFormFields: null, title: null })),
    states, components: [...new Set(evidence.filter((item) => item.kind === "activate" || item.kind === "capture_evidence").map((item) => `${item.kind}:${pathOf(item.url)}:${item.target?.selectorHint ?? "-"}`))],
    findings, needsReview: [], outOfScope: { axeViolationRules: [], journeyViolations: [] },
    rejectedCandidates: result.rejectedCandidateCount,
    denials: [
      ...denials.map((denial) => ({ source: denial.source, reason: denial.reason, detail: denial.detail, url: denial.url })),
      ...(contained?.proxy.refused ?? []).map((entry) => ({ source: "containment_proxy", reason: "refused_by_proxy", detail: entry, url: null })),
      ...(contained && contained.proxy.refusedTotal() > contained.proxy.refused.length
        ? [{ source: "containment_proxy", reason: "refusals_truncated", detail: `${contained.proxy.refusedTotal() - contained.proxy.refused.length} further proxy refusals not recorded individually`, url: null }]
        : []),
    ],
    usage: { wallMs: result.durationMs, modelCalls: result.modelCalls, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, tokensEstimated: result.usage.estimated, cost: "unavailable" },
    journeys: [],
    contained: { offOriginRequests: fixtures.offHits.length, nonGetRequests: fixtures.hits.filter((hit) => hit.method !== "GET" && hit.method !== "HEAD").length },
  };
  await writeFile(join(outDir, "arm.json"), JSON.stringify(ArmSummarySchema.parse(summary), null, 2));
  return summary;
}

export async function readArm(dir: string, expected?: ArmId): Promise<{ seal: Seal; summary: ArmSummary }> {
  const seal = await verifySeal(dir);
  if (expected && seal.arm !== expected) throw new SealError(`${dir} is sealed as arm ${seal.arm}, expected arm ${expected}`);
  const summary = ArmSummarySchema.parse(JSON.parse(await readFile(join(dir, "arm.json"), "utf8")));
  if (expected && summary.arm !== expected) throw new SealError(`${dir} holds arm ${summary.arm}, expected arm ${expected}`);
  return { seal, summary };
}
