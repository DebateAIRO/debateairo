import { createHmac, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,lstat,mkdir,mkdtemp,open,readFile,rename,rm,stat,writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
  AUTH_POLICY_REGISTER_ROWS,
  authPolicyFromRegisterRows,
  type AuthPolicyRegisterRow
} from "../../packages/register/src/auth-policy.js";
import {
  Argon2InfrastructureError,
  Argon2WorkerPool,
  FileUserDekStore,
  generatePseudonym,
  generateVerificationToken,
  hashPassword,
  hashVerificationToken,
  loadKek,
  verifyPassword,
  type UserDekStoreFileSystem
} from "../../packages/crypto/src/index.js";
import {
  AUTH_RETRYABLE_UNAVAILABLE_CODE,
  AuthFlowError,
  InProcessAuthRateLimiter,
  REGISTRATION_PUBLIC_RESPONSE,
  RegistrationService,
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
    withContentLease: async (_runId,use) => use(),
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

  it("publishes S3c collateral and cooldown plus S3d non-interfering credential lifecycle", () => {
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
      verification_credentials?: {
        storage: string;
        validity: string;
        maximum_live_hashes_per_account: number;
        leaked_token_tradeoff: string;
      };
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
    expect(verification.verification_credentials).toEqual(expect.objectContaining({
      storage: "HASH_ONLY_APPEND_ONLY_LEDGER",
      validity: "EACH_MAILED_TOKEN_UNTIL_OWN_EXPIRY_OR_ACCOUNT_ACTIVATION",
      maximum_live_hashes_per_account: 73,
      leaked_token_tradeoff: expect.stringMatching(/cannot.*revoke.*resend/i)
    }));
  });

  it("S3d D1 rules arm-independent leases, a deadline, and truthful bounded retention", () => {
    const channelRow = AUTH_POLICY_REGISTER_ROWS.find((row) => row.rowKey === "channelPolicy")!;
    const channel = channelRow.value as {
      verification_dispatch?: Record<string, unknown>;
      delivery_audit?: Record<string, unknown>;
    };
    expect(channel.verification_dispatch).toEqual(expect.objectContaining({
      maximum_concurrent: 32,
      queue_capacity: 96,
      at_capacity: "RETRYABLE_503_BEFORE_ACCOUNT_COMMIT_AFTER_BOUNDED_WAIT",
      maximum_concurrent_registration_hashes: 32,
      activation_spacing_ms: 60,
      registration_activation_spacing_ms: 45,
      pre_transport_work_budget_ms: 600,
      no_send_equal_transport_work_ms: 5_000,
      handoff_scheduler_tolerance_ms: 100,
      registration_minimum_reservation_ms: 5_700,
      minimum_reservation_ms: 5_700,
      queue_wait_timeout_ms: 18_000,
      release_semantics: "ARM_INDEPENDENT_ROUTE_DERIVED_GRANT_CADENCE_45MS_REGISTRATION_BEFORE_PROVISIONING_OR_60MS_RESEND;_HTTP_RESPONSE_FLOOR_600MS_FROM_REGISTRATION_ACTIVATION;_SATURATION_HANDOFF_ROUTE_DERIVED_5700MS_EVERY_ROUTE;_EQUAL_TRANSPORT_WORK_EVERY_ADDRESS_ARM;_DELIVERY_AUDIT_AFTER_HANDOFF",
      // Rework7 gave registration its own 28-second wait deadline, so the
      // retention disclosure names both routes and both bounds.
      retained_payload: "ACTIVE_SEND_CREDENTIALS;_QUEUE_NODE_OPAQUE_CONTROL_ONLY;_SUSPENDED_REGISTRATION_REQUEST_FRAME_VALIDATED_PLAINTEXT_UNTIL_GRANT_OR_28S_TIMEOUT;_SUSPENDED_RESEND_REQUEST_FRAME_VALIDATED_PLAINTEXT_UNTIL_GRANT_OR_18S_TIMEOUT",
      operator_signal: expect.objectContaining({
        payload: "OPAQUE_WINDOW_COUNT_AND_CORRELATION_NO_ADDRESS_OR_SOURCE",
        aggregation_window_ms: 60_000,
        count_cap: Number.MAX_SAFE_INTEGER,
        maximum_retained_aggregates: 1
      }),
      registration_clamp_absorption: {
        maximum_unsaturated_concurrency: 2,
        measured_hash_and_provisioning_max_ms: 436,
        measurement_safety_percent: 110,
        ruled_hash_and_provisioning_upper_bound_ms: 480,
        response_clamp_ms: 600,
        binding_headroom_ms: 30,
        first_measured_unabsorbed_concurrency: 3,
        beyond_n_star_protection: "EQUAL_WORK_DISTRIBUTION_NOT_CLAMP_ABSORPTION"
      },
      cadence_sensitivity: {
        minus_15_ms: {
          cadence_ms: 30,
          observation_count: 3,
          red_count: 2,
          green_count: 1,
          n8_median_gap_tenths_ms_range: {
            minimum: 596,
            maximum: 1_158
          },
          n8_auc_ppm_range: {
            minimum: 620_000,
            maximum: 774_000
          },
          characterization: "NOISY_2_OF_3_RED_RATE_NOT_DETERMINISTIC_LOWER_BOUND"
        },
        plus_15_ms: {
          cadence_ms: 60,
          observation_count: 1,
          red_count: 0,
          green_count: 1,
          n8_median_gap_tenths_ms: 121,
          n8_auc_ppm: 529_000,
          characterization: "SINGLE_GREEN_OBSERVATION_NOT_STABLE_BOUNDARY"
        },
        conclusion: "CENTRAL_TENDENCY_ORDERS_SAFER_AS_CADENCE_RISES;_RUN_TO_RUN_NOISE_COMPARABLE_TO_OBSERVED_EFFECT;_45MS_CURRENT_VALUE_NOT_UNIQUELY_LOAD_BEARING",
        recalibration_trigger: "TARGET_HOST_OR_STORAGE_CLASS_CHANGE_OR_FIRST_UNCHANGED_CODE_RED_AT_45MS"
      }
    }));
    expect(channel.delivery_audit).toEqual(expect.objectContaining({
      public_result: "ENUMERATION_SAFE_GENERIC_RESPONSE",
      operator_result: "DURABLE_STATUS_AND_AUDIT_WITH_OPAQUE_CORRELATION",
      duplicate_registration_rows: 2,
      duplicate_counting_instruction: expect.stringMatching(/do not double-count/i)
    }));
    expect(authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS)
      .channel.maxConcurrentVerificationDispatches).toBe(32);
    expect(authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS)
      .channel.maxQueuedVerificationDispatches).toBe(96);
    expect(authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS)
      .channel.mailDispatchMinimumReservationMs).toBe(5_700);
    expect(authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS)
      .channel.mailDispatchQueueWaitTimeoutMs).toBe(18_000);
    expect(authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS).channel).toMatchObject({
      maximumClampAbsorbedRegistrationConcurrency: 2,
      registrationHashAndProvisioningUpperBoundMs: 480,
      registrationClampHeadroomMs: 30
    });
    const transportDrift = AUTH_POLICY_REGISTER_ROWS.map((row) => row.rowKey === "channelPolicy"
      ? {
          ...row,
          value: {
            ...(row.value as Record<string, unknown>),
            transport_timeout_ms: 5_001
          }
        }
      : row) as readonly AuthPolicyRegisterRow[];
    expect(() => authPolicyFromRegisterRows(transportDrift)).toThrowError(
      /Mail reservation derivation contradicts/
    );
    const clampHeadroomDrift = AUTH_POLICY_REGISTER_ROWS.map((row) => {
      if (row.rowKey !== "channelPolicy") return row;
      const value = row.value as {
        verification_dispatch: {
          registration_clamp_absorption: Record<string, unknown>;
        };
      };
      return {
        ...row,
        value: {
          ...value,
          verification_dispatch: {
            ...value.verification_dispatch,
            registration_clamp_absorption: {
              ...value.verification_dispatch.registration_clamp_absorption,
              binding_headroom_ms: 29
            }
          }
        }
      };
    }) as readonly AuthPolicyRegisterRow[];
    expect(() => authPolicyFromRegisterRows(clampHeadroomDrift)).toThrowError(
      /Mail reservation derivation contradicts/
    );
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
    // Real worker pool: this asserts the shipped encoding is unchanged now that
    // the KDF runs off-thread over transferred bytes rather than a JS string.
    const argon2 = new Argon2WorkerPool();
    try {
      await argon2.ready();
      const encoded = await hashPassword(argon2, password, policy.argon2id);

      expect(encoded).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
      expect(encoded).not.toContain(password);
      await expect(verifyPassword(argon2, encoded, password)).resolves.toBe(true);
      await expect(verifyPassword(argon2, encoded, "wrong password")).resolves.toBe(false);
      // Malformed encoded hashes stay `false` (pre-existing contract), and are
      // never promoted into an infrastructure failure.
      await expect(verifyPassword(argon2, "not-a-hash", password)).resolves.toBe(false);
      await expect(verifyPassword(argon2, "$argon2id$corrupt", password)).resolves.toBe(false);
    } finally {
      await argon2.close();
    }
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

  it("publishes user DEKs only after file, child-directory, and parent-directory fsync", async () => {
    const root = await mkdtemp(join(tmpdir(),"debateai-s10-user-dek-durability-"));
    const events: string[] = [];
    const io = {
      mkdir,chmod,lstat,readFile,rename,rm,stat,
      async open(path: string,flags: string,mode?: number) {
        const handle = await open(path,flags,mode);
        const kind = path.endsWith(".tmp") ? "temp"
          : path===join(root,"users") ? "parent" : "directory";
        events.push(`open-${kind}`);
        return {
          writeFile: handle.writeFile.bind(handle),
          async sync() { events.push(`sync-${kind}`); await handle.sync(); },
          async close() { events.push(`close-${kind}`); await handle.close(); }
        };
      }
    } as unknown as UserDekStoreFileSystem;
    try {
      const userId = randomUUID();
      const kekBytes = Buffer.alloc(32,0x5b);
      const store = new FileUserDekStore(root,loadKek(kekBytes),io);
      await store.store(userId,Buffer.alloc(32,0x6c));
      expect(events).toEqual([
        "open-temp","sync-temp","close-temp",
        "open-directory","sync-directory","close-directory",
        "open-parent","sync-parent","close-parent"
      ]);
      const fresh = new FileUserDekStore(root,loadKek(kekBytes));
      const loaded = await fresh.load(userId);
      expect(loaded).toEqual(Buffer.alloc(32,0x6c));
      loaded.fill(0);
    } finally {
      await rm(root,{ recursive: true,force: true });
    }
  });

  it("fails closed at every user-DEK publication fsync stage", async () => {
    for (const failure of ["temp","directory","parent"] as const) {
      const root = await mkdtemp(join(tmpdir(),`debateai-s10-user-dek-${failure}-`));
      const userId = randomUUID();
      const io = {
        mkdir,chmod,lstat,readFile,rename,rm,stat,
        async open(path: string,flags: string,mode?: number) {
          const handle = await open(path,flags,mode);
          const kind = path.endsWith(".tmp") ? "temp"
            : path===join(root,"users") ? "parent" : "directory";
          return {
            writeFile: handle.writeFile.bind(handle),
            async sync() {
              if (kind===failure) throw new Error(`USER_DEK_${failure.toUpperCase()}_FSYNC_FAILED`);
              await handle.sync();
            },
            close: handle.close.bind(handle)
          };
        }
      } as unknown as UserDekStoreFileSystem;
      try {
        const store = new FileUserDekStore(root,loadKek(Buffer.alloc(32,0x5c)),io);
        if (failure==="temp") {
          await expect(store.store(userId,Buffer.alloc(32,0x6d)))
            .rejects.toThrow("USER_DEK_TEMP_FSYNC_FAILED");
          await expect(lstat(join(root,"users",userId))).rejects.toMatchObject({ code: "ENOENT" });
        } else {
          await expect(store.store(userId,Buffer.alloc(32,0x6d)))
            .rejects.toMatchObject({ code: "USER_DEK_STORE_DURABILITY_UNCERTAIN" });
          expect((await stat(join(root,"users",userId,"dek.v1.json"))).isFile()).toBe(true);
        }
      } finally {
        await rm(root,{ recursive: true,force: true });
      }
    }
  });

  it("publishes user-DEK absence only after unlink, parent fsync, and lstat readback", async () => {
    for (const failure of ["unlink","parent","readback"] as const) {
      const root = await mkdtemp(join(tmpdir(),`debateai-s10-user-destroy-${failure}-`));
      const userId = randomUUID();
      const kekBytes = Buffer.alloc(32,0x5d);
      await new FileUserDekStore(root,loadKek(kekBytes)).store(userId,Buffer.alloc(32,0x6e));
      const io = {
        mkdir,chmod,lstat,readFile,rename,stat,
        async rm(path: string,options: { recursive: boolean; force: boolean }) {
          if (failure==="unlink") throw new Error("USER_DEK_UNLINK_FAILED");
          if (failure!=="readback") await rm(path,options);
        },
        async open(path: string,flags: string,mode?: number) {
          const handle = await open(path,flags,mode);
          if (failure!=="parent") return handle;
          return new Proxy(handle,{
            get(target,property,receiver) {
              if (property==="sync") return async () => { throw new Error("USER_DEK_PARENT_FSYNC_FAILED"); };
              const value = Reflect.get(target,property,receiver);
              return typeof value==="function" ? value.bind(target) : value;
            }
          });
        }
      } as unknown as UserDekStoreFileSystem;
      try {
        const faulted = new FileUserDekStore(root,loadKek(kekBytes),io);
        await expect(faulted.destroy(userId)).rejects.toThrow(
          failure==="unlink" ? "USER_DEK_UNLINK_FAILED"
            : failure==="parent" ? "USER_DEK_PARENT_FSYNC_FAILED"
              : "Secret-store directory still exists after durable removal"
        );
        const fresh = new FileUserDekStore(root,loadKek(kekBytes));
        if (failure==="parent") {
          await expect(fresh.exists(userId)).resolves.toBe(false);
          await expect(fresh.load(userId)).rejects.toThrow();
        } else {
          await expect(fresh.exists(userId)).resolves.toBe(true);
        }
      } finally {
        await rm(root,{ recursive: true,force: true });
      }
    }

    const root = await mkdtemp(join(tmpdir(),"debateai-s10-user-destroy-green-"));
    const userId = randomUUID();
    const kekBytes = Buffer.alloc(32,0x5e);
    try {
      const store = new FileUserDekStore(root,loadKek(kekBytes));
      await store.store(userId,Buffer.alloc(32,0x6f));
      await expect(store.destroy(userId)).resolves.toBe("DESTROYED");
      const fresh = new FileUserDekStore(root,loadKek(kekBytes));
      await expect(fresh.exists(userId)).resolves.toBe(false);
      await expect(fresh.load(userId)).rejects.toThrow();
      await expect(fresh.destroy(userId)).resolves.toBe("ALREADY_ABSENT");
    } finally {
      await rm(root,{ recursive: true,force: true });
    }
  });
});

describe("S3 public auth facade, limiter, and test mail channel", () => {
  it("declares all three auth routes public and returns the spam-safe fixed responses", async () => {
    const calls: string[] = [];
    const registration: RegistrationApplication = {
      register: async () => { calls.push("register"); return REGISTRATION_PUBLIC_RESPONSE; },
      verifyEmail: async () => { calls.push("verify"); return { status: "mfa_required" }; },
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
      expect(verify.json()).toEqual({ status: "mfa_required" });
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

  it("rejects malformed and CRLF recipients before invoking sendmail", async () => {
    const mail = new SendmailMailSender({
      executable: "/definitely/not/a/sendmail-binary",
      from: "noreply@debateai.test",
      publicAppUrl: "https://debateai.test",
      timeoutMs: 1_000
    });
    for (const recipient of [
      "not-an-email",
      "victim@example.test\r\nBcc: attacker@example.test",
      "victim@example.test\r\nBcc: attacker.example.test"
    ]) {
      await expect(mail.sendVerification({
        attemptId: "00000000-0000-4000-8000-000000000780",
        recipient,
        token: "a".repeat(43),
        expiresAt: new Date("2026-08-20T00:00:00.000Z")
      })).rejects.toEqual(expect.objectContaining({ operatorCode: "MAIL_INPUT_INVALID" }));
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

// ==========================================================================
// REWORK 1 P2 — one constant secret-free retryable 503 for every Argon2 pool
// failure, at every auth-route boundary.
// ==========================================================================

const ARGON2_FAILURE_CODES = Object.freeze([
  "ARGON2_POOL_CAPACITY_EXHAUSTED",
  "ARGON2_POOL_UNAVAILABLE",
  "ARGON2_WORKER_FAILED",
  "ARGON2_JOB_TIMEOUT"
] as const);

const AUTH_ROUTE_REQUESTS = Object.freeze([
  Object.freeze({
    name: "register" as const,
    url: "/v1/auth/register",
    payload: {
      email: "alice@example.test", password: "correct horse battery staple",
      recovery_email: "recovery@example.test", adult_affirmed: true
    }
  }),
  Object.freeze({
    name: "verify" as const,
    url: "/v1/auth/verify-email",
    payload: { token: "A".repeat(43) }
  }),
  Object.freeze({
    name: "resend" as const,
    url: "/v1/auth/resend-verification",
    payload: { email: "alice@example.test" }
  })
]);

describe("T1 rework1 P2 — Argon2 pool failures share one auth envelope", () => {
  it("maps every failure code on every auth route to the same secret-free 503", async () => {
    for (const code of ARGON2_FAILURE_CODES) {
      const failing: RegistrationApplication = {
        register: async () => { throw new Argon2InfrastructureError(code); },
        verifyEmail: async () => { throw new Argon2InfrastructureError(code); },
        resendVerification: async () => { throw new Argon2InfrastructureError(code); }
      };
      const api = buildApi({ application: fixtureAskApplication(), registration: failing });
      try {
        for (const route of AUTH_ROUTE_REQUESTS) {
          const response = await api.inject({
            method: "POST", url: route.url, payload: route.payload
          });
          expect(response.statusCode).toBe(503);
          expect(response.json()).toEqual({
            error: AUTH_RETRYABLE_UNAVAILABLE_CODE,
            message: AUTH_RETRYABLE_UNAVAILABLE_CODE
          });
          // The internal code describes pool capacity state. It must not be
          // inferable from the body, and this must not be the generic 500 path.
          expect(response.body).not.toContain("ARGON2_");
          expect(response.body).not.toContain("INTERNAL_ERROR");
        }
      } finally {
        await api.close();
      }
    }
  });

  it("keeps the pre-existing envelopes for failures that are not the pool", async () => {
    const cases = [
      { error: new AuthFlowError("AUTH_INPUT_INVALID"), status: 400, code: "AUTH_INPUT_INVALID" },
      { error: new AuthFlowError("AUTH_RATE_LIMITED"), status: 429, code: "AUTH_RATE_LIMITED" },
      { error: new AuthFlowError("AUTH_MAIL_BUSY"), status: 503, code: "AUTH_MAIL_BUSY" },
      { error: new AuthFlowError("AUTH_REGISTRATION_FAILED"), status: 503, code: "AUTH_REGISTRATION_FAILED" },
      { error: new Error("BOOM"), status: 500, code: "INTERNAL_ERROR" }
    ];
    for (const expected of cases) {
      const failing: RegistrationApplication = {
        register: async () => { throw expected.error; },
        verifyEmail: async () => { throw expected.error; },
        resendVerification: async () => { throw expected.error; }
      };
      const api = buildApi({ application: fixtureAskApplication(), registration: failing });
      try {
        const response = await api.inject({
          method: "POST", url: "/v1/auth/register", payload: AUTH_ROUTE_REQUESTS[0]!.payload
        });
        expect(response.statusCode).toBe(expected.status);
        expect(response.json()).toMatchObject({ error: expected.code });
      } finally {
        await api.close();
      }
    }
  });

  it("types every service-level pool failure occurrence, retaining the cause internally", async () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    const source = Object.freeze({
      ip: "203.0.113.7", userAgent: "vitest-t1-rework1", requestId: "request:t1:rework1"
    });
    const workingArgon2 = {
      async hashPassword() {
        return `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`;
      },
      async verifyPassword() { return false; },
      async hashAuditContext() { return "ab".repeat(32); }
    };

    // The five occurrences the reviewer enumerated: password hashing, audit
    // derivation behind register, verification, resend, and provisioning.
    const occurrences = [
      {
        label: "password hashing",
        route: "register" as const,
        argon2Fails: true,
        repository: {}
      },
      {
        label: "audit derivation on register",
        route: "register" as const,
        argon2Fails: false,
        repository: {
          findAuditIdentityByBlindIndex: async () => {
            throw new Argon2InfrastructureError("ARGON2_WORKER_FAILED");
          }
        }
      },
      {
        label: "account provisioning",
        route: "register" as const,
        argon2Fails: false,
        repository: {
          findAuditIdentityByBlindIndex: async () => null,
          createPendingAccount: async () => {
            throw new Argon2InfrastructureError("ARGON2_JOB_TIMEOUT");
          },
          recordRegistrationFailure: async () => undefined
        }
      },
      {
        label: "verification",
        route: "verify" as const,
        argon2Fails: false,
        repository: {
          findAuditIdentityByVerificationHash: async () => {
            throw new Argon2InfrastructureError("ARGON2_POOL_UNAVAILABLE");
          }
        }
      },
      {
        label: "resend",
        route: "resend" as const,
        argon2Fails: false,
        repository: {
          findAuditIdentityByBlindIndex: async () => null,
          prepareVerificationResend: async () => {
            throw new Argon2InfrastructureError("ARGON2_POOL_CAPACITY_EXHAUSTED");
          }
        }
      }
    ];

    for (const occurrence of occurrences) {
      const service = new RegistrationService({
        repository: {
          findAuditIdentityByBlindIndex: async () => null,
          findAuditIdentityByVerificationHash: async () => null,
          recordRateLimitRefusal: async () => undefined,
          ...occurrence.repository
        } as never,
        mail: new MemoryMailSender(),
        dekStore: {
          store: async () => undefined,
          destroy: async () => "ALREADY_ABSENT"
        },
        blindIndexKey: Buffer.alloc(32, 0x3c),
        policy,
        limiter: new InProcessAuthRateLimiter(
          policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
        ),
        argon2: occurrence.argon2Fails
          ? {
            ...workingArgon2,
            async hashPassword(): Promise<string> {
              throw new Argon2InfrastructureError("ARGON2_POOL_CAPACITY_EXHAUSTED");
            }
          }
          : workingArgon2,
        sleep: async () => undefined
      });

      const attempt = occurrence.route === "register"
        ? service.register({
          email: "alice@example.test", password: "correct horse battery staple",
          recoveryEmail: "recovery@example.test", adultAffirmed: true
        }, source)
        : occurrence.route === "verify"
          ? service.verifyEmail({ token: "A".repeat(43) }, source)
          : service.resendVerification({ email: "alice@example.test" }, source);

      const error = await attempt.then(
        () => { throw new Error(`${occurrence.label} unexpectedly succeeded`); },
        (caught: unknown) => caught
      );
      expect(error, occurrence.label).toBeInstanceOf(AuthFlowError);
      expect((error as AuthFlowError).code, occurrence.label)
        .toBe(AUTH_RETRYABLE_UNAVAILABLE_CODE);
      expect((error as AuthFlowError).statusCode, occurrence.label).toBe(503);
      // Constant and secret-free on the wire...
      expect((error as AuthFlowError).message, occurrence.label)
        .toBe(AUTH_RETRYABLE_UNAVAILABLE_CODE);
      // ...while the typed cause stays available to operators.
      expect((error as AuthFlowError).cause, occurrence.label)
        .toBeInstanceOf(Argon2InfrastructureError);
      await service.drainMailDispatches();
    }
  });
});

// ==========================================================================
// T1 REWORK7-A — the structural registration admission budget and the
// route-specific registration mail-permit deadline.
//
// Two earlier claims are repaired here.
//
// The first is what "103" means. decision_version 2 published it as a MEASURED
// accepted-request capacity, and unchanged-code RED evidence then contradicted
// that: the same burst accepted 98, then 96. 103 is now what it structurally
// is — a process-owned admission budget with no wait queue, taken synchronously
// before the first repository await, so the 104th valid request is refused
// before any repository, limiter, KDF, mail, token or mutation work happens.
//
// The second is the wait deadline. Three fresh diagnostic processes committed
// and sent all 103 registrations with zero refusals once the registration wait
// ceiling was widened, at a worst reservation wait of 21,902.2 ms. The shipped
// 18,000 ms bound was therefore censoring real admissions rather than bounding
// lost capacity. Registration alone now waits 28,000 ms; resend keeps 18,000.
//
// Every lifecycle assertion below is driven by an explicit barrier, a held
// permit, or a test-local deadline. Nothing here sleeps for 28 seconds of wall
// time, and the two tests that assert the EXACT ruled deadlines read them off
// the unmodified production policy.
// ==========================================================================

type Rework7Policy = ReturnType<typeof authPolicyFromRegisterRows>;

interface Rework7Counters {
  repository: number;
  limiterConsume: number;
  limiterRefusal: number;
  passwordHash: number;
  auditHash: number;
  mailReservation: number;
  mailRelease: number;
  tokenMint: number;
  send: number;
  mutation: number;
  deliveryAudit: number;
  registrationFailureAudit: number;
}

interface Rework7Occupancy {
  readonly admitted: number;
  readonly maximum: number;
  readonly closing: boolean;
  readonly admissions: number;
  readonly releases: number;
}

type Rework7Activation = () => Promise<Readonly<{
  activatedAt: number;
  release: () => Promise<void>;
}>>;

interface Rework7Harness {
  readonly service: RegistrationService;
  readonly policy: Rework7Policy;
  readonly counters: Rework7Counters;
  readonly sleeps: number[];
  readonly errorLog: string[];
  readonly admittedDuringSleep: number[];
  readonly admittedAtCommit: number[];
  readonly admittedAtHandoff: number[];
  readonly heldPermits: Rework7Activation[];
  readonly reservationHoldOccupancy: Rework7Occupancy[];
  occupancy(): Rework7Occupancy;
  openLookupGate(): void;
  holdMailPermits(count: number): Promise<void>;
  freeOneMailPermit(): Promise<void>;
  register(index: number): Promise<unknown>;
  resend(index: number): Promise<unknown>;
  restore(): void;
  /**
   * Rework8 additions. `deferHash` makes every Argon2 call park until the test
   * settles it EXPLICITLY, which is what lets the started-KDF race below be
   * deterministic without real time and without a hostile KDF that never
   * finishes. `pendingHashes()` is the non-vacuity read: it is the number of
   * KDF calls that have really begun and really have not settled.
   */
  pendingHashes(): number;
  settleHashes(count: number): void;
  failHashes(count: number): void;
}

const REWORK7_PASSWORD = "correct horse battery staple";

/**
 * Reservation minimums and activation spacing are the only production values a
 * unit harness overrides, and only to zero: they are wall-clock waits on the
 * RAW timer, not on the injected sleep, so leaving them shipped would make
 * every barrier test wait out a 5,700 ms lease per permit wave. The two ruled
 * wait DEADLINES are deliberately NOT in this set — the tests that assert 28 s
 * and 18 s read them straight off the production policy.
 */
const REWORK7_INSTANT_LEASES = Object.freeze({
  mailDispatchMinimumReservationMs: 0,
  registrationMailDispatchMinimumReservationMs: 0,
  mailDispatchActivationSpacingMs: 0,
  registrationMailDispatchActivationSpacingMs: 0
});

function rework7Harness(options: {
  readonly channel?: Readonly<Record<string, number>>;
  readonly gateLookup?: boolean;
  readonly existingAddress?: boolean;
  readonly duplicate?: boolean;
  readonly hashFails?: boolean;
  readonly provisionFails?: boolean;
  readonly deliveryAuditFails?: boolean;
  readonly clampFails?: boolean;
  readonly password?: string;
  readonly deferHash?: boolean;
} = {}): Rework7Harness {
  const base = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
  const policy = Object.freeze({
    ...base,
    channel: Object.freeze({ ...base.channel, ...REWORK7_INSTANT_LEASES, ...options.channel })
    // Through `unknown`: the shipped policy pins the untouched cadences as
    // literal types, and this harness deliberately zeroes them.
  }) as unknown as Rework7Policy;

  const counters: Rework7Counters = {
    repository: 0, limiterConsume: 0, limiterRefusal: 0, passwordHash: 0, auditHash: 0,
    mailReservation: 0, mailRelease: 0, tokenMint: 0, send: 0, mutation: 0, deliveryAudit: 0,
    registrationFailureAudit: 0
  };
  const sleeps: number[] = [];
  const errorLog: string[] = [];
  const admittedDuringSleep: number[] = [];
  const admittedAtCommit: number[] = [];
  const admittedAtHandoff: number[] = [];
  const heldPermits: Rework7Activation[] = [];
  const reservationHoldOccupancy: Rework7Occupancy[] = [];

  let openLookupGate!: () => void;
  const lookupGate = new Promise<void>((resolve) => { openLookupGate = resolve; });

  const identity = options.existingAddress === true
    ? { auditToken: "audit-token:existing", addressKey: "address-key:existing" }
    : null;

  const repository = {
    findAuditIdentityByBlindIndex: async () => {
      counters.repository += 1;
      if (options.gateLookup === true) await lookupGate;
      return identity;
    },
    findAuditIdentityByVerificationHash: async () => {
      counters.repository += 1;
      return null;
    },
    createPendingAccount: async (
      _input: unknown,
      storeDek: () => Promise<void>
    ): Promise<unknown> => {
      counters.repository += 1;
      counters.mutation += 1;
      admittedAtCommit.push(occupancy().admitted);
      if (options.provisionFails === true) throw new Error("REWORK7_TEST_DB_FAILURE");
      await storeDek();
      return options.duplicate === true
        ? Object.freeze({
            status: "email_duplicate",
            userId: "11111111-1111-4111-8111-111111111111"
          })
        : Object.freeze({
            status: "created",
            userId: "22222222-2222-4222-8222-222222222222",
            channelBindingId: "33333333-3333-4333-8333-333333333333"
          });
    },
    recordVerificationDelivery: async () => {
      counters.repository += 1;
      counters.deliveryAudit += 1;
      if (options.deliveryAuditFails === true) throw new Error("REWORK7_TEST_AUDIT_FAILURE");
    },
    recordVerificationDeliveryRecordFailure: async () => {
      counters.repository += 1;
      counters.deliveryAudit += 1;
    },
    recordDuplicateRegistrationPostwork: async () => {
      counters.repository += 1;
      counters.deliveryAudit += 1;
    },
    consumeVerification: async () => {
      counters.repository += 1;
      return true;
    },
    prepareVerificationResend: async () => {
      counters.repository += 1;
      return Object.freeze({ status: "cooldown" as const });
    },
    recordRegistrationFailure: async () => {
      counters.repository += 1;
      counters.registrationFailureAudit += 1;
    },
    recordRateLimitRefusal: async () => {
      counters.repository += 1;
      return undefined;
    }
  };

  const limiter = new InProcessAuthRateLimiter(
    policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
  );
  const realConsume = limiter.consume.bind(limiter);
  limiter.consume = (input) => {
    counters.limiterConsume += 1;
    return realConsume(input);
  };
  const realAggregate = limiter.aggregateRefusal.bind(limiter);
  limiter.aggregateRefusal = (input) => {
    counters.limiterRefusal += 1;
    return realAggregate(input);
  };

  const hashDeferrals: Array<Readonly<{
    resolve: () => void;
    reject: (error: unknown) => void;
  }>> = [];

  const argon2 = {
    async hashPassword(): Promise<string> {
      counters.passwordHash += 1;
      if (options.deferHash === true) {
        // Parks the KDF exactly where a real one spends its time: dispatched,
        // running, and not yet settled. The test decides when it finishes.
        await new Promise<void>((resolve, reject) => {
          hashDeferrals.push(Object.freeze({ resolve, reject }));
        });
      }
      if (options.hashFails === true) {
        throw new Argon2InfrastructureError("ARGON2_POOL_CAPACITY_EXHAUSTED");
      }
      return `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`;
    },
    async verifyPassword(): Promise<boolean> { return false; },
    async hashAuditContext(): Promise<string> {
      counters.auditHash += 1;
      return "ab".repeat(32);
    }
  };

  const service = new RegistrationService({
    repository: repository as never,
    mail: { async sendVerification(): Promise<void> { counters.send += 1; } },
    dekStore: {
      store: async () => undefined,
      destroy: async () => "ALREADY_ABSENT"
    },
    blindIndexKey: Buffer.alloc(32, 0x3c),
    policy,
    limiter,
    argon2,
    sleep: async (milliseconds: number) => {
      sleeps.push(milliseconds);
      admittedDuringSleep.push(occupancy().admitted);
      if (options.clampFails === true) throw new Error("REWORK7_TEST_CLAMP_FAILURE");
    },
    verificationTokenFactory: () => {
      counters.tokenMint += 1;
      return "r7".padEnd(43, "T");
    }
  });

  interface Rework7Inspected {
    activateMailDispatch(
      enforceMinimum?: boolean,
      minimumReservationMs?: number
    ): Readonly<{ activatedAt: number; release: () => Promise<void> }>;
    reserveMailDispatchPermit(request: {
      readonly correlationId: string;
      readonly minimumReservationMs?: number;
      readonly activationSpacingMs?: number;
      readonly waitDeadlineMs?: number;
    }): Promise<Rework7Activation>;
    dispatchVerification(input: unknown, release: () => Promise<void>): void;
    dispatchMailReservationHold(release: () => Promise<void>, equalTransportWork?: boolean): void;
    registrationAdmissionOccupancy?(): Rework7Occupancy;
  }
  const inspected = service as unknown as Rework7Inspected;
  const realActivate = inspected.activateMailDispatch.bind(service);
  inspected.activateMailDispatch = (enforceMinimum = false, minimumReservationMs?: number) => {
    const receipt = realActivate(enforceMinimum, minimumReservationMs);
    return Object.freeze({
      activatedAt: receipt.activatedAt,
      release: () => {
        counters.mailRelease += 1;
        return receipt.release();
      }
    });
  };
  const realReserve = inspected.reserveMailDispatchPermit.bind(service);
  inspected.reserveMailDispatchPermit = (request) => {
    counters.mailReservation += 1;
    return realReserve(request);
  };
  const realDispatchVerification = inspected.dispatchVerification.bind(service);
  inspected.dispatchVerification = (input, release) => {
    admittedAtHandoff.push(occupancy().admitted);
    realDispatchVerification(input, release);
  };
  const realDispatchHold = inspected.dispatchMailReservationHold.bind(service);
  inspected.dispatchMailReservationHold = (release, equalTransportWork) => {
    reservationHoldOccupancy.push(occupancy());
    realDispatchHold(release, equalTransportWork);
  };

  function occupancy(): Rework7Occupancy {
    const reader = (service as unknown as Rework7Inspected).registrationAdmissionOccupancy;
    if (typeof reader !== "function") throw new Error("REWORK7_ADMISSION_OCCUPANCY_MISSING");
    return reader.call(service);
  }

  const realConsoleError = console.error;
  console.error = (...args: unknown[]) => { errorLog.push(args.map(String).join(" ")); };

  return {
    service,
    policy,
    counters,
    sleeps,
    errorLog,
    admittedDuringSleep,
    admittedAtCommit,
    admittedAtHandoff,
    heldPermits,
    reservationHoldOccupancy,
    occupancy,
    openLookupGate: () => openLookupGate(),
    holdMailPermits: async (count: number) => {
      for (let index = 0; index < count; index += 1) {
        heldPermits.push(await realReserve({ correlationId: `rework7-fill:${index}` }));
      }
    },
    freeOneMailPermit: async () => {
      const activate = heldPermits.shift();
      if (activate === undefined) throw new Error("REWORK7_NO_HELD_PERMIT");
      await (await activate()).release();
    },
    register: (index: number) => service.register({
      email: `rework7-${index}@example.test`,
      password: options.password ?? REWORK7_PASSWORD,
      recoveryEmail: `rework7-${index}-recovery@example.test`,
      adultAffirmed: true
    }, {
      ip: `2001:db8:7ea::${(index + 1).toString(16)}`,
      userAgent: "vitest-t1-rework7",
      requestId: `request:t1:rework7:${index}`
    }),
    resend: (index: number) => service.resendVerification({
      email: `rework7-resend-${index}@example.test`
    }, {
      ip: `2001:db8:7eb::${(index + 1).toString(16)}`,
      userAgent: "vitest-t1-rework7",
      requestId: `request:t1:rework7:resend:${index}`
    }),
    restore: () => { console.error = realConsoleError; },
    pendingHashes: () => hashDeferrals.length,
    settleHashes: (count: number) => {
      if (hashDeferrals.length < count) {
        throw new Error(`REWORK8_NOT_ENOUGH_PENDING_HASHES:${hashDeferrals.length}<${count}`);
      }
      for (const deferral of hashDeferrals.splice(0, count)) deferral.resolve();
    },
    failHashes: (count: number) => {
      if (hashDeferrals.length < count) {
        throw new Error(`REWORK8_NOT_ENOUGH_PENDING_HASHES:${hashDeferrals.length}<${count}`);
      }
      for (const deferral of hashDeferrals.splice(0, count)) {
        deferral.reject(new Argon2InfrastructureError("ARGON2_POOL_CAPACITY_EXHAUSTED"));
      }
    }
  };
}

async function rework7Settle(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function rework7Code(error: unknown): string {
  return (error as { code?: string }).code ?? `RAW:${String(error)}`;
}

const REWORK8_STILL_PENDING = "REWORK8_STILL_PENDING_AT_THE_CLOSED_LOOKUP_GATE";

/**
 * REWORK8 F3 support. The 104th request is refused BEFORE the first repository
 * await, so with the lookup gate shut it must still settle on its own. Racing
 * it against a generous fixed number of scheduler turns — 64, against the two
 * or three the refusal actually needs, and no wall clock anywhere — converts
 * "a mutant admitted the 104th and it is now parked on the gate forever" from a
 * bare suite timeout into a crisp named assertion. It only ever ADDS this
 * requirement: every original assertion on the refusal still runs unchanged.
 */
async function rework8PendingMarker(): Promise<string> {
  for (let turn = 0; turn < 64; turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return REWORK8_STILL_PENDING;
}

describe("T1 rework7 A1 — the structural admission budget is exactly 103", () => {
  it("admits 100 and 103, refuses the 104th, and charges nothing for invalid input or source", async () => {
    const harness = rework7Harness({ gateLookup: true });
    try {
      expect(harness.policy.channel.structuralMaximumConcurrentRegistrations).toBe(103);
      expect(harness.occupancy()).toMatchObject({ admitted: 0, maximum: 103, closing: false });

      const hundred = Array.from({ length: 100 }, (_, index) => harness.register(index));
      expect(harness.occupancy().admitted).toBe(100);
      const upToCap = Array.from({ length: 3 }, (_, index) => harness.register(100 + index));
      // NON-VACUITY: all 103 really are inside the service, parked on the gated
      // first repository await, each still holding its admission slot.
      expect(harness.occupancy().admitted).toBe(103);
      expect(harness.counters.repository).toBe(103);

      const refused = harness.register(103).then(
        () => { throw new Error("REWORK7_104TH_UNEXPECTEDLY_ADMITTED"); },
        (error: unknown) => error
      );
      // Settles at the CLOSED gate, because the refusal never reaches it.
      expect(await Promise.race([
        refused.then((error) => rework7Code(error), (error: unknown) => rework7Code(error)),
        rework8PendingMarker()
      ])).toBe("AUTH_MAIL_BUSY");
      const refusal = await refused;
      expect(rework7Code(refusal)).toBe("AUTH_MAIL_BUSY");
      expect(refusal).toBeInstanceOf(AuthFlowError);
      expect((refusal as AuthFlowError).statusCode).toBe(503);
      // The refusal consumed no budget of its own and displaced no holder.
      expect(harness.occupancy()).toMatchObject({ admitted: 103, admissions: 103 });

      const invalidInput = await harness.service.register({
        email: "not-an-address", password: REWORK7_PASSWORD,
        recoveryEmail: "r7-invalid-recovery@example.test", adultAffirmed: true
      }, { ip: "2001:db8:7ea::ffff", userAgent: "vitest", requestId: "request:invalid" })
        .then(() => "ADMITTED", (error: unknown) => rework7Code(error));
      expect(invalidInput).toBe("AUTH_INPUT_INVALID");
      const invalidSource = await harness.service.register({
        email: "r7-valid@example.test", password: REWORK7_PASSWORD,
        recoveryEmail: "r7-valid-recovery@example.test", adultAffirmed: true
      }, { ip: "   ", userAgent: "vitest", requestId: "request:invalid-source" })
        .then(() => "ADMITTED", (error: unknown) => rework7Code(error));
      expect(invalidSource).toBe("AUTH_INPUT_INVALID");
      expect(harness.occupancy()).toMatchObject({ admitted: 103, admissions: 103 });

      harness.openLookupGate();
      await Promise.all([...hundred, ...upToCap]);
      await harness.service.drainMailDispatches();
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 103, releases: 103 });

      // Releasing a slot admits a LATER new request; the refused 104th was
      // never queued and does not resume.
      await harness.register(500);
      await harness.service.drainMailDispatches();
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 104, releases: 104 });
    } finally {
      harness.restore();
    }
  });

  for (const size of [128, 160]) {
    it(`caps a simultaneous burst of ${size} at exactly 103 admissions`, async () => {
      const harness = rework7Harness({ gateLookup: true });
      try {
        const attempts = Array.from({ length: size }, (_, index) =>
          harness.register(index).then(() => "SUCCESS", (error: unknown) => rework7Code(error)));
        // Captured immediately after the synchronous launch loop: the gate is
        // taken before the first await, so the ceiling is already decided here.
        const peak = harness.occupancy().admitted;
        harness.openLookupGate();
        const outcomes = await Promise.all(attempts);
        await harness.service.drainMailDispatches();

        expect(peak).toBe(103);
        expect(outcomes.filter((outcome) => outcome === "SUCCESS")).toHaveLength(103);
        expect(outcomes.filter((outcome) => outcome === "AUTH_MAIL_BUSY"))
          .toHaveLength(size - 103);
        expect(outcomes.filter((outcome) =>
          outcome !== "SUCCESS" && outcome !== "AUTH_MAIL_BUSY")).toEqual([]);
        expect(harness.occupancy()).toMatchObject({
          admitted: 0, admissions: 103, releases: 103
        });
      } finally {
        harness.restore();
      }
    });
  }

  it("does no repository, limiter, KDF, mail, token, mutation or audit work for the 104th", async () => {
    const harness = rework7Harness({ gateLookup: true });
    try {
      const admitted = Array.from({ length: 103 }, (_, index) => harness.register(index));
      await rework7Settle();
      const before = { ...harness.counters };
      // NON-VACUITY: the gate sits BEFORE the limiter and the reservation, so
      // the only work 103 admitted requests have done is the one lookup each.
      expect(before).toMatchObject({
        repository: 103, limiterConsume: 0, passwordHash: 0, mailReservation: 0,
        tokenMint: 0, mutation: 0, send: 0
      });

      const fourth = harness.register(103)
        .then(() => "REWORK7_104TH_UNEXPECTEDLY_ADMITTED", (error: unknown) => rework7Code(error));
      // Settles at the CLOSED gate, because the refusal never reaches it.
      expect(await Promise.race([fourth, rework8PendingMarker()])).toBe("AUTH_MAIL_BUSY");

      expect(harness.counters).toEqual(before);
      expect(harness.service.mailDispatchOccupancy().inFlight).toBe(0);
      expect(harness.service.mailDispatchOccupancy().queued).toBe(0);

      harness.openLookupGate();
      await Promise.all(admitted);
      await harness.service.drainMailDispatches();
    } finally {
      harness.restore();
    }
  });

  it("holds the 104th refusal to the ruled clamp and returns identical bytes on both address arms", async () => {
    const arms: Array<Readonly<{
      code: string; message: string; status: number; clampMs: number;
    }>> = [];
    for (const existingAddress of [false, true]) {
      const harness = rework7Harness({ gateLookup: true, existingAddress });
      try {
        const admitted = Array.from({ length: 103 }, (_, index) => harness.register(index));
        await rework7Settle();
        const sleepsBefore = harness.sleeps.length;
        const refusal = harness.register(103).then(
          () => { throw new Error("REWORK7_104TH_UNEXPECTEDLY_ADMITTED"); },
          (caught: unknown) => caught as AuthFlowError
        );
        // Same closed-gate settle race as the no-work case above: an admitted
        // 104th parks here, and must say so crisply.
        expect(await Promise.race([
          refusal.then((caught) => rework7Code(caught), (caught: unknown) => rework7Code(caught)),
          rework8PendingMarker()
        ])).toBe("AUTH_MAIL_BUSY");
        const error = await refusal;
        const clampSleeps = harness.sleeps.slice(sleepsBefore);
        expect(clampSleeps).toHaveLength(1);
        arms.push(Object.freeze({
          code: error.code,
          message: error.message,
          status: error.statusCode,
          clampMs: clampSleeps[0]!
        }));
        harness.openLookupGate();
        await Promise.all(admitted);
        await harness.service.drainMailDispatches();
      } finally {
        harness.restore();
      }
    }
    const verification = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS).verification;
    const ruledClampMs = verification.enumerationResponseFloorMs
      + verification.enumerationToleranceMs;
    for (const arm of arms) {
      expect(arm.code).toBe("AUTH_MAIL_BUSY");
      expect(arm.status).toBe(503);
      // The refusal does no work of its own, so its remaining hold is the WHOLE
      // ruled window rather than a shortened one.
      expect(arm.clampMs).toBeGreaterThan(ruledClampMs - 50);
      expect(arm.clampMs).toBeLessThanOrEqual(ruledClampMs);
    }
    expect({ ...arms[0]!, clampMs: 0 }).toEqual({ ...arms[1]!, clampMs: 0 });
  });
});

describe("T1 rework7 A1 — the admission token is released exactly once, and never early", () => {
  it("keeps the admission through commit, clamp and handoff, and drops it only after", async () => {
    const harness = rework7Harness();
    try {
      await harness.register(0);
      // Released only after the handoff block, so every observation INSIDE the
      // request still sees the slot held.
      expect(harness.admittedAtCommit).toEqual([1]);
      expect(harness.admittedAtHandoff).toEqual([1]);
      expect(harness.admittedDuringSleep.length).toBeGreaterThan(0);
      expect(Math.min(...harness.admittedDuringSleep)).toBe(1);
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 1, releases: 1 });
      await harness.service.drainMailDispatches();
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 1, releases: 1 });
    } finally {
      harness.restore();
    }
  });

  const lifecycles: ReadonlyArray<Readonly<{
    label: string;
    harness: () => Rework7Harness;
    prepare?: (harness: Rework7Harness) => Promise<void>;
    expected: string;
  }>> = Object.freeze([
    Object.freeze({
      label: "successful delivery",
      harness: () => rework7Harness(),
      expected: "SUCCESS"
    }),
    Object.freeze({
      label: "duplicate address",
      harness: () => rework7Harness({ duplicate: true }),
      expected: "SUCCESS"
    }),
    Object.freeze({
      label: "rate-limit refusal",
      harness: () => rework7Harness(),
      prepare: async (harness: Rework7Harness) => {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          harness.service.register({
            email: `rework7-limiter-${attempt}@example.test`,
            password: REWORK7_PASSWORD,
            recoveryEmail: `rework7-limiter-${attempt}-recovery@example.test`,
            adultAffirmed: true
          }, {
            ip: "2001:db8:7ea::1",
            userAgent: "vitest-t1-rework7",
            requestId: `request:t1:rework7:limiter:${attempt}`
          }).catch(() => undefined);
        }
        await rework7Settle();
        await harness.service.drainMailDispatches();
      },
      expected: "AUTH_RATE_LIMITED"
    }),
    Object.freeze({
      label: "immediate shared-queue full",
      harness: () => rework7Harness({
        channel: { maxConcurrentVerificationDispatches: 1, maxQueuedVerificationDispatches: 0 }
      }),
      prepare: async (harness: Rework7Harness) => { await harness.holdMailPermits(1); },
      expected: "AUTH_MAIL_BUSY"
    }),
    Object.freeze({
      label: "password hash failure",
      harness: () => rework7Harness({ hashFails: true }),
      expected: "AUTH_TEMPORARILY_UNAVAILABLE"
    }),
    Object.freeze({
      label: "database provisioning failure",
      harness: () => rework7Harness({ provisionFails: true }),
      expected: "AUTH_REGISTRATION_FAILED"
    }),
    Object.freeze({
      label: "delivery audit failure",
      harness: () => rework7Harness({ deliveryAuditFails: true }),
      expected: "SUCCESS"
    }),
    Object.freeze({
      label: "response clamp failure",
      harness: () => rework7Harness({ clampFails: true }),
      expected: "RAW:Error: REWORK7_TEST_CLAMP_FAILURE"
    })
  ]);

  for (const lifecycle of lifecycles) {
    it(`releases exactly once on ${lifecycle.label}`, async () => {
      const harness = lifecycle.harness();
      try {
        await lifecycle.prepare?.(harness);
        const admissionsBefore = harness.occupancy().admissions;
        const outcome = await harness.register(0)
          .then(() => "SUCCESS", (error: unknown) => rework7Code(error));
        await harness.service.drainMailDispatches();
        expect(outcome).toBe(lifecycle.expected);
        const occupancy = harness.occupancy();
        expect(occupancy.admitted).toBe(0);
        expect(occupancy.admissions).toBe(admissionsBefore + 1);
        // Exactly once: a second release would show up here as a surplus, and
        // as an admitted counter that can go below zero.
        expect(occupancy.releases).toBe(occupancy.admissions);
      } finally {
        harness.restore();
      }
    });
  }

  // The lifecycle cases above observe release counts through whole requests, and
  // on every one of those paths the product calls the closure exactly once. That
  // leaves the closure's OWN idempotence guard unpinned: deleting it is invisible
  // to them. VR-10 M07 (release made non-idempotent, in isolation) survived that
  // gap. This test pins the guard directly, and then pins the consequence.
  it("makes the admission release closure idempotent, so surplus calls cannot underflow the budget", async () => {
    const harness = rework7Harness({ gateLookup: true });
    try {
      interface Rework7Admission {
        acquireRegistrationAdmission(correlationId: string): () => void;
      }
      const inspected = harness.service as unknown as Rework7Admission;
      expect(typeof inspected.acquireRegistrationAdmission).toBe("function");

      const release = inspected.acquireRegistrationAdmission
        .call(harness.service, "rework7-idempotence");
      // NON-VACUITY: the slot really is held before the closure is touched.
      expect(harness.occupancy()).toMatchObject({ admitted: 1, admissions: 1, releases: 0 });

      release();
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 1, releases: 1 });

      // The guard's whole point: every later call is a no-op. Without it the
      // held counter walks NEGATIVE and releases outrun admissions.
      release();
      release();
      release();
      const after = harness.occupancy();
      expect(after.admitted).toBe(0);
      expect(after.admitted).toBeGreaterThanOrEqual(0);
      expect(after.releases).toBe(1);
      expect(after.releases).toBeLessThanOrEqual(after.admissions);

      // CONSEQUENCE: a negative held counter would silently hand out budget the
      // structural cap never granted, so the very next burst would admit more
      // than 103. It must still admit exactly 103.
      const attempts = Array.from({ length: 110 }, (_, index) =>
        harness.register(index).then(() => "SUCCESS", (error: unknown) => rework7Code(error)));
      const peak = harness.occupancy().admitted;
      harness.openLookupGate();
      const outcomes = await Promise.all(attempts);
      await harness.service.drainMailDispatches();

      expect(peak).toBe(103);
      expect(outcomes.filter((outcome) => outcome === "SUCCESS")).toHaveLength(103);
      expect(outcomes.filter((outcome) => outcome === "AUTH_MAIL_BUSY")).toHaveLength(7);
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 104, releases: 104 });
    } finally {
      harness.restore();
    }
  });

  it("does not reserve mail capacity while a started password hash is unsettled", async () => {
    const harness = rework7Harness({
      deferHash: true
    });
    try {
      const attempt = harness.register(0)
        .then(() => "SUCCESS", (error: unknown) => rework7Code(error));
      await rework7Settle();
      expect(harness.pendingHashes()).toBe(1);
      expect(harness.occupancy()).toMatchObject({ admitted: 1, admissions: 1, releases: 0 });
      expect(harness.counters.mailReservation).toBe(0);
      expect(harness.service.mailDispatchOccupancy()).toMatchObject({ inFlight: 0, queued: 0 });

      harness.failHashes(1);
      expect(await attempt).toBe("AUTH_TEMPORARILY_UNAVAILABLE");
      expect(harness.occupancy()).toMatchObject({ admitted: 0, releases: 1 });
      expect(harness.counters.mailReservation).toBe(0);
      expect(harness.reservationHoldOccupancy).toEqual([]);
    } finally {
      harness.restore();
    }
  });

  it("uses the exact 5700ms registration lease and releases admission once on reservation refusal", async () => {
    const harness = rework7Harness({
      channel: { registrationMailDispatchMinimumReservationMs: 5_700 }
    });
    try {
      const inspected = harness.service as unknown as {
        reserveMailDispatchPermit(request: {
          readonly correlationId: string;
          readonly minimumReservationMs?: number;
          readonly waitDeadlineMs?: number;
        }): Promise<Rework7Activation>;
      };
      const requests: Array<Readonly<{
        minimumReservationMs: number | undefined;
        waitDeadlineMs: number | undefined;
      }>> = [];
      let rejectReservation!: (error: unknown) => void;
      inspected.reserveMailDispatchPermit = (request) => {
        requests.push(Object.freeze({
          minimumReservationMs: request.minimumReservationMs,
          waitDeadlineMs: request.waitDeadlineMs
        }));
        return new Promise<Rework7Activation>((_resolve, reject) => {
          rejectReservation = reject;
        });
      };
      const attempt = harness.register(0)
        .then(() => "SUCCESS", (error: unknown) => rework7Code(error));
      await rework7Settle();
      expect(requests).toEqual([{
        minimumReservationMs: 5_700,
        waitDeadlineMs: 28_000
      }]);
      expect(harness.occupancy()).toMatchObject({ admitted: 1, releases: 0 });

      rejectReservation(new AuthFlowError("AUTH_MAIL_BUSY"));
      expect(await attempt).toBe("AUTH_MAIL_BUSY");
      expect(harness.service.mailDispatchOccupancy().queued).toBe(0);
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 1, releases: 1 });
      expect(harness.reservationHoldOccupancy).toEqual([]);
    } finally {
      harness.restore();
    }
  });

  it("hands a provisioning failure to one visible reservation hold and invokes its release once", async () => {
    const harness = rework7Harness({ provisionFails: true });
    try {
      expect(await harness.register(0)
        .then(() => "SUCCESS", (error: unknown) => rework7Code(error)))
        .toBe("AUTH_REGISTRATION_FAILED");
      await harness.service.drainMailDispatches();
      expect(harness.counters.mailReservation).toBe(1);
      expect(harness.counters.mailRelease).toBe(1);
      expect(harness.reservationHoldOccupancy).toHaveLength(1);
      expect(harness.reservationHoldOccupancy[0]).toMatchObject({ admitted: 1, releases: 0 });
      expect(harness.service.mailDispatchOccupancy()).toMatchObject({ inFlight: 0, activeSends: 0 });
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 1, releases: 1 });
    } finally {
      harness.restore();
    }
  });
});

describe("T1 rework7 A2 — the registration mail-permit deadline is 28 s and resend stays 18 s", () => {
  it("publishes 28,000 ms for registration and 18,000 ms for everything else", () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    expect(policy.channel.registrationMailDispatchQueueWaitTimeoutMs).toBe(28_000);
    expect(policy.channel.mailDispatchQueueWaitTimeoutMs).toBe(18_000);
  });

  for (const route of ["register", "resend"] as const) {
    it(`arms exactly ${route === "register" ? 28_000 : 18_000} ms on a queued ${route}`, async () => {
      const harness = rework7Harness();
      try {
        await harness.holdMailPermits(
          harness.policy.channel.maxConcurrentVerificationDispatches
        );
        const delays: number[] = [];
        const realSetTimeout = globalThis.setTimeout;
        const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
          handler: TimerHandler, delay?: number, ...rest: unknown[]
        ) => {
          delays.push(delay ?? 0);
          const timer = realSetTimeout(handler as () => void, delay, ...rest);
          // Unref'd so a 28-second deadline the test never intends to reach
          // cannot hold the process open past the assertions below.
          (timer as unknown as { unref?: () => void }).unref?.();
          return timer;
        }) as unknown as typeof setTimeout);

        const attempt = route === "register" ? harness.register(0) : harness.resend(0);
        const settled = attempt.then(() => "SETTLED", () => "SETTLED");
        await rework7Settle();
        spy.mockRestore();

        // NON-VACUITY: the request really is queued behind the 32 held permits,
        // so the delay recorded below is its own deadline timer.
        expect(harness.service.mailDispatchOccupancy().queued).toBe(1);
        if (route === "register") {
          expect(delays.filter((delay) => delay === 28_000)).toHaveLength(1);
          expect(delays).not.toContain(18_000);
        } else {
          expect(delays.filter((delay) => delay === 18_000)).toHaveLength(1);
          expect(delays).not.toContain(28_000);
        }

        await harness.freeOneMailPermit();
        expect(await settled).toBe("SETTLED");
        await harness.service.drainMailDispatches();
        // Handoff CLEARS the deadline and leaves no queue node behind.
        expect(harness.service.mailDispatchOccupancy().queued).toBe(0);
      } finally {
        harness.restore();
      }
    });
  }

  it("times a queued registration out as AUTH_MAIL_BUSY, retaining no waiter, token or secret", async () => {
    const secret = "rework7-timeout-secret-passphrase";
    const harness = rework7Harness({
      password: secret,
      channel: { registrationMailDispatchQueueWaitTimeoutMs: 40 }
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    try {
      await harness.holdMailPermits(
        harness.policy.channel.maxConcurrentVerificationDispatches
      );
      const attempt = harness.register(0)
        .then(() => "SUCCESS", (error: unknown) => rework7Code(error));
      await rework7Settle();
      // NON-VACUITY: it is genuinely waiting when the deadline is armed.
      expect(harness.service.mailDispatchOccupancy().queued).toBe(1);

      expect(await attempt).toBe("AUTH_MAIL_BUSY");
      await rework7Settle();

      expect(harness.service.mailDispatchOccupancy().queued).toBe(0);
      expect(harness.service.mailDispatchOccupancy().inFlight)
        .toBe(harness.policy.channel.maxConcurrentVerificationDispatches);
      // No account, no token, no send, and the clamp was still traversed.
      expect(harness.counters).toMatchObject({ tokenMint: 0, mutation: 0, send: 0 });
      expect(harness.sleeps.length).toBeGreaterThan(0);
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 1, releases: 1 });
      expect(retainedStateContains(harness.service, secret)).toBe(false);
      expect(retainedStateContains(harness.service, "rework7-0@example.test")).toBe(false);
      for (const line of harness.errorLog) {
        expect(line).not.toContain(secret);
        expect(line).not.toContain("rework7-0@example.test");
      }
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      harness.restore();
    }
  });

  it("still times a queued resend out on its own 18-second-derived deadline", async () => {
    const harness = rework7Harness({ channel: { mailDispatchQueueWaitTimeoutMs: 40 } });
    try {
      await harness.holdMailPermits(
        harness.policy.channel.maxConcurrentVerificationDispatches
      );
      const attempt = harness.resend(0)
        .then(() => "SUCCESS", (error: unknown) => rework7Code(error));
      await rework7Settle();
      expect(harness.service.mailDispatchOccupancy().queued).toBe(1);
      expect(await attempt).toBe("AUTH_MAIL_BUSY");
      await rework7Settle();
      expect(harness.service.mailDispatchOccupancy().queued).toBe(0);
      // A resend holds no admission slot: the budget is registration-only.
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 0, releases: 0 });
    } finally {
      harness.restore();
    }
  });
});

/**
 * REWORK8 F1/F2. The admission token is the whole capacity contract, so nothing
 * that still holds the caller's password may outlive it. Two shapes of
 * secret-bearing work exist at the reservation race, and Rework7 proved neither:
 *
 *   STARTED — the KDF is already dispatched, `cancel()` is by construction a
 *   no-op, and the worker pool's own execution timeout has not even begun
 *   (it starts at dispatch, not at submission);
 *   QUEUED  — the KDF is still a start closure in `waitingRegistrationHashes`
 *   with the password captured in it, and `cancel()` is the only thing that
 *   will ever remove it.
 *
 * The Rework7 timeout test could only ever see the second shape indirectly: it
 * ran ONE registration against 32 free hash slots, so its hash started at once,
 * and `retainedStateContains` cannot look inside a closure at all.
 */
describe("T1 rework8 F1/F2 — password work may not outlive its admission token", () => {
  it("holds the admission and drain through started password work before attempting a reservation", async () => {
    const secret = "rework8-started-kdf-secret-passphrase";
    const harness = rework7Harness({ deferHash: true, password: secret });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    try {
      interface Rework8Reservation {
        reserveMailDispatchPermit(request: {
          readonly correlationId: string;
          readonly waitDeadlineMs?: number;
        }): Promise<Rework7Activation>;
      }
      const inspected = harness.service as unknown as Rework8Reservation;
      const deadlines: Array<number | undefined> = [];
      inspected.reserveMailDispatchPermit = (request) => {
        deadlines.push(request.waitDeadlineMs);
        return Promise.reject(new AuthFlowError("AUTH_MAIL_BUSY"));
      };

      const attempt = harness.register(0)
        .then(() => "SUCCESS", (error: unknown) => rework7Code(error));
      await rework7Settle();

      // NON-VACUITY. The request is admitted and its KDF is dispatched, but no
      // mail reservation exists until that secret-bearing work is settled.
      expect(deadlines).toEqual([]);
      expect(harness.counters.passwordHash).toBe(1);
      expect(harness.pendingHashes()).toBe(1);
      expect(harness.occupancy()).toMatchObject({ admitted: 1, admissions: 1, releases: 0 });

      let drained = false;
      const drain = harness.service.drainRegistrationAdmissions()
        .then(() => { drained = true; });
      await rework7Settle();
      // A shutdown drain must not be able to walk past secret-bearing work and
      // report the service quiescent while the pool is still hashing.
      expect(drained).toBe(false);
      expect(harness.occupancy()).toMatchObject({ admitted: 1, closing: true, releases: 0 });

      harness.settleHashes(1);
      await rework7Settle();
      expect(await attempt).toBe("AUTH_MAIL_BUSY");
      expect(deadlines).toEqual([28_000]);
      expect(drained).toBe(true);
      await drain;

      const after = harness.occupancy();
      expect(after.admitted).toBe(0);
      expect(after.admissions).toBe(1);
      // Exactly one release after the KDF settled and the later reservation
      // failed; no continuation owned a mail lease during the hash.
      expect(after.releases).toBe(1);
      expect(harness.pendingHashes()).toBe(0);
      // The losing attempt did no account, token or mail work.
      expect(harness.counters).toMatchObject({ tokenMint: 0, mutation: 0, send: 0 });
      expect(retainedStateContains(harness.service, secret)).toBe(false);
      for (const line of harness.errorLog) expect(line).not.toContain(secret);
      // The losing KDF outcome is consumed, not orphaned.
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      harness.restore();
    }
  });

  it("keeps a genuinely queued hash outside the mail queue until a hash slot becomes available", async () => {
    const secret = "rework8-queued-kdf-secret-passphrase";
    const harness = rework7Harness({
      deferHash: true,
      password: secret,
      // The only shortened value is the test-only mail reservation deadline.
      channel: { registrationMailDispatchQueueWaitTimeoutMs: 40 }
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    try {
      interface Rework8Hashes {
        scheduleRegistrationHash(password: string): Readonly<{
          promise: Promise<string>;
          cancel: () => void;
        }>;
        registrationHashesActive: number;
        waitingRegistrationHashes: Array<() => void>;
        /**
         * Optional on purpose: this is the observable cleanup seam the finding
         * asked for, and a build without it must FAIL here rather than silently
         * pass a shallow property scan that cannot see into a closure.
         */
        registrationPasswordReferencesHeld?: number;
      }
      const inspected = harness.service as unknown as Rework8Hashes;
      const slots = harness.policy.channel.maxConcurrentRegistrationHashes;
      expect(slots).toBe(32);

      // Saturate EVERY registration-hash slot with work that has really started
      // and cannot finish until this test says so. Only then can a later hash be
      // genuinely queued rather than dispatched immediately.
      const saturators = Array.from({ length: slots }, (_, index) =>
        inspected.scheduleRegistrationHash.call(harness.service, `rework8-saturator-${index}`));
      for (const saturator of saturators) void saturator.promise.catch(() => undefined);
      await rework7Settle();
      expect(inspected.registrationHashesActive).toBe(slots);
      expect(harness.pendingHashes()).toBe(slots);
      expect(harness.counters.passwordHash).toBe(slots);
      expect(inspected.waitingRegistrationHashes).toHaveLength(0);
      // Every saturator STARTED, so each already handed its password to the KDF
      // and none of them still retains a reference.
      expect(inspected.registrationPasswordReferencesHeld).toBe(0);

      // Fill the shared dispatcher. The target must still NOT join that mail
      // queue until its password hash has first completed.
      await harness.holdMailPermits(
        harness.policy.channel.maxConcurrentVerificationDispatches
      );

      const attempt = harness.register(0)
        .then(() => "SUCCESS", (error: unknown) => rework7Code(error));
      await rework7Settle();

      // NON-VACUITY, every clause checked BEFORE the deadline fires.
      expect(harness.service.mailDispatchOccupancy().queued).toBe(0);
      expect(inspected.waitingRegistrationHashes).toHaveLength(1);
      const queuedStart = inspected.waitingRegistrationHashes[0]!;
      // The target hash was NOT dispatched: the pool call count is unmoved.
      expect(harness.counters.passwordHash).toBe(slots);
      // ...and the target is the one and only holder of a password reference.
      expect(inspected.registrationPasswordReferencesHeld).toBe(1);
      expect(harness.occupancy()).toMatchObject({ admitted: 1, admissions: 1, releases: 0 });

      // Let the saturators finish, which dispatches the target hash, then let
      // that hash finish. Only now may the target enqueue its mail deadline.
      harness.settleHashes(slots);
      await rework7Settle();
      expect(inspected.waitingRegistrationHashes).toHaveLength(0);
      expect(inspected.waitingRegistrationHashes).not.toContain(queuedStart);
      expect(harness.counters.passwordHash).toBe(slots + 1);
      expect(harness.pendingHashes()).toBe(1);
      expect(inspected.registrationPasswordReferencesHeld).toBe(0);
      expect(harness.service.mailDispatchOccupancy().queued).toBe(0);

      harness.settleHashes(1);
      await rework7Settle();
      expect(harness.service.mailDispatchOccupancy().queued).toBe(1);
      expect(await attempt).toBe("AUTH_MAIL_BUSY");
      await rework7Settle();

      // The mail waiter is gone and nothing secret-bearing remains queued.
      expect(harness.service.mailDispatchOccupancy().queued).toBe(0);
      expect(harness.service.mailDispatchOccupancy().inFlight)
        .toBe(harness.policy.channel.maxConcurrentVerificationDispatches);
      // Beyond validation, lookup, limiter and the completed KDF, the timed-out
      // target performed no account/token/mail mutation.
      expect(harness.counters.repository).toBe(1);
      expect(harness.counters.limiterConsume).toBe(1);
      expect(harness.counters).toMatchObject({
        tokenMint: 0, mutation: 0, send: 0, deliveryAudit: 0,
        registrationFailureAudit: 0, limiterRefusal: 0
      });
      // Exactly one grant and exactly one release for the target...
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 1, releases: 1 });
      // ...so the drain reaches zero without waiting on anything.
      await harness.service.drainRegistrationAdmissions();
      expect(harness.occupancy()).toMatchObject({ admitted: 0, releases: 1 });

      expect(retainedStateContains(harness.service, secret)).toBe(false);
      expect(retainedStateContains(harness.service, "rework7-0@example.test")).toBe(false);
      for (const line of harness.errorLog) {
        expect(line).not.toContain(secret);
        expect(line).not.toContain("rework7-0@example.test");
      }
      expect(unhandled).toEqual([]);
    } finally {
      harness.settleHashes(harness.pendingHashes());
      await rework7Settle();
      process.off("unhandledRejection", onUnhandled);
      harness.restore();
    }
  });
});

describe("T1 rework7 A3 — admission close-and-drain", () => {
  it("awaits the exact transition to zero and then refuses new registrations", async () => {
    const harness = rework7Harness({ gateLookup: true });
    try {
      const inFlight = Array.from({ length: 3 }, (_, index) => harness.register(index));
      await rework7Settle();
      expect(harness.occupancy().admitted).toBe(3);

      let drained = false;
      const drain = harness.service.drainRegistrationAdmissions().then(() => { drained = true; });
      await rework7Settle();
      // NON-VACUITY: the drain is really blocked on the three admitted requests.
      expect(drained).toBe(false);
      expect(harness.occupancy().closing).toBe(true);

      const before = { ...harness.counters };
      const refused = await harness.register(900)
        .then(() => "ADMITTED", (error: unknown) => rework7Code(error));
      expect(refused).toBe("AUTH_TEMPORARILY_UNAVAILABLE");
      // A closing refusal enqueues no mail or audit work of its own.
      expect(harness.counters).toEqual(before);

      harness.openLookupGate();
      await Promise.all(inFlight);
      await drain;
      expect(drained).toBe(true);
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 3, releases: 3 });

      // Repeated and concurrent drains join and neither hang nor underflow.
      await Promise.all([
        harness.service.drainRegistrationAdmissions(),
        harness.service.drainRegistrationAdmissions()
      ]);
      await harness.service.drainRegistrationAdmissions();
      expect(harness.occupancy()).toMatchObject({ admitted: 0, releases: 3 });

      await harness.service.drainMailDispatches();
      expect(harness.service.mailDispatchOccupancy()).toMatchObject({
        inFlight: 0, activeSends: 0, queued: 0
      });
    } finally {
      harness.restore();
    }
  });

  it("joins one promise for concurrent drains started while requests are still admitted", async () => {
    const harness = rework7Harness({ gateLookup: true });
    try {
      const inFlight = Array.from({ length: 2 }, (_, index) => harness.register(index));
      await rework7Settle();
      const drains = [
        harness.service.drainRegistrationAdmissions(),
        harness.service.drainRegistrationAdmissions(),
        harness.service.drainRegistrationAdmissions()
      ];
      harness.openLookupGate();
      await Promise.all(inFlight);
      await Promise.all(drains);
      expect(harness.occupancy()).toMatchObject({ admitted: 0, admissions: 2, releases: 2 });
    } finally {
      harness.restore();
    }
  });
});
