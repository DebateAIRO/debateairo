import type { Pool, PoolClient } from "pg";
import type { SupportLanguage } from "../../support-kb/src/locale.js";

export type SupportRepositoryRecord = Readonly<{
  sessionId: string;
  identityOwnerRef: string | null;
  language: SupportLanguage;
  state: "OPEN" | "LOCKED" | "CLOSED";
  kbVersion: string;
  createdAt: Date;
  shreddedAt?: Date | null;
}>;

export type SupportRepositoryStatus = Readonly<{
  callsToday: number;
  callsLast7Days?: number;
  inputTokensToday?: number;
  outputTokensToday?: number;
  costUsdToday?: number;
  inputTokensLast7Days?: number;
  outputTokensLast7Days?: number;
  costUsdLast7Days?: number;
  relayState?: "AVAILABLE" | "UNAVAILABLE";
  relayUnavailableSince?: Date;
  deflection7Days: number | null;
  deflection30Days: number | null;
  ratingResolution7Days: number | null;
  ratingResolution30Days: number | null;
  openSessions: number;
  newCases: number;
}>;

export type CreateWrappedSessionKey = (sessionId: string) => Promise<Uint8Array>;
export type CreateCaseMaterial = (caseId: string) => Promise<Readonly<{
  wrappedKey: Uint8Array;
  transcriptSnapshotCiphertext: Uint8Array;
}>>;
export type SupportCreateKeyFactories = Readonly<{
  session: CreateWrappedSessionKey;
  case: CreateCaseMaterial;
}>;
export type SupportCaseRecord = Readonly<{
  caseId: string;
  sessionId: string;
  identityOwnerRef: string | null;
  language: SupportLanguage;
  createdAt: Date;
  triggerPredicate: "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8";
  toolCalls: readonly Readonly<{ name: string;at: Date;outcome: string }>[];
  kbVersion: string;
  slaHours: number;
  state: "NEW" | "WAITING_ON_V" | "WAITING_ON_USER" | "CLOSED";
}>;
export type SupportShredCounts = Readonly<{
  sessions: number;
  cases: number;
  keysDestroyed: number;
}>;
export type SupportShredResult =
  | Readonly<{ kind: "SHREDDED"; counts: SupportShredCounts }>
  | Readonly<{ kind: "ALREADY_SHREDDED" }>;
/** C-1: what account erasure's support step did; NONE = the owner has no support session. */
export type SupportErasureShredResult = SupportShredResult | Readonly<{ kind: "NONE" }>;

export type SupportRelayReservationResult =
  | Readonly<{ kind: "BUSY" }>
  | Readonly<{ kind: "DAILY_CAP" }>
  | Readonly<{
    kind: "ACQUIRED";
    release(): Promise<void>;
    forceRelease(): void;
  }>;
export type SupportRelayQueueEntryResult =
  | Readonly<{ kind: "FULL" }>
  | Readonly<{ kind: "DAILY_CAP" }>
  | Readonly<{ kind: "WAITING";waiterId: string;ticket: number;position: number }>
  | Extract<SupportRelayReservationResult,{ kind: "ACQUIRED" }>;

export type SupportMessageRole = "user" | "assistant";
export type SupportMessageOutcome =
  | "ANSWER_GROUNDED"
  | "NO_SOURCE"
  | "REFUSE_ZONE"
  | "REFUSE_INJECTION"
  | "REFUSE_SAFETY"
  | "DEGRADED"
  | "DISABLED"
  | "RATE_LIMITED"
  | "CASE_OPENED"
  | "CONSENT_NEEDED"
  | "ANON_CONTEXT"
  | "REFUSE_OTHER_USER"
  | "ANSWER_OWN_STATE"
  | "ANSWER_INCIDENT"
  | "NO_INCIDENT";
export type SupportMessageWrite = Readonly<{
  messageId: string;
  sessionId: string;
  role: SupportMessageRole;
  contentCiphertext: Uint8Array;
  outcome: SupportMessageOutcome;
  language: SupportLanguage;
  detectedLanguage: "en" | "ro";
  overrideLanguage: "en" | "ro" | null;
  redacted: boolean;
  receivedAt: Date;
  firstTokenAt: Date | null;
  completedAt: Date | null;
  modelCalled?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  degradedReason?: "relay" | "cap";
}>;
export type SupportMessageRead = SupportMessageWrite & Readonly<{
  wrappedKey: Uint8Array;
}>;

async function withSupportTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function lockSupportDomain(
  client: Pick<PoolClient, "query">,
  domain: 19370701 | 19370702,
  references: readonly string[]
): Promise<void> {
  if (references.length === 0) return;
  await client.query(`
    SELECT pg_catalog.pg_advisory_xact_lock($1,pg_catalog.hashtext(locked.ref::text))
    FROM (
      SELECT DISTINCT ref FROM pg_catalog.unnest($2::uuid[]) AS input(ref)
      ORDER BY ref
    ) AS locked
  `, [domain, references]);
}

export async function lockSupportOwners(
  client: Pick<PoolClient, "query">,
  ownerRefs: readonly string[]
): Promise<void> {
  await lockSupportDomain(client, 19370701, ownerRefs);
}

export async function lockSupportSessions(
  client: Pick<PoolClient, "query">,
  sessionIds: readonly string[]
): Promise<void> {
  await lockSupportDomain(client, 19370702, sessionIds);
}

const CANONICAL_SUPPORT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SUPPORT_CONTROL_CHARACTER = /\p{Cc}/u;
const ZERO_WRAPPED_SUPPORT_KEY = Buffer.alloc(61);

type ShredSessionRow = Readonly<{
  session_id: string;
  identity_owner_ref: string | null;
  created_at: Date;
  shredded_at: Date | null;
}>;
type ShredCaseRow = Readonly<{
  case_id: string;
  session_id: string;
  created_at: Date;
  shredded_at: Date | null;
}>;
type ShredKeyRow = Readonly<{
  ref: string;
  wrapped_key: Buffer;
  created_at: Date;
  destroyed_at: Date | null;
}>;
type ShredAuditRow = Readonly<{
  at: Date;
  os_user: string;
  target_kind: "owner" | "session";
  target_ref: string;
  keys_destroyed: number;
}>;
type LockedShredTarget = Readonly<{
  sessions: readonly ShredSessionRow[];
  cases: readonly ShredCaseRow[];
  sessionKeys: readonly ShredKeyRow[];
  caseKeys: readonly ShredKeyRow[];
  audit: ShredAuditRow | undefined;
}>;

function supportShredFailure(code:
  | "SUPPORT_SHRED_TARGET_NOT_FOUND"
  | "SUPPORT_SHRED_SESSION_BOUND"
  | "SUPPORT_SHRED_STATE_INVALID"
  | "SUPPORT_SHRED_KEY_COVERAGE_INVALID"
  | "SUPPORT_SHRED_AUDIT_INVALID"
  | "SUPPORT_SHRED_INPUT_INVALID"
): never {
  throw new TypeError(code);
}

function assertSupportShredInput(targetRef: string, osUser: string, at: Date): void {
  const userLength = typeof osUser === "string" ? Array.from(osUser).length : 0;
  if (!CANONICAL_SUPPORT_UUID.test(targetRef)
    || typeof osUser !== "string"
    || userLength < 1
    || userLength > 128
    || SUPPORT_CONTROL_CHARACTER.test(osUser)
    || !(at instanceof Date)
    || !Number.isFinite(at.getTime())) {
    supportShredFailure("SUPPORT_SHRED_INPUT_INVALID");
  }
}

function validLiveWrappedKey(key: ShredKeyRow): boolean {
  return key.wrapped_key.byteLength === 61
    && key.wrapped_key[0] === 1
    && !key.wrapped_key.equals(ZERO_WRAPPED_SUPPORT_KEY);
}

function validDestroyedWrappedKey(key: ShredKeyRow): boolean {
  return key.wrapped_key.byteLength === 61
    && key.wrapped_key.equals(ZERO_WRAPPED_SUPPORT_KEY);
}

function classifyLockedShredTarget(
  target: LockedShredTarget,
  targetKind: "owner" | "session",
  targetRef: string
): "LIVE" | "DESTROYED" {
  if (target.sessionKeys.length !== target.sessions.length
    || target.caseKeys.length !== target.cases.length
    || target.sessionKeys.some((key, index) => key.ref !== target.sessions[index]?.session_id)
    || target.caseKeys.some((key, index) => key.ref !== target.cases[index]?.case_id)) {
    supportShredFailure("SUPPORT_SHRED_KEY_COVERAGE_INVALID");
  }

  const parentState = [
    ...target.sessions.map((parent, index) => ({ parent, key: target.sessionKeys[index]! })),
    ...target.cases.map((parent, index) => ({ parent, key: target.caseKeys[index]! }))
  ].map(({ parent, key }) => {
    if (key.destroyed_at !== null && key.destroyed_at.getTime() < key.created_at.getTime()) {
      supportShredFailure("SUPPORT_SHRED_STATE_INVALID");
    }
    if (parent.shredded_at !== null
      && parent.shredded_at.getTime() < parent.created_at.getTime()) {
      supportShredFailure("SUPPORT_SHRED_STATE_INVALID");
    }
    if (parent.shredded_at === null && key.destroyed_at === null) {
      if (!validLiveWrappedKey(key)) {
        supportShredFailure("SUPPORT_SHRED_KEY_COVERAGE_INVALID");
      }
      return "LIVE" as const;
    }
    if (parent.shredded_at !== null && key.destroyed_at !== null) {
      if (!validDestroyedWrappedKey(key)) {
        supportShredFailure("SUPPORT_SHRED_KEY_COVERAGE_INVALID");
      }
      return "DESTROYED" as const;
    }
    supportShredFailure("SUPPORT_SHRED_STATE_INVALID");
  });
  const allLive = parentState.every((state) => state === "LIVE");
  const allDestroyed = parentState.every((state) => state === "DESTROYED");
  if (!allLive && !allDestroyed) supportShredFailure("SUPPORT_SHRED_STATE_INVALID");

  if (allLive) {
    if (target.audit !== undefined) supportShredFailure("SUPPORT_SHRED_AUDIT_INVALID");
    return "LIVE";
  }
  const expectedKeys = target.sessions.length + target.cases.length;
  if (target.audit === undefined
    || target.audit.target_kind !== targetKind
    || target.audit.target_ref !== targetRef
    || target.audit.keys_destroyed !== expectedKeys) {
    supportShredFailure("SUPPORT_SHRED_AUDIT_INVALID");
  }
  return "DESTROYED";
}

async function lockShredTargetRows(
  client: PoolClient,
  sessionIds: readonly string[],
  targetKind: "owner" | "session",
  targetRef: string
): Promise<LockedShredTarget> {
  const sessions = (await client.query<ShredSessionRow>(`
    SELECT session_id,identity_owner_ref,created_at,shredded_at
    FROM support.session
    WHERE session_id=ANY($1::uuid[])
    ORDER BY session_id
    FOR UPDATE
  `, [sessionIds])).rows;
  const cases = (await client.query<ShredCaseRow>(`
    SELECT case_id,session_id,created_at,shredded_at
    FROM support."case"
    WHERE session_id=ANY($1::uuid[])
    ORDER BY case_id
    FOR UPDATE
  `, [sessionIds])).rows;
  const sessionKeys = (await client.query<ShredKeyRow>(`
    SELECT session_id AS ref,wrapped_key,created_at,destroyed_at
    FROM support.session_key
    WHERE session_id=ANY($1::uuid[])
    ORDER BY session_id
    FOR UPDATE
  `, [sessionIds])).rows;
  const caseIds = cases.map(({ case_id }) => case_id);
  const caseKeys = (await client.query<ShredKeyRow>(`
    SELECT case_id AS ref,wrapped_key,created_at,destroyed_at
    FROM support.case_key
    WHERE case_id=ANY($1::uuid[])
    ORDER BY case_id
    FOR UPDATE
  `, [caseIds])).rows;
  // DL2-F1: a plain SELECT, deliberately. `SELECT ... FOR UPDATE` needs UPDATE on
  // at least one column of the relation, and support.shred_audit is append-only
  // for the only principal that ever runs a shred: 0054:875 grants
  // debateai_support SELECT and INSERT there, and the boot attestation
  // (assertSupportDatabaseRole, below) refuses any UPDATE grant on it — so the
  // lock clause made every shredOwner/shredSession abort with 42501, and the
  // suite only passed because it ran as the embedded superuser. Widening the
  // grant would end the table's append-only promise; the lock is not needed:
  // both entry points already hold the owner or session advisory lock for the
  // whole transaction (lockSupportOwners / lockSupportSessions above, which are
  // keyed on exactly the (target_kind, target_ref) pair read here), and a second
  // writer that somehow got past them fails closed on
  // support_shred_audit_target_unique UNIQUE (target_kind, target_ref) (0054:257)
  // at the INSERT in destroyLockedShredTarget.
  const audit = (await client.query<ShredAuditRow>(`
    SELECT at,os_user,target_kind,target_ref,keys_destroyed
    FROM support.shred_audit
    WHERE target_kind=$1 AND target_ref=$2
  `, [targetKind, targetRef])).rows[0];
  return { sessions, cases, sessionKeys, caseKeys, audit };
}

async function destroyLockedShredTarget(
  client: PoolClient,
  target: LockedShredTarget,
  targetKind: "owner" | "session",
  targetRef: string,
  osUser: string,
  at: Date
): Promise<SupportShredResult> {
  if (classifyLockedShredTarget(target, targetKind, targetRef) === "DESTROYED") {
    return Object.freeze({ kind: "ALREADY_SHREDDED" });
  }
  const sessionIds = target.sessions.map(({ session_id }) => session_id);
  const caseIds = target.cases.map(({ case_id }) => case_id);
  await client.query(`
    UPDATE support.session_key
    SET wrapped_key=pg_catalog.decode(pg_catalog.repeat('00',61),'hex'),destroyed_at=$1
    WHERE session_id=ANY($2::uuid[])
  `, [at, sessionIds]);
  if (caseIds.length !== 0) {
    await client.query(`
      UPDATE support.case_key
      SET wrapped_key=pg_catalog.decode(pg_catalog.repeat('00',61),'hex'),destroyed_at=$1
      WHERE case_id=ANY($2::uuid[])
    `, [at, caseIds]);
    await client.query(`
      UPDATE support."case" SET shredded_at=$1 WHERE case_id=ANY($2::uuid[])
    `, [at, caseIds]);
  }
  await client.query(`
    UPDATE support.session SET shredded_at=$1 WHERE session_id=ANY($2::uuid[])
  `, [at, sessionIds]);
  const counts = Object.freeze({
    sessions: target.sessions.length,
    cases: target.cases.length,
    keysDestroyed: target.sessions.length + target.cases.length
  });
  await client.query(`
    INSERT INTO support.shred_audit(at,os_user,target_kind,target_ref,keys_destroyed)
    VALUES($1,$2,$3,$4,$5)
  `, [at, osUser, targetKind, targetRef, counts.keysDestroyed]);
  return Object.freeze({ kind: "SHREDDED", counts });
}

/**
 * The owner-scoped barrier and row locks both owner shreds share (C-1): the owner advisory lock
 * (lockSupportOwners), then the owner's sessions' locks and rows. Undefined when the owner has no session.
 */
async function lockOwnerShredTarget(
  client: PoolClient,
  ownerRef: string
): Promise<LockedShredTarget | undefined> {
  await lockSupportOwners(client, [ownerRef]);
  const sessionIds = (await client.query<{ session_id: string }>(`
    SELECT session_id FROM support.session
    WHERE identity_owner_ref=$1
    ORDER BY session_id
  `, [ownerRef])).rows.map(({ session_id }) => session_id);
  if (sessionIds.length === 0) return undefined;
  await lockSupportSessions(client, sessionIds);
  const target = await lockShredTargetRows(client, sessionIds, "owner", ownerRef);
  if (target.sessions.length !== sessionIds.length
    || target.sessions.some(({ identity_owner_ref }) => identity_owner_ref !== ownerRef)) {
    supportShredFailure("SUPPORT_SHRED_STATE_INVALID");
  }
  return target;
}

/** Shred-only facet shared by the API service and the operator runner. */
export class PostgresSupportShredRepository {
  constructor(readonly pool: Pool) {}

  async shredOwner(ownerRef: string, osUser: string, at: Date): Promise<SupportShredResult> {
    assertSupportShredInput(ownerRef, osUser, at);
    return withSupportTransaction(this.pool, async (client) => {
      const target = await lockOwnerShredTarget(client, ownerRef);
      if (target === undefined) return supportShredFailure("SUPPORT_SHRED_TARGET_NOT_FOUND");
      return destroyLockedShredTarget(client, target, "owner", ownerRef, osUser, at);
    });
  }

  async shredSession(sessionId: string, osUser: string, at: Date): Promise<SupportShredResult> {
    assertSupportShredInput(sessionId, osUser, at);
    return withSupportTransaction(this.pool, async (client) => {
      await lockSupportSessions(client, [sessionId]);
      const target = await lockShredTargetRows(client, [sessionId], "session", sessionId);
      if (target.sessions.length === 0) {
        supportShredFailure("SUPPORT_SHRED_TARGET_NOT_FOUND");
      }
      if (target.sessions[0]?.identity_owner_ref !== null) {
        supportShredFailure("SUPPORT_SHRED_SESSION_BOUND");
      }
      return destroyLockedShredTarget(client, target, "session", sessionId, osUser, at);
    });
  }

  /**
   * C-1: account erasure's support step (AccountErasureCoordinator), on the support data credential. Same barrier,
   * locks, classifier, zeroing and owner audit as shredOwner, so 0054/0065's guards and assertSupportKeyCoverage hold
   * exactly as after `pnpm support:shred --owner`. Two differences. An owner with no session is NONE, not
   * SUPPORT_SHRED_TARGET_NOT_FOUND (most accounts never open a signed-in chat, and their erasure must not stall). And
   * a lock wait is bounded, because this runs inside the API's shared single-flight erasure cycle while it holds the
   * user's notification lease: a 55P03 throws, and the next 30 s cycle retries. Since 0129 (synthesis-flag S05)
   * emptied the support tables and revoked the support role's INSERT on them, this is NONE for every owner; it stays
   * as the erasure's guard for any support row a later release might persist again.
   */
  async shredOwnerForErasure(ownerRef: string, actor: string, at: Date): Promise<SupportErasureShredResult> {
    assertSupportShredInput(ownerRef, actor, at);
    return withSupportTransaction(this.pool, async (client) => {
      await client.query("SET LOCAL lock_timeout = '5s'");
      const target = await lockOwnerShredTarget(client, ownerRef);
      if (target === undefined) return Object.freeze({ kind: "NONE" as const });
      return destroyLockedShredTarget(client, target, "owner", ownerRef, actor, at);
    });
  }

  /**
   * C-1: the erasure's readback, a separate read after the shred committed. Counts the owner's support sessions and
   * cases (a case by its session's owner or its own identity_owner_ref) that are not fully shredded. The erasure
   * accepts only 0. The session branch and the case-by-session branch use support_session_identity_owner_ref_idx and
   * support_case_session_id_idx. The case-by-own-owner branch has no index (0065:267-268 indexes session_id only),
   * so it scans support."case" once per readback.
   */
  async liveOwnerKeyCount(ownerRef: string): Promise<number> {
    if (typeof ownerRef !== "string" || !CANONICAL_SUPPORT_UUID.test(ownerRef)) {
      return supportShredFailure("SUPPORT_SHRED_INPUT_INVALID");
    }
    const row = (await this.pool.query<{ live: string }>(`
      SELECT (
        (SELECT pg_catalog.count(*) FROM support.session AS owned
          LEFT JOIN support.session_key AS key ON key.session_id=owned.session_id
          WHERE owned.identity_owner_ref=$1::uuid
            AND (owned.shredded_at IS NULL OR key.session_id IS NULL OR key.destroyed_at IS NULL
              OR key.wrapped_key<>pg_catalog.decode(pg_catalog.repeat('00',61),'hex')))
        + (SELECT pg_catalog.count(*) FROM (
            SELECT owned_case.case_id,owned_case.shredded_at
            FROM support.session AS owned
            JOIN support."case" AS owned_case ON owned_case.session_id=owned.session_id
            WHERE owned.identity_owner_ref=$1::uuid
            UNION
            SELECT owned_case.case_id,owned_case.shredded_at
            FROM support."case" AS owned_case
            WHERE owned_case.identity_owner_ref=$1::uuid
          ) AS owned_case
          LEFT JOIN support.case_key AS key ON key.case_id=owned_case.case_id
          WHERE owned_case.shredded_at IS NULL OR key.case_id IS NULL OR key.destroyed_at IS NULL
            OR key.wrapped_key<>pg_catalog.decode(pg_catalog.repeat('00',61),'hex'))
      )::text AS live
    `, [ownerRef])).rows[0];
    const live = Number(row?.live);
    if (!Number.isSafeInteger(live) || live < 0) return supportShredFailure("SUPPORT_SHRED_STATE_INVALID");
    return live;
  }
}

export type SupportWrappedKeyRow = Readonly<{
  kind: "session" | "case";
  ref: string;
  wrappedKey: Buffer;
  destroyed: boolean;
}>;

export type SupportKeyReplacement = Readonly<{
  kind: "session" | "case";
  ref: string;
  previous: Uint8Array;
  next: Uint8Array;
}>;

/**
 * V-3. The two `bytea` columns a support-KEK rotation re-wraps. Reads and writes
 * only `wrapped_key`; the envelope shape is unchanged (61 bytes, version byte 1),
 * so no migration and no change to either table's CHECK constraint.
 *
 * The connection must be the `debateai_support` principal: it is the only role
 * granted `UPDATE (wrapped_key, destroyed_at)` on these tables (0054:884-885).
 */
export class PostgresSupportKeyRotationRepository {
  constructor(readonly pool: Pool) {}

  async listWrappedKeys(): Promise<readonly SupportWrappedKeyRow[]> {
    const rows = (await this.pool.query<{
      kind: "session" | "case";
      ref: string;
      wrapped_key: Buffer;
      destroyed: boolean;
    }>(`
      SELECT 'session' AS kind, key.session_id::text AS ref, key.wrapped_key,
        key.destroyed_at IS NOT NULL AS destroyed
      FROM support.session_key AS key
      UNION ALL
      SELECT 'case' AS kind, key.case_id::text AS ref, key.wrapped_key,
        key.destroyed_at IS NOT NULL AS destroyed
      FROM support.case_key AS key
      ORDER BY kind, ref
    `)).rows;
    return Object.freeze(rows.map((row) => Object.freeze({
      kind: row.kind,
      ref: row.ref,
      wrappedKey: Buffer.from(row.wrapped_key),
      destroyed: row.destroyed
    })));
  }

  /**
   * Applies a whole batch in ONE transaction, so it is never half-written: an
   * interrupted batch rolls back and the rotation re-does those rows, which are
   * already-current no-ops if they had in fact landed.
   *
   * Each UPDATE is conditioned on the bytes the rotation READ still being there
   * and on the row not having been destroyed since. A shred that lands
   * mid-rotation therefore wins, and the row is reported as unchanged rather
   * than resurrected.
   */
  async replaceWrappedKeys(replacements: readonly SupportKeyReplacement[]): Promise<number> {
    if (replacements.length === 0) return 0;
    return withSupportTransaction(this.pool, async (client) => {
      let changed = 0;
      for (const replacement of replacements) {
        const statement = replacement.kind === "session"
          ? `UPDATE support.session_key SET wrapped_key=$2
             WHERE session_id=$1 AND destroyed_at IS NULL AND wrapped_key=$3`
          : `UPDATE support.case_key SET wrapped_key=$2
             WHERE case_id=$1 AND destroyed_at IS NULL AND wrapped_key=$3`;
        const result = await client.query(statement, [
          replacement.ref,
          Buffer.from(replacement.next),
          Buffer.from(replacement.previous)
        ]);
        changed += result.rowCount ?? 0;
      }
      return changed;
    });
  }
}

/** Fail closed before accepting traffic if any hierarchy or audit is incoherent. */
export async function assertSupportKeyCoverage(pool: Pool): Promise<void> {
  const invalid = (await pool.query<{ invalid: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM support.session AS parent
      FULL JOIN support.session_key AS key ON key.session_id=parent.session_id
      WHERE parent.session_id IS NULL OR key.session_id IS NULL
        OR (parent.shredded_at IS NULL AND (
          key.destroyed_at IS NOT NULL
          OR pg_catalog.octet_length(key.wrapped_key)<>61
          OR pg_catalog.get_byte(key.wrapped_key,0)<>1
          OR key.wrapped_key=pg_catalog.decode(pg_catalog.repeat('00',61),'hex')
        ))
        OR (parent.shredded_at IS NOT NULL AND (
          key.destroyed_at IS NULL OR key.destroyed_at<key.created_at
          OR parent.shredded_at<parent.created_at
          OR key.wrapped_key<>pg_catalog.decode(pg_catalog.repeat('00',61),'hex')
        ))
      UNION ALL
      SELECT 1 FROM support."case" AS parent
      FULL JOIN support.case_key AS key ON key.case_id=parent.case_id
      WHERE parent.case_id IS NULL OR key.case_id IS NULL
        OR (parent.shredded_at IS NULL AND (
          key.destroyed_at IS NOT NULL
          OR pg_catalog.octet_length(key.wrapped_key)<>61
          OR pg_catalog.get_byte(key.wrapped_key,0)<>1
          OR key.wrapped_key=pg_catalog.decode(pg_catalog.repeat('00',61),'hex')
        ))
        OR (parent.shredded_at IS NOT NULL AND (
          key.destroyed_at IS NULL OR key.destroyed_at<key.created_at
          OR parent.shredded_at<parent.created_at
          OR key.wrapped_key<>pg_catalog.decode(pg_catalog.repeat('00',61),'hex')
        ))
      UNION ALL
      SELECT 1 FROM support."case" AS child
      JOIN support.session AS parent ON parent.session_id=child.session_id
      WHERE parent.shredded_at IS NOT NULL AND child.shredded_at IS NULL
      UNION ALL
      SELECT 1 FROM support.shred_audit AS audit
      WHERE audit.target_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR (audit.target_kind='owner' AND (
          NOT EXISTS (SELECT 1 FROM support.session AS owned
            WHERE owned.identity_owner_ref=audit.target_ref::uuid)
          OR EXISTS (SELECT 1 FROM support.session AS owned
            WHERE owned.identity_owner_ref=audit.target_ref::uuid
              AND owned.shredded_at IS NULL)
          OR EXISTS (SELECT 1 FROM support."case" AS owned_case
            JOIN support.session AS owned ON owned.session_id=owned_case.session_id
            WHERE owned.identity_owner_ref=audit.target_ref::uuid
              AND owned_case.shredded_at IS NULL)
          OR audit.keys_destroyed<>(
            SELECT pg_catalog.count(*)::integer FROM (
              SELECT key.session_id FROM support.session_key AS key
              JOIN support.session AS owned ON owned.session_id=key.session_id
              WHERE owned.identity_owner_ref=audit.target_ref::uuid
              UNION ALL
              SELECT key.case_id FROM support.case_key AS key
              JOIN support."case" AS owned_case ON owned_case.case_id=key.case_id
              JOIN support.session AS owned ON owned.session_id=owned_case.session_id
              WHERE owned.identity_owner_ref=audit.target_ref::uuid
            ) AS owner_keys
          )
        ))
        OR (audit.target_kind='session' AND (
          (SELECT pg_catalog.count(*) FROM support.session AS anonymous
            WHERE anonymous.session_id=audit.target_ref::uuid
              AND anonymous.identity_owner_ref IS NULL)<>1
          OR EXISTS (SELECT 1 FROM support.session AS anonymous
            WHERE anonymous.session_id=audit.target_ref::uuid
              AND anonymous.shredded_at IS NULL)
          OR EXISTS (SELECT 1 FROM support."case" AS child
            WHERE child.session_id=audit.target_ref::uuid AND child.shredded_at IS NULL)
          OR audit.keys_destroyed<>(
            SELECT pg_catalog.count(*)::integer FROM (
              SELECT key.session_id FROM support.session_key AS key
              WHERE key.session_id=audit.target_ref::uuid
              UNION ALL
              SELECT key.case_id FROM support.case_key AS key
              JOIN support."case" AS child ON child.case_id=key.case_id
              WHERE child.session_id=audit.target_ref::uuid
            ) AS session_keys
          )
        ))
      UNION ALL
      SELECT 1 FROM support.session AS object
      WHERE object.shredded_at IS NOT NULL AND (
        SELECT pg_catalog.count(*) FROM support.shred_audit AS audit
        WHERE (audit.target_kind='owner' AND object.identity_owner_ref IS NOT NULL
            AND audit.target_ref=object.identity_owner_ref::text)
          OR (audit.target_kind='session' AND object.identity_owner_ref IS NULL
            AND audit.target_ref=object.session_id::text)
      )<>1
      UNION ALL
      SELECT 1 FROM support."case" AS object
      JOIN support.session AS parent ON parent.session_id=object.session_id
      WHERE object.shredded_at IS NOT NULL AND (
        SELECT pg_catalog.count(*) FROM support.shred_audit AS audit
        WHERE (audit.target_kind='owner' AND parent.identity_owner_ref IS NOT NULL
            AND audit.target_ref=parent.identity_owner_ref::text)
          OR (audit.target_kind='session' AND parent.identity_owner_ref IS NULL
            AND audit.target_ref=parent.session_id::text)
      )<>1
    ) AS invalid
  `)).rows[0]?.invalid;
  if (invalid !== false) throw new TypeError("SUPPORT_KEY_COVERAGE_INVALID");
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
  support_relation_count: string;
  support_application_matrix_valid: boolean;
  support_guard_inaccessible: boolean;
  support_column_update_count: string;
  support_forbidden_column_update: boolean;
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
      (SELECT count(*)::text
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='support' AND relation.relkind IN ('r','p'))
        AS support_relation_count,
      (SELECT count(*)=16 AND bool_and(
          has_table_privilege(current_user,relation.oid,'SELECT')
          AND has_table_privilege(current_user,relation.oid,'INSERT')
            = (relation.relname IN ('shred_audit','public_incident'))
          AND NOT has_table_privilege(current_user,relation.oid,'UPDATE')
          AND NOT has_table_privilege(current_user,relation.oid,'DELETE')
          AND NOT has_table_privilege(current_user,relation.oid,'TRUNCATE')
          AND NOT has_table_privilege(current_user,relation.oid,'REFERENCES')
          AND NOT has_table_privilege(current_user,relation.oid,'TRIGGER')
        )
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='support' AND relation.relkind IN ('r','p')
          AND relation.relname=ANY(ARRAY[
            'session','message','abuse_event','case','session_key','case_key','shred_audit',
            'case_event','case_message','rating','tool_call','public_incident','relay_call',
            'admission_event','relay_waiter','relay_waiter_event'
          ])) AS support_application_matrix_valid,
      (SELECT NOT has_table_privilege(current_user,relation.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='support'
          AND relation.relname='_shred_integrity_guard'
          AND relation.relkind IN ('r','p')) AS support_guard_inaccessible,
      (SELECT count(*)::text
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation ON relation.oid=attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='support' AND relation.relkind IN ('r','p')
          AND attribute.attnum>0 AND NOT attribute.attisdropped
          AND has_column_privilege(
            current_user,relation.oid,attribute.attnum,'UPDATE'
          )) AS support_column_update_count,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation ON relation.oid=attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='support' AND relation.relkind IN ('r','p')
          AND attribute.attnum>0 AND NOT attribute.attisdropped
          AND has_column_privilege(
            current_user,relation.oid,attribute.attnum,'UPDATE'
          ) AND (relation.relname,attribute.attname) NOT IN (
            ('session','shredded_at'),('case','shredded_at'),
            ('session','consent_own_context_at'),
            ('case','state'),('case','summary_ciphertext'),
            ('case','summary_at'),('case','summary_status'),
            ('case','summary_authoritative'),
            ('public_incident','ended_at'),
            ('session_key','wrapped_key'),('session_key','destroyed_at'),
            ('case_key','wrapped_key'),('case_key','destroyed_at')
          )
      ) AS support_forbidden_column_update,
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

/**
 * The refusal both role assertions raise. It carries a `code` as well as the
 * message: an operator command prints `error.code`, and a bare TypeError made a
 * wrong-role run print UNKNOWN — the one shape the typed-refusal rule exists to
 * eliminate.
 */
function supportDatabaseRoleInvalid(): TypeError {
  return Object.assign(new TypeError("SUPPORT_DATABASE_ROLE_INVALID"), {
    code: "SUPPORT_DATABASE_ROLE_INVALID"
  });
}

/**
 * The SUPPORT half, on its own: this connection really is the `debateai_support`
 * principal, with exactly the privileges that role is meant to have and nothing
 * outside the support schema.
 *
 * Exported for a caller that only ever touches support data and should not hold
 * the runtime credential to prove it — `apps/runner/src/rotate-kek-cli.ts` writes
 * two support key columns and opens no other pool. `assertSupportDatabaseRole`
 * below adds the runtime half for the API, which DOES hold both.
 */
export async function assertSupportPrincipalRole(supportPool: Pool): Promise<void> {
  const support = await supportRoleWitness(supportPool);
  if (support === undefined
    || support.session_principal !== support.principal
    || support.rolsuper || support.rolcreaterole || support.rolcreatedb
    || support.rolreplication || support.rolbypassrls
    || !support.support_member || support.forbidden_member
    || support.dangerous_builtin_member || support.owns_database_or_schema
    || support.direct_support_acl
    || JSON.stringify(support.direct_roles) !== JSON.stringify(["debateai_support"])
    || support.support_select_count !== "16" || support.support_insert_count !== "2"
    || support.support_relation_count !== "17"
    || !support.support_application_matrix_valid || !support.support_guard_inaccessible
    || support.support_column_update_count !== "13"
    || support.support_forbidden_column_update
    || support.support_forbidden_privilege || support.outside_table_privilege) {
    throw supportDatabaseRoleInvalid();
  }
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
        ('session'),('message'),('abuse_event'),('case'),('session_key'),
        ('case_key'),('shred_audit'),('case_event'),('case_message'),('rating'),
        ('tool_call'),('public_incident'),('relay_call'),('admission_event'),
        ('relay_waiter'),('relay_waiter_event'),
        ('_shred_integrity_guard')
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
        (SELECT count(*)=17 AND bool_and(oid IS NOT NULL AND relkind IN ('r','p'))
          FROM resolved) AS support_structure_valid,
        COALESCE((SELECT bool_or(has_table_privilege(
          current_user,oid,'SELECT,INSERT')) FROM resolved),false)
          AS support_table_privilege
    `).then(({ rows }) => rows[0]),
    assertSupportPrincipalRole(supportPool)
  ]);
  // The support half is asserted above, by the one implementation of it; what
  // remains here is the runtime half — the ordinary principal must NOT be able
  // to reach support data.
  if (runtime === undefined || runtime.support_member || runtime.support_schema_usage
    || !runtime.support_structure_valid || runtime.support_table_privilege) {
    throw supportDatabaseRoleInvalid();
  }
}
