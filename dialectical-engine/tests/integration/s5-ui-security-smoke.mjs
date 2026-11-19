import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Exactly the policy the UI edge pre-sets on every response before Next runs
// (apps/ui/content-security-policy.mjs). A matcher-excluded path must still
// carry it: nothing is served without a policy.
// (The Turnstile sources joined the policy at HEAD without this copy following; NV-03's run brought it up to date.)
const FALLBACK_CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests";
const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
const NONCE_SOURCE = /script-src 'self' 'nonce-([A-Za-z0-9+/=]{22,})' 'strict-dynamic'(?:;|$)/;
const INJECTED_NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
// Side-by-side C12: outside --dev server.mjs needs RELEASE_KEY and serves only a build stamped for it. The smoke
// stamps the build it was given for a test key (built from pieces: no key name beside a literal, gitleaks). C13: the
// browser compares that key's code part with the code the build baked in (NEXT_PUBLIC_DEBATEAI_RELEASE_CODE), so the
// test key carries the build's own code, never a made-up one, and no page ever sees a false "newer version" note.

/** The release code the build at `root` baked in for the browser (next.config.mjs `env`, recorded by `next build`). */
function bakedReleaseCode(root) {
  const recorded = JSON.parse(readFileSync(join(root, process.env.NEXT_DIST_DIR || ".next", "required-server-files.json"), "utf8"));
  const code = recorded?.config?.env?.NEXT_PUBLIC_DEBATEAI_RELEASE_CODE;
  assert.match(String(code), /^[0-9a-f]{12}$/u, "the build records its release code (rebuild with the current next.config.mjs)");
  return code;
}

/** This build's test key, and another release's key the same build was not made for. */
function testReleaseKeys(root) {
  const code = bakedReleaseCode(root);
  return { own: ["r17", code].join("-"), other: ["r17", code === "a".repeat(12) ? "b".repeat(12) : "a".repeat(12)].join("-") };
}

/** `node release-edge.mjs --stamp` in the UI root, as the build script runs it, for `releaseKey`. */
function stampBuild(root, releaseKey) {
  const stamped = spawnSync(process.execPath, ["release-edge.mjs", "--stamp"], {
    cwd: root,
    env: { ...process.env, RELEASE_KEY: releaseKey },
    encoding: "utf8"
  });
  assert.equal(stamped.status, 0, `the build stamp is written\n${stamped.stderr}`);
}

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
  // Kept apart from `seen`, whose rows the address and proof checks compare whole.
  const cookies = [];
  const server = createHttpServer((request, response) => {
    cookies.push(request.headers.cookie ?? null);
    seen.push({
      forwardedFor: request.headers["x-forwarded-for"] ?? null,
      edgeSecret: request.headers["x-debateai-edge-secret"] ?? null,
      // NV-03: the UI-to-API proof the website sends with every forwarded address and on its readiness fetch.
      uiApiProof: request.headers["x-debateai-ui-proof"] ?? null
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
    lastCookie: () => cookies[cookies.length - 1] ?? null,
    stop: () => new Promise((resolveClosed) => {
      server.closeAllConnections();
      server.close(() => resolveClosed());
    })
  };
}

function assertCommonHeaders(response, surface, path) {
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains", `${surface} ${path}: HSTS`);
  assert.equal(response.headers.get("x-frame-options"), "DENY", `${surface} ${path}: framing denied`);
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin", `${surface} ${path}: COOP same-origin (NV-05)`);
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
  const openingTags = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
  assert(openingTags.length > 0, `${surface} ${path}: emits scripts`);
  const sources = openingTags.flatMap((tag) => {
    const source = tag.match(/\bsrc="([^"]+)"/i);
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

/**
 * A GET that sends exactly `headers` (and Host): fetch() adds an `accept-language: *` of its own, so it cannot stand in
 * for a crawler that sends no Accept-Language at all.
 */
function getExactly(url, headers) {
  return new Promise((resolveResponse, reject) => {
    const request = httpRequest(url, { headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolveResponse({
        status: response.statusCode,
        header: (name) => {
          const value = response.headers[name];
          return Array.isArray(value) ? value.join(", ") : value ?? null;
        },
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.on("error", reject);
    request.end();
  });
}

/** The language the root layout drew the page in, from its `<html lang>`. */
function documentLanguage(html) {
  return /<html\b[^>]*\blang="([^"]*)"/u.exec(html)?.[1] ?? null;
}

/**
 * A visitor who has not picked a language sees Romanian when the browser prefers Romanian, English otherwise, and the
 * cookie the language list writes always wins. The middleware hands the pages that language as a cookie on this request
 * only; the unit tests see the header it returns, and only a built server proves Next's cookies() reads it. Every answer
 * says it varies with Accept-Language and is never stored, so no page is kept in one language for everyone.
 */
async function assertFirstVisitLanguage(base, surface) {
  const ENGLISH_TERMS = "Who we are and how to reach us";
  const ROMANIAN_TERMS = "Cine suntem";
  const cases = [
    ["/terms", "a crawler that sends no Accept-Language", {}, 200, "en", ENGLISH_TERMS, "<title>Terms of service"],
    ["/terms", "a Romanian browser", { "accept-language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7" }, 200, "ro", ROMANIAN_TERMS, "<title>Termenii serviciului"],
    ["/terms", "a Moldovan browser", { "accept-language": "ro-MD" }, 200, "ro", ROMANIAN_TERMS, "<title>Termenii serviciului"],
    ["/terms", "an English browser that also reads Romanian", { "accept-language": "en-US,en;q=0.9,ro;q=0.8" }, 200, "en", ENGLISH_TERMS, "<title>Terms of service"],
    ["/terms", "a German browser", { "accept-language": "de-DE,de;q=0.9" }, 200, "en", ENGLISH_TERMS, "<title>Terms of service"],
    ["/terms", "a Romanian browser whose visitor picked English", { "accept-language": "ro", cookie: "debateai.locale=en-GB" }, 200, "en-GB", ENGLISH_TERMS, "<title>Terms of service"],
    ["/terms", "an English browser whose visitor picked Romanian", { "accept-language": "en-US,en", cookie: "debateai.locale=ro" }, 200, "ro", ROMANIAN_TERMS, "<title>Termenii serviciului"],
    ["/terms", "a Romanian browser with an older cookie for a language no longer offered", { "accept-language": "ro", cookie: "debateai.locale=de" }, 200, "ro", ROMANIAN_TERMS, "<title>Termenii serviciului"],
    // Two copies of the locale cookie (one set for a parent domain, say): one offered copy is a choice, so the browser's
    // language is not added, and the pages read the last copy as they always have.
    ["/terms", "a Romanian browser with English, then an older language", { "accept-language": "ro", cookie: "debateai.locale=en; debateai.locale=de" }, 200, "en", ENGLISH_TERMS, "<title>Terms of service"],
    ["/terms", "a Romanian browser with an older language, then English", { "accept-language": "ro", cookie: "debateai.locale=de; debateai.locale=en" }, 200, "en", ENGLISH_TERMS, "<title>Terms of service"],
    ["/terms", "a Romanian browser with two older languages", { "accept-language": "ro", cookie: "debateai.locale=de; debateai.locale=fr" }, 200, "ro", ROMANIAN_TERMS, "<title>Termenii serviciului"],
    // An explicit ?lang= still picks the legal text; the page around it follows the browser, as with a cookie.
    ["/terms?lang=en", "a Romanian browser asking for the English text", { "accept-language": "ro" }, 200, "ro", ENGLISH_TERMS, "<title>Termenii serviciului"],
    ["/terms", "a malformed header", { "accept-language": "ro;q=2, ;;; ,=,ro-;q=0.5,*;q=x" }, 200, "en", ENGLISH_TERMS, "<title>Terms of service"],
    // Only the first kilobyte is read: Romanian named past it does not count.
    ["/terms", "an oversized header", { "accept-language": `${"de,".repeat(2_000)}ro` }, 200, "en", ENGLISH_TERMS, "<title>Terms of service"],
    ["/", "a Romanian browser on the home page", { "accept-language": "ro" }, 200, "ro", null, null],
    ["/", "a crawler on the home page", {}, 200, "en", null, null],
    ["/s5-first-visit-missing-route", "a Romanian browser on a missing page", { "accept-language": "ro" }, 404, "ro", null, null],
    // A link followed inside the site fetches the next page's navigation data, not a document.
    ["/terms", "a Romanian browser's navigation data", { "accept-language": "ro", rsc: "1" }, 200, null, ROMANIAN_TERMS, null],
    // The report download reads the cookie header itself, not through Next's cookie store; it is not a rendered page.
    ["/debate/s5-first-visit/report", "a Romanian browser asking for a report while signed out", { "accept-language": "ro" }, 401, null, "Autentificați-vă pentru a descărca acest raport.", null],
    ["/debate/s5-first-visit/report", "a crawler asking for a report", {}, 401, null, "Sign in to download this report.", null],
    ["/debate/s5-first-visit/report", "a Romanian browser whose visitor picked English, asking for a report", { "accept-language": "ro", cookie: "debateai.locale=en-GB" }, 401, null, "Sign in to download this report.", null]
  ];
  for (const [path, label, headers, status, language, text, title] of cases) {
    const answer = await getExactly(`${base}${path}`, headers);
    assert.equal(answer.status, status, `${surface} ${path}, ${label}: status`);
    assert.equal(documentLanguage(answer.body), language, `${surface} ${path}, ${label}: <html lang>`);
    if (text !== null) assert(answer.body.includes(text), `${surface} ${path}, ${label}: the text is in the expected language`);
    if (title !== null) assert(answer.body.includes(title), `${surface} ${path}, ${label}: the tab title is in the page's language`);
    assert.match(answer.header("vary") ?? "", /(?:^|,\s*)Accept-Language(?:,|$)/iu, `${surface} ${path}, ${label}: Vary names Accept-Language`);
    assert.match(answer.header("cache-control") ?? "", /(?:^|,\s*)no-store(?:,|$)/u, `${surface} ${path}, ${label}: no-store`);
    assert.doesNotMatch(answer.header("set-cookie") ?? "", /debateai\.locale=/u, `${surface} ${path}, ${label}: the language is never stored`);
  }
  // A /_next/static chunk never reaches the middleware and is the same in every language, so it keeps one cache entry
  // for everyone.
  const page = await getExactly(`${base}/terms`, { "accept-language": "ro" });
  const chunk = /<script\b[^>]*\bsrc="(\/_next\/static\/[^"]+\.js)"/u.exec(page.body)?.[1];
  assert(chunk !== undefined, `${surface} /terms: names a static script`);
  const asset = await getExactly(`${base}${chunk}`, { "accept-language": "ro" });
  assert.equal(asset.status, 200, `${surface} ${chunk}: served`);
  assert.doesNotMatch(asset.header("vary") ?? "", /accept-language/iu, `${surface} ${chunk}: a static file does not vary with the language`);
  // A file from public/ does go through the middleware, so it carries the same Vary as a page; like a page it is never
  // stored, so no cache keeps a copy of it per language either.
  const publicFile = await getExactly(`${base}/consumer-protection/anpc-sal.png`, { "accept-language": "ro" });
  assert.equal(publicFile.status, 200, `${surface} /consumer-protection/anpc-sal.png: served`);
  assert.match(publicFile.header("cache-control") ?? "", /(?:^|,\s*)no-store(?:,|$)/u, `${surface} /consumer-protection/anpc-sal.png: no-store`);
}

/**
 * The /api proxy follows the same rule, so a mail a page sends (the cancel link's, for one) is in the language the
 * visitor saw: the API takes the mail's language from the locale cookie, and the proxy forwards the browser's Romanian
 * as that cookie when the visitor has picked none.
 */
async function assertProxyFollowsFirstVisitLanguage(base, stubApi, surface) {
  for (const [label, headers, forwarded] of [
    ["a Romanian browser", { "accept-language": "ro-RO,ro;q=0.9" }, "debateai.locale=ro"],
    ["an English browser that also reads Romanian", { "accept-language": "en-US,en;q=0.9,ro;q=0.8" }, null],
    ["a crawler that sends no Accept-Language", {}, null],
    ["a Romanian browser whose visitor picked English", { "accept-language": "ro", cookie: "debateai.locale=en-GB" }, "debateai.locale=en-GB"],
    ["an English browser whose visitor picked Romanian", { "accept-language": "en", cookie: "debateai.locale=ro" }, "debateai.locale=ro"],
    // The same two-copy cases as the pages above: the mails stay English where the pages do.
    ["a Romanian browser with English, then an older language", { "accept-language": "ro", cookie: "debateai.locale=en; debateai.locale=de" }, "debateai.locale=en"],
    ["a Romanian browser with an older language, then English", { "accept-language": "ro", cookie: "debateai.locale=de; debateai.locale=en" }, null],
    ["a Romanian browser with two older languages", { "accept-language": "ro", cookie: "debateai.locale=de; debateai.locale=fr" }, "debateai.locale=ro"]
  ]) {
    const answer = await getExactly(`${base}/api/v1/session`, headers);
    assert.equal(answer.status, 401, `${surface} /api, ${label}: proxied`);
    assert.equal(stubApi.lastCookie(), forwarded, `${surface} /api, ${label}: the locale cookie the API receives`);
    // Only the mails the API sends follow the language; its answers do not, so they do not vary with it.
    assert.doesNotMatch(answer.header("vary") ?? "", /accept-language/iu, `${surface} /api, ${label}: no Vary on the language`);
  }
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
  if (child.exitCode !== null || child.signalCode !== null) return child.exitCode;
  child.kill("SIGTERM");
  return Promise.race([
    new Promise((resolveExit) => child.once("exit", (code) => resolveExit(code))),
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
  // NV-03: the UI-to-API proof, the website's copy (the stub API stands in for the API's).
  const proofPath = join(secretDir, "ui-api-proof.secret");
  const uiApiProof = randomBytes(32).toString("base64url");
  writeFileSync(proofPath, `${uiApiProof}\n`);
  chmodSync(proofPath, 0o600);
  const worldReadablePath = join(secretDir, "world.secret");
  writeFileSync(worldReadablePath, edgeSecret);
  chmodSync(worldReadablePath, 0o644);
  const log = [];
  const { own: TEST_RELEASE_KEY, other: OTHER_RELEASE_KEY } = testReleaseKeys(root);
  stampBuild(root, TEST_RELEASE_KEY);
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      RELEASE_KEY: TEST_RELEASE_KEY,
      DIALECTICAL_UI_HOST: "127.0.0.1",
      DIALECTICAL_API_BASE: stubApi.base,
      // C2 / C2b: this loopback client plays the trusted reverse proxy.
      DIALECTICAL_UI_TRUSTED_PROXIES: "127.0.0.1, ::1",
      DIALECTICAL_UI_EDGE_SECRET_PATH: secretPath,
      DIALECTICAL_UI_API_PROOF_PATH: proofPath,
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
    assert.equal(home.headers.get("x-debateai-release"), TEST_RELEASE_KEY, `${surface}: every answer names its release (C12)`);
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

    await assertFirstVisitLanguage(base, surface);

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
    // C12 review: a proxied answer carries only its API's own release header; this stub sends none.
    assert.equal(session.headers.get("x-debateai-release"), null, `${surface}: the edge lends no release header to /api`);
    assert.deepEqual(await session.json(), { error: "UNAUTHENTICATED" });
    assert.deepEqual(stubApi.last(), { forwardedFor: "127.0.0.1", edgeSecret: null, uiApiProof }, `${surface}: without x-forwarded-for the socket address is the client`);

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
      assert.deepEqual(stubApi.last(), { forwardedFor: expected, edgeSecret: null, uiApiProof }, `${surface}: ${label}`);
    }

    await assertProxyFollowsFirstVisitLanguage(base, stubApi, surface);

    await assertRefusesToStart(root, { DIALECTICAL_UI_TRUSTED_PROXIES: "10.0.0.0/8" }, "DIALECTICAL_UI_TRUSTED_PROXIES_INVALID");
    await assertRefusesToStart(root, { DIALECTICAL_UI_EDGE_SECRET_PATH: worldReadablePath }, "DIALECTICAL_UI_EDGE_SECRET_INVALID");
    // Side-by-side C12: no key, or a key the build was not stamped for, refuses to start.
    await assertRefusesToStart(root, { RELEASE_KEY: "" }, "RELEASE_KEY_REQUIRED");
    await assertRefusesToStart(root, { RELEASE_KEY: OTHER_RELEASE_KEY }, "RELEASE_KEY_BUILD_MISMATCH");
    // NV-03: a website that trusts a proxy refuses to start without a proof, and with a proof equal to its edge secret.
    await assertRefusesToStart(root, { DIALECTICAL_UI_TRUSTED_PROXIES: "127.0.0.1" }, "DIALECTICAL_UI_API_PROOF_REQUIRED");
    await assertRefusesToStart(root, { DIALECTICAL_UI_EDGE_SECRET_PATH: secretPath, DIALECTICAL_UI_API_PROOF_PATH: secretPath }, "DIALECTICAL_UI_API_PROOF_REUSES_EDGE_SECRET");

    // Side-by-side C12 (spec §6): /readyz is answered by the edge from its own API's /readyz, for Caddy's probe with
    // the edge secret as for any caller. The stub API answers 401 to everything, which is not a readiness answer.
    for (const headers of [{}, { "x-debateai-edge-secret": edgeSecret }]) {
      const ready = await fetch(`${base}/readyz`, { headers });
      assert.equal(ready.status, 503, `${surface}: /readyz is not ready while its API gives no readiness answer`);
      assert.equal(ready.headers.get("x-debateai-release"), TEST_RELEASE_KEY);
      assert.deepEqual(await ready.json(), { ready: false, releaseKey: TEST_RELEASE_KEY, reasons: ["BOOTING"] });
    }
    // NV-03: the readiness fetch carries the proof (and no forwarded address).
    assert.deepEqual(stubApi.last(), { forwardedFor: null, edgeSecret: null, uiApiProof }, `${surface}: the readiness fetch carries the UI-to-API proof`);
    // NV-03: the bundled forwarders saw the value server.mjs installed (no "never installed" line).
    assert(!log.join("").includes("ui.api_proof.not_installed"), `${surface}: the route code sees the installed UI-to-API proof`);

    // L3-F4: the image optimizer (sharp) is off the runtime path.
    const image = await fetch(`${base}/_next/image?url=%2Ficon.svg&w=64&q=75`);
    assert.equal(image.status, 404, `${surface}: /_next/image is disabled`);
    await image.arrayBuffer();

    // L3-F2: production has no WebSocket surface; an orphan upgrade closes.
    const closedAfter = await probeOrphanUpgrade(port, 1_000);
    process.stdout.write(`${surface}: orphan upgrade socket closed after ${closedAfter} ms\n`);

    // Side-by-side C12 (spec §6): a planned stop is never a failure.
    assert.equal(await stopServer(child), 0, `${surface}: SIGTERM closes the server and exits 0`);

    process.stdout.write(`${surface}: live 200 + 404 nonce CSP, fallback CSP, static API CSP, first-visit language on pages and /api, no image optimizer, trusted-proxy client ip, upgrade teardown, release key + /readyz + clean SIGTERM PASS\n`);
  } finally {
    await stopServer(child);
    await stubApi.stop();
    rmSync(secretDir, { recursive: true, force: true });
  }
}

// The former second surface ("web") no longer exists in the tree; the loop
// is pinned to the one real UI surface.
for (const surface of ["apps/ui"]) await smoke(surface);
