import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PoolClient } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { readObsBounds } from "../../packages/obs-capture/src/runtime/config.js";
import {
  CAPTURE_GAP_CLASSES,
  CAPTURE_HEALTH_CODES,
  type CaptureGapCounter,
  type CaptureGapRow,
  type CaptureHealth,
} from "../../packages/obs-capture/src/health.js";
import type {
  CaptureEmitter,
  CaptureQueueEntry,
} from "../../packages/obs-capture/src/emit.js";
import type { FlushResult } from "../../packages/obs-capture/src/flusher.js";
import type { ReferenceQueue } from "../../packages/obs-capture/src/queue.js";
import { migrate } from "../../packages/db/src/index.js";
import { loadDevelopmentCommandEnvironment } from "../../packages/register/src/runtime-environment.js";
import {
  startDevelopmentApiProcess,
  type DevelopmentApiChild,
  type DevelopmentApiChildExit,
} from "../../apps/runner/src/dev-api-process.js";
import { DEVELOPMENT_API_ENVIRONMENT_KEYS } from "../../apps/runner/src/dev-api-environment.js";
import { DEVELOPMENT_REGISTER_VERSION } from "../../apps/runner/src/dev-deployment-register.js";
import {
  startDevelopmentRunnerProcess,
  type DevelopmentRunnerChild,
} from "../../apps/runner/src/dev-runner-process.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import {
  startTestDatabase,
  type TestDatabase,
} from "../support/testDatabase.js";

const CADENCE_KEY = "OBS_FLUSH_DEADLINE_MS";
const PROVIDER_KEY = "DEBATEAI_DEV_PROVIDER_TARGETS_JSON";
const MIGRATION_KEY = "MIGRATION_DATABASE_URL";

const cadenceCases = [
  ["absent", undefined, undefined, 5_000],
  ["empty", "", "", 5_000],
  ["malformed", "malformed", "malformed", 5_000],
  ["zero", "0", "0", 5_000],
  ["negative", "-1", "-1", 5_000],
  ["fractional", "1.5", "1.5", 5_000],
  ["below default", "250", "250", 250],
  ["default", "5000", "5000", 5_000],
  ["non-default", "7250", "7250", 7_250],
  ["maximum safe", "9007199254740991", "9007199254740991", 5_000],
  ["overflow", "9007199254740992", "9007199254740992", 5_000],
] as const;

const nativeTimerCases = [
  ["ceiling", "2147483647", 2_147_483_647],
  ["first overflow", "2147483648", 5_000],
] as const;

const scratchDirectories: string[] = [];

function withObsFlushDeadline<T>(
  raw: string | undefined,
  callback: () => T,
): T {
  const hadOwn = Object.prototype.hasOwnProperty.call(process.env, CADENCE_KEY);
  const previous = process.env[CADENCE_KEY];
  try {
    if (raw === undefined) delete process.env[CADENCE_KEY];
    else process.env[CADENCE_KEY] = raw;
    return callback();
  } finally {
    if (hadOwn) process.env[CADENCE_KEY] = previous;
    else delete process.env[CADENCE_KEY];
  }
}

async function withObsFlushDeadlineAsync<T>(
  raw: string | undefined,
  callback: () => T | PromiseLike<T>,
): Promise<Awaited<T>> {
  const hadOwn = Object.prototype.hasOwnProperty.call(process.env, CADENCE_KEY);
  const previous = process.env[CADENCE_KEY];
  try {
    if (raw === undefined) delete process.env[CADENCE_KEY];
    else process.env[CADENCE_KEY] = raw;
    return await callback();
  } finally {
    if (hadOwn) process.env[CADENCE_KEY] = previous;
    else delete process.env[CADENCE_KEY];
  }
}

type CapturedCadence =
  | { readonly present: false }
  | { readonly present: true; readonly value: string };

function capturedCadence(
  environment: Readonly<Record<string, string>>,
): CapturedCadence {
  if (!Object.prototype.hasOwnProperty.call(environment, CADENCE_KEY)) {
    return { present: false };
  }
  return { present: true, value: environment[CADENCE_KEY]! };
}

type CallerId =
  | "auth-stack"
  | "hatchet-token"
  | "api-environment"
  | "auth-data-plane"
  | "deployment-register"
  | "api-process"
  | "ui-process";

const callers = [
  { id: "auth-stack", provider: false, deployment: false },
  { id: "hatchet-token", provider: false, deployment: false },
  { id: "api-environment", provider: true, deployment: false },
  { id: "auth-data-plane", provider: true, deployment: false },
  { id: "deployment-register", provider: true, deployment: true },
  { id: "api-process", provider: false, deployment: false },
  { id: "ui-process", provider: false, deployment: false },
] as const satisfies readonly Readonly<{
  id: CallerId;
  provider: boolean;
  deployment: boolean;
}>[];

function removeCallerMocks(): void {
  vi.doUnmock("@debateai/register");
  vi.doUnmock("@debateai/db");
  vi.doUnmock("../../apps/runner/src/dev-auth-stack.js");
  vi.doUnmock("../../apps/runner/src/dev-hatchet-token.js");
  vi.doUnmock("../../apps/runner/src/dev-api-environment.js");
  vi.doUnmock("../../apps/runner/src/dev-auth-data-plane.js");
  vi.doUnmock("../../apps/runner/src/dev-deployment-register.js");
  vi.doUnmock("../../apps/runner/src/dev-api-process.js");
  vi.doUnmock("../../apps/runner/src/dev-ui-process.js");
}

async function installCallerMock(
  id: CallerId,
  sentinel: Error,
  invoked: { count: number },
): Promise<void> {
  const reject = async (): Promise<never> => {
    invoked.count += 1;
    throw sentinel;
  };
  switch (id) {
    case "auth-stack":
      vi.doMock("../../apps/runner/src/dev-auth-stack.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-auth-stack.js")>(
          "../../apps/runner/src/dev-auth-stack.js",
        ),
        startDevelopmentAuthStack: reject,
      }));
      break;
    case "hatchet-token":
      vi.doMock("../../apps/runner/src/dev-hatchet-token.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-hatchet-token.js")>(
          "../../apps/runner/src/dev-hatchet-token.js",
        ),
        provisionDevelopmentHatchetToken: reject,
      }));
      break;
    case "api-environment":
      vi.doMock("../../apps/runner/src/dev-api-environment.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-api-environment.js")>(
          "../../apps/runner/src/dev-api-environment.js",
        ),
        assembleDevelopmentApiEnvironment: reject,
      }));
      break;
    case "auth-data-plane":
      vi.doMock("../../apps/runner/src/dev-auth-data-plane.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-auth-data-plane.js")>(
          "../../apps/runner/src/dev-auth-data-plane.js",
        ),
        bootstrapDevelopmentAuthDataPlane: reject,
      }));
      break;
    case "deployment-register":
      vi.doMock("../../apps/runner/src/dev-deployment-register.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-deployment-register.js")>(
          "../../apps/runner/src/dev-deployment-register.js",
        ),
        seedDevelopmentDeploymentRegister: reject,
      }));
      break;
    case "api-process":
      vi.doMock("../../apps/runner/src/dev-api-process.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-api-process.js")>(
          "../../apps/runner/src/dev-api-process.js",
        ),
        startDevelopmentApiProcess: reject,
      }));
      break;
    case "ui-process":
      vi.doMock("../../apps/runner/src/dev-ui-process.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-ui-process.js")>(
          "../../apps/runner/src/dev-ui-process.js",
        ),
        startDevelopmentUiProcess: reject,
      }));
      break;
  }
}

async function importCaller(id: CallerId): Promise<unknown> {
  switch (id) {
    case "auth-stack":
      return import("../../apps/runner/src/dev-auth-stack-cli.js");
    case "hatchet-token":
      return import("../../apps/runner/src/dev-hatchet-token-cli.js");
    case "api-environment":
      return import("../../apps/runner/src/dev-api-environment-cli.js");
    case "auth-data-plane":
      return import("../../apps/runner/src/dev-auth-data-plane-cli.js");
    case "deployment-register":
      return import("../../apps/runner/src/dev-deployment-register-cli.js");
    case "api-process":
      return import("../../apps/runner/src/dev-api-process-cli.js");
    case "ui-process":
      return import("../../apps/runner/src/dev-ui-process-cli.js");
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const EMPTY_FLUSH_RESULT = Object.freeze({
  dequeued: 0,
  persisted: 0,
  spooled: 0,
  lost: 0,
}) satisfies FlushResult;

interface RuntimeTestHarness {
  controlValue: boolean;
  readonly controlResponses: Promise<boolean>[];
  controlReads: number;
  controlActive: number;
  maximumControlActive: number;
  controlFailures: number;
  transfer: Promise<void>;
  drain: Promise<void>;
  installCalls: number;
  installedEmitter: CaptureEmitter | undefined;
  queue: ReferenceQueue<CaptureQueueEntry> | undefined;
  health: CaptureHealth | undefined;
  gaps: CaptureGapCounter | undefined;
  flushCalls: number;
  readonly flushSteps: Array<() => Promise<FlushResult>>;
  heartbeatFailures: number;
  readonly heartbeats: Array<Readonly<{
    component: string;
    state: string;
    detailCode: string;
  }>>;
  readonly gapFailures: string[];
  readonly gapRows: CaptureGapRow[];
  closeCalls: number;
}

function removeRuntimeMocks(): void {
  vi.doUnmock("../../packages/obs-capture/src/runtime/config.js");
  vi.doUnmock("../../packages/obs-capture/src/runtime/control.js");
  vi.doUnmock("../../packages/obs-capture/src/runtime/sink.js");
  vi.doUnmock("../../packages/obs-capture/src/runtime/drain.js");
  vi.doUnmock("../../packages/obs-capture/src/flusher.js");
  vi.doUnmock("../../packages/obs-capture/src/emit.js");
}

async function loadRuntimeHarness(
  options: { readonly useActualBounds?: boolean } = {},
): Promise<{
  readonly harness: RuntimeTestHarness;
  readonly runtime: typeof import("../../packages/obs-capture/src/runtime/index.js");
  readonly capture: typeof import("../../packages/obs-capture/src/emit.js");
}> {
  removeRuntimeMocks();
  vi.resetModules();
  const harness: RuntimeTestHarness = {
    controlValue: false,
    controlResponses: [],
    controlReads: 0,
    controlActive: 0,
    maximumControlActive: 0,
    controlFailures: 0,
    transfer: Promise.resolve(),
    drain: Promise.resolve(),
    installCalls: 0,
    installedEmitter: undefined,
    queue: undefined,
    health: undefined,
    gaps: undefined,
    flushCalls: 0,
    flushSteps: [],
    heartbeatFailures: 0,
    heartbeats: [],
    gapFailures: [],
    gapRows: [],
    closeCalls: 0,
  };

  vi.doMock("../../packages/obs-capture/src/runtime/config.js", async () => {
    const actual = await vi.importActual<
      typeof import("../../packages/obs-capture/src/runtime/config.js")
    >(
      "../../packages/obs-capture/src/runtime/config.js",
    );
    return {
      ...actual,
      readObsBounds: options.useActualBounds
        ? actual.readObsBounds
        : () => Object.freeze({
            flushDeadlineMs: 25,
            queueCapacity: 8,
            spoolDir: undefined,
            spoolAdmissionSeal: undefined,
            writerDatabaseUrl: "postgresql://fix07.invalid/fix07",
          }),
      readObsControlDir: () => "/tmp/fix07-control",
    };
  });
  vi.doMock("../../packages/obs-capture/src/runtime/control.js", async () => ({
    ...await vi.importActual<typeof import("../../packages/obs-capture/src/runtime/control.js")>(
      "../../packages/obs-capture/src/runtime/control.js",
    ),
    async readCaptureOff(): Promise<boolean> {
      harness.controlReads += 1;
      harness.controlActive += 1;
      harness.maximumControlActive = Math.max(
        harness.maximumControlActive,
        harness.controlActive,
      );
      try {
        if (harness.controlFailures > 0) {
          harness.controlFailures -= 1;
          throw new Error("PLANTED_CONTROL_FAILURE");
        }
        return await (harness.controlResponses.shift()
          ?? Promise.resolve(harness.controlValue));
      } finally {
        harness.controlActive -= 1;
      }
    },
  }));
  vi.doMock("../../packages/obs-capture/src/runtime/sink.js", async () => ({
    ...await vi.importActual<typeof import("../../packages/obs-capture/src/runtime/sink.js")>(
      "../../packages/obs-capture/src/runtime/sink.js",
    ),
    createPostgresCaptureSink: () => Object.freeze({
      async writeOccurrences(): Promise<void> {},
      async ingestSpooledOccurrence(): Promise<void> {},
      async writeCaptureGap(row: CaptureGapRow): Promise<void> {
        if (harness.gapFailures[0] === row.gap_class) {
          harness.gapFailures.shift();
          throw new Error(`PLANTED_GAP_FAILURE:${row.gap_class}`);
        }
        harness.gapRows.push(row);
      },
      async writeComponentHealth(row: Readonly<{
        component: string;
        state: string;
        detailCode: string;
      }>): Promise<void> {
        if (harness.heartbeatFailures > 0) {
          harness.heartbeatFailures -= 1;
          throw new Error("PLANTED_HEARTBEAT_FAILURE");
        }
        harness.heartbeats.push(Object.freeze({ ...row }));
      },
      async close(): Promise<void> {
        harness.closeCalls += 1;
      },
    }),
  }));
  vi.doMock("../../packages/obs-capture/src/runtime/drain.js", async () => ({
    ...await vi.importActual<typeof import("../../packages/obs-capture/src/runtime/drain.js")>(
      "../../packages/obs-capture/src/runtime/drain.js",
    ),
    drainDeadSpoolFiles: () => harness.drain,
  }));
  vi.doMock("../../packages/obs-capture/src/flusher.js", async () => ({
    ...await vi.importActual<typeof import("../../packages/obs-capture/src/flusher.js")>(
      "../../packages/obs-capture/src/flusher.js",
    ),
    createCaptureFlusher(options: Readonly<{
      queue: ReferenceQueue<CaptureQueueEntry>;
      health: CaptureHealth;
      gaps: CaptureGapCounter;
    }>) {
      harness.queue = options.queue;
      harness.health = options.health;
      harness.gaps = options.gaps;
      return Object.freeze({
        async flushOnce(): Promise<FlushResult> {
          harness.flushCalls += 1;
          return harness.flushSteps.shift()?.() ?? EMPTY_FLUSH_RESULT;
        },
      });
    },
  }));
  vi.doMock("../../packages/obs-capture/src/emit.js", async () => {
    const actual = await vi.importActual<
      typeof import("../../packages/obs-capture/src/emit.js")
    >("../../packages/obs-capture/src/emit.js");
    return {
      ...actual,
      installCaptureEmitter(
        emitter: CaptureEmitter,
        gaps?: Pick<CaptureGapCounter, "recordLoss">,
      ): Promise<void> | void {
        harness.installCalls += 1;
        harness.installedEmitter = emitter;
        const actualTransfer = gaps === undefined
          ? actual.installCaptureEmitter(emitter)
          : actual.installCaptureEmitter(emitter, gaps);
        void actualTransfer?.catch(() => undefined);
        return gaps === undefined ? undefined : harness.transfer;
      },
    };
  });

  const runtime = await import("../../packages/obs-capture/src/runtime/index.js");
  const capture = await import("../../packages/obs-capture/src/emit.js");
  return { harness, runtime, capture };
}

async function settleMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) {
    await Promise.resolve();
  }
}

const FIX07_PERIOD_QUERY = `
WITH supplied AS (
  SELECT $1::bigint AS flush_interval_ms,
         transaction_timestamp() AS evaluated_at
), params AS (
  SELECT evaluated_at,
         flush_interval_ms,
         evaluated_at - interval '1 minute' AS period_cutoff
  FROM supplied
  WHERE flush_interval_ms BETWEEN 1 AND 2147483647
), runtimes(runtime) AS (
  VALUES ('api'), ('runner'), ('scheduler')
), gap_window AS (
  SELECT EXISTS (
    SELECT 1
    FROM obs.capture_gap AS cg
    CROSS JOIN params AS p
    WHERE cg.closed_at IS NULL
       OR cg.closed_at >= p.period_cutoff
  ) AS any_gap
)
SELECT r.runtime,
       CASE
         WHEN h.component IS NULL
           OR h.state IN ('OFF', 'STOPPED')
           OR EXTRACT(EPOCH FROM (p.evaluated_at - h.observed_at)) * 1000
                > p.flush_interval_ms THEN 'OFF'
         WHEN h.state = 'SPOOL_ONLY'
           OR h.detail_code IN (
             'QUEUE_FULL', 'EMIT_FAILURE', 'REDACTOR_FAILURE',
             'POSTGRES_FAILURE', 'SPOOL_FAILURE', 'GAP_WRITE_FAILURE'
           )
           OR g.any_gap THEN 'BLIND'
         WHEN EXISTS (
           SELECT 1
           FROM obs.occurrence AS o
           WHERE o.runtime = r.runtime
             AND o.captured_at >= p.period_cutoff
         ) THEN 'ACTIVE'
         ELSE 'QUIET'
       END AS period
FROM runtimes AS r
CROSS JOIN params AS p
CROSS JOIN gap_window AS g
LEFT JOIN obs.component_health AS h
  ON h.component = 'capture:' || r.runtime
ORDER BY r.runtime;
`;

interface PeriodRow {
  readonly runtime: string;
  readonly period: string;
}

function requireExactCadenceEcho(
  expected: string,
  actual: string | undefined,
): void {
  if (actual !== expected) {
    throw new TypeError("FIX07_CADENCE_ECHO_MISMATCH");
  }
}

async function queryPeriods(
  client: Pick<PoolClient, "query">,
  expectedCadence: string,
  queryBind: string | undefined = expectedCadence,
): Promise<Readonly<{
  bind: string;
  rows: readonly PeriodRow[];
}>> {
  requireExactCadenceEcho(expectedCadence, queryBind);
  const result = await client.query<PeriodRow>(FIX07_PERIOD_QUERY, [queryBind]);
  return Object.freeze({ bind: queryBind, rows: result.rows });
}

async function withOwnerTransaction<T>(
  database: TestDatabase,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    return await callback(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function seedHealth(
  client: Pick<PoolClient, "query">,
  input: Readonly<{
    runtime: "api" | "runner" | "scheduler";
    state: string;
    detailCode: string;
    ageMs: number;
  }>,
): Promise<void> {
  await client.query(
    `INSERT INTO obs.component_health
       (component, state, observed_at, detail_code)
     VALUES (
       'capture:' || $1,
       $2,
       transaction_timestamp()
         - ($4::double precision * interval '1 millisecond'),
       $3
     )
     ON CONFLICT (component) DO UPDATE SET
       state = $2,
       observed_at = transaction_timestamp()
         - ($4::double precision * interval '1 millisecond'),
       detail_code = $3,
       updated_at = transaction_timestamp()`,
    [input.runtime, input.state, input.detailCode, input.ageMs],
  );
}

async function seedOccurrence(
  client: Pick<PoolClient, "query">,
  runtime: "api" | "runner" | "scheduler",
  ageMs: number,
  sourceEventRef: string,
): Promise<void> {
  await client.query(
    `INSERT INTO obs.occurrence (
       occurred_at, captured_at, environment, build_ref, build_dirty,
       runtime, component, capture_point, code, taxonomy_class, severity,
       disposition, fingerprint, fingerprint_version,
       redaction_policy_version, allowlist_set_id, capture_status, run_ref,
       work_item_ref, node_ref, attempt_ref, ledger_ref,
       parent_occurrence_ref, at_seq_watermark, safe_template_id, source,
       source_event_ref, writer_identity
     ) VALUES (
       transaction_timestamp()
         - ($2::double precision * interval '1 millisecond'),
       transaction_timestamp()
         - ($2::double precision * interval '1 millisecond'),
       'fix07-test', 'fix07-test', false,
       $1::text, jsonb_build_object('process', $1::text),
       'self', 'FIX07_QUERY_PROBE',
       'CAPTURE_SELF', 'INFO', 'RECORDED', 'fix07:' || $3::text, 1,
       'fix07-test', 'fix07-test', 'PERSISTED', 'NOT_APPLICABLE',
       'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NOT_APPLICABLE',
       'NOT_APPLICABLE', 'NO_CAUSE', 'NOT_APPLICABLE', 'fix07-test',
       'first_party', $3::text, 'fix07-test'
     )`,
    [runtime, ageMs, sourceEventRef],
  );
}

function apiCredentialEnvironment(
  root: string,
): Readonly<Record<string, string>> {
  const custodyRoot = join(root, ".local", "dev-auth");
  return Object.freeze({
    KEK_PATH: join(custodyRoot, "secrets", "kek.bin"),
    BLIND_INDEX_KEY_PATH: join(custodyRoot, "secrets", "blind-index-key.bin"),
    AUDIT_KEY_STORE_PATH: join(custodyRoot, "audit-keys"),
    AUDIT_SOURCE_IP_SALT_PATH: join(
      custodyRoot,
      "secrets",
      "audit-source-ip-salt.bin",
    ),
    USER_DEK_STORE_PATH: join(custodyRoot, "user-deks"),
    CORPUS_KEK_PATH: join(custodyRoot, "secrets", "corpus-kek.bin"),
    PUBLICATION_KEY_STORE_PATH: join(custodyRoot, "publication-keys"),
    CONTENT_ENCRYPTION_ENABLED: "true",
    CONTENT_PROVISION_DATABASE_URL:
      "postgresql://debateai_dev_content_provision:one@127.0.0.1:55432/debateai",
    AUTHORIZATION_DATABASE_URL:
      "postgresql://debateai_dev_authorization:auth@127.0.0.1:55432/debateai",
    PUBLICATION_ENABLED: "true",
    PUBLICATION_CLEANUP_DATABASE_URL:
      "postgresql://debateai_dev_publication_cleanup:pub@127.0.0.1:55432/debateai",
    ERASURE_DATABASE_URL:
      "postgresql://debateai_dev_erasure:two@127.0.0.1:55432/debateai",
    ACCOUNT_ERASURE_GRACE_MS: "604800000",
    MAIL_SENDMAIL_PATH: join(root, "deploy", "dev-auth", "sendmail-capture.mjs"),
    MAIL_FROM: "noreply@localhost.test",
    PUBLIC_APP_URL: "https://localhost:3000",
    DATABASE_URL:
      "postgresql://debateai_dev_runtime:three@127.0.0.1:55432/debateai",
    API_HOST: "127.0.0.1",
    API_PORT: "8790",
    STRANGER_SAMPLE_RATE: "0",
    REGISTER_VERSION: "4",
    BATTERY_VERSION: "dev-auth-v1",
    SETTLEMENT_WATCH_HANDLE: "dev-auth:settlement-watch",
    PROVIDER_DISCOVERY_TARGETS_JSON:
      TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson,
    PROVIDER_PROBE_TIMEOUT_MS: "180000",
    NODE_ENV: "development",
    EVALUATOR_DEV_MENU_ENABLED: "false",
    EVALUATOR_DEV_MENU_DATABASE_URL:
      "postgresql://debateai_dev_evaluator_api:evaluator@127.0.0.1:55432/debateai",
    HATCHET_CLIENT_TOKEN: "header.payload.signature",
    HATCHET_HOST_PORT: "127.0.0.1:7077",
    HATCHET_API_URL: "http://127.0.0.1:8888",
    HATCHET_TENANT_ID: "11111111-1111-4111-8111-111111111111",
    HATCHET_WORKFLOW_NAME: "debateai-dev",
    HATCHET_TLS_STRATEGY: "none",
    DEBATEAI_DEV_MAIL_CAPTURE_DIR: join(custodyRoot, "mail"),
  });
}

async function createApiCredentialFixture(): Promise<Readonly<{
  root: string;
  values: Readonly<Record<string, string>>;
}>> {
  const root = await mkdtemp(join(tmpdir(), "fix07-api-environment-"));
  scratchDirectories.push(root);
  await mkdir(join(root, ".local"), { mode: 0o700 });
  await mkdir(join(root, ".local", "dev-auth"), { mode: 0o700 });
  const values = apiCredentialEnvironment(root);
  await writeFile(
    join(root, ".local", "dev-auth", "api.env"),
    `${DEVELOPMENT_API_ENVIRONMENT_KEYS.map((key) =>
      `${key}=${values[key]}`).join("\n")}\n`,
    { mode: 0o600 },
  );
  return Object.freeze({ root, values });
}

function createApiChild(): DevelopmentApiChild & Readonly<{
  terminateCalls: { count: number };
}> {
  let resolveExit!: (value: DevelopmentApiChildExit) => void;
  const exited = new Promise<DevelopmentApiChildExit>((resolve) => {
    resolveExit = resolve;
  });
  const terminateCalls = { count: 0 };
  return Object.freeze({
    exited,
    terminateCalls,
    async terminate(): Promise<void> {
      terminateCalls.count += 1;
      resolveExit(Object.freeze({ code: 0, signal: "SIGTERM" }));
    },
  });
}

function createRunnerChild(): DevelopmentRunnerChild & Readonly<{
  terminateCalls: { count: number };
}> {
  let resolveExit!: (value: Readonly<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>) => void;
  const exited = new Promise<Readonly<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>>((resolve) => {
    resolveExit = resolve;
  });
  const terminateCalls = { count: 0 };
  return Object.freeze({
    exited,
    ready: Promise.resolve(Object.freeze({
      kind: "DEBATEAI_RUNNER_READY",
      worker: "debateai-dev-runner",
      registerVersion: DEVELOPMENT_REGISTER_VERSION,
    })),
    terminateCalls,
    async terminate(): Promise<void> {
      terminateCalls.count += 1;
      resolveExit(Object.freeze({ code: 0, signal: "SIGTERM" }));
    },
  });
}

async function readCaptureOffFromFailure(
  failure: unknown,
): Promise<boolean> {
  vi.doUnmock("node:fs/promises");
  vi.resetModules();
  const lstat = vi.fn(async (): Promise<never> => {
    throw failure;
  });
  vi.doMock("node:fs/promises", async () => ({
    ...await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    ),
    lstat,
  }));
  try {
    const { readCaptureOff } = await import(
      "../../packages/obs-capture/src/runtime/control.js"
    );
    return await readCaptureOff("/tmp/fix07-hostile-marker");
  } finally {
    expect(lstat).toHaveBeenCalledTimes(1);
  }
}

interface NativeTimerObservation {
  readonly canonicalDelay: number;
  readonly requestedDelay: number;
  readonly storedDelay: number;
  readonly callbackEntries: number;
  readonly registrations: number;
}

async function observeNativeRuntimeTimer(
  raw: string,
): Promise<NativeTimerObservation> {
  const nativeSetInterval = globalThis.setInterval;
  const nativeSetTimeout = globalThis.setTimeout;
  let requestedDelay = Number.NaN;
  let storedDelay = Number.NaN;
  let callbackEntries = 0;
  let registrations = 0;
  const interval = vi.spyOn(globalThis, "setInterval").mockImplementation((
    (
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ): NodeJS.Timeout => {
      registrations += 1;
      requestedDelay = delay ?? 0;
      const timer = nativeSetInterval((...callbackArgs: unknown[]) => {
        callbackEntries += 1;
        callback(...callbackArgs);
      }, delay, ...args);
      storedDelay = (
        timer as NodeJS.Timeout & { readonly _idleTimeout: number }
      )._idleTimeout;
      return timer;
    }
  ) as typeof globalThis.setInterval);

  let runtime:
    | typeof import("../../packages/obs-capture/src/runtime/index.js")
    | undefined;
  let canonicalDelay = Number.NaN;
  try {
    await withObsFlushDeadlineAsync(raw, async () => {
      canonicalDelay = readObsBounds().flushDeadlineMs;
      ({ runtime } = await loadRuntimeHarness({ useActualBounds: true }));
      await runtime.startCaptureRuntime({
        runtime: "scheduler",
        spoolFd: undefined,
        installExitSink() {},
      });
      await new Promise<void>((resolve) => {
        nativeSetTimeout(resolve, 30);
      });
    });
  } finally {
    await runtime?.stopCaptureRuntime({ deadlineMs: 100 });
    interval.mockRestore();
  }

  return Object.freeze({
    canonicalDelay,
    requestedDelay,
    storedDelay,
    callbackEntries,
    registrations,
  });
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock("node:fs/promises");
  removeCallerMocks();
  removeRuntimeMocks();
  vi.resetModules();
  while (scratchDirectories.length > 0) {
    await rm(scratchDirectories.pop()!, { recursive: true, force: true });
  }
});

describe.sequential("FIX-07 C2 capture control and launch cadence", () => {
  it("accepts only a nonempty absolute control directory independent of spool", async () => {
    const { readObsControlDir } = await import(
      "../../packages/obs-capture/src/runtime/config.js"
    );
    const cases = [
      [{}, undefined],
      [{ OBS_CONTROL_DIR: "" }, undefined],
      [{ OBS_CONTROL_DIR: "relative/control" }, undefined],
      [{ OBS_CONTROL_DIR: "/tmp/fix07\0control" }, undefined],
      [{ OBS_CONTROL_DIR: "/tmp/fix07-control" }, "/tmp/fix07-control"],
      [{ OBS_SPOOL_DIR: "/tmp/spool" }, undefined],
      [{ OBS_CONTROL_DIR: "/tmp/fix07-control", OBS_SPOOL_DIR: "/elsewhere" }, "/tmp/fix07-control"],
    ] as const;

    for (const [environment, expected] of cases) {
      expect(readObsControlDir(environment)).toBe(expected);
    }
  });

  it("uses only CAPTURE_OFF and treats every descriptor except ENOENT as OFF", async () => {
    const { captureOffMarkerPath, readCaptureOff } = await import(
      "../../packages/obs-capture/src/runtime/control.js"
    );
    const directory = await mkdtemp(join(tmpdir(), "fix07-control-"));
    scratchDirectories.push(directory);
    const marker = join(directory, "CAPTURE_OFF");
    const nestedDirectory = join(directory, "nested-marker");
    const symlinkMarker = join(directory, "symlink-marker");

    expect(captureOffMarkerPath(undefined)).toBeUndefined();
    expect(captureOffMarkerPath(directory)).toBe(marker);
    await expect(readCaptureOff(undefined)).resolves.toBe(false);
    await expect(readCaptureOff(marker)).resolves.toBe(false);

    await writeFile(marker, "off\n");
    await mkdir(nestedDirectory);
    await symlink(join(directory, "missing-target"), symlinkMarker);
    await expect(readCaptureOff(marker)).resolves.toBe(true);
    await expect(readCaptureOff(nestedDirectory)).resolves.toBe(true);
    await expect(readCaptureOff(symlinkMarker)).resolves.toBe(true);
    await expect(readCaptureOff("\0invalid-descriptor-path")).resolves.toBe(true);
  });

  it("totalizes direct OFF failures without reading hostile values", async () => {
    const enoent = Object.defineProperty(new Error("missing"), "code", {
      value: "ENOENT",
      enumerable: true,
      configurable: true,
    });
    await expect(readCaptureOffFromFailure(enoent)).resolves.toBe(false);

    let getterReads = 0;
    const accessor = Object.defineProperty(new Error("accessor"), "code", {
      get() {
        getterReads += 1;
        throw new Error("CODE_ACCESSOR_TRAP");
      },
      configurable: true,
    });
    await expect(readCaptureOffFromFailure(accessor)).resolves.toBe(true);
    expect(getterReads).toBe(0);

    const trapReads = { get: 0, descriptor: 0 };
    const proxy = new Proxy(
      Object.defineProperty(new Error("proxy"), "code", {
        value: "ENOENT",
        configurable: true,
      }),
      {
        get() {
          trapReads.get += 1;
          throw new Error("CODE_GET_TRAP");
        },
        getOwnPropertyDescriptor() {
          trapReads.descriptor += 1;
          throw new Error("CODE_DESCRIPTOR_TRAP");
        },
      },
    );
    await expect(readCaptureOffFromFailure(proxy)).resolves.toBe(true);
    expect(trapReads).toEqual({ get: 0, descriptor: 0 });

    const revoked = Proxy.revocable(
      Object.defineProperty(new Error("revoked"), "code", {
        value: "ENOENT",
        configurable: true,
      }),
      {},
    );
    revoked.revoke();
    await expect(readCaptureOffFromFailure(revoked.proxy)).resolves.toBe(true);

    const inherited = Object.create(Object.defineProperty({}, "code", {
      value: "ENOENT",
      configurable: true,
    })) as object;
    const ambiguousFailures = [
      undefined,
      null,
      "ENOENT",
      2,
      Symbol("ENOENT"),
      new Error("missing code"),
      inherited,
      Object.defineProperty(new Error("numeric"), "code", {
        value: -2,
        configurable: true,
      }),
      Object.defineProperty(new Error("denied"), "code", {
        value: "EACCES",
        configurable: true,
      }),
    ] as const;
    for (const failure of ambiguousFailures) {
      await expect(readCaptureOffFromFailure(failure)).resolves.toBe(true);
    }

    const source = await readFile(
      new URL("../../packages/obs-capture/src/runtime/control.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('import { isProxy } from "node:util/types";');
    expect(source).toContain("Object.getOwnPropertyDescriptor(error, \"code\")");
    expect(source).not.toMatch(/\berror\.code\b/u);
  });

  it.each(cadenceCases)(
    "transports %s without taking numeric authority",
    (_label, raw, forwarded, effective) => {
      withObsFlushDeadline(raw, () => {
        const commandEnvironment = loadDevelopmentCommandEnvironment();
        expect(commandEnvironment.OBS_FLUSH_DEADLINE_MS).toBe(forwarded);
        expect(withObsFlushDeadline(
          forwarded,
          () => readObsBounds().flushDeadlineMs,
        )).toBe(effective);
      });
    },
  );

  it("uses one native interval without overflow storms across direct API and runner paths", async () => {
    const credential = await createApiCredentialFixture();
    const observations: Array<Readonly<{
      label: string;
      path: "direct" | "api" | "runner";
      expectedDelay: number;
      timer: NativeTimerObservation;
    }>> = [];
    const launchEchoes: Array<Readonly<{
      label: string;
      expected: string;
      command: string | undefined;
      api: string | undefined;
      runner: string | undefined;
      query: string | undefined;
    }>> = [];

    for (const [label, raw, expectedDelay] of nativeTimerCases) {
      const parentCanonical = withObsFlushDeadline(
        raw,
        () => readObsBounds().flushDeadlineMs,
      );
      const canonical = String(parentCanonical);
      let commandEnvironment: Readonly<Record<string, string>> | undefined;
      let apiEnvironment: Readonly<Record<string, string>> | undefined;
      let runnerEnvironment: Readonly<Record<string, string>> | undefined;

      await withObsFlushDeadlineAsync(canonical, async () => {
        commandEnvironment = loadDevelopmentCommandEnvironment();

        const apiChild = createApiChild();
        let probeCount = 0;
        const api = await startDevelopmentApiProcess({
          repositoryRoot: credential.root,
          commandEnvironment,
          operations: Object.freeze({
            async probe() {
              probeCount += 1;
              return probeCount === 1
                ? null
                : Object.freeze({
                    statusCode: 401,
                    contentType: "application/json",
                    body: '{"error":"SESSION_REQUIRED"}',
                  });
            },
            startApi(environment: Readonly<Record<string, string>>) {
              apiEnvironment = environment;
              return apiChild;
            },
            async delay() {},
          }),
        });
        await api.stop();

        const runnerChild = createRunnerChild();
        const runner = await startDevelopmentRunnerProcess({
          repositoryRoot: credential.root,
          commandEnvironment,
          operations: Object.freeze({
            async loadApiEnvironment() {
              return credential.values;
            },
            startRunner(environment: Readonly<Record<string, string>>) {
              runnerEnvironment = environment;
              return runnerChild;
            },
          }),
        });
        await runner.stop();
      });

      const commandEcho = commandEnvironment?.OBS_FLUSH_DEADLINE_MS;
      const apiEcho = apiEnvironment?.OBS_FLUSH_DEADLINE_MS;
      const runnerEcho = runnerEnvironment?.OBS_FLUSH_DEADLINE_MS;
      launchEchoes.push(Object.freeze({
        label,
        expected: String(expectedDelay),
        command: commandEcho,
        api: apiEcho,
        runner: runnerEcho,
        query: commandEcho,
      }));
      observations.push(
        Object.freeze({
          label,
          path: "direct",
          expectedDelay,
          timer: await observeNativeRuntimeTimer(raw),
        }),
        Object.freeze({
          label,
          path: "api",
          expectedDelay,
          timer: await observeNativeRuntimeTimer(apiEcho!),
        }),
        Object.freeze({
          label,
          path: "runner",
          expectedDelay,
          timer: await observeNativeRuntimeTimer(runnerEcho!),
        }),
      );
    }

    for (const observation of observations) {
      expect.soft({
        label: observation.label,
        path: observation.path,
        canonicalDelay: observation.timer.canonicalDelay,
        requestedDelay: observation.timer.requestedDelay,
        storedDelay: observation.timer.storedDelay,
        callbackEntries: observation.timer.callbackEntries,
        registrations: observation.timer.registrations,
      }).toEqual({
        label: observation.label,
        path: observation.path,
        canonicalDelay: observation.expectedDelay,
        requestedDelay: observation.expectedDelay,
        storedDelay: observation.expectedDelay,
        callbackEntries: 0,
        registrations: 1,
      });
    }
    for (const echo of launchEchoes) {
      expect.soft({
        command: echo.command,
        api: echo.api,
        runner: echo.runner,
        query: echo.query,
      }).toEqual({
        command: echo.expected,
        api: echo.expected,
        runner: echo.expected,
        query: echo.expected,
      });
    }
    expect.soft(withObsFlushDeadline(
      String(Number.MAX_SAFE_INTEGER),
      () => readObsBounds().flushDeadlineMs,
    )).toBe(5_000);

    const runtimeSource = await readFile(
      new URL("../../packages/obs-capture/src/runtime/index.ts", import.meta.url),
      "utf8",
    );
    expect(runtimeSource.match(/\bsetInterval\(/gu)).toHaveLength(1);
  }, 30_000);

  it("keeps asynchronous cadence scope active through every settlement and restores exactly", async () => {
    const originalHadOwn = Object.prototype.hasOwnProperty.call(process.env, CADENCE_KEY);
    const original = process.env[CADENCE_KEY];
    try {
      delete process.env[CADENCE_KEY];
      const fromAbsent = await withObsFlushDeadlineAsync("7250", async () => {
        await Promise.resolve();
        expect(process.env[CADENCE_KEY]).toBe("7250");
        return 17;
      });
      expect(fromAbsent).toBe(17);
      expect(Object.prototype.hasOwnProperty.call(process.env, CADENCE_KEY)).toBe(false);

      process.env[CADENCE_KEY] = "round5-prior";
      const fromPresent = await withObsFlushDeadlineAsync("", async () => {
        await Promise.resolve();
        expect(process.env[CADENCE_KEY]).toBe("");
        return 23;
      });
      expect(fromPresent).toBe(23);
      expect(process.env[CADENCE_KEY]).toBe("round5-prior");

      await expect(withObsFlushDeadlineAsync("7250", () => {
        throw new Error("SYNC_SENTINEL");
      })).rejects.toThrow("SYNC_SENTINEL");
      expect(process.env[CADENCE_KEY]).toBe("round5-prior");

      await expect(withObsFlushDeadlineAsync("7250", async () => {
        await Promise.resolve();
        throw new Error("ASYNC_SENTINEL");
      })).rejects.toThrow("ASYNC_SENTINEL");
      expect(process.env[CADENCE_KEY]).toBe("round5-prior");

      for (const raw of [undefined, "", "7250", "malformed"] as const) {
        await withObsFlushDeadlineAsync(raw, async () => {
          await Promise.resolve();
          expect(Object.prototype.hasOwnProperty.call(process.env, CADENCE_KEY))
            .toBe(raw !== undefined);
          expect(process.env[CADENCE_KEY]).toBe(raw);
        });
        expect(process.env[CADENCE_KEY]).toBe("round5-prior");
      }
    } finally {
      if (originalHadOwn) process.env[CADENCE_KEY] = original;
      else delete process.env[CADENCE_KEY];
    }
  });

  it("carries every raw cadence through all seven real CLI loader contexts", async () => {
    const originalCadenceHadOwn = Object.prototype.hasOwnProperty.call(process.env, CADENCE_KEY);
    const originalCadence = process.env[CADENCE_KEY];
    const originalProviderHadOwn = Object.prototype.hasOwnProperty.call(process.env, PROVIDER_KEY);
    const originalProvider = process.env[PROVIDER_KEY];
    const originalMigrationHadOwn = Object.prototype.hasOwnProperty.call(process.env, MIGRATION_KEY);
    const originalMigration = process.env[MIGRATION_KEY];
    const originalExitCode = process.exitCode;
    try {
      process.env[CADENCE_KEY] = "round5-prior";
      process.env[PROVIDER_KEY] = TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson;
      process.env[MIGRATION_KEY] = "postgresql://fix07:fix07@127.0.0.1:5432/fix07";
      const summary = {
        loaderCalls: 0,
        exactCaptures: 0,
        sentinels: 0,
        providerSentinels: 0,
        exactTerminalOutcomes: 0,
        fixtureRows: 0,
        cadenceRestorations: 0,
        deploymentConstructions: 0,
        deploymentEnds: 0,
      };

      for (const [, raw] of cadenceCases) {
        for (const caller of callers) {
          removeCallerMocks();
          vi.resetModules();
          vi.clearAllMocks();
          process.exitCode = undefined;
          const loader = { calls: 0, captured: [] as CapturedCadence[] };
          const invoked = { count: 0 };
          const pool = { constructions: 0, ends: 0 };
          const sentinel = new Error(`FIX07_${caller.id.toUpperCase().replaceAll("-", "_")}_SENTINEL`);

          vi.doMock("@debateai/register", async () => {
            const actual = await vi.importActual<typeof import("../../packages/register/src/index.js")>(
              "@debateai/register",
            );
            return {
              ...actual,
              loadDevelopmentCommandEnvironment(): Readonly<Record<string, string>> {
                loader.calls += 1;
                const environment = actual.loadDevelopmentCommandEnvironment();
                loader.captured.push(capturedCadence(environment));
                return environment;
              },
            };
          });
          if (caller.deployment) {
            vi.doMock("@debateai/db", async () => ({
              ...await vi.importActual<typeof import("../../packages/db/src/index.js")>(
                "@debateai/db",
              ),
              createPool() {
                pool.constructions += 1;
                return {
                  async end(): Promise<void> {
                    pool.ends += 1;
                  },
                };
              },
            }));
          }
          await installCallerMock(caller.id, sentinel, invoked);
          const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
          const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

          let importedError: unknown;
          await withObsFlushDeadlineAsync(raw, async () => {
            try {
              await importCaller(caller.id);
            } catch (error) {
              importedError = error;
            }
            summary.loaderCalls += loader.calls;
            const expectedCapture: CapturedCadence = raw === undefined
              ? { present: false }
              : { present: true, value: raw };
            if (JSON.stringify(loader.captured) === JSON.stringify([expectedCapture])) {
              summary.exactCaptures += 1;
            }
            summary.sentinels += invoked.count;
            if (caller.provider) summary.providerSentinels += invoked.count;
            if (
              process.env[PROVIDER_KEY] === TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson
              && process.env[MIGRATION_KEY]
                === "postgresql://fix07:fix07@127.0.0.1:5432/fix07"
            ) {
              summary.fixtureRows += 1;
            }
            if (caller.deployment) {
              summary.deploymentConstructions += pool.constructions;
              summary.deploymentEnds += pool.ends;
              if (
                importedError === sentinel
                && invoked.count === 1
                && pool.constructions === 1
                && pool.ends === 1
              ) {
                summary.exactTerminalOutcomes += 1;
              }
            } else if (
              importedError === undefined
              && invoked.count === 1
              && process.exitCode === 1
            ) {
              summary.exactTerminalOutcomes += 1;
            }
          });
          if (process.env[CADENCE_KEY] === "round5-prior") {
            summary.cadenceRestorations += 1;
          }
          consoleError.mockRestore();
          consoleLog.mockRestore();
        }
      }
      expect(summary).toEqual({
        loaderCalls: 77,
        exactCaptures: 77,
        sentinels: 77,
        providerSentinels: 33,
        exactTerminalOutcomes: 77,
        fixtureRows: 77,
        cadenceRestorations: 77,
        deploymentConstructions: 11,
        deploymentEnds: 11,
      });
    } finally {
      process.exitCode = originalExitCode;
      if (originalCadenceHadOwn) process.env[CADENCE_KEY] = originalCadence;
      else delete process.env[CADENCE_KEY];
      if (originalProviderHadOwn) process.env[PROVIDER_KEY] = originalProvider;
      else delete process.env[PROVIDER_KEY];
      if (originalMigrationHadOwn) process.env[MIGRATION_KEY] = originalMigration;
      else delete process.env[MIGRATION_KEY];
      removeCallerMocks();
      vi.resetModules();
    }
  }, 120_000);

  it("confines command cadence to one passive optional-string property", async () => {
    const source = await readFile(
      new URL("../../packages/register/src/runtime-environment.ts", import.meta.url),
      "utf8",
    );
    const start = source.indexOf("export function loadDevelopmentCommandEnvironment");
    const end = source.indexOf("export function loadReplaySelfTestEnvironment", start);
    const body = source.slice(start, end);

    expect(body.match(/OBS_FLUSH_DEADLINE_MS/gu)).toHaveLength(1);
    expect(body).toContain("    OBS_FLUSH_DEADLINE_MS: z.string().optional(),");
    expect(body).not.toMatch(/OBS_FLUSH_DEADLINE_MS[^\n]*(regex|refine|coerce|transform|default)/u);
  });
});

describe.sequential("FIX-07 C3 runtime control and heartbeat", () => {
  it("settles the initial OFF sample before installing the emitter or its sole timer", async () => {
    vi.useFakeTimers();
    const initialControl = deferred<boolean>();
    const transfer = deferred<void>();
    const startupFlush = deferred<FlushResult>();
    const { harness, runtime, capture } = await loadRuntimeHarness();
    harness.controlResponses.push(initialControl.promise);
    harness.transfer = transfer.promise;
    harness.flushSteps.push(() => startupFlush.promise);
    const interval = vi.spyOn(globalThis, "setInterval");
    const readiness = runtime.waitForCaptureEmitterInstalled({ deadlineMs: 1_000 });
    let readinessSettled = false;
    void readiness.then(() => {
      readinessSettled = true;
    });
    const starting = runtime.startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });

    try {
      await settleMicrotasks();
      expect(harness.controlReads).toBe(1);
      expect(harness.installCalls).toBe(0);
      expect(readinessSettled).toBe(false);
      expect(interval).toHaveBeenCalledTimes(0);
      expect(harness.flushCalls).toBe(0);
      expect(harness.heartbeats).toEqual([]);

      initialControl.resolve(true);
      await expect(readiness).resolves.toBe("installed");
      expect(harness.installCalls).toBe(1);
      capture.emit({ code: "FIRST_AFTER_INSTALL" });
      capture.captureHandled(new Error("SECOND_AFTER_INSTALL"), { boundary: "test" });
      expect(harness.queue?.size).toBe(0);
      expect(harness.gaps?.pendingLossCount()).toBe(2);
      expect(harness.health?.snapshot().counts.DISABLED).toBe(2);
      expect(harness.heartbeats).toEqual([]);
      expect(interval).toHaveBeenCalledTimes(0);

      transfer.resolve();
      await settleMicrotasks();
      expect(interval).toHaveBeenCalledTimes(1);
      expect(harness.flushCalls).toBe(1);
      startupFlush.resolve(EMPTY_FLUSH_RESULT);
      await starting;
    } finally {
      initialControl.resolve(true);
      transfer.resolve();
      startupFlush.resolve(EMPTY_FLUSH_RESULT);
      await starting.catch(() => undefined);
      harness.flushSteps.length = 0;
      await runtime.stopCaptureRuntime({ deadlineMs: 20 });
    }
  });

  it("lets stop win a held initial sample without a late install or timer", async () => {
    vi.useFakeTimers();
    const initialControl = deferred<boolean>();
    const { harness, runtime } = await loadRuntimeHarness();
    harness.controlResponses.push(initialControl.promise);
    const interval = vi.spyOn(globalThis, "setInterval");
    const readiness = runtime.waitForCaptureEmitterInstalled({ deadlineMs: 1_000 });
    const starting = runtime.startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });
    await settleMicrotasks();

    const stopping = runtime.stopCaptureRuntime({ deadlineMs: 20 });
    await vi.advanceTimersByTimeAsync(20);
    await stopping;
    expect(await readiness).toBe("stopped");
    expect(harness.installCalls).toBe(0);
    expect(interval).toHaveBeenCalledTimes(0);

    initialControl.resolve(true);
    await starting;
    await settleMicrotasks();
    expect(harness.installCalls).toBe(0);
    expect(interval).toHaveBeenCalledTimes(0);
    expect(harness.heartbeats).toEqual([]);
  });

  it("fails closed when the initial descriptor probe rejects", async () => {
    vi.useFakeTimers();
    const { harness, runtime, capture } = await loadRuntimeHarness();
    harness.controlFailures = 1;
    await runtime.startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });
    try {
      capture.emit({ code: "AFTER_FAILED_SAMPLE" });
      expect(harness.queue?.size).toBe(0);
      expect(harness.gaps?.pendingLossCount()).toBe(1);
      expect(harness.health?.snapshot().counts.DISABLED).toBe(1);
    } finally {
      await runtime.stopCaptureRuntime({ deadlineMs: 20 });
    }
  });

  it("samples OFF independently while startup and armed sinks remain unresolved", async () => {
    vi.useFakeTimers();
    const startupFlush = deferred<FlushResult>();
    const { harness, runtime, capture } = await loadRuntimeHarness();
    harness.flushSteps.push(() => startupFlush.promise);
    const interval = vi.spyOn(globalThis, "setInterval");
    const starting = runtime.startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });
    await settleMicrotasks();
    expect(interval).toHaveBeenCalledTimes(1);
    expect(harness.flushCalls).toBe(1);

    capture.emit({ queued: "startup" });
    expect(harness.queue?.size).toBe(1);
    const heldControl = deferred<boolean>();
    harness.controlResponses.push(heldControl.promise);
    await vi.advanceTimersByTimeAsync(75);
    expect(harness.controlReads).toBe(2);
    expect(harness.maximumControlActive).toBe(1);

    heldControl.resolve(true);
    await settleMicrotasks();
    expect(harness.queue?.size).toBe(0);
    capture.emit({ direct: "startup-off" });
    capture.captureHandled(new Error("startup-off"), {});
    expect(harness.gaps?.pendingLossCount()).toBe(3);

    startupFlush.resolve(EMPTY_FLUSH_RESULT);
    await starting;
    harness.controlResponses.push(Promise.resolve(false));
    const armedFlush = deferred<FlushResult>();
    harness.flushSteps.push(() => armedFlush.promise);
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.flushCalls).toBe(2);
    capture.emit({ queued: "armed" });
    expect(harness.queue?.size).toBe(1);

    harness.controlValue = true;
    await vi.advanceTimersByTimeAsync(50);
    await settleMicrotasks();
    expect(harness.queue?.size).toBe(0);
    capture.emit({ direct: "armed-off" });
    expect(harness.gaps?.pendingLossCount()).toBe(2);
    expect(harness.maximumControlActive).toBe(1);
    expect(interval).toHaveBeenCalledTimes(1);

    harness.controlValue = false;
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    armedFlush.resolve(EMPTY_FLUSH_RESULT);
    await settleMicrotasks();
    capture.emit({ queued: "re-enabled" });
    expect(harness.queue?.size).toBe(1);
    harness.flushSteps.length = 0;
    await runtime.stopCaptureRuntime({ deadlineMs: 20 });
  });

  it("publishes current DRAINING, SPOOL_ONLY, OFF and ARMED state once per armed cycle", async () => {
    vi.useFakeTimers();
    const heldDrain = deferred<void>();
    const { harness, runtime } = await loadRuntimeHarness();
    harness.drain = heldDrain.promise;
    await runtime.startCaptureRuntime({
      runtime: "runner",
      spoolFd: undefined,
      installExitSink() {},
    });
    expect(harness.heartbeats).toEqual([]);

    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.heartbeats.at(-1)).toEqual({
      component: "capture:runner",
      state: "DRAINING",
      detailCode: "FLUSH_OK",
    });

    heldDrain.resolve();
    await settleMicrotasks();
    harness.flushSteps.push(async () => ({
      dequeued: 1,
      persisted: 0,
      spooled: 1,
      lost: 0,
    }));
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.heartbeats.at(-1)?.state).toBe("SPOOL_ONLY");

    harness.controlResponses.push(Promise.resolve(true));
    const flushCallsBeforeOff = harness.flushCalls;
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.flushCalls).toBe(flushCallsBeforeOff);
    expect(harness.heartbeats.at(-1)?.state).toBe("OFF");

    harness.controlResponses.push(Promise.resolve(false));
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.heartbeats.at(-1)?.state).toBe("ARMED");

    harness.heartbeatFailures = 1;
    harness.flushSteps.push(async () => {
      harness.health?.record(CAPTURE_HEALTH_CODES.FLUSH_OK);
      return EMPTY_FLUSH_RESULT;
    });
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    const successfulBeforeRecovery = harness.heartbeats.length;
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.heartbeats).toHaveLength(successfulBeforeRecovery + 1);
    expect(harness.heartbeats.at(-1)?.detailCode).toBe("POSTGRES_FAILURE");

    harness.flushSteps.push(async () => {
      harness.health?.record(CAPTURE_HEALTH_CODES.FLUSH_OK);
      return EMPTY_FLUSH_RESULT;
    });
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.heartbeats.at(-1)?.detailCode).toBe("FLUSH_OK");

    const beforeStop = harness.heartbeats.length;
    await runtime.stopCaptureRuntime({ deadlineMs: 20 });
    expect(harness.heartbeats).toHaveLength(beforeStop);
  });

  it("converts PostgreSQL and repeated gap-write failures into exact recoverable rows", async () => {
    vi.useFakeTimers();
    const { harness, runtime } = await loadRuntimeHarness();
    await runtime.startCaptureRuntime({
      runtime: "runner",
      spoolFd: undefined,
      installExitSink() {},
    });
    harness.flushSteps.push(async () => {
      harness.health?.record(CAPTURE_HEALTH_CODES.POSTGRES_FAILURE);
      return { dequeued: 1, persisted: 0, spooled: 1, lost: 0 };
    });
    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.gapRows.map((row) => ({
      source: row.source,
      gap_class: row.gap_class,
      lost_count: row.lost_count,
    }))).toContainEqual({
      source: "unclassified",
      gap_class: "POSTGRES_FAILURE",
      lost_count: 1,
    });

    harness.gaps?.recordLoss("first_party", CAPTURE_GAP_CLASSES.QUEUE_FULL, 3);
    harness.gapFailures.push("QUEUE_FULL", "GAP_WRITE_FAILURE");
    for (let cycle = 0; cycle < 4; cycle += 1) {
      await vi.advanceTimersByTimeAsync(25);
      await settleMicrotasks();
    }
    expect(harness.gapRows.map((row) => ({
      source: row.source,
      gap_class: row.gap_class,
      lost_count: row.lost_count,
    }))).toEqual(expect.arrayContaining([
      {
        source: "first_party",
        gap_class: "QUEUE_FULL",
        lost_count: 3,
      },
      {
        source: "unclassified",
        gap_class: "GAP_WRITE_FAILURE",
        lost_count: 2,
      },
    ]));
    await runtime.stopCaptureRuntime({ deadlineMs: 20 });
  });
});

describe.sequential("FIX-07 C4 truthful periods and product invariance", () => {
  const writerPassword = "writer-fix07-c4-only";
  let database: TestDatabase;

  function writerConnectionString(): string {
    const url = new URL(database.connectionString);
    url.username = "debateai_obs_writer";
    url.password = writerPassword;
    return url.toString();
  }

  beforeAll(async () => {
    database = await startTestDatabase();
    await database.pool.query(
      "SELECT set_config('debateai.obs_writer_password', $1, false)",
      [writerPassword],
    );
    await migrate(database.pool);
  }, 120_000);

  afterAll(async () => {
    await database?.stop();
  });

  it("echoes one landed canonical cadence through command, child, scheduler and query inputs", async () => {
    const credential = await createApiCredentialFixture();
    expect(Object.prototype.hasOwnProperty.call(
      credential.values,
      CADENCE_KEY,
    )).toBe(false);
    const canonicalEchoes: string[] = [];

    for (const [, raw, , expectedEffective] of cadenceCases) {
      const effective = withObsFlushDeadline(
        raw,
        () => readObsBounds().flushDeadlineMs,
      );
      expect(effective).toBe(expectedEffective);
      const expected = String(effective);
      await withObsFlushDeadlineAsync(expected, async () => {
        const commandEnvironment = loadDevelopmentCommandEnvironment();
        requireExactCadenceEcho(
          expected,
          commandEnvironment.OBS_FLUSH_DEADLINE_MS,
        );

        const apiEnvironments: Readonly<Record<string, string>>[] = [];
        const apiChild = createApiChild();
        let probeCount = 0;
        const api = await startDevelopmentApiProcess({
          repositoryRoot: credential.root,
          commandEnvironment,
          operations: Object.freeze({
            async probe() {
              probeCount += 1;
              return probeCount === 1
                ? null
                : Object.freeze({
                    statusCode: 401,
                    contentType: "application/json",
                    body: '{"error":"SESSION_REQUIRED"}',
                  });
            },
            startApi(environment: Readonly<Record<string, string>>) {
              apiEnvironments.push(environment);
              return apiChild;
            },
            async delay() {},
          }),
        });
        expect(apiEnvironments).toHaveLength(1);
        requireExactCadenceEcho(
          expected,
          apiEnvironments[0]!.OBS_FLUSH_DEADLINE_MS,
        );
        expect(withObsFlushDeadline(
          apiEnvironments[0]!.OBS_FLUSH_DEADLINE_MS,
          () => readObsBounds().flushDeadlineMs,
        )).toBe(effective);
        await api.stop();
        expect(apiChild.terminateCalls.count).toBe(1);

        const runnerEnvironments: Readonly<Record<string, string>>[] = [];
        const runnerChild = createRunnerChild();
        const runner = await startDevelopmentRunnerProcess({
          repositoryRoot: credential.root,
          commandEnvironment,
          operations: Object.freeze({
            async loadApiEnvironment() {
              return credential.values;
            },
            startRunner(environment: Readonly<Record<string, string>>) {
              runnerEnvironments.push(environment);
              return runnerChild;
            },
          }),
        });
        expect(runnerEnvironments).toHaveLength(1);
        requireExactCadenceEcho(
          expected,
          runnerEnvironments[0]!.OBS_FLUSH_DEADLINE_MS,
        );
        expect(withObsFlushDeadline(
          runnerEnvironments[0]!.OBS_FLUSH_DEADLINE_MS,
          () => readObsBounds().flushDeadlineMs,
        )).toBe(effective);
        await runner.stop();
        expect(runnerChild.terminateCalls.count).toBe(1);

        const schedulerEnvironment = Object.freeze({ ...process.env });
        requireExactCadenceEcho(
          expected,
          schedulerEnvironment.OBS_FLUSH_DEADLINE_MS,
        );
        const queryBind = commandEnvironment.OBS_FLUSH_DEADLINE_MS;
        requireExactCadenceEcho(expected, queryBind);
        canonicalEchoes.push(
          commandEnvironment.OBS_FLUSH_DEADLINE_MS!,
          apiEnvironments[0]!.OBS_FLUSH_DEADLINE_MS!,
          runnerEnvironments[0]!.OBS_FLUSH_DEADLINE_MS!,
          schedulerEnvironment.OBS_FLUSH_DEADLINE_MS!,
          queryBind!,
        );
      });
    }

    expect(canonicalEchoes.filter((_, index) => index % 5 === 0)).toEqual([
      "5000",
      "5000",
      "5000",
      "5000",
      "5000",
      "5000",
      "250",
      "5000",
      "7250",
      "5000",
      "5000",
    ]);
    for (let index = 0; index < canonicalEchoes.length; index += 5) {
      expect(new Set(canonicalEchoes.slice(index, index + 5)).size).toBe(1);
    }
  }, 30_000);

  it("uses elapsed effective cadence boundaries and rejects mismatched or invalid evidence", async () => {
    await withOwnerTransaction(database, async (client) => {
      const boundaryCases = [
        [undefined, 4_999, "QUIET"],
        [undefined, 5_000, "QUIET"],
        [undefined, 5_001, "OFF"],
        [undefined, 30_000, "OFF"],
        ["7250", 7_249, "QUIET"],
        ["7250", 7_250, "QUIET"],
        ["7250", 7_251, "OFF"],
        ["2147483647", 30_000, "QUIET"],
        ["2147483647", 2_147_483_647, "QUIET"],
        ["2147483647", 2_147_483_647.001, "OFF"],
        ["2147483648", 5_000, "QUIET"],
        ["9007199254740991", 5_000, "QUIET"],
      ] as const;
      for (const [raw, ageMs, expectedPeriod] of boundaryCases) {
        const effective = withObsFlushDeadline(
          raw,
          () => readObsBounds().flushDeadlineMs,
        );
        await seedHealth(client, {
          runtime: "runner",
          state: "ARMED",
          detailCode: "FLUSH_OK",
          ageMs,
        });
        const result = await queryPeriods(
          client,
          String(effective),
        );
        expect(result.bind).toBe(String(effective));
        expect(result.rows.map((row) => row.runtime)).toEqual([
          "api",
          "runner",
          "scheduler",
        ]);
        expect(result.rows.find((row) => row.runtime === "runner")?.period)
          .toBe(expectedPeriod);
      }

      await seedHealth(client, {
        runtime: "runner",
        state: "ARMED",
        detailCode: "FLUSH_OK",
        ageMs: 6_000,
      });
      expect((await queryPeriods(client, "5000")).rows
        .find((row) => row.runtime === "runner")?.period).toBe("OFF");
      expect((await queryPeriods(client, "7250")).rows
        .find((row) => row.runtime === "runner")?.period).toBe("QUIET");
    });

    let acceptedMismatches = 0;
    for (const actual of [
      undefined,
      "",
      "malformed",
      "0",
      "1.5",
      "9007199254740992",
      "5000",
    ] as const) {
      expect(() => {
        requireExactCadenceEcho("7250", actual);
        acceptedMismatches += 1;
      }).toThrow("FIX07_CADENCE_ECHO_MISMATCH");
    }
    expect(acceptedMismatches).toBe(0);

    for (const invalid of [
      0,
      -1,
      "1.5",
      "2147483648",
      "9007199254740991",
      "9007199254740992",
      undefined,
    ]) {
      let acceptedPeriodEvidence = false;
      try {
        const result = await database.pool.query<PeriodRow>(
          FIX07_PERIOD_QUERY,
          [invalid],
        );
        acceptedPeriodEvidence = result.rows.length === 3;
      } catch {
        acceptedPeriodEvidence = false;
      }
      expect(acceptedPeriodEvidence).toBe(false);
    }

    expect(FIX07_PERIOD_QUERY).toContain(
      "EXTRACT(EPOCH FROM (p.evaluated_at - h.observed_at)) * 1000",
    );
    expect(FIX07_PERIOD_QUERY).toContain(
      "WHERE flush_interval_ms BETWEEN 1 AND 2147483647",
    );
    expect(FIX07_PERIOD_QUERY).not.toMatch(
      /h\.observed_at\s*[<>]=?\s*p\.period_cutoff/u,
    );
  });

  it("classifies the exhaustive OFF BLIND ACTIVE QUIET matrix in lexical order", async () => {
    const scenarios = [
      { label: "missing health", expected: "OFF", setup: async () => {} },
      {
        label: "stale health",
        expected: "OFF",
        setup: (client: PoolClient) => seedHealth(client, {
          runtime: "runner",
          state: "ARMED",
          detailCode: "FLUSH_OK",
          ageMs: 5_001,
        }),
      },
      {
        label: "fresh OFF",
        expected: "OFF",
        setup: (client: PoolClient) => seedHealth(client, {
          runtime: "runner",
          state: "OFF",
          detailCode: "DISABLED",
          ageMs: 0,
        }),
      },
      {
        label: "fresh historical STOPPED",
        expected: "OFF",
        setup: (client: PoolClient) => seedHealth(client, {
          runtime: "runner",
          state: "STOPPED",
          detailCode: "FLUSH_OK",
          ageMs: 0,
        }),
      },
      {
        label: "fresh SPOOL_ONLY",
        expected: "BLIND",
        setup: (client: PoolClient) => seedHealth(client, {
          runtime: "runner",
          state: "SPOOL_ONLY",
          detailCode: "FLUSH_OK",
          ageMs: 0,
        }),
      },
      {
        label: "fresh failure detail",
        expected: "BLIND",
        setup: (client: PoolClient) => seedHealth(client, {
          runtime: "runner",
          state: "ARMED",
          detailCode: "POSTGRES_FAILURE",
          ageMs: 0,
        }),
      },
      {
        label: "open gap",
        expected: "BLIND",
        setup: async (client: PoolClient) => {
          await seedHealth(client, {
            runtime: "runner",
            state: "ARMED",
            detailCode: "FLUSH_OK",
            ageMs: 0,
          });
          await client.query(
            `INSERT INTO obs.capture_gap
               (source, gap_class, lost_count, opened_at, closed_at)
             VALUES (
               'unclassified', 'POSTGRES_FAILURE', 1,
               transaction_timestamp() - interval '2 minutes', NULL
             )`,
          );
        },
      },
      {
        label: "recent closed gap",
        expected: "BLIND",
        setup: async (client: PoolClient) => {
          await seedHealth(client, {
            runtime: "runner",
            state: "ARMED",
            detailCode: "FLUSH_OK",
            ageMs: 0,
          });
          await client.query(
            `INSERT INTO obs.capture_gap
               (source, gap_class, lost_count, opened_at, closed_at)
             VALUES (
               'unclassified', 'GAP_WRITE_FAILURE', 1,
               transaction_timestamp() - interval '2 seconds',
               transaction_timestamp() - interval '1 second'
             )`,
          );
        },
      },
      {
        label: "recent occurrence",
        expected: "ACTIVE",
        setup: async (client: PoolClient) => {
          await seedHealth(client, {
            runtime: "runner",
            state: "ARMED",
            detailCode: "FLUSH_OK",
            ageMs: 0,
          });
          await seedOccurrence(client, "runner", 1_000, "fix07-recent");
        },
      },
      {
        label: "zero occurrence",
        expected: "QUIET",
        setup: (client: PoolClient) => seedHealth(client, {
          runtime: "runner",
          state: "ARMED",
          detailCode: "FLUSH_OK",
          ageMs: 0,
        }),
      },
      {
        label: "old occurrence",
        expected: "QUIET",
        setup: async (client: PoolClient) => {
          await seedHealth(client, {
            runtime: "runner",
            state: "ARMED",
            detailCode: "FLUSH_OK",
            ageMs: 0,
          });
          await seedOccurrence(client, "runner", 60_001, "fix07-old");
        },
      },
    ] as const;

    for (const scenario of scenarios) {
      await withOwnerTransaction(database, async (client) => {
        await scenario.setup(client);
        const rows = (await queryPeriods(client, "5000")).rows;
        expect(
          rows,
          scenario.label,
        ).toEqual([
          { runtime: "api", period: "OFF" },
          { runtime: "runner", period: scenario.expected },
          { runtime: "scheduler", period: "OFF" },
        ]);
        expect(rows.every((row) =>
          ["OFF", "BLIND", "ACTIVE", "QUIET"].includes(row.period)))
          .toBe(true);
      });
    }
  });

  it("lets either replica refresh one 7250ms lease and expires only after both stop", async () => {
    const { createPostgresCaptureSink } = await import(
      "../../packages/obs-capture/src/runtime/sink.js"
    );
    const replicaA = createPostgresCaptureSink({
      connectionString: writerConnectionString(),
    });
    const replicaB = createPostgresCaptureSink({
      connectionString: writerConnectionString(),
    });
    try {
      await replicaA.writeComponentHealth({
        component: "capture:runner",
        state: "ARMED",
        detailCode: "FLUSH_OK",
      });
      await replicaB.writeComponentHealth({
        component: "capture:runner",
        state: "ARMED",
        detailCode: "FLUSH_OK",
      });
      await replicaB.close();
      await replicaA.writeComponentHealth({
        component: "capture:runner",
        state: "ARMED",
        detailCode: "FLUSH_OK",
      });
      expect((await queryPeriods(database.pool, "7250")).rows
        .find((row) => row.runtime === "runner")?.period).not.toBe("OFF");
    } finally {
      await Promise.allSettled([replicaA.close(), replicaB.close()]);
    }

    await database.pool.query(
      `UPDATE obs.component_health
          SET observed_at = transaction_timestamp()
            - (7250.001 * interval '1 millisecond')
        WHERE component = 'capture:runner'`,
    );
    expect((await queryPeriods(database.pool, "7250")).rows
      .find((row) => row.runtime === "runner")?.period).toBe("OFF");
  });

  it("keeps scheduler failure bytes identical across ON OFF absent and failed controls", async () => {
    const onControlDirectory = await mkdtemp(join(tmpdir(), "fix07-product-on-"));
    const offControlDirectory = await mkdtemp(join(tmpdir(), "fix07-product-off-"));
    scratchDirectories.push(onControlDirectory, offControlDirectory);
    await writeFile(join(offControlDirectory, "CAPTURE_OFF"), "off\n");
    const before = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM obs.occurrence
        WHERE runtime = 'scheduler'`,
    );
    const program = [
      'import { setTimeout as delay } from "node:timers/promises";',
      'import { runJobWithLifecycle } from "./apps/scheduler/src/index.ts";',
      "const mode = process.env.FIX07_PRODUCT_MODE;",
      "let runtime;",
      "if (mode !== 'absent') {",
      '  runtime = await import("@debateai/obs-capture/runtime");',
      "  await runtime.startCaptureRuntime({ runtime: 'scheduler', spoolFd: undefined, installExitSink() {} });",
      "  if (mode === 'failed-controls') await delay(40);",
      "}",
      "const planted = Object.freeze({ code: 'FIX07_PRODUCT_FAILURE' });",
      "let sameError = false;",
      "try { await runJobWithLifecycle('replay-self-test', async () => { throw planted; }); }",
      "catch (error) { sameError = error === planted; }",
      "if (runtime !== undefined) await runtime.stopCaptureRuntime({ deadlineMs: 1000 });",
      "process.stdout.write(JSON.stringify({ sameError }));",
      "process.exitCode = 37;",
    ].join("\n");

    function runProduct(mode: "absent" | "on" | "off" | "failed-controls") {
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_NO_WARNINGS: "1",
        FIX07_PRODUCT_MODE: mode,
        OBS_FLUSH_DEADLINE_MS: mode === "failed-controls" ? "10" : "60000",
        OBS_WRITER_DATABASE_URL: mode === "failed-controls"
          ? "postgresql://127.0.0.1:1/fix07"
          : writerConnectionString(),
      };
      if (mode === "on") environment.OBS_CONTROL_DIR = onControlDirectory;
      else if (mode === "off") environment.OBS_CONTROL_DIR = offControlDirectory;
      else if (mode === "failed-controls") {
        environment.OBS_CONTROL_DIR = `/${"x".repeat(5_000)}`;
      } else {
        delete environment.OBS_CONTROL_DIR;
      }
      const child = spawnSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", program],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: environment,
        },
      );
      return Object.freeze({
        status: child.status,
        signal: child.signal,
        stdout: child.stdout,
        stderr: child.stderr,
      });
    }

    const absent = runProduct("absent");
    const afterAbsent = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM obs.occurrence
        WHERE runtime = 'scheduler'`,
    );
    const on = runProduct("on");
    const afterOn = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM obs.occurrence
        WHERE runtime = 'scheduler'`,
    );
    const off = runProduct("off");
    const afterOff = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM obs.occurrence
        WHERE runtime = 'scheduler'`,
    );
    const failedControls = runProduct("failed-controls");

    expect(absent).toEqual({
      status: 37,
      signal: null,
      stdout: '{"sameError":true}',
      stderr: "",
    });
    expect(on).toEqual(absent);
    expect(off).toEqual(absent);
    expect(failedControls).toEqual(absent);
    expect(afterAbsent.rows).toEqual(before.rows);
    expect(Number(afterOn.rows[0]!.count) - Number(before.rows[0]!.count))
      .toBe(2);
    expect(afterOff.rows).toEqual(afterOn.rows);

    const disabled = await database.pool.query<{
      source: string;
      gap_class: string;
      lost_count: string;
    }>(
      `SELECT source, gap_class, lost_count::text AS lost_count
         FROM obs.capture_gap
        WHERE source = 'first_party' AND gap_class = 'DISABLED'
        ORDER BY opened_at DESC
        LIMIT 1`,
    );
    expect(disabled.rows).toEqual([{
      source: "first_party",
      gap_class: "DISABLED",
      lost_count: "2",
    }]);
  }, 30_000);
});
