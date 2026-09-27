import { z } from "zod";
import {
  CliRelayFailure,
  buildCliUsage,
  invokeCli,
  isRelayHandshakeReply,
  resolveConfiguredBinary,
  resolveTestGuardedCommand,
  startCliRelayServer,
  type CliCompletion,
  type CliInvocation,
  type CliRelayAdapter,
  type CliRelayHandle,
  type CommandSpec
} from "./relay-core.js";

/**
 * Model scorecard §2.10 (owner ruling, 2026-09-26): the Google maker, through
 * the owner's `agy` subscription CLI (1.2.11).
 *
 * Measured once (M4, 2026-09-26, owner-authorised, redacted captures):
 * `agy … --output-format json` prints ONE JSON object — conversation_id,
 * status ("SUCCESS"), response, duration_seconds, num_turns, usage
 * {input_tokens, output_tokens, thinking_tokens, cache_read_tokens,
 * total_tokens} and, only when a tool was attempted, denied_actions.
 *
 * LINEAGE. agy does not report the answering model. The relay pins it with
 * `--model <base>-<level>` and reports the pinned BASE id as the lineage — the
 * pinned-constant precedent of the Support GLM relay, named in the interface
 * contract. The level is the id's suffix and travels as `x_thinking_level`.
 *
 * TOOLS. agy has no tools-off flag. With `--mode plan --sandbox` and no
 * permission-skipping flag at all, a tool request in print mode is
 * auto-denied (measured: denied_actions [{action:"command"}], response "", no
 * file written). A non-empty denied_actions is a FAILED call, never an answer.
 *
 * PROMPT. Never argv (§2.10): stdin, in the form AGY_STDIN_FORMAT names.
 */

/** The NAME this maker's CLI is looked up by; never a path (D10, 2026-09-17). */
export const AGY_BINARY_NAME = "agy" as const;
/** D10 host override for {@link AGY_BINARY_NAME}. Unset ⇒ this host's own `agy`, deduced from PATH. */
export const ACCEPTANCE_AGY_BINARY = "ACCEPTANCE_AGY_BINARY" as const;
const AGY_BINARY_UNRESOLVED = "AGY_CLI_BINARY_UNRESOLVED" as const;

export function resolveAgyBinary(source: NodeJS.ProcessEnv = process.env): string {
  return resolveConfiguredBinary(AGY_BINARY_NAME, ACCEPTANCE_AGY_BINARY, AGY_BINARY_UNRESOLVED, source);
}

export const GOOGLE_MAKER = "Google" as const;
export const AGY_HANDSHAKE_PROMPT =
  "AGY-01 acceptance transport handshake. Reply with the single word: OK" as const;

/**
 * Fix round 1: the handshake READS the reply. Until the owner's Step 0
 * measurement settles the stdin form, the silent failure is an agy that never
 * reads stdin, runs on an EMPTY prompt and still says SUCCESS with some generic
 * text. Every served call would then answer 200 with text that does not answer
 * its prompt — a transport fault the scorecard would blame on the model. Only
 * an agy that actually read the handshake prompt replies "ok", so anything else
 * stops the relay before it serves (AGY_CLI_HANDSHAKE_MISMATCH). The rule is the
 * shared one in relay-core (Task A11), which the pi relay applies too.
 */
export function isAgyHandshakeReply(content: string): boolean {
  return isRelayHandshakeReply(content);
}

/** `agy models` 1.2.11 (M4): the thinking level is the id's suffix, one of these three. */
export const AGY_MODEL_LEVEL_SUFFIXES = Object.freeze(["low", "medium", "high"] as const);
/** The base id the development panel pins (plan choice; the owner may pin another). */
export const AGY_DEFAULT_MODEL = "gemini-3.8-flash" as const;
/** The level an unasked call runs at; always explicit, so the id that ran is KNOWN. */
export const AGY_DEFAULT_THINKING_LEVEL = "high" as const;
const AGY_MODEL_PIN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export type AgyStdinFormat = "text" | "stream-json";
/**
 * Which stdin form this host's agy takes — set ONCE from the owner-run
 * measurement (Task A10 Step 0), never guessed:
 * - "text": the transcript is written to stdin as plain text and stdin is
 *   closed; the output is the measured single JSON object;
 * - "stream-json": `--input-format stream-json --output-format stream-json`,
 *   one NDJSON user message in, NDJSON out, the answer being the last line
 *   that carries `status` and `response`.
 */
export const AGY_STDIN_FORMAT: AgyStdinFormat = "text";

const agyUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  thinking_tokens: z.number().int().nonnegative().optional(),
  total_tokens: z.number().int().nonnegative().optional()
}).passthrough();

const agyResultSchema = z.object({
  status: z.string().trim().min(1),
  response: z.string(),
  usage: z.unknown().optional(),
  denied_actions: z.array(z.unknown()).optional()
}).passthrough();

/** One call's argument vector. The prompt is NOT in it (§2.10). */
export function agyArguments(modelWithLevel: string, format: AgyStdinFormat): readonly string[] {
  return Object.freeze([
    "--output-format", format === "text" ? "json" : "stream-json",
    ...(format === "text" ? [] : ["--input-format", "stream-json"]),
    "--mode", "plan",
    "--sandbox",
    "--model", modelWithLevel,
    "--print"
  ]);
}

/** What is written to agy's stdin; the stream-json message shape is the one Step 0 measured. */
export function agyStdinPayload(prompt: string, format: AgyStdinFormat): string {
  return format === "text"
    ? prompt
    : `${JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: prompt }] } })}\n`;
}

function decodeAgyResult(stdout: string, format: AgyStdinFormat): unknown {
  if (format === "text") {
    try {
      return JSON.parse(stdout) as unknown;
    } catch {
      throw new CliRelayFailure("FAILED", "AGY_CLI_OUTPUT_INVALID");
    }
  }
  const lines = stdout.split(/\r?\n/u).filter((line) => line.trim() !== "").map((line) => {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      throw new CliRelayFailure("FAILED", "AGY_CLI_OUTPUT_INVALID");
    }
  });
  const results = lines.filter((line) => typeof line === "object" && line !== null && !Array.isArray(line)
    && "status" in line && "response" in line);
  if (results.length === 0) throw new CliRelayFailure("FAILED", "AGY_CLI_OUTPUT_INVALID");
  return results[results.length - 1];
}

/** Throws CliRelayFailure instead of inventing content; the lineage is the pinned base id. */
export function parseAgyOutput(stdout: string, pinnedModel: string, format: AgyStdinFormat): CliCompletion {
  const result = agyResultSchema.safeParse(decodeAgyResult(stdout, format));
  if (!result.success) throw new CliRelayFailure("FAILED", "AGY_CLI_OUTPUT_INVALID");
  // Checked FIRST: the measured tool case still said status "SUCCESS".
  if ((result.data.denied_actions?.length ?? 0) > 0) {
    throw new CliRelayFailure("FAILED", "AGY_CLI_TOOL_DENIED");
  }
  if (result.data.status !== "SUCCESS") throw new CliRelayFailure("FAILED", "AGY_CLI_FAILED");
  const content = result.data.response.trim();
  if (content.length === 0) throw new CliRelayFailure("FAILED", "AGY_CLI_OUTPUT_INVALID");
  // Lenient: an unreadable usage block is "not reported", never a refused answer.
  // output_tokens INCLUDES the thinking tokens (measured 437 = 436 + 1).
  const usage = agyUsageSchema.safeParse(result.data.usage);
  return Object.freeze({
    content,
    model: pinnedModel,
    usage: usage.success
      ? buildCliUsage({
        promptTokens: usage.data.input_tokens,
        completionTokens: usage.data.output_tokens,
        totalTokens: usage.data.total_tokens,
        reasoningTokens: usage.data.thinking_tokens
      })
      : null
  });
}

function createAgyAdapter(
  model: string,
  thinkingLevels: readonly string[],
  defaultThinkingLevel: string
): CliRelayAdapter {
  return Object.freeze({
    maker: GOOGLE_MAKER,
    // Non-secret login locators only. NO API-key variable is admitted: an
    // exported GEMINI_API_KEY or GOOGLE_API_KEY could move a SUBSCRIPTION call
    // onto paid API billing. agy's own sign-in lives under HOME (a common key).
    authEnvironmentKeys: Object.freeze(["USER", "LOGNAME"]),
    testEnvironmentKeys: Object.freeze(["FAKE_AGY_ALWAYS_FAIL", "FAKE_AGY_IGNORE_STDIN"]),
    failureCode: "AGY_CLI_FAILED",
    timeoutCode: "AGY_CLI_TIMEOUT",
    promptTransport: "stdin" as const,
    stdinPayload: (prompt: string) => agyStdinPayload(prompt, AGY_STDIN_FORMAT),
    thinkingLevels,
    defaultThinkingLevel,
    buildArguments: (_prompt: string, invocation?: CliInvocation) =>
      agyArguments(`${model}-${invocation?.thinkingLevel ?? defaultThinkingLevel}`, AGY_STDIN_FORMAT),
    parseCompletion: (stdout: string) => parseAgyOutput(stdout, model, AGY_STDIN_FORMAT)
  });
}

export interface AgyRelayOptions {
  readonly port: number;
  readonly timeoutMs: number;
  /** Test-only process seam. Rejected outside NODE_ENV=test (DR-115). */
  readonly testOnlyCommand?: CommandSpec;
  /** The BASE model id, without a level suffix; defaults to AGY_DEFAULT_MODEL. */
  readonly model?: string;
  /** The id suffixes this relay may run; defaults to all of AGY_MODEL_LEVEL_SUFFIXES. */
  readonly thinkingLevels?: readonly string[];
  /** Defaults to AGY_DEFAULT_THINKING_LEVEL when declared, else the first declared level. */
  readonly defaultThinkingLevel?: string;
}

export interface AgyRelayHandle extends CliRelayHandle {
  /** The pinned BASE id — agy reports none (see the module note). */
  readonly model: string;
  readonly maker: typeof GOOGLE_MAKER;
  readonly thinkingLevels: readonly string[];
}

export async function startAgyRelay(options: AgyRelayOptions): Promise<AgyRelayHandle> {
  const model = options.model ?? AGY_DEFAULT_MODEL;
  // Fix round 1: the suffix check ignores case, so `…-High` cannot slip past it.
  if (!AGY_MODEL_PIN_PATTERN.test(model)
    || AGY_MODEL_LEVEL_SUFFIXES.some((suffix) => model.toLowerCase().endsWith(`-${suffix}`))) {
    throw new CliRelayFailure("FAILED", "AGY_CLI_MODEL_PIN_INVALID");
  }
  const thinkingLevels = Object.freeze([...(options.thinkingLevels ?? AGY_MODEL_LEVEL_SUFFIXES)]);
  const defaultThinkingLevel = options.defaultThinkingLevel
    ?? (thinkingLevels.includes(AGY_DEFAULT_THINKING_LEVEL) ? AGY_DEFAULT_THINKING_LEVEL : thinkingLevels[0]);
  if (thinkingLevels.length === 0
    || new Set(thinkingLevels).size !== thinkingLevels.length
    || thinkingLevels.some((level) => !(AGY_MODEL_LEVEL_SUFFIXES as readonly string[]).includes(level))
    || defaultThinkingLevel === undefined
    || !thinkingLevels.includes(defaultThinkingLevel)) {
    throw new CliRelayFailure("FAILED", "AGY_CLI_THINKING_LEVELS_INVALID");
  }
  const command = resolveTestGuardedCommand(
    () => ({ binary: resolveAgyBinary(), prefixArguments: [] }),
    options.testOnlyCommand,
    "TEST_ONLY_AGY_COMMAND_FORBIDDEN"
  );
  const adapter = createAgyAdapter(model, thinkingLevels, defaultThinkingLevel);
  // The handshake IS the sign-in check: agy 1.2.11 has no auth-status command.
  // It is also the stdin check: the reply must be the "ok" the prompt asked for.
  const handshake = await invokeCli(command, adapter, AGY_HANDSHAKE_PROMPT, options.timeoutMs);
  if (!isAgyHandshakeReply(handshake.content)) {
    throw new CliRelayFailure("FAILED", "AGY_CLI_HANDSHAKE_MISMATCH");
  }
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
    model,
    maker: GOOGLE_MAKER,
    thinkingLevels,
    close: () => server.close()
  });
}
