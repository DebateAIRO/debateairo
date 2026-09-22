const SUPPORT_API_PATH = /^\/api\/v1\/support(?:\/|$)/u;
const CAPABILITY = /^[A-Za-z0-9_-]{43}$/u;

/** A support request that failed with a status, kept so the status can be read. */
export class SupportHttpError extends Error {
  constructor(readonly status: number) {
    super("SUPPORT_REQUEST_UNAVAILABLE");
    this.name = "SupportHttpError";
  }
}

/**
 * DL3-F3: the API answers 404 for a session capability whose owner no longer
 * matches the cookie — an identity change on a shared tab, an expiry, or a
 * server-side lock. That is a stale session, not an outage, and the widget's
 * answer is a new session rather than "Support is unavailable" forever (the
 * compact surface has no "New conversation" control to escape with).
 */
export function isStaleSupportSession(failure: unknown): boolean {
  return failure instanceof SupportHttpError && failure.status === 404;
}

function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  return document.cookie.split(";").flatMap((member) => {
    const [name,value] = member.trim().split("=",2);
    return name === "__Host-debateai-csrf" && value !== undefined && CAPABILITY.test(value)
      ? [value] : [];
  })[0] ?? null;
}

/**
 * The relative support path makes the browser generate the exact page Origin;
 * the same-origin proxy forwards that value and the session-bound CSRF pair.
 * An anonymous request carries neither an invented identity nor a session
 * capability, while still presenting a CSRF header whenever the browser owns
 * the host CSRF cookie.
 */
export async function supportPost(
  path: string,body: Readonly<Record<string,unknown>>,supportSessionToken?: string,
  /** DL1-F5c/DL3-F4: a case bearer, which never travels in the path. */
  supportCaseToken?: string
): Promise<Response> {
  if (!SUPPORT_API_PATH.test(path) || path.includes("\\")) {
    throw new Error("SUPPORT_SAME_ORIGIN_PATH_REQUIRED");
  }
  const csrf = csrfToken();
  return await fetch(path,{
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(supportSessionToken === undefined
        ? {} : { "x-support-session-token": supportSessionToken }),
      ...(supportCaseToken === undefined
        ? {} : { "x-support-case-token": supportCaseToken }),
      ...(csrf === null ? {} : { "x-csrf-token": csrf })
    },
    body: JSON.stringify(body)
  });
}
