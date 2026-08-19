import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  AUTH_POLICY_REGISTER_ROWS,
  authPolicyFromRegisterRows
} from "../../packages/register/src/auth-policy.js";
import {
  FileUserDekStore,
  generatePseudonym,
  generateVerificationToken,
  hashPassword,
  hashVerificationToken,
  loadKek,
  verifyPassword
} from "../../packages/crypto/src/index.js";
import {
  InProcessAuthRateLimiter,
  REGISTRATION_PUBLIC_RESPONSE,
  RESEND_PUBLIC_RESPONSE,
  type RegistrationApplication
} from "../../apps/api/src/registration.js";
import {
  MemoryMailSender,
  SendmailMailSender
} from "../../apps/api/src/mail-channel.js";
import { channelBinding, mfaFactor } from "../../packages/db/src/schema.js";
import { buildApi, type AskApplication } from "@debateai/api";

function fixtureAskApplication(): AskApplication {
  return {
    submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () { /* no events */ }
  };
}

describe("S3 ruled authentication policy", () => {
  it("carries password, audit-IP KDF, verification, rate-limit, and own-mail rows with V provenance", () => {
    expect(AUTH_POLICY_REGISTER_ROWS.map((row) => row.rowKey)).toEqual([
      "passwordPolicy", "auditSourceIpKdfPolicy", "verificationPolicy", "rateLimitPolicy", "channelPolicy"
    ]);
    for (const row of AUTH_POLICY_REGISTER_ROWS) expect(row.sourceRef).toMatch(/VR-|A3-10/);

    const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    expect(policy.password.minimumLength).toBe(8);
    expect(policy.password.argon2id).toEqual({
      memoryCostKiB: 65_536, timeCost: 3, parallelism: 1, hashLength: 32
    });
    expect(policy.auditSourceIpKdf).toEqual({
      algorithm: "argon2id", memoryCostKiB: 19_456, iterations: 2,
      parallelism: 1, hashLength: 32
    });
    expect(policy.verification.tokenTtlMs).toBeLessThanOrEqual(24 * 60 * 60 * 1_000);
    expect(policy.verification.resendCooldownMs).toBeGreaterThan(0);
    expect(policy.verification.enumerationToleranceMs).toBe(100);
    expect(policy.rateLimitBucketCapacity).toBe(4_096);
    expect(policy.rateLimitRefusalAuditIntervalMs).toBe(60_000);
    for (const route of ["register", "verify", "resend"] as const) {
      expect(policy.rateLimits[route].perIp).toBeGreaterThan(0);
      expect(policy.rateLimits[route].perAddress).toBeGreaterThan(0);
      expect(policy.rateLimits[route].windowMs).toBeGreaterThan(0);
    }
    expect(policy.channel.transport).toBe("own_sendmail");
    expect(policy.channel.transportTimeoutMs).toBe(5_000);
    expect(policy.channel.spamNotice).toMatch(/spam/i);
  });

  it("S3 rework4 fold-in bounds attacker-controlled audit KDF cost rows", () => {
    const withAuditCost = (memoryCostKiB: number, iterations: number) =>
      AUTH_POLICY_REGISTER_ROWS.map((row) => row.rowKey === "auditSourceIpKdfPolicy"
        ? Object.freeze({
            ...row,
            value: Object.freeze({ ...row.value, memory_cost_kib: memoryCostKiB, iterations })
          })
        : row);

    expect(() => authPolicyFromRegisterRows(withAuditCost(262_145, 2)))
      .toThrow(expect.objectContaining({ code: "AUTH_POLICY_INVALID" }));
    expect(() => authPolicyFromRegisterRows(withAuditCost(19_456, 11)))
      .toThrow(expect.objectContaining({ code: "AUTH_POLICY_INVALID" }));
  });
});

describe("S3 password, token, pseudonym, and secret-store primitives", () => {
  it("hashes with the ruled Argon2id parameters and verifies without retaining plaintext", async () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS).password;
    const password = "correct horse battery staple";
    const encoded = await hashPassword(password, policy.argon2id);

    expect(encoded).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(encoded).not.toContain(password);
    await expect(verifyPassword(encoded, password)).resolves.toBe(true);
    await expect(verifyPassword(encoded, "wrong password")).resolves.toBe(false);
  });

  it("creates single-purpose opaque tokens and stable-format non-derived pseudonym candidates", () => {
    const token = generateVerificationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashVerificationToken(token)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hashVerificationToken(token)).not.toContain(token);

    const forbidden = ["alice", "example", "00000000", "secret-value"];
    const pseudonyms = new Set(Array.from({ length: 200 }, () => generatePseudonym()));
    expect(pseudonyms.size).toBe(200);
    for (const pseudonym of pseudonyms) {
      expect(pseudonym).toMatch(/^[a-z]+-[a-z]+-[0-9a-f]{6}$/);
      for (const fragment of forbidden) expect(pseudonym).not.toContain(fragment);
    }
  });

  it("stores only a wrapped DEK in a documented 0700/0600 file layout", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s3-deks-"));
    try {
      const store = new FileUserDekStore(root, loadKek(Buffer.alloc(32, 0x5a)));
      const userId = "00000000-0000-4000-8000-000000000123";
      const dek = Buffer.alloc(32, 0x6b);
      await store.store(userId, dek);

      const directory = join(root, "users", userId);
      const file = join(directory, "dek.v1.json");
      expect((await stat(root)).mode & 0o777).toBe(0o700);
      expect((await stat(join(root, "users"))).mode & 0o777).toBe(0o700);
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      const stored = await readFile(file, "utf8");
      expect(stored).not.toContain(dek.toString("base64"));
      expect(JSON.parse(stored)).toMatchObject({ version: 1, user_id: userId });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("S3 public auth facade, limiter, and test mail channel", () => {
  it("declares all three auth routes public and returns the spam-safe fixed responses", async () => {
    const calls: string[] = [];
    const registration: RegistrationApplication = {
      register: async () => { calls.push("register"); return REGISTRATION_PUBLIC_RESPONSE; },
      verifyEmail: async () => { calls.push("verify"); return { status: "active" }; },
      resendVerification: async () => { calls.push("resend"); return RESEND_PUBLIC_RESPONSE; }
    };
    const api = buildApi({ application: fixtureAskApplication(), registration });
    try {
      const register = await api.inject({
        method: "POST", url: "/v1/auth/register",
        payload: {
          email: "alice@example.test", password: "password-123",
          recovery_email: "recovery@example.test", adult_affirmed: true
        }
      });
      const verify = await api.inject({
        method: "POST", url: "/v1/auth/verify-email", payload: { token: "opaque-token" }
      });
      const resend = await api.inject({
        method: "POST", url: "/v1/auth/resend-verification", payload: { email: "alice@example.test" }
      });

      expect(register.statusCode).toBe(202);
      expect(register.json()).toEqual(REGISTRATION_PUBLIC_RESPONSE);
      expect(register.body).toMatch(/spam/i);
      expect(verify.statusCode).toBe(200);
      expect(verify.json()).toEqual({ status: "active" });
      expect(resend.statusCode).toBe(202);
      expect(resend.json()).toEqual(RESEND_PUBLIC_RESPONSE);
      expect(resend.body).toMatch(/spam/i);
      expect(calls).toEqual(["register", "verify", "resend"]);
    } finally {
      await api.close();
    }
  });

  it("enforces ruled per-IP and per-address windows independently for every route", () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    for (const route of ["register", "verify", "resend"] as const) {
      const addressLimiter = new InProcessAuthRateLimiter(
        policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
      );
      const addressLimit = policy.rateLimits[route].perAddress;
      for (let index = 0; index < addressLimit; index += 1) {
        expect(addressLimiter.consume({
          route, ip: `192.0.2.${index + 1}`, addressKey: "address:a", now: new Date(0)
        })).toEqual({ allowed: true });
      }
      expect(addressLimiter.consume({
        route, ip: "198.51.100.1", addressKey: "address:a", now: new Date(0)
      })).toEqual({ allowed: false, scope: "address" });

      const ipLimiter = new InProcessAuthRateLimiter(
        policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
      );
      const ipLimit = policy.rateLimits[route].perIp;
      for (let index = 0; index < ipLimit; index += 1) {
        expect(ipLimiter.consume({
          route, ip: "203.0.113.1", addressKey: `address:${index}`, now: new Date(0)
        })).toEqual({ allowed: true });
      }
      expect(ipLimiter.consume({
        route, ip: "203.0.113.1", addressKey: "address:overflow", now: new Date(0)
      })).toEqual({ allowed: false, scope: "ip" });
    }
  });

  it("checks the IP bucket first and keeps retained buckets bounded under a single-source flood", () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    const oneRequestPolicy = Object.freeze({
      ...policy.rateLimits,
      register: Object.freeze({ ...policy.rateLimits.register, perIp: 1, perAddress: 1 })
    });
    const orderLimiter = new InProcessAuthRateLimiter(
      oneRequestPolicy, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
    );
    expect(orderLimiter.consume({
      route: "register", ip: "198.51.100.9", addressKey: "first", now: new Date(0)
    })).toEqual({ allowed: true });
    const refusedByIp = orderLimiter.consume({
      route: "register", ip: "198.51.100.9", addressKey: "victim", now: new Date(0)
    });
    const victimFromFreshIp = orderLimiter.consume({
      route: "register", ip: "198.51.100.10", addressKey: "victim", now: new Date(0)
    });

    const floodLimiter = new InProcessAuthRateLimiter(
      policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
    );
    let refused = 0;
    for (let index = 0; index < 200_000; index += 1) {
      const result = floodLimiter.consume({
        route: "register",
        ip: "203.0.113.77",
        addressKey: `flood:${index}`,
        now: new Date(0)
      });
      if (!result.allowed) refused += 1;
    }
    const retained = (floodLimiter as unknown as { buckets: { size: number } }).buckets.size;
    console.info(`[S3 R2 RED/GREEN] requests=200000 refused=${refused} retained_buckets=${retained}`);

    expect(refusedByIp).toMatchObject({ allowed: false, scope: "ip" });
    expect(victimFromFreshIp).toEqual({ allowed: true });
    expect(retained).toBeLessThanOrEqual(policy.rateLimitBucketCapacity);
  });

  it("does not evict an active at-limit bucket when new keys churn past the cap", () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    const oneRequestPolicy = Object.freeze({
      ...policy.rateLimits,
      register: Object.freeze({ ...policy.rateLimits.register, perIp: 1, perAddress: 10 })
    });
    const limiter = new InProcessAuthRateLimiter(
      oneRequestPolicy, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
    );
    const now = new Date(0);
    const victimIp = "198.51.100.200";

    expect(limiter.consume({
      route: "register", ip: victimIp, addressKey: "victim:first", now
    })).toEqual({ allowed: true });
    expect(limiter.consume({
      route: "register", ip: victimIp, addressKey: "victim:at-limit", now
    })).toEqual({ allowed: false, scope: "ip" });

    for (let index = 0; index < policy.rateLimitBucketCapacity + 10; index += 1) {
      limiter.consume({
        route: "register",
        ip: `attacker:${index}`,
        addressKey: `attacker-address:${index}`,
        now
      });
    }

    const afterChurn = limiter.consume({
      route: "register", ip: victimIp, addressKey: "victim:bypass-attempt", now
    });
    const retained = (limiter as unknown as { buckets: { size: number } }).buckets.size;
    console.info(
      `[S3 W3 RED/GREEN] churn=${policy.rateLimitBucketCapacity + 10} `
      + `victim_refused=${String(!afterChurn.allowed)} retained_buckets=${retained}`
    );

    expect(afterChurn).toEqual({ allowed: false, scope: "ip" });
    expect(retained).toBeLessThanOrEqual(policy.rateLimitBucketCapacity);
    expect(limiter.consume({
      route: "register",
      ip: "post-expiry:new-source",
      addressKey: "post-expiry:new-address",
      now: new Date(oneRequestPolicy.register.windowMs + 1)
    })).toEqual({ allowed: true });
  });

  it("S3 rework4 B1 keeps a saturated limiter closed for sustained floods and two rotating keys", () => {
    const base = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    const thresholds = Object.freeze({ register: 20, verify: 10, resend: 3 });

    for (const route of ["register", "verify", "resend"] as const) {
      const limit = thresholds[route];
      const policy = Object.freeze({
        ...base.rateLimits,
        [route]: Object.freeze({ ...base.rateLimits[route], perIp: limit, perAddress: limit })
      });
      const limiter = new InProcessAuthRateLimiter(policy, 5, base.rateLimitRefusalAuditIntervalMs);
      const now = new Date(0);
      for (const guard of ["guard-a", "guard-b"]) {
        for (let count = 0; count < limit; count += 1) {
          expect(limiter.consume({ route, ip: `${guard}:ip`, addressKey: `${guard}:address`, now }))
            .toEqual({ allowed: true });
        }
      }

      const results = Array.from({ length: limit * 3 }, (_, index) => limiter.consume({
        route,
        ip: "flood:one-ip",
        addressKey: `rotating:${index % 2}`,
        now
      }));
      const retained = (limiter as unknown as { buckets: { size: number } }).buckets.size;
      console.info(
        `[S3 REWORK4 B1 UNIT RED/GREEN] route=${route} threshold=${limit} `
        + `allowed=${results.filter((result) => result.allowed).length} retained=${retained}`
      );
      expect(results.every((result) => !result.allowed)).toBe(true);
      expect(retained).toBe(5);
    }
  });

  it("S3 rework4 B6 models verification and delivery columns only on channel_binding", () => {
    const verificationFields = [
      "verificationTokenHash", "verificationExpiresAt", "verificationConsumedAt",
      "verificationLastSentAt", "deliveryStatus", "deliveryError"
    ];
    for (const field of verificationFields) {
      expect((mfaFactor as unknown as Record<string, unknown>)[field]).toBeUndefined();
      expect((channelBinding as unknown as Record<string, unknown>)[field]).toBeDefined();
    }
  });

  it("S3 rework4 B7 removes the abandoned argon2 workspace placeholder", async () => {
    const workspace = await readFile(join(process.cwd(), "pnpm-workspace.yaml"), "utf8");
    expect(workspace).not.toMatch(/^\s+argon2:/m);
  });

  it("uses an in-memory test transport that never invokes a real mail process", async () => {
    const mail = new MemoryMailSender();
    await mail.sendVerification({
      attemptId: "00000000-0000-4000-8000-000000000777",
      recipient: "alice@example.test",
      token: "test-token",
      expiresAt: new Date("2026-08-20T00:00:00.000Z")
    });
    expect(mail.messages).toEqual([
      expect.objectContaining({ recipient: "alice@example.test", token: "test-token" })
    ]);
  });

  it("terminates a hung local mail process at the ruled transport timeout", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s3-sendmail-timeout-"));
    const executable = join(root, "slow-sendmail");
    await writeFile(executable, "#!/bin/sh\nsleep 1\nexit 0\n", "utf8");
    await chmod(executable, 0o700);
    const mail = new SendmailMailSender({
      executable,
      from: "noreply@debateai.test",
      publicAppUrl: "https://debateai.test",
      timeoutMs: 40
    });
    const startedAt = performance.now();
    try {
      await expect(mail.sendVerification({
        attemptId: "00000000-0000-4000-8000-000000000778",
        recipient: "alice@example.test",
        token: "a".repeat(43),
        expiresAt: new Date("2026-08-20T00:00:00.000Z")
      })).rejects.toEqual(expect.objectContaining({
        operatorCode: "SENDMAIL_TIMEOUT"
      }));
      expect(performance.now() - startedAt).toBeLessThan(500);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("S3 rework4 fold-in terminates sendmail options before the recipient", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s3-sendmail-args-"));
    const executable = join(root, "capture-sendmail");
    const argumentsFile = join(root, "arguments.txt");
    await writeFile(
      executable,
      `#!/bin/sh\nprintf '%s\\n' "$@" > "${argumentsFile}"\ncat >/dev/null\n`,
      "utf8"
    );
    await chmod(executable, 0o700);
    const mail = new SendmailMailSender({
      executable,
      from: "noreply@debateai.test",
      publicAppUrl: "https://debateai.test",
      timeoutMs: 1_000
    });
    try {
      await mail.sendVerification({
        attemptId: "00000000-0000-4000-8000-000000000779",
        recipient: "alice@example.test",
        token: "a".repeat(43),
        expiresAt: new Date("2026-08-20T00:00:00.000Z")
      });
      expect((await readFile(argumentsFile, "utf8")).trim().split("\n")).toEqual([
        "-i", "-f", "noreply@debateai.test", "--", "alice@example.test"
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
