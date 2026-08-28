import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Pool, PoolClient } from "pg";

export type DevelopmentDatabasePrincipal = Readonly<{
  roleName: string;
  capabilityRole: string;
  environmentKey: string;
}>;

export const DEVELOPMENT_DATABASE_PRINCIPALS = Object.freeze([
  Object.freeze({
    roleName: "debateai_dev_runtime",
    capabilityRole: "debateai_runtime",
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
    environmentKey: "LIVENESS_DATABASE_URL"
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

function quoteIdentifier(value: string): string {
  if (!ROLE_NAME_PATTERN.test(value)) throw new TypeError("DEV_DATABASE_ROLE_NAME_INVALID");
  return `"${value}"`;
}

function databaseLocation(url: URL): string {
  const copy = new URL(url);
  copy.username = "";
  copy.password = "";
  return copy.toString();
}

function credentialSource(adminDatabaseUrl: string): string {
  const admin = new URL(adminDatabaseUrl);
  if (admin.protocol !== "postgres:" && admin.protocol !== "postgresql:") {
    throw new TypeError("DEV_DATABASE_ADMIN_URL_INVALID");
  }
  return DEVELOPMENT_DATABASE_PRINCIPALS.map((principal) => {
    const url = new URL(admin);
    url.username = principal.roleName;
    url.password = randomBytes(32).toString("base64url");
    return `${principal.environmentKey}=${url.toString()}`;
  }).join("\n") + "\n";
}

function readCredentials(source: string, adminDatabaseUrl: string): ReadonlyMap<string, URL> {
  const expectedLocation = databaseLocation(new URL(adminDatabaseUrl));
  const rows = source.endsWith("\n") ? source.slice(0, -1).split("\n") : source.split("\n");
  if (rows.length !== DEVELOPMENT_DATABASE_PRINCIPALS.length) {
    throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
  }
  const parsed = new Map<string, URL>();
  for (const row of rows) {
    const separator = row.indexOf("=");
    if (separator < 1) throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    const environmentKey = row.slice(0, separator);
    if (parsed.has(environmentKey)) throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    const value = new URL(row.slice(separator + 1));
    parsed.set(environmentKey, value);
  }
  for (const principal of DEVELOPMENT_DATABASE_PRINCIPALS) {
    const url = parsed.get(principal.environmentKey);
    if (url === undefined || url.username !== principal.roleName || url.password.length < 32
      || databaseLocation(url) !== expectedLocation) {
      throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    }
  }
  return parsed;
}

async function ensureCredentialFile(
  credentialFilePath: string,
  adminDatabaseUrl: string
): Promise<ReadonlyMap<string, URL>> {
  const resolvedPath = resolve(credentialFilePath);
  const credentialRoot = dirname(resolvedPath);
  await mkdir(credentialRoot, { recursive: true, mode: 0o700 });
  const rootStatus = await lstat(credentialRoot);
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) {
    throw new TypeError("DEV_DATABASE_CREDENTIAL_ROOT_INVALID");
  }
  await chmod(credentialRoot, 0o700);

  try {
    const fileStatus = await lstat(resolvedPath);
    if (fileStatus.isSymbolicLink() || !fileStatus.isFile()) {
      throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    try {
      const handle = await open(resolvedPath, "wx", 0o600);
      try {
        await handle.writeFile(credentialSource(adminDatabaseUrl), { encoding: "utf8" });
      } finally {
        await handle.close();
      }
    } catch (createError) {
      if (!isExistingFileError(createError)) throw createError;
    }
  }
  const finalStatus = await lstat(resolvedPath);
  if (finalStatus.isSymbolicLink() || !finalStatus.isFile()) {
    throw new TypeError("DEV_DATABASE_CREDENTIAL_FILE_INVALID");
  }
  await chmod(resolvedPath, 0o600);
  return readCredentials(await readFile(resolvedPath, "utf8"), adminDatabaseUrl);
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
    return;
  }
  await client.query(await formattedPasswordStatement(client, principal.roleName, databaseUrl.password));
}

async function assertExistingPrincipalState(client: PoolClient): Promise<void> {
  const expected = new Map<string, string>(DEVELOPMENT_DATABASE_PRINCIPALS
    .map((principal) => [principal.roleName, principal.capabilityRole]));
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
    const directRole = role.direct_roles[0];
    return !role.rolcanlogin || !role.rolinherit
      || role.rolsuper || role.rolcreatedb || role.rolcreaterole
      || role.rolreplication || role.rolbypassrls || role.rolconnlimit !== -1
      || role.rolconfig !== null || role.direct_roles.length !== 1
      || directRole === undefined || directRole.roleName !== expected.get(role.rolname)
      || directRole.adminOption || !directRole.inheritOption || !directRole.setOption;
  })) {
    throw new TypeError("DEV_DATABASE_PRINCIPAL_DRIFT");
  }
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
      await assertExistingPrincipalState(client);
      await assertNoOwnership(client);
      const credentials = await ensureCredentialFile(
        credentialFilePath, input.adminDatabaseUrl
      );
      await client.query("SET LOCAL password_encryption='scram-sha-256'");
      for (const principal of DEVELOPMENT_DATABASE_PRINCIPALS) {
        await provisionPrincipal(client, principal, credentials.get(principal.environmentKey)!);
      }
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
