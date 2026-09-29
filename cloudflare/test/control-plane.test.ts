import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeJwt } from "jose";
import { dispatchAssessmentRun } from "../src/github.js";
import { artifactStorageKey } from "../src/r2-artifacts.js";

test("migration makes evidence and audit metadata append-only", async () => {
  const migration = await readFile(new URL("../migrations/0001_control_center.sql", import.meta.url), "utf8");
  for (const table of ["organizations", "digital_properties", "assessment_cases", "runs", "artifacts", "contacts", "outreach", "audit_events"]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table} \\(`));
  }
  assert.match(migration, /CREATE TRIGGER artifacts_no_update/);
  assert.match(migration, /CREATE TRIGGER artifacts_no_delete/);
  assert.match(migration, /CREATE TRIGGER audit_events_no_update/);
  assert.match(migration, /CREATE TRIGGER audit_events_no_delete/);
});

test("artifact keys are deterministic and content-addressed", () => {
  const digest = "ab".repeat(32);
  assert.equal(artifactStorageKey(digest), `sha256/ab/${digest}`);
  assert.throws(() => artifactStorageKey("not-a-digest"));
});

test("GitHub dispatch exchanges an app JWT for a repository-scoped token", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/access_tokens")) {
      return Response.json({ token: "short-lived-installation-token", expires_at: "2026-09-29T12:00:00Z" }, { status: 201 });
    }
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ workflow_run_id: 42, html_url: "https://github.test/run/42" }, { status: 200 });
  };
  const env = {
    GITHUB_APP_ID: "1234",
    GITHUB_APP_INSTALLATION_ID: "5678",
    GITHUB_OWNER: "blackmath88",
    GITHUB_REPO: "accessibility-red-team",
    GITHUB_WORKFLOW: "assessment-runner.yml",
    GITHUB_REF: "main",
    GITHUB_APP_PRIVATE_KEY: privateKeyPem,
  } as const;

  const result = await dispatchAssessmentRun(env, "run_123", "a".repeat(40), mockFetch);
  assert.equal(result.workflowRunId, "42");
  assert.equal(calls.length, 3);
  const tokenRequest = JSON.parse(String(calls[0]?.init?.body));
  assert.deepEqual(tokenRequest, { repositories: ["accessibility-red-team"], permissions: { actions: "write" } });
  const jwt = new Headers(calls[0]?.init?.headers).get("authorization")?.replace("Bearer ", "") ?? "";
  const claims = decodeJwt(jwt);
  assert.equal(claims.iss, "1234");
  assert.ok(Number(claims.exp) - Number(claims.iat) <= 600);
  const dispatchRequest = JSON.parse(String(calls[1]?.init?.body));
  assert.deepEqual(dispatchRequest.inputs, { control_run_id: "run_123", engine_revision: "a".repeat(40) });
  assert.equal(calls[2]?.url, "https://api.github.com/installation/token");
  assert.equal(calls[2]?.init?.method, "DELETE");
});
