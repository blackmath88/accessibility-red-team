import test from "node:test";
import assert from "node:assert/strict";
import { isPublicIp } from "../src/scope.js";

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
