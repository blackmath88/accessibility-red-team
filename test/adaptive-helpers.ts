// Shared helpers for the experimental adaptive-track tests. Not a test file (does not match test/*.test.ts).
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "playwright";
import { DEFAULT_FIXTURE_LIMITS, type Limits, type Observation, type PolicyDenial, type SessionConfigInput } from "../src/experimental/adaptive/contracts.js";
import { runSession } from "../src/experimental/adaptive/executor.js";
import type { ModelProvider } from "../src/experimental/adaptive/provider.js";
import { launchSandboxBrowser } from "../src/experimental/adaptive/policy.js";
import { startFixtures, type Fixtures } from "./fixtures/adaptive-sites/server.js";

export type Harness = { browser: Browser; fixtures: Fixtures; close(): Promise<void> };

export async function startHarness(): Promise<Harness> {
  const [browser, fixtures] = await Promise.all([launchSandboxBrowser(), startFixtures()]);
  return { browser, fixtures, close: async () => { await browser.close(); await fixtures.close(); } };
}

export function fixtureConfig(harness: Harness, path: string, limits: Partial<Limits> = {}, sessionId = "test"): SessionConfigInput {
  return {
    schema: "art/adaptive-session/v1", sessionId, startUrl: `${harness.fixtures.origin}${path}`, allowedOrigins: [harness.fixtures.origin],
    mode: "fixture", publicTargets: [], limits: { ...DEFAULT_FIXTURE_LIMITS, ...limits },
  };
}

export async function runInTemp(harness: Harness, provider: ModelProvider, path: string, options: { limits?: Partial<Limits>; signal?: AbortSignal } = {}) {
  const outDir = await mkdtemp(join(tmpdir(), "art-adaptive-"));
  const result = await runSession({ config: fixtureConfig(harness, path, options.limits), provider, outDir, browser: harness.browser, signal: options.signal, codeSha: "test" });
  const json = async <T>(name: string) => JSON.parse(await readFile(join(outDir, name), "utf8")) as T;
  const trace = (await readFile(join(outDir, "trace.jsonl"), "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  return {
    result, outDir, trace, json,
    denials: await json<PolicyDenial[]>("denials.json"),
    cleanup: () => rm(outDir, { recursive: true, force: true }),
  };
}

// Finds an element ref in an observation by element id (matches selector hints such as "button#menu-toggle").
export function refById(observation: Observation | null, id: string): string {
  const all = [...(observation?.controls ?? []), ...(observation?.links ?? [])];
  const hit = all.find((element) => element.selectorHint.includes(`#${id}`) || ("id" in element && element.id === id));
  if (!hit) throw new Error(`no element #${id} in observation`);
  return hit.ref;
}

export function linkTo(observation: Observation | null, suffix: string): string {
  const hit = observation?.links.find((link) => link.href.endsWith(suffix));
  if (!hit) throw new Error(`no link to ${suffix}`);
  return hit.href;
}
