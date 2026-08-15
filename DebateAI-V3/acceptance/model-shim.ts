import { readdir, readFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import {
  CliRelayFailure,
  invokeCli,
  renderPromptTranscript,
  resolveTestGuardedCommand,
  startCliRelayServer,
  type CliRelayAdapter,
  type CliRelayHandle,
  type CommandSpec
} from "./relay-core.js";

export const CODEX_BINARY = "/Applications/ChatGPT.app/Contents/Resources/codex" as const;
export const ACCEPTANCE_MAKER = "OpenAI" as const;
export const CODEX_HANDSHAKE_PROMPT =
  "DR-181 acceptance transport handshake. Reply with the single word: OK" as const;

export interface ModelShimOptions {
  readonly port: number;
  readonly timeoutMs: number;
  /** Test-only process seam. It is rejected outside NODE_ENV=test and is never read from acceptance config. */
  readonly testOnlyCommand?: CommandSpec;
  /** Test-only mirror of Codex's persisted rollout tree. */
  readonly testOnlySessionsRoot?: string;
}

export interface ModelShimHandle extends CliRelayHandle {
  readonly model: string;
  readonly maker: typeof ACCEPTANCE_MAKER;
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
}

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
  return Object.freeze({ content, threadId });
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
): Promise<{ readonly content: string; readonly model: string; readonly usage: null }> {
  const parsed = parseCodexStdout(stdout);
  const matches = await findRollouts(sessionsRoot, parsed.threadId);
  if (matches.length !== 1) throw new CliRelayFailure("FAILED", "CODEX_CLI_MODEL_UNRESOLVED");
  const model = parseCodexRolloutModel(await readFile(matches[0]!, "utf8"), parsed.threadId);
  return Object.freeze({ content: parsed.content, model, usage: null });
}

function createCodexAdapter(sessionsRoot: string): CliRelayAdapter {
  return {
    maker: ACCEPTANCE_MAKER,
    failureCode: "CODEX_CLI_FAILED",
    timeoutCode: "CODEX_CLI_TIMEOUT",
    buildArguments: (prompt) => ["exec", "--json", prompt],
    parseCompletion: (stdout) => parseCodexCompletion(stdout, sessionsRoot)
  };
}

export const codexAdapter: CliRelayAdapter = createCodexAdapter(defaultCodexSessionsRoot());

export async function startModelShim(options: ModelShimOptions): Promise<ModelShimHandle> {
  const command = resolveTestGuardedCommand(
    { binary: CODEX_BINARY, prefixArguments: [] },
    options.testOnlyCommand,
    "TEST_ONLY_CODEX_COMMAND_FORBIDDEN"
  );
  if (options.testOnlySessionsRoot !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error("TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDDEN");
  }
  const adapter = createCodexAdapter(options.testOnlySessionsRoot ?? defaultCodexSessionsRoot());
  const handshake = await invokeCli(command, adapter, CODEX_HANDSHAKE_PROMPT, options.timeoutMs);
  const server = await startCliRelayServer({
    port: options.port,
    timeoutMs: options.timeoutMs,
    command,
    adapter
  });
  return Object.freeze({
    port: server.port,
    baseUrl: server.baseUrl,
    model: handshake.model,
    maker: ACCEPTANCE_MAKER,
    close: () => server.close()
  });
}
