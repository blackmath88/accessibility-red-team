// COORDINATOR COUNTERTEST c1 (hand-written by the coordinator, NOT model-generated). Same sandbox and broker as the
// generated probes. Question: when nothing fixed covers the hint, what is topmost over it and how dark does it render?
// If a fixed element covers the hint, scroll (integer, clamped) so the hint sits in the free band above it. No clicks.
export default async function (broker, packet) {
  await broker.call("open", { target: packet.target, viewport: packet.viewport });
  const out = { steps: [] };
  for (let pass = 0; pass < 2; pass++) {
    const vp = await broker.call("viewport", {});
    const hint = (await broker.call("findText", { text: "* muss ausgefüllt werden", max: 1 })).elements[0];
    const r = hint.rect;
    const pts = [0.2, 0.5, 0.8].map((f) => ({ x: Math.round(r.x + r.width * f), y: Math.round(r.y + r.height / 2) }));
    const stacks = (await broker.call("elementsFromPoint", { points: pts })).map((p) => p.stack);
    const top = stacks.map((s) => ({ tag: s[0].tag, cls: s[0].cls.slice(0, 40), position: s[0].position, zIndex: s[0].zIndex, bg: s[0].backgroundColor, rect: s[0].rect, hintIndex: s.findIndex((e) => e.tag === "span" && e.text === hint.text) }));
    const fixed = stacks.flatMap((s) => s.slice(0, Math.max(0, s.findIndex((e) => e.tag === "span" && e.text === hint.text)))).find((e) => e.position === "fixed");
    const step = { pass, scrollY: vp.scrollY, hintRect: r, top, fixedOccluder: fixed ? { cls: fixed.cls.slice(0, 50), rect: fixed.rect, bg: fixed.backgroundColor } : null };
    if (!fixed) {
      const clip = { x: Math.round(r.x), y: Math.round(r.y), width: Math.min(800, Math.round(r.width)), height: Math.round(r.height) };
      step.pixels = await broker.call("pixels", { clip });
      const bgClip = { x: clip.x, y: Math.max(0, clip.y - 8), width: clip.width, height: 4 };
      step.backgroundAbove = await broker.call("pixels", { clip: bgClip });
      out.steps.push(step);
      break;
    }
    out.steps.push(step);
    const freeBand = fixed.rect.y; // hint must end above the occluder's top edge
    const target = Math.round(vp.scrollY + r.y - Math.max(8, Math.floor((freeBand - r.height) / 2)));
    const y = Math.max(0, Math.min(Math.round(vp.docHeight - vp.innerHeight), target));
    await broker.call("scrollTo", { y });
  }
  return out;
}
