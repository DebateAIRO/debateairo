import { z } from "zod";
import {
  CliRelayFailure,
  RELAY_MINIMAL_SYSTEM_PROMPT,
  invokeCli,
  openRelayWorkspace,
  reportHarnessOverhead,
  resolveConfiguredBinary,
  resolveTestGuardedCommand,
  startCliRelayServer,
  type CliCompletion,
  type CliFailureEvidence,
  type CliInvocation,
  type CliRelayAdapter,
  type CliRelayHandle,
  type CommandSpec,
  type HarnessOverhead,
  type RelayWorkspace
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
/** §2.2 — `claude --help` 2.1.282 (M4, 2026-09-26): `--effort low|medium|high|xhigh|max`. */
export const CLAUDE_THINKING_LEVELS = Object.freeze(["low", "medium", "high", "xhigh", "max"] as const);
/**
 * R4 — the ONE usage-cap signature on record for this CLI: 2026-08-11, the
 * default model answered `is_error: true` with "You've reached your Fable 5
 * limit" (api_error 429), see CLAUDE_MODEL_ALIAS above. Only that wording is a
 * cap; every other failure stays CLAUDE_CLI_FAILED, which the gateway retries
 * and the runner's backup absorbs after the normal retries. A new wording is
 * added only from a redacted real capture.
 */
export const CLAUDE_USAGE_CAP_PATTERN = /\byou(?:'|’)ve reached your\b[^\n]{0,80}?\blimit\b/iu;
export const CLAUDE_CLI_USAGE_CAP = "CLAUDE_CLI_USAGE_CAP" as const;

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
  // D8: Claude Code counts cached input APART from inputTokens (M5: 2 input +
  // 685 cache-creation on a lean one-line call). Read for the harness-overhead
  // line only; usage.promptTokens keeps its meaning.
  cacheCreationInputTokens: z.number().int().nonnegative().optional(),
  cacheReadInputTokens: z.number().int().nonnegative().optional(),
  cache_creation_input_tokens: z.number().int().nonnegative().optional(),
  cache_read_input_tokens: z.number().int().nonnegative().optional(),
  canonicalModel: z.string().trim().min(1).optional()
}).passthrough();

const CLAUDE_MODEL_ALIAS_PATTERN = /^[a-z0-9]+$/u;

function matchesRequestedModelFamily(model: string, usage: unknown, alias: string): boolean {
  const observed = observedTokenUsageSchema.safeParse(usage);
  const identities = [model, ...(observed.success && observed.data.canonicalModel !== undefined
    ? [observed.data.canonicalModel]
    : [])];
  return identities.some((identity) => identity.toLocaleLowerCase("en-US")
    .split(/[^a-z0-9]+/u)
    .includes(alias));
}

function resolveClaudeModel(modelUsage: Readonly<Record<string, unknown>>, alias: string): string {
  const entries = Object.entries(modelUsage);
  if (entries.length === 1) return entries[0]![0];
  const requested = entries.filter(([model, usage]) => matchesRequestedModelFamily(model, usage, alias));
  if (requested.length === 1) return requested[0]![0];
  throw new CliRelayFailure("FAILED", "CLAUDE_CLI_MODEL_UNRESOLVED");
}

function parseClaudeEnvelope(stdout: string, alias: string) {
  let decoded: unknown;
  try {
    decoded = JSON.parse(stdout);
  } catch {
    throw new CliRelayFailure("FAILED", "CLAUDE_CLI_OUTPUT_INVALID");
  }
  const envelope = envelopeSchema.safeParse(decoded);
  if (!envelope.success) throw new CliRelayFailure("FAILED", "CLAUDE_CLI_OUTPUT_INVALID");
  if (envelope.data.is_error !== false) {
    throw CLAUDE_USAGE_CAP_PATTERN.test(envelope.data.result)
      ? new CliRelayFailure("USAGE_CAP", CLAUDE_CLI_USAGE_CAP)
      : new CliRelayFailure("FAILED", "CLAUDE_CLI_FAILED");
  }
  const content = envelope.data.result.trim();
  if (content.length === 0) throw new CliRelayFailure("FAILED", "CLAUDE_CLI_OUTPUT_INVALID");
  const model = resolveClaudeModel(envelope.data.modelUsage, alias);
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
  const cacheTokens = observed.success
    ? [
      observed.data.cacheCreationInputTokens ?? observed.data.cache_creation_input_tokens,
      observed.data.cacheReadInputTokens ?? observed.data.cache_read_input_tokens
    ].filter((count): count is number => count !== undefined)
    : [];
  return Object.freeze({
    content,
    model,
    usage: Object.keys(usage).length === 0 ? null : Object.freeze(usage),
    // D8: everything the CLI says the model read, cache included.
    ...(inputTokens === undefined || cacheTokens.length === 0
      ? {}
      : { reportedInputTokens: cacheTokens.reduce((sum, count) => sum + count, inputTokens) })
  });
}

/**
 * R4 for a NON-ZERO exit: the recorded cap exited 1 with its envelope on
 * stdout. §2.3: the Claude envelope carries no thinking-token counter (its
 * recorded members are is_error, result, modelUsage and total_cost_usd), so
 * this relay reports none and never guesses one.
 */
function claudeUsageCapCode(evidence: CliFailureEvidence): string | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(evidence.stdout);
  } catch {
    return null;
  }
  const envelope = envelopeSchema.safeParse(decoded);
  return envelope.success && envelope.data.is_error === true
    && CLAUDE_USAGE_CAP_PATTERN.test(envelope.data.result)
    ? CLAUDE_CLI_USAGE_CAP
    : null;
}

function createClaudeAdapter(alias: string): CliRelayAdapter {
  if (!CLAUDE_MODEL_ALIAS_PATTERN.test(alias)) {
    throw new CliRelayFailure("FAILED", "CLAUDE_CLI_MODEL_ALIAS_INVALID");
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
  thinkingLevels: CLAUDE_THINKING_LEVELS,
  classifyUsageCap: claudeUsageCapCode,
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
  // §2.2: `--effort` is APPENDED only when a level was asked, so an unasked
  // call carries no level flag at all.
  //
  // D8 (lean calls, M5): `--system-prompt` REPLACES Claude Code's own large
  // system prompt with the relay's one fixed sentence (a lean call measured
  // ~687 input tokens). `--bare` would strip more, but it also disables the
  // OAuth/keychain login, so a subscription could not sign in: never pass it.
  buildArguments: (prompt: string, invocation?: CliInvocation) => [
    "-p", prompt,
    "--output-format", "json",
    "--system-prompt", RELAY_MINIMAL_SYSTEM_PROMPT,
    "--setting-sources", CLAUDE_SETTING_SOURCES,
    "--safe-mode",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--tools", "",
    "--model", alias,
    ...(invocation?.thinkingLevel === undefined ? [] : ["--effort", invocation.thinkingLevel])
  ],
  parseCompletion: (stdout) => parseClaudeEnvelope(stdout, alias)
  };
}

export interface ClaudeRelayOptions {
  readonly port: number;
  readonly timeoutMs: number;
  /** Test-only process seam. It is rejected outside NODE_ENV=test and is never read from acceptance config. */
  readonly testOnlyCommand?: CommandSpec;
  /** The alias asked of the CLI (`--model`); defaults to CLAUDE_MODEL_ALIAS. Lineage stays CLI-reported. */
  readonly modelAlias?: string;
}

export interface ClaudeRelayHandle extends CliRelayHandle {
  /** The model id the CLI itself reported during the startup handshake. */
  readonly model: string;
  readonly maker: typeof ANTHROPIC_MAKER;
  /** §2.2: the `--effort` values this relay accepts as `x_thinking_level`. */
  readonly thinkingLevels: readonly string[];
  /** D8: what Claude Code added around the handshake prompt. Informational only. */
  readonly harnessOverhead: HarnessOverhead;
}

export interface ClaudePreflightOptions {
  readonly timeoutMs: number;
  /** Test-only process seam. Rejected outside NODE_ENV=test (DR-115). */
  readonly testOnlyCommand?: CommandSpec;
  /** Use the same requested model for the handshake and served calls. */
  readonly modelAlias?: string;
  /**
   * D8: the relay's own workspace, lent for its handshake. Absent (the
   * ceremony's standalone preflight) ⇒ a private one is opened and removed here.
   */
  readonly workspace?: RelayWorkspace;
}

export interface ClaudePreflightResult {
  /** The exact command a relayed call would spawn. */
  readonly command: CommandSpec;
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
  const adapter = createClaudeAdapter(options.modelAlias ?? CLAUDE_MODEL_ALIAS);
  // D8: the handshake runs exactly where served calls run.
  const workspace = options.workspace ?? await openRelayWorkspace(adapter);
  try {
    const handshake = await invokeCli(command, adapter, CLAUDE_HANDSHAKE_PROMPT, options.timeoutMs, { workspace });
    return Object.freeze({ command, handshake });
  } finally {
    if (options.workspace === undefined) await workspace.close();
  }
}

/**
 * Starts the Anthropic relay AFTER a real CLI handshake call. The handshake
 * proves the CLI is alive and captures the CLI-reported model id for lineage
 * (gateway construction needs an honest model BEFORE the first relayed call).
 * A dead or unauthenticated CLI refuses to start — loud, never a dead maker
 * silently serving (DR-115).
 */
export async function startClaudeRelay(options: ClaudeRelayOptions): Promise<ClaudeRelayHandle> {
  const claudeAdapter = createClaudeAdapter(options.modelAlias ?? CLAUDE_MODEL_ALIAS);
  // D8: ONE private workspace for this relay's whole life, the handshake
  // included; the server removes it at close().
  const workspace = await openRelayWorkspace(claudeAdapter);
  try {
    const { command, handshake } = await preflightClaudeCli({
      timeoutMs: options.timeoutMs,
      workspace,
      ...(options.modelAlias === undefined ? {} : { modelAlias: options.modelAlias }),
      ...(options.testOnlyCommand === undefined ? {} : { testOnlyCommand: options.testOnlyCommand })
    });
    const harnessOverhead = reportHarnessOverhead(ANTHROPIC_MAKER, CLAUDE_HANDSHAKE_PROMPT, handshake);
    const server = await startCliRelayServer({
      port: options.port,
      timeoutMs: options.timeoutMs,
      command,
      adapter: claudeAdapter,
      workspace
    });
    return Object.freeze({
      port: server.port,
      baseUrl: server.baseUrl,
      authorizationHeader: server.authorizationHeader,
      model: handshake.model,
      maker: ANTHROPIC_MAKER,
      thinkingLevels: CLAUDE_THINKING_LEVELS,
      harnessOverhead,
      close: () => server.close()
    });
  } catch (error) {
    await workspace.close();
    throw error;
  }
}
