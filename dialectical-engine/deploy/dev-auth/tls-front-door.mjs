#!/usr/bin/env node

import { createServer as createHttpsServer } from "node:https";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { connect as connectTcp } from "node:net";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDevCustodyRoot } from "./custody-root.mjs";

const DEFAULT_OPTIONS = Object.freeze({
  listenHost: "127.0.0.1",
  listenPort: 3000,
  upstreamHost: "127.0.0.1",
  upstreamPort: 3001
});
const FILE_MODE = 0o600;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_JSON_BYTES = 1_024;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

export class DevTlsFrontDoorError extends Error {
  constructor(code, cause) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "DevTlsFrontDoorError";
  }
}

function isExactSessionDenial(response) {
  return response.statusCode === 401
    && response.contentType.toLowerCase().startsWith("application/json")
    && response.body === '{"error":"SESSION_REQUIRED"}';
}

function isExactUiReadiness(response) {
  return response.login.statusCode === 200
    && response.login.contentType.toLowerCase().startsWith("text/html")
    && response.login.body.includes("Back to the graph.")
    && isExactSessionDenial(response.session);
}

function probeEndpoint(requestFunction, options, maximumBytes, errorCode) {
  return new Promise((resolveProbe, rejectProbe) => {
    const outgoing = requestFunction({ ...options, agent: false, timeout: 1_000 }, (response) => {
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.byteLength;
        if (total > maximumBytes) {
          outgoing.destroy(new DevTlsFrontDoorError(`${errorCode}_BODY_TOO_LARGE`));
          return;
        }
        chunks.push(bytes);
      });
      response.once("end", () => resolveProbe(Object.freeze({
        statusCode: response.statusCode ?? 0,
        contentType: String(response.headers["content-type"] ?? ""),
        body: Buffer.concat(chunks).toString("utf8")
      })));
    });
    outgoing.once("timeout", () => outgoing.destroy(new DevTlsFrontDoorError(`${errorCode}_TIMEOUT`)));
    outgoing.once("error", (error) => {
      if (error?.code === "ECONNREFUSED") resolveProbe(null);
      else rejectProbe(error instanceof DevTlsFrontDoorError
        ? error
        : new DevTlsFrontDoorError(errorCode));
    });
    outgoing.end();
  });
}

async function probeUi(requestFunction, options, errorCode) {
  const login = await probeEndpoint(
    requestFunction,
    { ...options, path: "/login" },
    MAX_HTML_BYTES,
    errorCode
  );
  if (login === null) return null;
  const session = await probeEndpoint(
    requestFunction,
    { ...options, path: "/api/v1/session" },
    MAX_JSON_BYTES,
    errorCode
  );
  if (session === null) return null;
  return Object.freeze({ login, session });
}

function isTcpPortOccupied(host, port) {
  return new Promise((resolveProbe, rejectProbe) => {
    const socket = connectTcp({ host, port });
    socket.setTimeout(1_000);
    socket.once("connect", () => {
      socket.destroy();
      resolveProbe(true);
    });
    socket.once("timeout", () => socket.destroy(new DevTlsFrontDoorError("DEV_TLS_PORT_PROBE_TIMEOUT")));
    socket.once("error", (error) => {
      if (error?.code === "ECONNREFUSED") resolveProbe(false);
      else rejectProbe(error instanceof DevTlsFrontDoorError
        ? error
        : new DevTlsFrontDoorError("DEV_TLS_PORT_PROBE_FAILED"));
    });
  });
}

async function readPrivateFile(path) {
  const metadata = await lstat(path).catch(() => null);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (metadata === null
    || !metadata.isFile()
    || metadata.isSymbolicLink()
    || (metadata.mode & 0o777) !== FILE_MODE
    || (currentUid !== null && metadata.uid !== currentUid)) {
    throw new DevTlsFrontDoorError("DEV_TLS_FILE_CUSTODY_INVALID");
  }
  return readFile(path);
}

function sanitizedHeaders(headers) {
  const sanitized = { ...headers };
  for (const name of Object.keys(sanitized)) {
    const lower = name.toLowerCase();
    if (lower === "forwarded" || lower.startsWith("x-forwarded-")) delete sanitized[name];
  }
  return sanitized;
}

function responseHeaders(headers) {
  const sanitized = { ...headers };
  for (const name of Object.keys(sanitized)) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) delete sanitized[name];
  }
  return sanitized;
}

function writeUpgradeResponse(socket, response) {
  socket.write(`HTTP/1.1 ${response.statusCode ?? 502} ${response.statusMessage ?? ""}\r\n`);
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    const name = response.rawHeaders[index];
    const value = response.rawHeaders[index + 1];
    if (name !== undefined
      && value !== undefined
      && name.toLowerCase() !== "proxy-authenticate"
      && name.toLowerCase() !== "proxy-authorization") {
      socket.write(`${name}: ${value}\r\n`);
    }
  }
  socket.write("\r\n");
}

export async function startDevTlsFrontDoor(options) {
  const listenHost = options.listenHost ?? DEFAULT_OPTIONS.listenHost;
  const listenPort = options.listenPort ?? DEFAULT_OPTIONS.listenPort;
  const upstreamHost = options.upstreamHost ?? DEFAULT_OPTIONS.upstreamHost;
  const upstreamPort = options.upstreamPort ?? DEFAULT_OPTIONS.upstreamPort;
  if (listenHost !== "127.0.0.1"
    || upstreamHost !== "127.0.0.1"
    || !Number.isInteger(listenPort)
    || listenPort < 0
    || listenPort > 65_535
    || !Number.isInteger(upstreamPort)
    || upstreamPort < 1
    || upstreamPort > 65_535) {
    throw new DevTlsFrontDoorError("DEV_TLS_ENDPOINT_INVALID");
  }
  const [certificate, privateKey] = await Promise.all([
    readPrivateFile(resolve(options.certificatePath)),
    readPrivateFile(resolve(options.privateKeyPath))
  ]);

  let activePort = listenPort;
  const expectedHost = () => `localhost:${activePort}`;
  const hostAllowed = (request) => request.headers.host === expectedHost();
  const proxyOptions = (request) => ({
    host: upstreamHost,
    port: upstreamPort,
    method: request.method,
    path: request.url,
    headers: sanitizedHeaders(request.headers)
  });
  // Upgraded sockets leave the server's connection table, so `server.close()`
  // waits on them forever unless they are tracked and destroyed here (L7-F1).
  const upgradedSockets = new Set();
  const server = createHttpsServer({ cert: certificate, key: privateKey }, (request, response) => {
    if (!hostAllowed(request)) {
      response.writeHead(421, { "content-type": "text/plain; charset=utf-8" });
      response.end("MISDIRECTED_REQUEST");
      return;
    }
    const upstream = httpRequest(proxyOptions(request), (upstreamResponse) => {
      const status = upstreamResponse.statusCode ?? 502;
      const headers = responseHeaders(upstreamResponse.headers);
      if (upstreamResponse.statusMessage === undefined) response.writeHead(status, headers);
      else response.writeHead(status, upstreamResponse.statusMessage, headers);
      upstreamResponse.pipe(response);
    });
    upstream.once("error", () => {
      if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      response.end("UPSTREAM_UNAVAILABLE");
    });
    request.pipe(upstream);
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("upgrade", (request, socket, head) => {
    // Without this an ordinary client RST before the handshake is an uncaught error.
    socket.on("error", () => socket.destroy());
    if (!hostAllowed(request)) {
      socket.end("HTTP/1.1 421 Misdirected Request\r\nConnection: close\r\n\r\n");
      return;
    }
    upgradedSockets.add(socket);
    socket.once("close", () => upgradedSockets.delete(socket));
    const upstream = httpRequest(proxyOptions(request));
    upstream.once("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
      upgradedSockets.add(upstreamSocket);
      // Either half failing takes the pair down; a reset upstream must never
      // surface as an uncaught error that tears the whole dev stack down.
      const destroyPair = () => {
        upgradedSockets.delete(socket);
        upgradedSockets.delete(upstreamSocket);
        socket.destroy();
        upstreamSocket.destroy();
      };
      socket.on("error", destroyPair);
      upstreamSocket.on("error", destroyPair);
      socket.once("close", destroyPair);
      upstreamSocket.once("close", destroyPair);
      writeUpgradeResponse(socket, upstreamResponse);
      if (upstreamHead.byteLength > 0) socket.write(upstreamHead);
      if (head.byteLength > 0) upstreamSocket.write(head);
      upstreamSocket.pipe(socket).pipe(upstreamSocket);
    });
    upstream.once("response", (upstreamResponse) => {
      writeUpgradeResponse(socket, upstreamResponse);
      upstreamResponse.pipe(socket);
    });
    upstream.once("error", () => socket.destroy());
    upstream.end();
  });

  await new Promise((resolvePromise, rejectPromise) => {
    const onError = (error) => rejectPromise(error);
    server.once("error", onError);
    server.listen(listenPort, listenHost, () => {
      server.off("error", onError);
      const address = server.address();
      if (address === null || typeof address === "string") {
        rejectPromise(new DevTlsFrontDoorError("DEV_TLS_LISTEN_FAILED"));
        return;
      }
      activePort = address.port;
      resolvePromise();
    });
  });

  return Object.freeze({
    host: listenHost,
    port: activePort,
    close: () => new Promise((resolvePromise, rejectPromise) => {
      for (const upgraded of [...upgradedSockets]) upgraded.destroy();
      upgradedSockets.clear();
      server.close((error) => error === undefined ? resolvePromise() : rejectPromise(error));
      server.closeAllConnections();
    })
  });
}

async function cleanupFrontDoor(frontDoor) {
  try {
    await frontDoor.close();
  } catch (error) {
    throw new DevTlsFrontDoorError("DEV_TLS_FRONT_DOOR_CLEANUP_FAILED", { cause: error });
  }
}

export async function startAttestedDevTlsFrontDoor(input) {
  const maximumProbeAttempts = input.maximumProbeAttempts ?? 50;
  if (!Number.isInteger(maximumProbeAttempts)
    || maximumProbeAttempts < 1
    || maximumProbeAttempts > 300) {
    throw new DevTlsFrontDoorError("DEV_TLS_PUBLIC_PROBE_BOUND_INVALID");
  }
  if (await input.operations.isPublicPortOccupied()) {
    throw new DevTlsFrontDoorError("DEV_TLS_PUBLIC_PORT_OCCUPIED");
  }
  const privateUi = await input.operations.probePrivateUi();
  if (privateUi === null || !isExactUiReadiness(privateUi)) {
    throw new DevTlsFrontDoorError("DEV_TLS_PRIVATE_UI_UNAVAILABLE");
  }

  let frontDoor;
  try {
    frontDoor = await input.operations.startFrontDoor();
  } catch (error) {
    throw error instanceof DevTlsFrontDoorError
      ? error
      : new DevTlsFrontDoorError("DEV_TLS_FRONT_DOOR_START_FAILED", { cause: error });
  }
  try {
    for (let attempt = 0; attempt < maximumProbeAttempts; attempt += 1) {
      const publicUi = await input.operations.probePublicUi();
      if (publicUi !== null) {
        if (!isExactUiReadiness(publicUi)) {
          throw new DevTlsFrontDoorError("DEV_TLS_PUBLIC_READINESS_INVALID");
        }
        let stopped = false;
        return Object.freeze({
          receipt: Object.freeze({ origin: "https://localhost:3000", trust: "SYSTEM" }),
          async stop() {
            if (stopped) return;
            stopped = true;
            await frontDoor.close();
          }
        });
      }
      if (attempt + 1 < maximumProbeAttempts) await input.operations.delay(100);
    }
    throw new DevTlsFrontDoorError("DEV_TLS_PUBLIC_READINESS_TIMEOUT");
  } catch (error) {
    await cleanupFrontDoor(frontDoor);
    throw error;
  }
}

export function createDevTlsReadinessOperations(repositoryRoot = ".") {
  setDefaultCACertificates([
    ...getCACertificates("default"),
    ...getCACertificates("system")
  ]);
  const root = resolve(resolveDevCustodyRoot(repositoryRoot), "tls");
  return Object.freeze({
    isPublicPortOccupied: () => isTcpPortOccupied("127.0.0.1", 3_000),
    probePrivateUi: () => probeUi(
      httpRequest,
      { host: "127.0.0.1", port: 3_001 },
      "DEV_TLS_PRIVATE_PROBE_FAILED"
    ),
    startFrontDoor: () => startDevTlsFrontDoor({
      certificatePath: resolve(root, "localhost.pem"),
      privateKeyPath: resolve(root, "localhost-key.pem")
    }),
    probePublicUi: () => probeUi(
      httpsRequest,
      { host: "localhost", port: 3_000, servername: "localhost" },
      "DEV_TLS_PUBLIC_PROBE_FAILED"
    ),
    delay: (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
  });
}

async function main() {
  const frontDoor = await startAttestedDevTlsFrontDoor({
    operations: createDevTlsReadinessOperations()
  });
  process.stdout.write(`DEV_TLS_FRONT_DOOR_READY ${frontDoor.receipt.origin}:SYSTEM_TRUST\n`);
  const close = async () => {
    await frontDoor.stop();
    process.exitCode = 0;
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof DevTlsFrontDoorError
      ? error.message
      : "DEV_TLS_FRONT_DOOR_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
