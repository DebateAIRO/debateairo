import type { Pool, PoolClient, QueryResult } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresAskApplication } from "../../apps/api/src/index.js";
import { runEvaluatorJudgeGradingAddon } from "../../apps/evaluator-worker/src/index.js";
import { runLivenessSweep } from "../../apps/scheduler/src/index.js";
import { readTerminalRecordedFacts } from "../../packages/battery/src/terminal.js";
import { MemoryRepository } from "../../packages/memory/src/index.js";
import { parseApiEnvironment } from "../../packages/register/src/index.js";
import { SettlementRepository } from "../../packages/settlement/src/index.js";

const UNSAFE_VERSION = "9007199254740993" as const;

function result(rows: readonly Record<string, unknown>[]): QueryResult {
  return { rows, rowCount: rows.length } as unknown as QueryResult;
}

describe("unsafe register versions fail inside every legacy-number family", () => {
  it("stops evaluator-addon work after the run-version read", async () => {
    const query = vi.fn(async () => result([{ register_version: UNSAFE_VERSION }]));
    const outcome = await runEvaluatorJudgeGradingAddon({
      pool: { query } as unknown as Pool,
      runId: "run:unsafe-version",
      family: { registerVersion: 1 } as never,
      deployment: { configuredProviders: [] },
      provider: {} as never
    });
    expect(outcome).toEqual({ state: "FAILED", reason: "ADDON_PREFLIGHT_FAILED" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("stops the scheduler before policy or liveness work", async () => {
    const query = vi.fn(async () => result([{ register_version: UNSAFE_VERSION }]));
    await expect(runLivenessSweep({ query } as unknown as Pool))
      .rejects.toThrow("REGISTER_VERSION_UNSAFE_LEGACY_NUMBER");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("stops terminal-fact projection at its first recorded row", async () => {
    const query = vi.fn(async () => result([{ register_version: UNSAFE_VERSION }]));
    await expect(readTerminalRecordedFacts({ query } as unknown as Pool, "run:unsafe-version"))
      .rejects.toThrow("REGISTER_VERSION_UNSAFE_LEGACY_NUMBER");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("stops memory disclosure before exposing a pinned pull", async () => {
    const runId = "00000000-0000-4000-8000-000000000001";
    const priorRunId = "00000000-0000-4000-8000-000000000002";
    const poolQuery = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT link.prior_run_id")) return result([{ prior_run_id: priorRunId }]);
      if (sql.includes("FROM memory.candidate_record")) return result([]);
      if (sql.includes("SELECT link.*, event.state")) return result([{
        memory_link_id: "00000000-0000-4000-8000-000000000003",
        source_run_id: runId,
        prior_run_id: priorRunId,
        relation: "SAME_QUESTION",
        match_tier: "EXACT_QUESTION",
        agreed_fields: [],
        disagreed_fields: [],
        not_compared_fields: [],
        decided_by: "fixture:unsafe-version",
        prior_answer_id: "00000000-0000-4000-8000-000000000004",
        state: "LINKED"
      }]);
      if (sql.includes("FROM memory.pull_record")) return result([{
        pull_record_id: "00000000-0000-4000-8000-000000000005",
        artifact_id: "00000000-0000-4000-8000-000000000004",
        artifact_version: 1,
        content_hash: "a".repeat(64),
        artifact_as_of: new Date("2026-09-04T00:00:00.000Z"),
        staleness_state_at_pull: "FRESH",
        asker_scope: "fixture:scope",
        register_row_key: "memoryPolicy",
        register_version: UNSAFE_VERSION,
        register_source_ref: "fixture:unsafe-version",
        payload_snapshot: {
          runId: priorRunId,
          questionLine: "prior question",
          verdict: null,
          confidenceBand: null
        },
        content_ciphertext: null
      }]);
      throw new Error(`unexpected pool query: ${sql}`);
    });
    const clientQuery = vi.fn(async (sql: string, values?: readonly unknown[]) => {
      if (sql.includes("pg_try_advisory_lock")) return result([{ acquired: true }]);
      if (sql.includes("core.run_private_content_is_live")) {
        return result(((values?.[0] ?? []) as readonly string[]).map((id) => ({ run_id: id, live: true })));
      }
      if (sql.includes("pg_advisory_unlock")) return result([{ unlocked: true }]);
      throw new Error(`unexpected lease query: ${sql}`);
    });
    const client = { query: clientQuery, release: vi.fn() } as unknown as PoolClient;
    const pool = { query: poolQuery, connect: async () => client } as unknown as Pool;
    await expect(new MemoryRepository(pool).readDisclosure(runId))
      .rejects.toThrow("REGISTER_VERSION_UNSAFE_LEGACY_NUMBER");
    expect(poolQuery.mock.calls.some(([sql]) => String(sql).includes("FROM memory.pull_record"))).toBe(true);
  });

  it("stops settlement projection before returning a scorecard", async () => {
    const query = vi.fn(async () => result([{
      model_id: "model:test",
      model_version: "v1",
      provider: "provider:test",
      task_class: "GENERAL",
      metric: "BRIER",
      as_of: new Date("2026-09-04T00:00:00.000Z"),
      value: null,
      n: 0,
      interval_lower: null,
      interval_upper: null,
      settled_count: 0,
      unsettled_count: 0,
      permanently_unscoreable_count: 0,
      abstained_count: 0,
      basis: "NONE",
      proper_score_decomposition: null,
      derivation_input: [],
      derivation_hash: "a".repeat(64),
      strategy_row_key: "settlementPolicy",
      strategy_register_version: UNSAFE_VERSION,
      strategy_source_ref: "fixture:unsafe-version"
    }]));
    await expect(new SettlementRepository({ query } as unknown as Pool).readScorecards(new Date()))
      .rejects.toThrow("REGISTER_VERSION_UNSAFE_LEGACY_NUMBER");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects the API environment and direct deployment adapter before a register read", async () => {
    const environment = {
      KEK_PATH: "/run/secrets/kek",
      SUPPORT_KEK_PATH: "/run/secrets/support-kek",
      BLIND_INDEX_KEY_PATH: "/run/secrets/blind",
      AUDIT_KEY_STORE_PATH: "/run/secrets/audit",
      AUDIT_SOURCE_IP_SALT_PATH: "/run/secrets/audit-ip",
      USER_DEK_STORE_PATH: "/run/secrets/dek",
      CONTENT_PROVISION_DATABASE_URL: "postgresql://content:test@127.0.0.1:5432/debateai",
      ERASURE_DATABASE_URL: "postgresql://erasure:test@127.0.0.1:5432/debateai",
      ACCOUNT_ERASURE_GRACE_MS: "604800000",
      MAIL_SENDMAIL_PATH: "/usr/sbin/sendmail",
      MAIL_FROM: "noreply@debateai.test",
      PUBLIC_APP_URL: "https://debateai.test",
      DATABASE_URL: "postgresql://runtime:test@127.0.0.1:5432/debateai",
      SUPPORT_DATABASE_URL: "postgresql://support:test@127.0.0.1:5432/debateai",
      AUTHORIZATION_DATABASE_URL: "postgresql://authorization:test@127.0.0.1:5432/debateai",
      API_HOST: "127.0.0.1",
      API_PORT: "3000",
      STRANGER_SAMPLE_RATE: "0.1",
      REGISTER_VERSION: UNSAFE_VERSION,
      BATTERY_VERSION: "test",
      SETTLEMENT_WATCH_HANDLE: "test",
      HATCHET_CLIENT_TOKEN: "test",
      HATCHET_HOST_PORT: "127.0.0.1:7077",
      HATCHET_API_URL: "http://127.0.0.1:8080",
      HATCHET_TENANT_ID: "test",
      HATCHET_WORKFLOW_NAME: "test",
      HATCHET_TLS_STRATEGY: "none"
    } as const;
    expect(() => parseApiEnvironment(environment))
      .toThrow("REGISTER_VERSION_UNSAFE_LEGACY_NUMBER");

    const query = vi.fn(async () => result([]));
    const pool = { query } as unknown as Pool;
    const application = new PostgresAskApplication(
      pool,
      {} as never,
      {
        strangerSampleRate: 0,
        registerVersion: Number(UNSAFE_VERSION),
        batteryVersion: "test",
        settlementWatchHandle: "test",
        resolveDiscoveredPanel: async () => [],
        resolveEnvelopeBasis: async () => ({}),
        resolveRisk: () => ({ effectiveRiskTier: "standard", tierSource: "ASKER", tierProvenanceRef: "test" })
      },
      undefined,
      {} as Pool,
      { server: {} as Pool, legacy: {} as Pool }
    );
    await expect(application.readDeployment({ session_id: "session:test" } as never))
      .rejects.toThrow("No sealed V3 deployment register exists");
    expect(query).not.toHaveBeenCalled();
  });
});
