import test from "node:test";
import assert from "node:assert/strict";
import { isPublicIp, validatePublicTarget } from "../src/scope.js";

test("rejects private IPv4 ranges", () => {
  assert.equal(isPublicIp("127.0.0.1"), false);
  assert.equal(isPublicIp("10.0.0.1"), false);
  assert.equal(isPublicIp("172.16.1.1"), false);
  assert.equal(isPublicIp("192.168.1.1"), false);
});

test("accepts representative public IPv4", () => {
  assert.equal(isPublicIp("1.1.1.1"), true);
  assert.equal(isPublicIp("8.8.8.8"), true);
});

test("rejects local IPv6", () => {
  assert.equal(isPublicIp("::1"), false);
  assert.equal(isPublicIp("fd00::1"), false);
});

test("rejects CGNAT/Tailscale, benchmark, multicast and IPv4-mapped private addresses", () => {
  assert.equal(isPublicIp("100.64.0.1"), false);
  assert.equal(isPublicIp("100.101.102.103"), false);
  assert.equal(isPublicIp("100.127.255.254"), false);
  assert.equal(isPublicIp("198.18.0.1"), false);
  assert.equal(isPublicIp("224.0.0.1"), false);
  assert.equal(isPublicIp("::ffff:100.64.0.1"), false);
  assert.equal(isPublicIp("::ffff:127.0.0.1"), false);
  assert.equal(isPublicIp("fd7a:115c:a1e0::1"), false);
  assert.equal(isPublicIp("100.128.0.1"), true);
  assert.equal(isPublicIp("::ffff:8.8.8.8"), true);
});

test("judges IPv6 forms that embed an IPv4 address by that address", () => {
  // IPv4-mapped, in the dotted form and the hex form WHATWG URL parsing and some resolvers produce.
  assert.equal(isPublicIp("::ffff:169.254.169.254"), false);
  assert.equal(isPublicIp("::ffff:a9fe:a9fe"), false);
  assert.equal(isPublicIp("::FFFF:7F00:1"), false);
  assert.equal(isPublicIp("0:0:0:0:0:ffff:10.1.2.3"), false);
  // SIIT IPv4-translated, IPv4-compatible, NAT64 well-known prefix and 6to4.
  assert.equal(isPublicIp("::ffff:0:192.168.0.1"), false);
  assert.equal(isPublicIp("::169.254.169.254"), false);
  assert.equal(isPublicIp("::a9fe:a9fe"), false);
  assert.equal(isPublicIp("64:ff9b::a9fe:a9fe"), false);
  assert.equal(isPublicIp("64:ff9b::127.0.0.1"), false);
  assert.equal(isPublicIp("2002:a9fe:a9fe::1"), false);
  assert.equal(isPublicIp("2002:c0a8:0101::"), false);
  assert.equal(isPublicIp("::"), false);
  // The same forms around a public IPv4 stay public.
  assert.equal(isPublicIp("::ffff:808:808"), true);
  assert.equal(isPublicIp("64:ff9b::8.8.8.8"), true);
  assert.equal(isPublicIp("2002:808:808::1"), true);
});

test("rejects non-global IPv6 ranges and malformed addresses", () => {
  assert.equal(isPublicIp("fe80::1"), false);
  assert.equal(isPublicIp("febf::1"), false);
  assert.equal(isPublicIp("fec0::1"), false);
  assert.equal(isPublicIp("fc00::1"), false);
  assert.equal(isPublicIp("ff02::1"), false);
  assert.equal(isPublicIp("ff0e::1"), false);
  assert.equal(isPublicIp("2001:db8::1"), false);
  assert.equal(isPublicIp("2001:0:4136:e378:8000:63bf:3fff:fdd2"), false, "Teredo tunnels to an arbitrary IPv4");
  assert.equal(isPublicIp("64:ff9b:1::1"), false);
  assert.equal(isPublicIp("100::1"), false);
  assert.equal(isPublicIp("fe80::1%eth0"), false);
});

test("accepts representative public IPv6", () => {
  assert.equal(isPublicIp("2606:4700:4700::1111"), true);
  assert.equal(isPublicIp("2001:4860:4860::8888"), true);
  assert.equal(isPublicIp("2a00:1450:4001:82a::200e"), true);
});

test("validatePublicTarget checks bracketed IPv6 literals as addresses without a DNS lookup", async () => {
  for (const url of ["http://[::ffff:169.254.169.254]/latest/meta-data/", "http://[::1]:8080/", "http://[64:ff9b::a9fe:a9fe]/", "http://[fe80::1]/"]) {
    await assert.rejects(validatePublicTarget(url), /Private or local IP targets are not allowed/, url);
  }
  assert.equal((await validatePublicTarget("https://[2606:4700:4700::1111]/")).hostname, "[2606:4700:4700::1111]");
});
