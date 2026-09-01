import { describe, expect, it } from "vitest";
import { ConditionMarkRecordSchema } from "@debateai/contract";
import { assertUnjudgedDisclosureShape } from "@debateai/runner";
import { assertRequiredConditionMarkRecords, type ConditionMarkRecord } from "@debateai/serve";

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
