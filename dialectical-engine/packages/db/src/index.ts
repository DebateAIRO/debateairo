import { readFile, readdir } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import pg from "pg";
import type {
  ContentCarrier,
  ContentCipher,
  CryptoEnvelope,
  PreparedRunContentCipher
} from "@debateai/crypto";
import { TypedDomainError, type ActivationState, type CompositionBudgetTier, type RiskTier, type TierSource } from "@debateai/kernel";

export {
  PostgresSessionRepository,
  type LoginChallengeRecord,
  type LoginIdentityRecord,
  type SessionAuthenticationRecord,
  type SessionListRecord
} from "./sessions.js";

export {
  PostgresLegacyRunClaimRepository,
  type LegacyRunClaimOutcome
} from "./legacy-claim.js";

export {
  assertPublicationCleanupDatabaseRole,
  assertPublicationDatabaseRoleSeparation,
  PostgresPublicationRepository,
  type PublicationTransitionInput,
  type PublishTransitionInput,
  type PublicSnapshotRecord
} from "./publication.js";

export {
  AccountErasureCoordinator,
  assertAccountErasureDatabaseRole,
  PostgresAccountErasureRepository,
  PostgresPrivateRunErasureRepository,
  PrivateRunErasureCoordinator,
  type AccountErasureNotificationClaim,
  type AccountErasurePreview,
  type AccountErasureStatus,
  type AccountErasureTransitionOutcome,
  type PrivateRunErasureOutcome,
  type RunKeyProvisionCleanup
} from "./account-erasure.js";

const { Pool: PgPool } = pg;
const writeTransaction = new AsyncLocalStorage<boolean>();
const contentLeaseScope = new AsyncLocalStorage<Readonly<{
  pool: Pool;
  lease: RunContentLease;
}>>();
const ownerAskAdmissionScope = new AsyncLocalStorage<Readonly<{
  lease: OwnerAskAdmissionLease;
}>>();
const DATABASE_POOL_FAILED = "DATABASE_POOL_FAILED";
const wrappedPoolClients = new WeakSet<PoolClient>();
const contentCiphers = new WeakMap<Pool, ContentCipher>();

export const CONTENT_CIPHERTEXT_SENTINEL = "⟦DEBATEAI:CIPHERTEXT:V1⟧" as const;
export const CONTENT_JSON_SENTINEL = Object.freeze({ ciphertext: true, v: 1 }) as Readonly<{
  readonly ciphertext: true;
  readonly v: 1;
}>;
// Removing deterministic private plaintext locators requires decrypt-and-compare
// lookup. Keep that work bounded before a session advisory lease or external
// key load is attempted; callers query MAX+1 to distinguish saturation from an
// exact, complete candidate set without silently truncating it.
export const MAX_OWNER_PRIVATE_HISTORY_SCAN = 128 as const;

export function configureContentEncryption(pool: Pool, cipher: ContentCipher): void {
  if (contentCiphers.has(pool)) throw new TypeError("CONTENT_CIPHER_ALREADY_CONFIGURED");
  contentCiphers.set(pool, cipher);
}

export function contentCipherFor(pool: Pool): ContentCipher | undefined {
  return contentCiphers.get(pool);
}

const CONTENT_PROVISION_SIGNATURES = Object.freeze([
  "core.prepare_run_key_provision(uuid,uuid,uuid,uuid)",
  "core.lock_run_key_provision_for_commit(uuid,uuid,uuid,uuid)",
  "core.complete_run_key_provision(uuid,uuid,uuid,uuid)",
  "core.create_encrypted_run(jsonb,uuid,uuid,jsonb)",
  "core.claim_run_key_provision_cleanup(integer)",
  "core.complete_run_key_provision_cleanup(uuid,uuid)"
] as const);
const CONTENT_PROVISION_FORBIDDEN_ROLES = Object.freeze([
  "public",
  "debateai_runtime",
  "debateai_authorization_runtime",
  "debateai_erasure_runtime",
  "debateai_publication_cleanup",
  "debateai_replay"
] as const);

type ContentProvisionRoleWitness = Readonly<{
  sessionPrincipal: string;
  principal: string;
  superuser: boolean;
  createRole: boolean;
  createDatabase: boolean;
  replication: boolean;
  bypassRls: boolean;
  contentMember: boolean;
  crossedRole: boolean;
  dangerousBuiltinMember: boolean;
  ownsDatabaseOrSchema: boolean;
  anyTablePrivilege: boolean;
  exactFunctionCount: number;
  forbiddenFunctionPrivilege: boolean;
}>;

async function readContentProvisionRoleWitness(pool: Pool): Promise<ContentProvisionRoleWitness> {
  const result = await pool.query<{
    session_principal: string;
    principal: string;
    rolsuper: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    content_member: boolean;
    crossed_role: boolean;
    dangerous_builtin_member: boolean;
    owns_database_or_schema: boolean;
    any_table_privilege: boolean;
    exact_function_count: string;
    forbidden_function_privilege: boolean;
  }>(`
    SELECT session_user AS session_principal,current_user AS principal,
      role.rolsuper,role.rolcreaterole,role.rolcreatedb,role.rolreplication,
      role.rolbypassrls,
      pg_has_role(current_user,'debateai_content_provision','USAGE') AS content_member,
      (pg_has_role(current_user,'debateai_runtime','MEMBER')
        OR pg_has_role(current_user,'debateai_authorization_runtime','MEMBER')
        OR pg_has_role(current_user,'debateai_erasure_runtime','MEMBER')
        OR pg_has_role(current_user,'debateai_publication_cleanup','MEMBER')
        OR pg_has_role(current_user,'debateai_replay','MEMBER')) AS crossed_role,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS elevated
        WHERE left(elevated.rolname,3)='pg_'
          AND (pg_has_role(current_user,elevated.oid,'MEMBER')
            OR pg_has_role(current_user,elevated.oid,'USAGE'))
      ) AS dangerous_builtin_member,
      (EXISTS (SELECT 1 FROM pg_catalog.pg_database AS database
          WHERE database.datname=current_database() AND database.datdba=role.oid)
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace AS namespace
          WHERE namespace.nspname=ANY(ARRAY[
            'identity','core','ledger','serve','scorecard','register','memory','evidence','evaluator'
          ]) AND namespace.nspowner=role.oid)) AS owns_database_or_schema,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname=ANY(ARRAY[
          'identity','core','ledger','serve','scorecard','register','memory','evidence','evaluator'
        ]) AND relation.relkind IN ('r','p')
          AND has_table_privilege(current_user,relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      ) AS any_table_privilege,
      (SELECT count(*)::text FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
        WHERE namespace.nspname='core'
          AND has_function_privilege(current_user,procedure.oid,'EXECUTE')) AS exact_function_count,
      EXISTS (
        SELECT 1
        FROM unnest($1::text[]) AS forbidden_role(role_name)
        CROSS JOIN unnest($2::text[]) AS capability(signature)
        WHERE has_function_privilege(
          forbidden_role.role_name,capability.signature,'EXECUTE'
        )
      ) AS forbidden_function_privilege
    FROM pg_catalog.pg_roles AS role WHERE role.rolname=current_user
  `,[CONTENT_PROVISION_FORBIDDEN_ROLES,CONTENT_PROVISION_SIGNATURES]);
  const row = result.rows[0];
  if (row === undefined) throw new TypeError("CONTENT_PROVISION_DATABASE_ROLE_ATTESTATION_FAILED");
  return Object.freeze({
    sessionPrincipal: row.session_principal,
    principal: row.principal,
    superuser: row.rolsuper,
    createRole: row.rolcreaterole,
    createDatabase: row.rolcreatedb,
    replication: row.rolreplication,
    bypassRls: row.rolbypassrls,
    contentMember: row.content_member,
    crossedRole: row.crossed_role,
    dangerousBuiltinMember: row.dangerous_builtin_member,
    ownsDatabaseOrSchema: row.owns_database_or_schema,
    anyTablePrivilege: row.any_table_privilege,
    exactFunctionCount: Number(row.exact_function_count),
    forbiddenFunctionPrivilege: row.forbidden_function_privilege
  });
}

export async function assertContentProvisionDatabaseRole(
  runtimePool: Pool,
  provisionPool: Pool
): Promise<void> {
  const [runtimePrincipal,provision] = await Promise.all([
    runtimePool.query<{ principal: string; provision_capabilities: boolean[] }>(`
      SELECT current_user AS principal,
        ARRAY(
          SELECT has_function_privilege(current_user,capability.signature,'EXECUTE')
          FROM unnest($1::text[]) AS capability(signature)
        ) AS provision_capabilities
    `,[CONTENT_PROVISION_SIGNATURES]),
    readContentProvisionRoleWitness(provisionPool)
  ]);
  const exactFunctions = await Promise.all(CONTENT_PROVISION_SIGNATURES.map(async (signature) =>
    (await provisionPool.query<{ allowed: boolean }>(
      "SELECT has_function_privilege(current_user,$1,'EXECUTE') AS allowed",
      [signature]
    )).rows[0]?.allowed === true
  ));
  if (runtimePrincipal.rows[0] === undefined
    || runtimePrincipal.rows[0].principal === provision.principal
    || runtimePrincipal.rows[0].provision_capabilities.length
      !== CONTENT_PROVISION_SIGNATURES.length
    || runtimePrincipal.rows[0].provision_capabilities.some((allowed) => allowed)
    || provision.sessionPrincipal !== provision.principal
    || provision.superuser || provision.createRole || provision.createDatabase
    || provision.replication || provision.bypassRls
    || !provision.contentMember || provision.crossedRole || provision.dangerousBuiltinMember
    || provision.ownsDatabaseOrSchema || provision.anyTablePrivilege
    || provision.forbiddenFunctionPrivilege
    || provision.exactFunctionCount !== CONTENT_PROVISION_SIGNATURES.length
    || exactFunctions.some((allowed) => !allowed)) {
    throw new TypeError("CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED");
  }
}

export async function runUsesContentEncryption(
  pool: Pick<Pool, "query"> | PoolClient,
  runId: string
): Promise<boolean> {
  const result = await pool.query<{ enabled: boolean }>(
    "SELECT content_encryption_version=1 AS enabled FROM core.run WHERE run_id=$1",
    [runId]
  );
  return result.rows[0]?.enabled === true;
}

const CONTENT_LEASE_NAMESPACE = "debateai:run-content-lease:v1:" as const;

export interface RunContentLease {
  readonly runIds: readonly string[];
  readonly client: PoolClient;
  assertLive(): Promise<void>;
  invalidate(error: Error): void;
  release(): Promise<void>;
}

export async function acquireRunContentLease(
  pool: Pool,
  requestedRunIds: readonly string[]
): Promise<RunContentLease> {
  const runIds = Object.freeze([...new Set(requestedRunIds)].sort());
  if (runIds.length === 0) throw new TypeError("CONTENT_LEASE_RUN_REQUIRED");
  const client = await pool.connect();
  const acquired: string[] = [];
  let released = false;
  let invalidated: Error | undefined;
  const unlock = async (): Promise<void> => {
    if (released) return;
    released = true;
    let failure: unknown = invalidated;
    for (const runId of [...acquired].reverse()) {
      try {
        const result = await client.query<{ unlocked: boolean }>(
          "SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked",
          [`${CONTENT_LEASE_NAMESPACE}${runId}`]
        );
        if (result.rows[0]?.unlocked !== true) {
          failure ??= new TypeError("CONTENT_LEASE_UNLOCK_FAILED");
        }
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure === undefined) client.release();
    else client.release(failure instanceof Error ? failure : new Error("CONTENT_LEASE_UNLOCK_FAILED"));
    if (failure !== undefined) throw failure;
  };
  try {
    for (const runId of runIds) {
      await client.query(
        "SELECT pg_advisory_lock(hashtextextended($1,0))",
        [`${CONTENT_LEASE_NAMESPACE}${runId}`]
      );
      acquired.push(runId);
    }
    return Object.freeze({
      runIds,
      client,
      invalidate: (error: Error) => {
        invalidated ??= error;
      },
      assertLive: async () => {
        const result = await client.query<{ run_id: string; live: boolean }>(
          `SELECT run.run_id,
                  CASE WHEN run.content_encryption_version=1
                    THEN core.run_private_content_is_live(run.run_id)
                    ELSE true END AS live
           FROM core.run AS run
           WHERE run.run_id=ANY($1::uuid[])
           ORDER BY run.run_id`,
          [runIds]
        );
        if (result.rows.length !== runIds.length
          || result.rows.some((row) => row.live !== true)) {
          throw new TypedDomainError(
            "PRIVATE_CONTENT_ERASED",
            "Private content is no longer available"
          );
        }
      },
      release: unlock
    });
  } catch (error) {
    await unlock().catch(() => undefined);
    throw error;
  }
}

export async function withRunContentLease<T>(
  pool: Pool,
  runIds: readonly string[],
  use: (lease: RunContentLease) => Promise<T>
): Promise<T> {
  const current = contentLeaseScope.getStore();
  const requested = [...new Set(runIds)].sort();
  if (current?.pool === pool) {
    if (!requested.every((runId) => current.lease.runIds.includes(runId))) {
      throw new TypedDomainError(
        "CONTENT_LEASE_SCOPE_EXPANSION_FORBIDDEN",
        "A nested private-content lease cannot expand its run scope"
      );
    }
    await current.lease.assertLive();
    const value = await use(current.lease);
    await current.lease.assertLive();
    return value;
  }
  const lease = await acquireRunContentLease(pool, runIds);
  try {
    await lease.assertLive();
    const value = await contentLeaseScope.run(
      Object.freeze({ pool, lease }),
      () => use(lease)
    );
    await lease.assertLive();
    return value;
  } finally {
    await lease.release();
  }
}

export {
  acquirePublicationContentLease,
  withPublicationContentLease,
  type PublicationContentLease
} from "./publication-lease.js";

export interface LeasedPreparedRunContentCipher {
  readonly prepared: PreparedRunContentCipher | null;
  readonly lease: RunContentLease;
  assertLive(): Promise<void>;
  close(): Promise<void>;
}

export async function prepareLeasedContentEncryptionForRuns(
  pool: Pool,
  requestedRunIds: readonly string[]
): Promise<ReadonlyMap<string, LeasedPreparedRunContentCipher>> {
  const requested = [...new Set(requestedRunIds)].sort();
  const current = contentLeaseScope.getStore();
  if (current?.pool === pool
    && !requested.every((runId) => current.lease.runIds.includes(runId))) {
    throw new TypedDomainError(
      "CONTENT_LEASE_SCOPE_EXPANSION_FORBIDDEN",
      "A nested private-content lease cannot expand its run scope"
    );
  }
  const borrowed = current?.pool === pool;
  const lease = borrowed ? current.lease : await acquireRunContentLease(pool, requested);
  const preparedByRun = new Map<string, PreparedRunContentCipher | null>();
  try {
    await lease.assertLive();
    const cipher = contentCipherFor(pool);
    for (const runId of requested) {
      const enabled = await runUsesContentEncryption(lease.client, runId);
      if (!enabled) {
        preparedByRun.set(runId, null);
        continue;
      }
      if (cipher === undefined) {
        throw new TypedDomainError(
          "CONTENT_CIPHER_UNAVAILABLE",
          "Encrypted content cannot be read without the external key store"
        );
      }
      preparedByRun.set(runId, await cipher.prepareRun(runId));
    }
    await lease.assertLive();
    let closed = false;
    const closeAll = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      for (const prepared of preparedByRun.values()) prepared?.close();
      if (!borrowed) await lease.release();
    };
    const result = new Map<string, LeasedPreparedRunContentCipher>();
    for (const runId of requested) {
      result.set(runId, Object.freeze({
        prepared: preparedByRun.get(runId) ?? null,
        lease,
        assertLive: lease.assertLive,
        close: closeAll
      }));
    }
    return result;
  } catch (error) {
    for (const prepared of preparedByRun.values()) prepared?.close();
    if (!borrowed) await lease.release().catch(() => undefined);
    throw error;
  }
}

export async function prepareLeasedContentEncryptionForRun(
  pool: Pool,
  runId: string
): Promise<LeasedPreparedRunContentCipher> {
  const leased = await prepareLeasedContentEncryptionForRuns(pool, [runId]);
  return leased.get(runId)!;
}

export async function encryptContentForRun(
  pool: Pool,
  runId: string,
  carrier: ContentCarrier,
  primaryKey: string,
  value: unknown
): Promise<CryptoEnvelope | null> {
  if (contentCipherFor(pool) === undefined) return null;
  const leased = await prepareLeasedContentEncryptionForRun(pool, runId);
  try {
    const encrypted = leased.prepared?.encrypt(carrier, primaryKey, value) ?? null;
    await leased.assertLive();
    return encrypted;
  } finally {
    await leased.close();
  }
}

export async function assertPrivateContentLive(
  pool: Pick<Pool, "query"> | PoolClient,
  runId: string
): Promise<void> {
  const result = await pool.query<{ live: boolean }>(
    "SELECT core.run_private_content_is_live($1) AS live",
    [runId]
  );
  if (result.rows[0]?.live !== true) {
    throw new TypedDomainError("PRIVATE_CONTENT_ERASED", "Private content is no longer available");
  }
}

export function encryptLeasedContentForRun(
  leased: LeasedPreparedRunContentCipher,
  carrier: ContentCarrier,
  primaryKey: string,
  value: unknown
): CryptoEnvelope | null {
  const prepared = leased.prepared;
  if (prepared === null) return null;
  return prepared.encrypt(carrier, primaryKey, value);
}

export type AttestedContentEnvelope = Readonly<{
  envelope: CryptoEnvelope;
  attestation: Buffer;
}>;

export function encryptAttestedLeasedContentForRun(
  leased: LeasedPreparedRunContentCipher,
  carrier: ContentCarrier,
  primaryKey: string,
  value: unknown
): AttestedContentEnvelope | null {
  const prepared = leased.prepared;
  if (prepared === null) return null;
  const envelope = prepared.encrypt(carrier, primaryKey, value);
  return Object.freeze({
    envelope,
    attestation: prepared.attestEnvelope(carrier,primaryKey,"content_ciphertext",envelope)
  });
}

export async function encryptAttestedContentForRun(
  pool: Pool,
  runId: string,
  carrier: ContentCarrier,
  primaryKey: string,
  value: unknown
): Promise<AttestedContentEnvelope | null> {
  if (contentCipherFor(pool) === undefined) return null;
  const leased = await prepareLeasedContentEncryptionForRun(pool,runId);
  try {
    const encrypted = encryptAttestedLeasedContentForRun(
      leased,carrier,primaryKey,value
    );
    await leased.assertLive();
    return encrypted;
  } finally {
    await leased.close();
  }
}

export function decryptLeasedContentForRun<T>(
  leased: LeasedPreparedRunContentCipher,
  carrier: ContentCarrier,
  primaryKey: string,
  envelope: CryptoEnvelope | null,
  legacyValue: T
): T {
  if (envelope === null) return legacyValue;
  const prepared = leased.prepared;
  if (prepared === null) {
    throw new TypedDomainError(
      "CONTENT_CIPHER_UNAVAILABLE",
      "Encrypted content cannot be read without the external key store"
    );
  }
  return prepared.decrypt<T>(carrier, primaryKey, envelope);
}

export function assertContentCipherAvailable(pool: Pool): ContentCipher {
  const cipher = contentCipherFor(pool);
  if (cipher === undefined) {
    throw new TypedDomainError("CONTENT_CIPHER_UNAVAILABLE", "Encrypted content cannot be written without the external key store");
  }
  return cipher;
}

export async function decryptContentForRun<T>(
  pool: Pool,
  runId: string,
  carrier: ContentCarrier,
  primaryKey: string,
  envelope: CryptoEnvelope | null,
  legacyValue: T
): Promise<T> {
  if (envelope === null) return legacyValue;
  const leased = await prepareLeasedContentEncryptionForRun(pool, runId);
  try {
    if (leased.prepared === null) {
      throw new TypedDomainError(
        "CONTENT_CIPHER_UNAVAILABLE",
        "Encrypted content cannot be read without the external key store"
      );
    }
    const value = leased.prepared.decrypt<T>(carrier, primaryKey, envelope);
    await leased.assertLive();
    return value;
  } finally {
    await leased.close();
  }
}

async function contentEncryptionSchemaIsApplied(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ applied: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='core' AND table_name='run'
         AND column_name='content_encryption_version'
     ) AS applied`
  );
  return result.rows[0]?.applied === true;
}

type UntypedMethod = (...args: unknown[]) => unknown;

function typedPoolFailure(error: unknown): TypedDomainError {
  if (error instanceof TypedDomainError && error.code === DATABASE_POOL_FAILED) return error;
  const detail = error instanceof Error ? error.message : String(error);
  return new TypedDomainError(DATABASE_POOL_FAILED, `PostgreSQL pool operation failed: ${detail}`);
}

function typedQueryFailure(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return error;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = error instanceof Error ? error.message : "";
  const connectionFailure = code.startsWith("08")
    || ["57P01", "57P02", "57P03", "ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT"].includes(code)
    || /connection (?:terminated|reset)|server closed the connection|terminating connection due to administrator command/i.test(message);
  return connectionFailure ? typedPoolFailure(error) : error;
}

function rejectKnownFailure(args: readonly unknown[], failure: TypedDomainError): unknown {
  const callback = args.at(-1);
  if (typeof callback === "function") {
    queueMicrotask(() => callback(failure));
    return undefined;
  }
  return Promise.reject(failure);
}

function wrapClientQueries(client: PoolClient): PoolClient {
  if (wrappedPoolClients.has(client)) return client;
  const mutableClient = client as unknown as { query: UntypedMethod };
  const query = mutableClient.query.bind(client);
  mutableClient.query = (...args: unknown[]): unknown => {
    const callback = args.at(-1);
    if (typeof callback === "function") {
      const wrappedArgs = [...args];
      wrappedArgs[wrappedArgs.length - 1] = (error: unknown, ...values: unknown[]) => {
        callback(error === undefined || error === null ? error : typedQueryFailure(error), ...values);
      };
      return query(...wrappedArgs);
    }
    try {
      const result = query(...args);
      return result instanceof Promise
        ? result.catch((error: unknown) => Promise.reject(typedQueryFailure(error)))
        : result;
    } catch (error) {
      throw typedQueryFailure(error);
    }
  };
  wrappedPoolClients.add(client);
  return client;
}

export function createPool(connectionString: string): Pool {
  const pool = new PgPool({ connectionString });
  let terminalFailure: TypedDomainError | undefined;

  pool.on("error", (error: Error) => {
    terminalFailure ??= typedPoolFailure(error);
    console.error(`[${DATABASE_POOL_FAILED}] ${terminalFailure.message}`);
  });

  const mutablePool = pool as unknown as { query: UntypedMethod; connect: UntypedMethod };
  const query = mutablePool.query.bind(pool);
  mutablePool.query = (...args: unknown[]): unknown => {
    if (terminalFailure !== undefined) return rejectKnownFailure(args, terminalFailure);
    const callback = args.at(-1);
    if (typeof callback === "function") {
      const wrappedArgs = [...args];
      wrappedArgs[wrappedArgs.length - 1] = (error: unknown, ...values: unknown[]) => {
        callback(error === undefined || error === null ? error : typedQueryFailure(error), ...values);
      };
      return query(...wrappedArgs);
    }
    try {
      const result = query(...args);
      return result instanceof Promise
        ? result.catch((error: unknown) => Promise.reject(typedQueryFailure(error)))
        : result;
    } catch (error) {
      throw typedQueryFailure(error);
    }
  };

  const connect = mutablePool.connect.bind(pool);
  mutablePool.connect = (...args: unknown[]): unknown => {
    if (terminalFailure !== undefined) return rejectKnownFailure(args, terminalFailure);
    const callback = args.at(-1);
    if (typeof callback === "function") {
      return connect((error: unknown, client: PoolClient | undefined, release: unknown) => {
        callback(
          error === undefined || error === null ? error : typedPoolFailure(error),
          client === undefined ? undefined : wrapClientQueries(client),
          release
        );
      });
    }
    try {
      const result = connect();
      return result instanceof Promise
        ? result.then((client: PoolClient) => wrapClientQueries(client))
          .catch((error: unknown) => Promise.reject(typedPoolFailure(error)))
        : result;
    } catch (error) {
      throw typedPoolFailure(error);
    }
  };

  return pool;
}

export async function migrate(pool: Pool): Promise<void> {
  const directory = new URL("../../../migrations/", import.meta.url);
  const migrations = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('debateai:schema-migrations', 0))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.debateai_schema_migration (
        name text PRIMARY KEY CHECK (length(btrim(name)) > 0),
        applied_at timestamptz NOT NULL
      )
    `);
    for (const name of migrations) {
      const applied = await client.query("SELECT 1 FROM public.debateai_schema_migration WHERE name=$1", [name]);
      if (applied.rowCount !== 0) continue;
      await client.query(await readFile(new URL(name, directory), "utf8"));
      await client.query(
        "INSERT INTO public.debateai_schema_migration (name, applied_at) VALUES ($1, statement_timestamp())",
        [name]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withWriteTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await writeTransaction.run(true, () => operation(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function assertNoOpenWriteTransaction(): void {
  if (writeTransaction.getStore() === true) {
    throw new TypedDomainError("PROVIDER_CALL_INSIDE_TRANSACTION", "A provider call cannot run inside a write transaction");
  }
}

export async function allocateSequence(client: PoolClient): Promise<number> {
  const result = await client.query<{ sequence: string }>("SELECT ledger.allocate_sequence() AS sequence");
  const value = result.rows[0]?.sequence;
  if (value === undefined) throw new TypedDomainError("SEQUENCE_ALLOCATION_FAILED", "No sequence was allocated");
  return Number(value);
}

export interface InitialBatteryRow {
  readonly batteryRowId: string;
  readonly predicateRef: string;
  readonly openingState: ActivationState;
  readonly predicateInputs: Readonly<Record<string, unknown>>;
  readonly skipEvidence: Readonly<Record<string, unknown>> | null;
}

export interface StartRunInput {
  readonly questionLine: string;
  readonly principal: RunCreationPrincipal;
  readonly sessionId: string;
  readonly callerScope: "ASKER" | "OPERATOR";
  readonly asOf: Date;
  readonly askerRiskTier: RiskTier;
  readonly effectiveRiskTier: RiskTier;
  readonly tierSource: TierSource;
  readonly tierProvenanceRef: string;
  readonly compositionBudgetTier: CompositionBudgetTier;
  readonly depthParams: Readonly<Record<string, unknown>>;
  readonly discoveredPanel: readonly DiscoveredPanelMember[];
  readonly strangerSampleRate: number;
  readonly envelopeBasis: Readonly<Record<string, unknown>>;
  readonly registerVersion: number;
  readonly batteryVersion: string;
  readonly batteryRows: readonly InitialBatteryRow[];
  readonly askContract?: Readonly<Record<string, unknown>>;
}

export type RunCreationPrincipal =
  | Readonly<{ readonly kind: "server"; readonly userId: string; readonly ownerRef: string }>
  | Readonly<{ readonly kind: "legacy"; readonly legacyAskerId: string }>;

export interface RunOwnershipAccess {
  readonly ownerRef: string | null;
  readonly legacyAskerId: string | null;
}

export type RunOwnershipInput = RunOwnershipAccess | string;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RAW_USER_ASKER = /^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESERVED_IDENTITY_ASKER = /^(?:user|owner):/i;

export function normalizeRunOwnership(input: RunOwnershipInput): RunOwnershipAccess {
  const candidate = typeof input === "string"
    ? { ownerRef: null, legacyAskerId: input }
    : input;
  const ownerRef = candidate.ownerRef;
  const legacyAskerId = candidate.legacyAskerId;
  const hasOwner = ownerRef !== null;
  const hasLegacy = legacyAskerId !== null;
  if (hasOwner === hasLegacy) throw new TypeError("RUN_OWNERSHIP_PRINCIPAL_INVALID");
  if (hasOwner && !UUID_V4.test(ownerRef)) throw new TypeError("RUN_OWNER_REF_INVALID");
  if (hasLegacy && (legacyAskerId.trim() === "" || RESERVED_IDENTITY_ASKER.test(legacyAskerId))) {
    throw new TypeError("RUN_LEGACY_ASKER_INVALID");
  }
  return Object.freeze({ ownerRef, legacyAskerId });
}

const OWNER_ASK_ADMISSION_NAMESPACE = "debateai:owner-ask-admission:v1:" as const;

export interface OwnerAskAdmissionLease {
  readonly key: string;
  readonly client: PoolClient;
  release(): Promise<void>;
}

function ownerAskAdmissionKey(input:RunOwnershipInput):string {
  const access=normalizeRunOwnership(input);
  return access.ownerRef !== null
    ? `${OWNER_ASK_ADMISSION_NAMESPACE}owner:${access.ownerRef}`
    : `${OWNER_ASK_ADMISSION_NAMESPACE}legacy:${access.legacyAskerId!}`;
}

export async function acquireOwnerAskAdmissionLease(
  pool:Pool,input:RunOwnershipInput
):Promise<OwnerAskAdmissionLease> {
  const key=ownerAskAdmissionKey(input);
  const client=await pool.connect();
  let acquired=false;
  let released=false;
  let backendFailure:Error|undefined;
  const reportBackendFailure=(error:Error):void => { backendFailure ??= error; };
  client.on("error",reportBackendFailure);
  const release=async ():Promise<void> => {
    if (released) return;
    released=true;
    let failure:unknown=backendFailure;
    if (failure === undefined && acquired) {
      try {
        const result=await client.query<{ unlocked:boolean }>(
          "SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked",[key]
        );
        if (result.rows[0]?.unlocked !== true) {
          failure=new TypeError("OWNER_ASK_ADMISSION_LEASE_UNLOCK_FAILED");
        }
      } catch (error) {
        failure=error;
      }
    }
    client.removeListener("error",reportBackendFailure);
    if (failure === undefined) client.release();
    else client.release(failure instanceof Error
      ? failure : new Error("OWNER_ASK_ADMISSION_LEASE_UNLOCK_FAILED"));
    if (failure !== undefined) throw failure;
  };
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtextextended($1,0))",[key]
    );
    acquired=true;
    return Object.freeze({ key,client,release });
  } catch (error) {
    await release().catch(() => undefined);
    throw error;
  }
}

export async function withOwnerAskAdmissionLease<T>(
  pool:Pool,input:RunOwnershipInput,
  use:(lease:OwnerAskAdmissionLease)=>Promise<T>
):Promise<T> {
  const key=ownerAskAdmissionKey(input);
  const current=ownerAskAdmissionScope.getStore();
  if (current !== undefined) {
    if (current.lease.key !== key) {
      throw new TypedDomainError(
        "OWNER_ASK_ADMISSION_SCOPE_EXPANSION_FORBIDDEN",
        "A nested ask admission lease cannot change owner scope"
      );
    }
    return use(current.lease);
  }
  const lease=await acquireOwnerAskAdmissionLease(pool,input);
  try {
    return await ownerAskAdmissionScope.run(
      Object.freeze({ lease }),() => use(lease)
    );
  } finally {
    await lease.release();
  }
}

export interface DiscoveredPanelMember {
  readonly provider_ref: string;
  readonly maker: string;
  readonly model_id: string;
  readonly probe_evidence_ref: string;
  readonly probed_at: string;
}

export interface ProviderProbeRecord {
  readonly probeEvidenceRef: string;
  readonly providerRef: string;
  readonly maker: string;
  readonly state: "HEALTHY" | "ABSENT";
  readonly modelId: string | null;
  readonly failureCode: string | null;
  readonly probedAt: Date;
}

export class ProviderProbeRepository {
  constructor(private readonly pool: Pool) {}

  async record(input: ProviderProbeRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO core.provider_probe (
         probe_id, provider_ref, maker, state, model_id, failure_code, probed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.probeEvidenceRef, input.providerRef, input.maker, input.state,
        input.modelId, input.failureCode, input.probedAt]
    );
  }

  async readLatest(providerRefs: readonly string[]): Promise<readonly ProviderProbeRecord[]> {
    if (providerRefs.length === 0) return Object.freeze([]);
    const result = await this.pool.query<{
      probe_id: string;
      provider_ref: string;
      maker: string;
      state: "HEALTHY" | "ABSENT";
      model_id: string | null;
      failure_code: string | null;
      probed_at: Date;
    }>(
      `SELECT DISTINCT ON (provider_ref)
         probe_id, provider_ref, maker, state, model_id, failure_code, probed_at
       FROM core.provider_probe
       WHERE provider_ref=ANY($1::text[])
       ORDER BY provider_ref, probed_at DESC, probe_id DESC`,
      [providerRefs]
    );
    return Object.freeze(result.rows.map((row) => Object.freeze({
      probeEvidenceRef: row.probe_id,
      providerRef: row.provider_ref,
      maker: row.maker,
      state: row.state,
      modelId: row.model_id,
      failureCode: row.failure_code,
      probedAt: row.probed_at
    })));
  }
}

export interface CurrentRunState {
  readonly phase: "EMPIRICAL" | "VALUE";
  readonly envelopeState: "WITHIN" | "ENRICHMENT_SKIPPED" | "EXHAUSTED";
  readonly envelopeConsumed: number;
  readonly activations: readonly {
    readonly batteryRowId: string;
    readonly state: ActivationState;
    readonly atSeq: number;
  }[];
}

export interface RunLoadingProjection {
  readonly runRef: string;
  readonly questionLine: string;
  readonly state: "QUEUED" | "CLAIMED" | "RUNNING" | "HOLDING" | "SETTLED" | "FAILED";
  readonly terminalReason: string | null;
  readonly holdUntil: Date | null;
}

export interface RunLifecycleEventValue {
  readonly state: "COOLDOWN_HOLD" | "COOLDOWN_RETRY" | "MAKER_POSITION_HALTED" | "EXPANSION_HALTED" | "REVIEW_HALTED";
  readonly call_site_key: string;
  readonly parent_node_ref: string | null;
  readonly hold_ms: number;
  readonly hold_until: string | null;
  readonly attempts_spent: number;
  readonly transport_outcome: "TIMED_OUT" | "FAILED";
  readonly planned_leg_count: number;
}

export interface CompletionActivationResolution {
  readonly batteryRowId: string;
  readonly state: Exclude<ActivationState, "WAIT">;
  readonly predicateInputs: Readonly<Record<string, unknown>>;
  readonly skipEvidence: Readonly<Record<string, unknown>> | null;
}

export class RunRepository {
  constructor(
    private readonly pool: Pool,
    private readonly provisionPool: Pool = pool
  ) {}

  async countCooldownHolds(runId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM core.run_progress_event
       WHERE run_id=$1 AND kind='node.retrying'
         AND value_json->>'state'='COOLDOWN_HOLD'`,
      [runId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async recordRunLifecycleEvent(input: {
    readonly runId: string;
    readonly kind: "node.retrying" | "ledger.could_not_do";
    readonly value: RunLifecycleEventValue;
  }): Promise<void> {
    await withWriteTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
         VALUES ($1,$2,$3,$4::jsonb)`,
        [input.runId, await allocateSequence(client), input.kind, JSON.stringify(input.value)]
      );
    });
  }

  async startRun(
    input: StartRunInput,
    admissionClient?: PoolClient
  ): Promise<string> {
    const runId = randomUUID();
    const cipher = contentCipherFor(this.pool);
    let contentKeyProvisioned = false;
    let commitAttempted = false;
    let transactionStarted = false;
    let client: PoolClient | undefined;
    let ownsClient = false;
    const askerId = input.principal.kind === "server"
      ? `owner:${input.principal.ownerRef}`
      : input.principal.legacyAskerId;
    if (input.principal.kind === "legacy") {
      if (RAW_USER_ASKER.test(askerId)) {
        throw new TypedDomainError("RUN_OWNER_RAW_ID_FORBIDDEN", "Raw user identifiers cannot enter immutable run rows");
      }
      try {
        normalizeRunOwnership(Object.freeze({ ownerRef: null, legacyAskerId: askerId }));
      } catch {
        throw new TypedDomainError("RUN_LEGACY_ASKER_INVALID", "Legacy runs cannot use a reserved identity scope");
      }
    } else if (!UUID_V4.test(input.principal.ownerRef)) {
      throw new TypedDomainError("RUN_OWNER_REF_INVALID", "The run scope must carry the authenticated opaque owner reference");
    }
    const askContract = input.askContract ?? {};
    let storedQuestionLine = input.questionLine;
    let storedAskContract: Readonly<Record<string, unknown>> = askContract;
    let contentEnvelope: CryptoEnvelope | null = null;
    let contentAttestation: Buffer | null = null;
    let contentAttestationSecret: Buffer | null = null;
    let runExecutionRef = input.sessionId;
    try {
      if (input.principal.kind === "server" && cipher !== undefined) {
        if (!UUID_V4.test(input.sessionId)) {
          throw new TypedDomainError(
            "RUN_OWNER_INVALID",
            "The authenticated session must be an opaque UUID"
          );
        }
        const provisionExecutor=admissionClient ?? this.provisionPool;
        const intent = await provisionExecutor.query<{ execution_ref: string | null }>(
          "SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS execution_ref",
          [runId,input.principal.userId,input.principal.ownerRef,input.sessionId]
        );
        if (!UUID_V4.test(intent.rows[0]?.execution_ref ?? "")) {
          throw new TypedDomainError(
            "RUN_OWNER_INVALID",
            "The authenticated owner mapping is no longer active"
          );
        }
        runExecutionRef = intent.rows[0]!.execution_ref!;
        await cipher.provisionRun(runId, {
          userId: input.principal.userId,
          ownerRef: input.principal.ownerRef
        });
        contentKeyProvisioned = true;
        const prepared = await cipher.prepareRun(runId);
        try {
          contentEnvelope = prepared.encrypt("core.run", runId, {
            questionLine: input.questionLine,
            askContract
          });
          contentAttestation = prepared.attestEnvelope(
            "core.run",runId,"content_ciphertext",contentEnvelope
          );
          contentAttestationSecret = prepared.databaseAttestationSecret();
        } finally {
          prepared.close();
        }
        storedQuestionLine = CONTENT_CIPHERTEXT_SENTINEL;
        storedAskContract = CONTENT_JSON_SENTINEL;
      }
      if (contentEnvelope !== null) {
        if (input.principal.kind !== "server") {
          throw new TypedDomainError(
            "RUN_CONTENT_ENCRYPTION_REQUIRED",
            "Encrypted runs require an authenticated owner"
          );
        }
        commitAttempted = true;
        const provisionExecutor=admissionClient ?? this.provisionPool;
        const created = await provisionExecutor.query<{ created: boolean }>(
          "SELECT core.create_encrypted_run($1::jsonb,$2,$3,$4::jsonb) AS created",
          [JSON.stringify({
            runId,
            questionLine: storedQuestionLine,
            askerId,
            executionRef: runExecutionRef,
            callerScope: input.callerScope,
            asOf: input.asOf.toISOString(),
            askerRiskTier: input.askerRiskTier,
            riskTier: input.effectiveRiskTier,
            tierSource: input.tierSource,
            tierProvenanceRef: input.tierProvenanceRef,
            compositionBudgetTier: input.compositionBudgetTier,
            depthParams: input.depthParams,
            discoveredPanel: input.discoveredPanel,
            strangerSampleRate: input.strangerSampleRate,
            envelopeBasis: input.envelopeBasis,
            registerVersion: input.registerVersion,
            batteryVersion: input.batteryVersion,
            askContract: storedAskContract,
            contentCiphertext: contentEnvelope,
            contentAttestation: contentAttestation!.toString("base64"),
            contentAttestationSecret: contentAttestationSecret!.toString("base64")
          }),input.principal.userId,input.principal.ownerRef,
          JSON.stringify(input.batteryRows.map((row)=>({
            batteryRowId:row.batteryRowId,
            predicateRef:row.predicateRef,
            openingState:row.openingState,
            predicateInputs:row.predicateInputs,
            skipEvidence:row.skipEvidence
          })))]
        );
        if (created.rows[0]?.created !== true) {
          commitAttempted = false;
          throw new TypedDomainError(
            "RUN_OWNER_INVALID",
            "The encrypted run intent is no longer active"
          );
        }
        return runId;
      }
      client = admissionClient ?? await this.pool.connect();
      ownsClient = admissionClient === undefined;
      await client.query("BEGIN");
      transactionStarted = true;
      if (input.principal.kind === "server" && contentEnvelope === null) {
        throw new TypedDomainError(
          "RUN_CONTENT_ENCRYPTION_REQUIRED",
          "Server-owned runs require the encrypted content capability"
        );
      }
      const createdAtSeq = await allocateSequence(client);
      const baseRunValues = [
        runId, storedQuestionLine, askerId, runExecutionRef, input.callerScope, input.asOf,
        input.askerRiskTier, input.effectiveRiskTier, input.tierSource, input.tierProvenanceRef,
        input.compositionBudgetTier, JSON.stringify(input.depthParams), JSON.stringify(input.discoveredPanel),
        input.strangerSampleRate, JSON.stringify(input.envelopeBasis), input.registerVersion,
        input.batteryVersion, JSON.stringify(storedAskContract), createdAtSeq
      ];
      await client.query(
        `INSERT INTO core.run (
          run_id, question_line, asker_id, session_id, caller_scope, as_of,
          asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
          composition_budget_tier, depth_params, agent_count, discovered_panel,
          stranger_sample_rate, envelope_basis, register_version,
          battery_version, ask_contract, created_at_seq
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12::jsonb, jsonb_array_length($13::jsonb), $13::jsonb, $14,
          $15::jsonb, $16, $17, $18::jsonb, $19
        )`,
        baseRunValues
      );
      await client.query(
        `INSERT INTO core.question_liveness_event (run_id, kind, occurred_at, at_seq)
         VALUES ($1,'QUERY',clock_timestamp(),$2)`,
        [runId, await allocateSequence(client)]
      );

      for (const [kind, value] of [
        ["PHASE", "EMPIRICAL"],
        ["ENVELOPE_STATE", "WITHIN"],
        ["ENVELOPE_CONSUMED", 0]
      ] as const) {
        await client.query(
          `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [runId, await allocateSequence(client), kind, JSON.stringify(value)]
        );
      }

      for (const row of input.batteryRows) {
        await client.query(
          `INSERT INTO core.run_row_activation (run_id, battery_row_id, predicate_ref)
           VALUES ($1, $2, $3)`,
          [runId, row.batteryRowId, row.predicateRef]
        );
        await client.query(
          `INSERT INTO core.run_row_activation_event (
            run_id, battery_row_id, at_seq, state, predicate_inputs, skip_evidence
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
          [
            runId, row.batteryRowId, await allocateSequence(client), row.openingState,
            JSON.stringify(row.predicateInputs),
            row.skipEvidence === null ? null : JSON.stringify(row.skipEvidence)
          ]
        );
      }
      commitAttempted = true;
      await client.query("COMMIT");
      transactionStarted = false;
      return runId;
    } catch (error) {
      if (commitAttempted) {
        throw new TypedDomainError(
          "RUN_CONTENT_ROLLBACK_INCOMPLETE",
          "Run rollback or external content-key cleanup did not complete"
        );
      }
      let rollbackIncomplete = false;
      if (client !== undefined && transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch {
          rollbackIncomplete = true;
        }
      }
      if (contentKeyProvisioned) {
        try {
          await cipher!.destroyRunKey(runId);
        } catch {
          rollbackIncomplete = true;
        }
      }
      if (rollbackIncomplete) {
        throw new TypedDomainError(
          "RUN_CONTENT_ROLLBACK_INCOMPLETE",
          "Run rollback or external content-key cleanup did not complete"
        );
      }
      throw error;
    } finally {
      contentAttestation?.fill(0);
      contentAttestationSecret?.fill(0);
      if (ownsClient) client?.release();
    }
  }

  async readLoadingProjection(runId: string, ownership: RunOwnershipInput): Promise<RunLoadingProjection | null> {
    const access = normalizeRunOwnership(ownership);
    const encryptionSchemaApplied = await contentEncryptionSchemaIsApplied(this.pool);
    const contentCiphertextProjection = encryptionSchemaApplied
      ? ", run.content_encryption_version, run.content_ciphertext"
      : "";
    const result = await this.pool.query<{
      run_id: string;
      question_line: string;
      content_encryption_version?: number | null;
      content_ciphertext?: CryptoEnvelope | null;
      state: RunLoadingProjection["state"];
      terminal_reason: string | null;
      hold_until: Date | null;
    }>(
      `SELECT run.run_id, run.question_line${contentCiphertextProjection},
         CASE
           WHEN count(work.work_item_id) = 0 THEN 'QUEUED'
           WHEN bool_or(work.state = 'FAILED') THEN 'FAILED'
           WHEN bool_or(work.state = 'CLAIMED') AND COALESCE((
             SELECT event.value_json->>'state' = 'COOLDOWN_HOLD'
               AND (event.value_json->>'hold_until')::timestamptz > clock_timestamp()
             FROM core.run_progress_event AS event
             WHERE event.run_id=run.run_id AND event.kind='node.retrying'
             ORDER BY event.at_seq DESC LIMIT 1
           ), false) THEN 'HOLDING'
           WHEN bool_or(work.state = 'CLAIMED') THEN 'RUNNING'
           WHEN bool_or(work.state = 'READY') THEN 'QUEUED'
           ELSE 'SETTLED'
         END AS state,
         (array_agg(work.terminal_reason ORDER BY work.created_at_seq DESC)
           FILTER (WHERE work.state = 'FAILED'))[1] AS terminal_reason,
         (SELECT CASE WHEN event.value_json->>'state' = 'COOLDOWN_HOLD'
                           AND (event.value_json->>'hold_until')::timestamptz > clock_timestamp()
                      THEN (event.value_json->>'hold_until')::timestamptz ELSE NULL END
          FROM core.run_progress_event AS event
          WHERE event.run_id=run.run_id AND event.kind='node.retrying'
          ORDER BY event.at_seq DESC LIMIT 1) AS hold_until
       FROM core.run AS run
       LEFT JOIN core.work_item AS work ON work.run_id = run.run_id
       WHERE run.run_id = $1 AND core.run_is_owned_by(run.run_id,$2,$3)
       GROUP BY run.run_id, run.question_line${contentCiphertextProjection}`,
      [runId, access.ownerRef, access.legacyAskerId]
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    return withRunContentLease(this.pool,[row.run_id],async () => {
    if (row.content_encryption_version === 1 && contentCipherFor(this.pool) === undefined) {
      throw new TypedDomainError(
        "CONTENT_CIPHER_UNAVAILABLE",
        "Encrypted content cannot be read without the external key store"
      );
    }
    const content = await decryptContentForRun<{ questionLine: string }>(
      this.pool, row.run_id, "core.run", row.run_id, row.content_ciphertext ?? null,
      { questionLine: row.question_line }
    );
    return Object.freeze({
      runRef: row.run_id,
      questionLine: content.questionLine,
      state: row.state,
      terminalReason: row.terminal_reason,
      holdUntil: row.hold_until
    });
    });
  }

  async readCurrentState(runId: string): Promise<CurrentRunState> {
    const progress = await this.pool.query<{ kind: string; value_json: unknown }>(
      `SELECT DISTINCT ON (kind) kind, value_json
       FROM core.run_progress_event WHERE run_id = $1
       ORDER BY kind, at_seq DESC`,
      [runId]
    );
    const values = new Map(progress.rows.map((row) => [row.kind, row.value_json]));
    if (!["PHASE", "ENVELOPE_STATE", "ENVELOPE_CONSUMED"].every((kind) => values.has(kind))) {
      throw new TypedDomainError("EMPTY_EVENT_STREAM", `Run ${runId} has no complete initial progress stream`);
    }
    const activations = await this.pool.query<{ battery_row_id: string; state: ActivationState; at_seq: string }>(
      `SELECT DISTINCT ON (battery_row_id) battery_row_id, state, at_seq
       FROM core.run_row_activation_event WHERE run_id = $1
       ORDER BY battery_row_id, at_seq DESC`,
      [runId]
    );
    const expected = await this.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run_row_activation WHERE run_id = $1",
      [runId]
    );
    if (activations.rows.length !== Number(expected.rows[0]?.count ?? -1)) {
      throw new TypedDomainError("EMPTY_EVENT_STREAM", `Run ${runId} has an activation row without an event`);
    }
    return {
      phase: values.get("PHASE") as CurrentRunState["phase"],
      envelopeState: values.get("ENVELOPE_STATE") as CurrentRunState["envelopeState"],
      envelopeConsumed: values.get("ENVELOPE_CONSUMED") as number,
      activations: activations.rows.map((row) => ({
        batteryRowId: row.battery_row_id,
        state: row.state,
        atSeq: Number(row.at_seq)
      }))
    };
  }

  async drainWaitsForCompletion(
    runId: string,
    resolutions: readonly CompletionActivationResolution[]
  ): Promise<number> {
    return withWriteTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`run-terminal:${runId}`]);
      const waiting = await client.query<{ battery_row_id: string; predicate_ref: string }>(
        `SELECT latest.battery_row_id, activation.predicate_ref
         FROM (
           SELECT DISTINCT ON (battery_row_id) battery_row_id, state
           FROM core.run_row_activation_event
           WHERE run_id=$1
           ORDER BY battery_row_id, at_seq DESC
         ) AS latest
         JOIN core.run_row_activation AS activation
           ON activation.run_id=$1 AND activation.battery_row_id=latest.battery_row_id
         WHERE latest.state='WAIT'
         ORDER BY latest.battery_row_id`,
        [runId]
      );
      const byRow = new Map(resolutions.map((resolution) => [resolution.batteryRowId, resolution]));
      if (byRow.size !== resolutions.length || waiting.rows.some((row) => !byRow.has(row.battery_row_id))) {
        throw new TypedDomainError(
          "WAIT_RESOLUTION_INCOMPLETE",
          "Run completion requires one explicit evaluated transition for every latest WAIT"
        );
      }
      const unexpected = resolutions.find((resolution) => !waiting.rows.some((row) => row.battery_row_id === resolution.batteryRowId));
      if (unexpected !== undefined) {
        throw new TypedDomainError("WAIT_RESOLUTION_NOT_CURRENT", `${unexpected.batteryRowId} is not currently waiting`);
      }
      for (const row of waiting.rows) {
        const resolution = byRow.get(row.battery_row_id)!;
        await client.query(
          `INSERT INTO core.run_row_activation_event (
             run_id, battery_row_id, at_seq, state, predicate_inputs, skip_evidence
           ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
          [
            runId,
            row.battery_row_id,
            await allocateSequence(client),
            resolution.state,
            JSON.stringify(resolution.predicateInputs),
            resolution.skipEvidence === null ? null : JSON.stringify(resolution.skipEvidence)
          ]
        );
      }
      return waiting.rows.length;
    });
  }

  async readFrozenHead(runId: string): Promise<{
    readonly runId: string;
    readonly questionLine: string;
    readonly agentCount: number;
    readonly discoveredPanel: readonly DiscoveredPanelMember[];
    readonly depthParams: Readonly<Record<string, unknown>>;
    readonly compositionBudgetTier: CompositionBudgetTier;
    readonly strangerSampleRate: number;
    readonly envelopeBasis: Readonly<Record<string, unknown>>;
  }> {
    return withRunContentLease(this.pool,[runId],async () => {
    const encryptionSchemaApplied = await contentEncryptionSchemaIsApplied(this.pool);
    const contentCiphertextProjection = encryptionSchemaApplied
      ? ", content_encryption_version, content_ciphertext"
      : "";
    const result = await this.pool.query<{
      run_id: string;
      question_line: string;
      content_encryption_version?: number | null;
      content_ciphertext?: CryptoEnvelope | null;
      agent_count: number;
      discovered_panel: DiscoveredPanelMember[];
      depth_params: Readonly<Record<string, unknown>>;
      composition_budget_tier: CompositionBudgetTier;
      stranger_sample_rate: number;
      envelope_basis: Readonly<Record<string, unknown>>;
    }>(
      `SELECT run_id, question_line${contentCiphertextProjection}, agent_count, discovered_panel, depth_params,
              composition_budget_tier, stranger_sample_rate, envelope_basis
       FROM core.run WHERE run_id = $1`,
      [runId]
    );
    const row = result.rows[0];
    if (row === undefined) throw new TypedDomainError("RUN_NOT_FOUND", `Run ${runId} does not exist`);
    if (row.content_encryption_version === 1 && contentCipherFor(this.pool) === undefined) {
      throw new TypedDomainError(
        "CONTENT_CIPHER_UNAVAILABLE",
        "Encrypted content cannot be read without the external key store"
      );
    }
    const content = await decryptContentForRun<{ questionLine: string }>(
      this.pool, row.run_id, "core.run", row.run_id, row.content_ciphertext ?? null,
      { questionLine: row.question_line }
    );
    return {
      runId: row.run_id,
      questionLine: content.questionLine,
      agentCount: Number(row.agent_count),
      discoveredPanel: Object.freeze(row.discovered_panel.map((member) => Object.freeze({ ...member }))),
      depthParams: Object.freeze({ ...row.depth_params }),
      compositionBudgetTier: row.composition_budget_tier,
      strangerSampleRate: Number(row.stranger_sample_rate),
      envelopeBasis: Object.freeze({ ...row.envelope_basis })
    };
    });
  }
}

export type { Pool } from "pg";
export type { CryptoEnvelope, PreparedRunContentCipher } from "@debateai/crypto";
export {
  auditEvent,
  channelBinding,
  identity,
  identitySession,
  identityUser,
  mfaFactor,
  recoveryCode
} from "./schema.js";

export {
  PostgresIdentityRepository,
  type AuthSourceContext,
  type PendingAccountInput,
  type PendingAccountResult,
  type RecoveryCodeRecord,
  type ResendPreparation,
  type TotpEnrollmentRecord
} from "./identity.js";
export * from "./obs-schema.js";
