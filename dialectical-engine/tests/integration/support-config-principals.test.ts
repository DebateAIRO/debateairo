import { Buffer } from "node:buffer";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createPool,
  migrate,
  type Pool
} from "../../packages/db/src/index.js";
import {
  DEVELOPMENT_DATABASE_PRINCIPALS,
  provisionDevelopmentDatabasePrincipals
} from "../../apps/runner/src/dev-database-principals.js";
import {
  DEVELOPMENT_API_ENVIRONMENT_KEYS,
  assembleDevelopmentApiEnvironment
} from "../../apps/runner/src/dev-api-environment.js";
import {
  createDevelopmentDeploymentRegisterMachineReceipt,
  writeDevelopmentDeploymentRegisterReceipt
} from "../../apps/runner/src/dev-deployment-register.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const LOCAL_ADMIN_DATABASE_URL =
  "postgresql://debateai:dev-only@127.0.0.1:55432/debateai";
const SUPPORT_KEY = "SUPPORT_CONFIG_OPERATOR_DATABASE_URL";
const SUPPORT_DATA_KEY = "SUPPORT_DATABASE_URL";
const SUPPORT_ROLE = "debateai_dev_support_config_operator";
const SUPPORT_DATA_ROLE = "debateai_dev_support";
const SUPPORT_CAPABILITY = "debateai_support_config_operator";
const PRODUCTION_SUPPORT_ROLE = "debateai_prod_support_config_operator";

let database: TestDatabase;
let repositoryRoot: string;
let custodyRoot: string;
let credentialFilePath: string;

function parseExactMaster(source: string): ReadonlyMap<string, string> {
  expect(source.endsWith("\n")).toBe(true);
  expect(source).not.toContain("\r");
  const rows = source.slice(0, -1).split("\n");
  expect(rows).toHaveLength(11);
  expect(rows.map((row) => row.slice(0, row.indexOf("="))))
    .toEqual(DEVELOPMENT_DATABASE_PRINCIPALS.map(({ environmentKey }) => environmentKey));
  return new Map(rows.map((row) => {
    const separator = row.indexOf("=");
    return [row.slice(0, separator), row.slice(separator + 1)];
  }));
}

function parseEnvironment(source: string): ReadonlyMap<string, string> {
  return new Map(source.trimEnd().split("\n").map((row) => {
    const separator = row.indexOf("=");
    return [row.slice(0, separator), row.slice(separator + 1)];
  }));
}

async function loadDevelopmentCredentials(path: string): Promise<Readonly<{ databaseUrl: string }>> {
  const module = await import("../../apps/runner/src/support-config-cli-credentials.js");
  return module.loadDevelopmentSupportConfigCliCredentials(path);
}

async function loadProductionCredentials(path: string): Promise<Readonly<{
  databaseUrl: string;
  validUntil: string;
}>> {
  const module = await import("../../apps/runner/src/support-config-cli-credentials.js");
  return module.loadProductionSupportConfigCliCredentials(path);
}

async function loadDevelopmentStatusCredentials(path: string): Promise<Readonly<{
  configurationDatabaseUrl: string;
  supportDatabaseUrl: string;
}>> {
  const module = await import("../../apps/runner/src/support-status-cli-credentials.js");
  return module.loadDevelopmentSupportStatusCliCredentials(path);
}

async function loadProductionStatusCredentials(path: string): Promise<Readonly<{
  supportDatabaseUrl: string;
}>> {
  const module = await import("../../apps/runner/src/support-status-cli-credentials.js");
  return module.loadProductionSupportStatusCliCredentials(path);
}

async function prepareCustodyRoot(): Promise<void> {
  const localRoot = join(repositoryRoot, ".local");
  custodyRoot = join(localRoot, "dev-auth");
  await mkdir(localRoot, { mode: 0o700 });
  await mkdir(custodyRoot, { mode: 0o700 });
  await Promise.all([
    mkdir(join(custodyRoot, "secrets"), { mode: 0o700 }),
    mkdir(join(custodyRoot, "audit-keys"), { mode: 0o700 }),
    mkdir(join(custodyRoot, "user-deks"), { mode: 0o700 }),
    mkdir(join(custodyRoot, "publication-keys"), { mode: 0o700 }),
    mkdir(join(custodyRoot, "mail"), { mode: 0o700 })
  ]);
  await Promise.all([
    writeFile(join(custodyRoot, "secrets", "kek.bin"), Buffer.alloc(32, 1), { mode: 0o600 }),
    writeFile(join(custodyRoot, "secrets", "support-kek.bin"), Buffer.alloc(32, 5), { mode: 0o600 }),
    writeFile(join(custodyRoot, "secrets", "corpus-kek.bin"), Buffer.alloc(32, 2), { mode: 0o600 }),
    writeFile(join(custodyRoot, "secrets", "blind-index-key.bin"), Buffer.alloc(32, 3), { mode: 0o600 }),
    writeFile(join(custodyRoot, "secrets", "audit-source-ip-salt.bin"), Buffer.alloc(32, 4), { mode: 0o600 }),
    writeFile(join(custodyRoot, "hatchet.env"),
      "HATCHET_CLIENT_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJzZXJ2ZXJfdXJsIjoiaHR0cDovL2xvY2FsaG9zdDo4ODg4IiwiZ3JwY19icm9hZGNhc3RfYWRkcmVzcyI6ImxvY2FsaG9zdDo3MDc3In0.test-signature\n",
      { mode: 0o600 })
  ]);
  await writeDevelopmentDeploymentRegisterReceipt(
    repositoryRoot,
    createDevelopmentDeploymentRegisterMachineReceipt({
      registerVersion: "424242" as never,
      rowCount: 32,
      snapshotSha256: "a".repeat(64)
    })
  );
  credentialFilePath = join(custodyRoot, "database-principals.env");
}

function loginUrlFor(databaseUrl: string): string {
  const credential = new URL(databaseUrl);
  const login = new URL(database.connectionString);
  login.username = credential.username;
  login.password = credential.password;
  return login.toString();
}

describe("REGISTER-SUPPORT-PUBLICATION development operator principal", () => {
  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-support-principal-"));
    await prepareCustodyRoot();
    await provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: LOCAL_ADMIN_DATABASE_URL,
      credentialFilePath
    });
  }, 120_000);

  afterAll(async () => {
    await database?.stop();
    if (repositoryRoot !== undefined) {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("credential privacy: one eleven-row master file feeds only the dedicated loaders", async () => {
    await expect(provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: LOCAL_ADMIN_DATABASE_URL,
      credentialFilePath
    })).resolves.toEqual({ credentialFilePath, principalCount: 11 });

    const masterSource = await readFile(credentialFilePath, "utf8");
    const master = parseExactMaster(masterSource);
    const supportDatabaseUrl = master.get(SUPPORT_KEY)!;
    const supportDataDatabaseUrl = master.get(SUPPORT_DATA_KEY)!;
    expect(new URL(supportDatabaseUrl)).toMatchObject({
      hostname: "127.0.0.1",
      port: "55432",
      pathname: "/debateai",
      username: SUPPORT_ROLE
    });
    await expect(loadDevelopmentCredentials(credentialFilePath))
      .resolves.toEqual({ databaseUrl: supportDatabaseUrl });
    await expect(loadDevelopmentStatusCredentials(credentialFilePath)).resolves.toEqual({
      configurationDatabaseUrl: supportDatabaseUrl,
      supportDatabaseUrl: supportDataDatabaseUrl
    });
    expect(new URL(supportDataDatabaseUrl).username).toBe(SUPPORT_DATA_ROLE);
    expect(supportDataDatabaseUrl).not.toBe(supportDatabaseUrl);

    const receipt = await assembleDevelopmentApiEnvironment({
      repositoryRoot,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      supportModelTarget: JSON.stringify({
        provider_ref: "development:hermes-glm-5.3-flash",
        base_url: "http://127.0.0.1:8794/v1",
        model: "z-ai/glm-5.3-flash",
        authorization_header: "Bearer support-test"
      }),
      registerReceipt: createDevelopmentDeploymentRegisterMachineReceipt({
        registerVersion: "424242" as never,
        rowCount: 32,
        snapshotSha256: "a".repeat(64)
      })
    });
    const apiSource = await readFile(join(custodyRoot, "api.env"), "utf8");
    const apiEnvironment = parseEnvironment(apiSource);
    expect([...apiEnvironment.keys()]).toEqual(DEVELOPMENT_API_ENVIRONMENT_KEYS);
    expect(JSON.stringify(receipt)).not.toContain(SUPPORT_KEY);
    expect(JSON.stringify(receipt)).not.toContain(supportDatabaseUrl);
    expect(apiSource).not.toContain(SUPPORT_KEY);
    expect(apiSource).not.toContain(supportDatabaseUrl);
  }, 120_000);

  it("opens development initialization writes on one bounded five-second pool", async () => {
    const module = await import("../../apps/runner/src/support-config-cli-credentials.js");
    const pool = await module.createDevelopmentSupportConfigInitializationPool(
      credentialFilePath
    );
    try {
      const options = (pool as unknown as {
        options: Readonly<Record<string, unknown>>;
      }).options;
      expect(options).toMatchObject({
        max: 1,
        connectionTimeoutMillis: 5_000,
        statement_timeout: 5_000,
        query_timeout: 5_000
      });
    } finally {
      await pool.end();
    }
  });

  it("gives the operator LOGIN only its support publish and status capability", async () => {
    const master = parseExactMaster(await readFile(credentialFilePath, "utf8"));
    const operatorPool = createPool(loginUrlFor(master.get(SUPPORT_KEY)!));
    try {
      const role = (await operatorPool.query<{
        roleName: string;
        canLogin: boolean;
        inherit: boolean;
        superuser: boolean;
        createDatabase: boolean;
        createRole: boolean;
        replication: boolean;
        bypassRls: boolean;
        connectionLimit: number;
        settings: string[] | null;
        directRoles: Array<Readonly<{
          roleName: string;
          adminOption: boolean;
          inheritOption: boolean;
          setOption: boolean;
        }>>;
        members: number;
      }>(`
        SELECT target.rolname AS "roleName",target.rolcanlogin AS "canLogin",
          target.rolinherit AS inherit,target.rolsuper AS superuser,
          target.rolcreatedb AS "createDatabase",target.rolcreaterole AS "createRole",
          target.rolreplication AS replication,target.rolbypassrls AS "bypassRls",
          target.rolconnlimit AS "connectionLimit",target.rolconfig AS settings,
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
          (SELECT count(*)::integer FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid=target.oid) AS members
        FROM pg_catalog.pg_roles AS target WHERE target.rolname=current_user
      `)).rows[0];
      expect(role).toEqual({
        roleName: SUPPORT_ROLE,
        canLogin: true,
        inherit: true,
        superuser: false,
        createDatabase: false,
        createRole: false,
        replication: false,
        bypassRls: false,
        connectionLimit: -1,
        settings: null,
        directRoles: [{
          roleName: SUPPORT_CAPABILITY,
          adminOption: false,
          inheritOption: true,
          setOption: true
        }],
        members: 0
      });

      const capabilityRoles = [...new Set(
        DEVELOPMENT_DATABASE_PRINCIPALS.map(({ capabilityRole }) => capabilityRole)
      )].sort();
      const effective = await operatorPool.query<{ roleName: string; member: boolean }>(`
        SELECT role_name AS "roleName",pg_has_role(current_user,role_name,'MEMBER') AS member
        FROM unnest($1::text[]) AS expected(role_name) ORDER BY role_name
      `, [capabilityRoles]);
      expect(effective.rows.filter(({ member }) => member))
        .toEqual([{ roleName: SUPPORT_CAPABILITY, member: true }]);

      const executable = await operatorPool.query<{
        signature: string;
        operatorAllowed: boolean;
        capabilityAllowed: boolean;
        publicAllowed: boolean;
        operatorDirect: boolean;
        capabilityDirect: boolean;
      }>(`
        SELECT function.oid::regprocedure::text AS signature,
          has_function_privilege(current_user,function.oid,'EXECUTE') AS "operatorAllowed",
          has_function_privilege($1::text,function.oid,'EXECUTE') AS "capabilityAllowed",
          EXISTS(
            SELECT 1
            FROM pg_catalog.aclexplode(coalesce(
              function.proacl,
              pg_catalog.acldefault('f',function.proowner)
            )) AS privilege
            WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
          ) AS "publicAllowed",
          EXISTS(
            SELECT 1
            FROM pg_catalog.aclexplode(coalesce(
              function.proacl,
              pg_catalog.acldefault('f',function.proowner)
            )) AS privilege
            WHERE privilege.grantee=(
              SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user
            ) AND privilege.privilege_type='EXECUTE'
          ) AS "operatorDirect",
          EXISTS(
            SELECT 1
            FROM pg_catalog.aclexplode(coalesce(
              function.proacl,
              pg_catalog.acldefault('f',function.proowner)
            )) AS privilege
            WHERE privilege.grantee=$1::regrole AND privilege.privilege_type='EXECUTE'
          ) AS "capabilityDirect"
        FROM pg_catalog.pg_proc AS function
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=function.pronamespace
        WHERE namespace.nspname='register'
        ORDER BY function.oid::regprocedure::text
      `, [SUPPORT_CAPABILITY]);
      expect(executable.rows.filter(({ operatorAllowed }) => operatorAllowed))
        .toEqual([
          {
            signature:
              "register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)",
            operatorAllowed: true,
            capabilityAllowed: true,
            publicAllowed: false,
            operatorDirect: false,
            capabilityDirect: true
          },
          {
            signature: "register.read_support_configuration_status()",
            operatorAllowed: true,
            capabilityAllowed: true,
            publicAllowed: false,
            operatorDirect: false,
            capabilityDirect: true
          }
      ]);
      expect(executable.rows.every(({ operatorAllowed, capabilityAllowed }) =>
        operatorAllowed === capabilityAllowed
      )).toBe(true);
      expect(executable.rows.filter(({ publicAllowed }) => publicAllowed)).toEqual([]);
      expect(executable.rows.filter(({ operatorDirect }) => operatorDirect)).toEqual([]);
      expect(executable.rows.filter(({ capabilityDirect }) => capabilityDirect)
        .map(({ signature }) => signature)).toEqual([
          "register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)",
          "register.read_support_configuration_status()"
        ]);
      await expect(operatorPool.query("SELECT * FROM register.read_support_configuration_status()"))
        .resolves.toMatchObject({ command: "SELECT" });
      await expect(operatorPool.query("SELECT register.allocate_register_version()"))
        .rejects.toMatchObject({ code: "42501" });
      await expect(operatorPool.query(
        "SELECT register.publish_register_version(NULL::uuid,'v'::char,0::bigint,'{}'::jsonb,'test')"
      )).rejects.toMatchObject({ code: "42501" });
      await expect(operatorPool.query("SELECT * FROM register.register_version LIMIT 1"))
        .rejects.toMatchObject({ code: "42501" });

      const relationPrivileges = await operatorPool.query<{
        relation: string;
        selectPrivilege: boolean;
        insertPrivilege: boolean;
        updatePrivilege: boolean;
        deletePrivilege: boolean;
      }>(`
        SELECT relation.oid::regclass::text AS relation,
          has_table_privilege(current_user,relation.oid,'SELECT') AS "selectPrivilege",
          has_table_privilege(current_user,relation.oid,'INSERT') AS "insertPrivilege",
          has_table_privilege(current_user,relation.oid,'UPDATE') AS "updatePrivilege",
          has_table_privilege(current_user,relation.oid,'DELETE') AS "deletePrivilege"
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='register' AND relation.relkind IN ('r','p','v','m')
      `);
      expect(relationPrivileges.rows.every((row) =>
        !row.selectPrivilege && !row.insertPrivilege && !row.updatePrivilege && !row.deletePrivilege
      )).toBe(true);
      const sequencePrivileges = await operatorPool.query<{
        usage: boolean;
        selectPrivilege: boolean;
        updatePrivilege: boolean;
      }>(`
        SELECT has_sequence_privilege(current_user,sequence.oid,'USAGE') AS usage,
          has_sequence_privilege(current_user,sequence.oid,'SELECT') AS "selectPrivilege",
          has_sequence_privilege(current_user,sequence.oid,'UPDATE') AS "updatePrivilege"
        FROM pg_catalog.pg_class AS sequence
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=sequence.relnamespace
        WHERE namespace.nspname='register' AND sequence.relkind='S'
      `);
      expect(sequencePrivileges.rows).not.toHaveLength(0);
      expect(sequencePrivileges.rows.every((row) =>
        !row.usage && !row.selectPrivilege && !row.updatePrivilege
      )).toBe(true);
    } finally {
      await operatorPool.end();
    }

    const ownership = await database.pool.query<{ owned: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM pg_catalog.pg_database WHERE datdba=$1::regrole
        UNION ALL SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner=$1::regrole
        UNION ALL SELECT 1 FROM pg_catalog.pg_class WHERE relowner=$1::regrole
        UNION ALL SELECT 1 FROM pg_catalog.pg_proc WHERE proowner=$1::regrole
      ) AS owned
    `, [SUPPORT_ROLE]);
    expect(ownership.rows[0]?.owned).toBe(false);
  }, 120_000);

  it("denies the legacy constraint helper through the generated support URL", async () => {
    const master = parseExactMaster(await readFile(credentialFilePath, "utf8"));
    const operatorPool = createPool(loginUrlFor(master.get(SUPPORT_KEY)!));
    try {
      await expect(operatorPool.query(
        "SELECT register.claim_type_composition_map_is_valid('{}'::jsonb)"
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await operatorPool.end();
    }
  });

  it("keeps the legacy row constraint enforceable inside the closed owner publisher", async () => {
    const rowKey = "claimTypeCompositionMap";
    const valueJsonText = '{"entries":{},"kind":"WRONG"}';
    const sourceRef = "fixture:invalid-composition-map";
    const hash = (await database.pool.query<{ hash: string }>(`
      SELECT pg_catalog.encode(audit_crypto_internal.digest(
        register._lp($1::text) || register._lp($2::text) || register._lp($3::text),
        'sha256'
      ),'hex') AS hash
    `, [rowKey, valueJsonText, sourceRef])).rows[0]!.hash;
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      // DB1 / DL5-F4 (migrations/0065_security_delta_guards.sql §3) revoked the
      // surplus import/publish EXECUTE from debateai_runtime — it has held no
      // INSERT on register.register_row since 0055:2019, so it could never have
      // reached the CHECK. The closed owner publisher named in this test's title
      // is the role that actually carries the constraint.
      await client.query("SET LOCAL ROLE debateai_register_publication_owner");
      await expect(client.query(`
        SELECT * FROM register.import_historical_register_version(
          4,
          $1::jsonb,
          $2::char(64)
        )
      `, [JSON.stringify([{ row_key: rowKey, value_json_text: valueJsonText, source_ref: sourceRef }]), hash]))
        .rejects.toThrow(/register_row_claim_type_composition_map_shape/u);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("rejects support membership drift and roles that have members", async () => {
    await database.pool.query(
      "GRANT debateai_runtime TO debateai_dev_support_config_operator"
    );
    await expect(provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: LOCAL_ADMIN_DATABASE_URL,
      credentialFilePath
    })).rejects.toThrow("DEV_DATABASE_PRINCIPAL_DRIFT");
    await database.pool.query(
      "REVOKE debateai_runtime FROM debateai_dev_support_config_operator"
    );
    await database.pool.query(`
      CREATE ROLE debateai_dev_support_config_member NOLOGIN;
      GRANT debateai_dev_support_config_operator TO debateai_dev_support_config_member
    `);
    await expect(provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: LOCAL_ADMIN_DATABASE_URL,
      credentialFilePath
    })).rejects.toThrow("DEV_DATABASE_PRINCIPAL_MEMBERS_INVALID");
    await database.pool.query(`
      REVOKE debateai_dev_support_config_operator FROM debateai_dev_support_config_member;
      DROP ROLE debateai_dev_support_config_member
    `);
    await expect(provisionDevelopmentDatabasePrincipals({
      adminPool: database.pool,
      adminDatabaseUrl: LOCAL_ADMIN_DATABASE_URL,
      credentialFilePath
    })).resolves.toEqual({ credentialFilePath, principalCount: 11 });
  }, 120_000);

  it("rejects loader custody, exact-schema, ordering, and endpoint drift", async () => {
    const source = await readFile(credentialFilePath, "utf8");
    const root = await mkdtemp(join(tmpdir(), "debateai-support-loader-"));
    const file = join(root, "database-principals.env");
    try {
      await writeFile(file, source, { mode: 0o600 });

      const linked = join(root, "linked.env");
      await link(file, linked);
      await expect(loadDevelopmentCredentials(file))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      await rm(linked);

      const symbolic = join(root, "symbolic.env");
      await symlink(file, symbolic);
      await expect(loadDevelopmentCredentials(symbolic))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");

      await chmod(file, 0o640);
      await expect(loadDevelopmentCredentials(file))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      await chmod(file, 0o600);

      const actualUid = process.getuid?.();
      expect(actualUid).toBeTypeOf("number");
      const ownerSpy = vi.spyOn(process, "getuid").mockReturnValue(actualUid! + 1);
      await expect(loadDevelopmentCredentials(file))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      ownerSpy.mockRestore();

      await chmod(root, 0o755);
      await expect(loadDevelopmentCredentials(file))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      await chmod(root, 0o700);

      const rows = source.slice(0, -1).split("\n");
      const invalidSources = [
        `${source}EXTRA_DATABASE_URL=postgresql://extra:password@127.0.0.1:55432/debateai\n`,
        `${source}${rows[0]}\n`,
        `${[rows[1], rows[0], ...rows.slice(2)].join("\n")}\n`,
        `${rows.slice(0, -1).join("\n")}\n`
      ];
      for (const invalidSource of invalidSources) {
        await writeFile(file, invalidSource, { mode: 0o600 });
        await expect(loadDevelopmentCredentials(file))
          .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");
      }

      const supportUrl = parseExactMaster(source).get(SUPPORT_KEY)!;
      for (const invalidUrl of [
        supportUrl.replace("127.0.0.1:55432", "127.0.0.1:55433"),
        supportUrl.replace("127.0.0.1", "localhost"),
        supportUrl.replace("/debateai", "/other"),
        supportUrl.replace(SUPPORT_ROLE, "debateai_dev_runtime"),
        supportUrl.replace(/:[^:@/]+@/u, "@")
      ]) {
        await writeFile(file, source.replace(supportUrl, invalidUrl), { mode: 0o600 });
        await expect(loadDevelopmentCredentials(file))
          .rejects.toThrow("SUPPORT_CONFIG_DATABASE_URL_INVALID");
      }

      await writeFile(file, `${source}${"x".repeat(65 * 1024)}`, { mode: 0o600 });
      await expect(loadDevelopmentCredentials(file))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      expect((await lstat(file)).isFile()).toBe(true);
    } finally {
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps the production two-field parser disjoint from dev and rejects custody, fallback, and URL drift", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-prod-support-loader-"));
    const file = join(root, "support-config-operator.json");
    const developmentSource = await readFile(credentialFilePath, "utf8");
    const databaseUrl = new URL(database.connectionString);
    databaseUrl.username = PRODUCTION_SUPPORT_ROLE;
    databaseUrl.password = "production-support-test-password-abcdefghijklmnopqrstuvwxyz";
    databaseUrl.pathname = "/debateai";
    const validUntil = new Date(Date.now() + 10 * 60 * 1_000).toISOString();
    const exactSource = JSON.stringify({ databaseUrl: databaseUrl.toString(), validUntil });
    try {
      await writeFile(file, exactSource, { mode: 0o600 });
      await expect(loadProductionCredentials(file)).resolves.toEqual({
        databaseUrl: databaseUrl.toString(),
        validUntil
      });
      await expect(loadDevelopmentCredentials(file))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");

      await writeFile(file, developmentSource, { mode: 0o600 });
      await expect(loadProductionCredentials(file))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_FILE_INVALID");
      await writeFile(file, exactSource, { mode: 0o600 });

      const linked = join(root, "linked.json");
      await link(file, linked);
      await expect(loadProductionCredentials(file))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      await rm(linked);
      const symbolic = join(root, "symbolic.json");
      await symlink(file, symbolic);
      await expect(loadProductionCredentials(symbolic))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");

      await chmod(file, 0o640);
      await expect(loadProductionCredentials(file))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      await chmod(file, 0o600);
      await chmod(root, 0o755);
      await expect(loadProductionCredentials(file))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      await chmod(root, 0o700);

      const actualUid = process.getuid?.();
      expect(actualUid).toBeTypeOf("number");
      const ownerSpy = vi.spyOn(process, "getuid").mockReturnValue(actualUid! + 1);
      await expect(loadProductionCredentials(file))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
      ownerSpy.mockRestore();

      const mutatedUrls = [
        { ...JSON.parse(exactSource), extra: true },
        { databaseUrl: databaseUrl.toString() },
        { databaseUrl: databaseUrl.toString(), validUntil: "not-a-timestamp" },
        {
          databaseUrl: databaseUrl.toString(),
          validUntil: new Date(Date.now() - 1_000).toISOString()
        },
        {
          databaseUrl: databaseUrl.toString(),
          validUntil: new Date(Date.now() + 16 * 60 * 1_000).toISOString()
        },
        {
          databaseUrl: databaseUrl.toString().replace("/debateai", "/other"),
          validUntil
        },
        {
          databaseUrl: databaseUrl.toString().replace(PRODUCTION_SUPPORT_ROLE, "debateai_obs_human"),
          validUntil
        },
        {
          databaseUrl: databaseUrl.toString().replace(
            PRODUCTION_SUPPORT_ROLE,
            "debateai_prod_migrator"
          ),
          validUntil
        },
        {
          databaseUrl: databaseUrl.toString().replace(
            PRODUCTION_SUPPORT_ROLE,
            "debateai_prod_api_runtime"
          ),
          validUntil
        },
        {
          databaseUrl: databaseUrl.toString().replace(
            PRODUCTION_SUPPORT_ROLE,
            SUPPORT_ROLE
          ),
          validUntil
        },
        { databaseUrl: `${databaseUrl.toString()}?sslmode=disable`, validUntil },
        { databaseUrl: `${databaseUrl.toString()}#secret`, validUntil },
        {
          databaseUrl: databaseUrl.toString().replace(/:[^:@/]+@/u, "@"),
          validUntil
        }
      ];
      for (const invalid of mutatedUrls) {
        await writeFile(file, JSON.stringify(invalid), { mode: 0o600 });
        await expect(loadProductionCredentials(file)).rejects.toThrow();
      }

      await writeFile(file, `${exactSource}${"x".repeat(4 * 1024)}`, { mode: 0o600 });
      await expect(loadProductionCredentials(file))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");

      vi.stubEnv("MIGRATION_DATABASE_URL", database.connectionString);
      vi.stubEnv("DATABASE_URL", database.connectionString);
      vi.stubEnv("SUPPORT_CONFIG_OPERATOR_DATABASE_URL", databaseUrl.toString());
      await expect(loadProductionCredentials(join(root, "missing.json")))
        .rejects.toThrow("SUPPORT_CONFIG_CREDENTIAL_CUSTODY_INVALID");
    } finally {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts only a private exact one-entry v1 envelope for the production support data credential", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-prod-support-data-loader-"));
    const file = join(root, "api-support.json");
    const databaseUrl = new URL(database.connectionString);
    databaseUrl.username = "debateai_prod_api_support";
    databaseUrl.password = "production-api-support-test-password-abcdefghijklmnopqrstuvwxyz";
    databaseUrl.pathname = "/debateai";
    const exact = JSON.stringify({
      format: "debateai.production-database-principal-credentials.v1",
      credentials: [{ principalId: "api-support", databaseUrl: databaseUrl.toString() }]
    });
    try {
      await writeFile(file, exact, { mode: 0o600 });
      await expect(loadProductionStatusCredentials(file)).resolves.toEqual({
        supportDatabaseUrl: databaseUrl.toString()
      });
      for (const invalid of [
        `${exact}\n`,
        JSON.stringify({ ...JSON.parse(exact), extra: true }),
        JSON.stringify({
          format: "debateai.production-database-principal-credentials.v1",
          credentials: [{ principalId: "api-runtime", databaseUrl: databaseUrl.toString() }]
        }),
        JSON.stringify({
          format: "debateai.production-database-principal-credentials.v1",
          credentials: [{
            principalId: "api-support",
            databaseUrl: databaseUrl.toString().replace("debateai_prod_api_support", "debateai_prod_api_runtime")
          }]
        })
      ]) {
        await writeFile(file, invalid, { mode: 0o600 });
        await expect(loadProductionStatusCredentials(file)).rejects.toThrow();
      }
      await writeFile(file, exact);
      await chmod(file, 0o640);
      await expect(loadProductionStatusCredentials(file))
        .rejects.toThrow("SUPPORT_STATUS_CREDENTIAL_CUSTODY_INVALID");
      await chmod(file, 0o600);
      vi.stubEnv("SUPPORT_DATABASE_URL", databaseUrl.toString());
      await expect(loadProductionStatusCredentials(join(root, "missing.json")))
        .rejects.toThrow("SUPPORT_STATUS_CREDENTIAL_CUSTODY_INVALID");
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });
});
