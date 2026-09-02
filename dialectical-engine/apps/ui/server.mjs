import { createServer } from "node:http";
import next from "next";
import { FALLBACK_CONTENT_SECURITY_POLICY } from "./content-security-policy.mjs";
import { hardenIncomingProxyHeaders } from "./trusted-client-ip.mjs";

const development = process.argv.includes("--dev");
// This Node process is the ruled network edge. Putting a CDN or reverse proxy
// in front requires a separate, explicit trust rule; forwarded headers are
// intentionally discarded here instead of guessed at.
const hostname = process.env.DIALECTICAL_UI_HOST?.trim() || "127.0.0.1";
const portText = process.env.PORT?.trim() || "3000";
const port = Number(portText);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("DIALECTICAL_UI_PORT_INVALID");
}

const app = next({ dev: development, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const upgrade = app.getUpgradeHandler();
const server = createServer((request, response) => {
  hardenIncomingProxyHeaders(request.headers, request.socket.remoteAddress);
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
  hardenIncomingProxyHeaders(request.headers, request.socket.remoteAddress);
  void upgrade(request, socket, head).catch(() => socket.destroy());
});
server.listen(port, hostname);
