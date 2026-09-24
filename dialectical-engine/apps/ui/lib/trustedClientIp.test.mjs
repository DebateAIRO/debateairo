import assert from "node:assert/strict";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  EDGE_SECRET_HEADER,
  hardenIncomingProxyHeaders,
  parseTrustedProxies,
  readEdgeSecret,
  TRUSTED_CLIENT_IP_HEADER
} from "../trusted-client-ip.mjs";

const secretDir = join(process.cwd(), ".tmp-s5-edge-secret-test");
const SECRET = "Q".repeat(43);

function secretFile(name, content, mode) {
  mkdirSync(secretDir, { recursive: true });
  const path = join(secretDir, name);
  writeFileSync(path, content);
  chmodSync(path, mode);
  return path;
}

after(() => rmSync(secretDir, { recursive: true, force: true }));

// ---------------------------------------------------------------- B9 (L3-F3 C-3)

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

// ---------------------------------------------------------------- C2 (R2, L3-F11)

test("untrusted remote: every forwarded header is dropped and the socket address wins", () => {
  const headers = { "x-forwarded-for": "203.0.113.9", forwarded: "for=203.0.113.9", host: "localhost" };
  hardenIncomingProxyHeaders(headers, "127.0.0.1", ["10.0.0.2"]);
  assert.equal(headers["x-forwarded-for"], undefined);
  assert.equal(headers.forwarded, undefined);
  assert.equal(headers[TRUSTED_CLIENT_IP_HEADER], "127.0.0.1");
});

test("trusted remote: the LAST x-forwarded-for hop becomes the client ip", () => {
  const headers = { "x-forwarded-for": "198.51.100.7, 203.0.113.9" };
  hardenIncomingProxyHeaders(headers, "10.0.0.2", ["10.0.0.2"]);
  assert.equal(headers[TRUSTED_CLIENT_IP_HEADER], "203.0.113.9");
  assert.equal(headers["x-forwarded-for"], undefined);
});

test("trusted remote with a malformed, empty, ported or bracketed hop falls back to the socket address", () => {
  for (const value of ["not-an-ip", "", " ", "1.2.3.4, ", "203.0.113.9:443", "[2001:db8::1]", "fe80::1%en0", "203.0.113.9 203.0.113.10"]) {
    const headers = { "x-forwarded-for": value };
    hardenIncomingProxyHeaders(headers, "10.0.0.2", ["10.0.0.2"]);
    assert.equal(headers[TRUSTED_CLIENT_IP_HEADER], "10.0.0.2", `hop ${JSON.stringify(value)} must not be honoured`);
    assert.equal(headers["x-forwarded-for"], undefined);
  }
  const array = { "x-forwarded-for": ["203.0.113.9", "203.0.113.10"] };
  hardenIncomingProxyHeaders(array, "10.0.0.2", ["10.0.0.2"]);
  assert.equal(array[TRUSTED_CLIENT_IP_HEADER], "10.0.0.2");
});

test("trusted remote: hops are normalised (mapped IPv6, IPv6 canonical form); leading-zero octets are refused", () => {
  const cases = [
    ["::ffff:203.0.113.9", "203.0.113.9"],
    ["2001:DB8:0:0:0:0:0:1", "2001:db8::1"],
    // net.isIP rejects leading zeros (ambiguous octal); the hop is refused and the socket wins.
    ["203.000.113.009", "10.0.0.2"]
  ];
  for (const [hop, expected] of cases) {
    const headers = { "x-forwarded-for": `198.51.100.7, ${hop}` };
    hardenIncomingProxyHeaders(headers, "10.0.0.2", ["10.0.0.2"]);
    assert.equal(headers[TRUSTED_CLIENT_IP_HEADER], expected, `hop ${hop}`);
  }
});

test("the socket address is matched against the trusted list after normalisation (dual-stack listener)", () => {
  const headers = { "x-forwarded-for": "203.0.113.9" };
  hardenIncomingProxyHeaders(headers, "::ffff:127.0.0.1", ["127.0.0.1"]);
  assert.equal(headers[TRUSTED_CLIENT_IP_HEADER], "203.0.113.9");
  const unlisted = { "x-forwarded-for": "203.0.113.9" };
  hardenIncomingProxyHeaders(unlisted, "::1", ["127.0.0.1"]);
  assert.equal(unlisted[TRUSTED_CLIENT_IP_HEADER], "::1", "an unlisted ::1 collapses to itself, never spoofs");
});

test("hop-count cap: more than 8 hops falls back to the socket address, exactly 8 is honoured", () => {
  const eight = Array.from({ length: 8 }, (_, index) => `198.51.100.${index + 1}`).join(", ");
  const honoured = { "x-forwarded-for": eight };
  hardenIncomingProxyHeaders(honoured, "10.0.0.2", ["10.0.0.2"]);
  assert.equal(honoured[TRUSTED_CLIENT_IP_HEADER], "198.51.100.8");

  const nine = `${eight}, 203.0.113.9`;
  const refused = { "x-forwarded-for": nine };
  hardenIncomingProxyHeaders(refused, "10.0.0.2", ["10.0.0.2"]);
  assert.equal(refused[TRUSTED_CLIENT_IP_HEADER], "10.0.0.2");

  const commas = { "x-forwarded-for": ",".repeat(500) };
  hardenIncomingProxyHeaders(commas, "10.0.0.2", ["10.0.0.2"]);
  assert.equal(commas[TRUSTED_CLIENT_IP_HEADER], "10.0.0.2");
});

test("header length cap: an x-forwarded-for longer than 512 characters is ignored", () => {
  const padded = `${" ".repeat(500)}, 203.0.113.9`;
  assert(padded.length > 512);
  const headers = { "x-forwarded-for": padded };
  hardenIncomingProxyHeaders(headers, "10.0.0.2", ["10.0.0.2"]);
  assert.equal(headers[TRUSTED_CLIENT_IP_HEADER], "10.0.0.2");
});

test("a trusted remote still loses x-forwarded-proto and every other forwarded header", () => {
  const headers = {
    "x-forwarded-for": "203.0.113.9",
    "x-forwarded-proto": "https",
    "x-forwarded-host": "evil.test",
    "x-forwarded-port": "443",
    forwarded: "for=203.0.113.9;proto=https",
    "x-real-ip": "203.0.113.9",
    "cf-connecting-ip": "203.0.113.9",
    "true-client-ip": "203.0.113.9",
    [TRUSTED_CLIENT_IP_HEADER]: "198.51.100.1",
    host: "app.example"
  };
  hardenIncomingProxyHeaders(headers, "10.0.0.2", ["10.0.0.2"]);
  assert.deepEqual(headers, { host: "app.example", [TRUSTED_CLIENT_IP_HEADER]: "203.0.113.9" });
});

test("parseTrustedProxies accepts exact literals only", () => {
  assert.deepEqual(parseTrustedProxies("10.0.0.2, ::1"), ["10.0.0.2", "::1"]);
  assert.deepEqual(parseTrustedProxies("::ffff:10.0.0.2,0:0:0:0:0:0:0:1"), ["10.0.0.2", "::1"]);
  assert.deepEqual(parseTrustedProxies(undefined), []);
  assert.deepEqual(parseTrustedProxies(""), []);
  assert(Object.isFrozen(parseTrustedProxies("10.0.0.2")));
  for (const bad of ["10.0.0.0/8", "proxy.internal", "10.0.0.2;::1", "   ", "10.0.0.2,", ",", "10.0.0.2, , ::1", "10.0.0.2:8080", "fe80::1%lo0"]) {
    assert.throws(() => parseTrustedProxies(bad), (error) =>
      error instanceof TypeError
      && error.code === "DIALECTICAL_UI_TRUSTED_PROXIES_INVALID"
      && /DIALECTICAL_UI_TRUSTED_PROXIES_INVALID/.test(error.message),
    `${JSON.stringify(bad)} must be refused fail-closed`);
  }
});

// ---------------------------------------------------------------- C2b edge secret

test("with an edge secret configured, a trusted remote is honoured only when the header matches", () => {
  const honoured = { "x-forwarded-for": "203.0.113.9", [EDGE_SECRET_HEADER]: SECRET };
  hardenIncomingProxyHeaders(honoured, "10.0.0.2", ["10.0.0.2"], SECRET);
  assert.deepEqual(honoured, { [TRUSTED_CLIENT_IP_HEADER]: "203.0.113.9" });

  for (const wrong of [undefined, "", `${"Q".repeat(42)}R`, `${SECRET}Q`, "Q".repeat(42), ["Q".repeat(43)]]) {
    const headers = { "x-forwarded-for": "203.0.113.9", ...(wrong === undefined ? {} : { [EDGE_SECRET_HEADER]: wrong }) };
    hardenIncomingProxyHeaders(headers, "10.0.0.2", ["10.0.0.2"], SECRET);
    assert.deepEqual(headers, { [TRUSTED_CLIENT_IP_HEADER]: "10.0.0.2" }, `secret ${JSON.stringify(wrong)} must not be honoured`);
  }
});

test("the edge secret alone never grants trust: an untrusted socket with the right secret is still the socket", () => {
  const headers = { "x-forwarded-for": "203.0.113.9", [EDGE_SECRET_HEADER]: SECRET };
  hardenIncomingProxyHeaders(headers, "192.0.2.5", ["10.0.0.2"], SECRET);
  assert.deepEqual(headers, { [TRUSTED_CLIENT_IP_HEADER]: "192.0.2.5" });
});

test("the edge-secret header is always stripped, with or without a configured secret", () => {
  const withoutSecret = { [EDGE_SECRET_HEADER]: "anything", host: "localhost" };
  hardenIncomingProxyHeaders(withoutSecret, "127.0.0.1");
  assert.deepEqual(withoutSecret, { host: "localhost", [TRUSTED_CLIENT_IP_HEADER]: "127.0.0.1" });
  const trustedNoSecret = { "x-forwarded-for": "203.0.113.9", [EDGE_SECRET_HEADER]: "anything" };
  hardenIncomingProxyHeaders(trustedNoSecret, "10.0.0.2", ["10.0.0.2"], null);
  assert.deepEqual(trustedNoSecret, { [TRUSTED_CLIENT_IP_HEADER]: "203.0.113.9" }, "no secret configured: the trusted list alone decides");
});

test("readEdgeSecret: unset means no secret; a valid 0600 base64url file of >= 32 bytes is read once and trimmed", () => {
  assert.equal(readEdgeSecret(undefined), null);
  assert.equal(readEdgeSecret(""), null);
  const path = secretFile("ok.secret", `${SECRET}\n`, 0o600);
  assert.equal(readEdgeSecret(path), SECRET);
  const readOnly = secretFile("ro.secret", "a-b_C".padEnd(64, "x"), 0o400);
  assert.equal(readEdgeSecret(readOnly), "a-b_C".padEnd(64, "x"));
});

test("readEdgeSecret refuses to start on a missing, group/world-readable, short or non-base64url file", () => {
  const cases = [
    ["   ", "whitespace path"],
    [join(secretDir, "missing.secret"), "missing file"],
    [secretFile("world.secret", SECRET, 0o644), "mode 0644"],
    [secretFile("group.secret", SECRET, 0o640), "mode 0640"],
    [secretFile("short.secret", "Q".repeat(42), 0o600), "42 characters"],
    [secretFile("grammar.secret", `${"Q".repeat(42)}+`, 0o600), "non-base64url character"],
    [secretFile("empty.secret", "\n", 0o600), "empty"],
    [secretFile("dir.secret", "", 0o600) && secretDir, "a directory"]
  ];
  for (const [path, label] of cases) {
    assert.throws(() => readEdgeSecret(path), (error) =>
      error instanceof TypeError
      && error.code === "DIALECTICAL_UI_EDGE_SECRET_INVALID"
      && /DIALECTICAL_UI_EDGE_SECRET_INVALID/.test(error.message),
    `${label} must refuse with DIALECTICAL_UI_EDGE_SECRET_INVALID`);
  }
});
