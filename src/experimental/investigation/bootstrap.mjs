// Runs INSIDE the bubblewrap sandbox (no network, no host filesystem, empty environment). Loads the generated probe
// module and gives it exactly one capability: broker.call(op, args), carried as NDJSON lines over stdin/stdout to the
// coordinator, which validates every request. The generated module must `export default async function (broker, packet)`
// and return a JSON-serialisable result. Nothing else is provided.
import { createInterface } from "node:readline";

const token = process.argv[2];
const pending = new Map();
let next = 0;
const send = (msg) => process.stdout.write(JSON.stringify({ ...msg, token }) + "\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === "packet") { start(msg.packet); return; }
  const waiter = pending.get(msg.id);
  if (!waiter) return;
  pending.delete(msg.id);
  if (msg.ok) waiter.resolve(msg.result); else waiter.reject(new Error(`broker denied: ${msg.reason}`));
});
const broker = Object.freeze({
  call(op, args = {}) {
    const id = ++next;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); send({ type: "call", id, op, args }); });
  },
});
async function start(packet) {
  try {
    const mod = await import("/probe.mjs");
    const result = await mod.default(broker, packet);
    send({ type: "result", result });
  } catch (error) {
    send({ type: "error", error: String(error?.message ?? error).slice(0, 500) });
  }
  setTimeout(() => process.exit(0), 50);
}
