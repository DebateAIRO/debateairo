import {
  CliRelayFailure,
  renderPromptTranscript,
  resolveTestGuardedCommand,
  startCliRelayServer,
  type CliRelayAdapter,
  type CliRelayHandle,
  type CommandSpec
} from "./relay-core.js";

export const CODEX_BINARY = "/Applications/ChatGPT.app/Contents/Resources/codex" as const;
export const ACCEPTANCE_MODEL = "gpt-5.6-sol" as const;
export const ACCEPTANCE_MAKER = "OpenAI" as const;

export interface ModelShimOptions {
  readonly port: number;
  readonly timeoutMs: number;
  /** Test-only process seam. It is rejected outside NODE_ENV=test and is never read from acceptance config. */
  readonly testOnlyCommand?: CommandSpec;
}

export type ModelShimHandle = CliRelayHandle;

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

/**
 * The DR-133 codex strategy (FAIR-02 P8 extraction; behavior unchanged): the
 * codex CLI is instructed to run the ruled acceptance model, echoes the prompt
 * (stripped), and any failure is a loud typed error — never fabricated output.
 */
const codexAdapter: CliRelayAdapter = {
  maker: ACCEPTANCE_MAKER,
  failureCode: "CODEX_CLI_FAILED",
  timeoutCode: "CODEX_CLI_TIMEOUT",
  buildArguments: (prompt) => ["exec", "-c", `model="${ACCEPTANCE_MODEL}"`, prompt],
  parseCompletion: (stdout, prompt) => ({
    content: stripPromptEcho(stdout, prompt),
    model: ACCEPTANCE_MODEL
  })
};

export async function startModelShim(options: ModelShimOptions): Promise<ModelShimHandle> {
  const command = resolveTestGuardedCommand(
    { binary: CODEX_BINARY, prefixArguments: [] },
    options.testOnlyCommand,
    "TEST_ONLY_CODEX_COMMAND_FORBIDDEN"
  );
  return startCliRelayServer({
    port: options.port,
    timeoutMs: options.timeoutMs,
    command,
    adapter: codexAdapter
  });
}
