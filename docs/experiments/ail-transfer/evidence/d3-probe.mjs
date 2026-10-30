// d3: raw measurements only, no verdicts. Every call is guarded; the probe always returns what it has.
export default async function (broker, packet) {
  const out = { target: packet && packet.target, viewport: packet && packet.viewport, errors: [] };
  const call = async (op, args) => {
    try { return { ok: true, v: await broker.call(op, args) }; }
    catch (e) { out.errors.push({ op, error: String((e && e.message) || e).slice(0, 160) }); return { ok: false, v: null }; }
  };
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const o = (v) => (v && typeof v === "object" ? v : {});
  const s40 = (v) => (typeof v === "string" ? v.slice(0, 40) : v === undefined ? null : v);
  const normRect = (r) => {
    r = o(r);
    const x = num(r.x), y = num(r.y), w = num(r.width), h = num(r.height);
    return x === null || y === null || w === null || h === null ? null : { x, y, width: w, height: h };
  };
  // Parse rgb()/rgba() (comma or space syntax, alpha as number or %) into {r,g,b,a}; null when unparseable.
  const parseColor = (c) => {
    if (typeof c !== "string") return null;
    if (c.trim() === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    const m = c.match(/rgba?\(\s*([^)]*)\)/i);
    if (!m) return null;
    const parts = m[1].split(/[\s,\/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const n = (p) => (p.endsWith("%") ? parseFloat(p) / 100 : parseFloat(p));
    const r = parseFloat(parts[0]), g = parseFloat(parts[1]), b = parseFloat(parts[2]);
    const a = parts.length > 3 ? n(parts[3]) : 1;
    if ([r, g, b, a].some((x) => !Number.isFinite(x))) return null;
    return { r, g, b, a };
  };
  const parseOpacity = (v) => { const f = parseFloat(v); return Number.isFinite(f) ? f : null; };

  try {
    const open = await call("open", { target: packet.target, viewport: packet.viewport });
    out.open = open.v;
    const vp = o((await call("viewport", {})).v);
    const [pw, ph] = String(packet.viewport || "").split("x").map((x) => parseInt(x, 10));
    const W = num(vp.innerWidth) || (Number.isFinite(pw) ? pw : 1440), H = num(vp.innerHeight) || (Number.isFinite(ph) ? ph : 900);
    out.viewportInfo = { innerWidth: vp.innerWidth ?? null, innerHeight: vp.innerHeight ?? null, devicePixelRatio: vp.devicePixelRatio ?? null, scrollX: vp.scrollX ?? null, scrollY: vp.scrollY ?? null, docHeight: vp.docHeight ?? null, usedW: W, usedH: H };

    const text = String((packet && packet.affectedText) || "").slice(0, 80);
    const ft = text ? o((await call("findText", { text, max: 5 })).v) : {};
    const elements = Array.isArray(ft.elements) ? ft.elements : [];
    out.findText = { text, count: ft.count ?? null, returned: ft.returned ?? null, handles: elements.map((e) => o(e).handle ?? null) };

    // Clamp a rect to the viewport and to the broker's clip limits; null if nothing is left.
    const clip = (r) => {
      if (!r) return null;
      let x = Math.round(r.x), y = Math.round(r.y);
      let x2 = Math.round(r.x + r.width), y2 = Math.round(r.y + r.height);
      x = Math.max(0, Math.min(x, 4000)); y = Math.max(0, Math.min(y, 4000));
      x2 = Math.min(x2, W, 4000); y2 = Math.min(y2, H, 4000);
      const width = Math.min(800, x2 - x), height = Math.min(300, y2 - y);
      if (!(width >= 1 && height >= 1)) return null;
      return { x, y, width, height };
    };
    const pix = async (c, label) => {
      if (!c) return { label, skipped: "clip outside viewport or invalid" };
      const p = o((await call("pixels", { clip: c })).v);
      return { label, requestedClip: c, clip: p.clip ?? null, artifact: p.artifact ?? null, pixels: p.pixels ?? null, min: p.min ?? null, p01: p.p01 ?? null, p05: p.p05 ?? null, p50: p.p50 ?? null, max: p.max ?? null, below: p.below ?? null, histogram16: p.histogram16 ?? null };
    };
    const entryOf = (e) => {
      e = o(e);
      const bg = parseColor(e.backgroundColor), op = parseOpacity(e.opacity);
      return { tag: e.tag ?? null, id: e.id ?? null, cls: s40(e.cls), text: s40(e.text), position: e.position ?? null, zIndex: e.zIndex ?? null, backgroundColor: e.backgroundColor ?? null, opacity: e.opacity ?? null, rect: e.rect ?? null, bgAlpha: bg ? bg.a : null, bgAlphaTimesOpacity: bg && op !== null ? Math.round(bg.a * op * 1000) / 1000 : null };
    };
    const sameRect = (a, b) => a && b && ["x", "y", "width", "height"].every((k) => Math.abs((a[k] ?? NaN) - (b[k] ?? NaN)) <= 1);

    out.matches = [];
    for (let i = 0; i < elements.length && i < 5; i++) {
      const el = o(elements[i]);
      const st = o(el.style), r = normRect(el.rect);
      const m = {
        index: i, handle: el.handle ?? null, tag: el.tag ?? null, id: el.id ?? null, cls: s40(el.cls), text: s40(el.text), rect: el.rect ?? null,
        style: { color: st.color ?? null, backgroundColor: st.backgroundColor ?? null, opacity: st.opacity ?? null, position: st.position ?? null, zIndex: st.zIndex ?? null, visibility: st.visibility ?? null, display: st.display ?? null, fontSize: st.fontSize ?? null, fontWeight: st.fontWeight ?? null, top: st.top ?? null },
        colorParsed: parseColor(st.color), backgroundParsed: parseColor(st.backgroundColor),
        effectiveOpacity: el.effectiveOpacity ?? null,
        nonDefaultAncestors: (Array.isArray(el.nonDefaultAncestors) ? el.nonDefaultAncestors : []).slice(0, 10).map((a) => { a = o(a); return { tag: a.tag ?? null, cls: s40(a.cls), opacity: a.opacity ?? null, filter: a.filter ?? null, blend: a.blend ?? null }; }),
        inViewport: r ? r.x >= 0 && r.y >= 0 && r.x + r.width <= W && r.y + r.height <= H : null,
      };
      // Sample points: 5 x 3 grid inside the visible part of the rect, plus one control point in the reference area.
      const textClip = clip(r);
      let refRect = null;
      if (r) {
        const below = { x: r.x, y: r.y + r.height + 4, width: r.width, height: r.height };
        const above = { x: r.x, y: r.y - r.height - 4, width: r.width, height: r.height };
        refRect = below.y + below.height <= H ? below : above.y >= 0 ? above : null;
        m.referencePlacement = refRect === below ? "below" : refRect === above ? "above" : "none";
      }
      const refClip = clip(refRect);
      const pts = [];
      if (textClip) {
        for (const fy of [0.3, 0.5, 0.7]) for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          pts.push({ x: Math.round(textClip.x + fx * (textClip.width - 1)), y: Math.round(textClip.y + fy * (textClip.height - 1)), role: "text" });
        }
      }
      if (refClip) pts.push({ x: Math.round(refClip.x + refClip.width / 2), y: Math.round(refClip.y + refClip.height / 2), role: "reference" });
      const valid = pts.filter((p) => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x <= 4000 && p.y <= 4000 && p.x < W && p.y < H);
      m.pointsRequested = valid.map((p) => ({ x: p.x, y: p.y, role: p.role }));
      if (valid.length) {
        const res = (await call("elementsFromPoint", { points: valid.map((p) => ({ x: p.x, y: p.y })) })).v;
        const arr = Array.isArray(res) ? res : [];
        m.pointsReturned = arr.length;
        const stacks = [], sigIndex = {};
        m.points = arr.map((entry, k) => {
          entry = o(entry);
          const pt = o(entry.point);
          const req = valid.find((p) => p.x === pt.x && p.y === pt.y) || (arr.length === valid.length ? valid[k] : null);
          const stack = Array.isArray(entry.stack) ? entry.stack : [];
          let ti = stack.findIndex((s) => { s = o(s); return s.tag === el.tag && s.cls === el.cls && sameRect(normRect(s.rect), r); });
          if (ti < 0) ti = stack.findIndex((s) => { s = o(s); return typeof s.text === "string" && s.text.length > 0 && (s.text.includes(text) || (el.text && s.text === el.text)); });
          // Above-target entries (or the whole stack when the target is absent), each with parsed alpha x opacity.
          const kept = (ti >= 0 ? stack.slice(0, ti + 1) : stack).map(entryOf);
          const sig = JSON.stringify(kept);
          if (!(sig in sigIndex)) { sigIndex[sig] = stacks.length; stacks.push(kept); }
          return { point: entry.point ?? null, role: req ? req.role : "unknown", stackDepth: stack.length, targetIndex: ti, aboveTarget: ti >= 0 ? ti : null, stackRef: sigIndex[sig] };
        });
        m.stacks = stacks;
      } else m.pointsSkipped = "no valid point inside the viewport";
      m.textPixels = await pix(textClip, "text");
      m.referencePixels = await pix(refClip, "reference");
      out.matches.push(m);
    }
  } catch (e) {
    out.errors.push({ op: "probe", error: String((e && e.message) || e).slice(0, 160) });
  }
  try { const shot = o((await call("screenshot", {})).v); out.screenshot = { artifact: shot.artifact ?? null }; }
  catch (e) { out.errors.push({ op: "screenshot", error: String(e).slice(0, 160) }); }

  // Keep the result line under the sandbox limit: drop stack rects, then trim stacks to 4 entries.
  if (JSON.stringify(out).length > 50000) for (const m of out.matches || []) for (const s of m.stacks || []) for (const e of s) delete e.rect;
  if (JSON.stringify(out).length > 50000) for (const m of out.matches || []) if (m.stacks) m.stacks = m.stacks.map((s) => s.slice(0, 4));
  return out;
}
