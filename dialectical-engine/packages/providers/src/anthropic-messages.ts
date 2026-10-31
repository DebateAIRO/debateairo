import { THINKING_LEVEL_DEFAULT_ONLY, TypedDomainError } from "@debateai/kernel";
import type { PromptPacket } from "./index.js";

/**
 * Multi-model preview, PR B — THE NATIVE ANTHROPIC MESSAGES WIRE.
 *
 * Adapter kind `anthropic-messages-http`. This file owns only the WIRE: the exact
 * request body and headers, and how a reply body becomes the shape the shared
 * attempt loop already reads (`OpenAICompatibleProviderGateway` in ./index.ts).
 * The loop itself — attempts, backoff, the money seam, the ledger and artifact
 * rows, truncation retries, repair packets, the model-identity check — is the
 * ONE loop every adapter runs; nothing here retries anything.
 *
 * The request shape is fixed by the lead's wire contract (2026-10-10), and the
 * preview's root gate validates the very same shape strictly and forwards the
 * bytes it priced. So this file never adds a body member that is not listed
 * there: `model`, `max_tokens`, `messages`, optional `system`, and
 * `output_config: {"effort":<level>}` when a reviewed thinking level is asked.
 * Prompt caching (owner approval 2026-10-12): `system` is either the one string,
 * or, when the engine's framed system text carries its per-call marker tail,
 * exactly two text blocks with the one 5-minute cache mark on the first
 * (anthropicCacheableSystem). Length guidance L30 (LG-B, 2026-10-15): when the gateway asks
 * (`cacheFirstUserTurn`, the preview's Anthropic rows), the first user turn is sent as text blocks, its first block
 * (the fenced material) with the same mark (anthropicCacheableMessages). Nothing else anywhere carries a cache mark.
 *
 * It imports NO value from ./index.ts on purpose: index.ts imports this file,
 * and a value cycle would be read before it is initialised.
 */

export const ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND = "anthropic-messages-http" as const;
/**
 * The ONE base URL this wire may be pointed at (review fix, 2026-10-10): the
 * kind and the host are tied both ways, so an Anthropic key can never be sent
 * over another wire, nor this wire's body to another host.
 */
export const ANTHROPIC_MESSAGES_BASE_URL = "https://api.anthropic.com/v1" as const;
export const ANTHROPIC_API_HOST = "api.anthropic.com" as const;

/** The API version header the contract fixes. */
export const ANTHROPIC_API_VERSION = "2023-06-01" as const;
/** Appended to the target's base URL (`https://api.anthropic.com/v1`). */
export const ANTHROPIC_MESSAGES_PATH = "/messages" as const;
/**
 * The thinking levels this wire can carry, as `output_config.effort` (spec 2026-10-12 §4.4: the reviewed Haiku menu).
 * Claude Haiku 5.5 also has xhigh and max; they are not reviewed, so they are refused before anything is sent.
 */
export const ANTHROPIC_EFFORT_LEVELS = Object.freeze(["low", "medium", "high"] as const);
/**
 * The vendor declined to answer (`stop_reason: "refusal"`). Billed, not retried.
 * The same name the Gemini adapter uses for its safety blocks (lead, 2026-10-10).
 */
export const PROVIDER_CONTENT_REFUSED = "PROVIDER_CONTENT_REFUSED" as const;
/**
 * The reply carried something this engine never asked for and cannot use: a
 * tool call, a server tool, a paused turn, a context-window stop, an unknown
 * block or stop reason. Billed, not retried.
 */
export const PROVIDER_REPLY_UNSUPPORTED = "PROVIDER_REPLY_UNSUPPORTED" as const;
/**
 * The packet cannot be said on this wire (no user turn first, a final assistant
 * turn — which this vendor refuses as a prefill — or an empty message). Refused
 * before anything is sent.
 */
export const PROVIDER_PACKET_UNSUPPORTED = "PROVIDER_PACKET_UNSUPPORTED" as const;

const MAX_USAGE_COUNTER = 2 ** 31 - 1;

/**
 * Prompt caching (owner approval 2026-10-12, "caching before the upload"). The engine's framed system message
 * puts its per-call random values (the boundary fence, the canary) LAST, after a tail whose first line is exactly
 * `--- PER-CALL MARKERS (engine) ---` (contract with the prompt frame, branch fix/2026-10-12-patch-follow-up). This
 * file splits on its own copy of that separator; the frame's shared splitter replaces it when that branch lands.
 */
export const ANTHROPIC_PER_CALL_MARKERS_SEPARATOR = "\n\n--- PER-CALL MARKERS (engine) ---" as const;
/** The one cache mark this wire sends: 5 minutes (no ttl), on the first system block only. */
const ANTHROPIC_CACHE_MARK = Object.freeze({ type: "ephemeral" } as const);
/** The cached form of `system`: the stable prefix (marked) and the per-call tail (unmarked). */
export type AnthropicSystemBlocks = readonly [
  Readonly<{ type: "text"; text: string; cache_control: Readonly<{ type: "ephemeral" }> }>,
  Readonly<{ type: "text"; text: string }>
];

/**
 * `system` as the wire sends it. With the per-call marker line in it, exactly two text blocks: everything up to
 * and including the blank line before the FIRST marker line (the instruction and safety frame, identical across
 * calls of one step, so the vendor can serve it from its cache), with the 5-minute cache mark; then the tail from
 * the marker line on (the per-call values), with none. Joining the two texts gives back `system` byte for byte.
 * Without the marker line, or when the prefix would be only whitespace, the one string, as before. A prefix under
 * the model's cacheable minimum (512 tokens on Claude Haiku 5.5) is simply not cached by the vendor: no error,
 * no write. The messages carry a mark only through anthropicCacheableMessages (LG-B): a call's two tries share
 * their fence, so their material is the same bytes and the second try can read it from the cache; a new call's
 * material starts with a new fence and is written again.
 */
export function anthropicCacheableSystem(system: string): string | AnthropicSystemBlocks {
  const at = system.indexOf(ANTHROPIC_PER_CALL_MARKERS_SEPARATOR);
  if (at < 0) return system;
  // The separator's leading blank line stays with the prefix, so the tail's first line is the marker line.
  const cut = at + 2;
  const prefix = system.slice(0, cut);
  if (prefix.trim() === "") return system;
  return Object.freeze([
    Object.freeze({ type: "text" as const, text: prefix, cache_control: ANTHROPIC_CACHE_MARK }),
    Object.freeze({ type: "text" as const, text: system.slice(cut) })
  ] as const);
}

type WireRole = "user" | "assistant";
/** LG-B (L30): one text block of the first user turn; only the first block carries the cache mark. */
export type AnthropicTextBlock = Readonly<{ type: "text"; text: string; cache_control?: Readonly<{ type: "ephemeral" }> }>;
type WireTurn = Readonly<{ role: WireRole; content: string | readonly AnthropicTextBlock[] }>;
type JoinedTurn = Readonly<{ role: WireRole; content: string; parts: readonly string[] }>;

/**
 * The packet as this vendor takes it: every system message, in order, joined
 * with a blank line into the one `system` string, and the user/assistant turns
 * in order with consecutive turns of one role joined the same way (the vendor
 * wants the roles to alternate).
 */
function anthropicMessages(messages: PromptPacket["messages"]): Readonly<{
  system: string | null;
  turns: readonly JoinedTurn[];
}> {
  const system: string[] = [];
  const turns: { role: WireRole; content: string; parts: string[] }[] = [];
  for (const message of messages) {
    // Judge review: whitespace-only text is no text (the vendor refuses it); the gate refuses it too.
    if (typeof message.content !== "string" || message.content.trim() === "") {
      throw new TypedDomainError(PROVIDER_PACKET_UNSUPPORTED, "Every message must carry non-empty text");
    }
    if (message.role === "system") {
      system.push(message.content);
      continue;
    }
    if (message.role !== "user" && message.role !== "assistant") {
      throw new TypedDomainError(PROVIDER_PACKET_UNSUPPORTED, "A message role is not user, assistant or system");
    }
    const previous = turns.at(-1);
    if (previous !== undefined && previous.role === message.role) {
      previous.content = `${previous.content}\n\n${message.content}`;
      previous.parts.push(message.content);
    } else {
      turns.push({ role: message.role, content: message.content, parts: [message.content] });
    }
  }
  if (turns.length === 0 || turns[0]!.role !== "user" || turns.at(-1)!.role !== "user") {
    throw new TypedDomainError(
      PROVIDER_PACKET_UNSUPPORTED,
      "The conversation must start and end with a user turn"
    );
  }
  return Object.freeze({
    system: system.length === 0 ? null : system.join("\n\n"),
    turns: Object.freeze(turns.map((turn) => Object.freeze({ role: turn.role, content: turn.content, parts: Object.freeze([...turn.parts]) })))
  });
}

/** LG-B (L30): every turn as the wire takes it; the first user turn as marked blocks (see anthropicCacheableMessages). */
function markFirstUserTurn(turns: readonly JoinedTurn[]): readonly WireTurn[] {
  return Object.freeze(turns.map((turn, index) => index !== 0
    ? Object.freeze({ role: turn.role, content: turn.content })
    : Object.freeze({ role: turn.role, content: Object.freeze(turn.parts.map((part, at) => at === 0
      ? Object.freeze({ type: "text" as const, text: part, cache_control: ANTHROPIC_CACHE_MARK })
      : Object.freeze({ type: "text" as const, text: `\n\n${part}` }))) })));
}

/**
 * Length guidance L30 (owner ruling 2026-10-15; INTERFACE §3.5): the packet's turns with the first user turn as text
 * blocks: the packet's first user message (the fenced debate material) carries the one 5-minute cache mark; each user
 * message the adapter joins after it (a full re-ask's rejection block) is its own unmarked block, its text starting with
 * the blank line the join puts there. The blocks' texts joined give today's joined turn byte for byte; every other
 * turn is today's string. The gate allows at most 4 such blocks (preview_budget_helper.py messages_valid).
 */
export function anthropicCacheableMessages(messages: PromptPacket["messages"]): readonly WireTurn[] {
  return markFirstUserTurn(anthropicMessages(messages).turns);
}

/** `output_config` for a level, or nothing at DEFAULT_ONLY; any other level is refused. */
function effortMember(thinkingLevel: string): Readonly<Record<string, unknown>> {
  if (thinkingLevel === THINKING_LEVEL_DEFAULT_ONLY) return Object.freeze({});
  if (!(ANTHROPIC_EFFORT_LEVELS as readonly string[]).includes(thinkingLevel)) {
    throw new TypedDomainError(
      "PROVIDER_THINKING_LEVEL_UNSUPPORTED",
      "This connection cannot set the requested thinking level"
    );
  }
  return Object.freeze({ output_config: { effort: thinkingLevel } });
}

/**
 * THE REQUEST BODY, exactly the contract's members in the contract's order.
 * `thinkingLevel` is the level the shared loop resolved (DEFAULT_ONLY when none
 * was asked).
 */
export function anthropicMessagesRequestBody(input: Readonly<{
  model: string;
  maxTokens: number;
  thinkingLevel: string;
  messages: PromptPacket["messages"];
  /** LG-B (L30): the first user turn as marked blocks (anthropicCacheableMessages). Absent or false: today's body. */
  cacheFirstUserTurn?: boolean;
}>): string {
  const { system, turns } = anthropicMessages(input.messages);
  return JSON.stringify({
    model: input.model,
    max_tokens: input.maxTokens,
    messages: input.cacheFirstUserTurn === true ? markFirstUserTurn(turns) : turns.map((turn) => ({ role: turn.role, content: turn.content })),
    ...(system === null ? {} : { system: anthropicCacheableSystem(system) }),
    ...effortMember(input.thinkingLevel)
  });
}

/**
 * THE HEADERS. The target's custody-read credential is the bare API key and goes
 * out as `x-api-key`, never as `authorization`. With no credential (the preview,
 * where the root gate adds the key) no key header is sent at all.
 */
export function anthropicMessagesRequestHeaders(credential: string | undefined): Record<string, string> {
  return {
    "content-type": "application/json",
    "anthropic-version": ANTHROPIC_API_VERSION,
    ...(credential === undefined ? {} : { "x-api-key": credential })
  };
}

/**
 * The credential must be the bare key: one run of printable ASCII with no space.
 * A value that still carries an HTTP auth scheme ("Bearer …") is a file written
 * for the other adapter; sending it would fail at the vendor on every call, so
 * it is refused where it is configured. The refusal names nothing of the value.
 */
const BARE_KEY = /^[\x21-\x7e]+$/u;

export function assertAnthropicCredentialShape(credential: string | undefined): void {
  if (credential === undefined) return;
  if (typeof credential !== "string" || !BARE_KEY.test(credential)) {
    throw new TypeError("PROVIDER_GATEWAY_CREDENTIAL_INVALID");
  }
}

/**
 * Review fix, 2026-10-10 — THE KIND AND THE HOST, TIED BOTH WAYS. `native` says
 * whether the target or gateway speaks this wire; `baseUrl` is its normalised
 * base URL. Returns false when the pair is not lawful:
 *  · this wire on anything but exactly `ANTHROPIC_MESSAGES_BASE_URL`;
 *  · any other wire on the Anthropic API host.
 */
/** Drops every trailing "/" in one backward pass (CodeQL js/polynomial-redos: `/\/+$/` is quadratic on many "/"). */
function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) end -= 1;
  return url.slice(0, end);
}

export function isAnthropicHostPairing(native: boolean, baseUrl: string): boolean {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase().replace(/\.$/u, "");
  } catch {
    // Not a URL: never this wire's base URL, and not the Anthropic host either.
    return !native;
  }
  return native
    ? trimTrailingSlashes(baseUrl) === ANTHROPIC_MESSAGES_BASE_URL
    : host !== ANTHROPIC_API_HOST;
}

/**
 * A target or gateway on this wire may only declare `reasoning_effort` (the
 * vendor-API family; this wire carries it as `output_config.effort`) and only
 * the levels in `ANTHROPIC_EFFORT_LEVELS`. `x_thinking_level` is the CLI relays'
 * spelling and no vendor speaks it.
 */
export function isAnthropicThinkingControl(
  control: Readonly<{ parameter: string; levels: readonly string[] }> | undefined
): boolean {
  return control === undefined || (control.parameter === "reasoning_effort"
    && control.levels.every((level) => (ANTHROPIC_EFFORT_LEVELS as readonly string[]).includes(level)));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_USAGE_COUNTER;
}

/**
 * THE USAGE, in the engine's shape (`prompt_tokens` / `completion_tokens` /
 * `total_tokens`, the members `@debateai/budget` charges from):
 *  · input = `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`
 *    (the two cache members count as zero when absent or null);
 *  · output = `output_tokens`, which already includes the thinking tokens;
 *  · F4: the cache parts the vendor named (`cache_creation_input_tokens`, its 1-hour part from `cache_creation`, and
 *    `cache_read_input_tokens`), so the charge prices each at its own rate.
 * A counter that is missing or malformed is passed on as -1 (or as the bad
 * value itself), so the shared strict parse names it PROVIDER_USAGE_INVALID and
 * the charge falls back to this attempt's projected maximum — never to zero.
 * The vendor's own split stays readable in the raw artifact, which keeps the
 * reply body byte for byte.
 */
export function anthropicUsageAsEngineUsage(usage: unknown): unknown {
  if (usage === undefined || usage === null) return undefined;
  if (!isRecord(usage)) return { prompt_tokens: -1, completion_tokens: -1 };
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  const cacheParts = [usage.cache_creation_input_tokens, usage.cache_read_input_tokens];
  const promptValid = isCounter(input) && cacheParts.every((part) => part === undefined || part === null || isCounter(part));
  const prompt = promptValid
    ? input + cacheParts.reduce<number>((sum, part) => sum + (isCounter(part) ? part : 0), 0)
    : -1;
  const completion = isCounter(output) ? output : -1;
  // Owner answer F4 (2026-10-30): the person's quota counts cache writes and reads at the price the vendor bills, so
  // the parts the vendor named travel on to the charge (packages/budget/src/cost-envelope.ts cacheParts). Only when the
  // prompt count was read, and only the non-zero members the vendor sent (a zero part prices nothing); the strict usage
  // parse strips them (C-I1), so the raw
  // artifact's usage keeps the engine's three counters.
  const write = usage.cache_creation_input_tokens;
  const read = usage.cache_read_input_tokens;
  const split = usage.cache_creation;
  const hour = isRecord(split) && isCounter(split.ephemeral_1h_input_tokens) && isCounter(split.ephemeral_5m_input_tokens)
    && isCounter(write) && split.ephemeral_1h_input_tokens + split.ephemeral_5m_input_tokens === write
    ? split.ephemeral_1h_input_tokens : undefined;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    ...(prompt >= 0 && completion >= 0 ? { total_tokens: prompt + completion } : {}),
    ...(prompt >= 0 && isCounter(write) && write > 0 ? { cache_creation_input_tokens: write } : {}),
    // The 1-hour part whenever the vendor split a write (0 included): without it the charge prices every write as 1-hour.
    ...(prompt >= 0 && isCounter(write) && write > 0 && hour !== undefined ? { cache_creation_1h_input_tokens: hour } : {}),
    ...(prompt >= 0 && isCounter(read) && read > 0 ? { cache_read_input_tokens: read } : {})
  };
}

/**
 * Stop reasons that end a usable answer, and the one that means it was cut off
 * at `max_tokens`. A context-window stop is NOT a truncation: a retry under a
 * raised `max_tokens` cannot fit a prompt that already filled the window, so it
 * is a plain unusable reply (review fix, 2026-10-10).
 */
const COMPLETE_STOP_REASONS: ReadonlySet<string> = new Set(["end_turn", "stop_sequence"]);
const TRUNCATED_STOP_REASONS: ReadonlySet<string> = new Set(["max_tokens"]);
/**
 * A `message` reply was billed. When it carries no usage at all, the counts are
 * passed on as unreadable rather than absent, so the charge falls back to this
 * attempt's projected maximum and the strict parse names PROVIDER_USAGE_INVALID —
 * never a billed reply charged as zero (review fix, 2026-10-10).
 */
const UNREPORTED_BILLED_USAGE = Object.freeze({ prompt_tokens: -1, completion_tokens: -1 });
const IGNORED_BLOCK_TYPES: ReadonlySet<string> = new Set(["thinking", "redacted_thinking"]);

export type AnthropicMessagesReply = Readonly<{
  /**
   * The reply in the shape the shared loop reads (`id`, `model`, `usage`,
   * `choices[0].message.content`, `choices[0].finish_reason`). A body that is not
   * a message yields no `choices`, so the loop's strict parse refuses it exactly
   * as it refuses a malformed OpenAI-compatible body.
   */
  normalized: unknown;
  /** A refusal or an unusable reply, raised by the loop AFTER the call is recorded and charged. */
  failure: TypedDomainError | null;
}>;

/**
 * THE REPLY. Text = every `text` block joined in order; `thinking` and
 * `redacted_thinking` blocks are ignored; any other block (a tool call above
 * all) is PROVIDER_REPLY_UNSUPPORTED. `max_tokens` becomes the engine's
 * `length` finish reason, so a cut-off answer takes the same truncation path as
 * an OpenAI-compatible one; `refusal` is PROVIDER_CONTENT_REFUSED. The model id
 * is passed through untouched for the loop's identity check.
 */
export function readAnthropicMessagesReply(decoded: unknown): AnthropicMessagesReply {
  if (!isRecord(decoded)) return Object.freeze({ normalized: decoded, failure: null });
  const usage = anthropicUsageAsEngineUsage(decoded.usage)
    ?? (decoded.type === "message" ? { ...UNREPORTED_BILLED_USAGE } : undefined);
  const base = {
    ...(decoded.id === undefined ? {} : { id: decoded.id }),
    ...(decoded.model === undefined ? {} : { model: decoded.model }),
    ...(usage === undefined ? {} : { usage })
  };
  if (decoded.type !== "message" || decoded.role !== "assistant" || !Array.isArray(decoded.content)) {
    return Object.freeze({ normalized: base, failure: null });
  }
  let text = "";
  let unsupportedBlock = false;
  for (const block of decoded.content as readonly unknown[]) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      text += block.text;
    } else if (!(isRecord(block) && typeof block.type === "string" && IGNORED_BLOCK_TYPES.has(block.type))) {
      unsupportedBlock = true;
    }
  }
  const stopReason = typeof decoded.stop_reason === "string" ? decoded.stop_reason : null;
  const truncated = stopReason !== null && TRUNCATED_STOP_REASONS.has(stopReason);
  const finishReason = truncated ? "length" : stopReason;
  const failure = unsupportedBlock
    ? new TypedDomainError(PROVIDER_REPLY_UNSUPPORTED, "The reply carried a content block this engine never asked for")
    : stopReason === "refusal"
      ? new TypedDomainError(PROVIDER_CONTENT_REFUSED, "The provider declined to answer")
      : stopReason === null || (!truncated && !COMPLETE_STOP_REASONS.has(stopReason))
        ? new TypedDomainError(PROVIDER_REPLY_UNSUPPORTED, "The reply ended for a reason this engine cannot use")
        : null;
  return Object.freeze({
    normalized: {
      ...base,
      choices: [{ message: { content: text }, finish_reason: finishReason }]
    },
    failure
  });
}

/**
 * The discovery probe's request on this wire: the same one-line question the
 * OpenAI-compatible probe asks, as a Messages body.
 */
export function anthropicMessagesProbeRequest(input: Readonly<{
  model: string;
  /** Always given: the probe owns its default room (provider-probe.ts), one number for both wires. */
  maxTokens: number;
  thinkingLevel: string | undefined;
  credential: string | undefined;
  prompt: string;
}>): Readonly<{ path: string; headers: Record<string, string>; body: string }> {
  assertAnthropicCredentialShape(input.credential);
  return Object.freeze({
    path: ANTHROPIC_MESSAGES_PATH,
    headers: anthropicMessagesRequestHeaders(input.credential),
    body: anthropicMessagesRequestBody({
      model: input.model,
      maxTokens: input.maxTokens,
      thinkingLevel: input.thinkingLevel ?? THINKING_LEVEL_DEFAULT_ONLY,
      messages: [{ role: "user", content: input.prompt }]
    })
  });
}

/**
 * The probe's reading of a reply: the echoed model, the answer text, how it ended ("length" when cut off at
 * max_tokens) and whether the model declined; null when the reply is not a message this wire can use. Probe failure
 * reasons (2026-10-12): the probe records which of these ended it (provider-probe.ts).
 */
export function anthropicMessagesProbeAnswer(decoded: unknown): Readonly<{
  model: unknown; text: string; finishReason: string | null; refused: boolean;
}> | null {
  const reply = readAnthropicMessagesReply(decoded);
  if (!isRecord(reply.normalized)) return null;
  const refused = reply.failure?.code === PROVIDER_CONTENT_REFUSED;
  if (reply.failure !== null && !refused) return null;
  const choices = reply.normalized.choices;
  if (!Array.isArray(choices) || choices.length !== 1) return null;
  const choice = choices[0] as Readonly<{ message: { content: string }; finish_reason: string | null }>;
  return Object.freeze({ model: reply.normalized.model, text: choice.message.content, finishReason: choice.finish_reason, refused });
}
