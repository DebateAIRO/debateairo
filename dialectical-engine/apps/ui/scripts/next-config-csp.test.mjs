import assert from "node:assert/strict";
import test from "node:test";

import nextConfig from "../next.config.mjs";
import { API_CONTENT_SECURITY_POLICY } from "../content-security-policy.mjs";

const NON_CSP_SECURITY_HEADERS = Object.freeze([
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cache-Control", value: "no-store" }
]);

async function headerRoutes() {
  assert.equal(typeof nextConfig, "object", "Next config is a static object; the CSP no longer varies by build phase");
  return nextConfig.headers();
}

test("the site-wide header rule keeps every non-CSP security header and carries no CSP (the middleware owns it)", async () => {
  const routes = await headerRoutes();
  const site = routes.find((route) => route.source === "/:path*");
  assert.notEqual(site, undefined);
  assert.deepEqual(site.headers, NON_CSP_SECURITY_HEADERS);
  assert.equal(site.headers.some(({ key }) => /content-security-policy/i.test(key)), false);
});

test("proxied /api responses get the static deny-all policy the upstream cannot supply", async () => {
  const routes = await headerRoutes();
  const api = routes.find((route) => route.source === "/api/:path*");
  assert.notEqual(api, undefined);
  assert.deepEqual(api.headers, [{ key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY }]);
  assert.equal(API_CONTENT_SECURITY_POLICY, "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  assert.deepEqual(routes.map((route) => route.source), ["/:path*", "/api/:path*"]);
});

test("dead export knob is gone, the framework fingerprint is off, the image optimizer is off", () => {
  assert.equal(nextConfig.output, undefined, "L3-F10: NEXT_OUTPUT_EXPORT could never build and silently dropped every header");
  assert.equal(nextConfig.poweredByHeader, false, "L3-F9");
  assert.deepEqual(nextConfig.images, { unoptimized: true }, "L3-F4: sharp leaves the runtime path");
  assert.equal(nextConfig.typescript.ignoreBuildErrors, false);
});
