const TOKEN_BYTES = 32;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function createLeaseToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function hashLeaseToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function leaseToken(request: Request): string {
  const token = request.headers.get("x-run-lease-token") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Missing or invalid run lease token");
  return token;
}

export function leaseExpiry(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1000).toISOString();
}
