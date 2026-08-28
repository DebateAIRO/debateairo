import assert from "node:assert/strict";
import test from "node:test";

import nextConfigFactory from "../next.config.mjs";

const DEVELOPMENT_PHASE = "phase-development-server";
const PRODUCTION_PHASE = "phase-production-build";

async function contentSecurityPolicy(phase) {
  assert.equal(typeof nextConfigFactory, "function", "Next config must vary CSP by exact phase");
  const config = nextConfigFactory(phase);
  const routes = await config.headers();
  const policy = routes[0]?.headers.find(({ key }) => key === "Content-Security-Policy")?.value;
  assert.equal(typeof policy, "string");
  return policy;
}

test("permits Next refresh evaluation only in the development-server CSP", async () => {
  const development = await contentSecurityPolicy(DEVELOPMENT_PHASE);
  const production = await contentSecurityPolicy(PRODUCTION_PHASE);

  assert.match(development, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
  assert.doesNotMatch(production, /'unsafe-eval'/);
  assert.equal(
    development.replace(" 'unsafe-eval'", ""),
    production,
    "development CSP may differ only by the exact React Refresh capability"
  );
});

test("keeps the production CSP deny-default directives exact", async () => {
  assert.equal(
    await contentSecurityPolicy(PRODUCTION_PHASE),
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
  );
});
