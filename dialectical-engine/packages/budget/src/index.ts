import { z } from "zod";
import { createHash } from "node:crypto";
import { ExpansionDepthSchema } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { SERVE_LEG } from "@debateai/register";
import type { Pool } from "pg";
import { allocateSequence, withWriteTransaction } from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";

export const RATIFIED_BATTERY_ROW_IDS = [
  "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10",
  "Q11", "Q12", "Q13", "Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20",
  "Q21", "Q22", "Q23", "Q24", "Q25", "Q26", "Q27", "Q28", "Q29", "Q30",
  "Q31", "Q32", "Q33", "Q34", "Q35", "Q36", "Q37", "Q38", "Q39", "Q40",
  "Q41", "Q42", "Q43", "Q44", "Q45", "Q46", "Q47", "Q48", "Q49", "Q50",
  "Q51", "Q52", "Q53", "Q54", "Q55", "Q56", "Q57", "Q58", "Q59", "Q60",
  "Q61", "Q62", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"
] as const;

export type RatifiedBatteryRowId = typeof RATIFIED_BATTERY_ROW_IDS[number];
export type BudgetClass = "CORRECTNESS" | "ENRICHMENT";
export type BudgetSkipPolicy = "SKIPPABLE_BY_BUDGET" | "NEVER_SKIPPABLE" | "PROTECTED_CORE_REFUSES_SKIP";

const enrichmentRows = new Set<RatifiedBatteryRowId>(["Q27", "Q49"]);

export const BATTERY_BUDGET_CONTRACTS = Object.freeze(
  RATIFIED_BATTERY_ROW_IDS.map((batteryRowId) => Object.freeze({
    batteryRowId,
    budgetClass: enrichmentRows.has(batteryRowId) ? "ENRICHMENT" as const : "CORRECTNESS" as const,
    skipPolicy: enrichmentRows.has(batteryRowId)
      ? "SKIPPABLE_BY_BUDGET" as const
      : batteryRowId === "R9"
        ? "PROTECTED_CORE_REFUSES_SKIP" as const
        : "NEVER_SKIPPABLE" as const
  }))
);

/**
 * T17 (DR-184-v4): the run head's basis carries the four call-site legs and the
 * serve chain it was minted against, so an audit of a stored receipt can see
 * WHICH topology the run was admitted under. The schema is strict on purpose —
 * a DR-184-v2 basis, which counted no panel leg, is REFUSED loudly here rather
 * than enforced as an undercount against a live panel.
 */
const costEnvelopeBasisSchema = z.object({
  kind: z.literal("COMPUTED_STRUCTURAL_CEILING"),
  max_model_attempts: z.number().int().positive(),
  panel_size: z.number().int().positive(),
  depth: ExpansionDepthSchema,
  per_site_attempts: z.object({
    judge: z.number().int().positive(),
    organ: z.number().int().positive(),
    panel_member: z.number().int().positive(),
    cooldown_site: z.number().int().positive()
  }).strict(),
  call_sites: z.object({
    author: z.number().int().positive(),
    panel: z.number().int().min(0),
    reviewer: z.number().int().min(0),
    serve: z.number().int().positive()
  }).strict(),
  /**
   * F-T17T9-3: the leg has ONE arm. The composition chain is retired, so its
   * three fields are gone from the receipt rather than carried unbilled, and
   * `.strict()` makes a receipt that re-introduces them fail loudly. `selected`
   * survives as the discriminator: it is `SERVE_LEG.chain`, READ from the
   * constructor's package, so a pre-T9 basis naming COMPOSITION is refused.
   */
  serve_leg: z.object({
    synthesis_loop_sites: z.number().int().positive(),
    selected: z.literal(SERVE_LEG.chain)
  }).strict(),
  hold_cap: z.number().int().positive(),
  final_retry_attempts: z.number().int().positive(),
  formula_version: z.string().trim().min(1),
  bounds_source_ref: z.string().trim().min(1)
}).strict().superRefine((basis, ctx) => {
  /**
   * S09B: the serve leg is disclosed TWICE — once as the billed site count
   * (`call_sites.serve`) and once as the arm it was read from (`serve_leg`) —
   * and nothing made them agree, so a basis could bill a count its own
   * disclosed leg did not support.
   *
   * The check is KEPT and its RULE is no longer restated here. Before
   * F-T17T9-3 this block re-typed the constructor's two decisions
   * (`max(composition, synthesis)` and the `>=` tie policy) as independent
   * guards; they were faithful, and they made the rule unchangeable one file
   * at a time — correcting the constructor produced bases this parser refused
   * at the run head. It now READS the rule from `SERVE_LEG`, so the receipt is
   * still checked against the constructor's rule and the two cannot drift.
   *
   * The tie policy and the larger-arm guard are GONE rather than relaxed:
   * with one arm there is nothing to select between, and the retired arm can no
   * longer appear on a receipt at all (the schema above is strict).
   */
  const billed = SERVE_LEG.billed(basis.serve_leg);
  if (basis.call_sites.serve !== billed) {
    ctx.addIssue({
      code: "custom",
      path: ["call_sites", "serve"],
      message: `serve call sites ${basis.call_sites.serve} disagree with the `
        + `${basis.serve_leg.selected} arm ${billed}`
    });
  }
});

export interface CostEnvelopeBasis {
  readonly maxModelAttempts: number;
  readonly panelSize: number;
  readonly depth: number;
  /** The serve leg the receipt discloses, so a reader need not re-parse it. */
  readonly serveLeg: {
    readonly synthesisLoopSites: number;
    readonly selected: typeof SERVE_LEG.chain;
  };
  readonly wire: Readonly<Record<string, unknown>>;
}

export function parseCostEnvelopeBasis(value: unknown): CostEnvelopeBasis {
  const parsed = costEnvelopeBasisSchema.safeParse(value);
  if (!parsed.success) {
    /**
     * T17B/B2 — the refusal names WHICH check refused.
     *
     * Every basis defect used to produce one identical sentence, so no caller
     * and no test could tell the cross-field guards apart. That is the shape
     * D56 rules out: a guard whose firing cannot be observed cannot be shown to
     * fire for the reason it exists, and two guards that are indistinguishable
     * at the surface are indistinguishable to a mutant too — one of them can be
     * deleted with every test still green.
     *
     * The CODE is unchanged, and the original sentence is kept as the prefix,
     * so the existing consumers and the assertion that matches that sentence
     * are unaffected. Only the numbers and enum names already present in the
     * rejected receipt are appended.
     */
    throw new TypedDomainError(
      "RUN_COST_ENVELOPE_UNRESOLVED",
      "The run head has no valid register-supplied cost-envelope basis: "
        + parsed.error.issues.map((issue) => issue.message).join("; ")
    );
  }
  return Object.freeze({
    maxModelAttempts: parsed.data.max_model_attempts,
    panelSize: parsed.data.panel_size,
    depth: parsed.data.depth,
    serveLeg: Object.freeze({
      synthesisLoopSites: parsed.data.serve_leg.synthesis_loop_sites,
      selected: parsed.data.serve_leg.selected
    }),
    wire: Object.freeze(parsed.data)
  });
}

export type RowBudgetOutcome =
  | { readonly kind: "NOT_SKIPPED" }
  | { readonly kind: "SKIPPED"; readonly outcome: "SKIPPED_BY_BUDGET"; readonly conditionMark: "SKIPPED-BY-BUDGET" }
  | { readonly kind: "REFUSED"; readonly outcome: "REFUSED"; readonly reason: "PROTECTED_CORE_REFUSES_SKIP" | "CORRECTNESS_ROW_REFUSES_SKIP" };

export function decideRowBudgetOutcome(
  batteryRowId: RatifiedBatteryRowId,
  envelopeExhausted: boolean
): RowBudgetOutcome {
  if (!envelopeExhausted) return Object.freeze({ kind: "NOT_SKIPPED" });
  const contract = BATTERY_BUDGET_CONTRACTS.find((row) => row.batteryRowId === batteryRowId)!;
  if (contract.skipPolicy === "SKIPPABLE_BY_BUDGET") {
    return Object.freeze({
      kind: "SKIPPED",
      outcome: "SKIPPED_BY_BUDGET",
      conditionMark: "SKIPPED-BY-BUDGET"
    });
  }
  return Object.freeze({
    kind: "REFUSED",
    outcome: "REFUSED",
    reason: contract.skipPolicy === "PROTECTED_CORE_REFUSES_SKIP"
      ? "PROTECTED_CORE_REFUSES_SKIP"
      : "CORRECTNESS_ROW_REFUSES_SKIP"
  });
}

export interface PendingBudgetRow {
  readonly batteryRowId: RatifiedBatteryRowId;
  readonly affectedNodeIds: readonly string[];
}

export type BudgetPressureDecision =
  | {
      readonly kind: "WITHIN_ENVELOPE";
      readonly state: "WITHIN";
      readonly consumedModelAttempts: number;
    }
  | {
      readonly kind: "HARD_STOP";
      readonly state: "EXHAUSTED";
      readonly consumedModelAttempts: number;
      readonly enrichmentSkips: readonly {
        readonly batteryRowId: RatifiedBatteryRowId;
        readonly outcome: "SKIPPED_BY_BUDGET";
        readonly conditionMark: "SKIPPED-BY-BUDGET";
        readonly affectedNodeIds: readonly string[];
      }[];
      readonly protectedCoreRefusals: readonly {
        readonly batteryRowId: RatifiedBatteryRowId;
        readonly outcome: "REFUSED";
        readonly reason: "PROTECTED_CORE_REFUSES_SKIP";
        readonly affectedNodeIds: readonly string[];
      }[];
      readonly terminal: {
        readonly conditionMark: "ENVELOPE_EXHAUSTED";
        readonly servedNodeIds: readonly string[];
      };
    };

export function decideBudgetPressure(input: {
  readonly basis: CostEnvelopeBasis;
  readonly consumedModelAttempts: number;
  /**
   * T17B/B1 — how many FURTHER attempts the caller is asking about, default 0.
   *
   * THE TWO EQUALITY CONTEXTS. This function was being asked two different
   * questions through one branch whose only input was the post-consumption
   * count, and at `consumed == max` those questions have OPPOSITE answers:
   *
   *   pending 0 — "has this run spent MORE than it was allowed?"  no  -> WITHIN
   *   pending 1 — "may this run spend ANOTHER attempt?"           no  -> HARD_STOP
   *
   * J28 ruled the first one, and it stays exactly as it was: a run that
   * completes having spent its whole envelope is WITHIN and keeps its answer.
   * The second is what `assertModelAttemptAllowed` has always decided when it
   * refuses at `consumed >= max`; before this parameter existed the runner's
   * catch re-derived that refusal from the count alone, got J28's WITHIN back,
   * and rethrew — so a refused attempt reached neither the components-only
   * envelope terminal nor an ENVELOPE_EXHAUSTED record.
   *
   * The caller now says WHICH question it is asking instead of the branch
   * guessing from a number that cannot distinguish them.
   */
  readonly pendingModelAttempts?: number;
  readonly pendingRows: readonly PendingBudgetRow[];
  readonly verifiedNodeIds: readonly string[];
}): BudgetPressureDecision {
  if (!Number.isInteger(input.consumedModelAttempts) || input.consumedModelAttempts < 0) {
    throw new TypeError("ATTEMPT_LEDGER_CONSUMPTION_INVALID");
  }
  const pendingModelAttempts = input.pendingModelAttempts ?? 0;
  if (!Number.isInteger(pendingModelAttempts) || pendingModelAttempts < 0) {
    throw new TypeError("ATTEMPT_LEDGER_PENDING_INVALID");
  }
  /**
   * J28 — the REPORTING comparison follows the PERMISSION comparison.
   * `assertModelAttemptAllowed` PERMITS exactly `maxModelAttempts` attempts
   * (it refuses at `consumed >= max`), so a run that spends exactly what the
   * structure permits has not exceeded anything and is WITHIN. Reporting that
   * state as EXHAUSTED made a lawful maximum-path run complete and then say it
   * had run out — and, worse, fired the envelope terminal that REPLACED the
   * answer it had just served (`makeEnvelopeTerminal`, in the runner's serve
   * section). Nothing about what is ALLOWED changes here; only what the run
   * says about itself. V-S09-8 records the alternative reading, which is V's.
   *
   * The `+ pendingModelAttempts` term is what keeps that ruling intact while
   * still telling the truth about a REFUSED attempt: at the default 0 this is
   * character-for-character J28's comparison, and the refusal context supplies
   * the 1 that makes its own question the one being answered.
   */
  if (input.consumedModelAttempts + pendingModelAttempts <= input.basis.maxModelAttempts) {
    return Object.freeze({
      kind: "WITHIN_ENVELOPE",
      state: "WITHIN",
      consumedModelAttempts: input.consumedModelAttempts
    });
  }
  if (input.verifiedNodeIds.length === 0) {
    throw new TypedDomainError(
      "ENVELOPE_EXHAUSTED_WITHOUT_VERIFIED_COMPONENTS",
      "A hard stop must identify the already-verified components it can serve"
    );
  }
  const enrichmentSkips: Array<Extract<BudgetPressureDecision, { kind: "HARD_STOP" }>["enrichmentSkips"][number]> = [];
  const protectedCoreRefusals: Array<Extract<BudgetPressureDecision, { kind: "HARD_STOP" }>["protectedCoreRefusals"][number]> = [];
  for (const pending of input.pendingRows) {
    const decision = decideRowBudgetOutcome(pending.batteryRowId, true);
    if (decision.kind === "SKIPPED") {
      if (pending.affectedNodeIds.length === 0) {
        throw new TypedDomainError("BUDGET_SKIP_AFFECTED_NODES_REQUIRED", pending.batteryRowId);
      }
      enrichmentSkips.push(Object.freeze({
        batteryRowId: pending.batteryRowId,
        outcome: decision.outcome,
        conditionMark: decision.conditionMark,
        affectedNodeIds: Object.freeze([...pending.affectedNodeIds])
      }));
    } else if (decision.kind === "REFUSED" && decision.reason === "PROTECTED_CORE_REFUSES_SKIP") {
      protectedCoreRefusals.push(Object.freeze({
        batteryRowId: pending.batteryRowId,
        outcome: decision.outcome,
        reason: decision.reason,
        affectedNodeIds: Object.freeze([...pending.affectedNodeIds])
      }));
    }
  }
  return Object.freeze({
    kind: "HARD_STOP",
    state: "EXHAUSTED",
    consumedModelAttempts: input.consumedModelAttempts,
    enrichmentSkips: Object.freeze(enrichmentSkips),
    protectedCoreRefusals: Object.freeze(protectedCoreRefusals),
    terminal: Object.freeze({
      conditionMark: "ENVELOPE_EXHAUSTED",
      servedNodeIds: Object.freeze([...input.verifiedNodeIds])
    })
  });
}

export interface ConvergenceSnapshot {
  readonly semanticsRef: string;
  readonly topologyRef: string;
  readonly evidenceTopologyRef: string;
  readonly strengths: Readonly<Record<string, number>> | null;
}

export type ConvergenceComparison =
  | { readonly kind: "NOT_COMPARABLE"; readonly reason: "FIRST_EVALUATION" | "SEMANTICS_CHANGED" | "TOPOLOGY_CHANGED" | "STRENGTHS_UNAVAILABLE" }
  | { readonly kind: "COMPARABLE"; readonly converged: boolean; readonly maxDelta: number };

export function compareConvergence(input: {
  readonly previous: ConvergenceSnapshot | null;
  readonly current: ConvergenceSnapshot;
  readonly epsilon: number;
}): ConvergenceComparison {
  if (!Number.isFinite(input.epsilon) || input.epsilon < 0) throw new TypeError("CONVERGENCE_EPSILON_INVALID");
  if (input.previous === null) return Object.freeze({ kind: "NOT_COMPARABLE", reason: "FIRST_EVALUATION" });
  if (input.previous.semanticsRef !== input.current.semanticsRef) {
    return Object.freeze({ kind: "NOT_COMPARABLE", reason: "SEMANTICS_CHANGED" });
  }
  if (
    input.previous.topologyRef !== input.current.topologyRef
    || input.previous.evidenceTopologyRef !== input.current.evidenceTopologyRef
  ) {
    return Object.freeze({ kind: "NOT_COMPARABLE", reason: "TOPOLOGY_CHANGED" });
  }
  if (input.previous.strengths === null || input.current.strengths === null) {
    return Object.freeze({ kind: "NOT_COMPARABLE", reason: "STRENGTHS_UNAVAILABLE" });
  }
  const overlappingNodeIds = Object.keys(input.current.strengths)
    .filter((nodeId) => Object.hasOwn(input.previous!.strengths!, nodeId));
  if (overlappingNodeIds.length === 0) {
    return Object.freeze({ kind: "NOT_COMPARABLE", reason: "STRENGTHS_UNAVAILABLE" });
  }
  const maxDelta = Math.max(...overlappingNodeIds.map((nodeId) => Math.abs(
    input.current.strengths![nodeId]! - input.previous!.strengths![nodeId]!
  )));
  return Object.freeze({ kind: "COMPARABLE", converged: maxDelta <= input.epsilon, maxDelta });
}

export class BudgetRepository {
  readonly #ledger: LedgerRepository;

  constructor(private readonly pool: Pool) {
    this.#ledger = new LedgerRepository(pool);
  }

  async countRunModelAttempts(runId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM ledger.ledger_entry
       WHERE run_id = $1 AND action_kind = 'MODEL_CALL'
         AND NOT evaluator.ledger_entry_is_authenticated_scope(ledger_entry_id)`,
      [runId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async readPinnedBasis(runId: string): Promise<CostEnvelopeBasis> {
    const result = await this.pool.query<{ envelope_basis: unknown }>(
      "SELECT envelope_basis FROM core.run WHERE run_id = $1",
      [runId]
    );
    if (result.rows[0] === undefined) throw new TypedDomainError("RUN_NOT_FOUND", runId);
    return parseCostEnvelopeBasis(result.rows[0].envelope_basis);
  }

  async assertModelAttemptAllowed(runId: string): Promise<void> {
    const basis = await this.readPinnedBasis(runId);
    if (await this.countRunModelAttempts(runId) >= basis.maxModelAttempts) {
      throw new TypedDomainError(
        "RUN_COST_ENVELOPE_EXHAUSTED",
        `Run ${runId} exhausted its pinned computed structural ceiling`
      );
    }
  }

  async evaluateRunPressure(input: {
    readonly runId: string;
    readonly basis: CostEnvelopeBasis;
    /** T17B/B1 — see `decideBudgetPressure`: which question the caller is asking. */
    readonly pendingModelAttempts?: number;
    readonly pendingRows: readonly PendingBudgetRow[];
    readonly verifiedNodeIds: readonly string[];
  }): Promise<BudgetPressureDecision> {
    return decideBudgetPressure({
      basis: input.basis,
      consumedModelAttempts: await this.countRunModelAttempts(input.runId),
      // Resolved here rather than forwarded as `undefined`: the repo builds under
      // `exactOptionalPropertyTypes`, so an absent caller means 0, explicitly.
      pendingModelAttempts: input.pendingModelAttempts ?? 0,
      pendingRows: input.pendingRows,
      verifiedNodeIds: input.verifiedNodeIds
    });
  }

  async recordDecision(input: {
    readonly runId: string;
    readonly workItemId: string;
    readonly attemptId: string;
    readonly actorRef: string;
    readonly contractHash: string;
    readonly decision: BudgetPressureDecision;
  }): Promise<void> {
    const now = new Date();
    if (input.decision.kind === "HARD_STOP") {
      for (const row of input.decision.enrichmentSkips) {
        await this.#ledger.append({
          runId: input.runId,
          attemptId: input.attemptId,
          actionKind: "BUDGET_SKIP",
          subjectItemId: input.workItemId,
          stanceAtAction: "UNASSIGNED",
          outcome: row.outcome,
          actorRef: input.actorRef,
          inputHash: createHash("sha256").update(JSON.stringify({
            batteryRowId: row.batteryRowId,
            affectedNodeIds: row.affectedNodeIds
          })).digest("hex"),
          contractHash: input.contractHash,
          startedAt: now,
          finishedAt: now
        });
      }
      for (const row of input.decision.protectedCoreRefusals) {
        await this.#ledger.append({
          runId: input.runId,
          attemptId: input.attemptId,
          actionKind: "BUDGET_SKIP",
          subjectItemId: input.workItemId,
          stanceAtAction: "UNASSIGNED",
          outcome: row.outcome,
          actorRef: input.actorRef,
          inputHash: createHash("sha256").update(JSON.stringify({
            batteryRowId: row.batteryRowId,
            reason: row.reason
          })).digest("hex"),
          contractHash: input.contractHash,
          startedAt: now,
          finishedAt: now
        });
      }
    }
    await withWriteTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
         VALUES ($1,$2,'ENVELOPE_CONSUMED',$3::jsonb)`,
        [input.runId, await allocateSequence(client), JSON.stringify(input.decision.consumedModelAttempts)]
      );
      if (input.decision.kind === "HARD_STOP" && input.decision.enrichmentSkips.length > 0) {
        await client.query(
          `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
           VALUES ($1,$2,'ENVELOPE_STATE',$3::jsonb)`,
          [input.runId, await allocateSequence(client), JSON.stringify("ENRICHMENT_SKIPPED")]
        );
      }
      if (input.decision.kind === "HARD_STOP") {
        await client.query(
          `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
           VALUES ($1,$2,'ENVELOPE_STATE',$3::jsonb)`,
          [input.runId, await allocateSequence(client), JSON.stringify("EXHAUSTED")]
        );
      }
    });
  }
}
