import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Pool, PoolClient } from "pg";
import { EVALUATOR_CONTRACT_TEXT } from "./index.js";
import { CLAIM_TYPES } from "@debateai/kernel";
import {
  ADMISSION_POLICY_REGISTER_ROW,
  ALGORITHM_REGISTER_ROW_KEYS,
  AUTH_POLICY_REGISTER_ROWS,
  ENGINE_BAND_ORDER,
  MFA_POLICY_REGISTER_ROW,
  PRODUCT_ROLE_POLICY_REGISTER_ROW,
  RECOVERY_POLICY_REGISTER_ROW,
  SESSION_POLICY_REGISTER_ROW,
  buildAlgorithmRegisterRows,
  loadBootstrapRegister,
  warnOnIdenticalSynthesisRoleRefs,
  persistBootstrapRegister,
  type BootstrapRegister,
  type ProviderFamilyEntry,
  computeRegisterSnapshotSha256,
  canonicalDecimal,
  canonicalRegisterJson,
  createPostgresRegisterPublicationPort,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  type CanonicalJsonAst,
  type RegisterPublicationRow,
  type RegisterVersionText
} from "@debateai/register";
import type { DevelopmentConfiguredProvider, DevelopmentProviderPanel } from "./dev-provider-panel.js";

export type DevelopmentDeploymentRegisterRow = Readonly<{
  rowKey: string;
  value: unknown;
  sourceRef: string;
}>;

export const DEVELOPMENT_SOURCE_REF =
  "DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05" as const;
export const DEVELOPMENT_RUNNER_SOURCE_REF =
  "DEV-12D-development-runner-policy.md#sealed-v2" as const;
/** T16 · dev provenance for every sealed algorithm row (goal-v4 lines 80-96). */
export const DEVELOPMENT_ALGORITHM_SOURCE_REF =
  "DEV-T16-algorithm-register.md#goal-v4:80-96" as const;
export const DEVELOPMENT_ORGAN_COST_BOUNDS = Object.freeze({
  kind: "ACCEPTANCE_ORGAN_COST_BOUNDS" as const,
  organs: Object.freeze({
    JUDGE: Object.freeze({ maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 }),
    COMPOSER: Object.freeze({ maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 60_000 }),
    CONFORMANCE: Object.freeze({ maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 60_000 })
  })
});
export const DEVELOPMENT_RUN_DEATH_POLICY = Object.freeze({
  kind: "RUN_DEATH_POLICY" as const,
  cooldown_ms: 600_000,
  final_retry_attempts: 1,
  max_cooldown_holds_per_run: 2,
  applies_to: "TRANSPORT_EXHAUSTION" as const
});
/** First allocated version on a fresh database; runtime pins use the returned receipt. */
export const DEVELOPMENT_REGISTER_VERSION = 5 as const;
export const DEVELOPMENT_HISTORICAL_REGISTER_VERSION = 4 as const;
export const DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_SCHEMA =
  "debateai.dev-deployment-register-receipt.v1" as const;
export const DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_RELATIVE_PATH =
  ".local/dev-auth/deployment-register-receipt.v1.json" as const;
export const DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX =
  "DEV_DEPLOYMENT_REGISTER_RECEIPT_V1=" as const;

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MAX_RECEIPT_BYTES = 4_096;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export type DevelopmentDeploymentRegisterMachineReceiptV1 = Readonly<{
  schema: typeof DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_SCHEMA;
  registerVersion: RegisterVersionText;
  rowCount: number;
  snapshotSha256: string;
  receiptSha256: string;
}>;

function lp(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  return Buffer.concat([length, bytes]);
}

function receiptDigest(input: Readonly<{
  registerVersion: RegisterVersionText;
  rowCount: number;
  snapshotSha256: string;
}>): string {
  const hash = createHash("sha256");
  for (const value of [
    DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_SCHEMA,
    input.registerVersion,
    String(input.rowCount),
    input.snapshotSha256
  ]) hash.update(lp(value));
  return hash.digest("hex");
}

export function createDevelopmentDeploymentRegisterMachineReceipt(input: Readonly<{
  registerVersion: RegisterVersionText;
  rowCount: number;
  snapshotSha256: string;
}>): DevelopmentDeploymentRegisterMachineReceiptV1 {
  const registerVersion = parseRegisterVersionText(input.registerVersion);
  if (!Number.isSafeInteger(input.rowCount) || input.rowCount < 1
    || !SHA256_PATTERN.test(input.snapshotSha256)) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_INVALID");
  }
  return Object.freeze({
    receiptSha256: receiptDigest({ registerVersion, rowCount: input.rowCount, snapshotSha256: input.snapshotSha256 }),
    registerVersion,
    rowCount: input.rowCount,
    schema: DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_SCHEMA,
    snapshotSha256: input.snapshotSha256,
  });
}

export function serializeDevelopmentDeploymentRegisterReceipt(
  receipt: DevelopmentDeploymentRegisterMachineReceiptV1
): string {
  const expected = createDevelopmentDeploymentRegisterMachineReceipt(receipt);
  if (receipt.schema !== expected.schema || receipt.receiptSha256 !== expected.receiptSha256
    || Object.keys(receipt).join("\0") !== "receiptSha256\0registerVersion\0rowCount\0schema\0snapshotSha256") {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_INVALID");
  }
  return JSON.stringify(receipt);
}

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_OWNER_UNVERIFIED");
  }
  return process.getuid();
}

function isFileSystemError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

async function assertReceiptDirectory(path: string): Promise<void> {
  const metadata = await lstat(path).catch(() => null);
  if (metadata === null || metadata.isSymbolicLink() || !metadata.isDirectory()
    || metadata.uid !== currentUid() || (metadata.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_CUSTODY_INVALID");
  }
}

async function readReceiptBytes(path: string): Promise<string> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) {
      throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_REQUIRED");
    }
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_CUSTODY_INVALID");
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.uid !== currentUid() || metadata.nlink !== 1
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
      || metadata.size < 1 || metadata.size > MAX_RECEIPT_BYTES) {
      throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_CUSTODY_INVALID");
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

export function developmentDeploymentRegisterReceiptPath(repositoryRoot: string): string {
  if (!isAbsolute(repositoryRoot)) throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_PATH_INVALID");
  return join(resolve(repositoryRoot), DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_RELATIVE_PATH);
}

function parseReceiptJson(source: string): DevelopmentDeploymentRegisterMachineReceiptV1 {
  if (!source.endsWith("\n") || source.includes("\r") || Buffer.byteLength(source) > MAX_RECEIPT_BYTES) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_INVALID");
  }
  const json = source.slice(0, -1);
  let parsed: unknown;
  try {
    if (parseCanonicalRegisterJson(Buffer.from(json, "utf8")) !== json) {
      throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_INVALID");
    }
    parsed = JSON.parse(json);
  } catch {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_INVALID");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_INVALID");
  }
  const candidate = parsed as Record<string, unknown>;
  if (Object.keys(candidate).join("\0") !== "receiptSha256\0registerVersion\0rowCount\0schema\0snapshotSha256"
    || candidate.schema !== DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_SCHEMA
    || typeof candidate.registerVersion !== "string"
    || typeof candidate.rowCount !== "number"
    || typeof candidate.snapshotSha256 !== "string"
    || typeof candidate.receiptSha256 !== "string") {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_INVALID");
  }
  const expected = createDevelopmentDeploymentRegisterMachineReceipt({
    registerVersion: parseRegisterVersionText(candidate.registerVersion),
    rowCount: candidate.rowCount,
    snapshotSha256: candidate.snapshotSha256
  });
  if (candidate.receiptSha256 !== expected.receiptSha256
    || serializeDevelopmentDeploymentRegisterReceipt(expected) !== json) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_INVALID");
  }
  return expected;
}

export async function readDevelopmentDeploymentRegisterReceipt(
  repositoryRoot: string
): Promise<DevelopmentDeploymentRegisterMachineReceiptV1> {
  const path = developmentDeploymentRegisterReceiptPath(repositoryRoot);
  await assertReceiptDirectory(dirname(path));
  return parseReceiptJson(await readReceiptBytes(path));
}

export async function writeDevelopmentDeploymentRegisterReceipt(
  repositoryRoot: string,
  receipt: DevelopmentDeploymentRegisterMachineReceiptV1
): Promise<string> {
  const path = developmentDeploymentRegisterReceiptPath(repositoryRoot);
  await assertReceiptDirectory(dirname(path));
  const source = `${serializeDevelopmentDeploymentRegisterReceipt(receipt)}\n`;
  if (Buffer.byteLength(source) > MAX_RECEIPT_BYTES) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_INVALID");
  }
  const existing = await lstat(path).catch(() => null);
  if (existing !== null && (existing.isSymbolicLink() || !existing.isFile()
    || existing.uid !== currentUid() || existing.nlink !== 1
    || (existing.mode & 0o777) !== PRIVATE_FILE_MODE
    || existing.size < 1 || existing.size > MAX_RECEIPT_BYTES)) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_CUSTODY_INVALID");
  }
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  let temporaryExists = false;
  try {
    const handle = await open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      PRIVATE_FILE_MODE
    );
    temporaryExists = true;
    try {
      await handle.chmod(PRIVATE_FILE_MODE);
      await handle.writeFile(source, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, path);
    temporaryExists = false;
  } finally {
    if (temporaryExists) await unlink(temporaryPath);
  }
  const directory = await open(dirname(path), constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  const persisted = await readDevelopmentDeploymentRegisterReceipt(repositoryRoot);
  if (persisted.receiptSha256 !== receipt.receiptSha256) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_PUBLISH_FAILED");
  }
  return path;
}

export async function parseDevelopmentDeploymentRegisterCliOutput(
  rawOutput: string,
  repositoryRoot: string
): Promise<DevelopmentDeploymentRegisterMachineReceiptV1> {
  if (typeof rawOutput !== "string" || !rawOutput.endsWith("\n") || rawOutput.includes("\r")) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_OUTPUT_INVALID");
  }
  const line = rawOutput.slice(0, -1);
  if (!line.startsWith(DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX)
    || line.includes("\n")) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_OUTPUT_INVALID");
  }
  const fromOutput = parseReceiptJson(
    `${line.slice(DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX.length)}\n`
  );
  const fromFile = await readDevelopmentDeploymentRegisterReceipt(repositoryRoot);
  if (serializeDevelopmentDeploymentRegisterReceipt(fromOutput)
    !== serializeDevelopmentDeploymentRegisterReceipt(fromFile)) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_OUTPUT_MISMATCH");
  }
  return fromFile;
}

const DEVELOPMENT_DEPLOYMENT_REGISTER_STATIC_ROWS = Object.freeze([
  Object.freeze({
    rowKey: "panelDiscoveryPolicy",
    value: Object.freeze({
      kind: "PANEL_DISCOVERY_POLICY" as const,
      probe_freshness_ms: 600_000,
      probe_max_attempts: 1 as const
    }),
    sourceRef: DEVELOPMENT_SOURCE_REF
  }),
  Object.freeze({
    rowKey: "riskTier",
    value: "standard" as const,
    sourceRef: DEVELOPMENT_SOURCE_REF
  }),
  Object.freeze({
    rowKey: "acceptanceOrganCostBounds",
    value: DEVELOPMENT_ORGAN_COST_BOUNDS,
    sourceRef: DEVELOPMENT_SOURCE_REF
  }),
  Object.freeze({
    rowKey: "runDeathPolicy",
    value: DEVELOPMENT_RUN_DEATH_POLICY,
    sourceRef: DEVELOPMENT_SOURCE_REF
  })
] satisfies readonly DevelopmentDeploymentRegisterRow[]);

export function buildDevelopmentDeploymentRegisterRows(
  providerPanel: DevelopmentProviderPanel
): readonly DevelopmentDeploymentRegisterRow[] {
  return Object.freeze([
    Object.freeze({
      rowKey: "configuredProviderSet",
      value: Object.freeze({
        kind: "CONFIGURED_PROVIDER_SET" as const,
        requiredDistinctMakers: providerPanel.requiredDistinctMakers,
        providers: providerPanel.configuredProviders
      }),
      sourceRef: DEVELOPMENT_SOURCE_REF
    }),
    ...DEVELOPMENT_DEPLOYMENT_REGISTER_STATIC_ROWS
  ]);
}

/**
 * T16 · the provider→family map, read off the deployment's OWN configured
 * provider set so the family names are exactly what the relay layer calls its
 * makers (DECISIONS J1). First-appearance order is preserved.
 */
export function deriveProviderFamilies(
  configuredProviders: readonly DevelopmentConfiguredProvider[]
): readonly ProviderFamilyEntry[] {
  const byMaker = new Map<string, string[]>();
  for (const provider of configuredProviders) {
    const providerRefs = byMaker.get(provider.maker);
    if (providerRefs === undefined) byMaker.set(provider.maker, [provider.providerRef]);
    else providerRefs.push(provider.providerRef);
  }
  if (byMaker.size === 0) throw new TypeError("DEV_ALGORITHM_REGISTER_FAMILY_MAP_UNRESOLVED");
  return Object.freeze([...byMaker].map(([familyRef, providerRefs]) =>
    Object.freeze({ familyRef, providerRefs: Object.freeze([...providerRefs]) })
  ));
}

/**
 * T16 · dev-provisional synthesizer and evaluator identities (ruling J8): the
 * first two configured providers of DIFFERENT makers. Identical refs stay
 * lawful (goal 84-85) but the seeding entrypoint warns once (ruling J7); this
 * default seeds two different ones, so the warning must not fire by default.
 */
export function deriveSynthesisRoleRefs(
  configuredProviders: readonly DevelopmentConfiguredProvider[]
): Readonly<{ synthesizerRoleRef: string; evaluatorRoleRef: string }> {
  const families = deriveProviderFamilies(configuredProviders);
  if (families.length < 2) throw new TypeError("DEV_ALGORITHM_REGISTER_ROLE_REFS_UNRESOLVED");
  return Object.freeze({
    synthesizerRoleRef: families[0]!.providerRefs[0]!,
    evaluatorRoleRef: families[1]!.providerRefs[0]!
  });
}

export type DevelopmentSynthesisRoleRefs = Readonly<{
  synthesizerRoleRef: string;
  evaluatorRoleRef: string;
}>;

/**
 * WHICH role an unconfigured override named. Bounded by construction: two
 * constants of this module. The override VALUE is an environment string the
 * operator supplied — unbounded, and the only unbounded tail any DEV_ code in
 * this corpus still carried — so it never rides the rejection. The role does,
 * because naming the variable to re-check is all an operator needs and it is a
 * closed set.
 */
export const DEVELOPMENT_SYNTHESIS_ROLE_NAMES = Object.freeze([
  "synthesizer", "evaluator"
] as const);
export type DevelopmentSynthesisRoleName = typeof DEVELOPMENT_SYNTHESIS_ROLE_NAMES[number];
const developmentSynthesisRoleNames = new Set<string>(DEVELOPMENT_SYNTHESIS_ROLE_NAMES);

/**
 * The role an unconfigured-override rejection named, or null for anything that
 * is not one or whose cause is not one of the constants above. A log path reads
 * the role through this function, so no caller reaches into `cause` and decides
 * for itself what is safe to print (the packages/db/src/auth-risk.ts shape).
 */
export function developmentSynthesisRoleRefUnconfiguredRole(
  error: unknown
): DevelopmentSynthesisRoleName | null {
  if (!(error instanceof TypeError)
    || error.message !== "DEV_ALGORITHM_REGISTER_ROLE_REF_UNCONFIGURED") return null;
  const cause = (error as { readonly cause?: unknown }).cause;
  return typeof cause === "string" && developmentSynthesisRoleNames.has(cause)
    ? cause as DevelopmentSynthesisRoleName
    : null;
}

/**
 * Goal 84-85 PERMITS identical synthesizer and evaluator refs (and requires a
 * warning when they are). An operator therefore needs a way to configure them;
 * without one the permitted case is unreachable and its warning is dead code.
 * Each override must name a CONFIGURED provider identity — an unknown ref
 * fails loudly rather than sealing a role nothing can serve.
 */
export function resolveDevelopmentSynthesisRoleRefs(
  providerPanel: DevelopmentProviderPanel,
  source: Readonly<Record<string, string | undefined>> = {}
): DevelopmentSynthesisRoleRefs {
  const derived = deriveSynthesisRoleRefs(providerPanel.configuredProviders);
  const configured = new Set(providerPanel.configuredProviders.map((provider) => provider.providerRef));
  const resolve = (
    override: string | undefined,
    fallback: string,
    role: DevelopmentSynthesisRoleName
  ): string => {
    if (override === undefined || override.trim() === "") return fallback;
    if (!configured.has(override)) {
      throw new TypeError("DEV_ALGORITHM_REGISTER_ROLE_REF_UNCONFIGURED", { cause: role });
    }
    return override;
  };
  return Object.freeze({
    synthesizerRoleRef: resolve(
      source.DEBATEAI_DEV_SYNTHESIZER_ROLE_REF, derived.synthesizerRoleRef, "synthesizer"
    ),
    evaluatorRoleRef: resolve(
      source.DEBATEAI_DEV_EVALUATOR_ROLE_REF, derived.evaluatorRoleRef, "evaluator"
    )
  });
}

export function buildDevelopmentAlgorithmRegisterRows(
  providerPanel: DevelopmentProviderPanel,
  roleRefs: DevelopmentSynthesisRoleRefs = deriveSynthesisRoleRefs(providerPanel.configuredProviders)
): readonly DevelopmentDeploymentRegisterRow[] {
  return Object.freeze(buildAlgorithmRegisterRows({
    deploymentSourceRef: DEVELOPMENT_ALGORITHM_SOURCE_REF,
    synthesizerRoleRef: roleRefs.synthesizerRoleRef,
    evaluatorRoleRef: roleRefs.evaluatorRoleRef,
    providerFamilies: deriveProviderFamilies(providerPanel.configuredProviders),
    // W10/3: this deployment's OWN judge clock is the floor the two synthesis
    // cost rows are sealed against. Read from the row that declares it, never
    // restated — a second literal here is exactly how the 60_000/180_000
    // inversion survived T9.
    judgeDeadlineMs: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.JUDGE.deadlineMs
  }).map((row) => Object.freeze(row)));
}

const digest = (text: string): string => createHash("sha256").update(text).digest("hex");

function requireMatch(source: string, expression: RegExp, label: string): string {
  const value = source.match(expression)?.[1];
  if (value === undefined) throw new TypeError(`DEV_RUNNER_CONTRACT_TEXT_UNRESOLVED:${label}`);
  return value;
}


async function computeDevelopmentContractRows(): Promise<readonly DevelopmentDeploymentRegisterRow[]> {
  const [judge, runner, propagation, serve] = await Promise.all([
    readFile(new URL("../../../packages/judgement/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("./index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../packages/propagation/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../packages/serve/src/index.ts", import.meta.url), "utf8")
  ]);
  const values = Object.freeze({
    judgeContractHash: digest(requireMatch(judge, /content: `([\s\S]*?)`/, "judge")),
    composerContractHash: digest(requireMatch(
      runner,
      /content: "(Return only JSON with a segments array[^"]+)"/,
      "composer"
    )),
    conformanceContractHash: digest(EVALUATOR_CONTRACT_TEXT),
    // codex r2 B1a: the fingerprint is taken from the constant the runner
    // SENDS, not from a search of the runner's source. There is nothing left
    // for a comment, string, regex or template literal to confuse.
    propagationContractHash: digest(propagation),
    serveContractHash: digest(serve)
  });
  return Object.freeze(Object.entries(values).map(([rowKey, value]) => Object.freeze({
    rowKey, value, sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF
  })));
}

export async function buildDevelopmentRunnerRegisterRows(): Promise<readonly DevelopmentDeploymentRegisterRow[]> {
  const composition = Object.freeze({
    branch: "EVIDENCE_AWARE" as const,
    clarityDecayPerAmbiguity: 0.1,
    terms: Object.freeze([Object.freeze({ metric: "steelman_fidelity" as const, coefficient: 1 })]),
    caps: Object.freeze([]),
    uncertaintyLadder: Object.freeze([Object.freeze({ atMost: 1, label: "PROVISIONAL" })])
  });
  const ruledRows = [
    {
      rowKey: "livenessPolicy",
      value: Object.freeze({
        kind: "LIVENESS_POLICY" as const,
        classes: Object.freeze({
          standard: Object.freeze({
            review_after_ms: 7 * 24 * 60 * 60 * 1_000,
            retire_after_ms: 180 * 24 * 60 * 60 * 1_000
          })
        })
      }),
      sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF
    },
    {
      rowKey: "claimTypeCompositionMap",
      value: Object.freeze({
        kind: "CLAIM_TYPE_COMPOSITION_MAP" as const,
        entries: Object.freeze(Object.fromEntries(CLAIM_TYPES.map((claimType) => [claimType, composition])))
      }),
      sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF
    },
    {
      rowKey: "wayOfKnowingCeiling",
      value: Object.freeze({
        bandOrder: ENGINE_BAND_ORDER,
        ceilingLabels: Object.freeze(["DEFAULT_CEILING", "REASONING_CEILING", "NO_VERIFIED_EVIDENCE_FLOOR"]),
        defaultCeiling: Object.freeze({
          label: "DEFAULT_CEILING", ceilingBand: "FULL", liftPath: "retain-band"
        }),
        cuts: Object.freeze([Object.freeze({
          minimumShares: Object.freeze({ REASONING: 0.5 }),
          label: "REASONING_CEILING", ceilingBand: "CAPPED",
          liftPath: "gather-evidence-to-lift"
        })]),
        // F-T9B-3, the DEVELOPMENT twin of the acceptance entry: the floor a
        // run is entitled to on NO VERIFIED EVIDENCE. The reasoning-share cut
        // above names the right band for that case and the wrong reason — its
        // trigger cannot fire on an empty basis.
        emptyBasisFloor: Object.freeze({
          label: "NO_VERIFIED_EVIDENCE_FLOOR",
          ceilingBand: "CAPPED",
          liftPath: "gather-any-verified-evidence-to-lift"
        })
      }),
      sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF
    },
    {
      rowKey: "compositionBundleBudget",
      value: Object.freeze({ low: 10_000, medium: 20_000, high: 30_000 }),
      sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF
    },
    {
      rowKey: "candidateConfidenceBand",
      value: "FULL",
      sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF
    },
    {
      rowKey: "judgementSelectionPolicy",
      value: Object.freeze({
        kind: "MAXIMIZE_WEIGHTED_TAU" as const,
        earnedWeight: 1,
        judgeWeightVersion: "development:single-judge:v1",
        reducerVersion: "development:weighted-tau:v1"
      }),
      sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF
    },
    { rowKey: "scoringOperator", value: "accumulate", sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF },
    { rowKey: "hiddenNodeScoreThreshold", value: 0.35, sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF }
  ] satisfies readonly DevelopmentDeploymentRegisterRow[];
  return Object.freeze([
    ...ruledRows.map((row) => Object.freeze(row)),
    ...await computeDevelopmentContractRows()
  ]);
}

type SeedDevelopmentDeploymentRegisterInput = Readonly<{
  adminPool: Pool;
  providerPanel: DevelopmentProviderPanel;
  /** Defaults to the two-different-makers derivation; the CLI supplies operator overrides. */
  roleRefs?: DevelopmentSynthesisRoleRefs;
  repositoryRoot: string;
}>;

export type DevelopmentDeploymentRegisterReceipt =
  DevelopmentDeploymentRegisterMachineReceiptV1;

function developmentValueAst(value: unknown): CanonicalJsonAst {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return canonicalDecimal(String(value));
  if (Array.isArray(value)) return Object.freeze(value.map(developmentValueAst));
  if (typeof value === "object"
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, member]) => [key, developmentValueAst(member)])
    ));
  }
  throw new TypeError("DEV_DEPLOYMENT_REGISTER_VALUE_INVALID");
}

function developmentRows(
  bootstrap: BootstrapRegister,
  providerPanel: DevelopmentProviderPanel,
  roleRefs: DevelopmentSynthesisRoleRefs
): readonly DevelopmentDeploymentRegisterRow[] {
  const bootstrapRows = Object.entries(bootstrap.values).map(([rowKey, value]) =>
    Object.freeze({
      rowKey,
      value,
      sourceRef: bootstrap.resolution[rowKey as keyof typeof bootstrap.resolution]
    })
  );
  const rows = [
    ...bootstrapRows,
    ...AUTH_POLICY_REGISTER_ROWS,
    MFA_POLICY_REGISTER_ROW,
    SESSION_POLICY_REGISTER_ROW,
    RECOVERY_POLICY_REGISTER_ROW,
    PRODUCT_ROLE_POLICY_REGISTER_ROW,
    ADMISSION_POLICY_REGISTER_ROW,
    ...buildDevelopmentDeploymentRegisterRows(providerPanel),
    ...buildDevelopmentAlgorithmRegisterRows(providerPanel, roleRefs)
  ];
  if (new Set(rows.map(({ rowKey }) => rowKey)).size !== rows.length) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_DEFINITION_INVALID");
  }
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

async function expectedRunnerRows(
  bootstrap: BootstrapRegister,
  providerPanel: DevelopmentProviderPanel,
  roleRefs: DevelopmentSynthesisRoleRefs
): Promise<readonly DevelopmentDeploymentRegisterRow[]> {
  const rows = [
    ...developmentRows(bootstrap, providerPanel, roleRefs),
    ...await buildDevelopmentRunnerRegisterRows()
  ];
  if (new Set(rows.map(({ rowKey }) => rowKey)).size !== rows.length) {
    throw new TypeError("DEV_RUNNER_REGISTER_DEFINITION_INVALID");
  }
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

export async function buildDevelopmentDeploymentRegisterPublicationRows(
  bootstrap: BootstrapRegister,
  providerPanel: DevelopmentProviderPanel,
  roleRefs: DevelopmentSynthesisRoleRefs = deriveSynthesisRoleRefs(providerPanel.configuredProviders)
): Promise<readonly RegisterPublicationRow[]> {
  return Object.freeze((await expectedRunnerRows(bootstrap, providerPanel, roleRefs)).map((row) =>
    Object.freeze({
      rowKey: row.rowKey,
      valueJsonText: canonicalRegisterJson(
        "valueAst" in row
          ? (row.valueAst as CanonicalJsonAst)
          : developmentValueAst(row.value)
      ),
      sourceRef: row.sourceRef
    })
  ));
}

async function assertAdmin(client: PoolClient): Promise<void> {
  const row = (await client.query<{
    session_principal: string;
    principal: string;
    rolsuper: boolean;
  }>(`
    SELECT session_user AS session_principal,current_user AS principal,role.rolsuper
    FROM pg_catalog.pg_roles AS role WHERE role.rolname=current_user
  `)).rows[0];
  if (row === undefined || !row.rolsuper || row.session_principal !== row.principal) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_ADMIN_REQUIRED");
  }
}

async function assertSealedHistoricalBootstrap(
  pool: Pool,
  registerVersion: number
): Promise<void> {
  const state = (await pool.query<{
    row_count: number;
    sealed: boolean;
    actual_count: string;
  }>(`
    SELECT version.row_count,version.sealed,count(row.*)::text AS actual_count
    FROM register.register_version AS version
    LEFT JOIN register.register_row AS row USING (register_version)
    WHERE version.register_version=$1
    GROUP BY version.register_version,version.row_count,version.sealed
  `, [registerVersion])).rows[0];
  if (state === undefined
    || !state.sealed
    || Number(state.row_count) !== Number(state.actual_count)) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_HISTORICAL_STATE_INVALID");
  }
}

async function persistOrAcceptSealedHistoricalBootstrap(
  pool: Pool,
  bootstrap: BootstrapRegister
): Promise<void> {
  try {
    await persistBootstrapRegister(pool, bootstrap);
  } catch (error) {
    if (!(error instanceof TypeError) || error.message !== "FX-REG-SEALED_VERSION_MISMATCH") {
      throw error;
    }
    await assertSealedHistoricalBootstrap(pool, bootstrap.registerVersion);
  }
}

export async function seedDevelopmentDeploymentRegister(
  input: SeedDevelopmentDeploymentRegisterInput
): Promise<DevelopmentDeploymentRegisterReceipt> {
  if (!isAbsolute(input.repositoryRoot)) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_RECEIPT_PATH_INVALID");
  }
  const bootstrap = await loadBootstrapRegister();
  const roleRefs = input.roleRefs
    ?? deriveSynthesisRoleRefs(input.providerPanel.configuredProviders);
  // Ruling J7: the seeding entrypoint IS T16's startup surface. Emitted before
  // any database work so the CLI warns even when the register is already sealed.
  warnOnIdenticalSynthesisRoleRefs({
    synthesizerRoleRef: roleRefs.synthesizerRoleRef,
    evaluatorRoleRef: roleRefs.evaluatorRoleRef,
    deploymentRef: DEVELOPMENT_ALGORITHM_SOURCE_REF
  });
  const authorityClient = await input.adminPool.connect();
  try {
    await assertAdmin(authorityClient);
  } finally {
    authorityClient.release();
  }
  await persistOrAcceptSealedHistoricalBootstrap(input.adminPool, bootstrap);
  const publicationRows = await buildDevelopmentDeploymentRegisterPublicationRows(
    bootstrap,
    input.providerPanel,
    roleRefs
  );
  const publicationKeys = new Set(publicationRows.map(row => row.rowKey));
  if (ALGORITHM_REGISTER_ROW_KEYS.some(key => !publicationKeys.has(key))) {
    throw new TypeError("DEV_ALGORITHM_REGISTER_ROWS_INCOMPLETE");
  }
  // A content-derived UUID makes retries replay the same immutable publication.
  // Bootstrap is the explicit stable base; existing development and support
  // versions remain sealed and the allocator chooses an unused version.
  const snapshotHash = computeRegisterSnapshotSha256(publicationRows);
  const identity = createHash("sha256")
    .update(`development-algorithm-publication:v1:${bootstrap.registerVersion}:${snapshotHash}`)
    .digest("hex");
  const publicationId = `${identity.slice(0, 8)}-${identity.slice(8, 12)}-5${identity.slice(13, 16)}-a${identity.slice(17, 20)}-${identity.slice(20, 32)}`;
  const imported = await createPostgresRegisterPublicationPort(input.adminPool).publishGeneral({
    publicationId,
    baseRegisterVersion: parseRegisterVersionText(String(bootstrap.registerVersion)),
    rows: publicationRows,
    sourceRef: DEVELOPMENT_ALGORITHM_SOURCE_REF
  });
  const receipt = createDevelopmentDeploymentRegisterMachineReceipt({
    registerVersion: imported.registerVersion,
    rowCount: imported.rowCount,
    snapshotSha256: imported.snapshotSha256
  });
  await writeDevelopmentDeploymentRegisterReceipt(resolve(input.repositoryRoot), receipt);
  return receipt;
}
