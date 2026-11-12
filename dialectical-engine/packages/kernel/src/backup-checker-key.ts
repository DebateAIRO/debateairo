/**
 * THE BACKUP CHECKER'S CALL SITE. When a checker's call cannot be completed, one model of another company runs the same check.
 * Its call goes to the first checker's own call-site key with this suffix after it. That gives the backup its own attempt count
 * (the gateway counts attempts per key, so the first checker's spent allowance is never the backup's) and its own recorded
 * answers (a resumed run replays them at this key only, never as the first checker's).
 *
 * The suffix sits at the end so that a reader that matches a key by its start keeps matching. Every reader that matches a whole
 * key reads a backup checker's key through `readWithBackupCheckerKey`: as its first checker's key, and only when that key is a
 * checker's. A writer's key with the suffix names no call site. A structure-repair call's key (the repaired key after its own
 * prefix) is read by that prefix first, as before; a reader that wants the repaired key strips the prefix, then reads it here.
 */
export const BACKUP_CHECKER_KEY_SUFFIX = ":BACKUP" as const;

/** The backup checker's key for the first checker's key. A key that already carries the suffix has no backup of its own. */
export function backupCheckerCallSiteKey(firstCheckerKey: string): string {
  if (typeof firstCheckerKey !== "string" || firstCheckerKey.length === 0 || firstCheckerKey.endsWith(BACKUP_CHECKER_KEY_SUFFIX)) {
    throw new TypeError("BACKUP_CHECKER_CALL_SITE_INVALID");
  }
  return `${firstCheckerKey}${BACKUP_CHECKER_KEY_SUFFIX}`;
}

/** The first checker's key a backup checker's key names, or null for any other key. */
export function firstCheckerKeyOfBackup(callSiteKey: string): string | null {
  if (typeof callSiteKey !== "string" || !callSiteKey.endsWith(BACKUP_CHECKER_KEY_SUFFIX)) return null;
  const first = callSiteKey.slice(0, -BACKUP_CHECKER_KEY_SUFFIX.length);
  return first.length === 0 || first.endsWith(BACKUP_CHECKER_KEY_SUFFIX) ? null : first;
}

/**
 * A key reader's answer for a key that may be a backup checker's. For a backup checker's key: the answer `read` gives its first
 * checker's key, kept only when `isChecker` says that answer is a checker's, else null. For any other key: `read`'s own answer.
 */
export function readWithBackupCheckerKey<T>(callSiteKey: string, read: (key: string) => T | null, isChecker: (answer: T) => boolean): T | null {
  const first = firstCheckerKeyOfBackup(callSiteKey);
  if (first === null) return read(callSiteKey);
  const answer = read(first);
  return answer !== null && isChecker(answer) ? answer : null;
}
