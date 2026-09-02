import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Exactly the policy the UI edge pre-sets on every response before Next runs
// (apps/ui/content-security-policy.mjs). A matcher-excluded path must still
// carry it: nothing is served without a policy.
const FALLBACK_CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests";
const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
const NONCE_SOURCE = /script-src 'self' 'nonce-([A-Za-z0-9+/=]{22,})' 'strict-dynamic'(?:;|$)/;
const INJECTED_NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()));
  return port;
}

/**
 * A loopback stand-in for the API: every request is an unauthenticated 401
 * carrying its own (marked) CSP, so the smoke can prove the browser-facing
 * policy on /api/* is the UI's static one and never the upstream's.
 */
async function startStubApi() {
  const seen = [];
  const server = createHttpServer((request, response) => {
    seen.push({
      forwardedFor: request.headers["x-forwarded-for"] ?? null,
      edgeSecret: request.headers["x-debateai-edge-secret"] ?? null
    });
    response.writeHead(401, {
      "content-type": "application/json",
      "content-security-policy": "default-src 'none'; report-uri /upstream-marker",
      "x-upstream-marker": "1"
    });
    response.end(JSON.stringify({ error: "UNAUTHENTICATED" }));
  });
  await new Promise((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    base: `http://127.0.0.1:${address.port}`,
    last: () => seen[seen.length - 1] ?? null,
    stop: () => new Promise((resolveClosed) => {
      server.closeAllConnections();
      server.close(() => resolveClosed());
    })
  };
}

function assertCommonHeaders(response, surface, path) {
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains", `${surface} ${path}: HSTS`);
  assert.equal(response.headers.get("x-frame-options"), "DENY", `${surface} ${path}: framing denied`);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", `${surface} ${path}: nosniff`);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer", `${surface} ${path}: no referrer`);
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=(), payment=(), usb=()", `${surface} ${path}: permissions policy`);
  assert.match(response.headers.get("cache-control") ?? "", /(?:^|,\s*)no-store(?:,|$)/, `${surface} ${path}: no-store`);
  assert.equal(response.headers.get("x-powered-by"), null, `${surface} ${path}: no framework fingerprint (L3-F9)`);
}

/** Documents: a per-request nonce with 'strict-dynamic' and no inline/eval escape hatch. Returns the nonce. */
function assertDocumentPolicy(response, surface, path) {
  assertCommonHeaders(response, surface, path);
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/, `${surface} ${path}: restrictive default-src`);
  assert.match(csp, NONCE_SOURCE, `${surface} ${path}: script-src is nonce + strict-dynamic (F-08)`);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/, `${surface} ${path}: no inline-script escape hatch`);
  assert.doesNotMatch(csp, /'unsafe-eval'/, `${surface} ${path}: production never permits eval`);
  assert.match(csp, /object-src 'none'/, `${surface} ${path}: plugins disabled`);
  assert.match(csp, /base-uri 'none'/, `${surface} ${path}: base injection disabled`);
  assert.match(csp, /frame-ancestors 'none'/, `${surface} ${path}: framing disabled`);
  assert.match(csp, /form-action 'self'/, `${surface} ${path}: form targets stay same-origin`);
  return csp.match(NONCE_SOURCE)[1];
}

function assertHydrationHtml(html, nonce, surface, path) {
  const openingTags = [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
  assert(openingTags.length > 0, `${surface} ${path}: emits scripts`);
  const sources = openingTags.flatMap((tag) => {
    const source = tag.match(/\bsrc="([^"]+)"/);
    return source === null ? [] : [source[1]];
  });
  assert(sources.length > 0, `${surface} ${path}: emits production hydration scripts`);
  assert(sources.every((source) => source.startsWith("/_next/")), `${surface} ${path}: hydration scripts stay same-origin`);
  assert(html.includes("self.__next_f"), `${surface} ${path}: emits Next hydration state`);
  for (const tag of openingTags) {
    assert(tag.includes(`nonce="${nonce}"`), `${surface} ${path}: every script carries the response nonce, found ${tag}`);
  }
  const themeBootstrap = openingTags.find((tag) => html.slice(html.indexOf(tag)).includes("debateai.mode"));
  assert(themeBootstrap !== undefined && themeBootstrap.includes(`nonce="${nonce}"`), `${surface} ${path}: the app-owned theme bootstrap is nonced`);
}

async function waitForServer(child, url, log) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`UI server exited before readiness\n${log.join("")}`);
    try {
      const response = await fetch(url, { redirect: "manual" });
      await response.arrayBuffer();
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  }
  throw new Error(`UI server did not become ready\n${log.join("")}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("UI server did not stop")), 5_000))
  ]);
}

/**
 * L3-F2: a raw Upgrade request for a path nothing serves must not leave the
 * socket open. Resolves with the time to closure; rejects after the deadline.
 */
function probeOrphanUpgrade(port, deadlineMs) {
  return new Promise((resolveClosed, reject) => {
    const started = Date.now();
    const socket = connect(port, "127.0.0.1");
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`orphan upgrade socket still open after ${deadlineMs} ms (L3-F2)`));
    }, deadlineMs);
    socket.once("error", () => {});
    socket.once("close", () => {
      clearTimeout(timer);
      resolveClosed(Date.now() - started);
    });
    socket.once("connect", () => {
      socket.write(
        "GET /s5-nope HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n" +
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"
      );
    });
  });
}

/** C2 fail-closed: a wrong edge configuration must refuse to start, naming its code. */
async function assertRefusesToStart(root, env, code) {
  const stderr = [];
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", DIALECTICAL_UI_HOST: "127.0.0.1", PORT: "1", ...env },
    stdio: ["ignore", "ignore", "pipe"]
  });
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString()));
  const exitCode = await Promise.race([
    new Promise((resolveExit) => child.once("exit", (exit) => resolveExit(exit))),
    new Promise((_, reject) => setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`server.mjs did not refuse ${code} within 20 s`));
    }, 20_000))
  ]);
  assert.notEqual(exitCode, 0, `${code}: server.mjs must exit non-zero`);
  assert.match(stderr.join(""), new RegExp(code), `${code}: the refusal names its code`);
}

async function smoke(surface) {
  const port = await availablePort();
  const root = resolve(repositoryRoot, surface);
  const stubApi = await startStubApi();
  const secretDir = mkdtempSync(join(tmpdir(), "s5-ui-edge-"));
  const secretPath = join(secretDir, "ui-edge.secret");
  const edgeSecret = randomBytes(32).toString("base64url");
  writeFileSync(secretPath, `${edgeSecret}\n`);
  chmodSync(secretPath, 0o600);
  const worldReadablePath = join(secretDir, "world.secret");
  writeFileSync(worldReadablePath, edgeSecret);
  chmodSync(worldReadablePath, 0o644);
  const log = [];
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      DIALECTICAL_UI_HOST: "127.0.0.1",
      DIALECTICAL_API_BASE: stubApi.base,
      // C2 / C2b: this loopback client plays the trusted reverse proxy.
      DIALECTICAL_UI_TRUSTED_PROXIES: "127.0.0.1, ::1",
      DIALECTICAL_UI_EDGE_SECRET_PATH: secretPath,
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => log.push(chunk.toString()));
  child.stderr.on("data", (chunk) => log.push(chunk.toString()));
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(child, `${base}/`, log);

    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200, `${surface} renders its production home route`);
    const homeNonce = assertDocumentPolicy(home, surface, "/");
    assertHydrationHtml(await home.text(), homeNonce, surface, "/");

    const login = await fetch(`${base}/login`);
    assert.equal(login.status, 200, `${surface} renders the login route`);
    const loginNonce = assertDocumentPolicy(login, surface, "/login");
    assertHydrationHtml(await login.text(), loginNonce, surface, "/login");
    assert.notEqual(loginNonce, homeNonce, `${surface}: the nonce is per request, never reused`);

    // L3-F3 C-3: only the middleware may name the nonce. A caller-supplied
    // policy or x-nonce header must neither be echoed nor influence the
    // nonce Next stamps on the scripts.
    const injected = await fetch(`${base}/login`, {
      headers: {
        "content-security-policy": `default-src 'self'; script-src 'nonce-${INJECTED_NONCE}'`,
        "content-security-policy-report-only": `script-src 'nonce-${INJECTED_NONCE}'`,
        "x-nonce": INJECTED_NONCE,
        "x-middleware-subrequest": "middleware"
      }
    });
    assert.equal(injected.status, 200);
    const injectedNonce = assertDocumentPolicy(injected, surface, "/login (injected nonce)");
    assert.notEqual(injectedNonce, INJECTED_NONCE, `${surface}: a client-supplied nonce is never adopted`);
    const injectedHtml = await injected.text();
    assert(!injectedHtml.includes(INJECTED_NONCE), `${surface}: the injected nonce never reaches the document`);
    assertHydrationHtml(injectedHtml, injectedNonce, surface, "/login (injected nonce)");

    const notFound = await fetch(`${base}/s5-security-header-missing-route`);
    assert.equal(notFound.status, 404, `${surface} exercises a live production 404`);
    const notFoundNonce = assertDocumentPolicy(notFound, surface, "/404");
    assertHydrationHtml(await notFound.text(), notFoundNonce, surface, "/404");

    // L3-F3 C-2: a path the middleware matcher excludes still carries the
    // edge's fail-closed fallback policy.
    const excluded = await fetch(`${base}/_next/static/s5-missing-chunk.js`);
    assert.equal(excluded.status, 404, `${surface}: a missing static asset is a 404`);
    assert.equal(excluded.headers.get("content-security-policy"), FALLBACK_CONTENT_SECURITY_POLICY, `${surface}: matcher-excluded paths keep the fallback CSP`);
    assertCommonHeaders(excluded, surface, "/_next/static/*");
    await excluded.arrayBuffer();

    // L3-F3 C-1: proxied API responses get the UI's static deny-all policy,
    // never the upstream's (which the proxy allowlist drops) and never none.
    const session = await fetch(`${base}/api/v1/session`);
    assert.equal(session.status, 401, `${surface}: /api/v1/session is proxied to the loopback stub`);
    assert.equal(session.headers.get("content-security-policy"), API_CONTENT_SECURITY_POLICY, `${surface}: static API CSP`);
    assert.equal(session.headers.get("x-upstream-marker"), null, `${surface}: upstream headers stay behind the allowlist`);
    assertCommonHeaders(session, surface, "/api/v1/session");
    assert.deepEqual(await session.json(), { error: "UNAUTHENTICATED" });
    assert.deepEqual(stubApi.last(), { forwardedFor: "127.0.0.1", edgeSecret: null }, `${surface}: without x-forwarded-for the socket address is the client`);

    // C2 / C2b (R2, L3-F11): the trusted peer with the edge secret names the
    // client by the LAST hop; without the secret, or with a wrong one, the
    // socket address stays the client; the secret header never travels on.
    const spoofAttempt = "198.51.100.7, 203.0.113.9";
    for (const [label, headers, expected] of [
      ["trusted peer + secret", { "x-forwarded-for": spoofAttempt, "x-debateai-edge-secret": edgeSecret }, "203.0.113.9"],
      ["trusted peer, no secret", { "x-forwarded-for": spoofAttempt }, "127.0.0.1"],
      ["trusted peer, wrong secret", { "x-forwarded-for": spoofAttempt, "x-debateai-edge-secret": `${edgeSecret.slice(0, -1)}!` }, "127.0.0.1"],
      ["trusted peer + secret, malformed hop", { "x-forwarded-for": "203.0.113.9:443", "x-debateai-edge-secret": edgeSecret }, "127.0.0.1"]
    ]) {
      const probe = await fetch(`${base}/api/v1/session`, { headers });
      assert.equal(probe.status, 401);
      await probe.arrayBuffer();
      assert.deepEqual(stubApi.last(), { forwardedFor: expected, edgeSecret: null }, `${surface}: ${label}`);
    }

    await assertRefusesToStart(root, { DIALECTICAL_UI_TRUSTED_PROXIES: "10.0.0.0/8" }, "DIALECTICAL_UI_TRUSTED_PROXIES_INVALID");
    await assertRefusesToStart(root, { DIALECTICAL_UI_EDGE_SECRET_PATH: worldReadablePath }, "DIALECTICAL_UI_EDGE_SECRET_INVALID");

    // L3-F4: the image optimizer (sharp) is off the runtime path.
    const image = await fetch(`${base}/_next/image?url=%2Ficon.svg&w=64&q=75`);
    assert.equal(image.status, 404, `${surface}: /_next/image is disabled`);
    await image.arrayBuffer();

    // L3-F2: production has no WebSocket surface; an orphan upgrade closes.
    const closedAfter = await probeOrphanUpgrade(port, 1_000);
    process.stdout.write(`${surface}: orphan upgrade socket closed after ${closedAfter} ms\n`);

    process.stdout.write(`${surface}: live 200 + 404 nonce CSP, fallback CSP, static API CSP, no image optimizer, trusted-proxy client ip, upgrade teardown PASS\n`);
  } finally {
    await stopServer(child);
    await stubApi.stop();
    rmSync(secretDir, { recursive: true, force: true });
  }
}

// The former second surface ("web") no longer exists in the tree; the loop
// is pinned to the one real UI surface.
for (const surface of ["apps/ui"]) await smoke(surface);
