import assert from "node:assert/strict";
import { request } from "node:http";
import { connect } from "node:net";
import { after, before, describe, it } from "node:test";
import { startContainmentProxy, type ContainmentProxy } from "../src/experimental/adaptive/containment.js";
import { startFixtures, type Fixtures } from "./fixtures/adaptive-sites/server.js";

let fixtures: Fixtures;
let proxy: ContainmentProxy;
before(async () => { fixtures = await startFixtures(); proxy = await startContainmentProxy([fixtures.origin]); });
after(async () => { await proxy.close(); await fixtures.close(); });

const viaProxy = (target: string, method = "GET") => new Promise<number>((resolve, reject) => {
  const { port } = new URL(proxy.url);
  const req = request({ host: "127.0.0.1", port, path: target, method, headers: { host: new URL(target).host } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
  req.on("error", reject);
  req.end();
});

const tunnel = (authority: string) => new Promise<string>((resolve, reject) => {
  const socket = connect(Number(new URL(proxy.url).port), "127.0.0.1", () => socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
  let data = "";
  socket.on("data", (chunk) => { data += chunk.toString(); });
  socket.on("end", () => resolve(data.split("\r\n")[0] ?? ""));
  socket.on("error", reject);
});

describe("containment proxy", () => {
  it("forwards GET to the allowed fixture origin", async () => {
    assert.equal(await viaProxy(`${fixtures.origin}/skip-links/index.html`), 200);
  });

  it("refuses other hosts, non-GET methods and CONNECT tunnels (how Chrome carries ws:// through a proxy), and nothing reaches the off origin", async () => {
    assert.equal(await viaProxy(`${fixtures.offOrigin}/beacon`), 403);
    assert.equal(await viaProxy(`${fixtures.origin}/skip-links/index.html`, "POST"), 403);
    assert.match(await tunnel(new URL(fixtures.offOrigin).host), /403/);
    assert.deepEqual(fixtures.offHits, []);
    assert.ok(fixtures.hits.every((hit) => hit.method === "GET"), "the refused POST never reached the fixture server");
    assert.equal(proxy.refused.length, 3);
  });

  it("only accepts http origins", async () => {
    await assert.rejects(startContainmentProxy(["https://example.org"]), /only forwards http origins/);
  });
});
