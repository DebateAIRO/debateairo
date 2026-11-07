import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { TypedDomainError } from "@debateai/kernel";
import { Judge, JudgeContentRefusedError } from "@debateai/judgement";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  type ProviderGateway
} from "@debateai/providers";
import {
  haltedExpansionConditionRecord,
  withCooldownRetry,
  type HaltedExpansionRecord,
  type HoldProgressEvent
} from "@debateai/runner";
import { assertRequiredConditionMarkRecords } from "@debateai/serve";
import { CONTENT_REFUSED_HALT_REASON } from "../../apps/runner/src/story-snapshot.js";

/**
 * R22 (owner ruling 2026-10-29) — ONE AUTHOR'S FORMAT SLIP NEVER FAILS THE WHOLE DEBATE.
 *
 * The shape of the real failure (R21, run 3714be1b…, PHASE-B.md and scripts-2/diag-run3..5): MiMo wrote the
 * cross-exchange `JUDGE:cross-root:0->3`. Its first reply (attempt 1, form ORIGINAL) failed the content check
 * (class CONTENT, CONTENT_SCHEMA_FAILED); the short patch follow-up (attempt 2, form PATCH) failed it again; the
 * gateway gave up with a content refusal naming that second attempt, the Judge turned it into JUDGE_SCHEMA_FAILURE,
 * and the runner failed the whole debate on it. Now the cross-exchange (like any reply) is given up and disclosed with
 * the halted-branch mark, as a dead transport already is, and the debate goes on.
 */

const policy = Object.freeze({ cooldownMs: 600_000, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 2 });

/** What the gateway threw at the end of MiMo's two tries: attempt 2 (the patch) refused, its own artifact and row. */
const mimoRefusal = () => new ProviderContentUnacceptedError(
  2, "SCHEMA_FAILED", "content schema failed at named members", "artifact:7f0ee65a", "ledger:7f0ee65a"
);

function recorder() {
  const events: HoldProgressEvent[] = [];
  return {
    events,
    countCooldownHolds: vi.fn(async () => 0),
    record: vi.fn(async (event: HoldProgressEvent) => { events.push(event); }),
    wait: vi.fn(async () => undefined)
  };
}

const crossExchangeSite = {
  runId: "run:3714be1b",
  callSiteKey: "JUDGE:cross-root:0->3",
  parentNodeId: "node:root-0",
  plannedLegCount: 1,
  baseMaxAttempts: 3,
  failureScope: "EXPANSION" as const,
  policy
};

describe("R22 · the Judge names the refused attempt when an author's reply is refused after its repairs", () => {
  it("still fails as JUDGE_SCHEMA_FAILURE (every reader of the code is unchanged), and carries the gateway's refusal", async () => {
    const refusal = mimoRefusal();
    const provider: ProviderGateway = { call: async () => { throw refusal; } };
    const failure = await new Judge(provider).judge({
      runId: null, subjectItemId: "work:r22", callSiteKey: "JUDGE:cross-root:0->3",
      questionLine: "Test-layer question", providerRef: "preview:mimo-v2-6-pro", contractHash: "contract:test",
      leg: { kind: "cross-root", ownPosition: "Own position.", otherMakersPosition: "Other maker's position." },
      bound: { maxAttempts: 3, tokenCeiling: 64, deadlineMs: 5_000 }
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(JudgeContentRefusedError);
    expect(failure).toBeInstanceOf(TypedDomainError);
    expect(failure).toMatchObject({ code: "JUDGE_SCHEMA_FAILURE", message: refusal.lastParseError, name: "TypedDomainError" });
    expect((failure as JudgeContentRefusedError).refusal).toBe(refusal);
  });

  it("keeps a schema failure that is not the gateway's refusal a plain JUDGE_SCHEMA_FAILURE", async () => {
    // The reply was accepted by the gateway but its claim type cannot be resolved: no refused attempt to name.
    const provider: ProviderGateway = { call: async () => ({
      rawArtifactRef: "artifact:ok", ledgerEntryRef: "ledger:ok", content: JSON.stringify({ steelman: {} }),
      provider: "openai-compatible-http", model: "fixture/model", maker: "fixture", modelVersion: "fixture-version"
    }) };
    const failure = await new Judge(provider).judge({
      runId: null, subjectItemId: "work:r22", callSiteKey: "JUDGE:cross-root:0->3",
      questionLine: "Test-layer question", providerRef: "provider:test", contractHash: "contract:test",
      leg: { kind: "cross-root", ownPosition: "Own position.", otherMakersPosition: "Other maker's position." },
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 }
    }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "JUDGE_SCHEMA_FAILURE" });
    expect(failure).not.toBeInstanceOf(JudgeContentRefusedError);
  });
});

describe("R22 · a reply or cross-exchange refused after its repairs is given up, never the debate", () => {
  it("halts the cross-exchange at once: one could-not-do record, no hold, no wait, no second sequence", async () => {
    const hold = recorder();
    const refusal = mimoRefusal();
    const attempt = vi.fn(async () => { throw new JudgeContentRefusedError(refusal); });
    const outcome = await withCooldownRetry({ ...crossExchangeSite, hold, attempt, haltsOnContentRefusal: true });
    expect(outcome).toEqual({
      kind: "HALTED",
      record: {
        callSiteKey: "JUDGE:cross-root:0->3",
        parentNodeId: "node:root-0",
        plannedLegCount: 1,
        terminalTransportOutcome: "FAILED",
        lastLedgerEntryRef: "ledger:7f0ee65a",
        haltedBy: "CONTENT_REFUSED"
      }
    });
    // Asking again is what the gateway's repair chain already did: the site's one sequence is all it gets.
    expect(attempt.mock.calls).toEqual([[3]]);
    expect(hold.countCooldownHolds).not.toHaveBeenCalled();
    expect(hold.wait).not.toHaveBeenCalled();
    expect(hold.events).toEqual([{
      kind: "ledger.could_not_do", state: "EXPANSION_HALTED", runId: "run:3714be1b", callSiteKey: "JUDGE:cross-root:0->3",
      parentNodeId: "node:root-0", holdMs: 600_000, holdUntil: null, attemptsSpent: 2, transportOutcome: "FAILED",
      plannedLegCount: 1
    }]);
  });

  it("counts the site's true attempts off the ledger when the caller can read them", async () => {
    const hold = recorder();
    await withCooldownRetry({
      ...crossExchangeSite, hold, haltsOnContentRefusal: true, siteAttemptsSpent: async () => 3,
      attempt: async () => { throw new JudgeContentRefusedError(mimoRefusal()); }
    });
    expect(hold.events.map((event) => event.attemptsSpent)).toEqual([3]);
  });

  it("halts a final retry that is refused after a dead transport's hold, and names the refusal", async () => {
    const hold = recorder();
    const attempt = vi.fn()
      .mockRejectedValueOnce(new ProviderCallFailedError(new Error("test-layer transport down"), 3, "TIMED_OUT", "ledger:dead"))
      .mockRejectedValueOnce(new JudgeContentRefusedError(mimoRefusal()));
    const outcome = await withCooldownRetry({ ...crossExchangeSite, hold, attempt, haltsOnContentRefusal: true });
    expect(outcome).toMatchObject({
      kind: "HALTED",
      record: { terminalTransportOutcome: "FAILED", lastLedgerEntryRef: "ledger:7f0ee65a", haltedBy: "CONTENT_REFUSED" }
    });
    expect(hold.events.map((event) => event.state)).toEqual(["COOLDOWN_HOLD", "COOLDOWN_RETRY", "EXPANSION_HALTED"]);
    expect(hold.events.at(-1)).toMatchObject({ attemptsSpent: 5, transportOutcome: "FAILED" });
  });

  it("leaves a transport halt exactly as today: no haltedBy on its record", async () => {
    const hold = recorder();
    const dead = () => new ProviderCallFailedError(new Error("test-layer transport down"), 3, "FAILED", "ledger:dead");
    const outcome = await withCooldownRetry({
      ...crossExchangeSite, hold, haltsOnContentRefusal: true, attempt: async () => { throw dead(); }
    });
    expect(outcome).toEqual({ kind: "HALTED", record: {
      callSiteKey: "JUDGE:cross-root:0->3", parentNodeId: "node:root-0", plannedLegCount: 1,
      terminalTransportOutcome: "FAILED", lastLedgerEntryRef: "ledger:dead"
    } });
  });

  it("without the switch, the refusal travels unchanged (a root's and a review's rule is today's)", async () => {
    const hold = recorder();
    const refused = new JudgeContentRefusedError(mimoRefusal());
    await expect(withCooldownRetry({ ...crossExchangeSite, failureScope: "MAKER_POSITION", hold,
      attempt: async () => { throw refused; } })).rejects.toBe(refused);
    expect(hold.events).toEqual([]);
  });

  it("never halts on a schema failure that names no refused attempt, nor on any other refusal", async () => {
    for (const error of [
      new TypedDomainError("JUDGE_SCHEMA_FAILURE", "claim type unresolved"),
      mimoRefusal(),
      new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "money")
    ]) {
      const hold = recorder();
      await expect(withCooldownRetry({ ...crossExchangeSite, hold, haltsOnContentRefusal: true,
        attempt: async () => { throw error; } })).rejects.toBe(error);
      expect(hold.events).toEqual([]);
    }
  });
});

describe("R22 · the halted cross-exchange is disclosed on the answer as a halted branch", () => {
  const transport: HaltedExpansionRecord = Object.freeze({
    callSiteKey: "JUDGE:cross-root:0->3", parentNodeId: "node:root-0", plannedLegCount: 1,
    terminalTransportOutcome: "TIMED_OUT", lastLedgerEntryRef: "ledger:dead"
  });
  const refused: HaltedExpansionRecord = Object.freeze({
    callSiteKey: "JUDGE:cross-root:0->3", parentNodeId: "node:root-0", plannedLegCount: 1,
    terminalTransportOutcome: "FAILED", lastLedgerEntryRef: "ledger:7f0ee65a", haltedBy: "CONTENT_REFUSED"
  });

  it("keeps a transport halt's record byte for byte", () => {
    expect(haltedExpansionConditionRecord(transport)).toEqual({
      mark: "UNAUTHORED-BRANCH-HALTED",
      scope: "node",
      subjectRef: "node:root-0",
      reason: "Expansion halted after transport exhaustion; no node was authored to hide or reveal",
      liftPath: "Retry the halted authoring call in a new run",
      servedRootRule: null,
      affectedNodeIds: ["node:root-0"],
      callSiteKey: "JUDGE:cross-root:0->3",
      plannedLegCount: 1,
      terminalTransportOutcome: "TIMED_OUT",
      hiddenStrength: null,
      hiddenScoreThreshold: null,
      hiddenScoreThresholdSourceRef: null,
      excludedFromServedNumber: null
    });
  });

  it("never says 'transport' for a refused reply: its reason is a code the story is never handed", () => {
    const record = haltedExpansionConditionRecord(refused);
    expect(record).toEqual({ ...haltedExpansionConditionRecord({ ...transport, terminalTransportOutcome: "FAILED" }),
      reason: CONTENT_REFUSED_HALT_REASON });
    expect(record.reason).not.toMatch(/transport/iu);
    expect(() => assertRequiredConditionMarkRecords(["UNAUTHORED-BRANCH-HALTED"], [record])).not.toThrow();
  });
});

describe("R22 · the runner gives up a reply or cross-exchange on a refusal, never a root", () => {
  it("asks the cooldown seam to halt on a refusal exactly when the leg has a parent", async () => {
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    // The leg's author call (roots, replies, cross-exchanges): only a leg under a parent may be given up for content.
    expect(source).toMatch(/const childAttempt = await cooldownAttempt\(\{[\s\S]*?failureScope: input\.parentNodeId === null \? "MAKER_POSITION" : "EXPANSION",\s*haltsOnContentRefusal: input\.parentNodeId !== null,/);
    // The seam forwards it to `withCooldownRetry`, and the answer's records are built by the one exported builder.
    expect(source).toMatch(/const retried = withCooldownRetry\(\{[\s\S]*?\.\.\.\(input\.haltsOnContentRefusal === true \? \{ haltsOnContentRefusal: true \} : \{\}\),/);
    expect(source).toContain("...haltedExpansionRecords.map(haltedExpansionConditionRecord),");
  });
});
