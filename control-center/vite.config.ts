import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { publicView } from "../src/experimental/campaign/projection";

// Local read-only adapter for the experimental campaign (runs/campaign/<id>, gitignored). GET only; it serves the
// validated public projection, never files, prompts or paths, and offers no controls. Dev and preview servers only.
const CAMPAIGNS = fileURLToPath(new URL("../runs/campaign/", import.meta.url));
const ID = /^[a-z0-9][a-z0-9-]{2,39}$/;
const campaignApi: Connect.NextHandleFunction = async (req, res, next) => {
  if (!req.url?.startsWith("/campaign-api/")) return next();
  const send = (code: number, body: unknown) => { res.statusCode = code; res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(body)); };
  if (req.method !== "GET") return send(405, { error: "read-only" });
  try {
    const path = req.url.split("?")[0]!;
    if (path === "/campaign-api/campaigns") {
      const ids = (await readdir(CAMPAIGNS).catch(() => [] as string[])).filter((d) => ID.test(d));
      const rows = await Promise.all(ids.map(async (id) => { try { const s = JSON.parse(await readFile(join(CAMPAIGNS, id, "state.json"), "utf8")); return { id, status: s.status, updatedAt: s.updatedAt }; } catch { return null; } }));
      return send(200, rows.filter(Boolean).sort((a, b) => String(b!.updatedAt).localeCompare(String(a!.updatedAt))));
    }
    const m = /^\/campaign-api\/state\/([a-z0-9-]+)$/.exec(path);
    if (m && ID.test(m[1]!)) {
      const [s, c] = await Promise.all([readFile(join(CAMPAIGNS, m[1]!, "state.json"), "utf8"), readFile(join(CAMPAIGNS, m[1]!, "config.json"), "utf8")]);
      return send(200, publicView(JSON.parse(s), JSON.parse(c).limits));
    }
    return send(404, { error: "not found" });
  } catch { return send(503, { error: "campaign state unavailable" }); }
};
const campaign = (): Plugin => ({ name: "campaign-api", configureServer: (s) => { s.middlewares.use(campaignApi); }, configurePreviewServer: (s) => { s.middlewares.use(campaignApi); } });

export default defineConfig({ plugins: [react(), campaign()], base: "./" });
