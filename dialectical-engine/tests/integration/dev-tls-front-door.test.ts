import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createServer as createHttpServer, get as httpGet } from "node:http";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket as TcpSocket } from "node:net";
import { connect as connectTls } from "node:tls";
import type { TLSSocket as TlsSocket } from "node:tls";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureDevLocalCertificate
} from "../../deploy/dev-auth/create-local-certificate.mjs";
import {
  startDevTlsFrontDoor
} from "../../deploy/dev-auth/tls-front-door.mjs";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "debateai-dev-tls-"));
  roots.push(root);
  return root;
}

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(",") : value;
}

function listen(server: ReturnType<typeof createHttpServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") return reject(new Error("TEST_LISTEN_FAILED"));
      resolve(address.port);
    });
  });
}

function close(server: { close(callback: (error?: Error) => void): void }): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
}

describe("DEV-07 trusted local HTTPS front door", () => {
  it("generates and exactly reuses a private localhost certificate without installing trust", async () => {
    const root = temporaryRoot();
    const tlsDirectory = join(root, "tls");
    const fakeMkcert = join(root, "mkcert");
    const invocation = join(root, "mkcert-args.txt");
    writeFileSync(fakeMkcert, [
      "#!/bin/sh",
      `printf '%s\\n' \"$@\" > '${invocation}'`,
      "/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=localhost -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1' -out \"$2\" -keyout \"$4\" >/dev/null 2>&1"
    ].join("\n"), { mode: 0o700 });
    chmodSync(fakeMkcert, 0o700);

    const created = await ensureDevLocalCertificate({ tlsDirectory, mkcertExecutable: fakeMkcert });
    expect(created.reused).toBe(false);
    expect(created.certificatePath).toBe(join(tlsDirectory, "localhost.pem"));
    expect(created.privateKeyPath).toBe(join(tlsDirectory, "localhost-key.pem"));
    expect(mode(tlsDirectory)).toBe(0o700);
    expect(mode(created.certificatePath)).toBe(0o600);
    expect(mode(created.privateKeyPath)).toBe(0o600);
    expect(readFileSync(invocation, "utf8").trim().split("\n")).toEqual([
      "-cert-file", created.certificatePath,
      "-key-file", created.privateKeyPath,
      "localhost", "127.0.0.1", "::1"
    ]);
    expect(readFileSync(invocation, "utf8")).not.toContain("-install");

    writeFileSync(invocation, "must-not-run-again", "utf8");
    const reused = await ensureDevLocalCertificate({ tlsDirectory, mkcertExecutable: fakeMkcert });
    expect(reused).toEqual({ ...created, reused: true });
    expect(readFileSync(invocation, "utf8")).toBe("must-not-run-again");
  });

  it("proxies only TLS, preserves exact Origin and Secure cookies, and never upgrades plain HTTP", async () => {
    const root = temporaryRoot();
    const tlsDirectory = join(root, "tls");
    const fakeMkcert = join(root, "mkcert");
    writeFileSync(fakeMkcert, [
      "#!/bin/sh",
      "/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=localhost -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1' -out \"$2\" -keyout \"$4\" >/dev/null 2>&1"
    ].join("\n"), { mode: 0o700 });
    chmodSync(fakeMkcert, 0o700);
    const certificate = await ensureDevLocalCertificate({ tlsDirectory, mkcertExecutable: fakeMkcert });

    const observed: Array<{
      forwarded: string | undefined;
      host: string | undefined;
      origin: string | undefined;
      xForwardedFor: string | undefined;
    }> = [];
    const upstream = createHttpServer((request, response) => {
      observed.push({
        forwarded: request.headers.forwarded,
        host: request.headers.host,
        origin: request.headers.origin,
        xForwardedFor: singleHeader(request.headers["x-forwarded-for"])
      });
      const allowed = request.headers.origin === request.headers.host?.replace(/^/, "https://");
      response.statusCode = allowed ? 200 : 403;
      if (allowed) {
        response.setHeader("set-cookie", "__Host-debateai-session=test; Path=/; HttpOnly; Secure; SameSite=Lax");
      }
      response.end(allowed ? "OK" : "ORIGIN_REQUIRED");
    });
    const upstreamPort = await listen(upstream);
    const frontDoor = await startDevTlsFrontDoor({
      certificatePath: certificate.certificatePath,
      privateKeyPath: certificate.privateKeyPath,
      listenPort: 0,
      upstreamPort
    });
    const publicPort = frontDoor.port;
    const ca = readFileSync(certificate.certificatePath);
    const request = (
      origin: string,
      host = `localhost:${publicPort}`
    ): Promise<{ status: number | undefined; cookie: string[] | undefined }> =>
      new Promise((resolve, reject) => {
        const outgoing = httpsRequest({
          host: "127.0.0.1",
          port: publicPort,
          path: "/api/v1/auth/login",
          method: "POST",
          ca,
          servername: "localhost",
          headers: {
            forwarded: "for=203.0.113.7",
            host,
            origin,
            "x-forwarded-for": "203.0.113.7"
          }
        }, (response) => {
          response.resume();
          response.once("end", () => resolve({
            status: response.statusCode,
            cookie: response.headers["set-cookie"]
          }));
        });
        outgoing.once("error", reject);
        outgoing.end("{}");
      });

    try {
      const exactOrigin = `https://localhost:${publicPort}`;
      expect(await request(exactOrigin)).toEqual({
        status: 200,
        cookie: ["__Host-debateai-session=test; Path=/; HttpOnly; Secure; SameSite=Lax"]
      });
      expect(await request(`http://localhost:${publicPort}`)).toEqual({ status: 403, cookie: undefined });
      expect(await request(exactOrigin, "attacker.invalid")).toEqual({ status: 421, cookie: undefined });
      expect(observed).toEqual([
        {
          forwarded: undefined,
          host: `localhost:${publicPort}`,
          origin: exactOrigin,
          xForwardedFor: undefined
        },
        {
          forwarded: undefined,
          host: `localhost:${publicPort}`,
          origin: `http://localhost:${publicPort}`,
          xForwardedFor: undefined
        }
      ]);
      await expect(new Promise<void>((resolve, reject) => {
        const plain = httpGet({ host: "127.0.0.1", port: publicPort, path: "/" }, () => {
          reject(new Error("PLAIN_HTTP_MUST_NOT_RECEIVE_RESPONSE"));
        });
        plain.once("error", () => resolve());
      })).resolves.toBeUndefined();
    } finally {
      await frontDoor.close();
      await close(upstream);
    }
  });

  it("preserves the private Next development WebSocket upgrade without trusting proxy headers", async () => {
    const root = temporaryRoot();
    const tlsDirectory = join(root, "tls");
    const fakeMkcert = join(root, "mkcert");
    writeFileSync(fakeMkcert, [
      "#!/bin/sh",
      "/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=localhost -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1' -out \"$2\" -keyout \"$4\" >/dev/null 2>&1"
    ].join("\n"), { mode: 0o700 });
    chmodSync(fakeMkcert, 0o700);
    const certificate = await ensureDevLocalCertificate({ tlsDirectory, mkcertExecutable: fakeMkcert });
    let observedOrigin: string | undefined;
    let observedForwarded: string | undefined;
    const upstream = createHttpServer();
    upstream.on("upgrade", (request, socket) => {
      observedOrigin = request.headers.origin;
      observedForwarded = singleHeader(request.headers["x-forwarded-for"]);
      socket.end([
        "HTTP/1.1 101 Switching Protocols",
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Accept: test",
        "",
        ""
      ].join("\r\n"));
    });
    const upstreamPort = await listen(upstream);
    const frontDoor = await startDevTlsFrontDoor({
      certificatePath: certificate.certificatePath,
      privateKeyPath: certificate.privateKeyPath,
      listenPort: 0,
      upstreamPort
    });
    const publicOrigin = `https://localhost:${frontDoor.port}`;
    const ca = readFileSync(certificate.certificatePath);
    try {
      const response = await new Promise<string>((resolve, reject) => {
        const socket = connectTls({
          ca,
          host: "127.0.0.1",
          port: frontDoor.port,
          servername: "localhost"
        });
        const chunks: Buffer[] = [];
        socket.once("secureConnect", () => socket.write([
          "GET /_next/webpack-hmr HTTP/1.1",
          `Host: localhost:${frontDoor.port}`,
          `Origin: ${publicOrigin}`,
          "Connection: Upgrade",
          "Upgrade: websocket",
          "X-Forwarded-For: 203.0.113.7",
          "",
          ""
        ].join("\r\n")));
        socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        socket.once("error", reject);
        socket.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
      expect(response).toContain("HTTP/1.1 101 Switching Protocols");
      expect(response).toContain("Connection: Upgrade");
      expect(response).toContain("Upgrade: websocket");
      expect(observedOrigin).toBe(publicOrigin);
      expect(observedForwarded).toBeUndefined();
    } finally {
      await frontDoor.close();
      await close(upstream);
    }
  });
});

describe("L7-F1 front-door upgrade lifecycle", () => {
  function scratchCertificate(root: string): Promise<{
    certificatePath: string;
    privateKeyPath: string;
  }> {
    const tlsDirectory = join(root, "tls");
    const fakeMkcert = join(root, "mkcert");
    writeFileSync(fakeMkcert, [
      "#!/bin/sh",
      "/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=localhost"
        + " -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1'"
        + " -out \"$2\" -keyout \"$4\" >/dev/null 2>&1"
    ].join("\n"), { mode: 0o700 });
    chmodSync(fakeMkcert, 0o700);
    return ensureDevLocalCertificate({ tlsDirectory, mkcertExecutable: fakeMkcert });
  }

  function upgradeRequest(port: number, path = "/_next/webpack-hmr"): string {
    return [
      `GET ${path} HTTP/1.1`,
      `Host: localhost:${port}`,
      "Connection: Upgrade",
      "Upgrade: websocket",
      "",
      ""
    ].join("\r\n");
  }

  function openUpgraded(
    port: number,
    ca: Buffer,
    path?: string
  ): Promise<{ socket: TlsSocket; received: () => string }> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const socket = connectTls({ ca, host: "127.0.0.1", port, servername: "localhost" });
      socket.on("error", () => undefined);
      socket.on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
        resolve({ socket, received: () => Buffer.concat(chunks).toString("utf8") });
      });
      socket.once("secureConnect", () => socket.write(upgradeRequest(port, path)));
      socket.once("close", () => reject(new Error("UPGRADE_SOCKET_CLOSED_BEFORE_RESPONSE")));
    });
  }

  const HANDSHAKE = [
    "HTTP/1.1 101 Switching Protocols",
    "Connection: Upgrade",
    "Upgrade: websocket",
    "Sec-WebSocket-Accept: test",
    "",
    ""
  ].join("\r\n");

  it("destroys tracked upgraded sockets so close() resolves promptly (L7-F1)", async () => {
    const root = temporaryRoot();
    const certificate = await scratchCertificate(root);
    const upstreamSockets: TcpSocket[] = [];
    const upstream = createHttpServer();
    // The real Next dev server keeps the HMR socket open for the life of the tab.
    upstream.on("upgrade", (_request, socket) => {
      // node:http types the upgrade half as Duplex; it is a net.Socket.
      upstreamSockets.push(socket as TcpSocket);
      socket.write(HANDSHAKE);
    });
    const upstreamPort = await listen(upstream);
    const frontDoor = await startDevTlsFrontDoor({
      certificatePath: certificate.certificatePath,
      privateKeyPath: certificate.privateKeyPath,
      listenPort: 0,
      upstreamPort
    });
    const ca = readFileSync(certificate.certificatePath);
    const upgraded = await openUpgraded(frontDoor.port, ca);
    expect(upgraded.received()).toContain("HTTP/1.1 101 Switching Protocols");

    try {
      const outcome = await Promise.race([
        frontDoor.close().then(() => "closed" as const),
        setTimeoutPromise(2_000, "timeout" as const)
      ]);
      expect(outcome).toBe("closed");
    } finally {
      upgraded.socket.destroy();
      for (const socket of upstreamSockets) socket.destroy();
      await close(upstream);
    }
  });

  it("survives an upstream reset on an upgraded connection without an uncaught error (L7-F1)", async () => {
    const root = temporaryRoot();
    const certificate = await scratchCertificate(root);
    const upstreamSockets: TcpSocket[] = [];
    const upstream = createHttpServer();
    upstream.on("upgrade", (_request, socket) => {
      // node:http types the upgrade half as Duplex; it is a net.Socket.
      upstreamSockets.push(socket as TcpSocket);
      socket.write(HANDSHAKE);
    });
    const upstreamPort = await listen(upstream);
    const frontDoor = await startDevTlsFrontDoor({
      certificatePath: certificate.certificatePath,
      privateKeyPath: certificate.privateKeyPath,
      listenPort: 0,
      upstreamPort
    });
    const ca = readFileSync(certificate.certificatePath);
    const upgraded = await openUpgraded(frontDoor.port, ca);
    const uncaught: unknown[] = [];
    const onUncaught = (error: unknown): void => { uncaught.push(error); };
    process.on("uncaughtException", onUncaught);

    try {
      // The UI restarting mid-frame is an ordinary RST on the upstream half.
      upstreamSockets[0]?.resetAndDestroy();
      await setTimeoutPromise(300);
      expect(uncaught).toEqual([]);
    } finally {
      process.off("uncaughtException", onUncaught);
      upgraded.socket.destroy();
      for (const socket of upstreamSockets) socket.destroy();
      await frontDoor.close();
      await close(upstream);
    }
  });
});

describe("L7-F9 front-door protocol hygiene", () => {
  function scratchCertificate(root: string): Promise<{
    certificatePath: string;
    privateKeyPath: string;
  }> {
    const tlsDirectory = join(root, "tls");
    const fakeMkcert = join(root, "mkcert");
    writeFileSync(fakeMkcert, [
      "#!/bin/sh",
      "/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=localhost"
        + " -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1'"
        + " -out \"$2\" -keyout \"$4\" >/dev/null 2>&1"
    ].join("\n"), { mode: 0o700 });
    chmodSync(fakeMkcert, 0o700);
    return ensureDevLocalCertificate({ tlsDirectory, mkcertExecutable: fakeMkcert });
  }

  function rawExchange(port: number, ca: Buffer, request: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const socket = connectTls({ ca, host: "127.0.0.1", port, servername: "localhost" });
      socket.once("secureConnect", () => socket.write(request));
      socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      socket.once("error", reject);
      socket.once("close", () => resolve(Buffer.concat(chunks).toString("utf8")));
      setTimeoutPromise(4_000).then(() => socket.destroy(), () => undefined);
    });
  }

  it("strips request hop-by-hop headers and Connection-listed headers", async () => {
    const root = temporaryRoot();
    const certificate = await scratchCertificate(root);
    let observed: Record<string, string | string[] | undefined> = {};
    const upstream = createHttpServer((request, response) => {
      observed = { ...request.headers };
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("OK");
    });
    const upstreamPort = await listen(upstream);
    const frontDoor = await startDevTlsFrontDoor({
      certificatePath: certificate.certificatePath,
      privateKeyPath: certificate.privateKeyPath,
      listenPort: 0,
      upstreamPort
    });
    const ca = readFileSync(certificate.certificatePath);
    try {
      const answer = await rawExchange(frontDoor.port, ca, [
        "GET /login HTTP/1.1",
        `Host: localhost:${frontDoor.port}`,
        "Connection: keep-alive, X-Secret-Hop",
        "Keep-Alive: timeout=5",
        "TE: trailers",
        "Trailer: X-Late",
        "Proxy-Authorization: Basic ZGV2OmRldg==",
        "X-Secret-Hop: must-not-reach-upstream",
        "",
        ""
      ].join("\r\n"));
      expect(answer).toContain("HTTP/1.1 200");
      for (const header of [
        "keep-alive",
        "te",
        "trailer",
        "proxy-authorization",
        "x-secret-hop"
      ]) {
        expect(observed[header], header).toBeUndefined();
      }
    } finally {
      await frontDoor.close();
      await close(upstream);
    }
  });

  it("forwards a non-101 answer to an Upgrade request with explicit framing", async () => {
    const root = temporaryRoot();
    const certificate = await scratchCertificate(root);
    const upstream = createHttpServer();
    upstream.on("upgrade", (_request, socket) => {
      socket.end(
        "HTTP/1.1 404 Not Found\r\n"
        + "Content-Type: text/plain\r\n"
        + "Transfer-Encoding: chunked\r\n"
        + "\r\n"
        + "2\r\nab\r\n0\r\n\r\n"
      );
    });
    const upstreamPort = await listen(upstream);
    const frontDoor = await startDevTlsFrontDoor({
      certificatePath: certificate.certificatePath,
      privateKeyPath: certificate.privateKeyPath,
      listenPort: 0,
      upstreamPort
    });
    const ca = readFileSync(certificate.certificatePath);
    try {
      const answer = await rawExchange(frontDoor.port, ca, [
        "GET /_next/webpack-hmr HTTP/1.1",
        `Host: localhost:${frontDoor.port}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "",
        ""
      ].join("\r\n"));
      expect(answer).toContain("HTTP/1.1 404 Not Found");
      expect(answer.toLowerCase()).not.toContain("transfer-encoding");
      expect(answer.toLowerCase()).toContain("content-length: 2");
      expect(answer.endsWith("ab")).toBe(true);
    } finally {
      await frontDoor.close();
      await close(upstream);
    }
  });

  it("never appends an error body once response headers were sent", async () => {
    const root = temporaryRoot();
    const certificate = await scratchCertificate(root);
    const upstream = createHttpServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.write("partial");
      response.flushHeaders();
      setTimeoutPromise(50).then(() => {
        response.socket?.resetAndDestroy();
      }, () => undefined);
    });
    const upstreamPort = await listen(upstream);
    const frontDoor = await startDevTlsFrontDoor({
      certificatePath: certificate.certificatePath,
      privateKeyPath: certificate.privateKeyPath,
      listenPort: 0,
      upstreamPort
    });
    const ca = readFileSync(certificate.certificatePath);
    try {
      const answer = await rawExchange(frontDoor.port, ca, [
        "GET /login HTTP/1.1",
        `Host: localhost:${frontDoor.port}`,
        "",
        ""
      ].join("\r\n"));
      expect(answer).toContain("HTTP/1.1 200");
      expect(answer).toContain("partial");
      expect(answer).not.toContain("UPSTREAM_UNAVAILABLE");
    } finally {
      await frontDoor.close();
      await close(upstream);
    }
  });
});
