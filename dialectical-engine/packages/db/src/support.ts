import type { Pool } from "pg";

export type SupportRepositoryRecord = Readonly<{
  sessionId: string;
  identityOwnerRef: string | null;
  language: "en" | "ro";
  state: "OPEN" | "LOCKED" | "CLOSED";
  kbVersion: string;
  createdAt: Date;
  consentOwnContextAt: Date | null;
}>;

export type SupportRepositoryStatus = Readonly<{
  callsToday: number;
  openSessions: number;
  newCases: number;
}>;

type SupportSessionRow = Readonly<{
  session_id: string;
  identity_owner_ref: string | null;
  language: "en" | "ro";
  state: "OPEN" | "LOCKED" | "CLOSED";
  kb_version: string;
  created_at: Date;
  consent_own_context_at: Date | null;
}>;

function record(row: SupportSessionRow): SupportRepositoryRecord {
  return Object.freeze({
    sessionId: row.session_id,
    identityOwnerRef: row.identity_owner_ref,
    language: row.language,
    state: row.state,
    kbVersion: row.kb_version,
    createdAt: row.created_at,
    consentOwnContextAt: row.consent_own_context_at
  });
}

/**
 * The support data-plane repository is deliberately structural: the database
 * package does not depend on the API package, while the API's closed port can
 * still accept this implementation without weakening the capability boundary.
 */
export class PostgresSupportRepository {
  constructor(readonly pool: Pool) {}

  async create(input: Readonly<{
    sessionId: string;
    tokenSha256: string;
    identityOwnerRef: string | null;
    language: "en" | "ro";
    kbVersion: string;
    createdAt: Date;
  }>): Promise<SupportRepositoryRecord> {
    const result = await this.pool.query<SupportSessionRow>(`
      INSERT INTO support.session(
        session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at
      ) VALUES($1,$2,$3,$4,'OPEN',$5,$6)
      RETURNING session_id,identity_owner_ref,language,state,kb_version,created_at,
        consent_own_context_at
    `, [
      input.sessionId,
      input.tokenSha256,
      input.identityOwnerRef,
      input.language,
      input.kbVersion,
      input.createdAt
    ]);
    const created = result.rows[0];
    if (created === undefined) throw new TypeError("SUPPORT_SESSION_CREATE_FAILED");
    return record(created);
  }

  async read(input: Readonly<{
    sessionId: string;
    tokenSha256: string;
  }>): Promise<SupportRepositoryRecord | null> {
    const result = await this.pool.query<SupportSessionRow>(`
      SELECT session_id,identity_owner_ref,language,state,kb_version,created_at,
        consent_own_context_at
      FROM support.session
      WHERE session_id=$1 AND session_token_sha256=$2
    `, [input.sessionId, input.tokenSha256]);
    return result.rows[0] === undefined ? null : record(result.rows[0]);
  }

  async status(): Promise<SupportRepositoryStatus> {
    const result = await this.pool.query<{
      calls_today: string;
      open_sessions: string;
      new_cases: string;
    }>(`
      SELECT
        (SELECT count(*) FROM support.message
          WHERE received_at >= date_trunc('day', statement_timestamp()))::text AS calls_today,
        (SELECT count(*) FROM support.session WHERE state='OPEN')::text AS open_sessions,
        (SELECT count(*) FROM support."case" WHERE state='NEW')::text AS new_cases
    `);
    const row = result.rows[0];
    if (row === undefined) throw new TypeError("SUPPORT_STATUS_READ_FAILED");
    return Object.freeze({
      callsToday: Number(row.calls_today),
      openSessions: Number(row.open_sessions),
      newCases: Number(row.new_cases)
    });
  }
}

type SupportRoleWitness = Readonly<{
  session_principal: string;
  principal: string;
  rolsuper: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
  support_member: boolean;
  forbidden_member: boolean;
  dangerous_builtin_member: boolean;
  owns_database_or_schema: boolean;
  direct_support_acl: boolean;
  direct_roles: string[];
  support_select_count: string;
  support_insert_count: string;
  support_forbidden_privilege: boolean;
  outside_table_privilege: boolean;
}>;

async function supportRoleWitness(pool: Pool): Promise<SupportRoleWitness | undefined> {
  return (await pool.query<SupportRoleWitness>(`
    SELECT session_user AS session_principal,current_user AS principal,
      role.rolsuper,role.rolcreaterole,role.rolcreatedb,role.rolreplication,
      role.rolbypassrls,
      pg_has_role(current_user,'debateai_support','USAGE') AS support_member,
      (pg_has_role(current_user,'debateai_runtime','MEMBER')
        OR pg_has_role(current_user,'debateai_support_config_operator','MEMBER')
        OR pg_has_role(current_user,'debateai_content_provision','MEMBER')
        OR pg_has_role(current_user,'debateai_authorization_runtime','MEMBER')
        OR pg_has_role(current_user,'debateai_erasure_runtime','MEMBER')
        OR pg_has_role(current_user,'debateai_publication_cleanup','MEMBER')) AS forbidden_member,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS elevated
        WHERE left(elevated.rolname,3)='pg_'
          AND (pg_has_role(current_user,elevated.oid,'MEMBER')
            OR pg_has_role(current_user,elevated.oid,'USAGE'))
      ) AS dangerous_builtin_member,
      (EXISTS (SELECT 1 FROM pg_catalog.pg_database AS database
          WHERE database.datname=current_database() AND database.datdba=role.oid)
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace AS namespace
          WHERE namespace.nspowner=role.oid)) AS owns_database_or_schema,
      (EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace AS namespace,
          LATERAL pg_catalog.aclexplode(COALESCE(
            namespace.nspacl,pg_catalog.acldefault('n',namespace.nspowner)
          )) AS privilege
        WHERE namespace.nspname='support' AND privilege.grantee=role.oid
      ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace,
          LATERAL pg_catalog.aclexplode(COALESCE(
            relation.relacl,pg_catalog.acldefault('r',relation.relowner)
          )) AS privilege
        WHERE namespace.nspname='support' AND relation.relkind IN ('r','p')
          AND privilege.grantee=role.oid
      )) AS direct_support_acl,
      COALESCE((
        SELECT jsonb_agg(parent.rolname ORDER BY parent.rolname)
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS parent ON parent.oid=membership.roleid
        WHERE membership.member=role.oid
      ),'[]'::jsonb) AS direct_roles,
      (SELECT count(*)::text FROM information_schema.tables AS table_row
        WHERE table_row.table_schema='support'
          AND table_row.table_type='BASE TABLE'
          AND has_table_privilege(current_user,
            format('%I.%I',table_row.table_schema,table_row.table_name),'SELECT'))
        AS support_select_count,
      (SELECT count(*)::text FROM information_schema.tables AS table_row
        WHERE table_row.table_schema='support'
          AND table_row.table_type='BASE TABLE'
          AND has_table_privilege(current_user,
            format('%I.%I',table_row.table_schema,table_row.table_name),'INSERT'))
        AS support_insert_count,
      EXISTS (SELECT 1 FROM information_schema.tables AS table_row
        WHERE table_row.table_schema='support'
          AND table_row.table_type='BASE TABLE'
          AND (has_table_privilege(current_user,
              format('%I.%I',table_row.table_schema,table_row.table_name),'UPDATE')
            OR has_table_privilege(current_user,
              format('%I.%I',table_row.table_schema,table_row.table_name),'DELETE')
            OR has_table_privilege(current_user,
              format('%I.%I',table_row.table_schema,table_row.table_name),'TRUNCATE')
            OR has_table_privilege(current_user,
              format('%I.%I',table_row.table_schema,table_row.table_name),'REFERENCES')
            OR has_table_privilege(current_user,
              format('%I.%I',table_row.table_schema,table_row.table_name),'TRIGGER')))
        AS support_forbidden_privilege,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE relation.relkind IN ('r','p','v','m','S','f')
          AND namespace.nspname NOT IN ('pg_catalog','information_schema','support')
          AND namespace.nspname !~ '^pg_toast'
          AND has_table_privilege(current_user,relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      ) AS outside_table_privilege
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname=current_user
  `)).rows[0];
}

/** Fail closed before the API begins accepting support traffic. */
export async function assertSupportDatabaseRole(
  runtimePool: Pool,
  supportPool: Pool
): Promise<void> {
  const [runtime, support] = await Promise.all([
    runtimePool.query<{
      support_member: boolean;
      support_schema_usage: boolean;
      support_structure_valid: boolean;
      support_table_privilege: boolean;
    }>(`
      WITH required(table_name) AS (VALUES
        ('session'),('message'),('abuse_event'),('case'),('session_key')
      ), support_namespace AS (
        SELECT namespace.oid
        FROM pg_catalog.pg_namespace AS namespace
        WHERE namespace.nspname='support'
      ), resolved AS (
        SELECT required.table_name,relation.oid,relation.relkind
        FROM required
        LEFT JOIN support_namespace ON true
        LEFT JOIN pg_catalog.pg_class AS relation
          ON relation.relnamespace=support_namespace.oid
          AND relation.relname=required.table_name
      )
      SELECT pg_has_role(current_user,'debateai_support','MEMBER') AS support_member,
        COALESCE((SELECT has_schema_privilege(current_user,oid,'USAGE')
          FROM support_namespace),false) AS support_schema_usage,
        (SELECT count(*)=5 AND bool_and(oid IS NOT NULL AND relkind IN ('r','p'))
          FROM resolved) AS support_structure_valid,
        COALESCE((SELECT bool_or(has_table_privilege(
          current_user,oid,'SELECT,INSERT')) FROM resolved),false)
          AS support_table_privilege
    `).then(({ rows }) => rows[0]),
    supportRoleWitness(supportPool)
  ]);
  if (runtime === undefined || runtime.support_member || runtime.support_schema_usage
    || !runtime.support_structure_valid || runtime.support_table_privilege
    || support === undefined
    || support.session_principal !== support.principal
    || support.rolsuper || support.rolcreaterole || support.rolcreatedb
    || support.rolreplication || support.rolbypassrls
    || !support.support_member || support.forbidden_member
    || support.dangerous_builtin_member || support.owns_database_or_schema
    || support.direct_support_acl
    || JSON.stringify(support.direct_roles) !== JSON.stringify(["debateai_support"])
    || support.support_select_count !== "5" || support.support_insert_count !== "5"
    || support.support_forbidden_privilege || support.outside_table_privilege) {
    throw new TypeError("SUPPORT_DATABASE_ROLE_INVALID");
  }
}
