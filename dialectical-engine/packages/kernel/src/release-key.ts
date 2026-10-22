// The house typed error lives in the package's index; it is used only inside the functions below, so this module and
// the index may import each other (nothing here reads it while the modules load).
import { TypedDomainError } from "./index.js";

/**
 * THE RELEASE KEY (side-by-side uploads spec 2026-10-21 §1-§2; INTERFACE "Shared code").
 *
 * Every process (API, runner, website) knows its release key, and every debate carries the key of the release that runs
 * it (core.run.release_key, migration 0123), so a debate is never touched by another release's code, settings or prompts
 * (ruling O1). The form is `r<site settings version>-<first 12 hex of the source revision>`, all lowercase because
 * Hatchet lowercases names (§2: a release's runner listens under `${base}-${releaseKey}`): r17-d50e33165a1b. The
 * version is a positive safe whole number without a leading zero.
 *
 * `legacy` is the stamp of a run written before 0123, or written without a key (the column default). It is never a key a
 * process may run as: parseReleaseKey refuses it, so no runner serves `legacy` and a forgotten admission path fails loudly
 * instead of running on the wrong release. Its task name is the bare base name, so R19-era names still resolve (§2).
 *
 * A development or test launcher that does not know its source revision runs as `r<REGISTER_VERSION>-000000000000`
 * (developmentReleaseKey); a hosted process never may (the environment check refuses it, INTERFACE "RELEASE_KEY").
 */
export const LEGACY_RELEASE_KEY = "legacy";

/** The one form of a release key (INTERFACE "RELEASE_KEY"); the same CHECK guards core.run.release_key (0123). */
export const RELEASE_KEY_PATTERN: RegExp = /^r[1-9][0-9]*-[0-9a-f]{12}$/u;

/** The code part of a development key: a launcher that does not know its source revision (INTERFACE "RELEASE_KEY"). */
export const DEVELOPMENT_CODE_REVISION = "000000000000";

export type ParsedReleaseKey = Readonly<{ releaseKey: string; siteVersion: number; codeRevision12: string }>;

/** Content-free: the refusal never repeats the value it was given. */
const invalid = (): TypedDomainError =>
  new TypedDomainError("RELEASE_KEY_INVALID", "A release key is r<site settings version>-<12 lowercase hex>");

/** The key's two parts, frozen; anything else (`legacy`, upper case, a leading zero, a non-string) throws RELEASE_KEY_INVALID. */
export function parseReleaseKey(raw: unknown): ParsedReleaseKey {
  if (typeof raw !== "string" || !RELEASE_KEY_PATTERN.test(raw)) throw invalid();
  const dash = raw.indexOf("-");
  const siteVersion = Number(raw.slice(1, dash));
  if (!Number.isSafeInteger(siteVersion)) throw invalid();
  return Object.freeze({ releaseKey: raw, siteVersion, codeRevision12: raw.slice(dash + 1) });
}

/**
 * The Hatchet task a release's runner serves and its API sends to (spec §2): `${base}-${releaseKey}`, lowercased.
 * `legacy` keeps the base name unchanged (today's single task); any other value must be a well-formed key. A blank base
 * is a programming error (TypeError RELEASE_TASK_BASE_INVALID), never a name.
 */
export function releaseTaskName(base: string, releaseKey: string): string {
  if (typeof base !== "string" || base.trim().length === 0) throw new TypeError("RELEASE_TASK_BASE_INVALID");
  if (releaseKey === LEGACY_RELEASE_KEY) return base;
  return `${base}-${parseReleaseKey(releaseKey).releaseKey}`.toLowerCase();
}

/** The 12 hex of the source revision, which the browser compares (spec §7); `legacy` stays `legacy`. */
export function releaseCodePart(releaseKey: string): string {
  return releaseKey === LEGACY_RELEASE_KEY ? LEGACY_RELEASE_KEY : parseReleaseKey(releaseKey).codeRevision12;
}

/** `r<registerVersion>-000000000000`, the key of a development launcher; RELEASE_KEY_INVALID unless a positive safe whole number. */
export function developmentReleaseKey(registerVersion: number): string {
  if (!Number.isSafeInteger(registerVersion) || registerVersion < 1) throw invalid();
  return parseReleaseKey(`r${registerVersion}-${DEVELOPMENT_CODE_REVISION}`).releaseKey;
}

/** True for a well-formed key whose code part is DEVELOPMENT_CODE_REVISION; false for anything else, `legacy` included. */
export function isDevelopmentReleaseKey(releaseKey: string): boolean {
  return RELEASE_KEY_PATTERN.test(releaseKey) && releaseKey.endsWith(`-${DEVELOPMENT_CODE_REVISION}`);
}
