import type { Page } from "playwright";
import { JourneyResultSchema, type JourneyResult } from "./contracts.js";

const VERSION = "journeys/0.1";

function safety() {
  return {
    submittedForms: false as const,
    followedExternalLinks: false as const,
    wroteServerState: false as const,
  };
}

export async function skipLinkJourney(page: Page, surfaceId: string, url: string): Promise<JourneyResult> {
  const candidates = page.locator('a[href^="#"]');
  const count = Math.min(await candidates.count(), 20);

  for (let i = 0; i < count; i += 1) {
    const candidate = candidates.nth(i);
    const data = await candidate.evaluate((element) => {
      const text = (element.textContent ?? "").trim();
      const href = element.getAttribute("href") ?? "";
      return { text, href };
    }).catch(() => null);

    if (!data || !/skip|jump|zum inhalt|zum hauptinhalt|direkt zum/i.test(data.text)) continue;

    let id: string;
    try {
      id = decodeURIComponent(data.href.slice(1));
    } catch {
      return JourneyResultSchema.parse({
        schema: "art/journey-result/v1",
        journeyId: "skip-link.same-page",
        journeyVersion: VERSION,
        kind: "skip_link",
        surfaceId,
        url,
        outcome: "incomplete",
        title: "Skip link target",
        summary: "Skip link fragment could not be decoded; its target needs review.",
        evidence: [{
          action: "inspect skip link",
          selector: null,
          before: { text: data.text, href: data.href },
          note: "Malformed percent-encoded fragment; no target claim was made.",
        }],
        safety: safety(),
        aiCalls: 0,
      });
    }
    if (!id) continue;
    const escapedId = id.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    const target = page.locator(`[id="${escapedId}"]`);
    const targetCount = await target.count();

    const evidence: Array<{
      action: string;
      selector: string | null;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      note?: string;
    }> = [{
      action: "inspect skip link",
      selector: null,
      before: { text: data.text, href: data.href, targetExists: targetCount > 0 },
    }];

    if (!targetCount) {
      return JourneyResultSchema.parse({
        schema: "art/journey-result/v1",
        journeyId: "skip-link.same-page",
        journeyVersion: VERSION,
        kind: "skip_link",
        surfaceId,
        url,
        outcome: "violation",
        title: "Skip link target",
        summary: "A skip link was found but its same-page target does not exist.",
        evidence,
        safety: safety(),
        aiCalls: 0,
      });
    }

    const targetMeta = await target.first().evaluate((element) => ({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      tabindex: element.getAttribute("tabindex"),
    }));

    evidence.push({
      action: "inspect skip target",
      selector: `#${id}`,
      after: targetMeta,
    });

    const meaningful = targetMeta.tag === "main" || targetMeta.role === "main";
    return JourneyResultSchema.parse({
      schema: "art/journey-result/v1",
      journeyId: "skip-link.same-page",
      journeyVersion: VERSION,
      kind: "skip_link",
      surfaceId,
      url,
      outcome: meaningful ? "pass" : "incomplete",
      title: "Skip link target",
      summary: meaningful
        ? "Skip link resolves to a main-content landmark."
        : "Skip link target exists, but its bypass semantics need review.",
      evidence,
      safety: safety(),
      aiCalls: 0,
    });
  }

  return JourneyResultSchema.parse({
    schema: "art/journey-result/v1",
    journeyId: "skip-link.same-page",
    journeyVersion: VERSION,
    kind: "skip_link",
    surfaceId,
    url,
    outcome: "inapplicable",
    title: "Skip link target",
    summary: "No recognizable same-page skip link was found.",
    evidence: [],
    safety: safety(),
    aiCalls: 0,
  });
}
