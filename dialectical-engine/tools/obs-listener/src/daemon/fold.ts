import { fileURLToPath } from "node:url";
import {
  acknowledgeDelivery,
  advanceDeliveryCursor,
  claimIncidentForTrace,
  deliveryIsAcknowledged,
  loadAggregateMembers,
  loadDeliveryOccurrence,
  persistFolded,
  readDeliveryCursor,
  type FixagentDeliveryGeneration,
  type FixagentDeliveryTransaction,
} from "@debateai/obs-capture/chain/fixagent-delivery";
import type { TracerHook } from "./tracer-hook.js";
import { decodeOccurrence, type OccurrenceRecord, type OccurrenceSeverity, type OccurrenceSource } from "./intake.js";
import { appendPoisonReceipt, appendSkipReceipt } from "./poison.js";
import { loadBundle } from "../../policy/loader.js";
import { evaluateTierGate, type TierGateInput } from "./tier-gate.js";

const POLICY_BUNDLE = loadBundle(fileURLToPath(new URL("../../policy/bundle.json", import.meta.url)));

export type WorkUnitKey =
  | readonly ["DECLARED_PAIR", string, string]
  | readonly ["SOURCE_EVENT", OccurrenceSource, string];

export interface IncidentAggregate {
  readonly fingerprint: string;
  readonly fingerprintVersion: number;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly distinctWorkUnitCount: bigint;
  readonly maxSeverity: OccurrenceSeverity;
  readonly sourceSet: readonly OccurrenceSource[];
}

export type IncidentState =
  | "NEW" | "RESEARCHING" | "TICKETED" | "PROPOSED" | "APPROVED" | "FIXING"
  | "FIXED_UNVALIDATED" | "FIXED_VALIDATED" | "REGRESSED" | "ESCALATED" | "PARKED";

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SEVERITY_ORDER: readonly OccurrenceSeverity[] = ["INFO", "DEGRADED", "SEVERE", "FATAL"];
const SOURCE_ORDER: readonly OccurrenceSource[] = ["first_party", "hatchet", "ui_client"];

const LEGAL_EDGES = Object.freeze({
  NEW: Object.freeze(["RESEARCHING"]),
  RESEARCHING: Object.freeze(["TICKETED", "PROPOSED", "ESCALATED"]),
  TICKETED: Object.freeze(["RESEARCHING"]),
  PROPOSED: Object.freeze(["APPROVED", "TICKETED", "PARKED"]),
  APPROVED: Object.freeze(["FIXING"]),
  FIXING: Object.freeze(["FIXED_UNVALIDATED", "PARKED", "APPROVED"]),
  FIXED_UNVALIDATED: Object.freeze(["FIXED_VALIDATED", "REGRESSED"]),
  FIXED_VALIDATED: Object.freeze(["REGRESSED"]),
  REGRESSED: Object.freeze(["ESCALATED"]),
  ESCALATED: Object.freeze([]),
  PARKED: Object.freeze([])
} satisfies Record<IncidentState, readonly IncidentState[]>);

export function workUnitKey(row: OccurrenceRecord): WorkUnitKey {
  if (CANONICAL_UUID.test(row.runRef) && CANONICAL_UUID.test(row.workItemRef)) {
    return Object.freeze(["DECLARED_PAIR", row.runRef, row.workItemRef]);
  }
  return Object.freeze(["SOURCE_EVENT", row.source, row.sourceEventRef]);
}

export function fixEligibility(sourceSet: readonly OccurrenceSource[]):
"FIX_ELIGIBLE" | "FIX_INELIGIBLE" {
  return sourceSet.length === 1 && sourceSet[0] === "ui_client"
    ? "FIX_INELIGIBLE" : "FIX_ELIGIBLE";
}

export function foldIncident(rows: readonly OccurrenceRecord[]): IncidentAggregate {
  const first = rows[0];
  if (first === undefined) throw new TypeError("INCIDENT_ROWS_REQUIRED");
  let firstSeen = first.occurredAt.getTime();
  let lastSeen = firstSeen;
  let severity = first.severity;
  const sources = new Set<OccurrenceSource>();
  const workUnits = new Set<string>();
  for (const row of rows) {
    if (row.fingerprint !== first.fingerprint || row.fingerprintVersion !== first.fingerprintVersion) {
      throw new TypeError("INCIDENT_IDENTITY_MISMATCH");
    }
    firstSeen = Math.min(firstSeen, row.occurredAt.getTime());
    lastSeen = Math.max(lastSeen, row.occurredAt.getTime());
    if (SEVERITY_ORDER.indexOf(row.severity) > SEVERITY_ORDER.indexOf(severity)) severity = row.severity;
    sources.add(row.source);
    workUnits.add(JSON.stringify(workUnitKey(row)));
  }
  return Object.freeze({
    fingerprint: first.fingerprint,
    fingerprintVersion: first.fingerprintVersion,
    firstSeenAt: new Date(firstSeen),
    lastSeenAt: new Date(lastSeen),
    distinctWorkUnitCount: BigInt(workUnits.size),
    maxSeverity: severity,
    sourceSet: Object.freeze(SOURCE_ORDER.filter((source) => sources.has(source)))
  });
}

export function isLegalTransition(from: IncidentState, to: IncidentState): boolean {
  return (LEGAL_EDGES[from] as readonly IncidentState[]).includes(to);
}

export interface DeliveryOutcome {
  readonly occurrenceId: string;
  readonly occSeq: bigint;
  readonly result: "FOLDED" | "SKIPPED" | "DEAD_LETTERED" | "ALREADY_ACKED";
  readonly cursor: bigint;
}

export type TransactionTracerHookFactory = (
  transaction: FixagentDeliveryTransaction,
) => TracerHook;

async function aggregateFor(
  transaction: FixagentDeliveryTransaction,
  current: OccurrenceRecord,
): Promise<IncidentAggregate> {
  const rows = await loadAggregateMembers(transaction,{
    fingerprint:current.fingerprint,
    fingerprintVersion:current.fingerprintVersion,
    occurrenceId:current.occurrenceId,
  });
  const accepted = rows.flatMap((row) => {
    const result = decodeOccurrence(row);
    return result.kind === "ACCEPT" ? [result.occurrence] : [];
  });
  return foldIncident(accepted);
}

function tierDecision(
  current: OccurrenceRecord,
  aggregate: IncidentAggregate,
  zoneContext: unknown,
): ReturnType<typeof evaluateTierGate> {
  const input: TierGateInput = {
    schema: "fixagent-tier-input/v1",
    incident: {
      fingerprint: aggregate.fingerprint,
      fingerprintVersion: aggregate.fingerprintVersion,
      distinctWorkUnitCount: aggregate.distinctWorkUnitCount.toString(),
      maxSeverity: aggregate.maxSeverity,
      sourceSet: aggregate.sourceSet,
      taxonomyClass: current.taxonomyClass,
      zoneContext: typeof zoneContext === "boolean" ? zoneContext : true,
    },
    root: { verdict: "UNCONFIRMED" },
    changeShape: null,
  };
  return evaluateTierGate(input, POLICY_BUNDLE);
}

export async function deliverOccurrence(
  generation: FixagentDeliveryGeneration,
  occurrenceId: string,
  tracerHookFactory?: TransactionTracerHookFactory,
): Promise<DeliveryOutcome> {
  return generation.withDelivery(occurrenceId,async (transaction) => {
    const row = await loadDeliveryOccurrence(transaction,occurrenceId);
    const sequenceText = typeof row.occ_seq === "string" || typeof row.occ_seq === "number"
      || typeof row.occ_seq === "bigint" ? String(row.occ_seq) : "0";
    const occSeq = BigInt(sequenceText);
    if (await deliveryIsAcknowledged(transaction,occurrenceId)) {
      const cursor = await readDeliveryCursor(transaction);
      return Object.freeze({ occurrenceId, occSeq, result: "ALREADY_ACKED", cursor });
    }

    const intake = decodeOccurrence(row);
    const source = row.source;
    if (source !== "first_party" && source !== "hatchet" && source !== "ui_client") {
      throw new TypeError("FIX09_DELIVERY_SOURCE");
    }
    let result: DeliveryOutcome["result"];
    if (intake.kind === "ACCEPT") {
      const aggregate = await aggregateFor(transaction,intake.occurrence);
      const decision=tierDecision(intake.occurrence,aggregate,row.zone_context);
      await persistFolded(transaction,{
        occurrenceId,fingerprint:aggregate.fingerprint,
        fingerprintVersion:aggregate.fingerprintVersion,firstSeenAt:aggregate.firstSeenAt,
        lastSeenAt:aggregate.lastSeenAt,distinctWorkUnitCount:aggregate.distinctWorkUnitCount.toString(),
        maxSeverity:aggregate.maxSeverity,sourceSet:aggregate.sourceSet,
        policyRef:decision.policyRef,inputHash:decision.inputHash,decision:decision.decision,
      });
      if (tracerHookFactory !== undefined) {
        const incident = await claimIncidentForTrace(transaction, {
          occurrenceId,
          fingerprint: aggregate.fingerprint,
          fingerprintVersion: aggregate.fingerprintVersion,
        });
        if (incident !== undefined) {
          await tracerHookFactory(transaction).onIncidentNew(incident);
        }
      }
      result = "FOLDED";
    } else if (intake.kind === "SKIP") {
      await appendSkipReceipt(transaction, { occurrenceId, occSeq,source }, intake.reason);
      result = "SKIPPED";
    } else {
      await appendPoisonReceipt(transaction, { occurrenceId, occSeq,source }, intake.reason);
      result = "DEAD_LETTERED";
    }
    await acknowledgeDelivery(transaction,occurrenceId);
    const cursor = await advanceDeliveryCursor(transaction);
    return Object.freeze({ occurrenceId, occSeq, result, cursor });
  });
}
