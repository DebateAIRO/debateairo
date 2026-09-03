export const RETURN_PATH_ALLOW_LIST = ["/new", "/", "/settings"] as const;

export const DEFAULT_RETURN_PATH = "/#start-a-debate";

const PUBLIC_DEBATE_PATH = /^\/public\/debate\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function safeReturnPath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) return DEFAULT_RETURN_PATH;
  if (!raw.startsWith("/") || raw[1] === "/" || raw[1] === "\\" || raw.includes("\\")) {
    return DEFAULT_RETURN_PATH;
  }

  const path = raw.split(/[?#]/, 1)[0]!;
  const allowListed = (RETURN_PATH_ALLOW_LIST as readonly string[]).includes(path);
  return allowListed || PUBLIC_DEBATE_PATH.test(path) ? raw : DEFAULT_RETURN_PATH;
}
