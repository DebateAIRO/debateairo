import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { EVALUATOR_CONTRACT_TEXT } from "./index.js";
import { CLAIM_TYPES } from "@debateai/kernel";
import {
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
  type ProviderFamilyEntry
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
/**
 * T16 · version 4 is HISTORICAL and sealed: it exists in every dev database
 * created before this lane and must never be re-opened to receive rows. The
 * fifteen algorithm rows land in a NEWLY MINTED version 5, which becomes the
 * current dev register. Every launch pin derives from this constant — the
 * `REGISTER_VERSION=<n>` fixtures below are generated, never hand-written, so
 * a future bump can never silently disarm them.
 */
export const DEVELOPMENT_REGISTER_VERSION = 5 as const;
export const DEVELOPMENT_HISTORICAL_REGISTER_VERSION = 4 as const;

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
    providerFamilies: deriveProviderFamilies(providerPanel.configuredProviders)
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
}>;

export type DevelopmentDeploymentRegisterReceipt = Readonly<{
  registerVersion: number;
  rowCount: number;
}>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left === right ? 0 : left < right ? -1 : 1)
      .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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

async function insertAndSeal(
  client: PoolClient,
  registerVersion: number,
  rows: readonly DevelopmentDeploymentRegisterRow[]
): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
       VALUES ($1,$2,$3::jsonb,$4)`,
      [registerVersion, row.rowKey, JSON.stringify(row.value), row.sourceRef]
    );
  }
  await client.query(
    `INSERT INTO register.register_version (register_version,row_count,sealed)
     VALUES ($1,$2,true)`,
    [registerVersion, rows.length]
  );
  // T16 · the migration-declared manifest fails the seal loudly, naming the
  // family and row key, if any mandatory row was not supplied.
  await client.query("SELECT register.assert_required_rows($1)", [registerVersion]);
  if (await readExactState(client, registerVersion, rows) !== "EXACT") {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_DRIFT");
  }
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

async function readExactState(
  client: PoolClient,
  registerVersion: number,
  rows: readonly DevelopmentDeploymentRegisterRow[]
): Promise<"EMPTY" | "EXACT"> {
  const versionResult = await client.query<{ row_count: number; sealed: boolean }>(`
    SELECT row_count,sealed FROM register.register_version WHERE register_version=$1
  `,[registerVersion]);
  const rowResult = await client.query<{
    row_key: string;
    value_json: unknown;
    source_ref: string;
  }>(`
    SELECT row_key,value_json,source_ref FROM register.register_row
    WHERE register_version=$1 ORDER BY row_key
  `,[registerVersion]);
  const version = versionResult.rows[0];
  if (version === undefined && rowResult.rows.length === 0) return "EMPTY";
  if (version === undefined || !version.sealed || Number(version.row_count) !== rows.length
    || rowResult.rows.length !== rows.length) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_DRIFT");
  }
  const expected = new Map(rows.map((row) => [row.rowKey, row]));
  for (const persisted of rowResult.rows) {
    const wanted = expected.get(persisted.row_key);
    if (wanted === undefined || persisted.source_ref !== wanted.sourceRef
      || canonicalJson(persisted.value_json) !== canonicalJson(wanted.value)) {
      throw new TypeError("DEV_DEPLOYMENT_REGISTER_DRIFT");
    }
  }
  return "EXACT";
}

export async function seedDevelopmentDeploymentRegister(
  input: SeedDevelopmentDeploymentRegisterInput
): Promise<DevelopmentDeploymentRegisterReceipt> {
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
  const rows = await expectedRunnerRows(bootstrap, input.providerPanel, roleRefs);
  const registerVersion = DEVELOPMENT_REGISTER_VERSION;
  if (registerVersion <= bootstrap.registerVersion) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_VERSION_INVALID");
  }
  const client = await input.adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('debateai:dev-deployment-register',0))"
    );
    await assertAdmin(client);
    if (await readExactState(client, registerVersion, rows) === "EMPTY") {
      await insertAndSeal(client, registerVersion, rows);
    }
    await client.query("COMMIT");
    return Object.freeze({ registerVersion, rowCount: rows.length });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
