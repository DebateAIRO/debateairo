import { describe, expect, it } from "vitest";
import type { ExecutionLedgerDigest } from "@debateai/contract";
import { buildAnswerExport } from "../../apps/ui/lib/v3/answerExport.js";
import { createLiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/**
 * UI-01 rework round 1 (Grok rev-1 BLOCKING). S14 gated the export affordance
 * on the answer AND the execution-ledger digest
 * (web/app/debate/[id]/DebatePageClient.tsx:109). The restored surface gated
 * on the answer alone, so an answer whose digest had not loaded — or whose
 * digest read had FAILED — still offered a download labelled
 * "answer + honesty + ledger" carrying execution_ledger_digest: null.
 *
 * The decision now lives in one pure function, so the top-bar affordance, its
 * toast, and the drawer's copy cannot drift apart from the payload again.
 */

/** Shaped from a real acceptance digest (run 8d2b4e5a, answer ccef6817). */
const digestFixture: ExecutionLedgerDigest = {
  answer_id: "ccef6817-05bb-436d-8c5e-a79c051c010b",
  run_ref: "8d2b4e5a-c55c-46c4-bb10-8d59f21f28fb",
  work_items: [
    { node_ref: "3b4c2b13-fbdd-4ccb-ae40-fced12c76a05", status: "ERROR", reason: "MISSING_COMPLETED_ITEM" }
  ],
  entries: [
    {
      entry_ref: "1f38a7c3-d5bd-4bc5-96af-f4251f7381ca",
      action_kind: "JUDGEMENT_SCHEDULED",
      subject_ref: "ddfa48ee-bcef-4d6d-ac0a-951b770a15af",
      outcome: "OK",
      actor_ref: "acceptance:walking-skeleton",
      started_at: "2026-08-10T09:34:22.464Z",
      finished_at: "2026-08-10T09:34:22.464Z"
    }
  ]
};

describe("UI-01 export decision — S14's dual gate, restored once", () => {
  const answer = buildFairShapedAnswer();
  const live = createLiveRunState();

  it("withholds the export while the ledger digest has not arrived", () => {
    const result = buildAnswerExport({ answer, ledgerDigest: null, ledgerError: null, live });
    expect(result.available).toBe(false);
    if (result.available) throw new Error("unreachable");
    expect(result.reason).toBe("LEDGER_DIGEST_PENDING");
    // No href to click, and no sentence promising a ledger.
    expect(result).not.toHaveProperty("href");
    expect(result.message).not.toMatch(/\bledger\b(?=[^.]*\bready\b)/i);
    expect(result.message).toContain("execution-ledger digest");
  });

  it("says the export will never arrive when the digest read refused", () => {
    const result = buildAnswerExport({
      answer,
      ledgerDigest: null,
      ledgerError: "NOT_FOUND",
      live
    });
    expect(result.available).toBe(false);
    if (result.available) throw new Error("unreachable");
    expect(result.reason).toBe("LEDGER_DIGEST_UNREADABLE");
    // "becomes available once the digest loads" is a lie here — it will not.
    expect(result.message).not.toMatch(/once the .*digest loads/i);
    expect(result.message).toContain("NOT_FOUND");
  });

  it("withholds the export when no answer has been served yet", () => {
    const result = buildAnswerExport({ answer: null, ledgerDigest: digestFixture, ledgerError: null, live });
    expect(result.available).toBe(false);
    if (result.available) throw new Error("unreachable");
    expect(result.reason).toBe("NO_SERVED_ANSWER");
  });

  it("offers the export — and only then claims the ledger — once both are present", () => {
    const result = buildAnswerExport({ answer, ledgerDigest: digestFixture, ledgerError: null, live });
    expect(result.available).toBe(true);
    if (!result.available) throw new Error("unreachable");
    expect(result.label).toBe("Export answer + honesty + ledger");
    expect(result.toast).toBe("Exported answer + honesty + ledger");
    expect(result.filename).toBe(`${answer.answer_id}-v${answer.answer_version}.json`);

    const payload = JSON.parse(decodeURIComponent(result.href.replace(/^data:application\/json;charset=utf-8,/, "")));
    expect(payload.answer.answer_id).toBe(answer.answer_id);
    // The claim on the button is now true of the bytes it downloads.
    expect(payload.execution_ledger_digest).toEqual(digestFixture);
    expect(payload.live_honesty).toEqual({
      investigation_gaps: [],
      cycle_refusals: [],
      honesty_events: [],
      ledger_events: []
    });
  });

  it("keeps the S14 payload shape byte-comparable for the answer and digest", () => {
    const result = buildAnswerExport({ answer, ledgerDigest: digestFixture, ledgerError: null, live });
    if (!result.available) throw new Error("unreachable");
    const payload = JSON.parse(decodeURIComponent(result.href.replace(/^data:application\/json;charset=utf-8,/, "")));
    // S14 exported exactly { answer, execution_ledger_digest }; the restored
    // export adds live honesty and drops nothing.
    expect(Object.keys(payload).sort()).toEqual(["answer", "execution_ledger_digest", "live_honesty"]);
  });
});
