import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import {
  JourneyResultSchema,
  JourneyRunSchema,
  type JourneyResult,
  type JourneyRun,
} from "./contracts.js";
import { isSafeActivationTarget } from "./safety.js";
import { validatePublicTarget } from "../scope.js";

const VERSION = "journeys/0.1";

function safety() {
  return {
    submittedForms: false as const,
    followedExternalLinks: false as const,
    wroteServerState: false as const,
  };
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);
}

async function keyboardFocusJourney(page: Page, surfaceId: string, url: string): Promise<JourneyResult> {
  const evidence = [];
  const steps = [];

  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });

  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    const snapshot = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      let focusVisible = false;
      try { focusVisible = element.matches(":focus-visible"); } catch {}
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        role: element.getAttribute("role"),
        text: (element.innerText || element.getAttribute("aria-label") || "").trim().slice(0, 120),
        focusVisible,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    });
    if (!snapshot) break;
    steps.push(snapshot);
    evidence.push({
      action: "Tab",
      selector: snapshot.id ? `#${snapshot.id}` : null,
      after: snapshot,
    });
  }

  if (!steps.length) {
    return JourneyResultSchema.parse({
      schema: "art/journey-result/v1",
      journeyId: "keyboard.focus-trace",
      journeyVersion: VERSION,
      kind: "keyboard_focus",
      surfaceId,
      url,
      outcome: "incomplete",
      title: "Keyboard focus trace",
      summary: "No keyboard focus target was observed in the bounded trace.",
      evidence,
      safety: safety(),
      aiCalls: 0,
    });
  }

  const clearlyVisible = steps.filter((step) => {
    const outline = step.outlineStyle !== "none" && step.outlineWidth !== "0px";
    const shadow = step.boxShadow !== "none";
    return step.focusVisible && (outline || shadow);
  }).length;

  return JourneyResultSchema.parse({
    schema: "art/journey-result/v1",
    journeyId: "keyboard.focus-trace",
    journeyVersion: VERSION,
    kind: "keyboard_focus",
    surfaceId,
    url,
    outcome: clearlyVisible === steps.length ? "pass" : "incomplete",
    title: "Keyboard focus trace",
    summary: clearlyVisible === steps.length
      ? `All ${steps.length} sampled keyboard focus targets exposed a visible focus indicator heuristic.`
      : `${clearlyVisible}/${steps.length} sampled focus targets had a clearly detectable focus indicator; review remaining states manually.`,
    evidence,
    safety: safety(),
    aiCalls: 0,
  });
}

async function skipLinkJourney(page: Page, surfaceId: string, url: string): Promise<JourneyResult> {
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

    const id = decodeURIComponent(data.href.slice(1));
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

async function expandableJourney(page: Page, surfaceId: string, url: string): Promise<JourneyResult> {
  const candidates = page.locator('[aria-expanded]');
  const count = Math.min(await candidates.count(), 8);
  const evidence = [];
  let tested = 0;
  let toggled = 0;

  for (let i = 0; i < count; i += 1) {
    const candidate = candidates.nth(i);
    if (!(await isSafeActivationTarget(candidate))) continue;

    const before = await candidate.getAttribute("aria-expanded");
    if (before !== "true" && before !== "false") continue;

    tested += 1;
    await candidate.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    const after = await candidate.getAttribute("aria-expanded");

    evidence.push({
      action: "Enter on safe aria-expanded control",
      selector: null,
      before: { ariaExpanded: before },
      after: { ariaExpanded: after },
    });

    if (after !== before && (after === "true" || after === "false")) {
      toggled += 1;
      await page.keyboard.press("Enter").catch(() => undefined);
      await page.waitForTimeout(50);
    }
  }

  if (!tested) {
    return JourneyResultSchema.parse({
      schema: "art/journey-result/v1",
      journeyId: "expandable.aria-expanded",
      journeyVersion: VERSION,
      kind: "expandable",
      surfaceId,
      url,
      outcome: "inapplicable",
      title: "Expandable controls",
      summary: "No safe aria-expanded controls were found.",
      evidence,
      safety: safety(),
      aiCalls: 0,
    });
  }

  return JourneyResultSchema.parse({
    schema: "art/journey-result/v1",
    journeyId: "expandable.aria-expanded",
    journeyVersion: VERSION,
    kind: "expandable",
    surfaceId,
    url,
    outcome: toggled === tested ? "pass" : "incomplete",
    title: "Expandable controls",
    summary: toggled === tested
      ? `All ${tested} sampled safe expandable controls changed aria-expanded state via keyboard activation.`
      : `${toggled}/${tested} sampled safe expandable controls changed aria-expanded state; remaining controls need review.`,
    evidence,
    safety: safety(),
    aiCalls: 0,
  });
}

async function dialogJourney(page: Page, surfaceId: string, url: string): Promise<JourneyResult> {
  const triggers = page.locator('[aria-haspopup="dialog"], [aria-controls]');
  const count = Math.min(await triggers.count(), 12);

  for (let i = 0; i < count; i += 1) {
    const trigger = triggers.nth(i);
    if (!(await isSafeActivationTarget(trigger))) continue;

    const meta = await trigger.evaluate((element) => ({
      ariaHaspopup: element.getAttribute("aria-haspopup"),
      ariaControls: element.getAttribute("aria-controls"),
    }));

    if (meta.ariaHaspopup !== "dialog" && !meta.ariaControls) continue;

    const beforeFocus = await trigger.evaluate((element) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
    }));

    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);

    const dialog = page.locator('[role="dialog"]:visible, dialog[open]').first();
    if (!(await dialog.count())) {
      return JourneyResultSchema.parse({
        schema: "art/journey-result/v1",
        journeyId: "dialog.focus-behavior",
        journeyVersion: VERSION,
        kind: "dialog",
        surfaceId,
        url,
        outcome: "incomplete",
        title: "Dialog focus behavior",
        summary: "A safe dialog-like trigger was activated, but no visible dialog could be deterministically identified.",
        evidence: [{
          action: "Enter on dialog-like trigger",
          selector: null,
          before: beforeFocus,
          after: meta,
        }],
        safety: safety(),
        aiCalls: 0,
      });
    }

    const focusInside = await page.evaluate(() => {
      const active = document.activeElement;
      const dialog = document.querySelector('[role="dialog"], dialog[open]');
      return Boolean(active && dialog && dialog.contains(active));
    });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);

    const returned = await trigger.evaluate((element) => document.activeElement === element).catch(() => false);

    return JourneyResultSchema.parse({
      schema: "art/journey-result/v1",
      journeyId: "dialog.focus-behavior",
      journeyVersion: VERSION,
      kind: "dialog",
      surfaceId,
      url,
      outcome: focusInside && returned ? "pass" : "incomplete",
      title: "Dialog focus behavior",
      summary: focusInside && returned
        ? "Dialog activation moved focus inside and Escape returned focus to the trigger."
        : "Dialog was identified, but focus movement/return behavior needs review.",
      evidence: [{
        action: "open then Escape dialog",
        selector: null,
        before: beforeFocus,
        after: { focusInside, focusReturnedToTrigger: returned },
      }],
      safety: safety(),
      aiCalls: 0,
    });
  }

  return JourneyResultSchema.parse({
    schema: "art/journey-result/v1",
    journeyId: "dialog.focus-behavior",
    journeyVersion: VERSION,
    kind: "dialog",
    surfaceId,
    url,
    outcome: "inapplicable",
    title: "Dialog focus behavior",
    summary: "No safe dialog trigger was found.",
    evidence: [],
    safety: safety(),
    aiCalls: 0,
  });
}

export async function runSafeJourneys(
  input: string,
  outDir: string,
  options: { browser?: Browser; surfaceId?: string } = {},
): Promise<JourneyRun> {
  const target = await validatePublicTarget(input);
  await mkdir(outDir, { recursive: true });

  const ownsBrowser = !options.browser;
  const browser = options.browser ?? await chromium.launch({ headless: true });
  const surfaceId = options.surfaceId ?? "surface_root";

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: "AccessibilityRedTeam/0.1 (+public accessibility research)",
    });
    const page = await context.newPage();
    try {
      const response = await page.goto(target.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      if (!response || response.status() >= 400) {
        throw new Error(`Journey target returned HTTP ${response?.status() ?? "unknown"}.`);
      }
      await settle(page);

      const finalTarget = await validatePublicTarget(page.url());
      if (finalTarget.hostname !== target.hostname) {
        throw new Error(`Cross-host redirect blocked: ${target.hostname} → ${finalTarget.hostname}`);
      }

      const results = [
        await keyboardFocusJourney(page, surfaceId, finalTarget.toString()),
        await skipLinkJourney(page, surfaceId, finalTarget.toString()),
        await expandableJourney(page, surfaceId, finalTarget.toString()),
        await dialogJourney(page, surfaceId, finalTarget.toString()),
      ];

      const run = JourneyRunSchema.parse({
        schema: "art/journey-run/v1",
        generatedAt: new Date().toISOString(),
        surfaceId,
        url: finalTarget.toString(),
        results,
        aiCalls: 0,
      });

      await writeFile(join(outDir, "journey-results.json"), JSON.stringify(run, null, 2));
      return run;
    } finally {
      await context.close();
    }
  } finally {
    if (ownsBrowser) await browser.close();
  }
}
