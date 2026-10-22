import { MADE_BY_NEWER_RELEASE } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";

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
