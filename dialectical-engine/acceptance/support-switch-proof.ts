import type {
  SupportPublicationReceipt
} from "../packages/register/src/index.js";

export const SUPPORT_SWITCH_RUNS = 3 as const;
export const SUPPORT_SWITCH_BOUND_MS = 5_000 as const;
export const SUPPORT_SWITCH_POLL_INTERVAL_MS = 500 as const;
export const SUPPORT_SWITCH_PROCESS_HEALTH_MS = 250 as const;
export const SUPPORT_SWITCH_STRESS_MIN_MS = 75 as const;

export type SupportSubmissionKind = "new" | "queued" | "retry" | "follow-on";

export interface SupportReservationEvent {
  readonly processId: string;
  readonly processPid: number;
  readonly ordinaryPoolId: string;
  readonly controlPoolId: string;
  readonly ordinaryPoolExhausted: boolean;
  readonly kind: SupportSubmissionKind;
  readonly nonce: string;
  readonly reservationId: string;
  readonly supportRegisterVersion: string;
  readonly atMs: number;
  readonly immutable: true;
  readonly singleUse: true;
}

export interface SupportObservationEvent {
  readonly processId: string;
  readonly processPid: number;
  readonly ordinaryPoolId: string;
  readonly controlPoolId: string;
  readonly ordinaryPoolExhausted: boolean;
  readonly state: "ENABLED" | "DISABLED";
  readonly supportRegisterVersion: string | null;
  readonly atMs: number;
  readonly configQueryDelayMs: number;
  readonly eventLoopDelayMs: number;
  readonly configQueryStressRun: 1 | 2 | 3 | null;
  readonly configQueryStressRegisterVersion: string | null;
  readonly eventLoopStressRun: 1 | 2 | 3 | null;
  readonly eventLoopStressRegisterVersion: string | null;
  readonly health: "HEALTHY" | "PROCESS_UNHEALTHY";
}

export interface SupportActualSpawnEvent {
  readonly nonce: string;
  readonly atMs: number;
}

export interface SupportSwitchSystemUnderTest {
  publishOff(): Promise<Readonly<{
    receipt: SupportPublicationReceipt;
    commitAcknowledgedAtMs: number;
  }>>;
  publishOn(): Promise<Readonly<{
    receipt: SupportPublicationReceipt;
    commitAcknowledgedAtMs: number;
  }>>;
  reservationEvents(): AsyncIterable<SupportReservationEvent>;
  observationEvents(): AsyncIterable<SupportObservationEvent>;
  domState(): Promise<"ENABLED" | "DISABLED">;
  submit(kind: "new" | "queued" | "retry" | "follow-on", nonce: string): Promise<void>;
  holdRelayBodyAfterReservation(nonce: string):
    Promise<Readonly<{ release(): void }>>;
  actualSpawnEvents(): AsyncIterable<SupportActualSpawnEvent>;
}

export interface SupportProcessClosure {
  readonly processId: string;
  readonly processPid: number;
  readonly ordinaryPoolId: string;
  readonly controlPoolId: string;
  readonly ordinaryPoolExhausted: boolean;
  readonly closedAtMs: number;
}

export interface SupportSwitchRunTrace {
  readonly run: 1 | 2 | 3;
  readonly offRegisterVersion: string;
  readonly offPreviousSupportRegisterVersion: string | null;
  readonly offRecordedAtMs: number;
  readonly commitAcknowledgedAtMs: number;
  readonly domDisabledAtMs: number;
  readonly domReloadDisabledAtMs: number;
  readonly processClosures: readonly SupportProcessClosure[];
  readonly observations: readonly SupportObservationEvent[];
  readonly reservations: readonly SupportReservationEvent[];
  readonly spawns: readonly SupportActualSpawnEvent[];
  readonly lastReservationAtMs: number;
  readonly heldNonce: string;
  readonly heldReservationId: string;
  readonly heldReservationVersion: string;
  readonly relayPartialBodyAtMs: number;
  readonly relayReleaseAtMs: number;
  readonly heldSpawnAtMs: number;
  readonly heldReservationCount: number;
  readonly heldSpawnCount: number;
  readonly unexpectedReservationCount: number;
  readonly unexpectedSpawnCount: number;
  readonly domDisabledAfterSpawn: boolean;
  readonly onRegisterVersion: string;
  readonly onRecordedAtMs: number;
  readonly onCommitAcknowledgedAtMs: number;
  readonly enabledProcessCountAfterOn: number;
  readonly domEnabledAfterOn: boolean;
}

export interface SupportSwitchProofResult {
  readonly runs: readonly (SupportSwitchRunTrace & Readonly<{
    convergenceSpanMs: number;
  }>)[];
  readonly worstRun: 1 | 2 | 3;
  readonly worstConvergenceSpanMs: number;
}

function fail(code: string): never {
  throw new Error(code);
}

function finiteTimestamp(value: number, code: string): void {
  if (!Number.isFinite(value) || value < 0) fail(code);
}

function assertFiniteTimestamps(trace: SupportSwitchRunTrace): void {
  const timestamps = Object.freeze([
    ["OFF_RECORDED_TIMESTAMP_INVALID", trace.offRecordedAtMs],
    ["OFF_ACK_TIMESTAMP_INVALID", trace.commitAcknowledgedAtMs],
    ["DOM_DISABLED_TIMESTAMP_INVALID", trace.domDisabledAtMs],
    ["DOM_RELOAD_DISABLED_TIMESTAMP_INVALID", trace.domReloadDisabledAtMs],
    ["LAST_RESERVATION_TIMESTAMP_INVALID", trace.lastReservationAtMs],
    ["RELAY_PARTIAL_BODY_TIMESTAMP_INVALID", trace.relayPartialBodyAtMs],
    ["RELAY_RELEASE_TIMESTAMP_INVALID", trace.relayReleaseAtMs],
    ["HELD_SPAWN_TIMESTAMP_INVALID", trace.heldSpawnAtMs],
    ["ON_RECORDED_TIMESTAMP_INVALID", trace.onRecordedAtMs],
    ["ON_ACK_TIMESTAMP_INVALID", trace.onCommitAcknowledgedAtMs]
  ] as const);
  for (const [code, timestamp] of timestamps) finiteTimestamp(timestamp, code);
  for (const closure of trace.processClosures) {
    finiteTimestamp(closure.closedAtMs, "PROCESS_CLOSURE_TIMESTAMP_INVALID");
  }
  for (const observation of trace.observations) {
    finiteTimestamp(observation.atMs, "OBSERVATION_TIMESTAMP_INVALID");
  }
  for (const reservation of trace.reservations) {
    finiteTimestamp(reservation.atMs, "RESERVATION_TIMESTAMP_INVALID");
  }
  for (const spawn of trace.spawns) {
    finiteTimestamp(spawn.atMs, "SPAWN_TIMESTAMP_INVALID");
  }
}

function assertPhysicalProcesses(trace: SupportSwitchRunTrace): void {
  if (trace.processClosures.length !== 2) fail("TWO_PROCESSES_REQUIRED");
  const ids = new Set(trace.processClosures.map((event) => event.processId));
  const pids = new Set(trace.processClosures.map((event) => event.processPid));
  const ordinaryPools = new Set(trace.processClosures.map((event) => event.ordinaryPoolId));
  const controlPools = new Set(trace.processClosures.map((event) => event.controlPoolId));
  if (ids.size !== 2 || pids.size !== 2 || ordinaryPools.size !== 2 || controlPools.size !== 2
      || trace.processClosures.some((event) => !Number.isSafeInteger(event.processPid)
        || event.processPid < 1 || !event.ordinaryPoolExhausted)) {
    fail("INDEPENDENT_EXHAUSTED_PROCESSES_REQUIRED");
  }
  for (const closure of trace.processClosures) {
    if (closure.closedAtMs < trace.commitAcknowledgedAtMs) {
      fail("PROCESS_CLOSURE_BEFORE_ACK");
    }
    const evidence = trace.observations.find((event) =>
      event.processId === closure.processId
      && event.processPid === closure.processPid
      && event.ordinaryPoolId === closure.ordinaryPoolId
      && event.controlPoolId === closure.controlPoolId
      && event.ordinaryPoolExhausted
      && event.state === "DISABLED"
      && event.atMs === closure.closedAtMs
      && event.supportRegisterVersion === trace.offRegisterVersion);
    if (evidence === undefined) fail("PROCESS_CLOSURE_EVIDENCE_INVALID");
  }
}

function assertHealth(trace: SupportSwitchRunTrace): void {
  if (trace.observations.length < 2) fail("PROCESS_OBSERVATIONS_MISSING");
  for (const observation of trace.observations) {
    if (!Number.isFinite(observation.configQueryDelayMs)
        || !Number.isFinite(observation.eventLoopDelayMs)
        || observation.configQueryDelayMs < 0 || observation.eventLoopDelayMs < 0
        || observation.configQueryDelayMs > SUPPORT_SWITCH_PROCESS_HEALTH_MS
        || observation.eventLoopDelayMs > SUPPORT_SWITCH_PROCESS_HEALTH_MS
        || observation.health !== "HEALTHY") {
      fail("PROCESS_UNHEALTHY");
    }
  }
  const closureObservations = trace.processClosures.map((closure) =>
    trace.observations.find((event) =>
      event.processId === closure.processId
      && event.processPid === closure.processPid
      && event.ordinaryPoolId === closure.ordinaryPoolId
      && event.controlPoolId === closure.controlPoolId
      && event.atMs === closure.closedAtMs
      && event.state === "DISABLED"
      && event.supportRegisterVersion === trace.offRegisterVersion));
  const configStressObserved = closureObservations.some((event) =>
    event !== undefined
    && event.configQueryDelayMs >= SUPPORT_SWITCH_STRESS_MIN_MS
    && event.configQueryStressRun === trace.run
    && event.configQueryStressRegisterVersion === trace.offRegisterVersion);
  const eventLoopStressObserved = closureObservations.some((event) =>
    event !== undefined
    && event.eventLoopDelayMs >= SUPPORT_SWITCH_STRESS_MIN_MS
    && event.eventLoopStressRun === trace.run
    && event.eventLoopStressRegisterVersion === trace.offRegisterVersion);
  if (!configStressObserved || !eventLoopStressObserved) {
    fail("OFF_CLOSURE_STRESS_MISSING");
  }
}

function attributedClosure(
  closures: readonly SupportProcessClosure[],
  reservation: SupportReservationEvent
): SupportProcessClosure {
  const closure = closures.find((event) =>
    event.processId === reservation.processId
    && event.processPid === reservation.processPid
    && event.ordinaryPoolId === reservation.ordinaryPoolId
    && event.controlPoolId === reservation.controlPoolId
    && event.ordinaryPoolExhausted === reservation.ordinaryPoolExhausted);
  if (closure === undefined) fail("RESERVATION_PROCESS_ATTRIBUTION_INVALID");
  return closure;
}

function firstProcessOffObservationAtMs(
  observations: readonly SupportObservationEvent[],
  offRegisterVersion: string,
  offRecordedAtMs: number,
  process: SupportProcessClosure
): number {
  const firstAtMs = Math.min(...observations.filter((event) =>
    event.processId === process.processId
    && event.processPid === process.processPid
    && event.ordinaryPoolId === process.ordinaryPoolId
    && event.controlPoolId === process.controlPoolId
    && event.ordinaryPoolExhausted === process.ordinaryPoolExhausted
    && event.state === "DISABLED"
    && event.supportRegisterVersion === offRegisterVersion
    && event.atMs >= offRecordedAtMs)
    .map((event) => event.atMs));
  if (!Number.isFinite(firstAtMs)) fail("PROCESS_OFF_OBSERVATION_MISSING");
  return firstAtMs;
}

function postObservationReservations(
  observations: readonly SupportObservationEvent[],
  offRegisterVersion: string,
  offRecordedAtMs: number,
  closures: readonly SupportProcessClosure[],
  reservations: readonly SupportReservationEvent[]
): readonly SupportReservationEvent[] {
  return reservations.filter((reservation) => {
    const process = attributedClosure(closures, reservation);
    return reservation.atMs >= firstProcessOffObservationAtMs(
      observations,
      offRegisterVersion,
      offRecordedAtMs,
      process
    );
  });
}

function unreservedOrPostObservationSpawns(
  observations: readonly SupportObservationEvent[],
  offRegisterVersion: string,
  offRecordedAtMs: number,
  closures: readonly SupportProcessClosure[],
  reservations: readonly SupportReservationEvent[],
  spawns: readonly SupportActualSpawnEvent[]
): readonly SupportActualSpawnEvent[] {
  const permittedByNonce = new Map<string, number>();
  for (const reservation of reservations) {
    const process = attributedClosure(closures, reservation);
    if (reservation.atMs >= firstProcessOffObservationAtMs(
      observations,
      offRegisterVersion,
      offRecordedAtMs,
      process
    )) continue;
    permittedByNonce.set(reservation.nonce, (permittedByNonce.get(reservation.nonce) ?? 0) + 1);
  }
  return spawns.filter((spawn) => {
    const remaining = permittedByNonce.get(spawn.nonce) ?? 0;
    if (remaining < 1) return true;
    permittedByNonce.set(spawn.nonce, remaining - 1);
    return false;
  });
}

function assertReservationAndSpawn(trace: SupportSwitchRunTrace): void {
  const latestReservation = Math.max(...trace.reservations.map((event) => event.atMs));
  if (!Number.isFinite(latestReservation) || latestReservation !== trace.lastReservationAtMs) {
    fail("LAST_RESERVATION_EVIDENCE_INVALID");
  }
  const heldReservations = trace.reservations.filter((event) => event.nonce === trace.heldNonce);
  if (trace.heldReservationCount !== 1 || heldReservations.length !== 1
      || trace.unexpectedReservationCount < 0) {
    fail("HELD_NONCE_NOT_SINGLE_USE");
  }
  const reservation = heldReservations[0]!;
  if (!reservation.immutable || !reservation.singleUse
      || reservation.reservationId !== trace.heldReservationId
      || reservation.supportRegisterVersion !== trace.heldReservationVersion
      || trace.offPreviousSupportRegisterVersion !== trace.heldReservationVersion) {
    fail("HELD_RESERVATION_CORRELATION_INVALID");
  }
  const forbiddenReservations = postObservationReservations(
    trace.observations,
    trace.offRegisterVersion,
    trace.offRecordedAtMs,
    trace.processClosures,
    trace.reservations
  );
  if (forbiddenReservations.length !== 0) fail("POST_OBSERVATION_RESERVATION");
  if (trace.unexpectedReservationCount !== forbiddenReservations.length) {
    fail("UNEXPECTED_RESERVATION_COUNT_INVALID");
  }
  if (!(reservation.atMs <= trace.relayPartialBodyAtMs
      && trace.relayPartialBodyAtMs < trace.commitAcknowledgedAtMs)) {
    fail("RELAY_PARTIAL_BODY_ORDER_INVALID");
  }
  if (!(trace.relayReleaseAtMs > trace.commitAcknowledgedAtMs + SUPPORT_SWITCH_BOUND_MS)) {
    fail("RELAY_RELEASE_NOT_STRICTLY_AFTER_BOUND");
  }
  const heldSpawns = trace.spawns.filter((event) => event.nonce === trace.heldNonce);
  if (heldSpawns.length !== 1 || trace.heldSpawnAtMs !== heldSpawns[0]!.atMs
      || !(trace.heldSpawnAtMs >= trace.relayReleaseAtMs
      && trace.heldSpawnAtMs > trace.lastReservationAtMs)) {
    fail("ACTUAL_SPAWN_ORDER_INVALID");
  }
  if (trace.heldSpawnCount !== heldSpawns.length || trace.heldSpawnCount !== 1) {
    fail("ACTUAL_SPAWN_CARDINALITY_INVALID");
  }
  const forbiddenSpawns = unreservedOrPostObservationSpawns(
    trace.observations,
    trace.offRegisterVersion,
    trace.offRecordedAtMs,
    trace.processClosures,
    trace.reservations,
    trace.spawns
  );
  if (forbiddenSpawns.length !== 0) fail("POST_OBSERVATION_OR_UNRESERVED_SPAWN");
  if (trace.unexpectedSpawnCount !== forbiddenSpawns.length) {
    fail("UNEXPECTED_SPAWN_COUNT_INVALID");
  }
  if (!trace.domDisabledAfterSpawn) fail("DOM_REENABLED_BEFORE_SPAWN");
  if (trace.onRecordedAtMs <= trace.heldSpawnAtMs) fail("ON_PUBLICATION_ORDER_INVALID");
}

function verifyRun(trace: SupportSwitchRunTrace): SupportSwitchRunTrace & Readonly<{
  convergenceSpanMs: number;
}> {
  assertFiniteTimestamps(trace);
  if (trace.commitAcknowledgedAtMs <= trace.offRecordedAtMs) fail("ACK_NOT_AFTER_COMMIT");
  if (trace.onCommitAcknowledgedAtMs <= trace.onRecordedAtMs) fail("ON_ACK_NOT_AFTER_COMMIT");
  if (trace.domDisabledAtMs < trace.commitAcknowledgedAtMs
      || trace.domReloadDisabledAtMs < trace.domDisabledAtMs
      || trace.domReloadDisabledAtMs >= trace.onRecordedAtMs) {
    fail("DOM_RELOAD_ORDER_INVALID");
  }
  assertReservationAndSpawn(trace);
  const convergenceSpanMs = Math.max(
    trace.domDisabledAtMs,
    ...trace.processClosures.map((event) => event.closedAtMs),
    trace.lastReservationAtMs
  ) - trace.commitAcknowledgedAtMs;
  finiteTimestamp(convergenceSpanMs, "CONVERGENCE_SPAN_TIMESTAMP_INVALID");
  if (convergenceSpanMs > SUPPORT_SWITCH_BOUND_MS) {
    fail("CONVERGENCE_BOUND_EXCEEDED");
  }
  assertPhysicalProcesses(trace);
  assertHealth(trace);
  const enabledProcesses = matchingProcesses(
    trace.observations,
    "ENABLED",
    trace.onCommitAcknowledgedAtMs,
    trace.onRegisterVersion
  );
  if (trace.enabledProcessCountAfterOn !== 2 || enabledProcesses.size !== 2) {
    fail("ON_PROCESS_RELOAD_INCOMPLETE");
  }
  if (!trace.domEnabledAfterOn) {
    fail("ON_DOM_RELOAD_INCOMPLETE");
  }
  return Object.freeze({ ...trace, convergenceSpanMs });
}

export function assertSupportSwitchProofRuns(
  traces: readonly SupportSwitchRunTrace[]
): SupportSwitchProofResult {
  if (traces.length !== SUPPORT_SWITCH_RUNS
      || traces.some((trace, index) => trace.run !== index + 1)) {
    fail("THREE_ORDERED_RUNS_REQUIRED");
  }
  const runs = Object.freeze(traces.map(verifyRun));
  let worst = runs[0]!;
  for (const run of runs.slice(1)) {
    if (run.convergenceSpanMs > worst.convergenceSpanMs) worst = run;
  }
  return Object.freeze({
    runs,
    worstRun: worst.run,
    worstConvergenceSpanMs: worst.convergenceSpanMs
  });
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class AsyncCollector<T> {
  readonly events: T[] = [];
  private readonly waiters = new Set<() => void>();
  private failure: unknown;

  constructor(source: AsyncIterable<T>) {
    void this.consume(source);
  }

  private async consume(source: AsyncIterable<T>): Promise<void> {
    try {
      for await (const event of source) {
        this.events.push(event);
        this.notify();
      }
    } catch (error) {
      this.failure = error;
      this.notify();
    }
  }

  private notify(): void {
    for (const waiter of this.waiters) waiter();
    this.waiters.clear();
  }

  async waitUntil(predicate: (events: readonly T[]) => boolean, timeoutMs: number, code: string): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate(this.events)) {
      if (this.failure !== undefined) throw new Error(code, { cause: this.failure });
      const remaining = deadline - Date.now();
      if (remaining <= 0) fail(code);
      await Promise.race([
        new Promise<void>((resolve) => this.waiters.add(resolve)),
        sleep(Math.min(remaining, SUPPORT_SWITCH_POLL_INTERVAL_MS))
      ]);
    }
  }
}

async function pollDomState(
  sut: SupportSwitchSystemUnderTest,
  expected: "ENABLED" | "DISABLED",
  timeoutMs: number
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = await sut.domState();
    const observedAtMs = Date.now();
    if (state === expected) return observedAtMs;
    if (observedAtMs >= deadline) fail(`DOM_${expected}_TIMEOUT`);
    await sleep(Math.min(SUPPORT_SWITCH_POLL_INTERVAL_MS, deadline - observedAtMs));
  }
}

function matchingProcesses(
  observations: readonly SupportObservationEvent[],
  state: "ENABLED" | "DISABLED",
  minimumAtMs: number,
  supportRegisterVersion?: string,
  stressRun?: 1 | 2 | 3
): Map<string, SupportObservationEvent> {
  const matches = new Map<string, SupportObservationEvent>();
  for (const event of observations) {
    if (event.atMs < minimumAtMs || event.state !== state
        || (supportRegisterVersion !== undefined
          && event.supportRegisterVersion !== supportRegisterVersion)
        || (stressRun !== undefined
          && event.configQueryStressRun !== stressRun
          && event.eventLoopStressRun !== stressRun)) continue;
    if (event.health !== "HEALTHY"
        || event.configQueryDelayMs > SUPPORT_SWITCH_PROCESS_HEALTH_MS
        || event.eventLoopDelayMs > SUPPORT_SWITCH_PROCESS_HEALTH_MS) {
      fail("PROCESS_UNHEALTHY");
    }
    if (!matches.has(event.processId)) matches.set(event.processId, event);
  }
  return matches;
}

function strictPostCommitAck(receipt: SupportPublicationReceipt, acknowledgedAtMs: number): void {
  if (acknowledgedAtMs <= receipt.recordedAt.getTime()) fail("ACK_NOT_AFTER_COMMIT");
}

export async function runSupportSwitchProofSuite(
  sut: SupportSwitchSystemUnderTest,
  options: Readonly<{
    eventTimeoutMs?: number;
    log?: (message: string) => void;
  }> = {}
): Promise<SupportSwitchProofResult> {
  const timeoutMs = options.eventTimeoutMs ?? 15_000;
  const log = options.log ?? ((message: string) => console.info(message));
  const reservations = new AsyncCollector(sut.reservationEvents());
  const observations = new AsyncCollector(sut.observationEvents());
  const spawns = new AsyncCollector(sut.actualSpawnEvents());
  const traces: SupportSwitchRunTrace[] = [];

  await observations.waitUntil((events) =>
    matchingProcesses(events, "ENABLED", 0).size === 2, timeoutMs, "INITIAL_PROCESSES_NOT_ENABLED");
  await pollDomState(sut, "ENABLED", timeoutMs);

  for (let runIndex = 1; runIndex <= SUPPORT_SWITCH_RUNS; runIndex += 1) {
    const run = runIndex as 1 | 2 | 3;
    const runStartedAtMs = Date.now();
    const heldNonce = `support-switch-run-${run}-${runStartedAtMs}`;
    const held = await sut.holdRelayBodyAfterReservation(heldNonce);
    const relayPartialBodyAtMs = Date.now();
    await reservations.waitUntil((events) =>
      events.some((event) => event.nonce === heldNonce), timeoutMs, "HELD_RESERVATION_MISSING");
    if (spawns.events.some((event) => event.nonce === heldNonce)) {
      fail("SPAWN_BEFORE_BODY_RELEASE");
    }

    const off = await sut.publishOff();
    strictPostCommitAck(off.receipt, off.commitAcknowledgedAtMs);
    await observations.waitUntil((events) => matchingProcesses(
      events,
      "DISABLED",
      off.commitAcknowledgedAtMs,
      off.receipt.registerVersion,
      run
    ).size === 2, timeoutMs, "PROCESSES_DID_NOT_CLOSE");
    const processEvents = matchingProcesses(
      observations.events,
      "DISABLED",
      off.commitAcknowledgedAtMs,
      off.receipt.registerVersion,
      run
    );
    const processClosures = Object.freeze([...processEvents.values()].map((event) => Object.freeze({
      processId: event.processId,
      processPid: event.processPid,
      ordinaryPoolId: event.ordinaryPoolId,
      controlPoolId: event.controlPoolId,
      ordinaryPoolExhausted: event.ordinaryPoolExhausted,
      closedAtMs: event.atMs
    })));
    const submitForbiddenKinds = async (phase: "post-observation" | "post-bound") => {
      const nonces = Object.freeze({
        new: `${heldNonce}-${phase}-new`,
        queued: `${heldNonce}-${phase}-queued`,
        retry: heldNonce,
        "follow-on": `${heldNonce}-${phase}-follow-on`
      });
      for (const kind of ["new", "queued", "retry", "follow-on"] as const) {
        await sut.submit(kind, nonces[kind]);
      }
    };
    await submitForbiddenKinds("post-observation");
    const domDisabledAtMs = await pollDomState(sut, "DISABLED", timeoutMs);

    const postBoundAtMs = off.commitAcknowledgedAtMs + SUPPORT_SWITCH_BOUND_MS;
    while (Date.now() <= postBoundAtMs) {
      await sleep(Math.min(SUPPORT_SWITCH_POLL_INTERVAL_MS, postBoundAtMs + 1 - Date.now()));
    }
    await submitForbiddenKinds("post-bound");
    await sleep(SUPPORT_SWITCH_POLL_INTERVAL_MS);
    const relayReleaseAtMs = Date.now();
    held.release();
    await spawns.waitUntil((events) =>
      events.some((event) => event.nonce === heldNonce && event.atMs >= relayReleaseAtMs),
    timeoutMs, "ACTUAL_CHILD_SPAWN_MISSING");
    await sleep(SUPPORT_SWITCH_POLL_INTERVAL_MS);

    const heldSpawns = spawns.events.filter((event) => event.nonce === heldNonce);
    const heldSpawnAtMs = heldSpawns[0]?.atMs;
    if (heldSpawnAtMs === undefined) fail("ACTUAL_CHILD_SPAWN_MISSING");
    const runReservations = reservations.events.filter((event) => event.atMs >= runStartedAtMs);
    const runSpawns = spawns.events.filter((event) => event.atMs >= runStartedAtMs);
    const latestReservation = Math.max(...runReservations.map((event) => event.atMs));
    const domDisabledAfterSpawn = await sut.domState() === "DISABLED";
    await sleep(SUPPORT_SWITCH_POLL_INTERVAL_MS);
    const domReloadDisabledAtMs = await pollDomState(sut, "DISABLED", timeoutMs);
    while (Date.now() <= domReloadDisabledAtMs) await sleep(1);

    const on = await sut.publishOn();
    strictPostCommitAck(on.receipt, on.commitAcknowledgedAtMs);
    await observations.waitUntil((events) => matchingProcesses(
      events,
      "ENABLED",
      on.commitAcknowledgedAtMs,
      on.receipt.registerVersion
    ).size === 2, timeoutMs, "PROCESSES_DID_NOT_REOPEN");
    const enabledProcesses = matchingProcesses(
      observations.events,
      "ENABLED",
      on.commitAcknowledgedAtMs,
      on.receipt.registerVersion
    );
    const domEnabledAfterOn = await pollDomState(sut, "ENABLED", timeoutMs)
      .then(() => true);
    const runObservations = observations.events.filter((event) =>
      event.atMs >= runStartedAtMs && event.atMs <= Date.now());
    const unexpectedReservations = postObservationReservations(
      runObservations,
      off.receipt.registerVersion,
      off.receipt.recordedAt.getTime(),
      processClosures,
      runReservations
    );
    const unexpectedSpawns = unreservedOrPostObservationSpawns(
      runObservations,
      off.receipt.registerVersion,
      off.receipt.recordedAt.getTime(),
      processClosures,
      runReservations,
      runSpawns
    );
    const heldReservations = runReservations.filter((event) => event.nonce === heldNonce);
    const trace = Object.freeze({
      run,
      offRegisterVersion: off.receipt.registerVersion,
      offPreviousSupportRegisterVersion: off.receipt.previousSupportRegisterVersion,
      offRecordedAtMs: off.receipt.recordedAt.getTime(),
      commitAcknowledgedAtMs: off.commitAcknowledgedAtMs,
      domDisabledAtMs,
      domReloadDisabledAtMs,
      processClosures,
      observations: Object.freeze([...runObservations]),
      reservations: Object.freeze([...runReservations]),
      spawns: Object.freeze([...runSpawns]),
      lastReservationAtMs: latestReservation,
      heldNonce,
      heldReservationId: heldReservations[0]?.reservationId ?? "",
      heldReservationVersion: heldReservations[0]?.supportRegisterVersion ?? "",
      relayPartialBodyAtMs,
      relayReleaseAtMs,
      heldSpawnAtMs,
      heldReservationCount: heldReservations.length,
      heldSpawnCount: heldSpawns.length,
      unexpectedReservationCount: unexpectedReservations.length,
      unexpectedSpawnCount: unexpectedSpawns.length,
      domDisabledAfterSpawn,
      onRegisterVersion: on.receipt.registerVersion,
      onRecordedAtMs: on.receipt.recordedAt.getTime(),
      onCommitAcknowledgedAtMs: on.commitAcknowledgedAtMs,
      enabledProcessCountAfterOn: enabledProcesses.size,
      domEnabledAfterOn
    }) satisfies SupportSwitchRunTrace;
    const convergenceSpanMs = Math.max(
      trace.domDisabledAtMs,
      ...trace.processClosures.map((event) => event.closedAtMs),
      trace.lastReservationAtMs
    ) - trace.commitAcknowledgedAtMs;
    traces.push(trace);
    log(`[support-switch-proof] run=${run} span_ms=${convergenceSpanMs} `
      + `ack_ms=${off.commitAcknowledgedAtMs} release_ms=${relayReleaseAtMs} `
      + `actual_spawn_ms=${heldSpawnAtMs}`);
  }

  const result = assertSupportSwitchProofRuns(traces);
  log(`[support-switch-proof] worst_run=${result.worstRun} `
    + `worst_span_ms=${result.worstConvergenceSpanMs}`);
  return result;
}
