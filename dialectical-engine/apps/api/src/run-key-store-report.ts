/** NV-10: report run-key store residue once per change, never per listing. Counts only; no names. */
export function createUnattributedEntriesReporter(log: (line: string) => void): (count: number) => void {
  let last = 0;
  return (count) => {
    if (!Number.isSafeInteger(count) || count < 0 || count === last) return;
    last = count;
    log(`[RUN_KEY_STORE_UNATTRIBUTED_ENTRIES] count=${count}`);
  };
}
