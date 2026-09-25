const ASSET = /\.(?:jpg|jpeg|png|gif|webp|svg|ico|css|js|zip|mp4|mp3|woff2?|ttf)(?:$|\?)/i;
const NOISE = /impressum|datenschutz|privacy|cookie|login|newsletter|facebook|instagram|linkedin|youtube/i;
const SERVICE = /dienstleistung|service|schalter|formular|antrag|gesuch|abfall|umzug|bewilligung|verwaltung|kontakt|suche/i;

export function normalizeUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) {
    const low = key.toLowerCase();
    if (low.startsWith("utm_") || ["fbclid", "gclid", "pk_campaign", "pk_kwd"].includes(low)) {
      url.searchParams.delete(key);
    }
  }
  if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return url.toString();
}

export function candidateScore(url: string, label: string): number {
  const text = decodeURIComponent(`${url} ${label}`).toLowerCase();
  let score = 0;
  if (SERVICE.test(text)) score += 8;
  if (NOISE.test(text)) score -= 8;
  const depth = new URL(url).pathname.split("/").filter(Boolean).length;
  score -= Math.max(0, depth - 3);
  return score;
}

export function eligibleInternalLink(input: string, root: URL): boolean {
  try {
    const url = new URL(input, root);
    return url.protocol.startsWith("http") && url.hostname === root.hostname && !ASSET.test(url.pathname);
  } catch {
    return false;
  }
}
