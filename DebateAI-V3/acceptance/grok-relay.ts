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
  text: z.string(),
  stopReason: z.string().trim().min(1),
  total_cost_usd: z.number().nonnegative(),
  modelUsage: z.record(z.string().trim().min(1), z.unknown())
}).passthrough();

function parseGrokEnvelope(stdout: string): {
  readonly content: string;
  readonly model: string;
  readonly costUsd: number;
} {
  let decoded: unknown;
  try {
    decoded = JSON.parse(stdout);
  } catch {
    throw new CliRelayFailure("FAILED", "GROK_CLI_OUTPUT_INVALID");
  }
  const envelope = envelopeSchema.safeParse(decoded);
  if (!envelope.success) throw new CliRelayFailure("FAILED", "GROK_CLI_OUTPUT_INVALID");
  const content = envelope.data.text.trim();
  if (content.length === 0) throw new CliRelayFailure("FAILED", "GROK_CLI_OUTPUT_INVALID");
  const reportedModels = Object.keys(envelope.data.modelUsage);
  const model = reportedModels[0];
  if (reportedModels.length !== 1 || model === undefined) {
    throw new CliRelayFailure("FAILED", "GROK_CLI_MODEL_UNRESOLVED");
  }
  return Object.freeze({ content, model, costUsd: envelope.data.total_cost_usd });
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
  readonly handshakeCostUsd: number;
}

export async function startGrokRelay(options: GrokRelayOptions): Promise<GrokRelayHandle> {
  const command = resolveTestGuardedCommand(
    { binary: GROK_BINARY, prefixArguments: [] },
    options.testOnlyCommand,
    "TEST_ONLY_GROK_COMMAND_FORBIDDEN"
  );
  const handshake = await invokeCli(
    command,
    grokAdapter,
    GROK_HANDSHAKE_PROMPT,
    options.timeoutMs
  ) as ReturnType<typeof parseGrokEnvelope>;
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
    handshakeCostUsd: handshake.costUsd,
    close: () => server.close()
  });
}
