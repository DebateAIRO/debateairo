import { describe, expect, it } from "vitest";
import { CostEnvelopeGuard, type ModelSpendEntry, type ModelSpendStore } from "@debateai/budget";
import { OpenAICompatibleProviderGateway, type ProviderLedgerInput } from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

// Model scorecard §2.3: every charge names the gateway attempt it paid for, the
// same id that attempt's artifact and ledger row carry, so a call's cost can be
// read next to its role, candidate and level.

const MODEL = "fixture/model";
const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
const POLICY = Object.freeze({ perRunCeilingMicros: 1_000_000_000, dailyCeilingMicros: 10_000_000_000 });

function memoryStore() {
  const rows: ModelSpendEntry[] = [];
  const sum = (selected: readonly ModelSpendEntry[]) => selected.reduce((total, row) => total + row.chargeMicros, 0);
  const store: ModelSpendStore = {
    recordSpend: async (entry) => { rows.push(entry); },
    readRunSpentMicros: async (runId) => sum(rows.filter((row) => row.runId === runId)),
    readDaySpentMicros: async (day) => sum(rows.filter((row) => row.chargedOn === day)),
    admitNewRun: async () => ({ admitted: true, committedMicros: 0 })
  };
  return { store, rows };
}

describe("model scorecard — model_spend.attempt_id", () => {
  it("links every charge to the attempt it paid for — the id the attempt's ledger row carries", async () => {
    const { store, rows } = memoryStore();
    const seam = new CostEnvelopeGuard({ store, policy: POLICY, clock: () => new Date("2026-09-26T10:00:00.000Z") })
      .providerSeam({ runId: "run-1", price: PRICE, requireReportedUsage: true });
    const ledger: ProviderLedgerInput[] = [];
    let attempt = 0;
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: "http://fixture/v1", model: MODEL, maker: "fixture",
      fetchImplementation: async () => {
        attempt += 1;
        return new Response(JSON.stringify({
          id: `call-${attempt}`, model: MODEL,
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          choices: [{ message: { content: attempt === 1 ? "rejected" : "accepted" }, finish_reason: "stop" }]
        }));
      },
      sleepImplementation: async () => undefined,
      persistRawArtifact: async (artifact) => artifact.artifactId,
      appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
      assertNoOpenWriteTransaction: () => undefined
    });
    await gateway.call({
      runId: "run-1", subjectItemId: "node:spend", callSiteKey: "JUDGE", role: "JUDGE", lane: "served",
      bound: { maxAttempts: 2, tokenCeiling: 64, deadlineMs: 5_000 }, contractHash: "contract:spend",
      providerRef: "provider:spend", packet: framedFixturePacket("spend"), costEnvelope: seam,
      classifyContent: (content) => content === "accepted"
        ? { parseStatus: "PARSED", parseError: null }
        : { parseStatus: "SCHEMA_FAILED", parseError: "fixture" }
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.attemptId)).toEqual(ledger.map((entry) => entry.attemptId));
    expect(new Set(rows.map((row) => row.attemptId)).size).toBe(2);
  });

  it("records NULL for a charge that names no attempt (a caller outside the gateway)", async () => {
    const { store, rows } = memoryStore();
    const seam = new CostEnvelopeGuard({ store, policy: POLICY })
      .providerSeam({ runId: "run-1", price: PRICE, requireReportedUsage: false });
    await seam.recordCall({
      providerRef: "provider-1",
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      projection: { requestBytes: 8, completionTokenCeiling: 8 }
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attemptId: null });
  });
});
