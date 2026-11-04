export const RETURN_PATH_ALLOW_LIST = ["/new", "/", "/v4", "/settings", "/settings/security", "/account", "/checkout", "/checkout/return", "/settings/card", "/export"] as const;

/**
 * V4 review ask-f1: sign-in with no (or no safe) way back lands on the new ask page. Every step a new account goes
 * through returns here when it has nothing else: the mailed email-check link carries no way back, so after the email
 * check and the security set-up the person arrives at /v4, not at the old new-debate page.
 */
export const DEFAULT_RETURN_PATH = "/v4";

const PUBLIC_DEBATE_PREFIX = "/public/debate/";
const PUBLIC_DEBATE_PATH = /^\/public\/debate\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
/** public-f13: a V4 debate's map, or its report, so a signed-out link to one comes back to it after sign-in. */
const V4_DEBATE_PREFIX = "/v4/debate/";
const V4_DEBATE_REPORT = "/report";
const V4_DEBATE_PATH = /^\/v4\/debate\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(\/report)?$/;

/**
 * The same-origin path to return to after sign-in, or DEFAULT_RETURN_PATH. The accepted value
 * is rebuilt from a constant path prefix (an allow-listed path, or the public-debate or V4-debate
 * prefix plus a validated UUID) followed by the input's own query or fragment, so no part of the
 * input can ever supply a scheme or host: the result always starts with a fixed local path.
 */
export function safeReturnPath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) return DEFAULT_RETURN_PATH;
  if (!raw.startsWith("/") || raw[1] === "/" || raw[1] === "\\" || raw.includes("\\")) {
    return DEFAULT_RETURN_PATH;
  }

  const path = raw.split(/[?#]/, 1)[0]!;
  const suffix = raw.slice(path.length);
  const allowListed = RETURN_PATH_ALLOW_LIST.find((candidate) => candidate === path);
  if (allowListed !== undefined) return `${allowListed}${suffix}`;
  const publicDebate = PUBLIC_DEBATE_PATH.exec(path);
  if (publicDebate !== null) return `${PUBLIC_DEBATE_PREFIX}${publicDebate[1]}${suffix}`;
  const v4Debate = V4_DEBATE_PATH.exec(path);
  return v4Debate === null ? DEFAULT_RETURN_PATH : `${V4_DEBATE_PREFIX}${v4Debate[1]}${v4Debate[2] === undefined ? "" : V4_DEBATE_REPORT}${suffix}`;
}

/**
 * V4 review ask-f1: the sign-in page with the way back to `here` (a path with its query), when sign-in may return there;
 * otherwise the plain sign-in page, which returns to DEFAULT_RETURN_PATH. The query is kept, so a question handed in by
 * a link (`/v4?topic=…`) and the reading level come back too. The fragment is never passed on.
 */
export function signInHref(here: string): string {
  const target = here.split("#", 1)[0]!;
  return target.length > 0 && safeReturnPath(target) === target ? `/login?next=${encodeURIComponent(target)}` : "/login";
}

/**
 * OAuth callbacks accept only exact route constants; query and fragment suffixes are excluded. The list is the
 * database's own (social_flow_next_path_check, migration 0102) and the contract's BeginSocialLoginRequestSchema: /v4 is
 * not on it yet, so an outside sign-in from the new page still comes back to /new until a migration widens it.
 */
export function safeSocialReturnPath(raw:string|null|undefined): "/new"|"/"|"/settings"|"/settings/security"|"/account" {return (["/new", "/", "/settings", "/settings/security", "/account"] as const).find(path=>path===raw)??"/new";}
