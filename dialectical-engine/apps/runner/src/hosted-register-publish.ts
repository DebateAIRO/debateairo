/**
 * Task 14b — PUBLISH THE HOSTED DEPLOYMENT REGISTER, without the development seeder.
 *
 * The register is the sealed, versioned settings every service reads at
 * start-up. Until this file, the only caller of `publishGeneral` was the dev
 * seeder, which declares itself `local` and writes the dev relay roster. A
 * hosted VPS had no lawful way to seal its own vendors and cost envelopes.
 *
 * WHAT IS PUBLISHED. One new register version (constraint 5: a publication only
 * ever appends; nothing sealed is edited), composed from:
 *  - every CODE-OWNED row, built by the same builders the seeder uses
 *    (`buildDevelopmentDeploymentRegisterPublicationRows`), byte for byte. That
 *    is not a shortcut: the production runner's own boot reader
 *    (`readDevelopmentRunnerPolicy`) refuses runner rows whose provenance is not
 *    exactly those builders' source refs, so any other composition would publish
 *    a register the hosted runner cannot start on;
 *  - the OPERATOR-OWNED rows, read from the operator's file: the vetted
 *    `configuredProviderSet` (V-9(4), built by `buildConfiguredProviderSetDeploymentRow`),
 *    the `costEnvelopePolicy` (V-28, validated by the register's own schema) and, only
 *    when the file carries the member, the `countryPolicy` (paid plans G2, checked by
 *    the register's own schema and sealed under the file's `sourceRef`). Without the
 *    member the seeder's code-owned `countryPolicy` row is dropped, so that version has
 *    no country gate (A14). Likewise optional, the `taxAuthorities` (paid plans P16a,
 *    checked by the register's own parser); without the member the seeder's code-owned
 *    `taxAuthorities` row is sealed as it is. And optional, the room read's admission budget
 *    `askRoomReads` (paid plans P4-G, go-live row 31): supplied, the code-owned `admissionPolicy`
 *    row is sealed with that one member added (`ask_room_reads`, checked by the register's own
 *    parser); left out, the code-owned row is sealed as it is. A version that seals the budget
 *    band must carry it (ruling C7, `ASK_ROOM_ADMISSION_UNSEALED`). Likewise optional, the
 *    `publicationCheckPolicy` (the pre-publish check's deadline, owner's ruling 2026-10-04,
 *    checked by the register's own parser); without the member the seeder's code-owned row is
 *    sealed as it is.
 *  - optionally, ONE ADDITIVE operator row, `modelScorecard` (A19), read from its
 *    own `--scorecard` file: the owners' approved document, sealed as it is,
 *    under the scorecard's own 64 KiB bound (`MODEL_SCORECARD_MAX_BYTES`, owner
 *    ruling 2026-09-27). It has no code-owned twin by design: a publication without
 *    `--scorecard` seals a version with no scorecard, and asks then keep the
 *    plan rosters. A new scorecard is a new version; the old one stays sealed.
 * The historical bootstrap is imported first, exactly as the seeder imports it,
 * and stays the sealed base: these rows are DEPLOYMENT rows, never bootstrap rows.
 *
 * WHAT IS CHECKED, AND BY WHOSE CODE. Nothing here re-implements a rule. The
 * provider targets the operator will put in `PROVIDER_DISCOVERY_TARGETS_JSON` go
 * through the same three functions both services call at boot
 * (`parseProviderDiscoveryTargets`, `assertDeploymentProviderTargets` in hosted
 * mode, `assertPricedProviderTargets`), so a relay, a loopback or private
 * address, an inline credential, or a missing or zero price refuses HERE with
 * the code the unit would print at boot. After publishing, the readers both
 * services call at boot are run against the new version
 * (`verifyHostedRegisterBootReadiness`).
 *
 * IDEMPOTENT. The publication id is derived from the content and the base, so
 * publishing the same file twice REPLAYS the version that already holds it —
 * the database returns the existing receipt and allocates nothing.
 *
 * Every decision lives here and is tested without a database; the CLI in
 * `./hosted-register-publish-cli.ts` only opens things.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Pool } from "pg";
import { z } from "zod";
import { assertRunCeilingCoversOneCall, costEnvelopeGuardPolicy } from "@debateai/budget";
import { PLAN_TIER_ROSTERS, askQuestionMaxBytes } from "@debateai/contract";
import { custodyAccepts } from "@debateai/crypto";
import { readDeploymentMakerCapability } from "@debateai/critique";
import { firstCallsByPlanRoster, firstPositionCallProjections } from "@debateai/judgement";
import {
  firstCallPlanModels, freeAnswerJobsFollowPaidSiteRule, freeCapsFollowPaidSiteRule, planCapsFollowPaidSiteRule,
  SCORECARD_FREE_ANSWER_UNSCORED, SCORECARD_FREE_CAPS_INVALID, SCORECARD_PLAN_CAPS_INVALID, type PickerSettings,
  type Scorecard
} from "@debateai/scorecard";
import {
  ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND,
  OPENAI_COMPATIBLE_HTTP_ADAPTER_KIND,
  assertDeploymentProviderTargets,
  assertPricedProviderTargets,
  parseProviderDiscoveryTargets,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import {
  ADMISSION_POLICY_ROW_KEY,
  ALGORITHM_REGISTER_ROW_KEYS,
  BILLING_PLANS_ROW_KEY,
  BILLING_POLICY_ROW_KEY,
  CONFIGURED_PROVIDER_SET_ROW_KEY,
  COST_ENVELOPE_POLICY_ROW_KEY,
  COUNTRY_POLICY_ROW_KEY,
  MODEL_SCORECARD_MAX_BYTES,
  MODEL_SCORECARD_ROW_KEY,
  PUBLICATION_CHECK_POLICY_ROW_KEY,
  STORY_ROW_KEYS,
  TAX_AUTHORITIES_ROW_KEY,
  admissionPolicyFromValue,
  assertAskRoomAdmissionSealed,
  assertBillingReady,
  assertHostedCostEnvelopesSealed,
  assertHostedSupportAdmissionSealed,
  billingPlansFromValue,
  billingPolicyFromValue,
  buildConfiguredProviderSetDeploymentRow,
  callTokenCeilingsFromValues,
  computeRegisterSnapshotSha256,
  composeStaffPolicyRegisterPublicationRows,
  parseStaffAccessEnvironment,
  costEnvelopeBand,
  costEnvelopeCeilings,
  costEnvelopePolicyFromValue,
  countryPolicyFromValue,
  createPostgresRegisterPublicationPort,
  judgeTokenCeilingFromValue,
  loadBootstrapRegister,
  modelScorecardFromValue,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  persistBootstrapRegister,
  planCapMicros,
  publicationCheckPolicyFromValue,
  readAdmissionPolicy,
  readAuthPolicy,
  readBillingPlans,
  readBillingPolicy,
  readCostEnvelopePolicy,
  readCountryPolicy,
  readDeploymentRiskTier,
  readEngineVersion,
  readEnvelopeFormulaInputs,
  readMfaPolicy,
  readModelScorecard,
  readPanelDiscoveryPolicy,
  readProductRolePolicy,
  readPublicationCheckPolicy,
  readRecoveryPolicy,
  readSessionPolicy,
  readStoryPolicy,
  readStructuralCeilingPolicyInputs,
  registerVersionToSafeLegacyNumber,
  taxAuthoritiesFromValue,
  warnOnIdenticalSynthesisRoleRefs,
  type AdmissionPolicy,
  type BillingPlans,
  type BillingPolicy,
  type BootstrapRegister,
  type CostEnvelopePolicy,
  type GeneralRegisterPublication,
  type RegisterPublicationReceipt,
  type RegisterPublicationRow,
  type RegisterVersionText,
  type VettedConfiguredProvider
} from "@debateai/register";
import {
  buildDevelopmentDeploymentRegisterPublicationRows,
  deriveSynthesisRoleRefs,
  type DevelopmentSynthesisRoleRefs
} from "./dev-deployment-register.js";
import type { DevelopmentConfiguredProvider } from "./dev-provider-panel.js";
import { readDevelopmentRunnerPolicy } from "./dev-runner-policy.js";

/** The operator file's declared shape. A new shape is a new format string, never a silent change. */
export const HOSTED_REGISTER_FILE_FORMAT = "debateai.hosted-register.v1" as const;
export const HOSTED_REGISTER_DEPLOYMENT_REF = "hosted-register-publication" as const;

/**
 * The kit example's own literals (deploy/vps/register/hosted-register.example.json).
 * A file that still carries ANY of them — the sourceRef, a `vendor:example-`
 * ref, an `Example…` maker, the example vetting date — is the example, or a
 * half-edited copy of it, and is refused on publish (review Minor 3). The date
 * is deliberately one no operator would write for a real review.
 */
export const HOSTED_REGISTER_EXAMPLE_SOURCE_REF =
  "V-28 provisional cost envelopes and V-9 vetted vendors: first hosted register"
  + " (EXAMPLE vendors, replace before publishing)";
export const HOSTED_REGISTER_EXAMPLE_VETTING_DATE = "2000-01-01" as const;
const EXAMPLE_PROVIDER_REF_PREFIX = "vendor:example-";
const EXAMPLE_MAKER_PREFIX = "Example";

const MAX_FILE_BYTES = 64 * 1_024;
// A19: the scorecard file has its OWN bound, `MODEL_SCORECARD_MAX_BYTES` from
// @debateai/register (64 KiB, owner ruling 2026-09-27) — the one constant local
// mode also reads its bundled file under. It equals MAX_FILE_BYTES today by
// ruling, not by coincidence of code: the two can change separately.
const MAX_SOURCE_REF_LENGTH = 512;
const TOP_LEVEL_KEYS = Object.freeze([
  "format", "sourceRef", "configuredProviderSet", "costEnvelopePolicy", "countryPolicy",
  "providerTargets", "synthesisRoles",
  // Paid plans (spec 2026-09-29 §2.5.1): OPTIONAL. Left out, the engine's own
  // rows are sealed (billing OFF); supplied, they supersede them.
  "billingPlans", "billingPolicy",
  // Paid plans P16a: OPTIONAL. Left out, the code-owned taxAuthorities row is sealed as it is.
  "taxAuthorities",
  // Paid plans P4-G (go-live row 31): OPTIONAL, the room read's admission budget. Left out, the
  // code-owned admissionPolicy row is sealed as it is; required with the budget band (ruling C7).
  "askRoomReads",
  // hate-speech S02 (owner, 2026-10-04): OPTIONAL. Left out, the code-owned publicationCheckPolicy row is sealed as it is.
  "publicationCheckPolicy"
] as const);
const OPERATOR_ROW_KEYS = Object.freeze([CONFIGURED_PROVIDER_SET_ROW_KEY, COST_ENVELOPE_POLICY_ROW_KEY] as const);

/** A refusal this command owns. `code` is also the message, and it never carries a value from the file. */
export class HostedRegisterPublicationError extends TypeError {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "HostedRegisterPublicationError";
  }
}

/**
 * The version WAS published — it is sealed and can never be withdrawn — but the
 * boot readers refused it. The CLI prints the receipt and then this code, so the
 * operator knows which version NOT to pin in `REGISTER_VERSION`.
 */
export class HostedRegisterBootCheckFailedError extends HostedRegisterPublicationError {
  readonly refusal: string;

  constructor(error: unknown, readonly result: HostedRegisterPublicationResult) {
    const refusal = bootCheckRefusal(error);
    super(`HOSTED_REGISTER_BOOT_CHECK_FAILED:${refusal}`);
    this.refusal = refusal;
    this.name = "HostedRegisterBootCheckFailedError";
  }
}

const LEADING_TYPED_CODE = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)+(?::\S*)?/u;

/**
 * The reader's code, made printable WITHOUT losing the label (review
 * Important 2). Only a leading typed code is taken — never prose — and every
 * character outside the printable code alphabet becomes `_`, so a provider ref
 * carrying `/` or `,` cannot push the line out of that alphabet and into the
 * generic fallback. Anything with no typed code at all is `UNKNOWN`.
 */
function bootCheckRefusal(error: unknown): string {
  const holder = typeof error === "object" && error !== null
    ? error as { readonly code?: unknown; readonly message?: unknown }
    : {};
  for (const candidate of [holder.code, holder.message]) {
    if (typeof candidate !== "string") continue;
    const token = LEADING_TYPED_CODE.exec(candidate)?.[0];
    if (token !== undefined) return token.replace(/[^A-Za-z0-9_.:-]/gu, "_").slice(0, 200);
  }
  return "UNKNOWN";
}

function refuse(code: string): never {
  throw new HostedRegisterPublicationError(code);
}

// At least one separator: a SQLSTATE (`P0001`) or an errno name (`ENOENT`) is
// not a refusal code, and must fall through to the message it came with.
// `*` is admitted after the colon for one fixed marker only, and only in its two
// forms: the unknown-field refusal's "a key here" as a trailing `.*`
// (`HOSTED_REGISTER_SCORECARD_KEY_UNKNOWN:candidates.1.*`) or a bare `*`. Any
// other `*` (an operator's `providerRef`, say) still falls through to the
// generic line, as it did before the marker existed.
const TYPED_CODE = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)+(?::(?:[A-Za-z0-9_.:-]+(?:\.\*)?|\*))?$/u;
const TYPED_CODE_PREFIX = /^([A-Z][A-Z0-9_]*):\s/u;

/**
 * The one line the CLI may print about a refusal. A typed `code` wins; then a
 * message that IS a typed code (the house style of the boot checks this command
 * reuses — `PROVIDER_TARGET_PRICE_ZERO:vendor:beta`); then the leading code of a
 * database exception (`REGISTER_PUBLICATION_SEAL_INVALID: …`). Nothing else from
 * an error's prose is printed: it could hold a path, a URL or a value.
 */
export function hostedRegisterRefusalCode(error: unknown): string {
  // Built from a sanitised code, so it is always printable; never generic.
  if (error instanceof HostedRegisterBootCheckFailedError) return error.code;
  const code = (error as { readonly code?: unknown } | null)?.code;
  if (typeof code === "string" && TYPED_CODE.test(code)) return code;
  const message = (error as { readonly message?: unknown } | null)?.message;
  if (typeof message === "string") {
    if (TYPED_CODE.test(message)) return message;
    const prefix = TYPED_CODE_PREFIX.exec(message);
    if (prefix !== null) return prefix[1]!;
  }
  const issues = (error as { readonly issues?: unknown } | null)?.issues;
  if (Array.isArray(issues)) {
    const names = [...new Set(issues.flatMap((issue) => {
      const path = (issue as { readonly path?: unknown }).path;
      return Array.isArray(path) && typeof path[0] === "string" ? [path[0]] : [];
    }))].sort();
    if (names.length > 0) return `HOSTED_REGISTER_ENVIRONMENT_INVALID:${names.join(",")}`;
  }
  return "HOSTED_REGISTER_PUBLISH_FAILED";
}

export type HostedRegisterArguments = Readonly<{ filePath: string; dryRun: boolean; scorecardPath: string | null }>;

/** `--file <path>` once, `--scorecard <path>` at most once (A19), `--dry-run` at most once, nothing else. */
export function parseHostedRegisterArguments(args: readonly string[]): HostedRegisterArguments {
  let filePath: string | undefined;
  let scorecardPath: string | undefined;
  let dryRun = false;
  const valueAfter = (index: number): string | undefined => {
    const value = args[index + 1];
    return value !== undefined && value.length > 0 && !value.startsWith("--") ? value : undefined;
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = valueAfter(index);
    if (argument === "--dry-run" && !dryRun) {
      dryRun = true;
    } else if (argument === "--file" && filePath === undefined && value !== undefined) {
      filePath = value;
      index += 1;
    } else if (argument === "--scorecard" && scorecardPath === undefined && value !== undefined) {
      scorecardPath = value;
      index += 1;
    } else {
      refuse("HOSTED_REGISTER_USAGE");
    }
  }
  if (filePath === undefined) refuse("HOSTED_REGISTER_USAGE");
  return Object.freeze({
    filePath: resolve(filePath),
    dryRun,
    scorecardPath: scorecardPath === undefined ? null : resolve(scorecardPath)
  });
}

const boundedText = z.string().min(1).max(256)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));

/**
 * V-9(4)'s record, typed loosely on purpose: whether the dates are real ISO days
 * and whether the vendor is named in the notice is `buildConfiguredProviderSetDeploymentRow`'s
 * decision, and it refuses with `PROVIDER_VENDOR_NOT_VETTED` and the ref.
 */
const vettingSchema = z.object({
  dataUseTermsReviewedOn: z.string(),
  retentionTermsReviewedOn: z.string(),
  namedInPrivacyNotice: z.boolean()
}).strict();

const configuredProviderSetSchema = z.object({
  requiredDistinctMakers: z.number().int(),
  providers: z.array(z.object({
    providerRef: boundedText,
    // A hosted deployment reaches paid vendor APIs through the OpenAI-
    // compatible adapter (V-9(3)) or, since the multi-model preview's PR B, the
    // native Anthropic Messages adapter; it has no self-hosted inference server
    // (V-20), so the vLLM kind stays refused.
    adapterKind: z.enum([OPENAI_COMPATIBLE_HTTP_ADAPTER_KIND, ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND]),
    maker: boundedText,
    vetting: vettingSchema.optional()
  }).strict()).min(1).max(32)
}).strict();

const synthesisRolesSchema = z.object({
  synthesizerRoleRef: boundedText,
  evaluatorRoleRef: boundedText
}).strict();

export type HostedRegisterFile = Readonly<{
  format: typeof HOSTED_REGISTER_FILE_FORMAT;
  sourceRef: string;
  configuredProviderSet: z.infer<typeof configuredProviderSetSchema>;
  /** Validated in the plan by the register's own strict schema, so the refusal keeps its own code. */
  costEnvelopePolicy: unknown;
  /**
   * Paid plans G2: the operator's countryPolicy (the member's raw value), validated in the plan by its
   * own schema. null = the member is absent: no countryPolicy row is published, so the version has no
   * country gate (A14). A member that is present with the JSON value null is refused by the parser
   * (COUNTRY_POLICY_INVALID); it never means "no gate".
   */
  countryPolicy: unknown;
  /** Validated in the plan by the boot's own parser and hosted checks. NEVER published and never printed. */
  providerTargets: unknown;
  synthesisRoles: z.infer<typeof synthesisRolesSchema> | null;
  /** Paid plans: OPTIONAL operator rows, checked in the plan by the register's own parsers. */
  billingPlans: Readonly<{ value: unknown }> | null;
  billingPolicy: Readonly<{ value: unknown }> | null;
  /** Optional (P16a): the operator's own where-and-when text; absent = the code-owned row. */
  taxAuthorities?: unknown;
  /**
   * Optional (P4-G): the room read's admission budget, `{ key: "owner", limit, window_ms, capacity }`,
   * added to the code-owned admissionPolicy row as `ask_room_reads`; absent = the code-owned row as it is.
   */
  askRoomReads?: unknown;
  /** Optional (2026-10-04): the pre-publish check's deadline; absent = the code-owned row. */
  publicationCheckPolicy?: unknown;
}>;

/**
 * The file's bytes -> its validated shape. Duplicate keys, a number the
 * register cannot hold exactly and any byte that is not JSON are refused by the
 * register's own canonical parser before `JSON.parse` could quietly pick one.
 */
export function parseHostedRegisterFile(bytes: Uint8Array): HostedRegisterFile {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_FILE_BYTES) {
    refuse("HOSTED_REGISTER_FILE_INVALID");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(parseCanonicalRegisterJson(bytes));
  } catch {
    return refuse("HOSTED_REGISTER_FILE_INVALID");
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    refuse("HOSTED_REGISTER_FILE_INVALID");
  }
  const record = decoded as Readonly<Record<string, unknown>>;
  if (Object.keys(record).some((key) => !(TOP_LEVEL_KEYS as readonly string[]).includes(key))) {
    refuse("HOSTED_REGISTER_FILE_KEY_UNKNOWN");
  }
  if (record.format !== HOSTED_REGISTER_FILE_FORMAT) refuse("HOSTED_REGISTER_FILE_INVALID");
  const sourceRef = record.sourceRef;
  if (typeof sourceRef !== "string" || sourceRef.length < 1 || sourceRef.length > MAX_SOURCE_REF_LENGTH
    || sourceRef !== sourceRef.trim() || /[\u0000-\u001f\u007f]/u.test(sourceRef)) {
    refuse("HOSTED_REGISTER_FILE_INVALID");
  }
  for (const rowKey of OPERATOR_ROW_KEYS) {
    if (!Object.hasOwn(record, rowKey)) refuse(`HOSTED_REGISTER_ROW_MISSING:${rowKey}`);
  }
  if (!Object.hasOwn(record, "providerTargets")) refuse("HOSTED_REGISTER_PROVIDER_TARGETS_MISSING");
  const providerSet = configuredProviderSetSchema.safeParse(record.configuredProviderSet);
  if (!providerSet.success) refuse("HOSTED_REGISTER_FILE_INVALID");
  let synthesisRoles: z.infer<typeof synthesisRolesSchema> | null = null;
  if (Object.hasOwn(record, "synthesisRoles")) {
    const roles = synthesisRolesSchema.safeParse(record.synthesisRoles);
    if (!roles.success) refuse("HOSTED_REGISTER_FILE_INVALID");
    synthesisRoles = roles.data;
  }
  // Paid plans G2: an explicit null is not "left out". It is refused by the register's own check,
  // with its own code, so only a file WITHOUT the member publishes no countryPolicy row (A14).
  if (Object.hasOwn(record, "countryPolicy") && record.countryPolicy === null) {
    countryPolicyFromValue(null, sourceRef);
  }
  return Object.freeze({
    format: HOSTED_REGISTER_FILE_FORMAT,
    sourceRef,
    configuredProviderSet: providerSet.data,
    costEnvelopePolicy: record.costEnvelopePolicy,
    countryPolicy: Object.hasOwn(record, "countryPolicy") ? record.countryPolicy : null,
    providerTargets: record.providerTargets,
    synthesisRoles,
    billingPlans: Object.hasOwn(record, BILLING_PLANS_ROW_KEY) ? Object.freeze({ value: record.billingPlans }) : null,
    billingPolicy: Object.hasOwn(record, BILLING_POLICY_ROW_KEY) ? Object.freeze({ value: record.billingPolicy }) : null,
    ...(Object.hasOwn(record, "taxAuthorities") ? { taxAuthorities: record.taxAuthorities } : {}),
    ...(Object.hasOwn(record, "askRoomReads") ? { askRoomReads: record.askRoomReads } : {}),
    ...(Object.hasOwn(record, "publicationCheckPolicy") ? { publicationCheckPolicy: record.publicationCheckPolicy } : {})
  });
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

/** The refusal codes one custody-checked operator file answers with. */
type CustodyRefusals = Readonly<{ absent: string; custody: string; invalid: string }>;

const REGISTER_FILE_REFUSALS: CustodyRefusals = Object.freeze({
  absent: "HOSTED_REGISTER_FILE_ABSENT",
  custody: "HOSTED_REGISTER_FILE_CUSTODY_INVALID",
  invalid: "HOSTED_REGISTER_FILE_INVALID"
});

const SCORECARD_FILE_REFUSALS: CustodyRefusals = Object.freeze({
  absent: "HOSTED_REGISTER_SCORECARD_FILE_ABSENT",
  custody: "HOSTED_REGISTER_SCORECARD_FILE_CUSTODY_INVALID",
  invalid: "HOSTED_REGISTER_SCORECARD_FILE_INVALID"
});

/**
 * An operator's file, read under the codebase's ONE custody decision
 * (`custodyAccepts`, single-owner contract): a regular file, one link, mode 0600
 * owned by the caller, inside a 0700 directory owned by the caller, opened with
 * `O_NOFOLLOW` and judged on the descriptor actually read. Neither operator file
 * holds a secret, but each decides what every service runs under — prices,
 * ceilings, vendors, which models answer — so a file another principal could
 * replace is refused. Each file answers with its own codes and its own bound.
 */
async function readCustodiedBytes(path: string, maxBytes: number, refusals: CustodyRefusals): Promise<Buffer> {
  const resolved = resolve(path);
  let handle;
  try {
    // Fix round 1 (review Minor 1): `O_NONBLOCK` so a FIFO opens at once and is
    // refused below as not a regular file, instead of the command waiting for a
    // writer. It changes nothing for a regular file.
    handle = await open(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) refuse(refusals.absent);
    return refuse(refusals.custody);
  }
  try {
    const metadata = await handle.stat();
    const parent = await stat(dirname(resolved));
    if (!custodyAccepts(
      {
        isFile: metadata.isFile(), nlink: metadata.nlink, mode: metadata.mode,
        uid: metadata.uid, gid: metadata.gid, size: metadata.size
      },
      { isDirectory: parent.isDirectory(), mode: parent.mode, uid: parent.uid, gid: parent.gid },
      {
        callerUid: typeof process.getuid === "function" ? process.getuid() : undefined,
        custodyGid: undefined,
        expectedSize: undefined
      }
    )) {
      refuse(refusals.custody);
    }
    if (metadata.size < 1 || metadata.size > maxBytes) refuse(refusals.invalid);
    const bounded = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < bounded.length) {
      const { bytesRead } = await handle.read(bounded, offset, bounded.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== metadata.size) refuse(refusals.invalid);
    return bounded.subarray(0, offset);
  } finally {
    await handle.close();
  }
}

/** The register file: at most 64 KiB, its own codes. */
export async function readHostedRegisterFile(path: string): Promise<HostedRegisterFile> {
  return parseHostedRegisterFile(await readCustodiedBytes(path, MAX_FILE_BYTES, REGISTER_FILE_REFUSALS));
}

/**
 * A19 — THE OWNERS' APPROVED MODEL SCORECARD, as it will be sealed.
 * `valueJsonText` is the operator's document in the register's canonical form
 * (sorted keys, no whitespace), so the sealed row IS what was approved; the
 * numbers the plan prints come from the engine's own validation of it.
 * `apiCandidateCount` (carry 8) is how many candidates list an API route: the
 * hosted site reaches models only that way, since relays never run hosted.
 */
export type HostedModelScorecard = Readonly<{
  valueJsonText: RegisterPublicationRow["valueJsonText"];
  scorecardVersion: number;
  candidateCount: number;
  apiCandidateCount: number;
  /** Paid plans S2: the scorecard's plan caps, checked against the owners' rule when the sealed version sells plans. */
  planStrengthCaps: PickerSettings["planStrengthCaps"];
  /** Paid plans S4b: Free's own caps and the Economy caps, checked against the owners' Free rule when the version sells plans. */
  freeCap: PickerSettings["freeCap"];
  economyCap: PickerSettings["economyCap"];
  /** Paid plans P4-E: the validated scorecard, which the Free answer-job rule reads through the picker's own eligibility. */
  scorecard: Scorecard;
  sha256: string;
  bytes: number;
}>;

/**
 * One DEFINED path segment (a schema field, a role-enum key or an index) in the
 * printable code alphabet — already true of every such segment today; kept as
 * a guard so the refusal line always stays a typed code.
 */
function printableKeySegment(segment: string): string {
  return segment.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 64) || "_";
}

/**
 * Fix round 1 (review Minor 2): the first key of the operator's document that
 * the engine's own validation DROPPED — a field the scorecard format does not
 * define — as its DEFINED parent path plus the fixed marker `*` (just `*` at
 * the top level), or null. `validated` is `parseScorecard`'s output for the
 * same document: the format ignores (strips) an unknown field, so any key
 * present in `raw` and absent at the same place in `validated` is one the
 * schema does not define, at any depth. The schema is never restated here.
 * Nothing the operator chose reaches the path: not the unknown key's name, not
 * any value (fix round 2). If the scorecard schema ever gains a transform, a
 * rename or `.passthrough()`, this comparison changes meaning: update it and
 * its tests with the schema (packages/scorecard/src/schema.ts says so too).
 */
function firstUndefinedScorecardKey(raw: unknown, validated: unknown, path: readonly string[] = []): string | null {
  if (Array.isArray(raw)) {
    if (!Array.isArray(validated)) return null;
    for (let index = 0; index < raw.length; index += 1) {
      const found = firstUndefinedScorecardKey(raw[index], validated[index], [...path, String(index)]);
      if (found !== null) return found;
    }
    return null;
  }
  if (raw === null || typeof raw !== "object" || validated === null || typeof validated !== "object") return null;
  for (const key of Object.keys(raw)) {
    const at = [...path, key];
    // Fix round 2 (re-review Minor 1): the unknown key's NAME is operator text
    // and could be secret-shaped, so only its DEFINED parent is printed, then a
    // fixed marker. Every segment of `path` is a key validation kept (a schema
    // field, a role-enum key) or an array index — never operator-chosen text.
    if (!Object.hasOwn(validated, key)) {
      return path.length === 0 ? "*" : `${path.map(printableKeySegment).join(".").slice(0, 200)}.*`;
    }
    const found = firstUndefinedScorecardKey(
      (raw as Readonly<Record<string, unknown>>)[key], (validated as Readonly<Record<string, unknown>>)[key], at
    );
    if (found !== null) return found;
  }
  return null;
}

/**
 * The scorecard file's bytes -> what will be sealed. The file must fit the
 * scorecard bound (`MODEL_SCORECARD_MAX_BYTES`, 64 KiB). The register's
 * canonical parser runs next: a duplicate key or an exponent number refuses
 * before `JSON.parse` could pick one, and the canonical text that will be
 * sealed must fit the same bound (escapes can make it longer than the file).
 * Then the engine's own scorecard validation runs, and its reason is the
 * refusal's suffix. Last, a field that validation would ignore is refused by
 * where it is (`HOSTED_REGISTER_SCORECARD_KEY_UNKNOWN:<defined parent>.*`), because the
 * document is sealed as it is.
 */
export function parseHostedScorecardFile(bytes: Uint8Array, engineVersion: string): HostedModelScorecard {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MODEL_SCORECARD_MAX_BYTES) {
    refuse("HOSTED_REGISTER_SCORECARD_FILE_INVALID");
  }
  let valueJsonText: RegisterPublicationRow["valueJsonText"];
  try {
    valueJsonText = parseCanonicalRegisterJson(bytes);
  } catch {
    return refuse("HOSTED_REGISTER_SCORECARD_FILE_INVALID");
  }
  if (Buffer.byteLength(valueJsonText, "utf8") > MODEL_SCORECARD_MAX_BYTES) {
    refuse("HOSTED_REGISTER_SCORECARD_FILE_INVALID");
  }
  const raw = JSON.parse(valueJsonText) as unknown;
  const read = modelScorecardFromValue(raw, HOSTED_REGISTER_DEPLOYMENT_REF, engineVersion);
  if (read.state === "REFUSED") refuse(`HOSTED_REGISTER_SCORECARD_REFUSED:${read.reason}`);
  if (read.state !== "VALID") return refuse("HOSTED_REGISTER_SCORECARD_FILE_INVALID");
  // Fix round 1 (review Minor 2): what is sealed is the operator's document
  // itself, and a sealed row is never edited, so a field the format does not
  // define is refused here rather than sealed forever.
  const unknownKey = firstUndefinedScorecardKey(raw, read.scorecard);
  if (unknownKey !== null) refuse(`HOSTED_REGISTER_SCORECARD_KEY_UNKNOWN:${unknownKey}`);
  return Object.freeze({
    valueJsonText,
    scorecardVersion: read.scorecard.scorecardVersion,
    candidateCount: read.scorecard.candidates.length,
    // Carry 8: the picker's own hosted rule (packages/scorecard/src/picker.ts,
    // `eligiblePool`): a candidate is reachable hosted only through an API route.
    apiCandidateCount: read.scorecard.candidates
      .filter((candidate) => candidate.accessRoutes.some((route) => route.kind === "API")).length,
    planStrengthCaps: read.scorecard.pickerSettings.planStrengthCaps,
    freeCap: read.scorecard.pickerSettings.freeCap,
    economyCap: read.scorecard.pickerSettings.economyCap,
    scorecard: read.scorecard,
    sha256: createHash("sha256").update(valueJsonText).digest("hex"),
    bytes: Buffer.byteLength(valueJsonText, "utf8")
  });
}

/** The scorecard file: the register file's custody rule, the scorecard's 64 KiB bound, its own codes. */
export async function readHostedScorecardFile(path: string, engineVersion: string): Promise<HostedModelScorecard> {
  return parseHostedScorecardFile(
    await readCustodiedBytes(path, MODEL_SCORECARD_MAX_BYTES, SCORECARD_FILE_REFUSALS),
    engineVersion
  );
}

/**
 * RFC 2606 / RFC 6761 names no vendor can live at. The kit's example file uses
 * them on purpose, so publishing it unchanged is refused rather than sealed
 * forever: a dry run names them, a publication refuses them.
 */
function isReservedExampleHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/u, "");
  return ["example", "test", "invalid"].some((tld) => host === tld || host.endsWith(`.${tld}`))
    || ["example.com", "example.net", "example.org"].some((name) => host === name || host.endsWith(`.${name}`));
}

export type HostedRegisterPlan = Readonly<{
  bootstrap: BootstrapRegister;
  baseRegisterVersion: RegisterVersionText;
  publicationId: string;
  sourceRef: string;
  rows: readonly RegisterPublicationRow[];
  snapshotSha256: string;
  vendorRefs: readonly string[];
  costEnvelope: CostEnvelopePolicy;
  synthesisRoles: DevelopmentSynthesisRoleRefs;
  pricedTargetCount: number;
  /** Vendors still carrying an example literal: reserved host, `vendor:example-` ref, `Example` maker, example date. */
  exampleTargetRefs: readonly string[];
  /** The file kept the kit example's sourceRef. */
  exampleSourceRef: boolean;
  /** The canonical targets JSON the boot readiness check re-parses. Never printed: it names credential files. */
  providerTargetsJson: string;
  /** The billing rows as sealed: the operator's, or the engine's own (billing OFF). */
  billingPlans: BillingPlans | null;
  billingPolicy: BillingPolicy | null;
  /** Things to know, never refusals: `BILLING_PLAN_WINDOW_BELOW_RUN_CEILING:<plan>` (spec §2.5.1). */
  warnings: readonly string[];
  /** P4-G: the room read's admission budget as sealed, or null when this version seals none. */
  askRoomReads: AdmissionPolicy["askRoomReads"];
  /** A19: what the additive `modelScorecard` row carries, or null when this publication seals none. */
  modelScorecard: Readonly<{
    scorecardVersion: number;
    candidateCount: number;
    /** Carry 8: candidates with an API route, the only kind the hosted site can seat. */
    apiCandidateCount: number;
    sha256: string;
    bytes: number;
  }> | null;
}>;

function canonicalRowValue(value: unknown): RegisterPublicationRow["valueJsonText"] {
  try {
    return parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value), "utf8"));
  } catch {
    return refuse("HOSTED_REGISTER_FILE_INVALID");
  }
}

/** The seeder's shape of a content-derived publication id, under this command's own namespace. */
function hostedPublicationId(base: RegisterVersionText, snapshotSha256: string, sourceRef: string): string {
  const identity = createHash("sha256")
    .update(`${HOSTED_REGISTER_DEPLOYMENT_REF}:v1:${base}:${snapshotSha256}:${sourceRef}`)
    .digest("hex");
  return `${identity.slice(0, 8)}-${identity.slice(8, 12)}-5${identity.slice(13, 16)}-a${identity.slice(17, 20)}-${identity.slice(20, 32)}`;
}

function resolveSynthesisRoles(
  file: HostedRegisterFile,
  configured: readonly DevelopmentConfiguredProvider[]
): DevelopmentSynthesisRoleRefs {
  if (file.synthesisRoles !== null) {
    const refs = new Set(configured.map((provider) => provider.providerRef));
    if (!refs.has(file.synthesisRoles.synthesizerRoleRef) || !refs.has(file.synthesisRoles.evaluatorRoleRef)) {
      refuse("HOSTED_REGISTER_ROLE_REF_UNCONFIGURED");
    }
    return Object.freeze({ ...file.synthesisRoles });
  }
  try {
    return deriveSynthesisRoleRefs(configured);
  } catch {
    // One maker cannot supply two different roles by default; the operator
    // names them (identical refs are lawful and warned about, J7).
    return refuse("HOSTED_REGISTER_ROLE_REFS_REQUIRED");
  }
}

/**
 * Everything decided before a connection exists. A refusal here has published
 * nothing and opened nothing; a plan that returns is exactly what would be sealed.
 */
export async function planHostedRegisterPublication(
  file: HostedRegisterFile,
  scorecard: HostedModelScorecard | null = null
): Promise<HostedRegisterPlan> {
  // V-9(4): the vetted DEPLOYMENT shape, by its own builder — PROVIDER_VENDOR_NOT_VETTED
  // and CONFIGURED_PROVIDER_SET_INVALID are its codes.
  const providerSetRow = buildConfiguredProviderSetDeploymentRow({
    requiredDistinctMakers: file.configuredProviderSet.requiredDistinctMakers,
    providers: file.configuredProviderSet.providers as readonly VettedConfiguredProvider[]
  }, file.sourceRef);
  // The boot reads `deploymentMakerCapability` as distinct makers >= the
  // required count; a set that fails it is refused here, not sealed.
  const distinctMakers = new Set(file.configuredProviderSet.providers.map((provider) => provider.maker));
  if (distinctMakers.size < file.configuredProviderSet.requiredDistinctMakers) {
    refuse("HOSTED_REGISTER_MAKER_CAPABILITY_INSUFFICIENT");
  }
  // V-28: the register's own strict schema (integers, daily >= per-run).
  const costEnvelope = costEnvelopePolicyFromValue(file.costEnvelopePolicy, file.sourceRef);
  // Paid plans P16a: the operator's where-and-when text, by the register's own parser
  // (TAX_AUTHORITIES_INVALID). Absent member = the code-owned row, sealed as it is.
  if (file.taxAuthorities !== undefined) taxAuthoritiesFromValue(file.taxAuthorities, file.sourceRef);
  // hate-speech S02: the operator's deadline, by the register's own parser (PUBLICATION_CHECK_POLICY_INVALID).
  // Absent member = the code-owned row, sealed as it is.
  if (file.publicationCheckPolicy !== undefined) publicationCheckPolicyFromValue(file.publicationCheckPolicy, file.sourceRef);
  // Paid plans (spec 2026-09-29 §2.5.1): a supplied billing row is checked by
  // the register's own parser, so its refusal keeps its own code.
  if (file.billingPlans !== null) billingPlansFromValue(file.billingPlans.value, file.sourceRef);
  if (file.billingPolicy !== null) billingPolicyFromValue(file.billingPolicy.value, file.sourceRef);
  // Paid plans G2: the operator's country switches, by the register's own schema
  // (COUNTRY_POLICY_INVALID). Absent member = no row, no gate (A14).
  if (file.countryPolicy !== null) countryPolicyFromValue(file.countryPolicy, file.sourceRef);
  const configured: readonly DevelopmentConfiguredProvider[] = Object.freeze(
    file.configuredProviderSet.providers.map((provider) => Object.freeze({
      providerRef: provider.providerRef, adapterKind: provider.adapterKind, maker: provider.maker
    }))
  );
  // The boot's own three decisions over the targets, in the boot's order.
  let targetsJson: string;
  try {
    targetsJson = JSON.stringify(file.providerTargets);
  } catch {
    return refuse("HOSTED_REGISTER_FILE_INVALID");
  }
  const targets: readonly ProviderDiscoveryTarget[] = parseProviderDiscoveryTargets(targetsJson, configured);
  assertDeploymentProviderTargets(targets, { mode: "hosted", nodeEnv: "production" });
  assertPricedProviderTargets(targets, "hosted");
  const synthesisRoles = resolveSynthesisRoles(file, configured);
  warnOnIdenticalSynthesisRoleRefs({ ...synthesisRoles, deploymentRef: HOSTED_REGISTER_DEPLOYMENT_REF });

  const bootstrap = await loadBootstrapRegister();
  // The seeder's builders take a panel; only its two provider-set members are read.
  const seededRows = await buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, {
    configuredProviders: configured,
    requiredDistinctMakers: file.configuredProviderSet.requiredDistinctMakers,
    healthyProviderRefs: Object.freeze([]),
    targets,
    targetsJson
  }, synthesisRoles, "hosted");
  // A14: a hosted file without countryPolicy publishes no countryPolicy row (no gate), exactly as
  // before this member existed. The development seeder always publishes it (local mode reads none).
  const codeOwnedRows = file.countryPolicy === null
    ? seededRows.filter((row) => row.rowKey !== COUNTRY_POLICY_ROW_KEY)
    : seededRows;
  const operatorRows = new Map<string, RegisterPublicationRow>([
    [CONFIGURED_PROVIDER_SET_ROW_KEY, Object.freeze({
      rowKey: CONFIGURED_PROVIDER_SET_ROW_KEY,
      valueJsonText: canonicalRowValue(providerSetRow.value),
      sourceRef: providerSetRow.sourceRef
    })],
    [COST_ENVELOPE_POLICY_ROW_KEY, Object.freeze({
      rowKey: COST_ENVELOPE_POLICY_ROW_KEY,
      valueJsonText: canonicalRowValue(file.costEnvelopePolicy),
      sourceRef: file.sourceRef
    })]
  ]);
  if (file.countryPolicy !== null) {
    operatorRows.set(COUNTRY_POLICY_ROW_KEY, Object.freeze({
      rowKey: COUNTRY_POLICY_ROW_KEY,
      valueJsonText: canonicalRowValue(file.countryPolicy),
      sourceRef: file.sourceRef
    }));
  }
  for (const [rowKey, supplied] of [
    [BILLING_PLANS_ROW_KEY, file.billingPlans],
    [BILLING_POLICY_ROW_KEY, file.billingPolicy]
  ] as const) {
    if (supplied !== null) {
      operatorRows.set(rowKey, Object.freeze({
        rowKey, valueJsonText: canonicalRowValue(supplied.value), sourceRef: file.sourceRef
      }));
    }
  }
  if (file.taxAuthorities !== undefined) {
    operatorRows.set(TAX_AUTHORITIES_ROW_KEY, Object.freeze({
      rowKey: TAX_AUTHORITIES_ROW_KEY,
      valueJsonText: canonicalRowValue(file.taxAuthorities),
      sourceRef: file.sourceRef
    }));
  }
  // Paid plans P4-G (go-live row 31): the owner's room-read budget joins the code-owned admission row as
  // its one added member; every other member stays byte for byte. The register's own parser checks the
  // composed value (ADMISSION_POLICY_INVALID). The file's sourceRef is the version's own; the row names
  // the member's origin in a fixed suffix, which keeps it inside the register's 1024-character bound.
  if (file.askRoomReads !== undefined) {
    const codeOwnedAdmission = codeOwnedRows.find((row) => row.rowKey === ADMISSION_POLICY_ROW_KEY);
    if (codeOwnedAdmission === undefined) refuse(`HOSTED_REGISTER_ROW_MISSING:${ADMISSION_POLICY_ROW_KEY}`);
    const composed = {
      ...(JSON.parse(codeOwnedAdmission.valueJsonText) as Readonly<Record<string, unknown>>),
      ask_room_reads: file.askRoomReads
    };
    const sourceRef = `${codeOwnedAdmission.sourceRef}`
      + " + paid plans P4-G ask_room_reads, the owner's value from the hosted register file";
    admissionPolicyFromValue(composed, sourceRef);
    operatorRows.set(ADMISSION_POLICY_ROW_KEY, Object.freeze({
      rowKey: ADMISSION_POLICY_ROW_KEY,
      valueJsonText: canonicalRowValue(composed),
      sourceRef
    }));
  }
  if (file.publicationCheckPolicy !== undefined) {
    operatorRows.set(PUBLICATION_CHECK_POLICY_ROW_KEY, Object.freeze({
      rowKey: PUBLICATION_CHECK_POLICY_ROW_KEY,
      valueJsonText: canonicalRowValue(file.publicationCheckPolicy),
      sourceRef: file.sourceRef
    }));
  }
  const replaced = codeOwnedRows.filter((row) => operatorRows.has(row.rowKey));
  if (replaced.length !== operatorRows.size) refuse("HOSTED_REGISTER_COMPOSITION_INVALID");
  // A19 — THE ONE ADDITIVE OPERATOR ROW. The two rows above REPLACE a
  // code-owned twin; the model scorecard has none, by design: a publication
  // without `--scorecard` then seals a version whose scorecard is ABSENT (asks
  // keep the plan rosters), never a default the owners did not approve for the
  // site. A builder that ever minted a twin would make two sources compete for
  // one key, so that is refused before anything is sealed.
  if (codeOwnedRows.some((row) => row.rowKey === MODEL_SCORECARD_ROW_KEY)) {
    refuse("HOSTED_REGISTER_COMPOSITION_INVALID");
  }
  const scorecardRows: readonly RegisterPublicationRow[] = scorecard === null ? [] : [Object.freeze({
    rowKey: MODEL_SCORECARD_ROW_KEY,
    valueJsonText: scorecard.valueJsonText,
    sourceRef: `${file.sourceRef} | ${MODEL_SCORECARD_ROW_KEY} v${scorecard.scorecardVersion} sha256:${scorecard.sha256}`
  })];
  const rows = Object.freeze([
    ...codeOwnedRows.map((row) => operatorRows.get(row.rowKey) ?? row),
    ...scorecardRows
  ]);
  const keys = new Set(rows.map((row) => row.rowKey));
  if (keys.size !== rows.length || ALGORITHM_REGISTER_ROW_KEYS.some((key) => !keys.has(key))) {
    refuse("HOSTED_REGISTER_COMPOSITION_INVALID");
  }
  // The hosted boot refuses a register whose admission row lacks the support
  // budgets; asked here of the value about to be sealed, so a dry run says so.
  const admissionRow = rows.find((row) => row.rowKey === ADMISSION_POLICY_ROW_KEY);
  if (admissionRow === undefined) refuse(`HOSTED_REGISTER_ROW_MISSING:${ADMISSION_POLICY_ROW_KEY}`);
  const admission = admissionPolicyFromValue(JSON.parse(admissionRow.valueJsonText) as unknown, admissionRow.sourceRef);
  assertHostedSupportAdmissionSealed("hosted", admission);
  // Engine money rule, Task M7 (spec §14.4.1): the operator's cost row checks
  // its day against one run only; the code-owned story row lands in the same
  // version, so the day is checked against one run AND its story, over both
  // rows, by the check both boots run (STORY_DAILY_CEILING_INSUFFICIENT).
  const storyKeys: readonly string[] = STORY_ROW_KEYS;
  costEnvelopeGuardPolicy(costEnvelope, readStoryPolicy(
    rows.filter((row) => storyKeys.includes(row.rowKey)).map((row) => Object.freeze({
      rowKey: row.rowKey, value: JSON.parse(row.valueJsonText) as unknown, sourceRef: row.sourceRef
    })),
    bootstrap.registerVersion
  ));
  // The rows as they will be sealed, read back from the composed set.
  const sealed = (rowKey: string): Readonly<{ value: unknown; sourceRef: string }> | null => {
    const row = rows.find((candidate) => candidate.rowKey === rowKey);
    return row === undefined ? null : Object.freeze({ value: JSON.parse(row.valueJsonText) as unknown, sourceRef: row.sourceRef });
  };
  // B9d (budget spec §2.10), final review Part 1b, Important 3: the check BOTH
  // boots run (RUN_CEILING_BELOW_ONE_CALL), asked of the version about to be
  // sealed, by the same functions over the same inputs: the file's priced
  // targets (they must equal PROVIDER_DISCOVERY_TARGETS_JSON, which the units
  // read), the composed JUDGE bound, the ask's largest question and the models
  // each plan can seat, by the boots' own rule (`firstCallPlanModels`, paid
  // plans S2): while the version's sealed scorecard is VALID, every configured
  // model counts for every plan, because the picker seats from all of them;
  // without one, each plan's own roster. `scorecard !== null` is the boots'
  // `state === "VALID"` for this version: `parseHostedScorecardFile` admits
  // only a VALID scorecard. Only with the band, as at boot. The boots keep
  // asking: the environment can still differ from the file. Paid plans S4b: a
  // version that sells plans prices Free on the Free roster alone, as the API's
  // boot does, because the picker seats a Free ask from it only then.
  const plansRow = sealed(BILLING_PLANS_ROW_KEY);
  const policyRow = sealed(BILLING_POLICY_ROW_KEY);
  const billingPlans = plansRow === null ? null : billingPlansFromValue(plansRow.value, plansRow.sourceRef);
  const billingPolicy = policyRow === null ? null : billingPolicyFromValue(policyRow.value, policyRow.sourceRef);
  if (costEnvelopeBand(costEnvelope) !== null) {
    const firstCalls = firstPositionCallProjections({
      targets,
      judgeTokenCeiling: judgeTokenCeilingFromValue(sealed("acceptanceOrganCostBounds")?.value),
      questionMaxBytes: askQuestionMaxBytes()
    });
    assertRunCeilingCoversOneCall({
      bodyCeilingMicros: costEnvelopeCeilings(costEnvelope).bodyMicros,
      firstCallsByRoster: firstCallsByPlanRoster({
        projections: firstCalls,
        rosters: firstCallPlanModels({
          scorecardInForce: scorecard !== null,
          rosters: PLAN_TIER_ROSTERS,
          models: firstCalls.map((call) => call.model),
          ownRosterOnly: billingPolicy?.enabled === true ? ["free"] : []
        })
      })
    });
  }
  // R1 A22: billing may be switched on only with its plans and the three budget
  // members, asked here of the version about to be sealed, so a dry run says so.
  assertBillingReady({ policy: billingPolicy, plans: billingPlans, envelope: costEnvelope });
  // Paid plans S2 (spec §2.6 item 6): a version that sells plans seals only a
  // scorecard that follows the owners' plan-cap rule — a sealed row is never edited.
  if (billingPolicy?.enabled === true && scorecard !== null && !planCapsFollowPaidSiteRule(scorecard.planStrengthCaps)) {
    refuse(SCORECARD_PLAN_CAPS_INVALID);
  }
  // Paid plans S4b (final review P3-I2): and only one whose Free caps follow the
  // owners' Free rule — every role's Free money cap set, at or below its Economy cap.
  if (billingPolicy?.enabled === true && scorecard !== null && !freeCapsFollowPaidSiteRule(scorecard)) {
    refuse(SCORECARD_FREE_CAPS_INVALID);
  }
  // Paid plans P4-E (Part 3b re-review M-4; ruling C4): and only one under which a Free ask
  // can seat its answer writer and answer checker. With billing on those two take a scored
  // Free-roster model or none, so a scorecard where no configured Free-roster model can take
  // one of them would refuse every Free question. Asked by the picker's own eligibility over
  // the file's targets and the version's sealed answer bounds (the writer's call runs under
  // the synthesizer bound, the checker's under the evaluator bound, as the API's
  // `answerTokenCeilingsByRole` maps them); the API's boot asks the same.
  if (billingPolicy?.enabled === true && scorecard !== null) {
    const ceilings = callTokenCeilingsFromValues((rowKey) => sealed(rowKey)?.value);
    if (!freeAnswerJobsFollowPaidSiteRule({
      scorecard: scorecard.scorecard,
      targets,
      freeRosterModelIds: PLAN_TIER_ROSTERS.free,
      answerTokenCeilingByRole: { ANSWER_WRITER: ceilings.synthesizer, ANSWER_CHECKER: ceilings.evaluator }
    })) {
      refuse(SCORECARD_FREE_ANSWER_UNSCORED);
    }
  }
  // Paid plans P4-G, ruling C7 (go-live row 31): a version that seals the band seals the room read's own
  // admission budget too, as the API's boot asks (ASK_ROOM_ADMISSION_UNSEALED), so a dry run says so.
  assertAskRoomAdmissionSealed({ envelope: costEnvelope, admission });
  // §2.5.1: WARN, never refuse, when a plan's smallest window (the day cap, or
  // Free's whole month) is below what one debate may spend.
  const warnings = Object.freeze(billingPlans === null ? [] : billingPlans.plans
    .filter((plan) => (planCapMicros(plan, "DAY") ?? plan.monthlyCreditMicros) < costEnvelope.perRunCeilingMicros)
    .map((plan) => `BILLING_PLAN_WINDOW_BELOW_RUN_CEILING:${plan.planId}`));

  const exampleLiteralVendors = new Set(file.configuredProviderSet.providers
    .filter((provider) => provider.providerRef.startsWith(EXAMPLE_PROVIDER_REF_PREFIX)
      || provider.maker.startsWith(EXAMPLE_MAKER_PREFIX)
      || provider.vetting?.dataUseTermsReviewedOn === HOSTED_REGISTER_EXAMPLE_VETTING_DATE
      || provider.vetting?.retentionTermsReviewedOn === HOSTED_REGISTER_EXAMPLE_VETTING_DATE)
    .map((provider) => provider.providerRef));
  const baseRegisterVersion = parseRegisterVersionText(String(bootstrap.registerVersion));
  const snapshotSha256 = computeRegisterSnapshotSha256(rows);
  return Object.freeze({
    bootstrap,
    baseRegisterVersion,
    publicationId: hostedPublicationId(baseRegisterVersion, snapshotSha256, file.sourceRef),
    sourceRef: file.sourceRef,
    rows,
    snapshotSha256,
    vendorRefs: Object.freeze(configured.map((provider) => provider.providerRef)),
    costEnvelope,
    synthesisRoles,
    pricedTargetCount: targets.length,
    exampleTargetRefs: Object.freeze(configured
      .filter((provider) => exampleLiteralVendors.has(provider.providerRef)
        || targets.some((target) => target.providerRef === provider.providerRef
          && isReservedExampleHost(new URL(target.baseUrl).hostname)))
      .map((provider) => provider.providerRef)),
    exampleSourceRef: file.sourceRef === HOSTED_REGISTER_EXAMPLE_SOURCE_REF,
    providerTargetsJson: targetsJson,
    billingPlans,
    billingPolicy,
    warnings,
    askRoomReads: admission.askRoomReads,
    modelScorecard: scorecard === null ? null : Object.freeze({
      scorecardVersion: scorecard.scorecardVersion,
      candidateCount: scorecard.candidateCount,
      apiCandidateCount: scorecard.apiCandidateCount,
      sha256: scorecard.sha256,
      bytes: scorecard.bytes
    })
  });
}

/**
 * A19: the scorecard line the plan prints, and carry 8's API-route count. A
 * scorecard none of whose candidates has an API route is still VALID and still
 * sealed — it is NOT a refusal — but the hosted site can seat none of its
 * models, so the plan says so in plain words.
 */
function renderModelScorecardLines(scorecard: HostedRegisterPlan["modelScorecard"]): readonly string[] {
  if (scorecard === null) return ["model_scorecard=none (asks keep the plan rosters)"];
  const lines = [
    `model_scorecard version=${scorecard.scorecardVersion}`
      + ` candidates=${scorecard.candidateCount}`
      + ` bytes=${scorecard.bytes} sha256=${scorecard.sha256}`,
    `model_scorecard api_candidates=${scorecard.apiCandidateCount}`
      + ` (${scorecard.apiCandidateCount} of the ${scorecard.candidateCount} scored models`
      + " can be reached through an API; the hosted site reaches models only that way)"
  ];
  if (scorecard.apiCandidateCount === 0) {
    lines.push("model_scorecard note: none of these models can be reached through an API, so the hosted site will keep"
      + " using the plan's usual models until a model it can reach through an API is scored."
      + " The scorecard is still valid and can still be published.");
  }
  return lines;
}

/** The plan as the operator reads it. Refs, counts, hashes and money — no path, no URL, no credential. */
export function renderHostedRegisterPlan(plan: HostedRegisterPlan): string {
  return [
    "HOSTED_REGISTER_PLAN deployment=hosted",
    `base_register_version=${plan.baseRegisterVersion}`,
    `publication_id=${plan.publicationId}`,
    `row_count=${plan.rows.length}`,
    `snapshot_sha256=${plan.snapshotSha256}`,
    `vendors=${plan.vendorRefs.join(",")}`,
    `provider_targets=${plan.pricedTargetCount} priced=${plan.pricedTargetCount}`,
    `example_vendors=${plan.exampleTargetRefs.length === 0 ? "none" : plan.exampleTargetRefs.join(",")}`,
    `example_source_ref=${plan.exampleSourceRef}`,
    // Review item 6: the production runner's boot reader pins the seeder's
    // source refs on the code-owned rows, so this register carries them too.
    "provenance=development-source-refs (known limitation)",
    `cost_envelope currency=${plan.costEnvelope.currency}`
      + ` per_run_ceiling_micros=${plan.costEnvelope.perRunCeilingMicros}`
      + ` daily_ceiling_micros=${plan.costEnvelope.dailyCeilingMicros}`
      + ` provisional=${plan.costEnvelope.provisional}`
      // Task M1: the answer's reserve and overrun, 0 when the file leaves them out.
      + ` serve_reserve_basis_points=${plan.costEnvelope.serveReserveBasisPoints}`
      + ` serve_overrun_basis_points=${plan.costEnvelope.serveOverrunBasisPoints}`,
    // Budget rule (spec 2026-09-28 §2.4): the band and the waiting line, or
    // "absent", which is today's behaviour exactly.
    plan.costEnvelope.closeBasisPoints === null
      ? "cost_envelope_band absent"
      : `cost_envelope_band admission_close_basis_points=${plan.costEnvelope.closeBasisPoints}`
        + ` finish_up_to_basis_points=${String(plan.costEnvelope.finishBasisPoints)}`
        + ` waiting_line_per_person=${String(plan.costEnvelope.waitingLinePerPerson)}`,
    // P4-G: the room read's admission budget, which a version with the band must seal (ruling C7).
    plan.askRoomReads === null
      ? "ask_room_reads absent"
      : `ask_room_reads key=${plan.askRoomReads.key} limit=${plan.askRoomReads.limit}`
        + ` window_ms=${plan.askRoomReads.windowMs} capacity=${plan.askRoomReads.capacity}`,
    `billing_policy ${plan.billingPolicy === null ? "absent" : `enabled=${String(plan.billingPolicy.enabled)}`}`,
    `billing_plans ${plan.billingPlans === null ? "absent" : `plan_ids=${plan.billingPlans.plans.map((entry) => entry.planId).join(",")}`}`,
    ...plan.warnings.map((warning) => `warning=${warning}`),
    `synthesis_roles synthesizer=${plan.synthesisRoles.synthesizerRoleRef}`
      + ` evaluator=${plan.synthesisRoles.evaluatorRoleRef}`,
    ...renderModelScorecardLines(plan.modelScorecard),
    `row_keys=${plan.rows.map((row) => row.rowKey).sort().join(",")}`
  ].join("\n") + "\n";
}

export type HostedRegisterOperations = Readonly<{
  /** The connected principal can publish (the migrator); refused before anything is written. */
  assertPublisher(): Promise<void>;
  /** The sealed historical set: identical is a replay, drift refuses `FX-REG-SEALED_VERSION_MISMATCH`. */
  importHistoricalBootstrap(bootstrap: BootstrapRegister): Promise<void>;
  /**
   * The database's own clock, read just before publishing. A receipt recorded
   * BEFORE it is a publication that already existed — a replay — and one
   * recorded after it is new. Asked of the clock rather than of
   * `register.register_version`, because every read of that relation outside a
   * test must be pinned to a version (tests/architecture/register-support-publication.test.ts),
   * and a lookup by publication id is not.
   */
  databaseNow(): Promise<Date>;
  publishGeneral(input: GeneralRegisterPublication): Promise<RegisterPublicationReceipt>;
  verifyBootReadiness(registerVersion: RegisterVersionText, providerTargetsJson: string): Promise<void>;
}>;

export type HostedRegisterPublicationResult = Readonly<{
  outcome: "CREATED" | "REPLAYED";
  registerVersion: RegisterVersionText;
  publicationId: string;
  snapshotSha256: string;
  rowCount: number;
}>;

/**
 * What a dry run may show and a publication may not seal: a vendor under a
 * reserved example name. Asked before any credential is needed, so the kit's
 * example file published unchanged is refused for what it is.
 */
export function assertHostedRegisterPlanPublishable(plan: HostedRegisterPlan): void {
  if (plan.exampleTargetRefs.length > 0) {
    refuse(`HOSTED_REGISTER_EXAMPLE_VENDOR_REFUSED:${plan.exampleTargetRefs[0]}`);
  }
  if (plan.exampleSourceRef) refuse("HOSTED_REGISTER_EXAMPLE_SOURCE_REF_REFUSED");
}

export async function publishHostedRegister(input: Readonly<{
  plan: HostedRegisterPlan;
  operations: HostedRegisterOperations;
}>): Promise<HostedRegisterPublicationResult> {
  const { plan, operations } = input;
  assertHostedRegisterPlanPublishable(plan);
  await operations.assertPublisher();
  await operations.importHistoricalBootstrap(plan.bootstrap);
  const startedAt = await operations.databaseNow();
  const receipt = await operations.publishGeneral({
    publicationId: plan.publicationId,
    baseRegisterVersion: plan.baseRegisterVersion,
    rows: plan.rows,
    sourceRef: plan.sourceRef,
    // C-I5: this IS the hosted publication path, so V-9(4)'s vetting is asked
    // again at the port, the one door every publication passes through.
    deployment: "hosted"
  });
  const result: HostedRegisterPublicationResult = Object.freeze({
    // Only the label depends on this comparison; what is sealed never does.
    outcome: receipt.recordedAt.getTime() < startedAt.getTime() ? "REPLAYED" : "CREATED",
    registerVersion: receipt.registerVersion,
    publicationId: receipt.publicationId,
    snapshotSha256: receipt.snapshotSha256,
    rowCount: receipt.rowCount
  });
  try {
    await operations.verifyBootReadiness(receipt.registerVersion, plan.providerTargetsJson);
  } catch (error) {
    throw new HostedRegisterBootCheckFailedError(error, result);
  }
  return result;
}

/**
 * The readers the API and the runner call at boot, in HOSTED mode, in their
 * order, over the published version — the same functions, not a restatement of
 * them. Each refuses with its own code.
 */
export async function verifyHostedRegisterBootReadiness(
  pool: Pool,
  registerVersion: RegisterVersionText,
  providerTargetsJson: string
): Promise<void> {
  const version = registerVersionToSafeLegacyNumber(registerVersion);
  assertHostedCostEnvelopesSealed("hosted");
  await readAuthPolicy(pool, version);
  await readMfaPolicy(pool, version);
  await readSessionPolicy(pool, version);
  await readRecoveryPolicy(pool, version);
  const admission = await readAdmissionPolicy(pool, version);
  // Paid plans G3a: main.ts's country-policy and country-gate-admission stages, in their order.
  const countryPolicy = await readCountryPolicy(pool, version);
  if (countryPolicy !== null && admission.geoAvailability === null) refuse("GEO_AVAILABILITY_ADMISSION_UNSEALED");
  assertHostedSupportAdmissionSealed("hosted", admission);
  const envelope = await readCostEnvelopePolicy(pool, version);
  // Paid plans (R1 A22, R-5): the readiness question the API asks at boot (B6b's
  // ask-room step, P6a). The runner never asks it: it reads no billingPolicy (A20).
  const billingPolicy = await readBillingPolicy(pool, version);
  assertBillingReady({
    policy: billingPolicy,
    plans: await readBillingPlans(pool, version),
    envelope
  });
  // Paid plans P4-G, ruling C7: the API boot's ask-room stage asks this next, of the same rows.
  assertAskRoomAdmissionSealed({ envelope, admission });
  // Paid plans P7/P8b/P8c/P9a/P13: main.ts's billing-runtime stage, in its order (country policy first, then the admission scopes).
  if (billingPolicy?.enabled === true && countryPolicy === null) refuse("BILLING_CONFIGURATION_INCOMPLETE");
  if (billingPolicy?.enabled === true && admission.billingQuote === null) refuse("BILLING_ADMISSION_UNSEALED");
  if (billingPolicy?.enabled === true && admission.billingCheckout === null) refuse("BILLING_ADMISSION_UNSEALED");
  if (billingPolicy?.enabled === true && admission.billingNotify === null) refuse("BILLING_ADMISSION_UNSEALED");
  if (billingPolicy?.enabled === true && admission.billingCancelLink === null) refuse("BILLING_ADMISSION_UNSEALED");
  await readProductRolePolicy(pool, version);
  const makers = await readDeploymentMakerCapability(pool, version);
  if (!makers.deploymentMakerCapability) refuse("HOSTED_REGISTER_MAKER_CAPABILITY_INSUFFICIENT");
  await readPanelDiscoveryPolicy(pool, version);
  await readStructuralCeilingPolicyInputs(pool, version);
  await readEnvelopeFormulaInputs(pool, version);
  await readDeploymentRiskTier(pool, version);
  // hate-speech S02: main.ts's publication-check-policy stage (the pre-publish check's deadline).
  await readPublicationCheckPolicy(pool, version);
  // A19: the scorecard is optional — ABSENT keeps the plan rosters — but a
  // sealed one the API would refuse at start-up is refused here, by its reason.
  const modelScorecard = await readModelScorecard(pool, version, await readEngineVersion());
  if (modelScorecard.state === "REFUSED") {
    refuse(`HOSTED_REGISTER_MODEL_SCORECARD_REFUSED:${modelScorecard.reason}`);
  }
  await readDevelopmentRunnerPolicy(pool, version);
  const targets = parseProviderDiscoveryTargets(providerTargetsJson, makers.configuredProviders);
  assertDeploymentProviderTargets(targets, { mode: "hosted", nodeEnv: "production" });
  assertPricedProviderTargets(targets, "hosted");
}

export function createPostgresHostedRegisterOperations(pool: Pool): HostedRegisterOperations {
  const port = createPostgresRegisterPublicationPort(pool);
  return Object.freeze({
    async assertPublisher() {
      // The seeder's own authority question. `register.publish_register_version`
      // is executable by its NOLOGIN owner alone since 0065 revoked it from
      // debateai_runtime, so the P3-01 migrator — a superuser, connecting as
      // itself — is the one principal that can publish.
      const row = (await pool.query<{ session_principal: string; principal: string; rolsuper: boolean }>(`
        SELECT session_user AS session_principal,current_user AS principal,role.rolsuper
        FROM pg_catalog.pg_roles AS role WHERE role.rolname=current_user
      `)).rows[0];
      if (row === undefined || !row.rolsuper || row.session_principal !== row.principal) {
        refuse("HOSTED_REGISTER_PUBLISHER_REQUIRED");
      }
    },
    async importHistoricalBootstrap(bootstrap: BootstrapRegister) {
      await persistBootstrapRegister(pool, bootstrap);
    },
    async databaseNow() {
      const row = (await pool.query<{ now: Date }>("SELECT pg_catalog.clock_timestamp() AS now")).rows[0];
      if (row === undefined || !(row.now instanceof Date) || !Number.isFinite(row.now.getTime())) {
        refuse("HOSTED_REGISTER_PUBLISH_FAILED");
      }
      return row.now;
    },
    publishGeneral: (input: GeneralRegisterPublication) => port.publishGeneral(input),
    verifyBootReadiness: (registerVersion: RegisterVersionText, providerTargetsJson: string) =>
      verifyHostedRegisterBootReadiness(pool, registerVersion, providerTargetsJson)
  });
}

/** Proposal rows only. No publication/boot path calls this until the later implementation/readiness gates exist. */
export function buildHostedStaffV2RegisterPublicationRows(
  v1Rows: readonly RegisterPublicationRow[], source: Readonly<Record<string, string | undefined>>
): readonly RegisterPublicationRow[] {
  const configuration = parseStaffAccessEnvironment(source);
  if (configuration.policyVersion !== 2) throw new TypeError("STAFF_V2_CONFIGURATION_REQUIRED");
  return composeStaffPolicyRegisterPublicationRows(v1Rows, { policyVersion: 2, ...(configuration.internalAllowancePolicy === undefined ? {} : { internalAllowance: configuration.internalAllowancePolicy }) });
}
