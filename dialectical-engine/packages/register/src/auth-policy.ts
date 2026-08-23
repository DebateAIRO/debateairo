import type { Pool } from "pg";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";

export const AUTH_POLICY_ROW_KEYS = [
  "passwordPolicy", "auditSourceIpKdfPolicy", "verificationPolicy", "rateLimitPolicy", "channelPolicy"
] as const;

const passwordPolicySchema = z.object({
  kind: z.literal("PASSWORD_POLICY"),
  minimum_length: z.literal(8),
  composition_rules: z.literal(false),
  forced_rotation: z.literal(false),
  // Finite upper bounds only. Every lower bound and every shipped value is
  // unchanged; these maxima exist so a syntactically valid but hostile register
  // row cannot defeat the worker pool's resource bound by demanding, say, a
  // multi-gibibyte Argon2 allocation per job. The maxima sit at the currently
  // supported ceiling, so no deployed policy value moves.
  argon2id: z.object({
    memory_cost_kib: z.number().int().min(19_456).max(262_144),
    time_cost: z.number().int().min(2).max(10),
    parallelism: z.number().int().positive().max(4),
    hash_length: z.number().int().min(32).max(64)
  }).strict()
}).strict();

const auditSourceIpKdfPolicySchema = z.object({
  kind: z.literal("AUDIT_SOURCE_IP_KDF_POLICY"),
  algorithm: z.literal("argon2id"),
  memory_cost_kib: z.number().int().min(19_456).max(262_144),
  iterations: z.number().int().min(2).max(10),
  // Bounded for the same reason as the password KDF above; the shipped value
  // (1) and every other audit KDF value are unchanged.
  parallelism: z.number().int().positive().max(4),
  hash_length: z.literal(32)
}).strict();

const verificationPolicySchema = z.object({
  kind: z.literal("VERIFICATION_POLICY"),
  token_ttl_ms: z.number().int().positive().max(24 * 60 * 60 * 1_000),
  resend_cooldown_ms: z.number().int().positive(),
  outbound_send_window_ms: z.literal(60 * 60_000),
  outbound_send_max: z.literal(3),
  outbound_send_enforcement: z.object({
    mechanism: z.literal("per_row_last_sent_timestamp_minimum_spacing"),
    minimum_spacing_ms: z.literal(20 * 60_000)
  }).strict(),
  verification_credentials: z.object({
    storage: z.literal("HASH_ONLY_APPEND_ONLY_LEDGER"),
    validity: z.literal("EACH_MAILED_TOKEN_UNTIL_OWN_EXPIRY_OR_ACCOUNT_ACTIVATION"),
    maximum_live_hashes_per_account: z.literal(73),
    pruning: z.literal("ON_RESEND_DELETE_EXPIRED"),
    leaked_token_tradeoff: z.string().regex(/cannot.*revoke.*resend/i)
  }).strict(),
  enumeration_response_floor_ms: z.number().int().positive(),
  enumeration_tolerance_ms: z.number().int().positive()
}).strict();

const routeLimitSchema = z.object({
  window_ms: z.number().int().positive(),
  admission_per_source: z.number().int().positive(),
  per_ip: z.number().int().positive(),
  per_address: z.number().int().positive()
}).strict();

const rateLimitPolicySchema = z.object({
  kind: z.literal("AUTH_RATE_LIMIT_POLICY"),
  bucket_capacity: z.number().int().positive(),
  refusal_audit_interval_ms: z.number().int().positive(),
  legacy_limits_status: z.literal("RETIRED_NOT_ENFORCED"),
  sketch_design: z.object({
    kind: z.literal("KEYED_TWO_ROW_PER_ROUTE_FLAT_TYPED_ARRAY"),
    capacity_scope: z.literal("per_route"),
    slots_per_route: z.number().int().positive(),
    hash_rows: z.literal(2),
    threat_sources_per_window: z.number().int().positive(),
    target_false_refusal_rate_ppm: z.number().int().positive(),
    minimum_row_width_for_target: z.number().int().positive(),
    selected_row_width: z.number().int().positive(),
    sizing_derivation: z.string().min(1),
    full_budget_source_load_per_row: z.number().positive(),
    theoretical_full_budget_false_refusal_rate_ppm: z.number().nonnegative(),
    flat_storage: z.object({
      representation: z.literal("PREALLOCATED_TYPED_ARRAYS"),
      slots: z.number().int().positive(),
      expiry_timestamps: z.number().int().positive(),
      expiry_bytes: z.number().int().positive(),
      saturated_until_bytes: z.number().int().positive(),
      count_bytes: z.number().int().positive(),
      head_bytes: z.number().int().positive(),
      allocated_bytes: z.number().int().positive(),
      allocated_mib: z.number().positive(),
      budget_bytes: z.number().int().positive(),
      budget_mib: z.number().positive(),
      retained_objects_per_occupied_slot: z.literal(0)
    }).strict(),
    isolated_limiter_resident_measurement: z.object({
      measurement: z.literal("isolated_process_rss_at_100_percent_slot_occupancy"),
      runtime: z.literal("node_v22.23.1_darwin_arm64"),
      occupancy_percent: z.literal(100),
      measured_100_percent_rss_mib: z.number().positive(),
      max_measured_curve_rss_mib: z.number().positive(),
      isolated_measurement_ceiling_mib: z.number().positive(),
      includes_isolated_harness_baseline: z.literal(true),
      includes_application_stack_baseline: z.literal(false),
      operator_provisioning_field: z.literal(false),
      operator_instruction: z.string().regex(/not.*provision/i),
      curve_rss_mib: z.object({
        "0": z.number().positive(),
        "25": z.number().positive(),
        "50": z.number().positive(),
        "100": z.number().positive()
      }).strict()
    }).strict(),
    booted_process_resident_bound: z.object({
      measurement: z.literal("booted_registration_process_rss_at_100_percent_slot_occupancy"),
      runtime: z.literal("node_v22.23.1_darwin_arm64"),
      stack: z.literal("postgres_pool_argon2id_64mib_registration_service_file_dek_store"),
      occupancy_percent: z.literal(100),
      worker_remeasurement_100_percent_rss_mib: z.number().positive(),
      independent_verification_100_percent_rss_mib: z.number().positive(),
      measured_100_percent_rss_mib: z.number().positive(),
      provisioning_rounding_increment_mib: z.number().int().positive(),
      published_provisioning_bound_mib: z.number().int().positive(),
      includes_application_stack_baseline: z.literal(true),
      per_process: z.literal(true),
      operator_provisioning_field: z.literal(true),
      operator_instruction: z.string().regex(/published_provisioning_bound_mib.*per API process/i)
    }).strict(),
    reachable_occupancy: z.object({
      source_path: z.literal("one_request_per_distinct_ipv6_source_per_route"),
      ipv6_scope: z.literal("single_/64"),
      sources_per_route_for_99_8_percent: z.number().int().positive(),
      requests_across_three_routes: z.number().int().positive(),
      occupancy_percent: z.literal(99.8)
    }).strict(),
    theoretical_collateral: z.object({
      model: z.literal("exact_binomial_two_independent_rows"),
      derivation: z.string().min(1),
      sources_per_cell: z.number().int().positive(),
      selected_row_width: z.number().int().positive(),
      refusal_rate_ppm: z.object({
        register: z.object({ "1": z.number(), "5": z.number(), "10": z.number(), "20": z.number() }).strict(),
        verify: z.object({ "1": z.number(), "5": z.number(), "10": z.number(), "20": z.number() }).strict(),
        resend: z.object({ "1": z.number(), "5": z.number(), "10": z.number(), "20": z.number() }).strict()
      }).strict()
    }).strict(),
    beyond_threat_curve: z.object({
      model: z.literal("exact_binomial_two_independent_rows_full_budget"),
      derivation: z.string().min(1),
      selected_row_width: z.number().int().positive(),
      refusal_rate_ppm: z.object({
        "50000": z.number().int().nonnegative(),
        "100000": z.number().int().nonnegative(),
        "200000": z.number().int().nonnegative(),
        "400000": z.number().int().nonnegative(),
        "800000": z.number().int().nonnegative()
      }).strict()
    }).strict(),
    residual: z.string().min(1)
  }).strict(),
  routes: z.object({
    register: routeLimitSchema,
    verify: routeLimitSchema,
    resend: routeLimitSchema
  }).strict()
}).strict();

const channelPolicySchema = z.object({
  kind: z.literal("CHANNEL_POLICY"),
  transport: z.literal("own_sendmail"),
  sender_local_part: z.literal("noreply"),
  transport_timeout_ms: z.number().int().positive(),
  spam_notice: z.string().regex(/spam/i),
  verification_dispatch: z.object({
    maximum_concurrent: z.literal(32),
    queue_capacity: z.literal(96),
    at_capacity: z.literal("RETRYABLE_503_BEFORE_ACCOUNT_COMMIT_AFTER_BOUNDED_WAIT"),
    maximum_concurrent_registration_hashes: z.literal(32),
    activation_spacing_ms: z.literal(60),
    registration_activation_spacing_ms: z.literal(45),
    pre_transport_work_budget_ms: z.literal(600),
    no_send_equal_transport_work_ms: z.literal(5_000),
    handoff_scheduler_tolerance_ms: z.literal(100),
    registration_minimum_reservation_ms: z.literal(5_100),
    minimum_reservation_ms: z.literal(5_700),
    queue_wait_timeout_ms: z.literal(18_000),
    release_semantics: z.literal("ARM_INDEPENDENT_ROUTE_DERIVED_GRANT_CADENCE_45MS_REGISTRATION_AFTER_PROVISIONING_AND_RESPONSE_CLAMP_OR_60MS_RESEND;_SATURATION_HANDOFF_ROUTE_DERIVED_5100MS_REGISTRATION_OR_5700MS_RESEND;_EQUAL_TRANSPORT_WORK_EVERY_ADDRESS_ARM;_DELIVERY_AUDIT_AFTER_HANDOFF"),
    retained_payload: z.literal("ACTIVE_SEND_CREDENTIALS;_QUEUE_NODE_OPAQUE_CONTROL_ONLY;_SUSPENDED_REGISTRATION_REQUEST_FRAME_VALIDATED_PLAINTEXT_UNTIL_GRANT_OR_28S_TIMEOUT;_SUSPENDED_RESEND_REQUEST_FRAME_VALIDATED_PLAINTEXT_UNTIL_GRANT_OR_18S_TIMEOUT"),
    operator_signal: z.object({
      payload: z.literal("OPAQUE_WINDOW_COUNT_AND_CORRELATION_NO_ADDRESS_OR_SOURCE"),
      aggregation_window_ms: z.literal(60_000),
      count_cap: z.literal(Number.MAX_SAFE_INTEGER),
      maximum_retained_aggregates: z.literal(1)
    }).strict(),
    registration_clamp_absorption: z.object({
      maximum_unsaturated_concurrency: z.number().int().positive(),
      measured_hash_and_provisioning_max_ms: z.number().positive(),
      measurement_safety_percent: z.number().int().positive(),
      ruled_hash_and_provisioning_upper_bound_ms: z.number().int().positive(),
      response_clamp_ms: z.number().int().positive(),
      binding_headroom_ms: z.number().int().positive(),
      first_measured_unabsorbed_concurrency: z.number().int().positive(),
      beyond_n_star_protection: z.literal("EQUAL_WORK_DISTRIBUTION_NOT_CLAMP_ABSORPTION")
    }).strict(),
    /**
     * decision_version 2, published as a new version beside the sealed one above
     * rather than replacing it. `registration_clamp_absorption` remains the
     * historical decision_version 1 (N*=2) exactly as it was sealed; that row is
     * history, not a monotone lower bound, and nothing here rewrites it.
     *
     * Rework7 demoted this row to CONTRADICTED history. Its arrays are retained
     * byte-for-byte — what changed is its status, not its numbers. `status` is a
     * free string rather than a literal on purpose: a row that re-arms itself as
     * CURRENT must be refused by the DERIVATION with a "contradicts" message, not
     * silently rejected as a malformed member type.
     */
    current_registration_clamp_absorption: z.object({
      decision_version: z.literal(2),
      status: z.string().min(1),
      superseded_by_decision_version: z.number().int().positive(),
      capacity_status: z.string().min(1),
      contradicting_observations: z.object({
        burst_100_accepted_on_unchanged_code: z.array(z.number().int().positive()).length(2),
        n3_hash_and_provisioning_maximum_ms_on_unchanged_code:
          z.array(z.number().positive()).length(2),
        ruled_hash_and_provisioning_upper_bound_ms: z.number().int().positive()
      }).strict(),
      supersedes_decision_version: z.literal(1),
      supersession: z.literal("PUBLISHED_BESIDE_THE_SEALED_DECISION;_HISTORICAL_ROW_RETAINED_UNALTERED_AND_NOT_A_MONOTONE_LOWER_BOUND"),
      registration_activation_spacing_ms: z.number().int().positive(),
      maximum_unsaturated_concurrency: z.number().int().positive(),
      measured_hash_and_provisioning_max_ms: z.number().positive(),
      measurement_safety_percent: z.number().int().positive(),
      ruled_hash_and_provisioning_upper_bound_ms: z.number().int().positive(),
      response_clamp_ms: z.number().int().positive(),
      binding_headroom_ms: z.number().int().positive(),
      first_measured_unabsorbed_concurrency: z.number().int().positive(),
      measured_accepted_request_capacity: z.number().int().positive(),
      beyond_n_star_protection: z.literal("EQUAL_WORK_DISTRIBUTION_NOT_CLAMP_ABSORPTION"),
      evidence: z.object({
        measurement: z.literal("THREE_FRESH_ISOLATED_REPEATS_UNCHANGED_RUNTIME_CADENCE_CAPS_AND_QUEUE_BYTES"),
        repeats: z.literal(3),
        n3_clamp_headroom_tenths_ms: z.array(z.number().int()).length(3),
        n4_clamp_headroom_tenths_ms: z.array(z.number().int()).length(3),
        raw_maximum_absorbed_concurrency_per_repeat: z.array(z.number().int().positive()).length(3),
        first_unabsorbed_concurrency_per_repeat: z.array(z.number().int().positive()).length(3),
        burst_100_accepted_per_repeat: z.array(z.number().int().positive()).length(3),
        burst_128_accepted_per_repeat: z.array(z.number().int().positive()).length(3),
        burst_160_accepted_per_repeat: z.array(z.number().int().positive()).length(3),
        n3_characterization: z.literal("N3_CLAMP_HEADROOM_POSITIVE_IN_EVERY_REPEAT"),
        n4_characterization: z.literal("N4_CLAMP_HEADROOM_STRADDLES_ZERO_ACROSS_REPEATS;_RAW_MAXIMUM_ABSORBED_UNSTABLE;_NOT_A_RATIFIABLE_ABSORPTION_LIMIT"),
        conclusion: z.literal("N3_RATIFIED_ON_THREE_POSITIVE_N3_REPEATS_AT_UNCHANGED_45MS_CADENCE;_N4_DELIBERATELY_NOT_CLAIMED")
      }).strict()
    }).strict(),
    /**
     * decision_version 3 — the CURRENT decision. It says what 103 structurally
     * is (an admission budget with no wait queue) rather than what v2 wrongly
     * measured it to be, gives registration its own 28,000 ms mail-permit wait
     * deadline while resend keeps 18,000 ms, and publishes what it does NOT
     * know: the cadence stays 45 ms but is provisional, and there is no positive
     * current N* at all.
     *
     * Nearly every field here is a plain type rather than a literal, because the
     * derivation below has to be the thing that refuses a drifted value — a
     * literal would reject it as a malformed member type and lose the reason.
     */
    registration_admission: z.object({
      decision_version: z.literal(3),
      status: z.literal("CURRENT"),
      supersedes_decision_version: z.number().int().positive(),
      structural_maximum_concurrent_registrations: z.number().int().positive(),
      registration_mail_permit_wait_deadline_ms: z.number().int().positive(),
      shared_mail_permit_wait_deadline_ms: z.number().int().positive(),
      admission_semantics: z.string().min(1),
      registration_cadence_ms: z.number().int().positive(),
      registration_cadence_status: z.string().min(1),
      /** Absent, never zero, and never a silent fallback to the historical N*=2. */
      current_positive_clamp_absorption_n_star: z.number().int().positive().nullable(),
      historical_n_star_2_is_a_fallback: z.boolean(),
      scope: z.object({
        mail_transport: z.literal("HEALTHY_MTA"),
        host: z.literal("TARGET_HOST"),
        shared_dispatcher_at_entry: z.literal("INITIALLY_EMPTY"),
        burst: z.literal("REGISTER_ONLY_SIMULTANEOUS"),
        hard_availability_requests: z.number().int().positive(),
        mixed_register_and_resend_availability_guaranteed: z.boolean(),
        route_partitioning: z.literal("NOT_AUTHORIZED_IN_REWORK7")
      }).strict(),
      evidence: z.object({
        measurement: z.string().min(1),
        repeats: z.literal(3),
        successes_per_repeat: z.array(z.number().int().positive()).length(3),
        commits_per_repeat: z.array(z.number().int().positive()).length(3),
        sends_per_repeat: z.array(z.number().int().positive()).length(3),
        busy_per_repeat: z.array(z.number().int().nonnegative()).length(3),
        unexpected_per_repeat: z.array(z.number().int().nonnegative()).length(3),
        /** Tenths of a millisecond, so 20,922.9 / 21,902.2 / 20,942.1 stay exact. */
        reservation_wait_maximum_tenths_ms: z.array(z.number().int().positive()).length(3),
        deadline_derivation: z.string().min(1),
        /** Hundredths of a percent, so 25.28 / 21.78 / 25.21 stay exact. */
        margin_hundredths_percent_per_repeat: z.array(z.number().int()).length(3)
      }).strict(),
      retention_disclosure: z.object({
        maximum_admitted_registration_frames: z.number().int().positive(),
        maximum_shared_mail_queue_waiters: z.number().int().positive(),
        queued_registration_frame_retention_ms: z.number().int().positive(),
        queued_registration_frame_contents: z.string().min(1),
        raw_verification_token_minted_before_mail_grant: z.boolean()
      }).strict()
    }).strict(),
    cadence_sensitivity: z.object({
      minus_15_ms: z.object({
        cadence_ms: z.literal(30),
        observation_count: z.literal(3),
        red_count: z.literal(2),
        green_count: z.literal(1),
        n8_median_gap_tenths_ms_range: z.object({
          minimum: z.literal(596),
          maximum: z.literal(1_158)
        }).strict(),
        n8_auc_ppm_range: z.object({
          minimum: z.literal(620_000),
          maximum: z.literal(774_000)
        }).strict(),
        characterization: z.literal("NOISY_2_OF_3_RED_RATE_NOT_DETERMINISTIC_LOWER_BOUND")
      }).strict(),
      plus_15_ms: z.object({
        cadence_ms: z.literal(60),
        observation_count: z.literal(1),
        red_count: z.literal(0),
        green_count: z.literal(1),
        n8_median_gap_tenths_ms: z.literal(121),
        n8_auc_ppm: z.literal(529_000),
        characterization: z.literal("SINGLE_GREEN_OBSERVATION_NOT_STABLE_BOUNDARY")
      }).strict(),
      conclusion: z.literal("CENTRAL_TENDENCY_ORDERS_SAFER_AS_CADENCE_RISES;_RUN_TO_RUN_NOISE_COMPARABLE_TO_OBSERVED_EFFECT;_45MS_CURRENT_VALUE_NOT_UNIQUELY_LOAD_BEARING"),
      recalibration_trigger: z.literal("TARGET_HOST_OR_STORAGE_CLASS_CHANGE_OR_FIRST_UNCHANGED_CODE_RED_AT_45MS")
    }).strict(),
    sizing_derivation: z.string().regex(/45 ms.*N\*=2.*480 ms.*2 \* 45 ms.*570 ms.*600 ms.*30 ms.*equal-work distribution.*60 ms.*logical capacity permit.*durable provisioning.*response clamp.*lease activation.*32 accepted registration hashes.*5100 ms.*5000 ms.*100 ms.*5700 ms.*600 ms.*5000 ms.*100 ms.*18-second.*decision_version 2.*unchanged 45 ms.*N\*=3.*three fresh isolated repeats.*389\.6 ms.*110 percent.*430 ms.*3 \* 45 ms.*565 ms.*600 ms.*35 ms.*\+113\.1, \+111\.2 and \+75\.4 ms.*N=4 is deliberately NOT claimed.*\+7\.0, \+9\.2 and -6\.5 ms.*\[4,4,3\].*\[8,8,4\].*retained unaltered as history.*not a monotone lower bound.*exactly 103.*128 and 160.*103\/103\/103.*100\/100\/100.*decision_version 3.*structural admission budget.*104th.*not a measured accepted-request capacity.*98.*96.*973\.0 ms.*28,000 ms.*18,000 ms.*1\.25.*21,902\.2 ms.*21\.78 percent.*45 ms cadence is provisional.*no positive current N\*/i)
  }).strict(),
  delivery_audit: z.object({
    public_result: z.literal("ENUMERATION_SAFE_GENERIC_RESPONSE"),
    operator_result: z.literal("DURABLE_STATUS_AND_AUDIT_WITH_OPAQUE_CORRELATION"),
    duplicate_registration_rows: z.literal(2),
    duplicate_counting_instruction: z.string().regex(/do not double-count/i)
  }).strict()
}).strict();

export interface AuthPolicyRegisterRow {
  readonly rowKey: typeof AUTH_POLICY_ROW_KEYS[number];
  readonly value: Readonly<Record<string, unknown>>;
  readonly sourceRef: string;
}

export const AUTH_POLICY_REGISTER_ROWS = Object.freeze([
  Object.freeze({
    rowKey: "passwordPolicy" as const,
    value: Object.freeze({
      kind: "PASSWORD_POLICY",
      minimum_length: 8,
      composition_rules: false,
      forced_rotation: false,
      argon2id: Object.freeze({
        memory_cost_kib: 65_536,
        time_cost: 3,
        parallelism: 1,
        hash_length: 32
      })
    }),
    sourceRef: "wave-2-target-architecture.md#10.1 + VR-3/VR-4/VR-5 (2026-08-19)"
  }),
  Object.freeze({
    rowKey: "auditSourceIpKdfPolicy" as const,
    value: Object.freeze({
      kind: "AUDIT_SOURCE_IP_KDF_POLICY",
      algorithm: "argon2id",
      memory_cost_kib: 19_456,
      iterations: 2,
      parallelism: 1,
      hash_length: 32
    }),
    sourceRef: "AMENDMENTS.md#VR-7 memory-hard immutable audit source-IP hashing (2026-08-19)"
  }),
  Object.freeze({
    rowKey: "verificationPolicy" as const,
    value: Object.freeze({
      kind: "VERIFICATION_POLICY",
      token_ttl_ms: 24 * 60 * 60 * 1_000,
      resend_cooldown_ms: 20 * 60_000,
      outbound_send_window_ms: 60 * 60_000,
      outbound_send_max: 3,
      outbound_send_enforcement: Object.freeze({
        mechanism: "per_row_last_sent_timestamp_minimum_spacing",
        minimum_spacing_ms: 20 * 60_000
      }),
      verification_credentials: Object.freeze({
        storage: "HASH_ONLY_APPEND_ONLY_LEDGER",
        validity: "EACH_MAILED_TOKEN_UNTIL_OWN_EXPIRY_OR_ACCOUNT_ACTIVATION",
        maximum_live_hashes_per_account: 73,
        pruning: "ON_RESEND_DELETE_EXPIRED",
        leaked_token_tradeoff: "A token believed leaked cannot be selectively revoked by an unauthenticated resend; every mailed link instead expires at its own ruled 24-hour deadline or is consumed when the account activates. Selective revocation requires a separately authenticated recovery action."
      }),
      enumeration_response_floor_ms: 500,
      enumeration_tolerance_ms: 100
    }),
    sourceRef: "wave-2-target-architecture.md#10.7 + VR-5 + S3c rework1 B1 outbound cap + S3d D2 credential non-interference (2026-08-20)"
  }),
  Object.freeze({
    rowKey: "rateLimitPolicy" as const,
    value: Object.freeze({
      kind: "AUTH_RATE_LIMIT_POLICY",
      bucket_capacity: 524_288,
      refusal_audit_interval_ms: 60_000,
      legacy_limits_status: "RETIRED_NOT_ENFORCED",
      sketch_design: Object.freeze({
        kind: "KEYED_TWO_ROW_PER_ROUTE_FLAT_TYPED_ARRAY",
        capacity_scope: "per_route",
        slots_per_route: 524_288,
        hash_rows: 2,
        threat_sources_per_window: 20_000,
        target_false_refusal_rate_ppm: 10_000,
        minimum_row_width_for_target: 189_825,
        selected_row_width: 262_144,
        sizing_derivation: "Two independent rows need width 189,825 for 20,000 full-budget sources below 10,000 ppm; the smallest power-of-two row is 262,144, so 524,288 slots/route allocate 147 MiB of typed storage within the ruled 160 MiB budget.",
        full_budget_source_load_per_row: 0.076294,
        theoretical_full_budget_false_refusal_rate_ppm: 5_395.831171,
        flat_storage: Object.freeze({
          representation: "PREALLOCATED_TYPED_ARRAYS",
          slots: 1_572_864,
          expiry_timestamps: 17_301_504,
          expiry_bytes: 138_412_032,
          saturated_until_bytes: 12_582_912,
          count_bytes: 1_572_864,
          head_bytes: 1_572_864,
          allocated_bytes: 154_140_672,
          allocated_mib: 147,
          budget_bytes: 167_772_160,
          budget_mib: 160,
          retained_objects_per_occupied_slot: 0
        }),
        isolated_limiter_resident_measurement: Object.freeze({
          measurement: "isolated_process_rss_at_100_percent_slot_occupancy",
          runtime: "node_v22.23.1_darwin_arm64",
          occupancy_percent: 100,
          measured_100_percent_rss_mib: 248.6,
          max_measured_curve_rss_mib: 250,
          isolated_measurement_ceiling_mib: 256,
          includes_isolated_harness_baseline: true,
          includes_application_stack_baseline: false,
          operator_provisioning_field: false,
          operator_instruction: "Limiter capacity validation only; do not use this isolated-process figure to provision an API process.",
          curve_rss_mib: Object.freeze({ "0": 93.7, "25": 249.5, "50": 250, "100": 248.6 })
        }),
        booted_process_resident_bound: Object.freeze({
          measurement: "booted_registration_process_rss_at_100_percent_slot_occupancy",
          runtime: "node_v22.23.1_darwin_arm64",
          stack: "postgres_pool_argon2id_64mib_registration_service_file_dek_store",
          occupancy_percent: 100,
          worker_remeasurement_100_percent_rss_mib: 295,
          independent_verification_100_percent_rss_mib: 368.7,
          measured_100_percent_rss_mib: 368.7,
          provisioning_rounding_increment_mib: 32,
          published_provisioning_bound_mib: 384,
          includes_application_stack_baseline: true,
          per_process: true,
          operator_provisioning_field: true,
          operator_instruction: "Operators must provision at least published_provisioning_bound_mib per API process; isolated_limiter_resident_measurement is not a provisioning figure."
        }),
        reachable_occupancy: Object.freeze({
          source_path: "one_request_per_distinct_ipv6_source_per_route",
          ipv6_scope: "single_/64",
          sources_per_route_for_99_8_percent: 1_600_000,
          requests_across_three_routes: 4_800_000,
          occupancy_percent: 99.8
        }),
        theoretical_collateral: Object.freeze({
          model: "exact_binomial_two_independent_rows",
          derivation: "For each row X~Binomial(20000,1/262144); threshold=ceil(route_limit/min(requests_per_source,route_limit)); false-refusal ppm=P(X>=threshold)^2*1e6.",
          sources_per_cell: 20_000,
          selected_row_width: 262_144,
          refusal_rate_ppm: Object.freeze({
            register: Object.freeze({ "1": 0, "5": 0.000002, "10": 7.652853, "20": 5_395.83117 }),
            verify: Object.freeze({ "1": 0, "5": 7.652853, "10": 5_395.83117, "20": 5_395.83117 }),
            resend: Object.freeze({ "1": 0.004886, "5": 5_395.83117, "10": 5_395.83117, "20": 5_395.83117 })
          })
        }),
        beyond_threat_curve: Object.freeze({
          model: "exact_binomial_two_independent_rows_full_budget",
          derivation: "At full source budget each row slot refuses after one colliding source: X~Binomial(sources,1/262144); false-refusal ppm=P(X>=1)^2*1e6, rounded to the nearest ppm.",
          selected_row_width: 262_144,
          refusal_rate_ppm: Object.freeze({
            "50000": 30_154,
            "100000": 100_580,
            "200000": 284_843,
            "400000": 612_417,
            "800000": 907_684
          })
        }),
        residual: "Beyond 20,000 full-budget sources per route per ruled window, exact-binomial innocent refusal rises from 3.0154% at 50,000 sources through 10.0580%, 28.4843%, and 61.2417% to 90.7684% at 800,000, approaching total refusal beyond that point; collision sharing only over-counts/refuses and never grants a fresh budget."
      }),
      routes: Object.freeze({
        register: Object.freeze({
          window_ms: 15 * 60_000, admission_per_source: 20, per_ip: 20, per_address: 5
        }),
        verify: Object.freeze({
          window_ms: 15 * 60_000, admission_per_source: 10, per_ip: 30, per_address: 10
        }),
        resend: Object.freeze({
          window_ms: 60 * 60_000, admission_per_source: 3, per_ip: 15, per_address: 3
        })
      })
    }),
    sourceRef: "AMENDMENTS.md#A3-10 + S3c D2 source-owned admission + S3c rework3 C1/C2 process provisioning bound and modelled collateral (2026-08-20)"
  }),
  Object.freeze({
    rowKey: "channelPolicy" as const,
    value: Object.freeze({
      kind: "CHANNEL_POLICY",
      transport: "own_sendmail",
      sender_local_part: "noreply",
      transport_timeout_ms: 5_000,
      spam_notice: "Check your spam folder if the verification message does not arrive.",
      verification_dispatch: Object.freeze({
        maximum_concurrent: 32,
        queue_capacity: 96,
        at_capacity: "RETRYABLE_503_BEFORE_ACCOUNT_COMMIT_AFTER_BOUNDED_WAIT",
        maximum_concurrent_registration_hashes: 32,
        activation_spacing_ms: 60,
        registration_activation_spacing_ms: 45,
        pre_transport_work_budget_ms: 600,
        no_send_equal_transport_work_ms: 5_000,
        handoff_scheduler_tolerance_ms: 100,
        registration_minimum_reservation_ms: 5_100,
        minimum_reservation_ms: 5_700,
        queue_wait_timeout_ms: 18_000,
        release_semantics: "ARM_INDEPENDENT_ROUTE_DERIVED_GRANT_CADENCE_45MS_REGISTRATION_AFTER_PROVISIONING_AND_RESPONSE_CLAMP_OR_60MS_RESEND;_SATURATION_HANDOFF_ROUTE_DERIVED_5100MS_REGISTRATION_OR_5700MS_RESEND;_EQUAL_TRANSPORT_WORK_EVERY_ADDRESS_ARM;_DELIVERY_AUDIT_AFTER_HANDOFF",
        retained_payload: "ACTIVE_SEND_CREDENTIALS;_QUEUE_NODE_OPAQUE_CONTROL_ONLY;_SUSPENDED_REGISTRATION_REQUEST_FRAME_VALIDATED_PLAINTEXT_UNTIL_GRANT_OR_28S_TIMEOUT;_SUSPENDED_RESEND_REQUEST_FRAME_VALIDATED_PLAINTEXT_UNTIL_GRANT_OR_18S_TIMEOUT",
        operator_signal: Object.freeze({
          payload: "OPAQUE_WINDOW_COUNT_AND_CORRELATION_NO_ADDRESS_OR_SOURCE",
          aggregation_window_ms: 60_000,
          count_cap: Number.MAX_SAFE_INTEGER,
          maximum_retained_aggregates: 1
        }),
        registration_clamp_absorption: Object.freeze({
          maximum_unsaturated_concurrency: 2,
          measured_hash_and_provisioning_max_ms: 436,
          measurement_safety_percent: 110,
          ruled_hash_and_provisioning_upper_bound_ms: 480,
          response_clamp_ms: 600,
          binding_headroom_ms: 30,
          first_measured_unabsorbed_concurrency: 3,
          beyond_n_star_protection: "EQUAL_WORK_DISTRIBUTION_NOT_CLAMP_ABSORPTION"
        }),
        current_registration_clamp_absorption: Object.freeze({
          decision_version: 2,
          // Rework7. The numbers below are retained byte-for-byte; only the
          // status changed. Unchanged code re-measured the same 100-request
          // burst at 98 and then 96, and the same n=3 arm at 1,264.7 ms and
          // 973.0 ms against this row's own ruled 430 ms bound.
          status: "SUPERSEDED_BY_DECISION_VERSION_3;_CAPACITY_CLAIM_CONTRADICTED_BY_UNCHANGED_CODE_EVIDENCE",
          superseded_by_decision_version: 3,
          capacity_status: "STRUCTURAL_ADMISSION_BUDGET_UNDER_DECISION_VERSION_3;_NOT_A_MEASURED_COMPLETION_RATE",
          contradicting_observations: Object.freeze({
            burst_100_accepted_on_unchanged_code: Object.freeze([98, 96]),
            n3_hash_and_provisioning_maximum_ms_on_unchanged_code:
              Object.freeze([1_264.7, 973.0]),
            ruled_hash_and_provisioning_upper_bound_ms: 430
          }),
          supersedes_decision_version: 1,
          supersession: "PUBLISHED_BESIDE_THE_SEALED_DECISION;_HISTORICAL_ROW_RETAINED_UNALTERED_AND_NOT_A_MONOTONE_LOWER_BOUND",
          registration_activation_spacing_ms: 45,
          maximum_unsaturated_concurrency: 3,
          measured_hash_and_provisioning_max_ms: 389.6,
          measurement_safety_percent: 110,
          ruled_hash_and_provisioning_upper_bound_ms: 430,
          response_clamp_ms: 600,
          binding_headroom_ms: 35,
          first_measured_unabsorbed_concurrency: 4,
          measured_accepted_request_capacity: 103,
          beyond_n_star_protection: "EQUAL_WORK_DISTRIBUTION_NOT_CLAMP_ABSORPTION",
          evidence: Object.freeze({
            measurement: "THREE_FRESH_ISOLATED_REPEATS_UNCHANGED_RUNTIME_CADENCE_CAPS_AND_QUEUE_BYTES",
            repeats: 3,
            // Tenths of a millisecond, so the disclosed measurements stay exact
            // integers: +113.1, +111.2, +75.4 ms.
            n3_clamp_headroom_tenths_ms: Object.freeze([1_131, 1_112, 754]),
            // +7.0, +9.2, -6.5 ms. This straddles zero, which is precisely why
            // N*=4 is not claimed.
            n4_clamp_headroom_tenths_ms: Object.freeze([70, 92, -65]),
            raw_maximum_absorbed_concurrency_per_repeat: Object.freeze([4, 4, 3]),
            first_unabsorbed_concurrency_per_repeat: Object.freeze([8, 8, 4]),
            burst_100_accepted_per_repeat: Object.freeze([100, 100, 100]),
            burst_128_accepted_per_repeat: Object.freeze([103, 103, 103]),
            burst_160_accepted_per_repeat: Object.freeze([103, 103, 103]),
            n3_characterization: "N3_CLAMP_HEADROOM_POSITIVE_IN_EVERY_REPEAT",
            n4_characterization: "N4_CLAMP_HEADROOM_STRADDLES_ZERO_ACROSS_REPEATS;_RAW_MAXIMUM_ABSORBED_UNSTABLE;_NOT_A_RATIFIABLE_ABSORPTION_LIMIT",
            conclusion: "N3_RATIFIED_ON_THREE_POSITIVE_N3_REPEATS_AT_UNCHANGED_45MS_CADENCE;_N4_DELIBERATELY_NOT_CLAIMED"
          })
        }),
        registration_admission: Object.freeze({
          decision_version: 3,
          status: "CURRENT",
          supersedes_decision_version: 2,
          structural_maximum_concurrent_registrations: 103,
          registration_mail_permit_wait_deadline_ms: 28_000,
          shared_mail_permit_wait_deadline_ms: 18_000,
          admission_semantics: "STRUCTURAL_PROCESS_OWNED_ADMISSION_BUDGET_WITH_NO_WAIT_QUEUE;_TAKEN_SYNCHRONOUSLY_BEFORE_THE_FIRST_REPOSITORY_AWAIT;_104TH_REFUSED_BEFORE_ANY_REPOSITORY_LIMITER_KDF_MAIL_TOKEN_OR_MUTATION_WORK;_NOT_A_MEASURED_COMPLETION_RATE",
          registration_cadence_ms: 45,
          registration_cadence_status: "PROVISIONAL;_RECALIBRATION_PENDING;_NOT_UNIQUELY_LOAD_BEARING",
          current_positive_clamp_absorption_n_star: null,
          historical_n_star_2_is_a_fallback: false,
          scope: Object.freeze({
            mail_transport: "HEALTHY_MTA",
            host: "TARGET_HOST",
            shared_dispatcher_at_entry: "INITIALLY_EMPTY",
            burst: "REGISTER_ONLY_SIMULTANEOUS",
            hard_availability_requests: 100,
            mixed_register_and_resend_availability_guaranteed: false,
            route_partitioning: "NOT_AUTHORIZED_IN_REWORK7"
          }),
          evidence: Object.freeze({
            measurement: "THREE_FRESH_DIAGNOSTIC_PROCESSES_WITH_ONLY_THE_TEST_LOCAL_REGISTRATION_WAIT_CEILING_WIDENED_TO_DIAGNOSTIC_60000MS",
            repeats: 3,
            successes_per_repeat: Object.freeze([103, 103, 103]),
            commits_per_repeat: Object.freeze([103, 103, 103]),
            sends_per_repeat: Object.freeze([103, 103, 103]),
            busy_per_repeat: Object.freeze([0, 0, 0]),
            unexpected_per_repeat: Object.freeze([0, 0, 0]),
            // 20,922.9 / 21,902.2 / 20,942.1 ms.
            reservation_wait_maximum_tenths_ms: Object.freeze([209_229, 219_022, 209_421]),
            deadline_derivation: "ceil_to_whole_second(1.25 * 21902.2 ms) = 28000 ms",
            // 25.28% / 21.78% / 25.21%; the tightest is the binding margin.
            margin_hundredths_percent_per_repeat: Object.freeze([2_528, 2_178, 2_521])
          }),
          retention_disclosure: Object.freeze({
            maximum_admitted_registration_frames: 103,
            maximum_shared_mail_queue_waiters: 96,
            queued_registration_frame_retention_ms: 28_000,
            queued_registration_frame_contents: "VALIDATED_EMAIL;_RECOVERY_EMAIL;_PASSWORD;_SOURCE_CONTEXT",
            raw_verification_token_minted_before_mail_grant: false
          })
        }),
        cadence_sensitivity: Object.freeze({
          minus_15_ms: Object.freeze({
            cadence_ms: 30,
            observation_count: 3,
            red_count: 2,
            green_count: 1,
            n8_median_gap_tenths_ms_range: Object.freeze({
              minimum: 596,
              maximum: 1_158
            }),
            n8_auc_ppm_range: Object.freeze({
              minimum: 620_000,
              maximum: 774_000
            }),
            characterization: "NOISY_2_OF_3_RED_RATE_NOT_DETERMINISTIC_LOWER_BOUND"
          }),
          plus_15_ms: Object.freeze({
            cadence_ms: 60,
            observation_count: 1,
            red_count: 0,
            green_count: 1,
            n8_median_gap_tenths_ms: 121,
            n8_auc_ppm: 529_000,
            characterization: "SINGLE_GREEN_OBSERVATION_NOT_STABLE_BOUNDARY"
          }),
          conclusion: "CENTRAL_TENDENCY_ORDERS_SAFER_AS_CADENCE_RISES;_RUN_TO_RUN_NOISE_COMPARABLE_TO_OBSERVED_EFFECT;_45MS_CURRENT_VALUE_NOT_UNIQUELY_LOAD_BEARING",
          recalibration_trigger: "TARGET_HOST_OR_STORAGE_CLASS_CHANGE_OR_FIRST_UNCHANGED_CODE_RED_AT_45MS"
        }),
        sizing_derivation: "The current 45 ms registration cadence has a measured clamp-absorption limit N*=2: the measured hash plus durable provisioning maximum is 436 ms; a ruled 110 percent safety factor rounded upward to 480 ms gives the binding inequality 480 ms + 2 * 45 ms = 570 ms < the 600 ms response clamp, leaving 30 ms ruled headroom. At N>=3 the clamp no longer absorbs the serialized work, so the frozen N=4/N=8 privacy result relies on measured equal-work distribution, not clamp absorption. Across three 30 ms observations the N=8 result was a noisy 2-of-3 RED rate, with median gaps from 59.6 to 115.8 ms and AUC from .620 to .774; the 60 ms result is one GREEN observation at 12.1 ms and .529. Central tendency orders in the safer direction as cadence rises, but run-to-run noise is comparable to the observed effect; 45 ms is the current value, is not claimed uniquely load-bearing, and has no ruled failure probability. Recalibrate on target-host or storage-class change, or the first unchanged-code RED at 45 ms. Resend retains the measured 60 ms cadence needed to keep its in-lease database work bounded. Registration first obtains one bounded logical capacity permit, then completes password hashing, durable provisioning, and the response clamp before lease activation; a full-capacity refusal therefore remains pre-hash and no branch-specific transaction or clamp tail occupies the measured lease. At saturation, at most 32 accepted registration hashes run concurrently. The registration reservation is 5100 ms, exactly the ruled 5000 ms transport-bound work plus 100 ms scheduler tolerance because provisioning and clamp are pre-activation. Resend retains the general 5700 ms reservation: its ruled 600 ms enumeration/pre-transport budget plus 5000 ms transport-bound work plus the same 100 ms tolerance. Delivery-result audit work follows handoff; the following reservation receives the route-derived guard. The 96-entry pre-mint queue retains opaque control nodes only. Suspended request frames necessarily retain validated plaintext email, recovery email, password, and source context until grant or the 18-second timeout; no raw verification token is minted before grant. Availability at healthy-transport bursts is measured separately for V rather than inferred from this arithmetic. A NEW versioned decision (decision_version 2) is published beside that sealed row without altering it: at the unchanged 45 ms registration cadence the current clamp-absorption limit is N*=3. Three fresh isolated repeats, with runtime, cadence, caps and queue bytes all unchanged, measured a worst N=3 hash-plus-provisioning maximum of 389.6 ms; the same ruled 110 percent safety factor rounded upward gives 430 ms, and 430 ms + 3 * 45 ms = 565 ms < the 600 ms response clamp, leaving 35 ms ruled headroom. N=3 clamp headroom was positive in every repeat at +113.1, +111.2 and +75.4 ms. N=4 is deliberately NOT claimed: its headroom straddled zero at +7.0, +9.2 and -6.5 ms, raw maximum absorbed concurrency was [4,4,3] and first unabsorbed was [8,8,4], so N=4 is not a stable absorption limit. The sealed N*=2 decision is retained unaltered as history and is not a monotone lower bound. Measured accepted-request capacity is exactly 103: bursts of 128 and 160 accepted 103/103/103 in every repeat, and a burst of 100 was 100/100/100 in every repeat. A THIRD versioned decision (decision_version 3) now supersedes decision_version 2 and republishes 103 as a structural admission budget: at most 103 validated registration requests may hold that budget at once, it has no wait queue, it is taken synchronously before the first repository await, and the 104th is refused before any repository, limiter, KDF, mail reservation, token or mutation work, with the existing opaque retryable busy envelope and the unchanged 600 ms response clamp. That number is not a measured accepted-request capacity, and Rework7 does not re-claim it as one: on unchanged code the same 100-request burst later accepted 98, and then 96, and the n=3 hash-plus-provisioning maximum re-measured at 1264.7 ms and 973.0 ms against decision_version 2's ruled 430 ms, so decision_version 2 is retained as contradicted history with every array unaltered. The registration mail-permit wait deadline becomes 28,000 ms while resend and every other route keep 18,000 ms, because three fresh diagnostic processes committed and sent 103/103/103 with zero busy and zero unexpected results once only the test-local registration wait ceiling was widened, at reservation wait maxima of 20,922.9, 21,902.2 and 20,942.1 ms; ceil_to_whole_second(1.25 * 21,902.2 ms) = 28,000 ms and the tightest margin is 21.78 percent. The 45 ms cadence is provisional and recalibration-pending, there is no positive current N* at all, and the sealed historical N*=2 is not a fallback. The decision is bounded to a healthy MTA on the target host with an initially empty shared dispatcher and a register-only simultaneous burst of 100; mixed register and resend availability is NOT guaranteed, because both routes still share the one 32-active/96-waiter FIFO and route partitioning is not authorized in Rework7. A queued registration frame therefore retains validated email, recovery email, password and source context for at most 28 seconds rather than the 18 seconds disclosed above; at most 103 admitted registration frames and at most 96 shared mail-queue waiters exist at once, and no raw verification token is minted before mail grant."
      }),
      delivery_audit: Object.freeze({
        public_result: "ENUMERATION_SAFE_GENERIC_RESPONSE",
        operator_result: "DURABLE_STATUS_AND_AUDIT_WITH_OPAQUE_CORRELATION",
        duplicate_registration_rows: 2,
        duplicate_counting_instruction: "A duplicate registration writes the registration DENY and equal-work postwork DENY; operators must correlate them and do not double-count them as two refusal attempts."
      })
    }),
    sourceRef: "AMENDMENTS.md#VR-5 own mail service, no relays + S3d D1/D4 delivery boundedness and honesty (2026-08-20) + T1 rework2 clamp-absorption decision_version 2 N*=3 at unchanged 45 ms from three fresh isolated repeats, sealed decision_version 1 N*=2 retained unaltered, N*=4 deliberately not claimed (2026-08-22) + T1 rework7-A decision_version 3 V-approved structural 103 admission budget and 28,000 ms registration mail-permit deadline with 18,000 ms retained for resend, decision_version 2 demoted to contradicted history and no positive current N* published (2026-08-22)"
  })
] satisfies readonly AuthPolicyRegisterRow[]);

export interface AuthRouteLimit {
  readonly windowMs: number;
  readonly admissionPerSource: number;
}

export interface AuthPolicy {
  readonly password: {
    readonly minimumLength: 8;
    readonly argon2id: {
      readonly memoryCostKiB: number;
      readonly timeCost: number;
      readonly parallelism: number;
      readonly hashLength: number;
    };
  };
  readonly auditSourceIpKdf: {
    readonly algorithm: "argon2id";
    readonly memoryCostKiB: number;
    readonly iterations: number;
    readonly parallelism: number;
    readonly hashLength: 32;
  };
  readonly verification: {
    readonly tokenTtlMs: number;
    readonly resendCooldownMs: number;
    readonly outboundSendWindowMs: number;
    readonly outboundSendMax: 3;
    readonly enumerationResponseFloorMs: number;
    readonly enumerationToleranceMs: number;
  };
  readonly rateLimits: Readonly<Record<"register" | "verify" | "resend", AuthRouteLimit>>;
  readonly rateLimitBucketCapacity: number;
  readonly rateLimitRefusalAuditIntervalMs: number;
  readonly channel: {
    readonly transport: "own_sendmail";
    readonly senderLocalPart: "noreply";
    readonly transportTimeoutMs: number;
    readonly spamNotice: string;
    readonly maxConcurrentVerificationDispatches: 32;
    readonly maxQueuedVerificationDispatches: 96;
    readonly maxConcurrentRegistrationHashes: 32;
    readonly mailDispatchActivationSpacingMs: 60;
    readonly registrationMailDispatchActivationSpacingMs: 45;
    readonly mailDispatchPreTransportWorkBudgetMs: 600;
    readonly mailDispatchNoSendEqualWorkMs: 5_000;
    readonly mailDispatchHandoffSchedulerToleranceMs: 100;
    readonly registrationMailDispatchMinimumReservationMs: 5_100;
    readonly mailDispatchMinimumReservationMs: 5_700;
    /** The SHARED wait deadline. Resend and every non-registration route use it. */
    readonly mailDispatchQueueWaitTimeoutMs: 18_000;
    /**
     * Registration alone waits this long for a mail permit. The shipped 18,000 ms
     * bound was censoring admissions the system could serve: three fresh
     * diagnostic processes completed all 103 at a worst reservation wait of
     * 21,902.2 ms. Derived from the decision row's own evidence rather than
     * pinned as a literal, so a drifted deadline is refused with its reason
     * instead of as a malformed member type.
     */
    readonly registrationMailDispatchQueueWaitTimeoutMs: number;
    readonly mailCapacitySignalAggregationWindowMs: 60_000;
    /**
     * The SEALED historical clamp-absorption decision (version 1, N*=2). It is
     * retained exactly as ruled and is NOT a monotone lower bound.
     */
    readonly maximumClampAbsorbedRegistrationConcurrency: number;
    readonly registrationHashAndProvisioningUpperBoundMs: number;
    readonly registrationClampHeadroomMs: number;
    /**
     * decision_version 2 (N*=3 at the unchanged 45 ms cadence), retained as
     * CONTRADICTED history. Unchanged code re-measured its n=3 arm at 973.0 ms
     * against its own ruled 430 ms, and its "measured 103" at 98 and then 96.
     */
    readonly supersededClampAbsorptionDecisionVersion: number;
    readonly supersededMaximumClampAbsorbedRegistrationConcurrency: number;
    readonly supersededRegistrationHashAndProvisioningUpperBoundMs: number;
    readonly supersededRegistrationClampHeadroomMs: number;
    /** What decision_version 2 once published as a measured accepted-request capacity. */
    readonly supersededMeasuredAcceptedRequestCapacity: number;
    /** decision_version 3 — the current decision. */
    readonly registrationAdmissionDecisionVersion: number;
    /**
     * The structural admission budget: at most this many registrations may be
     * admitted at once. It is a budget size, not a measured completion rate.
     */
    readonly structuralMaximumConcurrentRegistrations: number;
    /**
     * `null`, deliberately. No repeat supports a positive N* under decision
     * version 3, and the historical N*=2 is not a fallback. An absent value is
     * the disclosure; a silent fallback would not be.
     */
    readonly currentPositiveClampAbsorptionNStar: number | null;
  };
}

export function authPolicyFromRegisterRows(rows: readonly AuthPolicyRegisterRow[]): AuthPolicy {
  const byKey = new Map(rows.map((row) => [row.rowKey, row]));
  for (const key of AUTH_POLICY_ROW_KEYS) {
    const row = byKey.get(key);
    if (row === undefined || row.sourceRef.trim() === "") {
      throw new TypedDomainError("AUTH_POLICY_UNRESOLVED", `Missing ruled ${key}`);
    }
  }
  const password = passwordPolicySchema.safeParse(byKey.get("passwordPolicy")!.value);
  const auditSourceIpKdf = auditSourceIpKdfPolicySchema.safeParse(
    byKey.get("auditSourceIpKdfPolicy")!.value
  );
  const verification = verificationPolicySchema.safeParse(byKey.get("verificationPolicy")!.value);
  const rateLimits = rateLimitPolicySchema.safeParse(byKey.get("rateLimitPolicy")!.value);
  const channel = channelPolicySchema.safeParse(byKey.get("channelPolicy")!.value);
  if (!password.success || !auditSourceIpKdf.success || !verification.success
    || !rateLimits.success || !channel.success) {
    throw new TypedDomainError("AUTH_POLICY_INVALID", "An authentication register row violates its ruled member type");
  }
  const routePolicy = (route: keyof typeof rateLimits.data.routes): AuthRouteLimit => Object.freeze({
    windowMs: rateLimits.data.routes[route].window_ms,
    admissionPerSource: rateLimits.data.routes[route].admission_per_source
  });
  if (verification.success
    && verification.data.resend_cooldown_ms * verification.data.outbound_send_max
      < verification.data.outbound_send_window_ms) {
    throw new TypedDomainError(
      "AUTH_POLICY_INVALID",
      "Verification cooldown does not enforce the outbound send ceiling"
    );
  }
  if (rateLimits.success
    && rateLimits.data.bucket_capacity !== rateLimits.data.sketch_design.slots_per_route) {
    throw new TypedDomainError("AUTH_POLICY_INVALID", "Rate-limit capacity contradicts sketch design");
  }
  const dispatch = channel.data.verification_dispatch;
  const derivedPreTransportBudgetMs = verification.data.enumeration_response_floor_ms
    + verification.data.enumeration_tolerance_ms;
  const derivedMinimumReservationMs = derivedPreTransportBudgetMs
    + channel.data.transport_timeout_ms + dispatch.handoff_scheduler_tolerance_ms;
  const derivedRegistrationMinimumReservationMs = channel.data.transport_timeout_ms
    + dispatch.handoff_scheduler_tolerance_ms;
  const absorption = dispatch.registration_clamp_absorption;
  const safetyAdjustedWorkMs = Math.ceil(
    absorption.measured_hash_and_provisioning_max_ms
      * absorption.measurement_safety_percent / 100 / 10
  ) * 10;
  const derivedClampHeadroomMs = derivedPreTransportBudgetMs - (
    absorption.ruled_hash_and_provisioning_upper_bound_ms
      + absorption.maximum_unsaturated_concurrency
        * dispatch.registration_activation_spacing_ms
  );
  if (dispatch.pre_transport_work_budget_ms !== derivedPreTransportBudgetMs
    || dispatch.no_send_equal_transport_work_ms !== channel.data.transport_timeout_ms
    || dispatch.minimum_reservation_ms !== derivedMinimumReservationMs
    || dispatch.registration_minimum_reservation_ms
      !== derivedRegistrationMinimumReservationMs
    || dispatch.maximum_concurrent_registration_hashes > dispatch.maximum_concurrent
    || dispatch.activation_spacing_ms * dispatch.maximum_concurrent
      > dispatch.minimum_reservation_ms
    || absorption.measurement_safety_percent !== 110
    || absorption.ruled_hash_and_provisioning_upper_bound_ms !== safetyAdjustedWorkMs
    || absorption.response_clamp_ms !== derivedPreTransportBudgetMs
    || absorption.binding_headroom_ms !== derivedClampHeadroomMs
    || derivedClampHeadroomMs <= 0
    || absorption.first_measured_unabsorbed_concurrency
      !== absorption.maximum_unsaturated_concurrency + 1) {
    throw new TypedDomainError(
      "AUTH_POLICY_INVALID",
      "Mail reservation derivation contradicts verification or transport policy"
    );
  }
  // The CURRENT decision is derived by exactly the same arithmetic as the sealed
  // one, from its own measurement, so publishing a new version can never smuggle
  // in an unratified safety factor, upper bound or headroom.
  const current = dispatch.current_registration_clamp_absorption;
  const currentSafetyAdjustedWorkMs = Math.ceil(
    current.measured_hash_and_provisioning_max_ms
      * current.measurement_safety_percent / 100 / 10
  ) * 10;
  const currentClampHeadroomMs = derivedPreTransportBudgetMs - (
    current.ruled_hash_and_provisioning_upper_bound_ms
      + current.maximum_unsaturated_concurrency * dispatch.registration_activation_spacing_ms
  );
  const capacity = current.measured_accepted_request_capacity;
  if (current.measurement_safety_percent !== absorption.measurement_safety_percent
    || current.ruled_hash_and_provisioning_upper_bound_ms !== currentSafetyAdjustedWorkMs
    || current.response_clamp_ms !== derivedPreTransportBudgetMs
    || current.binding_headroom_ms !== currentClampHeadroomMs
    || currentClampHeadroomMs <= 0
    || current.first_measured_unabsorbed_concurrency
      !== current.maximum_unsaturated_concurrency + 1
    // The cadence is explicitly UNCHANGED by this decision.
    || current.registration_activation_spacing_ms !== dispatch.registration_activation_spacing_ms
    // A ratified N* may never exceed the WORST repeat's raw absorbed maximum.
    // With raw maxima [4,4,3] this is what structurally forbids claiming N*=4.
    || current.maximum_unsaturated_concurrency
      > Math.min(...current.evidence.raw_maximum_absorbed_concurrency_per_repeat)
    // ...and the ratified N must be supported by a positive headroom in EVERY
    // repeat, not merely on average.
    || current.evidence.n3_clamp_headroom_tenths_ms.some((headroom) => headroom <= 0)
    || current.maximum_unsaturated_concurrency !== 3
    // The published capacity is the one every repeat actually measured.
    || current.evidence.burst_128_accepted_per_repeat.some((accepted) => accepted !== capacity)
    || current.evidence.burst_160_accepted_per_repeat.some((accepted) => accepted !== capacity)
    // The sealed decision must survive this publication byte-for-byte.
    || absorption.maximum_unsaturated_concurrency !== 2
    || absorption.ruled_hash_and_provisioning_upper_bound_ms !== 480
    || absorption.binding_headroom_ms !== 30
    // Rework7. This row is history now, and it must SAY so: a v2 row that
    // re-arms itself as CURRENT, drops its successor, or hides the unchanged-code
    // observations that contradicted it is refused here rather than by the
    // member-type check, so the reason survives in the message.
    || current.status !== "SUPERSEDED_BY_DECISION_VERSION_3;_CAPACITY_CLAIM_CONTRADICTED_BY_UNCHANGED_CODE_EVIDENCE"
    || current.superseded_by_decision_version <= current.decision_version
    || !/NOT_A_MEASURED_COMPLETION_RATE/.test(current.capacity_status)
    || current.contradicting_observations.ruled_hash_and_provisioning_upper_bound_ms
      !== current.ruled_hash_and_provisioning_upper_bound_ms
    // The contradiction has to be a real one in both directions: fewer accepted
    // than the published capacity, and slower than the published upper bound.
    || current.contradicting_observations.burst_100_accepted_on_unchanged_code
      .some((accepted) => accepted >= capacity)
    || current.contradicting_observations.n3_hash_and_provisioning_maximum_ms_on_unchanged_code
      .some((measured) => measured <= current.ruled_hash_and_provisioning_upper_bound_ms)) {
    throw new TypedDomainError(
      "AUTH_POLICY_INVALID",
      "Current clamp-absorption decision contradicts its measured evidence or the sealed decision"
    );
  }
  // decision_version 3. Every ruled number below is re-derived from the row's
  // own disclosed evidence or from the shipped dispatch values it claims to
  // describe, so publishing a new decision cannot smuggle in a cap the request
  // path does not enforce, a deadline the diagnostic does not support, a
  // settled-looking cadence, or a positive N* no repeat measured.
  const admissionRow = dispatch.registration_admission;
  const admissionEvidence = admissionRow.evidence;
  const worstReservationWaitMs =
    Math.max(...admissionEvidence.reservation_wait_maximum_tenths_ms) / 10;
  const derivedRegistrationWaitDeadlineMs =
    Math.ceil(1.25 * worstReservationWaitMs / 1_000) * 1_000;
  const admissionMargin = (waitTenthsMs: number): number => Math.round(
    (derivedRegistrationWaitDeadlineMs - waitTenthsMs / 10)
      * 10_000 / derivedRegistrationWaitDeadlineMs
  );
  if (admissionRow.supersedes_decision_version !== current.decision_version
    || current.superseded_by_decision_version !== admissionRow.decision_version
    // 103 is exactly the number v2 mis-published as a measured capacity, kept as
    // the structural budget, and it can never exceed what the shared FIFO holds.
    || admissionRow.structural_maximum_concurrent_registrations !== capacity
    || admissionRow.structural_maximum_concurrent_registrations
      > dispatch.maximum_concurrent + dispatch.queue_capacity
    || !/STRUCTURAL/.test(admissionRow.admission_semantics)
    || !/NOT_A_MEASURED_COMPLETION_RATE/.test(admissionRow.admission_semantics)
    || admissionRow.registration_mail_permit_wait_deadline_ms
      !== derivedRegistrationWaitDeadlineMs
    || admissionEvidence.deadline_derivation
      !== `ceil_to_whole_second(1.25 * ${worstReservationWaitMs} ms) = ${derivedRegistrationWaitDeadlineMs} ms`
    // Resend keeps the shipped shared bound; only registration moved.
    || admissionRow.shared_mail_permit_wait_deadline_ms !== dispatch.queue_wait_timeout_ms
    // The cadence is explicitly UNCHANGED and explicitly UNSETTLED.
    || admissionRow.registration_cadence_ms !== dispatch.registration_activation_spacing_ms
    || !/PROVISIONAL/.test(admissionRow.registration_cadence_status)
    || !/RECALIBRATION_PENDING/.test(admissionRow.registration_cadence_status)
    // Absent, not zero, and not the historical N*=2 wearing a new name.
    || admissionRow.current_positive_clamp_absorption_n_star !== null
    || admissionRow.historical_n_star_2_is_a_fallback !== false
    || admissionRow.scope.mixed_register_and_resend_availability_guaranteed !== false
    || admissionRow.scope.hard_availability_requests
      > admissionRow.structural_maximum_concurrent_registrations
    // The diagnostic really did complete the whole budget, with nothing refused
    // and nothing unexpected, in every repeat.
    || admissionEvidence.successes_per_repeat.some((count) => count !== capacity)
    || admissionEvidence.commits_per_repeat.some((count) => count !== capacity)
    || admissionEvidence.sends_per_repeat.some((count) => count !== capacity)
    || admissionEvidence.busy_per_repeat.some((count) => count !== 0)
    || admissionEvidence.unexpected_per_repeat.some((count) => count !== 0)
    || admissionEvidence.margin_hundredths_percent_per_repeat.some((margin, index) =>
      margin !== admissionMargin(admissionEvidence.reservation_wait_maximum_tenths_ms[index]!))
    // The retention disclosure must describe THIS decision, not the old one.
    || admissionRow.retention_disclosure.maximum_admitted_registration_frames
      !== admissionRow.structural_maximum_concurrent_registrations
    || admissionRow.retention_disclosure.maximum_shared_mail_queue_waiters
      !== dispatch.queue_capacity
    || admissionRow.retention_disclosure.queued_registration_frame_retention_ms
      !== admissionRow.registration_mail_permit_wait_deadline_ms
    || admissionRow.retention_disclosure.raw_verification_token_minted_before_mail_grant !== false) {
    throw new TypedDomainError(
      "AUTH_POLICY_INVALID",
      "Registration admission decision contradicts its measured evidence or the shipped request path"
    );
  }
  return Object.freeze({
    password: Object.freeze({
      minimumLength: password.data.minimum_length,
      argon2id: Object.freeze({
        memoryCostKiB: password.data.argon2id.memory_cost_kib,
        timeCost: password.data.argon2id.time_cost,
        parallelism: password.data.argon2id.parallelism,
        hashLength: password.data.argon2id.hash_length
      })
    }),
    auditSourceIpKdf: Object.freeze({
      algorithm: auditSourceIpKdf.data.algorithm,
      memoryCostKiB: auditSourceIpKdf.data.memory_cost_kib,
      iterations: auditSourceIpKdf.data.iterations,
      parallelism: auditSourceIpKdf.data.parallelism,
      hashLength: auditSourceIpKdf.data.hash_length
    }),
    verification: Object.freeze({
      tokenTtlMs: verification.data.token_ttl_ms,
      resendCooldownMs: verification.data.resend_cooldown_ms,
      outboundSendWindowMs: verification.data.outbound_send_window_ms,
      outboundSendMax: verification.data.outbound_send_max,
      enumerationResponseFloorMs: verification.data.enumeration_response_floor_ms,
      enumerationToleranceMs: verification.data.enumeration_tolerance_ms
    }),
    rateLimits: Object.freeze({
      register: routePolicy("register"),
      verify: routePolicy("verify"),
      resend: routePolicy("resend")
    }),
    rateLimitBucketCapacity: rateLimits.data.bucket_capacity,
    rateLimitRefusalAuditIntervalMs: rateLimits.data.refusal_audit_interval_ms,
    channel: Object.freeze({
      transport: channel.data.transport,
      senderLocalPart: channel.data.sender_local_part,
      transportTimeoutMs: channel.data.transport_timeout_ms,
      spamNotice: channel.data.spam_notice,
      maxConcurrentVerificationDispatches: channel.data.verification_dispatch.maximum_concurrent,
      maxQueuedVerificationDispatches: channel.data.verification_dispatch.queue_capacity,
      maxConcurrentRegistrationHashes:
        channel.data.verification_dispatch.maximum_concurrent_registration_hashes,
      mailDispatchActivationSpacingMs:
        channel.data.verification_dispatch.activation_spacing_ms,
      registrationMailDispatchActivationSpacingMs:
        channel.data.verification_dispatch.registration_activation_spacing_ms,
      mailDispatchPreTransportWorkBudgetMs:
        channel.data.verification_dispatch.pre_transport_work_budget_ms,
      mailDispatchNoSendEqualWorkMs:
        channel.data.verification_dispatch.no_send_equal_transport_work_ms,
      mailDispatchHandoffSchedulerToleranceMs:
        channel.data.verification_dispatch.handoff_scheduler_tolerance_ms,
      registrationMailDispatchMinimumReservationMs:
        channel.data.verification_dispatch.registration_minimum_reservation_ms,
      mailDispatchMinimumReservationMs: channel.data.verification_dispatch.minimum_reservation_ms,
      mailDispatchQueueWaitTimeoutMs: channel.data.verification_dispatch.queue_wait_timeout_ms,
      registrationMailDispatchQueueWaitTimeoutMs:
        channel.data.verification_dispatch.registration_admission
          .registration_mail_permit_wait_deadline_ms,
      mailCapacitySignalAggregationWindowMs:
        channel.data.verification_dispatch.operator_signal.aggregation_window_ms,
      maximumClampAbsorbedRegistrationConcurrency:
        channel.data.verification_dispatch.registration_clamp_absorption
          .maximum_unsaturated_concurrency,
      registrationHashAndProvisioningUpperBoundMs:
        channel.data.verification_dispatch.registration_clamp_absorption
          .ruled_hash_and_provisioning_upper_bound_ms,
      registrationClampHeadroomMs:
        channel.data.verification_dispatch.registration_clamp_absorption.binding_headroom_ms,
      supersededClampAbsorptionDecisionVersion:
        channel.data.verification_dispatch.current_registration_clamp_absorption.decision_version,
      supersededMaximumClampAbsorbedRegistrationConcurrency:
        channel.data.verification_dispatch.current_registration_clamp_absorption
          .maximum_unsaturated_concurrency,
      supersededRegistrationHashAndProvisioningUpperBoundMs:
        channel.data.verification_dispatch.current_registration_clamp_absorption
          .ruled_hash_and_provisioning_upper_bound_ms,
      supersededRegistrationClampHeadroomMs:
        channel.data.verification_dispatch.current_registration_clamp_absorption
          .binding_headroom_ms,
      supersededMeasuredAcceptedRequestCapacity:
        channel.data.verification_dispatch.current_registration_clamp_absorption
          .measured_accepted_request_capacity,
      registrationAdmissionDecisionVersion:
        channel.data.verification_dispatch.registration_admission.decision_version,
      structuralMaximumConcurrentRegistrations:
        channel.data.verification_dispatch.registration_admission
          .structural_maximum_concurrent_registrations,
      currentPositiveClampAbsorptionNStar:
        channel.data.verification_dispatch.registration_admission
          .current_positive_clamp_absorption_n_star
    })
  });
}

export async function readAuthPolicy(pool: Pool, registerVersion: number): Promise<AuthPolicy> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("A positive register version is required for auth policy");
  }
  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(`
    SELECT row_key,value_json,source_ref FROM register.register_row
    WHERE register_version=$1 AND row_key=ANY($2::text[])
  `, [registerVersion, AUTH_POLICY_ROW_KEYS]);
  return authPolicyFromRegisterRows(result.rows.map((row) => ({
    rowKey: row.row_key as AuthPolicyRegisterRow["rowKey"],
    value: row.value_json as Readonly<Record<string, unknown>>,
    sourceRef: row.source_ref
  })));
}
