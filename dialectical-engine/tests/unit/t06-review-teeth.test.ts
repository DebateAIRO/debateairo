import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConditionMarkRecordSchema, type NodeReview } from "@debateai/contract";
import { assertUnjudgedDisclosureShape } from "@debateai/runner";
import {
  assertRequiredConditionMarkRecords,
  type ConditionMarkRecord,
  type StoredNodeReviewOutcome
} from "@debateai/serve";

/**
 * T6 r3 / J14 ADDENDUM (1) — the review arm admits ONLY `cannot-assess`, and it
 * says so at every layer that can refuse it.
 *
 * r2 bound CARDINALITY: exactly one of `terminal_transport_outcome` and
 * `review_outcome` is set. Codex proved that is not TRUTH: `agree` and
 * `dispute` both SEED judged standing, so neither can ever be the reason a node
 * is unjudged, yet both passed the contract enum, the writer XOR and the SQL
 * CHECK. This file pins the two layers that are pure functions — the contract
 * schema and the writer's structural guard — plus the catch-up reader's shape
 * rule. The SQL layer is pinned by the DDL probes in
 * `tests/integration/database.test.ts`, and the cross-table truth (this review
 * is really THIS node's, and it really came back cannot-assess) by
 * `tests/integration/t06-review-teeth-database.test.ts`.
 */

const contractRecord = (over: Record<string, unknown>) => ({
  mark: "HIDDEN-UNJUDGEABLE",
  scope: "node",
  subject_ref: "node:1",
  reason: "probe",
  lift_path: null,
  served_root_rule: null,
  call_site_key: "JUDGE:review:node:1",
  planned_leg_count: null,
  terminal_transport_outcome: null,
  review_outcome: null,
  hidden_strength: null,
  hidden_score_threshold: null,
  hidden_score_threshold_source_ref: null,
  excluded_from_served_number: true,
  judged_basis_count: null,
  affected_node_ids: ["node:1"],
  ...over
});

describe("T6 r3 · the contract admits only cannot-assess in the review arm (J14 addendum 1)", () => {
  it("parses the cannot-assess review arm and the transport arm", () => {
    expect(ConditionMarkRecordSchema.safeParse(
      contractRecord({ review_outcome: "cannot-assess" })
    ).success).toBe(true);
    expect(ConditionMarkRecordSchema.safeParse(
      contractRecord({ terminal_transport_outcome: "FAILED" })
    ).success).toBe(true);
  });

  it("refuses agree and dispute — both SEED judged standing, so neither can be a reason a node is unjudged", () => {
    for (const outcome of ["agree", "dispute"]) {
      expect(ConditionMarkRecordSchema.safeParse(
        contractRecord({ review_outcome: outcome })
      ).success).toBe(false);
      expect(ConditionMarkRecordSchema.safeParse(
        contractRecord({ mark: "DERIVED-STANDING-UNREVIEWED", review_outcome: outcome,
          excluded_from_served_number: false, judged_basis_count: 1 })
      ).success).toBe(false);
    }
  });

  it("keeps the cardinality rule r2 established — never both, never neither", () => {
    expect(ConditionMarkRecordSchema.safeParse(contractRecord({
      terminal_transport_outcome: "FAILED", review_outcome: "cannot-assess"
    })).success).toBe(false);
    expect(ConditionMarkRecordSchema.safeParse(contractRecord({})).success).toBe(false);
  });
});

describe("T6 r3 · the writer's structural guard admits only cannot-assess", () => {
  const writerRecord = (over: Partial<ConditionMarkRecord>): ConditionMarkRecord => ({
    mark: "HIDDEN-UNJUDGEABLE",
    scope: "node",
    subjectRef: "node:1",
    reason: "probe",
    liftPath: null,
    servedRootRule: null,
    affectedNodeIds: ["node:1"],
    callSiteKey: "JUDGE:review:node:1",
    excludedFromServedNumber: true,
    ...over
  });

  it("accepts the cannot-assess arm", () => {
    expect(() => assertRequiredConditionMarkRecords(
      ["HIDDEN-UNJUDGEABLE"], [writerRecord({ reviewOutcome: "cannot-assess" })]
    )).not.toThrow();
  });

  it("refuses agree and dispute in the review arm", () => {
    for (const outcome of ["agree", "dispute"] as const) {
      expect(() => assertRequiredConditionMarkRecords(
        ["HIDDEN-UNJUDGEABLE"],
        // The TS type already forbids this; the cast is the point — the guard
        // must refuse the value even when it arrives from an untyped edge.
        [writerRecord({ reviewOutcome: outcome as unknown as "cannot-assess" })]
      )).toThrowError(expect.objectContaining({ code: "HIDDEN_CONDITION_MARK_RECORD_INVALID" }));
      expect(() => assertRequiredConditionMarkRecords(
        ["DERIVED-STANDING-UNREVIEWED"],
        [writerRecord({
          mark: "DERIVED-STANDING-UNREVIEWED",
          excludedFromServedNumber: false,
          judgedBasisCount: 1,
          reviewOutcome: outcome as unknown as "cannot-assess"
        })]
      )).toThrowError(expect.objectContaining({ code: "DERIVED_STANDING_RECORD_INVALID" }));
    }
  });
});

describe("T6 r3 · the review-catch-up reader refuses a malformed disclosure (J14 addendum 1, catch-up layer)", () => {
  const stored = (over: Record<string, unknown>) => ({
    call_site_key: "JUDGE:review:node:1",
    terminal_transport_outcome: null,
    review_outcome: null,
    ...over
  });

  it("reads the two lawful shapes", () => {
    expect(assertUnjudgedDisclosureShape("node:1", stored({ review_outcome: "cannot-assess" })))
      .toEqual({
        callSiteKey: "JUDGE:review:node:1",
        terminalTransportOutcome: null,
        reviewOutcome: "cannot-assess"
      });
    expect(assertUnjudgedDisclosureShape("node:1", stored({ terminal_transport_outcome: "FAILED" })))
      .toEqual({
        callSiteKey: "JUDGE:review:node:1",
        terminalTransportOutcome: "FAILED",
        reviewOutcome: null
      });
  });

  it("stops loudly on every malformed shape, including a review arm that reached a judgement", () => {
    const refused: Record<string, unknown>[] = [
      { review_outcome: "agree" },
      { review_outcome: "dispute" },
      { terminal_transport_outcome: "FAILED", review_outcome: "cannot-assess" },
      {},
      { review_outcome: "cannot-assess", call_site_key: null }
    ];
    for (const shape of refused) {
      expect(() => assertUnjudgedDisclosureShape("node:1", stored(shape)))
        .toThrowError(expect.objectContaining({ code: "CATCH_UP_DISCLOSURE_MISMATCH" }));
    }
    expect(() => assertUnjudgedDisclosureShape("node:1", undefined))
      .toThrowError(expect.objectContaining({ code: "CATCH_UP_DISCLOSURE_MISMATCH" }));
  });
});

/**
 * T6 r4 / codex r2 B1 — the LEDGER's review vocabulary is three values, and the
 * serve boundary that reads it must say so.
 *
 * r3 narrowed `review_outcome` to `"cannot-assess" | null` in TWO pg result
 * generics in `packages/serve/src/index.ts`. One reads
 * `serve.condition_mark.review_outcome`, whose CHECK this round narrowed to a
 * single value — correct. The other reads `review.outcome` from
 * `ledger.node_review`, whose CHECK (`migrations/0019_xrev01_node_review.sql:8`)
 * still lawfully admits `agree | dispute | cannot-assess`. Runtime therefore put
 * `"agree"` into a variable whose database-boundary type said that value was
 * impossible, and a typed consumer could omit both live states and still
 * compile: the exact HOMONYM the do-not-tidy guard exists to catch, committed by
 * the same round that claimed to have avoided it.
 *
 * Two guards, because the defect had two halves — a wrong TYPE and a wrong
 * PLACE:
 *
 *   1. the exhaustive switch below fails to compile if `StoredNodeReviewOutcome`
 *      is ever narrowed (TS2678 on the unreachable `case`) or widened (TS2322 on
 *      the `never`); and
 *   2. the source assertion pins that exactly ONE narrowed review-outcome read
 *      type exists in serve and that it is the condition-mark one — the count
 *      is what tells a legitimate narrowing from a homonym, and no type can
 *      express "in the right query".
 */
const nameEveryLawfulLedgerOutcome = (outcome: StoredNodeReviewOutcome): string => {
  switch (outcome) {
    case "agree": return "agree";
    case "dispute": return "dispute";
    case "cannot-assess": return "cannot-assess";
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
};

describe("T6 r4 · the serve boundary keeps the ledger's three-value review vocabulary (codex r2 B1)", () => {
  it("keeps the ledger column and the contract's review enum the SAME set", () => {
    // `readNodesForRun` assigns the ledger column straight into the contract's
    // `NodeReview.outcome` at the projection, so a narrowing on either side is
    // a lie on the other. Mutual assignability, checked by the compiler:
    // narrow either and `true` stops being assignable to `false`.
    type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    const sameSet: MutuallyAssignable<StoredNodeReviewOutcome, NodeReview["outcome"]> = true;
    expect(sameSet).toBe(true);
  });

  it("reaches every outcome the ledger CHECK admits", () => {
    const lawful: readonly StoredNodeReviewOutcome[] = ["agree", "dispute", "cannot-assess"];
    expect(lawful.map(nameEveryLawfulLedgerOutcome)).toEqual(["agree", "dispute", "cannot-assess"]);
  });

  it("narrows review_outcome in exactly ONE serve read — the condition-mark one, not the ledger one", () => {
    const serveSource = readFileSync(
      new URL("../../packages/serve/src/index.ts", import.meta.url), "utf8"
    );
    // The condition-mark disclosure read: narrowed at the READ because the
    // column is narrowed at the WRITE. Exactly one such site may exist.
    expect(serveSource.split('review_outcome: "cannot-assess" | null;').length - 1).toBe(1);
    // The ledger read: named, so a future narrowing has to delete the name
    // rather than quietly retype a column.
    expect(serveSource.split("review_outcome: StoredNodeReviewOutcome | null;").length - 1).toBe(1);
  });
});
