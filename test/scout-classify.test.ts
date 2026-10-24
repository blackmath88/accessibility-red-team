import test from "node:test";
import assert from "node:assert/strict";
import { classifyBySignals } from "../src/scout/classify.js";

const base = {
  url: "https://example.ch/foo",
  title: "",
  h1: "",
  formCount: 0,
  substantiveFormFields: 0,
  searchInputs: 0,
  linkCount: 4,
  pathDepth: 1,
};

test("classifies substantive forms deterministically", () => {
  assert.equal(classifyBySignals({ ...base, formCount: 1, substantiveFormFields: 3 }).kind, "form");
});

test("does not classify global search chrome as a form or search page", () => {
  assert.equal(classifyBySignals({ ...base, formCount: 1, searchInputs: 1 }).kind, "unknown");
});

test("classifies a dedicated search URL", () => {
  assert.equal(classifyBySignals({ ...base, url: "https://example.ch/suche" }).kind, "search");
});

test("classifies dense service directories", () => {
  assert.equal(classifyBySignals({
    ...base,
    title: "Dienstleistungen A-Z",
    linkCount: 40,
  }).kind, "directory");
});

test("uses unknown instead of forcing a guess", () => {
  assert.equal(classifyBySignals(base).kind, "unknown");
});

const kindOf = (url: string, over: Partial<typeof base> = {}) =>
  classifyBySignals({ ...base, url, pathDepth: new URL(url).pathname.split("/").filter(Boolean).length, ...over }).kind;

test("Bachs 'gesucht' news post is an article, not a form", () => {
  assert.equal(kindOf("https://bachs.ch/2024/04/gesucht-betreuungsperson-asylsuchende/", {
    title: "Gesucht: Betreuungsperson Asylsuchende – Offizielle Seite der Gemeinde Bachs",
  }), "article");
  // the two defects separately: the substring and the municipality name in the title
  assert.equal(kindOf("https://example.ch/stelle", { title: "Gesucht: Hauswart" }), "unknown");
  assert.equal(kindOf("https://example.ch/stelle", { title: "Offizielle Seite der Gemeinde Bachs" }), "unknown");
});

test("real application forms still classify as form", () => {
  assert.equal(kindOf("https://example.ch/baugesuch", { title: "Baugesuch einreichen" }), "form");
  assert.equal(kindOf("https://example.ch/verwaltung/onlineschalter/anmeldeformular"), "form");
  assert.equal(kindOf("https://example.ch/gesuche", { title: "Gesuche" }), "form");
});

test("dated paths are not news when they are forms, services, archives or have no slug", () => {
  assert.equal(kindOf("https://example.ch/2024/steuern/formular"), "form");
  assert.equal(kindOf("https://example.ch/2023/03/baugesuch-formular/"), "form");
  assert.equal(kindOf("https://example.ch/2023/03/kontakt/", { substantiveFormFields: 4 }), "form");
  assert.equal(kindOf("https://example.ch/2024/04/steuererklaerung-frist/"), "service", "service wording wins over the date");
  assert.equal(kindOf("https://example.ch/2024/04/offene-stelle/", { substantiveFormFields: 1 }), "unknown", "any form field blocks the date rule");
  assert.equal(kindOf("https://example.ch/2024/04/"), "unknown");
  assert.equal(kindOf("https://example.ch/2024/04/15/"), "unknown");
  assert.equal(kindOf("https://example.ch/2024/04/page/2/"), "unknown");
  assert.equal(kindOf("https://example.ch/2024/04/page"), "unknown", "a bare page segment is an archive pager, not a slug");
  assert.equal(kindOf("https://example.ch/2024/04/page/"), "unknown");
  assert.equal(kindOf("https://example.ch/2024/04/index.html"), "unknown", "a file name is not a post slug");
  assert.equal(kindOf("https://example.ch/2024/04/bericht.pdf"), "unknown");
  assert.equal(kindOf("https://example.ch/wp-content/uploads/2024/04/x.pdf"), "unknown", "media uploads are not posts");
  assert.equal(kindOf("https://example.ch/wp-content/uploads/2024/04/foto-sommerfest.jpg"), "unknown");
  assert.equal(kindOf("https://example.ch/2024/04/rueckblick/", { title: "Archiv 2024" }), "unknown");
  assert.equal(kindOf("https://example.ch/2024/steuern/rechner"), "service");
});

test("dated slug without form signals is an article, including day-based paths", () => {
  assert.equal(kindOf("https://example.ch/2024/04/15/neuer-gemeindeschreiber/"), "article");
  assert.equal(kindOf("https://example.ch/2019/11/sommerfest-rueckblick"), "article");
});
