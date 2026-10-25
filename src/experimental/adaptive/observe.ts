// Bounded page observation. Produces DOM-derived facts only. This is NOT a faithful screen-reader transcript:
// accessible names are an approximation of the accname algorithm.
import type { Page } from "playwright";
import { CLASSIFY_ACTIVATION_SRC, type SessionPolicy } from "./policy.js";
import type { ElementFacts, Observation } from "./contracts.js";

export const ELEMENT_SELECTOR = "a[href],button,[role=button],[aria-controls],[aria-expanded],[aria-haspopup],input,select,textarea,summary";
const MAX_ELEMENTS = 150;
const MAX_LINKS = 80;

type RawElement = {
  index: number; tag: string; role: string | null; type: string | null; name: string; id: string | null; visible: boolean;
  expanded: "true" | "false" | null; controls: string | null; controlsRole: string | null; haspopup: string | null; href: string | null;
  inForm: boolean; disabled: boolean; safe: boolean; safetyReason: string; hint: string;
};
type RawPage = {
  title: string; lang: string | null; headings: Array<{ level: number; text: string }>; landmarks: Array<{ role: string; name: string }>;
  elements: RawElement[];
  skipLinks: Array<{ index: number; text: string; href: string; targetExists: boolean; targetTag: string | null; targetIsMain: boolean }>;
  dialogs: Array<{ role: string; name: string; visible: boolean; containsFocus: boolean }>;
  focus: { tag: string; role: string | null; name: string; id: string | null; isBody: boolean; fingerprint: string } | null;
  text: string;
};

const OBSERVE_SRC = `(args) => {
  const classify = ${CLASSIFY_ACTIVATION_SRC};
  const textOf = (n) => (n.textContent || "").replace(/\\s+/g, " ").trim();
  const accName = (el) => {
    const aria = el.getAttribute("aria-label"); if (aria && aria.trim()) return aria.trim();
    const lb = el.getAttribute("aria-labelledby");
    if (lb) { const t = lb.split(/\\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(textOf).join(" ").trim(); if (t) return t; }
    if (el.labels && el.labels.length) { const t = Array.from(el.labels).map(textOf).join(" ").trim(); if (t) return t; }
    const tag = el.tagName.toLowerCase();
    if (tag === "input" && ["button", "submit", "reset"].includes(el.type)) return el.value || "";
    if (tag === "input" && el.type === "image") return el.alt || "";
    const t = textOf(el); if (t) return t;
    const img = el.querySelector("img[alt]"); if (img && img.alt.trim()) return img.alt.trim();
    const svgTitle = el.querySelector("svg title"); if (svgTitle && textOf(svgTitle)) return textOf(svgTitle);
    const title = el.getAttribute("title"); if (title && title.trim()) return title.trim();
    return "";
  };
  const hint = (el) => {
    const parts = []; let n = el;
    for (let i = 0; n && n.nodeType === 1 && i < 4; i += 1) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + "#" + n.id); break; }
      if (typeof n.className === "string" && n.className.trim()) s += "." + n.className.trim().split(/\\s+/).slice(0, 2).join(".");
      const p = n.parentElement;
      if (p) s += ":nth-child(" + (Array.from(p.children).indexOf(n) + 1) + ")";
      parts.unshift(s); n = p;
    }
    return parts.join(" > ");
  };
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none";
  };
  const nodes = Array.from(document.querySelectorAll(args.selector)).slice(0, args.maxElements);
  const elements = nodes.map((el, index) => {
    const tag = el.tagName.toLowerCase();
    const controlsId = el.getAttribute("aria-controls");
    const controlled = controlsId ? document.getElementById(controlsId.split(/\\s+/)[0]) : null;
    const [safe, safetyReason] = classify(el);
    const expanded = el.getAttribute("aria-expanded");
    return {
      index, tag, role: el.getAttribute("role"), type: tag === "input" ? (el.getAttribute("type") || "text") : el.getAttribute("type"),
      name: accName(el).slice(0, 160), id: el.id || null, visible: visible(el),
      expanded: expanded === "true" || expanded === "false" ? expanded : null,
      controls: controlsId, controlsRole: controlled ? (controlled.getAttribute("role") || controlled.tagName.toLowerCase()) : null,
      haspopup: el.getAttribute("aria-haspopup"), href: tag === "a" ? el.href : null,
      inForm: Boolean(el.closest("form")), disabled: Boolean(el.disabled) || el.getAttribute("aria-disabled") === "true",
      safe, safetyReason, hint: hint(el).slice(0, 200),
    };
  });
  const skipLinks = [];
  nodes.forEach((el, index) => {
    if (el.tagName.toLowerCase() !== "a") return;
    const href = el.getAttribute("href") || "";
    if (!href.startsWith("#") || href.length < 2) return;
    const text = textOf(el);
    if (!/skip|jump|zum inhalt|zum hauptinhalt|direkt zum|hauptinhalt/i.test(text)) return;
    let target = null;
    try { target = document.getElementById(decodeURIComponent(href.slice(1))); } catch (e) { target = null; }
    skipLinks.push({ index, text: text.slice(0, 80), href, targetExists: Boolean(target), targetTag: target ? target.tagName.toLowerCase() : null, targetIsMain: Boolean(target && (target.tagName.toLowerCase() === "main" || target.getAttribute("role") === "main")) });
  });
  const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).slice(0, 30).map((h) => ({ level: Number(h.tagName[1]), text: textOf(h).slice(0, 120) }));
  const landmarkRole = { main: "main", nav: "navigation", header: "banner", footer: "contentinfo", aside: "complementary" };
  const landmarks = Array.from(document.querySelectorAll("main,nav,header,footer,aside,[role=main],[role=navigation],[role=banner],[role=contentinfo],[role=search],[role=complementary]")).slice(0, 20)
    .map((l) => ({ role: l.getAttribute("role") || landmarkRole[l.tagName.toLowerCase()] || l.tagName.toLowerCase(), name: (l.getAttribute("aria-label") || "").slice(0, 80) }));
  const active = document.activeElement;
  const dialogs = Array.from(document.querySelectorAll("[role=dialog],[role=alertdialog],dialog")).slice(0, 8).map((d) => ({
    role: d.getAttribute("role") || "dialog", name: (d.getAttribute("aria-label") || (d.getAttribute("aria-labelledby") ? accName(d) : "")).slice(0, 80),
    visible: d.tagName.toLowerCase() === "dialog" ? d.open : visible(d), containsFocus: Boolean(active && d.contains(active)),
  }));
  let focus = null;
  if (active) {
    const tag = active.tagName.toLowerCase();
    const name = tag === "body" || tag === "html" ? "" : accName(active).slice(0, 160);
    focus = { tag, role: active.getAttribute("role"), name, id: active.id || null, isBody: tag === "body" || tag === "html", fingerprint: tag + "|" + (active.id || "") + "|" + name };
  }
  return {
    title: document.title || "", lang: document.documentElement.getAttribute("lang"), headings, landmarks, elements, skipLinks, dialogs, focus,
    text: (document.body ? document.body.innerText : "").replace(/\\s+/g, " ").trim().slice(0, args.maxText),
  };
}`;

export type LastActivated = { ref: string; tag: string; name: string; id: string | null };

export type ObserveInput = {
  page: Page;
  policy: SessionPolicy;
  step: number;
  lastActivated: LastActivated | null;
  evidence: Observation["evidence"];
  // The session's last model call: only finish is legal.
  finalCall: boolean;
  denials: Array<{ id: string; reason: string; detail: string }>;
  budget: Observation["budget"];
  // Normalised URLs seen as links in earlier observations of this session (the "discovered set").
  discovered: Set<string>;
  visitedSurfaces: Set<string>;
};

export type ObserveOutput = { observation: Observation; elements: Map<string, ElementFacts>; discoveredNow: string[] };

export async function observePage(input: ObserveInput): Promise<ObserveOutput> {
  const { page, policy } = input;
  const script = `(${OBSERVE_SRC})(${JSON.stringify({ selector: ELEMENT_SELECTOR, maxElements: MAX_ELEMENTS, maxText: 1200 })})`;
  let raw: RawPage;
  try {
    raw = await page.evaluate(script) as RawPage;
  } catch {
    // The page navigated under us (script-driven redirect, hash change race): wait for it to settle and look once more.
    await page.waitForLoadState("domcontentloaded");
    raw = await page.evaluate(script) as RawPage;
  }
  const currentUrl = page.url();
  const currentSurface = policy.normalize(currentUrl);

  const controls: ElementFacts[] = [];
  const links: Observation["links"] = [];
  const elements = new Map<string, ElementFacts>();
  const navigableCache = new Map<string, { navigable: boolean; reason: string | null }>();
  const discoveredNow: string[] = [];

  for (const el of raw.elements) {
    const ref = `e${el.index}`;
    const facts: ElementFacts = {
      ref, tag: el.tag, role: el.role, type: el.type, name: el.name, id: el.id, visible: el.visible, expanded: el.expanded,
      controls: el.controls, controlsRole: el.controlsRole, haspopup: el.haspopup, href: el.href, inForm: el.inForm, disabled: el.disabled,
      hasAccessibleName: el.name.length > 0, safeToActivate: el.safe && el.visible, safetyReason: el.visible ? el.safetyReason : "not_visible", selectorHint: el.hint,
    };
    elements.set(ref, facts);
    const samePageFragment = Boolean(el.href) && el.href!.includes("#") && el.href!.split("#")[0] === currentUrl.split("#")[0];
    const plainLink = el.tag === "a" && Boolean(el.href) && !samePageFragment && !(el.expanded || el.controls || el.haspopup);
    if (plainLink) {
      if (links.length >= MAX_LINKS) continue;
      let verdict = navigableCache.get(el.href!);
      if (!verdict) {
        const decision = await policy.checkNavigationTarget(el.href!);
        verdict = { navigable: decision.allow, reason: decision.allow ? null : decision.reason };
        navigableCache.set(el.href!, verdict);
      }
      const normalized = policy.normalize(el.href!);
      if (verdict.navigable) discoveredNow.push(normalized);
      links.push({
        ref, name: el.name, hasAccessibleName: el.name.length > 0, href: el.href!, visible: el.visible, sameOrigin: policy.isAllowedOrigin(el.href!),
        navigable: verdict.navigable, denyReason: verdict.reason, selectorHint: el.hint,
      });
    } else {
      controls.push(facts);
    }
  }
  // Every URL seen as a link, including off-origin ones, is part of the discovered set so that a model asking for it gets the precise denial.
  for (const link of links) input.discovered.add(policy.normalize(link.href));

  const navigate = Array.from(new Set(links.filter((link) => link.navigable).map((link) => policy.normalize(link.href)))).filter((url) => url !== currentSurface);
  const surfacesLeft = Math.max(0, input.budget.surfacesLeft);
  const legalNavigate = navigate.filter((url) => input.visitedSurfaces.has(url) || surfacesLeft > 0);

  const lastFingerprint = input.lastActivated ? `${input.lastActivated.tag}|${input.lastActivated.id ?? ""}|${input.lastActivated.name}` : null;
  const observation: Observation = {
    step: input.step, url: currentUrl, title: raw.title, lang: raw.lang, timestamp: new Date().toISOString(),
    headings: raw.headings, landmarks: raw.landmarks, links, controls,
    skipLinks: raw.skipLinks.map((skip) => ({ ref: `e${skip.index}`, text: skip.text, href: skip.href, targetExists: skip.targetExists, targetTag: skip.targetTag, targetIsMain: skip.targetIsMain })),
    dialogs: raw.dialogs,
    focus: raw.focus ? { tag: raw.focus.tag, role: raw.focus.role, name: raw.focus.name, id: raw.focus.id, isBody: raw.focus.isBody, matchesLastActivated: lastFingerprint !== null && raw.focus.fingerprint === lastFingerprint } : null,
    lastActivated: input.lastActivated,
    pageTextExcerpt: raw.text,
    // The executor fills recentActions: whether the last action changed anything is only known once this observation exists.
    evidence: input.evidence.slice(-12), recentActions: [], finalCall: input.finalCall, recentDenials: input.denials.slice(-5), budget: input.budget,
    legal: input.finalCall ? { navigate: [], activate: [], simple: ["finish"] } : {
      navigate: legalNavigate.slice(0, MAX_LINKS),
      activate: controls.filter((control) => control.safeToActivate).map((control) => control.ref),
      simple: ["inspect_semantics", "focus_next", "focus_prev", "escape", "scroll", "capture_evidence", "finish", "unknown"],
    },
  };
  return { observation, elements, discoveredNow };
}
