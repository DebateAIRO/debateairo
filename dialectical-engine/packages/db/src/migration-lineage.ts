import { loadForward108, type Forward108Plan } from "./migration-forward108.js";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import type { PoolClient } from "pg";

export type MigrationSource = Readonly<{ name: string; sha256: string; provenance: string; sql: string }>;
type Manifest = Readonly<{
  version: string;
  sources: ReadonlyArray<Readonly<{ name: string; sha256: string; provenance: string }>>;
  order: readonly string[];
  cohorts: Readonly<Record<string, readonly string[]>>;
  compatibility: Readonly<{ logicalName: string; executablePath: string; executableSha256: string; resolutionId: string }>;
  transactionBodies: ReadonlyArray<Readonly<{ logicalName: string; executablePath: string; executableSha256: string; resolutionId: string }>>;
  effectiveCapabilityVerifier: Readonly<{ executablePath: string; executableSha256: string }>;
}>;
export type MigrationPlan = Readonly<{
  manifest: Manifest;
  recipeSha256: string;
  sources: ReadonlyMap<string, MigrationSource>;
  compatibilitySql: string;
  transactionBodySql: ReadonlyMap<string, string>;
  effectiveCapabilityVerifierSql: string;
  forward108: Forward108Plan;
}>;

const migrationsDirectory = new URL("../../../migrations/", import.meta.url);
const manifestUrl = new URL("lineage/auth-dev-20261006.json", migrationsDirectory);
export const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const fail = (detail: string): never => { throw new Error(`MIGRATION_LINEAGE_REFUSED ${detail}`); };
const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((name) => b.includes(name));

export async function loadMigrationPlan(): Promise<MigrationPlan> {
  const recipeBytes = await readFile(manifestUrl);
  const manifest = JSON.parse(recipeBytes.toString("utf8")) as Manifest;
  if (manifest.version !== "auth-dev-20261006-v2") fail("RECIPE_VERSION");
  const discovered = (await readdir(migrationsDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  const forward108=await loadForward108(sha256(recipeBytes),manifest.effectiveCapabilityVerifier.executableSha256);
  const declared = manifest.sources.map(({ name }) => name);
  if (!sameSet(discovered, [...declared,forward108.name]) || new Set(declared).size !== declared.length
    || !sameSet(manifest.order, declared) || new Set(manifest.order).size !== manifest.order.length) {
    fail("SOURCE_INVENTORY");
  }
  const sources = new Map<string, MigrationSource>();
  for (const source of manifest.sources) {
    if (!/^[0-9a-f]{64}$/.test(source.sha256) || !/^[\d][\w.-]*\.sql$/.test(source.name)) fail("SOURCE_DECLARATION");
    const bytes = await readFile(new URL(source.name, migrationsDirectory));
    if (sha256(bytes) !== source.sha256) fail(`SOURCE_DIGEST ${source.name}`);
    sources.set(source.name, { ...source, sql: bytes.toString("utf8") });
  }
  const compat = manifest.compatibility;
  if (compat.logicalName !== "0093_billing_runtime_role.sql"
    || !/^compatibility\/auth-dev-20261006\/[\w.-]+\.sql$/.test(compat.executablePath)) fail("COMPATIBILITY_DECLARATION");
  const compatibilityBytes = await readFile(new URL(compat.executablePath, migrationsDirectory));
  if (sha256(compatibilityBytes) !== compat.executableSha256) fail("COMPATIBILITY_DIGEST");
  const wrapperNames = ["0025_evaluator_domain_refusal_receipts.sql", "0029_evaluator_dev_menu_grants.sql"];
  if (!sameSet(manifest.transactionBodies.map(({ logicalName }) => logicalName), wrapperNames)
    || manifest.transactionBodies.length !== 2) fail("TRANSACTION_BODY_DECLARATION");
  const transactionBodySql = new Map<string, string>();
  for (const body of manifest.transactionBodies) {
    const expectedPath = `compatibility/auth-dev-20261006/${body.logicalName}`;
    if (body.executablePath !== expectedPath
      || body.resolutionId !== `auth-dev-${body.logicalName.slice(0,4)}-transaction-body-v1`) fail("TRANSACTION_BODY_DECLARATION");
    const bytes = await readFile(new URL(body.executablePath, migrationsDirectory));
    if (sha256(bytes) !== body.executableSha256
      || sources.get(body.logicalName)?.sql !== `BEGIN;\n\n${bytes.toString("utf8")}\nCOMMIT;\n`) {
      fail(`TRANSACTION_BODY_DIGEST ${body.logicalName}`);
    }
    transactionBodySql.set(body.logicalName, bytes.toString("utf8"));
  }
  const compatibilityFiles = (await readdir(new URL("compatibility/auth-dev-20261006/", migrationsDirectory)))
    .filter((name) => name.endsWith(".sql"));
  if (!sameSet(compatibilityFiles, [compat.executablePath.split("/").at(-1)!, ...wrapperNames])) {
    fail("COMPATIBILITY_INVENTORY");
  }
  const verifier = manifest.effectiveCapabilityVerifier;
  if (verifier.executablePath !== "lineage/verify-effective-capabilities.sql") fail("EFFECTIVE_VERIFIER_DECLARATION");
  const verifierBytes = await readFile(new URL(verifier.executablePath, migrationsDirectory));
  if (sha256(verifierBytes) !== verifier.executableSha256) fail("EFFECTIVE_VERIFIER_DIGEST");
  for (const [name, cohort] of Object.entries(manifest.cohorts)) {
    if (new Set(cohort).size !== cohort.length || cohort.some((entry) => !sources.has(entry))) fail(`COHORT ${name}`);
  }
  return { manifest, recipeSha256: sha256(recipeBytes), sources,
    compatibilitySql: compatibilityBytes.toString("utf8"), transactionBodySql,
    effectiveCapabilityVerifierSql: verifierBytes.toString("utf8"),forward108 };
}

export type Lineage = "fresh" | "auth94" | "auth103" | "auth106" | "dev95" | "integrated-original" | "integrated-compatibility" | "integrated-fresh-resolutions" | "integrated-original-108" | "integrated-compatibility-108" | "integrated-fresh-resolutions-108";
export function transactionBodyPreconditionDigest(plan: MigrationPlan, name: string): string {
  const body = plan.manifest.transactionBodies.find(({ logicalName }) => logicalName === name);
  if (body === undefined) return fail("TRANSACTION_BODY_DECLARATION");
  const preceding = plan.manifest.order.slice(0, plan.manifest.order.indexOf(name)).sort();
  return sha256(JSON.stringify({ lineage: "fresh", terminal: preceding,
    source: plan.sources.get(name)!.sha256, executable: body.executableSha256, recipe: plan.recipeSha256 }));
}
export function compatibilityPreconditionDigest(plan: MigrationPlan, cohort: "auth94" | "auth103" | "auth106"): string {
  const name = plan.manifest.compatibility.logicalName;
  const preceding = plan.manifest.order.slice(0, plan.manifest.order.indexOf(name));
  const applied = [...new Set([...(plan.manifest.cohorts[cohort] ?? []), ...preceding])].sort();
  return sha256(JSON.stringify({ lineage: cohort, applied, source: plan.sources.get(name)!.sha256 }));
}
export function identifyLineage(plan: MigrationPlan, applied: readonly string[], resolutionNames: readonly string[]): Lineage {
  if (applied.length !== new Set(applied).size || applied.some((name) => !plan.sources.has(name)&&name!==plan.forward108.name)) fail("UNKNOWN_APPLIED_NAME");
  if (applied.length === 0 && resolutionNames.length === 0) return "fresh";
  for (const cohort of ["auth94", "auth103", "auth106", "dev95"] as const) {
    if (resolutionNames.length === 0 && sameSet(applied, plan.manifest.cohorts[cohort] ?? [])) return cohort;
  }
  const all = plan.manifest.order;
  if (resolutionNames.length === 0 && sameSet(applied, all)) return "integrated-original";
  const logicalName = plan.manifest.compatibility.logicalName;
  if (resolutionNames.length === 1 && resolutionNames[0] === logicalName
    && sameSet(applied, all.filter((name) => name !== logicalName))) return "integrated-compatibility";
  const wrappers = plan.manifest.transactionBodies.map(({ logicalName }) => logicalName);
  if (sameSet(resolutionNames, wrappers)
    && sameSet(applied, all.filter((name) => !wrappers.includes(name)))) return "integrated-fresh-resolutions";
  const forward=plan.forward108.name;
  if(resolutionNames.length===0&&sameSet(applied,[...all,forward]))return "integrated-original-108";
  if(resolutionNames.length===1&&resolutionNames[0]===logicalName&&sameSet(applied,[...all.filter(name=>name!==logicalName),forward]))return "integrated-compatibility-108";
  if(sameSet(resolutionNames,wrappers)&&sameSet(applied,[...all.filter(name=>!wrappers.includes(name)),forward]))return "integrated-fresh-resolutions-108";
  return fail("UNKNOWN_MIXED_LINEAGE");
}

export async function transactionBodyPostconditionEvidence(client: PoolClient, name: string): Promise<string> {
  if (name === "0025_evaluator_domain_refusal_receipts.sql") {
    const result = await client.query<{ name: string; definition: string }>(`
      SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid='evaluator.domain_admission'::regclass
        AND conname IN ('domain_admission_proposed_name_check','domain_admission_normalized_name_check')
      ORDER BY conname
    `);
    if (result.rows.length !== 2 || result.rows.some(({ definition }) => !definition.includes("decision") || !definition.includes("REFUSED"))) {
      fail("TRANSACTION_BODY_POSTCONDITION 0025");
    }
    return sha256(JSON.stringify(result.rows));
  }
  if (name === "0029_evaluator_dev_menu_grants.sql") {
    const result = await client.query<{ relation: string; allowed: boolean }>(`
      SELECT relation, CASE WHEN relation='register' THEN has_schema_privilege('debateai_evaluator_api','register','USAGE')
        ELSE has_table_privilege('debateai_evaluator_api',relation,'SELECT') END AS allowed
      FROM unnest(ARRAY['register','register.register_row','register.register_version',
        'evaluator.domain','evaluator.pipeline_event','evaluator.observation','evaluator.profile_cell',
        'evaluator.rank_snapshot','evaluator.vllm_probe','evaluator.vllm_catalog_model',
        'evaluator.consumer_selection']) relation ORDER BY relation
    `);
    if (result.rows.length !== 11 || result.rows.some(({ allowed }) => allowed !== true)) {
      fail("TRANSACTION_BODY_POSTCONDITION 0029");
    }
    return sha256(JSON.stringify(result.rows));
  }
  return fail("TRANSACTION_BODY_DECLARATION");
}

export async function lineageEvidence(client: PoolClient): Promise<string> {
  const result = await client.query<{ evidence: unknown }>(`
    SELECT jsonb_build_object(
      'billing_owner', (SELECT pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid='billing.internal_grant'::regclass),
      'internal_tables', (SELECT jsonb_agg(c.relname ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='billing'::regnamespace AND c.relname IN ('internal_grant','internal_grant_event','internal_provider_admission')),
      'billing_role', (SELECT jsonb_build_object('login',rolcanlogin,'super',rolsuper,'inherit',rolinherit) FROM pg_roles WHERE rolname='debateai_billing_runtime'),
      'runtime_internal_raw', (SELECT count(*) FROM pg_class c WHERE c.relnamespace='billing'::regnamespace AND c.relname IN ('internal_grant','internal_grant_event','internal_provider_admission') AND has_table_privilege('debateai_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
      'api_internal_raw', (SELECT count(*) FROM pg_class c WHERE c.relnamespace='billing'::regnamespace AND c.relname IN ('internal_grant','internal_grant_event','internal_provider_admission') AND has_table_privilege('debateai_billing_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
      ,'api_social_creation', has_function_privilege('debateai_billing_runtime',to_regprocedure('identity.create_social_account(jsonb,jsonb)'),'EXECUTE')
      ,'runtime_social_creation', has_function_privilege('debateai_runtime',to_regprocedure('identity.create_social_account(jsonb,jsonb)'),'EXECUTE')
      ,'runtime_internal_append', has_function_privilege('debateai_runtime','billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)','EXECUTE')
      ,'api_internal_append', has_function_privilege('debateai_billing_runtime','billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)','EXECUTE')
      ,'mfa_103_policy', has_function_privilege(to_regrole('debateai_mfa_recovery_owner'),to_regprocedure('identity.password_recovery_rules(bigint)'),'EXECUTE')
      ,'runtime_103_policy', has_function_privilege(to_regrole('debateai_password_recovery_runtime'),to_regprocedure('identity.password_recovery_rules(bigint)'),'EXECUTE')
      ,'policy_definition', encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('identity.password_recovery_rules(bigint)')),'UTF8')),'hex')
      ,'withdraw_check', (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='identity.step_up_grant'::regclass AND conname='step_up_grant_action_check')
      ,'consumer_authorization_definition', (SELECT encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('identity.valid_consumer_authorization_internal(jsonb)'))
      ,'recovery_eligibility_definition', (SELECT encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('identity.mfa_recovery_eligible(uuid)'))
      ,'cohort_owner', (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=to_regclass('identity.mfa_recovery_legacy_cohort'))
      ,'cohort_columns', (SELECT jsonb_agg(attname ORDER BY attnum) FROM pg_attribute WHERE attrelid=to_regclass('identity.mfa_recovery_legacy_cohort') AND attnum>0 AND NOT attisdropped)
      ,'cohort_runtime_read', has_table_privilege('debateai_runtime',to_regclass('identity.mfa_recovery_legacy_cohort'),'SELECT')
    ) AS evidence
  `);
  return sha256(JSON.stringify(result.rows[0]?.evidence));
}

export async function assertAuth106Catalog(client: PoolClient): Promise<void> {
  const result = await client.query<{ ok: boolean }>(`
    SELECT to_regclass('billing.internal_grant') IS NOT NULL
      AND to_regclass('billing.internal_provider_admission') IS NOT NULL
      AND to_regclass('identity.mfa_recovery_control') IS NOT NULL
      AND to_regprocedure('identity.password_recovery_rules(bigint)') IS NOT NULL
      AND pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='billing.internal_grant'::regclass))='debateai_staff_security_owner'
      AND (SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname='debateai_staff_security_owner')
      AND encode(sha256(convert_to(pg_get_functiondef('identity.password_recovery_rules(bigint)'::regprocedure),'UTF8')),'hex')='cf20a27feb71512c4c786161c415b0ac537f5c029e52341c993197e1c0540334' AS ok
  `);
  if (result.rows[0]?.ok !== true) fail("AUTH106_CATALOG_DRIFT");
}
