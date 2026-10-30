import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BROKER_CONTRACT, BROKER_OPS, checkArgs, contractMock } from "../src/experimental/investigation/broker-contract.js";
import { runInSandbox, sandboxAvailable } from "../src/experimental/investigation/sandbox.js";

describe("published broker contract and contract mock", () => {
  it("states the argument rules the broker enforces", () => {
    assert.deepEqual(BROKER_OPS, ["open", "viewport", "findText", "query", "elementsFromPoint", "scrollTo", "pixels", "screenshot"]);
    assert.equal(checkArgs("pixels", { clip: { x: 0, y: 0, width: 10, height: 10 } }), null);
    assert.match(checkArgs("pixels", { clip: { x: 0.5, y: 0, width: 10, height: 10 } })!, /integer/);
    assert.match(checkArgs("elementsFromPoint", { points: [{ x: 1, y: 2.5 }] })!, /integer/);
    assert.match(checkArgs("scrollTo", { y: Number.NaN })!, /integer/);
    assert.match(checkArgs("evaluate", {})!, /unknown operation/);
    // open: the same target and viewport rules as the broker, so a dry run cannot pass what the broker denies
    assert.equal(checkArgs("open", { target: "transfer-a", viewport: "390x844" }), null);
    assert.match(checkArgs("open", { target: "transfer-a", viewport: "1024x768" })!, /viewport in/);
    assert.match(checkArgs("open", { target: "Transfer_A" })!, /target/);
    assert.ok(Array.isArray(BROKER_CONTRACT.ops.elementsFromPoint.example), "elementsFromPoint returns a plain array");
  });

  it("dry-runs a probe in the sandbox and records calls the broker would deny", { skip: sandboxAvailable().ok ? false : "bwrap not available" }, async () => {
    const mock = contractMock({ scrollTo: { scrollY: 40 } });
    const code = `export default async function (broker) {
      await broker.call("open", { target: "x", viewport: "1440x900" });
      const s = await broker.call("scrollTo", { y: 40 });
      let denied = null; try { await broker.call("pixels", { clip: { x: 1.5, y: 0, width: 5, height: 5 } }); } catch (e) { denied = e.message; }
      return { s, denied }; }`;
    const out = await runInSandbox(code, {}, mock.handler);
    assert.equal(out.state, "completed");
    assert.deepEqual((out.result as { s: unknown }).s, { scrollY: 40 });
    assert.match(String((out.result as { denied: string }).denied), /broker denied: clip/);
    assert.equal(mock.calls.filter((c) => c.denied).length, 1);
  });
});
