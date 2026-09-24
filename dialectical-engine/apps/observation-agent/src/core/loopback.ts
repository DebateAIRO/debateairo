import { ObservationError } from "./errors.js";

/**
 * DL7-F1. Every URL the agent is told to call carries the Hatchet tenant token
 * as a bearer, and the two places that name one — the DB-ratified threshold
 * policy and the repo target fragments — are both writable by roles that are
 * meant to observe, not to steer. A URL-valued target or threshold is therefore
 * pinned to a loopback literal: the token can only ever leave for this host.
 *
 * Literals only, never a DNS name that happens to resolve to 127.0.0.1 today:
 * a resolver answer is not a property of the configuration under review.
 */
const LOOPBACK_HOSTS: readonly string[] = Object.freeze(["127.0.0.1", "::1", "localhost"]);

export const OBSERVATION_URL_NOT_LOOPBACK = "OBSERVATION_URL_NOT_LOOPBACK";

/** `http://x/y` and `https://x/y` — a scheme with an authority, the only shape that has a host. */
const ABSOLUTE_URL = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u;

export function looksLikeAbsoluteUrl(value: string): boolean {
  return ABSOLUTE_URL.test(value);
}

export function isLoopbackUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  // WHATWG keeps an IPv6 host bracketed in `hostname`.
  const hostname = parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]")
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;
  return LOOPBACK_HOSTS.includes(hostname.toLowerCase());
}

/** Fail-closed: returns the value it was given, or throws the typed code. Never repairs. */
export function assertLoopbackUrl(value: unknown): string {
  if (typeof value !== "string" || !isLoopbackUrl(value)) {
    throw new ObservationError(OBSERVATION_URL_NOT_LOOPBACK);
  }
  return value;
}
