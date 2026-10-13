/**
 * Parallel AI calls (docs/superpowers/specs/2026-10-12-parallel-calls-design.md §3.5) — the calls in flight.
 *
 * The run-wide attempt ceiling and the hosted money seam decide on what the ledger already holds, and a call's ledger
 * and spend rows are written only AFTER its HTTP call. With several calls of one debate in flight, each would pass the
 * same "read the total, then act" check. One runner process owns a claimed debate, so an in-memory count of that
 * debate's calls in flight is exact, and the checks add it to the ledger's total.
 *
 * A check counts its own call FIRST (`begin`, synchronously, before anything is read), then reads the other calls in
 * flight, then the ledger; it releases its call when the call's rows have been written (or it was refused). Of two
 * calls racing for the last slot, the later reader therefore always sees the earlier one: either still in flight here,
 * or already in the ledger.
 *
 * One counter per check. `begin` counts an attempt AND a projection, so the gateway's attempt counter (which begins
 * with 0n) and the money seam's counter must be two instances: one shared counter would count a metered call's attempt
 * twice.
 */

export interface RunInFlight {
  /** Synchronously counts one attempt in flight for runId (and its projected micros, 0 when unpriced); returns a release function (idempotent). */
  begin(runId: string, projectedMicros: bigint): () => void;
  attempts(runId: string): number;
  projectedMicros(runId: string): bigint;
  /** All runs: for the shared wall. */
  projectedMicrosAll(): bigint;
}

interface RunEntry {
  attempts: number;
  micros: bigint;
}

export function createRunInFlight(): RunInFlight {
  const runs = new Map<string, RunEntry>();
  let all = 0n;
  return Object.freeze({
    begin(runId: string, projectedMicros: bigint): () => void {
      if (typeof runId !== "string" || runId === "" || typeof projectedMicros !== "bigint" || projectedMicros < 0n) {
        throw new TypeError("RUN_IN_FLIGHT_INPUT_INVALID");
      }
      let entry = runs.get(runId);
      if (entry === undefined) {
        entry = { attempts: 0, micros: 0n };
        runs.set(runId, entry);
      }
      entry.attempts += 1;
      entry.micros += projectedMicros;
      all += projectedMicros;
      // The entry stays in the map while this call is counted in it, so the release can close over it.
      const counted = entry;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        counted.attempts -= 1;
        counted.micros -= projectedMicros;
        all -= projectedMicros;
        if (counted.attempts === 0) runs.delete(runId);
      };
    },
    attempts(runId: string): number {
      return runs.get(runId)?.attempts ?? 0;
    },
    projectedMicros(runId: string): bigint {
      return runs.get(runId)?.micros ?? 0n;
    },
    projectedMicrosAll(): bigint {
      return all;
    }
  });
}
