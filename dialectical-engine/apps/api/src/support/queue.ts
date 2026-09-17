import { TypedDomainError } from "@debateai/kernel";
import type { SupportLimits } from "./limits.js";
import { supportTemplate,type SupportLanguage } from "./templates.js";

export class SupportQueueError extends TypedDomainError {
  constructor(code: "SUPPORT_QUEUE_FULL" | "SUPPORT_QUEUE_ABORTED" | "SUPPORT_DAILY_CAP") {
    super(code,code);
    this.name = "SupportQueueError";
  }
}

export type SupportRelaySlot = Readonly<{
  position: number;
  release(): void | Promise<void>;
}>;

export type SupportRelayReservation =
  | Readonly<{ kind: "BUSY" }>
  | Readonly<{ kind: "DAILY_CAP" }>
  | Readonly<{
    kind: "ACQUIRED";
    release(): Promise<void>;
    forceRelease?(): void;
  }>;

export type SupportRelayQueueEntry =
  | Readonly<{ kind: "FULL" }>
  | Readonly<{ kind: "DAILY_CAP" }>
  | Readonly<{ kind: "WAITING";waiterId: string;ticket: number;position: number }>
  | Extract<SupportRelayReservation,{ kind: "ACQUIRED" }>;

export type SupportQueueCleanupDiagnostic = Readonly<{
  code: "SUPPORT_QUEUE_CLEANUP_TIMEOUT" | "SUPPORT_QUEUE_CLEANUP_FAILED";
}>;

export interface SupportRelayReservationPort {
  tryAcquire(input: Readonly<{
    at: Date;
    concurrency: number;
    dailyCap: number;
    waiterId?: string;
  }>): Promise<SupportRelayReservation>;
  enter?(input: Readonly<{
    at: Date;
    concurrency: number;
    dailyCap: number;
    queueDepth: number;
  }>): Promise<SupportRelayQueueEntry>;
  cancel?(input: Readonly<{ waiterId: string;at: Date }>): Promise<void>;
  renew?(input: Readonly<{
    waiterIds: readonly string[];
    at: Date;
  }>): Promise<readonly string[]>;
  reconcile?(input: Readonly<{
    waiterIds: readonly string[];
    at: Date;
    queueDepth: number;
  }>): Promise<Readonly<{
    liveWaiterIds: readonly string[];
    capacityRejectedWaiterIds: readonly string[];
  }>>;
}

type Pending = {
  readonly position: number;
  readonly signal: AbortSignal | undefined;
  readonly abort: () => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly resolve: (slot: SupportRelaySlot) => void;
  readonly reject: (error: SupportQueueError) => void;
  readonly waiterId?: string;
  state: "WAITING" | "ACQUIRING" | "CANCELLED" | "SETTLED";
};

function signalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function acquiredReservation(
  reservation: SupportRelayReservation
): reservation is Extract<SupportRelayReservation,{ kind: "ACQUIRED" }> {
  return reservation.kind === "ACQUIRED";
}

function awaitWithAbort<T>(
  promise: Promise<T>,signal: AbortSignal | undefined,
  onLateValue?: (value: T) => void | Promise<void>
): Promise<T> {
  if (signal === undefined) return promise;
  return new Promise<T>((resolve,reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort",abort);
      reject(new SupportQueueError("SUPPORT_QUEUE_ABORTED"));
    };
    signal.addEventListener("abort",abort,{ once: true });
    if (signal.aborted) abort();
    void promise.then((value) => {
      if (settled) {
        void Promise.resolve(onLateValue?.(value)).catch(() => undefined);
        return;
      }
      settled = true;
      signal.removeEventListener("abort",abort);
      resolve(value);
    },(error: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort",abort);
      reject(error);
    });
  });
}

export class SupportRelayQueue {
  readonly #readLimits: () => Promise<SupportLimits>;
  readonly #clock: () => Date;
  readonly #reservations: SupportRelayReservationPort | undefined;
  readonly #reportCleanupFailure: ((diagnostic: SupportQueueCleanupDiagnostic) => void) | undefined;
  readonly #pending: Pending[] = [];
  #durableDrainRunning = false;
  #localDrainRunning = false;
  #durablePollTimer: ReturnType<typeof setTimeout> | undefined;
  #active = 0;
  #utcDay = "";
  #modelCalls = 0;

  constructor(input: Readonly<{
    readLimits: () => Promise<SupportLimits>;
    clock?: () => Date;
    reservations?: SupportRelayReservationPort;
    reportCleanupFailure?: (diagnostic: SupportQueueCleanupDiagnostic) => void;
  }>) {
    this.#readLimits = input.readLimits;
    this.#clock = input.clock ?? (() => new Date());
    this.#reservations = input.reservations;
    this.#reportCleanupFailure = input.reportCleanupFailure;
  }

  async acquireRelaySlot(input: Readonly<{
    language: SupportLanguage;
    signal?: AbortSignal;
    onProgress?: (notice: string) => void;
  }>): Promise<SupportRelaySlot> {
    if (signalAborted(input.signal)) {
      throw new SupportQueueError("SUPPORT_QUEUE_ABORTED");
    }
    const limits = await awaitWithAbort(this.#readLimits(),input.signal);
    if (this.#reservations !== undefined) {
      return this.#acquireDurable(input,limits);
    }
    await this.#drain();
    if (this.#pending.length === 0 && this.#active < limits.support_relay_concurrency) {
      this.#consumeDailyCall(limits.support_daily_call_cap);
      this.#active += 1;
      return this.#slot(0);
    }
    if (this.#pending.length >= limits.support_queue_depth) {
      throw new SupportQueueError("SUPPORT_QUEUE_FULL");
    }
    const position = this.#pending.length + 1;
    return new Promise<SupportRelaySlot>((resolve,reject) => {
      let pending!: Pending;
      const abort = () => {
        this.#cancelPending(pending);
      };
      pending = {
        position,signal: input.signal,abort,resolve,reject,state: "WAITING",
        timer: setTimeout(() => {
          input.onProgress?.(supportTemplate("QUEUED",input.language)
            .replace("{n}",String(position)));
        },3_000)
      };
      input.signal?.addEventListener("abort",abort,{ once: true });
      this.#pending.push(pending);
    });
  }

  async execute<T>(input: Readonly<{
    modelBacked: boolean;
    language: SupportLanguage;
    signal?: AbortSignal;
    onProgress?: (notice: string) => void;
  }>,operation: (signal?: AbortSignal) => Promise<T>): Promise<T> {
    if (!input.modelBacked) return operation(input.signal);
    const slot = await this.acquireRelaySlot(input);
    let abort: (() => void) | undefined;
    try {
      const running = operation(input.signal);
      if (input.signal === undefined) return await running;
      const aborted = new Promise<never>((_resolve,reject) => {
        abort = () => reject(new SupportQueueError("SUPPORT_QUEUE_ABORTED"));
        if (input.signal!.aborted) abort();
        else input.signal!.addEventListener("abort",abort,{ once: true });
      });
      try {
        return await Promise.race([running,aborted]);
      } catch (error) {
        if (!input.signal.aborted) throw error;
        await this.#awaitOperationTerminal(running);
        throw new SupportQueueError("SUPPORT_QUEUE_ABORTED");
      }
    } finally {
      if (abort !== undefined) input.signal?.removeEventListener("abort",abort);
      await slot.release();
    }
  }

  #awaitOperationTerminal<T>(operation: Promise<T>): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish,50);
      void operation.then(finish,finish);
    });
  }

  activeCount(): number {
    return this.#active;
  }

  queuedCount(): number {
    return this.#pending.length;
  }

  modelCallsToday(): number {
    this.#refreshUtcDay();
    return this.#modelCalls;
  }

  #slot(position: number): SupportRelaySlot {
    let released = false;
    return Object.freeze({
      position,
      release: () => {
        if (released) return;
        released = true;
        this.#active -= 1;
        void this.#drain();
      }
    });
  }

  async #acquireDurable(input: Readonly<{
    language: SupportLanguage;
    signal?: AbortSignal;
    onProgress?: (notice: string) => void;
  }>,limits: SupportLimits): Promise<SupportRelaySlot> {
    if (this.#reservations!.enter !== undefined && this.#reservations!.cancel !== undefined) {
      return this.#enterCoordinated(input,limits);
    }
    if (this.#pending.length === 0 && this.#active < limits.support_relay_concurrency) {
      const reservation = await awaitWithAbort(this.#reservations!.tryAcquire({
        at: this.#clock(),concurrency: limits.support_relay_concurrency,
        dailyCap: limits.support_daily_call_cap
      }),input.signal,async (late) => {
        if (late.kind === "ACQUIRED") await this.#boundedCleanup(
          late.release(),late.forceRelease
        );
      });
      if (reservation.kind === "DAILY_CAP") {
        throw new SupportQueueError("SUPPORT_DAILY_CAP");
      }
      if (reservation.kind === "ACQUIRED") {
        this.#active += 1;
        return this.#durableSlot(0,reservation);
      }
    }
    if (this.#pending.length >= limits.support_queue_depth) {
      throw new SupportQueueError("SUPPORT_QUEUE_FULL");
    }
    const position = this.#pending.length + 1;
    const promised = new Promise<SupportRelaySlot>((resolve,reject) => {
      let pending!: Pending;
      const abort = () => {
        this.#cancelPending(pending);
      };
      pending = {
        position,signal: input.signal,abort,resolve,reject,state: "WAITING",
        timer: setTimeout(() => {
          input.onProgress?.(supportTemplate("QUEUED",input.language)
            .replace("{n}",String(position)));
        },3_000)
      };
      input.signal?.addEventListener("abort",abort,{ once: true });
      this.#pending.push(pending);
    });
    this.#scheduleDurableDrain();
    return promised;
  }

  async #enterCoordinated(input: Readonly<{
    language: SupportLanguage;
    signal?: AbortSignal;
    onProgress?: (notice: string) => void;
  }>,limits: SupportLimits): Promise<SupportRelaySlot> {
    const enteredPromise = this.#reservations!.enter!({
      at: this.#clock(),concurrency: limits.support_relay_concurrency,
      dailyCap: limits.support_daily_call_cap,queueDepth: limits.support_queue_depth
    });
    const entered = await awaitWithAbort(enteredPromise,input.signal,async (late) => {
      if (late.kind === "ACQUIRED") {
        await this.#boundedCleanup(late.release(),late.forceRelease);
      } else if (late.kind === "WAITING") {
        await this.#boundedCleanup(this.#reservations!.cancel!({
          waiterId: late.waiterId,at: this.#clock()
        }));
      }
    });
    if (entered.kind === "FULL") throw new SupportQueueError("SUPPORT_QUEUE_FULL");
    if (entered.kind === "DAILY_CAP") throw new SupportQueueError("SUPPORT_DAILY_CAP");
    if (entered.kind === "ACQUIRED") {
      if (signalAborted(input.signal)) {
        await this.#boundedCleanup(entered.release(),entered.forceRelease);
        throw new SupportQueueError("SUPPORT_QUEUE_ABORTED");
      }
      this.#active += 1;
      return this.#durableSlot(0,entered);
    }
    if (signalAborted(input.signal)) {
      await this.#boundedCleanup(this.#reservations!.cancel!({
        waiterId: entered.waiterId,at: this.#clock()
      }));
      throw new SupportQueueError("SUPPORT_QUEUE_ABORTED");
    }
    const promised = new Promise<SupportRelaySlot>((resolve,reject) => {
      let pending!: Pending;
      const abort = () => {
        this.#cancelPending(pending);
      };
      pending = {
        position: entered.position,signal: input.signal,abort,resolve,reject,
        state: "WAITING",
        waiterId: entered.waiterId,
        timer: setTimeout(() => {
          input.onProgress?.(supportTemplate("QUEUED",input.language)
            .replace("{n}",String(entered.position)));
        },3_000)
      };
      input.signal?.addEventListener("abort",abort,{ once: true });
      this.#pending.push(pending);
    });
    this.#scheduleDurableDrain(0);
    return promised;
  }

  #durableSlot(position: number,reservation: Extract<SupportRelayReservation,{ kind: "ACQUIRED" }>): SupportRelaySlot {
    let released = false;
    let cleanup: Promise<void> | undefined;
    return Object.freeze({
      position,
      release: async () => {
        if (released) return cleanup;
        released = true;
        this.#active -= 1;
        this.#scheduleDurableDrain(0);
        cleanup = this.#boundedCleanup(reservation.release(),reservation.forceRelease);
        return cleanup;
      }
    });
  }

  #boundedCleanup(operation: Promise<void>,force?: () => void): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (diagnostic?: SupportQueueCleanupDiagnostic) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (diagnostic !== undefined) this.#reportCleanupFailure?.(diagnostic);
        resolve();
      };
      const timer = setTimeout(() => {
        try { force?.(); } catch { /* the diagnostic below is the reporting seam */ }
        finish(Object.freeze({ code: "SUPPORT_QUEUE_CLEANUP_TIMEOUT" }));
      },50);
      void operation.then(
        () => finish(),
        () => finish(Object.freeze({ code: "SUPPORT_QUEUE_CLEANUP_FAILED" }))
      );
    });
  }

  #findPending(pending: Pending): Pending | undefined {
    return pending.waiterId === undefined
      ? this.#pending.find((candidate) => candidate === pending)
      : this.#pending.find((candidate) => candidate.waiterId === pending.waiterId);
  }

  #removePending(pending: Pending): boolean {
    const current = this.#findPending(pending);
    if (current === undefined) return false;
    const index = this.#pending.indexOf(current);
    if (index < 0) return false;
    this.#pending.splice(index,1);
    clearTimeout(current.timer);
    current.signal?.removeEventListener("abort",current.abort);
    return true;
  }

  #cancelPending(pending: Pending): void {
    if (pending.state === "CANCELLED" || pending.state === "SETTLED") return;
    pending.state = "CANCELLED";
    this.#removePending(pending);
    if (pending.waiterId !== undefined && this.#reservations?.cancel !== undefined) {
      pending.reject(new SupportQueueError("SUPPORT_QUEUE_ABORTED"));
      void this.#boundedCleanup(this.#reservations.cancel({
        waiterId: pending.waiterId,at: this.#clock()
      }));
      return;
    }
    pending.reject(new SupportQueueError("SUPPORT_QUEUE_ABORTED"));
  }

  #scheduleDurableDrain(delay = 100): void {
    if (this.#durablePollTimer !== undefined || this.#pending.length === 0) return;
    this.#durablePollTimer = setTimeout(() => {
      this.#durablePollTimer = undefined;
      void this.#drainDurable();
    },delay);
  }

  async #drainDurable(): Promise<void> {
    if (this.#durableDrainRunning) return;
    if (this.#reservations === undefined) return;
    this.#durableDrainRunning = true;
    try {
      while (this.#pending.length > 0) {
        let limits: SupportLimits;
        try {
          limits = await this.#readLimits();
        } catch {
          return;
        }
        const waitingIds = this.#pending
          .filter((pending) => pending.state === "WAITING" && pending.waiterId !== undefined)
          .map((pending) => pending.waiterId!);
        if (waitingIds.length > 0 && (this.#reservations.reconcile !== undefined
          || this.#reservations.renew !== undefined)) {
          let liveWaiterIds: readonly string[];
          let capacityRejectedWaiterIds: readonly string[] = [];
          try {
            if (this.#reservations.reconcile !== undefined) {
              const reconciled = await this.#reservations.reconcile({
                waiterIds: waitingIds,at: this.#clock(),
                queueDepth: limits.support_queue_depth
              });
              liveWaiterIds = reconciled.liveWaiterIds;
              capacityRejectedWaiterIds = reconciled.capacityRejectedWaiterIds;
            } else {
              liveWaiterIds = await this.#reservations.renew!({
                waiterIds: waitingIds,at: this.#clock()
              });
            }
          } catch {
            return;
          }
          const attempted = new Set(waitingIds);
          const live = new Set(liveWaiterIds);
          const capacityRejected = new Set(capacityRejectedWaiterIds);
          for (const pending of [...this.#pending]) {
            if (pending.waiterId !== undefined && pending.state === "WAITING"
              && attempted.has(pending.waiterId) && !live.has(pending.waiterId)) {
              pending.state = "CANCELLED";
              this.#removePending(pending);
              pending.reject(new SupportQueueError(capacityRejected.has(pending.waiterId)
                ? "SUPPORT_QUEUE_FULL" : "SUPPORT_QUEUE_ABORTED"));
            }
          }
        }
        if (this.#active >= limits.support_relay_concurrency) return;
        const pending = this.#pending.find((candidate) => candidate.state === "WAITING");
        if (pending === undefined) return;
        pending.state = "ACQUIRING";
        let reservation: SupportRelayReservation;
        try {
          reservation = await this.#reservations.tryAcquire({
          at: this.#clock(),concurrency: limits.support_relay_concurrency,
          dailyCap: limits.support_daily_call_cap,
          ...(pending.waiterId === undefined ? {} : { waiterId: pending.waiterId })
          });
        } catch {
          const current = this.#findPending(pending);
          if (current !== undefined && current.state === "ACQUIRING") current.state = "WAITING";
          return;
        }
        const current = this.#findPending(pending);
        if (current === undefined || current.state !== "ACQUIRING") {
          if (acquiredReservation(reservation)) await this.#boundedCleanup(
            reservation.release(),reservation.forceRelease
          );
          continue;
        }
        if (reservation.kind === "BUSY") {
          current.state = "WAITING";
          return;
        }
        this.#removePending(current);
        current.state = "SETTLED";
        if (!acquiredReservation(reservation)) {
          current.reject(new SupportQueueError("SUPPORT_DAILY_CAP"));
          continue;
        }
        this.#active += 1;
        current.resolve(this.#durableSlot(current.position,reservation));
      }
    } finally {
      this.#durableDrainRunning = false;
      if (this.#pending.length > 0) this.#scheduleDurableDrain();
    }
  }

  #refreshUtcDay(): void {
    const now = this.#clock();
    if (!Number.isFinite(now.getTime())) throw new SupportQueueError("SUPPORT_DAILY_CAP");
    const day = now.toISOString().slice(0,10);
    if (day !== this.#utcDay) {
      this.#utcDay = day;
      this.#modelCalls = 0;
    }
  }

  #consumeDailyCall(cap: number): void {
    this.#refreshUtcDay();
    if (this.#modelCalls >= cap) throw new SupportQueueError("SUPPORT_DAILY_CAP");
    this.#modelCalls += 1;
  }

  async #drain(): Promise<void> {
    if (this.#localDrainRunning) return;
    this.#localDrainRunning = true;
    try {
      while (this.#pending.length > 0) {
        let limits: SupportLimits;
        try {
          limits = await this.#readLimits();
        } catch {
          return;
        }
        if (this.#active >= limits.support_relay_concurrency) return;
        const pending = this.#pending.find((candidate) => candidate.state === "WAITING");
        if (pending === undefined) return;
        this.#removePending(pending);
        pending.state = "SETTLED";
      try {
        this.#consumeDailyCall(limits.support_daily_call_cap);
      } catch (error) {
        pending.reject(error as SupportQueueError);
        continue;
      }
      this.#active += 1;
      pending.resolve(this.#slot(pending.position));
      }
    } finally {
      this.#localDrainRunning = false;
    }
  }
}
