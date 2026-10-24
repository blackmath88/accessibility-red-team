import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SessionConfigSchema } from "../src/experimental/adaptive/contracts.js";
import { SessionPolicy, isPublicAddress } from "../src/experimental/adaptive/policy.js";

describe("embedded-IPv4 address forms (stricter than src/scope.ts)", () => {
  it("refuses IPv4-mapped, NAT64, 6to4, SIIT, compatible and Teredo forms that embed or can embed a non-public IPv4", () => {
    for (const address of [
      "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::ffff:127.0.0.1", "::ffff:10.1.2.3", "::ffff:192.168.0.1", "::FFFF:7F00:1",
      "64:ff9b::7f00:1", "64:ff9b::10.0.0.1", "64:ff9b::a9fe:a9fe", "64:ff9b:1::1:2",
      "2002:7f00:1::1", "2002:a9fe:a9fe::", "2002:0a00:0001:1::5",
      "::ffff:0:127.0.0.1", "::127.0.0.1", "::1", "::", "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    ]) assert.equal(isPublicAddress(address), false, address);
  });
  it("still allows ordinary public addresses, including mapped/translated forms of public IPv4", () => {
    for (const address of ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946", "::ffff:93.184.216.34", "64:ff9b::5db8:d822", "2002:5db8:d822::1"]) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });
  it("rejects them as URL literals in the decision path, and as DNS answers", async () => {
    const config = SessionConfigSchema.parse({
      schema: "art/adaptive-session/v1", sessionId: "p", startUrl: "https://example.org/", mode: "public", publicTargets: ["https://example.org/"],
      allowedOrigins: ["https://example.org"],
      limits: { maxSteps: 1, maxModelCalls: 1, maxInputTokens: 1, maxOutputTokens: 1, maxWallMs: 100, maxResponseBytes: 1024, maxSurfaces: 1 },
    } as never);
    const policy = new SessionPolicy(config, async (host) => (host === "mapped.example.org" ? ["::ffff:10.0.0.1"] : ["93.184.216.34"]));
    for (const url of ["http://[::ffff:169.254.169.254]/latest/", "http://[::ffff:127.0.0.1]:8080/", "http://[64:ff9b::7f00:1]/", "http://[2002:7f00:1::1]/", "https://mapped.example.org/"]) {
      const request = await policy.decideRequest({ url, method: "GET", resourceType: "XHR" });
      assert.equal(request.allow === false && request.reason, "private_destination", url);
      const navigation = await policy.checkNavigationTarget(url);
      assert.equal(navigation.allow === false && navigation.reason, "private_destination", url);
    }
  });
});
