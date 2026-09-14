import { spawnSync } from "node:child_process";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../support/testDatabase.js";

vi.mock("@debateai/kernel", async () =>
  import("../../packages/kernel/src/index.js"),
);
vi.mock("@debateai/crypto", async () =>
  import("../../packages/crypto/src/index.js"),
);
vi.mock("@debateai/db", async () =>
  import("../../packages/db/src/index.js"),
);
vi.mock("@debateai/register", async () =>
  import("../../packages/register/src/index.js"),
);

const ROLE_PASSWORDS = Object.freeze({
  debateai_obs_writer: "writer-fix01-c2-only",
  debateai_obs_human: "human-fix01-c2-only",
});

let database: TestDatabase;

function roleConnectionString(
  role: keyof typeof ROLE_PASSWORDS,
): string {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = ROLE_PASSWORDS[role];
  return url.toString();
}

function runPublicRuntimeProbe<T>(
  program: string,
  environment: Readonly<Record<string, string>> = {},
): T {
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
        OBS_WRITER_DATABASE_URL: roleConnectionString(
          "debateai_obs_writer",
        ),
        TEST_ADMIN_DATABASE_URL: database.connectionString,
        ...environment,
      },
    },
  );

  expect(
    child.status,
    ["stdout=", child.stdout, "\nstderr=", child.stderr].join(""),
  ).toBe(0);
  return JSON.parse(child.stdout.trim()) as T;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await database.pool.query(
    "SELECT set_config('debateai.obs_writer_password', $1, false)",
    [ROLE_PASSWORDS.debateai_obs_writer],
  );
  await database.pool.query(
    "SELECT set_config('debateai.obs_human_password', $1, false)",
    [ROLE_PASSWORDS.debateai_obs_human],
  );
  await migrate(database.pool);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

describe.sequential("FIX-01 C2 public runtime database path", () => {
  it("joins concurrent startup during stop and never arms a timer after stop", () => {
    const proof = runPublicRuntimeProbe<{
      readonly resolved: boolean;
      readonly scheduled: number;
      readonly cleared: number;
    }>([
      'import { startCaptureRuntime, stopCaptureRuntime } from "@debateai/obs-capture/runtime";',
      "let scheduled = 0;",
      "let cleared = 0;",
      "globalThis.setInterval = () => { scheduled += 1; return { unref() {} }; };",
      "globalThis.clearInterval = () => { cleared += 1; };",
      "const starting = startCaptureRuntime({ runtime: 'scheduler', spoolFd: undefined, installExitSink() {} });",
      "const stopping = stopCaptureRuntime({ deadlineMs: 100 });",
      "await Promise.all([starting, stopping]);",
      "process.stdout.write(JSON.stringify({ resolved: true, scheduled, cleared }));",
    ].join("\n"), {
      OBS_WRITER_DATABASE_URL: "",
    });

    expect(proof).toEqual({ resolved: true, scheduled: 0, cleared: 0 });
  });

  it("preserves writer grants and mutation triggers across migration 0061", async () => {
    const snapshot = async () => ({
      grants: (await database.pool.query(
        `SELECT grantee, privilege_type, is_grantable
           FROM information_schema.role_table_grants
          WHERE table_schema = 'obs' AND table_name = 'occurrence'
          ORDER BY grantee, privilege_type, is_grantable`,
      )).rows,
      triggers: (await database.pool.query(
        `SELECT tgname, pg_get_triggerdef(oid) AS definition
           FROM pg_trigger
          WHERE tgrelid = 'obs.occurrence'::regclass AND NOT tgisinternal
          ORDER BY tgname`,
      )).rows,
    });
    await database.pool.query(`
      ALTER TABLE obs.occurrence
        DROP CONSTRAINT occurrence_taxonomy_class_check,
        ADD CONSTRAINT occurrence_taxonomy_class_check CHECK (taxonomy_class IN (
          'PROCESS_DEATH', 'HTTP_FAILURE', 'JOB_FAILURE', 'PROVIDER_EXHAUSTED', 'DB_FAILURE',
          'PARSE_SCHEMA_FAILURE', 'STALL_DETECTED', 'SILENT_NOOP', 'SUSPICIOUS_SUCCESS',
          'CLIENT_FAILURE', 'CAPTURE_SELF', 'ORIGIN_UNKNOWN'
        ))
    `);
    const before = await snapshot();
    const migration = readFileSync(
      new URL("../../migrations/0061_obs_job_lifecycle_taxonomy.sql", import.meta.url),
      "utf8",
    );

    await database.pool.query(migration);

    expect(await snapshot()).toEqual(before);
  });

  it("persists ordered scheduler lifecycle pairs with stable failure identity", async () => {
    const before = await database.pool.query<{ max_seq: string }>(
      "SELECT coalesce(max(occ_seq), 0)::text AS max_seq FROM obs.occurrence",
    );
    const beforeSequence = before.rows[0]?.max_seq ?? "0";

    const proof = runPublicRuntimeProbe<{ readonly sameError: boolean }>([
      'import { runJobWithLifecycle } from "./apps/scheduler/src/index.ts";',
      'import { emit } from "@debateai/obs-capture";',
      'import { startCaptureRuntime, stopCaptureRuntime } from "@debateai/obs-capture/runtime";',
      "await startCaptureRuntime({ runtime: 'scheduler', spoolFd: undefined, installExitSink() {} });",
      "const planted = Object.freeze({ message: 'PLANTED-C5-DB-ERROR', secret: 'postgres://secret' });",
      "let sameError = true;",
      "for (let index = 0; index < 2; index += 1) {",
      "  try { await runJobWithLifecycle('replay-self-test', async () => { throw planted; }); }",
      "  catch (error) { sameError = sameError && error === planted; }",
      "}",
      "emit({ code: 'OBS_CAPTURE_SELF', taxonomy_class: 'CAPTURE_SELF', capture_point: 'self', disposition: 'SELF', source: 'first_party' });",
      "await stopCaptureRuntime({ deadlineMs: 5000 });",
      "process.stdout.write(JSON.stringify({ sameError }));",
    ].join("\n"));
    expect(proof.sameError).toBe(true);

    const rows = await database.pool.query<{
      code: string;
      taxonomy_class: string;
      severity: string;
      disposition: string;
      fingerprint: string;
      template_parameters: Readonly<Record<string, unknown>>;
      run_ref: string;
      work_item_ref: string;
      node_ref: string;
      attempt_ref: string;
      ledger_ref: string;
    }>(
      `SELECT code, taxonomy_class, severity, disposition, fingerprint,
              template_parameters, run_ref, work_item_ref, node_ref,
              attempt_ref, ledger_ref
        FROM obs.occurrence
        WHERE occ_seq > $1::bigint
          AND code = ANY($2::text[])
        ORDER BY occ_seq`,
      [
        beforeSequence,
        [
          "OBS_SCHEDULER_JOB_STARTED",
          "OBS_SCHEDULER_JOB_SUCCEEDED",
          "OBS_SCHEDULER_JOB_FAILED",
          "OBS_SCHEDULER_JOB_NOOP",
        ],
      ],
    );

    expect(rows.rows.map((row) => row.code)).toEqual([
      "OBS_SCHEDULER_JOB_STARTED",
      "OBS_SCHEDULER_JOB_FAILED",
      "OBS_SCHEDULER_JOB_STARTED",
      "OBS_SCHEDULER_JOB_FAILED",
    ]);
    const independent = await database.pool.query<{ code: string }>(
      `SELECT code FROM obs.occurrence
        WHERE occ_seq > $1::bigint AND code = 'OBS_CAPTURE_SELF'`,
      [beforeSequence],
    );
    expect(independent.rows).toEqual([{ code: "OBS_CAPTURE_SELF" }]);
    expect(rows.rows.filter((row) => row.code === "OBS_SCHEDULER_JOB_FAILED"))
      .toHaveLength(2);
    expect(new Set(rows.rows.map((row) => row.fingerprint)).size).toBe(2);
    expect(new Set(rows.rows
      .filter((row) => row.code === "OBS_SCHEDULER_JOB_FAILED")
      .map((row) => row.fingerprint)).size).toBe(1);
    for (const row of rows.rows) {
      expect(row.template_parameters).toEqual({ job: "replay-self-test" });
      expect([
        row.run_ref,
        row.work_item_ref,
        row.node_ref,
        row.attempt_ref,
        row.ledger_ref,
      ]).toEqual(Array.from({ length: 5 }, () => "NOT_APPLICABLE"));
      expect(JSON.stringify(row)).not.toContain("PLANTED-C5-DB-ERROR");
      expect(JSON.stringify(row)).not.toContain("postgres://secret");
    }
    expect(rows.rows[0]).toMatchObject({
      taxonomy_class: "JOB_LIFECYCLE",
      severity: "INFO",
      disposition: "DETECTED",
    });
    expect(rows.rows[1]).toMatchObject({
      taxonomy_class: "JOB_FAILURE",
      severity: "SEVERE",
      disposition: "THROWN",
    });
  });

  it("spools only the two lifecycle rows when the writer database is unavailable", () => {
    const directory = mkdtempSync(join(tmpdir(), "fix01-c5-lifecycle-spool-"));
    const spoolPath = join(directory, "scheduler-lifecycle.spool");
    const fd = openSync(spoolPath, "a+");
    closeSync(fd);

    try {
      const proof = runPublicRuntimeProbe<{ readonly sameError: boolean }>([
        'import { closeSync, openSync } from "node:fs";',
        'import { runJobWithLifecycle } from "./apps/scheduler/src/index.ts";',
        'import { startCaptureRuntime, stopCaptureRuntime } from "@debateai/obs-capture/runtime";',
        "const fd = openSync(process.env.TEST_SPOOL_PATH, 'a+');",
        "await startCaptureRuntime({ runtime: 'scheduler', spoolFd: fd, installExitSink() {} });",
        "const planted = Object.freeze({ message: 'PLANTED-C5-SPOOL-ERROR', dsn: 'postgres://secret' });",
        "let sameError = false;",
        "try { await runJobWithLifecycle('liveness-sweep', async () => { throw planted; }); }",
        "catch (error) { sameError = error === planted; }",
        "await stopCaptureRuntime({ deadlineMs: 5000 });",
        "closeSync(fd);",
        "process.stdout.write(JSON.stringify({ sameError }));",
      ].join("\n"), {
        OBS_WRITER_DATABASE_URL: "",
        TEST_SPOOL_PATH: spoolPath,
      });
      expect(proof.sameError).toBe(true);

      const lines = readFileSync(spoolPath, "utf8")
        .split("\n")
        .filter((line) => line.length > 0);
      expect(lines.map((line) => JSON.parse(line).code)).toEqual([
        "OBS_SCHEDULER_JOB_STARTED",
        "OBS_SCHEDULER_JOB_FAILED",
      ]);
      expect(lines.join("\n")).not.toContain("PLANTED-C5-SPOOL-ERROR");
      expect(lines.join("\n")).not.toContain("postgres://secret");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps the migrated taxonomy closed after adding JOB_LIFECYCLE", async () => {
    const definition = await database.pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = 'obs.occurrence'::regclass
          AND conname = 'occurrence_taxonomy_class_check'`,
    );
    expect(definition.rows).toHaveLength(1);
    expect(definition.rows[0]?.definition).toContain("JOB_LIFECYCLE");
    expect(definition.rows[0]?.definition).not.toContain("UNKNOWN_TAXONOMY");

    const inserted = await database.pool.query<{ taxonomy_class: string }>(
      `INSERT INTO obs.occurrence (
         occurred_at, environment, build_ref, build_dirty, runtime, component,
         capture_point, code, taxonomy_class, severity, disposition, fingerprint,
         fingerprint_version, redaction_policy_version, allowlist_set_id,
         fallback_minimized, capture_status, run_ref, work_item_ref, node_ref,
         attempt_ref, ledger_ref, parent_occurrence_ref, at_seq_watermark,
         frames, safe_template_id, template_parameters, source, source_event_ref,
         zone_context, writer_identity
       )
       SELECT occurred_at, environment, build_ref, build_dirty, runtime, component,
              capture_point, code, 'JOB_LIFECYCLE', severity, disposition,
              fingerprint, fingerprint_version, redaction_policy_version,
              allowlist_set_id, fallback_minimized, capture_status, run_ref,
              work_item_ref, node_ref, attempt_ref, ledger_ref,
              parent_occurrence_ref, at_seq_watermark, frames, safe_template_id,
              template_parameters, source, gen_random_uuid()::text,
              zone_context, writer_identity
         FROM obs.occurrence
        LIMIT 1
       RETURNING taxonomy_class`,
    );
    expect(inserted.rows).toEqual([{ taxonomy_class: "JOB_LIFECYCLE" }]);

    await expect(database.pool.query(
      `INSERT INTO obs.occurrence (
         occurred_at, environment, build_ref, build_dirty, runtime, component,
         capture_point, code, taxonomy_class, severity, disposition, fingerprint,
         fingerprint_version, redaction_policy_version, allowlist_set_id,
         fallback_minimized, capture_status, run_ref, work_item_ref, node_ref,
         attempt_ref, ledger_ref, parent_occurrence_ref, at_seq_watermark,
         frames, safe_template_id, template_parameters, source, source_event_ref,
         zone_context, writer_identity
       )
       SELECT occurred_at, environment, build_ref, build_dirty, runtime, component,
              capture_point, code, 'UNKNOWN_TAXONOMY', severity, disposition,
              fingerprint, fingerprint_version, redaction_policy_version,
              allowlist_set_id, fallback_minimized, capture_status, run_ref,
              work_item_ref, node_ref, attempt_ref, ledger_ref,
              parent_occurrence_ref, at_seq_watermark, frames, safe_template_id,
              template_parameters, source, gen_random_uuid()::text,
              zone_context, writer_identity
         FROM obs.occurrence
        LIMIT 1`,
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("persists two occurrences with one fingerprint through the writer role and keeps that role append-only", async () => {
    const before = await database.pool.query<{ max_seq: string }>(
      "SELECT coalesce(max(occ_seq), 0)::text AS max_seq FROM obs.occurrence",
    );
    const beforeSequence = before.rows[0]?.max_seq ?? "0";

    runPublicRuntimeProbe<unknown>([
      'import { emit } from "@debateai/obs-capture";',
      'import { startCaptureRuntime, stopCaptureRuntime } from "@debateai/obs-capture/runtime";',
      "await startCaptureRuntime({ runtime: 'scheduler', spoolFd: undefined, installExitSink() {} });",
      "const envelope = { code: 'CALL_BUDGET_EXHAUSTED', taxonomy_class: 'PROVIDER_EXHAUSTED', capture_point: 'job', disposition: 'THROWN' };",
      "emit(envelope);",
      "emit(envelope);",
      "await stopCaptureRuntime({ deadlineMs: 5000 });",
      "process.stdout.write(JSON.stringify({ stopped: true }));",
    ].join("\n"));

    const rows = await database.pool.query<{
      runtime: string;
      capture_point: string;
      capture_status: string;
      fingerprint: string;
      fallback_minimized: boolean;
    }>(
      `SELECT runtime, capture_point, capture_status, fingerprint,
              fallback_minimized
         FROM obs.occurrence
        WHERE occ_seq > $1::bigint
        ORDER BY occ_seq`,
      [beforeSequence],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows).toEqual([
      expect.objectContaining({
        runtime: "scheduler",
        capture_point: "job",
        capture_status: "PERSISTED",
        fallback_minimized: false,
      }),
      expect.objectContaining({
        runtime: "scheduler",
        capture_point: "job",
        capture_status: "PERSISTED",
        fallback_minimized: false,
      }),
    ]);
    expect(new Set(rows.rows.map((row) => row.fingerprint)).size).toBe(1);

    const writerPool = new pg.Pool({
      connectionString: roleConnectionString("debateai_obs_writer"),
      max: 1,
    });
    try {
      await expect(writerPool.query("SELECT 1 FROM core.run LIMIT 1"))
        .rejects.toMatchObject({ code: "42501" });
      await expect(
        writerPool.query("UPDATE obs.occurrence SET code = 'x'"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await writerPool.end();
    }
  });

  it("fails closed to a post-redaction spool when configured with the human role", () => {
    const directory = mkdtempSync(join(tmpdir(), "fix01-c2-human-spool-"));
    const spoolPath = join(directory, "scheduler-test.spool");
    const fd = openSync(spoolPath, "a+");
    closeSync(fd);

    try {
      runPublicRuntimeProbe<unknown>([
        'import { closeSync, openSync } from "node:fs";',
        'import { emit } from "@debateai/obs-capture";',
        'import { startCaptureRuntime, stopCaptureRuntime } from "@debateai/obs-capture/runtime";',
        "const fd = openSync(process.env.TEST_SPOOL_PATH, 'a+');",
        "await startCaptureRuntime({ runtime: 'scheduler', spoolFd: fd, installExitSink() {} });",
        "emit({ code: 'CALL_BUDGET_EXHAUSTED', taxonomy_class: 'PROVIDER_EXHAUSTED', capture_point: 'job', disposition: 'THROWN', message: 'PLANTED-C2-SECRET' });",
        "await stopCaptureRuntime({ deadlineMs: 5000 });",
        "closeSync(fd);",
        "process.stdout.write(JSON.stringify({ stopped: true }));",
      ].join("\n"), {
        OBS_WRITER_DATABASE_URL: roleConnectionString("debateai_obs_human"),
        TEST_SPOOL_PATH: spoolPath,
      });

      const lines = readFileSync(spoolPath, "utf8")
        .split("\n")
        .filter((line) => line.length > 0);
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0] ?? "{}"))
        .toMatchObject({ code: "OBS_CAPTURE_SELF", fallback_minimized: true });
      expect(lines[0]).not.toContain("PLANTED-C2-SECRET");
      expect(lines[0]).not.toContain(ROLE_PASSWORDS.debateai_obs_human);
      expect(lines[0]).not.toContain("password=");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("writes one exact 37-loss gap row on the first flush when the new queue is empty", () => {
    const proof = runPublicRuntimeProbe<{
      readonly before: number;
      readonly afterStart: number;
      readonly row: {
        readonly source: string;
        readonly gap_class: string;
        readonly lost_count: number;
      } | undefined;
    }>([
      'import pg from "pg";',
      'import { emit } from "@debateai/obs-capture";',
      'import { startCaptureRuntime, stopCaptureRuntime } from "@debateai/obs-capture/runtime";',
      "const observer = new pg.Pool({ connectionString: process.env.TEST_ADMIN_DATABASE_URL, max: 1 });",
      "const before = Number((await observer.query('SELECT count(*)::int AS count FROM obs.capture_gap')).rows[0].count);",
      "for (let index = 0; index < 37; index += 1) emit({ index });",
      "await startCaptureRuntime({ runtime: 'scheduler', spoolFd: undefined, installExitSink() {} });",
      "const after = await observer.query(`SELECT source, gap_class, lost_count::int AS lost_count FROM obs.capture_gap ORDER BY opened_at DESC LIMIT 1`);",
      "const afterStart = Number((await observer.query('SELECT count(*)::int AS count FROM obs.capture_gap')).rows[0].count);",
      "await stopCaptureRuntime({ deadlineMs: 5000 });",
      "await observer.end();",
      "process.stdout.write(JSON.stringify({ before, afterStart, row: after.rows[0] }));",
    ].join("\n"));

    expect(proof.afterStart - proof.before).toBe(1);
    expect(proof.row).toMatchObject({
      source: "first_party",
      gap_class: "QUEUE_FULL",
      lost_count: 37,
    });
  });

  it("keeps a rejected 37-loss gap pending for the next public flush and writes it once", async () => {
    await database.pool.query(
      "CREATE SEQUENCE public.fix01_c2_gap_attempt START WITH 1",
    );
    await database.pool.query(`
      CREATE FUNCTION public.fix01_c2_fail_first_gap()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog
      AS $$
      BEGIN
        IF nextval('public.fix01_c2_gap_attempt') = 1 THEN
          RAISE EXCEPTION 'TEST_GAP_WRITE_FAILURE';
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await database.pool.query(`
      CREATE TRIGGER fix01_c2_fail_first_gap
      BEFORE INSERT ON obs.capture_gap
      FOR EACH ROW EXECUTE FUNCTION public.fix01_c2_fail_first_gap()
    `);

    const proof = runPublicRuntimeProbe<{
      readonly before: number;
      readonly afterStart: number;
      readonly afterNextFlush: number;
      readonly afterSecondStop: number;
      readonly attemptsAfterStart: number;
      readonly attemptsAfterNextFlush: number;
      readonly accepted: readonly {
        readonly source: string;
        readonly gap_class: string;
        readonly lost_count: number;
      }[];
    }>([
      'import pg from "pg";',
      'import { emit } from "@debateai/obs-capture";',
      'import { startCaptureRuntime, stopCaptureRuntime } from "@debateai/obs-capture/runtime";',
      "const observer = new pg.Pool({ connectionString: process.env.TEST_ADMIN_DATABASE_URL, max: 1 });",
      "const before = Number((await observer.query('SELECT count(*)::int AS count FROM obs.capture_gap')).rows[0].count);",
      "for (let index = 0; index < 37; index += 1) emit({ index });",
      "await startCaptureRuntime({ runtime: 'scheduler', spoolFd: undefined, installExitSink() {} });",
      "const afterStart = Number((await observer.query('SELECT count(*)::int AS count FROM obs.capture_gap')).rows[0].count);",
      "const attemptsAfterStart = Number((await observer.query('SELECT last_value::int AS value FROM public.fix01_c2_gap_attempt')).rows[0].value);",
      "await stopCaptureRuntime({ deadlineMs: 5000 });",
      "const afterNextFlush = Number((await observer.query('SELECT count(*)::int AS count FROM obs.capture_gap')).rows[0].count);",
      "const attemptsAfterNextFlush = Number((await observer.query('SELECT last_value::int AS value FROM public.fix01_c2_gap_attempt')).rows[0].value);",
      "await stopCaptureRuntime({ deadlineMs: 5000 });",
      "const afterSecondStop = Number((await observer.query('SELECT count(*)::int AS count FROM obs.capture_gap')).rows[0].count);",
      "const accepted = (await observer.query(`SELECT source, gap_class, lost_count::int AS lost_count FROM obs.capture_gap ORDER BY opened_at`)).rows.slice(before);",
      "await observer.end();",
      "process.stdout.write(JSON.stringify({ before, afterStart, afterNextFlush, afterSecondStop, attemptsAfterStart, attemptsAfterNextFlush, accepted }));",
    ].join("\n"));

    expect(proof.afterStart).toBe(proof.before);
    expect(proof.attemptsAfterStart).toBe(1);
    expect(proof.afterNextFlush - proof.before).toBe(1);
    expect(proof.afterSecondStop).toBe(proof.afterNextFlush);
    expect(proof.attemptsAfterNextFlush).toBe(2);
    expect(proof.accepted).toEqual([
      {
        source: "first_party",
        gap_class: "QUEUE_FULL",
        lost_count: 37,
      },
    ]);
  });
});
