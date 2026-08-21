import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { runInNewContext } from "node:vm";
import { setFlagsFromString, writeHeapSnapshot } from "node:v8";
import { Worker } from "node:worker_threads";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { migrate, PostgresIdentityRepository } from "@debateai/db";
import {
  createEmailBlindIndex,
  encrypt,
  FileUserDekStore,
  generateDek,
  generateVerificationToken,
  hashVerificationToken,
  hashAuditSourceIp,
  hashAuditUserAgent,
  loadKek,
  verifyChain,
  type ChainedAuditEvent,
  type UserDekStore
} from "../../packages/crypto/src/index.js";
import {
  AUTH_POLICY_REGISTER_ROWS,
  authPolicyFromRegisterRows,
  type AuthPolicy
} from "../../packages/register/src/auth-policy.js";
import {
  loadBootstrapRegister,
  persistBootstrapRegister,
  readAuthPolicy
} from "@debateai/register";
import {
  InProcessAuthRateLimiter,
  REGISTRATION_PUBLIC_RESPONSE,
  RegistrationService,
  RESEND_PUBLIC_RESPONSE
} from "../../apps/api/src/registration.js";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import {
  MailDeliveryError,
  MemoryMailSender,
  type MailSender,
  type VerificationMail
} from "../../apps/api/src/mail-channel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let secretRoot: string;
const blindIndexKey = Buffer.alloc(32, 0x3c);
const sourceIpSalt = Buffer.alloc(32, 0x6e);
const basePolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);

function withPolicy(overrides: Partial<AuthPolicy>): AuthPolicy {
  return Object.freeze({ ...basePolicy, ...overrides });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function bestSingleThresholdClassifierAccuracy(
  existing: readonly number[],
  missing: readonly number[]
): number {
  const distinct = [...new Set([...existing, ...missing])].sort((left, right) => left - right);
  const thresholds = [
    Number.NEGATIVE_INFINITY,
    ...distinct.slice(0, -1).map((value, index) => (value + distinct[index + 1]!) / 2),
    Number.POSITIVE_INFINITY
  ];
  let bestCorrect = 0;
  for (const threshold of thresholds) {
    const existingBelow = existing.filter((value) => value < threshold).length;
    const missingAbove = missing.filter((value) => value >= threshold).length;
    const forwardCorrect = existingBelow + missingAbove;
    const reverseCorrect = existing.length + missing.length - forwardCorrect;
    bestCorrect = Math.max(bestCorrect, forwardCorrect, reverseCorrect);
  }
  return bestCorrect / (existing.length + missing.length);
}

function aucSeparability(existing: readonly number[], missing: readonly number[]): number {
  let missingWins = 0;
  let ties = 0;
  for (const existingValue of existing) {
    for (const missingValue of missing) {
      if (missingValue > existingValue) missingWins += 1;
      if (missingValue === existingValue) ties += 1;
    }
  }
  const auc = (missingWins + 0.5 * ties) / (existing.length * missing.length);
  return Math.max(auc, 1 - auc);
}

function empiricalQuantile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index]!;
}

function sameArmRelabelingNull(
  values: readonly number[],
  groupSize: number,
  seed: number
): Readonly<{
  auc: readonly number[];
  classifier: readonly number[];
  groupSize: number;
}> {
  if (values.length < 2 || !Number.isInteger(groupSize) || groupSize < 2) {
    throw new TypeError("SAME_ARM_NULL_SAMPLE_INVALID");
  }
  const auc: number[] = [];
  const classifier: number[] = [];
  let state = seed >>> 0;
  const sample = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return values[Math.floor((state / 0x1_0000_0000) * values.length)]!;
  };
  for (let draw = 0; draw < 2_048; draw += 1) {
    const left = Array.from({ length: groupSize }, sample);
    const right = Array.from({ length: groupSize }, sample);
    auc.push(aucSeparability(left, right));
    classifier.push(bestSingleThresholdClassifierAccuracy(left, right));
  }
  return Object.freeze({
    auc: Object.freeze(auc),
    classifier: Object.freeze(classifier),
    groupSize
  });
}

async function forceGarbageCollection(): Promise<void> {
  setFlagsFromString("--expose_gc");
  const collect = runInNewContext("gc") as (options?: Readonly<{
    type: "major";
    execution: "sync";
    flavor: "last-resort";
  }>) => void;
  const options = Object.freeze({
    type: "major" as const,
    execution: "sync" as const,
    flavor: "last-resort" as const
  });
  collect(options);
  collect(options);
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function startSustainedHostLoad(root: string): Promise<Readonly<{
  filesystemWrites: () => number;
  stop: () => Promise<void>;
}>> {
  const cpuWorkers = Array.from({ length: 2 }, () => new Worker(`
    let value = 0x13579bdf;
    for (;;) {
      for (let index = 0; index < 1000000; index += 1) {
        value = Math.imul(value ^ index, 2654435761) >>> 0;
      }
    }
  `, { eval: true }));
  await Promise.all(cpuWorkers.map((worker) => new Promise<void>((resolve, reject) => {
    worker.once("online", resolve);
    worker.once("error", reject);
  })));

  let running = true;
  let writes = 0;
  const loadPath = join(root, `s3d-sustained-filesystem-load-${randomUUID()}.bin`);
  const payload = Buffer.alloc(256 * 1024, 0x5a);
  const filesystemWork = (async () => {
    while (running) {
      await writeFile(loadPath, payload);
      await stat(loadPath);
      writes += 1;
    }
  })();
  return Object.freeze({
    filesystemWrites: () => writes,
    async stop() {
      running = false;
      await Promise.all(cpuWorkers.map((worker) => worker.terminate()));
      await filesystemWork;
      await rm(loadPath, { force: true });
    }
  });
}

async function quotedVerificationTokensInHeap(snapshotPath: string): Promise<ReadonlySet<string>> {
  const matches = new Set<string>();
  let carry = "";
  for await (const chunk of createReadStream(snapshotPath, { encoding: "utf8" })) {
    const text = carry + chunk;
    for (const match of text.matchAll(/"([A-Za-z0-9_-]{43})"/g)) {
      matches.add(match[1]!);
    }
    carry = text.slice(-45);
  }
  return matches;
}

type RetainedDispatcherShapeCounts = Readonly<{
  queueNodes: number;
  refusalAggregates: number;
  mailCapacityAggregates: number;
  positiveControlObjects: number;
  total: number;
}>;

async function retainedDispatcherShapeCounts(
  snapshotPath: string
): Promise<RetainedDispatcherShapeCounts> {
  const heap = JSON.parse(await readFile(snapshotPath, "utf8")) as {
    snapshot: {
      meta: {
        node_fields: string[];
        node_types: Array<string[] | string>;
        edge_fields: string[];
        edge_types: Array<string[] | string>;
      };
    };
    nodes: number[];
    edges: number[];
    strings: string[];
  };
  const nodeFields = heap.snapshot.meta.node_fields;
  const edgeFields = heap.snapshot.meta.edge_fields;
  const nodeTypes = heap.snapshot.meta.node_types[0] as string[];
  const edgeTypes = heap.snapshot.meta.edge_types[0] as string[];
  const nodeTypeOffset = nodeFields.indexOf("type");
  const nodeEdgeCountOffset = nodeFields.indexOf("edge_count");
  const edgeTypeOffset = edgeFields.indexOf("type");
  const edgeNameOffset = edgeFields.indexOf("name_or_index");
  expect(nodeTypeOffset).toBeGreaterThanOrEqual(0);
  expect(nodeEdgeCountOffset).toBeGreaterThanOrEqual(0);
  expect(edgeTypeOffset).toBeGreaterThanOrEqual(0);
  expect(edgeNameOffset).toBeGreaterThanOrEqual(0);

  const requiredShapes = Object.freeze({
    queueNodes: Object.freeze([
      "resolve", "reject", "timeout"
    ]),
    refusalAggregates: Object.freeze([
      "actorToken", "occurredAt", "source"
    ]),
    mailCapacityAggregates: Object.freeze([
      "correlationId", "timer"
    ]),
    positiveControlObjects: Object.freeze([
      "s3dRetainedRefusalMarker"
    ])
  });
  const counts = {
    queueNodes: 0,
    refusalAggregates: 0,
    mailCapacityAggregates: 0,
    positiveControlObjects: 0
  };
  let edgeOffset = 0;
  for (let nodeOffset = 0; nodeOffset < heap.nodes.length; nodeOffset += nodeFields.length) {
    const edgeCount = heap.nodes[nodeOffset + nodeEdgeCountOffset]!;
    const properties = new Set<string>();
    if (nodeTypes[heap.nodes[nodeOffset + nodeTypeOffset]!] === "object") {
      for (let edge = 0; edge < edgeCount; edge += 1) {
        const currentEdgeOffset = edgeOffset + edge * edgeFields.length;
        if (edgeTypes[heap.edges[currentEdgeOffset + edgeTypeOffset]!] === "property") {
          properties.add(heap.strings[heap.edges[currentEdgeOffset + edgeNameOffset]!]!);
        }
      }
      for (const [shape, required] of Object.entries(requiredShapes) as Array<[
        keyof typeof counts, readonly string[]
      ]>) {
        if (required.every((property) => properties.has(property))) counts[shape] += 1;
      }
    }
    edgeOffset += edgeCount * edgeFields.length;
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return Object.freeze({ ...counts, total });
}

function limiterMemoryOccupancy(limiter: InProcessAuthRateLimiter): Readonly<{
  occupiedSlots: number;
  slotCapacity: number;
}> {
  const inspected = limiter as unknown as {
    memoryOccupancy?: () => Readonly<{ occupiedSlots: number; slotCapacity: number }>;
    buckets?: ReadonlyMap<string, unknown>;
  };
  return inspected.memoryOccupancy?.() ?? Object.freeze({
    occupiedSlots: inspected.buckets?.size ?? 0,
    slotCapacity: basePolicy.rateLimitBucketCapacity
  });
}

function buildService(input: {
  readonly mail?: MailSender;
  readonly policy?: AuthPolicy;
  readonly initialNow?: Date;
  readonly dekStore?: UserDekStore;
  readonly clock?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly limiterHashKey?: Uint8Array;
  readonly verificationTokenFactory?: () => string;
} = {}) {
  let now = input.initialNow ?? new Date("2026-08-19T12:00:00.000Z");
  const policy = input.policy ?? basePolicy;
  const mail = input.mail ?? new MemoryMailSender();
  const repository = new PostgresIdentityRepository(
    database.pool, sourceIpSalt, policy.auditSourceIpKdf
  );
  const limiter = new InProcessAuthRateLimiter(
    policy.rateLimits,
    policy.rateLimitBucketCapacity,
    policy.rateLimitRefusalAuditIntervalMs,
    input.limiterHashKey
  );
  const service = new RegistrationService({
    repository,
    mail,
    dekStore: input.dekStore ?? new FileUserDekStore(secretRoot, loadKek(Buffer.alloc(32, 0x7d))),
    blindIndexKey,
    policy,
    limiter,
    clock: input.clock ?? (() => now),
    ...(input.verificationTokenFactory === undefined
      ? {}
      : { verificationTokenFactory: input.verificationTokenFactory }),
    ...(input.sleep === undefined ? {} : { sleep: input.sleep })
  });
  return {
    service, repository, limiter, mail,
    advance(milliseconds: number) { now = new Date(now.getTime() + milliseconds); }
  };
}

const source = Object.freeze({
  ip: "192.0.2.40", userAgent: "vitest-registration", requestId: "request:s3"
});

async function registerAccount(
  service: RegistrationService,
  label: string,
  override: Partial<{ email: string; password: string; recoveryEmail: string }> = {}
) {
  const email = override.email ?? `${label}@example.test`;
  const password = override.password ?? "correct horse battery staple";
  const recoveryEmail = override.recoveryEmail ?? `${label}-recovery@example.test`;
  const response = await service.register({ email, password, recoveryEmail, adultAffirmed: true }, source);
  await (service as RegistrationService & { drainMailDispatches?: () => Promise<void> })
    .drainMailDispatches?.();
  const index = createEmailBlindIndex(blindIndexKey, email);
  const row = await database.pool.query<{
    user_id: string;
    pseudonym: string;
    password_hash: string;
    audit_token: string;
    state: string;
  }>(`
    SELECT user_id,pseudonym,password_hash,audit_token,state
    FROM identity."user" WHERE email_blind_index=$1
  `, [index]);
  return { email, password, recoveryEmail, response, index, user: row.rows[0]! };
}

function fixtureAskApplication(): AskApplication {
  return {
    submit: async () => ({ run_ref: "run:t9", status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({
      items: [], open_runs: [], limit, offset, total: 0
    }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:t9", state: "UNLINKED" }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () { /* no events */ }
  };
}

/**
 * Flushes every pooled backend's pending cumulative statistics so a
 * `pg_stat_database` read observes deadlocks reported by whichever backend was
 * the victim, not only by the reader. A backend flushes on its next query once
 * PGSTAT_MIN_INTERVAL has passed and unconditionally after PGSTAT_IDLE_INTERVAL
 * (10 s) of idleness, so idle pooled backends are touched first and the idle
 * interval is then waited out for any backend this pool does not hand back.
 * Only currently idle clients are checked out, never the whole pool, because
 * callers may legitimately hold one.
 */
async function settleDatabaseStatistics(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
  const idleClients = (database.pool as unknown as { readonly idleCount: number }).idleCount;
  const clients: PoolClient[] = [];
  try {
    for (let index = 0; index < idleClients; index += 1) {
      clients.push(await database.pool.connect());
    }
    await Promise.all(clients.map((client) => client.query("SELECT pg_stat_force_next_flush()")));
  } finally {
    for (const client of clients) client.release();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 11_000));
}

async function databaseDeadlockCount(): Promise<number> {
  const counter = await database.pool.query<{ deadlocks: string }>(`
    SELECT deadlocks::text AS deadlocks FROM pg_stat_database WHERE datname=current_database()
  `);
  return Number(counter.rows[0]!.deadlocks);
}

async function readAuditChain(): Promise<Readonly<{
  chain: readonly ChainedAuditEvent[];
  order: readonly Readonly<{ eventType: string; actorKeyRef: string; occurredAt: Date }>[];
  rootCount: number;
  totalRows: number;
}>> {
  const roots = await database.pool.query<{ roots: string; total: string }>(`
    SELECT count(*) FILTER (WHERE prev_hash IS NULL)::text AS roots,count(*)::text AS total
    FROM identity.audit_event
  `);
  const rows = await database.pool.query<{
    audit_id: string; prev_hash: Buffer | null; this_hash: Buffer; actor_ciphertext: null;
    actor_key_ref: string; event_type: string; target_type: string; target_id: string;
    occurred_at: Date; source_context: Record<string, unknown>; decision: string;
    success: boolean; justification: string | null; depth: number;
  }>(`
    WITH RECURSIVE chain AS (
      SELECT a.*, 1 AS depth FROM identity.audit_event a WHERE a.prev_hash IS NULL
      UNION ALL
      SELECT child.*, chain.depth + 1
      FROM identity.audit_event child JOIN chain ON child.prev_hash=chain.this_hash
    ) SELECT * FROM chain ORDER BY depth
  `);
  return Object.freeze({
    chain: rows.rows.map((row) => ({
      auditId: row.audit_id, actorCiphertext: row.actor_ciphertext,
      actorKeyRef: row.actor_key_ref, eventType: row.event_type,
      targetType: row.target_type, targetId: row.target_id, occurredAt: row.occurred_at,
      sourceContext: row.source_context, decision: row.decision, success: row.success,
      justification: row.justification, prevHash: row.prev_hash?.toString("hex") ?? null,
      thisHash: row.this_hash.toString("hex")
    })),
    order: rows.rows.map((row) => Object.freeze({
      eventType: row.event_type, actorKeyRef: row.actor_key_ref, occurredAt: row.occurred_at
    })),
    rootCount: Number(roots.rows[0]!.roots),
    totalRows: Number(roots.rows[0]!.total)
  });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  secretRoot = await mkdtemp(join(tmpdir(), "debateai-s3-registration-"));
}, 120_000);

afterAll(async () => {
  await database?.stop();
  if (secretRoot !== undefined) await rm(secretRoot, { recursive: true, force: true });
});

describe("S3 registration and verification on real PostgreSQL", () => {
  it("S3a A1 migrates legacy audit history and enforces both erasure checks on every new row", async () => {
    const upgrade = await startTestDatabase();
    try {
      await migrate(upgrade.pool);
      await upgrade.pool.query(`
        ALTER TABLE identity.audit_event DROP CONSTRAINT audit_event_actor_ciphertext_null
      `);
      await upgrade.pool.query(`
        ALTER TABLE identity.audit_event DROP CONSTRAINT audit_event_target_id_no_email
      `);
      await upgrade.pool.query(`
        DELETE FROM public.debateai_schema_migration
        WHERE name='0032_registration_audit_erasure_checks.sql'
      `);
      await upgrade.pool.query(`
        INSERT INTO identity.audit_event (
          this_hash,actor_ciphertext,actor_key_ref,event_type,target_type,target_id,
          occurred_at,source_context,decision,success
        ) VALUES (
          $1,'{}'::jsonb,'legacy-actor','identity.legacy','identity.user',
          'legacy@example.test','2026-08-18T09:00:00.000Z','{}'::jsonb,'ALLOW',true
        )
      `, [Buffer.alloc(32, 0xa0)]);

      await expect(migrate(upgrade.pool)).resolves.toBeUndefined();

      const constraints = await upgrade.pool.query<{ conname: string; convalidated: boolean }>(`
        SELECT conname,convalidated FROM pg_constraint
        WHERE conrelid='identity.audit_event'::regclass
          AND conname=ANY($1::text[]) ORDER BY conname
      `, [["audit_event_actor_ciphertext_null", "audit_event_target_id_no_email"]]);
      expect(constraints.rows).toEqual([
        { conname: "audit_event_actor_ciphertext_null", convalidated: false },
        { conname: "audit_event_target_id_no_email", convalidated: false }
      ]);
      await expect(upgrade.pool.query(`
        INSERT INTO identity.audit_event (
          this_hash,actor_ciphertext,actor_key_ref,event_type,target_type,target_id,
          occurred_at,source_context,decision,success
        ) VALUES (
          $1,'{}'::jsonb,'new-actor','identity.new','identity.user',
          'opaque-new-target','2026-08-19T09:00:00.000Z','{}'::jsonb,'ALLOW',true
        )
      `, [Buffer.alloc(32, 0xa1)])).rejects.toMatchObject({
        code: "23514", constraint: "audit_event_actor_ciphertext_null"
      });
      await expect(upgrade.pool.query(`
        INSERT INTO identity.audit_event (
          this_hash,actor_ciphertext,actor_key_ref,event_type,target_type,target_id,
          occurred_at,source_context,decision,success
        ) VALUES (
          $1,NULL,'new-actor','identity.new','identity.user',
          'new@example.test','2026-08-19T09:00:01.000Z','{}'::jsonb,'ALLOW',true
        )
      `, [Buffer.alloc(32, 0xa2)])).rejects.toMatchObject({
        code: "23514", constraint: "audit_event_target_id_no_email"
      });
      await expect(upgrade.pool.query(`
        INSERT INTO identity.audit_event (
          this_hash,actor_ciphertext,actor_key_ref,event_type,target_type,target_id,
          occurred_at,source_context,decision,success
        ) VALUES (
          $1,NULL,'new-actor','identity.new','identity.user',
          'opaque-new-target','2026-08-19T09:00:02.000Z','{}'::jsonb,'ALLOW',true
        )
      `, [Buffer.alloc(32, 0xa3)])).resolves.toMatchObject({ rowCount: 1 });
      const legacy = await upgrade.pool.query(`
        SELECT 1 FROM identity.audit_event WHERE actor_key_ref='legacy-actor'
      `);
      expect(legacy.rowCount).toBe(1);
      console.info(
        `[S3a A1 RED/GREEN] backend=${upgrade.mechanism} legacy_rows=${legacy.rowCount} `
        + `constraints=not_valid_and_enforced migration=single_transaction`
      );
    } finally {
      await upgrade.stop();
    }
  }, 120_000);

  it("registers a pending adult account, provisions a file DEK, sends through the stub, and activates once", async () => {
    const flow = buildService();
    const registered = await registerAccount(flow.service, "happy");

    expect(registered.response).toEqual(REGISTRATION_PUBLIC_RESPONSE);
    expect(registered.response.message).toMatch(/spam/i);
    expect(registered.user).toMatchObject({ state: "pending_verification" });
    expect(registered.user.audit_token).not.toBe(registered.user.user_id);
    expect(registered.user.pseudonym).toMatch(/^[a-z]+-[a-z]+-[0-9a-f]{6}$/);
    expect(registered.user.pseudonym).not.toContain("happy");
    expect(registered.user.password_hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect((flow.mail as MemoryMailSender).messages).toHaveLength(1);

    const dekPath = join(secretRoot, "users", registered.user.user_id, "dek.v1.json");
    expect((await stat(dekPath)).mode & 0o777).toBe(0o600);

    const token = (flow.mail as MemoryMailSender).messages[0]!.token;
    await expect(flow.service.verifyEmail({ token }, source)).resolves.toEqual({ status: "active" });
    await expect(flow.service.verifyEmail({ token }, source)).rejects.toMatchObject({
      code: "VERIFICATION_TOKEN_INVALID"
    });
    const state = await database.pool.query<{ state: string }>(
      `SELECT state FROM identity."user" WHERE user_id=$1`, [registered.user.user_id]
    );
    expect(state.rows[0]!.state).toBe("active");
  });

  it("S3a A2 clamps empty and whitespace User-Agent values for all auth-route audit writes", async () => {
    for (const [label, userAgent, ip] of [
      ["empty", "", "192.0.2.241"],
      ["whitespace", "   ", "192.0.2.242"]
    ] as const) {
      const flow = buildService();
      const routeSource = Object.freeze({
        ip, userAgent, requestId: `request:s3a:a2:${label}`
      });
      const email = `s3a-a2-${label}@example.test`;
      await expect(flow.service.register({
        email,
        password: "correct horse battery staple",
        recoveryEmail: `s3a-a2-${label}-recovery@example.test`,
        adultAffirmed: true
      }, routeSource)).resolves.toEqual(REGISTRATION_PUBLIC_RESPONSE);
      await flow.service.drainMailDispatches();
      await expect(flow.service.verifyEmail({ token: generateVerificationToken() }, routeSource))
        .rejects.toMatchObject({ code: "VERIFICATION_TOKEN_INVALID" });
      await expect(flow.service.resendVerification({ email: `missing-${label}@example.test` }, routeSource))
        .resolves.toEqual(RESEND_PUBLIC_RESPONSE);

      const [ipArgon2id, unknownUserAgentArgon2id] = await Promise.all([
        hashAuditSourceIp(ip, sourceIpSalt, basePolicy.auditSourceIpKdf),
        hashAuditUserAgent("unknown", sourceIpSalt, basePolicy.auditSourceIpKdf)
      ]);
      const audit = await database.pool.query<{
        event_type: string;
        user_agent_argon2id: string;
      }>(`
        SELECT event_type,source_context->>'userAgentArgon2id' AS user_agent_argon2id
        FROM identity.audit_event
        WHERE source_context->>'ipArgon2id'=$1
      `, [ipArgon2id]);
      expect(audit.rows.map((row) => row.event_type)).toEqual(expect.arrayContaining([
        "identity.registration",
        "identity.verification.consumed",
        "identity.verification.resend_requested"
      ]));
      expect(audit.rows.length).toBeGreaterThanOrEqual(3);
      expect(audit.rows.every((row) => row.user_agent_argon2id === unknownUserAgentArgon2id)).toBe(true);
      const account = await database.pool.query(`
        SELECT 1 FROM identity."user" WHERE email_blind_index=$1
      `, [createEmailBlindIndex(blindIndexKey, email)]);
      expect(account.rowCount).toBe(1);
      console.info(
        `[S3a A2 RED/GREEN] variant=${label} routes=register,verify,resend `
        + `audit_rows=${audit.rowCount} normalized=unknown`
      );
    }
  }, 30_000);

  it("S3a A3 preserves request-arrival timestamps across a delayed concurrent provisioning burst", async () => {
    const labels = ["one", "two", "three", "four"] as const;
    const requestedBase = new Date("2026-08-19T14:00:00.000Z");
    const drainTime = new Date(requestedBase.getTime() + 12_700);
    let intakeClockCalls = 0;
    let draining = false;
    let releaseProvisioning!: () => void;
    let markProvisioningEntered!: () => void;
    const provisioningGate = new Promise<void>((resolve) => { releaseProvisioning = resolve; });
    const provisioningEntered = new Promise<void>((resolve) => { markProvisioningEntered = resolve; });
    const durableStore = new FileUserDekStore(secretRoot, loadKek(Buffer.alloc(32, 0x7d)));
    const flow = buildService({
      clock: () => draining
        ? new Date(drainTime)
        : new Date(requestedBase.getTime() + intakeClockCalls++),
      dekStore: {
        async store(userId, dek) {
          markProvisioningEntered();
          await provisioningGate;
          await durableStore.store(userId, dek);
        }
      }
    });

    const registrations = labels.map((label) => flow.service.register({
      email: `s3a-a3-${label}@example.test`,
      password: "correct horse battery staple",
      recoveryEmail: `s3a-a3-${label}-recovery@example.test`,
      adultAffirmed: true
    }, { ...source, requestId: `request:s3a:a3:${label}` }));
    draining = true;
    await provisioningEntered;
    releaseProvisioning();
    await Promise.all(registrations);
    await flow.service.drainMailDispatches();

    const drifts: number[] = [];
    for (const [index, label] of labels.entries()) {
      const expectedRequestedAt = new Date(requestedBase.getTime() + index);
      const persisted = await database.pool.query<{
        adult_affirmed_at: Date;
        verification_expires_at: Date;
        audit_occurred_at: Date;
      }>(`
        SELECT u.adult_affirmed_at,c.verification_expires_at,a.occurred_at AS audit_occurred_at
        FROM identity."user" u
        JOIN identity.channel_binding c ON c.user_id=u.user_id AND c.channel_type='email'
        JOIN identity.audit_event a
          ON a.target_id=u.audit_token::text AND a.event_type='identity.registration'
        WHERE u.email_blind_index=$1
      `, [createEmailBlindIndex(blindIndexKey, `s3a-a3-${label}@example.test`)]);
      expect(persisted.rowCount).toBe(1);
      const row = persisted.rows[0]!;
      expect(row.adult_affirmed_at).toEqual(expectedRequestedAt);
      expect(row.audit_occurred_at).toEqual(expectedRequestedAt);
      expect(row.verification_expires_at).toEqual(
        new Date(expectedRequestedAt.getTime() + basePolicy.verification.tokenTtlMs)
      );
      drifts.push(Math.abs(row.adult_affirmed_at.getTime() - expectedRequestedAt.getTime()));
    }
    console.info(
      `[S3a A3 RED/GREEN] concurrent=${labels.length} drain_delay_ms=12700 `
      + `max_request_timestamp_drift_ms=${Math.max(...drifts)}`
    );
  }, 30_000);

  it("S3b keeps a success pending until its real PostgreSQL transaction commits", async () => {
    const durableStore = new FileUserDekStore(secretRoot, loadKek(Buffer.alloc(32, 0x7d)));
    let releaseStore!: () => void;
    let markStoreEntered!: () => void;
    const storeGate = new Promise<void>((resolve) => { releaseStore = resolve; });
    const storeEntered = new Promise<void>((resolve) => { markStoreEntered = resolve; });
    const gatedStore: UserDekStore = {
      async store(userId, dek) {
        markStoreEntered();
        await storeGate;
        await durableStore.store(userId, dek);
      }
    };
    const flow = buildService({ dekStore: gatedStore });
    const email = "s3b-commit-gate@example.test";
    const index = createEmailBlindIndex(blindIndexKey, email);
    let settledBeforeRelease = 0;
    const registration = flow.service.register({
      email,
      password: "correct horse battery staple",
      recoveryEmail: "s3b-commit-gate-recovery@example.test",
      adultAffirmed: true
    }, {
      ip: "198.51.100.201",
      userAgent: "vitest-s3b-commit-gate",
      requestId: "request:s3b:commit-gate"
    }).then((response) => {
      settledBeforeRelease += 1;
      return response;
    });

    await storeEntered;
    await new Promise<void>((resolve) => setTimeout(
      resolve,
      basePolicy.verification.enumerationResponseFloorMs
        + basePolicy.verification.enumerationToleranceMs
        + 50
    ));
    const responsesSettledWhileCommitBlocked = settledBeforeRelease;
    const beforeRelease = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM identity."user"
      WHERE email_blind_index=$1
    `, [index]);
    releaseStore();
    const response = await registration;
    const committedAtResponse = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM identity."user"
      WHERE email_blind_index=$1
    `, [index]);
    await flow.service.drainMailDispatches();

    console.info(
      `[S3b COMMIT GATE] backend=postgres settled_while_commit_blocked=${responsesSettledWhileCommitBlocked} `
      + `committed_before_release=${beforeRelease.rows[0]!.count} `
      + `committed_at_response=${committedAtResponse.rows[0]!.count}`
    );
    expect(Object.prototype.hasOwnProperty.call(flow.service, "pendingRegistrationDispatches")).toBe(false);
    expect(responsesSettledWhileCommitBlocked).toBe(0);
    expect(Number(beforeRelease.rows[0]!.count)).toBe(0);
    expect(response).toEqual(REGISTRATION_PUBLIC_RESPONSE);
    expect(Number(committedAtResponse.rows[0]!.count)).toBe(1);
  }, 30_000);

  it("S3b returns 100 burst successes only after all 100 accounts are committed", async () => {
    const durableStore = new FileUserDekStore(secretRoot, loadKek(Buffer.alloc(32, 0x7d)));
    const delayedStore: UserDekStore = {
      async store(userId, dek) {
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
        await durableStore.store(userId, dek);
      }
    };
    const burstPolicy = withPolicy({
      password: Object.freeze({
        ...basePolicy.password,
        argon2id: Object.freeze({
          ...basePolicy.password.argon2id,
          memoryCostKiB: 19_456,
          timeCost: 2
        })
      })
    });
    const flow = buildService({ policy: burstPolicy, dekStore: delayedStore });
    const indexes: Buffer[] = [];
    const responses = await Promise.all(Array.from({ length: 100 }, (_, index) => {
      const email = `s3b-durability-${index}@example.test`;
      indexes.push(createEmailBlindIndex(blindIndexKey, email));
      return flow.service.register({
        email,
        password: "correct horse battery staple",
        recoveryEmail: `s3b-durability-${index}-recovery@example.test`,
        adultAffirmed: true
      }, {
        ip: `198.51.100.${index + 1}`,
        userAgent: "vitest-s3b-durability",
        requestId: `request:s3b:durability:${index}`
      });
    }));
    const committedAtResponse = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM identity."user"
      WHERE email_blind_index=ANY($1::bytea[])
    `, [indexes]);
    await flow.service.drainMailDispatches();

    console.info(
      `[S3b DURABILITY BURST] backend=postgres concurrent=100 successes=${responses.length} `
      + `committed_at_response=${committedAtResponse.rows[0]!.count}`
    );
    expect(responses).toEqual(Array.from({ length: 100 }, () => REGISTRATION_PUBLIC_RESPONSE));
    expect(Number(committedAtResponse.rows[0]!.count)).toBe(responses.length);
  }, 120_000);

  it("S3b turns a provisioning failure into a correlated typed failure and durable failure audit", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flow = buildService({
      dekStore: {
        async store() {
          throw new Error("simulated secret-store failure with private detail");
        }
      }
    });
    const email = "s3b-provision-failure@example.test";
    let outcome: unknown = "success";
    try {
      await flow.service.register({
        email,
        password: "correct horse battery staple",
        recoveryEmail: "s3b-provision-failure-recovery@example.test",
        adultAffirmed: true
      }, { ...source, requestId: "request:s3b:provision-failure" });
    } catch (caught) {
      outcome = caught;
    }
    try {
      expect(outcome).toMatchObject({ code: "AUTH_REGISTRATION_FAILED", statusCode: 503 });
      const operatorLines = error.mock.calls.flat().map(String);
      const failureLine = operatorLines.find((line) => line.startsWith("[AUTH_REGISTRATION_PROVISION_FAILED]"));
      expect(failureLine).toMatch(
        /^\[AUTH_REGISTRATION_PROVISION_FAILED\] correlation=[0-9a-f-]{36} code=PROVISION_FAILED$/
      );
      expect(failureLine).not.toContain(email);
      expect(failureLine).not.toContain(source.ip);
      expect(failureLine).not.toContain(source.userAgent);
      const correlationId = failureLine!.match(/correlation=([0-9a-f-]{36})/)![1]!;
      const audit = await database.pool.query<{
        target_id: string;
        actor_key_ref: string;
        justification: string;
      }>(`
        SELECT target_id,actor_key_ref,justification
        FROM identity.audit_event
        WHERE event_type='identity.registration.failed' AND target_id=$1
      `, [correlationId]);
      expect(audit.rows).toEqual([{
        target_id: correlationId,
        actor_key_ref: correlationId,
        justification: "PROVISION_FAILED"
      }]);
      const account = await database.pool.query(`
        SELECT 1 FROM identity."user" WHERE email_blind_index=$1
      `, [createEmailBlindIndex(blindIndexKey, email)]);
      expect(account.rowCount).toBe(0);
      console.info(
        `[S3b FAILURE HONESTY] backend=postgres typed=AUTH_REGISTRATION_FAILED status=503 `
        + `correlation=${correlationId} audit_rows=${audit.rowCount} accounts=${account.rowCount}`
      );
    } finally {
      error.mockRestore();
    }
  }, 30_000);

  it("S3b normalises blank audit context at the repository boundary when a writer bypasses sourceContext", async () => {
    const flow = buildService();
    const actorToken = randomUUID();
    await expect(flow.repository.recordRateLimitRefusal({
      actorToken,
      route: "register",
      scope: "ip",
      count: 1,
      ipCount: 1,
      addressCount: 0,
      occurredAt: new Date("2026-08-19T15:00:00.000Z"),
      aggregateWindowStartedAt: new Date("2026-08-19T15:00:00.000Z"),
      source: { ip: "", userAgent: "  \t", requestId: "" }
    })).resolves.toBeUndefined();
    const [unknownIpArgon2id, unknownUserAgentArgon2id] = await Promise.all([
      hashAuditSourceIp("unknown", sourceIpSalt, basePolicy.auditSourceIpKdf),
      hashAuditUserAgent("unknown", sourceIpSalt, basePolicy.auditSourceIpKdf)
    ]);
    const audit = await database.pool.query<{
      ip_argon2id: string;
      user_agent_argon2id: string;
    }>(`
      SELECT source_context->>'ipArgon2id' AS ip_argon2id,
        source_context->>'userAgentArgon2id' AS user_agent_argon2id
      FROM identity.audit_event
      WHERE event_type='identity.auth.rate_limit_refused' AND target_id=$1
    `, [actorToken]);
    expect(audit.rows).toEqual([{
      ip_argon2id: unknownIpArgon2id,
      user_agent_argon2id: unknownUserAgentArgon2id
    }]);
    console.info(
      `[S3b REPOSITORY NORMALISATION] backend=postgres bypass=sourceContext `
      + `blank_ip=unknown blank_ua=unknown audit_rows=${audit.rowCount}`
    );
  }, 30_000);

  it("rejects an expired token without activating the account", async () => {
    const flow = buildService();
    const registered = await registerAccount(flow.service, "expired");
    const token = (flow.mail as MemoryMailSender).messages[0]!.token;
    flow.advance(basePolicy.verification.tokenTtlMs + 1);

    await expect(flow.service.verifyEmail({ token }, source)).rejects.toMatchObject({
      code: "VERIFICATION_TOKEN_INVALID"
    });
    const state = await database.pool.query<{ state: string }>(
      `SELECT state FROM identity."user" WHERE user_id=$1`, [registered.user.user_id]
    );
    expect(state.rows[0]!.state).toBe("pending_verification");
  });

  it("keeps resend cooldown and missing-account outcomes indistinguishable while preserving older mailed tokens", async () => {
    const flow = buildService();
    const registered = await registerAccount(flow.service, "resend");
    const firstToken = (flow.mail as MemoryMailSender).messages[0]!.token;

    const cooling = await flow.service.resendVerification({ email: registered.email }, source);
    const missing = await flow.service.resendVerification({ email: "missing@example.test" }, source);
    expect(cooling).toEqual(RESEND_PUBLIC_RESPONSE);
    expect(missing).toEqual(RESEND_PUBLIC_RESPONSE);
    expect((flow.mail as MemoryMailSender).messages).toHaveLength(1);

    flow.advance(basePolicy.verification.resendCooldownMs + 1);
    await expect(flow.service.resendVerification({ email: registered.email }, source))
      .resolves.toEqual(RESEND_PUBLIC_RESPONSE);
    await (flow.service as RegistrationService & { drainMailDispatches?: () => Promise<void> })
      .drainMailDispatches?.();
    expect((flow.mail as MemoryMailSender).messages).toHaveLength(2);
    expect((flow.mail as MemoryMailSender).messages[1]!.token).not.toBe(firstToken);
    await expect(flow.service.verifyEmail({ token: firstToken }, source))
      .resolves.toEqual({ status: "active" });
  });

  it("S3c B1 caps victim-bound mail and token rotation while the owner retains admission and verifies", async () => {
    const initialNow = new Date("2026-08-20T04:00:00.000Z");
    const flow = buildService({ initialNow, sleep: async () => undefined });
    const victimEmail = "s3c-b1-victim@example.test";
    const registered = await registerAccount(flow.service, "s3c-b1-victim", {
      email: victimEmail,
      recoveryEmail: "s3c-b1-victim-recovery@example.test"
    });
    const tokenVersions = new Set<string>();
    const rememberTokenVersion = async () => {
      const result = await database.pool.query<{ token_hash: string }>(`
        SELECT verification_token_hash AS token_hash
        FROM identity.channel_binding
        WHERE user_id=$1 AND channel_type='email'
      `, [registered.user.user_id]);
      tokenVersions.add(result.rows[0]!.token_hash);
    };
    await rememberTokenVersion();

    const attackerOutcomes: string[] = [];
    for (let minute = 1; minute < 60; minute += 1) {
      flow.advance(60_000);
      try {
        await flow.service.resendVerification({ email: victimEmail }, {
          ip: `203.0.120.${((minute - 1) % 20) + 1}`,
          userAgent: "vitest-s3c-b1-attacker",
          requestId: `request:s3c:b1:attacker:${minute}`
        });
        attackerOutcomes.push("ALLOWED");
      } catch (error) {
        attackerOutcomes.push((error as { code?: string }).code ?? "RAW_ERROR");
      }
      await flow.service.drainMailDispatches();
      await rememberTokenVersion();
    }

    const ownerResponse = await flow.service.resendVerification({ email: victimEmail }, {
      ip: "198.51.100.220",
      userAgent: "vitest-s3c-b1-owner",
      requestId: "request:s3c:b1:owner-resend"
    });
    await flow.service.drainMailDispatches();
    const messages = (flow.mail as MemoryMailSender).messages.filter(
      (message) => message.recipient === victimEmail
    );
    const latestToken = messages.at(-1)!.token;
    const verification = await flow.service.verifyEmail({ token: latestToken }, {
      ip: "198.51.100.220",
      userAgent: "vitest-s3c-b1-owner",
      requestId: "request:s3c:b1:owner-verify"
    });
    const state = await database.pool.query<{ state: string }>(`
      SELECT state FROM identity."user" WHERE user_id=$1
    `, [registered.user.user_id]);
    const rotations = tokenVersions.size - 1;
    console.info(
      `[S3c B1 OUTBOUND CAP] backend=postgres attacker_sources=20 attempts=59 `
      + `admission_successes=${attackerOutcomes.filter((outcome) => outcome === "ALLOWED").length}/59 `
      + `victim_mails=${messages.length} token_versions=${tokenVersions.size} rotations=${rotations} `
      + `owner_admission=success owner_verification=${verification.status}`
    );

    expect(attackerOutcomes).toEqual(Array.from({ length: 59 }, () => "ALLOWED"));
    expect(messages.length).toBeLessThanOrEqual(3);
    expect(tokenVersions.size).toBeLessThanOrEqual(3);
    expect(rotations).toBeLessThanOrEqual(3);
    expect(ownerResponse).toEqual(RESEND_PUBLIC_RESPONSE);
    expect(verification).toEqual({ status: "active" });
    expect(state.rows).toEqual([{ state: "active" }]);
  }, 120_000);

  it("S3d D1 bounds hanging verification dispatches without committing accounts it cannot notify", async () => {
    const ruledMaximum = basePolicy.channel.maxConcurrentVerificationDispatches;
    const ruledQueueMaximum = basePolicy.channel.maxQueuedVerificationDispatches;
    class HangingMailSender implements MailSender {
      readonly active = new Map<string, VerificationMail>();
      private readonly releases = new Map<string, () => void>();
      private passThrough = false;
      peak = 0;

      async sendVerification(mail: VerificationMail): Promise<void> {
        this.active.set(mail.attemptId, mail);
        this.peak = Math.max(this.peak, this.active.size);
        if (!this.passThrough) {
          await new Promise<void>((resolve) => this.releases.set(mail.attemptId, resolve));
        }
        this.releases.delete(mail.attemptId);
        this.active.delete(mail.attemptId);
      }

      releaseAndPassThrough(): void {
        this.passThrough = true;
        for (const release of [...this.releases.values()]) release();
      }
    }

    const mail = new HangingMailSender();
    const generatedTokenHashes = new Set<string>();
    const flow = buildService({
      mail,
      sleep: async () => undefined,
      verificationTokenFactory() {
        const token = generateVerificationToken();
        generatedTokenHashes.add(hashVerificationToken(token));
        return token;
      }
    });
    const capacityError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const heapCanary = Buffer.from("C".repeat(43), "utf8").toString("utf8");
    const baselineSnapshotPath = join(secretRoot, `s3d-d1-baseline-${randomUUID()}.heapsnapshot`);
    writeHeapSnapshot(baselineSnapshotPath);
    const baselineTokenStrings = await quotedVerificationTokensInHeap(baselineSnapshotPath);
    await rm(baselineSnapshotPath, { force: true });
    expect(baselineTokenStrings.has(heapCanary)).toBe(true);
    const initialAttempts = ruledMaximum + ruledQueueMaximum;
    const outcomes: Array<string | undefined> = Array.from({ length: initialAttempts });
    const registerAt = async (index: number): Promise<void> => {
      try {
        await flow.service.register({
          email: `s3d-hang-${index}@example.test`,
          password: "correct horse battery staple",
          recoveryEmail: `s3d-hang-${index}-recovery@example.test`,
          adultAffirmed: true
        }, {
          ip: `2001:db8:3d::${index + 1}`,
          userAgent: "vitest-s3d-hanging-transport",
          requestId: `request:s3d:hang:${index}`
        });
        outcomes[index] = "ALLOWED";
      } catch (error) {
        outcomes[index] = (error as { code?: string }).code ?? "RAW_ERROR";
      }
    };
    const initial = Array.from({ length: initialAttempts }, (_, index) => registerAt(index));
    const saturationStartedAt = performance.now();
    while (true) {
      const state = flow.service.mailDispatchOccupancy();
      if (state.inFlight === ruledMaximum && state.activeSends === ruledMaximum
        && state.queued === ruledQueueMaximum && mail.active.size === ruledMaximum) break;
      if (performance.now() - saturationStartedAt > 30_000) {
        throw new Error(`S3D_DISPATCH_SATURATION_TIMEOUT:${JSON.stringify(state)}`);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    const saturationProbe = async (email: string, label: string) => {
      const startedAt = performance.now();
      try {
        await flow.service.register({
          email,
          password: "correct horse battery staple",
          recoveryEmail: `${label}-recovery@example.test`,
          adultAffirmed: true
        }, {
          ip: `2001:db8:3d:1::${label === "duplicate" ? "1" : "2"}`,
          userAgent: "vitest-s3d-capacity-enumeration",
          requestId: `request:s3d:capacity:${label}`
        });
        return { code: "ALLOWED", statusCode: 202, elapsedMs: performance.now() - startedAt };
      } catch (error) {
        const known = error as { code?: string; statusCode?: number };
        return {
          code: known.code ?? "RAW_ERROR",
          statusCode: known.statusCode ?? 500,
          elapsedMs: performance.now() - startedAt
        };
      }
    };
    const duplicateAtCapacity = await saturationProbe("s3d-hang-0@example.test", "duplicate");
    const newAtCapacity = await saturationProbe("s3d-hang-new-at-capacity@example.test", "new");
    const overflow = async (index: number) => {
      try {
        await flow.service.register({
          email: `s3d-overflow-${index}@example.test`,
          password: "correct horse battery staple",
          recoveryEmail: `s3d-overflow-${index}-recovery@example.test`,
          adultAffirmed: true
        }, {
          ip: `2001:db8:3d:6::${index + 1}`,
          userAgent: "vitest-s3d-capacity-overflow",
          requestId: `request:s3d:overflow:${index}`
        });
        return { code: "ALLOWED", statusCode: 202 };
      } catch (error) {
        const known = error as { code?: string; statusCode?: number };
        return { code: known.code ?? "RAW_ERROR", statusCode: known.statusCode ?? 500 };
      }
    };
    // The former 8+24 refusal mini-wave was not a memory proof. Keep only two
    // functional refusal checks here; the N=500/N=4000 heap proof below owns
    // the retained-object security assertion.
    const capacityRefusalChecks = await Promise.all(
      Array.from({ length: 2 }, (_, index) => overflow(index))
    );
    const pending = (flow.service as unknown as {
      pendingMailDispatches: ReadonlySet<Promise<void>>;
    }).pendingMailDispatches;
    const occupancy = flow.service.mailDispatchOccupancy();
    const saturatedSnapshotPath = join(secretRoot, `s3d-d1-saturated-${randomUUID()}.heapsnapshot`);
    writeHeapSnapshot(saturatedSnapshotPath);
    const saturatedTokenStrings = await quotedVerificationTokensInHeap(saturatedSnapshotPath);
    await rm(saturatedSnapshotPath, { force: true });
    const activeRawTokens = [...mail.active.values()].map((message) => message.token);
    const activeRawTokenSet = new Set(activeRawTokens);
    const generatedTokenStringsInSnapshot = [...saturatedTokenStrings].filter(
      (token) => !baselineTokenStrings.has(token)
        && generatedTokenHashes.has(hashVerificationToken(token))
    );
    const rawTokensOutsideActiveSend = generatedTokenStringsInSnapshot.filter(
      (token) => !activeRawTokenSet.has(token)
    ).length;
    const committedAtSaturation = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM identity."user"
      WHERE email_blind_index = ANY($1::bytea[])
    `, [Array.from({ length: initialAttempts }, (_, index) =>
      createEmailBlindIndex(blindIndexKey, `s3d-hang-${index}@example.test`)
    )]);
    const acceptedAtSaturation = outcomes.filter((outcome) => outcome === "ALLOWED").length;
    flow.service.drainMailCapacitySignals();
    const capacitySignals = capacityError.mock.calls.map(([message]) => String(message));

    try {
      expect(pending.size).toBeLessThanOrEqual(ruledMaximum);
      expect(occupancy).toEqual({
        inFlight: ruledMaximum,
        activeSends: ruledMaximum,
        maximum: ruledMaximum,
        queued: ruledQueueMaximum,
        maximumQueued: ruledQueueMaximum
      });
      expect(activeRawTokens).toHaveLength(ruledMaximum);
      expect(activeRawTokens.every((token) => saturatedTokenStrings.has(token))).toBe(true);
      expect(generatedTokenStringsInSnapshot).toHaveLength(ruledMaximum);
      expect(rawTokensOutsideActiveSend).toBe(0);
      expect(mail.peak).toBeLessThanOrEqual(ruledMaximum);
      expect(acceptedAtSaturation).toBe(ruledMaximum);
      expect(Number(committedAtSaturation.rows[0]!.count)).toBe(ruledMaximum);
      expect(capacityRefusalChecks).toEqual(Array.from({ length: 2 }, () => ({
        code: "AUTH_MAIL_BUSY", statusCode: 503
      })));
      expect(duplicateAtCapacity).toEqual(expect.objectContaining({
        code: "AUTH_MAIL_BUSY", statusCode: 503
      }));
      expect(newAtCapacity).toEqual(expect.objectContaining({
        code: "AUTH_MAIL_BUSY", statusCode: 503
      }));
      expect(Math.abs(duplicateAtCapacity.elapsedMs - newAtCapacity.elapsedMs))
        .toBeLessThan(basePolicy.verification.enumerationToleranceMs);
      expect(capacitySignals).toHaveLength(1);
      expect(capacitySignals.every((signal) =>
        /^\[AUTH_MAIL_CAPACITY_EXHAUSTED\] correlation=[0-9a-f-]{36} code=MAIL_DISPATCH_CAPACITY window=[^ ]+ count=4$/.test(signal)
      )).toBe(true);
      expect(capacitySignals.some((signal) => signal.includes("s3d-hang-")
        || signal.includes("2001:db8") || signal.includes("vitest-s3d"))).toBe(false);
    } finally {
      mail.releaseAndPassThrough();
      await Promise.all(initial);
      await flow.service.drainMailDispatches();
      capacityError.mockRestore();
    }
    const committedAfterDrain = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM identity."user"
      WHERE email_blind_index = ANY($1::bytea[])
    `, [Array.from({ length: initialAttempts }, (_, index) =>
      createEmailBlindIndex(blindIndexKey, `s3d-hang-${index}@example.test`)
    )]);
    const acceptedAfterDrain = outcomes.filter((outcome) => outcome === "ALLOWED").length;
    const timedOutAfterDrain = outcomes.filter((outcome) => outcome === "AUTH_MAIL_BUSY").length;
    console.info(
      `[S3d D1 RED/GREEN] backend=postgres attempts=${initialAttempts + 4} `
      + `accepted=${acceptedAfterDrain} timed_out=${timedOutAfterDrain} refused_busy=4 `
      + `inflight=${occupancy.inFlight} `
      + `active_sends=${occupancy.activeSends} queued=${occupancy.queued}/${ruledQueueMaximum} `
      + `peak=${mail.peak} raw_tokens_outside_active_send=${rawTokensOutsideActiveSend} `
      + `committed_at_saturation=${committedAtSaturation.rows[0]!.count} `
      + `committed_after_drain=${committedAfterDrain.rows[0]!.count} `
      + `rss_proof=S3d_rework3_fixed_8000_refusal_plateau`
    );
    expect(acceptedAfterDrain + timedOutAfterDrain).toBe(initialAttempts);
    expect(outcomes.every((outcome) => outcome === "ALLOWED" || outcome === "AUTH_MAIL_BUSY"))
      .toBe(true);
    expect(Number(committedAfterDrain.rows[0]!.count)).toBe(acceptedAfterDrain);
    expect(mail.active.size).toBe(0);
    expect(pending.size).toBe(0);
    expect(flow.service.mailDispatchOccupancy()).toEqual({
      inFlight: 0,
      activeSends: 0,
      maximum: ruledMaximum,
      queued: 0,
      maximumQueued: ruledQueueMaximum
    });
  }, 180_000);

  it("S3d rework3 B2 calibrates each same-arm null at the scored n-v-n group size", () => {
    const scoredGroupSize = 16;
    const nullControl = sameArmRelabelingNull(
      Array.from({ length: scoredGroupSize }, (_, index) => index),
      scoredGroupSize,
      0x3d20
    );
    expect(nullControl.groupSize).toBe(scoredGroupSize);
  });

  it("S3d rework4 proves capacity-refusal retention is N-independent by heap shape", async () => {
    const retainOneObjectPerRefusal = process.env.S3D_RETAIN_ONE_OBJECT_PER_REFUSAL === "1";
    class HangingMailSender implements MailSender {
      private readonly releases: Array<() => void> = [];
      private passThrough = false;
      active = 0;

      async sendVerification(): Promise<void> {
        this.active += 1;
        if (!this.passThrough) {
          await new Promise<void>((resolve) => this.releases.push(resolve));
        }
        this.active -= 1;
      }

      releaseAll(): void {
        this.passThrough = true;
        for (const release of this.releases.splice(0)) release();
      }
    }

    const mail = new HangingMailSender();
    const flow = buildService({ mail, sleep: async () => undefined });
    const capacityError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const saturationCount = basePolicy.channel.maxConcurrentVerificationDispatches
      + basePolicy.channel.maxQueuedVerificationDispatches;
    const saturation = Array.from({ length: saturationCount }, (_, index) =>
      flow.service.register({
        email: `s3d-retained-saturation-${index}@example.test`,
        password: "correct horse battery staple",
        recoveryEmail: `s3d-retained-saturation-${index}-recovery@example.test`,
        adultAffirmed: true
      }, {
        ip: `2001:db8:3d:4e::${index + 1}`,
        userAgent: "vitest-s3d-retained-saturation",
        requestId: `request:s3d:retained:saturation:${index}`
      }).catch(() => undefined)
    );
    const saturationStartedAt = performance.now();
    while (flow.service.mailDispatchOccupancy().queued
      !== basePolicy.channel.maxQueuedVerificationDispatches || mail.active
      !== basePolicy.channel.maxConcurrentVerificationDispatches) {
      if (performance.now() - saturationStartedAt > 60_000) {
        throw new Error(`S3D_RETAINED_SATURATION_TIMEOUT:${JSON.stringify(
          flow.service.mailDispatchOccupancy()
        )}`);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }

    const inspectedService = flow.service as unknown as {
      signalMailCapacity(correlationId: string): void;
      s3dRetainedRefusalObjects?: Array<Readonly<{
        s3dRetainedRefusalMarker: true;
        refusalIndex: number;
      }>>;
    };
    const originalSignalMailCapacity = inspectedService.signalMailCapacity.bind(flow.service);
    const retainedRefusalObjects: Array<Readonly<{
      s3dRetainedRefusalMarker: true;
      refusalIndex: number;
    }>> = [];
    if (retainOneObjectPerRefusal) {
      inspectedService.s3dRetainedRefusalObjects = retainedRefusalObjects;
      inspectedService.signalMailCapacity = (correlationId: string) => {
        retainedRefusalObjects.push(Object.freeze({
          s3dRetainedRefusalMarker: true,
          refusalIndex: retainedRefusalObjects.length
        }));
        originalSignalMailCapacity(correlationId);
      };
    }

    const captureShapes = async (label: string): Promise<RetainedDispatcherShapeCounts> => {
      await forceGarbageCollection();
      const snapshotPath = join(
        secretRoot, `s3d-retained-${label}-${randomUUID()}.heapsnapshot`
      );
      writeHeapSnapshot(snapshotPath);
      const counts = await retainedDispatcherShapeCounts(snapshotPath);
      await rm(snapshotPath, { force: true });
      return counts;
    };
    const refuseThrough = async (start: number, end: number): Promise<void> => {
      let busy = 0;
      for (let index = start; index < end; index += 1) {
        try {
          await flow.service.register({
            email: `s3d-retained-refusal-${index}@example.test`,
            password: "correct horse battery staple",
            recoveryEmail: `s3d-retained-refusal-${index}-recovery@example.test`,
            adultAffirmed: true
          }, {
            ip: `2001:db8:3d:4f::${(index % 512) + 1}`,
            userAgent: "vitest-s3d-retained-refusal",
            requestId: `request:s3d:retained:refusal:${index}`
          });
        } catch (error) {
          if ((error as { code?: string }).code === "AUTH_MAIL_BUSY") busy += 1;
        }
      }
      expect(busy).toBe(end - start);
    };

    const rawBaseline = await captureShapes("baseline");
    await refuseThrough(0, 500);
    const rawAt500 = await captureShapes("n500");
    const occupancyAt500 = limiterMemoryOccupancy(flow.limiter).occupiedSlots;
    await refuseThrough(500, 4_000);
    const rawAt4000 = await captureShapes("n4000");
    const occupancyAt4000 = limiterMemoryOccupancy(flow.limiter).occupiedSlots;

    inspectedService.signalMailCapacity = originalSignalMailCapacity;
    delete inspectedService.s3dRetainedRefusalObjects;
    flow.service.drainMailCapacitySignals();
    const capacitySignals = capacityError.mock.calls.map(([message]) => String(message));
    const capacityCounts = capacitySignals.flatMap((signal) => {
      const match = / count=(\d+)$/.exec(signal);
      return match === null ? [] : [Number(match[1])];
    });
    mail.releaseAll();
    await Promise.all(saturation);
    await flow.service.drainMailDispatches();
    capacityError.mockRestore();

    const rateLimitRow = AUTH_POLICY_REGISTER_ROWS.find(
      (row) => row.rowKey === "rateLimitPolicy"
    )!;
    const retainedObjectsPerOccupiedSlot = (rateLimitRow.value as {
      sketch_design: { flat_storage: { retained_objects_per_occupied_slot: number } };
    }).sketch_design.flat_storage.retained_objects_per_occupied_slot;
    const channelRow = AUTH_POLICY_REGISTER_ROWS.find(
      (row) => row.rowKey === "channelPolicy"
    )!;
    const maximumRetainedAggregates = (channelRow.value as {
      verification_dispatch: { operator_signal: { maximum_retained_aggregates: number } };
    }).verification_dispatch.operator_signal.maximum_retained_aggregates;
    // The post-saturation baseline gives the ambient collision count for each
    // stable shape. Its dispatcher queue contribution is independently known
    // from the live occupancy (96), so subtract only ambient lookalikes rather
    // than pretending a property-name shape is globally unique.
    const ambient = Object.freeze({
      queueNodes: rawBaseline.queueNodes - basePolicy.channel.maxQueuedVerificationDispatches,
      refusalAggregates: rawBaseline.refusalAggregates,
      mailCapacityAggregates: rawBaseline.mailCapacityAggregates,
      positiveControlObjects: rawBaseline.positiveControlObjects
    });
    const normalise = (raw: RetainedDispatcherShapeCounts): RetainedDispatcherShapeCounts => {
      const counts = {
        queueNodes: raw.queueNodes - ambient.queueNodes,
        refusalAggregates: raw.refusalAggregates - ambient.refusalAggregates,
        mailCapacityAggregates: raw.mailCapacityAggregates - ambient.mailCapacityAggregates,
        positiveControlObjects: raw.positiveControlObjects - ambient.positiveControlObjects
      };
      return Object.freeze({
        ...counts,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0)
      });
    };
    const baseline = normalise(rawBaseline);
    const at500 = normalise(rawAt500);
    const at4000 = normalise(rawAt4000);
    const boundAt500 = basePolicy.channel.maxQueuedVerificationDispatches
      + retainedObjectsPerOccupiedSlot * occupancyAt500 + maximumRetainedAggregates;
    const boundAt4000 = basePolicy.channel.maxQueuedVerificationDispatches
      + retainedObjectsPerOccupiedSlot * occupancyAt4000 + maximumRetainedAggregates;
    console.info(
      `[S3d REWORK4 N-INDEPENDENT RETAINED OBJECTS] backend=postgres `
      + `positive_control=${retainOneObjectPerRefusal} `
      + `retained_objects_per_occupied_slot=${retainedObjectsPerOccupiedSlot} `
      + `maximum_retained_aggregates=${maximumRetainedAggregates} `
      + `ambient=${JSON.stringify(ambient)} `
      + `baseline=${JSON.stringify(baseline)} `
      + `n500=${JSON.stringify(at500)} occupied_slots_500=${occupancyAt500} bound_500=${boundAt500} `
      + `n4000=${JSON.stringify(at4000)} occupied_slots_4000=${occupancyAt4000} `
      + `bound_4000=${boundAt4000} capacity_count=${capacityCounts.reduce(
        (sum, count) => sum + count, 0
      )}`
    );
    expect(baseline).toEqual({
      queueNodes: basePolicy.channel.maxQueuedVerificationDispatches,
      refusalAggregates: 0,
      mailCapacityAggregates: 0,
      positiveControlObjects: 0,
      total: basePolicy.channel.maxQueuedVerificationDispatches
    });
    if (retainOneObjectPerRefusal) {
      expect(at4000.positiveControlObjects - at500.positiveControlObjects).toBe(3_500);
    }
    expect(at500.total).toBe(at4000.total);
    expect(at500).toEqual(at4000);
    expect(at4000).toEqual({
      queueNodes: basePolicy.channel.maxQueuedVerificationDispatches,
      refusalAggregates: 0,
      mailCapacityAggregates: maximumRetainedAggregates,
      positiveControlObjects: 0,
      total: basePolicy.channel.maxQueuedVerificationDispatches + maximumRetainedAggregates
    });
    expect(at500.total).toBeLessThanOrEqual(boundAt500);
    expect(at4000.total).toBeLessThanOrEqual(boundAt4000);
    expect(capacityCounts.reduce((sum, count) => sum + count, 0)).toBe(4_000);
  }, 180_000);

  it("S3d rework3 B1/B3 probes deep-queue slack and the following audit window", async () => {
    const ruledTransportTimeoutMs = basePolicy.channel.transportTimeoutMs;
    const ruledSlackMs = basePolicy.channel.mailDispatchPreTransportWorkBudgetMs;
    const maximum = basePolicy.channel.maxConcurrentVerificationDispatches;
    const deepSamplesPerArm = maximum / 2;

    type Release = () => Promise<void>;
    type DispatchRecord = {
      readonly activatedAt: number;
      releaseInvokedAfterMs?: number;
      handoffAfterMs?: number;
    };
    type ReservationState = Readonly<{
      inFlight: number;
      queued: number;
      legacyPrehashPredicate: boolean;
    }>;
    type InstrumentedDispatcher = {
      activateMailDispatch(enforceMinimum?: boolean, minimumReservationMs?: number): Release;
      reserveMailDispatch(correlationId: string): Promise<Release>;
      reserveMailDispatchPermit(
        correlationId: string,
        minimumReservationMs?: number,
        activationSpacingMs?: number
      ): Promise<() => Promise<Release>>;
    };

    class RuledTimeoutMailSender implements MailSender {
      readonly sentRecipients: string[] = [];
      delayTargets = false;

      async sendVerification(mail: VerificationMail): Promise<void> {
        this.sentRecipients.push(mail.recipient);
        if (this.delayTargets && mail.recipient.includes("-timeout-target-")) {
          await new Promise<void>((resolve) => setTimeout(resolve, ruledTransportTimeoutMs));
        }
      }
    }

    const instrument = (service: RegistrationService) => {
      const inspected = service as unknown as InstrumentedDispatcher;
      const originalActivate = inspected.activateMailDispatch.bind(service);
      const originalPermit = inspected.reserveMailDispatchPermit.bind(service);
      const records: DispatchRecord[] = [];
      let reservationCapture: ReservationState[] | undefined;
      inspected.activateMailDispatch = (enforceMinimum = false, minimumReservationMs?: number) => {
        const record: DispatchRecord = { activatedAt: performance.now() };
        records.push(record);
        const release = originalActivate(enforceMinimum, minimumReservationMs);
        let completion: Promise<void> | undefined;
        return () => {
          if (completion !== undefined) return completion;
          record.releaseInvokedAfterMs = performance.now() - record.activatedAt;
          completion = release().finally(() => {
            record.handoffAfterMs = performance.now() - record.activatedAt;
          });
          return completion;
        };
      };
      const captureReservation = () => {
        if (reservationCapture !== undefined) {
          const occupancy = service.mailDispatchOccupancy();
          reservationCapture.push(Object.freeze({
            inFlight: occupancy.inFlight,
            queued: occupancy.queued,
            legacyPrehashPredicate: occupancy.inFlight < maximum
              || occupancy.queued < maximum
          }));
        }
      };
      inspected.reserveMailDispatchPermit = (
        correlationId: string,
        minimumReservationMs?: number,
        activationSpacingMs?: number
      ) => {
        captureReservation();
        return originalPermit(correlationId, minimumReservationMs, activationSpacingMs);
      };
      return Object.freeze({
        inspected,
        records,
        captureReservations(states: ReservationState[] | undefined) {
          reservationCapture = states;
        }
      });
    };

    const waitFor = async (
      service: RegistrationService,
      predicate: () => boolean,
      label: string,
      timeoutMs = 90_000
    ): Promise<void> => {
      const startedAt = performance.now();
      while (!predicate()) {
        if (performance.now() - startedAt > timeoutMs) {
          throw new Error(`S3D_R3_WAIT_TIMEOUT:${label}:${JSON.stringify(
            service.mailDispatchOccupancy()
          )}`);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
    };

    const registerInput = (email: string) => ({
      email,
      password: "correct horse battery staple",
      recoveryEmail: email.replace("@", "-recovery@"),
      adultAffirmed: true
    });
    const requestSource = (label: string, index: number) => ({
      ip: `2001:db8:3d:${(label.length + index).toString(16)}::${index + 1}`,
      userAgent: `vitest-s3d-r3-${label}`,
      requestId: `request:s3d:r3:${label}:${index}`
    });
    const seedAccounts = async (
      flow: ReturnType<typeof buildService>,
      emails: readonly string[],
      label: string
    ): Promise<void> => {
      for (let offset = 0; offset < emails.length; offset += 16) {
        await Promise.all(emails.slice(offset, offset + 16).map((email, batchIndex) =>
          flow.service.register(
            registerInput(email),
            requestSource(`${label}-seed`, offset + batchIndex)
          )
        ));
        await flow.service.drainMailDispatches();
      }
    };

    type DeepArm = Readonly<{
      intervals: readonly number[];
      releaseInvocation: readonly number[];
      nonTransportWork: readonly number[];
      reservationStates: readonly ReservationState[];
    }>;
    const runDeepRoute = async (
      route: "register" | "resend",
      samplesPerArm: number
    ): Promise<Readonly<{
      existing: DeepArm;
      missing: DeepArm;
      intervalLocalSends: number;
    }>> => {
      const mail = new RuledTimeoutMailSender();
      const flow = buildService({ mail });
      const dispatch = instrument(flow.service);
      const existingRegister = `s3d-r3-b1-${route}-existing@example.test`;
      const samples = samplesPerArm * 2;
      const targetArms = Array.from({ length: samples }, (_, index) =>
        index % 2 === 0 ? "existing" as const : "missing" as const
      );
      const resendTargets = Array.from({ length: samplesPerArm }, (_, index) =>
        `s3d-r3-b1-${route}-timeout-target-${index}@example.test`
      );
      const resendMarkers = Array.from({ length: samples }, (_, index) =>
        `s3d-r3-b1-${route}-marker-${index}@example.test`
      );
      await seedAccounts(flow, [existingRegister, ...resendTargets, ...resendMarkers], route);
      flow.advance(basePolicy.verification.resendCooldownMs);
      mail.sentRecipients.length = 0;
      mail.delayTargets = true;

      const active = await Promise.all(Array.from({ length: maximum }, (_, index) =>
        dispatch.inspected.reserveMailDispatch(`s3d-r3-b1:${route}:active:${index}`)
      ));
      const dummyPromises = Array.from({ length: maximum }, (_, index) =>
        dispatch.inspected.reserveMailDispatch(`s3d-r3-b1:${route}:dummy:${index}`)
      );
      await waitFor(flow.service, () => flow.service.mailDispatchOccupancy().queued === maximum,
        `${route}:dummy-queued`);

      const reservationStates: ReservationState[] = [];
      dispatch.captureReservations(reservationStates);
      const targetCalls: Array<Promise<unknown>> = [];
      const nextTarget = { existing: 0, missing: 0 };
      for (let sequence = 0; sequence < samples; sequence += 1) {
        const arm = targetArms[sequence]!;
        const index = nextTarget[arm];
        nextTarget[arm] += 1;
        const email = route === "register"
          ? (arm === "existing"
              ? existingRegister
              : `s3d-r3-b1-${route}-${arm}-timeout-target-${index}@example.test`)
          : (arm === "existing"
              ? resendTargets[index]!
              : `s3d-r3-b1-${route}-${arm}-timeout-target-${index}@example.test`);
        targetCalls.push(route === "register"
          ? flow.service.register(registerInput(email), requestSource(`${route}-${arm}-target`, index))
          : flow.service.resendVerification(
            { email }, requestSource(`${route}-${arm}-target`, index)
          ));
        await waitFor(flow.service, () => reservationStates.length === sequence + 1,
          `${route}:${arm}:target-reservation:${index}`);
      }
      dispatch.captureReservations(undefined);
      await waitFor(flow.service,
        () => flow.service.mailDispatchOccupancy().queued === maximum + samples,
        `${route}:targets-queued`);

      const markerCalls: Array<Promise<unknown>> = [];
      for (let sequence = 0; sequence < samples; sequence += 1) {
        const arm = targetArms[sequence]!;
        markerCalls.push(route === "register"
          ? flow.service.register(
            registerInput(`s3d-r3-b1-${route}-${arm}-marker-${sequence}@example.test`),
            requestSource(`${route}-${arm}-marker`, sequence)
          )
          : flow.service.resendVerification(
            { email: resendMarkers[sequence]! },
            requestSource(`${route}-${arm}-marker`, sequence)
          ));
        await waitFor(flow.service,
          () => flow.service.mailDispatchOccupancy().queued === maximum + samples + sequence + 1,
          `${route}:${arm}:marker-queued:${sequence}`);
      }
      await waitFor(flow.service,
        () => flow.service.mailDispatchOccupancy().queued === maximum + samples * 2,
        `${route}:markers-queued`);

      await Promise.all(active.map((release) => release()));
      const dummyReleases = await Promise.all(dummyPromises);
      const targetRecordStart = dispatch.records.length;
      await Promise.all(dummyReleases.slice(0, samples).map((release) => release()));
      await waitFor(flow.service,
        () => dispatch.records.length >= targetRecordStart + samples * 2,
        `${route}:marker-grants`);
      const targetRecords = dispatch.records.slice(targetRecordStart, targetRecordStart + samples);
      await Promise.all(targetCalls);
      await Promise.all(markerCalls);
      await Promise.all(dummyReleases.slice(samples).map((release) => release()));
      await flow.service.drainMailDispatches();
      expect(flow.service.mailDispatchOccupancy().inFlight).toBe(0);

      const armMeasurement = (arm: "existing" | "missing"): DeepArm => {
        const indexes = targetArms.flatMap((targetArm, index) => targetArm === arm ? [index] : []);
        const records = indexes.map((index) => targetRecords[index]!);
        return Object.freeze({
          intervals: Object.freeze(records.map((record) => record.handoffAfterMs!)),
          releaseInvocation: Object.freeze(
            records.map((record) => record.releaseInvokedAfterMs!)
          ),
          nonTransportWork: Object.freeze(records.map((record) =>
            record.releaseInvokedAfterMs! - basePolicy.channel.mailDispatchNoSendEqualWorkMs
          )),
          reservationStates: Object.freeze(indexes.map((index) => reservationStates[index]!))
        });
      };
      return Object.freeze({
        existing: armMeasurement("existing"),
        missing: armMeasurement("missing"),
        intervalLocalSends: mail.sentRecipients.length
      });
    };

    const deepMeasurements: string[] = [];
    const deepAssertions: Array<Readonly<{
      route: "register" | "resend";
      arm: "existing" | "missing";
      maximumNonTransportWork: number;
      states: readonly ReservationState[];
    }>> = [];
    const separationAssertions: Array<Readonly<{
      route: "register" | "resend";
      auc: number;
      aucCeiling: number;
      classifier: number;
      classifierCeiling: number;
    }>> = [];
    for (const route of ["register", "resend"] as const) {
      const { existing, missing, intervalLocalSends } = await runDeepRoute(
        route, deepSamplesPerArm
      );
      const auc = aucSeparability(existing.intervals, missing.intervals);
      const classifier = bestSingleThresholdClassifierAccuracy(
        existing.intervals, missing.intervals
      );
      const existingNull = sameArmRelabelingNull(
        existing.intervals, deepSamplesPerArm, 0x3d31
      );
      const missingNull = sameArmRelabelingNull(
        missing.intervals, deepSamplesPerArm, 0x3d32
      );
      const aucCeiling = empiricalQuantile([...existingNull.auc, ...missingNull.auc], 0.99);
      const classifierCeiling = empiricalQuantile(
        [...existingNull.classifier, ...missingNull.classifier], 0.99
      );
      for (const [arm, measurement] of Object.entries({ existing, missing }) as Array<
        ["existing" | "missing", DeepArm]
      >) {
        deepAssertions.push(Object.freeze({
          route,
          arm,
          maximumNonTransportWork: Math.max(...measurement.nonTransportWork),
          states: measurement.reservationStates
        }));
      }
      separationAssertions.push(Object.freeze({
        route, auc, aucCeiling, classifier, classifierCeiling
      }));
      deepMeasurements.push(
        `${route}:n=${deepSamplesPerArm} existing_interval_median_ms=${median(existing.intervals).toFixed(1)} `
        + `missing_interval_median_ms=${median(missing.intervals).toFixed(1)} `
        + `existing_release_invocation_max_ms=${Math.max(...existing.releaseInvocation).toFixed(1)} `
        + `missing_release_invocation_max_ms=${Math.max(...missing.releaseInvocation).toFixed(1)} `
        + `existing_nontransport_max_ms=${Math.max(...existing.nonTransportWork).toFixed(1)} `
        + `missing_nontransport_max_ms=${Math.max(...missing.nonTransportWork).toFixed(1)} `
        + `cross_auc=${auc.toFixed(4)} null_auc_q99=${aucCeiling.toFixed(4)} `
        + `cross_accuracy=${classifier.toFixed(4)} null_accuracy_q99=${classifierCeiling.toFixed(4)} `
        + `interval_local_sends=${intervalLocalSends}`
      );
    }

    const runNextWindowMixedWave = async (wave: number) => {
      const samples = maximum;
      const mail = new RuledTimeoutMailSender();
      const flow = buildService({ mail });
      const dispatch = instrument(flow.service);
      const targetArms = Array.from({ length: samples }, (_, index) =>
        (index + wave) % 2 === 0 ? "existing" as const : "missing" as const
      );
      const targets = Array.from({ length: samples }, (_, index) =>
        `s3d-r3-b3-wave-${wave}-timeout-target-${index}@example.test`
      );
      await seedAccounts(
        flow,
        targets.filter((_, index) => targetArms[index] === "existing"),
        `b3-mixed-${wave}`
      );
      flow.advance(basePolicy.verification.resendCooldownMs);
      mail.sentRecipients.length = 0;
      mail.delayTargets = true;

      const active = await Promise.all(Array.from({ length: maximum }, (_, index) =>
        dispatch.inspected.reserveMailDispatch(`s3d-r3-b3:${wave}:active:${index}`)
      ));
      const dummyPromises = Array.from({ length: maximum }, (_, index) =>
        dispatch.inspected.reserveMailDispatch(`s3d-r3-b3:${wave}:dummy:${index}`)
      );
      await waitFor(flow.service, () => flow.service.mailDispatchOccupancy().queued === maximum,
        `b3:${wave}:dummy-queued`);
      const targetCalls = targets.map((email, index) => flow.service.resendVerification(
        { email },
        requestSource(`b3-${wave}-${targetArms[index]}-target`, index)
      ));
      await waitFor(flow.service,
        () => flow.service.mailDispatchOccupancy().queued === maximum * 2,
        `b3:${wave}:targets-queued`);
      const markerCalls = Array.from({ length: samples }, (_, index) => flow.service.register(
        registerInput(`s3d-r3-b3-${wave}-audit-marker-${index}@example.test`),
        requestSource(`b3-${wave}-marker`, index)
      ));
      await waitFor(flow.service,
        () => flow.service.mailDispatchOccupancy().queued === maximum * 3,
        `b3:${wave}:markers-queued`);

      await Promise.all(active.map((release) => release()));
      const dummyReleases = await Promise.all(dummyPromises);
      const targetRecordStart = dispatch.records.length;
      await Promise.all(dummyReleases.map((release) => release()));
      await waitFor(flow.service,
        () => dispatch.records.length >= targetRecordStart + samples,
        `b3:${wave}:target-grants`);
      const marker2Promises = Array.from({ length: samples }, (_, index) =>
        dispatch.inspected.reserveMailDispatch(`s3d-r3-b3:${wave}:marker2:${index}`)
      );
      expect(marker2Promises).toHaveLength(samples);
      await waitFor(flow.service,
        () => flow.service.mailDispatchOccupancy().queued >= maximum,
        `b3:${wave}:marker2-queued`);
      const markerRecordStart = targetRecordStart + samples;
      await waitFor(flow.service,
        () => dispatch.records.length >= markerRecordStart + samples * 2,
        `b3:${wave}:second-handoff`, 180_000);
      const markerRecords = dispatch.records.slice(markerRecordStart, markerRecordStart + samples);
      const marker2Releases = await Promise.all(marker2Promises);
      await Promise.all(targetCalls);
      await Promise.all(markerCalls);
      await Promise.all(marker2Releases.map((release) => release()));
      await flow.service.drainMailDispatches();
      expect(flow.service.mailDispatchOccupancy().inFlight).toBe(0);
      return Object.freeze({
        existing: Object.freeze(markerRecords.flatMap((record, index) =>
          targetArms[index] === "existing" ? [record.handoffAfterMs!] : []
        )),
        missing: Object.freeze(markerRecords.flatMap((record, index) =>
          targetArms[index] === "missing" ? [record.handoffAfterMs!] : []
        )),
        sends: mail.sentRecipients.length
      });
    };

    const nextWaves = [
      await runNextWindowMixedWave(0),
      await runNextWindowMixedWave(1)
    ];
    const nextExisting = nextWaves.flatMap((wave) => wave.existing);
    const nextMissing = nextWaves.flatMap((wave) => wave.missing);
    const nextAuc = aucSeparability(nextExisting, nextMissing);
    const nextClassifier = bestSingleThresholdClassifierAccuracy(
      nextExisting, nextMissing
    );
    const nextExistingNull = sameArmRelabelingNull(
      nextExisting, maximum, 0x3d41
    );
    const nextMissingNull = sameArmRelabelingNull(nextMissing, maximum, 0x3d42);
    const nextAucCeiling = empiricalQuantile(
      [...nextExistingNull.auc, ...nextMissingNull.auc], 0.99
    );
    const nextClassifierCeiling = empiricalQuantile(
      [...nextExistingNull.classifier, ...nextMissingNull.classifier], 0.99
    );

    console.info(
      `[S3d REWORK3 DEEP-QUEUE B1 RED/GREEN] backend=postgres production_policy=true `
      + `transport_ms=${ruledTransportTimeoutMs} depth_at_entry_gte=${maximum} `
      + `ruled_nontransport_slack_ms=${ruledSlackMs} ${deepMeasurements.join(" | ")}`
    );
    console.info(
      `[S3d REWORK3 B3 NEXT-WINDOW RED/GREEN] backend=postgres production_policy=true `
      + `n=${maximum} interleaved_arms=true `
      + `existing_median_ms=${median(nextExisting).toFixed(1)} `
      + `missing_median_ms=${median(nextMissing).toFixed(1)} `
      + `cross_auc=${nextAuc.toFixed(4)} null_auc_q99=${nextAucCeiling.toFixed(4)} `
      + `cross_accuracy=${nextClassifier.toFixed(4)} `
      + `null_accuracy_q99=${nextClassifierCeiling.toFixed(4)} `
      + `mixed_wave_sends=${nextWaves.map((wave) => wave.sends).join("/")}`
    );
    expect(ruledSlackMs).toBe(
      basePolicy.verification.enumerationResponseFloorMs
      + basePolicy.verification.enumerationToleranceMs
    );
    for (const assertion of deepAssertions) {
      expect(assertion.states).toHaveLength(deepSamplesPerArm);
      expect(assertion.states.every((state) => state.inFlight === maximum
        && state.queued >= maximum && state.legacyPrehashPredicate === false)).toBe(true);
      expect(assertion.maximumNonTransportWork).toBeLessThanOrEqual(ruledSlackMs);
    }
    for (const assertion of separationAssertions) {
      expect(assertion.auc).toBeLessThanOrEqual(assertion.aucCeiling);
      expect(assertion.classifier).toBeLessThanOrEqual(assertion.classifierCeiling);
    }
    expect(nextWaves.every((wave) => wave.sends === maximum + maximum / 2)).toBe(true);
    expect(nextAuc).toBeLessThanOrEqual(nextAucCeiling);
    expect(nextClassifier).toBeLessThanOrEqual(nextClassifierCeiling);
  }, 900_000);

  it("S3d rework2 B1 closes grant-to-grant admission at the ruled transport timeout", async () => {
    const samplesPerArm = 16;
    const ruledTransportTimeoutMs = basePolicy.channel.transportTimeoutMs;
    const nullQuantile = 0.99;
    class BoundaryMailSender implements MailSender {
      readonly active = new Map<string, VerificationMail>();
      readonly sentRecipients: string[] = [];
      private readonly releases = new Map<string, () => void>();
      private holdDispatches = false;

      startRound(): void {
        this.sentRecipients.length = 0;
        this.holdDispatches = true;
      }

      async sendVerification(mail: VerificationMail): Promise<void> {
        this.sentRecipients.push(mail.recipient);
        this.active.set(mail.attemptId, mail);
        if (this.holdDispatches && mail.recipient.includes("-timeout-target-")) {
          await new Promise<void>((resolve) => setTimeout(resolve, ruledTransportTimeoutMs));
        } else if (this.holdDispatches
          && (mail.recipient.includes("-filler-") || mail.recipient.includes("-marker-"))) {
          await new Promise<void>((resolve) => this.releases.set(mail.attemptId, resolve));
        }
        this.releases.delete(mail.attemptId);
        this.active.delete(mail.attemptId);
      }

      releaseHolders(count: number): void {
        const holders = [...this.releases.values()].slice(0, count);
        expect(holders).toHaveLength(count);
        for (const release of holders) release();
      }

      releaseAllAndPassThrough(): void {
        this.holdDispatches = false;
        for (const release of [...this.releases.values()]) release();
      }
    }

    const mail = new BoundaryMailSender();
    const balancingMail = new BoundaryMailSender();
    const flow = buildService({ mail });
    const balancingFlow = buildService({ mail: balancingMail });
    const instrumentedService = flow.service as unknown as {
      activateMailDispatch(
        enforceMinimum?: boolean,
        minimumReservationMs?: number
      ): () => Promise<void>;
    };
    const activateMailDispatch = instrumentedService.activateMailDispatch.bind(flow.service);
    let capturedGrantTimes: number[] | undefined;
    instrumentedService.activateMailDispatch = (
      enforceMinimum = false,
      minimumReservationMs?: number
    ) => {
      capturedGrantTimes?.push(performance.now());
      return activateMailDispatch(enforceMinimum, minimumReservationMs);
    };
    const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
      const startedAt = performance.now();
      while (!predicate()) {
        if (performance.now() - startedAt > 45_000) {
          throw new Error(`S3D_BOUNDARY_WAIT_TIMEOUT:${label}:${JSON.stringify(
            flow.service.mailDispatchOccupancy()
          )}`);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
    };
    const registerInput = (email: string) => ({
      email,
      password: "correct horse battery staple",
      recoveryEmail: email.replace("@", "-recovery@"),
      adultAffirmed: true
    });
    const requestSource = (route: "register" | "resend", arm: string, index: number) => ({
      ip: `2001:db8:${route === "register" ? "3e" : "3f"}:${arm.length}::${index + 1}`,
      userAgent: `vitest-s3d-boundary-${route}-${arm}`,
      requestId: `request:s3d:boundary:${route}:${arm}:${index}`
    });

    const registerSeed = "s3d-boundary-register-existing@example.test";
    const resendTargetSeeds = Array.from(
      { length: samplesPerArm },
      (_, index) => `s3d-boundary-resend-timeout-target-${index}@example.test`
    );
    const resendBalanceSeeds = Array.from(
      { length: samplesPerArm },
      (_, index) => `s3d-boundary-resend-balance-control-${index}@example.test`
    );
    const resendMarkerSeeds = Array.from(
      { length: samplesPerArm * 2 },
      (_, index) => `s3d-boundary-resend-marker-existing-${index}@example.test`
    );
    await flow.service.register(registerInput(registerSeed), requestSource("register", "seed", 0));
    const resendSeeds = [...resendTargetSeeds, ...resendBalanceSeeds, ...resendMarkerSeeds];
    for (let offset = 0; offset < resendSeeds.length; offset += 24) {
      await Promise.all(resendSeeds.slice(offset, offset + 24).map((email, batchIndex) => {
        const index = offset + batchIndex;
        return flow.service.register(registerInput(email), {
        ip: `2001:db8:3d:5eed::${index + 1}`,
        userAgent: "vitest-s3d-boundary-seed",
        requestId: `request:s3d:boundary:seed:${index}`
        });
      }));
      await flow.service.drainMailDispatches();
    }
    flow.advance(basePolicy.verification.resendCooldownMs);
    balancingFlow.advance(basePolicy.verification.resendCooldownMs);

    type ArmMeasurement = {
      grantIntervals: number[];
      sendsInWindow: number;
    };
    let round = 0;
    const runRoute = async (route: "register" | "resend"): Promise<Readonly<{
      existing: ArmMeasurement;
      missing: ArmMeasurement;
    }>> => {
      round += 1;
      mail.startRound();
      balancingMail.sentRecipients.length = 0;
      const prefix = `s3d-boundary-r${round}-${route}`;
      const fillers = Array.from({ length: basePolicy.channel.maxConcurrentVerificationDispatches },
        (_, index) => flow.service.register(registerInput(`${prefix}-filler-${index}@example.test`), {
          ip: `2001:db8:${round.toString(16)}:f::${index + 1}`,
          userAgent: "vitest-s3d-boundary-filler",
          requestId: `request:s3d:boundary:r${round}:filler:${index}`
        }));
      await Promise.all(fillers);
      await waitFor(() => mail.active.size === basePolicy.channel.maxConcurrentVerificationDispatches,
        `${route}:fill`);

      const byArm: Record<"existing" | "missing", ArmMeasurement> = {
        existing: { grantIntervals: [], sendsInWindow: 0 },
        missing: { grantIntervals: [], sendsInWindow: 0 }
      };
      const nextSample = { existing: 0, missing: 0 };
      for (let sequence = 0; sequence < samplesPerArm * 2; sequence += 1) {
        const pair = Math.floor(sequence / 2);
        const existingFirst = pair % 2 === 0;
        const arm = (sequence % 2 === 0) === existingFirst
          ? "existing" as const
          : "missing" as const;
        const index = nextSample[arm];
        nextSample[arm] += 1;
        const targetEmail = route === "register"
          ? (arm === "existing" ? registerSeed : `${prefix}-${arm}-timeout-target-${index}@example.test`)
          : (arm === "existing" ? resendTargetSeeds[index]! : `${prefix}-${arm}-missing-target-${index}@example.test`);
        const targetCall = route === "register"
          ? flow.service.register(registerInput(targetEmail), requestSource(route, `${arm}-target`, index))
          : flow.service.resendVerification({ email: targetEmail }, requestSource(route, `${arm}-target`, index));
        await waitFor(() => flow.service.mailDispatchOccupancy().queued === 1,
          `${route}:${arm}:target-queued:${sequence}`);

        const markerEmail = route === "register"
          ? `${prefix}-${arm}-marker-${index}@example.test`
          : resendMarkerSeeds[(arm === "existing" ? 0 : samplesPerArm) + index]!;
        const markerCall = route === "register"
          ? flow.service.register(registerInput(markerEmail), requestSource(route, `${arm}-marker`, index))
          : flow.service.resendVerification({ email: markerEmail }, requestSource(route, `${arm}-marker`, index));
        await waitFor(() => flow.service.mailDispatchOccupancy().queued === 2,
          `${route}:${arm}:marker-queued:${sequence}`);

        const sendWindowStartedAt = mail.sentRecipients.length;
        const balancingSendWindowStartedAt = balancingMail.sentRecipients.length;
        const balancingCall = arm === (route === "register" ? "existing" : "missing")
          ? (route === "register"
              ? balancingFlow.service.register(
                registerInput(`${prefix}-${arm}-balance-control-${index}@example.test`),
                requestSource(route, `${arm}-balance`, index)
              )
              : balancingFlow.service.resendVerification(
                { email: resendBalanceSeeds[index]! },
                requestSource(route, `${arm}-balance`, index)
              ))
          : undefined;
        capturedGrantTimes = [];
        mail.releaseHolders(1);
        await targetCall;
        await markerCall;
        if (balancingCall !== undefined) await balancingCall;
        await balancingFlow.service.drainMailDispatches();
        await waitFor(() => mail.active.size === basePolicy.channel.maxConcurrentVerificationDispatches,
          `${route}:${arm}:chain-restored:${sequence}`);
        expect(capturedGrantTimes).toHaveLength(2);
        byArm[arm].grantIntervals.push(capturedGrantTimes[1]! - capturedGrantTimes[0]!);
        capturedGrantTimes = undefined;
        byArm[arm].sendsInWindow += mail.sentRecipients.length - sendWindowStartedAt
          + balancingMail.sentRecipients.length - balancingSendWindowStartedAt;
      }

      mail.releaseAllAndPassThrough();
      await flow.service.drainMailDispatches();
      await waitFor(() => flow.service.mailDispatchOccupancy().inFlight === 0,
        `${route}:drained`);
      return Object.freeze({ existing: byArm.existing, missing: byArm.missing });
    };

    const measurements: string[] = [];
    const assertions: Array<Readonly<{
      auc: number;
      aucCeiling: number;
      classifier: number;
      classifierCeiling: number;
    }>> = [];
    for (const route of ["register", "resend"] as const) {
      const { existing, missing } = await runRoute(route);
      const auc = aucSeparability(existing.grantIntervals, missing.grantIntervals);
      const classifier = bestSingleThresholdClassifierAccuracy(
        existing.grantIntervals, missing.grantIntervals
      );
      const existingNull = sameArmRelabelingNull(
        existing.grantIntervals, samplesPerArm, 0x3d01
      );
      const missingNull = sameArmRelabelingNull(
        missing.grantIntervals, samplesPerArm, 0x3d02
      );
      const nullAucValues = [...existingNull.auc, ...missingNull.auc];
      const nullClassifierValues = [...existingNull.classifier, ...missingNull.classifier];
      const nullAucMedian = empiricalQuantile(nullAucValues, 0.5);
      const nullClassifierMedian = empiricalQuantile(nullClassifierValues, 0.5);
      const nullAuc = empiricalQuantile(nullAucValues, nullQuantile);
      const nullClassifier = empiricalQuantile(nullClassifierValues, nullQuantile);
      measurements.push(
        `${route}:n=${samplesPerArm} existing_grant_interval_median_ms=${median(existing.grantIntervals).toFixed(1)} `
        + `missing_grant_interval_median_ms=${median(missing.grantIntervals).toFixed(1)} `
        + `cross_auc=${auc.toFixed(4)} null_auc_q99=${nullAuc.toFixed(4)} `
        + `derived_auc_tolerance=${(nullAuc - nullAucMedian).toFixed(4)} `
        + `cross_accuracy=${classifier.toFixed(4)} null_accuracy_q99=${nullClassifier.toFixed(4)} `
        + `derived_accuracy_tolerance=${(nullClassifier - nullClassifierMedian).toFixed(4)} `
        + `in_window_sends_existing=${existing.sendsInWindow} `
        + `in_window_sends_missing=${missing.sendsInWindow}`
      );
      expect(existing.sendsInWindow).toBe(missing.sendsInWindow);
      assertions.push({
        auc,
        aucCeiling: nullAuc,
        classifier,
        classifierCeiling: nullClassifier
      });
    }
    console.info(
      `[S3d REWORK2 B1 REAL-TIMEOUT GRANT INTERVAL] backend=postgres production_policy=true `
      + `transport_ms=${ruledTransportTimeoutMs} null_quantile=${nullQuantile} `
      + measurements.join(" | ")
    );
    for (const assertion of assertions) {
      expect(assertion.auc).toBeLessThanOrEqual(assertion.aucCeiling);
      expect(assertion.classifier).toBeLessThanOrEqual(assertion.classifierCeiling);
    }
  }, 600_000);

  it("S3d rework4 labels the shallow register handoff by the successor address arm", async () => {
    const samplesPerArm = 16;
    const ruledTransportTimeoutMs = basePolicy.channel.transportTimeoutMs;
    const nullQuantile = 0.99;
    const createOnlyDelayMs = Number(
      process.env.S3D_SUCCESSOR_CREATE_ONLY_DELAY_MS ?? "0"
    );
    const sustainedLoad = process.env.S3D_SUCCESSOR_SUSTAINED_LOAD === "1";
    expect([0, 25]).toContain(createOnlyDelayMs);
    class SuccessorBoundaryMailSender implements MailSender {
      readonly active = new Map<string, VerificationMail>();
      readonly sentRecipients: string[] = [];
      private readonly releases = new Map<string, () => void>();
      private holdDispatches = false;

      startRound(): void {
        this.sentRecipients.length = 0;
        this.holdDispatches = true;
      }

      async sendVerification(mail: VerificationMail): Promise<void> {
        this.sentRecipients.push(mail.recipient);
        this.active.set(mail.attemptId, mail);
        if (this.holdDispatches && mail.recipient.includes("-timeout-target-")) {
          await new Promise<void>((resolve) => setTimeout(resolve, ruledTransportTimeoutMs));
        } else if (this.holdDispatches
          && (mail.recipient.includes("-filler-") || mail.recipient.includes("-marker-"))) {
          await new Promise<void>((resolve) => this.releases.set(mail.attemptId, resolve));
        }
        this.releases.delete(mail.attemptId);
        this.active.delete(mail.attemptId);
      }

      releaseHolders(count: number): void {
        const holders = [...this.releases.values()].slice(0, count);
        expect(holders).toHaveLength(count);
        for (const release of holders) release();
      }

      releaseAllAndPassThrough(): void {
        this.holdDispatches = false;
        for (const release of [...this.releases.values()]) release();
      }
    }

    const mail = new SuccessorBoundaryMailSender();
    const balancingMail = new SuccessorBoundaryMailSender();
    const durableStore = new FileUserDekStore(secretRoot, loadKek(Buffer.alloc(32, 0x7d)));
    const flow = buildService({
      mail,
      dekStore: {
        async store(userId, dek) {
          if (createOnlyDelayMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, createOnlyDelayMs));
          }
          await durableStore.store(userId, dek);
        }
      }
    });
    const balancingFlow = buildService({ mail: balancingMail });
    const instrumentedService = flow.service as unknown as {
      activateMailDispatch(
        enforceMinimum?: boolean,
        minimumReservationMs?: number
      ): () => Promise<void>;
      reserveMailDispatchPermit(
        correlationId: string,
        minimumReservationMs?: number,
        activationSpacingMs?: number
      ): Promise<() => Promise<() => Promise<void>>>;
    };
    const originalActivate = instrumentedService.activateMailDispatch.bind(flow.service);
    const originalReserve = instrumentedService.reserveMailDispatchPermit.bind(flow.service);
    let capturedGrantTimes: number[] | undefined;
    let capturedPermitTimes: number[] | undefined;
    instrumentedService.activateMailDispatch = (
      enforceMinimum = false,
      minimumReservationMs?: number
    ) => {
      capturedGrantTimes?.push(performance.now());
      return originalActivate(enforceMinimum, minimumReservationMs);
    };
    instrumentedService.reserveMailDispatchPermit = (
      correlationId: string,
      minimumReservationMs?: number,
      activationSpacingMs?: number
    ) => originalReserve(correlationId, minimumReservationMs, activationSpacingMs)
      .then((activate) => {
        capturedPermitTimes?.push(performance.now());
        return activate;
      });
    const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
      const startedAt = performance.now();
      while (!predicate()) {
        if (performance.now() - startedAt > 45_000) {
          throw new Error(`S3D_SUCCESSOR_BOUNDARY_WAIT_TIMEOUT:${label}:${JSON.stringify(
            flow.service.mailDispatchOccupancy()
          )}`);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
    };
    const registerInput = (email: string) => ({
      email,
      password: "correct horse battery staple",
      recoveryEmail: email.replace("@", "-recovery@"),
      adultAffirmed: true
    });
    const source = (arm: string, index: number) => ({
      ip: `2001:db8:4d:${arm.length.toString(16)}::${index + 1}`,
      userAgent: `vitest-s3d-successor-${arm}`,
      requestId: `request:s3d:successor:${arm}:${index}`
    });
    const existingMarkers = Array.from(
      { length: samplesPerArm },
      (_, index) => `s3d-successor-register-existing-${index}@example.test`
    );
    await Promise.all(existingMarkers.map((email, index) =>
      flow.service.register(registerInput(email), source("seed", index))
    ));
    await flow.service.drainMailDispatches();
    mail.startRound();
    balancingMail.startRound();

    const fillers = Array.from({ length: basePolicy.channel.maxConcurrentVerificationDispatches },
      (_, index) => flow.service.register(
        registerInput(`s3d-successor-filler-${index}@example.test`),
        source("filler", index)
      ));
    await Promise.all(fillers);
    await waitFor(() => mail.active.size === basePolicy.channel.maxConcurrentVerificationDispatches,
      "fill");
    const hostLoad = sustainedLoad ? await startSustainedHostLoad(secretRoot) : undefined;

    type ArmMeasurement = {
      grantIntervals: number[];
      markerPermitToActivation: number[];
      sendsInWindow: number;
    };
    const byMarkerArm: Record<"existing" | "missing", ArmMeasurement> = {
      existing: { grantIntervals: [], markerPermitToActivation: [], sendsInWindow: 0 },
      missing: { grantIntervals: [], markerPermitToActivation: [], sendsInWindow: 0 }
    };
    const nextSample = { existing: 0, missing: 0 };
    for (let sequence = 0; sequence < samplesPerArm * 2; sequence += 1) {
      const pair = Math.floor(sequence / 2);
      const existingFirst = pair % 2 === 0;
      const markerArm = (sequence % 2 === 0) === existingFirst
        ? "existing" as const
        : "missing" as const;
      const index = nextSample[markerArm];
      nextSample[markerArm] += 1;
      const targetEmail = `s3d-successor-${markerArm}-timeout-target-${index}@example.test`;
      const targetCall = flow.service.register(
        registerInput(targetEmail), source(`${markerArm}-target`, index)
      );
      await waitFor(() => flow.service.mailDispatchOccupancy().queued === 1,
        `${markerArm}:target-queued:${sequence}`);

      const markerEmail = markerArm === "existing"
        ? existingMarkers[index]!
        : `s3d-successor-missing-marker-${index}@example.test`;
      const markerCall = flow.service.register(
        registerInput(markerEmail), source(`${markerArm}-marker`, index)
      );
      await waitFor(() => flow.service.mailDispatchOccupancy().queued === 2,
        `${markerArm}:marker-queued:${sequence}`);

      const sendWindowStartedAt = mail.sentRecipients.length;
      const balancingSendWindowStartedAt = balancingMail.sentRecipients.length;
      const balancingCall = markerArm === "existing"
        ? balancingFlow.service.register(
          registerInput(`s3d-successor-balance-${index}@example.test`),
          source("balance", index)
        )
        : undefined;
      capturedGrantTimes = [];
      capturedPermitTimes = [];
      mail.releaseHolders(1);
      await targetCall;
      await markerCall;
      await waitFor(
        () => mail.sentRecipients.length - sendWindowStartedAt
          >= (markerArm === "missing" ? 2 : 1),
        `${markerArm}:scored-sends:${sequence}`
      );
      if (balancingCall !== undefined) await balancingCall;
      await balancingFlow.service.drainMailDispatches();
      expect(capturedGrantTimes).toHaveLength(2);
      expect(capturedPermitTimes).toHaveLength(2);
      byMarkerArm[markerArm].grantIntervals.push(
        capturedGrantTimes[1]! - capturedGrantTimes[0]!
      );
      byMarkerArm[markerArm].markerPermitToActivation.push(
        capturedGrantTimes[1]! - capturedPermitTimes[1]!
      );
      capturedGrantTimes = undefined;
      capturedPermitTimes = undefined;
      byMarkerArm[markerArm].sendsInWindow += mail.sentRecipients.length - sendWindowStartedAt
        + balancingMail.sentRecipients.length - balancingSendWindowStartedAt;

      if (markerArm === "existing") {
        await flow.service.register(
          registerInput(`s3d-successor-replacement-filler-${index}@example.test`),
          source("replacement-filler", index)
        );
      }
      await waitFor(() => mail.active.size === basePolicy.channel.maxConcurrentVerificationDispatches,
        `${markerArm}:chain-restored:${sequence}`);
    }

    const filesystemWrites = hostLoad?.filesystemWrites() ?? 0;
    await hostLoad?.stop();

    mail.releaseAllAndPassThrough();
    await flow.service.drainMailDispatches();
    await waitFor(() => flow.service.mailDispatchOccupancy().inFlight === 0, "drained");
    const existing = byMarkerArm.existing;
    const missing = byMarkerArm.missing;
    const auc = aucSeparability(existing.grantIntervals, missing.grantIntervals);
    const classifier = bestSingleThresholdClassifierAccuracy(
      existing.grantIntervals, missing.grantIntervals
    );
    const existingNull = sameArmRelabelingNull(
      existing.grantIntervals, samplesPerArm, 0x4d01
    );
    const missingNull = sameArmRelabelingNull(
      missing.grantIntervals, samplesPerArm, 0x4d02
    );
    const nullAuc = empiricalQuantile([...existingNull.auc, ...missingNull.auc], nullQuantile);
    const nullClassifier = empiricalQuantile(
      [...existingNull.classifier, ...missingNull.classifier], nullQuantile
    );
    const sharpAuc = aucSeparability(
      existing.markerPermitToActivation, missing.markerPermitToActivation
    );
    const sharpClassifier = bestSingleThresholdClassifierAccuracy(
      existing.markerPermitToActivation, missing.markerPermitToActivation
    );
    const existingSharpNull = sameArmRelabelingNull(
      existing.markerPermitToActivation, samplesPerArm, 0x4d03
    );
    const missingSharpNull = sameArmRelabelingNull(
      missing.markerPermitToActivation, samplesPerArm, 0x4d04
    );
    const sharpNullAuc = empiricalQuantile(
      [...existingSharpNull.auc, ...missingSharpNull.auc], nullQuantile
    );
    const sharpNullClassifier = empiricalQuantile(
      [...existingSharpNull.classifier, ...missingSharpNull.classifier], nullQuantile
    );
    console.info(
      `[S3d REWORK4 SUCCESSOR-LABELLED SHALLOW] backend=postgres production_policy=true `
      + `transport_ms=${ruledTransportTimeoutMs} n=${samplesPerArm} target_arm=missing `
      + `create_only_delay_ms=${createOnlyDelayMs} sustained_cpu_workers=${sustainedLoad ? 2 : 0} `
      + `filesystem_writes=${filesystemWrites} distinct_existing_markers=${existingMarkers.length} `
      + `existing_marker_median_ms=${median(existing.grantIntervals).toFixed(1)} `
      + `missing_marker_median_ms=${median(missing.grantIntervals).toFixed(1)} `
      + `existing_marker_permit_to_activation_median_ms=${median(existing.markerPermitToActivation).toFixed(1)} `
      + `missing_marker_permit_to_activation_median_ms=${median(missing.markerPermitToActivation).toFixed(1)} `
      + `cross_auc=${auc.toFixed(4)} null_auc_q99=${nullAuc.toFixed(4)} `
      + `cross_accuracy=${classifier.toFixed(4)} null_accuracy_q99=${nullClassifier.toFixed(4)} `
      + `sharp_cross_auc=${sharpAuc.toFixed(4)} sharp_null_auc_q99=${sharpNullAuc.toFixed(4)} `
      + `sharp_cross_accuracy=${sharpClassifier.toFixed(4)} `
      + `sharp_null_accuracy_q99=${sharpNullClassifier.toFixed(4)} `
      + `in_window_sends_existing=${existing.sendsInWindow} `
      + `in_window_sends_missing=${missing.sendsInWindow}`
    );
    expect(existing.sendsInWindow).toBe(missing.sendsInWindow);
    expect(sharpAuc).toBeLessThanOrEqual(sharpNullAuc);
    expect(sharpClassifier).toBeLessThanOrEqual(sharpNullClassifier);
    expect(auc).toBeLessThanOrEqual(nullAuc);
    expect(classifier).toBeLessThanOrEqual(nullClassifier);
  }, 360_000);

  it("S3d rework2 B4 measures healthy-MTA burst cost and the frozen S3b margin", async () => {
    class HealthyMailSender implements MailSender {
      sends = 0;
      async sendVerification(): Promise<void> {
        this.sends += 1;
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
      }
    }
    type BurstMeasurement = Readonly<{
      size: number;
      successes: number;
      busy: number;
      p50Ms: number;
      p99Ms: number;
      maximumAcceptedWaitMs: number;
      queueDeadlineMarginMs: number;
      committed: number;
      sends: number;
    }>;
    const measurements: BurstMeasurement[] = [];
    for (const size of [100, 128, 160]) {
      const mail = new HealthyMailSender();
      const flow = buildService({ mail });
      const inspectedService = flow.service as unknown as {
        reserveMailDispatchPermit(
          correlationId: string,
          minimumReservationMs?: number,
          activationSpacingMs?: number
        ): Promise<() => Promise<() => Promise<void>>>;
      };
      const reserveMailDispatchPermit = inspectedService.reserveMailDispatchPermit.bind(flow.service);
      const acceptedWaits: number[] = [];
      inspectedService.reserveMailDispatchPermit = (
        correlationId: string,
        minimumReservationMs?: number,
        activationSpacingMs?: number
      ) => {
        const startedAt = performance.now();
        const reservation = reserveMailDispatchPermit(
          correlationId, minimumReservationMs, activationSpacingMs
        );
        return reservation.then((release) => {
          acceptedWaits.push(performance.now() - startedAt);
          return release;
        });
      };
      const indexes: Buffer[] = [];
      const outcomes = await Promise.all(Array.from({ length: size }, async (_, index) => {
        const email = `s3d-b4-${size}-${index}@example.test`;
        indexes.push(createEmailBlindIndex(blindIndexKey, email));
        const startedAt = performance.now();
        try {
          await flow.service.register({
            email,
            password: "correct horse battery staple",
            recoveryEmail: `s3d-b4-${size}-${index}-recovery@example.test`,
            adultAffirmed: true
          }, {
            ip: `2001:db8:3d:b4:${size.toString(16)}::${index + 1}`,
            userAgent: "vitest-s3d-b4-healthy-mta",
            requestId: `request:s3d:b4:${size}:${index}`
          });
          return Object.freeze({ code: "SUCCESS", elapsedMs: performance.now() - startedAt });
        } catch (error) {
          return Object.freeze({
            code: (error as { code?: string }).code ?? "RAW_ERROR",
            elapsedMs: performance.now() - startedAt
          });
        }
      }));
      const successes = outcomes.filter((outcome) => outcome.code === "SUCCESS");
      const busy = outcomes.filter((outcome) => outcome.code === "AUTH_MAIL_BUSY");
      const unexpected = outcomes.filter((outcome) =>
        outcome.code !== "SUCCESS" && outcome.code !== "AUTH_MAIL_BUSY"
      );
      const committed = await database.pool.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM identity."user"
        WHERE email_blind_index=ANY($1::bytea[])
      `, [indexes]);
      await flow.service.drainMailDispatches();
      const acceptedLatencies = successes.map((outcome) => outcome.elapsedMs);
      const maximumAcceptedWaitMs = Math.max(0, ...acceptedWaits);
      measurements.push(Object.freeze({
        size,
        successes: successes.length,
        busy: busy.length,
        p50Ms: empiricalQuantile(acceptedLatencies, 0.5),
        p99Ms: empiricalQuantile(acceptedLatencies, 0.99),
        maximumAcceptedWaitMs,
        queueDeadlineMarginMs:
          basePolicy.channel.mailDispatchQueueWaitTimeoutMs - maximumAcceptedWaitMs,
        committed: Number(committed.rows[0]!.count),
        sends: mail.sends
      }));
      expect(unexpected).toHaveLength(0);
      expect(successes.length + busy.length).toBe(size);
      expect(Number(committed.rows[0]!.count)).toBe(successes.length);
      expect(mail.sends).toBe(successes.length);
      expect(flow.service.mailDispatchOccupancy()).toEqual({
        inFlight: 0,
        activeSends: 0,
        maximum: basePolicy.channel.maxConcurrentVerificationDispatches,
        queued: 0,
        maximumQueued: basePolicy.channel.maxQueuedVerificationDispatches
      });
      flow.service.drainMailCapacitySignals();
    }
    const hundred = measurements.find((measurement) => measurement.size === 100)!;
    console.info(
      `[S3d REWORK2 B4 AVAILABILITY] backend=postgres production_policy=true healthy_mta_ms=5 `
      + `production_equivalent_100_request_success_margin=${hundred.successes - 100} `
      + measurements.map((measurement) =>
        `burst=${measurement.size} success=${measurement.successes} busy=${measurement.busy} `
        + `p50_ms=${measurement.p50Ms.toFixed(1)} p99_ms=${measurement.p99Ms.toFixed(1)} `
        + `max_queue_wait_ms=${measurement.maximumAcceptedWaitMs.toFixed(1)} `
        + `deadline_margin_ms=${measurement.queueDeadlineMarginMs.toFixed(1)} `
        + `committed=${measurement.committed} sends=${measurement.sends}`
      ).join(" | ")
    );
    expect(hundred.successes).toBe(100);
    expect(hundred.committed).toBe(100);
    expect(hundred.queueDeadlineMarginMs).toBeGreaterThanOrEqual(0);
  }, 420_000);

  it("S3d rework2 fold-in gives both queued address arms the same ruled deadline", async () => {
    const expectedWaitTimeoutMs = basePolicy.channel.mailDispatchQueueWaitTimeoutMs;
    const samplesPerArm = 24;
    class HangingMailSender implements MailSender {
      private readonly releases: Array<() => void> = [];
      private passThrough = true;
      active = 0;

      async sendVerification(): Promise<void> {
        this.active += 1;
        if (!this.passThrough) {
          await new Promise<void>((resolve) => this.releases.push(resolve));
        }
        this.active -= 1;
      }

      releaseAll(): void {
        this.passThrough = true;
        for (const release of this.releases.splice(0)) release();
      }

      startHanging(): void {
        this.passThrough = false;
      }
    }
    const mail = new HangingMailSender();
    const flow = buildService({ mail });
    const existingEmail = "s3d-deadline-existing@example.test";
    await flow.service.register({
      email: existingEmail,
      password: "correct horse battery staple",
      recoveryEmail: "s3d-deadline-existing-recovery@example.test",
      adultAffirmed: true
    }, {
      ip: "2001:db8:3d:dead::eed",
      userAgent: "vitest-s3d-deadline-seed",
      requestId: "request:s3d:deadline:seed"
    });
    await flow.service.drainMailDispatches();
    mail.startHanging();
    const fill = Array.from({ length: basePolicy.channel.maxConcurrentVerificationDispatches },
      (_, index) => flow.service.register({
        email: `s3d-deadline-filler-${index}@example.test`,
        password: "correct horse battery staple",
        recoveryEmail: `s3d-deadline-filler-${index}-recovery@example.test`,
        adultAffirmed: true
      }, {
        ip: `2001:db8:3d:dead::${index + 1}`,
        userAgent: "vitest-s3d-deadline-filler",
        requestId: `request:s3d:deadline:filler:${index}`
      }));
    await Promise.all(fill);
    const fillStartedAt = performance.now();
    while (mail.active !== basePolicy.channel.maxConcurrentVerificationDispatches) {
      if (performance.now() - fillStartedAt > 15_000) throw new Error("S3D_DEADLINE_FILL_TIMEOUT");
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }

    const inspectedService = flow.service as unknown as {
      reserveMailDispatchPermit(
        correlationId: string,
        minimumReservationMs?: number,
        activationSpacingMs?: number
      ): Promise<() => Promise<() => Promise<void>>>;
    };
    const reserveMailDispatchPermit = inspectedService.reserveMailDispatchPermit.bind(flow.service);
    const reservationWaits: number[] = [];
    const schedulerDrainNulls: Array<Promise<number>> = [];
    inspectedService.reserveMailDispatchPermit = (
      correlationId: string,
      minimumReservationMs?: number,
      activationSpacingMs?: number
    ) => {
      const reservationStartedAt = performance.now();
      // A timeout callback is not the end of an expiry wave: the product timer
      // removes its queue node and rejects the suspended request. Measure the
      // null after the same due-timer batch has drained instead of comparing
      // product completion with an earlier bare timer callback.
      schedulerDrainNulls.push(new Promise<number>((resolve) => setTimeout(
        () => setImmediate(() => resolve(performance.now() - reservationStartedAt)),
        expectedWaitTimeoutMs
      )));
      const reservation = reserveMailDispatchPermit(
        correlationId, minimumReservationMs, activationSpacingMs
      );
      return reservation.catch((error) => {
        reservationWaits.push(performance.now() - reservationStartedAt);
        throw error;
      });
    };
    const queued = Array.from({ length: samplesPerArm * 2 }, (_, index) => {
      const arm = index % 2 === 0 ? "existing" as const : "missing" as const;
      const sample = Math.floor(index / 2);
      const startedAt = performance.now();
      const email = arm === "existing"
        ? existingEmail
        : `s3d-deadline-missing-${sample}@example.test`;
      return flow.service.register({
        email,
        password: "correct horse battery staple",
        recoveryEmail: `s3d-deadline-${arm}-${sample}-recovery@example.test`,
        adultAffirmed: true
      }, {
        ip: `2001:db8:3d:deae::${index + 1}`,
        userAgent: `vitest-s3d-deadline-${arm}`,
        requestId: `request:s3d:deadline:${arm}:${sample}`
      }).then(() => Object.freeze({
        arm, code: "ALLOWED", statusCode: 202, elapsedMs: performance.now() - startedAt
      })).catch((error: unknown) => {
        const known = error as { code?: string; statusCode?: number };
        return Object.freeze({
          arm,
          code: known.code ?? "RAW_ERROR",
          statusCode: known.statusCode ?? 500,
          elapsedMs: performance.now() - startedAt
        });
      });
    });
    while (flow.service.mailDispatchOccupancy().queued !== samplesPerArm * 2) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    const [outcomes, schedulerDrainNull] = await Promise.all([
      Promise.all(queued), Promise.all(schedulerDrainNulls)
    ]);
    const existing = outcomes.filter((outcome) => outcome.arm === "existing")
      .map((outcome) => outcome.elapsedMs);
    const missing = outcomes.filter((outcome) => outcome.arm === "missing")
      .map((outcome) => outcome.elapsedMs);
    const auc = aucSeparability(existing, missing);
    const classifier = bestSingleThresholdClassifierAccuracy(existing, missing);
    const existingNull = sameArmRelabelingNull(existing, samplesPerArm, 0x3d11);
    const missingNull = sameArmRelabelingNull(missing, samplesPerArm, 0x3d12);
    const nullAucValues = [...existingNull.auc, ...missingNull.auc];
    const nullClassifierValues = [...existingNull.classifier, ...missingNull.classifier];
    const nullAucMedian = empiricalQuantile(nullAucValues, 0.5);
    const nullClassifierMedian = empiricalQuantile(nullClassifierValues, 0.5);
    const aucCeiling = empiricalQuantile(nullAucValues, 0.99);
    const classifierCeiling = empiricalQuantile(
      nullClassifierValues, 0.99
    );
    const schedulerNullMedian = empiricalQuantile(schedulerDrainNull, 0.5);
    const schedulerNullQ99 = empiricalQuantile(schedulerDrainNull, 0.99);
    const schedulerDerivedTolerance = schedulerNullQ99 - schedulerNullMedian;
    const deadlineCeiling = schedulerNullQ99 + schedulerDerivedTolerance;
    mail.releaseAll();
    await flow.service.drainMailDispatches();
    console.info(
      `[S3d REWORK2 ARM-NEUTRAL QUEUE DEADLINE] backend=postgres n=${samplesPerArm} `
      + `ruled_timeout_ms=${expectedWaitTimeoutMs} `
      + `existing_median_ms=${median(existing).toFixed(1)} missing_median_ms=${median(missing).toFixed(1)} `
      + `cross_auc=${auc.toFixed(4)} null_auc_q99=${aucCeiling.toFixed(4)} `
      + `null_auc_median=${nullAucMedian.toFixed(4)} `
      + `derived_auc_tolerance=${(aucCeiling - nullAucMedian).toFixed(4)} `
      + `cross_accuracy=${classifier.toFixed(4)} null_accuracy_q99=${classifierCeiling.toFixed(4)} `
      + `null_accuracy_median=${nullClassifierMedian.toFixed(4)} `
      + `derived_accuracy_tolerance=${(classifierCeiling - nullClassifierMedian).toFixed(4)} `
      + `scheduler_drain_null_q99_ms=${schedulerNullQ99.toFixed(1)} `
      + `derived_deadline_tolerance_ms=${schedulerDerivedTolerance.toFixed(1)} `
      + `deadline_ceiling_ms=${deadlineCeiling.toFixed(1)} `
      + `reservation_wait_max_ms=${Math.max(...reservationWaits).toFixed(1)}`
    );
    expect(outcomes.every((outcome) => outcome.code === "AUTH_MAIL_BUSY"
      && outcome.statusCode === 503)).toBe(true);
    expect(reservationWaits).toHaveLength(samplesPerArm * 2);
    expect(Math.min(...reservationWaits)).toBeGreaterThanOrEqual(expectedWaitTimeoutMs - 250);
    expect(Math.max(...reservationWaits)).toBeLessThanOrEqual(deadlineCeiling);
    expect(auc).toBeLessThanOrEqual(aucCeiling);
    expect(classifier).toBeLessThanOrEqual(classifierCeiling);
    expect(outcomes[0]).toEqual(expect.objectContaining({
      code: "AUTH_MAIL_BUSY",
      statusCode: 503
    }));
    flow.service.drainMailCapacitySignals();
  }, 60_000);

  it("S3d rework3 fold-in plateaus RSS under a fixed ceiling and preserves the total aggregate count", async () => {
    class HangingMailSender implements MailSender {
      private readonly releases: Array<() => void> = [];
      private passThrough = false;
      active = 0;

      async sendVerification(): Promise<void> {
        this.active += 1;
        if (!this.passThrough) {
          await new Promise<void>((resolve) => this.releases.push(resolve));
        }
        this.active -= 1;
      }

      releaseAll(): void {
        this.passThrough = true;
        for (const release of this.releases.splice(0)) release();
      }
    }
    const mail = new HangingMailSender();
    const flow = buildService({ mail, sleep: async () => undefined });
    const capacityError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const saturationCount = basePolicy.channel.maxConcurrentVerificationDispatches
      + basePolicy.channel.maxQueuedVerificationDispatches;
    const saturation = Array.from({ length: saturationCount }, (_, index) =>
      flow.service.register({
        email: `s3d-rss-saturation-${index}@example.test`,
        password: "correct horse battery staple",
        recoveryEmail: `s3d-rss-saturation-${index}-recovery@example.test`,
        adultAffirmed: true
      }, {
        ip: `2001:db8:3d:455::${index + 1}`,
        userAgent: "vitest-s3d-rss-saturation",
        requestId: `request:s3d:rss:saturation:${index}`
      }).catch(() => undefined)
    );
    const saturationStartedAt = performance.now();
    while (flow.service.mailDispatchOccupancy().queued
      !== basePolicy.channel.maxQueuedVerificationDispatches || mail.active
      !== basePolicy.channel.maxConcurrentVerificationDispatches) {
      if (performance.now() - saturationStartedAt > 60_000) {
        throw new Error(`S3D_RSS_SATURATION_TIMEOUT:${JSON.stringify(
          flow.service.mailDispatchOccupancy()
        )}`);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    const refuseWave = async (offset: number, count: number): Promise<void> => {
      let busy = 0;
      for (let index = 0; index < count; index += 1) {
        try {
          await flow.service.register({
            email: `s3d-rss-refusal-${offset + index}@example.test`,
            password: "correct horse battery staple",
            recoveryEmail: `s3d-rss-refusal-${offset + index}-recovery@example.test`,
            adultAffirmed: true
          }, {
            // Keep the D1 pressure source set fixed so the frozen S3c sketch's
            // demand-paged backing store cannot masquerade as dispatcher growth.
            ip: `2001:db8:3d:456::${((offset + index) % 512) + 1}`,
            userAgent: "vitest-s3d-rss-refusal",
            requestId: `request:s3d:rss:refusal:${offset + index}`
          });
        } catch (error) {
          if ((error as { code?: string }).code === "AUTH_MAIL_BUSY") busy += 1;
        }
      }
      expect(busy).toBe(count);
    };

    // Prime every source before the baseline, then stay below 20 admissions per
    // source while proving twice the prior refusal load without demand-paging
    // new S3c slots during the measured waves.
    await refuseWave(0, 512);
    await forceGarbageCollection();
    const nullSamplesMib: number[] = [];
    for (let sample = 0; sample < 8; sample += 1) {
      await forceGarbageCollection();
      nullSamplesMib.push(process.memoryUsage().rss / 1024 / 1024);
    }
    const nullEnvelopeMib = Math.max(...nullSamplesMib) - Math.min(...nullSamplesMib);
    const confirmedPlatformPageSizeBytes = 16 * 1024;
    // This is a tuned secondary regression tripwire, not the primary security
    // bound. Its broad 2 MiB ceiling detects renewed linear growth without
    // pretending scheduler/RSS noise is a derived quantum; the heap-shape
    // proof above supplies the N-independent guarantee.
    const tunedSecondaryPlateauCeilingMib = 2;
    const waveRssMib: number[] = [];
    const waveHeapUsedMib: number[] = [];
    const waveHeapTotalMib: number[] = [];
    const waveExternalMib: number[] = [];
    for (let wave = 0; wave < 16; wave += 1) {
      await refuseWave(512 + wave * 500, 500);
      await forceGarbageCollection();
      const memory = process.memoryUsage();
      waveRssMib.push(memory.rss / 1024 / 1024);
      waveHeapUsedMib.push(memory.heapUsed / 1024 / 1024);
      waveHeapTotalMib.push(memory.heapTotal / 1024 / 1024);
      waveExternalMib.push(memory.external / 1024 / 1024);
    }
    const plateauSamples = waveRssMib.slice(12);
    const plateauSpreadMib = Math.max(...plateauSamples) - Math.min(...plateauSamples);
    flow.service.drainMailCapacitySignals();
    const allCapacitySignals = capacityError.mock.calls.map(([message]) => String(message));
    const capacityCounts = allCapacitySignals.flatMap((signal) => {
      const match = /^\[AUTH_MAIL_CAPACITY_EXHAUSTED\] correlation=[0-9a-f-]{36} code=MAIL_DISPATCH_CAPACITY window=[^ ]+ count=(\d+)$/.exec(signal);
      return match === null ? [] : [Number(match[1])];
    });
    const measuredCapacityCount = capacityCounts.reduce((sum, count) => sum + count, 0);
    mail.releaseAll();
    await Promise.all(saturation);
    await flow.service.drainMailDispatches();
    capacityError.mockRestore();
    console.info(
      `[S3d REWORK2 COUNTED RSS PLATEAU] backend=postgres refusals=8000 sources=512 `
      + `null_mib=[${nullSamplesMib.map((value) => value.toFixed(1)).join(",")}] `
      + `waves_mib=[${waveRssMib.map((value) => value.toFixed(1)).join(",")}] `
      + `heap_used_mib=[${waveHeapUsedMib.map((value) => value.toFixed(1)).join(",")}] `
      + `heap_total_mib=[${waveHeapTotalMib.map((value) => value.toFixed(1)).join(",")}] `
      + `external_mib=[${waveExternalMib.map((value) => value.toFixed(1)).join(",")}] `
      + `null_envelope_mib=${nullEnvelopeMib.toFixed(3)} `
      + `platform_page_size_bytes=${confirmedPlatformPageSizeBytes} `
      + `threshold_kind=tuned_secondary_tripwire `
      + `tuned_ceiling_mib=${tunedSecondaryPlateauCeilingMib.toFixed(3)} `
      + `plateau_spread_mib=${plateauSpreadMib.toFixed(3)} `
      + `measured_aggregates=${capacityCounts.length} measured_total_count=${measuredCapacityCount} `
      + `unrelated_signals=${allCapacitySignals.length - capacityCounts.length}`
    );
    expect(plateauSpreadMib).toBeLessThanOrEqual(tunedSecondaryPlateauCeilingMib);
    expect(capacityCounts.length).toBeGreaterThanOrEqual(1);
    expect(measuredCapacityCount).toBe(8_512);
  }, 180_000);

  it("S3d D2 preserves the owner's first verification credential across the full resend allowance", async () => {
    const initialNow = new Date("2026-08-20T09:00:00.000Z");
    const flow = buildService({ initialNow, sleep: async () => undefined });
    const registered = await registerAccount(flow.service, "s3d-owner-link");
    const firstToken = (flow.mail as MemoryMailSender).messages[0]!.token;
    for (let resend = 1; resend <= basePolicy.verification.outboundSendMax; resend += 1) {
      flow.advance(basePolicy.verification.resendCooldownMs);
      await expect(flow.service.resendVerification({ email: registered.email }, {
        ip: `2001:db8:3d:2::${resend}`,
        userAgent: "vitest-s3d-attacker",
        requestId: `request:s3d:d2:${resend}`
      })).resolves.toEqual(RESEND_PUBLIC_RESPONSE);
      await flow.service.drainMailDispatches();
    }
    const messages = (flow.mail as MemoryMailSender).messages;
    const credentials = await database.pool.query<{
      token_hash: string;
      issued_at: Date;
      expires_at: Date;
    }>(`
      SELECT token_hash,issued_at,expires_at
      FROM identity.verification_token_credential credential
      JOIN identity.channel_binding binding USING (channel_binding_id)
      WHERE binding.user_id=$1 ORDER BY issued_at
    `, [registered.user.user_id]);
    expect(new Set(messages.map((message) => message.token)).size).toBe(messages.length);
    expect(credentials.rows).toHaveLength(messages.length);
    expect(credentials.rows.every((credential) =>
      credential.expires_at.getTime() - credential.issued_at.getTime()
        === basePolicy.verification.tokenTtlMs
    )).toBe(true);
    expect(credentials.rows.every((credential) =>
      messages.every((message) => !credential.token_hash.includes(message.token))
    )).toBe(true);
    const verification = await flow.service.verifyEmail({ token: firstToken }, {
      ip: "2001:db8:3d:2::ffff",
      userAgent: "vitest-s3d-owner",
      requestId: "request:s3d:d2:owner-verify"
    });
    expect(verification).toEqual({ status: "active" });
    const consumedFamily = await database.pool.query<{ total: string; consumed: string }>(`
      SELECT count(*)::text AS total,count(consumed_at)::text AS consumed
      FROM identity.verification_token_credential credential
      JOIN identity.channel_binding binding USING (channel_binding_id)
      WHERE binding.user_id=$1
    `, [registered.user.user_id]);
    for (const [index, sibling] of messages.slice(1).entries()) {
      await expect(flow.service.verifyEmail({ token: sibling.token }, {
        ip: `2001:db8:3d:2:5::${index + 1}`,
        userAgent: "vitest-s3d-sibling-invalidation",
        requestId: `request:s3d:d2:sibling:${index}`
      })).rejects.toMatchObject({ code: "VERIFICATION_TOKEN_INVALID" });
    }
    expect(consumedFamily.rows).toEqual([{
      total: String(messages.length),
      consumed: String(messages.length)
    }]);
    console.info(
      `[S3d D2 RED/GREEN] backend=postgres attacker_resends=${basePolicy.verification.outboundSendMax} `
      + `messages=${messages.length} live_hashes=${credentials.rowCount} first_token_still_valid=true `
      + `siblings_invalid=${messages.length - 1} consumed_at=${consumedFamily.rows[0]!.consumed}/${consumedFamily.rows[0]!.total}`
    );
  }, 60_000);

  it("S3d D2 prunes expired hashes while preserving each mailed credential for its own lifetime", async () => {
    const flow = buildService({
      initialNow: new Date("2026-08-20T00:00:00.000Z"),
      sleep: async () => undefined
    });
    const registered = await registerAccount(flow.service, "s3d-credential-lifetime");
    const firstToken = (flow.mail as MemoryMailSender).messages[0]!.token;
    for (let resend = 1; resend <= 80; resend += 1) {
      flow.advance(basePolicy.verification.resendCooldownMs + 1);
      await flow.service.resendVerification({ email: registered.email }, {
        ip: `2001:db8:3d:4::${resend}`,
        userAgent: "vitest-s3d-credential-lifetime",
        requestId: `request:s3d:credential-lifetime:${resend}`
      });
      await flow.service.drainMailDispatches();
    }
    const messages = (flow.mail as MemoryMailSender).messages;
    const latestToken = messages.at(-1)!.token;
    const credentials = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM identity.verification_token_credential credential
      JOIN identity.channel_binding binding USING (channel_binding_id)
      WHERE binding.user_id=$1
    `, [registered.user.user_id]);
    const liveHashes = Number(credentials.rows[0]!.count);
    await expect(flow.service.verifyEmail({ token: firstToken }, {
      ip: "2001:db8:3d:4::fffe",
      userAgent: "vitest-s3d-expired-owner-token",
      requestId: "request:s3d:credential-lifetime:expired"
    })).rejects.toMatchObject({ code: "VERIFICATION_TOKEN_INVALID" });
    await expect(flow.service.verifyEmail({ token: latestToken }, {
      ip: "2001:db8:3d:4::ffff",
      userAgent: "vitest-s3d-current-owner-token",
      requestId: "request:s3d:credential-lifetime:current"
    })).resolves.toEqual({ status: "active" });
    console.info(
      `[S3d D2 LIFETIME] backend=postgres issued_tokens=${messages.length} `
      + `live_hashes=${liveHashes} ruled_maximum=73 first_expired=true newest_active=true`
    );
    expect(messages).toHaveLength(81);
    expect(liveHashes).toBeLessThanOrEqual(73);
  }, 90_000);

  it("S3d re-measures three outbound sends in every rolling hour at the shipped timestamp spacing", async () => {
    let now = new Date("2026-08-20T00:00:00.000Z");
    class TimestampMailSender implements MailSender {
      readonly sentAt: number[] = [];
      async sendVerification(_mail: VerificationMail): Promise<void> {
        this.sentAt.push(now.getTime());
      }
    }
    const mail = new TimestampMailSender();
    const flow = buildService({ mail, clock: () => now, sleep: async () => undefined });
    const email = "s3d-rolling-ceiling@example.test";
    await flow.service.register({
      email,
      password: "correct horse battery staple",
      recoveryEmail: "s3d-rolling-ceiling-recovery@example.test",
      adultAffirmed: true
    }, source);
    await flow.service.drainMailDispatches();
    const outcomes: string[] = [];
    for (let minute = 1; minute <= 60; minute += 1) {
      now = new Date(now.getTime() + 60_000);
      try {
        await flow.service.resendVerification({ email }, {
          ip: `2001:db8:3d:5::${((minute - 1) % 20) + 1}`,
          userAgent: "vitest-s3d-rolling-ceiling",
          requestId: `request:s3d:rolling:${minute}`
        });
        outcomes.push("ALLOWED");
      } catch (error) {
        outcomes.push((error as { code?: string }).code ?? "RAW_ERROR");
      }
      await flow.service.drainMailDispatches();
    }
    const windowMs = basePolicy.verification.outboundSendWindowMs;
    const maximumRollingCount = Math.max(...mail.sentAt.map((windowStart) =>
      mail.sentAt.filter((sentAt) => sentAt >= windowStart && sentAt < windowStart + windowMs).length
    ));
    console.info(
      `[S3d OUTBOUND CEILING] backend=postgres attempts=60 admission=60/60 `
      + `send_minutes=${mail.sentAt.map((sentAt) => (sentAt - mail.sentAt[0]!) / 60_000).join(",")} `
      + `max_half_open_rolling_hour=${maximumRollingCount}`
    );
    expect(outcomes).toEqual(Array.from({ length: 60 }, () => "ALLOWED"));
    expect(mail.sentAt.map((sentAt) => (sentAt - mail.sentAt[0]!) / 60_000))
      .toEqual([0, 20, 40, 60]);
    expect(maximumRollingCount).toBe(basePolicy.verification.outboundSendMax);
  }, 90_000);

  it("S3d D3 keeps the registration link live when resend is requested immediately", async () => {
    class PausedMailSender implements MailSender {
      readonly messages: VerificationMail[] = [];
      private readonly releases: Array<() => void> = [];
      async sendVerification(mail: VerificationMail): Promise<void> {
        this.messages.push(Object.freeze({ ...mail }));
        await new Promise<void>((resolve) => this.releases.push(resolve));
      }
      releaseAll(): void {
        for (const release of this.releases.splice(0)) release();
      }
    }
    const mail = new PausedMailSender();
    const flow = buildService({ mail, sleep: async () => undefined });
    const email = "s3d-first-link@example.test";
    await flow.service.register({
      email,
      password: "correct horse battery staple",
      recoveryEmail: "s3d-first-link-recovery@example.test",
      adultAffirmed: true
    }, source);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const firstToken = mail.messages[0]!.token;
    await expect(flow.service.resendVerification({ email }, {
      ip: "2001:db8:3d:3::1",
      userAgent: "vitest-s3d-immediate-resend",
      requestId: "request:s3d:d3:immediate-resend"
    })).resolves.toEqual(RESEND_PUBLIC_RESPONSE);
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      expect(mail.messages).toHaveLength(1);
    } finally {
      mail.releaseAll();
      await flow.service.drainMailDispatches();
    }
    await expect(flow.service.verifyEmail({ token: firstToken }, {
      ip: "2001:db8:3d:3::2",
      userAgent: "vitest-s3d-owner",
      requestId: "request:s3d:d3:owner-verify"
    })).resolves.toEqual({ status: "active" });
    console.info(
      "[S3d D3 CURRENT] backend=postgres first_transport=paused delivery_record=pending "
      + "immediate_resend_mails=1 first_link=active"
    );
  }, 30_000);

  it("returns byte-identical registration responses with a ruled timing floor for new and duplicate email", async () => {
    const flow = buildService();
    const input = {
      email: "enumeration@example.test",
      password: "correct horse battery staple",
      recoveryEmail: "enumeration-recovery@example.test",
      adultAffirmed: true
    };
    const startedNew = performance.now();
    const first = await flow.service.register(input, source);
    const newElapsed = performance.now() - startedNew;
    const startedDuplicate = performance.now();
    const duplicate = await flow.service.register(input, source);
    const duplicateElapsed = performance.now() - startedDuplicate;

    expect(JSON.stringify(duplicate)).toBe(JSON.stringify(first));
    expect(newElapsed).toBeGreaterThanOrEqual(basePolicy.verification.enumerationResponseFloorMs - 10);
    expect(duplicateElapsed).toBeGreaterThanOrEqual(basePolicy.verification.enumerationResponseFloorMs - 10);
    expect(Math.abs(newElapsed - duplicateElapsed)).toBeLessThan(100);
    console.info(
      `[S3 ENUMERATION] new_ms=${newElapsed.toFixed(1)} duplicate_ms=${duplicateElapsed.toFixed(1)} `
      + `byte_equal=true floor_ms=${basePolicy.verification.enumerationResponseFloorMs}`
    );
  });

  it("keeps new-vs-existing timing within the ruled tolerance for slow 0/400/1000ms transports", async () => {
    const evidence: string[] = [];
    const ruledToleranceMs = basePolicy.verification.enumerationToleranceMs ?? 100;
    for (const latencyMs of [0, 400, 1_000]) {
      class SlowMailSender implements MailSender {
        async sendVerification(_mail: VerificationMail): Promise<void> {
          await new Promise<void>((resolve) => setTimeout(resolve, latencyMs));
        }
      }
      const flow = buildService({ mail: new SlowMailSender() });
      const input = {
        email: `slow-${latencyMs}@example.test`,
        password: "correct horse battery staple",
        recoveryEmail: `slow-${latencyMs}-recovery@example.test`,
        adultAffirmed: true
      };
      const startedNew = performance.now();
      const first = await flow.service.register(input, source);
      const newElapsed = performance.now() - startedNew;
      await (flow.service as RegistrationService & { drainMailDispatches?: () => Promise<void> })
        .drainMailDispatches?.();
      const startedDuplicate = performance.now();
      const duplicate = await flow.service.register(input, source);
      const duplicateElapsed = performance.now() - startedDuplicate;
      const delta = Math.abs(newElapsed - duplicateElapsed);
      evidence.push(
        `mail_ms=${latencyMs} new_ms=${newElapsed.toFixed(1)} duplicate_ms=${duplicateElapsed.toFixed(1)} delta_ms=${delta.toFixed(1)}`
      );
      console.info(`[S3 R1 SAMPLE] ${evidence.at(-1)}`);
      expect(JSON.stringify(duplicate)).toBe(JSON.stringify(first));
      expect(delta).toBeLessThan(ruledToleranceMs);
    }
    console.info(`[S3 R1 RED/GREEN] ${evidence.join(" | ")}`);
  }, 15_000);

  it("S3c B3 keeps real route calls refused at production 20/10/3 before saturation", async () => {
    const now = new Date("2026-08-20T00:30:00.000Z");
    const cells: string[] = [];
    for (const route of ["register", "verify", "resend"] as const) {
      const flow = buildService({
        initialNow: now,
        limiterHashKey: Buffer.alloc(32, 0x41 + route.length)
      });
      const limit = basePolicy.rateLimits[route].admissionPerSource;
      const floodIp = `198.51.100.${route.length + 210}`;
      for (let count = 0; count < limit; count += 1) {
        expect(flow.limiter.consume({
          route, ip: floodIp, addressKey: `s3c-real-flood:${route}:${count}`, now
        })).toEqual({ allowed: true });
      }
      const realCodes: string[] = [];
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          if (route === "register") {
            await flow.service.register({
              email: `s3c-real-flood-${route}-${attempt}@example.test`,
              password: "correct horse battery staple",
              recoveryEmail: `s3c-real-flood-${route}-${attempt}-recovery@example.test`,
              adultAffirmed: true
            }, {
              ip: floodIp,
              userAgent: "vitest-s3c-real-flood",
              requestId: `request:s3c:real-flood:${route}:${attempt}`
            });
          } else if (route === "verify") {
            await flow.service.verifyEmail({ token: generateVerificationToken() }, {
              ip: floodIp,
              userAgent: "vitest-s3c-real-flood",
              requestId: `request:s3c:real-flood:${route}:${attempt}`
            });
          } else {
            await flow.service.resendVerification({
              email: `s3c-real-flood-${route}-${attempt}@example.test`
            }, {
              ip: floodIp,
              userAgent: "vitest-s3c-real-flood",
              requestId: `request:s3c:real-flood:${route}:${attempt}`
            });
          }
          realCodes.push("ALLOWED");
        } catch (error) {
          realCodes.push((error as { code?: string }).code ?? "RAW_ERROR");
        }
      }
      const occupancy = limiterMemoryOccupancy(flow.limiter);
      cells.push(
        `route=${route} threshold=${limit} `
        + `real_refused=${realCodes.filter((code) => code === "AUTH_RATE_LIMITED").length}/${realCodes.length} `
        + `occupied=${occupancy.occupiedSlots}/${occupancy.slotCapacity}`
      );
      expect(realCodes).toEqual(["AUTH_RATE_LIMITED", "AUTH_RATE_LIMITED"]);
      expect(occupancy.occupiedSlots).toBeLessThan(occupancy.slotCapacity);
    }
    console.info(`[S3c B3 REAL PRE-SATURATION] backend=postgres ${cells.join(" | ")}`);
  }, 60_000);

  it("S3c B2 isolates route budgets and bounds per-route collision refusal under the stated threat", async () => {
    const routes = ["register", "verify", "resend"] as const;
    const intensities = [1, 5, 10, 20] as const;
    const threatSources = 20_000;
    const innocentSamples = 2_000;
    const falseRefusalCeiling = 0.01;
    const now = new Date("2026-08-20T05:00:00.000Z");
    const invokeRealRoute = async (
      flow: ReturnType<typeof buildService>,
      route: typeof routes[number],
      label: string
    ): Promise<string> => {
      const realSource = {
        ip: `s3c-b2-real-innocent:${label}`,
        userAgent: "vitest-s3c-b2-real-route",
        requestId: `request:s3c:b2:${label}`
      };
      try {
        if (route === "register") {
          await flow.service.register({
            email: `s3c-b2-${label}@example.test`,
            password: "correct horse battery staple",
            recoveryEmail: `s3c-b2-${label}-recovery@example.test`,
            adultAffirmed: true
          }, realSource);
          await flow.service.drainMailDispatches();
        } else if (route === "verify") {
          await flow.service.verifyEmail({ token: generateVerificationToken() }, realSource);
        } else {
          await flow.service.resendVerification({
            email: `s3c-b2-missing-${label}@example.test`
          }, realSource);
        }
        return "ADMITTED";
      } catch (error) {
        const code = (error as { code?: string }).code ?? "RAW_ERROR";
        return route === "verify" && code === "VERIFICATION_TOKEN_INVALID" ? "ADMITTED" : code;
      }
    };
    const populate = (
      limiter: InProcessAuthRateLimiter,
      route: typeof routes[number],
      requestsPerSource: number,
      label: string
    ) => {
      for (let sourceIndex = 0; sourceIndex < threatSources; sourceIndex += 1) {
        for (let request = 0; request < requestsPerSource; request += 1) {
          limiter.consume({
            route,
            ip: `${label}:attacker:${sourceIndex}`,
            addressKey: `${label}:ignored:${sourceIndex}:${request}`,
            now
          });
        }
      }
    };
    const probe = (
      limiter: InProcessAuthRateLimiter,
      route: typeof routes[number],
      label: string
    ): number => {
      let refused = 0;
      for (let sample = 0; sample < innocentSamples; sample += 1) {
        const outcome = limiter.consume({
          route,
          ip: `${label}:innocent:${sample}`,
          addressKey: `${label}:innocent-address:${sample}`,
          now
        });
        if (!outcome.allowed) refused += 1;
      }
      return refused;
    };

    const isolated = buildService({
      initialNow: now,
      sleep: async () => undefined,
      limiterHashKey: Buffer.alloc(32, 0xb2)
    });
    populate(isolated.limiter, "register", basePolicy.rateLimits.register.admissionPerSource,
      "cross-route-register");
    const crossRouteCells: string[] = [];
    const crossRouteResults: Array<{ readonly rate: number; readonly realOutcome: string }> = [];
    for (const route of ["verify", "resend"] as const) {
      const refused = probe(isolated.limiter, route, `cross-route-${route}`);
      const realOutcome = await invokeRealRoute(isolated, route, `cross-route-${route}`);
      crossRouteCells.push(
        `route=${route} refused=${refused}/${innocentSamples} real=${realOutcome}`
      );
      crossRouteResults.push({ rate: refused / innocentSamples, realOutcome });
    }

    const curve: string[] = [];
    const curveResults: Array<{ readonly rate: number; readonly realOutcome: string }> = [];
    type IntensityKey = "1" | "5" | "10" | "20";
    const measuredRangesPpm: Record<
      typeof routes[number],
      Record<IntensityKey, { minimum: number; maximum: number; mean: number }>
    > = {
      register: {} as Record<IntensityKey, { minimum: number; maximum: number; mean: number }>,
      verify: {} as Record<IntensityKey, { minimum: number; maximum: number; mean: number }>,
      resend: {} as Record<IntensityKey, { minimum: number; maximum: number; mean: number }>
    };
    for (const route of routes) {
      for (const requestsPerSource of intensities) {
        const rates: number[] = [];
        for (let hashKeyIndex = 0; hashKeyIndex < 3; hashKeyIndex += 1) {
          const label = `${route}-n${requestsPerSource}-k${hashKeyIndex}`;
          const flow = buildService({
            initialNow: now,
            sleep: async () => undefined,
            limiterHashKey: Buffer.alloc(
              32,
              0x40 + route.length * 7 + requestsPerSource + hashKeyIndex * 23
            )
          });
          populate(flow.limiter, route, requestsPerSource, label);
          const refused = probe(flow.limiter, route, label);
          const rate = refused / innocentSamples;
          const realOutcome = hashKeyIndex === 0
            ? await invokeRealRoute(flow, route, label)
            : "ADMITTED";
          const occupancy = limiterMemoryOccupancy(flow.limiter);
          rates.push(rate);
          curve.push(
            `route=${route} requests_per_source=${requestsPerSource} hash_key=${hashKeyIndex + 1}/3 `
            + `refused=${refused}/${innocentSamples} rate=${rate.toFixed(4)} real=${realOutcome} `
            + `occupied=${occupancy.occupiedSlots}/${occupancy.slotCapacity}`
          );
          curveResults.push({ rate, realOutcome });
        }
        measuredRangesPpm[route][String(requestsPerSource) as IntensityKey] = {
          minimum: Math.round(Math.min(...rates) * 1_000_000),
          maximum: Math.round(Math.max(...rates) * 1_000_000),
          mean: Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length * 1_000_000)
        };
      }
    }
    console.info(
      `[S3c B2 CROSS-ROUTE] backend=postgres attacker_route=register sources=${threatSources} `
      + `requests_per_source=${basePolicy.rateLimits.register.admissionPerSource} `
      + crossRouteCells.join(" | ")
    );
    console.info(
      `[S3c B2 COLLATERAL CURVE] backend=postgres threat_sources=${threatSources} `
      + `innocents_per_cell=${innocentSamples} hash_keys=3 ceiling=${falseRefusalCeiling.toFixed(4)} `
      + curve.join(" | ")
    );
    console.info(`[S3c B5 COLLATERAL SPREAD] ${JSON.stringify(measuredRangesPpm)}`);
    expect(crossRouteResults.every(
      (result) => result.rate === 0 && result.realOutcome === "ADMITTED"
    )).toBe(true);
    expect(curveResults.every(
      (result) => result.rate <= falseRefusalCeiling && result.realOutcome === "ADMITTED"
    )).toBe(true);
    expect(Object.values(measuredRangesPpm).every((route) =>
      Object.values(route).every((range) => range.mean < falseRefusalCeiling * 1_000_000)
    )).toBe(true);
    const rateLimitRow = AUTH_POLICY_REGISTER_ROWS.find((row) => row.rowKey === "rateLimitPolicy")!;
    const publishedRefusalPpm = (rateLimitRow.value as {
      sketch_design: {
        theoretical_collateral: {
          model: string;
          refusal_rate_ppm: Record<typeof routes[number], Record<IntensityKey, number>>;
        };
      };
    }).sketch_design.theoretical_collateral;
    expect(publishedRefusalPpm.model).toBe("exact_binomial_two_independent_rows");
    expect(publishedRefusalPpm.refusal_rate_ppm.register["20"])
      .toBe(publishedRefusalPpm.refusal_rate_ppm.verify["10"]);
    expect(publishedRefusalPpm.refusal_rate_ppm.register["20"])
      .toBe(publishedRefusalPpm.refusal_rate_ppm.resend["5"]);
    expect(publishedRefusalPpm.refusal_rate_ppm.register["20"])
      .toBeLessThan(falseRefusalCeiling * 1_000_000);
  }, 180_000);

  it("S3c D2 cannot spend a fresh registrant's budget by naming their address", async () => {
    const flow = buildService({ initialNow: new Date("2026-08-20T02:00:00.000Z") });
    const email = "s3c-d2-register-victim@example.test";
    const addressKey = createEmailBlindIndex(blindIndexKey, email).toString("hex");
    const legacyRegisterAddressBudget = 5;
    for (let attempt = 0; attempt < legacyRegisterAddressBudget; attempt += 1) {
      expect(flow.limiter.consume({
        route: "register",
        ip: `203.0.113.${attempt + 1}`,
        addressKey,
        now: new Date("2026-08-20T02:00:00.000Z")
      })).toEqual({ allowed: true });
    }
    await expect(flow.service.register({
      email,
      password: "correct horse battery staple",
      recoveryEmail: "s3c-d2-register-victim-recovery@example.test",
      adultAffirmed: true
    }, {
      ip: "198.51.100.201",
      userAgent: "vitest-s3c-d2-owner",
      requestId: "request:s3c:d2:register-owner"
    })).resolves.toEqual(REGISTRATION_PUBLIC_RESPONSE);
    await flow.service.drainMailDispatches();
    const persisted = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM identity."user" WHERE email_blind_index=$1
    `, [createEmailBlindIndex(blindIndexKey, email)]);
    console.info(
      `[S3c D2 REGISTER] backend=postgres attacker_address_attempts=${legacyRegisterAddressBudget} `
      + `owner_outcome=success persisted=${persisted.rows[0]!.count}`
    );
    expect(Number(persisted.rows[0]!.count)).toBe(1);
  }, 30_000);

  it("S3c D2 cannot spend a pending account's verify or resend budget from another source", async () => {
    const initialNow = new Date("2026-08-20T03:00:00.000Z");
    const flow = buildService({ initialNow });
    const registered = await registerAccount(flow.service, "s3c-d2-pending-owner");
    const addressKey = registered.index.toString("hex");
    const token = (flow.mail as MemoryMailSender).messages.at(-1)!.token;
    const legacyVerifyAddressBudget = 10;
    for (let attempt = 0; attempt < legacyVerifyAddressBudget; attempt += 1) {
      expect(flow.limiter.consume({
        route: "verify",
        ip: `203.0.114.${attempt + 1}`,
        addressKey,
        now: initialNow
      })).toEqual({ allowed: true });
    }
    await expect(flow.service.verifyEmail({ token }, {
      ip: "198.51.100.202",
      userAgent: "vitest-s3c-d2-owner",
      requestId: "request:s3c:d2:verify-owner"
    })).resolves.toEqual({ status: "active" });

    const resendFlow = buildService({ initialNow });
    const resendRegistered = await registerAccount(resendFlow.service, "s3c-d2-resend-owner");
    const resendAddressKey = resendRegistered.index.toString("hex");
    resendFlow.advance(basePolicy.verification.resendCooldownMs + 1);
    const legacyResendAddressBudget = 3;
    for (let attempt = 0; attempt < legacyResendAddressBudget; attempt += 1) {
      expect(resendFlow.limiter.consume({
        route: "resend",
        ip: `203.0.115.${attempt + 1}`,
        addressKey: resendAddressKey,
        now: new Date(initialNow.getTime() + basePolicy.verification.resendCooldownMs + 1)
      })).toEqual({ allowed: true });
    }
    await expect(resendFlow.service.resendVerification({ email: resendRegistered.email }, {
      ip: "198.51.100.203",
      userAgent: "vitest-s3c-d2-owner",
      requestId: "request:s3c:d2:resend-owner"
    })).resolves.toEqual(RESEND_PUBLIC_RESPONSE);
    await resendFlow.service.drainMailDispatches();
    const resendMessages = (resendFlow.mail as MemoryMailSender).messages.length;
    console.info(
      `[S3c D2 VERIFY_RESEND] backend=postgres verify_poison=${legacyVerifyAddressBudget} `
      + `verify_owner=active resend_poison=${legacyResendAddressBudget} `
      + `resend_owner=success resend_messages=${resendMessages}`
    );
    expect(resendMessages).toBe(2);
  }, 45_000);

  it("S3 rework4 B2 overlaps existing and missing N=1/N=4 real-PostgreSQL distributions within tolerance", async () => {
    const fileStore = new FileUserDekStore(secretRoot, loadKek(Buffer.alloc(32, 0x7d)));
    const branchOnlyDelayMs = basePolicy.verification.enumerationToleranceMs + 75;
    const delayedStore: UserDekStore = {
      async store(userId, dek) {
        await new Promise<void>((resolve) => setTimeout(resolve, branchOnlyDelayMs));
        await fileStore.store(userId, dek);
      }
    };
    const measure = async (
      flow: ReturnType<typeof buildService>,
      email: string,
      concurrency: 1 | 4,
      label: string
    ): Promise<number[]> =>
      Promise.all(Array.from({ length: concurrency }, async (_, index) => {
        const startedAt = performance.now();
        await flow.service.register({
          email,
          password: "correct horse battery staple",
          recoveryEmail: `${label}-recovery@example.test`,
          adultAffirmed: true
        }, {
          ...source,
          requestId: `request:b2:${label}:${index}`
        });
        return performance.now() - startedAt;
      }));
    const gap = (left: number[], right: number[]): number => Math.max(
      0,
      Math.max(Math.min(...left), Math.min(...right)) - Math.min(Math.max(...left), Math.max(...right))
    );

    const n1Flow = buildService({ dekStore: delayedStore });
    const n1Registered = await registerAccount(n1Flow.service, "rework4-enumeration-n1-existing");
    const n1Existing = await measure(n1Flow, n1Registered.email, 1, "n1-existing");
    const n1Missing = await measure(
      n1Flow, "rework4-enumeration-n1-missing@example.test", 1, "n1-missing"
    );
    const n4Flow = buildService({ dekStore: delayedStore });
    const n4Registered = await registerAccount(n4Flow.service, "rework4-enumeration-n4-existing");
    const n4Existing = await measure(n4Flow, n4Registered.email, 4, "n4-existing");
    const n4Missing = await measure(
      n4Flow, "rework4-enumeration-n4-missing@example.test", 4, "n4-missing"
    );
    const n1Gap = gap(n1Existing, n1Missing);
    const n4Gap = gap(n4Existing, n4Missing);
    console.info(
      `[S3 REWORK4 B2 POSTGRES RED/GREEN] backend=postgres tolerance_ms=${basePolicy.verification.enumerationToleranceMs} `
      + `controlled_dek_latency_ms=${branchOnlyDelayMs} `
      + `n1_existing=${n1Existing.map((value) => value.toFixed(1)).join(",")} `
      + `n1_missing=${n1Missing.map((value) => value.toFixed(1)).join(",")} n1_gap=${n1Gap.toFixed(1)} `
      + `n4_existing=${n4Existing.map((value) => value.toFixed(1)).join(",")} `
      + `n4_missing=${n4Missing.map((value) => value.toFixed(1)).join(",")} n4_gap=${n4Gap.toFixed(1)}`
    );
    expect(n1Gap).toBeLessThanOrEqual(basePolicy.verification.enumerationToleranceMs);
    expect(n4Gap).toBeLessThanOrEqual(basePolicy.verification.enumerationToleranceMs);
    for (const flow of [n1Flow, n4Flow]) {
      await flow.service.drainMailDispatches();
    }
  }, 45_000);

  it("S3b keeps live-mail N=1/N=4/N=8 PostgreSQL arms below the separation ceiling", async () => {
    const aucCeiling = 0.8;
    const registrationCadenceMs = Number(process.env.S3D_REGISTRATION_CADENCE_MS ?? "45");
    const sustainedLoad = process.env.S3D_CADENCE_SUSTAINED_LOAD === "1";
    expect([30, 45, 60]).toContain(registrationCadenceMs);
    const cadencePolicy = registrationCadenceMs === 45
      ? basePolicy
      : Object.freeze({
          ...basePolicy,
          channel: Object.freeze({
            ...basePolicy.channel,
            registrationMailDispatchActivationSpacingMs: registrationCadenceMs
          })
        }) as unknown as AuthPolicy;
    const hostLoad = sustainedLoad ? await startSustainedHostLoad(secretRoot) : undefined;
    const cells: string[] = [];
    const measurements: Array<{
      readonly concurrency: 1 | 2 | 3 | 4 | 8;
      readonly existing: readonly number[];
      readonly missing: readonly number[];
      readonly medianGapMs: number;
      readonly classifierAccuracy: number;
      readonly auc: number;
      readonly waves: number;
      readonly duplicateAuditCount: number;
      readonly duplicatePostworkAuditCount: number;
      readonly expectedMailCount: number;
      readonly mailCount: number;
      readonly hashAndProvisioningMaximumMs: number;
      readonly clampHeadroomMs: number;
    }> = [];
    for (const concurrency of [1, 2, 3, 4, 8] as const) {
      const waves = concurrency === 1 ? 8 : 4;
      const existingGroups = Math.ceil(waves / 4);
      const timingMail = new MemoryMailSender();
      const flow = buildService({ mail: timingMail, policy: cadencePolicy });
      const requestStartedAt = new Map<string, number>();
      const hashAndProvisioningWork: number[] = [];
      const inspectedService = flow.service as unknown as {
        provisionPendingAccount(input: { readonly email: string }): Promise<unknown>;
      };
      const originalProvision = inspectedService.provisionPendingAccount.bind(flow.service);
      inspectedService.provisionPendingAccount = async (input: { readonly email: string }) => {
        const result = await originalProvision(input);
        const startedAt = requestStartedAt.get(input.email);
        if (startedAt !== undefined) {
          hashAndProvisioningWork.push(performance.now() - startedAt);
        }
        return result;
      };
      const existingEmails = Array.from(
        { length: concurrency * existingGroups },
        (_, index) => `s3b-timing-n${concurrency}-existing-${index}@example.test`
      );
      await Promise.all(existingEmails.map((email, index) => flow.service.register({
        email,
        password: "correct horse battery staple",
        recoveryEmail: `s3b-timing-n${concurrency}-seed-${index}-recovery@example.test`,
        adultAffirmed: true
      }, {
        ip: `203.0.${concurrency}.${index + 1}`,
        userAgent: "vitest-s3b-timing-seed",
        requestId: `request:s3b:timing:n${concurrency}:seed:${index}`
      })));
      await flow.service.drainMailDispatches();

      const existing: number[] = [];
      const missing: number[] = [];
      const measureExistingWave = async (wave: number): Promise<number[]> => Promise.all(
        Array.from({ length: concurrency }, async (_, index) => {
          const email = existingEmails[(wave % existingGroups) * concurrency + index]!;
          const startedAt = performance.now();
          requestStartedAt.set(email, startedAt);
          await flow.service.register({
            email,
            password: "correct horse battery staple",
            recoveryEmail: `s3b-timing-n${concurrency}-existing-${index}-recovery@example.test`,
            adultAffirmed: true
          }, {
            ip: `203.${concurrency}.${wave}.${index + 1}`,
            userAgent: "vitest-s3b-timing-existing",
            requestId: `request:s3b:timing:n${concurrency}:existing:${wave}:${index}`
          });
          return performance.now() - startedAt;
        })
      );
      const measureMissingWave = async (wave: number): Promise<number[]> => Promise.all(
        Array.from({ length: concurrency }, async (_, index) => {
          const startedAt = performance.now();
          const email = `s3b-timing-n${concurrency}-missing-${wave}-${index}@example.test`;
          requestStartedAt.set(email, startedAt);
          await flow.service.register({
            email,
            password: "correct horse battery staple",
            recoveryEmail: `s3b-timing-n${concurrency}-missing-${wave}-${index}-recovery@example.test`,
            adultAffirmed: true
          }, {
            ip: `204.${concurrency}.${wave}.${index + 1}`,
            userAgent: "vitest-s3b-timing-missing",
            requestId: `request:s3b:timing:n${concurrency}:missing:${wave}:${index}`
          });
          return performance.now() - startedAt;
        })
      );
      for (let wave = 0; wave < waves; wave += 1) {
        if (wave % 2 === 0) {
          existing.push(...await measureExistingWave(wave));
          missing.push(...await measureMissingWave(wave));
        } else {
          missing.push(...await measureMissingWave(wave));
          await flow.service.drainMailDispatches();
          existing.push(...await measureExistingWave(wave));
        }
        await flow.service.drainMailDispatches();
      }

      const medianGapMs = Math.abs(median(existing) - median(missing));
      const classifierAccuracy = bestSingleThresholdClassifierAccuracy(existing, missing);
      const auc = aucSeparability(existing, missing);
      const clampMs = basePolicy.verification.enumerationResponseFloorMs
        + basePolicy.verification.enumerationToleranceMs;
      const hashAndProvisioningMaximumMs = Math.max(...hashAndProvisioningWork);
      const clampHeadroomMs = clampMs - (
        hashAndProvisioningMaximumMs + concurrency * registrationCadenceMs
      );
      const existingTokens = await database.pool.query<{ audit_token: string }>(`
        SELECT audit_token FROM identity."user"
        WHERE email_blind_index=ANY($1::bytea[])
      `, [existingEmails.map((email) => createEmailBlindIndex(blindIndexKey, email))]);
      const duplicateAudits = await database.pool.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM identity.audit_event
        WHERE event_type='identity.registration' AND decision='DENY'
          AND actor_key_ref=ANY($1::text[])
      `, [existingTokens.rows.map((row) => row.audit_token)]);
      const duplicatePostworkAudits = await database.pool.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM identity.audit_event
        WHERE event_type='identity.registration.duplicate_postwork' AND decision='DENY'
          AND actor_key_ref=ANY($1::text[])
      `, [existingTokens.rows.map((row) => row.audit_token)]);
      cells.push(
        `n=${concurrency} existing=[${existing.map((value) => value.toFixed(1)).join(",")}] `
        + `missing=[${missing.map((value) => value.toFixed(1)).join(",")}] `
        + `median_gap_ms=${medianGapMs.toFixed(1)} `
        + `best_classifier_pct=${(classifierAccuracy * 100).toFixed(1)} `
        + `auc_separability_pct=${(auc * 100).toFixed(1)} `
        + `hash_provision_max_ms=${hashAndProvisioningMaximumMs.toFixed(1)} `
        + `clamp_headroom_ms=${clampHeadroomMs.toFixed(1)}`
      );
      measurements.push({
        concurrency,
        existing,
        missing,
        medianGapMs,
        classifierAccuracy,
        auc,
        waves,
        duplicateAuditCount: Number(duplicateAudits.rows[0]!.count),
        duplicatePostworkAuditCount: Number(duplicatePostworkAudits.rows[0]!.count),
        expectedMailCount: existingEmails.length + concurrency * waves,
        mailCount: timingMail.messages.length,
        hashAndProvisioningMaximumMs,
        clampHeadroomMs
      });
      expect(Math.min(...existing, ...missing)).toBeGreaterThanOrEqual(clampMs - 20);
    }
    const filesystemWrites = hostLoad?.filesystemWrites() ?? 0;
    await hostLoad?.stop();
    if (registrationCadenceMs === 45) {
      const absorbed = measurements.find((measurement) => measurement.concurrency === 2)!;
      const firstUnabsorbed = measurements.find((measurement) => measurement.concurrency === 3)!;
      expect(absorbed.hashAndProvisioningMaximumMs).toBeLessThanOrEqual(
        basePolicy.channel.registrationHashAndProvisioningUpperBoundMs
      );
      expect(absorbed.clampHeadroomMs).toBeGreaterThanOrEqual(
        basePolicy.channel.registrationClampHeadroomMs
      );
      expect(firstUnabsorbed.clampHeadroomMs).toBeLessThan(0);
      expect(basePolicy.channel.maximumClampAbsorbedRegistrationConcurrency).toBe(2);
    }
    console.info(
      `[S3b REWORK1 LIVE TIMING] backend=postgres mail=live password_argon2id_kib=${basePolicy.password.argon2id.memoryCostKiB} `
        + `password_argon2id_time=${basePolicy.password.argon2id.timeCost} `
        + `registration_cadence_ms=${registrationCadenceMs} `
        + `sustained_cpu_workers=${sustainedLoad ? 2 : 0} filesystem_writes=${filesystemWrites} `
        + `clamp_ms=${basePolicy.verification.enumerationResponseFloorMs
          + basePolicy.verification.enumerationToleranceMs} `
        + `auc_ceiling_pct=${(aucCeiling * 100).toFixed(1)} ${cells.join(" | ")}`
    );
    for (const measurement of measurements) {
      expect(measurement.medianGapMs).toBeLessThanOrEqual(
        basePolicy.verification.enumerationToleranceMs
      );
      expect(measurement.auc).toBeLessThanOrEqual(aucCeiling);
    }
    for (const measurement of measurements) {
      expect(measurement.duplicateAuditCount).toBe(measurement.concurrency * measurement.waves);
      expect(measurement.duplicatePostworkAuditCount).toBe(
        measurement.concurrency * measurement.waves
      );
      expect(measurement.mailCount).toBe(measurement.expectedMailCount);
    }
  }, 300_000);

  it("S3b F3 rejects an audit-invalid account before invoking the external DEK write", async () => {
    const flow = buildService();
    const userId = randomUUID();
    const email = `s3b-f3-${userId}@example.test`;
    const recoveryEmail = `s3b-f3-${userId}-recovery@example.test`;
    const keyId = `user-dek:${userId}`;
    const dek = generateDek();
    let beforeCommitCalls = 0;
    try {
      await expect(flow.repository.createPendingAccount({
        userId,
        emailBlindIndex: createEmailBlindIndex(blindIndexKey, email),
        emailCiphertext: encrypt(dek, Buffer.from(email), [
          "identity", "user.email_ciphertext", userId, "run:none", userId, keyId, "1"
        ]),
        recoveryEmailCiphertext: encrypt(dek, Buffer.from(recoveryEmail), [
          "identity", "user.recovery_email_ciphertext", userId, "run:none", userId, keyId, "1"
        ]),
        passwordHash: "s3b-f3-password-hash",
        pseudonym: `s3b-f3-${userId}`,
        auditToken: "00000000-0000-0000-0000-000000000000",
        adultAffirmedAt: new Date("2026-08-20T00:00:00.000Z"),
        verificationTokenHash: createHash("sha256").update(generateVerificationToken()).digest("hex"),
        verificationExpiresAt: new Date("2026-08-21T00:00:00.000Z"),
        occurredAt: new Date("2026-08-20T00:00:00.000Z"),
        source
      }, async () => { beforeCommitCalls += 1; })).rejects.toThrow("AUDIT_TOKEN_MUST_BE_RANDOM_UUID_V4");
      const persisted = await database.pool.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM identity."user" WHERE user_id=$1
      `, [userId]);
      console.info(
        `[S3b F3 ORDERING] backend=postgres audit_failure=pre_dek_write `
        + `before_commit_calls=${beforeCommitCalls} persisted_accounts=${persisted.rows[0]!.count}`
      );
      expect(beforeCommitCalls).toBe(0);
      expect(Number(persisted.rows[0]!.count)).toBe(0);
    } finally {
      dek.fill(0);
    }
  }, 20_000);

  it("S3 rework4 B3 atomically starts cooldown when minting and preserves the first token if delivery recording fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flow = buildService();
    vi.spyOn(flow.repository, "recordVerificationDelivery")
      .mockRejectedValueOnce(new Error("simulated delivery-record failure"));
    try {
      const email = "rework4-cooldown@example.test";
      await flow.service.register({
        email,
        password: "correct horse battery staple",
        recoveryEmail: "rework4-cooldown-recovery@example.test",
        adultAffirmed: true
      }, source);
      await flow.service.resendVerification({ email }, source);
      await flow.service.drainMailDispatches();
      const messages = (flow.mail as MemoryMailSender).messages;
      expect(messages).toHaveLength(1);
      await expect(flow.service.verifyEmail({ token: messages[0]!.token }, source))
        .resolves.toEqual({ status: "active" });
    } finally {
      error.mockRestore();
    }
  }, 20_000);

  it("S3d D4 keeps cooldown after a delivery-record failure and durably audits only opaque correlation", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flow = buildService({ sleep: async () => undefined });
    vi.spyOn(flow.repository, "recordVerificationDelivery")
      .mockRejectedValueOnce(new Error("simulated delivery-record failure"));
    try {
      const email = "s3d-delivery-record-failure@example.test";
      await flow.service.register({
        email,
        password: "correct horse battery staple",
        recoveryEmail: "s3d-delivery-record-failure-recovery@example.test",
        adultAffirmed: true
      }, source);
      await flow.service.drainMailDispatches();
      await expect(flow.service.resendVerification({ email }, source))
        .resolves.toEqual(RESEND_PUBLIC_RESPONSE);
      await flow.service.drainMailDispatches();
      expect((flow.mail as MemoryMailSender).messages).toHaveLength(1);

      const failureAudit = await database.pool.query<{
        audit_id: string;
        justification: string;
        source_context: Record<string, unknown>;
        row_text: string;
      }>(`
        SELECT audit_id,justification,source_context,audit_event::text AS row_text
        FROM identity.audit_event AS audit_event
        WHERE event_type='identity.verification.delivery_record_failed'
        ORDER BY occurred_at DESC LIMIT 1
      `);
      expect(failureAudit.rows).toHaveLength(1);
      expect(failureAudit.rows[0]!.justification).toMatch(
        /^correlation:[0-9a-f-]{36};code:MAIL_RECORD_FAILED$/
      );
      expect(failureAudit.rows[0]!.source_context).toEqual({
        ipArgon2id: expect.stringMatching(/^[0-9a-f]{64}$/),
        userAgentArgon2id: expect.stringMatching(/^[0-9a-f]{64}$/)
      });
      expect(failureAudit.rows[0]!.row_text).not.toContain(email);
      expect(failureAudit.rows[0]!.row_text).not.toContain(source.ip);
      expect(failureAudit.rows[0]!.row_text).not.toContain(source.userAgent);
      expect(error).toHaveBeenCalledWith(expect.stringMatching(
        /^\[AUTH_MAIL_DELIVERY_RECORD_FAILED\] attempt=[0-9a-f-]+ code=MAIL_RECORD_FAILED$/
      ));
      console.info(
        `[S3d D4 RED/GREEN] backend=postgres cooldown_mails=1 failure_audits=${failureAudit.rowCount} `
        + `raw_email_ip_ua_matches=0`
      );
    } finally {
      error.mockRestore();
    }
  }, 30_000);

  it("S3 rework4 fold-in rejects leading-dash mail recipients before persistence", async () => {
    const flow = buildService();
    await expect(flow.service.register({
      email: "-option@example.test",
      password: "correct horse battery staple",
      recoveryEmail: "safe-recovery@example.test",
      adultAffirmed: true
    }, source)).rejects.toMatchObject({ code: "AUTH_INPUT_INVALID" });
    const leaked = await database.pool.query(`
      SELECT 1 FROM identity."user" WHERE email_blind_index=$1
    `, [createEmailBlindIndex(blindIndexKey, "-option@example.test")]);
    expect(leaked.rowCount).toBe(0);
  });

  it("stores no plaintext email, recovery email, password, or raw verification token in any identity row", async () => {
    const flow = buildService();
    const registered = await registerAccount(flow.service, "plaintext-proof", {
      password: "unique password phrase 8492"
    });
    const token = (flow.mail as MemoryMailSender).messages[0]!.token;
    const searchable = [registered.email, registered.recoveryEmail, registered.password, token];

    for (const value of searchable) {
      const found = await database.pool.query<{ table_name: string }>(`
        SELECT table_name
        FROM (VALUES
          ('user', (SELECT string_agg(u::text, E'\\n') FROM identity."user" u)),
          ('channel_binding', (SELECT string_agg(c::text, E'\\n') FROM identity.channel_binding c)),
          ('verification_token_credential', (SELECT string_agg(v::text, E'\\n') FROM identity.verification_token_credential v)),
          ('audit_event', (SELECT string_agg(a::text, E'\\n') FROM identity.audit_event a))
        ) AS rows(table_name, row_text)
        WHERE position($1 in coalesce(row_text, '')) > 0
      `, [value]);
      expect(found.rows, `plaintext leaked: ${value}`).toEqual([]);
    }
    console.info(`[S3 PLAINTEXT] searched_identity_values=${searchable.length} leaks=0`);
  });

  it("records mail failure by opaque attempt id for operator diagnosis without changing the public response", async () => {
    class FailingMailSender implements MailSender {
      async sendVerification(_mail: VerificationMail): Promise<void> {
        throw new MailDeliveryError("TEST_MAILBOX_BOUNCE");
      }
    }
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const flow = buildService({ mail: new FailingMailSender() });
      const registered = await registerAccount(flow.service, "mail-failure");
      expect(registered.response).toEqual(REGISTRATION_PUBLIC_RESPONSE);
      const delivery = await database.pool.query<{ delivery_status: string; delivery_error: string }>(`
        SELECT delivery_status,delivery_error FROM identity.channel_binding
        WHERE user_id=$1 AND channel_type='email'
      `, [registered.user.user_id]);
      expect(delivery.rows[0]).toEqual({
        delivery_status: "failed", delivery_error: "TEST_MAILBOX_BOUNCE"
      });
      expect(error).toHaveBeenCalledWith(expect.stringMatching(
        /^\[AUTH_MAIL_DELIVERY_FAILED\] attempt=[0-9a-f-]+ code=TEST_MAILBOX_BOUNCE$/
      ));
    } finally {
      error.mockRestore();
    }
  });
});

describe("T9 resend lock-order race through the real HTTP boundary", () => {
  const RESEND_BODY = JSON.stringify(RESEND_PUBLIC_RESPONSE);

  /**
   * Real transport that suspends exactly one armed send. Suspending the first
   * eligible resend transport is what lets the asynchronous
   * `recordVerificationDelivery` transaction meet live
   * `prepareVerificationResend` transactions on the same rows.
   */
  class GatedVerificationMailSender implements MailSender {
    readonly messages: VerificationMail[] = [];
    private armed = false;
    private signalEntered!: () => void;
    private signalReleased!: () => void;
    private readonly enteredPromise = new Promise<void>((resolve) => {
      this.signalEntered = resolve;
    });
    private readonly releasedPromise = new Promise<void>((resolve) => {
      this.signalReleased = resolve;
    });

    arm(): void { this.armed = true; }
    entered(): Promise<void> { return this.enteredPromise; }
    release(): void { this.signalReleased(); }

    async sendVerification(mail: VerificationMail): Promise<void> {
      this.messages.push(Object.freeze({ ...mail }));
      if (!this.armed) return;
      this.armed = false;
      this.signalEntered();
      await this.releasedPromise;
    }
  }

  interface ResendObservation {
    readonly arm: "existing" | "missing";
    readonly index: number;
    readonly ip: string;
    readonly status: number | null;
    readonly body: string | null;
    readonly elapsedMs: number;
    readonly rejection: string | null;
  }

  function driverErrorCode(error: unknown): string {
    if (typeof error === "object" && error !== null && "code" in error) {
      return String((error as { readonly code: unknown }).code);
    }
    return error instanceof Error ? `${error.name}:${error.message}` : String(error);
  }

  async function injectResend(
    api: ReturnType<typeof buildApi>,
    arm: "existing" | "missing",
    index: number,
    email: string,
    ip: string
  ): Promise<ResendObservation> {
    const startedAt = performance.now();
    try {
      const response = await api.inject({
        method: "POST",
        url: "/v1/auth/resend-verification",
        payload: { email },
        remoteAddress: ip,
        headers: { "user-agent": "vitest-t9" }
      });
      return Object.freeze({
        arm, index, ip,
        status: response.statusCode,
        body: response.body,
        elapsedMs: performance.now() - startedAt,
        rejection: null
      });
    } catch (error) {
      return Object.freeze({
        arm, index, ip,
        status: null,
        body: null,
        elapsedMs: performance.now() - startedAt,
        rejection: driverErrorCode(error)
      });
    }
  }

  /**
   * Waits until the launched resend burst is demonstrably live inside
   * PostgreSQL, then lets the caller release the suspended transport into it.
   * Runs on a client reserved before the burst so the probe never competes for
   * the connection pool it observes. Committed preparation rows are the
   * reliable signal: `pg_stat_activity` sampling is throttled by the same
   * event loop that the synchronous WASM Argon2id audit hashing blocks.
   */
  async function waitForResendContention(
    monitor: PoolClient,
    occurredAt: Date,
    minimumPrepared: number,
    timeoutMs: number
  ): Promise<Readonly<{ prepared: number; peakLockWaiters: number }>> {
    const deadline = performance.now() + timeoutMs;
    let prepared = 0;
    let peakLockWaiters = 0;
    while (performance.now() < deadline) {
      const sample = await monitor.query<{ prepared: string; waiters: string }>(`
        SELECT
          (SELECT count(*) FROM identity.audit_event
            WHERE event_type='identity.verification.resend_requested'
              AND occurred_at=$1)::text AS prepared,
          (SELECT count(*) FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock')::text AS waiters
      `, [occurredAt]);
      prepared = Number(sample.rows[0]!.prepared);
      peakLockWaiters = Math.max(peakLockWaiters, Number(sample.rows[0]!.waiters));
      if (prepared >= minimumPrepared || peakLockWaiters >= 2) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    return Object.freeze({ prepared, peakLockWaiters });
  }

  interface VerifyObservation {
    readonly index: number;
    readonly ip: string;
    readonly status: number | null;
    readonly body: string | null;
    readonly elapsedMs: number;
    readonly rejection: string | null;
  }

  async function injectVerify(
    api: ReturnType<typeof buildApi>,
    index: number,
    token: string,
    ip: string
  ): Promise<VerifyObservation> {
    const startedAt = performance.now();
    try {
      const response = await api.inject({
        method: "POST",
        url: "/v1/auth/verify-email",
        payload: { token },
        remoteAddress: ip,
        headers: { "user-agent": "vitest-t9" }
      });
      return Object.freeze({
        index, ip,
        status: response.statusCode,
        body: response.body,
        elapsedMs: performance.now() - startedAt,
        rejection: null
      });
    } catch (error) {
      return Object.freeze({
        index, ip,
        status: null,
        body: null,
        elapsedMs: performance.now() - startedAt,
        rejection: driverErrorCode(error)
      });
    }
  }

  interface RegisterObservation {
    readonly index: number;
    readonly ip: string;
    readonly status: number | null;
    readonly body: string | null;
    readonly elapsedMs: number;
    readonly rejection: string | null;
  }

  async function injectRegister(
    api: ReturnType<typeof buildApi>,
    index: number,
    email: string,
    recoveryEmail: string,
    ip: string
  ): Promise<RegisterObservation> {
    const startedAt = performance.now();
    try {
      const response = await api.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email,
          password: "correct horse battery staple",
          recovery_email: recoveryEmail,
          adult_affirmed: true
        },
        remoteAddress: ip,
        headers: { "user-agent": "vitest-t9" }
      });
      return Object.freeze({
        index, ip,
        status: response.statusCode,
        body: response.body,
        elapsedMs: performance.now() - startedAt,
        rejection: null
      });
    } catch (error) {
      return Object.freeze({
        index, ip,
        status: null,
        body: null,
        elapsedMs: performance.now() - startedAt,
        rejection: driverErrorCode(error)
      });
    }
  }

  /**
   * Test-only barrier that pauses a real repository transaction immediately
   * after one real SQL statement has returned, leaving that transaction open
   * and its real row locks held. It observes and pauses actual SQL; it never
   * mocks a repository result and never injects an error.
   */
  interface QueryBarrier {
    readonly reached: Promise<void>;
    release(): void;
    hits(): number;
  }

  let activeQueryBarrier: {
    readonly matches: (sql: string) => boolean;
    readonly signalReached: () => void;
    readonly released: Promise<void>;
    count: number;
  } | undefined;
  const barrierPatchedClients = new WeakSet<PoolClient>();
  let poolPatchedForBarriers = false;
  let originalPoolConnect: ((...args: readonly unknown[]) => unknown) | undefined;

  function instrumentClientForBarriers(client: PoolClient): PoolClient {
    if (barrierPatchedClients.has(client)) return client;
    barrierPatchedClients.add(client);
    const mutable = client as unknown as { query: (...q: readonly unknown[]) => unknown };
    const query = mutable.query.bind(client);
    mutable.query = (...q: readonly unknown[]): unknown => {
      const sql = typeof q[0] === "string" ? q[0] : "";
      const result = query(...q);
      const barrier = activeQueryBarrier;
      if (barrier === undefined || barrier.count > 0
        || !(result instanceof Promise) || !barrier.matches(sql)) {
        return result;
      }
      return result.then(async (value: unknown) => {
        barrier.count += 1;
        barrier.signalReached();
        await barrier.released;
        return value;
      });
    };
    return client;
  }

  /**
   * `Pool.connect` has two call forms and `Pool.query` uses the callback one
   * internally, where `connect` returns undefined rather than a promise. A
   * Promise-only wrapper therefore awaits undefined and hands a non-object to a
   * WeakSet, which throws while the callback path still succeeds — passing
   * tests plus unhandled rejections. Both forms are handled here, exactly as
   * `createPool` in packages/db already does for its own client wrapping.
   */
  function patchPoolForQueryBarriers(): void {
    if (poolPatchedForBarriers) return;
    poolPatchedForBarriers = true;
    const pool = database.pool as unknown as {
      connect: (...args: readonly unknown[]) => unknown;
    };
    const connect = pool.connect.bind(database.pool);
    originalPoolConnect = pool.connect.bind(database.pool);
    pool.connect = (...args: readonly unknown[]): unknown => {
      const callback = args.at(-1);
      if (typeof callback === "function") {
        return connect((error: unknown, client: PoolClient | undefined, release: unknown) => {
          (callback as (e: unknown, c: PoolClient | undefined, r: unknown) => void)(
            error,
            client === undefined ? undefined : instrumentClientForBarriers(client),
            release
          );
        });
      }
      return (connect(...args) as Promise<PoolClient>)
        .then((client) => instrumentClientForBarriers(client));
    };
  }

  /** Restores the shared pool so no later test file inherits this patch. */
  function restorePoolAfterQueryBarriers(): void {
    if (!poolPatchedForBarriers || originalPoolConnect === undefined) return;
    (database.pool as unknown as { connect: unknown }).connect = originalPoolConnect;
    originalPoolConnect = undefined;
    poolPatchedForBarriers = false;
  }

  afterAll(() => {
    restorePoolAfterQueryBarriers();
  });

  function installQueryBarrier(matches: (sql: string) => boolean): QueryBarrier {
    patchPoolForQueryBarriers();
    let signalReached!: () => void;
    let signalReleased!: () => void;
    const reached = new Promise<void>((resolve) => { signalReached = resolve; });
    const released = new Promise<void>((resolve) => { signalReleased = resolve; });
    const barrier = { matches, signalReached, released, count: 0 };
    activeQueryBarrier = barrier;
    return Object.freeze({
      reached,
      release(): void {
        activeQueryBarrier = undefined;
        signalReleased();
      },
      hits: () => barrier.count
    });
  }

  /** Counts backends genuinely queued on a row lock in this database. */
  async function waitForLockWaiters(
    monitor: PoolClient,
    minimumWaiters: number,
    timeoutMs: number
  ): Promise<number> {
    const deadline = performance.now() + timeoutMs;
    let peak = 0;
    while (performance.now() < deadline) {
      const sample = await monitor.query<{ waiters: string }>(`
        SELECT count(*)::text AS waiters FROM pg_stat_activity
        WHERE datname=current_database() AND state='active' AND wait_event_type='Lock'
      `);
      peak = Math.max(peak, Number(sample.rows[0]!.waiters));
      if (peak >= minimumWaiters) return peak;
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    return peak;
  }

  /**
   * Savepoint-guarded NOWAIT probe. Production SQL is never changed to use
   * NOWAIT; only this observer does, and only from its own transaction.
   */
  async function probeRowLock(
    prober: PoolClient,
    label: string,
    sql: string,
    parameters: readonly unknown[]
  ): Promise<"acquired" | "locked"> {
    await prober.query(`SAVEPOINT probe_${label}`);
    try {
      await prober.query(sql, [...parameters]);
      await prober.query(`RELEASE SAVEPOINT probe_${label}`);
      return "acquired";
    } catch (error) {
      await prober.query(`ROLLBACK TO SAVEPOINT probe_${label}`);
      if ((error as { readonly code?: string }).code !== "55P03") throw error;
      return "locked";
    }
  }

  function databaseErrorLeak(body: string | null): boolean {
    if (body === null) return false;
    return /INTERNAL_ERROR|40P01|deadlock|SQLSTATE|identity\.|FOR UPDATE|pg_/i.test(body);
  }

  async function emailChannelOf(userId: string): Promise<string> {
    const binding = await database.pool.query<{ channel_binding_id: string }>(`
      SELECT channel_binding_id FROM identity.channel_binding
      WHERE user_id=$1 AND channel_type='email'
    `, [userId]);
    return binding.rows[0]!.channel_binding_id;
  }

  it("T9-H keeps the query-barrier pool patch safe for both pg connect call forms", async () => {
    // pg's Pool.query calls Pool.connect in CALLBACK form, where connect returns
    // undefined rather than a promise. A Promise-only patch therefore awaits
    // undefined and hands a non-object to a WeakSet: every query still succeeds,
    // so tests stay green, while each call leaks one unhandled TypeError and
    // fails the run. This regression pins both call forms.
    const unhandled: string[] = [];
    const capture = (reason: unknown): void => {
      unhandled.push(reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason));
    };
    process.on("unhandledRejection", capture);
    try {
      patchPoolForQueryBarriers();

      const callbackClient = await new Promise<PoolClient>((resolve, reject) => {
        (database.pool as unknown as {
          connect: (
            callback: (error: unknown, client: PoolClient | undefined, release: () => void) => void
          ) => unknown;
        }).connect((error, client, release) => {
          if (error !== undefined && error !== null) {
            reject(error instanceof Error ? error : new Error(String(error)));
            return;
          }
          release();
          resolve(client!);
        });
      });
      const viaPoolQuery = await database.pool.query<{ ok: number }>("SELECT 1 AS ok");
      const promiseClient = await database.pool.connect();
      const viaClient = await promiseClient.query<{ ok: number }>("SELECT 2 AS ok");
      promiseClient.release();
      // Let any unhandled rejection surface before asserting.
      await new Promise<void>((resolve) => setTimeout(resolve, 250));

      console.info(
        `[T9-H POOL PATCH CALL FORMS] `
        + `callback_client_instrumented=${barrierPatchedClients.has(callbackClient)} `
        + `promise_client_instrumented=${barrierPatchedClients.has(promiseClient)} `
        + `pool_query_ok=${viaPoolQuery.rows[0]!.ok} client_query_ok=${viaClient.rows[0]!.ok} `
        + `unhandled=${unhandled.length} ${JSON.stringify(unhandled)}`
      );

      expect(viaPoolQuery.rows[0]!.ok).toBe(1);
      expect(viaClient.rows[0]!.ok).toBe(2);
      expect(barrierPatchedClients.has(callbackClient)).toBe(true);
      expect(barrierPatchedClients.has(promiseClient)).toBe(true);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", capture);
    }
  }, 60_000);

  it("T9 keeps 32 existing and 32 missing concurrent resends byte-identical with zero deadlocks", async () => {
    const initialNow = new Date("2026-08-21T09:00:00.000Z");
    const existingInstant = new Date(
      initialNow.getTime() + basePolicy.verification.resendCooldownMs + 1
    );
    const missingInstant = new Date(existingInstant.getTime() + 1);
    const mail = new GatedVerificationMailSender();
    const flow = buildService({ mail, initialNow });
    const api = buildApi({ application: fixtureAskApplication(), registration: flow.service });
    const observedDeliveryErrors: string[] = [];
    const shippedRecordDelivery = flow.repository.recordVerificationDelivery
      .bind(flow.repository);
    // Pure observer: the shipped delivery-record error is recorded and rethrown
    // unchanged, so the production failure path keeps its exact behaviour.
    flow.repository.recordVerificationDelivery = async (
      input: Parameters<typeof shippedRecordDelivery>[0]
    ): Promise<void> => {
      try {
        await shippedRecordDelivery(input);
      } catch (error) {
        observedDeliveryErrors.push(driverErrorCode(error));
        throw error;
      }
    };
    const monitor = await database.pool.connect();
    const openedAt = performance.now();
    const phase = (name: string): void => console.info(
      `[T9 RESEND RACE PHASE] ${name} t=${(performance.now() - openedAt).toFixed(0)}ms`
    );
    try {
      const registered = await registerAccount(flow.service, "t9-resend-race");
      phase("seeded");
      const seededCredentials = await database.pool.query<{
        token_hash: string; issued_at: Date; expires_at: Date; consumed_at: Date | null;
      }>(`
        SELECT token_hash,issued_at,expires_at,consumed_at
        FROM identity.verification_token_credential credential
        JOIN identity.channel_binding binding USING (channel_binding_id)
        WHERE binding.user_id=$1 ORDER BY issued_at
      `, [registered.user.user_id]);
      expect(seededCredentials.rows).toHaveLength(1);
      expect(mail.messages).toHaveLength(1);

      mail.arm();
      flow.advance(basePolicy.verification.resendCooldownMs + 1);
      const deadlocksBefore = await databaseDeadlockCount();

      // Step 4: the first eligible existing-account resend, suspended in transport.
      const existingRequests = [
        injectResend(api, "existing", 0, registered.email, "198.51.100.1")
      ];
      await mail.entered();
      phase("transport-suspended");

      // Step 5: 31 more requests on the same address, each from its own source.
      for (let index = 1; index < 32; index += 1) {
        existingRequests.push(
          injectResend(api, "existing", index, registered.email, `198.51.100.${index + 1}`)
        );
      }
      const contention = await waitForResendContention(monitor, existingInstant, 3, 8_000);
      phase(`contention prepared=${contention.prepared} waiters=${contention.peakLockWaiters}`);
      mail.release();
      const existingObservations = await Promise.all(existingRequests);
      phase("existing-arm-responded");
      await flow.service.drainMailDispatches();
      phase("existing-arm-drained");

      // Step 6: the paired missing-address arm across the same public boundary.
      flow.advance(1);
      const missingObservations = await Promise.all(Array.from({ length: 32 }, (_, index) =>
        injectResend(
          api, "missing", index, "t9-resend-race-missing@example.test", `203.0.113.${index + 1}`
        )
      ));
      phase("missing-arm-responded");
      await flow.service.drainMailDispatches();
      phase("missing-arm-drained");

      // Step 7: re-read the database deadlock counter.
      await settleDatabaseStatistics();
      const deadlocksAfter = await databaseDeadlockCount();
      phase(`deadlocks-read delta=${deadlocksAfter - deadlocksBefore}`);

      const resendAudit = await database.pool.query<{
        actor_key_ref: string; decision: string; success: boolean;
        justification: string | null; occurred_at: Date;
      }>(`
        SELECT actor_key_ref,decision,success,justification,occurred_at
        FROM identity.audit_event
        WHERE event_type='identity.verification.resend_requested' AND occurred_at IN ($1,$2)
      `, [existingInstant, missingInstant]);
      const existingAudit = resendAudit.rows.filter(
        (row) => row.occurred_at.getTime() === existingInstant.getTime()
      );
      const missingAudit = resendAudit.rows.filter(
        (row) => row.occurred_at.getTime() === missingInstant.getTime()
      );
      const deliveryAudit = await database.pool.query<{ event_type: string; decision: string }>(`
        SELECT event_type,decision FROM identity.audit_event
        WHERE actor_key_ref=$1 AND event_type IN (
          'identity.verification.sent','identity.verification.delivery_record_failed'
        )
      `, [registered.user.audit_token]);
      const rateLimitAudit = await database.pool.query<{ refusals: string }>(`
        SELECT count(*)::text AS refusals FROM identity.audit_event
        WHERE event_type='identity.auth.rate_limit_refused' AND occurred_at>=$1
      `, [existingInstant]);
      const credentials = await database.pool.query<{
        token_hash: string; issued_at: Date; expires_at: Date; consumed_at: Date | null;
      }>(`
        SELECT token_hash,issued_at,expires_at,consumed_at
        FROM identity.verification_token_credential credential
        JOIN identity.channel_binding binding USING (channel_binding_id)
        WHERE binding.user_id=$1 ORDER BY issued_at
      `, [registered.user.user_id]);
      const binding = await database.pool.query<{
        delivery_status: string; delivery_error: string | null; verification_last_sent_at: Date;
      }>(`
        SELECT delivery_status,delivery_error,verification_last_sent_at
        FROM identity.channel_binding WHERE user_id=$1 AND channel_type='email'
      `, [registered.user.user_id]);
      const audit = await readAuditChain();

      // The append-only chain is a total order, so the position of the resend's
      // delivery-record row inside the existing arm's preparation rows proves
      // the asynchronous delivery transaction really overlapped live
      // preparation transactions rather than following them.
      const deliveryChainIndex = audit.order.findIndex((event) =>
        event.eventType === "identity.verification.sent"
        && event.actorKeyRef === registered.user.audit_token
        && event.occurredAt.getTime() >= existingInstant.getTime()
      );
      const existingChainIndexes = audit.order.flatMap((event, index) =>
        event.eventType === "identity.verification.resend_requested"
          && event.occurredAt.getTime() === existingInstant.getTime()
          ? [index]
          : []
      );
      const resendRowsAfterDelivery = existingChainIndexes.filter(
        (index) => index > deliveryChainIndex
      ).length;

      const observations = [...existingObservations, ...missingObservations];
      const statuses = (arm: "existing" | "missing"): number[] =>
        observations.filter((observation) => observation.arm === arm)
          .map((observation) => observation.status ?? -1);
      console.info(
        `[T9 RESEND RACE RED/GREEN] backend=postgres cooldown_ms=${basePolicy.verification.resendCooldownMs} `
        + `prepared_at_release=${contention.prepared} peak_lock_waiters=${contention.peakLockWaiters} `
        + `resend_rows_after_delivery=${resendRowsAfterDelivery}/${existingChainIndexes.length} `
        + `existing_202=${statuses("existing").filter((status) => status === 202).length}/32 `
        + `missing_202=${statuses("missing").filter((status) => status === 202).length}/32 `
        + `non_202_existing=${JSON.stringify(observations.filter((observation) =>
          observation.arm === "existing" && observation.status !== 202
        ))} `
        + `non_202_missing=${JSON.stringify(observations.filter((observation) =>
          observation.arm === "missing" && observation.status !== 202
        ))} `
        + `rejections=${observations.filter((observation) => observation.rejection !== null).length} `
        + `raw_delivery_errors=${JSON.stringify(observedDeliveryErrors)} `
        + `deadlocks_before=${deadlocksBefore} deadlocks_after=${deadlocksAfter} `
        + `deadlock_delta=${deadlocksAfter - deadlocksBefore} `
        + `existing_audit=${existingAudit.length} missing_audit=${missingAudit.length} `
        + `delivery_audit=${JSON.stringify(deliveryAudit.rows)} `
        + `delivery_status=${binding.rows[0]!.delivery_status} `
        + `credentials=${credentials.rowCount} chain_root_count=${audit.rootCount} `
        + `chain_depth=${audit.chain.length}/${audit.totalRows} `
        + `existing_elapsed_ms=${existingObservations.map((observation) =>
          observation.elapsedMs.toFixed(1)).join(",")} `
        + `missing_elapsed_ms=${missingObservations.map((observation) =>
          observation.elapsedMs.toFixed(1)).join(",")}`
      );

      // The race really happened: the delivery transaction committed in the
      // middle of the existing arm's preparation transactions.
      expect(deliveryChainIndex).toBeGreaterThanOrEqual(0);
      expect(resendRowsAfterDelivery).toBeGreaterThanOrEqual(8);

      // Permanent GREEN contract: both arms opaque, byte-identical, no deadlock.
      expect(statuses("existing")).toEqual(Array.from({ length: 32 }, () => 202));
      expect(statuses("missing")).toEqual(Array.from({ length: 32 }, () => 202));
      for (const observation of observations) {
        expect(observation.body).toBe(RESEND_BODY);
        expect(observation.rejection).toBeNull();
      }
      expect(observations.filter((observation) => observation.body !== RESEND_BODY)).toEqual([]);
      expect(observedDeliveryErrors).toEqual([]);
      expect(deadlocksAfter - deadlocksBefore).toBe(0);

      // Non-vacuity: every request reached resend preparation.
      expect(existingAudit).toHaveLength(32);
      expect(missingAudit).toHaveLength(32);
      expect(existingAudit.every((row) => row.actor_key_ref === registered.user.audit_token))
        .toBe(true);
      expect(existingAudit.filter((row) => row.decision === "ALLOW" && row.success)).toHaveLength(1);
      expect(existingAudit.filter((row) =>
        row.decision === "DENY" && !row.success && row.justification === "RESEND_COOLDOWN"
      )).toHaveLength(31);
      expect(missingAudit.every((row) =>
        row.decision === "DENY" && !row.success && row.justification === "RESEND_NOT_APPLICABLE"
        && row.actor_key_ref !== registered.user.audit_token
      )).toBe(true);
      expect(new Set(missingAudit.map((row) => row.actor_key_ref)).size).toBe(32);

      // Non-vacuity: exactly one eligible resend mail, credential, and delivery record.
      expect(mail.messages).toHaveLength(2);
      expect(mail.messages[1]!.token).not.toBe(mail.messages[0]!.token);
      expect(credentials.rows).toHaveLength(2);
      expect(deliveryAudit.rows.filter((row) =>
        row.event_type === "identity.verification.sent"
      )).toHaveLength(2);
      expect(deliveryAudit.rows.filter((row) =>
        row.event_type === "identity.verification.delivery_record_failed"
      )).toEqual([]);
      expect(binding.rows[0]!.delivery_status).toBe("sent");
      expect(binding.rows[0]!.delivery_error).toBeNull();

      // Non-vacuity: no rate limit intervened in either arm.
      expect(rateLimitAudit.rows[0]!.refusals).toBe("0");

      // Non-vacuity: append-only chain has one root, covers every row, and verifies.
      expect(audit.rootCount).toBe(1);
      expect(audit.chain).toHaveLength(audit.totalRows);
      expect(verifyChain(audit.chain as ChainedAuditEvent[])).toBe(true);

      // S3d credential semantics: the seeded credential is untouched and every
      // live credential keeps its own ruled lifetime.
      expect(credentials.rows[0]).toEqual(seededCredentials.rows[0]);
      expect(credentials.rows.every((credential) =>
        credential.consumed_at === null
        && credential.expires_at.getTime() - credential.issued_at.getTime()
          === basePolicy.verification.tokenTtlMs
      )).toBe(true);

      // S3d activation semantics: the original registration link still activates.
      await expect(flow.service.verifyEmail({ token: mail.messages[0]!.token }, {
        ip: "198.51.100.200", userAgent: "vitest-t9", requestId: "request:t9:owner-verify"
      })).resolves.toEqual({ status: "active" });
    } finally {
      monitor.release();
      await flow.service.drainMailDispatches();
      await api.close();
    }
  }, 300_000);

  it("T9 keeps concurrent verification and resend on one account deadlock-free and singly activating", async () => {
    const initialNow = new Date("2026-08-21T11:00:00.000Z");
    const mail = new MemoryMailSender();
    const flow = buildService({ mail, initialNow });
    const api = buildApi({ application: fixtureAskApplication(), registration: flow.service });
    try {
      const registered = await registerAccount(flow.service, "t9-verify-vs-resend");
      const ownerToken = mail.messages[0]!.token;
      flow.advance(basePolicy.verification.resendCooldownMs + 1);
      const deadlocksBefore = await databaseDeadlockCount();

      // Interleave both routes so `consumeVerification`'s token,c,u locking and
      // `prepareVerificationResend`'s c,u locking meet the aligned c,u delivery
      // record on the same rows.
      const mixed: Array<Promise<ResendObservation | VerifyObservation>> = [];
      for (let index = 0; index < 16; index += 1) {
        mixed.push(injectResend(
          api, "existing", index, registered.email, `198.51.100.${100 + index}`
        ));
        mixed.push(injectVerify(api, index, ownerToken, `203.0.113.${100 + index}`));
      }
      const settled = await Promise.all(mixed);
      await flow.service.drainMailDispatches();
      await settleDatabaseStatistics();
      const deadlocksAfter = await databaseDeadlockCount();

      const resendResults = settled.filter((observation): observation is ResendObservation =>
        "arm" in observation);
      const verifyResults = settled.filter((observation): observation is VerifyObservation =>
        !("arm" in observation));
      const account = await database.pool.query<{ state: string; binding_state: string }>(`
        SELECT u.state,c.state AS binding_state
        FROM identity."user" u
        JOIN identity.channel_binding c ON c.user_id=u.user_id AND c.channel_type='email'
        WHERE u.user_id=$1
      `, [registered.user.user_id]);
      const consumed = await database.pool.query<{ consumed: string }>(`
        SELECT count(consumed_at)::text AS consumed
        FROM identity.verification_token_credential credential
        JOIN identity.channel_binding binding USING (channel_binding_id)
        WHERE binding.user_id=$1
      `, [registered.user.user_id]);
      const audit = await readAuditChain();

      console.info(
        `[T9 VERIFY VS RESEND RED/GREEN] backend=postgres resends=${resendResults.length} `
        + `verifies=${verifyResults.length} `
        + `resend_statuses=${JSON.stringify(resendResults.map((result) => result.status))} `
        + `verify_statuses=${JSON.stringify(verifyResults.map((result) => result.status))} `
        + `non_typed=${JSON.stringify(settled.filter((result) =>
          result.body !== null && result.body.includes("INTERNAL_ERROR")))} `
        + `rejections=${settled.filter((result) => result.rejection !== null).length} `
        + `deadlocks_before=${deadlocksBefore} deadlocks_after=${deadlocksAfter} `
        + `deadlock_delta=${deadlocksAfter - deadlocksBefore} `
        + `user_state=${account.rows[0]!.state} binding_state=${account.rows[0]!.binding_state} `
        + `consumed=${consumed.rows[0]!.consumed} chain_root_count=${audit.rootCount} `
        + `chain_depth=${audit.chain.length}/${audit.totalRows}`
      );

      expect(deadlocksAfter - deadlocksBefore).toBe(0);
      for (const result of settled) {
        expect(result.rejection).toBeNull();
        expect(result.status).not.toBe(500);
        expect(result.body).not.toContain("INTERNAL_ERROR");
        expect(result.body).not.toContain("40P01");
        expect(result.body).not.toContain("deadlock");
      }
      expect(resendResults.map((result) => result.status))
        .toEqual(Array.from({ length: 16 }, () => 202));
      for (const result of resendResults) expect(result.body).toBe(RESEND_BODY);
      expect(verifyResults.filter((result) => result.status === 200)).toHaveLength(1);
      expect(verifyResults.filter((result) =>
        result.status === 200 && result.body === JSON.stringify({ status: "active" })
      )).toHaveLength(1);
      expect(verifyResults.filter((result) =>
        result.status === 400
        && result.body === JSON.stringify({
          error: "VERIFICATION_TOKEN_INVALID", message: "VERIFICATION_TOKEN_INVALID"
        })
      )).toHaveLength(15);
      expect(account.rows[0]).toEqual({ state: "active", binding_state: "verified" });
      expect(audit.rootCount).toBe(1);
      expect(audit.chain).toHaveLength(audit.totalRows);
      expect(verifyChain(audit.chain as ChainedAuditEvent[])).toBe(true);
    } finally {
      await flow.service.drainMailDispatches();
      await api.close();
    }
  }, 300_000);

  it("T9 admits exactly one send when 32 concurrent resends race one expired cooldown", async () => {
    // The race test above suspends the winner's transport, so its winner has
    // already committed the cooldown write before the other 31 arrive. This
    // check contends the read-decide-write window itself, which is the property
    // prepareVerificationResend's `FOR UPDATE OF c,u` exists to guarantee.
    const initialNow = new Date("2026-08-21T15:00:00.000Z");
    const sendInstant = new Date(
      initialNow.getTime() + basePolicy.verification.resendCooldownMs + 1
    );
    const mail = new MemoryMailSender();
    const flow = buildService({ mail, initialNow });
    const api = buildApi({ application: fixtureAskApplication(), registration: flow.service });
    try {
      const registered = await registerAccount(flow.service, "t9-single-send-race");
      expect(mail.messages).toHaveLength(1);
      flow.advance(basePolicy.verification.resendCooldownMs + 1);
      const deadlocksBefore = await databaseDeadlockCount();

      const observations = await Promise.all(Array.from({ length: 32 }, (_, index) =>
        injectResend(api, "existing", index, registered.email, `198.51.60.${index + 1}`)
      ));
      await flow.service.drainMailDispatches();
      await settleDatabaseStatistics();
      const deadlocksAfter = await databaseDeadlockCount();

      const preparation = await database.pool.query<{
        decision: string; success: boolean; justification: string | null;
      }>(`
        SELECT decision,success,justification FROM identity.audit_event
        WHERE event_type='identity.verification.resend_requested'
          AND actor_key_ref=$1 AND occurred_at=$2
      `, [registered.user.audit_token, sendInstant]);
      const credentials = await database.pool.query<{ credentials: string }>(`
        SELECT count(*)::text AS credentials
        FROM identity.verification_token_credential credential
        JOIN identity.channel_binding binding USING (channel_binding_id)
        WHERE binding.user_id=$1
      `, [registered.user.user_id]);
      const audit = await readAuditChain();

      console.info(
        `[T9 SINGLE SEND RACE RED/GREEN] backend=postgres requests=32 `
        + `statuses=${JSON.stringify([...new Set(observations.map((one) => one.status))])} `
        + `preparation_rows=${preparation.rowCount} `
        + `allow=${preparation.rows.filter((row) => row.decision === "ALLOW").length} `
        + `cooldown_deny=${preparation.rows.filter((row) =>
          row.justification === "RESEND_COOLDOWN").length} `
        + `mails=${mail.messages.length} credentials=${credentials.rows[0]!.credentials} `
        + `distinct_tokens=${new Set(mail.messages.map((message) => message.token)).size} `
        + `deadlock_delta=${deadlocksAfter - deadlocksBefore} `
        + `chain_root_count=${audit.rootCount} chain_depth=${audit.chain.length}/${audit.totalRows}`
      );

      for (const observation of observations) {
        expect(observation.status).toBe(202);
        expect(observation.body).toBe(RESEND_BODY);
        expect(observation.rejection).toBeNull();
      }
      expect(preparation.rows).toHaveLength(32);
      expect(preparation.rows.filter((row) => row.decision === "ALLOW" && row.success))
        .toHaveLength(1);
      expect(preparation.rows.filter((row) =>
        row.decision === "DENY" && row.justification === "RESEND_COOLDOWN"
      )).toHaveLength(31);
      expect(mail.messages).toHaveLength(2);
      expect(new Set(mail.messages.map((message) => message.token)).size).toBe(2);
      expect(credentials.rows[0]!.credentials).toBe("2");
      expect(deadlocksAfter - deadlocksBefore).toBe(0);
      expect(audit.rootCount).toBe(1);
      expect(audit.chain).toHaveLength(audit.totalRows);
      expect(verifyChain(audit.chain as ChainedAuditEvent[])).toBe(true);
    } finally {
      await flow.service.drainMailDispatches();
      await api.close();
    }
  }, 300_000);

  it("T9 holds mixed-contention resend arms at or below the n=32 same-arm null q99", async () => {
    const samplesPerArm = 32;
    const initialNow = new Date("2026-08-21T13:00:00.000Z");
    const mail = new MemoryMailSender();
    const flow = buildService({ mail, initialNow });
    const api = buildApi({ application: fixtureAskApplication(), registration: flow.service });
    try {
      const registered = await registerAccount(flow.service, "t9-equivalence-existing");
      flow.advance(basePolicy.verification.resendCooldownMs + 1);
      const deadlocksBefore = await databaseDeadlockCount();

      // One window, both labels alternating, every request from its own source.
      // The window is issued at a cadence the ruled verification dispatcher
      // sustains — every request occupies one of the 32 ruled concurrent
      // reservations for the ruled 5 700 ms minimum, so half-capacity steady
      // state is one request per (minimum reservation / half the ruled
      // concurrency). Exceeding that cap would split BOTH arms across an
      // immediate-grant mode and a queued-grant mode; that queueing mode is a
      // ruled availability property covered by S3d, it is assigned by arrival
      // order rather than by address, and on a bimodal mixture a median is a
      // knife-edge estimator of the mode split rather than of address
      // existence. The saturated 32-at-once case is separately covered by the
      // deterministic race test above.
      const windowCadenceMs = Math.ceil(
        basePolicy.channel.mailDispatchMinimumReservationMs
        / (basePolicy.channel.maxConcurrentVerificationDispatches / 2)
      );
      const issued: Array<Promise<ResendObservation>> = [];
      for (let index = 0; index < samplesPerArm * 2; index += 1) {
        const arm = index % 2 === 0 ? "existing" as const : "missing" as const;
        const slot = Math.floor(index / 2);
        issued.push(injectResend(
          api,
          arm,
          slot,
          arm === "existing"
            ? registered.email
            : `t9-equivalence-missing-${slot}@example.test`,
          `198.51.${arm === "existing" ? 10 : 20}.${slot + 1}`
        ));
        await new Promise<void>((resolve) => setTimeout(resolve, windowCadenceMs));
      }
      const window = await Promise.all(issued);
      await flow.service.drainMailDispatches();
      await settleDatabaseStatistics();
      const deadlocksAfter = await databaseDeadlockCount();

      const armScores = (arm: "existing" | "missing"): number[] => window
        .filter((observation) => observation.arm === arm)
        .map((observation) => observation.elapsedMs);
      const existingScores = armScores("existing");
      const missingScores = armScores("missing");
      expect(existingScores).toHaveLength(samplesPerArm);
      expect(missingScores).toHaveLength(samplesPerArm);

      const auc = aucSeparability(existingScores, missingScores);
      const classifier = bestSingleThresholdClassifierAccuracy(existingScores, missingScores);
      // Both nulls are drawn at the exact scored group size, from the same-arm
      // series only, so the ceiling carries this window's own dispersion.
      const existingNull = sameArmRelabelingNull(existingScores, samplesPerArm, 0x7c91);
      const missingNull = sameArmRelabelingNull(missingScores, samplesPerArm, 0x7c92);
      const aucCeiling = empiricalQuantile([...existingNull.auc, ...missingNull.auc], 0.99);
      const classifierCeiling = empiricalQuantile(
        [...existingNull.classifier, ...missingNull.classifier], 0.99
      );

      // Separated-series positive control: the same estimators must saturate
      // and clear both ceilings, so a passing window is not a dead measurement.
      const controlExisting = Array.from({ length: samplesPerArm }, (_, index) => 100 + index);
      const controlMissing = Array.from({ length: samplesPerArm }, (_, index) => 10_000 + index);
      const controlAuc = aucSeparability(controlExisting, controlMissing);
      const controlClassifier = bestSingleThresholdClassifierAccuracy(
        controlExisting, controlMissing
      );

      const medianGap = Math.abs(median(existingScores) - median(missingScores));
      console.info(
        `[T9 ENUMERATION EQUIVALENCE RED/GREEN] backend=postgres n_per_arm=${samplesPerArm} `
        + `window_cadence_ms=${windowCadenceMs} `
        + `null_group_size=${existingNull.groupSize}/${missingNull.groupSize} null_draws=2048 `
        + `cross_auc=${auc.toFixed(4)} null_auc_q99=${aucCeiling.toFixed(4)} `
        + `cross_accuracy=${classifier.toFixed(4)} null_accuracy_q99=${classifierCeiling.toFixed(4)} `
        + `control_auc=${controlAuc.toFixed(4)} control_accuracy=${controlClassifier.toFixed(4)} `
        + `existing_median_ms=${median(existingScores).toFixed(1)} `
        + `missing_median_ms=${median(missingScores).toFixed(1)} `
        + `median_gap_ms=${medianGap.toFixed(1)} tolerance_ms=${basePolicy.verification.enumerationToleranceMs} `
        + `statuses=${JSON.stringify([...new Set(window.map((observation) => observation.status))])} `
        + `deadlock_delta=${deadlocksAfter - deadlocksBefore} `
        + `existing_ms=${existingScores.map((score) => score.toFixed(1)).join(",")} `
        + `missing_ms=${missingScores.map((score) => score.toFixed(1)).join(",")}`
      );

      for (const observation of window) {
        expect(observation.status).toBe(202);
        expect(observation.body).toBe(RESEND_BODY);
        expect(observation.rejection).toBeNull();
      }
      expect(deadlocksAfter - deadlocksBefore).toBe(0);
      expect(existingNull.groupSize).toBe(samplesPerArm);
      expect(missingNull.groupSize).toBe(samplesPerArm);
      expect(aucCeiling).toBeLessThan(1);
      expect(classifierCeiling).toBeLessThan(1);
      expect(auc).toBeLessThanOrEqual(aucCeiling);
      expect(classifier).toBeLessThanOrEqual(classifierCeiling);
      expect(controlAuc).toBe(1);
      expect(controlClassifier).toBe(1);
      expect(controlAuc).toBeGreaterThan(aucCeiling);
      expect(controlClassifier).toBeGreaterThan(classifierCeiling);
      // Secondary policy check only; the null-calibrated metrics above gate.
      expect(medianGap).toBeLessThanOrEqual(basePolicy.verification.enumerationToleranceMs);
    } finally {
      await flow.service.drainMailDispatches();
      await api.close();
    }
  }, 300_000);

  it("T9-A serializes expired-token verification against an eligible resend without deadlock", async () => {
    const initialNow = new Date("2026-08-21T17:00:00.000Z");
    const mail = new MemoryMailSender();
    const flow = buildService({ mail, initialNow });
    const api = buildApi({ application: fixtureAskApplication(), registration: flow.service });
    const gate = await database.pool.connect();
    const monitor = await database.pool.connect();
    const prober = await database.pool.connect();
    let gateOpen = false;
    try {
      const registered = await registerAccount(flow.service, "t9-a-expired-verify");
      const expiredToken = mail.messages[0]!.token;
      const expiredHash = hashVerificationToken(expiredToken);
      const channelBindingId = await emailChannelOf(registered.user.user_id);
      // Production TTL and cooldown: past the token's own 24 h life the
      // credential is expired AND resend is eligible.
      flow.advance(basePolicy.verification.tokenTtlMs + 1);
      const deadlocksBefore = await databaseDeadlockCount();

      // External gate holds the account's email channel row.
      await gate.query("BEGIN");
      await gate.query(`
        SELECT channel_binding_id FROM identity.channel_binding
        WHERE channel_binding_id=$1 FOR UPDATE
      `, [channelBindingId]);
      gateOpen = true;

      // Resend first, and prove its backend really queued on that channel lock.
      const resending = injectResend(api, "existing", 0, registered.email, "198.51.70.1");
      const resendWaiters = await waitForLockWaiters(monitor, 1, 30_000);
      // Then the expired-token verification, which must also queue.
      const verifying = injectVerify(api, 0, expiredToken, "203.0.114.1");
      const bothWaiters = await waitForLockWaiters(monitor, 2, 30_000);

      // Non-vacuity: does verification hold the expired credential while it
      // waits? The ratified explicit order must not have touched credentials.
      await prober.query("BEGIN");
      const credentialProbe = await probeRowLock(prober, "credential", `
        SELECT token_hash FROM identity.verification_token_credential
        WHERE token_hash=$1 FOR UPDATE NOWAIT
      `, [expiredHash]);
      await prober.query("ROLLBACK");

      await gate.query("ROLLBACK");
      gateOpen = false;
      const [resend, verify] = await Promise.all([resending, verifying]);
      await flow.service.drainMailDispatches();
      await settleDatabaseStatistics();
      const deadlocksAfter = await databaseDeadlockCount();

      const credentials = await database.pool.query<{
        token_hash: string; consumed_at: Date | null; expires_at: Date;
      }>(`
        SELECT token_hash,consumed_at,expires_at
        FROM identity.verification_token_credential WHERE channel_binding_id=$1
      `, [channelBindingId]);
      const account = await database.pool.query<{ state: string; binding_state: string }>(`
        SELECT u.state,c.state AS binding_state
        FROM identity."user" u
        JOIN identity.channel_binding c ON c.channel_binding_id=$1
        WHERE u.user_id=$2
      `, [channelBindingId, registered.user.user_id]);
      const audit = await readAuditChain();

      console.info(
        `[T9-A EXPIRED VERIFY VS RESEND RED/GREEN] backend=postgres `
        + `resend_waiters=${resendWaiters} both_waiters=${bothWaiters} `
        + `credential_probe=${credentialProbe} `
        + `resend_status=${resend.status} verify_status=${verify.status} `
        + `resend_body=${JSON.stringify(resend.body)} verify_body=${JSON.stringify(verify.body)} `
        + `rejections=${[resend, verify].filter((one) => one.rejection !== null).length} `
        + `deadlock_delta=${deadlocksAfter - deadlocksBefore} `
        + `mails=${mail.messages.length} credentials=${credentials.rowCount} `
        + `expired_row_present=${credentials.rows.some((row) => row.token_hash === expiredHash)} `
        + `user_state=${account.rows[0]!.state} binding_state=${account.rows[0]!.binding_state} `
        + `chain_root_count=${audit.rootCount} chain_depth=${audit.chain.length}/${audit.totalRows}`
      );

      // Both requests genuinely queued on the same real row lock.
      expect(bothWaiters).toBeGreaterThanOrEqual(2);
      // Explicit c -> u -> token order: no credential is held while waiting on c.
      expect(credentialProbe).toBe("acquired");

      expect(resend.status).toBe(202);
      expect(resend.body).toBe(RESEND_BODY);
      expect(verify.status).toBe(400);
      expect(verify.body).toBe(JSON.stringify({
        error: "VERIFICATION_TOKEN_INVALID", message: "VERIFICATION_TOKEN_INVALID"
      }));
      for (const observation of [resend, verify]) {
        expect(observation.rejection).toBeNull();
        expect(databaseErrorLeak(observation.body)).toBe(false);
      }
      expect(deadlocksAfter - deadlocksBefore).toBe(0);

      // Exactly one eligible resend mail and credential; expired row pruned;
      // every live row preserved; no partial verification.
      expect(mail.messages).toHaveLength(2);
      expect(credentials.rows).toHaveLength(1);
      expect(credentials.rows[0]!.token_hash).toBe(hashVerificationToken(mail.messages[1]!.token));
      expect(credentials.rows[0]!.consumed_at).toBeNull();
      expect(credentials.rows.some((row) => row.token_hash === expiredHash)).toBe(false);
      expect(account.rows[0]).toEqual({
        state: "pending_verification", binding_state: "pending_verification"
      });
      expect(audit.rootCount).toBe(1);
      expect(audit.chain).toHaveLength(audit.totalRows);
      expect(verifyChain(audit.chain as ChainedAuditEvent[])).toBe(true);
    } finally {
      if (gateOpen) await gate.query("ROLLBACK").catch(() => undefined);
      gate.release();
      monitor.release();
      prober.release();
      await flow.service.drainMailDispatches();
      await api.close();
    }
  }, 300_000);

  it("T9-B1 serializes a duplicate registration against an eligible resend without deadlock", async () => {
    const initialNow = new Date("2026-08-21T18:00:00.000Z");
    const mail = new MemoryMailSender();
    const flow = buildService({ mail, initialNow });
    const api = buildApi({ application: fixtureAskApplication(), registration: flow.service });
    const monitor = await database.pool.connect();
    let barrier: QueryBarrier | undefined;
    try {
      const registered = await registerAccount(flow.service, "t9-b1-duplicate");
      const identityBefore = await database.pool.query<{
        user_id: string; pseudonym: string; password_hash: string; audit_token: string; state: string;
      }>(`
        SELECT user_id,pseudonym,password_hash,audit_token,state
        FROM identity."user" WHERE user_id=$1
      `, [registered.user.user_id]);
      flow.advance(basePolicy.verification.resendCooldownMs + 1);
      const deadlocksBefore = await databaseDeadlockCount();

      // Pause the real duplicate transaction the instant its user no-op update
      // returns, with that transaction still open and holding its real locks.
      barrier = installQueryBarrier((sql) =>
        sql.includes('UPDATE identity."user" SET state=state WHERE user_id=$1'));
      const registering = injectRegister(
        api, 0, registered.email, "t9-b1-duplicate-second-recovery@example.test", "198.51.71.1"
      );
      await barrier.reached;
      const resending = injectResend(api, "existing", 0, registered.email, "198.51.71.2");
      const waiters = await waitForLockWaiters(monitor, 1, 30_000);
      barrier.release();
      barrier = undefined;

      const [register, resend] = await Promise.all([registering, resending]);
      await flow.service.drainMailDispatches();
      await settleDatabaseStatistics();
      const deadlocksAfter = await databaseDeadlockCount();

      const users = await database.pool.query<{ users: string }>(`
        SELECT count(*)::text AS users FROM identity."user" WHERE email_blind_index=$1
      `, [registered.index]);
      const bindings = await database.pool.query<{ channel_type: string }>(`
        SELECT channel_type FROM identity.channel_binding WHERE user_id=$1 ORDER BY channel_type
      `, [registered.user.user_id]);
      const identityAfter = await database.pool.query<{
        user_id: string; pseudonym: string; password_hash: string; audit_token: string; state: string;
      }>(`
        SELECT user_id,pseudonym,password_hash,audit_token,state
        FROM identity."user" WHERE user_id=$1
      `, [registered.user.user_id]);
      const duplicateAudit = await database.pool.query<{ event_type: string; justification: string | null }>(`
        SELECT event_type,justification FROM identity.audit_event
        WHERE actor_key_ref=$1 AND event_type IN (
          'identity.registration','identity.registration.duplicate_postwork'
        ) AND decision='DENY'
      `, [registered.user.audit_token]);
      const credentials = await database.pool.query<{ credentials: string }>(`
        SELECT count(*)::text AS credentials FROM identity.verification_token_credential
        WHERE channel_binding_id=$1
      `, [await emailChannelOf(registered.user.user_id)]);
      const audit = await readAuditChain();

      console.info(
        `[T9-B1 DUPLICATE VS RESEND RED/GREEN] backend=postgres lock_waiters=${waiters} `
        + `register_status=${register.status} resend_status=${resend.status} `
        + `register_body=${JSON.stringify(register.body)} resend_body=${JSON.stringify(resend.body)} `
        + `rejections=${[register, resend].filter((one) => one.rejection !== null).length} `
        + `deadlock_delta=${deadlocksAfter - deadlocksBefore} users=${users.rows[0]!.users} `
        + `bindings=${JSON.stringify(bindings.rows.map((row) => row.channel_type))} `
        + `duplicate_audits=${JSON.stringify(duplicateAudit.rows.map((row) => row.event_type))} `
        + `mails=${mail.messages.length} credentials=${credentials.rows[0]!.credentials} `
        + `chain_root_count=${audit.rootCount} chain_depth=${audit.chain.length}/${audit.totalRows}`
      );

      expect(waiters).toBeGreaterThanOrEqual(1);
      expect(register.status).toBe(202);
      expect(register.body).toBe(JSON.stringify(REGISTRATION_PUBLIC_RESPONSE));
      expect(resend.status).toBe(202);
      expect(resend.body).toBe(RESEND_BODY);
      for (const observation of [register, resend]) {
        expect(observation.rejection).toBeNull();
        expect(databaseErrorLeak(observation.body)).toBe(false);
      }
      expect(deadlocksAfter - deadlocksBefore).toBe(0);
      expect(users.rows[0]!.users).toBe("1");
      expect(bindings.rows.map((row) => row.channel_type)).toEqual(["email", "recovery_email"]);
      expect(identityAfter.rows[0]).toEqual(identityBefore.rows[0]);
      expect(duplicateAudit.rows.filter((row) => row.event_type === "identity.registration"))
        .toHaveLength(1);
      expect(duplicateAudit.rows.filter((row) =>
        row.event_type === "identity.registration.duplicate_postwork")).toHaveLength(1);
      expect(mail.messages).toHaveLength(2);
      expect(credentials.rows[0]!.credentials).toBe("2");
      expect(audit.rootCount).toBe(1);
      expect(audit.chain).toHaveLength(audit.totalRows);
      expect(verifyChain(audit.chain as ChainedAuditEvent[])).toBe(true);
    } finally {
      barrier?.release();
      monitor.release();
      await flow.service.drainMailDispatches();
      await api.close();
    }
  }, 300_000);

  it("T9-B2 serializes duplicate postwork against an eligible resend without deadlock", async () => {
    const initialNow = new Date("2026-08-21T19:00:00.000Z");
    const mail = new MemoryMailSender();
    const flow = buildService({ mail, initialNow });
    const api = buildApi({ application: fixtureAskApplication(), registration: flow.service });
    const monitor = await database.pool.connect();
    let barrier: QueryBarrier | undefined;
    try {
      const registered = await registerAccount(flow.service, "t9-b2-postwork");
      flow.advance(basePolicy.verification.resendCooldownMs + 1);
      const deadlocksBefore = await databaseDeadlockCount();

      // Pause the real scheduled duplicate postwork transaction the instant its
      // user-lock query returns.
      barrier = installQueryBarrier((sql) =>
        sql.includes('SELECT audit_token FROM identity."user" WHERE user_id=$1 FOR UPDATE'));
      const registering = injectRegister(
        api, 0, registered.email, "t9-b2-duplicate-second-recovery@example.test", "198.51.72.1"
      );
      await barrier.reached;
      const resending = injectResend(api, "existing", 0, registered.email, "198.51.72.2");
      const waiters = await waitForLockWaiters(monitor, 1, 60_000);
      barrier.release();
      barrier = undefined;

      const [register, resend] = await Promise.all([registering, resending]);
      await flow.service.drainMailDispatches();
      await settleDatabaseStatistics();
      const deadlocksAfter = await databaseDeadlockCount();

      const duplicateAudit = await database.pool.query<{ event_type: string }>(`
        SELECT event_type FROM identity.audit_event
        WHERE actor_key_ref=$1 AND event_type IN (
          'identity.registration','identity.registration.duplicate_postwork'
        ) AND decision='DENY'
      `, [registered.user.audit_token]);
      const credentials = await database.pool.query<{ credentials: string }>(`
        SELECT count(*)::text AS credentials FROM identity.verification_token_credential
        WHERE channel_binding_id=$1
      `, [await emailChannelOf(registered.user.user_id)]);
      const audit = await readAuditChain();

      console.info(
        `[T9-B2 POSTWORK VS RESEND RED/GREEN] backend=postgres lock_waiters=${waiters} `
        + `register_status=${register.status} resend_status=${resend.status} `
        + `register_body=${JSON.stringify(register.body)} resend_body=${JSON.stringify(resend.body)} `
        + `rejections=${[register, resend].filter((one) => one.rejection !== null).length} `
        + `deadlock_delta=${deadlocksAfter - deadlocksBefore} `
        + `duplicate_audits=${JSON.stringify(duplicateAudit.rows.map((row) => row.event_type))} `
        + `mails=${mail.messages.length} credentials=${credentials.rows[0]!.credentials} `
        + `chain_root_count=${audit.rootCount} chain_depth=${audit.chain.length}/${audit.totalRows}`
      );

      expect(waiters).toBeGreaterThanOrEqual(1);
      expect(register.status).toBe(202);
      expect(register.body).toBe(JSON.stringify(REGISTRATION_PUBLIC_RESPONSE));
      expect(resend.status).toBe(202);
      expect(resend.body).toBe(RESEND_BODY);
      for (const observation of [register, resend]) {
        expect(observation.rejection).toBeNull();
        expect(databaseErrorLeak(observation.body)).toBe(false);
      }
      expect(deadlocksAfter - deadlocksBefore).toBe(0);
      // Neither lost nor doubled: exactly one of each duplicate audit event.
      expect(duplicateAudit.rows.filter((row) => row.event_type === "identity.registration"))
        .toHaveLength(1);
      expect(duplicateAudit.rows.filter((row) =>
        row.event_type === "identity.registration.duplicate_postwork")).toHaveLength(1);
      expect(mail.messages).toHaveLength(2);
      expect(credentials.rows[0]!.credentials).toBe("2");
      expect(audit.rootCount).toBe(1);
      expect(audit.chain).toHaveLength(audit.totalRows);
      expect(verifyChain(audit.chain as ChainedAuditEvent[])).toBe(true);
    } finally {
      barrier?.release();
      monitor.release();
      await flow.service.drainMailDispatches();
      await api.close();
    }
  }, 300_000);

  it("T9-E serializes the asynchronous delivery record against an eligible resend", async () => {
    // The 32-request race above reaches this same cycle only through natural
    // timing, so it detects a reverted delivery lock order non-deterministically.
    // This gate forces the interleaving: the delivery transaction is paused the
    // instant its first locking statement returns, and a real resend is launched
    // into it.
    const initialNow = new Date("2026-08-21T22:00:00.000Z");
    const mail = new MemoryMailSender();
    const flow = buildService({ mail, initialNow });
    const api = buildApi({ application: fixtureAskApplication(), registration: flow.service });
    const monitor = await database.pool.connect();
    let barrier: QueryBarrier | undefined;
    try {
      const registered = await registerAccount(flow.service, "t9-e-delivery-order");
      flow.advance(basePolicy.verification.resendCooldownMs + 1);
      const deadlocksBefore = await databaseDeadlockCount();

      // Matches the delivery record's first locking statement in either shape,
      // and never the resend preparation, which is keyed by blind index.
      barrier = installQueryBarrier((sql) =>
        sql.includes("audit_token") && sql.includes("FOR UPDATE")
        && !sql.includes("email_blind_index")
        && !sql.includes("verification_token_credential"));
      const eligible = await injectResend(api, "existing", 0, registered.email, "198.51.74.1");
      await barrier.reached;
      const contending = injectResend(api, "existing", 1, registered.email, "198.51.74.2");
      const waiters = await waitForLockWaiters(monitor, 1, 30_000);
      barrier.release();
      barrier = undefined;

      const contended = await contending;
      await flow.service.drainMailDispatches();
      await settleDatabaseStatistics();
      const deadlocksAfter = await databaseDeadlockCount();

      const binding = await database.pool.query<{
        delivery_status: string; delivery_error: string | null;
      }>(`
        SELECT delivery_status,delivery_error FROM identity.channel_binding
        WHERE user_id=$1 AND channel_type='email'
      `, [registered.user.user_id]);
      const deliveryAudit = await database.pool.query<{ event_type: string }>(`
        SELECT event_type FROM identity.audit_event
        WHERE actor_key_ref=$1 AND event_type IN (
          'identity.verification.sent','identity.verification.delivery_record_failed'
        )
      `, [registered.user.audit_token]);
      const audit = await readAuditChain();

      console.info(
        `[T9-E DELIVERY VS RESEND RED/GREEN] backend=postgres lock_waiters=${waiters} `
        + `eligible_status=${eligible.status} contended_status=${contended.status} `
        + `contended_body=${JSON.stringify(contended.body)} `
        + `rejections=${[eligible, contended].filter((one) => one.rejection !== null).length} `
        + `deadlock_delta=${deadlocksAfter - deadlocksBefore} `
        + `delivery_status=${binding.rows[0]!.delivery_status} `
        + `delivery_audit=${JSON.stringify(deliveryAudit.rows.map((row) => row.event_type))} `
        + `chain_root_count=${audit.rootCount} chain_depth=${audit.chain.length}/${audit.totalRows}`
      );

      expect(waiters).toBeGreaterThanOrEqual(1);
      expect(eligible.status).toBe(202);
      expect(contended.status).toBe(202);
      expect(contended.body).toBe(RESEND_BODY);
      for (const observation of [eligible, contended]) {
        expect(observation.rejection).toBeNull();
        expect(databaseErrorLeak(observation.body)).toBe(false);
      }
      expect(deadlocksAfter - deadlocksBefore).toBe(0);
      // The delivery transaction itself must also have survived the contention.
      expect(binding.rows[0]!.delivery_status).toBe("sent");
      expect(binding.rows[0]!.delivery_error).toBeNull();
      expect(deliveryAudit.rows.filter((row) =>
        row.event_type === "identity.verification.delivery_record_failed")).toEqual([]);
      expect(deliveryAudit.rows.filter((row) =>
        row.event_type === "identity.verification.sent")).toHaveLength(2);
      expect(audit.rootCount).toBe(1);
      expect(audit.chain).toHaveLength(audit.totalRows);
      expect(verifyChain(audit.chain as ChainedAuditEvent[])).toBe(true);
    } finally {
      barrier?.release();
      monitor.release();
      await flow.service.drainMailDispatches();
      await api.close();
    }
  }, 300_000);

  it("T9-C proves verification takes the channel before the user and credentials last", async () => {
    const initialNow = new Date("2026-08-21T20:00:00.000Z");
    const mail = new MemoryMailSender();
    const flow = buildService({ mail, initialNow });
    const api = buildApi({ application: fixtureAskApplication(), registration: flow.service });
    const gate = await database.pool.connect();
    const monitor = await database.pool.connect();
    const prober = await database.pool.connect();
    let gateOpen = false;
    try {
      const registered = await registerAccount(flow.service, "t9-c-explicit-order");
      const liveToken = mail.messages[0]!.token;
      const liveHash = hashVerificationToken(liveToken);
      const channelBindingId = await emailChannelOf(registered.user.user_id);
      const deadlocksBefore = await databaseDeadlockCount();

      // External gate holds the USER row only.
      await gate.query("BEGIN");
      await gate.query(`
        SELECT user_id FROM identity."user" WHERE user_id=$1 FOR UPDATE
      `, [registered.user.user_id]);
      gateOpen = true;

      const verifying = injectVerify(api, 0, liveToken, "203.0.115.1");
      const waiters = await waitForLockWaiters(monitor, 1, 30_000);

      await prober.query("BEGIN");
      const channelProbe = await probeRowLock(prober, "channel", `
        SELECT channel_binding_id FROM identity.channel_binding
        WHERE channel_binding_id=$1 FOR UPDATE NOWAIT
      `, [channelBindingId]);
      const credentialProbe = await probeRowLock(prober, "credential", `
        SELECT token_hash FROM identity.verification_token_credential
        WHERE token_hash=$1 FOR UPDATE NOWAIT
      `, [liveHash]);
      await prober.query("ROLLBACK");

      await gate.query("ROLLBACK");
      gateOpen = false;
      const verify = await verifying;
      await flow.service.drainMailDispatches();
      await settleDatabaseStatistics();
      const deadlocksAfter = await databaseDeadlockCount();

      const server = await database.pool.query<{ version: string }>("SELECT version()");
      const account = await database.pool.query<{ state: string; binding_state: string }>(`
        SELECT u.state,c.state AS binding_state
        FROM identity."user" u
        JOIN identity.channel_binding c ON c.channel_binding_id=$1
        WHERE u.user_id=$2
      `, [channelBindingId, registered.user.user_id]);

      console.info(
        `[T9-C EXPLICIT ORDER PROOF] server=${JSON.stringify(server.rows[0]!.version)} `
        + `blocked_on_user_waiters=${waiters} channel_probe=${channelProbe} `
        + `credential_probe=${credentialProbe} verify_status=${verify.status} `
        + `verify_body=${JSON.stringify(verify.body)} `
        + `deadlock_delta=${deadlocksAfter - deadlocksBefore} `
        + `user_state=${account.rows[0]!.state} binding_state=${account.rows[0]!.binding_state} `
        + `statements=${JSON.stringify([
          'SELECT channel_binding_id FROM identity.channel_binding WHERE channel_binding_id=$1 FOR UPDATE NOWAIT',
          'SELECT token_hash FROM identity.verification_token_credential WHERE token_hash=$1 FOR UPDATE NOWAIT'
        ])}`
      );

      expect(waiters).toBeGreaterThanOrEqual(1);
      // Already holds the email channel row...
      expect(channelProbe).toBe("locked");
      // ...and has not yet touched any credential row.
      expect(credentialProbe).toBe("acquired");
      expect(verify.status).toBe(200);
      expect(verify.body).toBe(JSON.stringify({ status: "active" }));
      expect(verify.rejection).toBeNull();
      expect(deadlocksAfter - deadlocksBefore).toBe(0);
      expect(account.rows[0]).toEqual({ state: "active", binding_state: "verified" });
    } finally {
      if (gateOpen) await gate.query("ROLLBACK").catch(() => undefined);
      gate.release();
      monitor.release();
      prober.release();
      await flow.service.drainMailDispatches();
      await api.close();
    }
  }, 300_000);

  it("T9-D activates exactly once when two live sibling tokens verify simultaneously", async () => {
    const initialNow = new Date("2026-08-21T21:00:00.000Z");
    const mail = new MemoryMailSender();
    const flow = buildService({ mail, initialNow });
    const api = buildApi({ application: fixtureAskApplication(), registration: flow.service });
    try {
      const registered = await registerAccount(flow.service, "t9-d-siblings");
      const channelBindingId = await emailChannelOf(registered.user.user_id);
      flow.advance(basePolicy.verification.resendCooldownMs + 1);
      await expect(injectResend(api, "existing", 0, registered.email, "198.51.73.1"))
        .resolves.toMatchObject({ status: 202 });
      await flow.service.drainMailDispatches();
      expect(mail.messages).toHaveLength(2);
      const live = await database.pool.query<{ live: string }>(`
        SELECT count(*)::text AS live FROM identity.verification_token_credential
        WHERE channel_binding_id=$1 AND consumed_at IS NULL AND expires_at>=$2
      `, [channelBindingId, new Date(initialNow.getTime() + basePolicy.verification.resendCooldownMs + 1)]);
      expect(live.rows[0]!.live).toBe("2");
      const deadlocksBefore = await databaseDeadlockCount();

      const [first, second] = await Promise.all([
        injectVerify(api, 0, mail.messages[0]!.token, "203.0.116.1"),
        injectVerify(api, 1, mail.messages[1]!.token, "203.0.116.2")
      ]);
      await flow.service.drainMailDispatches();
      await settleDatabaseStatistics();
      const deadlocksAfter = await databaseDeadlockCount();

      const credentials = await database.pool.query<{ total: string; consumed: string }>(`
        SELECT count(*)::text AS total,count(consumed_at)::text AS consumed
        FROM identity.verification_token_credential WHERE channel_binding_id=$1
      `, [channelBindingId]);
      const account = await database.pool.query<{ state: string; binding_state: string }>(`
        SELECT u.state,c.state AS binding_state
        FROM identity."user" u
        JOIN identity.channel_binding c ON c.channel_binding_id=$1
        WHERE u.user_id=$2
      `, [channelBindingId, registered.user.user_id]);
      const consumedAudit = await database.pool.query<{ decision: string; success: boolean }>(`
        SELECT decision,success FROM identity.audit_event
        WHERE event_type='identity.verification.consumed' AND actor_key_ref=$1
      `, [registered.user.audit_token]);
      const audit = await readAuditChain();

      console.info(
        `[T9-D SIBLING TOKENS RED/GREEN] backend=postgres `
        + `statuses=${JSON.stringify([first.status, second.status])} `
        + `bodies=${JSON.stringify([first.body, second.body])} `
        + `rejections=${[first, second].filter((one) => one.rejection !== null).length} `
        + `deadlock_delta=${deadlocksAfter - deadlocksBefore} `
        + `credentials=${credentials.rows[0]!.consumed}/${credentials.rows[0]!.total} consumed `
        + `user_state=${account.rows[0]!.state} binding_state=${account.rows[0]!.binding_state} `
        + `consumed_audit=${JSON.stringify(consumedAudit.rows)} `
        + `chain_root_count=${audit.rootCount} chain_depth=${audit.chain.length}/${audit.totalRows}`
      );

      expect(deadlocksAfter - deadlocksBefore).toBe(0);
      for (const observation of [first, second]) {
        expect(observation.rejection).toBeNull();
        expect(databaseErrorLeak(observation.body)).toBe(false);
      }
      expect([first, second].filter((one) => one.status === 200)).toHaveLength(1);
      expect([first, second].filter((one) =>
        one.status === 200 && one.body === JSON.stringify({ status: "active" }))).toHaveLength(1);
      expect([first, second].filter((one) =>
        one.status === 400 && one.body === JSON.stringify({
          error: "VERIFICATION_TOKEN_INVALID", message: "VERIFICATION_TOKEN_INVALID"
        }))).toHaveLength(1);
      expect(account.rows[0]).toEqual({ state: "active", binding_state: "verified" });
      // Whole family consumed: no live sibling remains.
      expect(credentials.rows[0]!.total).toBe("2");
      expect(credentials.rows[0]!.consumed).toBe("2");
      expect(consumedAudit.rows.filter((row) => row.decision === "ALLOW" && row.success))
        .toHaveLength(1);
      expect(audit.rootCount).toBe(1);
      expect(audit.chain).toHaveLength(audit.totalRows);
      expect(verifyChain(audit.chain as ChainedAuditEvent[])).toBe(true);
    } finally {
      await flow.service.drainMailDispatches();
      await api.close();
    }
  }, 300_000);
});

describe("S3 VR-3 audit writer and rate-limit evidence", () => {
  it("persists one finalized refusal row with the bounded route-window count and preserves the chain", async () => {
    const rateLimits = Object.freeze({
      ...basePolicy.rateLimits,
      verify: Object.freeze({
        ...basePolicy.rateLimits.verify,
        admissionPerSource: 1,
        perIp: 1,
        perAddress: 100
      })
    });
    const initialNow = new Date("2026-08-20T07:00:00.000Z");
    const refusalAuditIntervalMs = 25;
    const policy = withPolicy({ rateLimits, rateLimitRefusalAuditIntervalMs: refusalAuditIntervalMs });
    const flow = buildService({ policy, initialNow });
    const token = generateVerificationToken();
    await expect(flow.service.verifyEmail({ token }, source))
      .rejects.toMatchObject({ code: "VERIFICATION_TOKEN_INVALID" });
    const refusals = 40;
    for (let index = 0; index < refusals; index += 1) {
      await expect(flow.service.verifyEmail({ token }, source))
        .rejects.toMatchObject({ code: "AUTH_RATE_LIMITED" });
    }
    await flow.service.drainRateLimitAuditFlushes();

    const windowStartedAt = new Date(
      Math.floor(initialNow.getTime() / refusalAuditIntervalMs) * refusalAuditIntervalMs
    );
    const summaries = await database.pool.query<{ justification: string }>(`
      SELECT justification FROM identity.audit_event
      WHERE event_type='identity.auth.rate_limit_refused' AND target_type='auth.verify'
        AND justification LIKE $1
    `, [`%window:${windowStartedAt.toISOString()}%`]);
    const rows = await database.pool.query<{
      audit_id: string; prev_hash: Buffer | null; this_hash: Buffer; actor_ciphertext: null;
      actor_key_ref: string; event_type: string; target_type: string; target_id: string;
      occurred_at: Date; source_context: Record<string, unknown>; decision: string;
      success: boolean; justification: string | null; depth: number;
    }>(`
      WITH RECURSIVE chain AS (
        SELECT a.*, 1 AS depth FROM identity.audit_event a WHERE a.prev_hash IS NULL
        UNION ALL
        SELECT child.*, chain.depth + 1
        FROM identity.audit_event child JOIN chain ON child.prev_hash=chain.this_hash
      ) SELECT * FROM chain ORDER BY depth
    `);
    const chain: ChainedAuditEvent[] = rows.rows.map((row) => ({
      auditId: row.audit_id, actorCiphertext: row.actor_ciphertext,
      actorKeyRef: row.actor_key_ref, eventType: row.event_type,
      targetType: row.target_type, targetId: row.target_id, occurredAt: row.occurred_at,
      sourceContext: row.source_context, decision: row.decision, success: row.success,
      justification: row.justification, prevHash: row.prev_hash?.toString("hex") ?? null,
      thisHash: row.this_hash.toString("hex")
    }));
    const chainValid = verifyChain(chain);
    console.info(
      `[S3 W2 RED/GREEN] refusals=${refusals} immutable_rows=${summaries.rowCount} `
      + `summary=${summaries.rows[0]?.justification ?? "missing"} chain_valid=${String(chainValid)}`
    );
    expect(summaries.rows).toEqual([{
      justification: `aggregate:route-window;route:verify;window:${windowStartedAt.toISOString()};count:${refusals};ip_count:${refusals};address_count:0`
    }]);
    expect(chainValid).toBe(true);
  });

  it("S3 rework4 B4 derives stable domain-separated IP and UA Argon2id hashes without request-id hashes", async () => {
    const rotatedSalt = Buffer.alloc(32, 0x7f);
    const flow = buildService();
    const registered = await registerAccount(flow.service, "source-ip-hash");
    await flow.service.resendVerification({ email: registered.email }, source);
    const initial = await database.pool.query<{ source_context: Record<string, unknown> }>(`
      SELECT source_context FROM identity.audit_event WHERE actor_key_ref=$1 ORDER BY occurred_at,audit_id
    `, [registered.user.audit_token]);
    const initialHashes = initial.rows.map((row) => row.source_context.ipArgon2id);
    const initialUserAgentHashes = initial.rows.map((row) => row.source_context.userAgentArgon2id);

    const rotatedActor = randomUUID();
    const rotatedRepository = new PostgresIdentityRepository(
      database.pool, rotatedSalt, basePolicy.auditSourceIpKdf
    );
    const startedAt = performance.now();
    await rotatedRepository.recordRateLimitRefusal({
      actorToken: rotatedActor,
      route: "register",
      scope: "ip",
      count: 1,
      ipCount: 1,
      addressCount: 0,
      occurredAt: new Date("2026-08-19T12:30:00.000Z"),
      aggregateWindowStartedAt: new Date("2026-08-19T12:30:00.000Z"),
      source
    });
    const perCallMs = performance.now() - startedAt;
    const rotated = await database.pool.query<{ source_context: Record<string, unknown> }>(`
      SELECT source_context FROM identity.audit_event WHERE actor_key_ref=$1
    `, [rotatedActor]);
    const rotatedHash = rotated.rows[0]!.source_context.ipArgon2id;
    const rawIpHits = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM identity.audit_event a
      WHERE position($1 in row_to_json(a)::text) > 0
    `, [source.ip]);
    const rawUserAgentHits = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM identity.audit_event a
      WHERE position($1 in row_to_json(a)::text) > 0
    `, [source.userAgent]);
    const ruledPerCallUpperBoundMs = 250;
    console.info(
      `[S3 VR-7 RED/GREEN] algorithm=argon2id memory_kib=19456 iterations=2 parallelism=1 `
      + `per_call_ms=${perCallMs.toFixed(1)} upper_bound_ms=${ruledPerCallUpperBoundMs} `
      + `raw_ip_hits=${rawIpHits.rows[0]!.count} stable_hashes=${new Set(initialHashes).size} `
      + `rotated_differs=${String(rotatedHash !== initialHashes[0])}`
    );

    expect(rawIpHits.rows[0]!.count).toBe("0");
    expect(initialHashes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(initialHashes).size).toBe(1);
    expect(rawUserAgentHits.rows[0]!.count).toBe("0");
    expect(new Set(initialUserAgentHashes).size).toBe(1);
    expect(initialUserAgentHashes[0]).toBe("ccd7683984b8cbe853f4655f53ee8c2f45f4000b4f68f91624feba495692b942");
    expect(initial.rows.every((row) => !("userAgentSha256" in row.source_context))).toBe(true);
    expect(initial.rows.every((row) => !("requestIdSha256" in row.source_context))).toBe(true);
    expect(initialHashes[0]).toBe("bc33e4290731dba35a02649416982c5801e1074dfc5aed0fea14c27aa4ce7540");
    expect(rotatedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rotatedHash).not.toBe(initialHashes[0]);
    expect(perCallMs).toBeLessThan(ruledPerCallUpperBoundMs);
  });

  it("S3 rework4 B5 preserves the typed 429 when a finalized refusal audit write fails", async () => {
    const rateLimits = Object.freeze({
      ...basePolicy.rateLimits,
      verify: Object.freeze({
        ...basePolicy.rateLimits.verify,
        admissionPerSource: 1,
        perIp: 1,
        perAddress: 100
      })
    });
    const flow = buildService({
      policy: withPolicy({ rateLimits, rateLimitRefusalAuditIntervalMs: 60_000 }),
      initialNow: new Date("2026-08-20T07:00:00.000Z")
    });
    const token = generateVerificationToken();
    await expect(flow.service.verifyEmail({ token }, source))
      .rejects.toMatchObject({ code: "VERIFICATION_TOKEN_INVALID" });
    await expect(flow.service.verifyEmail({ token }, source))
      .rejects.toMatchObject({ code: "AUTH_RATE_LIMITED" });
    vi.spyOn(flow.repository, "recordRateLimitRefusal")
      .mockRejectedValueOnce(new Error("password authentication failed for postgres://secret"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    flow.advance(60_000);
    try {
      await expect(flow.service.verifyEmail({ token }, source))
        .rejects.toMatchObject({ code: "AUTH_RATE_LIMITED", statusCode: 429 });
      expect(error).toHaveBeenCalledWith(expect.stringMatching(
        /^\[AUTH_RATE_LIMIT_AUDIT_RECORD_FAILED\] route=verify window=/
      ));
    } finally {
      error.mockRestore();
    }
  });

  it("S3 rework4 fold-in refreshes verification and resend clocks after repository awaits", async () => {
    const initial = new Date("2026-08-20T08:00:00.000Z");
    const verifyFlow = buildService({ initialNow: initial });
    vi.spyOn(verifyFlow.repository, "findAuditIdentityByVerificationHash")
      .mockImplementationOnce(async () => {
        verifyFlow.advance(1_000);
        return null;
      });
    const consume = vi.spyOn(verifyFlow.repository, "consumeVerification").mockResolvedValueOnce(false);
    await expect(verifyFlow.service.verifyEmail({ token: generateVerificationToken() }, source))
      .rejects.toMatchObject({ code: "VERIFICATION_TOKEN_INVALID" });
    expect(consume.mock.calls[0]![0].occurredAt.toISOString()).toBe("2026-08-20T08:00:01.000Z");

    const resendFlow = buildService({ initialNow: initial });
    vi.spyOn(resendFlow.repository, "findAuditIdentityByBlindIndex")
      .mockImplementationOnce(async () => {
        resendFlow.advance(1_000);
        return null;
      });
    const prepare = vi.spyOn(resendFlow.repository, "prepareVerificationResend")
      .mockResolvedValueOnce({ status: "ignored" });
    await resendFlow.service.resendVerification({ email: "clock-refresh@example.test" }, source);
    expect(prepare.mock.calls[0]![0].occurredAt.toISOString()).toBe("2026-08-20T08:00:01.000Z");
  });

  it("S3 rework4 fold-in seeds all auth policy rows and installs structural VR-3 checks", async () => {
    const bootstrap = await loadBootstrapRegister();
    await persistBootstrapRegister(database.pool, bootstrap);
    await expect(readAuthPolicy(database.pool, bootstrap.registerVersion)).resolves.toEqual(basePolicy);
    const policyRows = await database.pool.query<{ row_key: string }>(`
      SELECT row_key FROM register.register_row
      WHERE register_version=$1 AND row_key=ANY($2::text[]) ORDER BY row_key
    `, [bootstrap.registerVersion, AUTH_POLICY_REGISTER_ROWS.map((row) => row.rowKey)]);
    expect(policyRows.rows.map((row) => row.row_key)).toEqual(
      [...AUTH_POLICY_REGISTER_ROWS.map((row) => row.rowKey)].sort()
    );
    const constraints = await database.pool.query<{ conname: string }>(`
      SELECT conname FROM pg_constraint
      WHERE conrelid='identity.audit_event'::regclass
        AND conname=ANY($1::text[]) ORDER BY conname
    `, [["audit_event_actor_ciphertext_null", "audit_event_target_id_no_email"]]);
    expect(constraints.rows.map((row) => row.conname)).toEqual([
      "audit_event_actor_ciphertext_null", "audit_event_target_id_no_email"
    ]);
  });

  it("audits refusals and leaves no user material in any audit column after real account deletion while the chain verifies", async () => {
    const lowRegisterLimit = {
      ...basePolicy.rateLimits,
      register: {
        ...basePolicy.rateLimits.register,
        admissionPerSource: 1,
        perAddress: 1,
        perIp: 20
      },
      verify: {
        ...basePolicy.rateLimits.verify,
        admissionPerSource: 1,
        perAddress: 1,
        perIp: 20
      },
      resend: {
        ...basePolicy.rateLimits.resend,
        admissionPerSource: 1,
        perAddress: 1,
        perIp: 20
      }
    };
    const policy = withPolicy({
      rateLimits: Object.freeze(lowRegisterLimit),
      rateLimitRefusalAuditIntervalMs: 25
    });
    const flow = buildService({ policy });
    const registered = await registerAccount(flow.service, "vr3-delete");
    const pseudonym = registered.user.pseudonym;
    const userId = registered.user.user_id;
    const auditToken = registered.user.audit_token;
    const rawToken = (flow.mail as MemoryMailSender).messages[0]!.token;

    await flow.service.verifyEmail({ token: rawToken }, source);
    await expect(flow.service.verifyEmail({ token: rawToken }, source))
      .rejects.toMatchObject({ code: "AUTH_RATE_LIMITED" });
    await expect(flow.service.resendVerification({ email: registered.email }, source))
      .resolves.toEqual(RESEND_PUBLIC_RESPONSE);
    await expect(flow.service.resendVerification({ email: registered.email }, source))
      .rejects.toMatchObject({ code: "AUTH_RATE_LIMITED" });
    await expect(flow.service.register({
      email: registered.email,
      password: "another valid password",
      recoveryEmail: registered.recoveryEmail,
      adultAffirmed: true
    }, source)).rejects.toMatchObject({ code: "AUTH_RATE_LIMITED" });
    await flow.service.drainRateLimitAuditFlushes();
    const refusal = await database.pool.query<{ target_type: string }>(`
      SELECT target_type FROM identity.audit_event
      WHERE event_type='identity.auth.rate_limit_refused'
    `);
    expect(refusal.rows.map((row) => row.target_type)).toEqual(expect.arrayContaining([
      "auth.register", "auth.verify", "auth.resend"
    ]));

    await database.pool.query(`DELETE FROM identity."user" WHERE user_id=$1`, [userId]);
    const indexHex = registered.index.toString("hex");
    for (const forbidden of [userId, registered.email, indexHex, pseudonym]) {
      const found = await database.pool.query<{ audit_id: string }>(`
        SELECT audit_id FROM identity.audit_event AS audit_row
        WHERE position(lower($1) in lower(audit_row::text)) > 0
      `, [forbidden]);
      expect(found.rows, `audit row retained ${forbidden}`).toEqual([]);
    }
    const actorColumns = await database.pool.query<{
      actor_ciphertext: unknown;
      actor_key_ref: string;
      target_id: string;
    }>(`SELECT actor_ciphertext,actor_key_ref,target_id FROM identity.audit_event`);
    expect(actorColumns.rows.every((row) => row.actor_ciphertext === null)).toBe(true);
    expect(actorColumns.rows.some((row) => row.actor_key_ref === auditToken)).toBe(true);
    expect(actorColumns.rows.every((row) => row.target_id === row.actor_key_ref)).toBe(true);
    expect(auditToken).not.toBe(userId);

    const rows = await database.pool.query<{
      audit_id: string;
      prev_hash: Buffer | null;
      this_hash: Buffer;
      actor_ciphertext: null;
      actor_key_ref: string;
      event_type: string;
      target_type: string;
      target_id: string;
      occurred_at: Date;
      source_context: Record<string, unknown>;
      decision: string;
      success: boolean;
      justification: string | null;
      depth: number;
    }>(`
      WITH RECURSIVE chain AS (
        SELECT a.*, 1 AS depth FROM identity.audit_event a WHERE a.prev_hash IS NULL
        UNION ALL
        SELECT child.*, chain.depth + 1
        FROM identity.audit_event child JOIN chain ON child.prev_hash=chain.this_hash
      ) SELECT * FROM chain ORDER BY depth
    `);
    const chain: ChainedAuditEvent[] = rows.rows.map((row) => ({
      auditId: row.audit_id,
      actorCiphertext: row.actor_ciphertext,
      actorKeyRef: row.actor_key_ref,
      eventType: row.event_type,
      targetType: row.target_type,
      targetId: row.target_id,
      occurredAt: row.occurred_at,
      sourceContext: row.source_context,
      decision: row.decision,
      success: row.success,
      justification: row.justification,
      prevHash: row.prev_hash?.toString("hex") ?? null,
      thisHash: row.this_hash.toString("hex")
    }));
    expect(chain).not.toHaveLength(0);
    const chainValid = verifyChain(chain);
    expect(chainValid).toBe(true);
    console.info(
      `[S3 VR-3] audit_rows=${chain.length} forbidden_matches=0 actor_ciphertext_nonnull=0 `
      + `chain_valid=${String(chainValid)} rate_limit_routes=register,verify,resend`
    );
  });

  it("hashes verification tokens with SHA-256 rather than storing the raw token", async () => {
    const flow = buildService();
    const registered = await registerAccount(flow.service, "token-hash");
    const token = (flow.mail as MemoryMailSender).messages[0]!.token;
    const stored = await database.pool.query<{ verification_token_hash: string }>(`
      SELECT verification_token_hash FROM identity.channel_binding
      WHERE user_id=$1 AND channel_type='email'
    `, [registered.user.user_id]);
    expect(stored.rows[0]!.verification_token_hash).toBe(
      `sha256:${createHash("sha256").update(token).digest("hex")}`
    );
    expect(stored.rows[0]!.verification_token_hash).not.toContain(token);
  });
});
