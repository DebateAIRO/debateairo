import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { allocateSequence, withWriteTransaction } from "@debateai/db";
import {
  LEDGER_ACTION_SCOPE,
  TypedDomainError,
  type AccessDepth,
  type LedgerActionKind,
  type LedgerOutcome,
  type ObjectionStatus,
  type RiskTier,
  type StanceAtAction,
  type SymmetryDiffStatus
} from "@debateai/kernel";

export interface CrossEntryLeverageSnapshot {
  readonly records: readonly { readonly removedNodeId: string; readonly leverage: number }[];
  readonly triggerNodeIds: readonly string[];
  readonly snapshotAtSequence: number;
  readonly engineVersion: string;
}

export interface VerificationTriggerBasis {
  readonly nodeId: string;
  readonly leverageSnapshot: CrossEntryLeverageSnapshot["records"];
  readonly snapshotAtSequence: number;
  readonly triggered: boolean;
  readonly engineVersion: string;
}

export function planBlindVerification(input: {
  readonly riskTier: RiskTier;
  readonly nodeId: string;
  readonly snapshot: CrossEntryLeverageSnapshot;
}): {
  readonly verify: boolean;
  readonly reason: "RISK_TIER_ALWAYS" | "CROSS_ENTRY_LEVERAGE";
  readonly basis: VerificationTriggerBasis | null;
} {
  if (input.riskTier !== "casual") {
    return Object.freeze({ verify: true, reason: "RISK_TIER_ALWAYS", basis: null });
  }
  const triggered = input.snapshot.triggerNodeIds.length > 0;
  return Object.freeze({
    verify: triggered,
    reason: "CROSS_ENTRY_LEVERAGE",
    basis: Object.freeze({
      nodeId: input.nodeId,
      leverageSnapshot: Object.freeze(input.snapshot.records.map((row) => Object.freeze({ ...row }))),
      snapshotAtSequence: input.snapshot.snapshotAtSequence,
      triggered,
      engineVersion: input.snapshot.engineVersion
    })
  });
}

export interface SymmetryAction {
  readonly actionKind: LedgerActionKind;
  readonly subjectItemId: string;
  readonly stanceAtAction: StanceAtAction;
  readonly outcome: LedgerOutcome;
  readonly accessDepth?: AccessDepth;
}

export interface SymmetryRemediationTarget {
  readonly side: "SUPPORTS" | "ATTACKS";
  readonly itemId: string;
  readonly actionKind: LedgerActionKind | null;
  readonly requiredAccessDepth: AccessDepth | null;
  readonly missingCount: number;
}

export interface SymmetryDiff {
  readonly status: SymmetryDiffStatus;
  readonly missingKinds: readonly { readonly side: "SUPPORTS" | "ATTACKS"; readonly actionKind: LedgerActionKind }[];
  readonly remediationTargets: readonly SymmetryRemediationTarget[];
  readonly blockedNotLazy: readonly {
    readonly side: "SUPPORTS" | "ATTACKS";
    readonly itemId: string;
    readonly actionKind: LedgerActionKind;
    readonly outcome: "BLOCKED" | "FAILED" | "TIMED_OUT";
  }[];
  readonly census: readonly {
    readonly side: "SUPPORTS" | "ATTACKS";
    readonly actionKind: LedgerActionKind;
    readonly count: number;
    readonly accessDepths: readonly { readonly accessDepth: AccessDepth; readonly count: number }[];
    readonly outcomes: readonly { readonly outcome: LedgerOutcome; readonly count: number }[];
  }[];
  readonly fairnessClaimWithheld: boolean;
  readonly bandCapRequired: boolean;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function counted<T extends string>(values: readonly T[]): readonly { readonly value: T; readonly count: number }[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.freeze([...counts.entries()]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([value, count]) => Object.freeze({ value, count })));
}

function targetKey(target: SymmetryRemediationTarget): string {
  return JSON.stringify([target.side, target.itemId, target.actionKind, target.requiredAccessDepth]);
}

export function computeSymmetryDiff(input: {
  readonly items: readonly { readonly itemId: string; readonly stance: "SUPPORTS" | "ATTACKS" }[];
  readonly actions: readonly SymmetryAction[];
}): SymmetryDiff {
  const itemById = new Map(input.items.map((item) => [item.itemId, item] as const));
  const scoped = input.actions.filter((action) => LEDGER_ACTION_SCOPE[action.actionKind] === "ITEM_SCOPED");
  const remediation = new Map<string, SymmetryRemediationTarget>();
  // The fall-through member is PRE_ITEM for population purposes, but its presence
  // proves the action vocabulary did not classify an executed check. It therefore
  // stays outside the census while fail-closing the verdict (FX-LED-03).
  let uninstrumented = input.actions.some((action) => action.actionKind === "UNCLASSIFIED_ACTION");

  for (const item of input.items) {
    const itemActions = scoped.filter((action) => action.subjectItemId === item.itemId && action.stanceAtAction === item.stance);
    if (itemActions.length === 0) {
      uninstrumented = true;
      const target = { side: item.stance, itemId: item.itemId, actionKind: null, requiredAccessDepth: null, missingCount: 0 } as const;
      remediation.set(targetKey(target), target);
    }
  }
  for (const action of scoped) {
    if (action.stanceAtAction !== "UNASSIGNED") continue;
    uninstrumented = true;
    const declared = itemById.get(action.subjectItemId);
    const side = declared?.stance ?? "ATTACKS";
    const target = { side, itemId: action.subjectItemId, actionKind: action.actionKind, requiredAccessDepth: null, missingCount: 0 } as const;
    remediation.set(targetKey(target), target);
  }

  const sides = ["SUPPORTS", "ATTACKS"] as const;
  const census: SymmetryDiff["census"][number][] = [];
  for (const side of sides) {
    const actions = scoped.filter((action) => action.stanceAtAction === side);
    const kinds = [...new Set(actions.map((action) => action.actionKind))].sort(compareCodeUnits);
    for (const actionKind of kinds) {
      const rows = actions.filter((action) => action.actionKind === actionKind);
      census.push(Object.freeze({
        side,
        actionKind,
        count: rows.length,
        accessDepths: counted(rows.flatMap((row) => row.accessDepth === undefined ? [] : [row.accessDepth]))
          .map((row) => Object.freeze({ accessDepth: row.value, count: row.count })),
        outcomes: counted(rows.map((row) => row.outcome))
          .map((row) => Object.freeze({ outcome: row.value, count: row.count }))
      }));
    }
  }

  const missingKinds: { readonly side: "SUPPORTS" | "ATTACKS"; readonly actionKind: LedgerActionKind }[] = [];
  const allKinds = [...new Set(census.map((row) => row.actionKind))].sort(compareCodeUnits);
  for (const actionKind of allKinds) {
    const support = census.find((row) => row.side === "SUPPORTS" && row.actionKind === actionKind);
    const attack = census.find((row) => row.side === "ATTACKS" && row.actionKind === actionKind);
    for (const [side, present, other] of [
      ["SUPPORTS", support, attack], ["ATTACKS", attack, support]
    ] as const) {
      if (present !== undefined || other === undefined) continue;
      missingKinds.push(Object.freeze({ side, actionKind }));
      for (const item of input.items.filter((candidate) => candidate.stance === side)) {
        const target = { side, itemId: item.itemId, actionKind, requiredAccessDepth: null, missingCount: other.count } as const;
        remediation.set(targetKey(target), target);
      }
    }
    if (support === undefined || attack === undefined) continue;
    if (support.count !== attack.count) {
      const side = support.count < attack.count ? "SUPPORTS" : "ATTACKS";
      const missingCount = Math.abs(support.count - attack.count);
      for (const item of input.items.filter((candidate) => candidate.stance === side)) {
        const target = { side, itemId: item.itemId, actionKind, requiredAccessDepth: null, missingCount } as const;
        remediation.set(targetKey(target), target);
      }
    }
    const supportFull = support.accessDepths.some((row) => row.accessDepth === "OPENED_FULL");
    const attackFull = attack.accessDepths.some((row) => row.accessDepth === "OPENED_FULL");
    if (supportFull !== attackFull) {
      const side = supportFull ? "ATTACKS" : "SUPPORTS";
      for (const item of input.items.filter((candidate) => candidate.stance === side)) {
        const target = { side, itemId: item.itemId, actionKind, requiredAccessDepth: "OPENED_FULL", missingCount: 0 } as const;
        remediation.set(targetKey(target), target);
      }
    }
  }

  const blockedNotLazy = scoped.flatMap((action) => {
    if (action.stanceAtAction !== "SUPPORTS" && action.stanceAtAction !== "ATTACKS") return [];
    if (action.outcome !== "BLOCKED" && action.outcome !== "FAILED" && action.outcome !== "TIMED_OUT") return [];
    return [Object.freeze({
      side: action.stanceAtAction,
      itemId: action.subjectItemId,
      actionKind: action.actionKind,
      outcome: action.outcome
    })];
  }).sort((left, right) => compareCodeUnits(JSON.stringify(left), JSON.stringify(right)));
  const remediationTargets = [...remediation.values()]
    .sort((left, right) => compareCodeUnits(targetKey(left), targetKey(right)));
  const normalized = (side: "SUPPORTS" | "ATTACKS") => census
    .filter((row) => row.side === side)
    .map(({ side: _side, ...row }) => row);
  const asymmetric = JSON.stringify(normalized("SUPPORTS")) !== JSON.stringify(normalized("ATTACKS"));
  const status: SymmetryDiffStatus = uninstrumented ? "UNINSTRUMENTED" : asymmetric ? "ASYMMETRIC" : "SYMMETRIC";
  return Object.freeze({
    status,
    missingKinds: Object.freeze(missingKinds),
    remediationTargets: Object.freeze(remediationTargets),
    blockedNotLazy: Object.freeze(blockedNotLazy),
    census: Object.freeze(census),
    fairnessClaimWithheld: status === "UNINSTRUMENTED",
    bandCapRequired: status === "UNINSTRUMENTED"
  });
}

export interface MakerPolicy {
  readonly requiredDistinctMakers: number;
  readonly standingMisconfigurationLimit: number;
  readonly registerRef: string;
}

export interface MakerAvailability {
  readonly deploymentMakerCapability: boolean;
  readonly runMakerReachability: boolean;
  readonly classification: "CAPABLE" | "TRANSIENT_OUTAGE" | "STANDING_MISCONFIGURATION";
  readonly configuredMakers: readonly string[];
  readonly reachedMakers: readonly string[];
  readonly registerRef: string;
}

export interface DeploymentMakerCapability {
  readonly deploymentMakerCapability: boolean;
  readonly configuredMakers: readonly string[];
  readonly configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[];
  readonly registerRef: string;
}

export const CONFIGURED_PROVIDER_SET_ROW_KEY = "configuredProviderSet" as const;

export async function readDeploymentMakerCapability(
  pool: Pool,
  registerVersion: number
): Promise<DeploymentMakerCapability> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(`
    SELECT value_json, source_ref FROM register.register_row
    WHERE register_version=$1 AND row_key=$2
  `, [registerVersion, CONFIGURED_PROVIDER_SET_ROW_KEY]);
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError(
      "CONFIGURED_PROVIDER_SET_UNRESOLVED",
      `Launch prerequisite ${CONFIGURED_PROVIDER_SET_ROW_KEY} is absent from register version ${registerVersion}`
    );
  }
  const value = row.value_json;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypedDomainError("CONFIGURED_PROVIDER_SET_INVALID", "Configured provider set must be a typed object");
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  const providers = candidate.providers;
  const requiredDistinctMakers = candidate.requiredDistinctMakers;
  if (candidate.kind !== "CONFIGURED_PROVIDER_SET" || !Array.isArray(providers)
    || !Number.isInteger(requiredDistinctMakers) || (requiredDistinctMakers as number) < 1) {
    throw new TypedDomainError("CONFIGURED_PROVIDER_SET_INVALID", "Configured provider set violates its declared member type");
  }
  const typedProviders: { readonly providerRef: string; readonly adapterKind: string; readonly maker: string }[] = [];
  for (const provider of providers) {
    if (typeof provider !== "object" || provider === null || Array.isArray(provider)) {
      throw new TypedDomainError("CONFIGURED_PROVIDER_SET_INVALID", "Configured provider entry must be an object");
    }
    const entry = provider as Readonly<Record<string, unknown>>;
    if (typeof entry.providerRef !== "string" || entry.providerRef.trim() === ""
      || typeof entry.adapterKind !== "string" || entry.adapterKind.trim() === ""
      || typeof entry.maker !== "string" || entry.maker.trim() === "") {
      throw new TypedDomainError("CONFIGURED_PROVIDER_SET_INVALID", "Configured provider entry is incomplete");
    }
    typedProviders.push({ providerRef: entry.providerRef, adapterKind: entry.adapterKind, maker: entry.maker });
  }
  const configuredMakers = [...new Set(typedProviders.map((provider) => provider.maker))].sort(compareCodeUnits);
  return Object.freeze({
    deploymentMakerCapability: configuredMakers.length >= (requiredDistinctMakers as number),
    configuredMakers: Object.freeze(configuredMakers),
    configuredProviders: Object.freeze(typedProviders.map(({ providerRef, maker }) =>
      Object.freeze({ providerRef, maker })
    )),
    registerRef: `${CONFIGURED_PROVIDER_SET_ROW_KEY}@${registerVersion}:${row.source_ref}`
  });
}

export function evaluateMakerAvailability(input: {
  readonly configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[];
  readonly reachedProviderRefs: readonly string[];
  readonly standingMisconfigurationCount: number;
  readonly policy: MakerPolicy;
}): MakerAvailability {
  if (!Number.isInteger(input.policy.requiredDistinctMakers) || input.policy.requiredDistinctMakers < 1) {
    throw new TypedDomainError("MAKER_POLICY_INVALID", "The declared maker requirement must be a positive integer");
  }
  if (!Number.isInteger(input.policy.standingMisconfigurationLimit) || input.policy.standingMisconfigurationLimit < 1) {
    throw new TypedDomainError("MAKER_POLICY_INVALID", "The standing counter limit must be a positive register value");
  }
  const byRef = new Map(input.configuredProviders.map((row) => [row.providerRef, row.maker] as const));
  const configuredMakers = [...new Set(input.configuredProviders.map((row) => row.maker))].sort(compareCodeUnits);
  const reachedMakers = [...new Set(input.reachedProviderRefs.flatMap((ref) => {
    const maker = byRef.get(ref);
    return maker === undefined ? [] : [maker];
  }))].sort(compareCodeUnits);
  const counterTripped = input.standingMisconfigurationCount >= input.policy.standingMisconfigurationLimit;
  const deploymentMakerCapability = configuredMakers.length >= input.policy.requiredDistinctMakers && !counterTripped;
  const runMakerReachability = reachedMakers.length >= input.policy.requiredDistinctMakers;
  return Object.freeze({
    deploymentMakerCapability,
    runMakerReachability,
    classification: !deploymentMakerCapability
      ? "STANDING_MISCONFIGURATION"
      : runMakerReachability ? "CAPABLE" : "TRANSIENT_OUTAGE",
    configuredMakers: Object.freeze(configuredMakers),
    reachedMakers: Object.freeze(reachedMakers),
    registerRef: input.policy.registerRef
  });
}

export function assertMakerAdmission(
  riskTier: RiskTier,
  availability: Pick<MakerAvailability, "deploymentMakerCapability" | "configuredMakers" | "registerRef">
): void {
  // DR-182 narrows DR-137: every nonempty discovered panel serves. High-stakes
  // mono answers are capped by applyCriticUnavailableCap, never refused.
  if (new Set(availability.configuredMakers).size < 1) {
    throw new TypedDomainError(
      "MAKER_INVENTORY_UNSATISFIED",
      `No healthy maker was discovered for ${riskTier} (${availability.registerRef})`
    );
  }
}

export function applyCriticUnavailableCap(availability: MakerAvailability): {
  readonly serves: true;
  readonly conditionMarks: readonly ("SINGLE-LINEAGE" | "CRITIQUE-UNAVAILABLE")[];
  readonly confidenceBandCapRequired: boolean;
  readonly liftCondition: "RUN_DIFFERENT_MAKER_CRITIQUE" | null;
} {
  if (availability.runMakerReachability) {
    return Object.freeze({ serves: true, conditionMarks: Object.freeze([]), confidenceBandCapRequired: false, liftCondition: null });
  }
  return Object.freeze({
    serves: true,
    conditionMarks: Object.freeze(["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"] as const),
    confidenceBandCapRequired: true,
    liftCondition: "RUN_DIFFERENT_MAKER_CRITIQUE"
  });
}

export interface BlindedCritiquePacket {
  readonly runId: string;
  readonly sourceArtifactRef: string;
  readonly sourceContent: string;
  readonly criticMaker: string;
  readonly blindingApplied: "IDENTITY_STRIPPED";
  readonly researchContextHash: string;
  readonly critiqueContextHash: string;
  readonly packetFingerprint: string;
}

export function buildBlindedCritiquePacket(input: {
  readonly runId: string;
  readonly sourceArtifactRef: string;
  readonly sourceContent: string;
  readonly producerIdentity: string;
  readonly producerMaker: string;
  readonly criticMaker: string;
  readonly researchContextHash: string;
  readonly critiqueContextHash: string;
}): BlindedCritiquePacket {
  if (input.researchContextHash === input.critiqueContextHash) {
    throw new TypedDomainError("CRITIQUE_CONTEXT_NOT_ISOLATED", "Research and criticism may not share a context");
  }
  const packet = {
    runId: input.runId,
    sourceArtifactRef: input.sourceArtifactRef,
    sourceContent: input.sourceContent,
    criticMaker: input.criticMaker,
    blindingApplied: "IDENTITY_STRIPPED" as const,
    researchContextHash: input.researchContextHash,
    critiqueContextHash: input.critiqueContextHash
  };
  return Object.freeze({
    ...packet,
    packetFingerprint: createHash("sha256").update(JSON.stringify(packet)).digest("hex")
  });
}

export function computeIndependenceReceipt(input: {
  readonly producerMaker: string;
  readonly criticMaker: string | null;
  readonly researchContextHash: string;
  readonly critiqueContextHash: string | null;
  readonly packetFingerprint: string | null;
  readonly packetAtSequence: number | null;
  readonly criticLedgerEntryRef: string | null;
  readonly criticAtSequence: number | null;
}): {
  readonly status: "INDEPENDENT" | "NOT_INDEPENDENT" | "UNKNOWN";
  readonly absenceReason: "NO_CRITIC" | "SAME_MAKER" | "SHARED_CONTEXT" | "PACKET_MISSING" | "CRITIC_LOG_MISSING" | "CRITIC_SAW_UNBLINDED_ORDER" | null;
  readonly differentMaker: boolean;
  readonly contextIsolated: boolean;
  readonly blindedBeforeCritic: boolean;
  readonly packetAtSequence: number | null;
  readonly criticLedgerEntryRef: string | null;
  readonly criticAtSequence: number | null;
} {
  const evidence = {
    packetAtSequence: input.packetAtSequence,
    criticLedgerEntryRef: input.criticLedgerEntryRef,
    criticAtSequence: input.criticAtSequence
  } as const;
  if (input.criticMaker === null) {
    return Object.freeze({ status: "UNKNOWN", absenceReason: "NO_CRITIC", differentMaker: false, contextIsolated: false, blindedBeforeCritic: false, ...evidence });
  }
  const differentMaker = input.criticMaker !== input.producerMaker;
  const contextIsolated = input.critiqueContextHash !== null && input.critiqueContextHash !== input.researchContextHash;
  const logComplete = input.packetAtSequence !== null && input.criticAtSequence !== null && input.criticLedgerEntryRef !== null;
  const blindedBeforeCritic = input.packetFingerprint !== null && logComplete
    && input.packetAtSequence! < input.criticAtSequence!;
  if (!differentMaker) return Object.freeze({ status: "NOT_INDEPENDENT", absenceReason: "SAME_MAKER", differentMaker, contextIsolated, blindedBeforeCritic, ...evidence });
  if (!contextIsolated) return Object.freeze({ status: "NOT_INDEPENDENT", absenceReason: "SHARED_CONTEXT", differentMaker, contextIsolated, blindedBeforeCritic, ...evidence });
  if (input.packetFingerprint === null || input.packetAtSequence === null) return Object.freeze({ status: "UNKNOWN", absenceReason: "PACKET_MISSING", differentMaker, contextIsolated, blindedBeforeCritic, ...evidence });
  if (input.criticLedgerEntryRef === null || input.criticAtSequence === null) return Object.freeze({ status: "UNKNOWN", absenceReason: "CRITIC_LOG_MISSING", differentMaker, contextIsolated, blindedBeforeCritic, ...evidence });
  if (!blindedBeforeCritic) return Object.freeze({ status: "NOT_INDEPENDENT", absenceReason: "CRITIC_SAW_UNBLINDED_ORDER", differentMaker, contextIsolated, blindedBeforeCritic, ...evidence });
  return Object.freeze({ status: "INDEPENDENT", absenceReason: null, differentMaker, contextIsolated, blindedBeforeCritic, ...evidence });
}

export interface ObjectionInput {
  readonly objectionRef: string;
  readonly status: ObjectionStatus;
  readonly closedByRef?: string;
}

export function deriveObjectionRecords(input: {
  readonly existing: readonly ObjectionInput[];
  readonly criticObjections: readonly { readonly objectionRef: string }[];
}): {
  readonly records: readonly { readonly objectionRef: string; readonly status: ObjectionStatus; readonly closedByRef: string | null }[];
  readonly residualObjectionRefs: readonly string[];
} {
  const byRef = new Map<string, { objectionRef: string; status: ObjectionStatus; closedByRef: string | null }>();
  for (const row of input.existing) byRef.set(row.objectionRef, {
    objectionRef: row.objectionRef,
    status: row.status,
    closedByRef: row.closedByRef ?? null
  });
  for (const row of input.criticObjections) {
    if (!byRef.has(row.objectionRef)) byRef.set(row.objectionRef, { objectionRef: row.objectionRef, status: "OPEN", closedByRef: null });
  }
  const records = [...byRef.values()].sort((left, right) => compareCodeUnits(left.objectionRef, right.objectionRef));
  return Object.freeze({
    records: Object.freeze(records.map((row) => Object.freeze(row))),
    residualObjectionRefs: Object.freeze(records.filter((row) => row.status === "OPEN").map((row) => row.objectionRef))
  });
}

export class CritiqueRepository {
  constructor(private readonly pool: Pool) {}

  async recordVerificationTriggerBasis(input: { readonly runId: string; readonly basis: VerificationTriggerBasis }): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const atSequence = await allocateSequence(client);
      const result = await client.query<{ verification_trigger_basis_id: string }>(`
        INSERT INTO core.verification_trigger_basis (
          run_id, node_id, leverage_snapshot, snapshot_at_seq, triggered, engine_version, recorded_at_seq
        ) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7)
        RETURNING verification_trigger_basis_id
      `, [input.runId, input.basis.nodeId, JSON.stringify(input.basis.leverageSnapshot), input.basis.snapshotAtSequence,
        input.basis.triggered, input.basis.engineVersion, atSequence]);
      return result.rows[0]!.verification_trigger_basis_id;
    });
  }

  async recordCritiquePacket(input: BlindedCritiquePacket): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const atSequence = await allocateSequence(client);
      const result = await client.query<{ critique_packet_id: string }>(`
        INSERT INTO core.critique_packet (
          run_id, source_artifact_ref, packet_fingerprint, critic_maker, blinding_applied,
          research_context_hash, critique_context_hash, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING critique_packet_id
      `, [input.runId, input.sourceArtifactRef, input.packetFingerprint, input.criticMaker, input.blindingApplied,
        input.researchContextHash, input.critiqueContextHash, atSequence]);
      return result.rows[0]!.critique_packet_id;
    });
  }

  async recordIndependenceReceipt(input: {
    readonly runId: string;
    readonly critiquePacketRef: string | null;
    readonly producerMaker: string;
    readonly criticMaker: string | null;
    readonly receipt: ReturnType<typeof computeIndependenceReceipt>;
  }): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const atSequence = await allocateSequence(client);
      const result = await client.query<{ independence_receipt_id: string }>(`
        INSERT INTO core.independence_receipt (
          run_id, critique_packet_ref, producer_maker, critic_maker, status, absence_reason,
          different_maker, context_isolated, blinded_before_critic, packet_at_seq,
          critic_ledger_entry_ref, critic_at_seq, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING independence_receipt_id
      `, [input.runId, input.critiquePacketRef, input.producerMaker, input.criticMaker, input.receipt.status,
        input.receipt.absenceReason, input.receipt.differentMaker, input.receipt.contextIsolated,
        input.receipt.blindedBeforeCritic, input.receipt.packetAtSequence, input.receipt.criticLedgerEntryRef,
        input.receipt.criticAtSequence, atSequence]);
      return result.rows[0]!.independence_receipt_id;
    });
  }

  async recordSymmetryDiff(input: { readonly runId: string; readonly diff: SymmetryDiff }): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const atSequence = await allocateSequence(client);
      const result = await client.query<{ symmetry_diff_id: string }>(`
        INSERT INTO core.symmetry_diff (
          run_id, status, missing_kinds, remediation_targets, blocked_not_lazy, census,
          fairness_claim_withheld, band_cap_required, at_seq
        ) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9)
        RETURNING symmetry_diff_id
      `, [input.runId, input.diff.status, JSON.stringify(input.diff.missingKinds),
        JSON.stringify(input.diff.remediationTargets), JSON.stringify(input.diff.blockedNotLazy),
        JSON.stringify(input.diff.census), input.diff.fairnessClaimWithheld, input.diff.bandCapRequired, atSequence]);
      return result.rows[0]!.symmetry_diff_id;
    });
  }

  async readSymmetryActions(runId: string): Promise<readonly SymmetryAction[]> {
    const result = await this.pool.query<{
      action_kind: LedgerActionKind;
      subject_item_id: string;
      stance_at_action: StanceAtAction;
      outcome: LedgerOutcome;
    }>(`
      SELECT action_kind, subject_item_id, stance_at_action, outcome
      FROM ledger.ledger_entry WHERE run_id=$1 ORDER BY sequence
    `, [runId]);
    return Object.freeze(result.rows.map((row) => Object.freeze({
      actionKind: row.action_kind,
      subjectItemId: row.subject_item_id,
      stanceAtAction: row.stance_at_action,
      outcome: row.outcome
    })));
  }

  async recordObjections(input: { readonly runId: string; readonly records: readonly { readonly objectionRef: string; readonly status: ObjectionStatus; readonly closedByRef: string | null }[] }): Promise<void> {
    await withWriteTransaction(this.pool, async (client) => {
      for (const row of input.records) {
        const atSequence = await allocateSequence(client);
        await client.query(`
          INSERT INTO core.objection_record (run_id, objection_ref, status, closed_by_ref, at_seq)
          VALUES ($1,$2,$3,$4,$5)
        `, [input.runId, row.objectionRef, row.status, row.closedByRef, atSequence]);
      }
    });
  }

  async readResidualObjections(runId: string): Promise<readonly string[]> {
    const result = await this.pool.query<{ objection_ref: string; status: ObjectionStatus }>(`
      SELECT DISTINCT ON (objection_ref) objection_ref, status
      FROM core.objection_record WHERE run_id=$1
      ORDER BY objection_ref, at_seq DESC
    `, [runId]);
    return Object.freeze(result.rows.filter((row) => row.status === "OPEN").map((row) => row.objection_ref));
  }
}
