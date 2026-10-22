import type { ReleaseWatcher } from "./release-state.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4 (plan C task C7) — THE API'S BACKGROUND LOOPS RUN ONLY ON THE CURRENT RELEASE.
 *
 * Two releases can run side by side; only the current one claims background rows (erasure, data export, billing,
 * staff alerts, the ask waker, the recovery notices). A gated loop keeps its tick and asks the work only when the
 * release watcher's LAST read says this release is current — never a query of its own, so the tick stays as cheap as
 * today's. At a switch the old and the new process overlap for at most one watcher poll (1 s); every gated loop claims
 * its rows in SQL (claim tokens, leases or SKIP LOCKED), so that overlap is the same as today's restart window.
 *
 * Work a request owns is NOT gated (it belongs to work this process already accepted): the data-export lease renewal,
 * the support relay's durable drain for its own waiters, the billing `kick` from routes, registration mail dispatch,
 * the SSE authority monitor and the preview estimate timeout. The release watcher itself is never gated: it is the
 * gate. tests/architecture/side-by-side-api-loops.test.ts pins both lists.
 */
export type ReleaseGate = Pick<ReleaseWatcher, "ownIsCurrent">;

/** The trigger, asked only while this release is current (read at every call). */
export function gatedTrigger(gate: ReleaseGate, trigger: () => void): () => void {
  return () => {
    if (gate.ownIsCurrent()) trigger();
  };
}

/** setInterval over the gated trigger, unref'd so it never holds the process open; stopped with clearInterval. */
export function gatedInterval(gate: ReleaseGate, trigger: () => void, ms: number): ReturnType<typeof setInterval> {
  const timer = setInterval(gatedTrigger(gate, trigger), ms);
  timer.unref();
  return timer;
}
