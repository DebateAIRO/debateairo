// The house typed error lives in the package's index; it is used only inside the functions below, so this module and
// the index may import each other (nothing here reads it while the modules load).
import { TypedDomainError } from "./index.js";

/**
 * THE RELEASE KEY (side-by-side uploads spec 2026-10-21 §1; INTERFACE "Shared code").
 *
 * Every process (API, runner, website) knows its release key, and every debate carries the key of the release that runs
 * it (core.run.release_key, migration 0123), so a debate is never touched by another release's code, settings or prompts
 * (ruling O1). The form is `r<site settings version>-<first 12 hex of the source revision>`, all lowercase because
 * Hatchet lowercases names: `r17-d50e33165a1b`. The version is a positive whole number without a leading zero.
 *
 * `legacy` is the stamp of a run written before 0123, or written without a key (the column default). It is never a key a
 * process may run as: parseReleaseKey refuses it, so no runner serves `legacy` and a forgotten admission path fails loudly
 * instead of running on the wrong release.
 */
export const LEGACY_RELEASE_KEY = "legacy";

const RELEASE_KEY = /^r([1-9][0-9]*)-([0-9a-f]{12})$/u;

export type ParsedReleaseKey = Readonly<{ releaseKey: string; siteVersion: number; codeRevision12: string }>;

/** Content-free: the refusal never repeats the value it was given. */
const invalid = (): TypedDomainError =>
  new TypedDomainError("RELEASE_KEY_INVALID", "A release key is r<site settings version>-<12 lowercase hex>");

/** The key's two parts, frozen; anything else (`legacy`, upper case, a leading zero, a non-string) throws RELEASE_KEY_INVALID. */
export function parseReleaseKey(raw: unknown): ParsedReleaseKey {
  const match = typeof raw === "string" ? RELEASE_KEY.exec(raw) : null;
  if (match === null) throw invalid();
  const siteVersion = Number(match[1]);
  if (!Number.isSafeInteger(siteVersion)) throw invalid();
  return Object.freeze({ releaseKey: match[0], siteVersion, codeRevision12: match[2]! });
}

/**
 * The Hatchet task a release's runner serves and its API sends to (spec §2): `${base}-${releaseKey}`, lowercased.
 * `legacy` keeps the base name unchanged (today's single task); any other value must be a well-formed key.
 */
export function releaseTaskName(base: string, releaseKey: string): string {
  if (releaseKey === LEGACY_RELEASE_KEY) return base;
  return `${base}-${parseReleaseKey(releaseKey).releaseKey}`.toLowerCase();
}

/** The 12 hex of the source revision, which the browser compares (spec §7); `legacy` stays `legacy`. */
export function releaseCodePart(releaseKey: string): string {
  return releaseKey === LEGACY_RELEASE_KEY ? LEGACY_RELEASE_KEY : parseReleaseKey(releaseKey).codeRevision12;
}
