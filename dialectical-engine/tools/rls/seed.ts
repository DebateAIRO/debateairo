/**
 * Row-level security S01 (PLAN S6.1, §0.3 "Seeding tool"; SPEC-v4 R35, R38; DECISIONS D32, D62, F-SEC-1): rows of two
 * accounts in each of the 110 in-scope tables, written as the superuser (seeding only, SPEC-v4 R35), in foreign-key
 * order, through the product's own triggers and checks — nothing is disabled, so a table a trigger or a constraint
 * refuses is reported in `unseedable` with the refusal's SQLSTATE and the constraint or message that refused it.
 *
 * Each account gets its own world: one extra live identity.session, five legacy-asker runs owned through
 * core.append_run_ownership_event (`main` carries the run-scoped rows; `sOld`→`sNew` and `mOld`→`mNew` are the two
 * supersession edges), the execution binding of `main`, one encrypted run (`enc`: the rows that need live private
 * content — the publication and the routing of its execution — hang off it), and then one row per table (several where a
 * later row needs them). A row belongs to an account by SPEC-v4 T4; for the four tables whose D32 predicate is `false` (no account key
 * exists in the row) the row is attributed by what it names: identity.audit_event's target_id (the user id),
 * billing.outbox's ref and payload and billing.xmoney_notice's external order id (the owner_ref), and its outcome's notice.
 *
 * F-SEC-1 (t_2e3023cd): the four two-run tables whose policy keys on ONE run column also get mixed-owner rows — `ab`, whose
 * policy column names a run of A and whose other run column names a run of B, and `ba`, the reverse. The supersession
 * guard (core.guard_run_supersession) refuses an edge between two owners, so the mixed core.run_supersession rows are
 * written between two runs of one owner and the new run is then handed to the other account with
 * core.append_run_ownership_event (the run's current owner decides T4).
 *
 * The report counts, per table, the rows of each account (`rows`), lists the refusals (`unseedable`), and names every
 * seeded row by its primary key as `jsonb_build_array(<primary key columns>)::text` (`keys`), the same text a test
 * computes on any connection, so a reader classifies a returned row without re-deriving any policy.
 */
import { randomBytes, randomInt, randomUUID } from "node:crypto";

/** One account (`RlsTestAccount` of tests/support/rls-logins.ts is assignable to it; no tools/ file imports tests/support). */
export type RlsSeedAccount = Readonly<{ userId: string; ownerRef: string }>;

export type RlsSeedOwner = "a" | "b" | "ab" | "ba";

export type RlsSeedReport = Readonly<{
  /** Per in-scope table: how many seeded rows belong to A and to B alone (mixed rows are in `keys` only). */
  rows: ReadonlyMap<string, Readonly<{ a: number; b: number }>>;
  /** Per table a seed step could not write: `<SQLSTATE> <constraint, or the refusal's message>`. Empty when all 110 hold rows. */
  unseedable: ReadonlyMap<string, string>;
  /** Per table: the primary-key text of every seeded row, by owner (`ab`/`ba`: F-SEC-1's mixed rows). */
  keys: ReadonlyMap<string, Readonly<Record<RlsSeedOwner, readonly string[]>>>;
}>;

type QueryResultLike = Readonly<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
/** A connection or pool: `pg.Pool`, `pg.PoolClient` and `@debateai/db`'s `Pool` all fit. */
export type RlsSeedQueryable = Readonly<{ query: (text: string, values?: unknown[]) => Promise<QueryResultLike> }>;
type Connectable = RlsSeedQueryable & Readonly<{
  connect: () => Promise<RlsSeedQueryable & Readonly<{ release: (error?: Error | boolean) => void }>>;
}>;

type RunName = "main" | "sOld" | "sNew" | "mOld" | "mNew";
const RUN_NAMES: readonly RunName[] = Object.freeze(["main", "sOld", "sNew", "mOld", "mNew"]);
const SENTINEL = "\u27e6DEBATEAI:CIPHERTEXT:V1\u27e7";

/** What a step has written for one account so far, by name, plus the account's world. */
export type RlsSeedWorld = {
  readonly label: "A" | "B" | string;
  readonly account: RlsSeedAccount;
  readonly sessionId: string;
  readonly runs: Readonly<Record<RunName | "enc", string>>;
  /** The main run's execution reference (its session_id, bound in identity.run_execution_binding). */
  readonly executionRef: string;
  /** The encrypted run's execution reference: rows that need live private content (publication, routing) hang off it. */
  readonly encExecutionRef: string;
  readonly made: Map<string, Record<string, unknown>>;
};

/** Writes one row of `relation` and returns it (with `rls_identity`, its primary-key text). */
export type RlsSeedInsert = (relation: string, sql: string, values: readonly unknown[]) => Promise<Record<string, unknown>>;

export type RlsSeedStep = Readonly<{
  relation: string;
  run: (insert: RlsSeedInsert, q: RlsSeedQueryable, world: RlsSeedWorld) => Promise<void>;
}>;

const hex = (bytes: number): string => randomBytes(bytes).toString("hex");
const digits = (): string => String(randomInt(1, 2_000_000_000));
const KEY_ID = "0123456789abcdef";

function made(world: RlsSeedWorld, name: string): Record<string, unknown> {
  const row = world.made.get(name);
  if (row === undefined) throw new RlsSeedParentMissing(name);
  return row;
}

class RlsSeedParentMissing extends Error {
  constructor(readonly parent: string) { super(`PARENT_UNSEEDED ${parent}`); }
}

/** Primary-key columns of every table, quoted for SQL, by `schema.table` (identity."user" as identity.user). */
async function primaryKeys(q: RlsSeedQueryable): Promise<ReadonlyMap<string, string>> {
  const result = await q.query(`SELECT n.nspname || '.' || c.relname AS relation,
      string_agg(quote_ident(a.attname), ',' ORDER BY array_position(i.indkey::int2[], a.attnum)) AS columns
    FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indisprimary GROUP BY 1`);
  return new Map(result.rows.map((row) => [String(row.relation), String(row.columns)] as const));
}

/** The SQL name of an in-scope relation (`identity.user` is `identity."user"`). */
export function rlsRelationSql(relation: string): string {
  const [schema, name] = relation.split(".") as [string, string];
  return `${schema}.${name === "user" ? '"user"' : name}`;
}

class Recorder {
  readonly keys = new Map<string, Record<RlsSeedOwner, string[]>>();
  readonly unseedable = new Map<string, string>();
  constructor(readonly pk: ReadonlyMap<string, string>) {}

  add(relation: string, owner: RlsSeedOwner, identity: string): void {
    let entry = this.keys.get(relation);
    if (entry === undefined) { entry = { a: [], b: [], ab: [], ba: [] }; this.keys.set(relation, entry); }
    entry[owner].push(identity);
  }

  move(relation: string, identity: string, from: RlsSeedOwner, to: RlsSeedOwner): void {
    const entry = this.keys.get(relation);
    const at = entry?.[from].indexOf(identity) ?? -1;
    if (entry === undefined || at < 0) throw new TypeError(`RLS_SEED_MOVE_UNKNOWN ${relation}`);
    entry[from].splice(at, 1);
    entry[to].push(identity);
  }

  refuse(relation: string, error: unknown): void {
    if (this.unseedable.has(relation)) return;
    if (error instanceof RlsSeedParentMissing) { this.unseedable.set(relation, error.message); return; }
    const e = error as { code?: string; constraint?: string; message?: string };
    this.unseedable.set(relation, `${e.code ?? "NO_SQLSTATE"} ${e.constraint ?? e.message ?? String(error)}`);
  }

  inserter(q: RlsSeedQueryable, owner: RlsSeedOwner): RlsSeedInsert {
    return async (relation, sql, values) => {
      const columns = this.pk.get(relation);
      if (columns === undefined) throw new TypeError(`RLS_SEED_NO_PRIMARY_KEY ${relation}`);
      const row = (await q.query(`${sql} RETURNING jsonb_build_array(${columns})::text AS rls_identity, *`, [...values])).rows[0]!;
      this.add(relation, owner, String(row.rls_identity));
      return row;
    };
  }

  freeze(tables: readonly string[]): RlsSeedReport {
    const rows = new Map(tables.map((relation) => {
      const entry = this.keys.get(relation);
      return [relation, Object.freeze({ a: entry?.a.length ?? 0, b: entry?.b.length ?? 0 })] as const;
    }));
    const keys = new Map([...this.keys].map(([relation, entry]) => [relation, Object.freeze({
      a: Object.freeze([...entry.a]), b: Object.freeze([...entry.b]),
      ab: Object.freeze([...entry.ab]), ba: Object.freeze([...entry.ba])
    })] as const));
    return Object.freeze({ rows, unseedable: new Map(this.unseedable), keys });
  }
}

/** A legacy-asker run (the shape tests/support/rls-logins.ts seedSessionAccount writes), its session_id a fresh UUID v4. */
const RUN_INSERT = `INSERT INTO core.run (question_line, asker_id, session_id, caller_scope, as_of, asker_risk_tier, risk_tier,
    tier_source, tier_provenance_ref, composition_budget_tier, depth_params, agent_count, discovered_panel,
    stranger_sample_rate, envelope_basis, register_version, battery_version, created_at_seq)
  VALUES ('rls seed ' || $1, 'asker:rls-seed-' || $1, $2, 'ASKER', now(), 'casual', 'casual', 'ASKER',
    'asker-declaration:rls-seed', 'low', '{}', 1,
    '[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',
    1, '{}', $3, 's00', ledger.allocate_sequence())`;

/** The ownership event `core.append_run_ownership_event` wrote for (run, owner), by its at_seq. */
async function ownershipEvent(q: RlsSeedQueryable, recorder: Recorder, runId: string, ownerRef: string,
  owner: RlsSeedOwner): Promise<void> {
  const atSeq = (await q.query("SELECT core.append_run_ownership_event($1::uuid,$2::uuid) AS at_seq", [runId, ownerRef])).rows[0]!.at_seq;
  const identity = (await q.query(`SELECT jsonb_build_array(${recorder.pk.get("core.run_ownership_event")})::text AS id
    FROM core.run_ownership_event WHERE at_seq = $1`, [atSeq])).rows[0]!.id;
  recorder.add("core.run_ownership_event", owner, String(identity));
}

/**
 * A run whose private content is live (core.run_private_content_is_live needs content_encryption_version 1): its
 * execution binding, key-provision intent and attestation secret first (their foreign keys are deferred), then the run
 * with the ciphertext sentinel and an envelope attested as core.enforce_content_attestation_v2 computes it, in one
 * transaction, owned through core.append_run_ownership_event.
 */
async function encryptedRun(q: RlsSeedQueryable, recorder: Recorder, account: RlsSeedAccount, sessionId: string, label: string,
  owner: RlsSeedOwner): Promise<Readonly<{ runId: string; executionRef: string }>> {
  const runId = randomUUID(), executionRef = randomUUID(), secret = randomBytes(32);
  const envelope = JSON.stringify({ v: 1, keyId: `run:${runId}:v1`, nonce: "bm9uY2U", ct: "Y3Q", tag: "dGFn" });
  await q.query("BEGIN");
  try {
    await q.query(`INSERT INTO identity.run_execution_binding(execution_ref,user_id,identity_session_id,run_id,created_at)
      VALUES($1,$2,$3,$4,now())`, [executionRef, account.userId, sessionId, runId]);
    await q.query(`INSERT INTO core.run_key_provision_intent(run_id,user_id,owner_ref,identity_session_id,execution_ref,
        requested_at,expires_at,cleanup_state) VALUES($1,$2,$3,$4,$5,now(),now()+interval '1 hour','PREPARED')`,
    [runId, account.userId, account.ownerRef, sessionId, executionRef]);
    await q.query("INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at) VALUES($1,$2,now())", [runId, secret]);
    await recorder.inserter(q, owner)("core.run", `INSERT INTO core.run (run_id, question_line, asker_id, session_id, caller_scope,
        as_of, asker_risk_tier, risk_tier, tier_source, tier_provenance_ref, composition_budget_tier, depth_params, agent_count,
        discovered_panel, stranger_sample_rate, envelope_basis, register_version, battery_version, created_at_seq,
        content_encryption_version, ask_contract, content_ciphertext, content_attestation)
      VALUES ($1, $2, 'owner:' || $3, $4, 'ASKER', now(), 'casual', 'casual', 'ASKER', 'asker-declaration:rls-seed', 'low', '{}', 1,
        '[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',
        1, '{}', $5, 's00', ledger.allocate_sequence(), 1, '{"ciphertext":true,"v":1}', $6::jsonb,
        audit_crypto_internal.hmac(core.content_envelope_attestation_bytes($1::uuid, 'core.run', $1::text, 'content_ciphertext',
          $6::jsonb), $7::bytea, 'sha256'))`,
    [runId, SENTINEL, account.ownerRef, executionRef, 1, envelope, secret]);
    await q.query("COMMIT");
  } catch (error) {
    await q.query("ROLLBACK");
    throw new TypeError(`RLS_SEED_ENCRYPTED_RUN ${label}: ${(error as Error).message}`, { cause: error });
  }
  await ownershipEvent(q, recorder, runId, account.ownerRef, owner);
  return Object.freeze({ runId, executionRef });
}

/** The superuser-only parents of an account's world: its user row, one more live session, five runs, one binding. */
async function prepareWorld(q: RlsSeedQueryable, recorder: Recorder, account: RlsSeedAccount, label: string,
  owner: RlsSeedOwner): Promise<RlsSeedWorld> {
  const user = await q.query(`SELECT jsonb_build_array(user_id)::text AS id FROM identity."user"
    WHERE user_id = $1 AND owner_ref = $2 AND state = 'active'`, [account.userId, account.ownerRef]);
  if (user.rows.length !== 1) throw new TypeError(`RLS_SEED_ACCOUNT_MISSING ${label}`);
  recorder.add("identity.user", owner, String(user.rows[0]!.id));
  const insert = recorder.inserter(q, owner);
  const session = await insert("identity.session", `INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,
      binding_context,created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at)
    VALUES($1,$2,$3,$4,'{}',now(),now(),now()+interval '1 day',now()+interval '30 days',now(),NULL)`,
  [randomUUID(), account.userId, `sha256:${hex(32)}`, `sha256:${hex(32)}`]);
  const runs = {} as Record<RunName, string>;
  let executionRef = "";
  for (const name of RUN_NAMES) {
    const sessionRef = randomUUID();
    const run = await insert("core.run", RUN_INSERT, [`${label}-${name}-${randomUUID()}`, sessionRef, 1]);
    runs[name] = String(run.run_id);
    if (name === "main") executionRef = sessionRef;
    await ownershipEvent(q, recorder, runs[name], account.ownerRef, owner);
  }
  await q.query(`INSERT INTO identity.run_execution_binding(execution_ref,user_id,identity_session_id,run_id,created_at)
    VALUES($1,$2,$3,$4,now())`, [executionRef, account.userId, session.session_id, runs.main]);
  const enc = await encryptedRun(q, recorder, account, String(session.session_id), label, owner);
  return { label, account, sessionId: String(session.session_id), runs: Object.freeze({ ...runs, enc: enc.runId }), executionRef,
    encExecutionRef: enc.executionRef, made: new Map() };
}

/**
 * One row per in-scope table (several where a later row needs them), in foreign-key order. Each step reads its parents
 * from `world.made` and writes through `insert`, so the same steps run as the superuser (seeding) or, in a test, on a
 * T1 login inside a request context (an own-row INSERT, SPEC-v4 R23).
 */
export const RLS_SEED_STEPS: readonly RlsSeedStep[] = Object.freeze([
  // identity — the account's own rows (identity.user and identity.session come from prepareWorld)
  { relation: "identity.channel_binding", run: async (insert, _q, w) => {
    w.made.set("channel_binding", await insert("identity.channel_binding", `INSERT INTO identity.channel_binding
      (user_id,channel_type,address_ciphertext,state,created_at) VALUES($1,'email',$2::jsonb,'pending_verification',now())`,
    [w.account.userId, JSON.stringify({ v: 1, rls: "seed" })]));
  } },
  { relation: "identity.mfa_factor", run: async (insert, _q, w) => {
    w.made.set("mfa_factor", await insert("identity.mfa_factor", `INSERT INTO identity.mfa_factor
      (user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,'totp','{}','active',now(),now())`,
    [w.account.userId]));
  } },
  { relation: "identity.login_challenge", run: async (insert, _q, w) => {
    w.made.set("login_challenge", await insert("identity.login_challenge", `INSERT INTO identity.login_challenge
      (user_id,token_hash,binding_hash,created_at,expires_at,first_step,password_hash_snapshot)
      VALUES($1,$2,$3,now(),now()+interval '10 minutes','PASSWORD','$argon2id$rls-seed')`,
    [w.account.userId, `sha256:${hex(32)}`, `sha256:${hex(32)}`]));
  } },
  { relation: "identity.recovery_code", run: async (insert, _q, w) => {
    w.made.set("recovery_code", await insert("identity.recovery_code", `INSERT INTO identity.recovery_code
      (recovery_code_id,user_id,code_slot,code_hash,created_at) VALUES($1,$2,1,$3,now())`,
    [randomUUID(), w.account.userId, `$argon2id$v=19$m=19456,t=2,p=1$rls-seed-${hex(8)}$fixture`]));
  } },
  { relation: "identity.audit_event", run: async (insert, _q, w) => {
    w.made.set("audit_event", await insert("identity.audit_event", `INSERT INTO identity.audit_event(audit_id,this_hash,actor_key_ref,
        event_type,target_type,target_id,occurred_at,source_context,decision,success)
      VALUES($1,$2,$3,'rls.seed','user',$4,now(),'{}','ALLOWED',true)`, [randomUUID(), randomBytes(32), randomUUID(), w.account.userId]));
  } },
  // billing — customer, subscription, quote, charge and every row keyed by them
  { relation: "billing.customer", run: async (insert, _q, w) => {
    w.made.set("customer", await insert("billing.customer", `INSERT INTO billing.customer(customer_id,owner_ref,created_at,created_locale)
      VALUES($1,$2,now(),'en')`, [randomUUID(), w.account.ownerRef]));
  } },
  { relation: "billing.customer_profile_event", run: async (insert, _q, w) => {
    w.made.set("customer_profile_event", await insert("billing.customer_profile_event", `INSERT INTO billing.customer_profile_event
      (customer_id,at,locale,profile_ciphertext,key_id) VALUES($1,now(),'en',$2,$3)`,
    [made(w, "customer").customer_id, randomBytes(16), KEY_ID]));
  } },
  { relation: "billing.customer_xmoney", run: async (insert, _q, w) => {
    w.made.set("customer_xmoney", await insert("billing.customer_xmoney", `INSERT INTO billing.customer_xmoney
      (customer_id,environment,xmoney_customer_id,at) VALUES($1,'stage',$2,now())`, [made(w, "customer").customer_id, digits()]));
  } },
  { relation: "billing.subscription_event", run: async (insert, _q, w) => {
    w.made.set("subscription_event", await insert("billing.subscription_event", `INSERT INTO billing.subscription_event
      (event_id,subscription_id,owner_ref,kind,at,plan_id,data) VALUES($1,$2,$3,'CREATED',now(),'PLUS',$4::jsonb)`,
    [randomUUID(), randomUUID(), w.account.ownerRef, JSON.stringify({ payment_provider: "netopia", payment_environment: "sandbox" })]));
  } },
  { relation: "billing.cancel_token", run: async (insert, _q, w) => {
    w.made.set("cancel_token", await insert("billing.cancel_token", `INSERT INTO billing.cancel_token
      (token_sha256,subscription_id,issued_at,expires_at) VALUES($1,$2,now(),now()+interval '1 day')`,
    [hex(32), made(w, "subscription_event").subscription_id]));
  } },
  { relation: "billing.cancel_token_use", run: async (insert, _q, w) => {
    w.made.set("cancel_token_use", await insert("billing.cancel_token_use", `INSERT INTO billing.cancel_token_use(token_sha256,used_at)
      VALUES($1,now())`, [made(w, "cancel_token").token_sha256]));
  } },
  { relation: "billing.withdrawal_owner_settlement", run: async (insert, _q, w) => {
    const event = made(w, "subscription_event");
    w.made.set("withdrawal_owner_settlement", await insert("billing.withdrawal_owner_settlement", `INSERT INTO
      billing.withdrawal_owner_settlement(subscription_id,withdrawn_event_id,owner_ref,dashboard_refund_micros,settled_at)
      VALUES($1,$2,$3,0,now())`, [event.subscription_id, event.event_id, w.account.ownerRef]));
  } },
  { relation: "billing.quote", run: async (insert, _q, w) => {
    w.made.set("quote", await insert("billing.quote", `INSERT INTO billing.quote(quote_id,owner_ref,plan_id,kind,net_micros,
        tax_micros,total_micros,tax_country,tax_rate_bp,tax_status,tax_name,created_at,expires_at,location_ciphertext,key_id,currency)
      VALUES($1,$2,'PLUS','SUBSCRIBE',10000,0,10000,'RO',0,'TAXABLE','VAT',now(),now()+interval '1 hour',$3,$4,'EUR')`,
    [randomUUID(), w.account.ownerRef, randomBytes(16), KEY_ID]));
  } },
  { relation: "billing.charge", run: async (insert, _q, w) => {
    w.made.set("charge", await insert("billing.charge", `INSERT INTO billing.charge(charge_id,owner_ref,subscription_id,kind,attempt,
        period_start,period_end,net_micros,tax_micros,total_micros,currency,created_at,payment_environment,payment_provider,quote_id)
      VALUES($1,$2,$3,'INITIAL',1,now(),now()+interval '30 days',10000,0,10000,'EUR',now(),'sandbox','netopia',$4)`,
    [hex(16), w.account.ownerRef, made(w, "subscription_event").subscription_id, made(w, "quote").quote_id]));
  } },
  { relation: "billing.charge_event", run: async (insert, _q, w) => {
    w.made.set("charge_event", await insert("billing.charge_event", `INSERT INTO billing.charge_event
      (charge_id,kind,at,payment_environment,payment_provider) VALUES($1,'REQUESTED',now(),'sandbox','netopia')`,
    [made(w, "charge").charge_id]));
  } },
  { relation: "billing.hosted_payment", run: async (insert, _q, w) => {
    w.made.set("hosted_payment", await insert("billing.hosted_payment", `INSERT INTO billing.hosted_payment(charge_id,payment_provider,
        payment_environment,provider_payment_id,redirect_ciphertext,key_id,started_at) VALUES($1,'netopia','sandbox',$2,$3,$4,now())`,
    [made(w, "charge").charge_id, `np-${hex(8)}`, randomBytes(16), KEY_ID]));
  } },
  { relation: "billing.card_token", run: async (insert, _q, w) => {
    w.made.set("card_token", await insert("billing.card_token", `INSERT INTO billing.card_token(token_id,payment_provider,
        payment_environment,token_ciphertext,key_id,created_at,customer_id,source_charge_id) VALUES($1,'netopia','sandbox',$2,$3,now(),$4,$5)`,
    [randomUUID(), randomBytes(16), KEY_ID, made(w, "customer").customer_id, made(w, "charge").charge_id]));
  } },
  { relation: "billing.card_token_revocation", run: async (insert, _q, w) => {
    w.made.set("card_token_revocation", await insert("billing.card_token_revocation", `INSERT INTO billing.card_token_revocation
      (token_id,at,reason) VALUES($1,now(),'OWNER')`, [made(w, "card_token").token_id]));
  } },
  { relation: "billing.invoice_intent", run: async (insert, _q, w) => {
    w.made.set("invoice_intent", await insert("billing.invoice_intent", `INSERT INTO billing.invoice_intent(charge_id,kind,issuer,
        requested_at) VALUES($1,'INVOICE','SMARTBILL',now())`, [made(w, "charge").charge_id]));
  } },
  { relation: "billing.invoice", run: async (insert, _q, w) => {
    w.made.set("invoice", await insert("billing.invoice", `INSERT INTO billing.invoice(invoice_id,charge_id,kind,issuer,external_ref,
        number,total_micros,at) VALUES($1,$2,'INVOICE','SMARTBILL',$3,$4,10000,now())`,
    [randomUUID(), made(w, "invoice_intent").charge_id, `rls-${hex(8)}`, `RLS-${hex(4)}`]));
  } },
  { relation: "billing.invoice_status_event", run: async (insert, _q, w) => {
    w.made.set("invoice_status_event", await insert("billing.invoice_status_event", `INSERT INTO billing.invoice_status_event
      (invoice_id,at,efactura_status) VALUES($1,now(),'SENT')`, [made(w, "invoice").invoice_id]));
  } },
  { relation: "billing.location_evidence", run: async (insert, _q, w) => {
    w.made.set("location_evidence", await insert("billing.location_evidence", `INSERT INTO billing.location_evidence(charge_id,
        ip_country,declared_country,verdict,ip_ciphertext,key_id,at) VALUES($1,'RO','RO','AGREED',$2,$3,now())`,
    [made(w, "charge").charge_id, randomBytes(16), KEY_ID]));
  } },
  { relation: "billing.quote_use", run: async (insert, _q, w) => {
    w.made.set("quote_use", await insert("billing.quote_use", `INSERT INTO billing.quote_use(quote_id,used_at,charge_id)
      VALUES($1,now(),$2)`, [made(w, "quote").quote_id, made(w, "charge").charge_id]));
  } },
  { relation: "billing.status_read", run: async (insert, _q, w) => {
    w.made.set("status_read", await insert("billing.status_read", `INSERT INTO billing.status_read(charge_id,at,outcome)
      VALUES($1,now(),'PAID')`, [made(w, "charge").charge_id]));
  } },
  { relation: "billing.payment_notice", run: async (insert, _q, w) => {
    w.made.set("payment_notice", await insert("billing.payment_notice", `INSERT INTO billing.payment_notice(notice_id,payment_provider,
        payment_environment,received_at,body_sha256,key_fingerprint,allowed_ciphertext,key_id,order_id)
      VALUES($1,'netopia','sandbox',now(),$2,$3,$4,$5,$6)`,
    [randomUUID(), hex(32), hex(32), randomBytes(16), KEY_ID, made(w, "charge").charge_id]));
  } },
  { relation: "billing.payment_notice_outcome", run: async (insert, _q, w) => {
    w.made.set("payment_notice_outcome", await insert("billing.payment_notice_outcome", `INSERT INTO billing.payment_notice_outcome
      (notice_id,at,outcome) VALUES($1,now(),'APPLIED')`, [made(w, "payment_notice").notice_id]));
  } },
  { relation: "billing.payment_notice_raw", run: async (insert, _q, w) => {
    w.made.set("payment_notice_raw", await insert("billing.payment_notice_raw", `INSERT INTO billing.payment_notice_raw
      (notice_id,raw_ciphertext,key_id,stored_at) VALUES($1,$2,$3,now())`, [made(w, "payment_notice").notice_id, randomBytes(16), KEY_ID]));
  } },
  { relation: "billing.notice_quarantine", run: async (insert, _q, w) => {
    w.made.set("notice_quarantine", await insert("billing.notice_quarantine", `INSERT INTO billing.notice_quarantine(quarantine_id,
        received_at,reason,raw_ciphertext,key_id,order_id) VALUES($1,now(),'NOTICE_HEADER_MISSING',$2,$3,$4)`,
    [randomUUID(), randomBytes(16), KEY_ID, made(w, "charge").charge_id]));
  } },
  { relation: "billing.entitlement_event", run: async (insert, _q, w) => {
    w.made.set("entitlement_event", await insert("billing.entitlement_event", `INSERT INTO billing.entitlement_event(event_id,owner_ref,
        plan_id,effective_at,period_anchor_at,cause) VALUES($1,$2,'FREE',now(),now(),'SIGNED_UP_FREE')`,
    [randomUUID(), w.account.ownerRef]));
  } },
  { relation: "billing.run_charge_scope", run: async (insert, _q, w) => {
    w.made.set("run_charge_scope", await insert("billing.run_charge_scope", `INSERT INTO billing.run_charge_scope(run_id,owner_ref,
        admitted_at,funding_kind,plan_id,entitlement_event_id) VALUES($1,$2,now(),'SUBSCRIPTION','FREE',$3)`,
    [w.runs.main, w.account.ownerRef, made(w, "entitlement_event").event_id]));
  } },
  { relation: "billing.outbox", run: async (insert, _q, w) => {
    w.made.set("outbox", await insert("billing.outbox", `INSERT INTO billing.outbox(job_id,kind,ref,payload,created_at,not_before)
      VALUES($1,'VERIFY_PAYMENT',$2,$3::jsonb,now(),now())`,
    [randomUUID(), `rls-seed:owner:${w.account.ownerRef}`, JSON.stringify({ owner_ref: w.account.ownerRef })]));
  } },
  { relation: "billing.xmoney_notice", run: async (insert, _q, w) => {
    w.made.set("xmoney_notice", await insert("billing.xmoney_notice", `INSERT INTO billing.xmoney_notice(notice_id,received_at,
        payload_sha256,transaction_id,order_id,status,xmoney_environment,external_order_id)
      VALUES($1,now(),$2,$3,$4,'complete-ok','stage',$5)`, [randomUUID(), hex(32), digits(), digits(), w.account.ownerRef.replaceAll("-", "")]));
  } },
  { relation: "billing.xmoney_notice_outcome", run: async (insert, _q, w) => {
    w.made.set("xmoney_notice_outcome", await insert("billing.xmoney_notice_outcome", `INSERT INTO billing.xmoney_notice_outcome
      (notice_id,at,outcome) VALUES($1,now(),'APPLIED')`, [made(w, "xmoney_notice").notice_id]));
  } },
  // legal
  { relation: "legal.acceptance", run: async (insert, _q, w) => {
    w.made.set("acceptance", await insert("legal.acceptance", `INSERT INTO legal.acceptance(acceptance_id,owner_ref,kind,
        document_version,document_sha256,locale,surface,accepted_at,evidence_ciphertext,key_id)
      VALUES($1,$2,'TERMS','1.0',$3,'en','SIGN_UP',now(),$4,$5)`, [randomUUID(), w.account.ownerRef, hex(32), randomBytes(32), KEY_ID]));
  } },
  // core — the waiting line and the supersession edges of the account's runs
  { relation: "core.work_item", run: async (insert, _q, w) => {
    w.made.set("work_item", await insert("core.work_item", `INSERT INTO core.work_item(run_id,battery_row_id,node_set,command_key,
        state,created_at_seq) VALUES($1,'Q61','[]',$2,'DONE',ledger.allocate_sequence())`, [w.runs.main, `rls-seed:${randomUUID()}`]));
  } },
  { relation: "core.run_wait", run: async (insert, _q, w) => {
    for (const name of ["sOld", "sNew", "mOld", "main"] as const) {
      w.made.set(`run_wait:${name}`, await insert("core.run_wait", "INSERT INTO core.run_wait(run_id,waiting_since) VALUES($1,now())",
        [w.runs[name]]));
    }
  } },
  { relation: "core.run_wait_reason", run: async (insert, _q, w) => {
    w.made.set("run_wait_reason", await insert("core.run_wait_reason", `INSERT INTO core.run_wait_reason(reason_id,run_id,
        evaluated_at,waits_for) VALUES($1,$2,now(),'SITE')`, [randomUUID(), made(w, "run_wait:main").run_id]));
  } },
  { relation: "core.run_supersession", run: async (insert, _q, w) => {
    w.made.set("run_supersession", await insert("core.run_supersession", `INSERT INTO core.run_supersession(old_run_id,new_run_id,
        reason) VALUES($1,$2,'READMITTED')`, [made(w, "run_wait:sOld").run_id, w.runs.sNew]));
  } },
  { relation: "core.run_wait_start", run: async (insert, _q, w) => {
    w.made.set("run_wait_start", await insert("core.run_wait_start", `INSERT INTO core.run_wait_start(run_id,started_at)
      VALUES($1,now())`, [made(w, "run_wait:sNew").run_id]));
  } },
  // ledger.raw_artifact first: core.node names its author artifact, ledger.node_review both
  { relation: "ledger.raw_artifact", run: async (insert, _q, w) => {
    for (const role of ["author", "reviewer"] as const) {
      w.made.set(`raw_artifact:${role}`, await insert("ledger.raw_artifact", `INSERT INTO ledger.raw_artifact(raw_artifact_id,
          attempt_id,provider_ref,provider,model_id,maker,raw_text,metadata_json,parse_status,content_hash,at_seq,input_hash,
          contract_hash,run_id)
        VALUES($1,$2,'provider-rls','provider-rls','model-rls',$3,'rls seed','{}','PARSED',$4,ledger.allocate_sequence(),$5,$6,$7)`,
      [randomUUID(), randomUUID(), `maker-${role}`, hex(32), hex(32), hex(32), w.runs.main]));
    }
  } },
  { relation: "core.node", run: async (insert, _q, w) => {
    for (const [name, status] of [["stale", "stale"], ["live", "complete"]] as const) {
      w.made.set(`node:${name}`, await insert("core.node", `INSERT INTO core.node(run_id,claim_text,way_of_knowing,value_laden,
          created_at_seq,depth,sibling_ordinal,materialized_path,generation_status,path_status,exploration_decision,claim_type,
          provenance_ref)
        VALUES($1,'rls seed claim','REASONING',false,ledger.allocate_sequence(),0,0,'0',$2,'active','continue','empirical',$3)`,
      [w.runs.main, status, made(w, "raw_artifact:author").raw_artifact_id]));
    }
  } },
  { relation: "core.edge", run: async (insert, _q, w) => {
    w.made.set("edge", await insert("core.edge", `INSERT INTO core.edge(run_id,source_node_id,target_kind,target_node_id,polarity,
        magnitude_status,strength_source,provenance_ref,created_at_seq)
      VALUES($1,$2,'NODE',$3,'support','UNKNOWN','REVIEWER','rls-seed',ledger.allocate_sequence())`,
    [w.runs.main, made(w, "node:live").node_id, made(w, "node:stale").node_id]));
  } },
  { relation: "core.map_position", run: async (insert, _q, w) => {
    w.made.set("map_position", await insert("core.map_position", `INSERT INTO core.map_position(run_id,answer_id,root_index,
        root_node_id,maker) VALUES($1,'a1',0,$2,'maker-rls')`, [w.runs.main, made(w, "node:stale").node_id]));
  } },
  { relation: "core.map_position_repoint", run: async (insert, _q, w) => {
    w.made.set("map_position_repoint", await insert("core.map_position_repoint", `INSERT INTO core.map_position_repoint(run_id,
        answer_id,from_root_node_id,root_node_id,maker) VALUES($1,'a1',$2,$3,'maker-rls')`,
    [made(w, "map_position").run_id, made(w, "node:stale").node_id, made(w, "node:live").node_id]));
  } },
  { relation: "core.map_answer_check", run: async (insert, _q, w) => {
    w.made.set("map_answer_check", await insert("core.map_answer_check", `INSERT INTO core.map_answer_check(run_id,answer_check)
      VALUES($1,$2::text[])`, [w.runs.main, ["a1:PASSED"]]));
  } },
  { relation: "core.map_choice", run: async (insert, _q, w) => {
    w.made.set("map_choice", await insert("core.map_choice", `INSERT INTO core.map_choice(run_id,opening,marks,content)
      VALUES($1,'MAP','[]','{}')`, [w.runs.main]));
  } },
  { relation: "core.map_item", run: async (insert, _q, w) => {
    w.made.set("map_item", await insert("core.map_item", `INSERT INTO core.map_item(run_id,item_id,step,ai_ref,maker,origin,kind,
        position,content) VALUES($1,'pt01','LIST','ai-rls','maker-rls','BLIND','POINT',0,'{}')`, [w.runs.main]));
  } },
  { relation: "core.map_item_rests_on", run: async (insert, _q, w) => {
    w.made.set("map_item_rests_on", await insert("core.map_item_rests_on", `INSERT INTO core.map_item_rests_on(run_id,item_id,
        rests_on) VALUES($1,'pt01','question')`, [w.runs.main]));
  } },
  { relation: "core.critique_packet", run: async (insert, _q, w) => {
    w.made.set("critique_packet", await insert("core.critique_packet", `INSERT INTO core.critique_packet(run_id,source_artifact_ref,
        packet_fingerprint,critic_maker,blinding_applied,research_context_hash,critique_context_hash,at_seq)
      VALUES($1,'artifact:rls',$2,'maker-critic','IDENTITY_STRIPPED','research:rls','critique:rls',ledger.allocate_sequence())`,
    [w.runs.main, hex(32)]));
  } },
  { relation: "core.independence_receipt", run: async (insert, _q, w) => {
    w.made.set("independence_receipt", await insert("core.independence_receipt", `INSERT INTO core.independence_receipt(run_id,
        producer_maker,status,absence_reason,different_maker,context_isolated,blinded_before_critic,at_seq)
      VALUES($1,'maker-rls','UNKNOWN','NO_CRITIC',false,false,false,ledger.allocate_sequence())`, [w.runs.main]));
  } },
  { relation: "core.objection_record", run: async (insert, _q, w) => {
    w.made.set("objection_record", await insert("core.objection_record", `INSERT INTO core.objection_record(run_id,objection_ref,
        status,at_seq) VALUES($1,'objection:rls','OPEN',ledger.allocate_sequence())`, [w.runs.main]));
  } },
  { relation: "core.question_liveness_event", run: async (insert, _q, w) => {
    w.made.set("question_liveness_event", await insert("core.question_liveness_event", `INSERT INTO core.question_liveness_event
      (run_id,kind,occurred_at,at_seq) VALUES($1,'QUERY',now(),ledger.allocate_sequence())`, [w.runs.main]));
  } },
  { relation: "core.value_hinge", run: async (insert, _q, w) => {
    w.made.set("value_hinge", await insert("core.value_hinge", `INSERT INTO core.value_hinge(run_id,left_option_id,right_option_id,
        criterion_ids,reversal_boundary,weight_source,at_seq) VALUES($1,'o1','o2','[]','{}','none',ledger.allocate_sequence())`,
    [w.runs.main]));
  } },
  { relation: "core.reversal_point", run: async (insert, _q, w) => {
    w.made.set("reversal_point", await insert("core.reversal_point", `INSERT INTO core.reversal_point(run_id,value_hinge_id,
        left_option_id,right_option_id,boundary,rejected_criteria,at_seq) VALUES($1,$2,'o1','o2','{}','[]',ledger.allocate_sequence())`,
    [w.runs.main, made(w, "value_hinge").value_hinge_id]));
  } },
  { relation: "core.review_clock", run: async (insert, _q, w) => {
    w.made.set("review_clock", await insert("core.review_clock", `INSERT INTO core.review_clock(run_id,subject_kind,subject_ref,
        question_class,due_at,register_row_key,register_version,register_source_ref,at_seq)
      VALUES($1,'ANSWER','answer:rls','general',now()+interval '1 day','livenessPolicy',$2,'register:rls',ledger.allocate_sequence())`,
    [w.runs.main, 1]));
  } },
  { relation: "core.revision_trigger", run: async (insert, _q, w) => {
    w.made.set("revision_trigger", await insert("core.revision_trigger", `INSERT INTO core.revision_trigger(run_id,trigger_key,
        trigger_kind,subject_kind,subject_ref,state,reason,at_seq)
      VALUES($1,'trigger:rls','WATCHED_CONDITION','ANSWER','answer:rls','WATCHING','rls seed',ledger.allocate_sequence())`,
    [w.runs.main]));
  } },
  { relation: "core.run_cost_substitution", run: async (insert, _q, w) => {
    w.made.set("run_cost_substitution", await insert("core.run_cost_substitution", `INSERT INTO core.run_cost_substitution
      (substitution_id,run_id,call_site_key,planned_provider_ref,used_provider_ref,reason)
      VALUES($1,$2,'site:rls','provider:planned','provider:used','RUN_ARGUING')`, [randomUUID(), w.runs.main]));
  } },
  { relation: "core.run_row_activation", run: async (insert, _q, w) => {
    w.made.set("run_row_activation", await insert("core.run_row_activation", `INSERT INTO core.run_row_activation(run_id,
        battery_row_id,predicate_ref) VALUES($1,'Q1','predicate:rls')`, [w.runs.main]));
  } },
  { relation: "core.run_row_activation_event", run: async (insert, _q, w) => {
    const activation = made(w, "run_row_activation");
    w.made.set("run_row_activation_event", await insert("core.run_row_activation_event", `INSERT INTO core.run_row_activation_event
      (run_id,battery_row_id,at_seq,state,predicate_inputs) VALUES($1,$2,ledger.allocate_sequence(),'ACTIVE','{}')`,
    [activation.run_id, activation.battery_row_id]));
  } },
  { relation: "core.run_progress_event", run: async (insert, _q, w) => {
    w.made.set("run_progress_event", await insert("core.run_progress_event", `INSERT INTO core.run_progress_event(run_id,at_seq,
        kind,value_json) VALUES($1,ledger.allocate_sequence(),'PHASE','{}')`, [w.runs.main]));
  } },
  { relation: "core.run_role_assignment", run: async (insert, _q, w) => {
    w.made.set("run_role_assignment", await insert("core.run_role_assignment", `INSERT INTO core.run_role_assignment(run_id,
        assignment,strength,stepped_down) VALUES($1,'{"strength":"BALANCED"}','BALANCED',false)`, [w.runs.main]));
  } },
  { relation: "core.run_role_rotation", run: async (insert, _q, w) => {
    w.made.set("run_role_rotation", await insert("core.run_role_rotation", `INSERT INTO core.run_role_rotation(run_id,rule,
        writer_provider_ref,writer_model_id,writer_maker,checker_provider_ref,checker_model_id,checker_maker,
        storyteller_provider_ref,storyteller_model_id,storyteller_maker,story_checker_provider_ref,story_checker_model_id,
        story_checker_maker,eligible_model_ids)
      VALUES($1,'LEAST_SHARE_SEEDED_TIE_V1','provider-w','model-w','maker-w','provider-c','model-c','maker-c',
        'provider-s','model-s','maker-s','provider-k','model-k','maker-k',$2::text[])`,
    [w.runs.main, ["model-w", "model-c", "model-s", "model-k"]]));
  } },
  { relation: "core.staleness_state", run: async (insert, _q, w) => {
    w.made.set("staleness_state", await insert("core.staleness_state", `INSERT INTO core.staleness_state(run_id,subject_kind,
        subject_ref,state,reason,at_seq) VALUES($1,'ANSWER','answer:rls','FRESH','rls seed',ledger.allocate_sequence())`, [w.runs.main]));
  } },
  { relation: "core.stranger_restatement", run: async (insert, _q, w) => {
    w.made.set("stranger_restatement", await insert("core.stranger_restatement", `INSERT INTO core.stranger_restatement(run_id,
        subject_kind,subject_id,restatement_text,check_status,at_seq)
      VALUES($1,'node',$2,'rls seed restatement','NOT_SAMPLED',ledger.allocate_sequence())`, [w.runs.main, made(w, "node:live").node_id]));
  } },
  { relation: "core.symmetry_diff", run: async (insert, _q, w) => {
    w.made.set("symmetry_diff", await insert("core.symmetry_diff", `INSERT INTO core.symmetry_diff(run_id,status,missing_kinds,
        remediation_targets,blocked_not_lazy,census,fairness_claim_withheld,band_cap_required,at_seq)
      VALUES($1,'SYMMETRIC','[]','[]','[]','[]',false,false,ledger.allocate_sequence())`, [w.runs.main]));
  } },
  { relation: "core.verification_trigger_basis", run: async (insert, _q, w) => {
    w.made.set("verification_trigger_basis", await insert("core.verification_trigger_basis", `INSERT INTO
      core.verification_trigger_basis(run_id,node_id,leverage_snapshot,snapshot_at_seq,triggered,engine_version,recorded_at_seq)
      VALUES($1,$2,'[]',1,false,'engine:rls',ledger.allocate_sequence())`, [w.runs.main, made(w, "node:live").node_id]));
  } },
  // ledger — rows keyed by the run, its nodes and its artifacts
  { relation: "ledger.call_prompt", run: async (insert, _q, w) => {
    w.made.set("call_prompt", await insert("ledger.call_prompt", `INSERT INTO ledger.call_prompt(attempt_id,run_id,prompt_text,
        prompt_fingerprint) VALUES($1,$2,'rls seed prompt',$3)`, [randomUUID(), w.runs.main, hex(32)]));
  } },
  { relation: "ledger.ledger_entry", run: async (insert, _q, w) => {
    w.made.set("ledger_entry", await insert("ledger.ledger_entry", `INSERT INTO ledger.ledger_entry(sequence,action_kind,
        subject_item_id,stance_at_action,outcome,actor_ref,input_hash,contract_hash,started_at,finished_at,run_id)
      VALUES(ledger.allocate_sequence(),'SERVE','item:rls','NEUTRAL','OK','actor:rls',$1,$2,now(),now(),$3)`,
    [hex(32), hex(32), w.runs.main]));
  } },
  { relation: "ledger.decision_record", run: async (insert, _q, w) => {
    w.made.set("decision_record", await insert("ledger.decision_record", `INSERT INTO ledger.decision_record(run_id,parent_node_id,
        idempotency_key,signals_json,path_state_json,firing_reasons,blockers,action,classification,spawn_count,
        replay_identity_hash,at_seq)
      VALUES($1,$2,$3,'[]','{}','[]','[]','continue','scalar',0,$4,ledger.allocate_sequence())`,
    [w.runs.main, made(w, "node:live").node_id, `rls-seed:${randomUUID()}`, hex(32)]));
  } },
  { relation: "ledger.model_spend", run: async (insert, _q, w) => {
    w.made.set("model_spend", await insert("ledger.model_spend", `INSERT INTO ledger.model_spend(spend_id,spend_source,provider_ref,
        charged_on,charge_micros,input_tokens,output_tokens,run_id) VALUES($1,'RUN','provider-rls',current_date,0,0,0,$2)`,
    [randomUUID(), w.runs.main]));
  } },
  { relation: "ledger.model_spend_hold", run: async (insert, _q, w) => {
    w.made.set("model_spend_hold", await insert("ledger.model_spend_hold", `INSERT INTO ledger.model_spend_hold(hold_id,run_id,
        held_micros) VALUES($1,$2,1)`, [randomUUID(), w.runs.main]));
  } },
  { relation: "ledger.model_spend_waiver", run: async (insert, _q, w) => {
    w.made.set("model_spend_waiver", await insert("ledger.model_spend_waiver", `INSERT INTO ledger.model_spend_waiver(run_id,reason)
      VALUES($1,'BACKSTOP')`, [w.runs.main]));
  } },
  { relation: "ledger.node_review", run: async (insert, _q, w) => {
    w.made.set("node_review", await insert("ledger.node_review", `INSERT INTO ledger.node_review(node_review_id,run_id,node_id,
        author_raw_artifact_ref,review_raw_artifact_ref,outcome,reasons,at_seq)
      VALUES($1,$2,$3,$4,$5,'cannot-assess','["rls seed"]',ledger.allocate_sequence())`,
    [randomUUID(), w.runs.main, made(w, "node:live").node_id, made(w, "raw_artifact:author").raw_artifact_id,
      made(w, "raw_artifact:reviewer").raw_artifact_id]));
  } },
  { relation: "ledger.propagation_run", run: async (insert, _q, w) => {
    w.made.set("propagation_run", await insert("ledger.propagation_run", `INSERT INTO ledger.propagation_run(run_id,input_hash,
        contract_hash,graph_fingerprint,arrow_order,cluster_records,operator_by_parent,at_seq,transmission_reductions,lift_records,
        judgement_selection_rule) VALUES($1,$2,$3,$4,'[]','[]','{}',ledger.allocate_sequence(),'[]','[]','{}')`,
    [w.runs.main, hex(32), hex(32), hex(32)]));
  } },
  { relation: "ledger.reduced_judgement", run: async (insert, _q, w) => {
    w.made.set("reduced_judgement", await insert("ledger.reduced_judgement", `INSERT INTO ledger.reduced_judgement(run_id,node_id,
        raw_artifact_ref,tau,number_kind,source_ref,producer,replay_handle,way_of_knowing,at_seq)
      VALUES($1,$2,$3,0.5,'kind:rls','source:rls','producer:rls','replay:rls','REASONING',ledger.allocate_sequence())`,
    [w.runs.main, made(w, "node:live").node_id, made(w, "raw_artifact:author").raw_artifact_id]));
  } },
  { relation: "ledger.node_strength_record", run: async (insert, _q, w) => {
    w.made.set("node_strength_record", await insert("ledger.node_strength_record", `INSERT INTO ledger.node_strength_record(
        propagation_run_id,node_id,strength,number_kind,source_ref,producer,replay_handle,way_of_knowing)
      VALUES($1,$2,0.5,'kind:rls','source:rls','producer:rls','replay:rls','REASONING')`,
    [made(w, "propagation_run").propagation_run_id, made(w, "node:live").node_id]));
  } },
  { relation: "ledger.sensitivity_record", run: async (insert, _q, w) => {
    w.made.set("sensitivity_record", await insert("ledger.sensitivity_record", `INSERT INTO ledger.sensitivity_record(
        propagation_run_id,removed_node_id,leverage,fragility,at_seq) VALUES($1,$2,0.5,'[]',ledger.allocate_sequence())`,
    [made(w, "propagation_run").propagation_run_id, made(w, "node:live").node_id]));
  } },
  { relation: "ledger.overlay_run", run: async (insert, _q, w) => {
    w.made.set("overlay_run", await insert("ledger.overlay_run", `INSERT INTO ledger.overlay_run(run_id,propagation_run_id,
        weight_source,accepted_criteria,rejected_criteria,pareto_option_ids,recorded_arrow_order,recorded_strengths,
        detached_strengths,detachment_byte_identical,at_seq)
      VALUES($1,$2,'none','[]','[]','[]','[]','[]','[]',true,ledger.allocate_sequence())`,
    [w.runs.main, made(w, "propagation_run").propagation_run_id]));
  } },
  { relation: "ledger.point_investigation", run: async (insert, _q, w) => {
    w.made.set("point_investigation", await insert("ledger.point_investigation", `INSERT INTO ledger.point_investigation(run_id,
        node_id,investigation_order,result,content) VALUES($1,$2,1,'INVESTIGATION_SKIPPED','{}')`,
    [w.runs.main, made(w, "node:live").node_id]));
  } },
  { relation: "ledger.verdict_vote", run: async (insert, _q, w) => {
    w.made.set("verdict_vote", await insert("ledger.verdict_vote", `INSERT INTO ledger.verdict_vote(run_id,judge_seat,maker,
        provider_ref,model_id,counted,not_counted_reason,same_as,content)
      VALUES($1,1,'maker-judge','provider-judge','model-judge',false,'JUDGE_FAILED','[]','{}')`, [w.runs.main]));
  } },
  // serve — the answer and the rows keyed by it
  { relation: "serve.fact_bundle", run: async (insert, _q, w) => {
    w.made.set("fact_bundle", await insert("serve.fact_bundle", `INSERT INTO serve.fact_bundle(run_id,facts,residual_objections,
        content_hash,version) VALUES($1,'[]','[]',$2,1)`, [w.runs.main, hex(32)]));
  } },
  { relation: "serve.composed_text", run: async (insert, _q, w) => {
    w.made.set("composed_text", await insert("serve.composed_text", `INSERT INTO serve.composed_text(fact_bundle_id,segments,
        raw_artifact_ref,attempt) VALUES($1,'[]',$2,1)`,
    [made(w, "fact_bundle").fact_bundle_id, made(w, "raw_artifact:author").raw_artifact_id]));
  } },
  { relation: "serve.conformance_record", run: async (insert, _q, w) => {
    w.made.set("conformance_record", await insert("serve.conformance_record", `INSERT INTO serve.conformance_record(composed_text_id,
        segment_results,coverage_mode,raw_artifact_refs,sealed_at_seq) VALUES($1,'[]','EXHAUSTIVE','[]',ledger.allocate_sequence())`,
    [made(w, "composed_text").composed_text_id]));
  } },
  { relation: "serve.answer", run: async (insert, _q, w) => {
    w.made.set("answer", await insert("serve.answer", `INSERT INTO serve.answer(answer_version,run_id,work_item_id,terminal,
        serve_state,verdict_state,answer_form,condition_marks,fact_bundle_id,sealed_at_seq)
      VALUES(1,$1,$2,'SERVED','COMPOSED','SUPPORTED','{}','[]',$3,ledger.allocate_sequence())`,
    [w.runs.main, made(w, "work_item").work_item_id, made(w, "fact_bundle").fact_bundle_id]));
  } },
  { relation: "serve.abstention", run: async (insert, _q, w) => {
    const answer = made(w, "answer");
    w.made.set("abstention", await insert("serve.abstention", `INSERT INTO serve.abstention(answer_id,answer_version,kind,
        question_class,risk_tier,price,register_row_key,register_version,register_source_ref,unlock_condition,ledger_unknown_ref,at_seq)
      VALUES($1,$2,'ABSTAIN','general','casual',0.5,'abstentionPolicy',$3,'register:rls','unlock:rls','unknown:rls',
        ledger.allocate_sequence())`, [answer.answer_id, answer.answer_version, 1]));
  } },
  { relation: "serve.answer_story", run: async (insert, _q, w) => {
    const answer = made(w, "answer");
    w.made.set("answer_story", await insert("serve.answer_story", `INSERT INTO serve.answer_story(story_id,run_id,answer_id,
        answer_version,outcome,failure_code,rounds,artifact_refs,content) VALUES($1,$2,$3,$4,'FAILED','RLS_SEED',0,'[]','{}')`,
    [randomUUID(), w.runs.main, answer.answer_id, answer.answer_version]));
  } },
  { relation: "serve.condition_mark", run: async (insert, _q, w) => {
    const answer = made(w, "answer");
    w.made.set("condition_mark", await insert("serve.condition_mark", `INSERT INTO serve.condition_mark(answer_id,answer_version,
        mark,scope,subject_ref,reason,at_seq) VALUES($1,$2,'UNASSESSED-AT-REDUCED-WEIGHT','answer','answer:rls','rls seed',
        ledger.allocate_sequence())`, [answer.answer_id, answer.answer_version]));
  } },
  { relation: "serve.condition_mark_node", run: async (insert, _q, w) => {
    w.made.set("condition_mark_node", await insert("serve.condition_mark_node", `INSERT INTO serve.condition_mark_node(
        condition_mark_id,node_id) VALUES($1,$2)`, [made(w, "condition_mark").condition_mark_id, made(w, "node:live").node_id]));
  } },
  { relation: "serve.segment_suppression", run: async (insert, _q, w) => {
    const answer = made(w, "answer");
    w.made.set("segment_suppression", await insert("serve.segment_suppression", `INSERT INTO serve.segment_suppression(answer_id,
        answer_version,segment_id,evicted_number_ref,at_seq) VALUES($1,$2,'s1','number:rls',ledger.allocate_sequence())`,
    [answer.answer_id, answer.answer_version]));
  } },
  { relation: "serve.serve_disclosure", run: async (insert, _q, w) => {
    const answer = made(w, "answer");
    w.made.set("serve_disclosure", await insert("serve.serve_disclosure", `INSERT INTO serve.serve_disclosure(answer_id,
        answer_version,run_id,writer_planned_ref,checker_planned_ref,writer_fallback,checker_fallback,checker_same_as_writer)
      VALUES($1,$2,$3,'writer:rls','checker:rls',false,false,false)`, [answer.answer_id, answer.answer_version, answer.run_id]));
  } },
  { relation: "serve.served_number", run: async (insert, _q, w) => {
    w.made.set("served_number", await insert("serve.served_number", `INSERT INTO serve.served_number(run_id,value,number_kind,
        source_ref,producer,replay_handle,provenance_ref) VALUES($1,0.5,'kind:rls','source:rls','producer:rls','replay:rls',$2)`,
    [w.runs.main, made(w, "propagation_run").propagation_run_id]));
  } },
  { relation: "serve.served_number_event", run: async (insert, _q, w) => {
    w.made.set("served_number_event", await insert("serve.served_number_event", `INSERT INTO serve.served_number_event(
        served_number_id,status,at_seq) VALUES($1,'PRESENT',ledger.allocate_sequence())`, [made(w, "served_number").served_number_id]));
  } },
  { relation: "serve.shadow_suppression", run: async (insert, _q, w) => {
    const answer = made(w, "answer");
    w.made.set("shadow_suppression", await insert("serve.shadow_suppression", `INSERT INTO serve.shadow_suppression(answer_id,
        answer_version,gate,subject_ref,would_have_suppressed,unlock_condition,at_seq)
      VALUES($1,$2,'EVIDENCE_GATE','answer:rls','{}','unlock:rls',ledger.allocate_sequence())`, [answer.answer_id, answer.answer_version]));
  } },
  { relation: "serve.synthesis_round", run: async (insert, _q, w) => {
    const answer = made(w, "answer");
    w.made.set("synthesis_round", await insert("serve.synthesis_round", `INSERT INTO serve.synthesis_round(answer_id,answer_version,
        run_id,round,synthesizer_stage,candidate_artifact_ref,candidate_call_site_key,evaluator_artifact_ref,evaluator_call_site_key,
        evaluator_satisfied,sealed_at_seq) VALUES($1,$2,$3,1,'INITIAL',$4,'site:candidate',$5,'site:evaluator',true,
        ledger.allocate_sequence())`, [answer.answer_id, answer.answer_version, w.runs.main,
      made(w, "raw_artifact:author").raw_artifact_id, made(w, "raw_artifact:reviewer").raw_artifact_id]));
  } },
  { relation: "serve.publication_snapshot", run: async (insert, _q, w) => {
    const ref = randomUUID();
    w.made.set("publication_snapshot", await insert("serve.publication_snapshot", `INSERT INTO serve.publication_snapshot(
        publication_ref,run_id,format_version,content_ciphertext,created_at) VALUES($1,$2,1,$3::jsonb,now())`,
    [ref, w.runs.enc, JSON.stringify({ v: 1, keyId: `publication-snapshot:${ref}:v1`, nonce: "bm9uY2U", ct: "Y3Q", tag: "dGFn" })]));
  } },
  { relation: "core.run_visibility_event", run: async (insert, q, w) => {
    const eventId = randomUUID(), actor = randomUUID();
    await q.query(`INSERT INTO identity.publication_event_binding(reservation_id,user_id,session_id,run_id,action,grant_id,
        grant_token_hash,visibility_event_id,visibility_actor_ref,audit_id,audit_actor_ref,audit_target_ref,denied_audit_id,
        denied_audit_actor_ref,denied_audit_target_ref,created_at,expires_at)
      VALUES($1,$2,$3,$4,'PUBLISH',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now()+interval '1 hour')`,
    [randomUUID(), w.account.userId, w.sessionId, w.runs.enc, randomUUID(), `sha256:${hex(32)}`, eventId, actor, randomUUID(),
      randomUUID(), w.runs.enc, randomUUID(), randomUUID(), randomUUID()]);
    w.made.set("run_visibility_event", await insert("core.run_visibility_event", `INSERT INTO core.run_visibility_event(
        run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq)
      VALUES($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',now(),ledger.allocate_sequence())`,
    [eventId, w.runs.enc, made(w, "publication_snapshot").publication_ref, actor]));
  } },
  // memory — the run's question key, then the rows linking two runs of the same account
  { relation: "memory.question_key", run: async (insert, _q, w) => {
    w.made.set("question_key", await insert("memory.question_key", `INSERT INTO memory.question_key(run_id,canonical_question_text,
        caller_scope,asker_scope,normalized_binding,frozen_terms,as_of,policy_version,key_version,at_seq)
      VALUES($1,'rls seed question','ASKER','asker:rls-seed','{}','[]',now(),1,1,ledger.allocate_sequence())`, [w.runs.main]));
  } },
  { relation: "memory.alias_row", run: async (insert, _q, w) => {
    w.made.set("alias_row", await insert("memory.alias_row", ALIAS_ROW_INSERT, [w.runs.sOld, w.runs.main]));
  } },
  { relation: "memory.alias_revocation", run: async (insert, _q, w) => {
    w.made.set("alias_revocation", await insert("memory.alias_revocation", `INSERT INTO memory.alias_revocation(alias_row_id,
        revoked_by,reason,at_seq) VALUES($1,'operator:rls','rls seed',ledger.allocate_sequence())`, [made(w, "alias_row").alias_row_id]));
  } },
  { relation: "memory.candidate_record", run: async (insert, _q, w) => {
    w.made.set("candidate_record", await insert("memory.candidate_record", CANDIDATE_RECORD_INSERT, [w.runs.main, w.runs.sOld]));
  } },
  { relation: "memory.memory_link", run: async (insert, _q, w) => {
    w.made.set("memory_link", await insert("memory.memory_link", MEMORY_LINK_INSERT, [w.runs.main, w.runs.sOld, randomUUID()]));
  } },
  { relation: "memory.memory_link_event", run: async (insert, _q, w) => {
    w.made.set("memory_link_event", await insert("memory.memory_link_event", `INSERT INTO memory.memory_link_event(memory_link_id,
        state,actor_ref,reason,at_seq) VALUES($1,'LINKED','actor:rls','rls seed',ledger.allocate_sequence())`,
    [made(w, "memory_link").memory_link_id]));
  } },
  { relation: "memory.pull_record", run: async (insert, _q, w) => {
    w.made.set("pull_record", await insert("memory.pull_record", `INSERT INTO memory.pull_record(memory_link_id,artifact_kind,
        artifact_id,artifact_version,content_hash,artifact_as_of,staleness_state_at_pull,asker_scope,payload_snapshot,
        register_row_key,register_version,register_source_ref,at_seq)
      VALUES($1,'PRIOR_ANSWER','answer:rls',1,$2,now(),'FRESH','asker:rls-seed','{}','memoryPolicy',$3,'register:rls',
        ledger.allocate_sequence())`, [made(w, "memory_link").memory_link_id, hex(32), 1]));
  } },
  // scorecard — the answer's outcome and the routing of the run's execution
  { relation: "scorecard.answer_outcome", run: async (insert, _q, w) => {
    const answer = made(w, "answer");
    w.made.set("answer_outcome", await insert("scorecard.answer_outcome", `INSERT INTO scorecard.answer_outcome(outcome_attempt_id,
        answer_id,answer_version,as_of,run_id,model_id,model_version,provider,task_class,prior,posterior,basis,resolver_ref,
        resolver_is_external,resolved_outcome,resolved_at,provenance_ref,scoreability,accepted,at_seq)
      VALUES($1,$2,$3,now(),$4,'model-rls','v1','provider-rls','general',0.5,0.5,'basis:rls','resolver:rls',true,true,now(),
        'provenance:rls','SCOREABLE',true,ledger.allocate_sequence())`,
    [randomUUID(), answer.answer_id, answer.answer_version, w.runs.main]));
  } },
  { relation: "scorecard.routing_decision", run: async (insert, _q, w) => {
    w.made.set("routing_decision", await insert("scorecard.routing_decision", `INSERT INTO scorecard.routing_decision(session_id,
        task_class,lane,selected_model_id,propensity,guard_trail,policy_row_key,policy_register_version,policy_source_ref,at_seq)
      VALUES($1,'general','SERVED','model-rls',0.5,'[]','routingPolicy',$2,'register:rls',ledger.allocate_sequence())`,
    [w.encExecutionRef, 1]));
  } },
  { relation: "scorecard.session_assignment", run: async (insert, _q, w) => {
    w.made.set("session_assignment", await insert("scorecard.session_assignment", `INSERT INTO scorecard.session_assignment(
        session_id,task_class,model_id,model_version,provider,routing_decision_id,at_seq)
      VALUES($1,'general','model-rls','v1','provider-rls',$2,ledger.allocate_sequence())`,
    [w.encExecutionRef, made(w, "routing_decision").routing_decision_id]));
  } }
] satisfies RlsSeedStep[]);

/** memory.alias_row: $1 source_run_id, $2 prior_run_id (the policy column, D32 row 90). */
const ALIAS_ROW_INSERT = `INSERT INTO memory.alias_row(surface,canonical,confirmed_by,confirmed_at,source_run_id,prior_run_id,
    key_version,at_seq) VALUES('rls surface','rls canonical','operator:rls',now(),$1,$2,1,ledger.allocate_sequence())`;
/** memory.candidate_record: $1 source_run_id (the policy column, D32 row 91), $2 prior_run_id. */
const CANDIDATE_RECORD_INSERT = `INSERT INTO memory.candidate_record(source_run_id,prior_run_id,match_tier,agreement_pattern,reason,
    at_seq) VALUES($1,$2,'TERM_OVERLAP','{}','rls seed',ledger.allocate_sequence())`;
/** memory.memory_link: $1 source_run_id (the policy column, D32 row 92), $2 prior_run_id, $3 prior_answer_id. */
const MEMORY_LINK_INSERT = `INSERT INTO memory.memory_link(source_run_id,prior_run_id,relation,match_tier,agreed_fields,
    disagreed_fields,not_compared_fields,decided_by,decided_at,source_as_of,prior_as_of,source_policy_version,prior_policy_version,
    source_key_version,prior_key_version,alias_row_ids,prior_answer_id,at_seq)
  VALUES($1,$2,'RELATED_ONLY','TERM_OVERLAP','[]','[]','[]','operator:rls',now(),now(),now(),1,1,1,1,'[]',$3,
    ledger.allocate_sequence())`;

/**
 * F-SEC-1's mixed-owner rows. `ab`: the policy column names a run of A, the other run column a run of B; `ba`: the
 * reverse. core.run_supersession: an edge between the owner's own `mOld` and `mNew`, after which `mNew` is handed to the
 * other account (its current owner is the other one).
 */
async function seedMixedRows(q: RlsSeedQueryable, recorder: Recorder, a: RlsSeedWorld, b: RlsSeedWorld): Promise<void> {
  for (const [policy, other, owner] of [[a, b, "ab"], [b, a, "ba"]] as const) {
    const insert = recorder.inserter(q, owner);
    const attempt = async (relation: string, write: () => Promise<unknown>): Promise<void> => {
      try { await write(); } catch (error) { recorder.refuse(relation, error); }
    };
    await attempt("memory.alias_row", () => insert("memory.alias_row", ALIAS_ROW_INSERT, [other.runs.main, policy.runs.main]));
    await attempt("memory.candidate_record", () =>
      insert("memory.candidate_record", CANDIDATE_RECORD_INSERT, [policy.runs.main, other.runs.main]));
    await attempt("memory.memory_link", () =>
      insert("memory.memory_link", MEMORY_LINK_INSERT, [policy.runs.main, other.runs.main, randomUUID()]));
    await attempt("core.run_supersession", async () => {
      await insert("core.run_supersession", `INSERT INTO core.run_supersession(old_run_id,new_run_id,reason)
        VALUES($1,$2,'READMITTED')`, [policy.runs.mOld, policy.runs.mNew]);
      const run = (await q.query(`SELECT jsonb_build_array(${recorder.pk.get("core.run")})::text AS id FROM core.run
        WHERE run_id = $1`, [policy.runs.mNew])).rows[0]!.id;
      const from = policy === a ? "a" : "b", to = policy === a ? "b" : "a";
      await ownershipEvent(q, recorder, policy.runs.mNew, other.account.ownerRef, to);
      recorder.move("core.run", String(run), from, to);
    });
  }
}

/** The 110 in-scope tables (SPEC-v4 R2) each step list must cover — the step relations, read back for the report. */
function tablesOf(steps: readonly RlsSeedStep[]): readonly string[] {
  return [...new Set(["identity.user", "identity.session", "core.run", "core.run_ownership_event", ...steps.map((s) => s.relation)])];
}

/**
 * Seeds rows of A and B in every in-scope table (PLAN S6.1). Superuser seeding only (SPEC-v4 R35): `superuserPool`
 * must bypass row security. A step that fails is recorded in `unseedable` and seeding goes on.
 */
export async function seedRlsRows(superuserPool: Connectable, a: RlsSeedAccount, b: RlsSeedAccount): Promise<RlsSeedReport> {
  const client = await superuserPool.connect();
  try {
    const recorder = new Recorder(await primaryKeys(client));
    const worlds = [await prepareWorld(client, recorder, a, "A", "a"), await prepareWorld(client, recorder, b, "B", "b")] as const;
    for (const step of RLS_SEED_STEPS) {
      for (const [world, owner] of [[worlds[0], "a"], [worlds[1], "b"]] as const) {
        try {
          await step.run(recorder.inserter(client, owner), client, world);
        } catch (error) {
          recorder.refuse(step.relation, error);
        }
      }
    }
    await seedMixedRows(client, recorder, worlds[0], worlds[1]);
    return recorder.freeze(tablesOf(RLS_SEED_STEPS));
  } finally {
    client.release();
  }
}

/**
 * An account's world for an own-row INSERT test (SPEC-v4 R23): the superuser writes only what no T1 login may write
 * (the extra session, the five runs and their ownership events, the execution binding); the caller then runs
 * RLS_SEED_STEPS on its own connection. Rows it records are reported nowhere.
 */
export async function prepareRlsSeedWorld(superuser: RlsSeedQueryable, account: RlsSeedAccount, label: string): Promise<RlsSeedWorld> {
  return prepareWorld(superuser, new Recorder(await primaryKeys(superuser)), account, label, "a");
}

/** The insert helper RLS_SEED_STEPS expect, for a caller that runs them on its own connection (no report). */
export async function rlsSeedInserter(q: RlsSeedQueryable): Promise<RlsSeedInsert> {
  return new Recorder(await primaryKeys(q)).inserter(q, "a");
}

