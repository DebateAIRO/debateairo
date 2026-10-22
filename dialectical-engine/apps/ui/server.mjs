import { createServer } from "node:http";
import next from "next";
import { FALLBACK_CONTENT_SECURITY_POLICY } from "./content-security-policy.mjs";
import { acceptsUpgrade } from "./edge-upgrade.mjs";
import {
  assertBuildMatchesRelease,
  createReadinessResponder,
  installGracefulClose,
  noteUnusableApiBase,
  parseWebsiteReleaseKey,
  releaseHeaderFor
} from "./release-edge.mjs";
import { hardenIncomingProxyHeaders, parseTrustedProxies, readEdgeSecret } from "./trusted-client-ip.mjs";

function refuse(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

const development = process.argv.includes("--dev");
// This Node process is the ruled network edge. A reverse proxy in front of it
// is trusted only when named exactly (R2 / C2): DIALECTICAL_UI_TRUSTED_PROXIES
// lists the peers whose x-forwarded-for may name the client, and
// DIALECTICAL_UI_EDGE_SECRET_PATH (C2b) adds a shared secret those peers must
// present. With neither set every client is its socket address. Both are
// parsed before Next starts so a wrong value refuses to boot.
const hostname = process.env.DIALECTICAL_UI_HOST?.trim() || "127.0.0.1";
const portText = process.env.PORT?.trim() || "3000";
const port = Number(portText);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw refuse("DIALECTICAL_UI_PORT_INVALID");
}
const trustedProxies = parseTrustedProxies(process.env.DIALECTICAL_UI_TRUSTED_PROXIES);
const edgeSecret = readEdgeSecret(process.env.DIALECTICAL_UI_EDGE_SECRET_PATH);
// NETOPIA spec 2026-10-05 §2.17.1: the card form's origin setting is removed; a start that still finds it names it
// once, never its value, and goes on.
for (const key of ["XMONEY_SDK_ORIGIN"]) {
  if (process.env[key] !== undefined) console.warn(JSON.stringify({ event: "ui.setting.retired", key }));
}
// L3-F6: the API proxy route vouches for the stamped client address only when THIS
// front door is in front of it. A bare `next start` never sets the marker, so a
// client-supplied `x-debateai-client-ip` is dropped there instead of being forwarded.
process.env.DIALECTICAL_UI_EDGE = "server.mjs";
// Side-by-side spec §1 (plan C12): the release this website is, required outside --dev; a production start serves
// only a build stamped for the same release (`next build && node release-edge.mjs --stamp`), so a person is never
// served another release's pages (O1). Checked after the edge settings above so their refusals keep their codes.
const releaseKey = parseWebsiteReleaseKey(process.env.RELEASE_KEY, { development });
const distDir = process.env.NEXT_DIST_DIR || ".next";
if (!development) assertBuildMatchesRelease(distDir, releaseKey);
// Spec §6: /readyz stays BOOTING without a usable API base; outside --dev the boot names that cause (C12 review).
const apiBase = process.env.DIALECTICAL_API_BASE?.trim();
noteUnusableApiBase(apiBase, { development });
// Spec §6: SIGTERM turns /readyz to DRAINING as the server stops accepting; no new probe sees it (Caddy meets a refused
// connection, the same effect — release-edge.mjs installGracefulClose, final fix wave W5).
let draining = false;
const readiness = createReadinessResponder({
  apiBase,
  releaseKey,
  fetch: globalThis.fetch,
  draining: () => draining
});

const app = next({ dev: development, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const upgrade = app.getUpgradeHandler();
const server = createServer((request, response) => {
  hardenIncomingProxyHeaders(request.headers, request.socket.remoteAddress, trustedProxies, edgeSecret);
  // L3-F3 C-2 (fail-closed): a policy exists before Next runs. The middleware
  // replaces it on every route it matches; anything it does not match —
  // static chunks, a skipped middleware — still carries this one.
  response.setHeader("content-security-policy", FALLBACK_CONTENT_SECURITY_POLICY);
  // Spec §7: every website answer names its release; a proxied /api answer carries only its API's own (the same key
  // when the pair is healthy, which /readyz checks), so a headerless API shows as missing (C12 review).
  const ownRelease = releaseHeaderFor(releaseKey, request.url);
  if (ownRelease !== null) response.setHeader("x-debateai-release", ownRelease);
  // Spec §6: the health check Caddy polls (with or without the edge secret) is answered here, never by Next.
  if (readiness(request, response)) return;
  void handle(request, response).catch((error) => {
    console.error("[UI_REQUEST_FAILED]", error);
    if (!response.headersSent) response.statusCode = 500;
    response.end("INTERNAL_SERVER_ERROR");
  });
});
server.on("upgrade", (request, socket, head) => {
  hardenIncomingProxyHeaders(request.headers, request.socket.remoteAddress, trustedProxies, edgeSecret);
  // L3-F2: Next leaves an unmatched upgrade socket open forever; only what
  // the edge knows it serves (dev HMR) is delegated, everything else dies here.
  if (!acceptsUpgrade(development, request.url)) {
    socket.destroy();
    return;
  }
  void upgrade(request, socket, head).catch(() => socket.destroy());
});
// L3-F2: the pre-request phases are bounded explicitly (Node's defaults,
// stated). Deliberately no socket-inactivity timeout (server.timeout): the
// proxied run event stream is SSE without a heartbeat and would be severed
// mid-silence; orphaned upgrades are impossible after the gate above.
server.headersTimeout = 60_000;
server.requestTimeout = 300_000;
server.listen(port, hostname);
// Spec §6: a planned stop stops accepting at once, closes, and exits 0 within 20 s.
installGracefulClose({ server, process, onDrain: () => { draining = true; } });
