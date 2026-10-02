/**
 * S1a — the two money rules the model-scorecard merge must keep together, which no
 * text merge shows: dev's answer reserve (engine money rule M1) sized by the
 * scorecard's DR-184-v5 serve site (main + backup), and one spend row naming
 * BOTH the phase that spent it (dev, 0075) and the attempt it paid for (scorecard, 0090).
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  CostEnvelopeGuard,
  PostgresModelSpendStore,
  attemptCeilingForPhase,
  parseCostEnvelopeBasis,
  type ModelSpendEntry,
  type ModelSpendStore
} from "@debateai/budget";
import { computeStructuralCeilingBasis } from "@debateai/register";

const CEILING_INPUT = Object.freeze({
  panelSize: 2, depth: 1, maxDepth: 5,
  judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1,
  maxRecompose: 1, maxCooldownHoldsPerRun: 2, branchingFactor: 2,
  compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3
});

describe("S1a · DR-184-v5 holds the answer's backup attempts back from the body too", () => {
  it("reserves serve sites × the v5 serve site value, and the run head reads the receipt", () => {
    const basis = computeStructuralCeilingBasis({ ...CEILING_INPUT, backupSequencesProvisioned: 1 });
    expect(basis.formula_version).toBe("DR-184-v5");
    expect(basis.per_site_attempts).toMatchObject({ organ: 6 });
    expect(basis.call_sites).toMatchObject({ serve: 6 });
    expect(basis.serve_reserve_attempts).toBe(36);
    const parsed = parseCostEnvelopeBasis(basis);
    expect(parsed.serveReserveAttempts).toBe(36);
    expect(attemptCeilingForPhase(parsed, "BODY")).toBe(parsed.maxModelAttempts - 36);
    expect(attemptCeilingForPhase(parsed, "SERVE")).toBe(parsed.maxModelAttempts);
  });

  it("keeps dev's DR-184-v4 reserve exactly: serve sites × the per-round organ limit", () => {
    const basis = computeStructuralCeilingBasis({ ...CEILING_INPUT, backupSequencesProvisioned: 0 });
    expect(basis.formula_version).toBe("DR-184-v4");
    expect(basis.serve_reserve_attempts).toBe(18);
    expect(parseCostEnvelopeBasis(basis).serveReserveAttempts).toBe(18);
  });
});

describe("S1a · a RUN charge names its phase and its attempt", () => {
  const ATTEMPT = "5a3c0f1e-8b2d-4c6a-9e7f-1d2c3b4a5f60";

  it("carries both through the guard's run seam", async () => {
    const rows: ModelSpendEntry[] = [];
    const store = {
      recordSpend: async (entry: ModelSpendEntry) => { rows.push(entry); },
      readRunSpentMicros: async () => 0,
      readRunStorySpentMicros: async () => 0,
      readDaySpentMicros: async () => 0,
      admitNewRun: async () => ({ admitted: true, committedMicros: 0 })
    } as unknown as ModelSpendStore;
    const seam = new CostEnvelopeGuard({
      store,
      policy: { perRunCeilingMicros: 1_000_000_000, dailyCeilingMicros: 10_000_000_000 },
      clock: () => new Date("2026-10-01T10:00:00.000Z")
    }).providerSeam({
      runId: "run-s1a",
      price: { inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 },
      requireReportedUsage: false,
      phase: "SERVE"
    });
    await seam.recordCall({
      providerRef: "provider:s1a",
      usage: { prompt_tokens: 3, completion_tokens: 2 },
      projection: { requestBytes: 8, completionTokenCeiling: 8 },
      attemptId: ATTEMPT
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ spendSource: "RUN", spendPhase: "SERVE", attemptId: ATTEMPT });
  });

  it("writes both columns in the one INSERT", async () => {
    const queries: { text: string; values: readonly unknown[] }[] = [];
    const pool = {
      query: vi.fn(async (text: string, values: readonly unknown[]) => {
        queries.push({ text, values });
        return { rows: [], rowCount: 1 };
      })
    } as unknown as Pool;
    await new PostgresModelSpendStore(pool).recordSpend({
      spendId: randomUUID(), spendSource: "RUN", runId: randomUUID(), providerRef: "provider:s1a",
      chargedOn: "2026-10-01", chargeMicros: 5, inputTokens: 3, outputTokens: 2,
      spendPhase: "BODY", attemptId: ATTEMPT
    });
    const insert = queries.find((query) => query.text.includes("INSERT INTO ledger.model_spend"));
    expect(insert?.text).toMatch(/spend_phase,\s*attempt_id/u);
    expect(insert?.values.slice(-2)).toEqual(["BODY", ATTEMPT]);
  });
});
