import { spawnSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import * as envelopeContract from "../../packages/obs-capture/src/envelope-contract.js";
import { createSharedRedactor } from "../../packages/obs-capture/src/redactor.js";
import {
  createPostgresCaptureSink,
  type PostgresCaptureSink,
} from "../../packages/obs-capture/src/runtime/sink.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../support/testDatabase.js";

const PARENT_SENTINEL = "CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED";
const SAFE_CHAIN = Object.freeze([
  "OBS_CAPTURE_SELF",
  "3D000",
]);
const WRITER_PASSWORD = "writer-fix02-c3-only";
const { isSerializedSafeEnvelope } = envelopeContract;

let database: TestDatabase;
let sink: PostgresCaptureSink;
let nextRef = 300;

function runPublicRuntimeProbe<T>(program: string): T {
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", program],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
        OBS_FLUSH_DEADLINE_MS: "60000",
        OBS_WRITER_DATABASE_URL: database.connectionString,
        TEST_ADMIN_DATABASE_URL: database.connectionString,
      },
    },
  );

  expect(
    child.status,
    ["stdout=", child.stdout, "\nstderr=", child.stderr].join(""),
  ).toBe(0);
  return JSON.parse(child.stdout.trim()) as T;
}

function sourceEventRef(): string {
  nextRef += 1;
  return `00000000-0000-4000-8000-${String(nextRef).padStart(12, "0")}`;
}

function writerConnectionString(): string {
  const url = new URL(database.connectionString);
  url.username = "debateai_obs_writer";
  url.password = WRITER_PASSWORD;
  return url.toString();
}

function envelope(options: {
  readonly sourceEventRef?: string;
  readonly chain?: readonly string[];
}) {
  const ref = options.sourceEventRef ?? sourceEventRef();
  const chain = Object.freeze([...(options.chain ?? SAFE_CHAIN)]);
  const base = createSharedRedactor({
    environment: "test",
    build_ref: "UNTRACKED-DEV:fix02-c3:storage",
    build_dirty: true,
    runtime: "scheduler",
    component: Object.freeze({
      process: "scheduler",
      package: "@debateai/scheduler",
    }),
    writer_identity: "fix02-c3-storage-test",
    redaction_policy_version: "g0",
    allowlist_set_id: "g0-empty-parameters",
    now: () => new Date("2026-09-04T00:00:00.000Z"),
    sourceEventRef: () => ref,
  }).redact({
    kind: "envelope",
    payload_ref: Object.freeze({
      code: "OBS_CAPTURE_SELF",
      taxonomy_class: "CAPTURE_SELF",
      capture_point: "self",
      disposition: "SELF",
      source: "first_party",
    }),
    ambient_context_ref: undefined,
  });

  return Object.freeze({
    ...base,
    parent_occurrence_ref: chain.length === 0
      ? "NO_CAUSE"
      : PARENT_SENTINEL,
    cause_relation: chain.length === 0 ? null : "WRAPS",
    cause_chain_codes: chain,
  }) as typeof base & Readonly<{
    readonly parent_occurrence_ref:
      | "NO_CAUSE"
      | "CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED";
    readonly cause_relation: null | "WRAPS";
    readonly cause_chain_codes: readonly string[];
  }>;
}

async function storedCounts(ref: string): Promise<Readonly<{
  occurrences: number;
  details: number;
  receipts: number;
}>> {
  const result = await database.pool.query<{
    occurrences: string;
    details: string;
    receipts: string;
  }>(
    `SELECT
       count(DISTINCT o.occurrence_id)::text AS occurrences,
       count(DISTINCT d.occurrence_detail_id)::text AS details,
       count(DISTINCT r.spool_receipt_id)::text AS receipts
     FROM obs.occurrence AS o
     LEFT JOIN obs.occurrence_detail AS d
       ON d.occurrence_id = o.occurrence_id
     LEFT JOIN obs.spool_receipt AS r
       ON r.occurrence_id = o.occurrence_id
     WHERE o.source = 'first_party' AND o.source_event_ref = $1`,
    [ref],
  );
  const row = result.rows[0]!;
  return Object.freeze({
    occurrences: Number(row.occurrences),
    details: Number(row.details),
    receipts: Number(row.receipts),
  });
}

async function storedCauseProjection(ref: string): Promise<Readonly<{
  parent_occurrence_ref: string;
  cause_relation: string | null;
  cause_chain_codes: readonly string[] | null;
}>> {
  const result = await database.pool.query<{
    parent_occurrence_ref: string;
    cause_relation: string | null;
    cause_chain_codes: readonly string[] | null;
  }>(
    `SELECT o.parent_occurrence_ref, o.cause_relation, d.cause_chain_codes
       FROM obs.occurrence AS o
       LEFT JOIN obs.occurrence_detail AS d
         ON d.occurrence_id = o.occurrence_id
      WHERE o.source = 'first_party' AND o.source_event_ref = $1`,
    [ref],
  );
  expect(result.rows).toHaveLength(1);
  return result.rows[0]!;
}

function serializedNormalizer():
  | ((value: unknown, runtime: "scheduler") => ReturnType<typeof envelope>)
  | undefined {
  const candidate = Reflect.get(
    envelopeContract,
    "normalizeSerializedSafeEnvelope",
  ) as unknown;
  return typeof candidate === "function"
    ? candidate as (
        value: unknown,
        runtime: "scheduler",
      ) => ReturnType<typeof envelope>
    : undefined;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await database.pool.query(
    "SELECT set_config('debateai.obs_writer_password', $1, false)",
    [WRITER_PASSWORD],
  );
  await migrate(database.pool);
  sink = createPostgresCaptureSink({
    connectionString: database.connectionString,
  });
}, 120_000);

afterAll(async () => {
  await sink?.close();
  await database?.stop();
});

describe("FIX-02 C3 occurrence detail storage", () => {
  it("inserts one direct detail only for a nonempty safe chain", async () => {
    const chained = envelope({});
    const empty = envelope({ chain: [] });

    await sink.writeOccurrences([chained, empty]);

    expect(await storedCounts(chained.source_event_ref)).toEqual({
      occurrences: 1,
      details: 1,
      receipts: 0,
    });
    expect(await storedCounts(empty.source_event_ref)).toEqual({
      occurrences: 1,
      details: 0,
      receipts: 0,
    });
    const detail = await database.pool.query<{
      normalized_frames: readonly unknown[];
      cause_chain_codes: readonly string[];
      template_parameters: Readonly<Record<string, unknown>>;
    }>(
      `SELECT d.normalized_frames, d.cause_chain_codes, d.template_parameters
         FROM obs.occurrence AS o
         JOIN obs.occurrence_detail AS d ON d.occurrence_id = o.occurrence_id
        WHERE o.source = $1 AND o.source_event_ref = $2`,
      [chained.source, chained.source_event_ref],
    );
    expect(detail.rows).toEqual([{
      normalized_frames: [],
      cause_chain_codes: ["OBS_CAPTURE_SELF", "3D000"],
      template_parameters: {},
    }]);
  });

  it("persists detail through the INSERT-only writer role", async () => {
    const writerSink = createPostgresCaptureSink({
      connectionString: writerConnectionString(),
    });
    const chained = envelope({});
    try {
      await writerSink.writeOccurrences([chained]);
    } finally {
      await writerSink.close();
    }

    expect(await storedCounts(chained.source_event_ref)).toEqual({
      occurrences: 1,
      details: 1,
      receipts: 0,
    });
  });

  it("keeps direct insertion idempotent and never backfills a conflict", async () => {
    const sameBatch = envelope({});
    await sink.writeOccurrences([sameBatch, sameBatch]);
    expect(await storedCounts(sameBatch.source_event_ref)).toEqual({
      occurrences: 1,
      details: 1,
      receipts: 0,
    });

    const repeated = envelope({});
    await sink.writeOccurrences([repeated]);
    await sink.writeOccurrences([repeated]);

    expect(await storedCounts(repeated.source_event_ref)).toEqual({
      occurrences: 1,
      details: 1,
      receipts: 0,
    });

    const conflictRef = sourceEventRef();
    await sink.writeOccurrences([envelope({
      sourceEventRef: conflictRef,
      chain: [],
    })]);
    await sink.writeOccurrences([envelope({ sourceEventRef: conflictRef })]);

    expect(await storedCounts(conflictRef)).toEqual({
      occurrences: 1,
      details: 0,
      receipts: 0,
    });
  });

  it("binds mixed empty and nonempty duplicates to the first input", async () => {
    for (const [firstChain, secondChain] of [
      [Object.freeze([]), SAFE_CHAIN],
      [SAFE_CHAIN, Object.freeze([])],
    ] as const) {
      const ref = sourceEventRef();

      await sink.writeOccurrences([
        envelope({ sourceEventRef: ref, chain: firstChain }),
        envelope({ sourceEventRef: ref, chain: secondChain }),
      ]);

      expect(await storedCauseProjection(ref)).toEqual(firstChain.length === 0
        ? {
            parent_occurrence_ref: "NO_CAUSE",
            cause_relation: null,
            cause_chain_codes: null,
          }
        : {
            parent_occurrence_ref: PARENT_SENTINEL,
            cause_relation: "WRAPS",
            cause_chain_codes: firstChain,
          });
    }
  });

  it("binds distinct nonempty duplicate chains to the first input", async () => {
    const databaseChain = Object.freeze([
      "OBS_CAPTURE_SELF",
      "DATABASE_POOL_FAILED",
      "3D000",
    ]);
    for (const [firstChain, secondChain] of [
      [SAFE_CHAIN, databaseChain],
      [databaseChain, SAFE_CHAIN],
    ] as const) {
      const ref = sourceEventRef();

      await sink.writeOccurrences([
        envelope({ sourceEventRef: ref, chain: firstChain }),
        envelope({ sourceEventRef: ref, chain: secondChain }),
      ]);

      expect(await storedCauseProjection(ref)).toEqual({
        parent_occurrence_ref: PARENT_SENTINEL,
        cause_relation: "WRAPS",
        cause_chain_codes: firstChain,
      });
    }
  });

  it("submits only one occurrence candidate per duplicate event key", async () => {
    const ref = sourceEventRef();
    await database.pool.query(`
      CREATE TABLE public.fix02_c3_candidate_probe (attempts integer NOT NULL);
      INSERT INTO public.fix02_c3_candidate_probe VALUES (0);
      CREATE FUNCTION public.fix02_c3_count_candidate()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE public.fix02_c3_candidate_probe SET attempts = attempts + 1;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fix02_c3_count_candidate
      BEFORE INSERT ON obs.occurrence
      FOR EACH ROW EXECUTE FUNCTION public.fix02_c3_count_candidate();
    `);
    try {
      await sink.writeOccurrences([
        envelope({ sourceEventRef: ref, chain: [] }),
        envelope({ sourceEventRef: ref, chain: SAFE_CHAIN }),
      ]);
      const attempts = await database.pool.query<{ attempts: number }>(
        "SELECT attempts FROM public.fix02_c3_candidate_probe",
      );

      expect(attempts.rows).toEqual([{ attempts: 1 }]);
    } finally {
      await database.pool.query(`
        DROP TRIGGER fix02_c3_count_candidate ON obs.occurrence;
        DROP FUNCTION public.fix02_c3_count_candidate();
        DROP TABLE public.fix02_c3_candidate_probe;
      `);
    }
  });

  it("inserts detail and receipt atomically on the spooled path", async () => {
    const spooled = envelope({});

    await sink.ingestSpooledOccurrence(spooled);
    await sink.ingestSpooledOccurrence(spooled);

    expect(await storedCounts(spooled.source_event_ref)).toEqual({
      occurrences: 1,
      details: 1,
      receipts: 1,
    });
  });

  it("normalizes a legacy serialized record before spooled sink use", async () => {
    const modern = envelope({ chain: [] });
    const legacy = JSON.parse(JSON.stringify(modern)) as Record<string, unknown>;
    delete legacy.cause_chain_codes;

    const normalize = serializedNormalizer();
    expect(normalize).toBeTypeOf("function");
    if (normalize === undefined) return;
    const normalized = normalize(legacy, "scheduler");

    expect(isSerializedSafeEnvelope(legacy, "scheduler")).toBe(true);
    expect(normalized?.cause_chain_codes).toEqual([]);
    expect(Object.isFrozen(normalized?.cause_chain_codes)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(
      legacy,
      "cause_chain_codes",
    )).toBe(false);
    await sink.ingestSpooledOccurrence(normalized!);

    expect(await storedCounts(modern.source_event_ref)).toEqual({
      occurrences: 1,
      details: 0,
      receipts: 1,
    });
  });

  it("rejects accessor-backed serialized code before any database write", async () => {
    const safe = envelope({});
    const hostile = JSON.parse(JSON.stringify(safe)) as Record<string, unknown>;
    let calls = 0;
    Object.defineProperty(hostile, "code", {
      configurable: true,
      enumerable: true,
      get() {
        calls += 1;
        return calls <= 6
          ? "OBS_CAPTURE_SELF"
          : "PLANTED_SERIALIZED_CODE_SECRET";
      },
    });

    const accepted = isSerializedSafeEnvelope(hostile, "scheduler");
    if (accepted) {
      await sink.writeOccurrences([hostile as unknown as typeof safe]);
    }
    const stored = await database.pool.query<{ projection: string }>(
      `SELECT to_jsonb(o)::text AS projection
         FROM obs.occurrence AS o
        WHERE o.source = 'first_party' AND o.source_event_ref = $1`,
      [safe.source_event_ref],
    );

    expect(accepted).toBe(false);
    expect(calls).toBe(0);
    expect(stored.rows).toEqual([]);
    expect(JSON.stringify(stored.rows)).not.toContain(
      "PLANTED_SERIALIZED_CODE_SECRET",
    );
  });

  it("adds neither detail nor receipt for a pre-existing spooled conflict", async () => {
    const conflictRef = sourceEventRef();
    await sink.writeOccurrences([envelope({
      sourceEventRef: conflictRef,
      chain: [],
    })]);

    await sink.ingestSpooledOccurrence(envelope({
      sourceEventRef: conflictRef,
    }));

    expect(await storedCounts(conflictRef)).toEqual({
      occurrences: 1,
      details: 0,
      receipts: 0,
    });
  });

  it("rolls back direct and spooled occurrences when detail insertion fails", async () => {
    const direct = envelope({});
    const spooled = envelope({});
    await database.pool.query(`
      CREATE FUNCTION public.fix02_c3_reject_detail()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'FIX02_C3_DETAIL_WRITE_FAILURE';
      END;
      $$;
      CREATE TRIGGER fix02_c3_reject_detail
      BEFORE INSERT ON obs.occurrence_detail
      FOR EACH ROW EXECUTE FUNCTION public.fix02_c3_reject_detail();
    `);
    try {
      await expect(sink.writeOccurrences([direct])).rejects.toThrow(
        /FIX02_C3_DETAIL_WRITE_FAILURE/u,
      );
      await expect(sink.ingestSpooledOccurrence(spooled)).rejects.toThrow(
        /FIX02_C3_DETAIL_WRITE_FAILURE/u,
      );
      expect(await storedCounts(direct.source_event_ref)).toEqual({
        occurrences: 0,
        details: 0,
        receipts: 0,
      });
      expect(await storedCounts(spooled.source_event_ref)).toEqual({
        occurrences: 0,
        details: 0,
        receipts: 0,
      });
    } finally {
      await database.pool.query(`
        DROP TRIGGER fix02_c3_reject_detail ON obs.occurrence_detail;
        DROP FUNCTION public.fix02_c3_reject_detail();
      `);
    }
  });

  it("stores no planted database, message, stack, or credential text", async () => {
    const safe = envelope({});
    await sink.writeOccurrences([safe]);

    const stored = await database.pool.query<{ projection: string }>(
      `SELECT (to_jsonb(o) || jsonb_build_object(
         'detail', coalesce(to_jsonb(d), '{}'::jsonb)
       ))::text AS projection
       FROM obs.occurrence AS o
       LEFT JOIN obs.occurrence_detail AS d ON d.occurrence_id = o.occurrence_id
       WHERE o.source = $1 AND o.source_event_ref = $2`,
      [safe.source, safe.source_event_ref],
    );
    const projection = stored.rows[0]!.projection;

    expect(projection).not.toContain("no_such_database");
    expect(projection).not.toContain("PLANTED_MESSAGE_SECRET");
    expect(projection).not.toContain("PLANTED_STACK_SECRET");
    expect(projection).not.toContain("planted-password");
  });

  it("stores the newest relevant scheduler wrapper chain, not the latest global row", async () => {
    const before = await database.pool.query<{ max_seq: string }>(
      "SELECT coalesce(max(occ_seq), 0)::text AS max_seq FROM obs.occurrence",
    );
    const beforeSequence = before.rows[0]?.max_seq ?? "0";
    const proof = runPublicRuntimeProbe<{ readonly caughtCode: string }>([
      'import { createPool } from "@debateai/db";',
      'import { startCaptureRuntime, stopCaptureRuntime } from "@debateai/obs-capture/runtime";',
      'import { runJobWithLifecycle } from "./apps/scheduler/src/index.ts";',
      "const missing = new URL(process.env.TEST_ADMIN_DATABASE_URL);",
      "missing.pathname = '/no_such_database_PLANTED_DB_SECRET';",
      "const pool = createPool(missing.toString());",
      "let caughtCode = '';",
      "await startCaptureRuntime({ runtime: 'scheduler', spoolFd: undefined, installExitSink() {} });",
      "try {",
      "  await runJobWithLifecycle('replay-self-test', async () => {",
      "    const client = await pool.connect();",
      "    client.release();",
      "    return { checked: 0, evicted: [] };",
      "  });",
      "} catch (error) {",
      "  caughtCode = Object.getOwnPropertyDescriptor(error, 'code')?.value ?? '';",
      "}",
      "await pool.end();",
      "await stopCaptureRuntime({ deadlineMs: 5000 });",
      "process.stdout.write(JSON.stringify({ caughtCode }));",
    ].join("\n"));
    expect(proof).toEqual({ caughtCode: "DATABASE_POOL_FAILED" });
    await sink.writeOccurrences([envelope({ chain: [] })]);

    const newestRelevant = await database.pool.query<{
      occ_seq: string;
      code: string;
      cause_relation: string | null;
      parent_occurrence_ref: string;
      cause_chain_codes: readonly string[];
      projection: string;
    }>(
      `WITH newest_relevant AS (
         SELECT occurrence_id
          FROM obs.occurrence
          WHERE occ_seq > $1::bigint
            AND code = 'OBS_SCHEDULER_JOB_FAILED'
          ORDER BY occ_seq DESC
          LIMIT 1
       )
       SELECT o.occ_seq::text, o.code, o.cause_relation,
              o.parent_occurrence_ref, d.cause_chain_codes,
              (to_jsonb(o) || jsonb_build_object('detail', to_jsonb(d)))::text AS projection
         FROM newest_relevant AS newest
         JOIN obs.occurrence AS o USING (occurrence_id)
         JOIN obs.occurrence_detail AS d USING (occurrence_id)`,
      [beforeSequence],
    );
    expect(newestRelevant.rows).toHaveLength(1);
    expect(newestRelevant.rows[0]).toMatchObject({
      code: "OBS_SCHEDULER_JOB_FAILED",
      cause_relation: "WRAPS",
      parent_occurrence_ref: PARENT_SENTINEL,
      cause_chain_codes: [
        "OBS_SCHEDULER_JOB_FAILED",
        "DATABASE_POOL_FAILED",
        "3D000",
      ],
    });
    expect(newestRelevant.rows[0]!.projection).not.toContain(
      "no_such_database_PLANTED_DB_SECRET",
    );
    expect(newestRelevant.rows[0]!.projection).not.toContain("password");
    expect(newestRelevant.rows[0]!.projection).not.toContain("stack");
    expect(newestRelevant.rows[0]!.projection).not.toContain("message");

    const latestGlobal = await database.pool.query<{
      occ_seq: string;
      code: string;
    }>(
      `SELECT occ_seq::text, code
         FROM obs.occurrence
        WHERE occ_seq > $1::bigint
        ORDER BY occ_seq DESC
        LIMIT 1`,
      [beforeSequence],
    );
    expect(latestGlobal.rows).toHaveLength(1);
    expect(latestGlobal.rows[0]!.code).toBe("OBS_CAPTURE_SELF");
    expect(BigInt(latestGlobal.rows[0]!.occ_seq)).toBeGreaterThan(
      BigInt(newestRelevant.rows[0]!.occ_seq),
    );
  });
});
