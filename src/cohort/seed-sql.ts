import { isIP } from "node:net";
import { parse } from "yaml";
import { z } from "zod";

// Converts a reviewed evaluation cohort into idempotent D1 seed SQL for Organization →
// DigitalProperty → AssessmentCase. Only public municipal website URLs are accepted; the
// stored property URL is the canonical target every run executes against.
const SiteSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/),
  name: z.string().min(1).max(200),
  canton: z.string().regex(/^[A-Z]{2}$/),
  url: z.string().url(),
});
const CohortSchema = z.object({ id: z.string().min(1), sites: z.array(SiteSchema).min(1).max(50) });

export type SeedSite = z.infer<typeof SiteSchema>;

export function canonicalSeedUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error(`Seed URL must be https: ${input}`);
  if (url.username || url.password) throw new Error(`Seed URL must not contain credentials: ${input}`);
  const host = url.hostname.toLowerCase();
  if (isIP(host) || host === "localhost" || host.endsWith(".local") || !host.includes(".")) throw new Error(`Seed URL must use a public DNS name: ${input}`);
  if (url.port) throw new Error(`Seed URL must use the default port: ${input}`);
  url.hash = "";
  return url;
}

const sql = (value: string | null) => value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;

export function cohortSeedSql(yamlText: string, options: { caseSuffix: string; now: string }): { cohortId: string; sites: SeedSite[]; sql: string } {
  if (!/^[a-z0-9-]{1,40}$/.test(options.caseSuffix)) throw new Error("caseSuffix must be a short slug");
  const cohort = CohortSchema.parse(parse(yamlText));
  const ids = new Set<string>();
  const statements: string[] = [];
  for (const site of cohort.sites) {
    if (ids.has(site.id)) throw new Error(`Duplicate site id: ${site.id}`);
    ids.add(site.id);
    const url = canonicalSeedUrl(site.url).toString();
    const propertyId = `${site.id}:main-web`;
    const caseId = `${site.id}:${options.caseSuffix}`;
    statements.push(
      `INSERT OR IGNORE INTO organizations (id, schema_version, type, name, country, canton, created_at, updated_at) VALUES (${sql(site.id)}, 'art/control-center-organization/v1', 'municipality', ${sql(site.name)}, 'CH', ${sql(site.canton)}, ${sql(options.now)}, ${sql(options.now)});`,
      `INSERT OR IGNORE INTO digital_properties (id, schema_version, organization_id, kind, url, active) VALUES (${sql(propertyId)}, 'art/control-center-property/v1', ${sql(site.id)}, 'website', ${sql(url)}, 1);`,
      `INSERT OR IGNORE INTO assessment_cases (id, schema_version, organization_id, property_id, kind, state, created_at, updated_at) VALUES (${sql(caseId)}, 'art/control-center-case/v1', ${sql(site.id)}, ${sql(propertyId)}, 'accessibility_assessment', 'READY', ${sql(options.now)}, ${sql(options.now)});`,
    );
  }
  return { cohortId: cohort.id, sites: cohort.sites, sql: `${statements.join("\n")}\n` };
}

export function operatorSeedSql(input: { email: string; displayName: string; now: string }): string {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/.test(email)) throw new Error("Operator email is invalid");
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 200) throw new Error("Operator display name is invalid");
  const id = `operator_${email.replace(/[^a-z0-9]+/g, "_")}`;
  // Read + execute only. Outreach permission is never granted by automation.
  return `INSERT OR IGNORE INTO operators (id, email, display_name, can_read, can_execute, can_outreach, active, created_at, updated_at) VALUES (${sql(id)}, ${sql(email)}, ${sql(displayName)}, 1, 1, 0, 1, ${sql(input.now)}, ${sql(input.now)});\n`;
}
