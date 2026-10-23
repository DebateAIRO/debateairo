import { settingsRefusalCode } from "@debateai/db";

/**
 * Side-by-side spec §13, ruling R77 (final fix wave F2b, F2c, S14) — THE ACTIVE VERSION CANNOT BE ADMITTED ON: SAY SO,
 * LOUDLY AND CONTENT-FREE.
 *
 * Plain words: the owners can switch which sealed settings version new debates use. If this API cannot admit asks on
 * the active version — this release has not passed it (a FAIL verdict on the pair), or the API cannot load it (an env
 * change after a restart) — every new debate waits in line or is refused "try again in a minute", and nothing else
 * tells the operator. So such an ask prints one alarm line at most once a minute, and the boot of a current release
 * checks the active version once and prints the same line (it never refuses the boot: a staged release boots before its
 * switch, while the pointer may name a version only the current release has passed).
 *
 * The line (codes and the version number only, never a value or an owner's text):
 *   {"kind":"DEBATEAI_ADMISSION_SETTINGS","code":"ADMISSION_ACTIVE_VERSION_UNAVAILABLE","version":19,"reason":"NOT_PASSED"}
 * `reason` is NOT_PASSED (this release has not passed the version) or UNSUPPORTED (this API cannot load it). The way out
 * is the operator's: activate a version this release has passed (deploy/preview-release/v1/README.md).
 */

/** The alarm's code (the journal's `code` field). */
export const ADMISSION_ACTIVE_VERSION_UNAVAILABLE = "ADMISSION_ACTIVE_VERSION_UNAVAILABLE";

/** Why the active version cannot be admitted on: not passed by this release, or not loadable by this API. */
export type ActiveVersionUnavailableReason = "NOT_PASSED" | "UNSUPPORTED";

/** The one alarm line, exactly (key order fixed: the operator's journal greps it). */
export function activeVersionUnavailableLine(version: number, reason: ActiveVersionUnavailableReason): string {
  return JSON.stringify({ kind: "DEBATEAI_ADMISSION_SETTINGS", code: ADMISSION_ACTIVE_VERSION_UNAVAILABLE, version, reason });
}

/** At most one line per version and reason in this many milliseconds. */
const ALARM_INTERVAL_MS = 60000;

/** Says the alarm for a version and reason; true when the line was printed (not held back by the once-a-minute rule). */
export type ActiveVersionAlarm = (version: number, reason: ActiveVersionUnavailableReason) => boolean;

/**
 * Ruling R77 — THE ONCE-A-MINUTE ALARM. Each (version, reason) prints at most once in `ALARM_INTERVAL_MS` on the
 * monotonic clock (`performance.now()` by default); a clock that goes backwards prints again rather than staying quiet.
 * The process's own alarm is `activeVersionAlarm` below (standard error); tests build their own.
 */
export function createActiveVersionAlarm(input: Readonly<{
  clock?: () => number;
  log?: (line: string) => void;
}> = {}): ActiveVersionAlarm {
  const clock = input.clock ?? (() => performance.now());
  const log = input.log ?? ((line: string) => { console.error(line); });
  const said = new Map<string, number>();
  return (version, reason) => {
    const key = `${String(version)}:${reason}`;
    const now = clock();
    const last = said.get(key);
    if (last !== undefined && now >= last && now - last < ALARM_INTERVAL_MS) return false;
    said.set(key, now);
    log(activeVersionUnavailableLine(version, reason));
    return true;
  };
}

/** The process's alarm: the API's ask paths (./index.ts), its room gate (./release-state.ts) and its boot (./main.ts). */
export const activeVersionAlarm: ActiveVersionAlarm = createActiveVersionAlarm();

/**
 * Final fix wave S14 (the common rule, shared with the runner's and the operator's withholding) — AN OWNER-TYPED DETAIL IS
 * PRINTED ONLY WHEN IT IS PLAINLY NOT A SECRET. A settings code may carry details (`CODE:detail[:detail…]`, e.g. a model
 * id or a step word the owner typed into a line-up). The journal prints the whole code only when every detail part is
 * 1-64 characters of letters, digits, `_`, `.`, `/` or `-`, AND the detail text is not key-shaped (an unbroken run of 24
 * or more letters and digits, a `//`, or a vendor `sk-` prefix); otherwise the bare code (the part before the first ':').
 */
const PRINTABLE_DETAIL_PART = /^[A-Za-z0-9_.\/-]{1,64}$/u;
const KEY_SHAPED_DETAIL = /[A-Za-z0-9]{24,}|\/\/|\bsk-/u;

export function journalSettingsCode(code: string): string {
  const at = code.indexOf(":");
  if (at === -1) return code;
  const detail = code.slice(at + 1);
  const printable = detail.split(":").every((part) => PRINTABLE_DETAIL_PART.test(part)) && !KEY_SHAPED_DETAIL.test(detail);
  return printable ? code : code.slice(0, at);
}

/** What the boot's one look at the active version found (final fix wave F2c). */
export type ActiveVersionBootCheck =
  | Readonly<{ kind: "NOT_CURRENT" | "ADMISSIBLE" }>
  | Readonly<{ kind: "UNAVAILABLE"; version: number; reason: ActiveVersionUnavailableReason }>
  | Readonly<{ kind: "UNCHECKED"; version: number | null }>;

/**
 * Ruling R77, final fix wave F2c — THE BOOT'S ONE LOOK AT THE ACTIVE VERSION. Only when THIS release is the current one
 * (`current`, the release watcher's first read): the active version is loaded once through the API's own admission cache
 * (a settings refusal: UNSUPPORTED), then asked whether this release has passed it (NOT_PASSED); either prints the alarm
 * line. A staged release prints nothing (it boots before its switch, while the pointer may name a version only the
 * current release has passed; the switch itself checks that pair). It NEVER throws, so it never refuses the boot: a
 * database or untyped failure is one content-free ADMISSION_ACTIVE_VERSION_UNCHECKED line (`cause`: UNTYPED, or the
 * code); the first ask then loads the version again and the ask paths' own alarm speaks.
 */
export async function checkActiveSettingsVersionAtBoot(input: Readonly<{
  current: boolean;
  activeSettingsVersion: () => Promise<number>;
  admissionSettingsFor: (version: number) => Promise<unknown>;
  passed: (version: number) => Promise<boolean>;
  alarm: ActiveVersionAlarm;
  log: (line: string) => void;
}>): Promise<ActiveVersionBootCheck> {
  if (!input.current) return Object.freeze({ kind: "NOT_CURRENT" as const });
  let version: number | null = null;
  try {
    const active = await input.activeSettingsVersion();
    version = active;
    try {
      await input.admissionSettingsFor(active);
    } catch (error) {
      if (settingsRefusalCode(error) === null) throw error;
      input.alarm(active, "UNSUPPORTED");
      return Object.freeze({ kind: "UNAVAILABLE" as const, version: active, reason: "UNSUPPORTED" as const });
    }
    if (!(await input.passed(active))) {
      input.alarm(active, "NOT_PASSED");
      return Object.freeze({ kind: "UNAVAILABLE" as const, version: active, reason: "NOT_PASSED" as const });
    }
    return Object.freeze({ kind: "ADMISSIBLE" as const });
  } catch (error) {
    const code = settingsRefusalCode(error);
    input.log(JSON.stringify({ kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_ACTIVE_VERSION_UNCHECKED", version,
      cause: code === null ? "UNTYPED" : journalSettingsCode(code) }));
    return Object.freeze({ kind: "UNCHECKED" as const, version });
  }
}
