import { ContractHttpError, MADE_BY_NEWER_RELEASE } from "@debateai/contract";
import { DEVELOPMENT_CODE_REVISION, LEGACY_RELEASE_KEY, releaseCodePart } from "@debateai/kernel";

/**
 * OLD OPEN PAGES (side-by-side uploads spec 2026-10-21 §7; plan C13).
 *
 * During an upload the new release takes traffic while pages built by the old one are still open. Such a page must
 * not fail or retry forever: it shows one small, plain, non-blocking note ("A newer version of the site is available.
 * Reload", components/NewVersionNote.tsx) and keeps working where it can.
 *
 * - NEWER_BUILD: an answer names a release (x-debateai-release, on every API answer) whose code part differs from the
 *   code baked into this build (NEXT_PUBLIC_DEBATEAI_RELEASE_CODE, next.config.mjs); or an answer did not parse
 *   (INVALID_RESPONSE: a newer API's shape). Only the code part is compared: a settings-only release keeps its code
 *   part and does not rebuild the website, so it shows no note.
 * - MADE_BY_NEWER: the server says what was asked for was made by a newer release (MADE_BY_NEWER_RELEASE, plan C14).
 *
 * Nothing is compared when either side does not know its revision: a development build or launcher carries the code
 * DEVELOPMENT_CODE_REVISION, which a hosted release never may (INTERFACE "RELEASE_KEY").
 *
 * The reason is page-wide state, held once per page load; it only ever grows (none → MADE_BY_NEWER → NEWER_BUILD).
 */
export type NewerVersionReason = "NEWER_BUILD" | "MADE_BY_NEWER";

/** The server's code for "a newer release made this" (plan C14), the contract's own constant. */
export { MADE_BY_NEWER_RELEASE };

let reason: NewerVersionReason | null = null;
const listeners = new Set<(reason: NewerVersionReason) => void>();

/** The release code inlined into this build (next.config.mjs); the development code when the build names none. */
export function bakedReleaseCode(): string {
  // Written out whole so Next inlines it into the browser bundle.
  return process.env.NEXT_PUBLIC_DEBATEAI_RELEASE_CODE ?? DEVELOPMENT_CODE_REVISION;
}

/**
 * Reads one answer's x-debateai-release. A well-formed key whose code part differs from this build's announces
 * NEWER_BUILD; a missing or malformed value, `legacy`, the same code part, or an unknown revision on either side is
 * ignored.
 */
export function noteReleaseHeader(value: string | null): void {
  if (value === null || value === LEGACY_RELEASE_KEY) return;
  let code: string;
  try {
    code = releaseCodePart(value);
  } catch {
    return;
  }
  const baked = bakedReleaseCode();
  if (code === DEVELOPMENT_CODE_REVISION || baked === DEVELOPMENT_CODE_REVISION || code === baked) return;
  announceNewerVersion("NEWER_BUILD");
}

/** The first reason wins, except that NEWER_BUILD replaces MADE_BY_NEWER (reloading is the answer to both). */
export function announceNewerVersion(next: NewerVersionReason): void {
  if (reason === next || reason === "NEWER_BUILD") return;
  reason = next;
  for (const listener of [...listeners]) listener(next);
}

export function newerVersionReason(): NewerVersionReason | null {
  return reason;
}

/** Calls `listener` with each new reason; returns the unsubscribe function. */
export function subscribeNewerVersion(listener: (reason: NewerVersionReason) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The reason a refused call tells, or null for every other refusal. */
function reasonOf(failure: unknown): NewerVersionReason | null {
  if (!(failure instanceof ContractHttpError)) return null;
  if (failure.code === "INVALID_RESPONSE") return "NEWER_BUILD";
  if (failure.serverCode === MADE_BY_NEWER_RELEASE) return "MADE_BY_NEWER";
  return null;
}

/**
 * The same client, each of whose calls that rejects with an answer this page cannot read (INVALID_RESPONSE →
 * NEWER_BUILD) or one a newer release made (MADE_BY_NEWER_RELEASE → MADE_BY_NEWER) also announces it. The rejection is
 * rethrown unchanged, so every caller keeps its own handling; answers and non-function members pass through untouched.
 * The contract client is frozen, and a Proxy may not hand out another value for a frozen member, so the Proxy stands
 * over an empty target and reads every member from the client; each wrapped method is made once, so it keeps one
 * identity. Writes are refused (set, defineProperty, deleteProperty and preventExtensions return false), as they are
 * on the frozen client: without these traps they would land on the mutable empty target and seem to succeed.
 */
export function withNewerVersionWatch<T extends object>(client: T): T {
  const wrapped = new Map<PropertyKey, unknown>();
  const memberOf = (property: PropertyKey): unknown => {
    const member: unknown = Reflect.get(client, property, client);
    if (typeof member !== "function") return member;
    if (!wrapped.has(property)) {
      wrapped.set(property, (...args: unknown[]) => {
        const result: unknown = Reflect.apply(member, client, args);
        if (!(result instanceof Promise)) return result;
        return result.catch((failure: unknown) => {
          const told = reasonOf(failure);
          if (told !== null) announceNewerVersion(told);
          throw failure;
        });
      });
    }
    return wrapped.get(property);
  };
  return new Proxy({} as T, {
    get: (_target, property) => memberOf(property),
    has: (_target, property) => Reflect.has(client, property),
    ownKeys: () => Reflect.ownKeys(client),
    getOwnPropertyDescriptor: (_target, property) => {
      const own = Reflect.getOwnPropertyDescriptor(client, property);
      return own === undefined
        ? undefined
        : { value: memberOf(property), writable: false, enumerable: own.enumerable ?? false, configurable: true };
    },
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
    preventExtensions: () => false
  });
}
