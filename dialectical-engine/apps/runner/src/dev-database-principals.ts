import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Pool, PoolClient } from "pg";
import { assertDevCustodyDirectory } from "../../../deploy/dev-auth/custody-root.mjs";

export type DevelopmentDatabasePrincipal = Readonly<{
  roleName: string;
  capabilityRole: string;
  environmentKey: string;
  /**
   * Row-level security S01 (DECISIONS D29, D46): the NOLOGIN marker role migration 0124 creates, which the
   * rls_all_accounts policy names. Granted beside the capability role, with the same option set (D54), to the
   * logins that read across accounts outside a signed-in request; never to a login the API serves requests on.
   */
  crossAccountRole?: "debateai_rls_all_accounts";
}>;

export const DEVELOPMENT_DATABASE_PRINCIPALS = Object.freeze([
  // Go-live row 41 (migration 0093): the API's own login holds billing's role, which inherits
  // debateai_runtime (and, since 0094, the acceptance record, sign-up with consent and the
  // country-gate audit). Since row-level security S01 the development runner has its own login
  // (debateai_dev_runner, RUNNER_DATABASE_URL, below), as the production runner does (P3-01).
  Object.freeze({
    roleName: "debateai_dev_runtime",
    capabilityRole: "debateai_billing_runtime",
    environmentKey: "DATABASE_URL"
  }),
  Object.freeze({
    roleName: "debateai_dev_content_provision",
    capabilityRole: "debateai_content_provision",
    environmentKey: "CONTENT_PROVISION_DATABASE_URL"
  }),
  Object.freeze({
    roleName: "debateai_dev_erasure",
    capabilityRole: "debateai_erasure_runtime",
    environmentKey: "ERASURE_DATABASE_URL"
  }),
  Object.freeze({
    roleName: "debateai_dev_authorization",
    capabilityRole: "debateai_authorization_runtime",
    environmentKey: "AUTHORIZATION_DATABASE_URL"
  }),
  Object.freeze({
    roleName: "debateai_dev_publication_cleanup",
    capabilityRole: "debateai_publication_cleanup",
    environmentKey: "PUBLICATION_CLEANUP_DATABASE_URL"
  }),
  Object.freeze({
    roleName: "debateai_dev_replay",
    capabilityRole: "debateai_replay",
    environmentKey: "REPLAY_SELF_TEST_DATABASE_URL"
  }),
  Object.freeze({
    roleName: "debateai_dev_liveness",
    capabilityRole: "debateai_runtime",
    environmentKey: "LIVENESS_DATABASE_URL",
    crossAccountRole: "debateai_rls_all_accounts"
  }),
  Object.freeze({
    roleName: "debateai_dev_settlement",
    capabilityRole: "debateai_settlement_watch",
    environmentKey: "SETTLEMENT_DATABASE_URL"
  }),
  Object.freeze({
    roleName: "debateai_dev_evaluator_api",
    capabilityRole: "debateai_evaluator_api",
    environmentKey: "EVALUATOR_DEV_MENU_DATABASE_URL"
  }),
  Object.freeze({
    roleName: "debateai_dev_support_config_operator",
    capabilityRole: "debateai_support_config_operator",
    environmentKey: "SUPPORT_CONFIG_OPERATOR_DATABASE_URL"
  }),
  Object.freeze({
    roleName: "debateai_dev_support",
    capabilityRole: "debateai_support",
    environmentKey: "SUPPORT_DATABASE_URL"
  }),
  Object.freeze({
    roleName: "debateai_dev_data_export",
    capabilityRole: "debateai_data_export_worker",
    environmentKey: "DATA_EXPORT_DATABASE_URL"
  }),
  // Row-level security S01 (DECISIONS D29, D46): appended last, so a credential file written before them is
  // upgraded by suffix append. The API's system pool (every statement outside a request) and room-decision pool,
  // the authorization pool's system target, and the runner's own login (it no longer shares DATABASE_URL).
  Object.freeze({
    roleName: "debateai_dev_api_system",
    capabilityRole: "debateai_billing_runtime",
    environmentKey: "API_SYSTEM_DATABASE_URL",
    crossAccountRole: "debateai_rls_all_accounts"
  }),
  Object.freeze({
    roleName: "debateai_dev_authorization_system",
    capabilityRole: "debateai_authorization_runtime",
    environmentKey: "API_AUTHORIZATION_SYSTEM_DATABASE_URL",
    crossAccountRole: "debateai_rls_all_accounts"
  }),
  Object.freeze({
    roleName: "debateai_dev_runner",
    capabilityRole: "debateai_runtime",
    environmentKey: "RUNNER_DATABASE_URL",
    crossAccountRole: "debateai_rls_all_accounts"
  })
] satisfies readonly DevelopmentDatabasePrincipal[]);

type ProvisionDevelopmentDatabasePrincipalsInput = Readonly<{
  adminPool: Pool;
  adminDatabaseUrl: string;
  credentialFilePath: string;
}>;

export type DevelopmentDatabasePrincipalReceipt = Readonly<{
  credentialFilePath: string;
  principalCount: number;
}>;

const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MAX_CREDENTIAL_FILE_BYTES = 64 * 1024;
// The first 9, 10 and 11 keys (the files before the support and data-export logins) and the 12 keys every file had
// before row-level security S01 (D46). A 13- or 14-key file matches none and is refused.
const LEGACY_DEVELOPMENT_DATABASE_ENVIRONMENT_KEY_SETS = Object.freeze([
  Object.freeze(DEVELOPMENT_DATABASE_PRINCIPALS.slice(0, -6)
    .map(({ environmentKey }) => environmentKey)),
  Object.freeze(DEVELOPMENT_DATABASE_PRINCIPALS.slice(0, -5)
    .map(({ environmentKey }) => environmentKey)),
  Object.freeze(DEVELOPMENT_DATABASE_PRINCIPALS.slice(0, -4)
    .map(({ environmentKey }) => environmentKey)),
  Object.freeze(DEVELOPMENT_DATABASE_PRINCIPALS.slice(0, -3)
    .map(({ environmentKey }) => environmentKey))
]);

function quoteIdentifier(value: string): string {
  if (!ROLE_NAME_PATTERN.test(value)) throw new TypeError("DEV_DATABASE_ROLE_NAME_INVALID");
  return `"${value}"`;
}

type FileIdentity = Readonly<{ device: number; inode: number }>;

function currentUid(errorCode: string): number {
  if (typeof process.getuid !== "function") throw new TypeError(errorCode);
  return process.getuid();
}

function identity(metadata: Readonly<{ dev: number; ino: number }>): FileIdentity {
  return Object.freeze({ device: metadata.dev, inode: metadata.ino });
}

function hasIdentity(
  metadata: Readonly<{ dev: number; ino: number }>,
  expected: FileIdentity
): boolean {
  return metadata.dev === expected.device && metadata.ino === expected.inode;
}

async function assertCredentialRoot(
  credentialRoot: string,
  expected?: FileIdentity
): Promise<FileIdentity> {
  const metadata = await lstat(credentialRoot).catch(() => null);
  if (metadata === null || metadata.isSymbolicLink() || !metadata.isDirectory()
    || metadata.uid !== currentUid("DEV_DATABASE_CREDENTIAL_ROOT_INVALID")
    || (metadata.mode & 0o777) !== PRIVATE_DIRECTORY_MODE
    || (expected !== undefined && !hasIdentity(metadata, expected))) {
    throw new TypeError("DEV_DATABASE_CREDENTIAL_ROOT_INVALID");
  }
  return identity(metadata);
}

function assertCredentialMetadata(
  metadata: Readonly<{
    isFile(): boolean;
    uid: number;
    nlink: number;
    mode: number;
    size: number;
  }>
): void {
  if (!metadata.isFile()
    || metadata.uid !== currentUid("DEV_DATABASE_CREDENTIAL_FILE_INVALID")
    || metadata.nlink !== 1
    || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
    || metadata.size < 1
    || metadata.size > MAX_CREDENTIAL_FILE_BYTES) {
    throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
  }
}

async function readCredentialFile(
  resolvedPath: string,
  credentialRoot: string,
  rootIdentity: FileIdentity,
  expected?: FileIdentity
): Promise<Readonly<{ source: string; identity: FileIdentity }>> {
  await assertCredentialRoot(credentialRoot, rootIdentity);
  let handle;
  try {
    handle = await open(resolvedPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
  }
  try {
    const metadata = await handle.stat();
    assertCredentialMetadata(metadata);
    if (expected !== undefined && !hasIdentity(metadata, expected)) {
      throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    }
    const bounded = Buffer.alloc(MAX_CREDENTIAL_FILE_BYTES + 1);
    let offset = 0;
    while (offset < bounded.length) {
      const { bytesRead } = await handle.read(bounded, offset, bounded.length - offset, null);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > MAX_CREDENTIAL_FILE_BYTES) {
      throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    }
    const pathMetadata = await lstat(resolvedPath).catch(() => null);
    if (pathMetadata === null) throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    assertCredentialMetadata(pathMetadata);
    if (!hasIdentity(pathMetadata, identity(metadata))) {
      throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    }
    await assertCredentialRoot(credentialRoot, rootIdentity);
    return Object.freeze({
      source: bounded.subarray(0, offset).toString("utf8"),
      identity: identity(metadata)
    });
  } finally {
    await handle.close();
  }
}

function databaseLocation(url: URL): string {
  const copy = new URL(url);
  copy.username = "";
  copy.password = "";
  return copy.toString();
}

function credentialSource(
  adminDatabaseUrl: string,
  principals: readonly DevelopmentDatabasePrincipal[] = DEVELOPMENT_DATABASE_PRINCIPALS
): string {
  const admin = new URL(adminDatabaseUrl);
  if (admin.protocol !== "postgres:" && admin.protocol !== "postgresql:") {
    throw new TypeError("DEV_DATABASE_ADMIN_URL_INVALID");
  }
  return principals.map((principal) => {
    const url = new URL(admin);
    url.username = principal.roleName;
    url.password = randomBytes(32).toString("base64url");
    return `${principal.environmentKey}=${url.toString()}`;
  }).join("\n") + "\n";
}

function readCredentials(
  source: string,
  adminDatabaseUrl: string,
  requireComplete = true
): ReadonlyMap<string, URL> {
  const expectedLocation = databaseLocation(new URL(adminDatabaseUrl));
  if (!source.endsWith("\n") || source.includes("\r") || source.includes("\0")) {
    throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
  }
  const rows = source.slice(0, -1).split("\n");
  if (rows.length < 1 || rows.length > DEVELOPMENT_DATABASE_PRINCIPALS.length) {
    throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
  }
  const parsed = new Map<string, URL>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const separator = row.indexOf("=");
    if (separator < 1) throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    const environmentKey = row.slice(0, separator);
    const principal = DEVELOPMENT_DATABASE_PRINCIPALS[index];
    if (principal === undefined || environmentKey !== principal.environmentKey
      || parsed.has(environmentKey)) {
      throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    }
    let value: URL;
    try {
      value = new URL(row.slice(separator + 1));
    } catch {
      throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    }
    if (value.username !== principal.roleName || value.password.length < 32
      || databaseLocation(value) !== expectedLocation) {
      throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    }
    parsed.set(environmentKey, value);
  }
  if (requireComplete && parsed.size !== DEVELOPMENT_DATABASE_PRINCIPALS.length) {
    throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
  }
  return parsed;
}

async function ensureCredentialFile(
  credentialFilePath: string,
  adminDatabaseUrl: string
): Promise<ReadonlyMap<string, URL>> {
  const resolvedPath = resolve(credentialFilePath);
  const credentialRoot = dirname(resolvedPath);
  await mkdir(credentialRoot, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const rootIdentity = await assertCredentialRoot(credentialRoot);
  // The shared custody-mode policy (B4 resolver) is applied as well: it refuses
  // drift instead of narrowing a mode back, which would hide the exposure event
  // (L7-F10). assertCredentialRoot above holds the same floor and additionally
  // yields the identity the later re-checks bind to.
  await assertDevCustodyDirectory(credentialRoot);

  const initialStatus = await lstat(resolvedPath).catch((error: unknown) => {
    if (isMissingFileError(error)) return null;
    throw error;
  });
  if (initialStatus !== null) {
    if (initialStatus.isSymbolicLink()) {
      throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    }
    assertCredentialMetadata(initialStatus);
  } else {
    try {
      const handle = await open(
        resolvedPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
          | (constants.O_NOFOLLOW ?? 0),
        PRIVATE_FILE_MODE
      );
      try {
        await handle.writeFile(credentialSource(adminDatabaseUrl), { encoding: "utf8" });
        await handle.sync();
        assertCredentialMetadata(await handle.stat());
      } finally {
        await handle.close();
      }
    } catch (createError) {
      if (!isExistingFileError(createError)) throw createError;
    }
  }
  const opened = await readCredentialFile(
    resolvedPath,
    credentialRoot,
    rootIdentity,
    initialStatus === null ? undefined : identity(initialStatus)
  );
  const existingSource = opened.source;
  const existing = readCredentials(existingSource, adminDatabaseUrl, false);
  const missing = DEVELOPMENT_DATABASE_PRINCIPALS.filter(
    ({ environmentKey }) => !existing.has(environmentKey)
  );
  if (missing.length > 0) {
    const isExactLegacyFile = LEGACY_DEVELOPMENT_DATABASE_ENVIRONMENT_KEY_SETS.some(
      (environmentKeys) => existing.size === environmentKeys.length
        && environmentKeys.every((environmentKey) => existing.has(environmentKey))
    );
    if (!isExactLegacyFile) {
      throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    }
    const replacementPath = `${resolvedPath}.${randomBytes(16).toString("hex")}.tmp`;
    const handle = await open(
      replacementPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600
    );
    try {
      try {
        await handle.writeFile(
          existingSource + credentialSource(adminDatabaseUrl, missing),
          { encoding: "utf8" }
        );
        await handle.sync();
        assertCredentialMetadata(await handle.stat());
      } finally {
        await handle.close();
      }
      await assertCredentialRoot(credentialRoot, rootIdentity);
      const targetStatus = await lstat(resolvedPath).catch(() => null);
      if (targetStatus === null) throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
      assertCredentialMetadata(targetStatus);
      if (!hasIdentity(targetStatus, opened.identity)) {
        throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
      }
      await assertCredentialRoot(credentialRoot, rootIdentity);
      await rename(replacementPath, resolvedPath);
    } finally {
      await unlink(replacementPath).catch((error: unknown) => {
        if (!isMissingFileError(error)) throw error;
      });
    }
  }
  return readCredentials((await readCredentialFile(
    resolvedPath,
    credentialRoot,
    rootIdentity
  )).source, adminDatabaseUrl);
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isExistingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

async function assertAdmin(client: PoolClient): Promise<void> {
  const witness = (await client.query<{
    session_principal: string;
    principal: string;
    rolsuper: boolean;
  }>(`
    SELECT session_user AS session_principal,current_user AS principal,role.rolsuper
    FROM pg_catalog.pg_roles AS role WHERE role.rolname=current_user
  `)).rows[0];
  if (witness === undefined || !witness.rolsuper
    || witness.session_principal !== witness.principal) {
    throw new TypeError("DEV_DATABASE_PRINCIPAL_ADMIN_REQUIRED");
  }
}

async function assertCapabilityRoles(client: PoolClient): Promise<void> {
  const expected = [...new Set(
    DEVELOPMENT_DATABASE_PRINCIPALS.map(({ capabilityRole }) => capabilityRole)
  )].sort();
  const roles = await client.query<{
    rolname: string;
    rolcanlogin: boolean;
    rolsuper: boolean;
    dangerous_builtin_member: boolean;
    direct_roles: string[];
  }>(`
    SELECT target.rolname,target.rolcanlogin,target.rolsuper,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS elevated
        WHERE left(elevated.rolname,3)='pg_'
          AND pg_has_role(target.oid,elevated.oid,'MEMBER')
      ) AS dangerous_builtin_member,
      COALESCE((
        SELECT jsonb_agg(parent.rolname ORDER BY parent.rolname)
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS parent ON parent.oid=membership.roleid
        WHERE membership.member=target.oid
      ),'[]'::jsonb) AS direct_roles
    FROM pg_catalog.pg_roles AS target
    WHERE target.rolname=ANY($1::text[])
    ORDER BY target.rolname
  `,[expected]);
  if (roles.rows.length !== expected.length
    || roles.rows.some((role, index) => {
      const expectedDirect = role.rolname === "debateai_authorization_runtime"
        || role.rolname === "debateai_billing_runtime"
        ? ["debateai_runtime"] : [];
      return role.rolname !== expected[index] || role.rolcanlogin || role.rolsuper
        || role.dangerous_builtin_member
        || JSON.stringify(role.direct_roles) !== JSON.stringify(expectedDirect);
    })) {
    throw new TypeError("DEV_DATABASE_CAPABILITY_ROLES_INVALID");
  }
}

async function formattedPasswordStatement(
  client: PoolClient,
  roleName: string,
  password: string
): Promise<string> {
  const statement = (await client.query<{ statement: string }>(`
    SELECT format(
      'ALTER ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT -1 PASSWORD %L VALID UNTIL %L',
      $1::text,$2::text,'infinity'
    ) AS statement
  `,[roleName,password])).rows[0]?.statement;
  if (statement === undefined) throw new TypeError("DEV_DATABASE_PASSWORD_STATEMENT_FAILED");
  return statement;
}

async function provisionPrincipal(
  client: PoolClient,
  principal: DevelopmentDatabasePrincipal,
  databaseUrl: URL
): Promise<void> {
  const roleName = quoteIdentifier(principal.roleName);
  const capabilityRole = quoteIdentifier(principal.capabilityRole);
  const exists = (await client.query<{ exists: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1) AS exists",
    [principal.roleName]
  )).rows[0]?.exists;
  if (!exists) {
    await client.query(`CREATE ROLE ${roleName} NOLOGIN`);
    await client.query(await formattedPasswordStatement(client, principal.roleName, databaseUrl.password));
    await client.query(`GRANT ${capabilityRole} TO ${roleName} WITH INHERIT TRUE, SET TRUE`);
    if (principal.crossAccountRole !== undefined) {
      await client.query(
        `GRANT ${quoteIdentifier(principal.crossAccountRole)} TO ${roleName} WITH INHERIT TRUE, SET TRUE`
      );
    }
    return;
  }
  await client.query(await formattedPasswordStatement(client, principal.roleName, databaseUrl.password));
}

function expectedDirectRoles(principal: DevelopmentDatabasePrincipal): readonly string[] {
  return [
    principal.capabilityRole,
    ...(principal.crossAccountRole === undefined ? [] : [principal.crossAccountRole])
  ].sort();
}

async function assertExistingPrincipalState(client: PoolClient): Promise<void> {
  const expected = new Map<string, readonly string[]>(DEVELOPMENT_DATABASE_PRINCIPALS
    .map((principal) => [principal.roleName, expectedDirectRoles(principal)]));
  const roles = await client.query<{
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
    direct_roles: Array<Readonly<{
      roleName: string;
      adminOption: boolean;
      inheritOption: boolean;
      setOption: boolean;
    }>>;
  }>(`
    SELECT target.rolname,target.rolcanlogin,target.rolinherit,target.rolsuper,
      target.rolcreatedb,target.rolcreaterole,target.rolreplication,target.rolbypassrls,
      target.rolconnlimit,target.rolconfig,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'roleName',capability.rolname,
          'adminOption',membership.admin_option,
          'inheritOption',membership.inherit_option,
          'setOption',membership.set_option
        ) ORDER BY capability.rolname)
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS capability ON capability.oid=membership.roleid
        WHERE membership.member=target.oid
      ),'[]'::jsonb) AS direct_roles
    FROM pg_catalog.pg_roles AS target WHERE target.rolname=ANY($1::text[])
    ORDER BY target.rolname
  `,[[...expected.keys()]]);
  if (roles.rows.some((role) => {
    const expectedRoles = expected.get(role.rolname) ?? [];
    return !role.rolcanlogin || !role.rolinherit
      || role.rolsuper || role.rolcreatedb || role.rolcreaterole
      || role.rolreplication || role.rolbypassrls || role.rolconnlimit !== -1
      || role.rolconfig !== null || role.direct_roles.length !== expectedRoles.length
      || role.direct_roles.some((directRole, index) => directRole.roleName !== expectedRoles[index]
        || directRole.adminOption || !directRole.inheritOption || !directRole.setOption);
  })) {
    throw new TypeError("DEV_DATABASE_PRINCIPAL_DRIFT");
  }
}

/**
 * Go-live row 41 (migration 0093): a development database provisioned before 0093 gave
 * debateai_dev_runtime debateai_runtime itself. That exact earlier shape, and nothing else, moves
 * to billing's role (which inherits debateai_runtime); any other membership is still drift.
 */
async function upgradePreBillingRuntimeMembership(client: PoolClient): Promise<void> {
  const legacy = (await client.query<{ legacy: boolean }>(`
    SELECT COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'roleName',capability.rolname,
        'adminOption',membership.admin_option,
        'inheritOption',membership.inherit_option,
        'setOption',membership.set_option
      ))
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS target ON target.oid=membership.member
      JOIN pg_catalog.pg_roles AS capability ON capability.oid=membership.roleid
      WHERE target.rolname='debateai_dev_runtime'
    ),'[]'::jsonb)='[{"roleName":"debateai_runtime","adminOption":false,"inheritOption":true,"setOption":true}]'::jsonb
      AS legacy
  `)).rows[0]?.legacy;
  if (legacy !== true) return;
  await client.query(
    "GRANT \"debateai_billing_runtime\" TO \"debateai_dev_runtime\" WITH INHERIT TRUE, SET TRUE"
  );
  await client.query("REVOKE \"debateai_runtime\" FROM \"debateai_dev_runtime\"");
}

/**
 * Row-level security S01 (DECISIONS D46, D54): a development database provisioned before 0124 gave each existing
 * principal that now carries crossAccountRole (debateai_dev_liveness) only its capability role. That exact shape,
 * and nothing else, gains the marker with the capability role's option set; any other membership is still drift.
 */
async function upgradePreRlsMarkerMembership(client: PoolClient): Promise<void> {
  for (const principal of DEVELOPMENT_DATABASE_PRINCIPALS as readonly DevelopmentDatabasePrincipal[]) {
    if (principal.crossAccountRole === undefined) continue;
    const legacy = (await client.query<{ legacy: boolean }>(`
      SELECT COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'roleName',capability.rolname,
          'adminOption',membership.admin_option,
          'inheritOption',membership.inherit_option,
          'setOption',membership.set_option
        ))
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS target ON target.oid=membership.member
        JOIN pg_catalog.pg_roles AS capability ON capability.oid=membership.roleid
        WHERE target.rolname=$1
      ),'[]'::jsonb)=jsonb_build_array(jsonb_build_object(
        'roleName',$2::text,'adminOption',false,'inheritOption',true,'setOption',true
      )) AS legacy
    `,[principal.roleName, principal.capabilityRole])).rows[0]?.legacy;
    if (legacy !== true) continue;
    await client.query(
      `GRANT ${quoteIdentifier(principal.crossAccountRole)} TO ${quoteIdentifier(principal.roleName)} `
      + "WITH INHERIT TRUE, SET TRUE"
    );
  }
}

async function assertNoPrincipalMembers(client: PoolClient): Promise<void> {
  const roleNames = DEVELOPMENT_DATABASE_PRINCIPALS.map(({ roleName }) => roleName);
  const hasMembers = (await client.query<{ has_members: boolean }>(`
    SELECT EXISTS(
      SELECT 1 FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS target ON target.oid=membership.roleid
      WHERE target.rolname=ANY($1::text[])
    ) AS has_members
  `,[roleNames])).rows[0]?.has_members;
  if (hasMembers !== false) throw new TypeError("DEV_DATABASE_PRINCIPAL_MEMBERS_INVALID");
}

async function assertNoOwnership(client: PoolClient): Promise<void> {
  const roleNames = DEVELOPMENT_DATABASE_PRINCIPALS.map(({ roleName }) => roleName);
  const ownership = (await client.query<{ owned: boolean }>(`
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
  if (ownership !== false) throw new TypeError("DEV_DATABASE_PRINCIPAL_OWNERSHIP_INVALID");
}

export async function provisionDevelopmentDatabasePrincipals(
  input: ProvisionDevelopmentDatabasePrincipalsInput
): Promise<DevelopmentDatabasePrincipalReceipt> {
  const credentialFilePath = resolve(input.credentialFilePath);
  const client = await input.adminPool.connect();
  try {
    await assertAdmin(client);
    await client.query("BEGIN");
    try {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('debateai:dev-database-principals',0))"
      );
      await assertCapabilityRoles(client);
      await assertNoPrincipalMembers(client);
      await upgradePreBillingRuntimeMembership(client);
      await upgradePreRlsMarkerMembership(client);
      await assertExistingPrincipalState(client);
      await assertNoOwnership(client);
      const credentials = await ensureCredentialFile(
        credentialFilePath, input.adminDatabaseUrl
      );
      await client.query("SET LOCAL password_encryption='scram-sha-256'");
      for (const principal of DEVELOPMENT_DATABASE_PRINCIPALS) {
        await provisionPrincipal(client, principal, credentials.get(principal.environmentKey)!);
      }
      await assertNoPrincipalMembers(client);
      await assertExistingPrincipalState(client);
      await assertNoOwnership(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  } finally {
    client.release();
  }
  return Object.freeze({
    credentialFilePath,
    principalCount: DEVELOPMENT_DATABASE_PRINCIPALS.length
  });
}
