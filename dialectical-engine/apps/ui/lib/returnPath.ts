export const RETURN_PATH_ALLOW_LIST = ["/new", "/", "/settings", "/checkout", "/checkout/return", "/settings/card"] as const;

export const DEFAULT_RETURN_PATH = "/#start-a-debate";

const PUBLIC_DEBATE_PREFIX = "/public/debate/";
const PUBLIC_DEBATE_PATH = /^\/public\/debate\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

/**
 * The same-origin path to return to after sign-in, or DEFAULT_RETURN_PATH. The accepted value
 * is rebuilt from a constant path prefix (an allow-listed path, or the public-debate prefix
 * plus a validated UUID) followed by the input's own query or fragment, so no part of the
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
  return publicDebate === null ? DEFAULT_RETURN_PATH : `${PUBLIC_DEBATE_PREFIX}${publicDebate[1]}${suffix}`;
}
