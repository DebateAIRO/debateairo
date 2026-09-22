import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";

// T9 (goal 232-235): SYNTHESIZER and EVALUATOR are NAMED PROVIDER ROLES,
// not organ aliases. A debater's model may hold either role; the CALL is
// fresh-context, and the ledger records which role made it under its own
// name rather than under COMPOSER/CONFORMANCE, which mean other things.
export const MODEL_ROLES = [
  "JUDGE", "COMPOSER", "CONFORMANCE", "CLASSIFIER", "SYNTHESIZER", "EVALUATOR"
] as const;
export type TypedRole = typeof MODEL_ROLES[number];
export type Lane = "served" | "uniform-panel" | "critic-exempt" | "evaluator";

export interface CallBound {
  readonly maxAttempts: number;
  readonly tokenCeiling: number;
  readonly deadlineMs: number;
}

export interface PromptPacket {
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
}

export type ContentClassification =
  | { readonly parseStatus: "PARSED"; readonly parseError: null }
  | { readonly parseStatus: "PARSE_FAILED" | "SCHEMA_FAILED"; readonly parseError: string };

/**
 * W10/1 (`board/W10-call-budget-truthfulness.md`, audit
 * `audits/token-budget-reasoning.md`): the OpenAI-compatible completion that
 * was cut off at `max_tokens` reports it, and until this row existed nobody
 * read it. A truncated body fails the contract classifier exactly as bad JSON
 * does, so the two were recorded under one name and a length failure looked
 * like a model that cannot follow a schema.
 */
export const PROVIDER_FINISH_REASON_LENGTH = "length" as const;
export const PROVIDER_CONTENT_LENGTH_EXCEEDED = "LENGTH_EXCEEDED" as const;

/**
 * How a provider's content was REFUSED. `LENGTH_EXCEEDED` is its own member and
 * is never collapsed into `PARSE_FAILED`.
 *
 * It is deliberately NOT a `raw_artifact.parse_status` value: that column's
 * CHECK constraint seals four names (`migrations/0004_s04.sql:14-21`) and the
 * erasure-redaction constraint pins their `parse_error` pairs
 * (`migrations/0040_account_erasure.sql:338-340`). Widening the column is a
 * migration this ticket does not own, so the truncation travels on the typed
 * refusal and in the artifact's unconstrained `metadata.finish_reason`.
 */
export type ProviderContentRejectionStatus =
  | "PARSE_FAILED"
  | "SCHEMA_FAILED"
  | typeof PROVIDER_CONTENT_LENGTH_EXCEEDED;

export interface RejectedProviderContent {
  readonly rawText: string;
  readonly parseStatus: ProviderContentRejectionStatus;
  readonly parseError: string;
}

export interface ProviderCallRequest {
  readonly runId: string | null;
  readonly subjectItemId: string;
  readonly callSiteKey: string;
  readonly role: TypedRole;
  readonly lane: Lane;
  readonly bound: CallBound;
  readonly contractHash: string;
  readonly providerRef: string;
  readonly packet: PromptPacket;
  readonly classifyContent?: (content: string) => ContentClassification;
  readonly buildRepairPacket?: (rejected: RejectedProviderContent) => PromptPacket;
  /**
   * L4-F8: re-evaluated before EVERY attempt, so a run-wide model-attempt ceiling checked once
   * by the caller cannot be overshot by the gateway's own retry/repair loop. It throws to refuse;
   * the refusal propagates untouched and no ledger row is written for the refused attempt.
   * May be asynchronous: the shipped composition consults the run's pinned ceiling in the
   * database (DL4-F3).
   */
  readonly assertAttemptAllowed?: () => void | Promise<void>;
}

export class ProviderCallFailedError extends TypedDomainError {
  override readonly code = "PROVIDER_CALL_FAILED";
  override readonly cause: unknown;

  constructor(
    cause: unknown,
    readonly attempts: number,
    readonly lastOutcome: "TIMED_OUT" | "FAILED",
    readonly lastLedgerEntryRef: string
  ) {
    super("PROVIDER_CALL_FAILED", "PROVIDER_CALL_FAILED");
    this.name = "ProviderCallFailedError";
    this.cause = cause;
  }
}

export class ProviderContentUnacceptedError extends TypedDomainError {
  override readonly code = "PROVIDER_CONTENT_UNACCEPTED";

  constructor(
    readonly attempts: number,
    readonly lastParseStatus: ProviderContentRejectionStatus,
    readonly lastParseError: string,
    readonly lastRawArtifactRef: string,
    readonly lastLedgerEntryRef: string
  ) {
    super("PROVIDER_CONTENT_UNACCEPTED", lastParseError);
    this.name = "ProviderContentUnacceptedError";
  }
}

export interface ProviderCallResult {
  readonly rawArtifactRef: string;
  readonly ledgerEntryRef: string;
  readonly content: string;
  readonly provider: "openai-compatible-http";
  readonly model: string;
  readonly maker: string;
  readonly modelVersion: string;
}

export interface ProviderGateway {
  call(request: ProviderCallRequest): Promise<ProviderCallResult>;
}

const MAX_PROVIDER_TARGETS = 32;
const MAX_PROVIDER_TARGET_CONFIG_BYTES = 64 * 1024;

export type ProviderDiscoveryTarget = Readonly<{
  providerRef: string;
  maker: string;
  baseUrl: string;
  model: string;
  authorizationHeader?: string;
  /**
   * V-9(2) / task 10b: an absolute path to the vendor's credential FILE, one per
   * vendor per environment. It is the DECLARED form; `resolveProviderTargetCredentials`
   * turns it into `authorizationHeader` in memory and drops the path, so nothing
   * downstream can re-open it and no gateway carries a file name.
   */
  authorizationFile?: string;
}>;

function requiredProviderTargetText(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim() === "" || value !== value.trim()) {
    throw new TypeError(code);
  }
  return value;
}

function normalizedProviderBaseUrl(value: unknown): string {
  const source = requiredProviderTargetText(
    value,
    "PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID"
  );
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID");
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:")
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== "") {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  if (!parsed.pathname.endsWith("/v1")) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID");
  }
  return parsed.toString().replace(/\/$/u, "");
}

export function parseProviderDiscoveryTargets(
  source: string,
  configuredProviders: readonly Readonly<{ providerRef: string; maker: string }>[]
): readonly ProviderDiscoveryTarget[] {
  if (Buffer.byteLength(source, "utf8") > MAX_PROVIDER_TARGET_CONFIG_BYTES) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
  }
  if (!Array.isArray(decoded) || decoded.length < 1 || decoded.length > MAX_PROVIDER_TARGETS) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
  }
  const configuredByRef = new Map<string, string>();
  for (const configured of configuredProviders) {
    const providerRef = requiredProviderTargetText(
      configured.providerRef,
      "CONFIGURED_PROVIDER_INVALID"
    );
    const maker = requiredProviderTargetText(configured.maker, "CONFIGURED_PROVIDER_INVALID");
    if (configuredByRef.has(providerRef)) throw new TypeError("CONFIGURED_PROVIDER_DUPLICATE");
    configuredByRef.set(providerRef, maker);
  }
  const targetsByRef = new Map<string, ProviderDiscoveryTarget>();
  for (const candidate of decoded) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
    }
    const row = candidate as Readonly<Record<string, unknown>>;
    if (Object.keys(row).some((key) => ![
      "provider_ref", "base_url", "model", "authorization_header", "authorization_file"
    ].includes(key))) {
      throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
    }
    const providerRef = requiredProviderTargetText(
      row.provider_ref,
      "PROVIDER_DISCOVERY_TARGET_PROVIDER_REF_INVALID"
    );
    if (targetsByRef.has(providerRef)) {
      throw new TypeError("PROVIDER_DISCOVERY_TARGET_DUPLICATE");
    }
    const maker = configuredByRef.get(providerRef);
    if (maker === undefined) throw new TypeError("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
    const authorizationHeader = row.authorization_header === undefined
      ? undefined
      : requiredProviderTargetText(
          row.authorization_header,
          "PROVIDER_DISCOVERY_AUTHORIZATION_INVALID"
        );
    // V-9(2): a vendor's credential is named ONE way. Two declarations are an
    // operator's half-finished migration off the inline form, and guessing which
    // one is live is exactly how a retired key keeps being used.
    if (authorizationHeader !== undefined && row.authorization_file !== undefined) {
      throw new TypeError("PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT");
    }
    const authorizationFile = row.authorization_file === undefined
      ? undefined
      : requiredProviderTargetText(
          row.authorization_file,
          "PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID"
        );
    // Absolute, because a credential resolved against whatever directory the
    // unit happened to start in is not a credential anyone can audit.
    if (authorizationFile !== undefined && !authorizationFile.startsWith("/")) {
      throw new TypeError("PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID");
    }
    targetsByRef.set(providerRef, Object.freeze({
      providerRef,
      maker,
      baseUrl: normalizedProviderBaseUrl(row.base_url),
      model: requiredProviderTargetText(row.model, "PROVIDER_DISCOVERY_TARGET_MODEL_INVALID"),
      ...(authorizationHeader === undefined ? {} : { authorizationHeader }),
      ...(authorizationFile === undefined ? {} : { authorizationFile })
    }));
  }
  if (targetsByRef.size !== configuredByRef.size) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
  }
  return Object.freeze([...configuredByRef.keys()].map((providerRef) => {
    const target = targetsByRef.get(providerRef);
    if (target === undefined) throw new TypeError("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
    return target;
  }));
}

/**
 * The four exact spellings L4-F7 has always PERMITTED as a cleartext relay host.
 *
 * It stays a narrow permit-list ON PURPOSE. Widening it would ADMIT more `http:`
 * targets in a local production deployment, which relaxes a floor; the hosted
 * rule below is a DENY-list, where the broad reading is the strict one. Two sets,
 * opposite polarity, each chosen so that the stricter reading wins.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

/** 8 groups of an IPv6 address, or `undefined` if `value` is not one. */
function ipv6Groups(value: string): readonly number[] | undefined {
  if (!value.includes(":")) return undefined;
  let text = value;
  // A trailing dotted-quad (`::ffff:127.0.0.1`) is two more groups.
  const dotted = /:((?:\d{1,3}\.){3}\d{1,3})$/u.exec(text);
  if (dotted !== null) {
    const octets = ipv4Octets(dotted[1]!);
    if (octets === undefined) return undefined;
    const high = ((octets[0]! << 8) | octets[1]!).toString(16);
    const low = ((octets[2]! << 8) | octets[3]!).toString(16);
    text = `${text.slice(0, dotted.index)}:${high}:${low}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const part = (half: string) => (half === "" ? [] : half.split(":"));
  const head = part(halves[0]!);
  const tail = halves.length === 2 ? part(halves[1]!) : [];
  const explicit = [...head, ...tail];
  if (explicit.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return undefined;
  if (halves.length === 1) {
    return explicit.length === 8 ? explicit.map((group) => Number.parseInt(group, 16)) : undefined;
  }
  if (explicit.length > 7) return undefined;
  return [
    ...head.map((group) => Number.parseInt(group, 16)),
    ...Array.from({ length: 8 - explicit.length }, () => 0),
    ...tail.map((group) => Number.parseInt(group, 16))
  ];
}

/** Four octets of a dotted-quad, or `undefined`. Node canonicalises every other IPv4 form to this. */
function ipv4Octets(value: string): readonly number[] | undefined {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(value);
  if (match === null) return undefined;
  const octets = match.slice(1, 5).map((part) => Number(part));
  return octets.every((octet) => octet <= 255) ? octets : undefined;
}

/**
 * V-9(c), review finding 1 — "is this address THIS MACHINE?", decided on the
 * PARSED address rather than on the spelling.
 *
 * The four-spelling permit-list above, read as a deny-list, admitted every alias
 * of loopback: `127.0.0.2`, `127.1`, `localhost.`, `relay.localhost`,
 * `[::ffff:127.0.0.1]` (which Node normalises to `[::ffff:7f00:1]`), `0.0.0.0`
 * and `[::]`. `https:` is no backstop on a host that installs its own CA
 * (`NODE_EXTRA_CA_CERTS`) and already runs internal TLS on loopback, so a TLS
 * relay on any of those aliases would have passed the hosted check.
 *
 * Refused: the whole `127.0.0.0/8` range, the unspecified addresses `0.0.0.0` and
 * `::`, `::1`, an IPv4-mapped or IPv4-compatible IPv6 form of either, and the
 * name `localhost` or anything under `.localhost` (RFC 6761 reserves it for this
 * machine). Case and one trailing dot are normalised away first.
 *
 * NOT refused: a real vendor whose name merely looks loopback-ish, such as
 * `127.0.0.1.vendor.example` or `notlocalhost.example`. A deny-list that refused
 * those would be an outage rather than a protection.
 */
export function isThisMachineHost(hostname: string): boolean {
  const bare = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const host = bare.toLowerCase().replace(/\.$/u, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const octets = ipv4Octets(host);
  if (octets !== undefined) {
    return octets[0] === 127 || octets.every((octet) => octet === 0);
  }
  const groups = ipv6Groups(host);
  if (groups === undefined) return false;
  if (groups.every((group) => group === 0)) return true;
  const leadingZeroes = groups.slice(0, 5).every((group) => group === 0);
  if (leadingZeroes && groups[5] === 0 && groups[6] === 0 && groups[7] === 1) return true;
  // `::ffff:a.b.c.d` (mapped) and `::a.b.c.d` (compatible) both carry an IPv4
  // address in the last two groups; neither may reach this machine either.
  if (leadingZeroes && (groups[5] === 0xffff || groups[5] === 0)) {
    return (groups[6]! >> 8) === 127 || (groups[6] === 0 && groups[7] === 0);
  }
  return false;
}

/**
 * L4-F7: in production a cleartext `http:` base URL may only point at a loopback relay; any
 * other `http:` target would carry the bearer `authorization_header` and every prompt off-box
 * unencrypted. `https:` targets and non-production environments are untouched.
 *
 * V-9(c): this is the LOCAL deployment's floor and nothing else. Local mode is a supported
 * product path — the command-line relays and loopback model servers — so loopback `http:` stays
 * lawful here, byte-for-byte as before the mode existed. The hosted deployment's own rule is
 * `assertHostedProviderTargets`, and `assertDeploymentProviderTargets` picks between them.
 */
export function assertProductionProviderTargets(
  targets: readonly ProviderDiscoveryTarget[],
  nodeEnv: string | undefined
): void {
  if (nodeEnv !== "production") return;
  for (const target of targets) {
    const parsed = new URL(target.baseUrl);
    if (parsed.protocol === "http:" && !LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new TypeError(`PROVIDER_BASE_URL_TLS_REQUIRED:${target.providerRef}`);
    }
  }
}

/**
 * V-9(c) / task 10a — the HOSTED deployment's provider rule.
 *
 * The commercial website reaches paid vendor APIs and nothing else:
 *
 * - every base URL is `https:` — a cleartext hop would carry the vendor credential and every
 *   prompt in the clear, and there is no loopback exception here (see below);
 * - no target that resolves to THIS MACHINE (`isThisMachineHost`, decided on the parsed address
 *   and not on the spelling) — a relay or a local model server on the web server is precisely the
 *   local-mode path V ruled must not run hosted (V-30(1) says the same for the support chat);
 * - no credential inline in `PROVIDER_DISCOVERY_TARGETS_JSON`. Hosted credentials live in
 *   custody-checked FILES (`authorization_file`, task 10b), so a bearer token can never sit in
 *   an `EnvironmentFile`, in `/proc/<pid>/environ` or in a process listing.
 *
 * Every refusal names the provider ref and NOTHING of the credential.
 */
export function assertHostedProviderTargets(
  targets: readonly ProviderDiscoveryTarget[]
): void {
  for (const target of targets) {
    const parsed = new URL(target.baseUrl);
    if (parsed.protocol !== "https:") {
      throw new TypeError(`PROVIDER_BASE_URL_TLS_REQUIRED:${target.providerRef}`);
    }
    if (isThisMachineHost(parsed.hostname)) {
      throw new TypeError(`PROVIDER_TARGET_LOOPBACK_REFUSED:${target.providerRef}`);
    }
    if (target.authorizationHeader !== undefined) {
      throw new TypeError(`PROVIDER_INLINE_CREDENTIAL_REFUSED:${target.providerRef}`);
    }
  }
}

/**
 * The ONE decision both shipped composition roots take over their parsed targets. The mode comes
 * from the register loader (`DEPLOYMENT_MODE`), so it is resolved before the first target is read.
 */
export function assertDeploymentProviderTargets(
  targets: readonly ProviderDiscoveryTarget[],
  deployment: Readonly<{ mode: "hosted" | "local"; nodeEnv: string | undefined }>
): void {
  if (deployment.mode === "hosted") {
    assertHostedProviderTargets(targets);
    return;
  }
  assertProductionProviderTargets(targets, deployment.nodeEnv);
}

/**
 * Nothing was provisioned at the declared path. It gets its OWN top-level
 * refusal rather than a line in the `UNUSABLE` bucket, because the operator
 * action differs: provision the file, rather than inspect the one that is there.
 */
const PROVIDER_CREDENTIAL_ABSENT_CODE = "PROVIDER_CREDENTIAL_FILE_ABSENT";

/** The refusal codes `resolveProviderTargetCredentials` will repeat; anything else is UNKNOWN. */
const PROVIDER_CREDENTIAL_REFUSAL_CODES = Object.freeze([
  "SECRET_CUSTODY_INVALID",
  "KEK_UNRESOLVED",
  "CUSTODY_GROUP_UNRESOLVED",
  "PROVIDER_CREDENTIAL_FILE_INVALID"
] as const);

/** One printable header line — the same shape `@debateai/crypto` enforces on the file. */
const PRINTABLE_HEADER_LINE = /^[\x20-\x7e]+$/u;

function providerCredentialRefusalCode(error: unknown): string {
  const code = (error as Readonly<{ code?: unknown }>)?.code;
  return typeof code === "string"
    && (PROVIDER_CREDENTIAL_REFUSAL_CODES as readonly string[]).includes(code)
    ? code
    : "UNKNOWN";
}

/**
 * V-9(2) / task 10b — the ONE place a declared credential FILE becomes an
 * in-memory `authorization` header.
 *
 * `readAuthorizationHeader` is the seam: the shipped composition roots pass
 * `readCustodyAuthorizationHeader` from `@debateai/crypto`, so the file is read
 * under the same custody contract as every key file and the bytes are zeroed
 * after the header is built. Nothing here opens a file, which is what keeps this
 * decision testable without one.
 *
 * The resolved target DROPS `authorizationFile`: after this, no gateway, probe,
 * log line or error carries a credential path, and nothing downstream can re-open
 * it. A refusal names the provider ref and a code from a CLOSED set — never the
 * path, never the thrown message, never a byte of the credential.
 */
export function resolveProviderTargetCredentials(
  targets: readonly ProviderDiscoveryTarget[],
  readAuthorizationHeader: (path: string) => string
): readonly ProviderDiscoveryTarget[] {
  return Object.freeze(targets.map((target) => {
    if (target.authorizationFile === undefined) return target;
    const { authorizationFile, ...rest } = target;
    let authorizationHeader: string;
    try {
      authorizationHeader = readAuthorizationHeader(authorizationFile);
    } catch (error) {
      if ((error as Readonly<{ code?: unknown }>)?.code === PROVIDER_CREDENTIAL_ABSENT_CODE) {
        throw new TypeError(`PROVIDER_AUTHORIZATION_FILE_ABSENT:${target.providerRef}`);
      }
      throw new TypeError(
        `PROVIDER_AUTHORIZATION_FILE_UNUSABLE:${target.providerRef}:${providerCredentialRefusalCode(error)}`
      );
    }
    if (typeof authorizationHeader !== "string"
      || !PRINTABLE_HEADER_LINE.test(authorizationHeader)
      || authorizationHeader !== authorizationHeader.trim()) {
      throw new TypeError(
        `PROVIDER_AUTHORIZATION_FILE_UNUSABLE:${target.providerRef}:PROVIDER_CREDENTIAL_FILE_INVALID`
      );
    }
    return Object.freeze({ ...rest, authorizationHeader });
  }));
}

export interface ProviderAdapterRegistration {
  readonly providerRef: string;
  readonly adapterKind: string;
  readonly maker: string;
}

export const BUILT_IN_PROVIDER_ADAPTERS = Object.freeze([
  Object.freeze({ adapterKind: "openai-compatible-http", implementation: "OpenAICompatibleProviderGateway" }),
  Object.freeze({ adapterKind: "vllm-openai-compatible-http", implementation: "VllmOpenAICompatibleProviderGateway" })
] as const);

export function selectProviderAdapter(
  providerRef: string,
  configured: readonly ProviderAdapterRegistration[]
): ProviderAdapterRegistration {
  const selected = configured.find((candidate) => candidate.providerRef === providerRef);
  if (selected === undefined) throw new TypeError(`Configured provider is unresolved: ${providerRef}`);
  if (selected.maker.trim().length === 0 || selected.adapterKind.trim().length === 0) {
    throw new TypeError(`Configured provider has incomplete adapter metadata: ${providerRef}`);
  }
  return Object.freeze({ ...selected });
}

export interface RawArtifactInput {
  readonly artifactId: string;
  readonly attemptId: string;
  readonly runId: string | null;
  readonly providerRef: string;
  readonly provider: "openai-compatible-http";
  readonly model: string;
  readonly maker: string;
  readonly modelVersion: string | null;
  readonly rawText: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly parseStatus: "PARSED" | "UNPARSED" | "PARSE_FAILED" | "SCHEMA_FAILED";
  readonly parseError?: string | null;
  readonly inputHash: string;
  readonly contractHash: string;
  readonly contentHash: string;
}

export interface ProviderLedgerInput {
  readonly runId: string | null;
  readonly attemptId: string;
  readonly actionKind: "MODEL_CALL";
  readonly callSiteKey: string;
  readonly subjectItemId: string;
  readonly stanceAtAction: "UNASSIGNED";
  readonly outcome: "OK" | "FAILED" | "TIMED_OUT";
  readonly inputHash: string;
  readonly contractHash: string;
  readonly actorRef: string;
  readonly rawArtifactRef: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date;
}

export interface OpenAICompatibleGatewayOptions {
  readonly endpoint: string;
  readonly model: string;
  readonly maker: string;
  readonly authorizationHeader?: string;
  readonly persistRawArtifact: (artifact: RawArtifactInput) => Promise<string>;
  readonly appendLedgerEntry: (entry: ProviderLedgerInput) => Promise<string>;
  readonly assertNoOpenWriteTransaction: () => void;
  readonly fetchImplementation?: typeof fetch;
  /** L4-F8: seam for the bounded backoff between HTTP attempts; real time by default. */
  readonly sleepImplementation?: (milliseconds: number) => Promise<void>;
}

/** L4-F3: a provider body is streamed and abandoned past this many bytes; nothing of it is persisted. */
const MAX_PROVIDER_RESPONSE_BYTES = 4 * 1024 * 1024;
/**
 * L4-F2: the serialised request packet is bounded before it is sent. The structural ceiling counts
 * attempts, not tokens, so an unbounded packet turns one ask into unbounded model spend. An
 * oversized packet is a refused attempt — recorded, never sent, never retried.
 */
const MAX_PROVIDER_REQUEST_PACKET_BYTES = 256 * 1024;
/** L4-F8: bounded exponential backoff between HTTP attempts — 250 ms x 2^n, capped at 4 s. */
const PROVIDER_BACKOFF_BASE_MS = 250;
const PROVIDER_BACKOFF_CAP_MS = 4_000;
const MAX_PROVIDER_MODEL_CHARS = 256;
const MAX_USAGE_COUNTER = 2 ** 31 - 1;

/** Delay before `attempt` (only attempts after the first back off). */
function providerBackoffMs(attempt: number): number {
  return Math.min(PROVIDER_BACKOFF_BASE_MS * 2 ** (attempt - 2), PROVIDER_BACKOFF_CAP_MS);
}

function realSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, milliseconds); });
}

const usageCounter = z.number().int().min(0).max(MAX_USAGE_COUNTER);
const usageSchema = z.object({
  prompt_tokens: usageCounter.optional(),
  completion_tokens: usageCounter.optional(),
  total_tokens: usageCounter.optional(),
  x_cost_usd: z.number().nonnegative().optional()
}).strict();

const modelIdSchema = z.string().min(1).max(MAX_PROVIDER_MODEL_CHARS);

const responseSchema = z.object({
  id: z.string().min(1),
  model: modelIdSchema,
  usage: usageSchema.nullable().optional(),
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
    // W10/1: carried, never required — a provider that omits it is still a
    // lawful response, and its absence is recorded as absent rather than as
    // "not truncated".
    finish_reason: z.string().nullable().optional()
  })).min(1)
});

/**
 * W10/1: the finish reason read LENIENTLY, off the decoded body, so a response
 * the strict schema rejects still records why it was cut off. The strict parse
 * happens later and throws; this read must survive it.
 */
const observedFinishReasonSchema = z.object({
  choices: z.array(z.object({ finish_reason: z.string().nullable().optional() }).passthrough()).min(1)
}).passthrough();

function observedFinishReason(decoded: unknown): string | null {
  const parsed = observedFinishReasonSchema.safeParse(decoded);
  return parsed.success ? parsed.data.choices[0]!.finish_reason ?? null : null;
}

/**
 * W10/2 (D58 — the outcome is the ticket's, the mechanism is this seat's): the
 * bound a retry asks for after `n` length failures on the same call.
 *
 * At the base a truncation routed to the schema-repair path, which APPENDS a
 * correction and reuses the same bound: attempt 2 had a longer input, the
 * identical `max_tokens`, and the same schema to satisfy — output at least as
 * long as the one just cut. Attempts 2 and 3 were byte-identical requests, so
 * all three calls burned producing one failure, reported as a contract error.
 *
 * The escalation is LINEAR in the number of length failures, so every attempt
 * of a truncating call is distinct and the worst case is bounded by
 * `maxAttempts` (3 attempts → at most 3x the sealed ceiling). The SEALED
 * `tokenCeiling` itself is untouched: this is a per-attempt ask made only after
 * a measured truncation, never a new default.
 */
export function lengthRetryTokenCeiling(sealedTokenCeiling: number, lengthFailures: number): number {
  if (!Number.isInteger(lengthFailures) || lengthFailures < 0) {
    throw new TypeError("PROVIDER_LENGTH_RETRY_FAILURE_COUNT_INVALID");
  }
  return sealedTokenCeiling * (lengthFailures + 1);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function contentParseStatus(content: string): "PARSED" | "UNPARSED" {
  try {
    JSON.parse(content);
    return "PARSED";
  } catch {
    return "UNPARSED";
  }
}

/** Reads the body through its stream and cancels it the moment the cap is crossed (L4-F3). */
async function readBoundedResponseText(response: Response): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_PROVIDER_RESPONSE_BYTES) {
        const refusal = new TypedDomainError(
          "PROVIDER_RESPONSE_TOO_LARGE",
          `Provider response body exceeded ${MAX_PROVIDER_RESPONSE_BYTES} bytes`
        );
        await reader.cancel(refusal);
        throw refusal;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/** Typed refusals for an over-long model id or a usage block outside the four bounded fields (L4-F3). */
function assertBoundedProviderResponse(decoded: unknown): void {
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return;
  const row = decoded as Readonly<Record<string, unknown>>;
  if (typeof row.model === "string" && !modelIdSchema.safeParse(row.model).success) {
    throw new TypedDomainError(
      "PROVIDER_MODEL_INVALID",
      `Provider model id must be 1..${MAX_PROVIDER_MODEL_CHARS} characters`
    );
  }
  if (row.usage !== undefined && row.usage !== null && !usageSchema.safeParse(row.usage).success) {
    throw new TypedDomainError(
      "PROVIDER_USAGE_INVALID",
      "Provider usage may carry only bounded prompt_tokens, completion_tokens, total_tokens and x_cost_usd"
    );
  }
}

export class OpenAICompatibleProviderGateway implements ProviderGateway {
  readonly #options: OpenAICompatibleGatewayOptions;

  constructor(options: OpenAICompatibleGatewayOptions) {
    this.#options = options;
  }

  async call(request: ProviderCallRequest): Promise<ProviderCallResult> {
    this.#options.assertNoOpenWriteTransaction();
    if (!Number.isInteger(request.bound.maxAttempts) || request.bound.maxAttempts < 1) {
      throw new TypeError("CallBound.maxAttempts must be a positive integer");
    }
    const fetcher = this.#options.fetchImplementation ?? fetch;
    const sleep = this.#options.sleepImplementation ?? realSleep;
    let attemptsMade = 0;
    let packetRefused = false;
    let lastError: unknown;
    let lastOutcome: "TIMED_OUT" | "FAILED" = "FAILED";
    let lastLedgerEntryRef = "PROVIDER_LEDGER_ENTRY_UNRESOLVED";
    let attemptPacket = request.packet;
    /** W10/2: how many attempts of THIS call were cut off at the bound. */
    let lengthFailures = 0;
    let lastContentRejection: {
      attempts: number;
      parseStatus: ProviderContentRejectionStatus;
      parseError: string;
      rawArtifactRef: string;
      ledgerEntryRef: string;
    } | null = null;

    for (let attempt = 1; attempt <= request.bound.maxAttempts; attempt += 1) {
      // L4-F8: back off first, then re-check the ceiling, so the decision to spend an attempt is
      // taken on the freshest state rather than on state read up to a backoff ago.
      if (attempt > 1) await sleep(providerBackoffMs(attempt));
      await request.assertAttemptAllowed?.();
      attemptsMade = attempt;
      const attemptTokenCeiling = lengthRetryTokenCeiling(request.bound.tokenCeiling, lengthFailures);
      const inputHash = digest(JSON.stringify(attemptPacket));
      const attemptId = randomUUID();
      const startedAt = new Date();
      let rawArtifactRef: string | null = null;
      let ledgerRecorded = false;
      try {
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (this.#options.authorizationHeader !== undefined) {
          headers.authorization = this.#options.authorizationHeader;
        }
        // The packet cap (L4-F2) is taken on the body actually sent, which carries the
        // per-attempt bound a length retry raised (W10/2).
        const body = JSON.stringify({
          model: this.#options.model,
          max_tokens: attemptTokenCeiling,
          messages: attemptPacket.messages
        });
        if (Buffer.byteLength(body, "utf8") > MAX_PROVIDER_REQUEST_PACKET_BYTES) {
          packetRefused = true;
          throw new TypedDomainError(
            "PROVIDER_PACKET_TOO_LARGE",
            `Provider request packet exceeded ${MAX_PROVIDER_REQUEST_PACKET_BYTES} bytes`
          );
        }
        const response = await fetcher(`${this.#options.endpoint}/chat/completions`, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(request.bound.deadlineMs),
          body
        });
        const rawText = await readBoundedResponseText(response);
        let decoded: unknown;
        try {
          decoded = JSON.parse(rawText);
        } catch {
          decoded = null;
        }
        const candidate = z.object({ id: z.string(), model: modelIdSchema }).passthrough().safeParse(decoded);
        const observedUsage = z.object({ usage: usageSchema.nullable().optional() })
          .passthrough().safeParse(decoded);
        const strict = responseSchema.safeParse(decoded);
        const finishReason = observedFinishReason(decoded);
        const content = strict.success ? strict.data.choices[0]!.message.content : null;
        let classifiedContent: ContentClassification | {
          readonly parseStatus: "UNPARSED";
          readonly parseError: null;
        };
        try {
          classifiedContent = content === null
            ? { parseStatus: "UNPARSED", parseError: null }
            : request.classifyContent?.(content) ?? {
                parseStatus: contentParseStatus(content),
                parseError: null
              };
        } catch (error) {
          classifiedContent = {
            parseStatus: "SCHEMA_FAILED",
            parseError: error instanceof Error ? error.message : String(error)
          };
        }
        rawArtifactRef = await this.#options.persistRawArtifact({
          artifactId: randomUUID(),
          attemptId,
          runId: request.runId,
          providerRef: request.providerRef,
          provider: "openai-compatible-http",
          model: candidate.success ? candidate.data.model : this.#options.model,
          maker: this.#options.maker,
          modelVersion: candidate.success ? candidate.data.model : null,
          rawText,
          metadata: {
            status: response.status,
            attempt,
            usage: observedUsage.success ? observedUsage.data.usage ?? null : null,
            // W10/1: the reason this completion stopped, recorded on EVERY
            // attempt. `raw_artifact.metadata` is unconstrained jsonb, so the
            // truncation is durable even though `parse_status` cannot name it.
            finish_reason: finishReason,
            // W10/2: the bound this attempt actually asked for. Without it the
            // ledger cannot tell a raised retry from a repeat of the attempt
            // that was just cut off.
            token_ceiling: attemptTokenCeiling
          },
          parseStatus: classifiedContent.parseStatus,
          parseError: classifiedContent.parseError,
          inputHash,
          contractHash: request.contractHash,
          contentHash: digest(rawText)
        });
        if (!response.ok) throw new Error(`PROVIDER_HTTP_STATUS_${response.status}`);
        assertBoundedProviderResponse(decoded);
        // W10/1: a refusal that arrived with `finish_reason: "length"` is a
        // TRUNCATION, and it is named as one. The classifier's own verdict
        // (PARSE_FAILED on a half-written object) describes the symptom; the
        // finish reason describes the cause, and only the cause is actionable.
        //
        // W10 fix round 1 (F7): the truncation WINS even when the cut landed
        // before a body the strict response schema will accept. Previously that
        // case fell through to `responseSchema.parse`, which threw and surfaced
        // as PROVIDER_CALL_FAILED — a transport-shaped name for a length
        // failure, which is the very confusion this ticket exists to remove.
        const truncated = finishReason === PROVIDER_FINISH_REASON_LENGTH;
        const contentRejection: {
          readonly parseStatus: ProviderContentRejectionStatus;
          readonly parseError: string;
        } | null =
          classifiedContent.parseStatus === "PARSE_FAILED" || classifiedContent.parseStatus === "SCHEMA_FAILED"
            ? {
                parseStatus: truncated ? PROVIDER_CONTENT_LENGTH_EXCEEDED : classifiedContent.parseStatus,
                parseError: classifiedContent.parseError
              }
            : truncated && !strict.success
              ? {
                  parseStatus: PROVIDER_CONTENT_LENGTH_EXCEEDED,
                  parseError: "The completion was cut off at the token bound before a parseable response body"
                }
              : null;
        if (request.classifyContent !== undefined && contentRejection !== null) {
          const ledgerEntryRef = await this.#options.appendLedgerEntry({
            attemptId,
            runId: request.runId,
            actionKind: "MODEL_CALL",
            callSiteKey: request.callSiteKey,
            subjectItemId: request.subjectItemId,
            stanceAtAction: "UNASSIGNED",
            outcome: "FAILED",
            inputHash,
            contractHash: request.contractHash,
            actorRef: request.providerRef,
            rawArtifactRef,
            startedAt,
            finishedAt: new Date()
          });
          ledgerRecorded = true;
          lastContentRejection = {
            attempts: attempt,
            parseStatus: contentRejection.parseStatus,
            parseError: contentRejection.parseError,
            rawArtifactRef,
            ledgerEntryRef
          };
          if (contentRejection.parseStatus === PROVIDER_CONTENT_LENGTH_EXCEEDED) {
            // W10/2: a truncation is NOT repaired by asking again for the same
            // thing. Appending a correction is strictly counterproductive here
            // — it lengthens the input the model must re-read while the output
            // it owes stays the same — so the next attempt re-sends the
            // ORIGINAL packet under a raised bound.
            lengthFailures += 1;
            attemptPacket = request.packet;
          } else if (attempt < request.bound.maxAttempts && request.buildRepairPacket !== undefined) {
            attemptPacket = request.buildRepairPacket({
              // `content` is the strict parse's, or the raw body when the cut
              // landed before one existed. Either way it is what arrived.
              rawText: content ?? rawText,
              parseStatus: contentRejection.parseStatus,
              parseError: contentRejection.parseError
            });
          }
          continue;
        }
        lastContentRejection = null;
        const responseJson = responseSchema.parse(decoded);
        const ledgerEntryRef = await this.#options.appendLedgerEntry({
          attemptId,
          runId: request.runId,
          actionKind: "MODEL_CALL",
          callSiteKey: request.callSiteKey,
          subjectItemId: request.subjectItemId,
          stanceAtAction: "UNASSIGNED",
          outcome: "OK",
          inputHash,
          contractHash: request.contractHash,
          actorRef: request.providerRef,
          rawArtifactRef,
          startedAt,
          finishedAt: new Date()
        });
        ledgerRecorded = true;
        return {
          rawArtifactRef,
          ledgerEntryRef,
          content: responseJson.choices[0]!.message.content,
          provider: "openai-compatible-http",
          model: responseJson.model,
          maker: this.#options.maker,
          modelVersion: responseJson.model
        };
      } catch (error) {
        lastContentRejection = null;
        lastError = error;
        if (!ledgerRecorded) {
          lastOutcome = error instanceof DOMException && error.name === "TimeoutError" ? "TIMED_OUT" : "FAILED";
          lastLedgerEntryRef = await this.#options.appendLedgerEntry({
          attemptId,
          runId: request.runId,
          actionKind: "MODEL_CALL",
          callSiteKey: request.callSiteKey,
          subjectItemId: request.subjectItemId,
          stanceAtAction: "UNASSIGNED",
          outcome: lastOutcome,
          inputHash,
          contractHash: request.contractHash,
          actorRef: request.providerRef,
          rawArtifactRef,
          startedAt,
          finishedAt: new Date()
          });
        }
      }
      // L4-F2: an oversized packet is deterministic — resending it would burn the ceiling for
      // an identical refusal, so the loop stops on the attempt that refused it.
      if (packetRefused) break;
    }
    if (lastContentRejection !== null) {
      throw new ProviderContentUnacceptedError(
        lastContentRejection.attempts,
        lastContentRejection.parseStatus,
        lastContentRejection.parseError,
        lastContentRejection.rawArtifactRef,
        lastContentRejection.ledgerEntryRef
      );
    }
    throw new ProviderCallFailedError(
      lastError,
      attemptsMade,
      lastOutcome,
      lastLedgerEntryRef
    );
  }
}

export class VllmOpenAICompatibleProviderGateway implements ProviderGateway {
  readonly #delegate: OpenAICompatibleProviderGateway;

  constructor(options: OpenAICompatibleGatewayOptions) {
    this.#delegate = new OpenAICompatibleProviderGateway(options);
  }

  call(request: ProviderCallRequest): Promise<ProviderCallResult> {
    return this.#delegate.call(request);
  }
}

// DR-181/DR-182's provider health probe (moved here by ruling J21 so the API and
// the runner share ONE implementation). See ./provider-probe.ts.
export {
  observeProviderTarget,
  probeTarget,
  type ProviderProbeObservation,
  type ProviderProbeRecorder
} from "./provider-probe.js";
