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

export const GROK_BINARY = "/Users/vladmihaimiron/.grok/bin/grok" as const;
export const XAI_MAKER = "xAI" as const;
export const GROK_HANDSHAKE_PROMPT =
  "GROK-01 acceptance transport handshake. Reply with the single word: OK" as const;

const envelopeSchema = z.object({
  is_error: z.boolean().optional(),
  result: z.string(),
  model: z.string().trim().min(1).optional(),
  model_id: z.string().trim().min(1).optional(),
  modelUsage: z.record(z.string(), z.unknown()).optional()
}).passthrough();

function parseGrokEnvelope(stdout: string): { readonly content: string; readonly model: string } {
  let decoded: unknown;
  try {
    decoded = JSON.parse(stdout);
  } catch {
    throw new CliRelayFailure("FAILED", "GROK_CLI_OUTPUT_INVALID");
  }
  const envelope = envelopeSchema.safeParse(decoded);
  if (!envelope.success) throw new CliRelayFailure("FAILED", "GROK_CLI_OUTPUT_INVALID");
  if (envelope.data.is_error === true) throw new CliRelayFailure("FAILED", "GROK_CLI_FAILED");
  const content = envelope.data.result.trim();
  if (content.length === 0) throw new CliRelayFailure("FAILED", "GROK_CLI_OUTPUT_INVALID");
  const reportedModels = [
    ...(envelope.data.model === undefined ? [] : [envelope.data.model]),
    ...(envelope.data.model_id === undefined ? [] : [envelope.data.model_id]),
    ...Object.keys(envelope.data.modelUsage ?? {})
  ];
  const distinctModels = [...new Set(reportedModels)];
  const model = distinctModels[0];
  if (distinctModels.length !== 1 || model === undefined) {
    throw new CliRelayFailure("FAILED", "GROK_CLI_MODEL_UNRESOLVED");
  }
  return Object.freeze({ content, model });
}

const grokAdapter: CliRelayAdapter = {
  maker: XAI_MAKER,
  failureCode: "GROK_CLI_FAILED",
  timeoutCode: "GROK_CLI_TIMEOUT",
  buildArguments: (prompt) => [
    "--single", prompt,
    "--output-format", "json",
    "--verbatim",
    "--no-memory",
    "--no-subagents",
    "--disable-web-search",
    "--tools", ""
  ],
  parseCompletion: (stdout) => parseGrokEnvelope(stdout)
};

export interface GrokRelayOptions {
  readonly port: number;
  readonly timeoutMs: number;
  /** Test-only process seam. Rejected outside NODE_ENV=test (DR-115). */
  readonly testOnlyCommand?: CommandSpec;
}

export interface GrokRelayHandle extends CliRelayHandle {
  readonly model: string;
  readonly maker: typeof XAI_MAKER;
}

export async function startGrokRelay(options: GrokRelayOptions): Promise<GrokRelayHandle> {
  const command = resolveTestGuardedCommand(
    { binary: GROK_BINARY, prefixArguments: [] },
    options.testOnlyCommand,
    "TEST_ONLY_GROK_COMMAND_FORBIDDEN"
  );
  const handshake = await invokeCli(command, grokAdapter, GROK_HANDSHAKE_PROMPT, options.timeoutMs);
  const server = await startCliRelayServer({
    port: options.port,
    timeoutMs: options.timeoutMs,
    command,
    adapter: grokAdapter
  });
  return Object.freeze({
    port: server.port,
    baseUrl: server.baseUrl,
    model: handshake.model,
    maker: XAI_MAKER,
    close: () => server.close()
  });
}
