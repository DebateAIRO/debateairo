import { z } from "zod";
import {
  CliRelayFailure,
  buildCliUsage,
  invokeCli,
  isRelayHandshakeReply,
  renderPromptTranscript,
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
 * Model scorecard §2.10 (owner ruling, 2026-09-26): the Z.AI (GLM) maker in the
 * DEBATE, through the owner's `pi` 0.87.1 and the Z.AI key the owner keeps
 * inside pi. The Support chat's GLM relay is a separate module with its own
 * credential custody; this module never reads a credential file itself.
 *
 * Measured once (M4, 2026-09-26): `pi --mode json` prints NDJSON events and the
 * answer is the ASSISTANT `message_end`: message.content[].text,
 * message.provider ("zai"), message.model ("glm-5.3-flash" for the owner's
 * model, M5; pi's own default answers as "glm-5.3"), message.usage {input,
 * output, cacheRead, cacheWrite, reasoning, totalTokens, cost{…, total}} and
 * message.stopReason ("stop"; "length" is relayed as a truncation, F37).
 *
 * CREDENTIAL. pi reads the Z.AI key it keeps itself (under HOME). The relay
 * never hands `ZAI_API_KEY` to the child (pre-flight ruling F37).
 *
 * PROMPT. Never argv (§2.10): the transcript is an `@file` the shared core
 * writes with mode 0600 and deletes after the call. What IS on argv is fixed
 * engine text only: PI_RELAY_SYSTEM_PROMPT, which replaces pi's own
 * coding-assistant prompt, and PI_ATTACHED_PROMPT_MESSAGE.
 *
 * MODEL. The owner confirmed GLM 5.3 Flash on 2026-09-26 (D1, M5); pi reports
 * `glm-5.3-flash` for it (pi's own default answers as `glm-5.3`). The id is an
 * option defaulting to `glm-5.3-flash`, and every answer is held to it.
 */

/** The NAME this maker's CLI is looked up by; never a path (D10, 2026-09-17). */
export const PI_BINARY_NAME = "pi" as const;
/** D10 host override for {@link PI_BINARY_NAME}. Unset ⇒ this host's own `pi`, deduced from PATH. */
export const ACCEPTANCE_PI_BINARY = "ACCEPTANCE_PI_BINARY" as const;
const PI_BINARY_UNRESOLVED = "PI_CLI_BINARY_UNRESOLVED" as const;

export function resolvePiBinary(source: NodeJS.ProcessEnv = process.env): string {
  return resolveConfiguredBinary(PI_BINARY_NAME, ACCEPTANCE_PI_BINARY, PI_BINARY_UNRESOLVED, source);
}

/** One maker family with the Support GLM relay: fairness counts them as ONE maker. */
export const ZAI_MAKER = "Z.AI" as const;
/** pi's provider name for Z.AI, as pi itself reports it (M4: message.provider). */
export const PI_ZAI_PROVIDER = "zai" as const;
/** R9 / D1: the owner's model, confirmed 2026-09-26 — the id pi reports for it (M5). */
export const PI_DEFAULT_MODEL = "glm-5.3-flash" as const;
/** `pi --help` 0.87.1: `--thinking` off|minimal|low|medium|high|xhigh|max. */
export const PI_THINKING_LEVELS = Object.freeze(
  ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const
);
/** §2.10: the owner's configured effort, always passed explicitly so the level that ran is KNOWN. */
export const PI_DEFAULT_THINKING_LEVEL = "high" as const;
/** §2.10 / M5: pi's catalog (`pi --list-models glm`) — 1M context, 131.1K max output. */
export const PI_GLM_CONTEXT_WINDOW_TOKENS = 1_000_000 as const;
export const PI_HANDSHAKE_PROMPT =
  "PI-01 acceptance transport handshake. Reply with the single word: OK" as const;
/** Fixed engine text — never debate content — so it may travel on argv. */
export const PI_RELAY_SYSTEM_PROMPT =
  "You answer one request. The attached file holds a JSON object in the format debateai.relay-messages.v1; its messages array carries the instructions and the conversation. Follow those instructions exactly and reply with the answer only." as const;
/** Fixed engine text: the one sentence after the `@file`. */
export const PI_ATTACHED_PROMPT_MESSAGE = "Answer the request in the attached file." as const;
const PI_MODEL_PIN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
/** pi's `message.stopReason` when the model stopped at its output bound (pre-flight fix F37). */
const PI_STOP_REASON_LENGTH = "length";

const piUsageSchema = z.object({
  input: z.number().int().nonnegative().optional(),
  output: z.number().int().nonnegative().optional(),
  reasoning: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  cost: z.object({ total: z.number().nonnegative().optional() }).passthrough().optional()
}).passthrough();

const piAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()),
  provider: z.string().min(1),
  model: z.string().min(1),
  usage: z.unknown().optional(),
  stopReason: z.string().min(1)
}).passthrough();

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One call's argument vector. The debate prompt is only ever the `@file`'s content. */
export function piArguments(model: string, thinkingLevel: string, promptFile: string): readonly string[] {
  return Object.freeze([
    "--print",
    "--mode", "json",
    "--provider", PI_ZAI_PROVIDER,
    "--model", model,
    "--thinking", thinkingLevel,
    "--no-tools",
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--no-context-files",
    "--system-prompt", PI_RELAY_SYSTEM_PROMPT,
    `@${promptFile}`,
    PI_ATTACHED_PROMPT_MESSAGE
  ]);
}

/** Throws CliRelayFailure instead of inventing content or lineage. */
export function parsePiEvents(stdout: string, pinnedModel: string): CliCompletion {
  const events = stdout.split(/\r?\n/u).filter((line) => line.trim() !== "").map((line) => {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      throw new CliRelayFailure("FAILED", "PI_CLI_OUTPUT_INVALID");
    }
  });
  const assistantEnds = events.filter((event) => isRecord(event) && event.type === "message_end"
    && isRecord(event.message) && event.message.role === "assistant");
  const last = assistantEnds[assistantEnds.length - 1];
  if (!isRecord(last)) throw new CliRelayFailure("FAILED", "PI_CLI_OUTPUT_INVALID");
  const message = piAssistantMessageSchema.safeParse(last.message);
  if (!message.success) throw new CliRelayFailure("FAILED", "PI_CLI_OUTPUT_INVALID");
  // Pre-flight fix F37: pi stopping at its output bound is a TRUNCATION, not a relay
  // failure. The answer goes back with finish_reason "length" (A8), so the gateway's
  // existing length path handles it and a seat is never moved to its backup for it.
  const stoppedAtLength = message.data.stopReason === PI_STOP_REASON_LENGTH;
  if (message.data.stopReason !== "stop" && !stoppedAtLength) {
    throw new CliRelayFailure("FAILED", "PI_CLI_STOP_REASON_REFUSED");
  }
  // DR-115: the lineage is what pi REPORTS, and it must be the pinned one.
  if (message.data.provider !== PI_ZAI_PROVIDER || message.data.model !== pinnedModel) {
    throw new CliRelayFailure("FAILED", "PI_CLI_MODEL_MISMATCH");
  }
  const content = message.data.content
    .flatMap((part) => part.type === "text" && typeof part.text === "string" ? [part.text] : [])
    .join("")
    .trim();
  // A length stop may carry no text at all (the bound spent on thinking): still a truncation.
  if (content.length === 0 && !stoppedAtLength) throw new CliRelayFailure("FAILED", "PI_CLI_OUTPUT_INVALID");
  // Lenient: an unreadable usage block is "not reported", never a refused answer.
  const usage = piUsageSchema.safeParse(message.data.usage);
  return Object.freeze({
    content,
    model: message.data.model,
    ...(stoppedAtLength ? { finishReason: "length" as const } : {}),
    usage: usage.success
      ? buildCliUsage({
        promptTokens: usage.data.input,
        completionTokens: usage.data.output,
        totalTokens: usage.data.totalTokens,
        reasoningTokens: usage.data.reasoning,
        costUsd: usage.data.cost?.total
      })
      : null
  });
}

/** A pi event line's start: its `type`, the first member in every measured event (M4). */
const PI_EVENT_TYPE_START = /^\{"type":"([^"\\]*)"/u;
/** A message_end line's start: its message's `role`, the first member of every measured message (M4). */
const PI_MESSAGE_END_ROLE_START = /^\{"type":"message_end","message":\{"role":"([^"\\]*)"/u;

/**
 * A11 fix round 1: which of pi's stdout lines the relay keeps (relay-core
 * `keepStdoutLine`), decided from the line's start. In JSON mode pi repeats the
 * user message — the whole prompt — in the user message_start and message_end
 * and again in agent_end, and may stream the growing partial answer in
 * message_update lines. Counted whole, a prompt far inside the declared 1M window
 * would pass the relay's 1 MiB stdout bound AFTER a paid call. parsePiEvents
 * reads the assistant message_end and nothing else (answer, lineage, usage and
 * stop reason all live in it, and it never carries the prompt), so that is the
 * one event kept. agent_end and turn_end are DROPPED, not reduced: nothing in
 * them is needed. A line that is not a recognisable pi event is kept, so the
 * parser still refuses output it cannot read; so is a message_end whose role is
 * not the first member of its message — at worst the bound refuses that loudly.
 */
export function keepPiStdoutLine(lineStart: string): boolean {
  const type = PI_EVENT_TYPE_START.exec(lineStart)?.[1];
  if (type === undefined) return true;
  if (type !== "message_end") return false;
  const role = PI_MESSAGE_END_ROLE_START.exec(lineStart)?.[1];
  return role === undefined || role === "assistant";
}

function createPiAdapter(model: string, defaultThinkingLevel: string): CliRelayAdapter {
  return Object.freeze({
    maker: ZAI_MAKER,
    // pi reads the Z.AI key it keeps under HOME. Pre-flight ruling F37: the relay
    // never passes ZAI_API_KEY through, so a key in the relay's own environment
    // can never override the owner's stored one. PI_CODING_AGENT_DIR locates a
    // moved agent directory (pi --help, M1 §4); USER/LOGNAME are non-secret
    // login locators.
    authEnvironmentKeys: Object.freeze(["PI_CODING_AGENT_DIR", "USER", "LOGNAME"]),
    testEnvironmentKeys: Object.freeze([
      "FAKE_PI_ALWAYS_FAIL", "FAKE_PI_WRONG_MODEL", "FAKE_PI_IGNORE_PROMPT_FILE"
    ]),
    failureCode: "PI_CLI_FAILED",
    timeoutCode: "PI_CLI_TIMEOUT",
    // Contract: no install telemetry from a relayed call.
    childEnvironment: () => Object.freeze({ PI_TELEMETRY: "0" }),
    promptTransport: "file" as const,
    thinkingLevels: PI_THINKING_LEVELS,
    defaultThinkingLevel,
    contextWindowTokens: PI_GLM_CONTEXT_WINDOW_TOKENS,
    // A11 fix round 1: the 1M window is only true if pi's copies of the prompt do
    // not count toward the stdout bound; only the assistant message_end is kept.
    keepStdoutLine: keepPiStdoutLine,
    buildArguments: (_prompt: string, invocation?: CliInvocation) => {
      if (invocation?.promptFile === undefined) {
        throw new CliRelayFailure("FAILED", "PI_CLI_PROMPT_FILE_MISSING");
      }
      return piArguments(model, invocation.thinkingLevel ?? defaultThinkingLevel, invocation.promptFile);
    },
    parseCompletion: (stdout: string) => parsePiEvents(stdout, model)
  });
}

export interface PiRelayOptions {
  readonly port: number;
  readonly timeoutMs: number;
  /** Test-only process seam. Rejected outside NODE_ENV=test (DR-115). */
  readonly testOnlyCommand?: CommandSpec;
  /** pi's model id; defaults to PI_DEFAULT_MODEL. Every answer must report exactly this id. */
  readonly model?: string;
  /** Defaults to PI_DEFAULT_THINKING_LEVEL. */
  readonly defaultThinkingLevel?: string;
}

export interface PiRelayHandle extends CliRelayHandle {
  readonly model: string;
  readonly maker: typeof ZAI_MAKER;
  readonly thinkingLevels: readonly string[];
  readonly contextWindowTokens: typeof PI_GLM_CONTEXT_WINDOW_TOKENS;
}

export async function startPiRelay(options: PiRelayOptions): Promise<PiRelayHandle> {
  const model = options.model ?? PI_DEFAULT_MODEL;
  if (!PI_MODEL_PIN_PATTERN.test(model)) throw new CliRelayFailure("FAILED", "PI_CLI_MODEL_PIN_INVALID");
  const defaultThinkingLevel = options.defaultThinkingLevel ?? PI_DEFAULT_THINKING_LEVEL;
  if (!(PI_THINKING_LEVELS as readonly string[]).includes(defaultThinkingLevel)) {
    throw new CliRelayFailure("FAILED", "PI_CLI_THINKING_LEVEL_INVALID");
  }
  const command = resolveTestGuardedCommand(
    () => ({ binary: resolvePiBinary(), prefixArguments: [] }),
    options.testOnlyCommand,
    "TEST_ONLY_PI_COMMAND_FORBIDDEN"
  );
  const adapter = createPiAdapter(model, defaultThinkingLevel);
  // The handshake is the sign-in check AND the lineage check: parsePiEvents
  // refuses an answer from any provider or model other than the pinned one.
  // It is also the prompt-file check: a pi that ignored the `@file` still
  // answers, generically, so the reply must be the "ok" the prompt asked for.
  const handshake = await invokeCli(
    command,
    adapter,
    renderPromptTranscript([{ role: "user", content: PI_HANDSHAKE_PROMPT }]),
    options.timeoutMs
  );
  if (!isRelayHandshakeReply(handshake.content)) {
    throw new CliRelayFailure("FAILED", "PI_CLI_HANDSHAKE_MISMATCH");
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
    maker: ZAI_MAKER,
    thinkingLevels: PI_THINKING_LEVELS,
    contextWindowTokens: PI_GLM_CONTEXT_WINDOW_TOKENS,
    close: () => server.close()
  });
}
