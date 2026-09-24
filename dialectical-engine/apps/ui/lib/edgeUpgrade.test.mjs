import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { acceptsUpgrade } from "../edge-upgrade.mjs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("L3-F2: production has no WebSocket surface, so no upgrade is ever delegated", () => {
  for (const url of ["/_next/webpack-hmr", "/_next/webpack-hmr?page=%2F", "/", "/s5-nope", "/api/v1/runs/x/events", "", undefined]) {
    assert.equal(acceptsUpgrade(false, url), false, `production must destroy an upgrade for ${JSON.stringify(url)}`);
  }
});

test("L3-F2: development delegates exactly Next's HMR endpoint and destroys everything else", () => {
  assert.equal(acceptsUpgrade(true, "/_next/webpack-hmr"), true);
  assert.equal(acceptsUpgrade(true, "/_next/webpack-hmr?page=%2F"), true);
  for (const url of ["/", "/s5-nope", "/_next/webpack-hmrx", "/_next/webpack-hmr/extra", "/api/v1/runs/x/events", "", undefined, 42]) {
    assert.equal(acceptsUpgrade(true, url), false, `development must destroy an upgrade for ${JSON.stringify(url)}`);
  }
});

test("server.mjs destroys refused upgrades before Next sees them and bounds header/request time", () => {
  assert.match(server, /if \(!acceptsUpgrade\(development, request\.url\)\) \{\s*socket\.destroy\(\);\s*return;/);
  assert.match(server, /server\.headersTimeout = /);
  assert.match(server, /server\.requestTimeout = /);
});
