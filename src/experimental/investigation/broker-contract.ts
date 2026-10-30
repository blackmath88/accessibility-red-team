// Experimental investigation slice (ADR-0015). Machine-readable contract of the measurement broker: what a probe may
// call, the argument rules the broker enforces (checkArgs is called by the broker itself, so the two cannot drift),
// the result shapes, and one example result per operation. The examples back a contract mock used to dry-run generated
// probes before any real page is opened.
const int = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const str = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
const obj = (v: unknown) => (v && typeof v === "object" ? v : {}) as Record<string, unknown>;

const rect = { x: 951, y: 383, width: 149, height: 18 };
const element = { handle: "t1", tag: "span", id: "", cls: "hint", text: "example text", rect,
  style: { color: "rgb(119, 119, 119)", backgroundColor: "rgba(0, 0, 0, 0)", opacity: "1", position: "static", zIndex: "auto", visibility: "visible", display: "inline", fontSize: "12px", fontWeight: "400", top: "auto" },
  effectiveOpacity: 1, nonDefaultAncestors: [] as Array<{ tag: string; cls: string; opacity: string; filter: string; blend: string }> };
const stackEntry = { tag: "span", id: "", cls: "hint", text: "example text", position: "static", zIndex: "auto", backgroundColor: "rgba(0, 0, 0, 0)", opacity: "1", rect };

export const BROKER_CONTRACT = {
  calling: "const result = await broker.call(op, args); a denied call throws Error('broker denied: <reason>'). Calls run one at a time. Only these ops exist.",
  coordinates: "All x/y/width/height are integer CSS pixels relative to the current viewport (not the document). Use Math.round.",
  ops: {
    open: { args: "{ target: packet.target, viewport: packet.viewport }", result: "{ target, url, viewport, status, resourcePolicy }", example: { target: "fixture-name", url: "fixture:fixture-name", viewport: "1440x900", status: null, resourcePolicy: "file-only" } },
    viewport: { args: "{}", result: "{ innerWidth, innerHeight, devicePixelRatio, scrollX, scrollY, docHeight }", example: { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, scrollX: 0, scrollY: 0, docHeight: 1174 } },
    findText: { args: "{ text: string 1..80 chars, max?: integer 1..5 }", result: "{ count, returned, elements: Element[] } — elements whose own text node contains text", example: { count: 1, returned: 1, elements: [element] } },
    query: { args: "{ selector: CSS string 1..200 chars, max?: integer 1..10 }", result: "same as findText", example: { count: 1, returned: 1, elements: [element] } },
    elementsFromPoint: { args: "{ points: Array<{x: integer 0..4000, y: integer 0..4000}> (1..20) }", result: "Array<{ point, stack: StackEntry[] }> — a plain array, one entry per point; stack is topmost first, at most 8; pseudo-elements are not separate entries", example: [{ point: { x: 988, y: 388 }, stack: [stackEntry] }] },
    scrollTo: { args: "{ y: integer 0..20000 }", result: "{ scrollY }", example: { scrollY: 0 } },
    pixels: { args: "{ clip: { x: integer 0..4000, y: integer 0..4000, width: integer 1..800, height: integer 1..300 } } (viewport coordinates)", result: "{ clip, artifact:{id,sha256}, pixels, min, p01, p05, p50, max, below:{100,150,200,230}, histogram16 } — greyscale 0..255 of the rendered screenshot", example: { clip: rect, artifact: { id: "a-01-clip.png", sha256: "0".repeat(64) }, pixels: 2682, min: 119, p01: 125, p05: 132, p50: 255, max: 255, below: { 100: 0, 150: 210, 200: 389, 230: 520 }, histogram16: [0, 0, 0, 0, 0, 0, 0, 30, 60, 50, 60, 70, 80, 90, 100, 2142] } },
    screenshot: { args: "{}", result: "{ artifact:{id,sha256} }", example: { artifact: { id: "a-02-viewport.png", sha256: "0".repeat(64) } } },
  },
  types: {
    Element: "{ handle, tag, id, cls, text, rect{x,y,width,height}, style{color, backgroundColor, opacity, position, zIndex, visibility, display, fontSize, fontWeight, top}, effectiveOpacity (product of ancestor opacities), nonDefaultAncestors[{tag, cls, opacity, filter, blend}] }",
    StackEntry: "{ tag, id, cls, text, position, zIndex, backgroundColor, opacity, rect{x,y,width,height} }",
  },
} as const;

export type BrokerOp = keyof typeof BROKER_CONTRACT.ops;
export const BROKER_OPS = Object.keys(BROKER_CONTRACT.ops) as BrokerOp[];

// The argument rules the broker enforces. Returns a denial reason or null.
export function checkArgs(op: string, args: unknown): string | null {
  const a = obj(args);
  switch (op) {
    case "open": return str(a["target"], 40) ? null : "open needs target";
    case "viewport": case "screenshot": return null;
    case "findText": return str(a["text"], 80) && (a["max"] === undefined || int(a["max"], 1, 5)) ? null : "findText needs text (1-80 chars) and max 1-5";
    case "query": return str(a["selector"], 200) && (a["max"] === undefined || int(a["max"], 1, 10)) ? null : "query needs selector (1-200 chars) and max 1-10";
    case "elementsFromPoint": {
      const p = a["points"];
      if (!Array.isArray(p) || p.length === 0 || p.length > 20) return "points: 1-20 {x,y}";
      return p.every((pt) => int(obj(pt)["x"], 0, 4000) && int(obj(pt)["y"], 0, 4000)) ? null : "points need integer x,y in 0..4000";
    }
    case "scrollTo": return int(a["y"], 0, 20000) ? null : "scrollTo needs integer y 0..20000";
    case "pixels": {
      const c = obj(a["clip"]);
      return int(c["x"], 0, 4000) && int(c["y"], 0, 4000) && int(c["width"], 1, 800) && int(c["height"], 1, 300) ? null : "clip needs integer x,y (0..4000), width 1..800, height 1..300 (viewport coordinates)";
    }
    default: return `unknown operation ${op.slice(0, 40)} (allowed: ${BROKER_OPS.join(", ")})`;
  }
}

// Contract mock: validates every call like the broker and answers with the example (or a scenario override).
export type MockScenario = Partial<Record<BrokerOp, unknown>>;
export function contractMock(scenario: MockScenario = {}) {
  const calls: Array<{ op: string; args: unknown; denied: string | null }> = [];
  const handler = async (op: string, args: unknown) => {
    const denied = checkArgs(op, args);
    calls.push({ op, args, denied });
    if (denied) return { ok: false as const, reason: denied };
    const r = (op in scenario ? scenario[op as BrokerOp] : BROKER_CONTRACT.ops[op as BrokerOp].example);
    return { ok: true as const, result: JSON.parse(JSON.stringify(r)) };
  };
  return { handler, calls };
}
