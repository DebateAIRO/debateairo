/**
 * Like `createSingleFlightErasureReconciler` (apps/api/src/account-erasure.ts:121-131), except that a trigger
 * arriving mid-run is not dropped: it schedules exactly one more run after the current one. A notice stored while
 * the worker is already draining therefore never waits for the next timer tick.
 */
export function createCoalescingSingleFlight(work: () => Promise<unknown>, onFailure: () => void): () => void {
  let running = false;
  let again = false;
  const run = (): void => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    void work().catch(() => onFailure()).finally(() => {
      running = false;
      if (again) {
        again = false;
        run();
      }
    });
  };
  return run;
}
