import { spawn } from "node:child_process";
import { get } from "node:http";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const LOCAL_HOST = "127.0.0.1";
const LOCAL_UI_PORT = 3_001;
const LOCAL_API_PORT = 8_790;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_JSON_BYTES = 1_024;
const TRANSIENT_PROBE_ERRORS = new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT"]);

type HttpProbe = Readonly<{
  statusCode: number;
  contentType: string;
  body: string;
}>;

export type DevelopmentUiProbe = Readonly<{
  login: HttpProbe;
  session: HttpProbe;
}>;

export type DevelopmentUiChildExit = Readonly<{
  code: number | null;
  signal: NodeJS.Signals | null;
}>;

export type DevelopmentUiChild = Readonly<{
  exited: Promise<DevelopmentUiChildExit>;
  terminate(): Promise<void>;
}>;

export type DevelopmentUiProcessOperations = Readonly<{
  probeApi(): Promise<HttpProbe | null>;
  probeUi(): Promise<DevelopmentUiProbe | null>;
  startUi(environment: Readonly<Record<string, string>>): DevelopmentUiChild;
  delay(milliseconds: number): Promise<void>;
}>;

export type DevelopmentUiProcess = Readonly<{
  receipt: Readonly<{ host: "127.0.0.1"; port: 3001; proxy: "DENY_DEFAULT" }>;
  exited: Promise<DevelopmentUiChildExit>;
  stop(): Promise<void>;
}>;

export class DevelopmentUiProcessError extends Error {
  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "DevelopmentUiProcessError";
  }
}

function isExactSessionDenial(response: HttpProbe): boolean {
  return response.statusCode === 401
    && response.contentType.toLowerCase().startsWith("application/json")
    && response.body === '{"error":"SESSION_REQUIRED"}';
}

function isExactUiReadiness(response: DevelopmentUiProbe): boolean {
  return response.login.statusCode === 200
    && response.login.contentType.toLowerCase().startsWith("text/html")
    && response.login.body.includes("Back to the graph.")
    && isExactSessionDenial(response.session);
}

async function cleanupChild(child: DevelopmentUiChild): Promise<void> {
  try {
    await child.terminate();
  } catch (error) {
    throw new DevelopmentUiProcessError("DEV_UI_PROCESS_CLEANUP_FAILED", error);
  }
}

export async function startDevelopmentUiProcess(input: Readonly<{
  repositoryRoot: string;
  commandEnvironment: Readonly<Record<string, string>>;
  operations: DevelopmentUiProcessOperations;
  maximumProbeAttempts?: number;
}>): Promise<DevelopmentUiProcess> {
  const api = await input.operations.probeApi();
  if (api === null || !isExactSessionDenial(api)) {
    throw new DevelopmentUiProcessError("DEV_UI_PROCESS_API_UNAVAILABLE");
  }
  if (await input.operations.probeUi() !== null) {
    throw new DevelopmentUiProcessError("DEV_UI_PROCESS_PORT_OCCUPIED");
  }
  let child: DevelopmentUiChild;
  try {
    child = input.operations.startUi(Object.freeze({
      ...input.commandEnvironment,
      DIALECTICAL_UI_HOST: LOCAL_HOST,
      PORT: String(LOCAL_UI_PORT),
      DIALECTICAL_API_BASE: `http://${LOCAL_HOST}:${LOCAL_API_PORT}`,
      NEXT_PUBLIC_API_BASE: "/api"
    }));
  } catch (error) {
    throw new DevelopmentUiProcessError("DEV_UI_PROCESS_START_FAILED", error);
  }
  try {
    const maximumProbeAttempts = input.maximumProbeAttempts ?? 300;
    if (!Number.isInteger(maximumProbeAttempts)
      || maximumProbeAttempts < 1
      || maximumProbeAttempts > 600) {
      throw new DevelopmentUiProcessError("DEV_UI_PROCESS_PROBE_BOUND_INVALID");
    }
    for (let attempt = 0; attempt < maximumProbeAttempts; attempt += 1) {
      const outcome = await Promise.race([
        child.exited.then((exit) => Object.freeze({ kind: "exit" as const, exit })),
        input.operations.probeUi().then((probe) => Object.freeze({ kind: "probe" as const, probe }))
      ]);
      if (outcome.kind === "exit") {
        throw new DevelopmentUiProcessError("DEV_UI_PROCESS_EXITED");
      }
      if (outcome.probe !== null) {
        if (!isExactUiReadiness(outcome.probe)) {
          throw new DevelopmentUiProcessError("DEV_UI_PROCESS_READINESS_INVALID");
        }
        let stopped = false;
        return Object.freeze({
          receipt: Object.freeze({ host: LOCAL_HOST, port: LOCAL_UI_PORT, proxy: "DENY_DEFAULT" }),
          exited: child.exited,
          async stop() {
            if (stopped) return;
            stopped = true;
            await child.terminate();
          }
        });
      }
      if (attempt + 1 < maximumProbeAttempts) await input.operations.delay(100);
    }
    throw new DevelopmentUiProcessError("DEV_UI_PROCESS_READINESS_TIMEOUT");
  } catch (error) {
    await cleanupChild(child);
    throw error;
  }
}

function probeHttp(port: number, path: string, maximumBytes: number): Promise<HttpProbe | null> {
  return new Promise((resolveProbe, rejectProbe) => {
    const request = get({ host: LOCAL_HOST, port, path, agent: false, timeout: 1_000 }, (response) => {
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.byteLength;
        if (total > maximumBytes) {
          request.destroy(new Error("DEV_UI_PROCESS_PROBE_BODY_TOO_LARGE"));
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
    request.once("timeout", () => {
      const timeout = new Error("DEV_UI_PROCESS_PROBE_TIMEOUT") as NodeJS.ErrnoException;
      timeout.code = "ETIMEDOUT";
      request.destroy(timeout);
    });
    request.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== undefined && TRANSIENT_PROBE_ERRORS.has(error.code)) resolveProbe(null);
      else rejectProbe(new DevelopmentUiProcessError("DEV_UI_PROCESS_PROBE_FAILED", error));
    });
  });
}

export function createDevelopmentUiProcessOperations(
  repositoryRoot: string
): DevelopmentUiProcessOperations {
  const cwd = resolve(repositoryRoot);
  const uiCwd = resolve(repositoryRoot, "apps", "ui");
  return Object.freeze({
    probeApi: () => probeHttp(LOCAL_API_PORT, "/v1/session", MAX_JSON_BYTES),
    async probeUi() {
      const login = await probeHttp(LOCAL_UI_PORT, "/login", MAX_HTML_BYTES);
      if (login === null) return null;
      const session = await probeHttp(LOCAL_UI_PORT, "/api/v1/session", MAX_JSON_BYTES);
      if (session === null) return null;
      return Object.freeze({ login, session });
    },
    startUi(environment) {
      const child = spawn(
        process.execPath,
        ["server.mjs", "--dev"],
        { cwd: uiCwd, env: { ...environment }, shell: false, stdio: "ignore" }
      );
      let exitSettled = false;
      const exited = new Promise<DevelopmentUiChildExit>((resolveExit, rejectExit) => {
        child.once("error", (error) => {
          exitSettled = true;
          rejectExit(error);
        });
        child.once("exit", (code, signal) => {
          exitSettled = true;
          resolveExit(Object.freeze({ code, signal }));
        });
      });
      return Object.freeze({
        exited,
        async terminate() {
          if (exitSettled || child.exitCode !== null || child.signalCode !== null) {
            await exited.catch(() => undefined);
            return;
          }
          child.kill("SIGTERM");
          const ended = await Promise.race([
            exited.then(() => true),
            delay(5_000).then(() => false)
          ]);
          if (!ended) {
            child.kill("SIGKILL");
            await exited.catch(() => undefined);
          }
        }
      });
    },
    delay: async (milliseconds) => delay(milliseconds)
  });
}
