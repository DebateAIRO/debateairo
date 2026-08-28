import { createHash } from "node:crypto";
import { DEVELOPMENT_LOCAL_PROVIDER_TARGET } from "./dev-local-provider.js";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { CLAIM_TYPES } from "@debateai/kernel";
import {
  AUTH_POLICY_REGISTER_ROWS,
  MFA_POLICY_REGISTER_ROW,
  PRODUCT_ROLE_POLICY_REGISTER_ROW,
  RECOVERY_POLICY_REGISTER_ROW,
  SESSION_POLICY_REGISTER_ROW,
  loadBootstrapRegister,
  type BootstrapRegister
} from "@debateai/register";

export type DevelopmentDeploymentRegisterRow = Readonly<{
  rowKey: string;
  value: unknown;
  sourceRef: string;
}>;

export const DEVELOPMENT_SOURCE_REF =
  "DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05" as const;
export const DEVELOPMENT_RUNNER_SOURCE_REF =
  "DEV-12D-development-runner-policy.md#sealed-v2" as const;
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
export const DEVELOPMENT_REGISTER_VERSION = 3 as const;

export const DEVELOPMENT_DEPLOYMENT_REGISTER_ROWS = Object.freeze([
  Object.freeze({
    rowKey: "configuredProviderSet",
    value: Object.freeze({
      kind: "CONFIGURED_PROVIDER_SET" as const,
      requiredDistinctMakers: 1,
      providers: Object.freeze([Object.freeze({
        providerRef: DEVELOPMENT_LOCAL_PROVIDER_TARGET.providerRef,
        adapterKind: "openai-compatible-http",
        maker: "Local development"
      })])
    }),
    sourceRef: DEVELOPMENT_SOURCE_REF
  }),
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
  const conformanceTexts = [...runner.matchAll(/content: "(Return only JSON \{(?:conforms,findings|pass)\}[^\"]+)"/g)]
    .map((match) => match[1]!);
  if (conformanceTexts.length !== 2) {
    throw new TypeError("DEV_RUNNER_CONTRACT_TEXT_UNRESOLVED:conformance");
  }
  const values = Object.freeze({
    judgeContractHash: digest(requireMatch(judge, /content: `([\s\S]*?)`/, "judge")),
    composerContractHash: digest(requireMatch(
      runner,
      /content: "(Return only JSON with a segments array[^"]+)"/,
      "composer"
    )),
    conformanceContractHash: digest(conformanceTexts.join("\n")),
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
        bandOrder: Object.freeze(["CAPPED", "FULL"]),
        ceilingLabels: Object.freeze(["DEFAULT_CEILING", "REASONING_CEILING"]),
        defaultCeiling: Object.freeze({
          label: "DEFAULT_CEILING", ceilingBand: "FULL", liftPath: "retain-band"
        }),
        cuts: Object.freeze([Object.freeze({
          minimumShares: Object.freeze({ REASONING: 0.5 }),
          label: "REASONING_CEILING", ceilingBand: "CAPPED",
          liftPath: "gather-evidence-to-lift"
        })])
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

function legacyRows(bootstrap: BootstrapRegister): readonly DevelopmentDeploymentRegisterRow[] {
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
    ...DEVELOPMENT_DEPLOYMENT_REGISTER_ROWS
  ];
  if (new Set(rows.map(({ rowKey }) => rowKey)).size !== rows.length) {
    throw new TypeError("DEV_DEPLOYMENT_REGISTER_DEFINITION_INVALID");
  }
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

async function expectedRunnerRows(
  bootstrap: BootstrapRegister
): Promise<readonly DevelopmentDeploymentRegisterRow[]> {
  const rows = [...legacyRows(bootstrap), ...await buildDevelopmentRunnerRegisterRows()];
  if (new Set(rows.map(({ rowKey }) => rowKey)).size !== rows.length) {
    throw new TypeError("DEV_RUNNER_REGISTER_DEFINITION_INVALID");
  }
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

async function previousRunnerRows(
  bootstrap: BootstrapRegister
): Promise<readonly DevelopmentDeploymentRegisterRow[]> {
  return Object.freeze((await expectedRunnerRows(bootstrap)).filter((row) => row.rowKey !== "livenessPolicy"));
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
  const legacy = legacyRows(bootstrap);
  const previousRows = await previousRunnerRows(bootstrap);
  const rows = await expectedRunnerRows(bootstrap);
  const previousRegisterVersion = bootstrap.registerVersion + 1;
  const registerVersion = bootstrap.registerVersion + 2;
  const client = await input.adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('debateai:dev-deployment-register',0))"
    );
    await assertAdmin(client);
    if (await readExactState(client, bootstrap.registerVersion, legacy) === "EMPTY") {
      await insertAndSeal(client, bootstrap.registerVersion, legacy);
    }
    if (await readExactState(client, previousRegisterVersion, previousRows) === "EMPTY") {
      await insertAndSeal(client, previousRegisterVersion, previousRows);
    }
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
