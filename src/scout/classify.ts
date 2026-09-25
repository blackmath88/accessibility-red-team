import { createHash } from "node:crypto";
import type { Page } from "playwright";
import type { SurfaceKind } from "./contracts.js";

const FORM_TERMS = /formular|form|antrag|gesuch|meldung|anmeld|kontakt/i;
const SERVICE_TERMS = /dienstleistung|service|schalter|verwaltung|bewilligung|abfall|umzug|steuer|gemeinde/i;
const DIRECTORY_TERMS = /dienstleistungen|services|online-schalter|themen|a-z|verzeichnis|übersicht|uebersicht/i;
const SEARCH_TERMS = /(?:^|[\s/\-_])(suche|search)(?:$|[\s/\-_.])/i;
const ARTICLE_TERMS = /news|aktuell|mitteilung|artikel|meldung|veranstaltung/i;

export function classifyBySignals(input: {
  url: string;
  title: string;
  h1: string;
  formCount: number;
  substantiveFormFields: number;
  searchInputs: number;
  linkCount: number;
  pathDepth: number;
}): { kind: SurfaceKind; reason: string } {
  const haystack = `${input.url} ${input.title} ${input.h1}`;

  if (input.pathDepth === 0) return { kind: "home", reason: "root URL" };

  const explicitlyFormLike = FORM_TERMS.test(haystack);
  if (explicitlyFormLike || input.substantiveFormFields >= 2) {
    return {
      kind: "form",
      reason: explicitlyFormLike
        ? "page URL/title/heading is explicitly form-like"
        : "page contains a substantive multi-field form",
    };
  }

  if (SEARCH_TERMS.test(haystack)) {
    return { kind: "search", reason: "page URL/title/heading identifies a dedicated search surface" };
  }

  if (DIRECTORY_TERMS.test(haystack) && input.linkCount >= 10) {
    return { kind: "directory", reason: "directory wording and dense internal links" };
  }

  if (SERVICE_TERMS.test(haystack)) {
    return { kind: "service", reason: "public-service wording" };
  }

  if (ARTICLE_TERMS.test(haystack)) {
    return { kind: "article", reason: "article/news wording" };
  }

  return { kind: "unknown", reason: "no deterministic archetype signal matched" };
}

export async function inspectPage(page: Page, url: string) {
  const data = await page.evaluate(() => {
    const root = document.body;
    const structural = Array.from(root?.querySelectorAll("*") ?? [])
      .slice(0, 1200)
      .map((el) => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role") ?? "";
        const cls = Array.from(el.classList).slice(0, 2).sort().join(".");
        return `${tag}:${role}:${cls}`;
      })
      .join("|");

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
    const internal = links.filter((a) => {
      try { return new URL(a.href, location.href).host === location.host; } catch { return false; }
    });

    const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
    const substantiveFormFields = forms.reduce((sum, form) => {
      const fields = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"))
        .filter((field) => {
          if (field instanceof HTMLInputElement) {
            return !["hidden", "search", "submit", "button", "reset"].includes(field.type);
          }
          return true;
        });
      return sum + fields.length;
    }, 0);

    return {
      title: document.title || "",
      h1: document.querySelector("h1")?.textContent?.trim() ?? "",
      formCount: forms.length,
      substantiveFormFields,
      searchInputs: document.querySelectorAll('input[type="search"], [role="search"]').length,
      pdfLinks: links.filter((a) => {
        try { return new URL(a.href, location.href).pathname.toLowerCase().endsWith(".pdf"); } catch { return false; }
      }).length,
      internalLinks: internal.length,
      structural,
    };
  });

  const parsed = new URL(url);
  const pathDepth = parsed.pathname.split("/").filter(Boolean).length;
  const classification = classifyBySignals({
    url,
    title: data.title,
    h1: data.h1,
    formCount: data.formCount,
    substantiveFormFields: data.substantiveFormFields,
    searchInputs: data.searchInputs,
    linkCount: data.internalLinks,
    pathDepth,
  });

  return {
    ...data,
    ...classification,
    hasForm: data.formCount > 0,
    structuralFingerprint: createHash("sha256").update(data.structural).digest("hex").slice(0, 16),
  };
}
