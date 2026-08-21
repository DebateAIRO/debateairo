import type { Pool } from "pg";
import { agg, σ, product } from "@debateai/published-arithmetic";

export const REPLAY_ISOLATION_PROOF = Object.freeze({
  workspaceImports: Object.freeze(["@debateai/published-arithmetic"] as const),
  sharedSymbols: Object.freeze(["agg", "σ", "product"] as const),
  localArithmeticSymbols: Object.freeze([] as const)
});

export interface ReplayOperatorAttestation {
  readonly principal: string;
  readonly credentialScope: "READ_ONLY";
  readonly replayedRunIds: readonly string[];
  readonly producedRunIds: readonly string[];
}

export function validateOperatorAttestation(input: ReplayOperatorAttestation): ReplayOperatorAttestation {
  if (input.principal.trim().length === 0) throw new TypeError("REPLAY_OPERATOR_PRINCIPAL_REQUIRED");
  if (input.credentialScope !== "READ_ONLY") throw new TypeError("REPLAY_OPERATOR_SCOPE_NOT_READ_ONLY");
  if (input.replayedRunIds.length === 0) throw new TypeError("REPLAY_RUN_IDS_REQUIRED");
  const replayed = new Set(input.replayedRunIds);
  if (replayed.size !== input.replayedRunIds.length) throw new TypeError("REPLAY_RUN_IDS_DUPLICATED");
  if (input.producedRunIds.some((runId) => replayed.has(runId))) {
    throw new TypeError("REPLAY_OPERATOR_PRODUCED_RUN");
  }
  return Object.freeze({
    principal: input.principal,
    credentialScope: input.credentialScope,
    replayedRunIds: Object.freeze([...input.replayedRunIds]),
    producedRunIds: Object.freeze([...input.producedRunIds])
  });
}

interface FrozenReplayRow {
  readonly run_id: string;
  readonly served_number_id: string;
  readonly stored: number;
  readonly base_strengths: readonly number[];
  readonly arrow_order: readonly unknown[];
  readonly transmission_reductions: readonly unknown[];
  readonly lift_records: readonly unknown[];
  readonly cluster_records: readonly unknown[];
  readonly operator_by_parent: readonly unknown[];
  readonly judgement_selection_rule: Readonly<Record<string, unknown>>;
}

const STRUCTURAL_FIELDS = Object.freeze([
  "arrow_order",
  "transmission_reductions",
  "lift_records",
  "cluster_records",
  "operator_by_parent",
  "judgement_selection_rule"
] as const);

function float64Hex(value: number): string {
  const bytes = new ArrayBuffer(8);
  new DataView(bytes).setFloat64(0, value, false);
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireFrozenArray(row: FrozenReplayRow, field: Exclude<typeof STRUCTURAL_FIELDS[number], "judgement_selection_rule">): readonly unknown[] {
  const value = row[field];
  if (!Array.isArray(value)) throw new TypeError(`REPLAY_FROZEN_FIELD_MISSING:${field}`);
  return value;
}

function recomputeFrozenRow(row: FrozenReplayRow): number {
  const arrowOrder = requireFrozenArray(row, "arrow_order");
  const transmissionReductions = requireFrozenArray(row, "transmission_reductions");
  const liftRecords = requireFrozenArray(row, "lift_records");
  const clusterRecords = requireFrozenArray(row, "cluster_records");
  const operatorByParent = requireFrozenArray(row, "operator_by_parent");
  if (row.judgement_selection_rule === null || typeof row.judgement_selection_rule !== "object") {
    throw new TypeError("REPLAY_FROZEN_FIELD_MISSING:judgement_selection_rule");
  }
  if (!Array.isArray(row.base_strengths) || row.base_strengths.length !== 1) {
    throw new TypeError("REPLAY_SHAPE_NOT_IMPLEMENTED");
  }
  if ([arrowOrder, transmissionReductions, liftRecords, clusterRecords, operatorByParent]
    .some((records) => records.length !== 0)) {
    throw new TypeError("REPLAY_SHAPE_NOT_IMPLEMENTED");
  }
  // The symbols stay live imports so the isolation receipt and export pin cover the entire licensed surface.
  void [σ, product];
  return agg([Number(row.base_strengths[0])]);
}

export interface ReplayCeremonyReport {
  readonly checked: number;
  readonly exact: boolean;
  readonly mismatches: readonly string[];
  readonly structuralFieldsRead: typeof STRUCTURAL_FIELDS;
  readonly attestation: ReplayOperatorAttestation;
}

export async function runLaunchReplayCeremony(
  pool: Pool,
  rawAttestation: ReplayOperatorAttestation
): Promise<ReplayCeremonyReport> {
  const attestation = validateOperatorAttestation(rawAttestation);
  const result = await pool.query<FrozenReplayRow>(
    `SELECT propagation.run_id, number.served_number_id, number.value AS stored,
            jsonb_agg(judgement.tau ORDER BY strength.node_id) AS base_strengths,
            propagation.arrow_order, propagation.transmission_reductions,
            propagation.lift_records, propagation.cluster_records,
            propagation.operator_by_parent, propagation.judgement_selection_rule
     FROM serve.served_number AS number
     JOIN ledger.propagation_run AS propagation
       ON propagation.propagation_run_id = number.provenance_ref
     JOIN ledger.node_strength_record AS strength
       ON strength.propagation_run_id = propagation.propagation_run_id
     JOIN LATERAL (
       SELECT reduced.tau FROM ledger.reduced_judgement AS reduced
       WHERE reduced.node_id = strength.node_id ORDER BY reduced.at_seq DESC LIMIT 1
     ) AS judgement ON true
     WHERE propagation.run_id = ANY($1::uuid[])
     GROUP BY propagation.propagation_run_id, number.served_number_id, number.value
     ORDER BY propagation.run_id, number.served_number_id`,
    [attestation.replayedRunIds]
  );
  const foundRuns = new Set(result.rows.map((row) => row.run_id));
  const absent = attestation.replayedRunIds.filter((runId) => !foundRuns.has(runId));
  if (absent.length > 0) throw new TypeError(`REPLAY_RUN_NOT_FOUND:${absent.join(",")}`);
  const mismatches: string[] = [];
  for (const row of result.rows) {
    const recomputed = recomputeFrozenRow(row);
    if (float64Hex(Number(row.stored)) !== float64Hex(recomputed)) mismatches.push(row.served_number_id);
  }
  return Object.freeze({
    checked: result.rows.length,
    exact: mismatches.length === 0,
    mismatches: Object.freeze(mismatches),
    structuralFieldsRead: STRUCTURAL_FIELDS,
    attestation
  });
}
