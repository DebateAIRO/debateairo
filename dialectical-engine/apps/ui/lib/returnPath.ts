export const RETURN_PATH_ALLOW_LIST = ["/new", "/", "/v4", "/settings", "/settings/security", "/account", "/checkout", "/checkout/return", "/settings/card", "/export"] as const;

export const DEFAULT_RETURN_PATH = "/new";

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

/** OAuth callbacks accept only exact route constants; query and fragment suffixes are excluded. */
export function safeSocialReturnPath(raw:string|null|undefined): "/new"|"/"|"/settings"|"/settings/security"|"/account" {return (["/new", "/", "/settings", "/settings/security", "/account"] as const).find(path=>path===raw)??"/new";}
