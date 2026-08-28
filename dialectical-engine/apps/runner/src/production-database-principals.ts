import { Buffer } from "node:buffer";
import type { Pool, PoolClient } from "pg";

export const PRODUCTION_DATABASE_PRINCIPAL_CREDENTIAL_FORMAT =
  "debateai.production-database-principal-credentials.v1" as const;

const MANIFEST_FORMAT = "debateai.production-database-principals.v2";
const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/u;
const MINIMUM_PASSWORD_BYTES = 32;
const MAXIMUM_PASSWORD_BYTES = 1_024;
const MAXIMUM_JIT_CREDENTIAL_MILLISECONDS = 15 * 60 * 1_000;
const MINIMUM_JIT_CREDENTIAL_MILLISECONDS = 60 * 1_000;

type ManifestPrincipal = Readonly<{
  id: string;
  roleName: string;
  kind: "SERVICE" | "HUMAN_READ_ONLY" | string;
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

export type ProductionDatabasePrincipalProvisioningReceipt = Readonly<{
  principalCount: number;
  createdCount: number;
  humanCredentialExpiresAt: string;
}>;

export class ProductionDatabasePrincipalProvisioningError extends Error {
  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "ProductionDatabasePrincipalProvisioningError";
  }
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
      || (principal.kind !== "SERVICE" && principal.kind !== "HUMAN_READ_ONLY")
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
      human: principal.kind === "HUMAN_READ_ONLY",
      directMemberships: asStringArray(principal.directMemberships),
      effectiveMemberships: asStringArray(principal.effectiveMemberships)
    }));
  }
  const humanRows = rows.filter(({ human }) => human);
  if (humanRows.length !== 1 || humanRows[0]?.id !== "obs-human") {
    fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
  }

  const requirements = new Map(manifest.credentialRequirements.map((row) => [
    row.principalId,
    row.lifecycle
  ]));
  for (const row of rows) {
    const expectedLifecycle = row.human ? "MIGRATION_MINTED_UNMANAGED" : undefined;
    const lifecycle = requirements.get(row.id);
    if (lifecycle === undefined
      || (row.human && lifecycle !== expectedLifecycle)
      || (!row.human && lifecycle !== "ROTATED_SERVICE"
        && lifecycle !== "MIGRATION_MINTED_UNMANAGED")) {
      fail("PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID");
    }
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
  return Object.freeze(rows.sort((left, right) => left.id.localeCompare(right.id)));
}

function grantOrder(left: ManifestMembershipGrant, right: ManifestMembershipGrant): number {
  return `${left.memberRole}:${left.grantedRole}`.localeCompare(
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
    left.roleName.localeCompare(right.roleName));
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
  const expected = [...principals].sort((left, right) => left.roleName.localeCompare(right.roleName));
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
}

export async function provisionProductionDatabasePrincipals(input: Readonly<{
  adminPool: Pool;
  adminDatabaseUrl: string;
  manifest: unknown;
  credentialEnvelope: unknown;
}>): Promise<ProductionDatabasePrincipalProvisioningReceipt> {
  const manifest = parseManifest(input.manifest);
  const principals = managedPrincipals(manifest);
  const credentials = parseCredentialEnvelope(
    input.credentialEnvelope,
    principals,
    input.adminDatabaseUrl
  );
  const humanCredential = credentials.get("obs-human");
  if (humanCredential === undefined) {
    fail("PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID");
  }
  const client = await input.adminPool.connect();
  let createdCount = 0;
  try {
    await client.query("BEGIN");
    try {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('debateai:production-database-principals:v1',0))"
      );
      await assertAdmin(client, manifest);
      await assertCapabilityRoles(client, manifest);
      await assertJitCredentialWindow(client, humanCredential);
      await assertNoOwnership(client, principals.map(({ roleName }) => roleName));
      await client.query("SET LOCAL password_encryption='scram-sha-256'");
      await installTemporaryRoleReconciler(client);
      for (const principal of principals) {
        if (await reconcilePrincipal(client, principal, credentials.get(principal.id)!)) {
          createdCount += 1;
        }
      }
      await assertExactPrincipalState(client, manifest, principals, credentials);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ProductionDatabasePrincipalProvisioningError) throw error;
      fail("PRODUCTION_DATABASE_PRINCIPAL_PROVISIONING_FAILED", error);
    }
  } finally {
    client.release();
  }
  return Object.freeze({
    principalCount: principals.length,
    createdCount,
    humanCredentialExpiresAt: humanCredential.validUntil!.toISOString()
  });
}
