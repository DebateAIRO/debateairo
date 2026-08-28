import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

/**
 * FAIR-02 shared CLI-relay core. One OpenAI-compatible HTTP front (P4 gateway
 * seam) over interchangeable maker-specific CLI strategies (P8). Each maker
 * module (model-shim.ts for codex/OpenAI, claude-relay.ts for
 * claude/Anthropic) supplies a CliRelayAdapter; the transport, timeout and
 * loud-failure laws live here once. The relay NEVER fabricates: CLI failure,
 * timeout, unparseable output or ambiguous lineage is a typed loud HTTP error
 * with no choices array (DR-115).
 */

export interface CommandSpec {
  readonly binary: string;
  readonly prefixArguments: readonly string[];
}

export class CliRelayFailure extends Error {
  constructor(readonly kind: "FAILED" | "TIMEOUT", code: string) {
    super(code);
    this.name = "CliRelayFailure";
  }
}

export interface CliCompletion {
  readonly content: string;
  /** The model id honestly attributable to this completion (DR-115). */
  readonly model: string;
  /** Observed CLI-reported usage only. Missing telemetry is represented by null. */
  readonly usage: CliUsage | null;
}

export interface CliUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
  readonly costUsd?: number;
}

export const CLI_RELAY_SIGTERM_GRACE_MS = 250 as const;
export const CLI_RELAY_STDOUT_MAX_BYTES = 1_048_576 as const;
export const CLI_RELAY_STDOUT_LIMIT_CODE = "CLI_RELAY_STDOUT_LIMIT" as const;

/** P8 strategy: how one maker's CLI is invoked and how its output is parsed. */
export interface CliRelayAdapter {
  readonly maker: string;
  /** Exact maker credentials/config locators permitted in the child process. */
  readonly authEnvironmentKeys: readonly string[];
  /** Exact fake-CLI controls permitted only while the parent is in test mode. */
  readonly testEnvironmentKeys: readonly string[];
  /** Loud code for spawn errors and nonzero exits (e.g. CODEX_CLI_FAILED). */
  readonly failureCode: string;
  /** Loud code for a deadline kill (e.g. CODEX_CLI_TIMEOUT). */
  readonly timeoutCode: string;
  buildArguments(prompt: string): readonly string[];
  /** Throws CliRelayFailure instead of ever inventing content or lineage. */
  parseCompletion(stdout: string, prompt: string): CliCompletion | Promise<CliCompletion>;
}

const COMMON_CHILD_ENVIRONMENT_KEYS = ["HOME", "PATH", "TMPDIR", "LANG"] as const;

export function buildCliChildEnvironment(
  adapter: CliRelayAdapter,
  scratchDirectory: string,
  source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const allowedKeys = [
    ...COMMON_CHILD_ENVIRONMENT_KEYS,
    ...adapter.authEnvironmentKeys,
    ...(source.NODE_ENV === "test" ? adapter.testEnvironmentKeys : [])
  ];
  const environment: NodeJS.ProcessEnv = {};
  for (const key of allowedKeys) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  environment.PWD = scratchDirectory;
  environment.OLDPWD = scratchDirectory;
  return environment;
}

export function renderPromptTranscript(messages: readonly {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}[]): string {
  return JSON.stringify({
    format: "debateai.relay-messages.v1",
    messages
  });
}

export function resolveTestGuardedCommand(
  defaultCommand: CommandSpec,
  testOnlyCommand: CommandSpec | undefined,
  forbiddenCode: string
): CommandSpec {
  if (testOnlyCommand !== undefined) {
    if (process.env.NODE_ENV !== "test") {
      throw new Error(forbiddenCode);
    }
    return testOnlyCommand;
  }
  return defaultCommand;
}

export async function invokeCli(
  command: CommandSpec,
  adapter: CliRelayAdapter,
  prompt: string,
  timeoutMs: number
): Promise<CliCompletion> {
  const makerSlug = adapter.maker.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cli";
  const scratchDirectory = await mkdtemp(join(await realpath(tmpdir()), `relay-${makerSlug}-`));
  return new Promise((resolve, reject) => {
    const child = spawn(command.binary, [...command.prefixArguments, ...adapter.buildArguments(prompt)], {
      // CONT-01: vendor CLIs receive no project cwd. A fresh empty directory is
      // the only ambient filesystem context for every handshake and relay call.
      cwd: scratchDirectory,
      // P4-01: model subprocesses never inherit the API environment. Only
      // process basics plus this maker's exact auth locators cross the seam.
      env: buildCliChildEnvironment(adapter, scratchDirectory),
      // DR-133 (kept for every maker): a CLI left with an open stdin can hang;
      // the prompt always travels as an argument, so stdin is closed.
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let terminationFailure: CliRelayFailure | undefined;
    const beginTermination = (failure: CliRelayFailure): void => {
      if (settled || terminationFailure !== undefined) return;
      terminationFailure = failure;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (!settled && child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, CLI_RELAY_SIGTERM_GRACE_MS);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      if (terminationFailure !== undefined) return;
      if (chunk.byteLength > CLI_RELAY_STDOUT_MAX_BYTES - stdoutBytes) {
        beginTermination(new CliRelayFailure("FAILED", CLI_RELAY_STDOUT_LIMIT_CODE));
        return;
      }
      stdoutBytes += chunk.byteLength;
      stdout.push(chunk);
    });
    child.stderr.resume();
    const deadlineTimer = setTimeout(() => {
      beginTermination(new CliRelayFailure("TIMEOUT", adapter.timeoutCode));
    }, timeoutMs);
    const settleOnce = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
      // Vendor litter is not relay input. Reap it exactly once after the child
      // terminates and before the request is allowed to settle.
      void rm(scratchDirectory, { recursive: true, force: true })
        .catch(() => undefined)
        .then(settle);
    };
    child.once("error", () => {
      settleOnce(() => reject(
        terminationFailure ?? new CliRelayFailure("FAILED", adapter.failureCode)
      ));
    });
    child.once("close", (code) => {
      settleOnce(() => {
        if (terminationFailure !== undefined) {
          reject(terminationFailure);
          return;
        }
        if (code !== 0) {
          reject(new CliRelayFailure("FAILED", adapter.failureCode));
          return;
        }
        try {
          resolve(adapter.parseCompletion(Buffer.concat(stdout).toString("utf8"), prompt));
        } catch (error) {
          reject(error);
        }
      });
    });
  });
}

export const RELAY_MESSAGE_MAX_UTF8_BYTES = 65_536 as const;
export const RELAY_REQUEST_MAX_MESSAGES = 32 as const;
// Normal JSON escaping can double every decoded content byte. The additional
// 4 KiB covers the model, roles, object keys and top-level envelope.
export const RELAY_REQUEST_MAX_BYTES = 4_198_400 as const;

function hasForbiddenControlByte(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if ((codeUnit < 0x20 && codeUnit !== 0x09 && codeUnit !== 0x0a) || codeUnit === 0x7f) {
      return true;
    }
  }
  return false;
}

const relayMessageContentSchema = z.string()
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= RELAY_MESSAGE_MAX_UTF8_BYTES,
    "RELAY_MESSAGE_TOO_LARGE"
  )
  .refine((value) => !hasForbiddenControlByte(value), "RELAY_MESSAGE_CONTROL_BYTE_FORBIDDEN");

const requestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: relayMessageContentSchema
  }).strict()).min(1).max(RELAY_REQUEST_MAX_MESSAGES)
}).passthrough();

export interface CliRelayServerOptions {
  readonly port: number;
  readonly timeoutMs: number;
  readonly command: CommandSpec;
  readonly adapter: CliRelayAdapter;
}

export interface CliRelayHandle {
  readonly port: number;
  readonly baseUrl: string;
  /** Trusted caller-only credential; never copied into a model prompt or child environment. */
  readonly authorizationHeader: string;
  close(): Promise<void>;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const body = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const cleanup = (): void => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      request.off("aborted", onAborted);
    };
    const rejectOnce = (error: Error, drain: boolean): void => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      cleanup();
      if (drain) {
        // The response may settle while an oversized client is still sending.
        // Drain without retention, and absorb a reset only until this request
        // closes so a hostile disconnect cannot become an unhandled error.
        const ignoreDrainError = (): void => undefined;
        request.on("error", ignoreDrainError);
        request.once("close", () => request.off("error", ignoreDrainError));
        request.resume();
      }
      reject(error);
    };
    const onData = (chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (buffer.byteLength > RELAY_REQUEST_MAX_BYTES - bytes) {
        rejectOnce(new Error("CLI_RELAY_REQUEST_TOO_LARGE"), true);
        return;
      }
      bytes += buffer.byteLength;
      chunks.push(buffer);
    };
    const onEnd = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks, bytes));
    };
    const onError = (error: Error): void => rejectOnce(error, false);
    const onAborted = (): void => rejectOnce(new Error("CLI_RELAY_REQUEST_ABORTED"), false);
    request.on("data", onData);
    request.once("end", onEnd);
    request.once("error", onError);
    request.once("aborted", onAborted);
  });
  return JSON.parse(body.toString("utf8"));
}

function singleAuthorizationHeader(request: IncomingMessage): string {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === "authorization") {
      values.push(request.rawHeaders[index + 1] ?? "");
    }
  }
  return values.length === 1 ? values[0]! : "";
}

function authorizationMatches(request: IncomingMessage, expectedDigest: Buffer): boolean {
  const candidateDigest = createHash("sha256")
    .update(singleAuthorizationHeader(request), "utf8")
    .digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export async function startCliRelayServer(options: CliRelayServerOptions): Promise<CliRelayHandle> {
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
    throw new TypeError("CLI_RELAY_PORT_INVALID");
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new TypeError("CLI_RELAY_TIMEOUT_INVALID");
  }
  const authorizationHeader = `Bearer ${randomBytes(32).toString("base64url")}`;
  const authorizationDigest = createHash("sha256").update(authorizationHeader, "utf8").digest();
  const server: Server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      sendJson(response, 404, { error: "NOT_FOUND" });
      return;
    }
    if (!authorizationMatches(request, authorizationDigest)) {
      sendJson(response, 401, { error: "UNAUTHORIZED" });
      return;
    }
    try {
      const parsed = requestSchema.parse(await readBody(request));
      const prompt = renderPromptTranscript(parsed.messages);
      const completion = await invokeCli(options.command, options.adapter, prompt, options.timeoutMs);
      sendJson(response, 200, {
        id: `chatcmpl-${randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1_000),
        model: completion.model,
        maker: options.adapter.maker,
        usage: completion.usage === null ? null : {
          prompt_tokens: completion.usage.promptTokens,
          completion_tokens: completion.usage.completionTokens,
          total_tokens: completion.usage.totalTokens,
          x_cost_usd: completion.usage.costUsd
        },
        choices: [{ index: 0, message: { role: "assistant", content: completion.content }, finish_reason: "stop" }]
      });
    } catch (error) {
      if (error instanceof CliRelayFailure) {
        sendJson(response, error.kind === "TIMEOUT" ? 504 : 502, { error: error.message });
        return;
      }
      sendJson(response, 400, { error: "MALFORMED_REQUEST" });
    }
  });
  server.listen(options.port, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("CLI_RELAY_ADDRESS_FAILED");
  }
  return {
    port: address.port,
    baseUrl: `http://127.0.0.1:${address.port}`,
    authorizationHeader,
    async close() {
      if (!server.listening) return;
      server.close();
      await once(server, "close");
    }
  };
}
