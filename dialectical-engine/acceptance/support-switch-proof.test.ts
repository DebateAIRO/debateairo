import { describe, expect, it } from "vitest";
import {
  parseRegisterVersionText,
  type SupportPublicationReceipt
} from "../packages/register/src/index.js";
import {
  assertSupportSwitchProofRuns,
  runSupportSwitchProofSuite,
  type SupportActualSpawnEvent,
  type SupportObservationEvent,
  type SupportReservationEvent,
  type SupportSubmissionKind,
  type SupportSwitchSystemUnderTest,
  type SupportSwitchRunTrace
} from "./support-switch-proof.js";

type ProofRunTrace = SupportSwitchRunTrace;

function validRun(run: 1 | 2 | 3, offset = 0): ProofRunTrace {
  const nonce = `held-${run}`;
  const commitAcknowledgedAtMs = 20_000 + offset;
  return Object.freeze({
    run,
    offRegisterVersion: "18",
    offPreviousSupportRegisterVersion: "17",
    offRecordedAtMs: commitAcknowledgedAtMs - 100,
    commitAcknowledgedAtMs,
    domDisabledAtMs: commitAcknowledgedAtMs + 500,
    domReloadDisabledAtMs: commitAcknowledgedAtMs + 1_000,
    processClosures: Object.freeze([
      Object.freeze({
        processId: "process-a",
        processPid: 10_001,
        ordinaryPoolId: "ordinary-a",
        controlPoolId: "control-a",
        ordinaryPoolExhausted: true,
        closedAtMs: commitAcknowledgedAtMs + 400
      }),
      Object.freeze({
        processId: "process-b",
        processPid: 10_002,
        ordinaryPoolId: "ordinary-b",
        controlPoolId: "control-b",
        ordinaryPoolExhausted: true,
        closedAtMs: commitAcknowledgedAtMs + 600
      })
    ]),
    observations: Object.freeze([
      Object.freeze({
        processId: "process-a",
        processPid: 10_001,
        ordinaryPoolId: "ordinary-a",
        controlPoolId: "control-a",
        ordinaryPoolExhausted: true,
        state: "DISABLED" as const,
        supportRegisterVersion: "18",
        atMs: commitAcknowledgedAtMs + 400,
        configQueryDelayMs: 100,
        eventLoopDelayMs: 1,
        configQueryStressRun: run,
        configQueryStressRegisterVersion: "18",
        eventLoopStressRun: null,
        eventLoopStressRegisterVersion: null,
        health: "HEALTHY" as const
      }),
      Object.freeze({
        processId: "process-b",
        processPid: 10_002,
        ordinaryPoolId: "ordinary-b",
        controlPoolId: "control-b",
        ordinaryPoolExhausted: true,
        state: "DISABLED" as const,
        supportRegisterVersion: "18",
        atMs: commitAcknowledgedAtMs + 600,
        configQueryDelayMs: 0,
        eventLoopDelayMs: 100,
        configQueryStressRun: null,
        configQueryStressRegisterVersion: null,
        eventLoopStressRun: run,
        eventLoopStressRegisterVersion: "18",
        health: "HEALTHY" as const
      }),
      Object.freeze({
        processId: "process-a",
        processPid: 10_001,
        ordinaryPoolId: "ordinary-a",
        controlPoolId: "control-a",
        ordinaryPoolExhausted: true,
        state: "ENABLED" as const,
        supportRegisterVersion: "19",
        atMs: commitAcknowledgedAtMs + 6_101,
        configQueryDelayMs: 0,
        eventLoopDelayMs: 1,
        configQueryStressRun: null,
        configQueryStressRegisterVersion: null,
        eventLoopStressRun: null,
        eventLoopStressRegisterVersion: null,
        health: "HEALTHY" as const
      }),
      Object.freeze({
        processId: "process-b",
        processPid: 10_002,
        ordinaryPoolId: "ordinary-b",
        controlPoolId: "control-b",
        ordinaryPoolExhausted: true,
        state: "ENABLED" as const,
        supportRegisterVersion: "19",
        atMs: commitAcknowledgedAtMs + 6_201,
        configQueryDelayMs: 0,
        eventLoopDelayMs: 1,
        configQueryStressRun: null,
        configQueryStressRegisterVersion: null,
        eventLoopStressRun: null,
        eventLoopStressRegisterVersion: null,
        health: "HEALTHY" as const
      })
    ]),
    reservations: Object.freeze([
      Object.freeze({
        processId: "process-a",
        processPid: 10_001,
        ordinaryPoolId: "ordinary-a",
        controlPoolId: "control-a",
        ordinaryPoolExhausted: true,
        kind: "new" as const,
        nonce,
        reservationId: `reservation-${run}`,
        supportRegisterVersion: "17",
        atMs: commitAcknowledgedAtMs - 1_000,
        immutable: true as const,
        singleUse: true as const
      })
    ]),
    spawns: Object.freeze([
      Object.freeze({ nonce, atMs: commitAcknowledgedAtMs + 5_050 })
    ]),
    lastReservationAtMs: commitAcknowledgedAtMs - 1_000,
    heldNonce: nonce,
    heldReservationId: `reservation-${run}`,
    heldReservationVersion: "17",
    relayPartialBodyAtMs: commitAcknowledgedAtMs - 500,
    relayReleaseAtMs: commitAcknowledgedAtMs + 5_001,
    heldSpawnAtMs: commitAcknowledgedAtMs + 5_050,
    heldReservationCount: 1,
    heldSpawnCount: 1,
    unexpectedReservationCount: 0,
    unexpectedSpawnCount: 0,
    domDisabledAfterSpawn: true,
    onRegisterVersion: "19",
    onRecordedAtMs: commitAcknowledgedAtMs + 6_000,
    onCommitAcknowledgedAtMs: commitAcknowledgedAtMs + 6_001,
    enabledProcessCountAfterOn: 2,
    domEnabledAfterOn: true
  });
}

function replaceRun(
  trace: ProofRunTrace,
  patch: Partial<ProofRunTrace>
): ProofRunTrace {
  return Object.freeze({ ...trace, ...patch });
}

function preAckViolationRun(run: 1 | 2 | 3, offset = 0): ProofRunTrace {
  const base = validRun(run, offset);
  const firstOffAtMs = base.commitAcknowledgedAtMs - 50;
  const gapReservationAtMs = base.commitAcknowledgedAtMs - 25;
  const gapNonce = `${base.heldNonce}-pre-ack-gap`;
  const earlyOffObservations = base.processClosures.map((closure) => Object.freeze({
    processId: closure.processId,
    processPid: closure.processPid,
    ordinaryPoolId: closure.ordinaryPoolId,
    controlPoolId: closure.controlPoolId,
    ordinaryPoolExhausted: closure.ordinaryPoolExhausted,
    state: "DISABLED" as const,
    supportRegisterVersion: base.offRegisterVersion,
    atMs: firstOffAtMs,
    configQueryDelayMs: 0,
    eventLoopDelayMs: 1,
    configQueryStressRun: null,
    configQueryStressRegisterVersion: null,
    eventLoopStressRun: null,
    eventLoopStressRegisterVersion: null,
    health: "HEALTHY" as const
  }));
  const gapReservation = Object.freeze({
    ...base.reservations[0]!,
    kind: "queued" as const,
    nonce: gapNonce,
    reservationId: `reservation-${run}-pre-ack-gap`,
    supportRegisterVersion: base.offRegisterVersion,
    atMs: gapReservationAtMs
  });
  return replaceRun(base, {
    observations: Object.freeze([...earlyOffObservations, ...base.observations]),
    reservations: Object.freeze([...base.reservations, gapReservation]),
    spawns: Object.freeze([
      ...base.spawns,
      Object.freeze({ nonce: gapNonce, atMs: base.commitAcknowledgedAtMs - 10 })
    ]),
    lastReservationAtMs: gapReservationAtMs
  });
}

class TestEventStream<T> implements AsyncIterable<T> {
  private readonly queued: T[] = [];
  private readonly readers: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(event: T): void {
    const reader = this.readers.shift();
    if (reader === undefined) this.queued.push(event);
    else reader({ done: false, value: event });
  }

  close(): void {
    this.closed = true;
    for (const reader of this.readers.splice(0)) reader({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async () => {
        const event = this.queued.shift();
        if (event !== undefined) return { done: false, value: event };
        if (this.closed) return { done: true, value: undefined };
        return new Promise<IteratorResult<T>>((resolve) => this.readers.push(resolve));
      }
    };
  }
}

function after(timestamp: number): Promise<number> {
  return new Promise((resolve) => {
    const sample = () => {
      const now = Date.now();
      if (now > timestamp) resolve(now);
      else setTimeout(sample, 1);
    };
    sample();
  });
}

class PreAckObservationViolationSut implements SupportSwitchSystemUnderTest {
  readonly submitCalls: Array<Readonly<{ kind: SupportSubmissionKind; nonce: string }>> = [];
  readonly violationWindows: Array<Readonly<{
    run: 1 | 2 | 3;
    offRegisterVersion: string;
    firstOffAtMs: number;
    reservationAtMs: number;
    spawnAtMs: number;
    commitAcknowledgedAtMs: number;
  }>> = [];

  private readonly reservationStream = new TestEventStream<SupportReservationEvent>();
  private readonly observationStream = new TestEventStream<SupportObservationEvent>();
  private readonly spawnStream = new TestEventStream<SupportActualSpawnEvent>();
  private state: "ENABLED" | "DISABLED" = "ENABLED";
  private registerVersion = 17;
  private runCount = 0;

  constructor() {
    const atMs = Date.now();
    this.observationStream.push(this.observation("a", "ENABLED", "17", atMs));
    this.observationStream.push(this.observation("b", "ENABLED", "17", atMs));
  }

  private observation(
    process: "a" | "b",
    state: "ENABLED" | "DISABLED",
    supportRegisterVersion: string,
    atMs: number,
    stressRun: 1 | 2 | 3 | null = null
  ): SupportObservationEvent {
    const stressed = state === "DISABLED" && stressRun !== null;
    return Object.freeze({
      processId: `process-${process}`,
      processPid: process === "a" ? 20_001 : 20_002,
      ordinaryPoolId: `ordinary-${process}`,
      controlPoolId: `control-${process}`,
      ordinaryPoolExhausted: true,
      state,
      supportRegisterVersion,
      atMs,
      configQueryDelayMs: stressed && process === "a" ? 100 : 0,
      eventLoopDelayMs: stressed && process === "b" ? 100 : 1,
      configQueryStressRun: stressed && process === "a" ? stressRun : null,
      configQueryStressRegisterVersion: stressed && process === "a"
        ? supportRegisterVersion
        : null,
      eventLoopStressRun: stressed && process === "b" ? stressRun : null,
      eventLoopStressRegisterVersion: stressed && process === "b"
        ? supportRegisterVersion
        : null,
      health: "HEALTHY"
    });
  }

  private reservation(
    kind: SupportSubmissionKind,
    nonce: string,
    supportRegisterVersion: string,
    atMs: number
  ): SupportReservationEvent {
    return Object.freeze({
      processId: "process-a",
      processPid: 20_001,
      ordinaryPoolId: "ordinary-a",
      controlPoolId: "control-a",
      ordinaryPoolExhausted: true,
      kind,
      nonce,
      reservationId: `reservation-${nonce}`,
      supportRegisterVersion,
      atMs,
      immutable: true,
      singleUse: true
    });
  }

  private receipt(
    registerVersion: number,
    previousSupportRegisterVersion: number,
    recordedAtMs: number
  ): SupportPublicationReceipt {
    return Object.freeze({
      registerVersion: parseRegisterVersionText(String(registerVersion)),
      baseRegisterVersion: parseRegisterVersionText("1"),
      publicationId: `pre-ack-publication-${registerVersion}`,
      publicationKind: "SUPPORT_CONFIGURATION",
      requestSha256: "a".repeat(64),
      snapshotSha256: "b".repeat(64),
      rowCount: 16,
      recordedAt: new Date(recordedAtMs),
      previousSupportRegisterVersion: parseRegisterVersionText(
        String(previousSupportRegisterVersion)
      ),
      supportSnapshotSha256: "c".repeat(64),
      changedKeys: Object.freeze([])
    });
  }

  private emitAfterAcknowledgement(
    acknowledgedAtMs: number,
    emit: (atMs: number) => void
  ): void {
    const sample = () => {
      const now = Date.now();
      if (now > acknowledgedAtMs) emit(now);
      else setTimeout(sample, 1);
    };
    setTimeout(sample, 1);
  }

  async publishOff(): ReturnType<SupportSwitchSystemUnderTest["publishOff"]> {
    const run = (this.runCount += 1) as 1 | 2 | 3;
    const previousVersion = this.registerVersion;
    const nextVersion = previousVersion + 1;
    const versionText = String(nextVersion);
    const recordedAtMs = Date.now();
    this.state = "DISABLED";
    this.registerVersion = nextVersion;

    const firstOffAtMs = await after(recordedAtMs);
    this.observationStream.push(this.observation("a", "DISABLED", versionText, firstOffAtMs));
    this.observationStream.push(this.observation("b", "DISABLED", versionText, firstOffAtMs));

    const reservationAtMs = await after(firstOffAtMs);
    const gapNonce = `run-${run}-pre-ack-gap`;
    this.reservationStream.push(this.reservation(
      "queued",
      gapNonce,
      versionText,
      reservationAtMs
    ));
    const spawnAtMs = await after(reservationAtMs);
    this.spawnStream.push(Object.freeze({ nonce: gapNonce, atMs: spawnAtMs }));
    const commitAcknowledgedAtMs = await after(Math.max(spawnAtMs, firstOffAtMs + 4));
    this.violationWindows.push(Object.freeze({
      run,
      offRegisterVersion: versionText,
      firstOffAtMs,
      reservationAtMs,
      spawnAtMs,
      commitAcknowledgedAtMs
    }));

    this.emitAfterAcknowledgement(commitAcknowledgedAtMs, (atMs) => {
      this.observationStream.push(this.observation("a", "DISABLED", versionText, atMs, run));
      this.observationStream.push(this.observation("b", "DISABLED", versionText, atMs, run));
    });
    return Object.freeze({
      receipt: this.receipt(nextVersion, previousVersion, recordedAtMs),
      commitAcknowledgedAtMs
    });
  }

  async publishOn(): ReturnType<SupportSwitchSystemUnderTest["publishOn"]> {
    const previousVersion = this.registerVersion;
    const nextVersion = previousVersion + 1;
    const versionText = String(nextVersion);
    const recordedAtMs = Date.now();
    const commitAcknowledgedAtMs = await after(recordedAtMs);
    this.state = "ENABLED";
    this.registerVersion = nextVersion;
    this.emitAfterAcknowledgement(commitAcknowledgedAtMs, (atMs) => {
      this.observationStream.push(this.observation("a", "ENABLED", versionText, atMs));
      this.observationStream.push(this.observation("b", "ENABLED", versionText, atMs));
    });
    return Object.freeze({
      receipt: this.receipt(nextVersion, previousVersion, recordedAtMs),
      commitAcknowledgedAtMs
    });
  }

  reservationEvents(): AsyncIterable<SupportReservationEvent> {
    return this.reservationStream;
  }

  observationEvents(): AsyncIterable<SupportObservationEvent> {
    return this.observationStream;
  }

  actualSpawnEvents(): AsyncIterable<SupportActualSpawnEvent> {
    return this.spawnStream;
  }

  async domState(): Promise<"ENABLED" | "DISABLED"> {
    return this.state;
  }

  async submit(kind: SupportSubmissionKind, nonce: string): Promise<void> {
    this.submitCalls.push(Object.freeze({ kind, nonce }));
  }

  async holdRelayBodyAfterReservation(nonce: string): ReturnType<
    SupportSwitchSystemUnderTest["holdRelayBodyAfterReservation"]
  > {
    this.reservationStream.push(this.reservation(
      "new",
      nonce,
      String(this.registerVersion),
      Date.now()
    ));
    let released = false;
    return Object.freeze({
      release: () => {
        if (released) return;
        released = true;
        this.spawnStream.push(Object.freeze({ nonce, atMs: Date.now() }));
      }
    });
  }

  close(): void {
    this.reservationStream.close();
    this.observationStream.close();
    this.spawnStream.close();
  }
}

const INVALID_TIMESTAMPS = Object.freeze([
  Object.freeze({ label: "NaN", value: Number.NaN }),
  Object.freeze({ label: "Infinity", value: Number.POSITIVE_INFINITY }),
  Object.freeze({ label: "negative", value: -1 })
]);

const TIMESTAMP_MUTATORS = Object.freeze([
  Object.freeze({
    label: "off recorded",
    mutate: (base: ProofRunTrace, value: number) => replaceRun(base, { offRecordedAtMs: value })
  }),
  Object.freeze({
    label: "off acknowledgement",
    mutate: (base: ProofRunTrace, value: number) =>
      replaceRun(base, { commitAcknowledgedAtMs: value })
  }),
  Object.freeze({
    label: "DOM disabled",
    mutate: (base: ProofRunTrace, value: number) => replaceRun(base, { domDisabledAtMs: value })
  }),
  Object.freeze({
    label: "DOM reload disabled",
    mutate: (base: ProofRunTrace, value: number) =>
      replaceRun(base, { domReloadDisabledAtMs: value })
  }),
  Object.freeze({
    label: "last reservation",
    mutate: (base: ProofRunTrace, value: number) =>
      replaceRun(base, { lastReservationAtMs: value })
  }),
  Object.freeze({
    label: "relay partial body",
    mutate: (base: ProofRunTrace, value: number) =>
      replaceRun(base, { relayPartialBodyAtMs: value })
  }),
  Object.freeze({
    label: "relay release",
    mutate: (base: ProofRunTrace, value: number) => replaceRun(base, { relayReleaseAtMs: value })
  }),
  Object.freeze({
    label: "held spawn",
    mutate: (base: ProofRunTrace, value: number) => replaceRun(base, { heldSpawnAtMs: value })
  }),
  Object.freeze({
    label: "on recorded",
    mutate: (base: ProofRunTrace, value: number) => replaceRun(base, { onRecordedAtMs: value })
  }),
  Object.freeze({
    label: "on acknowledgement",
    mutate: (base: ProofRunTrace, value: number) =>
      replaceRun(base, { onCommitAcknowledgedAtMs: value })
  }),
  Object.freeze({
    label: "process closure event",
    mutate: (base: ProofRunTrace, value: number) => replaceRun(base, {
      processClosures: Object.freeze([
        Object.freeze({ ...base.processClosures[0]!, closedAtMs: value }),
        base.processClosures[1]!
      ])
    })
  }),
  Object.freeze({
    label: "observation event",
    mutate: (base: ProofRunTrace, value: number) => replaceRun(base, {
      observations: Object.freeze([
        Object.freeze({ ...base.observations[0]!, atMs: value }),
        ...base.observations.slice(1)
      ])
    })
  }),
  Object.freeze({
    label: "reservation event",
    mutate: (base: ProofRunTrace, value: number) => replaceRun(base, {
      reservations: Object.freeze([
        Object.freeze({ ...base.reservations[0]!, atMs: value })
      ])
    })
  }),
  Object.freeze({
    label: "spawn event",
    mutate: (base: ProofRunTrace, value: number) => replaceRun(base, {
      spawns: Object.freeze([
        Object.freeze({ ...base.spawns[0]!, atMs: value })
      ])
    })
  })
]);

describe("support switch proof verifier", () => {
  it("accepts all three runs and reports the worst convergence span", () => {
    const proof = assertSupportSwitchProofRuns([
      validRun(1),
      validRun(2, 10_000),
      replaceRun(validRun(3, 20_000), {
        domDisabledAtMs: 40_900
      })
    ]);

    expect(proof.runs).toHaveLength(3);
    expect(proof.worstRun).toBe(3);
    expect(proof.worstConvergenceSpanMs).toBe(900);
  });

  it("rejects the pre-ack observation cutoff counterexample in all three runs", () => {
    expect(() => assertSupportSwitchProofRuns([
      preAckViolationRun(1),
      preAckViolationRun(2, 10_000),
      preAckViolationRun(3, 20_000)
    ])).toThrowError(/POST_OBSERVATION_RESERVATION/u);
  });

  it("runs all 24 boundary submissions before rejecting pre-ack observation violations", async () => {
    const sut = new PreAckObservationViolationSut();
    let failure: unknown;
    try {
      await runSupportSwitchProofSuite(sut, { log: () => undefined });
    } catch (error) {
      failure = error;
    } finally {
      sut.close();
    }

    expect(sut.submitCalls).toHaveLength(24);
    expect(sut.violationWindows).toHaveLength(3);
    expect(sut.submitCalls.filter(({ kind }) => kind === "new")).toHaveLength(6);
    expect(sut.submitCalls.filter(({ kind }) => kind === "queued")).toHaveLength(6);
    expect(sut.submitCalls.filter(({ kind }) => kind === "retry")).toHaveLength(6);
    expect(sut.submitCalls.filter(({ kind }) => kind === "follow-on")).toHaveLength(6);
    for (const window of sut.violationWindows) {
      expect(window.firstOffAtMs).toBeLessThan(window.reservationAtMs);
      expect(window.reservationAtMs).toBeLessThan(window.spawnAtMs);
      expect(window.spawnAtMs).toBeLessThan(window.commitAcknowledgedAtMs);
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toMatch(/POST_OBSERVATION_RESERVATION/u);
  }, 40_000);

  it.each(["new", "queued", "retry", "follow-on"] as const)(
    "kills the attributed %s reservation/spawn gap mutant",
    (kind) => {
      const base = validRun(1);
      const nonce = `${base.heldNonce}-${kind}-gap`;
      const gapReservation = Object.freeze({
        ...base.reservations[0]!,
        processId: "process-b",
        processPid: 10_002,
        ordinaryPoolId: "ordinary-b",
        controlPoolId: "control-b",
        kind,
        nonce,
        reservationId: `reservation-${kind}-gap`,
        supportRegisterVersion: base.offRegisterVersion,
        atMs: base.commitAcknowledgedAtMs + 700
      });
      expect(() => assertSupportSwitchProofRuns([
        replaceRun(base, {
          reservations: Object.freeze([...base.reservations, gapReservation]),
          spawns: Object.freeze([
            ...base.spawns,
            Object.freeze({ nonce, atMs: base.commitAcknowledgedAtMs + 800 })
          ]),
          lastReservationAtMs: gapReservation.atMs,
          unexpectedReservationCount: 0,
          unexpectedSpawnCount: 0
        }),
        validRun(2),
        validRun(3)
      ])).toThrowError(/POST_OBSERVATION_RESERVATION/u);
    }
  );

  it("kills a gap spawn without an attributed pre-observation reservation", () => {
    const base = validRun(1);
    expect(() => assertSupportSwitchProofRuns([
      replaceRun(base, {
        spawns: Object.freeze([
          ...base.spawns,
          Object.freeze({
            nonce: `${base.heldNonce}-unreserved-gap-spawn`,
            atMs: base.commitAcknowledgedAtMs + 700
          })
        ]),
        unexpectedSpawnCount: 0
      }),
      validRun(2),
      validRun(3)
    ])).toThrowError(/POST_OBSERVATION_OR_UNRESERVED_SPAWN/u);
  });

  it("allows a reservation made before its attributed process observes OFF", () => {
    const base = validRun(1);
    const nonce = `${base.heldNonce}-before-process-b-off`;
    const permittedReservation = Object.freeze({
      ...base.reservations[0]!,
      processId: "process-b",
      processPid: 10_002,
      ordinaryPoolId: "ordinary-b",
      controlPoolId: "control-b",
      kind: "queued" as const,
      nonce,
      reservationId: "reservation-before-process-b-off",
      atMs: base.commitAcknowledgedAtMs + 500
    });
    const proof = assertSupportSwitchProofRuns([
      replaceRun(base, {
        reservations: Object.freeze([...base.reservations, permittedReservation]),
        spawns: Object.freeze([
          ...base.spawns,
          Object.freeze({ nonce, atMs: base.commitAcknowledgedAtMs + 5_075 })
        ]),
        lastReservationAtMs: permittedReservation.atMs
      }),
      validRun(2),
      validRun(3)
    ]);

    expect(proof.runs[0]?.convergenceSpanMs).toBe(600);
  });

  it("kills a reservation after the first OFF observation when a later witness carries stress", () => {
    const base = validRun(1);
    const firstOffObservation = Object.freeze({
      ...base.observations[0]!,
      atMs: base.commitAcknowledgedAtMs + 300,
      configQueryDelayMs: 0,
      configQueryStressRun: null,
      configQueryStressRegisterVersion: null
    });
    const nonce = `${base.heldNonce}-after-first-off`;
    const gapReservation = Object.freeze({
      ...base.reservations[0]!,
      nonce,
      reservationId: "reservation-after-first-off",
      atMs: base.commitAcknowledgedAtMs + 350
    });
    expect(() => assertSupportSwitchProofRuns([
      replaceRun(base, {
        observations: Object.freeze([firstOffObservation, ...base.observations]),
        reservations: Object.freeze([...base.reservations, gapReservation]),
        spawns: Object.freeze([
          ...base.spawns,
          Object.freeze({ nonce, atMs: base.commitAcknowledgedAtMs + 700 })
        ]),
        lastReservationAtMs: gapReservation.atMs
      }),
      validRun(2),
      validRun(3)
    ])).toThrowError(/POST_OBSERVATION_RESERVATION/u);
  });

  it("kills the pre-OFF-only stress mutant", () => {
    const base = validRun(1);
    const preOffConfigStress = Object.freeze({
      ...base.observations[0]!,
      state: "ENABLED" as const,
      supportRegisterVersion: base.offPreviousSupportRegisterVersion,
      atMs: base.commitAcknowledgedAtMs - 200,
      configQueryStressRegisterVersion: base.offPreviousSupportRegisterVersion
    });
    const preOffEventLoopStress = Object.freeze({
      ...base.observations[1]!,
      state: "ENABLED" as const,
      supportRegisterVersion: base.offPreviousSupportRegisterVersion,
      atMs: base.commitAcknowledgedAtMs - 100,
      eventLoopStressRegisterVersion: base.offPreviousSupportRegisterVersion
    });
    const unstressedOff = base.observations.slice(0, 2).map((observation) => Object.freeze({
      ...observation,
      configQueryDelayMs: 0,
      eventLoopDelayMs: 1,
      configQueryStressRun: null,
      configQueryStressRegisterVersion: null,
      eventLoopStressRun: null,
      eventLoopStressRegisterVersion: null
    }));
    expect(() => assertSupportSwitchProofRuns([
      replaceRun(base, {
        observations: Object.freeze([
          preOffConfigStress,
          preOffEventLoopStress,
          ...unstressedOff,
          ...base.observations.slice(2)
        ])
      }),
      validRun(2),
      validRun(3)
    ])).toThrowError(/OFF_CLOSURE_STRESS_MISSING/u);
  });

  it("accepts stress evidence at the exact healthy minimum on OFF closure witnesses", () => {
    const base = validRun(1);
    const observations = base.observations.map((observation, index) => Object.freeze({
      ...observation,
      ...(index === 0 ? { configQueryDelayMs: 75 } : {}),
      ...(index === 1 ? { eventLoopDelayMs: 75 } : {})
    }));
    expect(assertSupportSwitchProofRuns([
      replaceRun(base, { observations: Object.freeze(observations) }),
      validRun(2),
      validRun(3)
    ]).runs[0]?.convergenceSpanMs).toBe(600);
  });

  it.each(INVALID_TIMESTAMPS.flatMap((invalid) =>
    TIMESTAMP_MUTATORS.map((timestamp) => Object.freeze({
      name: `${timestamp.label} ${invalid.label}`,
      value: invalid.value,
      mutate: timestamp.mutate
    }))))("rejects non-finite or negative $name", ({ value, mutate }) => {
    expect(() => assertSupportSwitchProofRuns([
      mutate(validRun(1), value),
      validRun(2),
      validRun(3)
    ])).toThrowError(/TIMESTAMP_INVALID/u);
  });

  it("accepts a finite zero timestamp", () => {
    const base = validRun(1);
    expect(assertSupportSwitchProofRuns([
      replaceRun(base, { offRecordedAtMs: 0 }),
      validRun(2),
      validRun(3)
    ]).runs[0]?.offRecordedAtMs).toBe(0);
  });

  it("kills the count-spawn-as-reservation mutant", () => {
    const base = validRun(1);
    expect(() => assertSupportSwitchProofRuns([
      replaceRun(base, { lastReservationAtMs: base.heldSpawnAtMs }),
      validRun(2),
      validRun(3)
    ])).toThrowError(/LAST_RESERVATION_EVIDENCE_INVALID/u);
  });

  it("kills the release-early mutant", () => {
    const base = validRun(1);
    expect(() => assertSupportSwitchProofRuns([
      replaceRun(base, { relayReleaseAtMs: base.commitAcknowledgedAtMs + 5_000 }),
      validRun(2),
      validRun(3)
    ])).toThrowError(/RELAY_RELEASE_NOT_STRICTLY_AFTER_BOUND/u);
  });

  it("kills the handler-entry-as-spawn mutant", () => {
    const base = validRun(1);
    expect(() => assertSupportSwitchProofRuns([
      replaceRun(base, { heldSpawnAtMs: base.relayPartialBodyAtMs }),
      validRun(2),
      validRun(3)
    ])).toThrowError(/ACTUAL_SPAWN_ORDER_INVALID/u);
  });

  it("kills the retry-held-nonce mutant", () => {
    const base = validRun(1);
    const retried = Object.freeze({
      ...base.reservations[0]!,
      reservationId: "reservation-retry",
      kind: "retry" as const,
      atMs: base.commitAcknowledgedAtMs + 5_001
    });
    expect(() => assertSupportSwitchProofRuns([
      replaceRun(base, {
        reservations: Object.freeze([...base.reservations, retried]),
        lastReservationAtMs: retried.atMs,
        heldReservationCount: 2,
        unexpectedReservationCount: 1
      }),
      validRun(2),
      validRun(3)
    ])).toThrowError(/HELD_NONCE_NOT_SINGLE_USE/u);
  });

  it("kills the best-of-three mutant by rejecting one slow run", () => {
    const slow = validRun(3);
    expect(() => assertSupportSwitchProofRuns([
      validRun(1),
      validRun(2),
      replaceRun(slow, {
        processClosures: Object.freeze([
          slow.processClosures[0]!,
          Object.freeze({
            ...slow.processClosures[1]!,
            closedAtMs: slow.commitAcknowledgedAtMs + 5_001
          })
        ])
      })
    ])).toThrowError(/CONVERGENCE_BOUND_EXCEEDED/u);
  });

  it("kills the marker-time-as-ack mutant", () => {
    const base = validRun(1);
    expect(() => assertSupportSwitchProofRuns([
      replaceRun(base, { commitAcknowledgedAtMs: base.offRecordedAtMs }),
      validRun(2),
      validRun(3)
    ])).toThrowError(/ACK_NOT_AFTER_COMMIT/u);
  });

  it("never passes a process observation beyond the 250ms health bound", () => {
    const base = validRun(1);
    const unhealthy = Object.freeze({
      ...base.observations[0]!,
      eventLoopDelayMs: 251,
      health: "PROCESS_UNHEALTHY" as const
    });
    expect(() => assertSupportSwitchProofRuns([
      replaceRun(base, {
        observations: Object.freeze([unhealthy, base.observations[1]!])
      }),
      validRun(2),
      validRun(3)
    ])).toThrowError(/PROCESS_UNHEALTHY/u);
  });
});
