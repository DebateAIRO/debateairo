import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SUPPORT_SWITCH_BOUND_MS,
  runSupportSwitchProofSuite,
  type SupportObservationEvent,
  type SupportReservationEvent,
  type SupportSubmissionKind,
  type SupportSwitchSystemUnderTest
} from "../../acceptance/support-switch-proof.js";
import {
  startCliRelayServer,
  type CliRelayAdapter,
  type CliRelayHandle
} from "../../acceptance/relay-core.js";
import * as databaseApi from "../../packages/db/src/index.js";
import {
  SUPPORT_CONFIGURATION_KEYS,
  createPostgresRegisterPublicationPort,
  createSupportConfigurationPort,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  type SupportConfigurationKey,
  type SupportPublicationReceipt
} from "../../packages/register/src/index.js";
import {
  importHistoricalRegisterFixture,
  registerFixtureRow
} from "../support/registerFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

type SupportPoolFactory = (connectionString: string) => Pool;

const SUPPORT_VALUES: Readonly<Record<SupportConfigurationKey, unknown>> = Object.freeze({
  support_enabled: true,
  support_model_ref: "development:claude-cli",
  support_relay_concurrency: 2,
  support_daily_call_cap: 500,
  support_limit_anon_msgs_10m: 20,
  support_limit_anon_msgs_24h: 100,
  support_limit_anon_sessions_1h: 5,
  support_limit_session_msgs: 40,
  support_limit_msg_chars: 2000,
  support_limit_account_msgs_10m: 60,
  support_limit_account_msgs_24h: 300,
  support_queue_depth: 10,
  support_lock_after_injections: 3,
  support_ip_cooldown_minutes: 60,
  support_retention_policy: "keep",
  support_retention_ratified_by: null
});

let database: TestDatabase;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<Readonly<{
    resolve(value: IteratorResult<T>): void;
    reject(error: unknown): void;
  }>> = [];
  private closed = false;
  private failure: unknown;

  push(value: T): void {
    if (this.closed) throw new Error("EVENT_QUEUE_CLOSED");
    const waiter = this.waiters.shift();
    if (waiter === undefined) this.values.push(value);
    else waiter.resolve({ done: false, value });
  }

  fail(error: unknown): void {
    if (this.closed) return;
    this.failure = error;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ done: true, value: undefined });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async (): Promise<IteratorResult<T>> => {
        const value = this.values.shift();
        if (value !== undefined) return { done: false, value };
        if (this.failure !== undefined) throw this.failure;
        if (this.closed) return { done: true, value: undefined };
        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
        });
      }
    };
  }
}

const READER_CONSUMER_SOURCE = String.raw`
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.RSP_PROJECT_ROOT;
const connectionString = process.env.RSP_CONNECTION_STRING;
const processId = process.env.RSP_PROCESS_ID;
if (!root || !connectionString || !processId) throw new Error("READER_ENV_INVALID");
const databaseApi = await import(pathToFileURL(join(root, "packages/db/src/index.ts")).href);
const registerApi = await import(pathToFileURL(join(root, "packages/register/src/index.ts")).href);
const ordinaryPool = databaseApi.createPool(connectionString);
const controlPool = databaseApi.createSupportControlPlanePool(connectionString);
if (ordinaryPool === controlPool || controlPool.options.max !== 2) {
  throw new Error("CONTROL_POOL_NOT_INDEPENDENT_MAX_TWO");
}
const ordinaryPoolId = randomUUID();
const controlPoolId = randomUUID();
const ordinaryMaximum = ordinaryPool.options.max;
if (ordinaryMaximum !== 10) throw new Error("ORDINARY_POOL_MAX_INVALID");
const heldOrdinaryClients = [];
for (let index = 0; index < ordinaryMaximum; index += 1) {
  heldOrdinaryClients.push(await ordinaryPool.connect());
}

let nextConfigStress;
let capturedConfigStress;
const delayedControlPool = new Proxy(controlPool, {
  get(target, property) {
    if (property === "connect") {
      return async () => {
        const client = await target.connect();
        return new Proxy(client, {
          get(clientTarget, clientProperty) {
            if (clientProperty === "query") {
              return async (...args) => {
                const query = typeof args[0] === "string" ? args[0] : args[0]?.text;
                if (nextConfigStress !== undefined
                    && typeof query === "string"
                    && query.includes("read_support_configuration_status")) {
                  const stress = nextConfigStress;
                  nextConfigStress = undefined;
                  const startedAt = performance.now();
                  await clientTarget.query(
                    "SELECT pg_sleep($1::double precision)",
                    [stress.delayMs / 1_000]
                  );
                  capturedConfigStress = {
                    ...stress,
                    measuredDelayMs: performance.now() - startedAt
                  };
                }
                return clientTarget.query(...args);
              };
            }
            const value = Reflect.get(clientTarget, clientProperty, clientTarget);
            return typeof value === "function" ? value.bind(clientTarget) : value;
          }
        });
      };
    }
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  }
});
const configuration = registerApi.createSupportConfigurationPort(delayedControlPool);
const usedNonces = new Set();
let nextEventLoopStress;
let stopped = false;
let observationPaused = false;
let observing;

function emit(value) {
  process.stdout.write(JSON.stringify(value) + "\n");
}

async function eventLoopDelay(state) {
  const available = state.kind === "AVAILABLE";
  const enabled = available && state.snapshot.values.supportEnabled;
  const stress = nextEventLoopStress;
  const consumesStress = stress !== undefined
    && available
    && !enabled
    && state.snapshot.supportRegisterVersion === stress.supportRegisterVersion;
  const requestedDelayMs = consumesStress ? stress.delayMs : 0;
  if (consumesStress) nextEventLoopStress = undefined;
  const startedAt = performance.now();
  const timer = new Promise((resolve) => setTimeout(resolve, 0));
  const stopAt = performance.now() + requestedDelayMs;
  while (performance.now() < stopAt) {}
  await timer;
  return {
    measuredDelayMs: performance.now() - startedAt,
    run: consumesStress ? stress.run : null,
    supportRegisterVersion: consumesStress ? stress.supportRegisterVersion : null
  };
}

async function observe() {
  if (stopped || observationPaused) return;
  if (observing !== undefined) return observing;
  observing = (async () => {
    const state = await configuration.current();
    const configStress = capturedConfigStress;
    capturedConfigStress = undefined;
    const eventLoopStress = await eventLoopDelay(state);
    const available = state.kind === "AVAILABLE";
    const enabled = available && state.snapshot.values.supportEnabled;
    const configStressMatches = configStress !== undefined
      && available
      && !enabled
      && state.snapshot.supportRegisterVersion === configStress.supportRegisterVersion;
    const measuredConfigQueryDelayMs = configStress?.measuredDelayMs ?? 0;
    const measuredEventLoopDelayMs = eventLoopStress.measuredDelayMs;
    const unhealthy = measuredConfigQueryDelayMs > 250 || measuredEventLoopDelayMs > 250;
    emit({
      type: "observation",
      event: {
        processId,
        processPid: process.pid,
        ordinaryPoolId,
        controlPoolId,
        ordinaryPoolExhausted: heldOrdinaryClients.length === ordinaryMaximum,
        state: enabled ? "ENABLED" : "DISABLED",
        supportRegisterVersion: available ? state.snapshot.supportRegisterVersion : null,
        atMs: Date.now(),
        configQueryDelayMs: measuredConfigQueryDelayMs,
        eventLoopDelayMs: measuredEventLoopDelayMs,
        configQueryStressRun: configStressMatches ? configStress.run : null,
        configQueryStressRegisterVersion: configStressMatches
          ? configStress.supportRegisterVersion : null,
        eventLoopStressRun: eventLoopStress.run,
        eventLoopStressRegisterVersion: eventLoopStress.supportRegisterVersion,
        health: unhealthy ? "PROCESS_UNHEALTHY" : "HEALTHY"
      }
    });
  })().finally(() => {
    observing = undefined;
  });
  return observing;
}

async function reserve(kind, nonce, force = false) {
  if (usedNonces.has(nonce)) return { reserved: false, code: "NONCE_ALREADY_RESERVED" };
  const state = await configuration.current();
  if (state.kind !== "AVAILABLE") {
    return { reserved: false, code: "SUPPORT_DISABLED" };
  }
  if (!force && !state.snapshot.values.supportEnabled) {
    return { reserved: false, code: "SUPPORT_DISABLED" };
  }
  usedNonces.add(nonce);
  const event = Object.freeze({
    processId,
    processPid: process.pid,
    ordinaryPoolId,
    controlPoolId,
    ordinaryPoolExhausted: heldOrdinaryClients.length === ordinaryMaximum,
    kind,
    nonce,
    reservationId: randomUUID(),
    supportRegisterVersion: state.snapshot.supportRegisterVersion,
    atMs: Date.now(),
    immutable: true,
    singleUse: true
  });
  emit({ type: "reservation", event });
  return { reserved: true, event };
}

const interval = setInterval(() => {
  void observe().catch((error) => {
    emit({ type: "fatal", message: error instanceof Error ? error.message : String(error) });
  });
}, 500);
void observe().catch((error) => {
  emit({ type: "fatal", message: error instanceof Error ? error.message : String(error) });
});
emit({
  type: "ready",
  processId,
  processPid: process.pid,
  ordinaryPoolId,
  controlPoolId,
  ordinaryPoolExhausted: heldOrdinaryClients.length === ordinaryMaximum
});

async function shutdown() {
  stopped = true;
  clearInterval(interval);
  if (observing !== undefined) await observing;
  await configuration.close();
  for (const client of heldOrdinaryClients) client.release();
  await ordinaryPool.end();
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let commands = Promise.resolve();
input.on("line", (line) => {
  commands = commands.then(async () => {
    const command = JSON.parse(line);
    if (command.action === "arm-stress") {
      if (![1, 2, 3].includes(command.run)
          || typeof command.configQueryDelayMs !== "number"
          || typeof command.eventLoopDelayMs !== "number") {
        throw new Error("READER_STRESS_COMMAND_INVALID");
      }
      observationPaused = true;
      if (observing !== undefined) await observing;
      nextConfigStress = command.configQueryDelayMs > 0 ? {
        delayMs: command.configQueryDelayMs,
        run: command.run
      } : undefined;
      nextEventLoopStress = command.eventLoopDelayMs > 0 ? {
        delayMs: command.eventLoopDelayMs,
        run: command.run
      } : undefined;
      emit({ type: "result", requestId: command.requestId, reserved: false });
      return;
    }
    if (command.action === "activate-stress") {
      if (typeof command.supportRegisterVersion !== "string"
          || (nextConfigStress === undefined && nextEventLoopStress === undefined)) {
        throw new Error("READER_STRESS_ACTIVATION_INVALID");
      }
      if (nextConfigStress !== undefined) {
        nextConfigStress.supportRegisterVersion = command.supportRegisterVersion;
      }
      if (nextEventLoopStress !== undefined) {
        nextEventLoopStress.supportRegisterVersion = command.supportRegisterVersion;
      }
      observationPaused = false;
      await observe();
      emit({ type: "result", requestId: command.requestId, reserved: false });
      return;
    }
    if (command.action === "reserve" || command.action === "submit"
        || command.action === "mutant-reserve") {
      const result = await reserve(
        command.kind,
        command.nonce,
        command.action === "mutant-reserve"
      );
      emit({ type: "result", requestId: command.requestId, ...result });
      return;
    }
    if (command.action === "shutdown") {
      await shutdown();
      emit({ type: "result", requestId: command.requestId, reserved: false });
      input.close();
      setImmediate(() => process.exit(0));
      return;
    }
    throw new Error("READER_COMMAND_INVALID");
  }).catch((error) => {
    emit({
      type: "fatal",
      requestId: JSON.parse(line)?.requestId,
      message: error instanceof Error ? error.message : String(error)
    });
  });
});
`;

interface ReaderCommandResult {
  readonly reserved: boolean;
  readonly event?: SupportReservationEvent;
}

interface ReaderReady {
  readonly processId: string;
  readonly processPid: number;
  readonly ordinaryPoolId: string;
  readonly controlPoolId: string;
  readonly ordinaryPoolExhausted: boolean;
}

interface ReaderConsumer {
  readonly ready: ReaderReady;
  command(
    action: "arm-stress" | "activate-stress" | "reserve" | "submit" | "mutant-reserve",
    input?: Readonly<{
      kind?: SupportSubmissionKind;
      nonce?: string;
      configQueryDelayMs?: number;
      eventLoopDelayMs?: number;
      run?: 1 | 2 | 3;
      supportRegisterVersion?: string;
    }>
  ): Promise<ReaderCommandResult>;
  close(): Promise<void>;
}

async function spawnReaderConsumer(input: Readonly<{
  processId: string;
  connectionString: string;
  observations: AsyncEventQueue<SupportObservationEvent>;
  reservations: AsyncEventQueue<SupportReservationEvent>;
}>): Promise<ReaderConsumer> {
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  const child = spawn(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval", READER_CONSUMER_SOURCE
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      RSP_PROJECT_ROOT: projectRoot,
      RSP_CONNECTION_STRING: input.connectionString,
      RSP_PROCESS_ID: input.processId
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  if (child.pid === undefined) throw new Error("READER_PROCESS_NOT_SPAWNED");
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-8_192);
  });
  let settledReady = false;
  let resolveReady!: (ready: ReaderReady) => void;
  let rejectReady!: (error: unknown) => void;
  const readyPromise = new Promise<ReaderReady>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const pending = new Map<string, Readonly<{
    resolve(result: ReaderCommandResult): void;
    reject(error: unknown): void;
  }>>();
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on("line", (line) => {
    try {
      const message = JSON.parse(line) as Readonly<{
        type: string;
        requestId?: string;
        message?: string;
        event?: SupportObservationEvent | SupportReservationEvent;
        reserved?: boolean;
        processId?: string;
        processPid?: number;
        ordinaryPoolId?: string;
        controlPoolId?: string;
        ordinaryPoolExhausted?: boolean;
      }>;
      if (message.type === "ready") {
        if (typeof message.processId !== "string" || typeof message.processPid !== "number"
            || message.processPid !== child.pid
            || typeof message.ordinaryPoolId !== "string" || typeof message.controlPoolId !== "string"
            || message.ordinaryPoolExhausted !== true) {
          throw new Error("READER_READY_INVALID");
        }
        settledReady = true;
        resolveReady({
          processId: message.processId,
          processPid: message.processPid,
          ordinaryPoolId: message.ordinaryPoolId,
          controlPoolId: message.controlPoolId,
          ordinaryPoolExhausted: message.ordinaryPoolExhausted
        });
        return;
      }
      if (message.type === "observation" && message.event !== undefined) {
        input.observations.push(message.event as SupportObservationEvent);
        return;
      }
      if (message.type === "reservation" && message.event !== undefined) {
        input.reservations.push(message.event as SupportReservationEvent);
        return;
      }
      if (message.type === "result" && message.requestId !== undefined) {
        const waiter = pending.get(message.requestId);
        if (waiter === undefined) throw new Error("READER_RESULT_UNEXPECTED");
        pending.delete(message.requestId);
        waiter.resolve({
          reserved: message.reserved === true,
          ...(message.event === undefined
            ? {} : { event: message.event as SupportReservationEvent })
        });
        return;
      }
      if (message.type === "fatal") {
        const error = new Error(`READER_FATAL:${message.message ?? "UNKNOWN"}`);
        if (message.requestId !== undefined) {
          pending.get(message.requestId)?.reject(error);
          pending.delete(message.requestId);
        } else {
          input.observations.fail(error);
          input.reservations.fail(error);
        }
      }
    } catch (error) {
      input.observations.fail(error);
      input.reservations.fail(error);
    }
  });
  child.once("exit", (code, signal) => {
    const error = new Error(
      `READER_EXITED:code=${String(code)}:signal=${String(signal)}:stderr=${stderr}`
    );
    if (!settledReady) rejectReady(error);
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });
  const ready = await Promise.race([
    readyPromise,
    sleep(15_000).then(() => Promise.reject(new Error(`READER_READY_TIMEOUT:${stderr}`)))
  ]);
  let closed = false;
  const command = async (
    action: "arm-stress" | "activate-stress" | "reserve" | "submit" | "mutant-reserve"
      | "shutdown",
    commandInput: Readonly<Record<string, unknown>> = {}
  ): Promise<ReaderCommandResult> => {
    const requestId = randomUUID();
    const result = new Promise<ReaderCommandResult>((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
    });
    child.stdin.write(`${JSON.stringify({ requestId, action, ...commandInput })}\n`);
    return result;
  };
  return {
    ready,
    command(action, commandInput = {}) {
      return command(action, commandInput);
    },
    async close() {
      if (closed) return;
      closed = true;
      if (child.exitCode === null && child.signalCode === null) {
        await command("shutdown").catch(() => undefined);
        await Promise.race([
          new Promise<void>((resolve) => child.once("close", () => resolve())),
          sleep(5_000).then(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
          })
        ]);
      }
      lines.close();
    }
  };
}

interface PhysicalSupportSwitchSut extends SupportSwitchSystemUnderTest {
  readonly readerPids: readonly number[];
  readonly spawnRecorderPids: readonly number[];
  readonly gapViolationEvidence: readonly Readonly<{
    nonce: string;
    reservationAtMs: number;
    postBoundAtMs: number;
  }>[];
  close(): Promise<void>;
}

function postRelay(input: Readonly<{
  relay: CliRelayHandle;
  nonce: string;
  holdPartial: boolean;
}>): Promise<Readonly<{
  release(): void;
  completion: Promise<void>;
}>> {
  const body = Buffer.from(JSON.stringify({
    model: "fixture:support-switch",
    messages: [{ role: "user", content: `support-switch-nonce:${input.nonce}` }]
  }), "utf8");
  const firstLength = Math.max(1, Math.floor(body.byteLength / 2));
  let responseStarted = false;
  let released = false;
  let resolveWritten!: () => void;
  let rejectWritten!: (error: unknown) => void;
  const written = new Promise<void>((resolve, reject) => {
    resolveWritten = resolve;
    rejectWritten = reject;
  });
  let resolveCompletion!: () => void;
  let rejectCompletion!: (error: unknown) => void;
  const completion = new Promise<void>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  const request = httpRequest(`${input.relay.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: input.relay.authorizationHeader,
      "content-type": "application/json",
      "content-length": body.byteLength
    }
  }, (response) => {
    responseStarted = true;
    response.resume();
    response.once("end", () => {
      if (response.statusCode === 200) resolveCompletion();
      else rejectCompletion(new Error(`RELAY_STATUS_${String(response.statusCode)}`));
    });
  });
  request.once("error", (error) => {
    rejectWritten(error);
    rejectCompletion(error);
  });
  if (input.holdPartial) {
    request.write(body.subarray(0, firstLength), resolveWritten);
  } else {
    request.end(body, resolveWritten);
  }
  void completion.catch(() => undefined);
  return written.then(async () => {
    if (input.holdPartial) {
      await sleep(75);
      if (responseStarted) throw new Error("RELAY_RESPONDED_TO_PARTIAL_BODY");
    }
    return Object.freeze({
      release() {
        if (released) throw new Error("RELAY_BODY_ALREADY_RELEASED");
        released = true;
        if (input.holdPartial) request.end(body.subarray(firstLength));
      },
      completion
    });
  });
}

async function postCommitAck(receipt: SupportPublicationReceipt): Promise<number> {
  while (Date.now() <= receipt.recordedAt.getTime()) await sleep(1);
  return Date.now();
}

async function createPhysicalSupportSwitchSut(
  testDatabase: TestDatabase,
  options: Readonly<{ gapViolationKind?: SupportSubmissionKind }> = {}
): Promise<PhysicalSupportSwitchSut> {
  const observations = new AsyncEventQueue<SupportObservationEvent>();
  const reservations = new AsyncEventQueue<SupportReservationEvent>();
  const spawns = new AsyncEventQueue<Readonly<{ nonce: string; atMs: number }>>();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "support-switch-proof-"));
  const spawnEventPath = join(temporaryDirectory, "actual-spawns.jsonl");
  await writeFile(spawnEventPath, "", "utf8");
  const spawnRecorderPids: number[] = [];
  const observedSpawnNonces: string[] = [];
  let spawnEventBytes = 0;
  let readingSpawnEvents = false;
  const spawnPoll = setInterval(() => {
    if (readingSpawnEvents) return;
    readingSpawnEvents = true;
    void readFile(spawnEventPath).then((bytes) => {
      const unread = bytes.subarray(spawnEventBytes).toString("utf8");
      const completedAt = unread.lastIndexOf("\n");
      if (completedAt < 0) return;
      const completed = unread.slice(0, completedAt + 1);
      spawnEventBytes += Buffer.byteLength(completed);
      for (const line of completed.trim().split("\n")) {
        if (line.length === 0) continue;
        const event = JSON.parse(line) as Readonly<{
          nonce: unknown;
          atMs: unknown;
          pid: unknown;
        }>;
        if (typeof event.nonce !== "string" || typeof event.atMs !== "number"
            || typeof event.pid !== "number" || !Number.isSafeInteger(event.pid)
            || event.pid < 1) {
          throw new Error("SPAWN_RECORDER_EVENT_INVALID");
        }
        spawnRecorderPids.push(event.pid);
        observedSpawnNonces.push(event.nonce);
        spawns.push(Object.freeze({ nonce: event.nonce, atMs: event.atMs }));
      }
    }).catch((error) => spawns.fail(error)).finally(() => {
      readingSpawnEvents = false;
    });
  }, 10);

  const recorderPath = fileURLToPath(new URL(
    "../../acceptance/fixtures/support-switch-spawn-recorder.mjs",
    import.meta.url
  ));
  const relayAdapter: CliRelayAdapter = Object.freeze({
    maker: "Support switch spawn recorder",
    authEnvironmentKeys: Object.freeze([]),
    testEnvironmentKeys: Object.freeze([]),
    failureCode: "SUPPORT_SWITCH_RECORDER_FAILED",
    timeoutCode: "SUPPORT_SWITCH_RECORDER_TIMEOUT",
    buildArguments(prompt: string) {
      return Object.freeze([prompt]);
    },
    parseCompletion(stdout: string) {
      const parsed = JSON.parse(stdout) as Readonly<{ content?: unknown; model?: unknown }>;
      if (typeof parsed.content !== "string" || typeof parsed.model !== "string") {
        throw new Error("SUPPORT_SWITCH_RECORDER_OUTPUT_INVALID");
      }
      return Object.freeze({ content: parsed.content, model: parsed.model, usage: null });
    }
  });
  let relay: CliRelayHandle | undefined;
  let readers: readonly ReaderConsumer[] = [];
  let domPort: ReturnType<typeof createSupportConfigurationPort> | undefined;
  let domPool: Pool | undefined;
  const pendingRelayRequests = new Set<Promise<void>>();
  const heldReleases = new Set<() => void>();
  const gapViolationEvidence: Array<Readonly<{
    nonce: string;
    reservationAtMs: number;
    postBoundAtMs: number;
  }>> = [];
  let activePostBoundAtMs: number | undefined;
  let gapViolationInjected = false;
  let closed = false;
  try {
    relay = await startCliRelayServer({
      port: 0,
      timeoutMs: 5_000,
      command: Object.freeze({
        binary: process.execPath,
        prefixArguments: Object.freeze([recorderPath, spawnEventPath])
      }),
      adapter: relayAdapter
    });
    readers = await Promise.all(["process-a", "process-b"].map((processId) =>
      spawnReaderConsumer({
        processId,
        connectionString: testDatabase.connectionString,
        observations,
        reservations
      })));
    domPool = supportPoolFactory()(testDatabase.connectionString);
    domPort = createSupportConfigurationPort(domPool);
    const publisher = createPostgresRegisterPublicationPort(testDatabase.pool);
    const initial = await publisher.readSupportStatus();
    if (initial === null) throw new Error("SUPPORT_STATUS_UNINITIALIZED");
    let supportRegisterVersion = initial.supportRegisterVersion;
    let publicationSequence = 0;
    let offRun = 0;

    const publish = async (enabled: boolean): Promise<Readonly<{
      receipt: SupportPublicationReceipt;
      commitAcknowledgedAtMs: number;
    }>> => {
      publicationSequence += 1;
      let run: 1 | 2 | 3 | undefined;
      if (!enabled) {
        offRun += 1;
        if (offRun > 3) throw new Error("SUPPORT_SWITCH_OFF_RUN_INVALID");
        run = offRun as 1 | 2 | 3;
        await Promise.all([
          readers[0]!.command("arm-stress", {
            configQueryDelayMs: 100,
            eventLoopDelayMs: 0,
            run
          }),
          readers[1]!.command("arm-stress", {
            configQueryDelayMs: 0,
            eventLoopDelayMs: 100,
            run
          })
        ]);
      }
      const receipt = await publisher.publishSupport({
        publicationId: randomUUID(),
        baseRegisterVersion: parseRegisterVersionText(supportRegisterVersion),
        expectedSupportRegisterVersion: parseRegisterVersionText(supportRegisterVersion),
        schemaVersion: 1,
        patch: Object.freeze([{
          key: "support_enabled",
          valueJsonText: parseCanonicalRegisterJson(Buffer.from(enabled ? "true" : "false", "utf8"))
        }]),
        sourceRef: `fixture:support-switch:${publicationSequence}`
      });
      supportRegisterVersion = receipt.registerVersion;
      const commitAcknowledgedAtMs = await postCommitAck(receipt);
      activePostBoundAtMs = enabled
        ? undefined
        : commitAcknowledgedAtMs + SUPPORT_SWITCH_BOUND_MS;
      if (run !== undefined) {
        await Promise.all([
          readers[0]!.command("activate-stress", {
            supportRegisterVersion: receipt.registerVersion
          }),
          readers[1]!.command("activate-stress", {
            supportRegisterVersion: receipt.registerVersion
          })
        ]);
      }
      return Object.freeze({ receipt, commitAcknowledgedAtMs });
    };

    const sut: PhysicalSupportSwitchSut = {
      readerPids: Object.freeze(readers.map((reader) => reader.ready.processPid)),
      spawnRecorderPids,
      gapViolationEvidence,
      publishOff: () => publish(false),
      publishOn: () => publish(true),
      reservationEvents: () => reservations,
      observationEvents: () => observations,
      actualSpawnEvents: () => spawns,
      async domState() {
        const state = await domPort!.current();
        return state.kind === "AVAILABLE" && state.snapshot.values.supportEnabled
          ? "ENABLED" : "DISABLED";
      },
      async submit(kind, nonce) {
        const injectGapViolation = !gapViolationInjected
          && kind === options.gapViolationKind
          && activePostBoundAtMs !== undefined
          && Date.now() < activePostBoundAtMs;
        if (injectGapViolation) gapViolationInjected = true;
        const results = await Promise.all(readers.map((reader, index) => reader.command(
          injectGapViolation && index === 0 ? "mutant-reserve" : "submit",
          { kind, nonce }
        )));
        for (const result of results) {
          if (!result.reserved) continue;
          if (injectGapViolation && result.event !== undefined) {
            gapViolationEvidence.push(Object.freeze({
              nonce: result.event.nonce,
              reservationAtMs: result.event.atMs,
              postBoundAtMs: activePostBoundAtMs!
            }));
          }
          const request = await postRelay({ relay: relay!, nonce, holdPartial: false });
          pendingRelayRequests.add(request.completion);
          request.release();
          await request.completion.finally(() => pendingRelayRequests.delete(request.completion));
        }
      },
      async holdRelayBodyAfterReservation(nonce) {
        const reservation = await readers[0]!.command("reserve", { kind: "new", nonce });
        if (!reservation.reserved || reservation.event === undefined) {
          throw new Error("HELD_RESERVATION_DENIED");
        }
        const request = await postRelay({ relay: relay!, nonce, holdPartial: true });
        pendingRelayRequests.add(request.completion);
        const release = () => {
          heldReleases.delete(release);
          request.release();
          void request.completion.finally(() => pendingRelayRequests.delete(request.completion));
        };
        heldReleases.add(release);
        if (observedSpawnNonces.includes(nonce)) throw new Error("SPAWN_BEFORE_BODY_RELEASE");
        return Object.freeze({ release });
      },
      async close() {
        if (closed) return;
        closed = true;
        for (const release of [...heldReleases]) release();
        await Promise.allSettled([...pendingRelayRequests]);
        await Promise.all(readers.map((reader) => reader.close()));
        await domPort!.close();
        await relay!.close();
        clearInterval(spawnPoll);
        observations.close();
        reservations.close();
        spawns.close();
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    };
    return sut;
  } catch (error) {
    for (const release of [...heldReleases]) release();
    await Promise.allSettled([...pendingRelayRequests]);
    await Promise.all(readers.map((reader) => reader.close()));
    if (domPort !== undefined) await domPort.close();
    if (relay !== undefined) await relay.close();
    clearInterval(spawnPoll);
    observations.close();
    reservations.close();
    spawns.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

function supportPoolFactory(): SupportPoolFactory {
  const factory = (databaseApi as unknown as { createSupportControlPlanePool?: unknown })
    .createSupportControlPlanePool;
  expect(factory).toBeTypeOf("function");
  return factory as SupportPoolFactory;
}

function internalOptions(pool: Pool): Readonly<Record<string, unknown>> {
  return (pool as unknown as { options: Readonly<Record<string, unknown>> }).options;
}

async function elapsedRejection(operation: Promise<unknown>): Promise<Readonly<{
  elapsedMs: number;
  error: unknown;
}>> {
  const startedAt = performance.now();
  try {
    await operation;
    throw new Error("EXPECTED_REJECTION");
  } catch (error) {
    if (error instanceof Error && error.message === "EXPECTED_REJECTION") throw error;
    return Object.freeze({ elapsedMs: performance.now() - startedAt, error });
  }
}

beforeAll(async () => {
  database = await startTestDatabase();
  await databaseApi.migrate(database.pool);
  const sourceRef = "fixture:support-control-plane";
  const rows = SUPPORT_CONFIGURATION_KEYS.map((key) =>
    registerFixtureRow(key, SUPPORT_VALUES[key], sourceRef));
  await importHistoricalRegisterFixture(database.pool, 4, rows);
  await createPostgresRegisterPublicationPort(database.pool).publishSupport({
    publicationId: randomUUID(),
    baseRegisterVersion: parseRegisterVersionText("4"),
    expectedSupportRegisterVersion: null,
    schemaVersion: 1,
    patch: Object.freeze(rows
      .filter((row) => row.rowKey === "support_enabled")
      .map((row) => Object.freeze({
        key: row.rowKey as SupportConfigurationKey,
        valueJsonText: row.valueJsonText
      }))),
    sourceRef
  });
}, 120_000);

afterAll(async () => {
  if (database !== undefined) await database.stop();
});

describe("isolated support control-plane pool", () => {
  it("is a separate max-two pool with exact acquisition, connection, statement, and query bounds", async () => {
    const ordinary = databaseApi.createPool(database.connectionString);
    const control = supportPoolFactory()(database.connectionString);
    try {
      expect(control).not.toBe(ordinary);
      expect(internalOptions(control)).toMatchObject({
        max: 2,
        connectionTimeoutMillis: 200,
        statement_timeout: 700,
        query_timeout: 750
      });
      expect(internalOptions(ordinary)).toMatchObject({
        max: 10
      });
      expect(internalOptions(ordinary).connectionTimeoutMillis).toBeUndefined();
      expect(internalOptions(ordinary).statement_timeout).toBeUndefined();
      expect(internalOptions(ordinary).query_timeout).toBeUndefined();
    } finally {
      await control.end();
      await ordinary.end();
    }
  });

  it("refreshes through its isolated pool while every ordinary-pool client is occupied", async () => {
    const ordinary = databaseApi.createPool(database.connectionString);
    const control = supportPoolFactory()(database.connectionString);
    const held: PoolClient[] = [];
    const port = createSupportConfigurationPort(control);
    try {
      const ordinaryMaximum = internalOptions(ordinary).max;
      expect(ordinaryMaximum).toBe(10);
      if (typeof ordinaryMaximum !== "number") throw new TypeError("ORDINARY_POOL_MAX_INVALID");
      for (let index = 0; index < ordinaryMaximum; index += 1) {
        held.push(await ordinary.connect());
      }
      await expect(port.current()).resolves.toMatchObject({
        kind: "AVAILABLE",
        snapshot: { values: { supportEnabled: true } }
      });
    } finally {
      for (const client of held) client.release();
      await port.close();
      await ordinary.end();
    }
  });

  it("fails closed when both control clients are occupied and leaves no acquisition waiter", async () => {
    const control = supportPoolFactory()(database.connectionString);
    const first = await control.connect();
    const second = await control.connect();
    const port = createSupportConfigurationPort(control);
    try {
      const result = await Promise.race([
        port.current(),
        new Promise<never>((_, reject) => setTimeout(
          () => reject(new Error("CONTROL_ACQUIRE_DID_NOT_SETTLE")),
          1_000
        ))
      ]);
      expect(result).toEqual({ kind: "DISABLED", code: "SUPPORT_CONFIG_SNAPSHOT_INVALID" });
      expect((control as unknown as { waitingCount: number }).waitingCount).toBe(0);
    } finally {
      first.release();
      second.release();
      await port.close();
    }
  });

  it("enforces the 200ms acquisition deadline on a real exhausted control pool", async () => {
    const control = supportPoolFactory()(database.connectionString);
    const first = await control.connect();
    const second = await control.connect();
    try {
      const outcome = await elapsedRejection(control.connect());
      expect(outcome.elapsedMs).toBeGreaterThanOrEqual(150);
      expect(outcome.elapsedMs).toBeLessThan(800);
      expect(String(outcome.error)).toMatch(/timeout exceeded when trying to connect/iu);
      expect((control as unknown as { waitingCount: number }).waitingCount).toBe(0);
    } finally {
      first.release();
      second.release();
      await control.end();
    }
  });

  it("enforces the 200ms connection deadline against a server that accepts but never speaks PostgreSQL", async () => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    const control = supportPoolFactory()(
      `postgresql://stall:stall@127.0.0.1:${address.port}/stall`
    );
    try {
      const outcome = await elapsedRejection(control.query("SELECT 1"));
      expect(outcome.elapsedMs).toBeGreaterThanOrEqual(150);
      expect(outcome.elapsedMs).toBeLessThan(800);
      expect(String(outcome.error)).toMatch(/connection timeout|timeout expired|timeout exceeded/iu);
    } finally {
      await control.end();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("fails closed at the 1000ms outer deadline while a real pool acquisition is still connecting", async () => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    const connecting = databaseApi.createPool(
      `postgresql://stall:stall@127.0.0.1:${address.port}/stall`
    );
    const port = createSupportConfigurationPort(connecting);
    const startedAt = performance.now();
    try {
      await expect(port.current()).resolves.toEqual({
        kind: "DISABLED", code: "SUPPORT_CONFIG_REFRESH_DEADLINE"
      });
      const elapsedMs = performance.now() - startedAt;
      expect(elapsedMs).toBeGreaterThanOrEqual(900);
      expect(elapsedMs).toBeLessThan(1_600);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await port.close();
    }
  });

  it("cancels a real slow statement at the 700ms server deadline", async () => {
    const control = supportPoolFactory()(database.connectionString);
    try {
      const outcome = await elapsedRejection(control.query("SELECT pg_sleep(2)"));
      expect(outcome.elapsedMs).toBeGreaterThanOrEqual(600);
      expect(outcome.elapsedMs).toBeLessThan(1_200);
      expect(String(outcome.error)).toMatch(/statement timeout|canceling statement/iu);
    } finally {
      await control.end();
    }
  });

  it("cancels a real transferred query at the 750ms client deadline when the server bound is disabled", async () => {
    const control = supportPoolFactory()(database.connectionString);
    const client = await control.connect();
    try {
      await client.query("SET statement_timeout=0");
      const outcome = await elapsedRejection(client.query("SELECT pg_sleep(2)"));
      expect(outcome.elapsedMs).toBeGreaterThanOrEqual(650);
      expect(outcome.elapsedMs).toBeLessThan(1_400);
      expect(String(outcome.error)).toMatch(/query read timeout/iu);
    } finally {
      client.release(true);
      await control.end();
    }
  });
});

describe("bounded support switch convergence proof", () => {
  it("runs three physical off/on cycles through exhausted reader processes and the real relay spawn", async () => {
    const sut = await createPhysicalSupportSwitchSut(database);
    try {
      const result = await runSupportSwitchProofSuite(sut);
      expect(result.runs).toHaveLength(3);
      expect(result.worstConvergenceSpanMs).toBeLessThanOrEqual(5_000);
      expect(result.runs.every((run) => run.heldSpawnCount === 1)).toBe(true);
      expect(new Set(sut.readerPids).size).toBe(2);
      expect(sut.readerPids.every((pid) => pid !== process.pid)).toBe(true);
      expect(sut.spawnRecorderPids).toHaveLength(3);
      expect(sut.spawnRecorderPids.every((pid) =>
        pid !== process.pid && !sut.readerPids.includes(pid))).toBe(true);
    } finally {
      await sut.close();
    }
  }, 120_000);

  it("kills a real reader reservation and child spawn in the post-observation gap", async () => {
    const sut = await createPhysicalSupportSwitchSut(database, { gapViolationKind: "queued" });
    try {
      await expect(runSupportSwitchProofSuite(sut)).rejects.toThrowError(
        /POST_OBSERVATION_RESERVATION/u
      );
      expect(sut.spawnRecorderPids).toHaveLength(4);
      expect(new Set(sut.spawnRecorderPids).size).toBe(4);
      expect(sut.spawnRecorderPids.every((pid) =>
        pid !== process.pid && !sut.readerPids.includes(pid))).toBe(true);
      const evidence = sut.gapViolationEvidence;
      expect(evidence).toHaveLength(1);
      expect(evidence[0]!.nonce).toMatch(/-post-observation-queued$/u);
      expect(evidence[0]!.reservationAtMs).toBeLessThan(evidence[0]!.postBoundAtMs);
    } finally {
      if (await sut.domState() === "DISABLED") await sut.publishOn();
      await sut.close();
    }
  }, 120_000);
});
