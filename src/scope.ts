import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(Number.isNaN)) return true;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !isPrivateIPv4(ip);
  if (family === 6) return !isPrivateIPv6(ip);
  return false;
}

export async function validatePublicTarget(input: string): Promise<URL> {
  const url = new URL(input);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only public HTTP(S) targets are allowed.");
  }

  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not allowed.");
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) {
    throw new Error("Local targets are not allowed.");
  }

  if (isIP(host)) {
    if (!isPublicIp(host)) throw new Error("Private or local IP targets are not allowed.");
    return url;
  }

  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length) throw new Error("Target hostname did not resolve.");

  for (const { address } of addresses) {
    if (!isPublicIp(address)) {
      throw new Error("Target resolves to a private or local network address.");
    }
  }

  return url;
}
