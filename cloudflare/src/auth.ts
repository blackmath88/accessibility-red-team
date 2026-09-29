import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type OperatorPermission = "read" | "execute" | "outreach";

export type AuthenticatedActor = {
  id: string;
  kind: "operator" | "runner";
  email?: string;
  provider?: "nebuchadnezzar_worker" | "github_actions";
  workerId?: string;
  claims: JWTPayload;
};

function bearer(request: Request): string {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) throw new HttpAuthError(401, "Missing bearer token");
  return value.slice("Bearer ".length);
}

function accessToken(request: Request): string {
  const value = request.headers.get("cf-access-jwt-assertion");
  if (!value) throw new HttpAuthError(401, "Missing Cloudflare Access token");
  return value;
}

// One JWKS resolver per issuer per isolate, so key sets are cached rather than refetched per request.
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function remoteKeys(url: string): ReturnType<typeof createRemoteJWKSet> {
  let keys = keySets.get(url);
  if (!keys) { keys = createRemoteJWKSet(new URL(url)); keySets.set(url, keys); }
  return keys;
}

function configured(value: string): boolean {
  return value.length > 0 && !value.includes("PENDING");
}

export class HttpAuthError extends Error {
  constructor(readonly status: 401 | 403 | 503, message: string) {
    super(message);
  }
}

export async function authenticateOperator(
  request: Request,
  env: Env,
): Promise<AuthenticatedActor> {
  if (!configured(env.ACCESS_TEAM_DOMAIN) || !configured(env.ACCESS_AUD)) {
    throw new HttpAuthError(503, "Cloudflare Access is not configured");
  }

  const token = accessToken(request);
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  const keys = remoteKeys(`${issuer}/cdn-cgi/access/certs`);
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keys, { issuer, audience: env.ACCESS_AUD }));
  } catch {
    throw new HttpAuthError(401, "Invalid Cloudflare Access token");
  }

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  if (!email) throw new HttpAuthError(403, "Access token has no operator email");
  return { id: `operator:${email}`, kind: "operator", email, claims: payload };
}

export async function authenticateGitHubRunner(request: Request, env: Env): Promise<AuthenticatedActor> {
  const token = bearer(request);
  const keys = remoteKeys("https://token.actions.githubusercontent.com/.well-known/jwks");
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: env.GITHUB_OIDC_AUDIENCE,
    }));
  } catch {
    throw new HttpAuthError(401, "Invalid GitHub Actions OIDC token");
  }

  const repository = `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  const workflowPrefix = `${repository}/.github/workflows/${env.GITHUB_WORKFLOW}@`;
  if (payload.repository !== repository ||
      typeof payload.workflow_ref !== "string" ||
      !payload.workflow_ref.startsWith(workflowPrefix) ||
      payload.event_name !== "workflow_dispatch") {
    throw new HttpAuthError(403, "OIDC token is not from the approved runner workflow");
  }
  const workerId = `github-actions:${String(payload.run_id)}`;
  return { id: `runner:${workerId}`, kind: "runner", provider: "github_actions", workerId, claims: payload };
}

export async function authenticateNebuchadnezzar(request: Request, env: Env): Promise<AuthenticatedActor> {
  if (!configured(env.ACCESS_TEAM_DOMAIN) || !configured(env.ACCESS_AUD) ||
      !configured(env.NEBUCHADNEZZAR_ACCESS_CLIENT_ID)) {
    throw new HttpAuthError(503, "Nebuchadnezzar Access identity is not configured");
  }
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  const keys = remoteKeys(`${issuer}/cdn-cgi/access/certs`);
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(accessToken(request), keys, { issuer, audience: env.ACCESS_AUD }));
  } catch {
    throw new HttpAuthError(401, "Invalid Cloudflare Access service token");
  }
  if (payload.common_name !== env.NEBUCHADNEZZAR_ACCESS_CLIENT_ID) {
    throw new HttpAuthError(403, "Access token is not the approved Nebuchadnezzar service identity");
  }
  return {
    id: `runner:${env.NEBUCHADNEZZAR_WORKER_ID}`,
    kind: "runner",
    provider: "nebuchadnezzar_worker",
    workerId: env.NEBUCHADNEZZAR_WORKER_ID,
    claims: payload,
  };
}
