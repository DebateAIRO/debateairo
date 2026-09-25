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
 *  - the two OPERATOR-OWNED rows, read from the operator's file: the vetted
 *    `configuredProviderSet` (V-9(4), built by `buildConfiguredProviderSetDeploymentRow`)
 *    and the `costEnvelopePolicy` (V-28, validated by the register's own schema).
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
import { custodyAccepts } from "@debateai/crypto";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  assertDeploymentProviderTargets,
  assertPricedProviderTargets,
  parseProviderDiscoveryTargets,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import {
  ALGORITHM_REGISTER_ROW_KEYS,
  CONFIGURED_PROVIDER_SET_ROW_KEY,
  COST_ENVELOPE_POLICY_ROW_KEY,
  admissionPolicyFromValue,
  assertHostedCostEnvelopesSealed,
  assertHostedSupportAdmissionSealed,
  buildConfiguredProviderSetDeploymentRow,
  computeRegisterSnapshotSha256,
  costEnvelopePolicyFromValue,
  createPostgresRegisterPublicationPort,
  loadBootstrapRegister,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  persistBootstrapRegister,
  readAdmissionPolicy,
  readAuthPolicy,
  readCostEnvelopePolicy,
  readDeploymentRiskTier,
  readEnvelopeFormulaInputs,
  readMfaPolicy,
  readPanelDiscoveryPolicy,
  readProductRolePolicy,
  readRecoveryPolicy,
  readSessionPolicy,
  readStructuralCeilingPolicyInputs,
  registerVersionToSafeLegacyNumber,
  warnOnIdenticalSynthesisRoleRefs,
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
const MAX_SOURCE_REF_LENGTH = 512;
const TOP_LEVEL_KEYS = Object.freeze([
  "format", "sourceRef", "configuredProviderSet", "costEnvelopePolicy",
  "providerTargets", "synthesisRoles"
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
const TYPED_CODE = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)+(?::[A-Za-z0-9_.:-]+)?$/u;
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

export type HostedRegisterArguments = Readonly<{ filePath: string; dryRun: boolean }>;

/** `--file <path>` once, `--dry-run` at most once, nothing else. */
export function parseHostedRegisterArguments(args: readonly string[]): HostedRegisterArguments {
  let filePath: string | undefined;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run" && !dryRun) {
      dryRun = true;
    } else if (argument === "--file" && filePath === undefined
      && args[index + 1] !== undefined && args[index + 1]!.length > 0
      && !args[index + 1]!.startsWith("--")) {
      filePath = args[index + 1]!;
      index += 1;
    } else {
      refuse("HOSTED_REGISTER_USAGE");
    }
  }
  if (filePath === undefined) refuse("HOSTED_REGISTER_USAGE");
  return Object.freeze({ filePath: resolve(filePath), dryRun });
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
    // A hosted deployment reaches paid vendor APIs through the one OpenAI-
    // compatible adapter (V-9(3)); it has no self-hosted inference server (V-20).
    adapterKind: z.literal("openai-compatible-http"),
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
  /** Validated in the plan by the boot's own parser and hosted checks. NEVER published and never printed. */
  providerTargets: unknown;
  synthesisRoles: z.infer<typeof synthesisRolesSchema> | null;
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
  return Object.freeze({
    format: HOSTED_REGISTER_FILE_FORMAT,
    sourceRef,
    configuredProviderSet: providerSet.data,
    costEnvelopePolicy: record.costEnvelopePolicy,
    providerTargets: record.providerTargets,
    synthesisRoles
  });
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

/**
 * The operator's file, read under the codebase's ONE custody decision
 * (`custodyAccepts`, single-owner contract): a regular file, one link, mode 0600
 * owned by the caller, inside a 0700 directory owned by the caller, opened with
 * `O_NOFOLLOW` and judged on the descriptor actually read. The file holds no
 * secret, but it decides what every service runs under — prices, ceilings,
 * vendors — so a file another principal could replace is refused.
 */
export async function readHostedRegisterFile(path: string): Promise<HostedRegisterFile> {
  const resolved = resolve(path);
  let handle;
  try {
    handle = await open(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) refuse("HOSTED_REGISTER_FILE_ABSENT");
    return refuse("HOSTED_REGISTER_FILE_CUSTODY_INVALID");
  }
  let bytes: Buffer;
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
      refuse("HOSTED_REGISTER_FILE_CUSTODY_INVALID");
    }
    if (metadata.size < 1 || metadata.size > MAX_FILE_BYTES) refuse("HOSTED_REGISTER_FILE_INVALID");
    const bounded = Buffer.alloc(MAX_FILE_BYTES + 1);
    let offset = 0;
    while (offset < bounded.length) {
      const { bytesRead } = await handle.read(bounded, offset, bounded.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== metadata.size) refuse("HOSTED_REGISTER_FILE_INVALID");
    bytes = bounded.subarray(0, offset);
  } finally {
    await handle.close();
  }
  return parseHostedRegisterFile(bytes);
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
export async function planHostedRegisterPublication(file: HostedRegisterFile): Promise<HostedRegisterPlan> {
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
  const codeOwnedRows = await buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, {
    configuredProviders: configured,
    requiredDistinctMakers: file.configuredProviderSet.requiredDistinctMakers,
    healthyProviderRefs: Object.freeze([]),
    targets,
    targetsJson
  }, synthesisRoles);
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
  const replaced = codeOwnedRows.filter((row) => operatorRows.has(row.rowKey));
  if (replaced.length !== operatorRows.size) refuse("HOSTED_REGISTER_COMPOSITION_INVALID");
  const rows = Object.freeze(codeOwnedRows.map((row) => operatorRows.get(row.rowKey) ?? row));
  const keys = new Set(rows.map((row) => row.rowKey));
  if (keys.size !== rows.length || ALGORITHM_REGISTER_ROW_KEYS.some((key) => !keys.has(key))) {
    refuse("HOSTED_REGISTER_COMPOSITION_INVALID");
  }
  // The hosted boot refuses a register whose admission row lacks the support
  // budgets; asked here of the value about to be sealed, so a dry run says so.
  const admission = rows.find((row) => row.rowKey === "admissionPolicy");
  if (admission === undefined) refuse("HOSTED_REGISTER_ROW_MISSING:admissionPolicy");
  assertHostedSupportAdmissionSealed("hosted", admissionPolicyFromValue(
    JSON.parse(admission.valueJsonText) as unknown, admission.sourceRef
  ));

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
    providerTargetsJson: targetsJson
  });
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
      + ` provisional=${plan.costEnvelope.provisional}`,
    `synthesis_roles synthesizer=${plan.synthesisRoles.synthesizerRoleRef}`
      + ` evaluator=${plan.synthesisRoles.evaluatorRoleRef}`,
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
  assertHostedSupportAdmissionSealed("hosted", await readAdmissionPolicy(pool, version));
  await readCostEnvelopePolicy(pool, version);
  await readProductRolePolicy(pool, version);
  const makers = await readDeploymentMakerCapability(pool, version);
  if (!makers.deploymentMakerCapability) refuse("HOSTED_REGISTER_MAKER_CAPABILITY_INSUFFICIENT");
  await readPanelDiscoveryPolicy(pool, version);
  await readStructuralCeilingPolicyInputs(pool, version);
  await readEnvelopeFormulaInputs(pool, version);
  await readDeploymentRiskTier(pool, version);
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
