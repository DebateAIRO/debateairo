import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, PostgresIdentityRepository } from "@debateai/db";
import {
  createEmailBlindIndex,
  encrypt,
  FileUserDekStore,
  generateDek,
  generateVerificationToken,
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

  it("keeps resend cooldown and missing-account outcomes indistinguishable while rotating tokens after cooldown", async () => {
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
    await expect(flow.service.verifyEmail({ token: firstToken }, source)).rejects.toMatchObject({
      code: "VERIFICATION_TOKEN_INVALID"
    });
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
    const cells: string[] = [];
    const measurements: Array<{
      readonly concurrency: 1 | 4 | 8;
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
    }> = [];
    for (const concurrency of [1, 4, 8] as const) {
      const waves = concurrency === 1 ? 8 : 4;
      const existingGroups = Math.ceil(waves / 4);
      const timingMail = new MemoryMailSender();
      const flow = buildService({ mail: timingMail });
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
          await flow.service.register({
            email: `s3b-timing-n${concurrency}-missing-${wave}-${index}@example.test`,
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
        + `auc_separability_pct=${(auc * 100).toFixed(1)}`
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
        mailCount: timingMail.messages.length
      });
      expect(Math.min(...existing, ...missing)).toBeGreaterThanOrEqual(clampMs - 20);
    }
    console.info(
      `[S3b REWORK1 LIVE TIMING] backend=postgres mail=live password_argon2id_kib=${basePolicy.password.argon2id.memoryCostKiB} `
        + `password_argon2id_time=${basePolicy.password.argon2id.timeCost} `
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
