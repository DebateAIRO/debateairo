import { readdir, readFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  CliRelayFailure,
  buildCliUsage,
  invokeCli,
  openRelayWorkspace,
  renderPromptTranscript,
  reportHarnessOverhead,
  resolveConfiguredBinary,
  resolveTestGuardedCommand,
  startCliRelayServer,
  type CliCompletion,
  type CliInvocation,
  type CliRelayAdapter,
  type CliRelayHandle,
  type CliUsage,
  type CommandSpec,
  type HarnessOverhead
} from "./relay-core.js";

/** The NAME this maker's CLI is looked up by; never a path (D10, 2026-09-17). */
export const CODEX_BINARY_NAME = "codex" as const;
/**
 * D10 host override for {@link CODEX_BINARY_NAME}. Unset ⇒ this host's own
 * `codex`, deduced from PATH. See `relay-core.ts` for the order and for the
 * refusal vocabulary a resolved file is held to. On a developer machine this
 * resolves to a real, logged-in CLI, so it stays the one default no test may
 * reach: a test that did would make a LIVE provider call.
 */
const CODEX_BINARY_ENV_KEY = "ACCEPTANCE_CODEX_BINARY" as const;
const CODEX_BINARY_UNRESOLVED = "CODEX_CLI_BINARY_UNRESOLVED" as const;

export function resolveCodexBinary(source: NodeJS.ProcessEnv = process.env): string {
  return resolveConfiguredBinary(
    CODEX_BINARY_NAME,
    CODEX_BINARY_ENV_KEY,
    CODEX_BINARY_UNRESOLVED,
    source
  );
}
export const ACCEPTANCE_MAKER = "OpenAI" as const;
/**
 * §2.2 — codex-cli 0.156.1 (M4, 2026-09-26): the server accepts exactly these
 * values for `-c model_reasoning_effort="…"`; anything else is an HTTP 400
 * before any model work, and the call then fails loudly — never silently at
 * another level. No usage-cap output is on record for codex, so a cap stays
 * CODEX_CLI_FAILED (README: "usage caps").
 */
export const CODEX_THINKING_LEVELS = Object.freeze(
  ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const
);
/**
 * D8 (lean calls) — codex-cli 0.156.1, measured 2026-09-26 (M5): with these
 * disabled and the relay's instructions file in place of codex's own base
 * instructions, a one-line call read 6,909 input tokens instead of 15,370 and
 * still answered on the subscription. `code_mode_host` is deliberately NOT
 * here: disabling it adds an error item to the event stream.
 */
export const CODEX_DISABLED_FEATURES = Object.freeze([
  "apps", "browser_use", "browser_use_external", "computer_use", "goals", "hooks",
  "image_generation", "multi_agent", "plugins", "shell_tool", "skill_search", "sleep_tool",
  "tool_suggest", "unified_exec", "view_image", "workspace_dependencies", "in_app_browser",
  "shell_snapshot"
] as const);
export const CODEX_HANDSHAKE_PROMPT =
  "DR-181 acceptance transport handshake. Reply with the single word: OK" as const;

export interface ModelShimOptions {
  readonly port: number;
  readonly timeoutMs: number;
  /** Test-only process seam. It is rejected outside NODE_ENV=test and is never read from acceptance config. */
  readonly testOnlyCommand?: CommandSpec;
  /** Test-only mirror of Codex's persisted rollout tree. */
  readonly testOnlySessionsRoot?: string;
  /**
   * Model id asked of the CLI via `-c model="…"` (config overrides survive
   * `--ignore-user-config`). Without it the CLI's own default answers. The relayed
   * lineage is still only ever the rollout-recorded id (DR-115); a handshake whose
   * rollout names a different model refuses to start (CODEX_CLI_MODEL_MISMATCH).
   */
  readonly model?: string;
}

export interface ModelShimHandle extends CliRelayHandle {
  readonly model: string;
  readonly maker: typeof ACCEPTANCE_MAKER;
  /** §2.2: the `model_reasoning_effort` values this relay accepts as `x_thinking_level`. */
  readonly thinkingLevels: readonly string[];
  /** D8: what codex added around the handshake prompt. Informational only. */
  readonly harnessOverhead: HarnessOverhead;
}

export function renderCodexPrompt(messages: readonly {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}[]): string {
  return renderPromptTranscript(messages);
}

export function stripPromptEcho(stdout: string, prompt: string): string {
  const withoutTrailingSpace = stdout.trimEnd();
  const candidate = withoutTrailingSpace.startsWith(prompt)
    ? withoutTrailingSpace.slice(prompt.length).replace(/^\r?\n/, "")
    : withoutTrailingSpace;
  if (candidate.trim().length === 0) throw new CliRelayFailure("FAILED", "CODEX_CLI_FAILED");
  return candidate.trim();
}

interface ParsedCodexStdout {
  readonly content: string;
  readonly threadId: string;
  readonly usage: CliUsage | null;
}

/** §2.3 — the measured 0.156.1 `turn.completed` usage block (M4). */
const codexTurnUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  reasoning_output_tokens: z.number().int().nonnegative().optional()
}).passthrough();

function parseCodexStdout(stdout: string): ParsedCodexStdout {
  const events = stdout.split(/\r?\n/).filter((line) => line.trim() !== "").map((line) => {
    try {
      return JSON.parse(line) as Readonly<Record<string, unknown>>;
    } catch {
      throw new CliRelayFailure("FAILED", "CODEX_CLI_OUTPUT_INVALID");
    }
  });
  const threadIds = [...new Set(events.flatMap((event) =>
    event.type === "thread.started" && typeof event.thread_id === "string" && event.thread_id.trim() !== ""
      ? [event.thread_id]
      : []
  ))];
  const threadId = threadIds[0];
  if (threadIds.length !== 1 || threadId === undefined) {
    throw new CliRelayFailure("FAILED", "CODEX_CLI_MODEL_UNRESOLVED");
  }
  const messages = events.flatMap((event) => {
    if (event.type !== "item.completed" || typeof event.item !== "object" || event.item === null) return [];
    const item = event.item as Readonly<Record<string, unknown>>;
    return item.type === "agent_message" && typeof item.text === "string" && item.text.trim() !== ""
      ? [item.text.trim()]
      : [];
  });
  const content = messages.at(-1);
  if (content === undefined) throw new CliRelayFailure("FAILED", "CODEX_CLI_OUTPUT_INVALID");
  // Lenient by design: a missing or unreadable usage block is "not reported"
  // (null), never a refused answer. output_tokens INCLUDES the reasoning tokens,
  // which are also reported on their own, exactly as OpenAI's own spelling does.
  const observed = codexTurnUsageSchema.safeParse(
    events.filter((event) => event.type === "turn.completed").at(-1)?.usage
  );
  const usage = observed.success
    ? buildCliUsage({
      promptTokens: observed.data.input_tokens,
      completionTokens: observed.data.output_tokens,
      reasoningTokens: observed.data.reasoning_output_tokens
    })
    : null;
  return Object.freeze({ content, threadId, usage });
}

export function parseCodexRolloutModel(jsonl: string, threadId: string): string {
  const events = jsonl.split(/\r?\n/).filter((line) => line.trim() !== "").map((line) => {
    try {
      return JSON.parse(line) as Readonly<Record<string, unknown>>;
    } catch {
      throw new CliRelayFailure("FAILED", "CODEX_CLI_MODEL_UNRESOLVED");
    }
  });
  const sessionIds = new Set(events.flatMap((event) => {
    if (event.type !== "session_meta" || typeof event.payload !== "object" || event.payload === null) return [];
    const payload = event.payload as Readonly<Record<string, unknown>>;
    return typeof payload.id === "string" ? [payload.id] : [];
  }));
  if (!sessionIds.has(threadId)) throw new CliRelayFailure("FAILED", "CODEX_CLI_MODEL_UNRESOLVED");
  const models = [...new Set(events.flatMap((event) => {
    if (event.type !== "turn_context" || typeof event.payload !== "object" || event.payload === null) return [];
    const payload = event.payload as Readonly<Record<string, unknown>>;
    return typeof payload.model === "string" && payload.model.trim() !== "" ? [payload.model] : [];
  }))];
  const model = models[0];
  if (models.length !== 1 || model === undefined) {
    throw new CliRelayFailure("FAILED", "CODEX_CLI_MODEL_UNRESOLVED");
  }
  return model;
}

async function findRollouts(directory: string, threadId: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new CliRelayFailure("FAILED", "CODEX_CLI_MODEL_UNRESOLVED");
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findRollouts(path, threadId);
    return entry.isFile() && entry.name.endsWith(`-${threadId}.jsonl`) ? [path] : [];
  }));
  return nested.flat();
}

function defaultCodexSessionsRoot(): string {
  const codexHome = process.env.CODEX_HOME?.trim();
  return join(codexHome === undefined || codexHome === "" ? join(userInfo().homedir, ".codex") : codexHome, "sessions");
}

export async function parseCodexCompletion(
  stdout: string,
  sessionsRoot = defaultCodexSessionsRoot()
): Promise<CliCompletion> {
  const parsed = parseCodexStdout(stdout);
  const matches = await findRollouts(sessionsRoot, parsed.threadId);
  if (matches.length !== 1) throw new CliRelayFailure("FAILED", "CODEX_CLI_MODEL_UNRESOLVED");
  const model = parseCodexRolloutModel(await readFile(matches[0]!, "utf8"), parsed.threadId);
  return Object.freeze({ content: parsed.content, model, usage: parsed.usage });
}

const CODEX_MODEL_PIN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function createCodexAdapter(sessionsRoot: string, model?: string): CliRelayAdapter {
  if (model !== undefined && !CODEX_MODEL_PIN_PATTERN.test(model)) {
    throw new CliRelayFailure("FAILED", "CODEX_CLI_MODEL_PIN_INVALID");
  }
  return {
    maker: ACCEPTANCE_MAKER,
    authEnvironmentKeys: ["CODEX_HOME", "OPENAI_API_KEY"],
    testEnvironmentKeys: [],
    failureCode: "CODEX_CLI_FAILED",
    timeoutCode: "CODEX_CLI_TIMEOUT",
    thinkingLevels: CODEX_THINKING_LEVELS,
    // D8: relay-core writes RELAY_MINIMAL_SYSTEM_PROMPT to a 0600 file once per
    // relay start and never runs this adapter without it.
    readsInstructionsFile: true,
    // §2.2: the level is one checked token, so the quoted config value cannot
    // be broken out of; it is APPENDED only when asked and the prompt stays last.
    // D8: the lean flags sit right after --json, so the prompt stays last too.
    buildArguments: (prompt: string, invocation?: CliInvocation) => {
      if (invocation?.instructionsFile === undefined) {
        throw new CliRelayFailure("FAILED", "CODEX_CLI_INSTRUCTIONS_FILE_MISSING");
      }
      return [
        "exec",
        "--skip-git-repo-check",
        "--sandbox", "read-only",
        "--ignore-rules",
        "--ignore-user-config",
        "--json",
        // D8: codex's own base instructions are REPLACED by the relay's one
        // sentence. JSON quoting is a valid TOML basic string for any path.
        "-c", `model_instructions_file=${JSON.stringify(invocation.instructionsFile)}`,
        ...CODEX_DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
        ...(model === undefined ? [] : ["-c", `model="${model}"`]),
        ...(invocation.thinkingLevel === undefined
          ? []
          : ["-c", `model_reasoning_effort="${invocation.thinkingLevel}"`]),
        prompt
      ];
    },
    parseCompletion: (stdout) => parseCodexCompletion(stdout, sessionsRoot)
  };
}

export const codexAdapter: CliRelayAdapter = createCodexAdapter(defaultCodexSessionsRoot());

export async function startModelShim(options: ModelShimOptions): Promise<ModelShimHandle> {
  // Codex is the only maker with a SECOND test-only seam, so it is the only
  // one where baseline ordering has to be made explicit. At base the default
  // command was a constant that could not throw, so "command seam, then
  // sessions-root seam, then default" held implicitly; with an env-backed
  // default, a blank ACCEPTANCE_CODEX_BINARY would pre-empt this pre-existing
  // typed-loud code whenever no command seam is supplied. The command seam
  // keeps its baseline precedence: when it is present resolveTestGuardedCommand
  // decides first and never forces the thunk, so this guard defers to it — and
  // that is also why the check no longer sits below the resolution, where it
  // would now be unreachable in every combination.
  if (options.testOnlyCommand === undefined
    && options.testOnlySessionsRoot !== undefined
    && process.env.NODE_ENV !== "test") {
    throw new Error("TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDDEN");
  }
  const command = resolveTestGuardedCommand(
    () => ({ binary: resolveCodexBinary(), prefixArguments: [] }),
    options.testOnlyCommand,
    "TEST_ONLY_CODEX_COMMAND_FORBIDDEN"
  );
  const adapter = createCodexAdapter(options.testOnlySessionsRoot ?? defaultCodexSessionsRoot(), options.model);
  // D8: ONE private workspace for this relay's whole life. It holds the 0600
  // instructions file every call — the handshake included — points codex at.
  const workspace = await openRelayWorkspace(adapter);
  try {
    const handshake = await invokeCli(command, adapter, CODEX_HANDSHAKE_PROMPT, options.timeoutMs, { workspace });
    if (options.model !== undefined && handshake.model !== options.model) {
      throw new CliRelayFailure("FAILED", "CODEX_CLI_MODEL_MISMATCH");
    }
    const harnessOverhead = reportHarnessOverhead(ACCEPTANCE_MAKER, CODEX_HANDSHAKE_PROMPT, handshake);
    const server = await startCliRelayServer({
      port: options.port,
      timeoutMs: options.timeoutMs,
      command,
      adapter,
      workspace
    });
    return Object.freeze({
      port: server.port,
      baseUrl: server.baseUrl,
      authorizationHeader: server.authorizationHeader,
      model: handshake.model,
      maker: ACCEPTANCE_MAKER,
      thinkingLevels: CODEX_THINKING_LEVELS,
      harnessOverhead,
      close: () => server.close()
    });
  } catch (error) {
    await workspace.close();
    throw error;
  }
}
