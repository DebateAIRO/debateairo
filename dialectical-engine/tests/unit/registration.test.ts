import { createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
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

type TestAuthRoute = "register" | "verify" | "resend";
const execFileAsync = promisify(execFile);

function limiterOccupancy(limiter: InProcessAuthRateLimiter): Readonly<{
  occupiedSlots: number;
  slotCapacity: number;
}> {
  return limiter.memoryOccupancy();
}

function fixedSlotPair(
  route: TestAuthRoute,
  ip: string,
  capacity: number,
  hashKey: Uint8Array
): string {
  const digest = createHmac("sha256", hashKey)
    .update(`${route}:source:${ip}`, "utf8")
    .digest();
  if (capacity === 1) return "0";
  const firstWidth = Math.floor(capacity / 2);
  return `${digest.readUInt32BE(0) % firstWidth}:`
    + `${firstWidth + (digest.readUInt32BE(4) % (capacity - firstWidth))}`;
}

function collidingSources(
  route: TestAuthRoute,
  capacity: number,
  hashKey: Uint8Array
): readonly [string, string] {
  const seen = new Map<string, string>();
  for (let index = 0; index < capacity * 8; index += 1) {
    const candidate = `s3c-rotating-source:${route}:${index}`;
    const pair = fixedSlotPair(route, candidate, capacity, hashKey);
    const prior = seen.get(pair);
    if (prior !== undefined) return Object.freeze([prior, candidate]);
    seen.set(pair, candidate);
  }
  throw new Error(`S3C_COLLISION_NOT_FOUND:${route}`);
}

function saturateLimiter(
  limiter: InProcessAuthRateLimiter,
  route: TestAuthRoute,
  capacity: number,
  now: Date,
  label: string
): number {
  let sources = 0;
  while (limiterOccupancy(limiter).occupiedSlots < capacity) {
    sources += 1;
    limiter.consume({
      route,
      ip: `${label}:source:${sources}`,
      addressKey: `${label}:address:${sources}`,
      now
    });
    if (sources > capacity * 16) throw new Error(`S3C_SATURATION_DID_NOT_CONVERGE:${route}`);
  }
  return sources;
}

function retainedStateContains(root: unknown, needle: string): boolean {
  const seen = new Set<object>();
  const visit = (value: unknown): boolean => {
    if (typeof value === "string") return value.includes(needle);
    if (typeof value !== "object" || value === null || seen.has(value)) return false;
    seen.add(value);
    if (value instanceof Map) {
      return [...value.entries()].some(([key, entry]) => visit(key) || visit(entry));
    }
    if (value instanceof Set) return [...value.values()].some(visit);
    return Object.values(value).some(visit);
  };
  return visit(root);
}

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
    expect(policy.verification.resendCooldownMs).toBe(20 * 60_000);
    expect(policy.verification.outboundSendWindowMs).toBe(60 * 60_000);
    expect(policy.verification.outboundSendMax).toBe(3);
    expect(policy.verification.resendCooldownMs * policy.verification.outboundSendMax)
      .toBeGreaterThanOrEqual(policy.verification.outboundSendWindowMs);
    expect(policy.verification.enumerationToleranceMs).toBe(100);
    expect(policy.rateLimitBucketCapacity).toBe(524_288);
    expect(policy.rateLimitRefusalAuditIntervalMs).toBe(60_000);
    expect([
      policy.rateLimits.register.admissionPerSource,
      policy.rateLimits.verify.admissionPerSource,
      policy.rateLimits.resend.admissionPerSource
    ]).toEqual([20, 10, 3]);
    const rateLimitRow = AUTH_POLICY_REGISTER_ROWS.find((row) => row.rowKey === "rateLimitPolicy")!;
    expect((rateLimitRow.value as {
      sketch_design?: Readonly<Record<string, unknown>>;
    }).sketch_design).toMatchObject({
      kind: "KEYED_TWO_ROW_PER_ROUTE_FLAT_TYPED_ARRAY",
      capacity_scope: "per_route",
      slots_per_route: 524_288,
      threat_sources_per_window: 20_000,
      target_false_refusal_rate_ppm: 10_000
    });
    expect((rateLimitRow.value as {
      sketch_design: {
        theoretical_collateral: Readonly<Record<string, unknown>>;
      };
    }).sketch_design.theoretical_collateral).toEqual({
      model: "exact_binomial_two_independent_rows",
      derivation: expect.stringMatching(/Binomial/),
      sources_per_cell: 20_000,
      selected_row_width: 262_144,
      refusal_rate_ppm: {
        register: { "1": 0, "5": 0.000002, "10": 7.652853, "20": 5_395.83117 },
        verify: { "1": 0, "5": 7.652853, "10": 5_395.83117, "20": 5_395.83117 },
        resend: { "1": 0.004886, "5": 5_395.83117, "10": 5_395.83117, "20": 5_395.83117 }
      }
    });
    expect((rateLimitRow.value as { legacy_limits_status?: string }).legacy_limits_status)
      .toBe("RETIRED_NOT_ENFORCED");
    expect(Object.values((rateLimitRow.value as {
      routes: Readonly<Record<string, Readonly<Record<string, number>>>>;
    }).routes).every((route) => typeof route.per_ip === "number" && route.per_ip > 0
      && typeof route.per_address === "number" && route.per_address > 0)).toBe(true);
    for (const route of ["register", "verify", "resend"] as const) {
      expect(policy.rateLimits[route].windowMs).toBeGreaterThan(0);
    }
    expect(policy.channel.transport).toBe("own_sendmail");
    expect(policy.channel.transportTimeoutMs).toBe(5_000);
    expect(policy.channel.spamNotice).toMatch(/spam/i);
  });

  it("S3c B4 publishes a measured resident bound for flat preallocated limiter storage", () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    const limiter = new InProcessAuthRateLimiter(
      policy.rateLimits,
      policy.rateLimitBucketCapacity,
      policy.rateLimitRefusalAuditIntervalMs,
      Buffer.alloc(32, 0xb4)
    );
    const storage = limiter as unknown as {
      readonly slots?: unknown;
      readonly slotCounts?: unknown;
      readonly slotHeads?: unknown;
      readonly slotSaturatedUntil?: unknown;
      readonly slotExpiries?: unknown;
      memoryOccupancy(): Readonly<{ allocatedBytes?: number }>;
    };
    const rateLimitRow = AUTH_POLICY_REGISTER_ROWS.find((row) => row.rowKey === "rateLimitPolicy")!;
    const sketch = (rateLimitRow.value as {
      sketch_design: {
        flat_storage: {
          allocated_bytes: number;
          budget_bytes: number;
          retained_objects_per_occupied_slot: number;
        };
        isolated_limiter_resident_measurement?: {
          measurement: string;
          occupancy_percent: number;
          measured_100_percent_rss_mib: number;
          max_measured_curve_rss_mib: number;
          isolated_measurement_ceiling_mib: number;
          curve_rss_mib: Record<"0" | "25" | "50" | "100", number>;
        };
      };
    }).sketch_design;

    expect(Array.isArray(storage.slots)).toBe(false);
    expect(storage.slotCounts).toBeInstanceOf(Uint8Array);
    expect(storage.slotHeads).toBeInstanceOf(Uint8Array);
    expect(storage.slotSaturatedUntil).toBeInstanceOf(Float64Array);
    expect(storage.slotExpiries).toBeInstanceOf(Float64Array);
    expect(storage.memoryOccupancy().allocatedBytes).toBe(sketch.flat_storage.allocated_bytes);
    expect(sketch.flat_storage.allocated_bytes).toBeLessThanOrEqual(sketch.flat_storage.budget_bytes);
    expect(sketch.flat_storage.retained_objects_per_occupied_slot).toBe(0);
    expect(sketch.isolated_limiter_resident_measurement).toMatchObject({
      measurement: "isolated_process_rss_at_100_percent_slot_occupancy",
      occupancy_percent: 100
    });
    expect(sketch.isolated_limiter_resident_measurement!.isolated_measurement_ceiling_mib)
      .toBeGreaterThan(0);
    expect(sketch.isolated_limiter_resident_measurement!.measured_100_percent_rss_mib)
      .toBe(sketch.isolated_limiter_resident_measurement!.curve_rss_mib["100"]);
    expect(Math.max(...Object.values(sketch.isolated_limiter_resident_measurement!.curve_rss_mib)))
      .toBe(sketch.isolated_limiter_resident_measurement!.max_measured_curve_rss_mib);
    expect(sketch.isolated_limiter_resident_measurement!.max_measured_curve_rss_mib)
      .toBeLessThanOrEqual(
        sketch.isolated_limiter_resident_measurement!.isolated_measurement_ceiling_mib
      );
  });

  it("S3c B4 keeps the isolated production RSS curve below the published measured bound", async () => {
    const rateLimitRow = AUTH_POLICY_REGISTER_ROWS.find((row) => row.rowKey === "rateLimitPolicy")!;
    const sketch = (rateLimitRow.value as {
      sketch_design: {
        flat_storage: { allocated_bytes: number };
        isolated_limiter_resident_measurement: { isolated_measurement_ceiling_mib: number };
      };
    }).sketch_design;
    const childProgram = [
      "import { InProcessAuthRateLimiter } from './apps/api/src/registration.ts';",
      "import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from './packages/register/src/auth-policy.ts';",
      "const policy=authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);",
      "const limiter=new InProcessAuthRateLimiter(policy.rateLimits,policy.rateLimitBucketCapacity,policy.rateLimitRefusalAuditIntervalMs,Buffer.alloc(32,0xb4));",
      "const routes=['register','verify','resend'];",
      "const counters={register:0,verify:0,resend:0};",
      "const now=new Date(0);",
      "const mib=(value)=>Number((value/1024/1024).toFixed(1));",
      "const source=(route,n)=>{const r=routes.indexOf(route)+1;const h=n.toString(16).padStart(16,'0');return '2001:db8:5c3:'+r+':'+h.slice(0,4)+':'+h.slice(4,8)+':'+h.slice(8,12)+':'+h.slice(12,16);};",
      "const sample=(target)=>{global.gc();const memory=process.memoryUsage();const occupancy=limiter.memoryOccupancy();process.stdout.write(JSON.stringify({target,occupied:occupancy.occupiedSlots,capacity:occupancy.slotCapacity,rss_mib:mib(memory.rss),allocated_bytes:occupancy.allocatedBytes,sources:{...counters}})+'\\n');};",
      "sample(0);",
      "for(const target of [25,50,100]){for(const route of routes){const wanted=Math.ceil(policy.rateLimitBucketCapacity*target/100);while(limiter.memoryOccupancy().occupiedSlotsByRoute[route]<wanted){const n=++counters[route];limiter.consume({route,ip:source(route,n),addressKey:'ignored',now});if(n>12000000)throw new Error('S3C_OCCUPANCY_DID_NOT_CONVERGE:'+route);}}sample(target);}"
    ].join("\n");
    const { stdout } = await execFileAsync(process.execPath, [
      "--expose-gc", "--import", "tsx", "--input-type=module", "-e", childProgram
    ], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024,
      timeout: 60_000
    });
    const curve = stdout.trim().split("\n").map((line) => JSON.parse(line) as {
      target: number;
      occupied: number;
      capacity: number;
      rss_mib: number;
      allocated_bytes: number;
      sources: Record<TestAuthRoute, number>;
    });
    console.info(`[S3c B4 RSS CURVE] ${JSON.stringify(curve)}`);

    expect(curve.map((sample) => sample.target)).toEqual([0, 25, 50, 100]);
    expect(curve.at(-1)!.occupied).toBe(curve.at(-1)!.capacity);
    expect(curve.every((sample) => sample.allocated_bytes === sketch.flat_storage.allocated_bytes))
      .toBe(true);
    expect(Math.max(...curve.map((sample) => sample.rss_mib)))
      .toBeLessThanOrEqual(
        sketch.isolated_limiter_resident_measurement.isolated_measurement_ceiling_mib
      );
    expect(Object.values(curve.at(-1)!.sources).every((sources) => sources > 1_600_000))
      .toBe(true);
  }, 70_000);

  it("S3c B5 publishes theoretical collateral and the ruled timestamp/rotation residuals", () => {
    const rateLimitRow = AUTH_POLICY_REGISTER_ROWS.find((row) => row.rowKey === "rateLimitPolicy")!;
    const verificationRow = AUTH_POLICY_REGISTER_ROWS.find((row) => row.rowKey === "verificationPolicy")!;
    const sketch = (rateLimitRow.value as {
      sketch_design: {
        theoretical_collateral?: {
          model: string;
          refusal_rate_ppm: Record<TestAuthRoute, Record<"1" | "5" | "10" | "20", number>>;
        };
        beyond_threat_curve?: { model: string };
      };
    }).sketch_design;
    const verification = verificationRow.value as {
      outbound_send_enforcement?: {
        mechanism: string;
        minimum_spacing_ms: number;
      };
      token_rotation_residual?: string;
    };

    expect(sketch.theoretical_collateral?.model)
      .toBe("exact_binomial_two_independent_rows");
    const fullBudget = sketch.theoretical_collateral!.refusal_rate_ppm;
    expect(fullBudget.register["20"]).toBe(fullBudget.verify["10"]);
    expect(fullBudget.register["20"]).toBe(fullBudget.resend["5"]);
    expect(sketch.beyond_threat_curve?.model)
      .toBe("exact_binomial_two_independent_rows_full_budget");
    expect(verification.outbound_send_enforcement).toEqual({
      mechanism: "per_row_last_sent_timestamp_minimum_spacing",
      minimum_spacing_ms: 20 * 60_000
    });
    expect(verification.token_rotation_residual).toMatch(/newest mailed token/i);
  });

  it("S3c C1 publishes a booted-process provisioning bound distinct from the isolated limiter measurement", () => {
    const rateLimitRow = AUTH_POLICY_REGISTER_ROWS.find((row) => row.rowKey === "rateLimitPolicy")!;
    const sketch = (rateLimitRow.value as {
      sketch_design: {
        isolated_limiter_resident_measurement?: {
          operator_provisioning_field?: boolean;
          includes_application_stack_baseline?: boolean;
        };
        booted_process_resident_bound?: {
          measurement: string;
          stack: string;
          occupancy_percent: number;
          worker_remeasurement_100_percent_rss_mib: number;
          independent_verification_100_percent_rss_mib: number;
          measured_100_percent_rss_mib: number;
          provisioning_rounding_increment_mib: number;
          published_provisioning_bound_mib: number;
          includes_application_stack_baseline: boolean;
          per_process: boolean;
          operator_provisioning_field: boolean;
          operator_instruction: string;
        };
      };
    }).sketch_design;

    expect(sketch.isolated_limiter_resident_measurement).toMatchObject({
      operator_provisioning_field: false,
      includes_application_stack_baseline: false
    });
    expect(sketch.booted_process_resident_bound).toMatchObject({
      measurement: "booted_registration_process_rss_at_100_percent_slot_occupancy",
      stack: "postgres_pool_argon2id_64mib_registration_service_file_dek_store",
      occupancy_percent: 100,
      includes_application_stack_baseline: true,
      per_process: true,
      operator_provisioning_field: true,
      operator_instruction: expect.stringMatching(/published_provisioning_bound_mib.*per API process/i)
    });
    const booted = sketch.booted_process_resident_bound!;
    expect(booted.worker_remeasurement_100_percent_rss_mib).toBe(295);
    expect(booted.independent_verification_100_percent_rss_mib).toBe(368.7);
    expect(booted.measured_100_percent_rss_mib).toBe(Math.max(
      booted.worker_remeasurement_100_percent_rss_mib,
      booted.independent_verification_100_percent_rss_mib
    ));
    expect(booted.published_provisioning_bound_mib)
      .toBe(Math.ceil(booted.measured_100_percent_rss_mib
        / booted.provisioning_rounding_increment_mib) * booted.provisioning_rounding_increment_mib);
    expect(booted.measured_100_percent_rss_mib)
      .toBeLessThanOrEqual(booted.published_provisioning_bound_mib);
  });

  it("S3c C2 derives every beyond-threat point from the exact-binomial full-budget model", () => {
    const rateLimitRow = AUTH_POLICY_REGISTER_ROWS.find((row) => row.rowKey === "rateLimitPolicy")!;
    const curve = (rateLimitRow.value as {
      sketch_design: {
        beyond_threat_curve?: {
          model: string;
          derivation: string;
          selected_row_width: number;
          refusal_rate_ppm: Readonly<Record<"50000" | "100000" | "200000" | "400000" | "800000", number>>;
        };
      };
    }).sketch_design.beyond_threat_curve!;

    expect(curve.model).toBe("exact_binomial_two_independent_rows_full_budget");
    expect(curve.derivation).toMatch(/P\(X>=1\)\^2\*1e6/);
    const points = [50_000, 100_000, 200_000, 400_000, 800_000] as const;
    const expected = Object.fromEntries(points.map((sources) => {
      const occupiedProbability = 1 - Math.pow(1 - (1 / curve.selected_row_width), sources);
      return [String(sources), Math.round(occupiedProbability ** 2 * 1_000_000)];
    }));
    expect(curve.refusal_rate_ppm).toEqual(expected);
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

  it("S3c D2 keeps admission source-owned at 20/10/3 despite attacker-controlled addresses", () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    for (const route of ["register", "verify", "resend"] as const) {
      const limiter = new InProcessAuthRateLimiter(
        policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
      );
      const routePolicy = policy.rateLimits[route];
      const legacyAddressBudget = { register: 5, verify: 10, resend: 3 }[route];
      for (let index = 0; index < legacyAddressBudget; index += 1) {
        expect(limiter.consume({
          route,
          ip: `attacker:${route}:${index}`,
          addressKey: "victim:address",
          now: new Date(0)
        })).toEqual({ allowed: true });
      }
      for (let index = 0; index < routePolicy.admissionPerSource; index += 1) {
        expect(limiter.consume({
          route,
          ip: `owner:${route}`,
          addressKey: "victim:address",
          now: new Date(0)
        })).toEqual({ allowed: true });
      }
      expect(limiter.consume({
        route,
        ip: `owner:${route}`,
        addressKey: "victim:address",
        now: new Date(0)
      })).toEqual({ allowed: false, scope: "ip" });
    }
  });

  it("keeps fixed-slot memory bounded under a 200k single-source flood", () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
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
    const occupancy = limiterOccupancy(floodLimiter);
    const retainedCounts = (floodLimiter as unknown as {
      slotCounts: Uint8Array;
    }).slotCounts;
    console.info(
      `[S3c D1 MEMORY] requests=200000 refused=${refused} `
      + `occupied=${occupancy.occupiedSlots}/${occupancy.slotCapacity}`
    );

    expect(refused).toBe(200_000 - policy.rateLimits.register.admissionPerSource);
    expect(occupancy.occupiedSlots).toBeLessThanOrEqual(policy.rateLimitBucketCapacity);
    expect(occupancy.slotCapacity).toBe(policy.rateLimitBucketCapacity * 3);
    expect(retainedCounts).toHaveLength(policy.rateLimitBucketCapacity * 3);
    expect(retainedCounts.reduce((maximum, count) => Math.max(maximum, count), 0))
      .toBeLessThanOrEqual(Math.max(
        ...Object.values(policy.rateLimits).map((route) => route.admissionPerSource)
      ));
  });

  it("does not evict an active at-limit bucket when new keys churn past the cap", () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    const oneRequestPolicy = Object.freeze({
      ...policy.rateLimits,
      register: Object.freeze({
        ...policy.rateLimits.register,
        admissionPerSource: 1,
        perIp: 1,
        perAddress: 10
      })
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
    const occupancy = limiterOccupancy(limiter);
    console.info(
      `[S3 W3 RED/GREEN] churn=${policy.rateLimitBucketCapacity + 10} `
      + `victim_refused=${String(!afterChurn.allowed)} `
      + `occupied=${occupancy.occupiedSlots}/${occupancy.slotCapacity}`
    );

    expect(afterChurn).toEqual({ allowed: false, scope: "ip" });
    expect(occupancy.occupiedSlots).toBeLessThanOrEqual(policy.rateLimitBucketCapacity);
    expect(limiter.consume({
      route: "register",
      ip: "post-expiry:new-source",
      addressKey: "post-expiry:new-address",
      now: new Date(oneRequestPolicy.register.windowMs + 1)
    })).toEqual({ allowed: true });
  });

  it("S3c B3 keeps a one-source flood refused at 20/10/3 before slot saturation", () => {
    const base = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    for (const route of ["register", "verify", "resend"] as const) {
      const limit = base.rateLimits[route].admissionPerSource;
      const limiter = new InProcessAuthRateLimiter(
        base.rateLimits,
        base.rateLimitBucketCapacity,
        base.rateLimitRefusalAuditIntervalMs,
        Buffer.alloc(32, 0x31 + route.length)
      );
      const now = new Date(0);
      const floodIp = `flood:one-ip:${route}`;
      for (let count = 0; count < limit; count += 1) {
        expect(limiter.consume({ route, ip: floodIp, addressKey: `flood:${count}`, now }))
          .toEqual({ allowed: true });
      }
      const results = Array.from({ length: limit * 3 }, (_, index) => limiter.consume({
        route,
        ip: floodIp,
        addressKey: `rotating:${index % 2}`,
        now
      }));
      const occupancy = limiterOccupancy(limiter);
      console.info(
        `[S3c B3 PRE-SATURATION] route=${route} threshold=${limit} `
        + `post_limit_allowed=${results.filter((result) => result.allowed).length} `
        + `occupied=${occupancy.occupiedSlots}/${occupancy.slotCapacity}`
      );
      expect(results.every((result) => !result.allowed)).toBe(true);
      expect(occupancy.occupiedSlots).toBeLessThan(occupancy.slotCapacity);
    }
  });

  it("S3c D1 makes two colliding rotating sources share one budget without laundering state", () => {
    const base = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    const hashKey = Buffer.alloc(32, 0x4d);
    for (const route of ["register", "verify", "resend"] as const) {
      const limit = base.rateLimits[route].admissionPerSource;
      const [first, second] = collidingSources(route, base.rateLimitBucketCapacity, hashKey);
      const limiter = new InProcessAuthRateLimiter(
        base.rateLimits,
        base.rateLimitBucketCapacity,
        base.rateLimitRefusalAuditIntervalMs,
        hashKey
      );
      const results = Array.from({ length: limit * 3 }, (_, index) => limiter.consume({
        route,
        ip: index % 2 === 0 ? first : second,
        addressKey: `ignored:${index}`,
        now: new Date(0)
      }));
      const allowed = results.filter((result) => result.allowed).length;
      console.info(
        `[S3c D1 ROTATING] route=${route} threshold=${limit} colliding_sources=2 `
        + `allowed=${allowed} refused=${results.length - allowed}`
      );
      expect(allowed).toBe(limit);
      expect(results.slice(limit).every((result) => !result.allowed)).toBe(true);
    }
  });

  it("S3c D3 retains no raw bucket key but records the bounded refusal-source residual", () => {
    const base = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    const limiter = new InProcessAuthRateLimiter(
      base.rateLimits,
      base.rateLimitBucketCapacity,
      base.rateLimitRefusalAuditIntervalMs,
      Buffer.alloc(32, 0x72)
    );
    const rawIp = "198.51.100.254-D3-RAW-IP";
    const rawAddress = "D3-RAW-ADDRESS";
    expect(limiter.consume({
      route: "register", ip: rawIp, addressKey: rawAddress, now: new Date(0)
    })).toEqual({ allowed: true });
    const rawBucketIpRetained = retainedStateContains(limiter, rawIp);
    const rawBucketAddressRetained = retainedStateContains(limiter, rawAddress);
    expect(rawBucketIpRetained).toBe(false);
    expect(rawBucketAddressRetained).toBe(false);

    limiter.aggregateRefusal({
      route: "register",
      scope: "ip",
      actorToken: "00000000-0000-4000-8000-000000000001",
      now: new Date(0),
      source: { ip: rawIp, userAgent: "D3-UA", requestId: "D3-REQUEST" }
    });
    const aggregateState = JSON.stringify([
      ...(limiter as unknown as {
        refusalAggregates: ReadonlyMap<TestAuthRoute, unknown>;
      }).refusalAggregates.values()
    ]);
    console.info(
      `[S3c D3 RESIDUAL] raw_bucket_key_retained=${String(rawBucketIpRetained)} `
      + `raw_refusal_source_retained=${String(aggregateState.includes(rawIp))} `
      + `aggregate_routes=1/${(["register", "verify", "resend"] as const).length}`
    );
    expect(aggregateState).toContain(rawIp);
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
