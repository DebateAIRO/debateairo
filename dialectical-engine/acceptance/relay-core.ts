import { randomUUID } from "node:crypto";
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

/** P8 strategy: how one maker's CLI is invoked and how its output is parsed. */
export interface CliRelayAdapter {
  readonly maker: string;
  /** Loud code for spawn errors and nonzero exits (e.g. CODEX_CLI_FAILED). */
  readonly failureCode: string;
  /** Loud code for a deadline kill (e.g. CODEX_CLI_TIMEOUT). */
  readonly timeoutCode: string;
  buildArguments(prompt: string): readonly string[];
  /** Throws CliRelayFailure instead of ever inventing content or lineage. */
  parseCompletion(stdout: string, prompt: string): CliCompletion | Promise<CliCompletion>;
}

export function renderPromptTranscript(messages: readonly {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}[]): string {
  return messages.map((message) => `[${message.role}]\n${message.content}`).join("\n\n");
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
      env: { ...process.env, PWD: scratchDirectory, OLDPWD: scratchDirectory },
      // DR-133 (kept for every maker): a CLI left with an open stdin can hang;
      // the prompt always travels as an argument, so stdin is closed.
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.resume();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new CliRelayFailure("FAILED", adapter.failureCode));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      // Vendor litter is not relay input. Reap it after close without reading
      // the directory and without making cleanup part of completion success.
      void rm(scratchDirectory, { recursive: true, force: true }).catch(() => undefined);
      if (timedOut) {
        reject(new CliRelayFailure("TIMEOUT", adapter.timeoutCode));
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
}

const requestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string()
  }).strict()).min(1)
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
  close(): Promise<void>;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function startCliRelayServer(options: CliRelayServerOptions): Promise<CliRelayHandle> {
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
    throw new TypeError("CLI_RELAY_PORT_INVALID");
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new TypeError("CLI_RELAY_TIMEOUT_INVALID");
  }
  const server: Server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      sendJson(response, 404, { error: "NOT_FOUND" });
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
    async close() {
      if (!server.listening) return;
      server.close();
      await once(server, "close");
    }
  };
}
