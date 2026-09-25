import test from "node:test";
import assert from "node:assert/strict";
import { parseRobotsSitemaps, parseSitemapLocations } from "../src/scout/seeds.js";

test("extracts Sitemap directives from robots.txt", () => {
  const text = [
    "User-agent: *",
    "Disallow: /admin",
    "Sitemap: https://example.ch/sitemap.xml",
    "sitemap: https://example.ch/services.xml",
  ].join("\n");

  assert.deepEqual(parseRobotsSitemaps(text), [
    "https://example.ch/sitemap.xml",
    "https://example.ch/services.xml",
  ]);
});

test("extracts and unescapes sitemap locations", () => {
  const xml = `<?xml version="1.0"?>
  <urlset>
    <url><loc>https://example.ch/a</loc></url>
    <url><loc>https://example.ch/search?a=1&amp;b=2</loc></url>
  </urlset>`;

  assert.deepEqual(parseSitemapLocations(xml), [
    "https://example.ch/a",
    "https://example.ch/search?a=1&b=2",
  ]);
});
