// Algorithmic baseline (coordinator-written, fixed, not model-generated): for one page/viewport and one key text,
// measures whether the text's own rect shows ink, whether the text is topmost, covered or absent in hit testing,
// and saves a viewport screenshot. Runs in the investigation sandbox; the only capability is broker.call.
export default async function (broker, packet) {
  const out = { target: packet.target, viewport: packet.viewport, version: "baseline/v1" };
  await broker.call("open", { target: packet.target, viewport: packet.viewport });
  const needle = packet.affectedText.slice(0, 60);
  let found = await broker.call("findText", { text: needle, max: 1 });
  out.found = found.count;
  if (!found.count) return out;
  let vp = await broker.call("viewport", {});
  let el = found.elements[0];
  if (el.rect.y < 0 || el.rect.y + el.rect.height > vp.innerHeight) {
    await broker.call("scrollTo", { y: Math.max(0, Math.round(vp.scrollY + el.rect.y - 120)) });
    found = await broker.call("findText", { text: needle, max: 1 });
    el = found.elements[0]; vp = await broker.call("viewport", {});
  }
  const r = el.rect;
  out.element = { tag: el.tag, id: el.id, cls: el.cls, rect: r, color: el.style.color, opacity: el.style.opacity, visibility: el.style.visibility, display: el.style.display, effectiveOpacity: el.effectiveOpacity };
  const same = (s) => s && s.tag === el.tag && s.id === el.id && s.cls === el.cls && s.rect.x === r.x && s.rect.y === r.y && s.rect.width === r.width && s.rect.height === r.height;
  const rows = Math.max(1, Math.min(4, Math.round(r.height / 20))), cols = 4, points = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const y = Math.round(r.y + (r.height * (i + 0.5)) / rows), x = Math.round(r.x + (r.width * (j + 0.5)) / cols);
    if (y >= 0 && y < vp.innerHeight && x >= 0 && x < vp.innerWidth) points.push({ x, y });
  }
  let topmost = 0, covered = 0, missing = 0; const coverers = {};
  if (points.length) for (const p of await broker.call("elementsFromPoint", { points })) {
    const idx = p.stack.findIndex(same);
    if (idx === 0) topmost++; else if (idx > 0) { covered++; const c = p.stack[0]; coverers[`${c.tag}#${c.id}.${c.cls}`] = (coverers[`${c.tag}#${c.id}.${c.cls}`] ?? 0) + 1; } else missing++;
  }
  out.hitTest = { points: points.length, topmost, covered, missing, coverers };
  const clip = (x, y, w, h) => { const cx = Math.max(0, Math.min(Math.round(x), vp.innerWidth - 1)), cy = Math.max(0, Math.min(Math.round(y), vp.innerHeight - 1)); return { x: cx, y: cy, width: Math.max(1, Math.min(800, Math.round(w), vp.innerWidth - cx)), height: Math.max(1, Math.min(300, Math.round(h), vp.innerHeight - cy)) }; };
  const stat = (p) => ({ min: p.min, p05: p.p05, p50: p.p50, max: p.max, below150: p.below["150"] });
  out.textPixels = stat(await broker.call("pixels", { clip: clip(r.x, r.y, r.width, r.height) }));
  const refH = Math.min(20, r.height), refY = r.y - refH - 6 >= 0 ? r.y - refH - 6 : r.y + r.height + 6;
  out.referencePixels = stat(await broker.call("pixels", { clip: clip(r.x, refY, r.width, refH) }));
  out.screenshot = (await broker.call("screenshot", {})).artifact;
  return out;
}
