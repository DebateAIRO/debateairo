import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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

function assertSecurityHeaders(response, surface, path) {
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/, `${surface} ${path}: restrictive default-src`);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/, `${surface} ${path}: production Next scripts are permitted`);
  assert.match(csp, /object-src 'none'/, `${surface} ${path}: plugins disabled`);
  assert.match(csp, /base-uri 'none'/, `${surface} ${path}: base injection disabled`);
  assert.match(csp, /frame-ancestors 'none'/, `${surface} ${path}: framing disabled`);
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  assert.match(response.headers.get("cache-control") ?? "", /(?:^|,\s*)no-store(?:,|$)/);
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

async function smoke(surface) {
  const port = await availablePort();
  const root = resolve(repositoryRoot, surface);
  const log = [];
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      DIALECTICAL_UI_HOST: "127.0.0.1",
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
    assertSecurityHeaders(home, surface, "/");
    const html = await home.text();
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
    assert(scripts.length > 0, `${surface} emits production hydration scripts`);
    assert(scripts.every((source) => source.startsWith("/_next/")), `${surface} hydration scripts stay same-origin`);
    assert(html.includes("<script") && html.includes("self.__next_f"), `${surface} emits Next hydration state allowed by its CSP`);

    const notFound = await fetch(`${base}/s5-security-header-missing-route`);
    assert.equal(notFound.status, 404, `${surface} exercises a live production 404`);
    assertSecurityHeaders(notFound, surface, "/404");
    await notFound.arrayBuffer();
    process.stdout.write(`${surface}: live 200 + 404 security headers and CSP hydration smoke PASS\n`);
  } finally {
    await stopServer(child);
  }
}

for (const surface of ["apps/ui", "web"]) await smoke(surface);
