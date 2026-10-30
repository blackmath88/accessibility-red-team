export default async function (broker, packet) {
  const T = packet.affectedText || '';
  const frags = [T.slice(0, 60), 'nach Liechtenstein', 'Zollgebühren', 'dem Zusteller', T.slice(-25)];
  const S = (s) => s && { tag: s.tag, id: s.id, cls: s.cls, text: (s.text || '').slice(0, 30), pos: s.position, z: s.zIndex, bg: s.backgroundColor, op: s.opacity, rect: s.rect };
  const out = { target: packet.target, runs: [] };
  for (const viewport of ['1440x900', '390x844']) {
    const run = { viewport, errors: [] };
    out.runs.push(run);
    const call = async (op, args) => { try { return await broker.call(op, args); } catch (e) { run.errors.push(op + ': ' + String((e && e.message) || e).slice(0, 140)); return null; } };
    if (!(await call('open', { target: packet.target, viewport }))) continue;
    run.fragCounts = {};
    let el = null, frag = null;
    for (const f of frags) {
      const r = await call('findText', { text: f.slice(0, 80), max: 1 });
      run.fragCounts[f.slice(0, 24)] = r ? r.count : null;
      if (!el && r && r.count) { el = r.elements[0]; frag = f; }
    }
    if (!el) { run.found = false; continue; }
    run.found = true; run.anchorFrag = frag.slice(0, 24);
    let vp = await call('viewport', {});
    if (vp) await call('scrollTo', { y: Math.max(0, Math.round(vp.scrollY + el.rect.y - 120)) });
    const re = await call('findText', { text: frag.slice(0, 80), max: 1 });
    if (re && re.count) el = re.elements[0];
    vp = (await call('viewport', {})) || vp || { innerWidth: 0, innerHeight: 0 };
    const r = el.rect, W = vp.innerWidth, H = vp.innerHeight;
    const fs = parseFloat(el.style.fontSize) || 16, lh = Math.max(8, Math.round(fs * 1.4));
    const estLines = Math.max(1, Math.ceil(T.length * 0.5 * fs / Math.max(1, r.width)));
    const needBottom = r.y + estLines * lh;
    run.el = { tag: el.tag, cls: el.cls, text: (el.text || '').length, display: el.style.display, position: el.style.position, color: el.style.color, bg: el.style.backgroundColor, fontSize: el.style.fontSize, visibility: el.style.visibility, effOp: el.effectiveOpacity, nda: el.nonDefaultAncestors, rect: r };
    run.geom = { vp: { W, H, dpr: vp.devicePixelRatio, scrollY: vp.scrollY, docHeight: vp.docHeight }, rightOverflow: Math.round(r.x + r.width - W), leftOverflow: Math.round(-r.x), lh, rectLines: +(r.height / lh).toFixed(2), estLines, heightRatio: +(r.height / (estLines * lh)).toFixed(2) };
    const x0 = Math.max(0, Math.round(r.x)), x1 = Math.min(W, Math.round(r.x + r.width));
    const rows = Math.max(1, Math.min(5, Math.round(r.height / lh)));
    const rowH = r.height / rows;
    const pts = [];
    for (let i = 0; i < rows; i++) {
      const yy = Math.round(r.y + rowH * (i + 0.5));
      for (const f of [0.1, 0.5, 0.9]) pts.push({ x: Math.round(x0 + (x1 - x0) * f), y: yy, tag: 'r' + i + 'c' + f });
    }
    const yb = Math.round(r.y + r.height + lh * 0.6);
    for (const f of [0.25, 0.75]) pts.push({ x: Math.round(x0 + (x1 - x0) * f), y: yb, tag: 'below' + f });
    const okPts = pts.filter(p => p.x >= 0 && p.x < W && p.y >= 0 && p.y < H && p.x <= 4000 && p.y <= 4000).slice(0, 20);
    const isSelf = (s) => s && s.tag === el.tag && s.cls === el.cls && s.rect && Math.abs(s.rect.x - r.x) <= 1 && Math.abs(s.rect.y - r.y) <= 1;
    const anc = {};
    run.points = [];
    if (okPts.length) {
      const st = (await call('elementsFromPoint', { points: okPts.map(p => ({ x: p.x, y: p.y })) })) || [];
      st.forEach((e, k) => {
        const stack = (e && e.stack) || [];
        const d = stack.findIndex(isSelf);
        run.points.push({ at: okPts[k].tag, x: okPts[k].x, y: okPts[k].y, selfDepth: d, top: S(stack[0]), above: d > 0 ? stack.slice(0, d).map(S) : undefined });
        if (d >= 0) stack.slice(d + 1).forEach(a => {
          const key = a.tag + '.' + a.cls + '@' + JSON.stringify(a.rect);
          if (!anc[key]) anc[key] = Object.assign(S(a), { clipsBottom: a.rect.y + a.rect.height < needBottom - 2, endsAboveRect: a.rect.y + a.rect.height < r.y + r.height - 1, clipsRight: a.rect.x + a.rect.width < r.x + r.width - 1 });
        });
      });
    }
    run.ancestors = Object.values(anc).slice(0, 8);
    const px = async (x, y, w, h) => {
      x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
      w = Math.min(800, Math.round(Math.min(w, W - x))); h = Math.min(300, Math.round(Math.min(h, H - y)));
      if (w < 1 || h < 1) return { offscreen: true };
      const p = await call('pixels', { clip: { x, y, width: w, height: h } });
      return p ? { clip: p.clip, n: p.pixels, dark150: p.below['150'], ink: +(p.below['150'] / Math.max(1, p.pixels)).toFixed(3), min: p.min, p05: p.p05, p50: p.p50, art: p.artifact && p.artifact.id } : null;
    };
    run.cells = [];
    const cw = (x1 - x0) / 3;
    for (let i = 0; i < rows; i++) for (let c = 0; c < 3; c++) run.cells.push(Object.assign({ row: i, col: c }, await px(x0 + cw * c, r.y + rowH * i, cw, rowH)));
    run.belowStrip = await px(x0, r.y + r.height + 1, x1 - x0, lh * 2);
    const shot = await call('screenshot', {});
    run.screenshot = shot && shot.artifact && shot.artifact.id;
  }
  return out;
}
