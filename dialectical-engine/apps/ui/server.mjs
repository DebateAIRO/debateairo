import { createServer } from "node:http";
import next from "next";
import { FALLBACK_CONTENT_SECURITY_POLICY } from "./content-security-policy.mjs";
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
  void handle(request, response).catch((error) => {
    console.error("[UI_REQUEST_FAILED]", error);
    if (!response.headersSent) response.statusCode = 500;
    response.end("INTERNAL_SERVER_ERROR");
  });
});
server.on("upgrade", (request, socket, head) => {
  hardenIncomingProxyHeaders(request.headers, request.socket.remoteAddress, trustedProxies, edgeSecret);
  void upgrade(request, socket, head).catch(() => socket.destroy());
});
server.listen(port, hostname);
