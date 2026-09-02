import assert from "node:assert/strict";
import { test } from "node:test";

import { hardenIncomingProxyHeaders, TRUSTED_CLIENT_IP_HEADER } from "../trusted-client-ip.mjs";

test("client-supplied policy, nonce and middleware control headers never reach Next (L3-F3 C-3)", () => {
  const headers = {
    "content-security-policy": "script-src 'nonce-evil'",
    "content-security-policy-report-only": "script-src 'nonce-evil'",
    "x-nonce": "evil",
    "x-middleware-subrequest": "middleware",
    "x-middleware-prefetch": "1",
    "X-Middleware-Rewrite": "/",
    "x-middleware-override-headers": "x-nonce",
    "x-middleware-request-x-nonce": "evil",
    host: "localhost",
    accept: "text/html"
  };
  hardenIncomingProxyHeaders(headers, "127.0.0.1");
  assert.deepEqual(Object.keys(headers).sort(), ["accept", "host", TRUSTED_CLIENT_IP_HEADER].sort());
  assert.equal(headers[TRUSTED_CLIENT_IP_HEADER], "127.0.0.1");
});

test("forwarding headers are still discarded and the socket address wins when no proxy is trusted", () => {
  const headers = {
    "x-forwarded-for": "203.0.113.9",
    "x-forwarded-proto": "https",
    forwarded: "for=203.0.113.9",
    "x-real-ip": "203.0.113.9",
    "cf-connecting-ip": "203.0.113.9",
    "true-client-ip": "203.0.113.9",
    [TRUSTED_CLIENT_IP_HEADER]: "203.0.113.9",
    host: "localhost"
  };
  hardenIncomingProxyHeaders(headers, "::ffff:127.0.0.1");
  assert.deepEqual(headers, { host: "localhost", [TRUSTED_CLIENT_IP_HEADER]: "127.0.0.1" });
});
