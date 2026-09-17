import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import {
  accessSync, closeSync, constants, lstatSync, openSync, readSync, statSync
} from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
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
  /** Maker-specific fixed values applied after the ambient allowlist. */
  childEnvironment?(scratchDirectory: string): Readonly<Record<string,string>>;
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
  const fixed = adapter.childEnvironment?.(scratchDirectory) ?? {};
  for (const [key,value] of Object.entries(fixed)) {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key) || value.length === 0 || /[\u0000]/u.test(value)) {
      throw new TypeError("CLI_RELAY_CHILD_ENVIRONMENT_INVALID");
    }
    environment[key] = value;
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

/**
 * The default may be supplied LAZILY. A default that reads configuration can
 * fail on its own account (see resolveConfiguredBinary), and eager evaluation
 * of such a default would let a configuration error pre-empt this guard's own
 * typed-loud codes — selecting or rejecting the test seam must not depend on
 * whether an unrelated environment key happens to be well formed. This
 * function therefore stays the sole authority for both, and only reaches for
 * the default once no test seam is in play.
 */
export function resolveTestGuardedCommand(
  defaultCommand: CommandSpec | (() => CommandSpec),
  testOnlyCommand: CommandSpec | undefined,
  forbiddenCode: string
): CommandSpec {
  if (testOnlyCommand !== undefined) {
    if (process.env.NODE_ENV !== "test") {
      throw new Error(forbiddenCode);
    }
    return testOnlyCommand;
  }
  return typeof defaultCommand === "function" ? defaultCommand() : defaultCommand;
}

/**
 * Why a resolved candidate was refused. Each reason is distinct, and the path
 * it refers to always travels with it (see {@link resolveConfiguredBinary}).
 */
export const BINARY_REFUSAL_REASONS = Object.freeze([
  "NOT_ON_PATH", "NOT_FOUND", "EMPTY", "NOT_EXECUTABLE", "UNREADABLE", "NOT_A_PROGRAM"
] as const);
export type BinaryRefusalReason = typeof BINARY_REFUSAL_REASONS[number];

/**
 * The first bytes that make a file a PROGRAM this host can start directly: a
 * `#!` line naming an interpreter, a Mach-O header in either width and either
 * byte order, a universal ("fat") archive of those, or an ELF header. The last
 * one is not decoration — this harness is meant to run on more than one
 * computer, and a resolver that refused every Linux binary would refuse all four
 * makers there while blaming a corruption that does not exist.
 *
 * Anything else is data wearing an executable bit. That distinction is not
 * academic: a process launcher that cannot EXECUTE a file falls back to reading
 * it as a script, and on 2026-09-17 a `codex` launcher whose contents had been
 * replaced by four lines of plain text was read back as a script that re-ran
 * itself, forking until this Mac's process table was full. A candidate is
 * therefore read four bytes deep and NEVER started to find out what it is.
 */
const PROGRAM_HEADERS: readonly (readonly number[])[] = Object.freeze([
  [0x23, 0x21],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xfe, 0xed, 0xfa, 0xce],
  [0xca, 0xfe, 0xba, 0xbe],
  [0xbe, 0xba, 0xfe, 0xca],
  [0x7f, 0x45, 0x4c, 0x46]
].map((header) => Object.freeze(header)));

/**
 * The first four bytes, or null when the file could not be READ at all — which
 * is a different fact from "these bytes are not a program". A mode-0111 script
 * passes the executable check and then refuses to open; it is a perfectly good
 * program, and calling it corrupt would send an operator hunting for damage that
 * is not there.
 */
function readProgramHeader(path: string): Buffer | null {
  const header = Buffer.alloc(4);
  let descriptor: number | undefined;
  let read = 0;
  try {
    descriptor = openSync(path, "r");
    read = readSync(descriptor, header, 0, header.byteLength, 0);
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return header.subarray(0, read);
}

function isProgramHeader(header: Buffer): boolean {
  return PROGRAM_HEADERS.some((magic) =>
    magic.length <= header.byteLength && magic.every((byte, index) => header[index] === byte)
  );
}

/**
 * The single admission gate every resolved candidate passes, whichever route
 * named it. `path` is ALWAYS absolute by the time it arrives here, because the
 * string admitted is the string spawned (see resolveConfiguredBinary).
 *
 * `statSync` FOLLOWS symlinks on purpose: nearly every real launcher is one —
 * a Homebrew or npm global bin, or the `~/.local/bin/claude` of 2026-09-17 that
 * pointed at a 0-byte `…/versions/<v>`. The defect to catch lives in the target,
 * while the path kept is the LINK, which is the name the operator installed and
 * the argv[0] the CLI will see.
 *
 * The order of the checks is the order an operator can act on: what is there at
 * all, then whether an interrupted install left nothing in it, then whether this
 * user may run it, then whether the header could be read, then whether it is a
 * program rather than data.
 */
function admitProgram(path: string, unresolvedCode: string): string {
  const refuse = (reason: BinaryRefusalReason): never => {
    throw new Error(`${unresolvedCode}:${reason}:${path}`);
  };
  let metadata;
  try {
    metadata = statSync(path);
  } catch {
    return refuse("NOT_FOUND");
  }
  if (!metadata.isFile()) return refuse("NOT_A_PROGRAM");
  if (metadata.size === 0) return refuse("EMPTY");
  try {
    accessSync(path, constants.X_OK);
  } catch {
    return refuse("NOT_EXECUTABLE");
  }
  const header = readProgramHeader(path);
  if (header === null) return refuse("UNREADABLE");
  if (!isProgramHeader(header)) return refuse("NOT_A_PROGRAM");
  return path;
}

/**
 * THE FIRST PATH ENTRY THAT EXISTS UNDER THE NAME IS THE MATCH, and it is then
 * admitted or refused; a broken entry is never stepped over. Unlike `command -v`,
 * which skips a non-executable entry and keeps searching, this resolver names it.
 * The difference between the two is only ever "refuse loudly, naming the file"
 * versus "silently run a different install" — and for a debate engine whose whole
 * output is model attribution, silently running some other `claude` than the one
 * at the front of the operator's PATH is a lineage hazard, not an ergonomic one.
 * The cost is real and is the trade taken knowingly: a stale, non-executable
 * launcher in an early PATH directory now stops the ceremony where the operator's
 * own shell would have answered cheerfully.
 *
 * A match is therefore an entry that EXISTS under that name — `lstatSync`, so a
 * dangling symlink counts and is reported as NOT_FOUND rather than skipped.
 *
 * Directories are searched in PATH order, and an entry that is EMPTY or RELATIVE
 * is skipped: a shell reads both as "the directory this process happens to be
 * sitting in", which is not a deduction, and a candidate found that way could
 * not be spawned as the same file anyway (see resolveConfiguredBinary).
 */
function discoverOnPath(
  binaryName: string,
  unresolvedCode: string,
  source: NodeJS.ProcessEnv
): string {
  for (const directory of (source.PATH ?? "").split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const candidate = join(directory, binaryName);
    try {
      lstatSync(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error(`${unresolvedCode}:NOT_ON_PATH:${binaryName}`);
}

/**
 * D10, rewritten 2026-09-17. WHICH executable a maker relay spawns is a HOST
 * fact, and a host fact is DEDUCED — never written into the source. The
 * previous defaults were one developer's home directory and one installed app
 * bundle; a checkout carried them onto every other machine.
 *
 * Order, for every maker:
 *  1. the maker's `ACCEPTANCE_*_BINARY` key, when present and non-blank, names
 *     the binary — a path, or a bare name to look up;
 *  2. a key that is PRESENT BUT BLANK is a loud typed configuration failure
 *     carrying the maker's bare code and nothing else. It never falls through
 *     to discovery: an operator who set the key meant to decide, and guessing
 *     on their behalf is the defect this whole seam exists to remove;
 *  3. an absent key means discovery by the maker's NAME over the PATH of the
 *     environment this resolver is HANDED (never `process.env` behind the
 *     caller's back), first match wins.
 *
 * Whatever 1 or 3 resolves is then admitted or refused as a program. A refusal
 * is `<UNRESOLVED_CODE>:<REASON>:<path>` on a plain Error, matching
 * resolveTestGuardedCommand above: `run-acceptance.ts` records that message
 * verbatim as the provider probe's failureCode and `absent-makers.ts` prints it
 * as `MAKER ABSENT <maker> <code>`, so the operator reads the reason and the
 * path off the run's own log. Nothing here ever starts a candidate.
 *
 * THE STRING RETURNED IS ALWAYS ABSOLUTE, and it is the same string `invokeCli`
 * hands to `spawn`. That is a safety property, not tidiness: the child is
 * started with `cwd` pointed at a fresh empty scratch directory and an
 * environment carrying PATH, so a relative candidate would be re-resolved
 * against a directory holding nothing, and a candidate that `join(".", name)`
 * had collapsed to a BARE name would re-enter a PATH search INSIDE THE CHILD —
 * starting a file this gate never examined. On macOS such a file, if it returns
 * ENOEXEC, is retried through a command interpreter, which is the 2026-09-17
 * fork-bomb path exactly. A relative key value is therefore resolved against the
 * process cwd here, where it can still be checked; a relative PATH entry is not
 * resolved at all, it is skipped.
 */
export function resolveConfiguredBinary(
  binaryName: string,
  environmentKey: string,
  unresolvedCode: string,
  source: NodeJS.ProcessEnv = process.env
): string {
  const configured = source[environmentKey];
  if (configured === undefined) {
    return admitProgram(discoverOnPath(binaryName, unresolvedCode, source), unresolvedCode);
  }
  const named = configured.trim();
  if (named === "") throw new Error(unresolvedCode);
  return admitProgram(
    /[\\/]/u.test(named) ? resolve(named) : discoverOnPath(named, unresolvedCode, source),
    unresolvedCode
  );
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
