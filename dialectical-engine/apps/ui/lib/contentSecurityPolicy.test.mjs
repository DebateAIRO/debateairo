import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import nonceHeader from "next/dist/server/app-render/get-script-nonce-from-header.js";
import {
  API_CONTENT_SECURITY_POLICY,
  FALLBACK_CONTENT_SECURITY_POLICY,
  NONCE_REQUEST_HEADER,
  cardFormContentSecurityPolicy,
  cardFormOrigins,
  createNonce,
  isCardFormPath,
  nonceContentSecurityPolicy
} from "../content-security-policy.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const STATIC_TAIL = "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests";

test("createNonce draws 16 random bytes as 24 base64 characters, fresh every call", () => {
  const nonces = new Set();
  for (let index = 0; index < 200; index += 1) {
    const nonce = createNonce();
    assert.match(nonce, /^[A-Za-z0-9+/]{22}==$/);
    assert.equal(Buffer.from(nonce, "base64").length, 16);
    nonces.add(nonce);
  }
  assert.equal(nonces.size, 200);
});

test("the production policy is nonce + strict-dynamic with no inline or eval escape hatch", () => {
  const nonce = createNonce();
  const policy = nonceContentSecurityPolicy(nonce, false);
  assert.equal(policy, `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; ${STATIC_TAIL}`);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(policy, /'unsafe-eval'/);
});

test("development adds exactly 'unsafe-eval' (React Refresh) and nothing else", () => {
  const nonce = createNonce();
  const development = nonceContentSecurityPolicy(nonce, true);
  assert.equal(development.replace(" 'unsafe-eval'", ""), nonceContentSecurityPolicy(nonce, false));
  assert.match(development, /script-src 'self' 'nonce-[^']+' 'strict-dynamic' 'unsafe-eval';/);
});

test("Next extracts the same nonce from the policy the middleware puts on the request", () => {
  const nonce = createNonce();
  assert.equal(nonceHeader.getScriptNonceFromHeader(nonceContentSecurityPolicy(nonce, false)), nonce);
  assert.equal(nonceHeader.getScriptNonceFromHeader(FALLBACK_CONTENT_SECURITY_POLICY), undefined);
});

test("a malformed nonce is refused, never interpolated into a policy", () => {
  for (const bad of ["", "short", "x".repeat(24), `${"A".repeat(22)}=='; script-src *`, 42, null]) {
    assert.throws(() => nonceContentSecurityPolicy(bad, false), /UI_CSP_NONCE_INVALID/);
  }
});

test("the fallback is exactly the pre-nonce production policy and the API policy denies everything", () => {
  assert.equal(
    FALLBACK_CONTENT_SECURITY_POLICY,
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
  );
  assert.equal(API_CONTENT_SECURITY_POLICY, "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  assert.equal(NONCE_REQUEST_HEADER, "x-nonce");
});

test("the root layout reads the request nonce and passes it to its inline theme bootstrap", () => {
  const layout = read("../app/layout.tsx");
  assert.match(layout, /import \{ headers \} from "next\/headers"/);
  assert.match(layout, /export default async function RootLayout/);
  assert.match(layout, /\(await headers\(\)\)\.get\(NONCE_REQUEST_HEADER\)/);
  assert.match(layout, /<script\s+nonce=\{nonce\}/);
  assert.equal((layout.match(/dangerouslySetInnerHTML/g) ?? []).length, 1, "the theme bootstrap stays the only inline script");
});

test("the middleware owns the nonce: request x-nonce + CSP, response CSP, api/static paths excluded", () => {
  const middleware = read("../middleware.ts");
  assert.match(middleware, /createNonce\(\)/);
  assert.match(middleware, /process\.env\.NODE_ENV === "development"/);
  assert.match(middleware, /requestHeaders\.set\(NONCE_REQUEST_HEADER, nonce\)/);
  assert.match(middleware, /requestHeaders\.set\("content-security-policy", policy\)/);
  assert.match(middleware, /response\.headers\.set\("content-security-policy", policy\)/);
  assert.match(middleware, /NextResponse\.next\(\{ request: \{ headers: requestHeaders \} \}\)/);
  assert.match(middleware, /source: "\/\(\(\?!api\/\|_next\/static\|_next\/image\|icon\.svg\)\.\*\)"/);
  assert.doesNotMatch(middleware, /Buffer/, "Edge runtime: Web APIs only");
});

test("the custom server pre-sets the fallback policy on every response before Next runs", () => {
  const server = read("../server.mjs");
  assert.match(server, /response\.setHeader\("content-security-policy", FALLBACK_CONTENT_SECURITY_POLICY\)/);
  assert.match(server, /import \{ FALLBACK_CONTENT_SECURITY_POLICY \} from "\.\/content-security-policy\.mjs"/);
});

const STAGE_POLICY = (nonce) =>
  `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://secure-stage.xmoney.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://secure-stage.xmoney.com https://api-stage.xmoney.com; frame-src 'self' https://secure-stage.xmoney.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://secure-stage.xmoney.com; upgrade-insecure-requests`;

test("the card form lives on exactly three routes, never on /settings itself (AMENDMENTS-R1 A11)", () => {
  for (const path of ["/checkout", "/checkout/return", "/settings/card"]) assert.equal(isCardFormPath(path), true, path);
  for (const path of ["/", "/settings", "/settings/", "/settings/cards", "/settings/card/x", "/checkoutx", "/checkout/other", "/pricing", "/login"]) {
    assert.equal(isCardFormPath(path), false, path);
  }
});

test("XMONEY_SDK_ORIGIN names the SDK origin, and the API origin is derived for xMoney's two hosts", () => {
  assert.equal(cardFormOrigins(undefined), null);
  assert.equal(cardFormOrigins(""), null);
  assert.deepEqual(cardFormOrigins("https://secure-stage.xmoney.com"), { sdk: "https://secure-stage.xmoney.com", api: "https://api-stage.xmoney.com" });
  assert.deepEqual(cardFormOrigins("https://secure.xmoney.com"), { sdk: "https://secure.xmoney.com", api: "https://api.xmoney.com" });
  assert.deepEqual(cardFormOrigins("https://localhost:4443"), { sdk: "https://localhost:4443", api: null });
  for (const bad of ["http://secure.xmoney.com", "https://secure.xmoney.com/sdk", "https://secure.xmoney.com?x=1", "https://user@secure.xmoney.com", "https://secure.xmoney.com; script-src *", "https://SECURE.xmoney.com"]) {
    assert.throws(() => cardFormOrigins(bad), /UI_XMONEY_SDK_ORIGIN_INVALID/, bad);
  }
});

test("the card-form policy is today's policy plus the xMoney origins in four directives, nothing else", () => {
  const nonce = createNonce();
  const policy = cardFormContentSecurityPolicy(nonce, false, cardFormOrigins("https://secure-stage.xmoney.com"));
  assert.equal(policy, STAGE_POLICY(nonce));
  const withoutAdditions = policy
    .replace(" https://secure-stage.xmoney.com;", ";")
    .replace("connect-src 'self' https://secure-stage.xmoney.com https://api-stage.xmoney.com;", "connect-src 'self';")
    .replace(" frame-src 'self' https://secure-stage.xmoney.com;", "")
    .replace("form-action 'self' https://secure-stage.xmoney.com;", "form-action 'self';");
  assert.equal(withoutAdditions, nonceContentSecurityPolicy(nonce, false));
  assert.throws(() => cardFormContentSecurityPolicy(nonce, false, { sdk: "https://x.test; script-src *", api: null }), /UI_XMONEY_SDK_ORIGIN_INVALID/);
  assert.throws(() => cardFormContentSecurityPolicy("bad", false, cardFormOrigins("https://secure.xmoney.com")), /UI_CSP_NONCE_INVALID/);
});

test("the middleware loosens the policy on the card routes only; every other page keeps today's bytes", async () => {
  const previous = process.env.XMONEY_SDK_ORIGIN;
  process.env.XMONEY_SDK_ORIGIN = "https://secure-stage.xmoney.com";
  try {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("../middleware.ts");
    const development = process.env.NODE_ENV === "development";
    const policyFor = (path) => middleware(new NextRequest(`https://dezbatere.test${path}`)).headers.get("content-security-policy");
    const nonceOf = (policy) => /'nonce-([^']+)'/.exec(policy)[1];
    for (const path of ["/checkout", "/checkout/return", "/settings/card"]) {
      const policy = policyFor(path);
      assert.equal(policy, cardFormContentSecurityPolicy(nonceOf(policy), development, cardFormOrigins("https://secure-stage.xmoney.com")), path);
    }
    for (const path of ["/", "/settings", "/settings/security", "/checkout/other", "/pricing", "/login", "/new", "/cancel"]) {
      const policy = policyFor(path);
      assert.equal(policy, nonceContentSecurityPolicy(nonceOf(policy), development), path);
      assert.doesNotMatch(policy, /xmoney/, path);
    }
    delete process.env.XMONEY_SDK_ORIGIN;
    const unset = policyFor("/checkout");
    assert.equal(unset, nonceContentSecurityPolicy(nonceOf(unset), development));
  } finally {
    if (previous === undefined) delete process.env.XMONEY_SDK_ORIGIN;
    else process.env.XMONEY_SDK_ORIGIN = previous;
  }
});

test("X0 (e): the card documents keep payment=() like every page (xMoney's form needs no Payment Request API)", async () => {
  const previous = process.env.XMONEY_SDK_ORIGIN;
  process.env.XMONEY_SDK_ORIGIN = "https://secure-stage.xmoney.com";
  try {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("../middleware.ts");
    for (const path of ["/checkout", "/checkout/return", "/settings/card"]) {
      assert.equal(middleware(new NextRequest(`https://dezbatere.test${path}`)).headers.get("permissions-policy"), null, path);
    }
    const { default: config } = await import("../next.config.mjs");
    const entries = await config.headers();
    const permissions = entries.filter((entry) => entry.headers.some((header) => header.key === "Permissions-Policy"));
    assert.deepEqual(permissions.map((entry) => entry.source), ["/:path*"]);
    assert.equal(permissions[0].headers.find((header) => header.key === "Permissions-Policy").value,
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  } finally {
    if (previous === undefined) delete process.env.XMONEY_SDK_ORIGIN;
    else process.env.XMONEY_SDK_ORIGIN = previous;
  }
});
