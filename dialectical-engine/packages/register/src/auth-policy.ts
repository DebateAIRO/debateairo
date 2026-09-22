import type { Pool } from "pg";
import { z } from "zod";
import {
  canonicalDecimal, canonicalRegisterJson, type CanonicalJsonAst
} from "./register-publication.js";
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
  }).strict(),
  /**
   * V-14. OPTIONAL, because the sealed row (register version 1) carries no
   * maximum and must keep parsing byte-for-byte; the superseding DEPLOYMENT row
   * below carries 1024. The unit is the one `minimum_length` is enforced in —
   * `String.prototype.length`, i.e. UTF-16 code units — so the two password
   * rules read the same way. The ceiling is the route's own request-shape bound
   * (`AUTH_PASSWORD_MAX_BYTES`, 1024 UTF-8 bytes): UTF-8 bytes are never fewer
   * than UTF-16 code units, so a policy maximum above 1024 could never bind.
   */
  max_length: z.number().int().positive().max(1_024).optional()
}).strict().refine(
  // The two length rules are read TOGETHER. A row that satisfies both members
  // in isolation but puts the maximum below the minimum would parse cleanly and
  // then refuse every registration — an outage published as a policy. The
  // member bound above is deliberately only `positive`, so this comparison is
  // the rule that decides coherence and stays the rule if `minimum_length` ever
  // gains a superseding value.
  (value) => value.max_length === undefined || value.max_length >= value.minimum_length,
  { message: "max_length is below minimum_length" }
);

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

/**
 * V-25. The headroom rules an isolated limiter RSS ceiling may be derived under,
 * and the arithmetic each name stands for. A published measurement names its own
 * rule, so a change to the rule is visible in the data instead of silent.
 *
 * `WORST_MEASURED_CURVE_POINT_ROUNDED_UP_TO_INCREMENT` is the ORIGINAL rule, the
 * one `booted_process_resident_bound` still publishes (ceil(368.7 / 32) * 32 =
 * 384) and the one that turned the sealed row's worst point of 250 MiB into its
 * 256. It was calibrated on a five-round measurement whose spread was 5 MiB.
 *
 * `WORST_OF_AT_LEAST_TEN_ROUNDS_PLUS_ONE_INCREMENT_ROUNDED_UP` AMENDS it for this
 * and every future entry — ruled by the coordinator on 2026-09-22 (Task 3), the
 * owner may overturn it. Under node 26 the same measurement spreads 22.6 MiB over
 * fourteen rounds, and the original rule left the worst observation 0.7 MiB of
 * margin: a fence that fails on noise teaches everyone to ignore it, and a case
 * everyone ignores tests nothing. One whole increment of headroom gives 288 MiB,
 * which still catches any regression above about 33 MiB (roughly 13 %) — the
 * class of leak this case exists for. The sealed node 22 entry keeps its original
 * 256 under its original rule, as history.
 */
const AUTH_ISOLATED_LIMITER_CEILING_RULES = Object.freeze({
  WORST_MEASURED_CURVE_POINT_ROUNDED_UP_TO_INCREMENT:
    (worstMib: number, incrementMib: number) => Math.ceil(worstMib / incrementMib) * incrementMib,
  WORST_OF_AT_LEAST_TEN_ROUNDS_PLUS_ONE_INCREMENT_ROUNDED_UP:
    (worstMib: number, incrementMib: number) =>
      Math.ceil((worstMib + incrementMib) / incrementMib) * incrementMib
}) satisfies Readonly<Record<string, (worstMib: number, incrementMib: number) => number>>;

const AUTH_ISOLATED_LIMITER_CEILING_RULE_NAMES = Object.freeze(
  Object.keys(AUTH_ISOLATED_LIMITER_CEILING_RULES)
) as readonly [
  "WORST_MEASURED_CURVE_POINT_ROUNDED_UP_TO_INCREMENT",
  "WORST_OF_AT_LEAST_TEN_ROUNDS_PLUS_ONE_INCREMENT_ROUNDED_UP"
];

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
    /**
     * V-25. OPTIONAL, because the sealed row (register version 1) carries the
     * single-runtime measurement above and must keep parsing byte-for-byte; the
     * superseding DEPLOYMENT row below carries this map. The member above stays
     * exactly as sealed — including its `node_v22.23.1_darwin_arm64` literal,
     * which is part of the sealed shape — and the map's entry for that runtime
     * IS that object, republished verbatim as history.
     *
     * An RSS ceiling is a measurement, and a measurement belongs to ONE runtime:
     * platform, architecture AND Node version. `by_runtime` is keyed by exactly
     * that, so a host compares only against a number measured on a host like it.
     * A runtime with no entry has no published bound and the case that reads it
     * must say so out loud rather than borrow another runtime's figure.
     *
     * Each entry NAMES the headroom rule its ceiling was derived under, because
     * two rules exist and a rule change must be visible in the data rather than
     * buried in a comment. `AUTH_ISOLATED_LIMITER_CEILING_RULES` below is the
     * whole vocabulary and the arithmetic each name stands for.
     */
    isolated_limiter_resident_measurement_versions: z.object({
      /**
       * The increment every rule rounds to: the same ruled 32 MiB increment
       * `booted_process_resident_bound` publishes as
       * `provisioning_rounding_increment_mib` (ceil(368.7 / 32) * 32 = 384).
       */
      measurement_rounding_increment_mib: z.number().int().positive(),
      by_runtime: z.record(
        z.string().regex(/^node_v\d+\.\d+\.\d+_[a-z]+_[a-z0-9]+$/),
        z.object({
          ceiling_rule: z.enum(AUTH_ISOLATED_LIMITER_CEILING_RULE_NAMES),
          /**
           * The rounds the measurement rests on. OPTIONAL, because the sealed
           * node 22 measurement never published its round count and is
           * republished verbatim; the ten-round rule below requires it.
           */
          measurement_rounds: z.number().int().positive().optional(),
          measurement: z.object({
            measurement: z.literal("isolated_process_rss_at_100_percent_slot_occupancy"),
            runtime: z.string().regex(/^node_v\d+\.\d+\.\d+_[a-z]+_[a-z0-9]+$/),
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
          }).strict()
        }).strict()
      )
    }).strict().refine(
      // Read the map's key and the entry's own `runtime` TOGETHER. A row that
      // files a darwin measurement under a linux key would parse member by
      // member and then hand every linux host a number measured on a Mac — a
      // silent wrong answer published as policy. Fail closed instead.
      (value) => Object.entries(value.by_runtime)
        .every(([runtime, version]) => version.measurement.runtime === runtime),
      { message: "a runtime measurement is filed under another runtime's key" }
    ).refine(
      // The measurement must agree with itself: the curve's own 100 % point is
      // the figure the entry names, and the worst point is the worst point.
      (value) => Object.values(value.by_runtime).every(({ measurement: entry }) =>
        entry.measured_100_percent_rss_mib === entry.curve_rss_mib["100"]
        && Math.max(...Object.values(entry.curve_rss_mib))
          === entry.max_measured_curve_rss_mib),
      { message: "a runtime measurement disagrees with its own curve" }
    ).refine(
      // The ceiling is DERIVED by the rule the entry names, never asserted. A
      // hand-edited ceiling — or one derived under a rule the entry does not
      // claim — is refused here.
      (value) => Object.values(value.by_runtime).every((version) =>
        version.measurement.isolated_measurement_ceiling_mib
          === AUTH_ISOLATED_LIMITER_CEILING_RULES[version.ceiling_rule](
            version.measurement.max_measured_curve_rss_mib,
            value.measurement_rounding_increment_mib
          )),
      { message: "a runtime measurement's ceiling is not what its own rule derives" }
    ).refine(
      // The amended rule's precondition, enforced rather than trusted: it may
      // not be claimed without declaring the ten-plus rounds that back it.
      (value) => Object.values(value.by_runtime).every((version) =>
        version.ceiling_rule !== "WORST_OF_AT_LEAST_TEN_ROUNDS_PLUS_ONE_INCREMENT_ROUNDED_UP"
        || (version.measurement_rounds ?? 0) >= 10),
      { message: "the ten-round ceiling rule is claimed without ten measured rounds" }
    ).optional(),
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
    registration_minimum_reservation_ms: z.literal(5_700),
    minimum_reservation_ms: z.literal(5_700),
    queue_wait_timeout_ms: z.literal(18_000),
    release_semantics: z.literal("ARM_INDEPENDENT_ROUTE_DERIVED_GRANT_CADENCE_45MS_REGISTRATION_BEFORE_PROVISIONING_OR_60MS_RESEND;_HTTP_RESPONSE_FLOOR_600MS_FROM_REGISTRATION_ACTIVATION;_SATURATION_HANDOFF_ROUTE_DERIVED_5700MS_EVERY_ROUTE;_EQUAL_TRANSPORT_WORK_EVERY_ADDRESS_ARM;_DELIVERY_AUDIT_AFTER_HANDOFF"),
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
     * decision_version 4 — the CURRENT decision. It says what 103 structurally
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
      decision_version: z.literal(4),
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
        route_partitioning: z.literal("NOT_AUTHORIZED_IN_REWORK7"),
        privacy_pretransport_scope: z.literal("SEPARATE_HEALTHY_STORAGE_BOUND_NOT_MET_BY_CONCURRENT_AVAILABILITY_BURST")
      }).strict(),
      evidence: z.object({
        measurement: z.string().min(1),
        repeats: z.literal(1),
        successes_per_repeat: z.array(z.number().int().positive()).length(1),
        commits_per_repeat: z.array(z.number().int().positive()).length(1),
        sends_per_repeat: z.array(z.number().int().positive()).length(1),
        busy_per_repeat: z.array(z.number().int().nonnegative()).length(1),
        unexpected_per_repeat: z.array(z.number().int().nonnegative()).length(1),
        /** Tenths of a millisecond, so the fresh 5,942.1 ms maximum stays exact. */
        reservation_wait_maximum_tenths_ms: z.array(z.number().int().positive()).length(1),
        deadline_derivation: z.string().min(1),
        /** Hundredths of a percent, so the fresh 78.78% margin stays exact. */
        margin_hundredths_percent_per_repeat: z.array(z.number().int()).length(1)
      }).strict(),
      superseded_decision: z.object({
        decision_version: z.literal(3),
        status: z.literal("SUPERSEDED_BY_DECISION_VERSION_4"),
        supersedes_decision_version: z.literal(2),
        registration_minimum_reservation_ms: z.literal(5_100),
        evidence: z.object({
          measurement: z.literal("THREE_FRESH_DIAGNOSTIC_PROCESSES_WITH_ONLY_THE_TEST_LOCAL_REGISTRATION_WAIT_CEILING_WIDENED_TO_DIAGNOSTIC_60000MS"),
          repeats: z.literal(3),
          successes_per_repeat: z.array(z.number().int().positive()).length(3),
          commits_per_repeat: z.array(z.number().int().positive()).length(3),
          sends_per_repeat: z.array(z.number().int().positive()).length(3),
          busy_per_repeat: z.array(z.number().int().nonnegative()).length(3),
          unexpected_per_repeat: z.array(z.number().int().nonnegative()).length(3),
          reservation_wait_maximum_tenths_ms: z.array(z.number().int().positive()).length(3),
          deadline_derivation: z.string().min(1),
          margin_hundredths_percent_per_repeat: z.array(z.number().int()).length(3)
        }).strict()
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
    sizing_derivation: z.string()
      .regex(/45 ms.*N\*=2.*480 ms.*2 \* 45 ms.*570 ms.*600 ms.*30 ms.*equal-work distribution.*60 ms/i)
      .regex(/logical capacity permit.*completes password hashing.*mail permit.*activates the granted mail lease.*durable provisioning.*600 ms after lease activation.*5700 ms lease.*600 ms pre-transport budget.*5000 ms transport-bound work.*100 ms scheduler tolerance.*32 accepted registration hashes.*same 5700 ms reservation.*600 ms enumeration\/pre-transport budget.*5000 ms transport-bound work.*100 ms tolerance.*18-second/i)
      .regex(/decision_version 2.*unchanged 45 ms.*N\*=3.*three fresh isolated repeats.*389\.6 ms.*110 percent.*430 ms.*3 \* 45 ms.*565 ms.*600 ms.*35 ms.*\+113\.1, \+111\.2 and \+75\.4 ms.*N=4 is deliberately NOT claimed.*\+7\.0, \+9\.2 and -6\.5 ms.*\[4,4,3\].*\[8,8,4\].*retained unaltered as history.*not a monotone lower bound/i)
      .regex(/exactly 103.*128 and 160.*103\/103\/103.*100\/100\/100.*decision_version 3.*structural admission budget.*104th.*not a measured accepted-request capacity.*98.*96.*973\.0 ms/i)
      .regex(/28,000 ms.*18,000 ms.*superseded 5100 ms lease.*1\.25.*21,902\.2 ms.*21\.78 percent.*decision_version 4.*5700 ms.*5,942\.1 ms.*22,057\.9 ms.*78\.78 percent.*45 ms cadence is provisional.*no positive current N\*/i)
      .regex(/healthy DB\/key storage.*within 600 ms.*Storage stalls beyond 600 ms.*external-DEK\/COMMIT ambiguity.*28 seconds/i)
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

const AUTH_POLICY_PUBLICATION_ROWS = Object.freeze([
  Object.freeze({
    "rowKey": "passwordPolicy",
    "value": Object.freeze({
      "kind": "PASSWORD_POLICY",
      "minimum_length": canonicalDecimal("8"),
      "composition_rules": false,
      "forced_rotation": false,
      "argon2id": Object.freeze({
        "memory_cost_kib": canonicalDecimal("65536"),
        "time_cost": canonicalDecimal("3"),
        "parallelism": canonicalDecimal("1"),
        "hash_length": canonicalDecimal("32")
      })
    }),
    "sourceRef": "wave-2-target-architecture.md#10.1 + VR-3/VR-4/VR-5 (2026-08-19)"
  }),
  Object.freeze({
    "rowKey": "auditSourceIpKdfPolicy",
    "value": Object.freeze({
      "kind": "AUDIT_SOURCE_IP_KDF_POLICY",
      "algorithm": "argon2id",
      "memory_cost_kib": canonicalDecimal("19456"),
      "iterations": canonicalDecimal("2"),
      "parallelism": canonicalDecimal("1"),
      "hash_length": canonicalDecimal("32")
    }),
    "sourceRef": "AMENDMENTS.md#VR-7 memory-hard immutable audit source-IP hashing (2026-08-19)"
  }),
  Object.freeze({
    "rowKey": "verificationPolicy",
    "value": Object.freeze({
      "kind": "VERIFICATION_POLICY",
      "token_ttl_ms": canonicalDecimal("86400000"),
      "resend_cooldown_ms": canonicalDecimal("1200000"),
      "outbound_send_window_ms": canonicalDecimal("3600000"),
      "outbound_send_max": canonicalDecimal("3"),
      "outbound_send_enforcement": Object.freeze({
        "mechanism": "per_row_last_sent_timestamp_minimum_spacing",
        "minimum_spacing_ms": canonicalDecimal("1200000")
      }),
      "verification_credentials": Object.freeze({
        "storage": "HASH_ONLY_APPEND_ONLY_LEDGER",
        "validity": "EACH_MAILED_TOKEN_UNTIL_OWN_EXPIRY_OR_ACCOUNT_ACTIVATION",
        "maximum_live_hashes_per_account": canonicalDecimal("73"),
        "pruning": "ON_RESEND_DELETE_EXPIRED",
        "leaked_token_tradeoff": "A token believed leaked cannot be selectively revoked by an unauthenticated resend; every mailed link instead expires at its own ruled 24-hour deadline or is consumed when the account activates. Selective revocation requires a separately authenticated recovery action."
      }),
      "enumeration_response_floor_ms": canonicalDecimal("500"),
      "enumeration_tolerance_ms": canonicalDecimal("100")
    }),
    "sourceRef": "wave-2-target-architecture.md#10.7 + VR-5 + S3c rework1 B1 outbound cap + S3d D2 credential non-interference (2026-08-20)"
  }),
  Object.freeze({
    "rowKey": "rateLimitPolicy",
    "value": Object.freeze({
      "kind": "AUTH_RATE_LIMIT_POLICY",
      "bucket_capacity": canonicalDecimal("524288"),
      "refusal_audit_interval_ms": canonicalDecimal("60000"),
      "legacy_limits_status": "RETIRED_NOT_ENFORCED",
      "sketch_design": Object.freeze({
        "kind": "KEYED_TWO_ROW_PER_ROUTE_FLAT_TYPED_ARRAY",
        "capacity_scope": "per_route",
        "slots_per_route": canonicalDecimal("524288"),
        "hash_rows": canonicalDecimal("2"),
        "threat_sources_per_window": canonicalDecimal("20000"),
        "target_false_refusal_rate_ppm": canonicalDecimal("10000"),
        "minimum_row_width_for_target": canonicalDecimal("189825"),
        "selected_row_width": canonicalDecimal("262144"),
        "sizing_derivation": "Two independent rows need width 189,825 for 20,000 full-budget sources below 10,000 ppm; the smallest power-of-two row is 262,144, so 524,288 slots/route allocate 147 MiB of typed storage within the ruled 160 MiB budget.",
        "full_budget_source_load_per_row": canonicalDecimal("0.076294"),
        "theoretical_full_budget_false_refusal_rate_ppm": canonicalDecimal("5395.831171"),
        "flat_storage": Object.freeze({
          "representation": "PREALLOCATED_TYPED_ARRAYS",
          "slots": canonicalDecimal("1572864"),
          "expiry_timestamps": canonicalDecimal("17301504"),
          "expiry_bytes": canonicalDecimal("138412032"),
          "saturated_until_bytes": canonicalDecimal("12582912"),
          "count_bytes": canonicalDecimal("1572864"),
          "head_bytes": canonicalDecimal("1572864"),
          "allocated_bytes": canonicalDecimal("154140672"),
          "allocated_mib": canonicalDecimal("147"),
          "budget_bytes": canonicalDecimal("167772160"),
          "budget_mib": canonicalDecimal("160"),
          "retained_objects_per_occupied_slot": canonicalDecimal("0")
        }),
        "isolated_limiter_resident_measurement": Object.freeze({
          "measurement": "isolated_process_rss_at_100_percent_slot_occupancy",
          "runtime": "node_v22.23.1_darwin_arm64",
          "occupancy_percent": canonicalDecimal("100"),
          "measured_100_percent_rss_mib": canonicalDecimal("248.6"),
          "max_measured_curve_rss_mib": canonicalDecimal("250"),
          "isolated_measurement_ceiling_mib": canonicalDecimal("256"),
          "includes_isolated_harness_baseline": true,
          "includes_application_stack_baseline": false,
          "operator_provisioning_field": false,
          "operator_instruction": "Limiter capacity validation only; do not use this isolated-process figure to provision an API process.",
          "curve_rss_mib": Object.freeze({
            "0": canonicalDecimal("93.7"),
            "25": canonicalDecimal("249.5"),
            "50": canonicalDecimal("250"),
            "100": canonicalDecimal("248.6")
          })
        }),
        "booted_process_resident_bound": Object.freeze({
          "measurement": "booted_registration_process_rss_at_100_percent_slot_occupancy",
          "runtime": "node_v22.23.1_darwin_arm64",
          "stack": "postgres_pool_argon2id_64mib_registration_service_file_dek_store",
          "occupancy_percent": canonicalDecimal("100"),
          "worker_remeasurement_100_percent_rss_mib": canonicalDecimal("295"),
          "independent_verification_100_percent_rss_mib": canonicalDecimal("368.7"),
          "measured_100_percent_rss_mib": canonicalDecimal("368.7"),
          "provisioning_rounding_increment_mib": canonicalDecimal("32"),
          "published_provisioning_bound_mib": canonicalDecimal("384"),
          "includes_application_stack_baseline": true,
          "per_process": true,
          "operator_provisioning_field": true,
          "operator_instruction": "Operators must provision at least published_provisioning_bound_mib per API process; isolated_limiter_resident_measurement is not a provisioning figure."
        }),
        "reachable_occupancy": Object.freeze({
          "source_path": "one_request_per_distinct_ipv6_source_per_route",
          "ipv6_scope": "single_/64",
          "sources_per_route_for_99_8_percent": canonicalDecimal("1600000"),
          "requests_across_three_routes": canonicalDecimal("4800000"),
          "occupancy_percent": canonicalDecimal("99.8")
        }),
        "theoretical_collateral": Object.freeze({
          "model": "exact_binomial_two_independent_rows",
          "derivation": "For each row X~Binomial(20000,1/262144); threshold=ceil(route_limit/min(requests_per_source,route_limit)); false-refusal ppm=P(X>=threshold)^2*1e6.",
          "sources_per_cell": canonicalDecimal("20000"),
          "selected_row_width": canonicalDecimal("262144"),
          "refusal_rate_ppm": Object.freeze({
            "register": Object.freeze({
              "1": canonicalDecimal("0"),
              "5": canonicalDecimal("0.000002"),
              "10": canonicalDecimal("7.652853"),
              "20": canonicalDecimal("5395.83117")
            }),
            "verify": Object.freeze({
              "1": canonicalDecimal("0"),
              "5": canonicalDecimal("7.652853"),
              "10": canonicalDecimal("5395.83117"),
              "20": canonicalDecimal("5395.83117")
            }),
            "resend": Object.freeze({
              "1": canonicalDecimal("0.004886"),
              "5": canonicalDecimal("5395.83117"),
              "10": canonicalDecimal("5395.83117"),
              "20": canonicalDecimal("5395.83117")
            })
          })
        }),
        "beyond_threat_curve": Object.freeze({
          "model": "exact_binomial_two_independent_rows_full_budget",
          "derivation": "At full source budget each row slot refuses after one colliding source: X~Binomial(sources,1/262144); false-refusal ppm=P(X>=1)^2*1e6, rounded to the nearest ppm.",
          "selected_row_width": canonicalDecimal("262144"),
          "refusal_rate_ppm": Object.freeze({
            "50000": canonicalDecimal("30154"),
            "100000": canonicalDecimal("100580"),
            "200000": canonicalDecimal("284843"),
            "400000": canonicalDecimal("612417"),
            "800000": canonicalDecimal("907684")
          })
        }),
        "residual": "Beyond 20,000 full-budget sources per route per ruled window, exact-binomial innocent refusal rises from 3.0154% at 50,000 sources through 10.0580%, 28.4843%, and 61.2417% to 90.7684% at 800,000, approaching total refusal beyond that point; collision sharing only over-counts/refuses and never grants a fresh budget."
      }),
      "routes": Object.freeze({
        "register": Object.freeze({
          "window_ms": canonicalDecimal("900000"),
          "admission_per_source": canonicalDecimal("20"),
          "per_ip": canonicalDecimal("20"),
          "per_address": canonicalDecimal("5")
        }),
        "verify": Object.freeze({
          "window_ms": canonicalDecimal("900000"),
          "admission_per_source": canonicalDecimal("10"),
          "per_ip": canonicalDecimal("30"),
          "per_address": canonicalDecimal("10")
        }),
        "resend": Object.freeze({
          "window_ms": canonicalDecimal("3600000"),
          "admission_per_source": canonicalDecimal("3"),
          "per_ip": canonicalDecimal("15"),
          "per_address": canonicalDecimal("3")
        })
      })
    }),
    "sourceRef": "AMENDMENTS.md#A3-10 + S3c D2 source-owned admission + S3c rework3 C1/C2 process provisioning bound and modelled collateral (2026-08-20)"
  }),
  Object.freeze({
    "rowKey": "channelPolicy",
    "value": Object.freeze({
      "kind": "CHANNEL_POLICY",
      "transport": "own_sendmail",
      "sender_local_part": "noreply",
      "transport_timeout_ms": canonicalDecimal("5000"),
      "spam_notice": "Check your spam folder if the verification message does not arrive.",
      "verification_dispatch": Object.freeze({
        "maximum_concurrent": canonicalDecimal("32"),
        "queue_capacity": canonicalDecimal("96"),
        "at_capacity": "RETRYABLE_503_BEFORE_ACCOUNT_COMMIT_AFTER_BOUNDED_WAIT",
        "maximum_concurrent_registration_hashes": canonicalDecimal("32"),
        "activation_spacing_ms": canonicalDecimal("60"),
        "registration_activation_spacing_ms": canonicalDecimal("45"),
        "pre_transport_work_budget_ms": canonicalDecimal("600"),
        "no_send_equal_transport_work_ms": canonicalDecimal("5000"),
        "handoff_scheduler_tolerance_ms": canonicalDecimal("100"),
        "registration_minimum_reservation_ms": canonicalDecimal("5700"),
        "minimum_reservation_ms": canonicalDecimal("5700"),
        "queue_wait_timeout_ms": canonicalDecimal("18000"),
        "release_semantics": "ARM_INDEPENDENT_ROUTE_DERIVED_GRANT_CADENCE_45MS_REGISTRATION_BEFORE_PROVISIONING_OR_60MS_RESEND;_HTTP_RESPONSE_FLOOR_600MS_FROM_REGISTRATION_ACTIVATION;_SATURATION_HANDOFF_ROUTE_DERIVED_5700MS_EVERY_ROUTE;_EQUAL_TRANSPORT_WORK_EVERY_ADDRESS_ARM;_DELIVERY_AUDIT_AFTER_HANDOFF",
        "retained_payload": "ACTIVE_SEND_CREDENTIALS;_QUEUE_NODE_OPAQUE_CONTROL_ONLY;_SUSPENDED_REGISTRATION_REQUEST_FRAME_VALIDATED_PLAINTEXT_UNTIL_GRANT_OR_28S_TIMEOUT;_SUSPENDED_RESEND_REQUEST_FRAME_VALIDATED_PLAINTEXT_UNTIL_GRANT_OR_18S_TIMEOUT",
        "operator_signal": Object.freeze({
          "payload": "OPAQUE_WINDOW_COUNT_AND_CORRELATION_NO_ADDRESS_OR_SOURCE",
          "aggregation_window_ms": canonicalDecimal("60000"),
          "count_cap": canonicalDecimal("9007199254740991"),
          "maximum_retained_aggregates": canonicalDecimal("1")
        }),
        "registration_clamp_absorption": Object.freeze({
          "maximum_unsaturated_concurrency": canonicalDecimal("2"),
          "measured_hash_and_provisioning_max_ms": canonicalDecimal("436"),
          "measurement_safety_percent": canonicalDecimal("110"),
          "ruled_hash_and_provisioning_upper_bound_ms": canonicalDecimal("480"),
          "response_clamp_ms": canonicalDecimal("600"),
          "binding_headroom_ms": canonicalDecimal("30"),
          "first_measured_unabsorbed_concurrency": canonicalDecimal("3"),
          "beyond_n_star_protection": "EQUAL_WORK_DISTRIBUTION_NOT_CLAMP_ABSORPTION"
        }),
        "current_registration_clamp_absorption": Object.freeze({
          "decision_version": canonicalDecimal("2"),
          "status": "SUPERSEDED_BY_DECISION_VERSION_3;_CAPACITY_CLAIM_CONTRADICTED_BY_UNCHANGED_CODE_EVIDENCE",
          "superseded_by_decision_version": canonicalDecimal("3"),
          "capacity_status": "STRUCTURAL_ADMISSION_BUDGET_UNDER_DECISION_VERSION_3;_NOT_A_MEASURED_COMPLETION_RATE",
          "contradicting_observations": Object.freeze({
            "burst_100_accepted_on_unchanged_code": Object.freeze([
              canonicalDecimal("98"),
              canonicalDecimal("96")
            ]),
            "n3_hash_and_provisioning_maximum_ms_on_unchanged_code": Object.freeze([
              canonicalDecimal("1264.7"),
              canonicalDecimal("973")
            ]),
            "ruled_hash_and_provisioning_upper_bound_ms": canonicalDecimal("430")
          }),
          "supersedes_decision_version": canonicalDecimal("1"),
          "supersession": "PUBLISHED_BESIDE_THE_SEALED_DECISION;_HISTORICAL_ROW_RETAINED_UNALTERED_AND_NOT_A_MONOTONE_LOWER_BOUND",
          "registration_activation_spacing_ms": canonicalDecimal("45"),
          "maximum_unsaturated_concurrency": canonicalDecimal("3"),
          "measured_hash_and_provisioning_max_ms": canonicalDecimal("389.6"),
          "measurement_safety_percent": canonicalDecimal("110"),
          "ruled_hash_and_provisioning_upper_bound_ms": canonicalDecimal("430"),
          "response_clamp_ms": canonicalDecimal("600"),
          "binding_headroom_ms": canonicalDecimal("35"),
          "first_measured_unabsorbed_concurrency": canonicalDecimal("4"),
          "measured_accepted_request_capacity": canonicalDecimal("103"),
          "beyond_n_star_protection": "EQUAL_WORK_DISTRIBUTION_NOT_CLAMP_ABSORPTION",
          "evidence": Object.freeze({
            "measurement": "THREE_FRESH_ISOLATED_REPEATS_UNCHANGED_RUNTIME_CADENCE_CAPS_AND_QUEUE_BYTES",
            "repeats": canonicalDecimal("3"),
            "n3_clamp_headroom_tenths_ms": Object.freeze([
              canonicalDecimal("1131"),
              canonicalDecimal("1112"),
              canonicalDecimal("754")
            ]),
            "n4_clamp_headroom_tenths_ms": Object.freeze([
              canonicalDecimal("70"),
              canonicalDecimal("92"),
              canonicalDecimal("-65")
            ]),
            "raw_maximum_absorbed_concurrency_per_repeat": Object.freeze([
              canonicalDecimal("4"),
              canonicalDecimal("4"),
              canonicalDecimal("3")
            ]),
            "first_unabsorbed_concurrency_per_repeat": Object.freeze([
              canonicalDecimal("8"),
              canonicalDecimal("8"),
              canonicalDecimal("4")
            ]),
            "burst_100_accepted_per_repeat": Object.freeze([
              canonicalDecimal("100"),
              canonicalDecimal("100"),
              canonicalDecimal("100")
            ]),
            "burst_128_accepted_per_repeat": Object.freeze([
              canonicalDecimal("103"),
              canonicalDecimal("103"),
              canonicalDecimal("103")
            ]),
            "burst_160_accepted_per_repeat": Object.freeze([
              canonicalDecimal("103"),
              canonicalDecimal("103"),
              canonicalDecimal("103")
            ]),
            "n3_characterization": "N3_CLAMP_HEADROOM_POSITIVE_IN_EVERY_REPEAT",
            "n4_characterization": "N4_CLAMP_HEADROOM_STRADDLES_ZERO_ACROSS_REPEATS;_RAW_MAXIMUM_ABSORBED_UNSTABLE;_NOT_A_RATIFIABLE_ABSORPTION_LIMIT",
            "conclusion": "N3_RATIFIED_ON_THREE_POSITIVE_N3_REPEATS_AT_UNCHANGED_45MS_CADENCE;_N4_DELIBERATELY_NOT_CLAIMED"
          })
        }),
        "registration_admission": Object.freeze({
          "decision_version": canonicalDecimal("4"),
          "status": "CURRENT",
          "supersedes_decision_version": canonicalDecimal("3"),
          "structural_maximum_concurrent_registrations": canonicalDecimal("103"),
          "registration_mail_permit_wait_deadline_ms": canonicalDecimal("28000"),
          "shared_mail_permit_wait_deadline_ms": canonicalDecimal("18000"),
          "admission_semantics": "STRUCTURAL_PROCESS_OWNED_ADMISSION_BUDGET_WITH_NO_WAIT_QUEUE;_TAKEN_SYNCHRONOUSLY_BEFORE_THE_FIRST_REPOSITORY_AWAIT;_104TH_REFUSED_BEFORE_ANY_REPOSITORY_LIMITER_KDF_MAIL_TOKEN_OR_MUTATION_WORK;_NOT_A_MEASURED_COMPLETION_RATE",
          "registration_cadence_ms": canonicalDecimal("45"),
          "registration_cadence_status": "PROVISIONAL;_RECALIBRATION_PENDING;_NOT_UNIQUELY_LOAD_BEARING",
          "current_positive_clamp_absorption_n_star": null,
          "historical_n_star_2_is_a_fallback": false,
          "scope": Object.freeze({
            "mail_transport": "HEALTHY_MTA",
            "host": "TARGET_HOST",
            "shared_dispatcher_at_entry": "INITIALLY_EMPTY",
            "burst": "REGISTER_ONLY_SIMULTANEOUS",
            "hard_availability_requests": canonicalDecimal("100"),
            "mixed_register_and_resend_availability_guaranteed": false,
            "route_partitioning": "NOT_AUTHORIZED_IN_REWORK7",
            "privacy_pretransport_scope": "SEPARATE_HEALTHY_STORAGE_BOUND_NOT_MET_BY_CONCURRENT_AVAILABILITY_BURST"
          }),
          "evidence": Object.freeze({
            "measurement": "ONE_FRESH_FINAL_5700MS_HASH_FIRST_PRODUCTION_POLICY_REGISTER_ONLY_AVAILABILITY_RUN;_100_AND_103_COMPLETE;_104_128_160_CAP_AT_103;_HEALTHY_5MS_MTA;_NOT_PRIVACY_ENVELOPE_EVIDENCE",
            "repeats": canonicalDecimal("1"),
            "successes_per_repeat": Object.freeze([
              canonicalDecimal("103")
            ]),
            "commits_per_repeat": Object.freeze([
              canonicalDecimal("103")
            ]),
            "sends_per_repeat": Object.freeze([
              canonicalDecimal("103")
            ]),
            "busy_per_repeat": Object.freeze([
              canonicalDecimal("0")
            ]),
            "unexpected_per_repeat": Object.freeze([
              canonicalDecimal("0")
            ]),
            "reservation_wait_maximum_tenths_ms": Object.freeze([
              canonicalDecimal("59421")
            ]),
            "deadline_derivation": "retained 28000 ms exceeds fresh 5942.1 ms maximum by 22057.9 ms",
            "margin_hundredths_percent_per_repeat": Object.freeze([
              canonicalDecimal("7878")
            ])
          }),
          "superseded_decision": Object.freeze({
            "decision_version": canonicalDecimal("3"),
            "status": "SUPERSEDED_BY_DECISION_VERSION_4",
            "supersedes_decision_version": canonicalDecimal("2"),
            "registration_minimum_reservation_ms": canonicalDecimal("5100"),
            "evidence": Object.freeze({
              "measurement": "THREE_FRESH_DIAGNOSTIC_PROCESSES_WITH_ONLY_THE_TEST_LOCAL_REGISTRATION_WAIT_CEILING_WIDENED_TO_DIAGNOSTIC_60000MS",
              "repeats": canonicalDecimal("3"),
              "successes_per_repeat": Object.freeze([
                canonicalDecimal("103"),
                canonicalDecimal("103"),
                canonicalDecimal("103")
              ]),
              "commits_per_repeat": Object.freeze([
                canonicalDecimal("103"),
                canonicalDecimal("103"),
                canonicalDecimal("103")
              ]),
              "sends_per_repeat": Object.freeze([
                canonicalDecimal("103"),
                canonicalDecimal("103"),
                canonicalDecimal("103")
              ]),
              "busy_per_repeat": Object.freeze([
                canonicalDecimal("0"),
                canonicalDecimal("0"),
                canonicalDecimal("0")
              ]),
              "unexpected_per_repeat": Object.freeze([
                canonicalDecimal("0"),
                canonicalDecimal("0"),
                canonicalDecimal("0")
              ]),
              "reservation_wait_maximum_tenths_ms": Object.freeze([
                canonicalDecimal("209229"),
                canonicalDecimal("219022"),
                canonicalDecimal("209421")
              ]),
              "deadline_derivation": "ceil_to_whole_second(1.25 * 21902.2 ms) = 28000 ms",
              "margin_hundredths_percent_per_repeat": Object.freeze([
                canonicalDecimal("2528"),
                canonicalDecimal("2178"),
                canonicalDecimal("2521")
              ])
            })
          }),
          "retention_disclosure": Object.freeze({
            "maximum_admitted_registration_frames": canonicalDecimal("103"),
            "maximum_shared_mail_queue_waiters": canonicalDecimal("96"),
            "queued_registration_frame_retention_ms": canonicalDecimal("28000"),
            "queued_registration_frame_contents": "VALIDATED_EMAIL;_RECOVERY_EMAIL;_PASSWORD;_SOURCE_CONTEXT",
            "raw_verification_token_minted_before_mail_grant": false
          })
        }),
        "cadence_sensitivity": Object.freeze({
          "minus_15_ms": Object.freeze({
            "cadence_ms": canonicalDecimal("30"),
            "observation_count": canonicalDecimal("3"),
            "red_count": canonicalDecimal("2"),
            "green_count": canonicalDecimal("1"),
            "n8_median_gap_tenths_ms_range": Object.freeze({
              "minimum": canonicalDecimal("596"),
              "maximum": canonicalDecimal("1158")
            }),
            "n8_auc_ppm_range": Object.freeze({
              "minimum": canonicalDecimal("620000"),
              "maximum": canonicalDecimal("774000")
            }),
            "characterization": "NOISY_2_OF_3_RED_RATE_NOT_DETERMINISTIC_LOWER_BOUND"
          }),
          "plus_15_ms": Object.freeze({
            "cadence_ms": canonicalDecimal("60"),
            "observation_count": canonicalDecimal("1"),
            "red_count": canonicalDecimal("0"),
            "green_count": canonicalDecimal("1"),
            "n8_median_gap_tenths_ms": canonicalDecimal("121"),
            "n8_auc_ppm": canonicalDecimal("529000"),
            "characterization": "SINGLE_GREEN_OBSERVATION_NOT_STABLE_BOUNDARY"
          }),
          "conclusion": "CENTRAL_TENDENCY_ORDERS_SAFER_AS_CADENCE_RISES;_RUN_TO_RUN_NOISE_COMPARABLE_TO_OBSERVED_EFFECT;_45MS_CURRENT_VALUE_NOT_UNIQUELY_LOAD_BEARING",
          "recalibration_trigger": "TARGET_HOST_OR_STORAGE_CLASS_CHANGE_OR_FIRST_UNCHANGED_CODE_RED_AT_45MS"
        }),
        "sizing_derivation": "The current 45 ms registration cadence has a measured clamp-absorption limit N*=2: the measured hash plus durable provisioning maximum is 436 ms; a ruled 110 percent safety factor rounded upward to 480 ms gives the binding inequality 480 ms + 2 * 45 ms = 570 ms < the 600 ms response clamp, leaving 30 ms ruled headroom. At N>=3 the clamp no longer absorbs the serialized work, so the frozen N=4/N=8 privacy result relies on measured equal-work distribution, not clamp absorption. Across three 30 ms observations the N=8 result was a noisy 2-of-3 RED rate, with median gaps from 59.6 to 115.8 ms and AUC from .620 to .774; the 60 ms result is one GREEN observation at 12.1 ms and .529. Central tendency orders in the safer direction as cadence rises, but run-to-run noise is comparable to the observed effect; 45 ms is the current value, is not claimed uniquely load-bearing, and has no ruled failure probability. Recalibrate on target-host or storage-class change, or the first unchanged-code RED at 45 ms. Resend retains the measured 60 ms cadence needed to keep its in-lease database work bounded. Registration first obtains one bounded logical capacity permit and completes password hashing before it requests a mail permit; that permit activates the granted mail lease immediately on fulfillment and before durable provisioning. Successful provisioning immediately registers equal send/no-send dispatch work, while HTTP completion remains gated to both the original response clamp and 600 ms after lease activation. A full-capacity refusal therefore remains pre-hash, and branch-specific provisioning runs inside a 5700 ms lease derived from the ruled 600 ms pre-transport budget plus 5000 ms transport-bound work plus 100 ms scheduler tolerance. At saturation, at most 32 accepted registration hashes run concurrently. Resend retains the same 5700 ms reservation: its ruled 600 ms enumeration/pre-transport budget plus 5000 ms transport-bound work plus the same 100 ms tolerance. Delivery-result audit work follows handoff; the following reservation receives the route-derived guard. The 96-entry pre-mint queue retains opaque control nodes only. Suspended request frames necessarily retain validated plaintext email, recovery email, password, and source context until grant or the 18-second timeout; no raw verification token is minted before grant. Availability at healthy-transport bursts is measured separately for V rather than inferred from this arithmetic. A NEW versioned decision (decision_version 2) is published beside that sealed row without altering it: at the unchanged 45 ms registration cadence the current clamp-absorption limit is N*=3. Three fresh isolated repeats, with runtime, cadence, caps and queue bytes all unchanged, measured a worst N=3 hash-plus-provisioning maximum of 389.6 ms; the same ruled 110 percent safety factor rounded upward gives 430 ms, and 430 ms + 3 * 45 ms = 565 ms < the 600 ms response clamp, leaving 35 ms ruled headroom. N=3 clamp headroom was positive in every repeat at +113.1, +111.2 and +75.4 ms. N=4 is deliberately NOT claimed: its headroom straddled zero at +7.0, +9.2 and -6.5 ms, raw maximum absorbed concurrency was [4,4,3] and first unabsorbed was [8,8,4], so N=4 is not a stable absorption limit. The sealed N*=2 decision is retained unaltered as history and is not a monotone lower bound. Measured accepted-request capacity is exactly 103: bursts of 128 and 160 accepted 103/103/103 in every repeat, and a burst of 100 was 100/100/100 in every repeat. A THIRD versioned decision (decision_version 3) now supersedes decision_version 2 and republishes 103 as a structural admission budget: at most 103 validated registration requests may hold that budget at once, it has no wait queue, it is taken synchronously before the first repository await, and the 104th is refused before any repository, limiter, KDF, mail reservation, token or mutation work, with the existing opaque retryable busy envelope and the unchanged 600 ms response clamp. That number is not a measured accepted-request capacity, and Rework7 does not re-claim it as one: on unchanged code the same 100-request burst later accepted 98, and then 96, and the n=3 hash-plus-provisioning maximum re-measured at 1264.7 ms and 973.0 ms against decision_version 2's ruled 430 ms, so decision_version 2 is retained as contradicted history with every array unaltered. The registration mail-permit wait deadline remains 28,000 ms while resend and every other route keep 18,000 ms. Historical decision_version 3 evidence used the superseded 5100 ms lease: it committed and sent exactly 103 per process at wait maxima 20,922.9, 21,902.2 and 20,942.1 ms; ceil_to_whole_second(1.25 * 21,902.2 ms) = 28,000 ms and the tightest margin was 21.78 percent. Those observations remain byte-exact historical evidence. A FOURTH versioned decision (decision_version 4) validates the final hash-first 5700 ms lease and retains the conservative 28-second registration deadline: a fresh production-policy run completed 100/100 at the hard availability point and 103/103 at the structural cap, refused only the expected excess at 104/128/160, and measured a 5,942.1 ms maximum accepted mail-permit wait, leaving 22,057.9 ms or 78.78 percent of the retained deadline. The 45 ms cadence is provisional and recalibration-pending, there is no positive current N* at all, and the sealed historical N*=2 is not a fallback. Decision v4 availability is bounded to a healthy MTA on the target host with an initially empty shared dispatcher and a register-only simultaneous burst; its concurrent DB/key-storage phase exceeded 600 ms and is explicitly not timing-opacity evidence. The timing-opacity claim is separately bounded to scored operations whose healthy DB/key storage completes the pre-transport phase within 600 ms. Mixed register and resend availability is NOT guaranteed, because both routes still share the one 32-active/96-waiter FIFO and route partitioning is not authorized in Rework7. Storage stalls beyond 600 ms and pre-COMMIT DEK failures remain explicitly out of the bounded timing-opacity claim and emit an operator signal; external-DEK/COMMIT ambiguity remains a reconciliation residual. A queued registration frame therefore retains validated email, recovery email, password and source context for at most 28 seconds rather than the 18 seconds disclosed above; at most 103 admitted registration frames and at most 96 shared mail-queue waiters exist at once, and no raw verification token is minted before mail grant."
      }),
      "delivery_audit": Object.freeze({
        "public_result": "ENUMERATION_SAFE_GENERIC_RESPONSE",
        "operator_result": "DURABLE_STATUS_AND_AUDIT_WITH_OPAQUE_CORRELATION",
        "duplicate_registration_rows": canonicalDecimal("2"),
        "duplicate_counting_instruction": "A duplicate registration writes the registration DENY and equal-work postwork DENY; operators must correlate them and do not double-count them as two refusal attempts."
      })
    }),
    "sourceRef": "AMENDMENTS.md#VR-5 own mail service, no relays + S3d D1/D4 delivery boundedness and honesty (2026-08-20) + T1 rework2 clamp-absorption decision_version 2 N*=3 at unchanged 45 ms from three fresh isolated repeats, sealed decision_version 1 N*=2 retained unaltered, N*=4 deliberately not claimed (2026-08-22) + T1 rework7-A decision_version 3 V-approved structural 103 admission budget and 28,000 ms registration mail-permit deadline with 18,000 ms retained for resend, decision_version 2 demoted to contradicted history and no positive current N* published (2026-08-22) + T1 decision_version 4 final hash-first 5700 ms lease availability remeasurement with decision_version 3 retained as superseded history and storage-overrun opacity residual (2026-08-25)"
  })
]);

export const AUTH_POLICY_REGISTER_ROWS = Object.freeze(AUTH_POLICY_PUBLICATION_ROWS.map((row) =>
  Object.freeze({
    rowKey: row.rowKey,
    valueAst: row.value,
    value: JSON.parse(canonicalRegisterJson(row.value)) as Readonly<Record<string, unknown>>,
    sourceRef: row.sourceRef
  })
));

/**
 * V-14, ruled 2026-09-21: the password maximum length becomes policy.
 *
 * The rows above are the SEALED historical set (register version 1, sealed by
 * hash); nothing in them may move. This is the superseding DEPLOYMENT set: the
 * same five row keys, with `passwordPolicy` republished as a new version that
 * adds `max_length` and changes no other member. A deployment publishes these
 * rows at its own register version; the sealed rows stay as history.
 */
const PASSWORD_POLICY_MAXIMUM_LENGTH = "1024";
const PASSWORD_POLICY_MAXIMUM_LENGTH_SOURCE_REF =
  " + V-14 ruled 2026-09-21 (V, chat): versioned passwordPolicy row with"
  + " max_length 1024, superseding the sealed row without altering it";

/**
 * V-25, ruled 2026-09-21: the isolated limiter RSS bound is republished per
 * runtime, because the project moved to node 26 while the sealed bound was
 * measured under node 22. This is the runtime-keyed VERSION of the row; the
 * sealed single-runtime measurement is republished inside it verbatim, never
 * edited.
 *
 * Measured 2026-09-22 on the ruled darwin_arm64 Mac under node v26.8.2, with
 * the very child program the case runs, on a quiet host. Fourteen observations
 * of the worst curve point: ten standalone rounds 253.6 / 249.5 / 239.9 / 249.4
 * / 249.3 / 242.6 / 249.2 / 249.3 / 239.4 / 249.4, and four under vitest (the
 * way the gate runs it) 255.3 / 243.0 / 249.1 / 232.7. Range 232.7-255.3, a
 * spread of 22.6 MiB; the sealed node 22 measurement's own spread was 5 MiB
 * (247-252, V-25's row).
 *
 * The ORIGINAL headroom rule is "round the worst measured curve point UP to a
 * whole increment" — the 32 MiB increment `booted_process_resident_bound`
 * publishes, which turned its 368.7 into 384 and the sealed row's 250 into 256.
 * Applied to 255.3 it yields 256 again: 0.7 MiB of margin against a measurement
 * that moves by 22.6 MiB. No increment rescues that — 16, 32, 64, 128 and 256
 * MiB all round both 250 and 255.3 to exactly 256 — so the rule itself, not the
 * increment, is what did not survive the move to node 26.
 *
 * AMENDED, ruled by the coordinator on 2026-09-22 (Task 3; recorded in the
 * coordinator's ledger with its cost if wrong, and the owner may overturn it):
 * for this and every future entry the rule is "the worst of at least ten rounds,
 * plus one provisioning increment, rounded up to the increment". Here that is
 * ceil((255.3 + 32) / 32) * 32 = 288 MiB — 32.7 MiB of margin, 12.8 % over the
 * worst observation, comparable to the 1.17x the 384 booted bound carries over
 * its own worst measurement. A fence at 288 still catches any regression above
 * about 33 MiB, which is the class of leak this case exists for, while a fence
 * at 256 would have failed on noise, and a case that fails on noise is one
 * everybody learns to ignore. The sealed node 22 entry keeps its 256 and its
 * original rule, untouched, as history: each entry names the rule it was derived
 * under, so the amendment is visible in the row and not only in this comment.
 *
 * Absent, deliberately: linux. The GitHub ubuntu runner read 273 MiB against
 * this Mac's 256 and no one has measured it under node 26. A runtime without an
 * entry has no published bound, and the case that reads this map says so out
 * loud there. A number nobody measured is worse than an honest absence.
 */
const ISOLATED_LIMITER_RSS_ROUNDING_INCREMENT_MIB = "32";
const ISOLATED_LIMITER_RSS_NODE_26_DARWIN_ARM64 = Object.freeze({
  "measurement": "isolated_process_rss_at_100_percent_slot_occupancy",
  "runtime": "node_v26.8.2_darwin_arm64",
  "occupancy_percent": canonicalDecimal("100"),
  "measured_100_percent_rss_mib": canonicalDecimal("255.3"),
  "max_measured_curve_rss_mib": canonicalDecimal("255.3"),
  "isolated_measurement_ceiling_mib": canonicalDecimal("288"),
  "includes_isolated_harness_baseline": true,
  "includes_application_stack_baseline": false,
  "operator_provisioning_field": false,
  "operator_instruction": "Limiter capacity validation only; do not use this isolated-process figure to provision an API process.",
  // The WORST of the fourteen rounds, published whole — one real observation,
  // not a per-point maximum taken across rounds, which would be a curve nobody
  // measured. It is the run under vitest, the way the gate runs the case.
  "curve_rss_mib": Object.freeze({
    "0": canonicalDecimal("99.9"),
    "25": canonicalDecimal("243.2"),
    "50": canonicalDecimal("238"),
    "100": canonicalDecimal("255.3")
  })
});
const ISOLATED_LIMITER_RSS_RUNTIME_SOURCE_REF =
  " + V-25 ruled 2026-09-21 (V, chat): versioned rateLimitPolicy row carrying the"
  + " isolated limiter RSS measurement per runtime (platform + architecture + node"
  + " version), with the sealed node_v22.23.1_darwin_arm64 measurement republished"
  + " verbatim as history under its original ceiling rule and not edited."
  + " node_v26.8.2_darwin_arm64 measured 2026-09-22 over 14 rounds on a quiet host,"
  + " worst curve 255.3 MiB, spread 22.6 MiB; ceiling 288 MiB under the headroom"
  + " rule amended by the coordinator on 2026-09-22 (Task 3, owner may overturn):"
  + " the worst of at least ten rounds plus one 32 MiB increment, rounded up,"
  + " because the original rule left 0.7 MiB of margin and a fence that fails on"
  + " noise is one everybody ignores. linux has no entry until CI measures one;"
  + " every runtime without an entry skips loudly";

const AUTH_POLICY_DEPLOYMENT_PUBLICATION_ROWS = Object.freeze(
  AUTH_POLICY_PUBLICATION_ROWS.map((row) => {
    if (row.rowKey === "passwordPolicy") {
      return Object.freeze({
        rowKey: row.rowKey,
        value: Object.freeze({
          ...row.value,
          "max_length": canonicalDecimal(PASSWORD_POLICY_MAXIMUM_LENGTH)
        }),
        sourceRef: `${row.sourceRef}${PASSWORD_POLICY_MAXIMUM_LENGTH_SOURCE_REF}`
      });
    }
    if (row.rowKey === "rateLimitPolicy") {
      const value = row.value as unknown as Readonly<Record<string, CanonicalJsonAst>> & {
        readonly sketch_design: Readonly<Record<string, CanonicalJsonAst>>;
      };
      // Fail closed: history is republished from the sealed object, so if the
      // sealed object is not there the deployment set must not be built at all
      // rather than be built without its history.
      const sealedIsolatedMeasurement =
        value.sketch_design["isolated_limiter_resident_measurement"];
      if (sealedIsolatedMeasurement === undefined) {
        throw new TypedDomainError(
          "AUTH_POLICY_SEALED_MEASUREMENT_MISSING",
          "The sealed isolated limiter RSS measurement is absent from rateLimitPolicy"
        );
      }
      return Object.freeze({
        rowKey: row.rowKey,
        value: Object.freeze({
          ...value,
          "sketch_design": Object.freeze({
            ...value.sketch_design,
            "isolated_limiter_resident_measurement_versions": Object.freeze({
              "measurement_rounding_increment_mib":
                canonicalDecimal(ISOLATED_LIMITER_RSS_ROUNDING_INCREMENT_MIB),
              "by_runtime": Object.freeze({
                "node_v22.23.1_darwin_arm64": Object.freeze({
                  // History keeps the rule it was derived under. 250 -> 256.
                  "ceiling_rule": "WORST_MEASURED_CURVE_POINT_ROUNDED_UP_TO_INCREMENT",
                  // The sealed object ITSELF, not a transcription of its
                  // numbers: history cannot drift from what was sealed if it is
                  // the same reference. The sealed member above is left in place
                  // too, so every existing reader keeps resolving unchanged.
                  "measurement": sealedIsolatedMeasurement
                }),
                "node_v26.8.2_darwin_arm64": Object.freeze({
                  "ceiling_rule": "WORST_OF_AT_LEAST_TEN_ROUNDS_PLUS_ONE_INCREMENT_ROUNDED_UP",
                  "measurement_rounds": canonicalDecimal("14"),
                  "measurement": ISOLATED_LIMITER_RSS_NODE_26_DARWIN_ARM64
                })
              })
            })
          })
        }),
        sourceRef: `${row.sourceRef}${ISOLATED_LIMITER_RSS_RUNTIME_SOURCE_REF}`
      });
    }
    return row;
  })
);

export const AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS = Object.freeze(
  AUTH_POLICY_DEPLOYMENT_PUBLICATION_ROWS.map((row) => Object.freeze({
    rowKey: row.rowKey,
    valueAst: row.value,
    value: JSON.parse(canonicalRegisterJson(row.value)) as Readonly<Record<string, unknown>>,
    sourceRef: row.sourceRef
  }))
);

export interface AuthRouteLimit {
  readonly windowMs: number;
  readonly admissionPerSource: number;
}

export interface AuthPolicy {
  readonly password: {
    readonly minimumLength: 8;
    /**
     * V-14. `null` when the resolved register version carries no maximum (the
     * sealed row): the route's request-shape bound is then the only ceiling.
     * Counted in `String.prototype.length` units, exactly like the minimum.
     */
    readonly maximumLength: number | null;
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
    readonly registrationMailDispatchMinimumReservationMs: 5_700;
    readonly mailDispatchMinimumReservationMs: 5_700;
    /** The SHARED wait deadline. Resend and every non-registration route use it. */
    readonly mailDispatchQueueWaitTimeoutMs: 18_000;
    /**
     * Registration alone waits this long for a mail permit. Decision 3 derived
     * 28,000 ms from its three 5,100 ms-lease observations. Decision 4 retains
     * that conservative deadline after a fresh hash-first/5,700 ms availability
     * run; it does not reinterpret that burst as privacy evidence.
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
    /** decision_version 4 — the current decision. */
    readonly registrationAdmissionDecisionVersion: number;
    /**
     * The structural admission budget: at most this many registrations may be
     * admitted at once. It is a budget size, not a measured completion rate.
     */
    readonly structuralMaximumConcurrentRegistrations: number;
    /**
     * `null`, deliberately. No repeat supports a positive N* under decision
     * version 4, and the historical N*=2 is not a fallback. An absent value is
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
  const derivedRegistrationMinimumReservationMs = derivedPreTransportBudgetMs
    + channel.data.transport_timeout_ms + dispatch.handoff_scheduler_tolerance_ms;
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
  // decision_version 4. The fresh 5,700 ms/hash-first observation is availability
  // evidence only: the 28-second registration deadline is retained rather than
  // recalibrated downward. Historical decision 3 remains byte-exact and still
  // owns the 1.25x deadline derivation that originally selected 28 seconds.
  const admissionRow = dispatch.registration_admission;
  const admissionEvidence = admissionRow.evidence;
  const retainedRegistrationWaitDeadlineMs = 28_000;
  const admissionMargin = (waitTenthsMs: number): number => Math.round(
    (retainedRegistrationWaitDeadlineMs - waitTenthsMs / 10)
      * 10_000 / retainedRegistrationWaitDeadlineMs
  );
  const historicalAdmission = admissionRow.superseded_decision;
  const historicalEvidence = historicalAdmission.evidence;
  const historicalWorstReservationWaitMs =
    Math.max(...historicalEvidence.reservation_wait_maximum_tenths_ms) / 10;
  const historicalDerivedRegistrationWaitDeadlineMs =
    Math.ceil(1.25 * historicalWorstReservationWaitMs / 1_000) * 1_000;
  const historicalMargin = (waitTenthsMs: number): number => Math.round(
    (historicalDerivedRegistrationWaitDeadlineMs - waitTenthsMs / 10)
      * 10_000 / historicalDerivedRegistrationWaitDeadlineMs
  );
  if (admissionRow.supersedes_decision_version !== historicalAdmission.decision_version
    || historicalAdmission.supersedes_decision_version !== current.decision_version
    || current.superseded_by_decision_version !== historicalAdmission.decision_version
    // 103 is exactly the number v2 mis-published as a measured capacity, kept as
    // the structural budget, and it can never exceed what the shared FIFO holds.
    || admissionRow.structural_maximum_concurrent_registrations !== capacity
    || admissionRow.structural_maximum_concurrent_registrations
      > dispatch.maximum_concurrent + dispatch.queue_capacity
    || !/STRUCTURAL/.test(admissionRow.admission_semantics)
    || !/NOT_A_MEASURED_COMPLETION_RATE/.test(admissionRow.admission_semantics)
    || admissionRow.registration_mail_permit_wait_deadline_ms
      !== retainedRegistrationWaitDeadlineMs
    || admissionEvidence.deadline_derivation
      !== "retained 28000 ms exceeds fresh 5942.1 ms maximum by 22057.9 ms"
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
    || admissionRow.scope.hard_availability_requests !== 100
    // The diagnostic really did complete the whole budget, with nothing refused
    // and nothing unexpected, in every repeat.
    || admissionEvidence.successes_per_repeat.some((count) => count !== capacity)
    || admissionEvidence.commits_per_repeat.some((count) => count !== capacity)
    || admissionEvidence.sends_per_repeat.some((count) => count !== capacity)
    || admissionEvidence.busy_per_repeat.some((count) => count !== 0)
    || admissionEvidence.unexpected_per_repeat.some((count) => count !== 0)
    || admissionEvidence.margin_hundredths_percent_per_repeat.some((margin, index) =>
      margin !== admissionMargin(admissionEvidence.reservation_wait_maximum_tenths_ms[index]!))
    // Decision 3 is immutable evidence for the old 5,100 ms lease and the
    // original conservative deadline derivation. Decision 4 may supersede the
    // lease, but may neither rewrite nor silently reuse that evidence as an
    // opacity claim.
    || historicalAdmission.registration_minimum_reservation_ms !== 5_100
    || historicalDerivedRegistrationWaitDeadlineMs !== retainedRegistrationWaitDeadlineMs
    || historicalEvidence.deadline_derivation
      !== `ceil_to_whole_second(1.25 * ${historicalWorstReservationWaitMs} ms) = ${historicalDerivedRegistrationWaitDeadlineMs} ms`
    || historicalEvidence.successes_per_repeat.some((count) => count !== capacity)
    || historicalEvidence.commits_per_repeat.some((count) => count !== capacity)
    || historicalEvidence.sends_per_repeat.some((count) => count !== capacity)
    || historicalEvidence.busy_per_repeat.some((count) => count !== 0)
    || historicalEvidence.unexpected_per_repeat.some((count) => count !== 0)
    || historicalEvidence.margin_hundredths_percent_per_repeat.some((margin, index) =>
      margin !== historicalMargin(
        historicalEvidence.reservation_wait_maximum_tenths_ms[index]!
      ))
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
      maximumLength: password.data.max_length ?? null,
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
