import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import {
  appendChainedOccurrences,
  configureOccurrenceGatewayForTest,
  materializeDirectOccurrence,
} from "../../packages/obs-capture/src/chain/occurrence-gateway.js";
import { createSharedRedactor } from "../../packages/obs-capture/src/redactor.js";
import {
  createFixagentDeliveryGeneration,
} from "../../packages/obs-capture/src/chain/fixagent-delivery.js";
import { deliverOccurrence } from "../../tools/obs-listener/src/daemon/fold.js";
import { createTransactionTracerHook } from "../../tools/obs-listener/src/trace/hook.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const LISTENER_PASSWORD = "fix11-listener-test";
let database: TestDatabase;

function roleUrl(role: string, password: string): string {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return url.toString();
}

beforeAll(async () => {
  database = await startTestDatabase();
  await database.pool.query(
    "SELECT set_config('debateai.obs_listener_password', $1, false)",
    [LISTENER_PASSWORD],
  );
  await migrate(database.pool);
  configureOccurrenceGatewayForTest(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

async function insertTraceOccurrence(input: Readonly<{
  fingerprint: string;
  sourceEventRef: string;
  frames: readonly unknown[];
}>): Promise<string> {
  const occurrenceId = randomUUID();
  await database.pool.query(`
    INSERT INTO obs.occurrence (
      occurrence_id, occurred_at, captured_at, environment, build_ref, build_dirty, runtime,
      component, capture_point, code, taxonomy_class, severity, disposition, fingerprint,
      fingerprint_version, redaction_policy_version, allowlist_set_id, capture_status,
      run_ref, work_item_ref, node_ref, attempt_ref, ledger_ref, parent_occurrence_ref,
      cause_chain_codes, at_seq_watermark, frames, safe_template_id, source,
      source_event_ref, writer_identity
    ) VALUES (
      $1, now(), now(), 'test', 'build:one', false, 'scheduler',
      '{"process":"scheduler","package":"@debateai/scheduler"}'::jsonb, 'job',
      'OBS_SCHEDULER_JOB_FAILED', 'JOB_FAILURE', 'SEVERE', 'THROWN', $2, 1,
      'g0', 'g0-empty-parameters', 'PERSISTED',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NO_CAUSE',
      '[]'::jsonb, 'NOT_APPLICABLE', $3::jsonb, 'tpl.OBS_SCHEDULER_JOB_FAILED',
      'first_party', $4, 'scheduler'
    )
  `, [occurrenceId, input.fingerprint, JSON.stringify(input.frames), input.sourceEventRef]);
  return occurrenceId;
}

describe("FIX-11 occurrence-level trace evidence", () => {
  it("persists chain codes and captured frames on occurrence without granting occurrence_detail", async () => {
    const error = Object.assign(new Error("PLANTED_DATABASE_TEXT"), {
      code: "DATABASE_POOL_FAILED",
      stack: [
        "Error: PLANTED_DATABASE_TEXT",
        "    at connectPool (/repo/packages/db/src/index.ts:51:9)",
      ].join("\n"),
    });
    const redactor = createSharedRedactor({
      environment: "test",
      build_ref: "build:one",
      build_dirty: false,
      runtime: "runner",
      component: Object.freeze({ process: "runner", package: "@debateai/runner" }),
      writer_identity: "runner",
      redaction_policy_version: "g0",
      allowlist_set_id: "g0-empty-parameters",
      repoRoot: "/repo",
      causeDepthMax: 64,
      sourceEventRef: () => "40000000-0000-4000-8000-000000000001",
    });
    const envelope = redactor.redact({
      kind: "handled_error",
      payload_ref: error,
      ambient_context_ref: undefined,
      handled_context_ref: Object.freeze({ code: "DATABASE_POOL_FAILED" }),
      cause_chain_codes_ref: Object.freeze(["DATABASE_POOL_FAILED", "3D000"]),
    });

    const [written] = await appendChainedOccurrences([
      materializeDirectOccurrence(envelope),
    ]);
    expect(written).toBeDefined();

    const listener = new pg.Client({
      connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD),
    });
    await listener.connect();
    try {
      const result = await listener.query<{
        cause_chain_codes: unknown;
        frames: unknown;
      }>(`
        SELECT cause_chain_codes, frames
        FROM obs.occurrence WHERE occurrence_id=$1
      `, [written?.occurrence_id]);
      expect(result.rows[0]).toEqual({
        cause_chain_codes: ["DATABASE_POOL_FAILED", "3D000"],
        frames: [
          { kind: "CODE", path: "packages/db/src/index.ts", symbol: "connectPool" },
        ],
      });
      await expect(listener.query(
        "SELECT cause_chain_codes FROM obs.occurrence_detail WHERE occurrence_id=$1",
        [written?.occurrence_id],
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await listener.end();
    }
  });

  it("persists one trace in the delivery transaction before ACK and reuses it across recurrence", async () => {
    const fingerprint = `fix11:trace:${randomUUID()}`;
    const firstOccurrence = await insertTraceOccurrence({
      fingerprint,
      sourceEventRef: `fix11:first:${randomUUID()}`,
      frames: [
        { kind: "CODE", path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" },
      ],
    });
    const generation = createFixagentDeliveryGeneration(
      roleUrl("debateai_obs_listener", LISTENER_PASSWORD),
    );
    await generation.connect();
    try {
      const first = await deliverOccurrence(
        generation,
        firstOccurrence,
        (transaction) => createTransactionTracerHook(transaction, 64),
      );
      expect(first.result).toBe("FOLDED");

      const persisted = await database.pool.query<{
        incident_id: string;
        state: string;
        verdict: string;
        occurrence_id: string;
        evidence: Record<string, unknown>;
        recorded_at: Date;
        acknowledged_at: Date;
      }>(`
        SELECT incident.incident_id, incident.state, trace.verdict, trace.occurrence_id,
          trace.evidence, trace.recorded_at, delivery.occurred_at AS acknowledged_at
        FROM obs.incident AS incident
        JOIN obs.trace AS trace ON trace.incident_id=incident.incident_id
        JOIN obs.delivery AS delivery ON delivery.occurrence_id=trace.occurrence_id
          AND delivery.consumer='fixagent-daemon' AND delivery.delivery_status='ACKED'
        WHERE incident.fingerprint=$1 AND incident.fingerprint_version=1
      `, [fingerprint]);
      expect(persisted.rows).toHaveLength(1);
      expect(persisted.rows[0]).toMatchObject({
        state: "RESEARCHING",
        verdict: "CODE_ROOT",
        occurrence_id: firstOccurrence,
        evidence: {
          evidence_ids: [firstOccurrence],
          visited_path: [firstOccurrence],
          query_count: 1,
          query_bound: 64,
          manifest_versions: {
            redaction_policy_version: "g0",
            allowlist_set_id: "g0-empty-parameters",
          },
        },
      });
      expect(persisted.rows[0]?.recorded_at.getTime())
        .toBeLessThanOrEqual(persisted.rows[0]?.acknowledged_at.getTime() ?? 0);

      const secondOccurrence = await insertTraceOccurrence({
        fingerprint,
        sourceEventRef: `fix11:second:${randomUUID()}`,
        frames: [
          { kind: "CODE", path: "apps/scheduler/src/other.ts", symbol: "otherRoot" },
        ],
      });
      await deliverOccurrence(
        generation,
        secondOccurrence,
        (transaction) => createTransactionTracerHook(transaction, 64),
      );
      await deliverOccurrence(
        generation,
        firstOccurrence,
        (transaction) => createTransactionTracerHook(transaction, 64),
      );

      const counts = await database.pool.query<{ traces: number; acknowledgements: number }>(`
        SELECT
          (SELECT count(*)::int FROM obs.trace WHERE incident_id=$1) AS traces,
          (SELECT count(*)::int FROM obs.delivery
            WHERE occurrence_id IN ($2,$3) AND consumer='fixagent-daemon'
              AND delivery_status='ACKED') AS acknowledgements
      `, [persisted.rows[0]?.incident_id, firstOccurrence, secondOccurrence]);
      expect(counts.rows[0]).toEqual({ traces: 1, acknowledgements: 2 });
    } finally {
      await generation.close();
    }
  });

  it("does not claim a NEW incident when no tracer hook capability is installed", async () => {
    const fingerprint = `fix11:no-hook:${randomUUID()}`;
    const occurrenceId = await insertTraceOccurrence({
      fingerprint,
      sourceEventRef: `fix11:no-hook:${randomUUID()}`,
      frames: [],
    });
    const generation = createFixagentDeliveryGeneration(
      roleUrl("debateai_obs_listener", LISTENER_PASSWORD),
    );
    await generation.connect();
    try {
      await deliverOccurrence(generation, occurrenceId);

      const persisted = await database.pool.query<{
        state: string;
        trace_count: number;
      }>(`
        SELECT incident.state, count(trace.trace_id)::int AS trace_count
        FROM obs.incident AS incident
        LEFT JOIN obs.trace AS trace ON trace.incident_id=incident.incident_id
        WHERE incident.fingerprint=$1 AND incident.fingerprint_version=1
        GROUP BY incident.state
      `, [fingerprint]);

      expect(persisted.rows).toEqual([{ state: "NEW", trace_count: 0 }]);
    } finally {
      await generation.close();
    }
  });

  it("rolls back incident state and ACK when tracing fails", async () => {
    const fingerprint = `fix11:rollback:${randomUUID()}`;
    const occurrenceId = await insertTraceOccurrence({
      fingerprint,
      sourceEventRef: `fix11:rollback:${randomUUID()}`,
      frames: [],
    });
    const generation = createFixagentDeliveryGeneration(
      roleUrl("debateai_obs_listener", LISTENER_PASSWORD),
    );
    await generation.connect();
    try {
      await expect(deliverOccurrence(generation, occurrenceId, () => Object.freeze({
        async onIncidentNew() {
          throw new TypeError("FIX11_TEST_TRACE_FAILURE");
        },
      }))).rejects.toThrow("FIX11_TEST_TRACE_FAILURE");

      const persisted = await database.pool.query<{
        incident_count: number;
        trace_count: number;
        ack_count: number;
      }>(`
        SELECT
          (SELECT count(*)::int FROM obs.incident
            WHERE fingerprint=$1 AND fingerprint_version=1) AS incident_count,
          (SELECT count(*)::int FROM obs.trace
            WHERE occurrence_id=$2) AS trace_count,
          (SELECT count(*)::int FROM obs.delivery
            WHERE occurrence_id=$2 AND consumer='fixagent-daemon'
              AND delivery_status='ACKED') AS ack_count
      `, [fingerprint, occurrenceId]);

      expect(persisted.rows).toEqual([{
        incident_count: 0,
        trace_count: 0,
        ack_count: 0,
      }]);
    } finally {
      await generation.close();
    }
  });
});
