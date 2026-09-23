import { z } from "zod";
import {
  CliRelayFailure,
  invokeCli,
  resolveConfiguredBinary,
  resolveTestGuardedCommand,
  startCliRelayServer,
  type CliRelayAdapter,
  type CliRelayHandle,
  type CommandSpec
} from "./relay-core.js";

/** The NAME this maker's CLI is looked up by; never a path (D10, 2026-09-17). */
export const GROK_BINARY_NAME = "grok" as const;
/**
 * D10 host override for {@link GROK_BINARY_NAME}. Unset ⇒ this host's own
 * `grok`, deduced from PATH. See `relay-core.ts` for the order and for the
 * refusal vocabulary a resolved file is held to.
 */
const GROK_BINARY_ENV_KEY = "ACCEPTANCE_GROK_BINARY" as const;
const GROK_BINARY_UNRESOLVED = "GROK_CLI_BINARY_UNRESOLVED" as const;

export function resolveGrokBinary(source: NodeJS.ProcessEnv = process.env): string {
  return resolveConfiguredBinary(
    GROK_BINARY_NAME,
    GROK_BINARY_ENV_KEY,
    GROK_BINARY_UNRESOLVED,
    source
  );
}
export const XAI_MAKER = "xAI" as const;
export const GROK_HANDSHAKE_PROMPT =
  "GROK-01 acceptance transport handshake. Reply with the single word: OK" as const;

const envelopeSchema = z.object({
  text: z.string(),
  stopReason: z.string().trim().min(1),
  total_cost_usd: z.number().nonnegative().optional(),
  modelUsage: z.record(z.string().trim().min(1), z.unknown())
}).passthrough();

const observedTokenUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional()
}).passthrough();

function parseGrokEnvelope(stdout: string): {
  readonly content: string;
  readonly model: string;
  readonly costUsd: number | null;
  readonly usage: null | {
    readonly promptTokens?: number;
    readonly completionTokens?: number;
    readonly totalTokens?: number;
    readonly costUsd?: number;
  };
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
    costUsd: costUsd ?? null,
    usage: Object.keys(usage).length === 0 ? null : Object.freeze(usage)
  });
}

/** The isolation profile the relay asks for whenever this host can apply it. */
export const GROK_SANDBOX_PROFILE = "read-only" as const;
export type GrokSandboxProfile = typeof GROK_SANDBOX_PROFILE | "none";
const GROK_SANDBOX_FLAG = "--sandbox" as const;

/**
 * F-GROK-SANDBOX-PROFILE: the acceptance harness's own degradation code for a
 * relay that had to start WITHOUT its sandbox profile.
 *
 * It is deliberately NOT a member of the kernel's `CONDITION_MARKS`. That
 * vocabulary is closed and pinned (37 members, whose last four are read
 * POSITIONALLY by `CONDITION_MARKS.slice(-4)`), it is minted only by the
 * kernel — this ticket's contract touches neither — and every member of it
 * describes a property of a DEBATE that ran. This names a property of the
 * transport, decided before any run exists, so it rides the relay handle and
 * the ceremony's stdout instead of a served answer's marks.
 */
export const SANDBOX_PROFILE_UNAVAILABLE = "SANDBOX-PROFILE-UNAVAILABLE" as const;

function grokArguments(prompt: string, sandboxProfile: string | null): readonly string[] {
  return [
    "--single", prompt,
    "--output-format", "json",
    "--verbatim",
    ...(sandboxProfile === null ? [] : [GROK_SANDBOX_FLAG, sandboxProfile]),
    "--no-memory",
    "--no-subagents",
    "--disable-web-search",
    "--tools", ""
  ];
}

function grokAdapterFor(sandboxProfile: string | null): CliRelayAdapter {
  return {
    maker: XAI_MAKER,
    authEnvironmentKeys: ["XAI_API_KEY"],
    testEnvironmentKeys: [
      "FAKE_GROK_ALWAYS_FAIL",
      "FAKE_GROK_CAPTURED_ENVELOPE",
      "FAKE_GROK_COST_ABSENT",
      "FAKE_GROK_MODEL_USAGE_NON_OBJECT"
    ],
    failureCode: "GROK_CLI_FAILED",
    timeoutCode: "GROK_CLI_TIMEOUT",
    buildArguments: (prompt) => grokArguments(prompt, sandboxProfile),
    parseCompletion: (stdout) => parseGrokEnvelope(stdout)
  };
}

/** The sandboxed adapter: argument-for-argument what every Grok call was before this seam. */
const grokAdapter: CliRelayAdapter = grokAdapterFor(GROK_SANDBOX_PROFILE);

export interface GrokRelayOptions {
  readonly port: number;
  readonly timeoutMs: number;
  /** Test-only process seam. Rejected outside NODE_ENV=test (DR-115). */
  readonly testOnlyCommand?: CommandSpec;
  /** CLI sandbox profile; defaults to `read-only`. See GrokSandboxProfile. */
  readonly sandboxProfile?: GrokSandboxProfile;
}

export interface GrokRelayHandle extends CliRelayHandle {
  readonly model: string;
  readonly maker: typeof XAI_MAKER;
  readonly handshakeCostUsd: number | null;
  /** The profile this relay actually applies to every call; null ⇒ none could be applied. */
  readonly sandboxProfile: typeof GROK_SANDBOX_PROFILE | null;
  /** The run's visible degradation record; null on the admitted path. */
  readonly degradation: typeof SANDBOX_PROFILE_UNAVAILABLE | null;
}

function failureCodeOf(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "GROK_CLI_FAILED";
}

/**
 * F-GROK-SANDBOX-PROFILE outcome (2). The relay asks for its sandbox profile
 * FIRST and only accepts an unprotected transport once it has evidence that the
 * PROFILE is what this host refuses.
 *
 * The evidence has to be differential. `relay-core.ts` discards the child's
 * stderr, so the vendor's own words ("could not apply the 'read-only' sandbox
 * profile") never reach this process; all that arrives is a typed
 * `GROK_CLI_FAILED`. Re-running the identical handshake WITHOUT the profile is
 * the one available discriminator, and it is exactly the experiment that
 * diagnosed the closing run by hand. If the unsandboxed handshake also fails,
 * the profile is exonerated and the ORIGINAL failure is re-thrown — an absent
 * maker is never quietly traded for an unprotected one.
 *
 * ONE failure is not that evidence (F1). A vendor rate limit, a 5xx or a
 * `GROK_CLI_TIMEOUT` fails the sandboxed handshake while saying nothing about
 * the profile, and — because the vendor's words are discarded — it arrives here
 * as the same `GROK_CLI_FAILED` an unsupported profile does. So the SANDBOXED
 * handshake is re-run first, and `SANDBOX-PROFILE-UNAVAILABLE` is concluded only
 * on a REPRODUCIBLE sandboxed failure. A transient failure followed by a
 * sandboxed success keeps the profile and degrades nothing.
 *
 * Every handshake is the GROK-01 no-op prompt, which asks for a single word.
 * A cheaper probe would need a flag combination no test on this host can
 * exercise. The ADMITTED path still costs ONE invocation; the degraded path now
 * costs THREE — two sandboxed, then the unsandboxed probe — and only a host
 * that refuses the profile twice ever pays for the third. (The readiness packet
 * still says two: a records line for the orchestrator, not an edit here.)
 */
async function handshakeWithProbedSandbox(
  command: CommandSpec,
  timeoutMs: number
): Promise<{
  readonly handshake: ReturnType<typeof parseGrokEnvelope>;
  readonly adapter: CliRelayAdapter;
  readonly sandboxProfile: typeof GROK_SANDBOX_PROFILE | null;
  readonly degradation: typeof SANDBOX_PROFILE_UNAVAILABLE | null;
}> {
  const sandboxedHandshake = async (): Promise<ReturnType<typeof parseGrokEnvelope>> =>
    await invokeCli(
      command, grokAdapter, GROK_HANDSHAKE_PROMPT, timeoutMs
    ) as ReturnType<typeof parseGrokEnvelope>;
  const kept = (handshake: ReturnType<typeof parseGrokEnvelope>) => ({
    handshake, adapter: grokAdapter, sandboxProfile: GROK_SANDBOX_PROFILE, degradation: null
  });

  let originalFailure: unknown;
  try {
    return kept(await sandboxedHandshake());
  } catch (sandboxedFailure) {
    originalFailure = sandboxedFailure;
  }
  try {
    // The retry is the discriminator between "unlucky once" and "this host".
    return kept(await sandboxedHandshake());
  } catch {
    // REPRODUCED. Only now is the profile a candidate, and the ORIGINAL failure
    // stays the one reported: it is what the run was actually refused with.
  }

  const unsandboxedAdapter = grokAdapterFor(null);
  const handshake = await invokeCli(
    command, unsandboxedAdapter, GROK_HANDSHAKE_PROMPT, timeoutMs
  ).catch(() => { throw originalFailure; }) as ReturnType<typeof parseGrokEnvelope>;
  // Loud on the ceremony's own stdout: protections were removed, by whom,
  // and under which failure. Never a silent downgrade.
  process.stdout.write(
    `RELAY DEGRADED ${XAI_MAKER} ${SANDBOX_PROFILE_UNAVAILABLE} ${failureCodeOf(originalFailure)}\n`
  );
  return {
    handshake,
    adapter: unsandboxedAdapter,
    sandboxProfile: null,
    degradation: SANDBOX_PROFILE_UNAVAILABLE
  };
}

export async function startGrokRelay(options: GrokRelayOptions): Promise<GrokRelayHandle> {
  const command = resolveTestGuardedCommand(
    () => ({ binary: resolveGrokBinary(), prefixArguments: [] }),
    options.testOnlyCommand,
    "TEST_ONLY_GROK_COMMAND_FORBIDDEN"
  );
  const probed = options.sandboxProfile === "none"
    ? await handshakeWithoutSandbox(command, options.timeoutMs)
    : await handshakeWithProbedSandbox(command, options.timeoutMs);
  const server = await startCliRelayServer({
    port: options.port,
    timeoutMs: options.timeoutMs,
    command,
    // The SERVED calls inherit the probed adapter, so a dropped profile is the
    // relay's standing configuration rather than a retry the handshake hid.
    adapter: probed.adapter
  });
  return Object.freeze({
    port: server.port,
    baseUrl: server.baseUrl,
    authorizationHeader: server.authorizationHeader,
    model: probed.handshake.model,
    maker: XAI_MAKER,
    handshakeCostUsd: probed.handshake.costUsd,
    sandboxProfile: probed.sandboxProfile,
    degradation: probed.degradation,
    close: () => server.close()
  });
}

/** Preserve the development panel's explicit profile while reporting the degraded protection. */
async function handshakeWithoutSandbox(command: CommandSpec, timeoutMs: number) {
  const adapter = grokAdapterFor("none");
  const handshake = await invokeCli(
    command, adapter, GROK_HANDSHAKE_PROMPT, timeoutMs
  ) as ReturnType<typeof parseGrokEnvelope>;
  process.stdout.write(`RELAY DEGRADED ${XAI_MAKER} ${SANDBOX_PROFILE_UNAVAILABLE} EXPLICIT_NONE_PROFILE\n`);
  return { handshake, adapter, sandboxProfile: null, degradation: SANDBOX_PROFILE_UNAVAILABLE };
}
