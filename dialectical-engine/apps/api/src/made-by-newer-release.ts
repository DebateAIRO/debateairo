import { MADE_BY_NEWER_RELEASE } from "@debateai/contract";
import { LEGACY_RELEASE_KEY, TypedDomainError, parseReleaseKey } from "@debateai/kernel";

/**
 * Side-by-side uploads spec 2026-10-21 §5, §6 (plan C task C14): the debate asked for was made by a newer release than
 * this API, and holds a value this code does not know. The error handler answers 409
 * `{error:"MADE_BY_NEWER_RELEASE", message:"MADE_BY_NEWER_RELEASE"}` (the page says "open it on the current site"),
 * never a 404 or a 500. Thrown on debate reads only — `withNewerReleaseFallback` around a run, its answer and an answer,
 * and `readPublicDebate` — because the website's note names "this debate" for any call refused with it (C13).
 *
 * Its own module (side-by-side integration): publications.ts throws it too, and importing it from index.ts pulled the
 * whole API (its support templates among it) into every importer of publications.ts.
 */
export class MadeByNewerReleaseError extends TypedDomainError {
  /** `cause`: the parse failure that showed it (C14 review), for whoever inspects the error; never sent. */
  constructor(cause?: unknown) {
    super(MADE_BY_NEWER_RELEASE, MADE_BY_NEWER_RELEASE);
    this.name = "MadeByNewerReleaseError";
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Side-by-side C14 (controller ruling on its concern 1): a run's release is newer than this API's when its key is not
 * `legacy`, differs from this API's own, and its site version (`parseReleaseKey(...).siteVersion`) is at least this
 * API's own. An EQUAL number with another code part is a code-only upgrade: the other side is treated as newer. A lower
 * site version is older (its data failing this code's parse is our own bug), and a key on either side that does not
 * parse cannot be compared: both read false. The one rule of the owner reads (index.ts withNewerReleaseFallback) and
 * the public read (publications.ts readPublicDebate, final fix wave P5), so it lives here, beside the error.
 */
export function madeByNewerRelease(runReleaseKey: string, ownReleaseKey: string): boolean {
  if (runReleaseKey === LEGACY_RELEASE_KEY || runReleaseKey === ownReleaseKey) return false;
  try {
    return parseReleaseKey(runReleaseKey).siteVersion >= parseReleaseKey(ownReleaseKey).siteVersion;
  } catch {
    return false;
  }
}
