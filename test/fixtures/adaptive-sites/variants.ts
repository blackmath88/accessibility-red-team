// Development fixture variants for the frontier benchmark. Every one is "development": inspected freely while building, never
// called held-out. Paths, titles and link text are neutral; defect position differs per variant (hand-built permutations).
// Ground truth stays in truth.json next to the pages; the fixture server serves only .html (and malicious/*.js), never truth.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FIXTURE_DIR, type Truth } from "./server.js";

export const DEV_VARIANTS = ["dev-k1", "dev-k2", "dev-k3"] as const;
// Existing fixtures reused as development cases for the frontier comparison (malicious stays out: it is not comparable).
export const FRONTIER_DEV_FIXTURES = ["skip-links", "news-service", "menu-dialog", ...DEV_VARIANTS] as const;
export type FrontierDevFixture = typeof FRONTIER_DEV_FIXTURES[number];
// The three legacy fixtures leak the answer through URLs and link text (e.g. a link named after the defect). Models read that text;
// the scheduler does not. They are scored separately from the neutral variants.
export const LEAKY_FIXTURES: readonly string[] = ["skip-links", "news-service", "menu-dialog"];

export async function loadDevTruth(name: FrontierDevFixture): Promise<Truth & { split?: string }> {
  return JSON.parse(await readFile(join(FIXTURE_DIR, name, "truth.json"), "utf8")) as Truth & { split?: string };
}

// Held-out generator, stub only. The seed is supplied by the owner after code, prompts, scheduler and config are frozen; until
// then it refuses. Nothing in this repository calls it with a seed, and no held-out case has been generated or inspected.
export function heldOutVariants(options: { seed?: string; frozenCodeSha?: string }): never {
  if (!options.seed || !options.frozenCodeSha) throw new Error("held-out generation needs an owner-supplied seed and the frozen code sha; not available before code freeze");
  throw new Error("held-out generation is not implemented before code freeze");
}
