import { z } from "zod";
import {
  CliRelayFailure,
  invokeCli,
  resolveConfiguredBinary,
  resolveTestGuardedCommand,
  startCliRelayServer,
  type CliCompletion,
  type CliRelayAdapter,
  type CliRelayHandle,
  type CommandSpec
} from "./relay-core.js";

/**
 * FAIR-02 (DR-140): the SECOND real maker — an OpenAI-compatible relay to the
 * local Claude Code CLI, maker Anthropic.
 *
 * Empirically verified on this machine (2026-08-10, claude 2.1.221 — at the
 * compiled-in absolute path this module carried until 2026-09-17; discovery by
 * name did not exist on that date and this record makes no claim about it):
 * `claude -p <prompt> --output-format json` prints exactly one
 * JSON envelope on stdout with `is_error`, `result` (the reply text) and
 * `modelUsage` keyed by the model id the CLI actually used, and exits nonzero
 * on failure (observed: expired OAuth => exit 1, is_error true). The prompt
 * travels as an argument and stdin stays closed; there is no prompt echo in
 * JSON mode. The relayed model id is ALWAYS the CLI-reported one — never a
 * guessed literal, never "shim" (DR-115 lineage honesty). Modern Claude Code
 * can report helper-model usage alongside the requested model; in that case
 * exactly one reported lineage must match the requested model family.
 */
/** The NAME this maker's CLI is looked up by; never a path (D10, 2026-09-17). */
export const CLAUDE_BINARY_NAME = "claude" as const;
/**
 * D10 host override for {@link CLAUDE_BINARY_NAME}. Unset ⇒ this host's own
 * `claude`, deduced from PATH. See `relay-core.ts` for the order and for the
 * refusal vocabulary a resolved file is held to.
 */
const CLAUDE_BINARY_ENV_KEY = "ACCEPTANCE_CLAUDE_BINARY" as const;
const CLAUDE_BINARY_UNRESOLVED = "CLAUDE_CLI_BINARY_UNRESOLVED" as const;

export function resolveClaudeBinary(source: NodeJS.ProcessEnv = process.env): string {
  return resolveConfiguredBinary(
    CLAUDE_BINARY_NAME,
    CLAUDE_BINARY_ENV_KEY,
    CLAUDE_BINARY_UNRESOLVED,
    source
  );
}
export const ANTHROPIC_MAKER = "Anthropic" as const;
/**
 * The model ALIAS asked of the CLI. Passing none inherits the CLI's default,
 * which on 2026-08-11 was Fable 5 and returned api_error 429 "You've reached
 * your Fable 5 limit" — a quota wall, not a defect, that stops the whole
 * ceremony (DR-143(3)). Opus 5 follows V's existing WORKER CONTINUITY OVERRIDE
 * precedent for Fable exhaustion; Sonnet 5 was also verified available.
 *
 * This is an ALIAS REQUEST, not a lineage claim: the recorded maker model is
 * still only ever the id the CLI itself reports back in `modelUsage`
 * (DR-115). Which house model plays the Anthropic maker is a roster value —
 * ORCHESTRATOR-CHOSEN ON PRECEDENT, PENDING V'S RATIFICATION.
 */
export const CLAUDE_MODEL_ALIAS = "opus" as const;
export const CLAUDE_HANDSHAKE_PROMPT =
  "FAIR-02 acceptance transport handshake. Reply with the single word: OK" as const;
/**
 * D18: the ONLY setting source the relay loads. The CLI cannot see its own
 * keychain login without it (measured; see buildArguments). Deliberately not
 * "user,project,local" — project and local remain excluded.
 */
export const CLAUDE_SETTING_SOURCES = "user" as const;

const envelopeSchema = z.object({
  is_error: z.boolean(),
  result: z.string(),
  total_cost_usd: z.number().nonnegative().optional(),
  modelUsage: z.record(z.string(), z.unknown())
}).passthrough();

const observedTokenUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  canonicalModel: z.string().trim().min(1).optional()
}).passthrough();

const CLAUDE_MODEL_ALIAS_PATTERN = /^[a-z0-9]+$/u;
const CLAUDE_MODEL_ID_PATTERN = /^claude-[a-z0-9.-]+$/u;

type ClaudeModelRequest =
  | Readonly<{ kind: "alias"; value: string }>
  | Readonly<{ kind: "model"; value: string }>;

function matchesRequestedModel(model: string, usage: unknown, request: ClaudeModelRequest): boolean {
  const observed = observedTokenUsageSchema.safeParse(usage);
  const identities = [model, ...(observed.success && observed.data.canonicalModel !== undefined
    ? [observed.data.canonicalModel]
    : [])];
  if (request.kind === "model") {
    return identities.some((identity) => identity === request.value);
  }
  return identities.some((identity) => identity.toLocaleLowerCase("en-US")
    .split(/[^a-z0-9]+/u)
    .includes(request.value));
}

function resolveClaudeModel(
  modelUsage: Readonly<Record<string, unknown>>,
  request: ClaudeModelRequest
): string {
  const entries = Object.entries(modelUsage);
  if (entries.length === 1) return entries[0]![0];
  const requested = entries.filter(([model, usage]) => matchesRequestedModel(model, usage, request));
  if (requested.length === 1) return requested[0]![0];
  throw new CliRelayFailure("FAILED", "CLAUDE_CLI_MODEL_UNRESOLVED");
}

function parseClaudeEnvelope(stdout: string, request: ClaudeModelRequest) {
  let decoded: unknown;
  try {
    decoded = JSON.parse(stdout);
  } catch {
    throw new CliRelayFailure("FAILED", "CLAUDE_CLI_OUTPUT_INVALID");
  }
  const envelope = envelopeSchema.safeParse(decoded);
  if (!envelope.success) throw new CliRelayFailure("FAILED", "CLAUDE_CLI_OUTPUT_INVALID");
  if (envelope.data.is_error !== false) throw new CliRelayFailure("FAILED", "CLAUDE_CLI_FAILED");
  const content = envelope.data.result.trim();
  if (content.length === 0) throw new CliRelayFailure("FAILED", "CLAUDE_CLI_OUTPUT_INVALID");
  const model = resolveClaudeModel(envelope.data.modelUsage, request);
  const observed = observedTokenUsageSchema.safeParse(envelope.data.modelUsage[model]);
  const inputTokens = observed.success
    ? observed.data.input_tokens ?? observed.data.inputTokens
    : undefined;
  const outputTokens = observed.success
    ? observed.data.output_tokens ?? observed.data.outputTokens
    : undefined;
  const costUsd = envelope.data.total_cost_usd;
  const usage = {
    ...(inputTokens === undefined ? {} : { promptTokens: inputTokens }),
    ...(outputTokens === undefined ? {} : { completionTokens: outputTokens }),
    ...(inputTokens === undefined || outputTokens === undefined
      ? {}
      : { totalTokens: inputTokens + outputTokens }),
    ...(costUsd === undefined ? {} : { costUsd })
  };
  return Object.freeze({
    content,
    model,
    usage: Object.keys(usage).length === 0 ? null : Object.freeze(usage)
  });
}

function createClaudeAdapter(request: ClaudeModelRequest): CliRelayAdapter {
  const valid = request.kind === "model"
    ? CLAUDE_MODEL_ID_PATTERN.test(request.value)
    : CLAUDE_MODEL_ALIAS_PATTERN.test(request.value);
  if (!valid) {
    throw new CliRelayFailure(
      "FAILED",
      request.kind === "model" ? "CLAUDE_CLI_MODEL_INVALID" : "CLAUDE_CLI_MODEL_ALIAS_INVALID"
    );
  }
  return {
  maker: ANTHROPIC_MAKER,
  // Claude Code's macOS credential lookup is keyed by the login identity.
  // USER/LOGNAME are non-secret locators; without them an authenticated CLI
  // becomes "Not logged in" inside the relay's otherwise-empty environment.
  authEnvironmentKeys: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "USER", "LOGNAME"],
  testEnvironmentKeys: [
    "FAKE_CLAUDE_ALWAYS_FAIL",
    "FAKE_CLAUDE_COST_ABSENT",
    "FAKE_CLAUDE_MODEL_USAGE_NON_OBJECT"
  ],
  failureCode: "CLAUDE_CLI_FAILED",
  timeoutCode: "CLAUDE_CLI_TIMEOUT",
  // --no-session-persistence: relay calls must not accrete resumable sessions;
  // --tools "": the relay is a pure completion transport, no agentic tools.
  //
  // D18: --setting-sources is "user", NOT "". Measured on claude 2.1.247
  // (logs/trel2/probe-02..04, full production argument vector, sanitized env):
  //   ""              -> `Not logged in · Please run /login`, is_error true, $0
  //   "user"          -> normal answer, exactly one reported model, $0.032
  //   "project,local" -> `Not logged in` again
  // The CLI's login is carried by the USER source and by nothing else, so
  // "user" is the narrowest SOURCE LIST that lets an authenticated CLI see its
  // own keychain login. Project and local settings stay excluded.
  //
  // --safe-mode carries the isolation that "" used to provide, without the
  // auth cost. Loading the user source alone would also load user MEMORY: with
  // `--setting-sources user` the model answered YES to "do your instructions
  // include user-level memory loaded from a CLAUDE.md file?" (probe-05, 5423
  // context tokens); adding --safe-mode it answered NO (probe-06, 2717 tokens)
  // and still authenticated with exactly one reported model. The installed
  // binary sets CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 for this flag and its
  // customization-disable map carries `claudeMd:true, hooks:true, plugins:true`.
  //
  // Both are needed: --setting-sources user narrows WHICH SCOPES load,
  // --safe-mode disables the CUSTOMIZATIONS within them. Neither alone is
  // sufficient — dropping either is caught by a test.
  buildArguments: (prompt) => [
    "-p", prompt,
    "--output-format", "json",
    "--setting-sources", CLAUDE_SETTING_SOURCES,
    "--safe-mode",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--tools", "",
    "--model", request.value
  ],
  parseCompletion: (stdout) => parseClaudeEnvelope(stdout, request)
  };
}

export interface ClaudeRelayOptions {
  readonly port: number;
  readonly timeoutMs: number;
  /** Test-only process seam. It is rejected outside NODE_ENV=test and is never read from acceptance config. */
  readonly testOnlyCommand?: CommandSpec;
  /** The full model id asked of the CLI (`--model`); takes precedence over modelAlias. */
  readonly model?: string;
  /** The alias asked of the CLI (`--model`); defaults to CLAUDE_MODEL_ALIAS. Lineage stays CLI-reported. */
  readonly modelAlias?: string;
}

export interface ClaudeRelayHandle extends CliRelayHandle {
  /** The model id the CLI itself reported during the startup handshake. */
  readonly model: string;
  readonly maker: typeof ANTHROPIC_MAKER;
}

export interface ClaudePreflightOptions {
  readonly timeoutMs: number;
  /** Test-only process seam. Rejected outside NODE_ENV=test (DR-115). */
  readonly testOnlyCommand?: CommandSpec;
  /** The full model id asked of the CLI; takes precedence over modelAlias. */
  readonly model?: string;
  /** The alias asked of the CLI; defaults to CLAUDE_MODEL_ALIAS. */
  readonly modelAlias?: string;
}

export interface ClaudePreflightResult {
  /** The exact command a relayed call would spawn. */
  readonly command: CommandSpec;
  /** The exact adapter used by the handshake and every served call. */
  readonly adapter: CliRelayAdapter;
  /** The CLI's own handshake completion, parsed by the relay's own adapter. */
  readonly handshake: CliCompletion;
}

/**
 * F26: the ceremony preflight IS the relay's own first call, not a
 * hand-written imitation of it. The preflight resolves the same binary
 * (TREL's ACCEPTANCE_CLAUDE_BINARY override included), builds the same
 * arguments through the same adapter, and gets the same allowlisted child
 * environment, because it goes through invokeCli exactly as a relayed call
 * does. startClaudeRelay calls this function for its own handshake, so the
 * two cannot drift.
 *
 * This exists because they drifted three times: PATH vs a hardcoded absolute
 * path, the parent environment vs the child allowlist, and bare arguments vs
 * `--setting-sources ""`. Each time an operator preflight passed minutes
 * before the relay failed on the same binary.
 */
export async function preflightClaudeCli(
  options: ClaudePreflightOptions
): Promise<ClaudePreflightResult> {
  const command = resolveTestGuardedCommand(
    () => ({ binary: resolveClaudeBinary(), prefixArguments: [] }),
    options.testOnlyCommand,
    "TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN"
  );
  const request: ClaudeModelRequest = options.model === undefined
    ? { kind: "alias", value: options.modelAlias ?? CLAUDE_MODEL_ALIAS }
    : { kind: "model", value: options.model };
  const adapter = createClaudeAdapter(request);
  const handshake = await invokeCli(
    command,
    adapter,
    CLAUDE_HANDSHAKE_PROMPT,
    options.timeoutMs
  );
  return Object.freeze({ command, adapter, handshake });
}

/**
 * Starts the Anthropic relay AFTER a real CLI handshake call. The handshake
 * proves the CLI is alive and captures the CLI-reported model id for lineage
 * (gateway construction needs an honest model BEFORE the first relayed call).
 * A dead or unauthenticated CLI refuses to start — loud, never a dead maker
 * silently serving (DR-115).
 */
export async function startClaudeRelay(options: ClaudeRelayOptions): Promise<ClaudeRelayHandle> {
  const { command, adapter, handshake } = await preflightClaudeCli({
    timeoutMs: options.timeoutMs,
    ...(options.testOnlyCommand === undefined ? {} : { testOnlyCommand: options.testOnlyCommand }),
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.modelAlias === undefined ? {} : { modelAlias: options.modelAlias })
  });
  const server = await startCliRelayServer({
    port: options.port,
    timeoutMs: options.timeoutMs,
    command,
    adapter
  });
  return Object.freeze({
    port: server.port,
    baseUrl: server.baseUrl,
    authorizationHeader: server.authorizationHeader,
    model: handshake.model,
    maker: ANTHROPIC_MAKER,
    close: () => server.close()
  });
}
