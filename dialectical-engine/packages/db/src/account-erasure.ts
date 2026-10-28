import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  isRunContentKeyRecordMissing,
  type AuditContextHasher,
  type CryptoEnvelope,
  type PublicationCipher,
  type ReadableUserDekStore,
  type RunContentKeyStore
} from "@debateai/crypto";
import type { AuthSourceContext } from "./identity.js";
import { MAIL_LOCALE_SETTING, withMailLocale } from "./mail-locale.js";
import { withPublicationContentLease } from "./publication-lease.js";
import { LEASE_LOCK_WAITS } from "./pool-budget.js";

const ERASURE_FUNCTION_SIGNATURES = Object.freeze([
  "identity.schedule_account_erasure(uuid,uuid,uuid,text)",
  "identity.schedule_account_erasure(uuid,uuid,uuid,text,boolean)",
  "identity.current_account_erasure(uuid,uuid,uuid)",
  "identity.current_account_erasure_with_choice(uuid,uuid,uuid)",
  "identity.cancel_current_account_erasure(uuid,uuid,uuid,uuid)",
  "identity.account_erasure_preview(uuid)",
  "identity.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])",
  "identity.account_erasure_cleanup_manifest(uuid)",
  "identity.account_erasure_cleanup_manifest_with_choice(uuid)",
  "identity.finalize_account_erasure(uuid,timestamptz,timestamptz,integer,integer,integer,integer)",
  "identity.account_erasure_status(uuid)",
  "identity.account_erasure_notification_mail_locale(uuid,uuid)",
  "identity.account_erasure_schedule_locale(uuid)",
  "identity.pending_account_key_cleanup(integer)",
  "identity.pending_account_erasure_work(integer)",
  "identity.claim_account_erasure_notifications(integer)",
  "identity.ack_account_erasure_notification(uuid,uuid)",
  "identity.fail_account_erasure_notification(uuid,uuid,text)",
  "identity.account_erasure_completion_notifications_ready(uuid)",
  "core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)",
  "core.resume_private_run_erasure(uuid,uuid,uuid,uuid,text)",
  "core.private_run_erasure_status(uuid)",
  "core.private_run_erasure_manifest(uuid)",
  "core.pending_private_run_key_cleanup(integer)",
  "core.finalize_private_run_erasure(uuid,timestamptz,timestamptz,integer,integer)"
] as const);
/** K02 (0125): erasure capabilities in the erasure_reconcile schema, which the N-1 release (counting identity, core, serve) does not attest. Resolved by OID, never by text, on the attested pool; each entry lands with its 0125 section. */
const ERASURE_RECONCILE_FUNCTION_SIGNATURES = Object.freeze([
  "erasure_reconcile.fail_account_erasure_notification(uuid,uuid,text)",
  "erasure_reconcile.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)",
  "erasure_reconcile.account_erasure_preview(uuid)",
  "erasure_reconcile.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])"
] as const);
const ERASURE_ATTESTED_FUNCTION_SIGNATURES = Object.freeze([
  ...ERASURE_FUNCTION_SIGNATURES, ...ERASURE_RECONCILE_FUNCTION_SIGNATURES
] as const);
const ERASURE_FORBIDDEN_ROLES = Object.freeze([
  "public","debateai_runtime","debateai_authorization_runtime",
  "debateai_publication_cleanup","debateai_content_provision","debateai_replay"
] as const);
const ERASURE_SENSITIVE_HELPER_SIGNATURES = Object.freeze([
  "identity.cancel_account_erasure(uuid,uuid)",
  "identity.account_erasure_audit_seed(uuid)",
  "core.private_run_erasure_for_run(uuid)",
  "core.private_run_erasure_audit_seed(uuid)"
] as const);

export type AccountErasureStatus =
  | "NOT_FOUND" | "SCHEDULED" | "DUE" | "CANCELLED" | "PREPARED" | "COMMITTED"
  | "CLEANED" | "CLEANED_WITH_LEGACY_RESIDUAL";
export type AccountErasureTransitionOutcome =
  | "NOT_FOUND" | "NOT_DUE" | "CANCELLED" | "STALE_MANIFEST" | "CONTENDED"
  | "PREPARED" | "COMMITTED" | "CLEANED" | "CLEANED_WITH_LEGACY_RESIDUAL"
  | "INVALID_EVIDENCE";

export type CurrentAccountErasure = Readonly<{
  erasureId: string;
  status: "SCHEDULED" | "DUE" | "PROCESSING";
  executeAt: Date;
  cancellationRef: string;
  deletePublicDebates: boolean;
}>;

export type AccountErasurePreview = Readonly<{
  userId: string;
  ownerRef: string;
  runIds: readonly string[];
  legacyRunIds: readonly string[];
  publishedRunIds: readonly string[];
}>;

type AccountErasureCleanupManifest = AccountErasurePreview & Readonly<{
  currentPublicationRefs: readonly string[];
  cleanupPublicationRefs: readonly string[];
  deletePublicDebates: boolean;
}>;

export type RunKeyProvisionCleanup = Readonly<{
  runId: string;
  userId: string;
  ownerRef: string;
  claimToken: string;
}>;

export type AccountErasureNotificationClaim = Readonly<{
  messageId: string;
  claimToken: string;
  userId: string;
  erasureId: string;
  channelType: "email" | "recovery_email";
  addressCiphertext: CryptoEnvelope;
  eventKind: "SCHEDULED" | "CANCELLED" | "COMPLETION";
  executeAt: Date;
  /** C11.4 (R-13): the language stored on the row; the worker sends the mail in it. */
  mailLocale: string;
}>;

type ErasureRoleWitness = Readonly<{
  sessionPrincipal: string;
  principal: string;
  superuser: boolean;
  createRole: boolean;
  createDatabase: boolean;
  replication: boolean;
  bypassRls: boolean;
  erasureMember: boolean;
  crossedRole: boolean;
  dangerousBuiltinMember: boolean;
  ownsDatabaseOrSchema: boolean;
  anyTablePrivilege: boolean;
  anySequencePrivilege: boolean;
  exactFunctionCount: number;
  forbiddenFunctionPrivilege: boolean;
  forbiddenReconcilePrivilege: boolean;
  reconcileFunctionCount: number;
  sensitiveHelperPrivilege:boolean;
  capabilityRoleLogin:boolean;
  capabilityRoleInherit:boolean;
}>;

export type PrivateRunErasureOutcome =
  | "NOT_FOUND" | "CONTENDED" | "PUBLISHED" | "ERASED" | "PREPARED"
  | "COMMITTED" | "CLEANED" | "INVALID_EVIDENCE" | "LEGACY_PLAINTEXT_RETAINED";

type PrivateRunErasureManifest = Readonly<{
  runId: string;
  ownerRef: string;
  cleanupPublicationRefs: readonly string[];
}>;

const CONTENT_LEASE_NAMESPACE = "debateai:run-content-lease:v1:" as const;
const NOTIFICATION_LEASE_NAMESPACE = "debateai:account-erasure-notification:v1:" as const;

/** NV-10: the published owner of a run key, or null when its directory holds no published record (nothing usable). */
async function recordedOwnerRef(runs: RunContentKeyStore, runId: string): Promise<string | null> {
  try { return await runs.ownerRef(runId); }
  catch (error) { if (isRunContentKeyRecordMissing(error)) return null; throw error; }
}

/**
 * The account-erasure timer's run-content leases (PostgresAccountErasureRepository.prepare only), taken EXCLUSIVE in
 * sorted run order. Each run's wait queues in PostgreSQL, so readers cannot starve a due erasure, but is bounded by a
 * transaction-local lock_timeout of LEASE_LOCK_WAITS.exclusiveMs: the first timeout answers `wait.contended()` and the
 * next cycle retries. The session locks outlive that transaction's COMMIT; lock_timeout does not. A private-debate
 * delete request never comes here: it takes its run's lease in SQL, after its grant is checked, and never waits (NV-30).
 */
async function withErasureContentLeases<T>(
  pool: Pool,
  requestedRunIds: readonly string[],
  use: (client: PoolClient) => Promise<T>,
  wait: Readonly<{ contended: () => T }>
): Promise<T> {
  const runIds = [...new Set(requestedRunIds)].sort();
  const client = await pool.connect();
  const acquired: string[] = [];
  let releaseFailure: unknown;
  try {
    await client.query("BEGIN");
    try {
      await client.query("SELECT set_config('lock_timeout',$1,true)",[`${LEASE_LOCK_WAITS.exclusiveMs}ms`]);
      for (const runId of runIds) {
        await client.query(
          "SELECT pg_advisory_lock(hashtextextended($1,0))",
          [`${CONTENT_LEASE_NAMESPACE}${runId}`]
        );
        acquired.push(runId);
      }
      await client.query("COMMIT");
    } catch (error) {
      // Session locks taken before a timeout survive the ROLLBACK; the finally below unlocks them.
      await client.query("ROLLBACK").catch(() => undefined);
      if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "55P03") {
        return wait.contended();
      }
      throw error;
    }
    return await use(client);
  } finally {
    for (const runId of acquired.reverse()) {
      try {
        const unlocked = await client.query<{ unlocked: boolean }>(
          "SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked",
          [`${CONTENT_LEASE_NAMESPACE}${runId}`]
        );
        if (unlocked.rows[0]?.unlocked !== true) {
          releaseFailure ??= new TypeError("CONTENT_LEASE_UNLOCK_FAILED");
        }
      } catch (error) {
        releaseFailure ??= error;
      }
    }
    client.release(releaseFailure instanceof Error ? releaseFailure : undefined);
    if (releaseFailure !== undefined) throw releaseFailure;
  }
}

/**
 * C11.3 (R-16, D-96): the erasure worker sets the mail language from the erasure's SCHEDULED row in the same transaction
 * as prepare_account_erasure, so the COMPLETION rows take that value. The reader is NULL when no SCHEDULED row exists; the
 * completion's guard then refuses (MAIL_LOCALE_MISSING) and the transaction rolls back. A failed ROLLBACK leaves the
 * connection in an unknown state: the unlock in withErasureContentLeases then fails on it, and the client leaves the pool.
 */
async function withScheduledMailLocale<T>(
  client: PoolClient,
  erasureId: string,
  run: () => Promise<T>
): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT set_config($1, identity.account_erasure_schedule_locale($2::uuid), true)",
      [MAIL_LOCALE_SETTING, erasureId]
    );
    const result = await run();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function readErasureRoleWitness(pool: Pool): Promise<ErasureRoleWitness> {
  const result = await pool.query<{
    session_principal: string;
    principal: string;
    rolsuper: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    erasure_member: boolean;
    crossed_role: boolean;
    dangerous_builtin_member: boolean;
    owns_database_or_schema: boolean;
    any_table_privilege: boolean;
    any_sequence_privilege: boolean;
    exact_function_count: string;
    forbidden_function_privilege: boolean;
    forbidden_reconcile_privilege: boolean;
    reconcile_function_count: string;
    sensitive_helper_privilege:boolean;
    capability_role_login:boolean;
    capability_role_inherit:boolean;
  }>(`
    WITH reconcile AS (
      SELECT procedure.oid,namespace.nspname||'.'||procedure.proname||'('
        ||replace(pg_catalog.oidvectortypes(procedure.proargtypes),', ',',')||')' AS signature
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
      WHERE namespace.nspname='erasure_reconcile'
    )
    SELECT session_user AS session_principal,current_user AS principal,
      role.rolsuper,role.rolcreaterole,role.rolcreatedb,role.rolreplication,
      role.rolbypassrls,
      pg_has_role(current_user,'debateai_erasure_runtime','MEMBER') AS erasure_member,
      (pg_has_role(current_user,'debateai_runtime','MEMBER')
        OR pg_has_role(current_user,'debateai_authorization_runtime','MEMBER')
        OR pg_has_role(current_user,'debateai_publication_cleanup','MEMBER')
        OR pg_has_role(current_user,'debateai_content_provision','MEMBER')
        OR pg_has_role(current_user,'debateai_replay','MEMBER')) AS crossed_role,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS elevated
        WHERE left(elevated.rolname,3)='pg_'
          AND (pg_has_role(current_user,elevated.oid,'MEMBER')
            OR pg_has_role(current_user,elevated.oid,'USAGE'))
      ) AS dangerous_builtin_member,
      (EXISTS (SELECT 1 FROM pg_catalog.pg_database AS database
          WHERE database.datname=current_database() AND database.datdba=role.oid)
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace AS namespace
          WHERE namespace.nspname=ANY(ARRAY[
            'identity','core','ledger','serve','scorecard','register','memory','evidence','evaluator',
            'erasure_reconcile'
          ]) AND namespace.nspowner=role.oid)) AS owns_database_or_schema,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname=ANY(ARRAY[
          'identity','core','ledger','serve','scorecard','register','memory','evidence','evaluator',
          'erasure_reconcile'
        ]) AND relation.relkind IN ('r','p')
          AND has_table_privilege(current_user,relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      ) AS any_table_privilege,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname=ANY(ARRAY[
          'identity','core','ledger','serve','scorecard','register','memory','evidence','evaluator',
          'erasure_reconcile'
        ]) AND relation.relkind='S'
          AND has_sequence_privilege(current_user,relation.oid,'USAGE,SELECT,UPDATE')
      ) AS any_sequence_privilege,
      (SELECT count(*)::text FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
        WHERE namespace.nspname=ANY(ARRAY['identity','core','serve','erasure_reconcile'])
          AND has_function_privilege(current_user,procedure.oid,'EXECUTE'))
        AS exact_function_count,
      EXISTS (
        SELECT 1 FROM unnest($1::text[]) AS forbidden_role(role_name)
        CROSS JOIN unnest($2::text[]) AS capability(signature)
        WHERE has_function_privilege(forbidden_role.role_name,capability.signature,'EXECUTE')
      ) AS forbidden_function_privilege,
      EXISTS (
        SELECT 1 FROM unnest($1::text[]) AS forbidden_role(role_name)
        JOIN reconcile ON reconcile.signature=ANY($5::text[])
        WHERE has_function_privilege(forbidden_role.role_name,reconcile.oid,'EXECUTE')
      ) AS forbidden_reconcile_privilege,
      (SELECT count(*)::text FROM reconcile WHERE reconcile.signature=ANY($5::text[])
        AND has_function_privilege(current_user,reconcile.oid,'EXECUTE')) AS reconcile_function_count,
      EXISTS (
        SELECT 1 FROM unnest($3::text[]) AS forbidden_role(role_name)
        CROSS JOIN unnest($4::text[]) AS helper(signature)
        WHERE has_function_privilege(forbidden_role.role_name,helper.signature,'EXECUTE')
      ) AS sensitive_helper_privilege,
      capability.rolcanlogin AS capability_role_login,
      capability.rolinherit AS capability_role_inherit
    FROM pg_catalog.pg_roles AS role
    CROSS JOIN pg_catalog.pg_roles AS capability
    WHERE role.rolname=current_user
      AND capability.rolname='debateai_erasure_runtime'
  `, [ERASURE_FORBIDDEN_ROLES,ERASURE_FUNCTION_SIGNATURES,
    [...ERASURE_FORBIDDEN_ROLES,"debateai_erasure_runtime"],
    ERASURE_SENSITIVE_HELPER_SIGNATURES,ERASURE_RECONCILE_FUNCTION_SIGNATURES]);
  const row = result.rows[0];
  if (row === undefined) throw new TypeError("ERASURE_DATABASE_ROLE_ATTESTATION_FAILED");
  return Object.freeze({
    sessionPrincipal: row.session_principal,
    principal: row.principal,
    superuser: row.rolsuper,
    createRole: row.rolcreaterole,
    createDatabase: row.rolcreatedb,
    replication: row.rolreplication,
    bypassRls: row.rolbypassrls,
    erasureMember: row.erasure_member,
    crossedRole: row.crossed_role,
    dangerousBuiltinMember: row.dangerous_builtin_member,
    ownsDatabaseOrSchema: row.owns_database_or_schema,
    anyTablePrivilege: row.any_table_privilege,
    anySequencePrivilege: row.any_sequence_privilege,
    exactFunctionCount: Number(row.exact_function_count),
    forbiddenFunctionPrivilege: row.forbidden_function_privilege,
    forbiddenReconcilePrivilege: row.forbidden_reconcile_privilege,
    reconcileFunctionCount: Number(row.reconcile_function_count),
    sensitiveHelperPrivilege:row.sensitive_helper_privilege,
    capabilityRoleLogin:row.capability_role_login,
    capabilityRoleInherit:row.capability_role_inherit
  });
}

export async function assertAccountErasureDatabaseRole(
  runtimePool:Pool,erasurePool:Pool
): Promise<void> {
  const [runtime,witness,exactFunctions] = await Promise.all([
    runtimePool.query<{
      principal:string;capabilities:boolean[];sensitive_helpers:boolean[];
      reconcile_schema_usage:boolean;
    }>(`
      SELECT current_user AS principal,ARRAY(
        SELECT has_function_privilege(current_user,capability.signature,'EXECUTE')
        FROM unnest($1::text[]) AS capability(signature)
      ) AS capabilities,ARRAY(
        SELECT has_function_privilege(current_user,helper.signature,'EXECUTE')
        FROM unnest($2::text[]) AS helper(signature)
      ) AS sensitive_helpers,
      COALESCE(has_schema_privilege(current_user,to_regnamespace('erasure_reconcile'),'USAGE'),false)
        AS reconcile_schema_usage
    `,[ERASURE_FUNCTION_SIGNATURES,ERASURE_SENSITIVE_HELPER_SIGNATURES]),
    readErasureRoleWitness(erasurePool),
    Promise.all(ERASURE_FUNCTION_SIGNATURES.map(async (signature) =>
      (await erasurePool.query<{ allowed:boolean }>(
        "SELECT has_function_privilege(current_user,$1,'EXECUTE') AS allowed",[signature]
      )).rows[0]?.allowed === true
    ))
  ]);
  if (runtime.rows[0] === undefined
    || runtime.rows[0].principal === witness.principal
    || runtime.rows[0].capabilities.length!==ERASURE_FUNCTION_SIGNATURES.length
    || runtime.rows[0].capabilities.some(Boolean)
    || runtime.rows[0].sensitive_helpers.length!==ERASURE_SENSITIVE_HELPER_SIGNATURES.length
    || runtime.rows[0].sensitive_helpers.some(Boolean)
    || runtime.rows[0].reconcile_schema_usage
    || witness.principal==="debateai_erasure_runtime"
    || witness.sessionPrincipal !== witness.principal
    || witness.superuser || witness.createRole || witness.createDatabase
    || witness.replication || witness.bypassRls
    || !witness.erasureMember
    || witness.crossedRole || witness.dangerousBuiltinMember
    || witness.ownsDatabaseOrSchema || witness.anyTablePrivilege
    || witness.anySequencePrivilege || witness.forbiddenFunctionPrivilege
    || witness.forbiddenReconcilePrivilege
    || witness.reconcileFunctionCount!==ERASURE_RECONCILE_FUNCTION_SIGNATURES.length
    || witness.sensitiveHelperPrivilege || witness.capabilityRoleLogin
    || witness.capabilityRoleInherit
    || witness.exactFunctionCount!==ERASURE_ATTESTED_FUNCTION_SIGNATURES.length
    || exactFunctions.some((allowed)=>!allowed)) {
    throw new TypeError("ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED");
  }
}

/** NV-02 (0125): FAILED re-queues the row with backoff; both DEAD_LETTERED results settle it (a DEAD: code and an audit event). */
export type AccountErasureNotificationFailure =
  | "FAILED" | "DEAD_LETTERED_RECIPIENT" | "DEAD_LETTERED_ATTEMPT_CAP" | "CONTENDED";

export class PostgresAccountErasureRepository {
  constructor(
    private readonly pool: Pool,
    private readonly auditContext: AuditContextHasher,
    private readonly runProvisionPool: Pool = pool
  ) {}

  withPublicationLease<T>(publicationRef: string,use: () => Promise<T>): Promise<T> {
    return withPublicationContentLease(this.pool,[publicationRef],async () => use());
  }

  async withNotificationLease<T>(userId:string,use:()=>Promise<T>):Promise<T> {
    const client=await this.pool.connect();
    const key=`${NOTIFICATION_LEASE_NAMESPACE}${userId}`;
    let releaseFailure:unknown;
    let connectionFailure:Error|undefined;
    const observeConnectionFailure=(error:Error):void=>{ connectionFailure??=error; };
    client.on("error",observeConnectionFailure);
    try {
      await client.query("SELECT pg_advisory_lock(hashtextextended($1,0))",[key]);
      return await use();
    } finally {
      if (connectionFailure!==undefined) {
        releaseFailure=connectionFailure;
      } else {
        try {
          const unlocked=await client.query<{ unlocked:boolean }>(
            "SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked",[key]
          );
          if (unlocked.rows[0]?.unlocked!==true) {
            releaseFailure=new TypeError("ERASURE_NOTIFICATION_LEASE_UNLOCK_FAILED");
          }
        } catch (error) {
          releaseFailure=error;
        }
      }
      client.removeListener("error",observeConnectionFailure);
      client.release(releaseFailure instanceof Error ? releaseFailure : undefined);
      if (releaseFailure!==undefined) throw releaseFailure;
    }
  }

  async schedule(input: Readonly<{
    userId: string;
    ownerRef: string;
    sessionId: string;
    grantTokenHash: string;
    deletePublicDebates?: boolean;
    source?: AuthSourceContext;
  }>): Promise<CurrentAccountErasure | null> {
    // C11.1 (R-16, D-3 row 10): the SCHEDULED row takes the schedule request's language; a request with no value writes en (V-23).
    const result = await withMailLocale(this.pool, input.source?.mailLocale ?? "en", (client) => client.query<{
      erasure_id:string;status:"SCHEDULED"|"DUE"|"PROCESSING";execute_at:Date;
      cancellation_ref:string;delete_public_debates:boolean;
    }>(
      "SELECT * FROM identity.schedule_account_erasure($1,$2,$3,$4,$5)",
      [input.userId,input.ownerRef,input.sessionId,input.grantTokenHash,
        input.deletePublicDebates === true]
    ));
    const row=result.rows[0];
    return row===undefined ? null : Object.freeze({
      erasureId:row.erasure_id,status:row.status,executeAt:row.execute_at,
      cancellationRef:row.cancellation_ref,deletePublicDebates:row.delete_public_debates
    });
  }

  async current(input: Readonly<{
    userId: string;
    ownerRef: string;
    sessionId: string;
  }>): Promise<CurrentAccountErasure | null> {
    const result = await this.pool.query<{
      erasure_id: string;
      status: "SCHEDULED" | "DUE" | "PROCESSING";
      execute_at: Date;
      cancellation_ref: string;
      delete_public_debates: boolean;
    }>("SELECT * FROM identity.current_account_erasure_with_choice($1,$2,$3)", [
      input.userId,input.ownerRef,input.sessionId
    ]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      erasureId: row.erasure_id,
      status: row.status,
      executeAt: row.execute_at,
      cancellationRef: row.cancellation_ref,
      deletePublicDebates: row.delete_public_debates
    });
  }

  async cancelCurrent(input: Readonly<{
    userId: string;
    ownerRef: string;
    sessionId: string;
    cancellationRef: string;
    source?: AuthSourceContext;
  }>): Promise<boolean> {
    // C11.2 (R-16, D-3 row 11): the CANCELLED row takes the cancel request's language; a request with no value writes en (V-23).
    const result = await withMailLocale(this.pool, input.source?.mailLocale ?? "en", (client) => client.query<{ cancelled: boolean }>(
      "SELECT identity.cancel_current_account_erasure($1,$2,$3,$4) AS cancelled",
      [input.userId,input.ownerRef,input.sessionId,input.cancellationRef]
    ));
    return result.rows[0]?.cancelled === true;
  }

  async preview(erasureId: string): Promise<AccountErasurePreview | null> {
    const result = await this.pool.query<{
      user_id: string;
      owner_ref: string;
      run_ids: string[];
      legacy_run_ids: string[];
      published_run_ids: string[];
    }>("SELECT * FROM erasure_reconcile.account_erasure_preview($1)", [erasureId]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      userId: row.user_id,
      ownerRef: row.owner_ref,
      runIds: Object.freeze([...row.run_ids]),
      legacyRunIds: Object.freeze([...row.legacy_run_ids]),
      publishedRunIds: Object.freeze([...row.published_run_ids])
    });
  }

  async prepare(
    erasureId: string,
    expectedRunIds: readonly string[],
    expectedLegacyRunIds: readonly string[],
    expectedPublishedRunIds: readonly string[]
  ): Promise<AccountErasureTransitionOutcome> {
    return withErasureContentLeases(this.pool,expectedRunIds,(client) =>
      withScheduledMailLocale(client,erasureId,async () => {
        const result = await client.query<{ outcome: AccountErasureTransitionOutcome }>(
          "SELECT erasure_reconcile.prepare_account_erasure($1,$2::uuid[],$3::uuid[],$4::uuid[]) AS outcome",
          [erasureId,expectedRunIds,expectedLegacyRunIds,expectedPublishedRunIds]
        );
        return result.rows[0]?.outcome ?? "NOT_FOUND";
      }),{ contended: () => "CONTENDED" as const });
  }

  async status(erasureId: string): Promise<AccountErasureStatus> {
    const result = await this.pool.query<{ status: AccountErasureStatus }>(
      "SELECT identity.account_erasure_status($1) AS status",
      [erasureId]
    );
    return result.rows[0]?.status ?? "NOT_FOUND";
  }

  async cleanupManifest(erasureId: string): Promise<AccountErasureCleanupManifest | null> {
    const result = await this.pool.query<{
      user_id: string;
      owner_ref: string;
      run_ids: string[];
      legacy_run_ids: string[];
      published_run_ids: string[];
      current_publication_refs: string[];
      cleanup_publication_refs: string[];
      delete_public_debates: boolean;
    }>("SELECT * FROM identity.account_erasure_cleanup_manifest_with_choice($1)", [erasureId]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      userId: row.user_id,
      ownerRef: row.owner_ref,
      runIds: Object.freeze([...row.run_ids]),
      legacyRunIds: Object.freeze([...row.legacy_run_ids]),
      publishedRunIds: Object.freeze([...row.published_run_ids]),
      currentPublicationRefs: Object.freeze([...row.current_publication_refs]),
      cleanupPublicationRefs: Object.freeze([...row.cleanup_publication_refs]),
      deletePublicDebates: row.delete_public_debates
    });
  }

  async pendingCleanup(limit = 100): Promise<readonly string[]> {
    const result = await this.pool.query<{ erasure_id: string }>(
      "SELECT erasure_id FROM identity.pending_account_key_cleanup($1)",
      [limit]
    );
    return Object.freeze(result.rows.map((row) => row.erasure_id));
  }

  async pendingWork(limit = 100): Promise<readonly string[]> {
    const result = await this.pool.query<{ erasure_id:string }>(
      "SELECT erasure_id FROM identity.pending_account_erasure_work($1)",[limit]
    );
    return Object.freeze(result.rows.map((row)=>row.erasure_id));
  }

  async claimNotifications(limit = 100): Promise<readonly AccountErasureNotificationClaim[]> {
    const result = await this.pool.query<{
      message_id: string;
      claim_token: string;
      user_id: string;
      erasure_id: string;
      channel_type: "email" | "recovery_email";
      address_ciphertext: CryptoEnvelope;
      event_kind: "SCHEDULED" | "CANCELLED" | "COMPLETION";
      execute_at: Date;
    }>("SELECT * FROM identity.claim_account_erasure_notifications($1)", [limit]);
    // C18.5 (D-120): the locale is read per claimed row, inside that row's lease (its message id and claim token).
    return Object.freeze(await Promise.all(result.rows.map(async (row) => {
      const locale = await this.pool.query<{ locale: string }>(
        "SELECT identity.account_erasure_notification_mail_locale($1,$2) AS locale",
        [row.message_id, row.claim_token]
      );
      const mailLocale = locale.rows[0]?.locale;
      if (mailLocale === undefined) throw new TypeError("ACCOUNT_ERASURE_MAIL_LOCALE_MISSING");
      return Object.freeze({
        messageId: row.message_id,
        claimToken: row.claim_token,
        userId: row.user_id,
        erasureId: row.erasure_id,
        channelType: row.channel_type,
        addressCiphertext: row.address_ciphertext,
        eventKind: row.event_kind,
        executeAt: row.execute_at,
        mailLocale
      });
    })));
  }

  async acknowledgeNotification(messageId: string,claimToken: string): Promise<boolean> {
    const result = await this.pool.query<{ acknowledged:boolean }>(
      "SELECT identity.ack_account_erasure_notification($1,$2) AS acknowledged",
      [messageId,claimToken]
    );
    return result.rows[0]?.acknowledged === true;
  }

  async failNotification(
    messageId:string,claimToken:string,errorCode:string
  ): Promise<AccountErasureNotificationFailure> {
    // NV-02 (0125): the fail that can settle a row (0040's identity fail keeps its grant for the release before).
    const result = await this.pool.query<{ outcome:string|null }>(
      "SELECT erasure_reconcile.fail_account_erasure_notification($1,$2,$3) AS outcome",
      [messageId,claimToken,errorCode]
    );
    const outcome=result.rows[0]?.outcome;
    return outcome==="FAILED" || outcome==="DEAD_LETTERED_RECIPIENT" || outcome==="DEAD_LETTERED_ATTEMPT_CAP"
      ? outcome : "CONTENDED";
  }

  async completionNotificationsReady(erasureId:string): Promise<boolean> {
    const result = await this.pool.query<{ ready:boolean }>(
      "SELECT identity.account_erasure_completion_notifications_ready($1) AS ready",
      [erasureId]
    );
    return result.rows[0]?.ready === true;
  }

  async claimRunKeyProvisionCleanup(limit = 100): Promise<readonly RunKeyProvisionCleanup[]> {
    // NV-08 (0125): the claim that skips owners the intent trigger refuses; 0040's core claim stays for the release before.
    const result = await this.runProvisionPool.query<{
      run_id: string;
      user_id: string;
      owner_ref: string;
      claim_token: string;
    }>("SELECT * FROM erasure_reconcile.claim_run_key_provision_cleanup($1)", [limit]);
    return Object.freeze(result.rows.map((row) => Object.freeze({
      runId: row.run_id,
      userId: row.user_id,
      ownerRef: row.owner_ref,
      claimToken: row.claim_token
    })));
  }

  async completeRunKeyProvisionCleanup(runId: string, claimToken: string): Promise<boolean> {
    const result = await this.runProvisionPool.query<{ completed: boolean }>(
      "SELECT core.complete_run_key_provision_cleanup($1,$2) AS completed",
      [runId,claimToken]
    );
    return result.rows[0]?.completed === true;
  }

  async finalize(input: Readonly<{
    erasureId: string;
    keyCleanupCompletedAt: Date;
    occurredAt: Date;
    source: AuthSourceContext;
    destroyedRunKeyCount: number;
    alreadyAbsentRunKeyCount: number;
    destroyedUserDekCount: 0 | 1;
    alreadyAbsentUserDekCount: 0 | 1;
  }>): Promise<AccountErasureTransitionOutcome> {
    void input.source;
    void this.auditContext;
    const finalized = await this.pool.query<{ outcome: AccountErasureTransitionOutcome }>(
      `SELECT identity.finalize_account_erasure($1,$2,$3,$4,$5,$6,$7) AS outcome`,
      [input.erasureId,input.keyCleanupCompletedAt,input.occurredAt,
        input.destroyedRunKeyCount,input.alreadyAbsentRunKeyCount,
        input.destroyedUserDekCount,input.alreadyAbsentUserDekCount]
    );
    return finalized.rows[0]?.outcome ?? "NOT_FOUND";
  }
}

/**
 * WHICH reconcile stage swallowed a throw. Bounded by construction: three
 * constants of this module, one per catch, carrying no cause — not its message,
 * not its name, not a stringification, and no key material.
 *
 * This is a DIAGNOSTIC label BESIDE the typed outcome, never a member of the
 * outcome vocabulary above and never a substitute for one. Its whole job is to
 * make two `INVALID_EVIDENCE` items distinguishable: one the code returned on
 * purpose after checking evidence, and one that is a swallowed throw wearing
 * the same word. It rides ONLY on the swallow path, so the success path's item
 * keeps the key set its callers already match on.
 */
export const ACCOUNT_ERASURE_RECONCILE_STAGES = Object.freeze([
  "run-key-provision-cleanup", "account-erasure-execute", "private-run-cleanup-complete"
] as const);
export type AccountErasureReconcileStage = typeof ACCOUNT_ERASURE_RECONCILE_STAGES[number];

/** C-1: the os_user the erasure's support shred writes to support.shred_audit (an operator's shred writes their OS user). */
export const ACCOUNT_ERASURE_SUPPORT_SHRED_ACTOR = "account-erasure";

/**
 * C-1: the support data plane's erasure facet (PostgresSupportShredRepository on the support data credential).
 * Support transcripts, case replies and summaries are under per-session and per-case keys wrapped by the host
 * support KEK, not the user DEK, so destroying the DEK alone leaves them readable.
 */
export type SupportErasurePort = Readonly<{
  shredOwnerForErasure(ownerRef: string, actor: string, at: Date): Promise<unknown>;
  liveOwnerKeyCount(ownerRef: string): Promise<number>;
}>;

export class AccountErasureCoordinator {
  constructor(
    private readonly repository: PostgresAccountErasureRepository,
    private readonly users: ReadableUserDekStore,
    private readonly runs: RunContentKeyStore,
    private readonly publications?: Pick<PublicationCipher,
      "destroy" | "exists" | "keyReadable">,
    private readonly support?: SupportErasurePort
  ) {}

  async execute(erasureId: string, source: AuthSourceContext): Promise<AccountErasureTransitionOutcome> {
    const leasePreview=await this.repository.preview(erasureId);
    if (leasePreview!==null) {
      return this.repository.withNotificationLease(leasePreview.userId,async () =>
        this.executeUnderNotificationLease(erasureId,source)
      );
    }
    const leaseStatus=await this.repository.status(erasureId);
    if (leaseStatus==="PREPARED") {
      const leaseManifest=await this.repository.cleanupManifest(erasureId);
      if (leaseManifest===null) return "NOT_FOUND";
      return this.repository.withNotificationLease(leaseManifest.userId,async () =>
        this.executeUnderNotificationLease(erasureId,source)
      );
    }
    return leaseStatus==="CLEANED" || leaseStatus==="CLEANED_WITH_LEGACY_RESIDUAL"
      ? leaseStatus : "NOT_FOUND";
  }

  private async executeUnderNotificationLease(
    erasureId:string,source:AuthSourceContext
  ):Promise<AccountErasureTransitionOutcome> {
    let preview = await this.repository.preview(erasureId);
    if (preview === null) {
      const status = await this.repository.status(erasureId);
      if (status !== "PREPARED") {
        return status === "CLEANED" || status === "CLEANED_WITH_LEGACY_RESIDUAL"
          ? status
          : "NOT_FOUND";
      }
    } else {
      let prepared: AccountErasureTransitionOutcome;
      try {
        prepared = await this.repository.prepare(
          erasureId,
          preview.runIds,
          preview.legacyRunIds,
          preview.publishedRunIds
        );
      } catch (error) {
        // A connection failure after COMMIT is ambiguous. Never destroy keys
        // until an independent read confirms PREPARED.
        const observed = await this.repository.status(erasureId).catch(() => "NOT_FOUND" as const);
        if (observed !== "PREPARED") throw error;
        prepared = "PREPARED";
      }
      if (prepared !== "PREPARED") return prepared;
    }

    const cleanup = await this.repository.cleanupManifest(erasureId);
    if (cleanup === null) return "NOT_FOUND";
    // Every account alert is encrypted under the still-live user DEK. The
    // authoritative SQL gate is repeated by FINALIZE, but checking here keeps
    // key destruction strictly after every supported channel row is settled:
    // ACKed after the transport accepted it, or dead-lettered by
    // erasure_reconcile.fail_account_erasure_notification with a DEAD: code and an
    // identity.account.erasure_notice_dead_lettered audit event (0125, NV-02). This also
    // prevents a cross-process SCHEDULED sender from retaining plaintext while
    // a later completion cycle shreds the key.
    if (!await this.repository.completionNotificationsReady(erasureId)) return "CONTENDED";
    if ((cleanup.currentPublicationRefs.length > 0
        || cleanup.cleanupPublicationRefs.length > 0)
      && this.publications === undefined) return "INVALID_EVIDENCE";
    // C-1: without the support port the owner's support keys can be neither shredded nor read back; destroy nothing.
    const support = this.support;
    if (support === undefined) return "INVALID_EVIDENCE";
    for (const publicationRef of cleanup.currentPublicationRefs) {
      const ok = await this.repository.withPublicationLease(publicationRef,async () => {
        if (!cleanup.deletePublicDebates) {
          return await this.publications!.exists(publicationRef)
            && await this.publications!.keyReadable(publicationRef);
        }
        await this.publications!.destroy(publicationRef);
        return !await this.publications!.exists(publicationRef)
          && !await this.publications!.keyReadable(publicationRef);
      });
      if (!ok) return "INVALID_EVIDENCE";
    }
    for (const publicationRef of cleanup.cleanupPublicationRefs) {
      const absent = await this.repository.withPublicationLease(publicationRef,async () => {
        await this.publications!.destroy(publicationRef);
        return !await this.publications!.exists(publicationRef);
      });
      if (!absent) return "INVALID_EVIDENCE";
    }
    const physicalRunIds = await this.runs.listByOwner(cleanup.ownerRef);
    for (const runId of cleanup.runIds) {
      // NV-10: a record-less directory the manifest names is this owner's half-destroyed run; it is destroyed below.
      const owner = await this.runs.exists(runId) ? await recordedOwnerRef(this.runs, runId) : null;
      if (owner !== null && owner !== cleanup.ownerRef) {
        return "INVALID_EVIDENCE";
      }
    }
    for (const runId of physicalRunIds) {
      const owner = await recordedOwnerRef(this.runs, runId);
      if (owner !== null && owner !== cleanup.ownerRef) return "INVALID_EVIDENCE";
    }
    let destroyedRunKeyCount = 0;
    let alreadyAbsentRunKeyCount = 0;
    for (const runId of [...new Set([...cleanup.runIds, ...physicalRunIds])].sort()) {
      const result = await this.runs.destroy(runId);
      if (result === "DESTROYED") destroyedRunKeyCount += 1;
      else alreadyAbsentRunKeyCount += 1;
    }
    // C-1: before the user DEK goes, shred every support session and case key bound to this owner. NONE when the
    // owner never opened a signed-in support session; ALREADY_SHREDDED on a retry or after an operator's manual
    // shred. A throw leaves the erasure PREPARED (reconcile reports account-erasure-execute) and the next cycle retries.
    await support.shredOwnerForErasure(
      cleanup.ownerRef, ACCOUNT_ERASURE_SUPPORT_SHRED_ACTOR, new Date()
    );
    const userDekResult = await this.users.destroy(cleanup.userId);

    // Non-vacuous durable-store readback: absence must hold for every physical
    // per-run key and the user DEK before an erasure audit can be appended.
    if (await this.users.exists(cleanup.userId)) return "INVALID_EVIDENCE";
    for (const runId of cleanup.runIds) {
      if (await this.runs.exists(runId)) return "INVALID_EVIDENCE";
    }
    if ((await this.runs.listByOwner(cleanup.ownerRef)).length !== 0) return "INVALID_EVIDENCE";
    // C-1: the support readback, last before FINALIZE, so it also sees a session committed after a NONE shred.
    if (await support.liveOwnerKeyCount(cleanup.ownerRef) !== 0) return "INVALID_EVIDENCE";

    const completedAt = new Date();
    let finalized: AccountErasureTransitionOutcome;
    try {
      finalized = await this.repository.finalize({
        erasureId,
        keyCleanupCompletedAt: completedAt,
        occurredAt: completedAt,
        source,
        destroyedRunKeyCount,
        alreadyAbsentRunKeyCount,
        destroyedUserDekCount: userDekResult === "DESTROYED" ? 1 : 0,
        alreadyAbsentUserDekCount: userDekResult === "ALREADY_ABSENT" ? 1 : 0
      });
    } catch (error) {
      const observed = await this.repository.status(erasureId).catch(() => "NOT_FOUND" as const);
      if (observed !== "CLEANED" && observed !== "CLEANED_WITH_LEGACY_RESIDUAL") throw error;
      finalized = observed;
    }
    if (finalized !== "COMMITTED"
      && finalized !== "CLEANED"
      && finalized !== "CLEANED_WITH_LEGACY_RESIDUAL") return finalized;
    const status = await this.repository.status(erasureId);
    return status === "CLEANED" || status === "CLEANED_WITH_LEGACY_RESIDUAL"
      ? status
      : "CONTENDED";
  }

  async reconcileRunKeyProvisionIntents(limit = 100): Promise<readonly Readonly<{
    runId: string;
    outcome: "CLEANED" | "INVALID_EVIDENCE" | "CONTENDED";
    diagnosticStage?: AccountErasureReconcileStage;
  }>[]> {
    const outcomes: {
      runId: string;
      outcome: "CLEANED" | "INVALID_EVIDENCE" | "CONTENDED";
      diagnosticStage?: AccountErasureReconcileStage;
    }[] = [];
    for (const intent of await this.repository.claimRunKeyProvisionCleanup(limit)) {
      try {
        // NV-10: a record-less directory under this claimed intent is its own crash orphan; it is destroyed below.
        const intentOwner = await this.runs.exists(intent.runId) ? await recordedOwnerRef(this.runs, intent.runId) : null;
        if (intentOwner !== null && intentOwner !== intent.ownerRef) {
          outcomes.push({ runId: intent.runId, outcome: "INVALID_EVIDENCE" });
          continue;
        }
        await this.runs.destroy(intent.runId);
        if (await this.runs.exists(intent.runId)) {
          outcomes.push({ runId: intent.runId, outcome: "INVALID_EVIDENCE" });
          continue;
        }
        outcomes.push({
          runId: intent.runId,
          outcome: await this.repository.completeRunKeyProvisionCleanup(
            intent.runId,intent.claimToken
          )
            ? "CLEANED" : "CONTENDED"
        });
      } catch {
        // The cause is discarded on purpose — it can carry a driver message or
        // a key identity. The STAGE is not the cause: it is this catch's own
        // name, so a reader can tell this swallowed throw from the two
        // INVALID_EVIDENCE items the ownership and readback checks return above.
        outcomes.push({
          runId: intent.runId,
          outcome: "INVALID_EVIDENCE",
          diagnosticStage: "run-key-provision-cleanup"
        });
      }
    }
    return Object.freeze(outcomes.map((outcome) => Object.freeze(outcome)));
  }

  async reconcile(source: AuthSourceContext, limit = 100): Promise<readonly Readonly<{
    erasureId: string;
    outcome: AccountErasureTransitionOutcome;
    diagnosticStage?: AccountErasureReconcileStage;
  }>[]> {
    const outcomes: {
      erasureId: string;
      outcome: AccountErasureTransitionOutcome;
      diagnosticStage?: AccountErasureReconcileStage;
    }[] = [];
    for (const erasureId of await this.repository.pendingWork(limit)) {
      try {
        outcomes.push({ erasureId, outcome: await this.execute(erasureId, source) });
      } catch {
        // A poisoned intent remains visible for retry without starving later
        // prepared accounts in the ordered cleanup batch. The stage says which
        // catch produced this item; the cause itself is still discarded.
        outcomes.push({
          erasureId,
          outcome: "INVALID_EVIDENCE",
          diagnosticStage: "account-erasure-execute"
        });
      }
    }
    return Object.freeze(outcomes.map((outcome) => Object.freeze(outcome)));
  }
}

export class PostgresPrivateRunErasureRepository {
  constructor(
    private readonly pool: Pool,
    private readonly auditContext: AuditContextHasher
  ) {}

  withPublicationLease<T>(publicationRef: string,use: () => Promise<T>): Promise<T> {
    return withPublicationContentLease(this.pool,[publicationRef],async () => use());
  }

  async prepare(input: Readonly<{
    runId: string;
    userId: string;
    ownerRef: string;
    sessionId: string;
    grantTokenHash: string;
  }>): Promise<Readonly<{ outcome: PrivateRunErasureOutcome; erasureId: string | null }>> {
    // NV-30 (0125): the grant is checked before any lock, and the named run's content lease is tried, never waited for,
    // inside this one statement; contention answers CONTENDED to an authorized caller only and spends nothing.
    const result = await this.pool.query<{ outcome: PrivateRunErasureOutcome; erasure_id: string | null }>(
      "SELECT * FROM erasure_reconcile.prepare_private_run_erasure($1,$2,$3,$4,$5)",
      [input.runId,input.userId,input.ownerRef,input.sessionId,input.grantTokenHash]
    );
    const row = result.rows[0];
    return Object.freeze({ outcome: row?.outcome ?? "NOT_FOUND", erasureId: row?.erasure_id ?? null });
  }

  async resume(input: Readonly<{
    runId: string;
    userId: string;
    ownerRef: string;
    sessionId: string;
    grantTokenHash: string;
  }>): Promise<Readonly<{
    outcome: "NOT_FOUND" | "CONTENDED" | "PREPARED";
    erasureId: string | null;
  }>> {
    const result = await this.pool.query<{
      outcome: "NOT_FOUND" | "CONTENDED" | "PREPARED";
      erasure_id: string | null;
    }>("SELECT * FROM core.resume_private_run_erasure($1,$2,$3,$4,$5)", [
      input.runId,input.userId,input.ownerRef,input.sessionId,input.grantTokenHash
    ]);
    const row = result.rows[0];
    return Object.freeze({
      outcome: row?.outcome ?? "NOT_FOUND",erasureId: row?.erasure_id ?? null
    });
  }

  async status(erasureId: string): Promise<"NOT_FOUND" | "PREPARED" | "CLEANED"> {
    const result = await this.pool.query<{ status: "NOT_FOUND" | "PREPARED" | "CLEANED" }>(
      "SELECT core.private_run_erasure_status($1) AS status",
      [erasureId]
    );
    return result.rows[0]?.status ?? "NOT_FOUND";
  }

  async manifest(erasureId: string): Promise<PrivateRunErasureManifest | null> {
    const result = await this.pool.query<{
      run_id: string;
      owner_ref: string;
      cleanup_publication_refs: string[];
    }>(
      "SELECT * FROM core.private_run_erasure_manifest($1)",
      [erasureId]
    );
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      runId: row.run_id,
      ownerRef: row.owner_ref,
      cleanupPublicationRefs: Object.freeze([...row.cleanup_publication_refs])
    });
  }

  async pendingCleanup(limit = 100): Promise<readonly string[]> {
    const result = await this.pool.query<{ erasure_id: string }>(
      "SELECT erasure_id FROM core.pending_private_run_key_cleanup($1)",
      [limit]
    );
    return Object.freeze(result.rows.map((row) => row.erasure_id));
  }

  async finalize(input: Readonly<{
    erasureId: string;
    keyCleanupCompletedAt: Date;
    occurredAt: Date;
    source: AuthSourceContext;
    destroyedKeyCount: 0 | 1;
    alreadyAbsentKeyCount: 0 | 1;
  }>): Promise<PrivateRunErasureOutcome> {
    // Publication/private-erasure audit rows must not retain stable network or
    // request correlation values. Their mutable attribution binding is the
    // only pre-account-erasure forensic mapping.
    void input.source;
    void this.auditContext;
    const result = await this.pool.query<{ outcome: PrivateRunErasureOutcome }>(
      `SELECT core.finalize_private_run_erasure($1,$2,$3,$4,$5) AS outcome`,
      [input.erasureId,input.keyCleanupCompletedAt,input.occurredAt,
        input.destroyedKeyCount,input.alreadyAbsentKeyCount]
    );
    return result.rows[0]?.outcome ?? "NOT_FOUND";
  }
}

export class PrivateRunErasureCoordinator {
  constructor(
    private readonly repository: PostgresPrivateRunErasureRepository,
    private readonly runs: RunContentKeyStore,
    private readonly publications?: Pick<PublicationCipher,"destroy" | "exists">
  ) {}

  async execute(input: Readonly<{
    runId: string;
    userId: string;
    ownerRef: string;
    sessionId: string;
    grantTokenHash: string;
    source: AuthSourceContext;
  }>): Promise<PrivateRunErasureOutcome> {
    let resumed = await this.repository.resume(input);
    if (resumed.outcome === "CONTENDED") return "CONTENDED";
    let erasureId = resumed.outcome === "PREPARED" && resumed.erasureId !== null
      ? resumed.erasureId : undefined;
    if (erasureId === undefined) {
      let prepared: Awaited<ReturnType<PostgresPrivateRunErasureRepository["prepare"]>>;
      try {
        prepared = await this.repository.prepare(input);
      } catch (error) {
        resumed = await this.repository.resume(input).catch(() => Object.freeze({
          outcome: "NOT_FOUND" as const,erasureId: null
        }));
        if (resumed.outcome === "CONTENDED") return "CONTENDED";
        if (resumed.outcome !== "PREPARED" || resumed.erasureId === null) throw error;
        prepared = Object.freeze({ outcome: "PREPARED", erasureId: resumed.erasureId });
      }
      if (prepared.outcome === "ERASED") return "CLEANED";
      if (prepared.outcome !== "PREPARED" || prepared.erasureId === null) return prepared.outcome;
      erasureId = prepared.erasureId;
    }
    // Side-by-side A-x3 (0123 §8): one request marks every run of the debate's re-admission chain, each with its own
    // erasure; resume names the next one still pending under the same grant until none is left. An id named twice was
    // not finalized: the request stays pending rather than answering CLEANED while a run of the debate keeps its key.
    const completed = new Set<string>([erasureId!]);
    let outcome = await this.completePrepared(erasureId!, input.source);
    while (outcome === "CLEANED") {
      const next = await this.repository.resume(input);
      if (next.outcome === "CONTENDED") return "CONTENDED";
      if (next.outcome !== "PREPARED" || next.erasureId === null) break;
      if (completed.has(next.erasureId)) return "CONTENDED";
      completed.add(next.erasureId);
      outcome = await this.completePrepared(next.erasureId, input.source);
    }
    return outcome;
  }

  private async completePrepared(
    erasureId: string,
    source: AuthSourceContext
  ): Promise<PrivateRunErasureOutcome> {
    const manifest = await this.repository.manifest(erasureId);
    if (manifest === null) {
      return await this.repository.status(erasureId) === "CLEANED" ? "CLEANED" : "NOT_FOUND";
    }
    // NV-10: a record-less directory the private-erasure manifest names holds nothing usable; it is destroyed below.
    const manifestOwner = await this.runs.exists(manifest.runId) ? await recordedOwnerRef(this.runs, manifest.runId) : null;
    if (manifestOwner !== null && manifestOwner !== manifest.ownerRef) {
      return "INVALID_EVIDENCE";
    }
    if (manifest.cleanupPublicationRefs.length > 0 && this.publications === undefined) {
      return "INVALID_EVIDENCE";
    }
    for (const publicationRef of manifest.cleanupPublicationRefs) {
      const absent = await this.repository.withPublicationLease(publicationRef,async () => {
        await this.publications!.destroy(publicationRef);
        return !await this.publications!.exists(publicationRef);
      });
      if (!absent) return "INVALID_EVIDENCE";
    }
    const destroyResult = await this.runs.destroy(manifest.runId);
    if (await this.runs.exists(manifest.runId)) return "INVALID_EVIDENCE";

    const completedAt = new Date();
    const finalized = await this.repository.finalize({
      erasureId,
      keyCleanupCompletedAt: completedAt,
      occurredAt: completedAt,
      source,
      destroyedKeyCount: destroyResult === "DESTROYED" ? 1 : 0,
      alreadyAbsentKeyCount: destroyResult === "ALREADY_ABSENT" ? 1 : 0
    });
    if (finalized !== "COMMITTED" && finalized !== "CLEANED") return finalized;
    return "CLEANED";
  }

  async reconcile(source: AuthSourceContext, limit = 100): Promise<readonly Readonly<{
    erasureId: string;
    outcome: PrivateRunErasureOutcome;
    diagnosticStage?: AccountErasureReconcileStage;
  }>[]> {
    const outcomes: {
      erasureId: string;
      outcome: PrivateRunErasureOutcome;
      diagnosticStage?: AccountErasureReconcileStage;
    }[] = [];
    for (const erasureId of await this.repository.pendingCleanup(limit)) {
      try {
        outcomes.push({ erasureId, outcome: await this.completePrepared(erasureId, source) });
      } catch {
        // Same shape as the two catches above: the cause stays discarded, the
        // stage names which catch produced the item.
        outcomes.push({
          erasureId,
          outcome: "INVALID_EVIDENCE",
          diagnosticStage: "private-run-cleanup-complete"
        });
      }
    }
    return Object.freeze(outcomes.map((outcome) => Object.freeze(outcome)));
  }
}
