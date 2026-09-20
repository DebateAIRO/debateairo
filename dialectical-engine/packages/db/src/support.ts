import { randomUUID } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";
import type { Pool, PoolClient } from "pg";

export type SupportRepositoryRecord = Readonly<{
  sessionId: string;
  identityOwnerRef: string | null;
  language: "en" | "ro";
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
  language: "en" | "ro";
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
  language: "en" | "ro";
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

type SupportMessageRow = Readonly<{
  message_id: string;
  session_id: string;
  role: SupportMessageRole;
  content_ciphertext: Buffer;
  outcome: SupportMessageOutcome;
  language: "en" | "ro";
  detected_language: "en" | "ro";
  override_language: "en" | "ro" | null;
  redacted: boolean;
  received_at: Date;
  first_token_at: Date | null;
  completed_at: Date | null;
  model_called: boolean;
  input_tokens: string | null;
  output_tokens: string | null;
  cost_usd: string | null;
  degraded_reason: "relay" | "cap" | null;
  wrapped_key: Buffer;
}>;

function messageRecord(row: SupportMessageRow): SupportMessageRead {
  return Object.freeze({
    messageId: row.message_id,
    sessionId: row.session_id,
    role: row.role,
    contentCiphertext: Buffer.from(row.content_ciphertext),
    outcome: row.outcome,
    language: row.language,
    detectedLanguage: row.detected_language,
    overrideLanguage: row.override_language,
    redacted: row.redacted,
    receivedAt: row.received_at,
    firstTokenAt: row.first_token_at,
    completedAt: row.completed_at,
    ...(row.model_called ? { modelCalled: true } : {}),
    ...(row.input_tokens === null ? {} : { inputTokens: Number(row.input_tokens) }),
    ...(row.output_tokens === null ? {} : { outputTokens: Number(row.output_tokens) }),
    ...(row.cost_usd === null ? {} : { costUsd: Number(row.cost_usd) }),
    ...(row.degraded_reason === null ? {} : { degradedReason: row.degraded_reason }),
    wrappedKey: Buffer.from(row.wrapped_key)
  });
}

type SupportSessionRow = Readonly<{
  session_id: string;
  identity_owner_ref: string | null;
  language: "en" | "ro";
  state: "OPEN" | "LOCKED" | "CLOSED";
  kb_version: string;
  created_at: Date;
  shredded_at?: Date | null;
}>;

function record(row: SupportSessionRow): SupportRepositoryRecord {
  return Object.freeze({
    sessionId: row.session_id,
    identityOwnerRef: row.identity_owner_ref,
    language: row.language,
    state: row.state,
    kbVersion: row.kb_version,
    createdAt: row.created_at,
    ...(row.shredded_at === undefined ? {} : { shreddedAt: row.shredded_at })
  });
}

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

/** Session creation receives only an opaque wrapped-key callback. */
export class PostgresSupportSessionRepository {
  constructor(
    readonly pool: Pool,
    readonly createWrappedKey: CreateWrappedSessionKey
  ) {}

  async create(input: Readonly<{
    sessionId: string;
    tokenSha256: string;
    identityOwnerRef: string | null;
    language: "en" | "ro";
    kbVersion: string;
    createdAt: Date;
  }>): Promise<SupportRepositoryRecord> {
    let callbackBytes: Uint8Array | undefined;
    let wrapped: Buffer | undefined;
    try {
      return await withSupportTransaction(this.pool, async (client) => {
        if (input.identityOwnerRef !== null) {
        await lockSupportOwners(client, [input.identityOwnerRef]);
          if ((await client.query(`
            SELECT 1 FROM support.shred_audit
            WHERE target_kind='owner' AND target_ref=$1
          `, [input.identityOwnerRef])).rowCount !== 0) {
            throw new TypeError("SUPPORT_OWNER_SHREDDED");
          }
        }
        callbackBytes = await this.createWrappedKey(input.sessionId);
        wrapped = Buffer.from(callbackBytes);
        const result = await client.query<SupportSessionRow>(`
          INSERT INTO support.session(
            session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at
          ) VALUES($1,$2,$3,$4,'OPEN',$5,$6)
          RETURNING session_id,identity_owner_ref,language,state,kb_version,created_at
        `, [
          input.sessionId,input.tokenSha256,input.identityOwnerRef,input.language,
          input.kbVersion,input.createdAt
        ]);
        await client.query(`
          INSERT INTO support.session_key(session_id,wrapped_key,created_at)
          VALUES($1,$2,$3)
        `, [input.sessionId, wrapped, input.createdAt]);
        const created = result.rows[0];
        if (created === undefined) throw new TypeError("SUPPORT_SESSION_CREATE_FAILED");
        return record(created);
      });
    } finally {
      callbackBytes?.fill(0);
      wrapped?.fill(0);
    }
  }

  async read(input: Readonly<{
    sessionId: string;
    tokenSha256: string;
    lockAfterInjections?: number;
  }>): Promise<SupportRepositoryRecord | null> {
    const result = await this.pool.query<SupportSessionRow>(`
      SELECT session_id,identity_owner_ref,language,
        CASE
          WHEN state='OPEN' AND $3::integer IS NOT NULL AND (
            SELECT count(*)
            FROM support.abuse_event AS event
            WHERE event.session_id=support.session.session_id AND event.class='INJECTION'
          ) >= $3::integer THEN 'LOCKED'
          ELSE state
        END AS state,
        kb_version,created_at,shredded_at
      FROM support.session
      WHERE session_id=$1 AND session_token_sha256=$2
    `, [input.sessionId, input.tokenSha256, input.lockAfterInjections ?? null]);
    return result.rows[0] === undefined ? null : record(result.rows[0]);
  }

  async admitMessage(input: Readonly<{
    sessionId: string;
    tokenSha256: string;
    injection: boolean;
    messageSha256: string;
    ipSha256: string;
    at: Date;
    lockAfterInjections: number;
    identityOwnerRef: string | null;
    characterCount: number;
    limits: Readonly<{
      supportLimitSessionMessages: number;
      supportLimitMessageCharacters: number;
      supportLimitAnonMessages10m: number;
      supportLimitAnonMessages24h: number;
      supportLimitAccountMessages10m: number;
      supportLimitAccountMessages24h: number;
    }>;
  }>): Promise<"ADMITTED" | "RATE_LIMITED" | "LOCKED" | "SHREDDED" | "NOT_FOUND"> {
    return withSupportTransaction(this.pool, async (client) => {
      if (input.identityOwnerRef === null) {
        await client.query(`SELECT pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended('debateai:support-admission-ip:' || $1,0)
        )`,[input.ipSha256]);
      } else {
        await lockSupportOwners(client,[input.identityOwnerRef]);
      }
      await lockSupportSessions(client, [input.sessionId]);
      const session = await client.query<{
        state: "OPEN" | "LOCKED" | "CLOSED";
        identity_owner_ref: string | null;
        created_at: Date;
        shredded_at: Date | null;
        injections: string;
      }>(`
        SELECT state,identity_owner_ref,created_at,shredded_at,(
          SELECT count(*)::text
          FROM support.abuse_event AS event
          WHERE event.session_id=support.session.session_id AND event.class='INJECTION'
        ) AS injections
        FROM support.session
        WHERE session_id=$1 AND session_token_sha256=$2
      `, [input.sessionId, input.tokenSha256]);
      const row = session.rows[0];
      if (row === undefined) return "NOT_FOUND";
      if (row.identity_owner_ref !== input.identityOwnerRef) return "NOT_FOUND";
      if (row.shredded_at !== null) return "SHREDDED";
      if (row.state !== "OPEN") {
        return "LOCKED";
      }
      if (Number(row.injections) >= input.lockAfterInjections) {
        return "LOCKED";
      }
      if (!Number.isFinite(input.at.getTime())
        || input.at.getTime() < row.created_at.getTime()
        || input.at.getTime() - row.created_at.getTime() > 24 * 60 * 60 * 1_000
        || input.characterCount > input.limits.supportLimitMessageCharacters) {
        return "RATE_LIMITED";
      }
      const counts = (await client.query<{
        session_count: string;
        short_count: string;
        daily_count: string;
      }>(`
        SELECT
          count(*) FILTER (WHERE session_id=$1)::text AS session_count,
          count(*) FILTER (WHERE at >= $4::timestamptz-interval '10 minutes'
            AND (($3::uuid IS NULL AND ip_sha256=$2)
              OR ($3::uuid IS NOT NULL AND identity_owner_ref=$3::uuid)))::text AS short_count,
          count(*) FILTER (WHERE at >= $4::timestamptz-interval '24 hours'
            AND (($3::uuid IS NULL AND ip_sha256=$2)
              OR ($3::uuid IS NOT NULL AND identity_owner_ref=$3::uuid)))::text AS daily_count
        FROM support.admission_event
        WHERE scope_kind='MESSAGE' AND at <= $4::timestamptz
      `,[input.sessionId,input.ipSha256,input.identityOwnerRef,input.at])).rows[0] ?? {
        session_count: "0",short_count: "0",daily_count: "0"
      };
      const shortLimit = input.identityOwnerRef === null
        ? input.limits.supportLimitAnonMessages10m
        : input.limits.supportLimitAccountMessages10m;
      const dailyLimit = input.identityOwnerRef === null
        ? input.limits.supportLimitAnonMessages24h
        : input.limits.supportLimitAccountMessages24h;
      if (Number(counts.session_count) >= input.limits.supportLimitSessionMessages
        || Number(counts.short_count) >= shortLimit
        || Number(counts.daily_count) >= dailyLimit) {
        return "RATE_LIMITED";
      }
      await client.query(`
        INSERT INTO support.admission_event(
          admission_event_id,scope_kind,session_id,identity_owner_ref,ip_sha256,at
        ) VALUES($1,'MESSAGE',$2,$3,$4,$5)
      `,[randomUUID(),input.sessionId,input.identityOwnerRef,input.ipSha256,input.at]);
      if (input.injection) {
        await client.query(`
          INSERT INTO support.abuse_event(
            abuse_event_id,session_id,class,message_sha256,ip_sha256,at
          ) VALUES($1,$2,'INJECTION',$3,$4,$5)
        `, [
          randomUUID(),input.sessionId,input.messageSha256,input.ipSha256,input.at
        ]);
        if (Number(row.injections) + 1 >= input.lockAfterInjections) {
          await client.query(`
            INSERT INTO support.abuse_event(
              abuse_event_id,session_id,class,message_sha256,ip_sha256,at
            ) VALUES($1,$2,'LOCK',NULL,$3,$4)
          `,[randomUUID(),input.sessionId,input.ipSha256,input.at]);
        }
      }
      return "ADMITTED";
    });
  }

  async admitIpSession(input: Readonly<{
    ipSha256: string;
    at: Date;
    cooldownMinutes: number;
    sessionLimit: number;
  }>): Promise<"ADMITTED" | "COOLDOWN" | "RATE_LIMITED"> {
    return withSupportTransaction(this.pool,async (client) => {
      await client.query(`SELECT pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('debateai:support-admission-ip:' || $1,0)
      )`,[input.ipSha256]);
      const locked = await client.query<{ session_id: string;at: Date }>(`
        SELECT session_id,at
        FROM support.abuse_event
        WHERE ip_sha256=$1 AND class='LOCK'
          AND at >= $2::timestamptz - interval '24 hours'
          AND at <= $2::timestamptz
        ORDER BY at DESC,abuse_event_id DESC
        LIMIT 2
      `,[input.ipSha256,input.at]);
      const latest = locked.rows[0];
      if (locked.rows.length < 2 || latest === undefined
        || latest.at.getTime() + input.cooldownMinutes * 60_000 <= input.at.getTime()) {
        const count = Number((await client.query<{ count: string }>(`
          SELECT count(*)::text AS count FROM support.admission_event
          WHERE scope_kind='SESSION' AND ip_sha256=$1
            AND at >= $2::timestamptz-interval '1 hour' AND at <= $2::timestamptz
        `,[input.ipSha256,input.at])).rows[0]?.count);
        if (count >= input.sessionLimit) return "RATE_LIMITED";
        await client.query(`INSERT INTO support.admission_event(
          admission_event_id,scope_kind,session_id,identity_owner_ref,ip_sha256,at
        ) VALUES($1,'SESSION',NULL,NULL,$2,$3)`,[randomUUID(),input.ipSha256,input.at]);
        return "ADMITTED";
      }
      await lockSupportSessions(client,[latest.session_id]);
      const existing = await client.query(`
        SELECT 1 FROM support.abuse_event
        WHERE session_id=$1 AND class='IP_COOLDOWN' AND at=$2
      `,[latest.session_id,input.at]);
      if (existing.rowCount === 0) {
        await client.query(`
          INSERT INTO support.abuse_event(
            abuse_event_id,session_id,class,message_sha256,ip_sha256,at
          ) VALUES($1,$2,'IP_COOLDOWN',NULL,$3,$4)
        `,[randomUUID(),latest.session_id,input.ipSha256,input.at]);
      }
      return "COOLDOWN";
    });
  }

  async recordRateLimit(input: Readonly<{
    sessionId: string;
    messageSha256: string;
    ipSha256: string;
    at: Date;
  }>): Promise<void> {
    await withSupportTransaction(this.pool, async (client) => {
      await lockSupportSessions(client, [input.sessionId]);
      const existing = await client.query(`
        SELECT 1
        FROM support.abuse_event
        WHERE session_id=$1 AND class='RATE_LIMIT'
        LIMIT 1
      `, [input.sessionId]);
      if (existing.rowCount === 0) {
        await client.query(`
          INSERT INTO support.abuse_event(
            abuse_event_id,session_id,class,message_sha256,ip_sha256,at
          ) VALUES($1,$2,'RATE_LIMIT',$3,$4,$5)
        `, [randomUUID(),input.sessionId,input.messageSha256,input.ipSha256,input.at]);
      }
    });
  }

  async rateMessage(input: Readonly<{
    sessionId: string;
    tokenSha256: string;
    messageId: string;
    rating: "yes" | "no" | "human";
    at: Date;
  }>): Promise<readonly ("yes" | "no" | "human")[] | null> {
    return withSupportTransaction(this.pool,async (client) => {
      await lockSupportSessions(client,[input.sessionId]);
      const updated = await client.query(`
        INSERT INTO support.rating(rating_id,message_id,session_id,rating,at)
        SELECT $5,message.message_id,message.session_id,$4,$6
        FROM support.message AS message
        JOIN support.session AS session ON session.session_id=message.session_id
        WHERE message.message_id=$3
          AND message.session_id=$1
          AND session.session_token_sha256=$2
          AND session.shredded_at IS NULL
          AND message.role='assistant'
          AND message.outcome IN ('ANSWER_GROUNDED','NO_SOURCE')
        ON CONFLICT (message_id) DO NOTHING
      `,[input.sessionId,input.tokenSha256,input.messageId,input.rating,randomUUID(),input.at]);
      if (updated.rowCount !== 1) return null;
      const ratings = await client.query<{ rating: "yes" | "no" | "human" }>(`
        SELECT rating FROM support.rating
        WHERE session_id=$1
        ORDER BY at,rating_id
      `,[input.sessionId]);
      return Object.freeze(ratings.rows.map((row) => row.rating));
    });
  }

}

/** Ciphertext-only transcript facet; plaintext and support-key capabilities never cross it. */
export class PostgresSupportMessageRepository {
  constructor(readonly pool: Pool) {}

  async readSessionKey(input: Readonly<{
    sessionId: string;
  }>): Promise<Uint8Array | null> {
    const row = (await this.pool.query<{ wrapped_key: Buffer }>(`
      SELECT key.wrapped_key
      FROM support.session AS session
      JOIN support.session_key AS key ON key.session_id=session.session_id
      WHERE session.session_id=$1
    `,[input.sessionId])).rows[0];
    return row === undefined ? null : Buffer.from(row.wrapped_key);
  }

  async write(input: SupportMessageWrite): Promise<void> {
    const ciphertext = Buffer.from(input.contentCiphertext);
    try {
      await withSupportTransaction(this.pool,async (client) => {
        await lockSupportSessions(client,[input.sessionId]);
        const available = (await client.query<{
          state: string;
          shredded_at: Date | null;
          destroyed_at: Date | null;
          wrapped_key: Buffer;
        }>(`
          SELECT session.state,session.shredded_at,key.destroyed_at,key.wrapped_key
          FROM support.session AS session
          JOIN support.session_key AS key ON key.session_id=session.session_id
          WHERE session.session_id=$1
          FOR UPDATE OF session,key
        `,[input.sessionId])).rows[0];
        if (available === undefined
          || available.state !== "OPEN"
          || available.shredded_at !== null
          || available.destroyed_at !== null
          || available.wrapped_key.byteLength !== 61
          || available.wrapped_key[0] !== 1) {
          throw new TypeError("SUPPORT_MESSAGE_SESSION_UNAVAILABLE");
        }
        await client.query(`
          INSERT INTO support.message(
            message_id,session_id,role,content_ciphertext,outcome,language,
            detected_language,override_language,redacted,received_at,
            first_token_at,completed_at,model_called,input_tokens,output_tokens,cost_usd,
            degraded_reason
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        `,[
          input.messageId,input.sessionId,input.role,ciphertext,input.outcome,input.language,
          input.detectedLanguage,input.overrideLanguage,input.redacted,input.receivedAt,
          input.firstTokenAt,input.completedAt,input.modelCalled ?? false,
          input.inputTokens ?? null,input.outputTokens ?? null,input.costUsd ?? null,
          input.degradedReason ?? null
        ]);
      });
    } finally {
      ciphertext.fill(0);
    }
  }

  async read(input: Readonly<{
    sessionId: string;
    messageId: string;
  }>): Promise<SupportMessageRead | null> {
    const row = (await this.pool.query<SupportMessageRow>(`
      SELECT message.message_id,message.session_id,message.role,
        message.content_ciphertext,message.outcome,message.language,
        message.detected_language,message.override_language,message.redacted,
        message.received_at,message.first_token_at,message.completed_at,message.model_called,
        message.input_tokens::text,message.output_tokens::text,message.cost_usd::text,
        message.degraded_reason,key.wrapped_key
      FROM support.message AS message
      JOIN support.session_key AS key ON key.session_id=message.session_id
      WHERE message.session_id=$1 AND message.message_id=$2
    `,[input.sessionId,input.messageId])).rows[0];
    if (row === undefined) return null;
    return messageRecord(row);
  }

  async listSession(input: Readonly<{
    sessionId: string;
  }>): Promise<readonly SupportMessageRead[]> {
    const rows = await this.pool.query<SupportMessageRow>(`
      SELECT message.message_id,message.session_id,message.role,
        message.content_ciphertext,message.outcome,message.language,
        message.detected_language,message.override_language,message.redacted,
        message.received_at,message.first_token_at,message.completed_at,message.model_called,
        message.input_tokens::text,message.output_tokens::text,message.cost_usd::text,
        message.degraded_reason,key.wrapped_key
      FROM support.message AS message
      JOIN support.session_key AS key ON key.session_id=message.session_id
      WHERE message.session_id=$1
      ORDER BY message.received_at,
        CASE message.role WHEN 'user' THEN 0 ELSE 1 END,
        message.message_id
    `,[input.sessionId]);
    return Object.freeze(rows.rows.map(messageRecord));
  }
}

/** Future-facing SUP-02 substrate; it intentionally exposes no HTTP route. */
export class PostgresSupportCaseRepository {
  constructor(
    readonly pool: Pool,
    readonly createMaterial: CreateCaseMaterial
  ) {}

  async createCaseOnce(input: Readonly<{
    sessionId: string;
    identityOwnerRef: string | null;
    language: "en" | "ro";
    createdAt: Date;
    triggerPredicate: SupportCaseRecord["triggerPredicate"];
    triggerGeneration: string;
    toolCalls: SupportCaseRecord["toolCalls"];
    kbVersion: string;
    slaHours: number;
    prepare(): Promise<Readonly<{
      caseId: string;
      token: string;
      tokenSha256: string;
    }>>;
  }>): Promise<
    | Readonly<{ kind: "OPENED";record: SupportCaseRecord;token: string }>
    | Readonly<{ kind: "ALREADY_OPENED";record: SupportCaseRecord }>
  > {
    let material: Awaited<ReturnType<CreateCaseMaterial>> | undefined;
    let wrapped: Buffer | undefined;
    let ciphertext: Buffer | undefined;
    try {
      return await withSupportTransaction(this.pool,async (client) => {
        await lockSupportSessions(client,[input.sessionId]);
        const parent = (await client.query<{
          state: string;shredded_at: Date | null;destroyed_at: Date | null;wrapped_key: Buffer;
        }>(`
          SELECT parent.state,parent.shredded_at,key.destroyed_at,key.wrapped_key
          FROM support.session AS parent
          JOIN support.session_key AS key ON key.session_id=parent.session_id
          WHERE parent.session_id=$1
          FOR UPDATE OF parent,key
        `,[input.sessionId])).rows[0];
        if (parent === undefined || parent.state !== "OPEN"
          || parent.shredded_at !== null || parent.destroyed_at !== null
          || parent.wrapped_key.byteLength !== 61 || parent.wrapped_key[0] !== 1) {
          throw new TypeError("SUPPORT_CASE_PARENT_INVALID");
        }
        const prior = (await client.query<{
          case_id: string;session_id: string;identity_owner_ref: string | null;
          language: "en" | "ro";created_at: Date;
          trigger_predicate: SupportCaseRecord["triggerPredicate"];
          tool_calls: SupportCaseRecord["toolCalls"];kb_version: string;
          sla_hours: number;state: SupportCaseRecord["state"];
        }>(`
          SELECT case_id,session_id,identity_owner_ref,language,created_at,
            trigger_predicate,tool_calls,kb_version,sla_hours,state
          FROM support."case"
          WHERE session_id=$1 AND trigger_predicate=$2 AND trigger_generation=$3
        `,[input.sessionId,input.triggerPredicate,input.triggerGeneration])).rows[0];
        if (prior !== undefined) {
          return Object.freeze({ kind: "ALREADY_OPENED" as const,record: Object.freeze({
            caseId: prior.case_id,sessionId: prior.session_id,
            identityOwnerRef: prior.identity_owner_ref,language: prior.language,
            createdAt: prior.created_at,triggerPredicate: prior.trigger_predicate,
            toolCalls: prior.tool_calls,kbVersion: prior.kb_version,
            slaHours: prior.sla_hours,state: prior.state
          }) });
        }
        const prepared = await input.prepare();
        material = await this.createMaterial(prepared.caseId);
        wrapped = Buffer.from(material.wrappedKey);
        ciphertext = Buffer.from(material.transcriptSnapshotCiphertext);
        await client.query(`
          INSERT INTO support."case"(
            case_id,token_sha256,session_id,language,created_at,
            transcript_snapshot_ciphertext,state,identity_owner_ref,trigger_predicate,
            trigger_generation,tool_calls,kb_version,sla_hours
          ) VALUES($1,$2,$3,$4,$5,$6,'NEW',$7,$8,$9,$10,$11,$12)
        `,[
          prepared.caseId,prepared.tokenSha256,input.sessionId,input.language,input.createdAt,
          ciphertext,input.identityOwnerRef,input.triggerPredicate,input.triggerGeneration,
          JSON.stringify(input.toolCalls),input.kbVersion,input.slaHours
        ]);
        await client.query(`
          INSERT INTO support.case_key(case_id,wrapped_key,created_at) VALUES($1,$2,$3)
        `,[prepared.caseId,wrapped,input.createdAt]);
        await client.query(`
          INSERT INTO support.case_event(case_event_id,case_id,from_state,to_state,at,actor)
          VALUES($1,$2,NULL,'NEW',$3,'system')
        `,[randomUUID(),prepared.caseId,input.createdAt]);
        const record = Object.freeze({
          caseId: prepared.caseId,sessionId: input.sessionId,
          identityOwnerRef: input.identityOwnerRef,language: input.language,
          createdAt: input.createdAt,triggerPredicate: input.triggerPredicate,
          toolCalls: input.toolCalls,kbVersion: input.kbVersion,slaHours: input.slaHours,
          state: "NEW" as const
        });
        return Object.freeze({ kind: "OPENED" as const,record,token: prepared.token });
      });
    } finally {
      material?.wrappedKey.fill(0);
      material?.transcriptSnapshotCiphertext.fill(0);
      wrapped?.fill(0);
      ciphertext?.fill(0);
    }
  }

  async createCase(input: Readonly<{
    caseId: string;
    tokenSha256: string;
    sessionId: string;
    identityOwnerRef?: string | null;
    language: "en" | "ro";
    createdAt: Date;
    triggerPredicate?: "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8";
    toolCalls?: readonly Readonly<{ name: string;at: Date;outcome: string }>[];
    kbVersion?: string;
    slaHours?: number;
  }>): Promise<SupportCaseRecord & Readonly<{ state: "NEW" }>> {
    let material: Awaited<ReturnType<CreateCaseMaterial>> | undefined;
    let wrapped: Buffer | undefined;
    let ciphertext: Buffer | undefined;
    try {
      return await withSupportTransaction(this.pool, async (client) => {
        await lockSupportSessions(client, [input.sessionId]);
        const parent = (await client.query<{
          state: string;
          shredded_at: Date | null;
          destroyed_at: Date | null;
          wrapped_key: Buffer;
        }>(`
          SELECT parent.state,parent.shredded_at,key.destroyed_at,key.wrapped_key
          FROM support.session AS parent
          JOIN support.session_key AS key ON key.session_id=parent.session_id
          WHERE parent.session_id=$1
          FOR UPDATE OF parent,key
        `, [input.sessionId])).rows[0];
        if (parent === undefined || parent.state !== "OPEN"
          || parent.shredded_at !== null || parent.destroyed_at !== null
          || parent.wrapped_key.byteLength !== 61 || parent.wrapped_key[0] !== 1) {
          throw new TypeError("SUPPORT_CASE_PARENT_INVALID");
        }
        material = await this.createMaterial(input.caseId);
        wrapped = Buffer.from(material.wrappedKey);
        ciphertext = Buffer.from(material.transcriptSnapshotCiphertext);
        await client.query(`
          INSERT INTO support."case"(
            case_id,token_sha256,session_id,language,created_at,
            transcript_snapshot_ciphertext,state,identity_owner_ref,trigger_predicate,
            tool_calls,kb_version,sla_hours
          ) VALUES($1,$2,$3,$4,$5,$6,'NEW',$7,$8,$9,$10,$11)
        `, [
          input.caseId,input.tokenSha256,input.sessionId,input.language,input.createdAt,ciphertext,
          input.identityOwnerRef ?? null,input.triggerPredicate ?? "E1",
          JSON.stringify(input.toolCalls ?? []),input.kbVersion ?? "0".repeat(64),
          input.slaHours ?? 48
        ]);
        await client.query(`
          INSERT INTO support.case_key(case_id,wrapped_key,created_at)
          VALUES($1,$2,$3)
        `, [input.caseId, wrapped, input.createdAt]);
        await client.query(`
          INSERT INTO support.case_event(case_event_id,case_id,from_state,to_state,at,actor)
          VALUES($1,$2,NULL,'NEW',$3,'system')
        `,[randomUUID(),input.caseId,input.createdAt]);
        return Object.freeze({
          caseId: input.caseId,sessionId: input.sessionId,
          identityOwnerRef: input.identityOwnerRef ?? null,language: input.language,
          createdAt: input.createdAt,triggerPredicate: input.triggerPredicate ?? "E1",
          toolCalls: input.toolCalls ?? [],
          kbVersion: input.kbVersion ?? "0".repeat(64),slaHours: input.slaHours ?? 48,
          state: "NEW" as const
        });
      });
    } finally {
      material?.wrappedKey.fill(0);
      material?.transcriptSnapshotCiphertext.fill(0);
      wrapped?.fill(0);
      ciphertext?.fill(0);
    }
  }

  async transitionCase(input: Readonly<{
    caseId: string;
    toState: "NEW" | "WAITING_ON_V" | "WAITING_ON_USER" | "CLOSED";
    actor: "user" | "V" | "system";
    at: Date;
  }>): Promise<SupportCaseRecord | null> {
    return withSupportTransaction(this.pool,async (client) => {
      const current = (await client.query<{
        case_id: string;
        session_id: string;
        identity_owner_ref: string | null;
        language: "en" | "ro";
        created_at: Date;
        trigger_predicate: SupportCaseRecord["triggerPredicate"];
        tool_calls: SupportCaseRecord["toolCalls"];
        kb_version: string;
        sla_hours: number;
        state: SupportCaseRecord["state"];
      }>(`
        SELECT case_id,session_id,identity_owner_ref,language,created_at,
          trigger_predicate,tool_calls,kb_version,sla_hours,state
        FROM support."case" WHERE case_id=$1 FOR UPDATE
      `,[input.caseId])).rows[0];
      if (current === undefined) return null;
      const legal = input.actor === "user"
        ? ((current.state === "NEW" || current.state === "WAITING_ON_USER"
            || current.state === "CLOSED") && input.toState === "WAITING_ON_V")
        : input.actor === "V"
          ? ((current.state === "WAITING_ON_V" && input.toState === "WAITING_ON_USER")
            || (current.state !== "CLOSED" && input.toState === "CLOSED"))
          : false;
      if (!legal) return null;
      await client.query("UPDATE support.\"case\" SET state=$2 WHERE case_id=$1",[
        input.caseId,input.toState
      ]);
      await client.query(`
        INSERT INTO support.case_event(case_event_id,case_id,from_state,to_state,at,actor)
        VALUES($1,$2,$3,$4,$5,$6)
      `,[randomUUID(),input.caseId,current.state,input.toState,input.at,input.actor]);
      return Object.freeze({
        caseId: current.case_id,sessionId: current.session_id,
        identityOwnerRef: current.identity_owner_ref,language: current.language,
        createdAt: current.created_at,triggerPredicate: current.trigger_predicate,
        toolCalls: current.tool_calls,
        kbVersion: current.kb_version,slaHours: current.sla_hours,state: input.toState
      });
    });
  }

  async updateCaseSummary(input: Readonly<{
    caseId: string;
    status: "DONE" | "TIMED_OUT";
    summaryCiphertext: Uint8Array | null;
    summaryAt: Date;
    summaryAuthoritative: false;
  }>): Promise<void> {
    const ciphertext = input.summaryCiphertext === null
      ? null : Buffer.from(input.summaryCiphertext);
    try {
      const updated = await this.pool.query(`
        UPDATE support."case"
        SET summary_ciphertext=$2,summary_at=$3,summary_status=$4,
          summary_authoritative=false
        WHERE case_id=$1
          AND summary_status IS NULL
          AND $3 <= created_at + interval '60 seconds'
      `,[input.caseId,ciphertext,input.summaryAt,input.status]);
      if (updated.rowCount !== 1) throw new TypeError("SUPPORT_CASE_SUMMARY_INVALID");
    } finally {
      ciphertext?.fill(0);
    }
  }
}

export class PostgresSupportCaseSummaryRepository {
  constructor(readonly pool: Pool) {}

  async listOwnCases(identityOwnerRef: string): Promise<readonly Readonly<Record<string,unknown>>[]> {
    const rows = await this.pool.query(`
      SELECT case_id,state,language,created_at
      FROM support."case"
      WHERE identity_owner_ref=$1
      ORDER BY created_at,case_id
    `,[identityOwnerRef]);
    return Object.freeze(rows.rows.map((row) => Object.freeze(row)));
  }

  async readCaseKey(caseId: string): Promise<Uint8Array | null> {
    const row = (await this.pool.query<{ wrapped_key: Buffer }>(`
      SELECT wrapped_key FROM support.case_key
      WHERE case_id=$1 AND destroyed_at IS NULL
    `,[caseId])).rows[0];
    return row === undefined ? null : Buffer.from(row.wrapped_key);
  }

  async updateCaseSummary(input: Readonly<{
    caseId: string;
    status: "DONE" | "TIMED_OUT";
    summaryCiphertext: Uint8Array | null;
    summaryAt: Date;
    summaryAuthoritative: false;
  }>): Promise<void> {
    const ciphertext = input.summaryCiphertext === null
      ? null : Buffer.from(input.summaryCiphertext);
    try {
      const updated = await this.pool.query(`
        UPDATE support."case"
        SET summary_ciphertext=$2,summary_at=$3,summary_status=$4,
          summary_authoritative=false
        WHERE case_id=$1
          AND summary_status IS NULL
          AND $3 <= created_at + interval '60 seconds'
      `,[input.caseId,ciphertext,input.summaryAt,input.status]);
      if (updated.rowCount !== 1) throw new TypeError("SUPPORT_CASE_SUMMARY_INVALID");
    } finally {
      ciphertext?.fill(0);
    }
  }

  async listInboxEncrypted(): Promise<readonly Readonly<Record<string,unknown>>[]> {
    const rows = await this.pool.query(`
      SELECT inbox.case_id,inbox.created_at,inbox.language,inbox.trigger_predicate,inbox.state,
        inbox.transcript_snapshot_ciphertext,key.wrapped_key
      FROM support.inbox AS inbox
      JOIN support.case_key AS key ON key.case_id=inbox.case_id
      WHERE key.destroyed_at IS NULL
      ORDER BY inbox.created_at,inbox.case_id
    `);
    return Object.freeze(rows.rows.map((row) => Object.freeze(row)));
  }

  async readCaseEncrypted(input: Readonly<{
    caseId?: string;
    tokenSha256?: string;
    page?: Readonly<{ limit: number;beforeAt?: Date;beforeId?: string }>;
  }>): Promise<Readonly<Record<string,unknown>> | null> {
    if ((input.caseId === undefined) === (input.tokenSha256 === undefined)) {
      throw new TypeError("SUPPORT_CASE_LOOKUP_INVALID");
    }
    const row = (await this.pool.query(`
      SELECT opened.case_id,opened.session_id,opened.identity_owner_ref,opened.language,
        opened.created_at,opened.trigger_predicate,opened.state,opened.sla_hours,
        opened.transcript_snapshot_ciphertext,opened.summary_ciphertext,
        opened.summary_status,opened.summary_at,opened.shredded_at,
        key.wrapped_key,key.destroyed_at,
        (SELECT count(*)::text FROM support.message
          WHERE session_id=opened.session_id) AS session_message_count,
        (SELECT count(*)::text FROM support.case_message
          WHERE case_id=opened.case_id) AS case_message_count
      FROM support."case" AS opened
      JOIN support.case_key AS key ON key.case_id=opened.case_id
      WHERE ($1::uuid IS NULL OR opened.case_id=$1)
        AND ($2::char(64) IS NULL OR opened.token_sha256=$2)
    `,[input.caseId ?? null,input.tokenSha256 ?? null])).rows[0];
    if (row === undefined) return null;
    const limit = input.page?.limit ?? 40;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new TypeError("SUPPORT_CASE_PAGE_INVALID");
    }
    if ((input.page?.beforeAt === undefined) !== (input.page?.beforeId === undefined)) {
      throw new TypeError("SUPPORT_CASE_PAGE_INVALID");
    }
    if (row.shredded_at !== null || row.destroyed_at !== null) {
      return Object.freeze({
        ...row,case_messages: Object.freeze([]),case_message_next_cursor: null
      });
    }
    const messageRows = (await this.pool.query<{
      case_message_id: string;role: string;content_ciphertext: Buffer;at: Date;redacted: boolean;
    }>(`
      SELECT case_message_id,role,content_ciphertext,at,redacted
      FROM support.case_message
      WHERE case_id=$1
        AND ($2::timestamptz IS NULL OR (at,case_message_id) < ($2,$3::uuid))
      ORDER BY at DESC,case_message_id DESC
      LIMIT $4
    `,[row.case_id,input.page?.beforeAt ?? null,input.page?.beforeId ?? null,limit + 1])).rows;
    const hasMore = messageRows.length > limit;
    const page = messageRows.slice(0,limit);
    const next = hasMore ? page.at(-1) : undefined;
    return Object.freeze({
      ...row,
      case_messages: Object.freeze(page.reverse().map((message) => Object.freeze({
        id: message.case_message_id,role: message.role,
        content_ciphertext: message.content_ciphertext.toString("base64"),at: message.at,
        redacted: message.redacted
      }))),
      case_message_next_cursor: next === undefined
        ? null : Object.freeze({ at: next.at,id: next.case_message_id })
    });
  }

  async appendCaseMessage(input: Readonly<{
    caseId: string;
    messageId: string;
    role: "user" | "V";
    contentCiphertext: Uint8Array;
    redacted: boolean;
    messageLimit: number;
    at: Date;
  }>): Promise<"WAITING_ON_V" | "WAITING_ON_USER" | "LIMIT_REACHED" | "SHREDDED" | null> {
    const ciphertext = Buffer.from(input.contentCiphertext);
    try {
      return await withSupportTransaction(this.pool,async (client) => {
        const parent = (await client.query<{ session_id: string }>(
          "SELECT session_id FROM support.\"case\" WHERE case_id=$1",[input.caseId]
        )).rows[0];
        if (parent === undefined) return null;
        // Match shred's canonical session-domain lock before acquiring case or
        // key row locks. Whichever transaction owns this lock establishes the
        // only lawful linearization point for append versus shred.
        await lockSupportSessions(client,[parent.session_id]);
        const current = (await client.query<{
          state: string;shredded_at: Date | null;destroyed_at: Date | null;wrapped_key: Buffer;
        }>(`
          SELECT opened.state,opened.shredded_at,key.destroyed_at,key.wrapped_key
          FROM support."case" AS opened
          JOIN support.case_key AS key ON key.case_id=opened.case_id
          WHERE opened.case_id=$1 AND opened.session_id=$2
          FOR UPDATE OF opened,key
        `,[input.caseId,parent.session_id])).rows[0];
        if (current === undefined) return null;
        if (current.shredded_at !== null || current.destroyed_at !== null
          || current.wrapped_key.byteLength !== 61 || current.wrapped_key[0] !== 1
          || current.wrapped_key.equals(ZERO_WRAPPED_SUPPORT_KEY)) return "SHREDDED";
        const count = Number((await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM support.case_message WHERE case_id=$1",
          [input.caseId]
        )).rows[0]?.count ?? "0");
        if (count >= input.messageLimit) return "LIMIT_REACHED";
        const toState = input.role === "user" ? "WAITING_ON_V" : "WAITING_ON_USER";
        if (input.role === "V" && current.state === "NEW") {
          await client.query(`
            INSERT INTO support.case_event(case_event_id,case_id,from_state,to_state,at,actor)
            VALUES($1,$2,'NEW','WAITING_ON_V',$3,'user')
          `,[randomUUID(),input.caseId,input.at]);
        }
        await client.query(`
          INSERT INTO support.case_message(
            case_message_id,case_id,role,content_ciphertext,redacted,at
          ) VALUES($1,$2,$3,$4,$5,$6)
        `,[input.messageId,input.caseId,input.role,ciphertext,input.redacted,input.at]);
        const fromState = input.role === "V" && current.state === "NEW"
          ? "WAITING_ON_V" : current.state;
        if (fromState !== toState) {
          await client.query("UPDATE support.\"case\" SET state=$2 WHERE case_id=$1",[
            input.caseId,toState
          ]);
          await client.query(`
            INSERT INTO support.case_event(case_event_id,case_id,from_state,to_state,at,actor)
            VALUES($1,$2,$3,$4,$5,$6)
          `,[randomUUID(),input.caseId,fromState,toState,input.at,input.role]);
        }
        return toState;
      });
    } finally {
      ciphertext.fill(0);
    }
  }

  async closeCase(caseId: string,at: Date): Promise<boolean> {
    return withSupportTransaction(this.pool,async (client) => {
      const current = (await client.query<{ state: string }>(
        "SELECT state FROM support.\"case\" WHERE case_id=$1 FOR UPDATE",[caseId]
      )).rows[0];
      if (current === undefined || current.state === "CLOSED") return false;
      await client.query("UPDATE support.\"case\" SET state='CLOSED' WHERE case_id=$1",[caseId]);
      await client.query(`
        INSERT INTO support.case_event(case_event_id,case_id,from_state,to_state,at,actor)
        VALUES($1,$2,$3,'CLOSED',$4,'V')
      `,[randomUUID(),caseId,current.state,at]);
      return true;
    });
  }
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
  const audit = (await client.query<ShredAuditRow>(`
    SELECT at,os_user,target_kind,target_ref,keys_destroyed
    FROM support.shred_audit
    WHERE target_kind=$1 AND target_ref=$2
    FOR UPDATE
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

/** Shred-only facet shared by the API service and the operator runner. */
export class PostgresSupportShredRepository {
  constructor(readonly pool: Pool) {}

  async shredOwner(ownerRef: string, osUser: string, at: Date): Promise<SupportShredResult> {
    assertSupportShredInput(ownerRef, osUser, at);
    return withSupportTransaction(this.pool, async (client) => {
      await lockSupportOwners(client, [ownerRef]);
      const sessionIds = (await client.query<{ session_id: string }>(`
        SELECT session_id FROM support.session
        WHERE identity_owner_ref=$1
        ORDER BY session_id
      `, [ownerRef])).rows.map(({ session_id }) => session_id);
      if (sessionIds.length === 0) supportShredFailure("SUPPORT_SHRED_TARGET_NOT_FOUND");
      await lockSupportSessions(client, sessionIds);
      const target = await lockShredTargetRows(client, sessionIds, "owner", ownerRef);
      if (target.sessions.length !== sessionIds.length
        || target.sessions.some(({ identity_owner_ref }) => identity_owner_ref !== ownerRef)) {
        supportShredFailure("SUPPORT_SHRED_STATE_INVALID");
      }
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
}

/**
 * A held PostgreSQL advisory lock is the cross-process relay lease. The
 * append-only call row is recorded only by the final provider gate; disconnect
 * releases the concurrency lease without deleting operational evidence.
 */
export class PostgresSupportRelayReservationRepository {
  static readonly MAX_CONCURRENCY_SLOTS = 16;

  constructor(readonly pool: Pool) {}

  async enter(input: Readonly<{
    at: Date;
    concurrency: number;
    dailyCap: number;
    queueDepth: number;
  }>): Promise<SupportRelayQueueEntryResult> {
    this.#validate(input);
    if (!Number.isSafeInteger(input.queueDepth) || input.queueDepth < 0) {
      throw new TypeError("SUPPORT_RELAY_RESERVATION_INVALID");
    }
    const waiterId = randomUUID();
    const client = await this.pool.connect();
    let transaction = false;
    let slot: number | undefined;
    try {
      await client.query("BEGIN");
      transaction = true;
      await this.#lockQueue(client);
      await this.#expireWaiters(client,input.at);
      await this.#trimWaiters(client,input.at,input.queueDepth);
      const ticket = Number((await client.query<{ ticket: string }>(`
        INSERT INTO support.relay_waiter(waiter_id,enqueued_at)
        VALUES($1,$2) RETURNING ticket::text
      `,[waiterId,input.at])).rows[0]?.ticket);
      if (!Number.isSafeInteger(ticket)) throw new TypeError("SUPPORT_RELAY_RESERVATION_INVALID");
      await this.#recordWait(client,waiterId,input.at);
      const head = await this.#headWaiter(client,input.at);
      if (head === waiterId) slot = await this.#trySlot(client,input.concurrency);
      if (slot !== undefined) {
        await this.#recordTerminal(client,waiterId,"ACQUIRED",input.at);
        await client.query("COMMIT");
        transaction = false;
        return this.#acquired(client,slot,waiterId);
      }
      const position = Number((await client.query<{ position: string }>(`
        WITH latest AS (
          SELECT DISTINCT ON (event.waiter_id)
            event.waiter_id,event.state,event.lease_until
          FROM support.relay_waiter_event AS event
          ORDER BY event.waiter_id,event.event_sequence DESC
        )
        SELECT pg_catalog.count(*)::text AS position
        FROM support.relay_waiter AS waiter
        JOIN latest USING(waiter_id)
        WHERE latest.state='WAITING' AND latest.lease_until >= $2
          AND waiter.ticket <= $1
      `,[ticket,input.at])).rows[0]?.position);
      if (!Number.isSafeInteger(position) || position < 1) {
        throw new TypeError("SUPPORT_RELAY_RESERVATION_INVALID");
      }
      if (position > input.queueDepth) {
        await this.#recordTerminal(client,waiterId,"CANCELLED",input.at);
        await client.query("COMMIT");
        transaction = false;
        client.release();
        return Object.freeze({ kind: "FULL" });
      }
      await client.query("COMMIT");
      transaction = false;
      client.release();
      return Object.freeze({ kind: "WAITING",waiterId,ticket,position });
    } catch (error) {
      if (transaction) await client.query("ROLLBACK").catch(() => undefined);
      if (slot !== undefined) await this.#unlockAndRelease(client,slot);
      else client.release();
      throw error;
    }
  }

  async cancel(input: Readonly<{ waiterId: string;at: Date }>): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(input.waiterId) || !Number.isFinite(input.at.getTime())) {
      throw new TypeError("SUPPORT_RELAY_RESERVATION_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.#lockQueue(client);
      await this.#expireWaiters(client,input.at);
      const state = await this.#waiterState(client,input.waiterId);
      if (state === "WAITING") {
        await this.#recordTerminal(client,input.waiterId,"CANCELLED",input.at);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async renew(input: Readonly<{
    waiterIds: readonly string[];at: Date;
  }>): Promise<readonly string[]> {
    if (!Number.isFinite(input.at.getTime()) || input.waiterIds.length === 0
      || new Set(input.waiterIds).size !== input.waiterIds.length
      || input.waiterIds.some((waiterId) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
          .test(waiterId))) {
      throw new TypeError("SUPPORT_RELAY_RESERVATION_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.#lockQueue(client);
      await this.#expireWaiters(client,input.at);
      const active: string[] = [];
      for (const waiterId of input.waiterIds) {
        const latest = await this.#waiterLatest(client,waiterId);
        if (latest?.state !== "WAITING" || latest.leaseUntil === null
          || latest.leaseUntil.getTime() < input.at.getTime()) continue;
        active.push(waiterId);
        if (latest.leaseUntil.getTime() <= input.at.getTime() + 2_000) {
          await this.#recordWait(client,waiterId,input.at);
        }
      }
      await client.query("COMMIT");
      return Object.freeze(active);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async reconcile(input: Readonly<{
    waiterIds: readonly string[];at: Date;queueDepth: number;
  }>): Promise<Readonly<{
    liveWaiterIds: readonly string[];
    capacityRejectedWaiterIds: readonly string[];
  }>> {
    if (!Number.isFinite(input.at.getTime()) || input.waiterIds.length === 0
      || new Set(input.waiterIds).size !== input.waiterIds.length
      || !Number.isSafeInteger(input.queueDepth) || input.queueDepth < 0
      || input.waiterIds.some((waiterId) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
          .test(waiterId))) {
      throw new TypeError("SUPPORT_RELAY_RESERVATION_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.#lockQueue(client);
      await this.#expireWaiters(client,input.at);
      const trimmed = new Set(await this.#trimWaiters(client,input.at,input.queueDepth));
      const live: string[] = [];
      for (const waiterId of input.waiterIds) {
        if (trimmed.has(waiterId)) continue;
        const latest = await this.#waiterLatest(client,waiterId);
        if (latest?.state !== "WAITING" || latest.leaseUntil === null
          || latest.leaseUntil.getTime() < input.at.getTime()) continue;
        live.push(waiterId);
        if (latest.leaseUntil.getTime() <= input.at.getTime() + 2_000) {
          await this.#recordWait(client,waiterId,input.at);
        }
      }
      await client.query("COMMIT");
      return Object.freeze({
        liveWaiterIds: Object.freeze(live),
        capacityRejectedWaiterIds: Object.freeze(
          input.waiterIds.filter((waiterId) => trimmed.has(waiterId))
        )
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async reserveModelCall(input: Readonly<{
    at: Date;dailyCap: number;callId?: string;signal?: AbortSignal;
  }>): Promise<Readonly<{ kind: "RECORDED" | "DAILY_CAP" }>> {
    if (!Number.isFinite(input.at.getTime())
      || !Number.isSafeInteger(input.dailyCap) || input.dailyCap < 1
      || (input.callId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
        .test(input.callId))) {
      throw new TypeError("SUPPORT_RELAY_RESERVATION_INVALID");
    }
    const assertLive = (): void => {
      if (input.signal?.aborted === true) {
        throw new TypedDomainError("SUPPORT_MODEL_UNAVAILABLE","SUPPORT_MODEL_UNAVAILABLE");
      }
    };
    assertLive();
    const client = await this.pool.connect();
    try {
      assertLive();
      await client.query("BEGIN");
      assertLive();
      await client.query(`SELECT pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('debateai:support-relay-daily:v1',0)
      )`);
      assertLive();
      const utcDay = input.at.toISOString().slice(0,10);
      const calls = Number((await client.query<{ count: string }>(`
        SELECT pg_catalog.count(*)::text AS count
        FROM support.relay_call WHERE utc_day=$1::date
      `,[utcDay])).rows[0]?.count);
      assertLive();
      if (!Number.isSafeInteger(calls)) throw new TypeError("SUPPORT_RELAY_RESERVATION_INVALID");
      if (calls >= input.dailyCap) {
        await client.query("COMMIT");
        return Object.freeze({ kind: "DAILY_CAP" });
      }
      await client.query(`
        INSERT INTO support.relay_call(call_id,utc_day,acquired_at)
        VALUES($1,$2::date,$3)
      `,[input.callId ?? randomUUID(),utcDay,input.at]);
      assertLive();
      await client.query("COMMIT");
      return Object.freeze({ kind: "RECORDED" });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async tryAcquire(input: Readonly<{
    at: Date;
    concurrency: number;
    dailyCap: number;
    waiterId?: string;
  }>): Promise<SupportRelayReservationResult> {
    if (input.waiterId !== undefined) return this.#tryAcquireWaiter(input as Readonly<{
      at: Date;concurrency: number;dailyCap: number;waiterId: string;
    }>);
    if (!Number.isFinite(input.at.getTime())
      || !Number.isSafeInteger(input.concurrency) || input.concurrency < 1
      || !Number.isSafeInteger(input.dailyCap) || input.dailyCap < 1) {
      throw new TypeError("SUPPORT_RELAY_RESERVATION_INVALID");
    }
    const client = await this.pool.connect();
    let slot: number | undefined;
    let transaction = false;
    try {
      await client.query("BEGIN");
      transaction = true;
      await this.#lockQueue(client);
      await this.#expireWaiters(client,input.at);
      if (await this.#headWaiter(client,input.at) !== undefined) {
        await client.query("COMMIT");
        transaction = false;
        client.release();
        return Object.freeze({ kind: "BUSY" });
      }
      slot = await this.#trySlot(client,input.concurrency);
      if (slot === undefined) {
        await client.query("COMMIT");
        transaction = false;
        client.release();
        return Object.freeze({ kind: "BUSY" });
      }
      await client.query("COMMIT");
      transaction = false;
      let releaseStarted = false;
      let clientReleased = false;
      const forceRelease = (): void => {
        if (clientReleased) return;
        clientReleased = true;
        client.release(true);
      };
      return Object.freeze({
        kind: "ACQUIRED" as const,
        forceRelease,
        release: async () => {
          if (releaseStarted) return;
          releaseStarted = true;
          try {
            await client.query(`SELECT pg_catalog.pg_advisory_unlock(
              pg_catalog.hashtextextended(
                'debateai:support-relay-concurrency:v1',$1::bigint
              )
            )`,[slot]);
          } finally {
            if (!clientReleased) {
              clientReleased = true;
              client.release();
            }
          }
        }
      });
    } catch (error) {
      if (transaction) await client.query("ROLLBACK").catch(() => undefined);
      if (slot !== undefined) {
        await client.query(`SELECT pg_catalog.pg_advisory_unlock(
          pg_catalog.hashtextextended('debateai:support-relay-concurrency:v1',$1::bigint)
        )`,[slot]).catch(() => undefined);
      }
      client.release();
      throw error;
    }
  }

  async #tryAcquireWaiter(input: Readonly<{
    at: Date;concurrency: number;dailyCap: number;waiterId: string;
  }>): Promise<SupportRelayReservationResult> {
    this.#validate(input);
    const client = await this.pool.connect();
    let transaction = false;
    let slot: number | undefined;
    try {
      await client.query("BEGIN");
      transaction = true;
      await this.#lockQueue(client);
      await this.#expireWaiters(client,input.at);
      const latest = await this.#waiterLatest(client,input.waiterId);
      if (latest?.state !== "WAITING" || latest.leaseUntil === null
        || latest.leaseUntil.getTime() < input.at.getTime()) {
        await client.query("COMMIT");
        transaction = false;
        client.release();
        return Object.freeze({ kind: "BUSY" });
      }
      if (latest.leaseUntil.getTime() <= input.at.getTime() + 2_000) {
        await this.#recordWait(client,input.waiterId,input.at);
      }
      if (await this.#headWaiter(client,input.at) !== input.waiterId) {
        await client.query("COMMIT");
        transaction = false;
        client.release();
        return Object.freeze({ kind: "BUSY" });
      }
      slot = await this.#trySlot(client,input.concurrency);
      if (slot === undefined) {
        await client.query("COMMIT");
        transaction = false;
        client.release();
        return Object.freeze({ kind: "BUSY" });
      }
      await this.#recordTerminal(client,input.waiterId,"ACQUIRED",input.at);
      await client.query("COMMIT");
      transaction = false;
      return this.#acquired(client,slot,input.waiterId);
    } catch (error) {
      if (transaction) await client.query("ROLLBACK").catch(() => undefined);
      if (slot !== undefined) await this.#unlockAndRelease(client,slot);
      else client.release();
      throw error;
    }
  }

  #validate(input: Readonly<{ at: Date;concurrency: number;dailyCap: number }>): void {
    if (!Number.isFinite(input.at.getTime())
      || !Number.isSafeInteger(input.concurrency) || input.concurrency < 1
      || !Number.isSafeInteger(input.dailyCap) || input.dailyCap < 1) {
      throw new TypeError("SUPPORT_RELAY_RESERVATION_INVALID");
    }
  }

  async #lockQueue(client: PoolClient): Promise<void> {
    await client.query(`SELECT pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('debateai:support-relay-queue:v1',0)
    )`);
  }

  async #recordWait(client: PoolClient,waiterId: string,at: Date): Promise<void> {
    await client.query(`
      INSERT INTO support.relay_waiter_event(waiter_id,state,at,lease_until)
      VALUES($1,'WAITING',$2::timestamptz,$2::timestamptz + interval '5 seconds')
    `,[waiterId,at]);
  }

  async #recordTerminal(
    client: PoolClient,waiterId: string,
    state: "ACQUIRED" | "COMPLETED" | "CANCELLED" | "DAILY_CAP",at: Date
  ): Promise<void> {
    await client.query(`
      INSERT INTO support.relay_waiter_event(waiter_id,state,at,lease_until)
      VALUES($1,$2,$3,NULL)
    `,[waiterId,state,at]);
  }

  async #waiterState(client: PoolClient,waiterId: string): Promise<string | undefined> {
    return (await this.#waiterLatest(client,waiterId))?.state;
  }

  async #waiterLatest(
    client: PoolClient,waiterId: string
  ): Promise<Readonly<{ state: string;leaseUntil: Date | null }> | undefined> {
    const row = (await client.query<{ state: string;lease_until: Date | null }>(`
      SELECT state,lease_until FROM support.relay_waiter_event
      WHERE waiter_id=$1 ORDER BY event_sequence DESC LIMIT 1
    `,[waiterId])).rows[0];
    return row === undefined ? undefined : Object.freeze({
      state: row.state,leaseUntil: row.lease_until
    });
  }

  async #expireWaiters(client: PoolClient,at: Date): Promise<void> {
    await client.query(`
      WITH latest AS (
        SELECT DISTINCT ON (event.waiter_id)
          event.waiter_id,event.state,event.lease_until
        FROM support.relay_waiter_event AS event
        ORDER BY event.waiter_id,event.event_sequence DESC
      )
      INSERT INTO support.relay_waiter_event(waiter_id,state,at,lease_until)
      SELECT waiter_id,'CANCELLED',$1::timestamptz,NULL
      FROM latest
      WHERE state='WAITING' AND lease_until < $1::timestamptz
      ORDER BY waiter_id
    `,[at]);
  }

  async #trimWaiters(client: PoolClient,at: Date,queueDepth: number): Promise<readonly string[]> {
    const excess = (await client.query<{ waiter_id: string }>(`
      WITH latest AS (
        SELECT DISTINCT ON (event.waiter_id)
          event.waiter_id,event.state,event.lease_until
        FROM support.relay_waiter_event AS event
        ORDER BY event.waiter_id,event.event_sequence DESC
      )
      SELECT waiter.waiter_id
      FROM support.relay_waiter AS waiter JOIN latest USING(waiter_id)
      WHERE latest.state='WAITING' AND latest.lease_until >= $1
      ORDER BY waiter.ticket
      OFFSET $2
    `,[at,queueDepth])).rows.map(({ waiter_id }) => waiter_id);
    for (const waiterId of excess) {
      await this.#recordTerminal(client,waiterId,"CANCELLED",at);
    }
    return Object.freeze(excess);
  }

  async #headWaiter(client: PoolClient,at: Date): Promise<string | undefined> {
    return (await client.query<{ waiter_id: string }>(`
      WITH latest AS (
        SELECT DISTINCT ON (event.waiter_id)
          event.waiter_id,event.state,event.lease_until
        FROM support.relay_waiter_event AS event
        ORDER BY event.waiter_id,event.event_sequence DESC
      )
      SELECT waiter.waiter_id
      FROM support.relay_waiter AS waiter JOIN latest USING(waiter_id)
      WHERE latest.state='WAITING' AND latest.lease_until >= $1
      ORDER BY waiter.ticket LIMIT 1
    `,[at])).rows[0]?.waiter_id;
  }

  async #trySlot(client: PoolClient,concurrency: number): Promise<number | undefined> {
    let allowed: number | undefined;
    let forbiddenHeld = false;
    for (let candidate = 0;
      candidate < PostgresSupportRelayReservationRepository.MAX_CONCURRENCY_SLOTS;
      candidate += 1) {
      const acquired = (await client.query<{ acquired: boolean }>(`
        SELECT pg_catalog.pg_try_advisory_lock(
          pg_catalog.hashtextextended('debateai:support-relay-concurrency:v1',$1::bigint)
        ) AS acquired
      `,[candidate])).rows[0]?.acquired;
      if (!acquired) {
        if (candidate >= concurrency) forbiddenHeld = true;
        continue;
      }
      if (candidate < concurrency && allowed === undefined) {
        allowed = candidate;
        continue;
      }
      await this.#unlockSlot(client,candidate);
    }
    if (!forbiddenHeld) return allowed;
    if (allowed !== undefined) await this.#unlockSlot(client,allowed);
    return undefined;
  }

  async #unlockSlot(client: PoolClient,slot: number): Promise<void> {
    await client.query(`SELECT pg_catalog.pg_advisory_unlock(
      pg_catalog.hashtextextended('debateai:support-relay-concurrency:v1',$1::bigint)
    )`,[slot]);
  }

  #acquired(
    client: PoolClient,slot: number,waiterId: string
  ): Extract<SupportRelayReservationResult,{ kind: "ACQUIRED" }> {
    let releaseStarted = false;
    let clientReleased = false;
    const forceRelease = (): void => {
      if (clientReleased) return;
      clientReleased = true;
      client.release(true);
    };
    return Object.freeze({
      kind: "ACQUIRED" as const,
      forceRelease,
      release: async () => {
        if (releaseStarted) return;
        releaseStarted = true;
        try {
          await client.query("BEGIN");
          await this.#recordTerminal(client,waiterId,"COMPLETED",new Date());
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        } finally {
          if (!clientReleased) {
            try {
              await client.query(`SELECT pg_catalog.pg_advisory_unlock(
                pg_catalog.hashtextextended(
                  'debateai:support-relay-concurrency:v1',$1::bigint
                )
              )`,[slot]);
            } finally {
              if (!clientReleased) {
                clientReleased = true;
                client.release();
              }
            }
          }
        }
      }
    });
  }

  async #unlockAndRelease(client: PoolClient,slot: number): Promise<void> {
    try {
      await client.query(`SELECT pg_catalog.pg_advisory_unlock(
        pg_catalog.hashtextextended('debateai:support-relay-concurrency:v1',$1::bigint)
      )`,[slot]);
    } finally {
      client.release();
    }
  }
}

/** Status-only consumers receive no creation callbacks or methods. */
export class PostgresSupportStatusRepository {
  constructor(readonly pool: Pool,readonly clock: () => Date = () => new Date()) {}

  async status(): Promise<SupportRepositoryStatus> {
    const result = await this.pool.query<{
      calls_today: string;
      calls_last_7_days: string;
      input_tokens_today: string | null;
      output_tokens_today: string | null;
      cost_usd_today: string | null;
      input_tokens_last_7_days: string | null;
      output_tokens_last_7_days: string | null;
      cost_usd_last_7_days: string | null;
      relay_outcome: "ANSWER_GROUNDED" | "REFUSE_SAFETY" | "DEGRADED" | null;
      relay_at: Date | null;
      deflection_7_days: string | null;
      deflection_30_days: string | null;
      rating_resolution_7_days: string | null;
      rating_resolution_30_days: string | null;
      open_sessions: string;
      new_cases: string;
    }>(`
      WITH bounds AS (
        SELECT $1::timestamptz AS observed_at
      ), model_spend AS (
        SELECT message.* FROM support.message AS message,bounds
        WHERE message.role='assistant' AND message.model_called
          AND message.received_at<=bounds.observed_at
      ), relay AS (
        SELECT message.outcome,message.completed_at
        FROM support.message AS message,bounds
        WHERE role='assistant' AND (
          outcome='ANSWER_GROUNDED'
          OR (outcome='REFUSE_SAFETY' AND model_called)
          OR (outcome='DEGRADED' AND degraded_reason='relay')
        ) AND message.completed_at<=bounds.observed_at
        ORDER BY completed_at DESC NULLS LAST,message_id DESC
        LIMIT 1
      ), session_metrics AS (
        SELECT session.session_id,
          EXISTS (SELECT 1 FROM support.message AS user_message,bounds
            WHERE user_message.session_id=session.session_id AND user_message.role='user'
              AND user_message.received_at>=bounds.observed_at-interval '7 days'
              AND user_message.received_at<=bounds.observed_at) AS eligible_7,
          EXISTS (SELECT 1 FROM support.message AS answer,bounds
            WHERE answer.session_id=session.session_id AND answer.role='assistant'
              AND answer.outcome='ANSWER_GROUNDED'
              AND answer.received_at>=bounds.observed_at-interval '7 days'
              AND answer.received_at<=bounds.observed_at) AS grounded_7,
          EXISTS (SELECT 1 FROM support.message AS answer,bounds
            WHERE answer.session_id=session.session_id AND answer.role='assistant'
              AND answer.outcome='ANSWER_GROUNDED'
              AND answer.received_at>=bounds.observed_at-interval '30 days'
              AND answer.received_at<=bounds.observed_at) AS grounded_30,
          NOT EXISTS (SELECT 1 FROM support.rating AS rating,bounds
            WHERE rating.session_id=session.session_id AND rating.rating='human'
              AND rating.at<=bounds.observed_at) AS no_human,
          NOT EXISTS (SELECT 1 FROM support."case" AS support_case,bounds
            WHERE support_case.session_id=session.session_id
              AND support_case.created_at<=bounds.observed_at) AS no_case
        FROM support.session AS session,bounds
        WHERE EXISTS (SELECT 1 FROM support.message AS user_message
          WHERE user_message.session_id=session.session_id AND user_message.role='user'
            AND user_message.received_at>=bounds.observed_at-interval '30 days'
            AND user_message.received_at<=bounds.observed_at)
      ), rating_metrics AS (
        SELECT rating.rating,rating.at FROM support.rating AS rating
        JOIN support.message AS answer ON answer.message_id=rating.message_id
        CROSS JOIN bounds
        WHERE answer.role='assistant' AND answer.outcome='ANSWER_GROUNDED'
          AND rating.at<=bounds.observed_at
      )
      SELECT
        (SELECT count(*) FROM model_spend
          WHERE received_at >= date_trunc('day',(SELECT observed_at FROM bounds)))::text AS calls_today,
        (SELECT count(*) FROM model_spend
          WHERE received_at >= (SELECT observed_at FROM bounds)-interval '7 days')::text AS calls_last_7_days,
        (SELECT sum(input_tokens)::text FROM model_spend
          WHERE received_at >= date_trunc('day',(SELECT observed_at FROM bounds))) AS input_tokens_today,
        (SELECT sum(output_tokens)::text FROM model_spend
          WHERE received_at >= date_trunc('day',(SELECT observed_at FROM bounds))) AS output_tokens_today,
        (SELECT sum(cost_usd)::text FROM model_spend
          WHERE received_at >= date_trunc('day',(SELECT observed_at FROM bounds))) AS cost_usd_today,
        (SELECT sum(input_tokens)::text FROM model_spend
          WHERE received_at >= (SELECT observed_at FROM bounds)-interval '7 days') AS input_tokens_last_7_days,
        (SELECT sum(output_tokens)::text FROM model_spend
          WHERE received_at >= (SELECT observed_at FROM bounds)-interval '7 days') AS output_tokens_last_7_days,
        (SELECT sum(cost_usd)::text FROM model_spend
          WHERE received_at >= (SELECT observed_at FROM bounds)-interval '7 days') AS cost_usd_last_7_days,
        (SELECT outcome FROM relay) AS relay_outcome,
        (SELECT completed_at FROM relay) AS relay_at,
        (SELECT (count(*) FILTER (WHERE grounded_7 AND no_human AND no_case))::numeric
            / NULLIF(count(*) FILTER (WHERE eligible_7),0)
          FROM session_metrics)::text AS deflection_7_days,
        (SELECT (count(*) FILTER (WHERE grounded_30 AND no_human AND no_case))::numeric
            / NULLIF(count(*),0)
          FROM session_metrics)::text AS deflection_30_days,
        (SELECT (count(*) FILTER (WHERE rating='yes'))::numeric/NULLIF(count(*),0)
          FROM rating_metrics,bounds
          WHERE at>=bounds.observed_at-interval '7 days')::text AS rating_resolution_7_days,
        (SELECT (count(*) FILTER (WHERE rating='yes'))::numeric/NULLIF(count(*),0)
          FROM rating_metrics,bounds
          WHERE at>=bounds.observed_at-interval '30 days')::text AS rating_resolution_30_days,
        (SELECT count(*) FROM support.session AS session
          WHERE session.state='OPEN' AND NOT EXISTS (
            SELECT 1 FROM support.abuse_event AS event
            WHERE event.session_id=session.session_id AND event.class='LOCK'
          ))::text AS open_sessions,
        (SELECT count(*) FROM support."case" WHERE state='NEW')::text AS new_cases
    `,[this.clock()]);
    const row = result.rows[0];
    if (row === undefined) throw new TypeError("SUPPORT_STATUS_READ_FAILED");
    return Object.freeze({
      callsToday: Number(row.calls_today),
      callsLast7Days: Number(row.calls_last_7_days),
      ...(row.input_tokens_today === null
        ? {} : { inputTokensToday: Number(row.input_tokens_today) }),
      ...(row.output_tokens_today === null
        ? {} : { outputTokensToday: Number(row.output_tokens_today) }),
      ...(row.cost_usd_today === null ? {} : { costUsdToday: Number(row.cost_usd_today) }),
      ...(row.input_tokens_last_7_days === null
        ? {} : { inputTokensLast7Days: Number(row.input_tokens_last_7_days) }),
      ...(row.output_tokens_last_7_days === null
        ? {} : { outputTokensLast7Days: Number(row.output_tokens_last_7_days) }),
      ...(row.cost_usd_last_7_days === null
        ? {} : { costUsdLast7Days: Number(row.cost_usd_last_7_days) }),
      relayState: row.relay_outcome === "DEGRADED" ? "UNAVAILABLE" : "AVAILABLE",
      ...(row.relay_outcome === "DEGRADED" && row.relay_at !== null
        ? { relayUnavailableSince: row.relay_at } : {}),
      deflection7Days: row.deflection_7_days === null ? null : Number(row.deflection_7_days),
      deflection30Days: row.deflection_30_days === null ? null : Number(row.deflection_30_days),
      ratingResolution7Days: row.rating_resolution_7_days === null
        ? null : Number(row.rating_resolution_7_days),
      ratingResolution30Days: row.rating_resolution_30_days === null
        ? null : Number(row.rating_resolution_30_days),
      openSessions: Number(row.open_sessions),
      newCases: Number(row.new_cases)
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
    || support.support_select_count !== "16" || support.support_insert_count !== "16"
    || support.support_relation_count !== "17"
    || !support.support_application_matrix_valid || !support.support_guard_inaccessible
    || support.support_column_update_count !== "13"
    || support.support_forbidden_column_update
    || support.support_forbidden_privilege || support.outside_table_privilege) {
    throw new TypeError("SUPPORT_DATABASE_ROLE_INVALID");
  }
}
