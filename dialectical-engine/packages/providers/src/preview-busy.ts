/**
 * Parallel calls (spec docs/superpowers/specs/2026-10-12-parallel-calls-design.md §3.3, owner ruling O4) — ONE PROBE FOR
 * A BUSY MODEL. When several calls to one model are in flight and the vendor turns busy, each call used to wait 60 s and
 * resend on its own; the gate lets only one trial through its cool-off, so the rest met MODEL_COOLING and the model sat
 * out the whole debate. This coordinator, shared by every call of the runner (keyed by the model id), lets exactly one
 * refused call (the probe) wait and resend; the others wait for the probe's outcome.
 *
 * Per model:
 * - CLOSED: `admit` resolves; the first `refusedBusy` opens the model with that caller as the probe ("PROBE").
 * - OPEN: `admit` and further `refusedBusy` wait. The probe's outcome releases them all: answered or any other outcome
 *   → CLOSED, refused waiters "RESEND"; busy again → CONFIRMED_BUSY, refused waiters "GIVE_UP" (admit waiters are let
 *   through: the gate refuses their one send unbilled, which writes their own REFUSED row).
 * - CONFIRMED_BUSY until now + max(60 s, the gate's wait): `admit` resolves, `refusedBusy` is "GIVE_UP" at once; any
 *   answer, or the time running out, makes it CLOSED again.
 *
 * Every waiter is released by the probe's one `probeOutcome`, which the call policy (`withPreviewProviderCallPolicy`)
 * reports on every path the probe can end on. Preview only: hosted and local never construct one.
 */

export type BusyTurn = "PROBE" | "RESEND" | "GIVE_UP";

export interface PreviewBusyCoordinator {
  /** Before a call's FIRST send: resolves at once when the model is CLOSED or CONFIRMED_BUSY; while OPEN it waits for the probe's outcome. */
  admit(model: string): Promise<void>;
  /** A send of this model ended in a vendor busy refusal. PROBE: you are the probe (wait, then resend once). RESEND: the probe was answered, resend once now. GIVE_UP: the model is confirmed busy, end with your refusal. */
  refusedBusy(model: string, retryAfterSeconds: number | undefined): Promise<BusyTurn>;
  /** The probe's resend: answered → CLOSED; busy → CONFIRMED_BUSY for max(60 s, retryAfter); any other outcome → CLOSED. */
  probeOutcome(model: string, outcome: "ANSWERED" | "BUSY" | "OTHER", retryAfterSeconds?: number): void;
  /** Any send of this model answered: CONFIRMED_BUSY or OPEN without a probe in flight → CLOSED. */
  answered(model: string): void;
}

/** The shortest confirmed-busy spell, the same minute every unbilled resend waits (PREVIEW_UNBILLED_RETRY_COOLDOWN_MS). */
const CONFIRMED_BUSY_MIN_MS = 60_000;

type ModelState =
  | Readonly<{ kind: "OPEN"; admitWaiters: Array<() => void>; refusedWaiters: Array<(turn: BusyTurn) => void> }>
  | Readonly<{ kind: "CONFIRMED_BUSY"; until: number }>;

export function createPreviewBusyCoordinator(input: Readonly<{ now?: () => number }> = {}): PreviewBusyCoordinator {
  const now = input.now ?? Date.now;
  // An absent entry is CLOSED; an expired CONFIRMED_BUSY entry is removed on its next read.
  const states = new Map<string, ModelState>();
  const current = (model: string): ModelState | undefined => {
    const state = states.get(model);
    if (state?.kind === "CONFIRMED_BUSY" && now() >= state.until) { states.delete(model); return undefined; }
    return state;
  };
  /** Ends an OPEN spell: the model takes `next` (CLOSED when undefined) and every waiter is released. */
  const release = (model: string, state: ModelState & { kind: "OPEN" }, next: ModelState | undefined, turn: BusyTurn): void => {
    if (next === undefined) states.delete(model); else states.set(model, next);
    for (const resolve of state.admitWaiters.splice(0)) resolve();
    for (const resolve of state.refusedWaiters.splice(0)) resolve(turn);
  };
  return Object.freeze({
    admit(model: string): Promise<void> {
      const state = current(model);
      if (state?.kind !== "OPEN") return Promise.resolve();
      return new Promise<void>((resolve) => { state.admitWaiters.push(resolve); });
    },
    refusedBusy(model: string, _retryAfterSeconds: number | undefined): Promise<BusyTurn> {
      const state = current(model);
      if (state === undefined) {
        states.set(model, { kind: "OPEN", admitWaiters: [], refusedWaiters: [] });
        return Promise.resolve("PROBE");
      }
      if (state.kind === "CONFIRMED_BUSY") return Promise.resolve("GIVE_UP");
      return new Promise<BusyTurn>((resolve) => { state.refusedWaiters.push(resolve); });
    },
    probeOutcome(model: string, outcome: "ANSWERED" | "BUSY" | "OTHER", retryAfterSeconds?: number): void {
      const state = current(model);
      const busy: ModelState | undefined = outcome === "BUSY"
        ? { kind: "CONFIRMED_BUSY", until: now() + Math.max(CONFIRMED_BUSY_MIN_MS, (retryAfterSeconds ?? 0) * 1000) }
        : undefined;
      if (state?.kind === "OPEN") { release(model, state, busy, outcome === "BUSY" ? "GIVE_UP" : "RESEND"); return; }
      // No spell open (it already ended): a busy probe still marks the model; any other outcome changes nothing.
      if (busy !== undefined) states.set(model, busy);
    },
    answered(model: string): void {
      // An OPEN model always has its probe in flight (only `refusedBusy` opens it, naming the probe, and only the
      // probe's outcome ends it), so an answer from a call sent before the spell leaves the waiters to the probe.
      if (current(model)?.kind === "CONFIRMED_BUSY") states.delete(model);
    }
  });
}

/** One coordinator that never waits: today's behaviour (each call resends after 60 s on its own). */
export const NO_BUSY_COORDINATION: PreviewBusyCoordinator = Object.freeze({
  admit: (_model: string) => Promise.resolve(),
  refusedBusy: (_model: string, _retryAfterSeconds: number | undefined) => Promise.resolve<BusyTurn>("PROBE"),
  probeOutcome: () => undefined,
  answered: () => undefined
});
