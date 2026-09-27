import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import {
  accessSync, closeSync, constants, lstatSync, openSync, readSync, statSync
} from "node:fs";
import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { z } from "zod";
import { THINKING_LEVEL_DEFAULT_ONLY } from "@debateai/kernel";

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
  /**
   * `USAGE_CAP` (R4, model scorecard 2026-09-26): the adapter recognised its
   * CLI's own subscription-cap signature. The server answers it 429 with
   * `x_cli_relay_error: CLI_RELAY_USAGE_CAP`, so the runner can switch the seat
   * to its backup at once instead of retrying a wall.
   */
  constructor(readonly kind: "FAILED" | "TIMEOUT" | "USAGE_CAP", code: string) {
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
  /**
   * Pre-flight fix F37: "length" when the CLI reports that it stopped at its
   * output bound. The relay then answers 200 with `finish_reason: "length"`,
   * so the gateway's existing truncation path handles it (LENGTH_EXCEEDED,
   * re-sent under a raised bound) — never a relay failure, never a reason to
   * move a seat to its backup. Absent ⇒ "stop".
   */
  readonly finishReason?: "length";
  /**
   * §2.2: the level the REQUEST asked for, which the CLI was run at. Absent ⇒
   * DEFAULT_ONLY: no level was asked and the connection ran at its own default
   * (for an adapter with a `defaultThinkingLevel`, that one). invokeCli stamps
   * it; an adapter sets it only if its CLI reports running at another level.
   */
  readonly thinkingLevel?: string;
  /**
   * D8: every input token the CLI says the model read for this call, cached
   * input included — set ONLY by a CLI that counts cache apart from
   * `usage.promptTokens` (Claude Code). Read by the harness-overhead line and
   * nothing else: it is never echoed and never prices anything.
   */
  readonly reportedInputTokens?: number;
}

export interface CliUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
  readonly costUsd?: number;
  /**
   * §2.3: thinking tokens, ONLY when the CLI itself reports them. Absent means
   * "not reported", never a guessed zero. Echoed in OpenAI's spelling,
   * `completion_tokens_details.reasoning_tokens`.
   */
  readonly reasoningTokens?: number;
}

/**
 * The usage a relay reports, built from the counters a CLI printed. A total the
 * CLI did not print is the sum of prompt and completion when both are known.
 * Nothing is invented; null when the CLI printed no counter at all.
 */
export function buildCliUsage(observed: Readonly<{
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  totalTokens?: number | undefined;
  reasoningTokens?: number | undefined;
  costUsd?: number | undefined;
}>): CliUsage | null {
  const { promptTokens, completionTokens, reasoningTokens, costUsd } = observed;
  const totalTokens = observed.totalTokens
    ?? (promptTokens === undefined || completionTokens === undefined
      ? undefined
      : promptTokens + completionTokens);
  const usage = {
    ...(promptTokens === undefined ? {} : { promptTokens }),
    ...(completionTokens === undefined ? {} : { completionTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(costUsd === undefined ? {} : { costUsd }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens })
  };
  return Object.keys(usage).length === 0 ? null : Object.freeze(usage);
}

/** §2.10: how a maker's CLI receives the prompt. Absent on an adapter ⇒ "argv". */
export type CliPromptTransport = "argv" | "stdin" | "file";

/** What one relayed call hands the argument builder. */
export interface CliInvocation {
  /** "file" transport only: absolute, mode 0600, in its own 0700 directory, reaped after the call. */
  readonly promptFile?: string;
  /** Already checked against the adapter's `thinkingLevels`; absent ⇒ no level flag. */
  readonly thinkingLevel?: string;
  /** D8: absolute, mode 0600, holds RELAY_MINIMAL_SYSTEM_PROMPT; only for an adapter that `readsInstructionsFile`. */
  readonly instructionsFile?: string;
}

/** What a non-zero exit left behind — shown to the adapter's usage-cap classifier and to nothing else. */
export interface CliFailureEvidence {
  /** null when the child ended on a signal this relay did not send. */
  readonly exitCode: number | null;
  readonly stdout: string;
  /** The first CLI_RELAY_STDERR_EVIDENCE_MAX_BYTES bytes. Never logged, never returned. */
  readonly stderr: string;
}

export const CLI_RELAY_SIGTERM_GRACE_MS = 250 as const;
export const CLI_RELAY_STDOUT_MAX_BYTES = 1_048_576 as const;
export const CLI_RELAY_STDOUT_LIMIT_CODE = "CLI_RELAY_STDOUT_LIMIT" as const;
/**
 * A11 fix round 1: how much of a stdout line an adapter's `keepStdoutLine` sees
 * before it decides. A line is decided from its START so a dropped line is never
 * assembled at all: pi repeats a whole prompt of up to ~2 MB in one event line,
 * and assembling that line to look at it would itself pass the stdout bound.
 */
export const CLI_RELAY_STDOUT_LINE_DECISION_BYTES = 4_096 as const;
/** R4: a CLI cannot make the relay hold more stderr evidence than this. */
export const CLI_RELAY_STDERR_EVIDENCE_MAX_BYTES = 65_536 as const;
/** §2.10: the "file" transport's prompt file, inside its private directory. */
export const CLI_RELAY_PROMPT_FILE_NAME = "prompt.txt" as const;
/** §2.2: a vendor level name is ONE lower-case code token — never a flag, never prose. */
export const CLI_RELAY_THINKING_LEVEL_TOKEN = /^[a-z][a-z0-9_-]{0,31}$/u;
export const CLI_RELAY_THINKING_LEVEL_UNSUPPORTED = "CLI_RELAY_THINKING_LEVEL_UNSUPPORTED" as const;
export const CLI_RELAY_CONTEXT_WINDOW_EXCEEDED = "CLI_RELAY_CONTEXT_WINDOW_EXCEEDED" as const;
export const CLI_RELAY_USAGE_CAP = "CLI_RELAY_USAGE_CAP" as const;
/** §2.10: the gateway's own conservative floor (packages/budget: 2 bytes per token), restated. */
const CONTEXT_WINDOW_BYTES_PER_TOKEN = 2;
/**
 * R4: the only thing a cap classifier may hand back is ONE upper-case code token
 * (e.g. `CLAUDE_CLI_USAGE_CAP`). It becomes the 429's `error`, so anything else —
 * a slice of the evidence, which can echo the prompt — is treated as "no cap
 * recognised" and never leaves the relay. Exported so an adapter's own tests can
 * check its code against it.
 */
export const CLI_RELAY_USAGE_CAP_CODE_TOKEN = /^[A-Z][A-Z0-9_]{0,63}$/u;
/**
 * §2.10, fix round 1: a "stdin" or "file" adapter whose argument list carries the
 * prompt text is refused before any child exists. Only the "argv" transport (the
 * four original makers) may put the prompt on a command line.
 */
export const CLI_RELAY_PROMPT_ON_ARGV_CODE = "CLI_RELAY_PROMPT_ON_ARGV" as const;

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
  /**
   * §2.10: how the prompt reaches the CLI. Absent ⇒ "argv", byte-for-byte what
   * the four original makers do. "stdin" writes the prompt and CLOSES the pipe
   * (DR-133 was about a stdin left OPEN). "file" writes it to a 0600 file in a
   * private directory reaped after the call; only its path reaches argv.
   */
  readonly promptTransport?: CliPromptTransport;
  /** "stdin" only: the exact text written; absent ⇒ the prompt itself. */
  stdinPayload?(prompt: string): string;
  /** §2.2: the vendor level names this CLI can be run at. Absent ⇒ DEFAULT_ONLY. */
  readonly thinkingLevels?: readonly string[];
  /** §2.2: the level an unasked call runs at. Absent ⇒ no level flag at all. */
  readonly defaultThinkingLevel?: string;
  /** §2.10: a declared context window; a request that cannot fit is refused (413) before any child exists. */
  readonly contextWindowTokens?: number;
  /**
   * D8: true for a CLI that reads its system text from a FILE (codex:
   * `-c model_instructions_file=…`). The relay then writes
   * RELAY_MINIMAL_SYSTEM_PROMPT once per start, mode 0600, in its workspace,
   * and hands the path to `buildArguments` as `invocation.instructionsFile`.
   * Such an adapter is never run without that file.
   */
  readonly readsInstructionsFile?: boolean;
  /**
   * R4: this maker's usage-cap signature, read off a NON-ZERO exit. Returns the
   * maker's typed cap code, or null. Absent, or null, keeps today's FAILED —
   * the conservative default for a CLI whose cap output has not been captured.
   * The code must be ONE upper-case token (`CLI_RELAY_USAGE_CAP_CODE_TOKEN`); any
   * other result — prose, a slice of the evidence, an empty string — is treated
   * as no cap recognised: FAILED (502), never 429. So is a classifier that throws.
   */
  classifyUsageCap?(evidence: CliFailureEvidence): string | null;
  /**
   * A11 fix round 1: which stdout lines reach `parseCompletion`. Absent ⇒ every
   * byte is read and counted, exactly as before. Present ⇒ stdout is read LINE BY
   * LINE as it arrives: each line is decided from its first
   * CLI_RELAY_STDOUT_LINE_DECISION_BYTES bytes (the whole line when shorter, never
   * its newline); a line answered `false` is discarded as it streams, never
   * buffered and never counted toward CLI_RELAY_STDOUT_MAX_BYTES; every other line
   * is kept and counted like any output, so one kept line — terminated or not —
   * still cannot pass the bound. Only an explicit `false` drops a line: a hook that
   * throws, or answers anything else, keeps it, and the parser then decides.
   */
  keepStdoutLine?(lineStart: string): boolean;
  buildArguments(prompt: string, invocation?: CliInvocation): readonly string[];
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

/** The one reply a start-up handshake accepts, once trimmed, lower-cased and stripped of trailing punctuation. */
const RELAY_HANDSHAKE_REPLY = "ok" as const;

/**
 * Task A10 fix round 1, shared from Task A11: a relay whose CLI takes its prompt
 * off argv (stdin, or a prompt file) must READ the handshake reply. The silent
 * failure is a CLI that never reads the prompt, answers some other request and
 * still exits cleanly with generic text: every served call would then answer
 * 200 with text that does not answer its prompt — a transport fault a scorecard
 * would blame on the model. Only a CLI that read the handshake prompt replies
 * "ok", so any other reply must stop the relay before it serves.
 */
export function isRelayHandshakeReply(content: string): boolean {
  return content.trim().toLowerCase().replace(/[\s\p{P}]+$/u, "") === RELAY_HANDSHAKE_REPLY;
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

/** A11 fix round 1: the stdout line filter `invokeCli` runs for an adapter that declares `keepStdoutLine`. */
export interface CliStdoutLineFilter {
  /** The bytes of this chunk that belong to KEPT lines, in order, newlines included. */
  accept(chunk: Buffer): Buffer[];
  /** At end of stream: an unterminated last line still undecided is decided now. */
  finish(): Buffer[];
}

const NEWLINE_BYTE = 0x0a;

/**
 * Pure, and it counts nothing: the caller counts every byte it returns against
 * CLI_RELAY_STDOUT_MAX_BYTES. So the only bytes held here are the start of ONE
 * undecided line — never more than CLI_RELAY_STDOUT_LINE_DECISION_BYTES — while a
 * kept line's bytes are handed back as they arrive (an unterminated kept line
 * therefore meets the bound like any output) and a dropped line's are discarded.
 * A line may arrive split across any number of chunks, and a chunk may hold any
 * number of lines. What is held or returned is a COPY, never a view into a chunk,
 * so a few kept bytes can never keep a large, mostly dropped chunk alive: the
 * memory held is the memory counted.
 */
export function createStdoutLineFilter(keepLine: (lineStart: string) => boolean): CliStdoutLineFilter {
  let mode: "undecided" | "keep" | "drop" = "undecided";
  let held: Buffer[] = [];
  let heldBytes = 0;
  const decide = (kept: Buffer[]): void => {
    const lineStart = Buffer.concat(held, heldBytes);
    held = [];
    heldBytes = 0;
    let keep = true;
    try {
      keep = keepLine(lineStart.toString("utf8")) !== false;
    } catch {
      // A hook that cannot read the line has not decided to drop it.
      keep = true;
    }
    mode = keep ? "keep" : "drop";
    if (keep && lineStart.byteLength > 0) kept.push(lineStart);
  };
  return {
    accept(chunk: Buffer): Buffer[] {
      const kept: Buffer[] = [];
      let offset = 0;
      while (offset < chunk.byteLength) {
        const newline = chunk.indexOf(NEWLINE_BYTE, offset);
        const terminated = newline >= 0;
        let content = chunk.subarray(offset, terminated ? newline : chunk.byteLength);
        offset = terminated ? newline + 1 : chunk.byteLength;
        if (mode === "undecided") {
          const head = content.subarray(0, CLI_RELAY_STDOUT_LINE_DECISION_BYTES - heldBytes);
          held.push(Buffer.from(head));
          heldBytes += head.byteLength;
          content = content.subarray(head.byteLength);
          // Still short of the decision bytes and the line goes on in a later chunk.
          if (heldBytes < CLI_RELAY_STDOUT_LINE_DECISION_BYTES && !terminated) continue;
          decide(kept);
        }
        if (mode === "keep") {
          if (content.byteLength > 0) kept.push(Buffer.from(content));
          if (terminated) kept.push(Buffer.of(NEWLINE_BYTE));
        }
        if (terminated) mode = "undecided";
      }
      return kept;
    },
    finish(): Buffer[] {
      const kept: Buffer[] = [];
      if (mode === "undecided" && heldBytes > 0) decide(kept);
      return kept;
    }
  };
}

/**
 * D8 — lean calls (owner ruling 2026-09-26; Appendix B, M5). The ONE system
 * text a relay may give a CLI in place of the CLI's own: fixed engine text,
 * never debate content, so it may travel on argv. The engine's own system and
 * user messages stay in the prompt transcript exactly as before.
 */
export const RELAY_MINIMAL_SYSTEM_PROMPT = "Follow the instructions in the user message exactly." as const;
/** D8: the file RELAY_MINIMAL_SYSTEM_PROMPT is written to, for a CLI that reads its instructions from a file. */
export const CLI_RELAY_INSTRUCTIONS_FILE_NAME = "relay-instructions.md" as const;
export const CLI_RELAY_INSTRUCTIONS_FILE_MISSING = "CLI_RELAY_INSTRUCTIONS_FILE_MISSING" as const;
/**
 * D8: the local size estimate — characters ÷ 4, rounded up — the same rule as
 * `@debateai/providers`' `estimatePromptTokens` (a relay-core test pins the
 * agreement), restated so the relay core takes no dependency on providers.
 */
export const RELAY_PROMPT_CHARACTERS_PER_TOKEN = 4 as const;

/** The maker's name as one lower-case path token: "Z.AI" → "z-ai", "xAI" → "xai". */
function makerSlugOf(maker: string): string {
  return maker.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cli";
}

/**
 * D8: ONE private directory per relay, opened at start — before the handshake —
 * and removed at stop. Every call's fresh, EMPTY working directory (CONT-01,
 * still reaped after each call) and the "file" transport's prompt directory
 * are created inside it, so nothing a relay writes outlives the relay. It is
 * never a working directory itself: the instructions file it may hold is never
 * in a child's cwd.
 */
export interface RelayWorkspace {
  /** Absolute; mode 0700. */
  readonly directory: string;
  /** Absolute; mode 0600; RELAY_MINIMAL_SYSTEM_PROMPT. Only for an adapter that `readsInstructionsFile`. */
  readonly instructionsFile?: string;
  /** Removes the directory and everything in it; safe to call more than once. */
  close(): Promise<void>;
}

export async function openRelayWorkspace(
  adapter: Pick<CliRelayAdapter, "maker" | "readsInstructionsFile">
): Promise<RelayWorkspace> {
  const directory = await mkdtemp(
    join(await realpath(tmpdir()), `relay-${makerSlugOf(adapter.maker)}-workspace-`)
  );
  const remove = (): Promise<void> => rm(directory, { recursive: true, force: true }).catch(() => undefined);
  try {
    // mkdtemp already creates 0700; stated again so no platform default can widen it.
    await chmod(directory, 0o700);
    let instructionsFile: string | undefined;
    if (adapter.readsInstructionsFile === true) {
      instructionsFile = join(directory, CLI_RELAY_INSTRUCTIONS_FILE_NAME);
      // `wx`: the directory is new and empty, so an existing file is an anomaly.
      await writeFile(instructionsFile, RELAY_MINIMAL_SYSTEM_PROMPT, { encoding: "utf8", mode: 0o600, flag: "wx" });
    }
    let closing: Promise<void> | undefined;
    return Object.freeze({
      directory,
      ...(instructionsFile === undefined ? {} : { instructionsFile }),
      close: () => (closing ??= remove())
    });
  } catch (error) {
    await remove();
    throw error;
  }
}

/** D8: what one relay's CLI adds around a prompt, measured once at start. */
export interface HarnessOverhead {
  readonly maker: string;
  /** The CLI's own input count for the handshake; null when it reported none. */
  readonly reportedInputTokens: number | null;
  /** Our own count of the handshake prompt handed to the CLI: characters ÷ 4, rounded up. */
  readonly promptTokensEstimate: number;
  /** reported − own: what the CLI added. null when nothing was reported. */
  readonly overheadTokens: number | null;
}

export function measureHarnessOverhead(
  maker: string,
  prompt: string,
  handshake: CliCompletion
): HarnessOverhead {
  const reportedInputTokens = handshake.reportedInputTokens ?? handshake.usage?.promptTokens ?? null;
  const promptTokensEstimate = Math.ceil(prompt.length / RELAY_PROMPT_CHARACTERS_PER_TOKEN);
  return Object.freeze({
    maker,
    reportedInputTokens,
    promptTokensEstimate,
    overheadTokens: reportedInputTokens === null ? null : reportedInputTokens - promptTokensEstimate
  });
}

/**
 * `providerRef` (pre-flight fix F37): a relay does not know which candidate it
 * serves, so its own line names the maker only. The relay host, which does,
 * prints the same figures once more with the candidate's providerRef, so two
 * candidates of one maker (two claude models, say) can be told apart.
 */
export function harnessOverheadLine(overhead: HarnessOverhead, providerRef?: string): string {
  return `RELAY OVERHEAD ${overhead.maker}${providerRef === undefined ? "" : ` ${providerRef}`}`
    + ` reported=${overhead.reportedInputTokens ?? "none"}`
    + ` own=${overhead.promptTokensEstimate} overhead=${overhead.overheadTokens ?? "unknown"}`;
}

/**
 * D8: measures a handshake's overhead and prints ONE informational line
 * (stdout by default, beside `RELAY DEGRADED`). Never a gate: nothing here can
 * refuse a start, and a line that cannot be written is dropped.
 */
export function reportHarnessOverhead(
  maker: string,
  prompt: string,
  handshake: CliCompletion,
  write: (line: string) => void = (line) => { process.stdout.write(`${line}\n`); }
): HarnessOverhead {
  const overhead = measureHarnessOverhead(maker, prompt, handshake);
  try {
    write(harnessOverheadLine(overhead));
  } catch {
    // Informational only.
  }
  return overhead;
}

/** §2.2: stamps the level a REQUEST asked for; an unasked call stays DEFAULT_ONLY. */
function withRequestedLevel(completion: CliCompletion, requestedLevel: string | undefined): CliCompletion {
  return requestedLevel === undefined || completion.thinkingLevel !== undefined
    ? completion
    : Object.freeze({ ...completion, thinkingLevel: requestedLevel });
}

/** R4: a non-zero exit is FAILED unless the adapter recognises its own cap signature in it. */
function nonZeroExitFailure(adapter: CliRelayAdapter, evidence: CliFailureEvidence): CliRelayFailure {
  let usageCapCode: string | null = null;
  try {
    usageCapCode = adapter.classifyUsageCap?.(evidence) ?? null;
  } catch {
    // A classifier that cannot read the evidence has not recognised a cap.
    usageCapCode = null;
  }
  return usageCapCode === null || !CLI_RELAY_USAGE_CAP_CODE_TOKEN.test(usageCapCode)
    ? new CliRelayFailure("FAILED", adapter.failureCode)
    : new CliRelayFailure("USAGE_CAP", usageCapCode);
}

export async function invokeCli(
  command: CommandSpec,
  adapter: CliRelayAdapter,
  prompt: string,
  timeoutMs: number,
  options: Readonly<{ thinkingLevel?: string; workspace?: RelayWorkspace }> = {}
): Promise<CliCompletion> {
  // Fix round 1: the handshake paths call invokeCli without startCliRelayServer,
  // so the adapter's own declarations are checked here too, before anything exists.
  assertAdapterDeclarations(adapter);
  // §2.2: the level on the command line is the one asked for, else the
  // adapter's own explicit default, else none. An undeclared level is refused
  // here before any directory or child exists; the HTTP server has already
  // answered 400 for a request that names one.
  const thinkingLevel = options.thinkingLevel ?? adapter.defaultThinkingLevel;
  if (thinkingLevel !== undefined && !(adapter.thinkingLevels ?? []).includes(thinkingLevel)) {
    throw new TypeError(CLI_RELAY_THINKING_LEVEL_UNSUPPORTED);
  }
  // D8: a CLI that reads its system text from a file runs with the relay's own
  // file or not at all — never silently with its built-in default.
  const instructionsFile = options.workspace?.instructionsFile;
  if (adapter.readsInstructionsFile === true && instructionsFile === undefined) {
    throw new TypeError(CLI_RELAY_INSTRUCTIONS_FILE_MISSING);
  }
  const transport = adapter.promptTransport ?? "argv";
  const makerSlug = makerSlugOf(adapter.maker);
  // D8: inside a relay, the call's empty directory (and the "file" transport's
  // prompt directory) is made in the relay's private workspace; a call made
  // outside any relay (discovery) keeps the system temp root, as before.
  const temporaryRoot = options.workspace?.directory ?? await realpath(tmpdir());
  const scratchDirectory = await mkdtemp(join(temporaryRoot, `relay-${makerSlug}-`));
  let promptDirectory: string | undefined;
  // Vendor litter and the prompt file are not relay input: both directories are
  // reaped exactly once, after the child has ended and before the call settles.
  const reap = async (): Promise<void> => {
    const directories = promptDirectory === undefined
      ? [scratchDirectory]
      : [scratchDirectory, promptDirectory];
    await Promise.all(directories.map((directory) =>
      rm(directory, { recursive: true, force: true }).catch(() => undefined)
    ));
  };
  let argumentList: readonly string[];
  let environment: NodeJS.ProcessEnv;
  let stdinText: string | undefined;
  try {
    let promptFile: string | undefined;
    if (transport === "file") {
      // §2.10: the prompt lives in its OWN 0700 directory, never in the
      // child's cwd, so every maker still starts in an empty scratch directory.
      promptDirectory = await mkdtemp(join(temporaryRoot, `relay-${makerSlug}-prompt-`));
      promptFile = join(promptDirectory, CLI_RELAY_PROMPT_FILE_NAME);
      // `wx`: the directory is new and empty, so an existing file is an anomaly.
      await writeFile(promptFile, prompt, { encoding: "utf8", mode: 0o600, flag: "wx" });
    }
    const invocation: CliInvocation = Object.freeze({
      ...(promptFile === undefined ? {} : { promptFile }),
      ...(thinkingLevel === undefined ? {} : { thinkingLevel }),
      ...(instructionsFile === undefined ? {} : { instructionsFile })
    });
    argumentList = [...command.prefixArguments, ...adapter.buildArguments(prompt, invocation)];
    // §2.10, fix round 1: "never on argv" is a law of the core, not a courtesy of
    // each adapter. Refused here, so the catch below reaps the prompt directory.
    // An empty prompt is "in" every string, so it is never counted as present.
    if (transport !== "argv" && prompt.length > 0
      && argumentList.some((argument) => argument.includes(prompt))) {
      throw new CliRelayFailure("FAILED", CLI_RELAY_PROMPT_ON_ARGV_CODE);
    }
    // P4-01: model subprocesses never inherit the API environment. Only
    // process basics plus this maker's exact auth locators cross the seam.
    environment = buildCliChildEnvironment(adapter, scratchDirectory);
    // The adapter's framing is built here too, so one that throws is refused
    // before any child exists, exactly like a throwing argument builder.
    if (transport === "stdin") stdinText = adapter.stdinPayload?.(prompt) ?? prompt;
  } catch (error) {
    await reap();
    throw error;
  }
  return new Promise((resolve, reject) => {
    // CONT-01: vendor CLIs receive no project cwd. A fresh empty directory is
    // the only ambient filesystem context for every handshake and relay call.
    // DR-133: a CLI left with an OPEN stdin can hang. "argv" and "file" keep
    // stdin closed; "stdin" writes the prompt and closes the pipe at once.
    // One settle for every path — a spawn that throws, a half-built child, an
    // `error` event, `close` — so none of them can answer twice.
    let settled = false;
    let deadlineTimer: NodeJS.Timeout | undefined;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let terminationFailure: CliRelayFailure | undefined;
    const settleOnce = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
      void reap().then(settle);
    };
    const rejectAsCliFailure = (): void => {
      settleOnce(() => reject(terminationFailure ?? new CliRelayFailure("FAILED", adapter.failureCode)));
    };
    let spawned: ChildProcessByStdio<Writable | null, Readable, Readable>;
    try {
      spawned = transport === "stdin"
        ? spawn(command.binary, argumentList, {
          cwd: scratchDirectory, env: environment, stdio: ["pipe", "pipe", "pipe"]
        })
        : spawn(command.binary, argumentList, {
          cwd: scratchDirectory, env: environment, stdio: ["ignore", "pipe", "pipe"]
        });
    } catch {
      // Fix round 1: ENOEXEC (a 0-byte launcher), E2BIG, ENAMETOOLONG, EPERM,
      // ELOOP and Node's own argument checks (a NUL byte) THROW here instead of
      // arriving as an `error` event, before any listener exists. It is still a
      // CLI failure, and the directories — the prompt file included — are reaped.
      rejectAsCliFailure();
      return;
    }
    const child = spawned;
    // Fix round 2: the `error` listener goes on FIRST. ENOENT, EACCES and EAGAIN
    // — and EMFILE/ENFILE — arrive as an `error` event on the next tick, and an
    // `error` with no listener is an uncaught exception that ends the relay.
    // `on`, not `once`: a second `error` (a failed kill) is absorbed by the guard.
    child.on("error", rejectAsCliFailure);
    // Fix round 2: under EMFILE/ENFILE Node returns a child whose stdio was never
    // set up (`undefined`, which the typings do not admit) beside that scheduled
    // `error`. It is the same CLI failure as a throw: reaped, answered once.
    if (child.stdout == null || child.stderr == null || (transport === "stdin" && child.stdin == null)) {
      rejectAsCliFailure();
      return;
    }
    if (child.stdin != null) {
      // A child that exits before reading everything must not become an
      // unhandled EPIPE; its exit status still decides the outcome.
      child.stdin.on("error", () => undefined);
      child.stdin.end(stdinText ?? "", "utf8");
    }
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    const stderr: Buffer[] = [];
    let stderrBytes = 0;
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
    // A11 fix round 1: an adapter's line filter runs BEFORE any byte is counted or
    // buffered. Without one, every chunk is kept whole, exactly as before.
    const keepStdoutLine = adapter.keepStdoutLine;
    const lineFilter = keepStdoutLine === undefined
      ? undefined
      : createStdoutLineFilter((lineStart) => keepStdoutLine.call(adapter, lineStart));
    /** false once the bound is passed; the caller stops reading this chunk. */
    const keepStdout = (piece: Buffer): boolean => {
      if (piece.byteLength > CLI_RELAY_STDOUT_MAX_BYTES - stdoutBytes) {
        beginTermination(new CliRelayFailure("FAILED", CLI_RELAY_STDOUT_LIMIT_CODE));
        return false;
      }
      stdoutBytes += piece.byteLength;
      stdout.push(piece);
      return true;
    };
    child.stdout.on("data", (chunk: Buffer) => {
      if (terminationFailure !== undefined) return;
      if (lineFilter === undefined) {
        keepStdout(chunk);
        return;
      }
      for (const piece of lineFilter.accept(chunk)) {
        if (!keepStdout(piece)) return;
      }
    });
    // R4 evidence only: bounded, held in memory, shown to the adapter's cap
    // classifier and dropped. It never reaches a response, a log or a prompt.
    child.stderr.on("data", (chunk: Buffer) => {
      const room = CLI_RELAY_STDERR_EVIDENCE_MAX_BYTES - stderrBytes;
      if (room <= 0) return;
      const kept = chunk.byteLength > room ? chunk.subarray(0, room) : chunk;
      stderrBytes += kept.byteLength;
      stderr.push(kept);
    });
    deadlineTimer = setTimeout(() => {
      beginTermination(new CliRelayFailure("TIMEOUT", adapter.timeoutCode));
    }, timeoutMs);
    child.once("close", (code) => {
      // A11 fix round 1: an unterminated last line shorter than the decision bytes
      // is decided now. The child has ended, so the bound is enforced without a kill.
      if (lineFilter !== undefined && terminationFailure === undefined && !settled) {
        for (const piece of lineFilter.finish()) {
          if (piece.byteLength > CLI_RELAY_STDOUT_MAX_BYTES - stdoutBytes) {
            terminationFailure = new CliRelayFailure("FAILED", CLI_RELAY_STDOUT_LIMIT_CODE);
            break;
          }
          stdoutBytes += piece.byteLength;
          stdout.push(piece);
        }
      }
      settleOnce(() => {
        if (terminationFailure !== undefined) {
          reject(terminationFailure);
          return;
        }
        const stdoutText = Buffer.concat(stdout).toString("utf8");
        if (code !== 0) {
          reject(nonZeroExitFailure(adapter, Object.freeze({
            exitCode: code,
            stdout: stdoutText,
            stderr: Buffer.concat(stderr).toString("utf8")
          })));
          return;
        }
        Promise.resolve()
          .then(() => adapter.parseCompletion(stdoutText, prompt))
          .then((completion) => resolve(withRequestedLevel(completion, options.thinkingLevel)), reject);
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
  // §2.2: the engine's extension member. One lower-case token, so it can never
  // become a flag or prose on a command line. Absent ⇒ DEFAULT_ONLY.
  x_thinking_level: z.string().regex(CLI_RELAY_THINKING_LEVEL_TOKEN).optional(),
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
  /**
   * D8: the relay's private workspace, opened by its start function BEFORE the
   * handshake. The server owns it from here and removes it at close(). Absent
   * ⇒ the server opens one of its own.
   */
  readonly workspace?: RelayWorkspace;
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

/** A refusal the gateway can read by code, beside the maker-facing `error`. */
function sendRelayRefusal(response: ServerResponse, status: 400 | 413, code: string): void {
  sendJson(response, status, { error: code, x_cli_relay_error: code });
}

/**
 * §2.10 and R1 (pre-flight fix F1): the gateway's floor (2 bytes per token) over the SAME bytes the
 * gateway's `estimateWindowTokens` counts — each message's content, UTF-8 — plus the caller's own
 * output bound. Never the bytes of the JSON transcript: its envelope, escaped quotes and newlines
 * would make the relay stricter than the gateway, which would then send a prompt the relay refuses.
 */
function exceedsContextWindow(
  messages: readonly { readonly content: string }[],
  maxTokens: unknown,
  contextWindowTokens: number | undefined
): boolean {
  if (contextWindowTokens === undefined) return false;
  const outputBound = typeof maxTokens === "number" && Number.isSafeInteger(maxTokens) && maxTokens > 0
    ? maxTokens
    : 0;
  let contentBytes = 0;
  for (const message of messages) contentBytes += Buffer.byteLength(message.content, "utf8");
  return Math.ceil(contentBytes / CONTEXT_WINDOW_BYTES_PER_TOKEN) + outputBound > contextWindowTokens;
}

/**
 * An adapter's own declarations: refused by `startCliRelayServer` at start, and
 * again by every `invokeCli` call, because the handshake paths call `invokeCli`
 * without ever starting a server.
 */
function assertAdapterDeclarations(adapter: CliRelayAdapter): void {
  const levels = adapter.thinkingLevels ?? [];
  const invalid = levels.some((level) => !CLI_RELAY_THINKING_LEVEL_TOKEN.test(level))
    || new Set(levels).size !== levels.length
    || (adapter.defaultThinkingLevel !== undefined && !levels.includes(adapter.defaultThinkingLevel))
    || (adapter.contextWindowTokens !== undefined
      && (!Number.isSafeInteger(adapter.contextWindowTokens) || adapter.contextWindowTokens < 1));
  if (invalid) throw new TypeError("CLI_RELAY_ADAPTER_DECLARATION_INVALID");
}

export async function startCliRelayServer(options: CliRelayServerOptions): Promise<CliRelayHandle> {
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
    throw new TypeError("CLI_RELAY_PORT_INVALID");
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new TypeError("CLI_RELAY_TIMEOUT_INVALID");
  }
  assertAdapterDeclarations(options.adapter);
  // D8: every served call runs inside this relay's own workspace.
  const workspace = options.workspace ?? await openRelayWorkspace(options.adapter);
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
      const requestedLevel = parsed.x_thinking_level;
      // §2.2 / R7: an undeclared level is REFUSED before any child exists —
      // never run silently at some other level.
      if (requestedLevel !== undefined
        && !(options.adapter.thinkingLevels ?? []).includes(requestedLevel)) {
        sendRelayRefusal(response, 400, CLI_RELAY_THINKING_LEVEL_UNSUPPORTED);
        return;
      }
      const prompt = renderPromptTranscript(parsed.messages);
      if (exceedsContextWindow(parsed.messages, parsed.max_tokens, options.adapter.contextWindowTokens)) {
        sendRelayRefusal(response, 413, CLI_RELAY_CONTEXT_WINDOW_EXCEEDED);
        return;
      }
      const completion = await invokeCli(
        options.command,
        options.adapter,
        prompt,
        options.timeoutMs,
        requestedLevel === undefined ? { workspace } : { thinkingLevel: requestedLevel, workspace }
      );
      sendJson(response, 200, {
        id: `chatcmpl-${randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1_000),
        model: completion.model,
        maker: options.adapter.maker,
        x_thinking_level: completion.thinkingLevel ?? THINKING_LEVEL_DEFAULT_ONLY,
        usage: completion.usage === null ? null : {
          prompt_tokens: completion.usage.promptTokens,
          completion_tokens: completion.usage.completionTokens,
          total_tokens: completion.usage.totalTokens,
          x_cost_usd: completion.usage.costUsd,
          ...(completion.usage.reasoningTokens === undefined ? {} : {
            completion_tokens_details: { reasoning_tokens: completion.usage.reasoningTokens }
          })
        },
        choices: [{
          index: 0,
          message: { role: "assistant", content: completion.content },
          finish_reason: completion.finishReason ?? "stop"
        }]
      });
    } catch (error) {
      if (error instanceof CliRelayFailure) {
        if (error.kind === "USAGE_CAP") {
          sendJson(response, 429, { error: error.message, x_cli_relay_error: CLI_RELAY_USAGE_CAP });
          return;
        }
        sendJson(response, error.kind === "TIMEOUT" ? 504 : 502, { error: error.message });
        return;
      }
      sendJson(response, 400, { error: "MALFORMED_REQUEST" });
    }
  });
  try {
    server.listen(options.port, "127.0.0.1");
    await once(server, "listening");
  } catch (error) {
    await workspace.close();
    throw error;
  }
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    await workspace.close();
    throw new Error("CLI_RELAY_ADDRESS_FAILED");
  }
  // D8 fix round 1: ONE close for every caller. A second close must not see
  // `listening === false` and remove the workspace while the first is still
  // waiting for an in-flight call, whose child would lose its cwd (or pi its
  // @file) mid-call. The workspace goes only after the server has fully closed.
  let closing: Promise<void> | undefined;
  return {
    port: address.port,
    baseUrl: `http://127.0.0.1:${address.port}`,
    authorizationHeader,
    close() {
      closing ??= (async () => {
        if (server.listening) {
          server.close();
          await once(server, "close");
        }
        // D8: the workspace goes with the relay, whatever a call left in it.
        await workspace.close();
      })();
      return closing;
    }
  };
}
