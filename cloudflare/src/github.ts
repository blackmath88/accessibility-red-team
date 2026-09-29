import { importPKCS8, SignJWT } from "jose";

export type GitHubDispatchResult = {
  workflowRunId: string | null;
  runUrl: string | null;
};

type GitHubEnv = {
  GITHUB_APP_ID: string;
  GITHUB_APP_INSTALLATION_ID: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_WORKFLOW: string;
  GITHUB_REF: string;
  GITHUB_APP_PRIVATE_KEY: string;
};

function requireConfigured(name: string, value: string): void {
  if (!value || value.includes("PENDING")) throw new Error(`${name} is not configured`);
}

async function githubAppJwt(env: GitHubEnv): Promise<string> {
  requireConfigured("GITHUB_APP_ID", env.GITHUB_APP_ID);
  requireConfigured("GITHUB_APP_PRIVATE_KEY", env.GITHUB_APP_PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(env.GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"), "RS256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 30)
    .setIssuer(env.GITHUB_APP_ID)
    .setExpirationTime(now + 9 * 60)
    .sign(key);
}

async function installationToken(env: GitHubEnv, fetcher: typeof fetch): Promise<string> {
  requireConfigured("GITHUB_APP_INSTALLATION_ID", env.GITHUB_APP_INSTALLATION_ID);
  const jwt = await githubAppJwt(env);
  const response = await fetcher(
    `https://api.github.com/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
        "user-agent": "accessibility-observatory-control-plane",
        "x-github-api-version": "2026-03-10",
      },
      body: JSON.stringify({
        repositories: [env.GITHUB_REPO],
        permissions: { actions: "write" },
      }),
    },
  );
  if (!response.ok) throw new Error(`GitHub installation token request failed (${response.status})`);
  const body = await response.json<{ token?: string }>();
  if (!body.token) throw new Error("GitHub installation token response omitted token");
  return body.token;
}

export async function dispatchAssessmentRun(
  env: GitHubEnv,
  runId: string,
  engineRevision: string,
  fetcher: typeof fetch = fetch,
): Promise<GitHubDispatchResult> {
  const token = await installationToken(env, fetcher);
  try {
    const response = await fetcher(
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "user-agent": "accessibility-observatory-control-plane",
          "x-github-api-version": "2026-03-10",
        },
        body: JSON.stringify({
          ref: env.GITHUB_REF,
          inputs: { control_run_id: runId, engine_revision: engineRevision },
        }),
      },
    );
    if (!response.ok) throw new Error(`GitHub workflow dispatch failed (${response.status})`);
    if (response.status === 204) return { workflowRunId: null, runUrl: null };
    const body = await response.json<{ workflow_run_id?: number; html_url?: string }>();
    return {
      workflowRunId: body.workflow_run_id === undefined ? null : String(body.workflow_run_id),
      runUrl: body.html_url ?? null,
    };
  } finally {
    try {
      const revoke = await fetcher("https://api.github.com/installation/token", {
        method: "DELETE",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "user-agent": "accessibility-observatory-control-plane",
          "x-github-api-version": "2026-03-10",
        },
      });
      if (!revoke.ok) console.warn(JSON.stringify({ event: "github_token_revoke_failed", status: revoke.status }));
    } catch {
      console.warn(JSON.stringify({ event: "github_token_revoke_failed", status: "network_error" }));
    }
  }
}
