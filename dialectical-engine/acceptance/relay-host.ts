import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { assertRelayRuntime } from "./relay-deployment-guard.js";
import { startAgyRelay } from "./agy-relay.js";
import { startClaudeRelay } from "./claude-relay.js";
import { startGrokRelay } from "./grok-relay.js";
import { startModelShim } from "./model-shim.js";
import { startPiRelay } from "./pi-relay.js";
import { absolutePathOf, trackedPathRefusal } from "./untracked-path.js";
import {
  CLI_RELAY_THINKING_LEVEL_TOKEN,
  harnessOverheadLine,
  type CliRelayHandle,
  type CommandSpec,
  type HarnessOverhead
} from "./relay-core.js";

/**
 * Model scorecard §2.9/§2.10 — `pnpm run relays:serve`. The LOCAL operator's
 * relay host for step replay: one relay per candidate of a candidates file,
 * each on its own loopback port with its own random bearer, and an endpoints
 * file (mode 0600) that tells `moment:replay` where each one is. It runs until
 * SIGTERM (or SIGINT), then closes every relay and removes the endpoints file.
 *
 * It REFUSES in the hosted deployment — V-9(c): the relays ARE the local mode
 * and the hosted site never runs them — before it reads a file or starts a CLI.
 * It never prints a bearer; the endpoints file is the only place one is written,
 * and that file never lands in the tracked tree: it defaults to
 * RELAY_HOST_DEFAULT_ENDPOINTS_PATH under the engine root, and a path inside the
 * repository that is not under a `.local/` directory (git-ignored) is refused.
 */

export const RELAY_HOST_TOOLS = Object.freeze(["claude", "codex", "grok", "agy", "pi"] as const);
export type RelayHostTool = typeof RELAY_HOST_TOOLS[number];

/** The development panel's per-call deadline, restated: acceptance does not import the runner. */
const RELAY_HOST_DEFAULT_TIMEOUT_MS = 180_000;
/** The same ceiling the discovery-target parser holds its operator file to. */
const RELAY_HOST_CANDIDATES_MAX_BYTES = 65_536;
/** Where the endpoints file goes without `--endpoints`, relative to the engine root; `**\/.local/` is git-ignored. */
export const RELAY_HOST_DEFAULT_ENDPOINTS_PATH = ".local/relays/endpoints.json";
/** The engine root this module ships in (`acceptance/..`), deduced from its own location, never spelled. */
const RELAY_HOST_ENGINE_ROOT = fileURLToPath(new URL("..", import.meta.url));

const candidateSchema = z.object({
  providerRef: z.string().regex(/^[a-z][a-z0-9._:-]{0,127}$/u),
  tool: z.enum(RELAY_HOST_TOOLS),
  modelId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u),
  // D8 / A20b: grok only — the id grok's `-m` selects when it differs from the
  // id grok reports (`grok-4.7` answers as `grok-4.7-build`).
  modelSelection: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u).optional(),
  thinkingLevels: z.array(z.string().regex(CLI_RELAY_THINKING_LEVEL_TOKEN)).max(16)
}).strict();

const candidatesFileSchema = z.object({
  candidates: z.array(candidateSchema).min(1).max(32)
}).strict();

export type RelayHostCandidate = Readonly<{
  providerRef: string;
  tool: RelayHostTool;
  /** agy: the BASE id, without its level suffix. grok: the id grok REPORTS. */
  modelId: string;
  /** grok only: the id `-m` selects (`grok-4.7` for `grok-4.7-build`). Absent ⇒ grok's own default. */
  modelSelection?: string;
  /** The levels replay will ask; agy: the id suffixes to serve (at least one). */
  thinkingLevels: readonly string[];
}>;

export interface RelayHostEndpoint {
  readonly providerRef: string;
  readonly maker: string;
  readonly tool: RelayHostTool;
  readonly modelId: string;
  /** `http://127.0.0.1:<port>/v1` — usable as a discovery target's `base_url` as is. */
  readonly baseUrl: string;
  /** The relay's bearer WITHOUT the `Bearer ` scheme; the header is `Bearer <bearerToken>`. */
  readonly bearerToken: string;
  readonly thinkingLevels: readonly string[];
  readonly contextWindowTokens: number | null;
}

export interface RelayHostSeams {
  /** Test-only CLI doubles per tool. Each start function refuses them outside NODE_ENV=test. */
  readonly commands?: Readonly<Partial<Record<RelayHostTool, CommandSpec>>>;
  readonly codexSessionsRoot?: string;
  /**
   * Test-only stand-in for the engine root: where the default endpoints file goes,
   * and where the search for the enclosing work tree starts. Refused outside
   * NODE_ENV=test (RELAY_HOST_TEST_ONLY_REPOSITORY_ROOT_FORBIDDEN).
   */
  readonly repositoryRoot?: string;
}

export interface RelayHostOptions {
  readonly candidatesPath: string;
  /** Absent ⇒ RELAY_HOST_DEFAULT_ENDPOINTS_PATH under the engine root. */
  readonly endpointsPath?: string;
  readonly timeoutMs?: number;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly seams?: RelayHostSeams;
  readonly emit?: (line: string) => void;
}

export interface RelayHostHandle {
  readonly endpoints: readonly RelayHostEndpoint[];
  stop(): Promise<void>;
}

type StartedRelay = CliRelayHandle & Readonly<{
  model: string;
  maker: string;
  thinkingLevels: readonly string[];
  contextWindowTokens?: number;
  /** D8: what the relay measured around its handshake (every relay handle carries it since A12b). */
  harnessOverhead?: HarnessOverhead;
}>;

/**
 * V-9(c): the relay host is local-mode tooling and refuses the hosted deployment outright, through the one relay
 * guard (acceptance/relay-deployment-guard.ts) and its codes, like every other entry point that starts a relay.
 */
export function assertRelayHostRuntime(environment: Readonly<Record<string, string | undefined>>): void {
  assertRelayRuntime(environment);
}

export async function readRelayHostCandidates(path: string): Promise<readonly RelayHostCandidate[]> {
  let text: string;
  try {
    const bytes = await readFile(path);
    if (bytes.byteLength > RELAY_HOST_CANDIDATES_MAX_BYTES) throw new RangeError("too large");
    text = bytes.toString("utf8");
  } catch {
    throw new TypeError("RELAY_HOST_CANDIDATES_UNREADABLE");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new TypeError("RELAY_HOST_CANDIDATES_INVALID");
  }
  const parsed = candidatesFileSchema.safeParse(decoded);
  if (!parsed.success) throw new TypeError("RELAY_HOST_CANDIDATES_INVALID");
  const candidates = parsed.data.candidates;
  if (new Set(candidates.map(({ providerRef }) => providerRef)).size !== candidates.length
    || candidates.some(({ thinkingLevels }) => new Set(thinkingLevels).size !== thinkingLevels.length)
    || candidates.some(({ tool, thinkingLevels }) => tool === "agy" && thinkingLevels.length === 0)
    || candidates.some(({ tool, modelSelection }) => modelSelection !== undefined && tool !== "grok")) {
    throw new TypeError("RELAY_HOST_CANDIDATES_INVALID");
  }
  return Object.freeze(candidates.map((candidate) => Object.freeze({
    providerRef: candidate.providerRef,
    tool: candidate.tool,
    modelId: candidate.modelId,
    ...(candidate.modelSelection === undefined ? {} : { modelSelection: candidate.modelSelection }),
    thinkingLevels: Object.freeze([...candidate.thinkingLevels])
  })));
}

/** The Claude CLI takes a family ALIAS: the id's second segment, exactly as the dev panel derives it. */
function claudeAliasOf(modelId: string): string {
  const alias = modelId.split("-")[1];
  if (alias === undefined || !/^[a-z0-9]+$/u.test(alias)) {
    throw new TypeError("RELAY_HOST_MODEL_ALIAS_UNRESOLVED");
  }
  return alias;
}

function testOnlyCommandFor(seams: RelayHostSeams, tool: RelayHostTool): { readonly testOnlyCommand?: CommandSpec } {
  const command = seams.commands?.[tool];
  return command === undefined ? {} : { testOnlyCommand: command };
}

type RelayStart = (
  candidate: RelayHostCandidate,
  timeoutMs: number,
  seams: RelayHostSeams
) => Promise<StartedRelay>;

// Annotated directly (not through Object.freeze) so every arrow is contextually typed.
const RELAY_STARTS: Readonly<Record<RelayHostTool, RelayStart>> = {
  claude: (candidate, timeoutMs, seams) => startClaudeRelay({
    port: 0, timeoutMs, modelAlias: claudeAliasOf(candidate.modelId), ...testOnlyCommandFor(seams, "claude")
  }),
  codex: (candidate, timeoutMs, seams) => startModelShim({
    port: 0,
    timeoutMs,
    model: candidate.modelId,
    ...testOnlyCommandFor(seams, "codex"),
    ...(seams.codexSessionsRoot === undefined ? {} : { testOnlySessionsRoot: seams.codexSessionsRoot })
  }),
  // D8 / A20b: grok SELECTS by a short id and REPORTS a longer one. A candidate's
  // modelSelection, when given, is what `-m` gets; the CLI-reported lineage is
  // still held to modelId below.
  grok: (candidate, timeoutMs, seams) => startGrokRelay({
    port: 0,
    timeoutMs,
    ...(candidate.modelSelection === undefined ? {} : { model: candidate.modelSelection }),
    ...testOnlyCommandFor(seams, "grok")
  }),
  agy: (candidate, timeoutMs, seams) => startAgyRelay({
    port: 0,
    timeoutMs,
    model: candidate.modelId,
    thinkingLevels: candidate.thinkingLevels,
    ...testOnlyCommandFor(seams, "agy")
  }),
  pi: (candidate, timeoutMs, seams) => startPiRelay({
    port: 0, timeoutMs, model: candidate.modelId, ...testOnlyCommandFor(seams, "pi")
  })
};

/** A relay serves a candidate only if it IS that model and can run every one of its levels. */
async function startVerifiedRelay(
  candidate: RelayHostCandidate,
  timeoutMs: number,
  seams: RelayHostSeams
): Promise<StartedRelay> {
  const relay = await RELAY_STARTS[candidate.tool](candidate, timeoutMs, seams);
  const refusal = relay.model !== candidate.modelId
    ? "RELAY_HOST_MODEL_MISMATCH"
    : candidate.thinkingLevels.some((level) => !relay.thinkingLevels.includes(level))
      ? "RELAY_HOST_THINKING_LEVEL_UNSUPPORTED"
      : null;
  if (refusal !== null) {
    await relay.close();
    throw new TypeError(refusal);
  }
  return relay;
}

function failureCodeOf(reason: unknown): string {
  return reason instanceof Error && reason.message.trim() !== ""
    ? reason.message
    : "RELAY_HOST_RELAY_START_FAILED";
}

function bearerTokenOf(authorizationHeader: string): string {
  const scheme = "Bearer ";
  if (!authorizationHeader.startsWith(scheme)) throw new TypeError("RELAY_HOST_RELAY_CREDENTIAL_INVALID");
  return authorizationHeader.slice(scheme.length);
}

/** Written whole or not at all: a 0600 temporary file in the same directory, then renamed over. */
async function writeEndpointsFile(path: string, endpoints: readonly RelayHostEndpoint[]): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify({ relays: endpoints }, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx"
    });
    await rename(temporary, path);
  } catch {
    // A18a fix round 2: a cleanup that fails as well must never replace the
    // write's own code.
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new TypeError("RELAY_HOST_ENDPOINTS_WRITE_FAILED");
  }
}

/**
 * Fix round 1: the endpoints file holds live bearers, so it may never land in the
 * tracked tree — a bare `--endpoints e.json` resolves from the cwd, which `pnpm run`
 * makes the engine root. Inside the repository it must sit under a `.local/`
 * directory (git-ignored); outside, anywhere. Fix round 2: the native realpath, so
 * another letter case cannot compare as "outside". A18a fix round 1: the rule now
 * lives in `untracked-path.ts`, shared with the moment tools — the path is judged
 * where the KERNEL puts it (`..` after a link included), a last segment that is a
 * link is refused (the atomic rename would replace it), and every enclosing
 * checkout counts, not only the nearest.
 */
function assertEndpointsPathUntracked(endpointsPath: string, repositoryRoot: string): void {
  if (trackedPathRefusal(endpointsPath, "file", repositoryRoot) !== null) {
    throw new TypeError("RELAY_HOST_ENDPOINTS_PATH_REFUSED");
  }
}

export async function serveRelayHost(options: RelayHostOptions): Promise<RelayHostHandle> {
  assertRelayHostRuntime(options.environment);
  const seams = options.seams ?? {};
  if (seams.repositoryRoot !== undefined && process.env.NODE_ENV !== "test") {
    throw new TypeError("RELAY_HOST_TEST_ONLY_REPOSITORY_ROOT_FORBIDDEN");
  }
  const timeoutMs = options.timeoutMs ?? RELAY_HOST_DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError("RELAY_HOST_TIMEOUT_INVALID");
  const emit = options.emit ?? ((line: string) => { process.stdout.write(`${line}\n`); });
  const repositoryRoot = seams.repositoryRoot ?? RELAY_HOST_ENGINE_ROOT;
  const endpointsPath = options.endpointsPath === undefined
    ? join(resolve(repositoryRoot), RELAY_HOST_DEFAULT_ENDPOINTS_PATH)
    // A18a fix round 1: made absolute WITHOUT folding `..`, so the guard, the
    // writer and the removal all read `..` after a link as the kernel does. Fix
    // round 2: slashes ARE collapsed, and the mkdir, the writer and the removal
    // below use this one string, so a trailing slash can never hide a dangling link.
    : absolutePathOf(options.endpointsPath);
  assertEndpointsPathUntracked(endpointsPath, repositoryRoot);
  const candidates = await readRelayHostCandidates(resolve(options.candidatesPath));
  try {
    await mkdir(dirname(endpointsPath), { recursive: true, mode: 0o700 });
  } catch {
    throw new TypeError("RELAY_HOST_ENDPOINTS_WRITE_FAILED");
  }
  const settled = await Promise.allSettled(candidates.map((candidate) =>
    startVerifiedRelay(candidate, timeoutMs, seams)
  ));
  // Fix round 1: every started relay is known, and closable, BEFORE any line is
  // emitted — an `emit` that throws must not strand a relay it never reported.
  const started = settled.flatMap((outcome, index) =>
    outcome.status === "fulfilled" ? [{ candidate: candidates[index]!, relay: outcome.value }] : []
  );
  const closeAll = async (): Promise<void> => {
    await Promise.allSettled(started.map(({ relay }) => relay.close()));
  };
  let written = false;
  let endpoints: readonly RelayHostEndpoint[];
  try {
    settled.forEach((outcome, index) => {
      if (outcome.status === "rejected") {
        emit(`RELAY ABSENT ${candidates[index]!.providerRef} ${failureCodeOf(outcome.reason)}`);
      }
    });
    if (started.length === 0) throw new TypeError("RELAY_HOST_NO_RELAY_STARTED");
    endpoints = Object.freeze(started.map(({ candidate, relay }) => Object.freeze({
      providerRef: candidate.providerRef,
      maker: relay.maker,
      tool: candidate.tool,
      modelId: relay.model,
      baseUrl: `${relay.baseUrl}/v1`,
      bearerToken: bearerTokenOf(relay.authorizationHeader),
      thinkingLevels: candidate.thinkingLevels,
      contextWindowTokens: relay.contextWindowTokens ?? null
    })));
    await writeEndpointsFile(endpointsPath, endpoints);
    written = true;
    // Pre-flight fix F37: each relay printed its overhead by maker; the host knows
    // which CANDIDATE each relay serves, so it prints the figures once more,
    // attributed to the candidate's providerRef.
    // D8: informational, never a gate — a line that cannot be written is dropped
    // and never fails the start (RELAYS SERVING below keeps its A12 behaviour).
    for (const { candidate, relay } of started) {
      if (relay.harnessOverhead === undefined) continue;
      try {
        emit(harnessOverheadLine(relay.harnessOverhead, candidate.providerRef));
      } catch {
        // Dropped: the figures are information only.
      }
    }
    emit(`RELAYS SERVING ${endpoints.length} ${endpointsPath}`);
  } catch (error) {
    if (written) {
      try {
        await rm(endpointsPath, { force: true });
      } catch {
        // Fix round 2: bearers left on disk are never silent. The line is best
        // effort — the emit may be what failed — and the ORIGINAL error stays the
        // one thrown; the relays are closed either way, so the bearers are dead.
        try {
          emit(`RELAY_HOST_ENDPOINTS_REMOVE_FAILED ${endpointsPath}`);
        } catch {
          // The original error below is still the one the caller sees.
        }
      }
    }
    await closeAll();
    throw error;
  }
  let stopping: Promise<void> | undefined;
  return Object.freeze({
    endpoints,
    stop() {
      stopping ??= (async () => {
        // Fix round 1: the bearers go FIRST, synchronously on the call, before any
        // relay is closed — a shutdown cut short never leaves the file behind.
        let removal: unknown = null;
        try {
          rmSync(endpointsPath, { force: true });
        } catch (error) {
          removal = error;
        }
        await closeAll();
        // A12 review carry-over: the code first, then the path, so the operator
        // can delete the file by hand (the README's promise).
        if (removal !== null) throw new TypeError(`RELAY_HOST_ENDPOINTS_REMOVE_FAILED ${endpointsPath}`);
      })();
      return stopping;
    }
  });
}

/**
 * `--candidates <file> [--endpoints <file>] [--timeout-ms <n>]`; a leading `--` (pnpm) is
 * ignored. Without `--endpoints` the file goes to RELAY_HOST_DEFAULT_ENDPOINTS_PATH.
 */
export function parseRelayHostArguments(argv: readonly string[]): Readonly<{
  candidatesPath: string;
  endpointsPath?: string;
  timeoutMs?: number;
}> {
  const tokens = argv[0] === "--" ? argv.slice(1) : argv;
  const values = new Map<string, string>();
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (flag === undefined || value === undefined || value.startsWith("--") || values.has(flag)
      || !["--candidates", "--endpoints", "--timeout-ms"].includes(flag)) {
      throw new TypeError("RELAY_HOST_ARGUMENTS_INVALID");
    }
    values.set(flag, value);
  }
  const candidatesPath = values.get("--candidates");
  const endpointsPath = values.get("--endpoints");
  const timeoutText = values.get("--timeout-ms");
  if (candidatesPath === undefined
    || (timeoutText !== undefined && !/^[1-9][0-9]{0,8}$/u.test(timeoutText))) {
    throw new TypeError("RELAY_HOST_ARGUMENTS_INVALID");
  }
  return Object.freeze({
    candidatesPath,
    ...(endpointsPath === undefined ? {} : { endpointsPath }),
    ...(timeoutText === undefined ? {} : { timeoutMs: Number(timeoutText) })
  });
}

export async function main(
  argv: readonly string[],
  signals: Pick<NodeJS.EventEmitter, "on" | "off"> = process,
  environment: Readonly<Record<string, string | undefined>> = process.env
): Promise<void> {
  const options = parseRelayHostArguments(argv);
  // Fix round 1: the handlers go in BEFORE the start-up handshakes and stay in
  // until the stop has FINISHED. A signal during start-up still ends in a clean
  // stop, and a second Ctrl-C cannot fall through to the default handler and
  // exit before the endpoints file is deleted.
  let requestStop: () => void = () => undefined;
  const stopRequested = new Promise<void>((resolveStop) => { requestStop = resolveStop; });
  const onSignal = (): void => { requestStop(); };
  signals.on("SIGTERM", onSignal);
  signals.on("SIGINT", onSignal);
  try {
    const host = await serveRelayHost({ ...options, environment });
    await stopRequested;
    await host.stop();
  } finally {
    signals.off("SIGTERM", onSignal);
    signals.off("SIGINT", onSignal);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "RELAY_HOST_FAILED"}\n`);
    process.exitCode = 1;
  });
}
