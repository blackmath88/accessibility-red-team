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
    (a === 100 && b >= 64 && b <= 127) || // CGNAT, including Tailscale tailnet addresses
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

// Expands an IPv6 address (any textual form, including an embedded dotted quad) to eight 16-bit groups, or null if malformed.
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().replace(/%.*$/, "");
  const quad = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (quad) {
    const p = quad.slice(1).map(Number);
    if (p.some((n) => n > 255)) return null;
    text = `${text.slice(0, quad.index)}${((p[0]! << 8) | p[1]!).toString(16)}:${((p[2]! << 8) | p[3]!).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(":").map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN)) : []);
  const head = parse(halves[0]!);
  const tail = halves.length === 2 ? parse(halves[1]!) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return null;
  const groups = [...head, ...Array<number>(halves.length === 2 ? fill : 0).fill(0), ...tail];
  return groups.some(Number.isNaN) ? null : groups;
}

const ipv4Of = (high: number, low: number) => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;

function isPrivateIPv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  // Forms that embed an IPv4 address are judged by that address: IPv4-compatible and the unspecified/loopback addresses (::/96),
  // IPv4-mapped (::ffff:0:0/96), SIIT IPv4-translated (::ffff:0:0:0/96), NAT64 well-known prefix (64:ff9b::/96) and 6to4 (2002::/16).
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0 || g5 === 0xffff)) return isPrivateIPv4(ipv4Of(g6, g7));
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) return isPrivateIPv4(ipv4Of(g6, g7));
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isPrivateIPv4(ipv4Of(g6, g7));
  if (g0 === 0x2002) return isPrivateIPv4(ipv4Of(g1, g2));
  return (
    (g0 === 0x64 && g1 === 0xff9b && g2 === 1) || // local-use NAT64 (64:ff9b:1::/48)
    (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) || // discard-only (100::/64)
    (g0 === 0x2001 && g1 === 0) || // Teredo (2001::/32): tunnels to an arbitrary embedded IPv4
    (g0 === 0x2001 && g1 === 0xdb8) || // documentation (2001:db8::/32)
    (g0 & 0xfe00) === 0xfc00 || // unique local (fc00::/7)
    (g0 & 0xffc0) === 0xfe80 || // link-local (fe80::/10)
    (g0 & 0xffc0) === 0xfec0 || // deprecated site-local (fec0::/10)
    (g0 & 0xff00) === 0xff00 // multicast (ff00::/8)
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

  // WHATWG URL keeps IPv6 literals bracketed in `hostname`; strip them so the literal is checked as an address, not looked up as a name.
  const host = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
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
