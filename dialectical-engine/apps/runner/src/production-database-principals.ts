import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import type { Stats } from "node:fs";
import { link, lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Pool, PoolClient } from "pg";
import {
  validateProductionSupportConfigCredentialFileForCleanup
} from "./support-config-cli-credentials.js";

export const PRODUCTION_DATABASE_PRINCIPAL_CREDENTIAL_FORMAT =
  "debateai.production-database-principal-credentials.v1" as const;

const MANIFEST_FORMAT = "debateai.production-database-principals.v3";
const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/u;
const MINIMUM_PASSWORD_BYTES = 32;
const MAXIMUM_PASSWORD_BYTES = 1_024;
const MAXIMUM_JIT_CREDENTIAL_MILLISECONDS = 15 * 60 * 1_000;
const MINIMUM_JIT_CREDENTIAL_MILLISECONDS = 60 * 1_000;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const SUPPORT_CONFIG_OPERATOR_ID = "support-config-operator";
const SUPPORT_CONFIG_OPERATOR_ROLE = "debateai_prod_support_config_operator";
const SUPPORT_DATA_PRINCIPAL_ID = "api-support";
const SUPPORT_DATA_PRINCIPAL_ROLE = "debateai_prod_api_support";
const GLOBAL_PRINCIPAL_LEASE_KEY = "debateai:production-database-principals:v1";
const SUPPORT_CONFIG_PRINCIPAL_LEASE_KEY =
  "debateai:production-support-config-operator";

type ManifestPrincipal = Readonly<{
  id: string;
  roleName: string;
  kind: "SERVICE" | "HUMAN_READ_ONLY" | "HUMAN_EXECUTE_ONLY" | string;
  database: string;
  login: boolean;
  inherit: boolean;
  superuser: boolean;
  createDatabase: boolean;
  createRole: boolean;
  replication: boolean;
  bypassRls: boolean;
  directMemberships: readonly string[];
  effectiveMemberships: readonly string[];
  ownsDatabases: readonly string[];
  ownsSchemas: readonly string[];
}>;

type ManifestCapabilityRole = Readonly<{
  roleName: string;
  login: boolean;
  inherit: boolean;
  directMemberships: readonly string[];
}>;

type ManifestMembershipGrant = Readonly<{
  memberRole: string;
  grantedRole: string;
  adminOption: boolean;
  inheritOption: boolean;
  setOption: boolean;
}>;

type ProductionPrincipalManifest = Readonly<{
  format: string;
  principals: readonly ManifestPrincipal[];
  capabilityRoles: readonly ManifestCapabilityRole[];
  ownershipRoles: readonly Readonly<{ roleName: string }>[];
  membershipGrants: readonly ManifestMembershipGrant[];
  credentialRequirements: readonly Readonly<{
    principalId: string;
    lifecycle: string;
  }>[];
  provisioner?: Readonly<{ managedPrincipalIds?: readonly string[] }>;
}>;

export type ProductionDatabasePrincipalCredentialEnvelope = Readonly<{
  format: typeof PRODUCTION_DATABASE_PRINCIPAL_CREDENTIAL_FORMAT;
  credentials: readonly Readonly<{
    principalId: string;
    databaseUrl: string;
    validUntil?: string;
  }>[];
}>;

type ParsedCredential = Readonly<{
  principalId: string;
  databaseUrl: string;
  password: string;
  validUntil: Date | null;
}>;

type ManagedPrincipal = Readonly<{
  id: string;
  roleName: string;
  inherit: boolean;
  human: boolean;
  directMemberships: readonly string[];
  effectiveMemberships: readonly string[];
}>;

type DirectMembershipState = Readonly<{
  roleName: string;
  adminOption: boolean;
  inheritOption: boolean;
  setOption: boolean;
}>;

type FileIdentity = Readonly<{ device: number; inode: number }>;

type SupportCredentialPublicationJournal = {
  readonly targetPath: string;
  readonly parentPath: string;
  directorySyncPending: boolean;
  temporaryPath?: string;
  temporaryIdentity?: FileIdentity;
  publishedIdentity?: FileIdentity;
  restoredIdentity?: FileIdentity;
  prior?: Readonly<{
    backupPath: string;
    identity: FileIdentity;
    bytes: Buffer;
    mode: number;
  }>;
};

type RecoveryBackoff = (attempt: number) => Promise<void>;

type RecoveryMarkerJournal = {
  readonly path: string;
  readonly parentPath: string;
  readonly identity: FileIdentity;
  directorySyncPending: boolean;
};

type ProductionPrincipalLease = Readonly<{
  connectWorkClient: () => Promise<PoolClient>;
}>;

export type ProductionDatabasePrincipalProvisioningReceipt = Readonly<{
  principalCount: number;
  createdCount: number;
  humanCredentialExpiresAtByPrincipal: Readonly<Record<
    "obs-human" | "support-config-operator", string
  >>;
  supportConfigCredentialFilePath: string;
}>;

export type ProductionSupportConfigOperatorCleanupReceipt = Readonly<{
  terminatedSessionCount: number;
  supportConfigCredentialFilePath: string;
}>;

export class ProductionDatabasePrincipalProvisioningError extends Error {
  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "ProductionDatabasePrincipalProvisioningError";
  }
}

/**
 * DL2-F6: UTF-16 code-unit order — the same order PostgreSQL gives a `name` column, and the
 * same on every host. The manifest is sorted here and compared INDEX-WISE against rows the
 * database returned under `ORDER BY rolname`, so the two orderings must agree; localeCompare
 * does not order by bytes and would fail the attestation closed on the first role name that
 * carries a digit (ICU puts "_" before a digit, the database puts the digit first).
 */
function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: string, cause?: unknown): never {
  throw new ProductionDatabasePrincipalProvisioningError(code, cause);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function assertRoleName(value: unknown): string {
  if (typeof value !== "string" || !ROLE_NAME_PATTERN.test(value)) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
  }
  return value;
}

function quoteIdentifier(value: string): string {
  if (value.includes("\0")) fail("PRODUCTION_DATABASE_ROLE_NAME_INVALID");
  return `"${value.replaceAll('"', '""')}"`;
}

function asStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
  }
  const rows = value as string[];
  if (new Set(rows).size !== rows.length) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
  }
  return Object.freeze([...rows]);
}

function directMembershipsMatch(
  actual: readonly DirectMembershipState[],
  expected: readonly DirectMembershipState[]
): boolean {
  return actual.length === expected.length
    && actual.every((membership, index) => {
      const wanted = expected[index];
      return wanted !== undefined
        && membership.roleName === wanted.roleName
        && membership.adminOption === wanted.adminOption
        && membership.inheritOption === wanted.inheritOption
        && membership.setOption === wanted.setOption;
    });
}

async function withProductionPrincipalLease<T>(
  adminPool: Pool,
  credentialTargetPath: string,
  recoveryBackoff: RecoveryBackoff,
  operation: (lease: ProductionPrincipalLease) => Promise<T>
): Promise<T> {
  let markerWaitAttempt = 0;
  for (;;) {
    const ownerClient = await adminPool.connect();
    const ignoreOwnerConnectionError = (): void => undefined;
    let observeOwnerConnectionEnd = (): void => undefined;
    const ownerConnectionEnded = new Promise<void>((resolve) => {
      observeOwnerConnectionEnd = () => resolve();
    });
    ownerClient.on("error", ignoreOwnerConnectionError);
    ownerClient.on("end", observeOwnerConnectionEnd);
    let globalLeaseHeld = false;
    let principalLeaseHeld = false;
    let operationFailed = false;
    let operationFailure: unknown;
    let result: T | undefined;
    let marker: RecoveryMarkerJournal | null = null;
    try {
      await ownerClient.query(
        `SELECT pg_advisory_lock(hashtextextended('${GLOBAL_PRINCIPAL_LEASE_KEY}',0))`
      );
      globalLeaseHeld = true;
      await ownerClient.query(
        `SELECT pg_advisory_lock(hashtextextended('${SUPPORT_CONFIG_PRINCIPAL_LEASE_KEY}',0))`
      );
      principalLeaseHeld = true;
      marker = await tryAcquireRecoveryMarker(credentialTargetPath, recoveryBackoff);
      if (marker !== null) {
        result = await operation(Object.freeze({
          connectWorkClient: () => adminPool.connect()
        }));
      }
    } catch (error) {
      operationFailed = true;
      operationFailure = error;
    }

    if (marker !== null) {
      await releaseRecoveryMarkerDurably(marker, recoveryBackoff);
    }

    let unlockFailure: unknown;
    if (principalLeaseHeld) {
      try {
        const unlocked = (await ownerClient.query<{ unlocked: boolean }>(
          `SELECT pg_advisory_unlock(hashtextextended('${SUPPORT_CONFIG_PRINCIPAL_LEASE_KEY}',0)) AS unlocked`
        )).rows[0]?.unlocked;
        if (unlocked !== true) throw new Error("principal lease was not held");
      } catch (error) {
        unlockFailure = error;
      }
    }
    if (globalLeaseHeld) {
      try {
        const unlocked = (await ownerClient.query<{ unlocked: boolean }>(
          `SELECT pg_advisory_unlock(hashtextextended('${GLOBAL_PRINCIPAL_LEASE_KEY}',0)) AS unlocked`
        )).rows[0]?.unlocked;
        if (unlocked !== true) throw new Error("global lease was not held");
      } catch (error) {
        unlockFailure ??= error;
      }
    }
    if (unlockFailure === undefined) {
      ownerClient.off("end", observeOwnerConnectionEnd);
      ownerClient.off("error", ignoreOwnerConnectionError);
      ownerClient.release(false);
    } else {
      ownerClient.release(true);
      await ownerConnectionEnded;
      ownerClient.off("end", observeOwnerConnectionEnd);
      ownerClient.off("error", ignoreOwnerConnectionError);
    }
    if (marker === null && !operationFailed && unlockFailure === undefined) {
      await recoveryBackoff(markerWaitAttempt);
      markerWaitAttempt += 1;
      continue;
    }
    if (operationFailed) throw operationFailure;
    if (unlockFailure !== undefined && marker === null) {
      fail("PRODUCTION_DATABASE_PRINCIPAL_LEASE_RELEASE_FAILED", unlockFailure);
    }
    return result as T;
  }
}

async function defaultRecoveryBackoff(attempt: number): Promise<void> {
  await delay(Math.min(10 * (2 ** Math.min(attempt, 7)), 1_000));
}

function parseManifest(value: unknown): ProductionPrincipalManifest {
  if (!isRecord(value)
    || value.format !== MANIFEST_FORMAT
    || !Array.isArray(value.principals)
    || !Array.isArray(value.capabilityRoles)
    || !Array.isArray(value.ownershipRoles)
    || !Array.isArray(value.membershipGrants)
    || !Array.isArray(value.credentialRequirements)) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
  }
  return value as unknown as ProductionPrincipalManifest;
}

function managedPrincipals(manifest: ProductionPrincipalManifest): readonly ManagedPrincipal[] {
  const rows: ManagedPrincipal[] = [];
  const manifestById = new Map<string, ManifestPrincipal>();
  for (const raw of manifest.principals) {
    if (!isRecord(raw)
      || typeof raw.id !== "string"
      || manifestById.has(raw.id)
      || typeof raw.database !== "string"
      || typeof raw.login !== "boolean"
      || typeof raw.inherit !== "boolean"
      || typeof raw.superuser !== "boolean"
      || typeof raw.createDatabase !== "boolean"
      || typeof raw.createRole !== "boolean"
      || typeof raw.replication !== "boolean"
      || typeof raw.bypassRls !== "boolean"
      || !Array.isArray(raw.ownsDatabases)
      || !Array.isArray(raw.ownsSchemas)) {
      fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
    }
    const principal = raw as unknown as ManifestPrincipal;
    assertRoleName(principal.roleName);
    manifestById.set(principal.id, principal);
  }

  const declaredIds = manifest.provisioner?.managedPrincipalIds;
  if (!Array.isArray(declaredIds)
    || declaredIds.some((entry) => typeof entry !== "string")
    || new Set(declaredIds).size !== declaredIds.length) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
  }
  for (const id of declaredIds) {
    const principal = manifestById.get(id);
    if (principal === undefined
      || principal.database !== "debateai"
      || !principal.login
      || (principal.kind !== "SERVICE"
        && principal.kind !== "HUMAN_READ_ONLY"
        && principal.kind !== "HUMAN_EXECUTE_ONLY")
      || principal.superuser
      || principal.createDatabase
      || principal.createRole
      || principal.replication
      || principal.bypassRls
      || principal.ownsDatabases.length !== 0
      || principal.ownsSchemas.length !== 0) {
      fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
    }
    rows.push(Object.freeze({
      id: principal.id,
      roleName: principal.roleName,
      inherit: principal.inherit,
      human: principal.kind === "HUMAN_READ_ONLY" || principal.kind === "HUMAN_EXECUTE_ONLY",
      directMemberships: asStringArray(principal.directMemberships),
      effectiveMemberships: asStringArray(principal.effectiveMemberships)
    }));
  }
  const humanRows = rows.filter(({ human }) => human);
  if (JSON.stringify(humanRows.map(({ id }) => id).sort())
      !== JSON.stringify(["obs-human", SUPPORT_CONFIG_OPERATOR_ID])
    || manifestById.get("obs-human")?.kind !== "HUMAN_READ_ONLY"
    || manifestById.get(SUPPORT_CONFIG_OPERATOR_ID)?.kind !== "HUMAN_EXECUTE_ONLY") {
    fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
  }
  const supportOperator = manifestById.get(SUPPORT_CONFIG_OPERATOR_ID)!;
  if (supportOperator.roleName !== SUPPORT_CONFIG_OPERATOR_ROLE
    || supportOperator.database !== "debateai"
    || !supportOperator.inherit
    || JSON.stringify(supportOperator.directMemberships)
      !== JSON.stringify(["debateai_support_config_operator"])
    || JSON.stringify(supportOperator.effectiveMemberships)
      !== JSON.stringify(["debateai_support_config_operator"])) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
  }
  const supportDataPrincipal = manifestById.get(SUPPORT_DATA_PRINCIPAL_ID);
  if (supportDataPrincipal === undefined
    || supportDataPrincipal.roleName !== SUPPORT_DATA_PRINCIPAL_ROLE
    || supportDataPrincipal.kind !== "SERVICE"
    || supportDataPrincipal.database !== "debateai"
    || !supportDataPrincipal.inherit
    || JSON.stringify(supportDataPrincipal.directMemberships)
      !== JSON.stringify(["debateai_support"])
    || JSON.stringify(supportDataPrincipal.effectiveMemberships)
      !== JSON.stringify(["debateai_support"])) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
  }

  const requirements = new Map(manifest.credentialRequirements.map((row) => [
    row.principalId,
    row.lifecycle
  ]));
  for (const row of rows) {
    const lifecycle = requirements.get(row.id);
    if (lifecycle === undefined
      || (row.human && lifecycle !== "JIT_SHORT_LIVED")
      || (!row.human && lifecycle !== "ROTATED_SERVICE"
        && lifecycle !== "MIGRATION_MINTED_UNMANAGED")) {
      fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
    }
  }
  if (requirements.get(SUPPORT_DATA_PRINCIPAL_ID) !== "ROTATED_SERVICE") {
    fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
  }

  const grants = manifest.membershipGrants.filter(({ memberRole }) =>
    rows.some(({ roleName }) => roleName === memberRole));
  const expectedGrants = rows.flatMap((row) => row.directMemberships.map((grantedRole) => ({
    memberRole: row.roleName,
    grantedRole,
    adminOption: false,
    inheritOption: true,
    setOption: true
  })));
  if (JSON.stringify([...grants].sort(grantOrder))
    !== JSON.stringify(expectedGrants.sort(grantOrder))) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
  }
  return Object.freeze(rows.sort((left, right) => compareCodeUnits(left.id, right.id)));
}

function grantOrder(left: ManifestMembershipGrant, right: ManifestMembershipGrant): number {
  return compareCodeUnits(
    `${left.memberRole}:${left.grantedRole}`,
    `${right.memberRole}:${right.grantedRole}`
  );
}

function parseCredentialEnvelope(
  value: unknown,
  principals: readonly ManagedPrincipal[],
  adminDatabaseUrl: string
): ReadonlyMap<string, ParsedCredential> {
  if (!isRecord(value)
    || !hasExactKeys(value, ["format", "credentials"])
    || value.format !== PRODUCTION_DATABASE_PRINCIPAL_CREDENTIAL_FORMAT
    || !Array.isArray(value.credentials)) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");
  }
  let admin: URL;
  try {
    admin = new URL(adminDatabaseUrl);
  } catch (error) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_ADMIN_URL_INVALID", error);
  }
  if (admin.protocol !== "postgres:" && admin.protocol !== "postgresql:") {
    fail("PRODUCTION_DATABASE_PRINCIPAL_ADMIN_URL_INVALID");
  }
  const expected = new Map(principals.map((row) => [row.id, row]));
  const parsed = new Map<string, ParsedCredential>();
  const passwords = new Set<string>();
  for (const raw of value.credentials) {
    if (!isRecord(raw)
      || typeof raw.principalId !== "string"
      || typeof raw.databaseUrl !== "string") {
      fail("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");
    }
    const principal = expected.get(raw.principalId);
    const expectedKeys = principal?.human
      ? ["principalId", "databaseUrl", "validUntil"]
      : ["principalId", "databaseUrl"];
    if (principal === undefined
      || parsed.has(raw.principalId)
      || !hasExactKeys(raw, expectedKeys)
      || (principal.human && typeof raw.validUntil !== "string")) {
      fail("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");
    }
    let url: URL;
    let password: string;
    try {
      url = new URL(raw.databaseUrl);
      password = decodeURIComponent(url.password);
    } catch (error) {
      fail("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID", error);
    }
    const passwordBytes = Buffer.byteLength(password, "utf8");
    if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:")
      || url.username !== principal.roleName
      || url.pathname !== `/${principalDatabaseName(principal)}`
      || url.hostname !== admin.hostname
      || url.port !== admin.port
      || url.search !== ""
      || url.hash !== ""
      || passwordBytes < MINIMUM_PASSWORD_BYTES
      || passwordBytes > MAXIMUM_PASSWORD_BYTES
      || /[\0\r\n]/u.test(password)
      || passwords.has(password)) {
      fail("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");
    }
    passwords.add(password);
    const validUntil = principal.human ? new Date(raw.validUntil as string) : null;
    if (validUntil !== null && !Number.isFinite(validUntil.getTime())) {
      fail("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");
    }
    parsed.set(principal.id, Object.freeze({
      principalId: principal.id,
      databaseUrl: raw.databaseUrl,
      password,
      validUntil
    }));
  }
  if (parsed.size !== principals.length
    || [...expected.keys()].some((id) => !parsed.has(id))) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");
  }
  return parsed;
}

function principalDatabaseName(_principal: ManagedPrincipal): string {
  return "debateai";
}

async function assertAdmin(
  client: PoolClient,
  manifest: ProductionPrincipalManifest
): Promise<void> {
  const migration = manifest.principals.find(({ id }) => id === "migration-admin");
  if (migration === undefined) fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
  const expectedSchemas = [...asStringArray(migration.ownsSchemas)].sort();
  const witness = (await client.query<{
    sessionPrincipal: string;
    principal: string;
    databaseName: string;
    databaseOwner: string;
    rolsuper: boolean;
    rolcanlogin: boolean;
    rolinherit: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    credentialBounded: boolean;
    directRoles: string[];
    ownedSchemas: string[];
  }>(`
    SELECT session_user AS "sessionPrincipal",current_user AS principal,
      current_database() AS "databaseName",database_owner.rolname AS "databaseOwner",
      role.rolsuper,role.rolcanlogin,role.rolinherit,role.rolcreatedb,role.rolcreaterole,
      role.rolreplication,role.rolbypassrls,
      (role.rolpassword IS NULL OR (
        role.rolvaliduntil > clock_timestamp()
        AND role.rolvaliduntil <= clock_timestamp() + interval '15 minutes'
      )) AS "credentialBounded",
      COALESCE((
        SELECT jsonb_agg(parent.rolname ORDER BY parent.rolname)
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS parent ON parent.oid=membership.roleid
        WHERE membership.member=role.oid
      ),'[]'::jsonb) AS "directRoles",
      COALESCE((
        SELECT jsonb_agg(namespace.nspname ORDER BY namespace.nspname)
        FROM pg_catalog.pg_namespace AS namespace
        WHERE namespace.nspowner=role.oid AND namespace.nspname=ANY($2::text[])
      ),'[]'::jsonb) AS "ownedSchemas"
    FROM pg_catalog.pg_roles AS role
    JOIN pg_catalog.pg_database AS database ON database.datname=current_database()
    JOIN pg_catalog.pg_roles AS database_owner ON database_owner.oid=database.datdba
    WHERE role.rolname=current_user AND role.rolname=$1::text
  `,[migration.roleName, expectedSchemas])).rows[0];
  if (witness === undefined
    || witness.sessionPrincipal !== migration.roleName
    || witness.principal !== migration.roleName
    || witness.databaseName !== migration.database
    || witness.databaseOwner !== migration.roleName
    || !witness.rolsuper
    || !witness.rolcanlogin
    || !witness.rolinherit
    || !witness.rolcreatedb
    || !witness.rolcreaterole
    || witness.rolreplication
    || witness.rolbypassrls
    || !witness.credentialBounded
    || witness.directRoles.length !== 0
    || JSON.stringify(witness.ownedSchemas) !== JSON.stringify(expectedSchemas)) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_ADMIN_REQUIRED");
  }
}

async function assertCapabilityRoles(
  client: PoolClient,
  manifest: ProductionPrincipalManifest
): Promise<void> {
  const expected = [...manifest.capabilityRoles].sort((left, right) =>
    compareCodeUnits(left.roleName, right.roleName));
  const roleNames = expected.map(({ roleName }) => assertRoleName(roleName));
  const rows = await client.query<{
    rolname: string;
    rolcanlogin: boolean;
    rolinherit: boolean;
    rolsuper: boolean;
    elevated: boolean;
    directRoles: Array<Readonly<{
      roleName: string;
      adminOption: boolean;
      inheritOption: boolean;
      setOption: boolean;
    }>>;
  }>(`
    SELECT target.rolname,target.rolcanlogin,target.rolinherit,target.rolsuper,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS elevated
        WHERE left(elevated.rolname,3)='pg_'
          AND pg_has_role(target.oid,elevated.oid,'MEMBER')
      ) AS elevated,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'roleName',parent.rolname,
          'adminOption',membership.admin_option,
          'inheritOption',membership.inherit_option,
          'setOption',membership.set_option
        ) ORDER BY parent.rolname)
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS parent ON parent.oid=membership.roleid
        WHERE membership.member=target.oid
      ),'[]'::jsonb) AS "directRoles"
    FROM pg_catalog.pg_roles AS target
    WHERE target.rolname=ANY($1::text[])
    ORDER BY target.rolname
  `,[roleNames]);
  if (rows.rows.length !== expected.length
    || rows.rows.some((row, index) => {
      const wanted = expected[index]!;
      return row.rolname !== wanted.roleName
        || row.rolcanlogin !== wanted.login
        || row.rolinherit !== wanted.inherit
        || row.rolsuper
        || row.elevated
        || !directMembershipsMatch(
          row.directRoles,
          wanted.directMemberships.map((roleName) => ({
            roleName,
            adminOption: false,
            inheritOption: true,
            setOption: true
          }))
        );
    })) {
    fail("PRODUCTION_DATABASE_CAPABILITY_ROLES_INVALID");
  }
}

async function assertJitCredentialWindow(
  client: PoolClient,
  credential: ParsedCredential
): Promise<void> {
  if (credential.validUntil === null) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");
  }
  const row = (await client.query<{ valid: boolean }>(`
    SELECT $1::timestamptz >= clock_timestamp() + interval '60 seconds'
      AND $1::timestamptz <= clock_timestamp() + interval '15 minutes' AS valid
  `,[credential.validUntil.toISOString()])).rows[0];
  if (row?.valid !== true) fail("PRODUCTION_DATABASE_JIT_EXPIRY_INVALID");
}

async function assertNoOwnership(
  client: PoolClient,
  roleNames: readonly string[]
): Promise<void> {
  const owned = (await client.query<{ owned: boolean }>(`
    SELECT EXISTS(
      SELECT 1 FROM pg_catalog.pg_database AS object
      JOIN pg_catalog.pg_roles AS owner ON owner.oid=object.datdba
      WHERE owner.rolname=ANY($1::text[])
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_namespace AS object
      JOIN pg_catalog.pg_roles AS owner ON owner.oid=object.nspowner
      WHERE owner.rolname=ANY($1::text[])
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_class AS object
      JOIN pg_catalog.pg_roles AS owner ON owner.oid=object.relowner
      WHERE owner.rolname=ANY($1::text[])
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_proc AS object
      JOIN pg_catalog.pg_roles AS owner ON owner.oid=object.proowner
      WHERE owner.rolname=ANY($1::text[])
    ) AS owned
  `,[roleNames])).rows[0]?.owned;
  if (owned !== false) fail("PRODUCTION_DATABASE_PRINCIPAL_OWNERSHIP_INVALID");
}

async function installTemporaryRoleReconciler(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE OR REPLACE FUNCTION pg_temp.reconcile_production_login(
      target_role text,target_password text,target_inherit boolean,target_valid_until text
    ) RETURNS void
    LANGUAGE plpgsql
    SET search_path=pg_catalog,pg_temp
    AS $function$
    DECLARE inherit_clause text;
    BEGIN
      IF target_role !~ '^[a-z][a-z0-9_]*$' THEN
        RAISE EXCEPTION 'PRODUCTION_DATABASE_ROLE_NAME_INVALID';
      END IF;
      inherit_clause := CASE WHEN target_inherit THEN 'INHERIT' ELSE 'NOINHERIT' END;
      EXECUTE format(
        'ALTER ROLE %I LOGIN %s NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT -1 PASSWORD %L VALID UNTIL %L',
        target_role,inherit_clause,target_password,target_valid_until
      );
      EXECUTE format('ALTER ROLE %I RESET ALL',target_role);
    END;
    $function$
  `);
}

async function revokeAllDirectMemberships(
  client: PoolClient,
  principal: ManagedPrincipal
): Promise<void> {
  const direct = await client.query<{ roleName: string }>(`
    SELECT parent.rolname AS "roleName"
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS parent ON parent.oid=membership.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid=membership.member
    WHERE member.rolname=$1
    ORDER BY parent.rolname
  `,[principal.roleName]);
  for (const { roleName } of direct.rows) {
    await client.query(
      `REVOKE ${quoteIdentifier(roleName)} FROM ${quoteIdentifier(principal.roleName)}`
    );
  }
}

async function revokeAllRoleMembers(
  client: PoolClient,
  principal: ManagedPrincipal
): Promise<void> {
  const members = await client.query<{ roleName: string }>(`
    SELECT member.rolname AS "roleName"
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted ON granted.oid=membership.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid=membership.member
    WHERE granted.rolname=$1
    ORDER BY member.rolname
  `,[principal.roleName]);
  for (const { roleName } of members.rows) {
    await client.query(
      `REVOKE ${quoteIdentifier(principal.roleName)} FROM ${quoteIdentifier(roleName)}`
    );
  }
}

async function resetAllDatabaseRoleSettings(
  client: PoolClient,
  principal: ManagedPrincipal
): Promise<void> {
  const databases = await client.query<{ databaseName: string }>(`
    SELECT database.datname AS "databaseName"
    FROM pg_catalog.pg_db_role_setting AS setting
    JOIN pg_catalog.pg_roles AS role ON role.oid=setting.setrole
    JOIN pg_catalog.pg_database AS database ON database.oid=setting.setdatabase
    WHERE role.rolname=$1
    ORDER BY database.datname
  `,[principal.roleName]);
  for (const { databaseName } of databases.rows) {
    await client.query(
      `ALTER ROLE ${quoteIdentifier(principal.roleName)} `
      + `IN DATABASE ${quoteIdentifier(databaseName)} RESET ALL`
    );
  }
}

async function revokeAllDirectObjectPrivileges(
  client: PoolClient,
  principal: ManagedPrincipal
): Promise<void> {
  const statements = await client.query<{ statement: string }>(`
    WITH target AS (
      SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1::text
    )
    SELECT DISTINCT statement FROM (
      SELECT 1 AS kind,database.datname AS object_name,
        format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I',database.datname,$1::text)
          AS statement
      FROM pg_catalog.pg_database AS database
      CROSS JOIN LATERAL pg_catalog.aclexplode(database.datacl) AS acl
      WHERE acl.grantee=(SELECT oid FROM target)
      UNION ALL
      SELECT 2,namespace.nspname,
        format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I',namespace.nspname,$1::text)
      FROM pg_catalog.pg_namespace AS namespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(namespace.nspacl) AS acl
      WHERE acl.grantee=(SELECT oid FROM target)
      UNION ALL
      SELECT 3,namespace.nspname || '.' || relation.relname,
        format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
          namespace.nspname,relation.relname,$1::text)
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS acl
      WHERE relation.relkind IN ('r','p','v','m','f')
        AND acl.grantee=(SELECT oid FROM target)
      UNION ALL
      SELECT 4,namespace.nspname || '.' || sequence.relname,
        format('REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM %I',
          namespace.nspname,sequence.relname,$1::text)
      FROM pg_catalog.pg_class AS sequence
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=sequence.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(sequence.relacl) AS acl
      WHERE sequence.relkind='S' AND acl.grantee=(SELECT oid FROM target)
      UNION ALL
      SELECT 5,namespace.nspname || '.' || relation.relname || '.' || attribute.attname,
        format('REVOKE ALL PRIVILEGES (%I) ON TABLE %I.%I FROM %I',
          attribute.attname,namespace.nspname,relation.relname,$1::text)
      FROM pg_catalog.pg_attribute AS attribute
      JOIN pg_catalog.pg_class AS relation ON relation.oid=attribute.attrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
      WHERE attribute.attnum>0 AND NOT attribute.attisdropped
        AND relation.relkind IN ('r','p','v','m','f')
        AND acl.grantee=(SELECT oid FROM target)
      UNION ALL
      SELECT 6,routine.oid::regprocedure::text,
        format('REVOKE ALL PRIVILEGES ON %s %I.%I(%s) FROM %I',
          CASE WHEN routine.prokind='p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
          namespace.nspname,routine.proname,
          pg_catalog.pg_get_function_identity_arguments(routine.oid),$1::text)
      FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=routine.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(routine.proacl) AS acl
      WHERE acl.grantee=(SELECT oid FROM target)
    ) AS direct_acl(kind,object_name,statement)
    ORDER BY statement
  `, [principal.roleName]);
  for (const { statement } of statements.rows) {
    await client.query(statement);
  }
}

async function assertNoDirectObjectPrivileges(
  client: PoolClient,
  roleNames: readonly string[]
): Promise<void> {
  const direct = (await client.query<{ present: boolean }>(`
    WITH targets AS (
      SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])
    )
    SELECT EXISTS(
      SELECT 1 FROM pg_catalog.pg_database AS object
      CROSS JOIN LATERAL pg_catalog.aclexplode(object.datacl) AS acl
      WHERE acl.grantee IN (SELECT oid FROM targets)
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_namespace AS object
      CROSS JOIN LATERAL pg_catalog.aclexplode(object.nspacl) AS acl
      WHERE acl.grantee IN (SELECT oid FROM targets)
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_class AS object
      CROSS JOIN LATERAL pg_catalog.aclexplode(object.relacl) AS acl
      WHERE acl.grantee IN (SELECT oid FROM targets)
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_attribute AS object
      CROSS JOIN LATERAL pg_catalog.aclexplode(object.attacl) AS acl
      WHERE acl.grantee IN (SELECT oid FROM targets)
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_proc AS object
      CROSS JOIN LATERAL pg_catalog.aclexplode(object.proacl) AS acl
      WHERE acl.grantee IN (SELECT oid FROM targets)
    ) AS present
  `, [roleNames])).rows[0]?.present;
  if (direct !== false) fail("PRODUCTION_DATABASE_PRINCIPAL_DIRECT_ACL_INVALID");
}

async function reconcilePrincipal(
  client: PoolClient,
  principal: ManagedPrincipal,
  credential: ParsedCredential
): Promise<boolean> {
  const exists = (await client.query<{ exists: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1) AS exists",
    [principal.roleName]
  )).rows[0]?.exists === true;
  if (!exists) {
    await client.query(`CREATE ROLE ${quoteIdentifier(principal.roleName)} NOLOGIN`);
  }
  await revokeAllDirectMemberships(client, principal);
  await revokeAllRoleMembers(client, principal);
  await resetAllDatabaseRoleSettings(client, principal);
  await revokeAllDirectObjectPrivileges(client, principal);
  await client.query(
    "SELECT pg_temp.reconcile_production_login($1,$2,$3,$4)",
    [
      principal.roleName,
      credential.password,
      principal.inherit,
      credential.validUntil?.toISOString() ?? "infinity"
    ]
  );
  for (const roleName of principal.directMemberships) {
    await client.query(
      `GRANT ${quoteIdentifier(roleName)} TO ${quoteIdentifier(principal.roleName)} `
      + "WITH ADMIN FALSE, INHERIT TRUE, SET TRUE"
    );
  }
  return !exists;
}

async function assertExactPrincipalState(
  client: PoolClient,
  manifest: ProductionPrincipalManifest,
  principals: readonly ManagedPrincipal[],
  credentials: ReadonlyMap<string, ParsedCredential>
): Promise<void> {
  const roleNames = principals.map(({ roleName }) => roleName);
  const governedRoles = [
    ...manifest.capabilityRoles.map(({ roleName }) => roleName),
    ...manifest.ownershipRoles.map(({ roleName }) => roleName)
  ].sort();
  const rows = await client.query<{
    rolname: string;
    rolcanlogin: boolean;
    rolinherit: boolean;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    rolconnlimit: number;
    rolconfig: string[] | null;
    hasRoleSettings: boolean;
    scram: boolean;
    validUntil: string;
    elevated: boolean;
    directRoles: Array<Readonly<{
      roleName: string;
      adminOption: boolean;
      inheritOption: boolean;
      setOption: boolean;
    }>>;
    effectiveRoles: string[];
    members: string[];
  }>(`
    SELECT target.rolname,target.rolcanlogin,target.rolinherit,target.rolsuper,
      target.rolcreatedb,target.rolcreaterole,target.rolreplication,target.rolbypassrls,
      target.rolconnlimit,public_role.rolconfig,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_db_role_setting AS setting
        WHERE setting.setrole=target.oid
      ) AS "hasRoleSettings",
      target.rolpassword LIKE 'SCRAM-SHA-256$%' AS scram,
      target.rolvaliduntil::text AS "validUntil",
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS elevated
        WHERE left(elevated.rolname,3)='pg_'
          AND pg_has_role(target.oid,elevated.oid,'MEMBER')
      ) AS elevated,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'roleName',parent.rolname,
          'adminOption',membership.admin_option,
          'inheritOption',membership.inherit_option,
          'setOption',membership.set_option
        ) ORDER BY parent.rolname)
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS parent ON parent.oid=membership.roleid
        WHERE membership.member=target.oid
      ),'[]'::jsonb) AS "directRoles",
      COALESCE((
        SELECT jsonb_agg(governed.rolname ORDER BY governed.rolname)
        FROM pg_catalog.pg_roles AS governed
        WHERE governed.rolname=ANY($2::text[])
          AND pg_has_role(target.oid,governed.oid,'MEMBER')
      ),'[]'::jsonb) AS "effectiveRoles",
      COALESCE((
        SELECT jsonb_agg(member.rolname ORDER BY member.rolname)
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS member ON member.oid=membership.member
        WHERE membership.roleid=target.oid
      ),'[]'::jsonb) AS members
    FROM pg_catalog.pg_authid AS target
    JOIN pg_catalog.pg_roles AS public_role ON public_role.oid=target.oid
    WHERE target.rolname=ANY($1::text[])
    ORDER BY target.rolname
  `,[roleNames, governedRoles]);
  const expected = [...principals].sort((left, right) => compareCodeUnits(left.roleName, right.roleName));
  if (rows.rows.length !== expected.length
    || rows.rows.some((row, index) => {
      const principal = expected[index]!;
      const credential = credentials.get(principal.id)!;
      const expectedDirect = principal.directMemberships.map((roleName) => ({
        roleName,
        adminOption: false,
        inheritOption: true,
        setOption: true
      }));
      const expiryMatches = credential.validUntil === null
        ? row.validUntil === "infinity"
        : Math.abs(new Date(row.validUntil).getTime() - credential.validUntil.getTime()) < 1_000;
      return row.rolname !== principal.roleName
        || !row.rolcanlogin
        || row.rolinherit !== principal.inherit
        || row.rolsuper
        || row.rolcreatedb
        || row.rolcreaterole
        || row.rolreplication
        || row.rolbypassrls
        || row.rolconnlimit !== -1
        || row.rolconfig !== null
        || row.hasRoleSettings
        || !row.scram
        || !expiryMatches
        || row.elevated
        || !directMembershipsMatch(row.directRoles, expectedDirect)
        || JSON.stringify(row.effectiveRoles) !== JSON.stringify(principal.effectiveMemberships)
        || row.members.length !== 0;
    })) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_DRIFT");
  }
  await assertNoOwnership(client, roleNames);
  await assertNoDirectObjectPrivileges(client, roleNames);
}

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
  }
  return process.getuid();
}

async function resolvePrivateCredentialTarget(path: string): Promise<string> {
  const resolvedPath = resolve(path);
  if (basename(resolvedPath).length === 0) {
    fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
  }
  const parent = await lstat(dirname(resolvedPath)).catch(() => null);
  if (parent === null
    || parent.isSymbolicLink()
    || !parent.isDirectory()
    || parent.uid !== currentUid()
    || (parent.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
    fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
  }
  return resolvedPath;
}

function fileIdentity(metadata: Readonly<{ dev: number; ino: number }>): FileIdentity {
  return Object.freeze({ device: metadata.dev, inode: metadata.ino });
}

function identityMatches(
  metadata: Readonly<{ dev: number; ino: number }>,
  identity: FileIdentity
): boolean {
  return metadata.dev === identity.device && metadata.ino === identity.inode;
}

async function lstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function syncParentDirectory(parentPath: string): Promise<void> {
  const handle = await open(parentPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function recoveryMarkerPath(targetPath: string): string {
  return resolve(dirname(targetPath), `.${basename(targetPath)}.recovery-owner`);
}

async function tryAcquireRecoveryMarker(
  targetPath: string,
  recoveryBackoff: RecoveryBackoff
): Promise<RecoveryMarkerJournal | null> {
  const path = recoveryMarkerPath(targetPath);
  let handle;
  try {
    handle = await open(path, "wx", PRIVATE_FILE_MODE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
    throw error;
  }
  const marker: RecoveryMarkerJournal = {
    path,
    parentPath: dirname(path),
    identity: fileIdentity(await handle.stat()),
    directorySyncPending: true
  };
  await handle.close();
  let attempt = 0;
  for (;;) {
    try {
      const metadata = await lstatOrNull(marker.path);
      if (metadata === null
        || metadata.isSymbolicLink()
        || !metadata.isFile()
        || metadata.uid !== currentUid()
        || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
        || !identityMatches(metadata, marker.identity)) {
        fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      }
      const markerHandle = await open(marker.path, "r");
      try {
        await markerHandle.sync();
      } finally {
        await markerHandle.close();
      }
      await syncParentDirectory(marker.parentPath);
      marker.directorySyncPending = false;
      return marker;
    } catch {
      await recoveryBackoff(attempt);
      attempt += 1;
    }
  }
}

async function releaseRecoveryMarkerDurably(
  marker: RecoveryMarkerJournal,
  recoveryBackoff: RecoveryBackoff
): Promise<void> {
  let attempt = 0;
  for (;;) {
    try {
      const metadata = await lstatOrNull(marker.path);
      if (metadata !== null) {
        if (!identityMatches(metadata, marker.identity)) {
          fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
        }
        marker.directorySyncPending = true;
        await unlink(marker.path);
      }
      if (marker.directorySyncPending) {
        await syncParentDirectory(marker.parentPath);
        marker.directorySyncPending = false;
      }
      return;
    } catch {
      await recoveryBackoff(attempt);
      attempt += 1;
    }
  }
}

async function removeOwnedPath(
  path: string,
  identity: FileIdentity,
  journal: Pick<SupportCredentialPublicationJournal, "parentPath" | "directorySyncPending">
): Promise<void> {
  const metadata = await lstatOrNull(path);
  if (metadata !== null) {
    if (!identityMatches(metadata, identity)) {
      fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
    }
    journal.directorySyncPending = true;
    await unlink(path);
  }
  if (journal.directorySyncPending) {
    await syncParentDirectory(journal.parentPath);
    journal.directorySyncPending = false;
  }
}

async function writeSupportConfigCredentialFile(
  targetPath: string,
  credential: ParsedCredential,
  journal: SupportCredentialPublicationJournal
): Promise<void> {
  if (credential.validUntil === null) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");
  }
  const source = JSON.stringify({
    databaseUrl: credential.databaseUrl,
    validUntil: credential.validUntil.toISOString()
  });
  const temporaryPath = resolve(
    journal.parentPath,
    `.${basename(targetPath)}.${process.pid}.${randomBytes(16).toString("hex")}.tmp`
  );
  journal.temporaryPath = temporaryPath;
  let handle;
  try {
    handle = await open(temporaryPath, "wx", PRIVATE_FILE_MODE);
    const metadata = await handle.stat();
    journal.temporaryIdentity = fileIdentity(metadata);
    await handle.writeFile(source, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;

    const priorMetadata = await lstatOrNull(targetPath);
    if (priorMetadata !== null) {
      if (priorMetadata.isSymbolicLink()
        || !priorMetadata.isFile()
        || priorMetadata.uid !== currentUid()
        || priorMetadata.nlink !== 1
        || (priorMetadata.mode & 0o777) !== PRIVATE_FILE_MODE) {
        fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      }
      const identity = fileIdentity(priorMetadata);
      const bytes = await readFile(targetPath);
      const confirmed = await lstatOrNull(targetPath);
      if (confirmed === null
        || !identityMatches(confirmed, identity)
        || confirmed.size !== bytes.length
        || (confirmed.mode & 0o777) !== (priorMetadata.mode & 0o777)) {
        fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      }
      const backupPath = resolve(
        journal.parentPath,
        `.${basename(targetPath)}.${process.pid}.${randomBytes(16).toString("hex")}.backup`
      );
      const prior = Object.freeze({
        backupPath,
        identity,
        bytes,
        mode: priorMetadata.mode & 0o777
      });
      try {
        journal.directorySyncPending = true;
        await link(targetPath, backupPath);
        journal.prior = prior;
      } catch (error) {
        const linkedMetadata = await lstatOrNull(backupPath);
        if (linkedMetadata !== null && identityMatches(linkedMetadata, identity)) {
          journal.prior = prior;
        }
        throw error;
      }
      await syncParentDirectory(journal.parentPath);
      journal.directorySyncPending = false;
    }

    try {
      journal.directorySyncPending = true;
      await rename(temporaryPath, targetPath);
      journal.publishedIdentity = journal.temporaryIdentity;
    } catch (error) {
      const publishedMetadata = await lstatOrNull(targetPath);
      if (journal.temporaryIdentity !== undefined
        && publishedMetadata !== null
        && identityMatches(publishedMetadata, journal.temporaryIdentity)) {
        journal.publishedIdentity = journal.temporaryIdentity;
      }
      throw error;
    }
    await syncParentDirectory(journal.parentPath);
    journal.directorySyncPending = false;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_WRITE_FAILED", error);
  }
}

async function disableSupportConfigPrincipalDurably(
  client: PoolClient,
  failures: unknown[]
): Promise<boolean> {
  try {
    await client.query("BEGIN");
    await client.query(`ALTER ROLE ${quoteIdentifier(SUPPORT_CONFIG_OPERATOR_ROLE)} NOLOGIN`);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    failures.push(error);
    await client.query("ROLLBACK").catch((rollbackError) => failures.push(rollbackError));
    return false;
  }
}

async function terminateSupportConfigPrincipalSessions(
  client: PoolClient,
  failures: unknown[]
): Promise<boolean> {
  try {
    await client.query("SELECT pg_catalog.pg_stat_clear_snapshot()");
    await client.query(`
      WITH targets AS MATERIALIZED (
        SELECT pid FROM pg_catalog.pg_stat_activity
        WHERE usename=$1 AND pid<>pg_backend_pid()
      )
      SELECT count(*)::integer AS count
      FROM targets WHERE pg_terminate_backend(pid,5000)
    `, [SUPPORT_CONFIG_OPERATOR_ROLE]);
    await client.query("SELECT pg_catalog.pg_stat_clear_snapshot()");
    const remaining = (await client.query<{ count: number }>(`
      SELECT count(*)::integer AS count FROM pg_catalog.pg_stat_activity
      WHERE usename=$1 AND pid<>pg_backend_pid()
    `, [SUPPORT_CONFIG_OPERATOR_ROLE])).rows[0]?.count;
    if (remaining !== 0) throw new Error("support credential sessions remain");
    return true;
  } catch (error) {
    failures.push(error);
    return false;
  }
}

async function assertSupportConfigPrincipalFailClosed(client: PoolClient): Promise<void> {
  const state = (await client.query<{ canLogin: boolean; sessionCount: number }>(`
    SELECT role.rolcanlogin AS "canLogin",(
      SELECT count(*)::integer FROM pg_catalog.pg_stat_activity
      WHERE usename=$1 AND pid<>pg_backend_pid()
    ) AS "sessionCount"
    FROM pg_catalog.pg_roles AS role WHERE role.rolname=$1
  `, [SUPPORT_CONFIG_OPERATOR_ROLE])).rows[0];
  if (state?.canLogin !== false || state.sessionCount !== 0) {
    fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_INVALID");
  }
}

async function restoreCredentialPublication(
  journal: SupportCredentialPublicationJournal
): Promise<void> {
  const targetMetadata = await lstatOrNull(journal.targetPath);
  if (journal.prior !== undefined) {
    const backupMetadata = await lstatOrNull(journal.prior.backupPath);
    if (backupMetadata === null) {
      if (targetMetadata === null
        || (journal.publishedIdentity !== undefined
          && identityMatches(targetMetadata, journal.publishedIdentity))) {
        await recreatePriorCredentialTarget(journal);
      } else if (!identityMatches(targetMetadata, journal.prior.identity)
        && (journal.restoredIdentity === undefined
          || !identityMatches(targetMetadata, journal.restoredIdentity))) {
        fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      }
    } else if (!identityMatches(backupMetadata, journal.prior.identity)) {
      fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
    } else if (targetMetadata === null
      || (journal.publishedIdentity !== undefined
        && identityMatches(targetMetadata, journal.publishedIdentity))) {
      journal.directorySyncPending = true;
      await rename(journal.prior.backupPath, journal.targetPath);
      await syncParentDirectory(journal.parentPath);
      journal.directorySyncPending = false;
    } else if (identityMatches(targetMetadata, journal.prior.identity)) {
      await removeOwnedPath(
        journal.prior.backupPath,
        journal.prior.identity,
        journal
      );
    } else {
      fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
    }
    await assertPriorCredentialTargetRestored(journal);
  } else if (journal.publishedIdentity !== undefined) {
    if (targetMetadata === null || identityMatches(targetMetadata, journal.publishedIdentity)) {
      await removeOwnedPath(journal.targetPath, journal.publishedIdentity, journal);
    } else {
      fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
    }
  }

  if (journal.temporaryPath !== undefined && journal.temporaryIdentity !== undefined) {
    await removeOwnedPath(
      journal.temporaryPath,
      journal.temporaryIdentity,
      journal
    );
  }
  if (journal.directorySyncPending) {
    await syncParentDirectory(journal.parentPath);
    journal.directorySyncPending = false;
  }
}

async function recreatePriorCredentialTarget(
  journal: SupportCredentialPublicationJournal
): Promise<void> {
  const prior = journal.prior;
  if (prior === undefined) {
    fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
  }
  const restorePath = resolve(
    journal.parentPath,
    `.${basename(journal.targetPath)}.${process.pid}.${randomBytes(16).toString("hex")}.restore`
  );
  let handle;
  let identity: FileIdentity | undefined;
  try {
    handle = await open(restorePath, "wx", prior.mode);
    identity = fileIdentity(await handle.stat());
    await handle.writeFile(prior.bytes);
    await handle.chmod(prior.mode);
    await handle.sync();
    await handle.close();
    handle = undefined;
    journal.directorySyncPending = true;
    await rename(restorePath, journal.targetPath);
    journal.restoredIdentity = identity;
    await syncParentDirectory(journal.parentPath);
    journal.directorySyncPending = false;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (identity !== undefined) {
      await removeOwnedPath(restorePath, identity, journal).catch(() => undefined);
    }
    throw error;
  }
}

async function assertPriorCredentialTargetRestored(
  journal: SupportCredentialPublicationJournal
): Promise<void> {
  const prior = journal.prior;
  if (prior === undefined) {
    fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
  }
  const metadata = await lstatOrNull(journal.targetPath);
  const expectedIdentity = journal.restoredIdentity ?? prior.identity;
  if (metadata === null
    || metadata.isSymbolicLink()
    || !metadata.isFile()
    || metadata.uid !== currentUid()
    || metadata.nlink !== 1
    || (metadata.mode & 0o777) !== prior.mode
    || !identityMatches(metadata, expectedIdentity)
    || !(await readFile(journal.targetPath)).equals(prior.bytes)) {
    fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
  }
}

async function compensateFailedCredentialPublication(
  adminPool: Pool,
  journal: SupportCredentialPublicationJournal,
  recoveryBackoff: RecoveryBackoff
): Promise<readonly unknown[]> {
  const failures: unknown[] = [];
  let attempt = 0;
  for (;;) {
    let client: PoolClient | undefined;
    let attemptFailed = false;
    try {
      client = await adminPool.connect();
      if (!await disableSupportConfigPrincipalDurably(client, failures)) {
        throw new Error("support principal could not be disabled");
      }
      if (!await terminateSupportConfigPrincipalSessions(client, failures)) {
        throw new Error("support principal sessions could not be terminated");
      }
      await restoreCredentialPublication(journal);
      await assertSupportConfigPrincipalFailClosed(client);
      await assertCredentialPublicationRecovered(journal);
      return Object.freeze(failures);
    } catch (error) {
      failures.push(error);
      attemptFailed = true;
    } finally {
      client?.release(attemptFailed);
    }
    await recoveryBackoff(attempt);
    attempt += 1;
  }
}

async function assertCredentialPublicationRecovered(
  journal: SupportCredentialPublicationJournal
): Promise<void> {
  if (journal.directorySyncPending) {
    fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_INVALID");
  }
  if (journal.prior !== undefined) {
    await assertPriorCredentialTargetRestored(journal);
    if (await lstatOrNull(journal.prior.backupPath) !== null) {
      fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_INVALID");
    }
  } else if (journal.publishedIdentity !== undefined
    && await lstatOrNull(journal.targetPath) !== null) {
    fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_INVALID");
  }
  if (journal.temporaryPath !== undefined
    && journal.temporaryIdentity !== undefined
    && await lstatOrNull(journal.temporaryPath) !== null) {
    fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_INVALID");
  }
}

async function finalizeCredentialPublication(
  journal: SupportCredentialPublicationJournal
): Promise<void> {
  if (journal.prior !== undefined) {
    await removeOwnedPath(
      journal.prior.backupPath,
      journal.prior.identity,
      journal
    );
  }
}

async function assertValidatedCredentialFileUnchanged(input: Readonly<{
  resolvedPath: string;
  device: number;
  inode: number;
}>): Promise<void> {
  const metadata = await lstat(input.resolvedPath).catch(() => null);
  if (metadata === null
    || metadata.isSymbolicLink()
    || !metadata.isFile()
    || metadata.uid !== currentUid()
    || metadata.nlink !== 1
    || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
    || metadata.dev !== input.device
    || metadata.ino !== input.inode) {
    fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
  }
}

export async function provisionProductionDatabasePrincipals(input: Readonly<{
  adminPool: Pool;
  adminDatabaseUrl: string;
  manifest: unknown;
  credentialEnvelope: unknown;
  supportConfigCredentialFilePath: string;
  recoveryBackoff?: RecoveryBackoff;
}>): Promise<ProductionDatabasePrincipalProvisioningReceipt> {
  const supportConfigCredentialFilePath = await resolvePrivateCredentialTarget(
    input.supportConfigCredentialFilePath
  );
  const manifest = parseManifest(input.manifest);
  const principals = managedPrincipals(manifest);
  const credentials = parseCredentialEnvelope(
    input.credentialEnvelope,
    principals,
    input.adminDatabaseUrl
  );
  const obsHumanCredential = credentials.get("obs-human");
  const supportConfigCredential = credentials.get(SUPPORT_CONFIG_OPERATOR_ID);
  if (obsHumanCredential === undefined || supportConfigCredential === undefined) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");
  }
  const recoveryBackoff = input.recoveryBackoff ?? defaultRecoveryBackoff;
  return withProductionPrincipalLease(
    input.adminPool,
    supportConfigCredentialFilePath,
    recoveryBackoff,
    async (lease) => {
    const publicationJournal: SupportCredentialPublicationJournal = {
      targetPath: supportConfigCredentialFilePath,
      parentPath: dirname(supportConfigCredentialFilePath),
      directorySyncPending: false
    };
    const client = await lease.connectWorkClient();
    let clientReleased = false;
    const releaseClient = (destroy: boolean): void => {
      if (clientReleased) return;
      clientReleased = true;
      client.release(destroy);
    };
    let createdCount = 0;
    let commitAttempted = false;
    try {
      await client.query("BEGIN");
      try {
        await assertAdmin(client, manifest);
        await assertCapabilityRoles(client, manifest);
        await assertJitCredentialWindow(client, obsHumanCredential);
        await assertJitCredentialWindow(client, supportConfigCredential);
        await assertNoOwnership(client, principals.map(({ roleName }) => roleName));
        await client.query("SET LOCAL password_encryption='scram-sha-256'");
        await installTemporaryRoleReconciler(client);
        for (const principal of principals) {
          if (await reconcilePrincipal(client, principal, credentials.get(principal.id)!)) {
            createdCount += 1;
          }
        }
        await assertExactPrincipalState(client, manifest, principals, credentials);
        commitAttempted = true;
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        const provisioningFailure = error instanceof ProductionDatabasePrincipalProvisioningError
          ? error
          : new ProductionDatabasePrincipalProvisioningError(
            "PRODUCTION_DATABASE_PRINCIPAL_PROVISIONING_FAILED",
            error
          );
        if (commitAttempted) {
          releaseClient(true);
          const compensationFailures = await compensateFailedCredentialPublication(
            input.adminPool,
            publicationJournal,
            recoveryBackoff
          );
          if (compensationFailures.length > 0) {
            fail(
              "PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_FAILED",
              new AggregateError([provisioningFailure, ...compensationFailures])
            );
          }
        }
        throw provisioningFailure;
      }
      try {
        await writeSupportConfigCredentialFile(
          supportConfigCredentialFilePath,
          supportConfigCredential,
          publicationJournal
        );
        await assertExactPrincipalState(client, manifest, principals, credentials);
        const published = await validateProductionSupportConfigCredentialFileForCleanup(
          supportConfigCredentialFilePath
        ).catch((error) => fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID", error));
        if (published.credentials.databaseUrl !== supportConfigCredential.databaseUrl
          || published.credentials.validUntil !== supportConfigCredential.validUntil!.toISOString()) {
          fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
        }
        await finalizeCredentialPublication(publicationJournal);
      } catch (error) {
        releaseClient(true);
        const compensationFailures = await compensateFailedCredentialPublication(
          input.adminPool,
          publicationJournal,
          recoveryBackoff
        );
        if (compensationFailures.length > 0) {
          fail(
            "PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_FAILED",
            new AggregateError([error, ...compensationFailures])
          );
        }
        throw error;
      }
      return Object.freeze({
        principalCount: principals.length,
        createdCount,
        humanCredentialExpiresAtByPrincipal: Object.freeze({
          "obs-human": obsHumanCredential.validUntil!.toISOString(),
          "support-config-operator": supportConfigCredential.validUntil!.toISOString()
        }),
        supportConfigCredentialFilePath
      });
    } finally {
      releaseClient(false);
    }
  });
}

export async function cleanupProductionSupportConfigOperator(input: Readonly<{
  adminPool: Pool;
  supportConfigCredentialFilePath: string;
  recoveryBackoff?: RecoveryBackoff;
}>): Promise<ProductionSupportConfigOperatorCleanupReceipt> {
  const supportConfigCredentialFilePath = await resolvePrivateCredentialTarget(
    input.supportConfigCredentialFilePath
  );
  const recoveryBackoff = input.recoveryBackoff ?? defaultRecoveryBackoff;
  return withProductionPrincipalLease(
    input.adminPool,
    supportConfigCredentialFilePath,
    recoveryBackoff,
    async (lease) => {
    const client = await lease.connectWorkClient();
    let workFailed = false;
    try {
    const validated = await validateProductionSupportConfigCredentialFileForCleanup(
      supportConfigCredentialFilePath
    ).catch((error) => fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID", error));
    await client.query("BEGIN");
    try {
      const authority = (await client.query<{
        sessionPrincipal: string;
        principal: string;
        databaseName: string;
        superuser: boolean;
      }>(`
        SELECT session_user AS "sessionPrincipal",current_user AS principal,
          current_database() AS "databaseName",rolsuper AS superuser
        FROM pg_catalog.pg_roles WHERE rolname=current_user
      `)).rows[0];
      if (authority?.sessionPrincipal !== "debateai_prod_migrator"
        || authority.principal !== "debateai_prod_migrator"
        || authority.databaseName !== "debateai"
        || !authority.superuser) {
        fail("PRODUCTION_DATABASE_PRINCIPAL_ADMIN_REQUIRED");
      }
      const exists = (await client.query<{ exists: boolean }>(`
        SELECT EXISTS(
          SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1::text
        ) AS exists
      `, [SUPPORT_CONFIG_OPERATOR_ROLE])).rows[0]?.exists;
      if (exists !== true) fail("PRODUCTION_DATABASE_PRINCIPAL_DRIFT");
      await client.query(`ALTER ROLE ${quoteIdentifier(SUPPORT_CONFIG_OPERATOR_ROLE)} NOLOGIN`);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ProductionDatabasePrincipalProvisioningError) throw error;
      fail("PRODUCTION_SUPPORT_CONFIG_CLEANUP_FAILED", error);
    }
    const terminatedSessionCount = (await client.query<{ count: number }>(`
      WITH targets AS MATERIALIZED (
        SELECT pid FROM pg_catalog.pg_stat_activity
        WHERE usename=$1::text AND pid<>pg_backend_pid()
      )
      SELECT count(*)::integer AS count
      FROM targets WHERE pg_terminate_backend(pid,5000)
    `, [SUPPORT_CONFIG_OPERATOR_ROLE])).rows[0]?.count ?? 0;
    await client.query("SELECT pg_stat_clear_snapshot()");
    const remaining = (await client.query<{ count: number }>(`
      SELECT count(*)::integer AS count
      FROM pg_catalog.pg_stat_activity
      WHERE usename=$1::text AND pid<>pg_backend_pid()
    `, [SUPPORT_CONFIG_OPERATOR_ROLE])).rows[0]?.count;
    if (remaining !== 0) fail("PRODUCTION_SUPPORT_CONFIG_SESSIONS_REMAIN");
    await assertValidatedCredentialFileUnchanged(validated);
    await unlink(validated.resolvedPath).catch((error) =>
      fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID", error));
    await syncParentDirectory(dirname(validated.resolvedPath));

    await client.query("SELECT pg_stat_clear_snapshot()");
    const finalState = (await client.query<{
      canLogin: boolean;
      sessionCount: number;
    }>(`
      SELECT role.rolcanlogin AS "canLogin",(
        SELECT count(*)::integer FROM pg_catalog.pg_stat_activity
        WHERE usename=$1::text AND pid<>pg_backend_pid()
      ) AS "sessionCount"
      FROM pg_catalog.pg_roles AS role WHERE role.rolname=$1::text
    `, [SUPPORT_CONFIG_OPERATOR_ROLE])).rows[0];
    if (finalState?.canLogin !== false || finalState.sessionCount !== 0) {
      fail("PRODUCTION_SUPPORT_CONFIG_SESSIONS_REMAIN");
    }
    const fileStillExists = await lstat(validated.resolvedPath).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false;
        fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID", error);
      }
    );
    if (fileStillExists) fail("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
    return Object.freeze({
      terminatedSessionCount,
      supportConfigCredentialFilePath: validated.resolvedPath
    });
    } catch (error) {
      workFailed = true;
      throw error;
    } finally {
      client.release(workFailed);
    }
  });
}
