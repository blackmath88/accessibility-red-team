import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type OperatorPermission = "read" | "execute" | "outreach";

export type AuthenticatedActor = {
  id: string;
  kind: "operator" | "runner";
  email?: string;
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

function configured(value: string): boolean {
  return value.length > 0 && !value.includes("PENDING");
}

function emailSet(value: string): Set<string> {
  return new Set(value.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean));
}

export class HttpAuthError extends Error {
  constructor(readonly status: 401 | 403 | 503, message: string) {
    super(message);
  }
}

export async function authenticateOperator(
  request: Request,
  env: Env,
  permission: OperatorPermission,
): Promise<AuthenticatedActor> {
  if (!configured(env.ACCESS_TEAM_DOMAIN) || !configured(env.ACCESS_AUD)) {
    throw new HttpAuthError(503, "Cloudflare Access is not configured");
  }

  const token = accessToken(request);
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  const keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keys, { issuer, audience: env.ACCESS_AUD }));
  } catch {
    throw new HttpAuthError(401, "Invalid Cloudflare Access token");
  }

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  const lists: Record<OperatorPermission, string> = {
    read: env.OPERATOR_READ_EMAILS,
    execute: env.OPERATOR_EXECUTE_EMAILS,
    outreach: env.OPERATOR_OUTREACH_EMAILS,
  };
  if (!email || !emailSet(lists[permission]).has(email)) {
    throw new HttpAuthError(403, `Operator lacks ${permission} permission`);
  }
  return { id: `operator:${email}`, kind: "operator", email, claims: payload };
}

export async function authenticateRunner(request: Request, env: Env): Promise<AuthenticatedActor> {
  const token = bearer(request);
  const keys = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
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
  return { id: `runner:${String(payload.run_id)}`, kind: "runner", claims: payload };
}
