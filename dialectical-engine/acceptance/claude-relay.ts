import { z } from "zod";
import {
  CliRelayFailure,
  invokeCli,
  resolveTestGuardedCommand,
  startCliRelayServer,
  type CliRelayAdapter,
  type CliRelayHandle,
  type CommandSpec
} from "./relay-core.js";

/**
 * FAIR-02 (DR-140): the SECOND real maker — an OpenAI-compatible relay to the
 * local Claude Code CLI, maker Anthropic.
 *
 * Empirically verified on this machine (2026-08-10, claude 2.1.221 at
 * CLAUDE_BINARY): `claude -p <prompt> --output-format json` prints exactly one
 * JSON envelope on stdout with `is_error`, `result` (the reply text) and
 * `modelUsage` keyed by the model id the CLI actually used, and exits nonzero
 * on failure (observed: expired OAuth => exit 1, is_error true). The prompt
 * travels as an argument and stdin stays closed; there is no prompt echo in
 * JSON mode. The relayed model id is ALWAYS the CLI-reported one — never a
 * guessed literal, never "shim" (DR-115 lineage honesty). Zero or several
 * reported models is a loud refusal, not a pick.
 */
export const CLAUDE_BINARY = "/Users/vladmihaimiron/.local/bin/claude" as const;
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

const envelopeSchema = z.object({
  is_error: z.boolean(),
  result: z.string(),
  total_cost_usd: z.number().nonnegative().optional(),
  modelUsage: z.record(z.string(), z.unknown())
}).passthrough();

const observedTokenUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional()
}).passthrough();

function parseClaudeEnvelope(stdout: string) {
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
  const reportedModels = Object.keys(envelope.data.modelUsage);
  const model = reportedModels[0];
  if (reportedModels.length !== 1 || model === undefined) {
    throw new CliRelayFailure("FAILED", "CLAUDE_CLI_MODEL_UNRESOLVED");
  }
  const observed = observedTokenUsageSchema.safeParse(envelope.data.modelUsage[model]);
  const inputTokens = observed.success ? observed.data.input_tokens : undefined;
  const outputTokens = observed.success ? observed.data.output_tokens : undefined;
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

const claudeAdapter: CliRelayAdapter = {
  maker: ANTHROPIC_MAKER,
  authEnvironmentKeys: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
  testEnvironmentKeys: [
    "FAKE_CLAUDE_ALWAYS_FAIL",
    "FAKE_CLAUDE_COST_ABSENT",
    "FAKE_CLAUDE_MODEL_USAGE_NON_OBJECT"
  ],
  failureCode: "CLAUDE_CLI_FAILED",
  timeoutCode: "CLAUDE_CLI_TIMEOUT",
  // --no-session-persistence: relay calls must not accrete resumable sessions;
  // --tools "": the relay is a pure completion transport, no agentic tools.
  buildArguments: (prompt) => [
    "-p", prompt,
    "--output-format", "json",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--tools", "",
    "--model", CLAUDE_MODEL_ALIAS
  ],
  parseCompletion: (stdout) => parseClaudeEnvelope(stdout)
};

export interface ClaudeRelayOptions {
  readonly port: number;
  readonly timeoutMs: number;
  /** Test-only process seam. It is rejected outside NODE_ENV=test and is never read from acceptance config. */
  readonly testOnlyCommand?: CommandSpec;
}

export interface ClaudeRelayHandle extends CliRelayHandle {
  /** The model id the CLI itself reported during the startup handshake. */
  readonly model: string;
  readonly maker: typeof ANTHROPIC_MAKER;
}

/**
 * Starts the Anthropic relay AFTER a real CLI handshake call. The handshake
 * proves the CLI is alive and captures the CLI-reported model id for lineage
 * (gateway construction needs an honest model BEFORE the first relayed call).
 * A dead or unauthenticated CLI refuses to start — loud, never a dead maker
 * silently serving (DR-115).
 */
export async function startClaudeRelay(options: ClaudeRelayOptions): Promise<ClaudeRelayHandle> {
  const command = resolveTestGuardedCommand(
    { binary: CLAUDE_BINARY, prefixArguments: [] },
    options.testOnlyCommand,
    "TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN"
  );
  const handshake = await invokeCli(command, claudeAdapter, CLAUDE_HANDSHAKE_PROMPT, options.timeoutMs);
  const server = await startCliRelayServer({
    port: options.port,
    timeoutMs: options.timeoutMs,
    command,
    adapter: claudeAdapter
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
