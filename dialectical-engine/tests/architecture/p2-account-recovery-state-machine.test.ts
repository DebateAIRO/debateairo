import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const artifact = (name: string): Promise<string> => readFile(new URL(
  `../../docs/missions/2026-08-17-accounts-privacy-security/${name}`,
  import.meta.url
), "utf8");

interface RecoveryContract {
  readonly format: string;
  readonly status: string;
  readonly sourceRefs: readonly string[];
  readonly scope: {
    readonly ratifiedTiers: readonly string[];
    readonly unratifiedTiers: readonly string[];
    readonly runtimeImplemented: boolean;
    readonly publicResponse: string;
    readonly contestedClaims: string;
  };
  readonly proofMethods: readonly {
    readonly id: string;
    readonly family: string;
    readonly recoveryInput: boolean;
    readonly serverOwned: boolean;
  }[];
  readonly tiers: readonly {
    readonly id: string;
    readonly createsRecoveryAttempt: boolean;
    readonly serverSignalClass: string;
    readonly requiredCredentialProofs: readonly string[];
    readonly recoveryProof: {
      readonly allowedMethods: readonly string[];
      readonly minimumInputs: number;
      readonly minimumDistinctFamilies: number;
    };
    readonly delayPolicy: string;
    readonly completionProfile: string;
    readonly requireNewFactor: boolean;
  }[];
  readonly states: readonly { readonly id: string; readonly terminal: boolean }[];
  readonly transitions: readonly {
    readonly id: string;
    readonly from: readonly string[];
    readonly to: string;
    readonly tiers: readonly string[];
    readonly guards: readonly string[];
    readonly effects: readonly string[];
  }[];
  readonly policyKeys: readonly {
    readonly id: string;
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly maximumExclusive?: boolean;
  }[];
  readonly notifications: {
    readonly recipients: readonly string[];
    readonly events: readonly string[];
    readonly startOrdering: string;
    readonly delaySchedule: readonly string[];
    readonly payloadForbidden: readonly string[];
  };
  readonly cancellation: {
    readonly authorizers: readonly string[];
    readonly activeStates: readonly string[];
    readonly terminalState: string;
    readonly retryLockPolicy: string;
    readonly preservesHistory: boolean;
  };
  readonly completionProfiles: readonly {
    readonly id: string;
    readonly allowed: readonly string[];
    readonly denied: readonly string[];
    readonly restorationConditions: readonly string[];
  }[];
  readonly forbiddenBypasses: readonly string[];
  readonly mutations: readonly { readonly id: string; readonly killedBy: readonly string[] }[];
  readonly nonGoals: readonly string[];
}

interface RecoverySchema {
  readonly $schema: string;
  readonly $id: string;
  readonly type: string;
  readonly additionalProperties: boolean;
  readonly required: readonly string[];
  readonly properties: Readonly<Record<string, unknown>>;
}

const byId = <T extends { readonly id: string }>(entries: readonly T[], id: string): T => {
  const entry = entries.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new TypeError(`P2_RECOVERY_ENTRY_MISSING:${id}`);
  return entry;
};

describe("P2-01 account-recovery state-machine contract", () => {
  it("ratifies only T0-T3 and pins proof, delay, cancellation, and completion semantics", async () => {
    const [contractRaw, schemaRaw] = await Promise.all([
      artifact("P2-01-account-recovery-state-machine.json"),
      artifact("P2-01-account-recovery-state-machine.schema.json")
    ]);
    const contract = JSON.parse(contractRaw) as RecoveryContract;
    const schema = JSON.parse(schemaRaw) as RecoverySchema;

    expect(contract.format).toBe("debateai.account-recovery-state-machine.v1");
    expect(contract.status).toBe("RATIFIED_DESIGN_RUNTIME_NOT_IMPLEMENTED");
    expect(contract.sourceRefs).toEqual([
      "wave-2-target-architecture.md#103-recovery--tiered-with-time-as-the-adjudicator",
      "../2026-08-17-mfa-recovery-requirements/RESEARCH-REPORT.md#recovery--the-tier-ladder",
      "IMPLEMENTATION-STATUS.md#phase-2--recovery-and-roles"
    ]);
    expect(contract.scope).toEqual({
      ratifiedTiers: ["T0", "T1", "T2", "T3"],
      unratifiedTiers: ["T4_HUMAN_REVIEW"],
      runtimeImplemented: false,
      publicResponse: "ENUMERATION_RESISTANT_GENERIC",
      contestedClaims: "FREEZE_NOTIFY_DO_NOT_ADJUDICATE"
    });

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe("https://debateai.local/schemas/account-recovery-state-machine.v1.json");
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual([
      "format", "status", "sourceRefs", "scope", "proofMethods", "tiers", "states",
      "transitions", "policyKeys", "notifications", "cancellation", "completionProfiles",
      "forbiddenBypasses", "mutations", "nonGoals"
    ]);
    expect(Object.keys(schema.properties).sort()).toEqual([...schema.required].sort());

    expect(contract.proofMethods).toEqual([
      { id: "PASSWORD", family: "PASSWORD_AUTHENTICATOR", recoveryInput: false, serverOwned: false },
      { id: "BOUND_AUTHENTICATOR", family: "BOUND_AUTHENTICATOR", recoveryInput: false, serverOwned: true },
      { id: "SAVED_RECOVERY_CODE", family: "RECOVERY_CODE", recoveryInput: true, serverOwned: false },
      { id: "ISSUED_VERIFIED_EMAIL_CODE", family: "VERIFIED_EMAIL_ADDRESS", recoveryInput: true, serverOwned: true },
      { id: "ISSUED_BOUND_MESSAGING_CODE", family: "BOUND_MESSAGING_ADDRESS", recoveryInput: true, serverOwned: true },
      { id: "RECOGNISED_DEVICE_POSSESSION", family: "DEVICE_POSSESSION", recoveryInput: true, serverOwned: true }
    ]);

    expect(contract.tiers.map((tier) => tier.id)).toEqual(["T0", "T1", "T2", "T3"]);
    expect(byId(contract.tiers, "T0")).toEqual({
      id: "T0",
      createsRecoveryAttempt: false,
      serverSignalClass: "SURVIVING_AUTHENTICATOR",
      requiredCredentialProofs: ["PASSWORD", "BOUND_AUTHENTICATOR"],
      recoveryProof: { allowedMethods: [], minimumInputs: 0, minimumDistinctFamilies: 0 },
      delayPolicy: "NONE",
      completionProfile: "FULL",
      requireNewFactor: false
    });
    expect(byId(contract.tiers, "T1")).toMatchObject({
      createsRecoveryAttempt: true,
      serverSignalClass: "STRONG_SERVER_SIGNALS",
      requiredCredentialProofs: ["PASSWORD"],
      recoveryProof: { minimumInputs: 1, minimumDistinctFamilies: 1 },
      delayPolicy: "T1_MAX_ELAPSED_MS",
      completionProfile: "FULL",
      requireNewFactor: true
    });
    expect(byId(contract.tiers, "T1").recoveryProof.allowedMethods).toEqual([
      "SAVED_RECOVERY_CODE", "ISSUED_VERIFIED_EMAIL_CODE", "ISSUED_BOUND_MESSAGING_CODE"
    ]);
    expect(byId(contract.tiers, "T2")).toMatchObject({
      createsRecoveryAttempt: true,
      serverSignalClass: "MIXED_SERVER_SIGNALS",
      recoveryProof: { minimumInputs: 2, minimumDistinctFamilies: 2 },
      delayPolicy: "T2_MAX_ELAPSED_MS",
      completionProfile: "FULL",
      requireNewFactor: true
    });
    expect(byId(contract.tiers, "T2").recoveryProof.allowedMethods).toEqual([
      "SAVED_RECOVERY_CODE", "ISSUED_VERIFIED_EMAIL_CODE", "ISSUED_BOUND_MESSAGING_CODE",
      "RECOGNISED_DEVICE_POSSESSION"
    ]);
    expect(byId(contract.tiers, "T3")).toEqual({
      id: "T3",
      createsRecoveryAttempt: true,
      serverSignalClass: "WEAK_SERVER_SIGNALS_ONE_REACHABLE_ADDRESS",
      requiredCredentialProofs: [],
      recoveryProof: {
        allowedMethods: ["ISSUED_VERIFIED_EMAIL_CODE", "ISSUED_BOUND_MESSAGING_CODE"],
        minimumInputs: 1,
        minimumDistinctFamilies: 1
      },
      delayPolicy: "T3_FREEZE_MS",
      completionProfile: "RESTRICTED",
      requireNewFactor: true
    });

    expect(contract.states).toEqual([
      { id: "REQUESTED", terminal: false },
      { id: "TIER_PINNED", terminal: false },
      { id: "PROOF_PENDING", terminal: false },
      { id: "FROZEN", terminal: false },
      { id: "FACTOR_BINDING_REQUIRED", terminal: false },
      { id: "COMPLETED_FULL", terminal: true },
      { id: "COMPLETED_RESTRICTED", terminal: true },
      { id: "CANCELLED", terminal: true },
      { id: "REFUSED", terminal: true },
      { id: "EXPIRED", terminal: true }
    ]);
    const terminalStates = new Set(contract.states.filter((state) => state.terminal).map((state) => state.id));
    const allStates = new Set(contract.states.map((state) => state.id));
    const allTiers = new Set(contract.tiers.map((tier) => tier.id));
    const allProofMethods = new Map(contract.proofMethods.map((method) => [method.id, method]));
    const allPolicyKeys = new Set(contract.policyKeys.map((policy) => policy.id));
    expect(contract.transitions.flatMap((transition) => transition.from)
      .filter((state) => terminalStates.has(state))).toEqual([]);
    expect(contract.transitions.every((transition) => transition.from.every((state) => allStates.has(state))
      && allStates.has(transition.to)
      && transition.tiers.every((tier) => allTiers.has(tier)))).toBe(true);
    expect(contract.tiers.every((tier) => tier.requiredCredentialProofs.every((method) => allProofMethods.has(method))
      && tier.recoveryProof.allowedMethods.every((method) => allProofMethods.get(method)?.recoveryInput === true)
      && (tier.delayPolicy === "NONE" || allPolicyKeys.has(tier.delayPolicy)))).toBe(true);
    expect(contract.tiers.every((tier) => new Set(tier.recoveryProof.allowedMethods
      .map((method) => allProofMethods.get(method)?.family)).size >= tier.recoveryProof.minimumDistinctFamilies)).toBe(true);

    expect(byId(contract.transitions, "PIN_SERVER_TIER")).toMatchObject({
      from: ["REQUESTED"], to: "TIER_PINNED", tiers: ["T1", "T2", "T3"],
      guards: ["SERVER_DERIVED_TIER", "START_NOTICE_DURABLY_ENQUEUED"]
    });
    expect(byId(contract.transitions, "TIGHTEN_TIER_ONLY")).toMatchObject({
      from: ["TIER_PINNED", "PROOF_PENDING"], to: "TIER_PINNED", tiers: ["T1", "T2", "T3"],
      guards: ["NEW_SERVER_SIGNAL", "NEW_TIER_NOT_LOWER_RISK", "ORIGINAL_DELAY_ANCHOR_PRESERVED"]
    });
    expect(byId(contract.transitions, "ACCEPT_T3_PROOF")).toMatchObject({
      from: ["PROOF_PENDING"], to: "FROZEN", tiers: ["T3"]
    });
    expect(byId(contract.transitions, "T3_DELAY_DUE")).toMatchObject({
      from: ["FROZEN"], to: "FACTOR_BINDING_REQUIRED", tiers: ["T3"],
      guards: ["DATABASE_CLOCK_AT_OR_AFTER_ORIGINAL_DUE_AT", "REQUIRED_DELAY_NOTICES_DURABLY_ENQUEUED"]
    });
    expect(byId(contract.transitions, "COMPLETE_T3_RESTRICTED")).toMatchObject({
      from: ["FACTOR_BINDING_REQUIRED"], to: "COMPLETED_RESTRICTED", tiers: ["T3"],
      guards: ["NEW_FACTOR_BOUND", "ALL_SESSIONS_REVOKED"]
    });
    expect(byId(contract.transitions, "EXPIRE_ACTIVE_ATTEMPT")).toMatchObject({
      guards: ["DATABASE_CLOCK_AT_OR_AFTER_ATTEMPT_EXPIRY", "EXPIRY_NOT_BEFORE_PINNED_DUE_AT"]
    });

    expect(contract.policyKeys).toEqual([
      { id: "T1_MAX_ELAPSED_MS", unit: "MILLISECONDS", minimum: 1, maximum: 300_000, maximumExclusive: true },
      { id: "T2_MAX_ELAPSED_MS", unit: "MILLISECONDS", minimum: 1, maximum: 1_800_000, maximumExclusive: true },
      { id: "T3_FREEZE_MS", unit: "MILLISECONDS", minimum: 604_800_000, maximum: 1_209_600_000 },
      { id: "POST_CANCEL_RECOVERY_LOCK_MS", unit: "MILLISECONDS", minimum: 86_400_000, maximum: 86_400_000 },
      { id: "LAST_FACTOR_REMOVAL_HOLD_MS", unit: "MILLISECONDS", minimum: 86_400_000, maximum: 259_200_000 },
      { id: "T3_RESTRICTION_MS", unit: "MILLISECONDS", minimum: 2_592_000_000, maximum: 2_592_000_000 }
    ]);

    expect(contract.notifications).toEqual({
      recipients: ["EVERY_HISTORICALLY_BOUND_SUPPORTED_CHANNEL", "IN_PRODUCT_SECURITY_FEED"],
      events: ["STARTED", "DELAY_STARTED", "DELAY_MIDPOINT", "DELAY_24H_REMAINING", "CANCELLED", "REFUSED", "COMPLETED"],
      startOrdering: "DURABLY_ENQUEUE_BEFORE_PROOF_OUTCOME_OR_TIER_DISCLOSURE",
      delaySchedule: ["DAY_ZERO", "MIDPOINT", "TWENTY_FOUR_HOURS_BEFORE_DUE"],
      payloadForbidden: ["PASSWORD", "AUTHENTICATOR_SECRET", "RECOVERY_CODE", "ISSUED_CODE", "INTERNAL_ACCOUNT_ID", "PROOF_ANSWER"]
    });
    expect(contract.cancellation).toEqual({
      authorizers: ["SURVIVING_FACTOR_SIGN_IN", "ORIGINAL_AUTHENTICATED_SESSION", "ORIGINAL_NOTIFICATION_CAPABILITY"],
      activeStates: ["REQUESTED", "TIER_PINNED", "PROOF_PENDING", "FROZEN", "FACTOR_BINDING_REQUIRED"],
      terminalState: "CANCELLED",
      retryLockPolicy: "POST_CANCEL_RECOVERY_LOCK_MS",
      preservesHistory: true
    });

    expect(byId(contract.completionProfiles, "RESTRICTED")).toEqual({
      id: "RESTRICTED",
      allowed: ["READ", "CREATE_PRIVATE_DEBATE"],
      denied: ["PUBLISH", "DELETE", "EXPORT", "CHANGE_CONTACT", "CHANGE_FACTOR", "PRIVILEGED_ROUTE"],
      restorationConditions: ["T3_RESTRICTION_MS_ELAPSED", "STRONGER_PROOF_COMPLETED"]
    });
  });

  it("makes every bypass and mutation target explicit", async () => {
    const contract = JSON.parse(await artifact(
      "P2-01-account-recovery-state-machine.json"
    )) as RecoveryContract;

    expect(contract.forbiddenBypasses).toEqual([
      "CALLER_SUPPLIED_TIER",
      "TIER_DOWNGRADE_WITHIN_ATTEMPT",
      "RETRY_RESETS_DELAY",
      "HUMAN_SHORTENS_OR_SKIPS_DELAY",
      "SAME_METHOD_COUNTS_TWICE",
      "EMAIL_ONLY_FAST_RECOVERY_WITHOUT_STRONG_SERVER_SIGNALS",
      "DEVICE_SIGNAL_ALONE_UNLOCKS",
      "SECRET_QUESTIONS_OR_KBA",
      "SUPPORT_BOT_MUTATES_AUTHENTICATION_STATE",
      "COMPLETION_WITHOUT_NEW_FACTOR",
      "T3_COMPLETES_FULL",
      "TERMINAL_STATE_REOPENS",
      "NOTICE_TO_SUBSET_OF_HISTORICAL_CHANNELS",
      "LAST_SURVIVING_FACTOR_REMOVED_BEFORE_HOLD",
      "AUTOMATED_T4_GRANT_OR_FINAL_REFUSAL",
      "PUBLIC_RESPONSE_REVEALS_ACCOUNT_OR_TIER"
    ]);
    expect(contract.nonGoals).toEqual([
      "IMPLEMENT_RUNTIME_ENDPOINTS",
      "ADD_DATABASE_TABLES_OR_REGISTER_ROWS",
      "IMPLEMENT_RISK_SIGNAL_CLASSIFIER",
      "RATIFY_T4_HUMAN_REVIEW",
      "IMPLEMENT_RECOVERY_CONTACTS_OR_IDENTITY_PROOFING",
      "CHANGE_PHASE_1_RECOVERY_CODE_LOGIN"
    ]);

    const expectedMutations = [
      "MUT-CALLER-TIER", "MUT-DOWNGRADE", "MUT-DELAY-RESET", "MUT-SKIP-DELAY",
      "MUT-DUPLICATE-FAMILY", "MUT-EMAIL-FAST", "MUT-DEVICE-ONLY", "MUT-KBA",
      "MUT-BOT-AUTH", "MUT-SKIP-FACTOR", "MUT-T3-FULL", "MUT-TERMINAL-REOPEN",
      "MUT-NOTICE-SUBSET", "MUT-LAST-FACTOR-REMOVE", "MUT-AUTO-T4", "MUT-ENUMERATION"
    ];
    expect(contract.mutations.map((mutation) => mutation.id)).toEqual(expectedMutations);
    expect(contract.mutations.every((mutation) => mutation.killedBy.length > 0)).toBe(true);
    expect(new Set(contract.mutations.flatMap((mutation) => mutation.killedBy))).toEqual(new Set([
      "TIER_AUTHORITY", "MONOTONIC_TIER", "DELAY_ANCHOR", "DELAY_MINIMUM",
      "PROOF_INDEPENDENCE", "T1_ELIGIBILITY", "PROOF_SUFFICIENCY", "KBA_FORBIDDEN",
      "SUPPORT_AUTHORITY", "FACTOR_BINDING", "RESTRICTED_COMPLETION", "TERMINAL_CLOSURE",
      "NOTIFICATION_FANOUT", "LAST_FACTOR_HOLD", "T4_UNRATIFIED", "GENERIC_PUBLIC_RESPONSE"
    ]));
  });
});
