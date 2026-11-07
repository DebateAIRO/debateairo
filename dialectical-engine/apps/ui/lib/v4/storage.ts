import { READING_LEVELS, type ReadingLevel } from "./types.js";

/*
 * V4 initial, fix wave 1 (Decision A): V4 stores NOTHING in the browser tonight. Writing a key would need a /cookies
 * entry (S01-R17, legal text in every language) and question texts kept locally outlive the account (SEC-2). So the
 * reading level lives in the page address (`?level=`): the server page reads it, the client keeps it in React state and
 * rewrites the address when it changes, and every V4 link carries it. The file keeps its name so imports stay short.
 */

/** The address parameter that carries the reading level. */
export const LEVEL_PARAM = "level";

/** A reading level from anything (an address parameter, a menu value); null when it is not one of the three. */
export function parseReadingLevel(value: unknown): ReadingLevel | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && (READING_LEVELS as readonly string[]).includes(raw) ? (raw as ReadingLevel) : null;
}

/**
 * `path` with `?level=<level>` set (other parameters and any `#part` kept). A null level leaves the path as it is, so a
 * link never invents a level the person did not choose.
 */
export function levelHref(path: string, level: ReadingLevel | null): string {
  const checked = parseReadingLevel(level);
  if (checked === null) return path;
  const hashAt = path.indexOf("#");
  const hash = hashAt === -1 ? "" : path.slice(hashAt);
  const beforeHash = hashAt === -1 ? path : path.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const base = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? "" : beforeHash.slice(queryAt + 1));
  params.set(LEVEL_PARAM, checked);
  return `${base}?${params.toString()}${hash}`;
}

// The hook lives in a "use client" file so a server page can import parseReadingLevel / levelHref from here without
// pulling a React hook into the server build; client components import it from here as before.
export { useReadingLevel } from "./useReadingLevel.js";
