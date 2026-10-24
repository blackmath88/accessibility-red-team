import { createHash } from "node:crypto";
import type { Page } from "playwright";
import type { SurfaceKind } from "./contracts.js";

// `gesuch(?!t)`: Gesuch/Baugesuch/Gesuche, but not "gesucht" (wanted ads).
const FORM_TERMS = /formular|form|antrag|gesuch(?!t)|meldung|anmeld|kontakt/i;
const SERVICE_TERMS = /dienstleistung|service|schalter|verwaltung|bewilligung|abfall|umzug|steuer/i; // "gemeinde" is deliberately absent: it is in nearly every municipal page title
const DIRECTORY_TERMS = /dienstleistungen|services|online-schalter|themen|a-z|verzeichnis|übersicht|uebersicht/i;
const SEARCH_TERMS = /(?:^|[\s/\-_])(suche|search)(?:$|[\s/\-_.])/i;
const ARTICLE_TERMS = /news|aktuell|mitteilung|artikel|meldung|veranstaltung/i;
// CMS-dated post path: /YYYY/MM/<slug> or /YYYY/MM/DD/<slug>. Needs a real slug, so /2024/04/, /2024/04/15/,
// /2024/04/page, /2024/04/page/2/ (archives) and year-only paths like /2024/steuern/formular do not match. A slug with a file
// extension (/2024/04/index.html, /2024/04/x.pdf) is a file, not a post, and media under /uploads/YYYY/MM/ is never a post.
const DATED_POST_PATH = /(?<!\/uploads)\/(?:19|20)\d{2}\/(?:0[1-9]|1[0-2])\/(?:(?:0[1-9]|[12]\d|3[01])\/)?(?!page(?:\/|$))(?![^/]*\.[a-z0-9]{2,5}(?:\/|$))(?=[^/]*[a-z])[^/]+/i;
const ARCHIVE_TERMS = /archiv/i;

const pathOf = (url: string) => { try { return new URL(url).pathname; } catch { return url; } };

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

  // A dated slug alone is not news: it must also carry no form fields and no archive wording. Form-like and
  // service-like wording was already decided above, so a dated service page keeps its service kind.
  if (DATED_POST_PATH.test(pathOf(input.url)) && input.substantiveFormFields === 0 && !ARCHIVE_TERMS.test(haystack)) {
    return { kind: "article", reason: "dated post path without form signals" };
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
