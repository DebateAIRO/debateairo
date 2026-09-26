import type { LookupFunction } from "node:net";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import * as https from "node:https";
import { join } from "node:path";
import * as tls from "node:tls";

export const FAKE_VENDOR_AUTHORIZATION = "Bearer pes-s02-fake-vendor-token";
export const FAKE_VENDOR_HOST = "api.localtest.me";
export const FAKE_VENDOR_MODEL = "fake-model";
export const FAKE_VENDOR_EXCLUDED_PORTS: ReadonlySet<number> = new Set([
  3000, 3001, 8790, 4310, 8791, 8792, 8793, 8795, 8796, 55432, 4455
]);
export const FAKE_VENDOR_PORT_CANDIDATES: readonly number[] = Array.from({ length: 40 }, (_, i) => 4460 + i);

export type FakeVendor = Readonly<{
  baseUrl: string;
  counts(): Readonly<{ matched: number; rejected: number }>;
  close(): Promise<void>;
}>;

export function isPortListening(port: number): boolean {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  if (result.status === 1 && result.stdout === "") return false;
  if (result.status === 0) return true;
  throw new Error("PES_S02_LSOF_UNAVAILABLE");
}

export function pickFreePort(
  candidates: readonly number[],
  listening: (port: number) => boolean
): Readonly<{ port: number; evidence: string }> {
  for (const port of candidates) {
    if (port <= 4400 || FAKE_VENDOR_EXCLUDED_PORTS.has(port)) continue;
    if (listening(port) === false) {
      return { port, evidence: `lsof -nP -iTCP:${port} -sTCP:LISTEN rc=1 lines=0` };
    }
  }
  throw new Error("PES_S02_NO_FREE_PORT");
}

export function createFixtureCertificate(
  directory: string,
  opensslExecutable: string
): Readonly<{ keyPem: string; certPem: string }> {
  writeFileSync(join(directory, "openssl.cnf"), [
    "[req]",
    "distinguished_name = dn",
    "x509_extensions = ext",
    "prompt = no",
    "[dn]",
    "CN = api.localtest.me",
    "[ext]",
    "subjectAltName = DNS:api.localtest.me",
    "basicConstraints = critical,CA:TRUE"
  ].join("\n") + "\n");
  const result = spawnSync(opensslExecutable, [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-keyout", join(directory, "key.pem"), "-out", join(directory, "cert.pem"),
    "-config", join(directory, "openssl.cnf")
  ], { stdio: ["ignore", "ignore", "pipe"] });
  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    throw new Error("PES_S02_OPENSSL_UNAVAILABLE");
  }
  if (result.status !== 0) throw new Error(`PES_S02_OPENSSL_RC_${result.status}`);
  return {
    keyPem: readFileSync(join(directory, "key.pem"), "utf8"),
    certPem: readFileSync(join(directory, "cert.pem"), "utf8")
  };
}

export async function startFakeVendor(
  input: Readonly<{ port: number; keyPem: string; certPem: string }>
): Promise<FakeVendor> {
  let matched = 0;
  let rejected = 0;
  const server = https.createServer({ key: input.keyPem, cert: input.certPem }, (request, response) => {
    request.on("end", () => {
      if (request.method === "POST" && request.url === "/v1/chat/completions") {
        if (request.headers.authorization === FAKE_VENDOR_AUTHORIZATION) {
          matched += 1;
          response.writeHead(200, { "content-type": "application/json" });
          response.end('{"model":"fake-model","choices":[{"message":{"content":"OK"}}]}');
        } else {
          rejected += 1;
          response.writeHead(401, { "content-type": "application/json" });
          response.end('{"error":"unauthorized"}');
        }
      } else {
        rejected += 1;
        response.writeHead(404);
        response.end();
      }
    });
    request.resume();
  });
  server.on("tlsClientError", () => undefined);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      reject(error.code === "EADDRINUSE" ? new Error("PES_S02_PORT_BIND_RACED") : error);
    };
    server.once("error", onError);
    server.listen(input.port, "127.0.0.1", () => {
      server.removeListener("error", onError);
      resolve();
    });
  });
  return {
    baseUrl: `https://${FAKE_VENDOR_HOST}:${input.port}/v1`,
    counts: () => ({ matched, rejected }),
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  };
}

export function createTrustingFetch(
  caPem: string,
  lookup?: LookupFunction
): Readonly<{ fetch: typeof fetch; destroy(): void }> {
  const agent = new https.Agent({ ca: [caPem], keepAlive: false });
  const trustingFetch: typeof fetch = (input, init) => new Promise<Response>((resolve, reject) => {
    const url = input instanceof Request ? input.url : input;
    const headers = Object.fromEntries(new Headers(init?.headers));
    const request = https.request(url, {
      method: init?.method ?? "GET",
      headers,
      agent,
      signal: init?.signal ?? undefined,
      rejectUnauthorized: true,
      ...(lookup === undefined ? {} : { lookup })
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) responseHeaders.append(name, item);
          } else if (value !== undefined) responseHeaders.set(name, value);
        }
        resolve(new Response(Buffer.concat(chunks), {
          status: response.statusCode!,
          statusText: response.statusMessage!,
          headers: responseHeaders
        }));
      });
    });
    request.on("error", reject);
    if (typeof init?.body === "string") request.write(init.body);
    request.end();
  });
  return { fetch: trustingFetch, destroy: () => agent.destroy() };
}

export async function verifySeamHandshake(
  input: Readonly<{ port: number; caPem: string; lookup?: LookupFunction }>
): Promise<"authorized"> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: FAKE_VENDOR_HOST,
      port: input.port,
      ca: [input.caPem],
      servername: FAKE_VENDOR_HOST,
      rejectUnauthorized: true,
      ...(input.lookup ? { lookup: input.lookup } : {})
    });
    socket.once("secureConnect", () => {
      if (socket.authorized === true) {
        socket.end();
        resolve("authorized");
      } else {
        socket.destroy();
        reject(new Error(String(socket.authorizationError)));
      }
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      reject(new Error(error.code ?? error.message));
    });
  });
}
