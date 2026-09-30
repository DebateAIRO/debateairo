import { readFileSync, statSync } from "node:fs";
import { Reader, type CountryResponse } from "mmdb-lib";
import { TypedDomainError } from "@debateai/kernel";
import { ipKey, ipText, isPrivateOrReserved, parseIp, type ParsedIp } from "./ip.js";

/**
 * Paid plans G1 (spec 2026-09-29 §2.3.3) — WHERE AN ADDRESS IS.
 *
 * Two public data files, read locally (no address ever leaves this process): DB-IP's Lite country
 * database (MMDB, CC BY 4.0 — the site footer carries its credit link) at GEOIP_COUNTRY_DB_PATH, and
 * the Tor Project's bulk exit list (one address per line) at TOR_EXIT_LIST_PATH. The refresh timer
 * (deploy/vps/geoip-refresh.sh) renames new files into place; this reader notices a changed file —
 * inode, size or modification time — at most once a minute, on the caller's clock, and swaps it in.
 * A replacement that does not load keeps the last good data and is reported by code. A lookup never
 * throws while open: a record the loaded country file cannot answer is "XX" (see countryOf).
 *
 * "XX" is the one answer for "no country": unknown to the database, private or loopback, DB-IP's own
 * "ZZ", or not an address at all. The decisions (decide.ts) refuse sign-up and payment on it.
 */
export const UNKNOWN_COUNTRY = "XX";

export type GeoLookupResult = Readonly<{ country: string; tor: boolean }>;
export interface GeoLookup {
  lookup(ip: string): GeoLookupResult;
  close(): void;
}

/**
 * Spec §2.3.3: "The package defines `lookupRegion` behind the same interface, but it stays unused
 * until the owner opens Ukraine." The same lookup object answers it. `region` stays null until a
 * DB-IP *city* file is configured — nothing downloads one today, so nothing may read a region yet.
 */
export type GeoRegionResult = Readonly<{ country: string; region: string | null }>;
export interface RegionLookup {
  lookupRegion(ip: string): GeoRegionResult;
}
export type GeoReloadFailureCode =
  | "GEOIP_COUNTRY_DB_UNAVAILABLE"
  | "GEOIP_COUNTRY_DB_INVALID"
  | "TOR_EXIT_LIST_UNAVAILABLE"
  | "TOR_EXIT_LIST_INVALID";
export type GeoLookupOptions = Readonly<{
  countryDbPath: string;
  torListPath: string;
  /** Milliseconds since the epoch; Date.now unless a test supplies its own. */
  clock?: () => number;
  onReloadFailure?: (code: GeoReloadFailureCode) => void;
}>;

const METADATA_MARKER = Buffer.from("abcdef4d61784d696e642e636f6d", "hex");
const ISO_COUNTRY = /^[A-Z]{2}$/u;
const DBIP_UNKNOWN_COUNTRY = "ZZ";

function refuse(code: GeoReloadFailureCode | "GEO_LOOKUP_CLOSED"): never {
  throw new TypedDomainError(code, code);
}

function loadCountryDatabase(path: string): Reader<CountryResponse> {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    return refuse("GEOIP_COUNTRY_DB_UNAVAILABLE");
  }
  if (bytes.lastIndexOf(METADATA_MARKER) < 0) refuse("GEOIP_COUNTRY_DB_INVALID");
  try {
    return new Reader<CountryResponse>(bytes);
  } catch {
    return refuse("GEOIP_COUNTRY_DB_INVALID");
  }
}

/**
 * One address per line; blank lines and `#` comments are skipped. A line that is not an address
 * refuses the whole list, and so does a list with NO address at all (empty, blank or comments
 * only): loaded, it would answer every Tor exit `tor: false` and switch the Tor refusal off
 * without a word (final review I-1). At open that refuses the boot; on reload the last good list
 * stays and the failure is reported by code.
 */
function loadTorList(path: string): ReadonlySet<string> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return refuse("TOR_EXIT_LIST_UNAVAILABLE");
  }
  const keys = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const parsed = parseIp(line);
    if (parsed === null) refuse("TOR_EXIT_LIST_INVALID");
    keys.add(ipKey(parsed));
  }
  if (keys.size === 0) refuse("TOR_EXIT_LIST_INVALID");
  return keys;
}

function fileSignature(path: string): string | null {
  try {
    const facts = statSync(path);
    return `${facts.ino}:${facts.size}:${facts.mtimeMs}`;
  } catch {
    return null;
  }
}

function failureCode(error: unknown, fallback: GeoReloadFailureCode): GeoReloadFailureCode {
  const code = error instanceof TypedDomainError ? error.code : "";
  return code === "GEOIP_COUNTRY_DB_UNAVAILABLE" || code === "GEOIP_COUNTRY_DB_INVALID"
    || code === "TOR_EXIT_LIST_UNAVAILABLE" || code === "TOR_EXIT_LIST_INVALID" ? code : fallback;
}

export function openGeoLookup(options: GeoLookupOptions): GeoLookup & RegionLookup {
  const clock = options.clock ?? Date.now;
  const reloadCheckMs = 60_000;
  let countries = loadCountryDatabase(options.countryDbPath);
  let countriesSignature = fileSignature(options.countryDbPath);
  let torExits = loadTorList(options.torListPath);
  let torSignature = fileSignature(options.torListPath);
  let lastCheckedAt = clock();
  let closed = false;
  /** Whether a record of the country file now loaded was already reported unreadable (M-1). */
  let countryReadFailureReported = false;

  /** Reports by code. A callback that throws is ignored: nothing a report does may break a lookup. */
  const report = (code: GeoReloadFailureCode): void => {
    try {
      options.onReloadFailure?.(code);
    } catch {
      // Deliberately swallowed: the lookup runs on every request and stays total (final review M-1).
    }
  };

  const refresh = (now: number): void => {
    if (now - lastCheckedAt < reloadCheckMs) return;
    lastCheckedAt = now;
    const nextCountries = fileSignature(options.countryDbPath);
    if (nextCountries !== countriesSignature) {
      try {
        countries = loadCountryDatabase(options.countryDbPath);
        countriesSignature = nextCountries;
        countryReadFailureReported = false;
      } catch (error) {
        report(failureCode(error, "GEOIP_COUNTRY_DB_INVALID"));
      }
    }
    const nextTor = fileSignature(options.torListPath);
    if (nextTor !== torSignature) {
      try {
        torExits = loadTorList(options.torListPath);
        torSignature = nextTor;
      } catch (error) {
        report(failureCode(error, "TOR_EXIT_LIST_INVALID"));
      }
    }
  };

  /**
   * TOTAL (final review M-1). mmdb-lib's Reader checks only the metadata and the first 96 tree nodes
   * when a file opens, so a damaged tree or data section throws later, from get(). The lookup runs on
   * every request (the API's sourceFor records the country for sign-in and every read), so a record
   * that cannot be read answers "XX" — sign-up is then refused COUNTRY_UNKNOWN, closed, and nothing
   * else changes — and GEOIP_COUNTRY_DB_INVALID is reported at most once per loaded file.
   */
  const countryOf = (parsed: ParsedIp): string => {
    let iso: unknown;
    try {
      iso = countries.get(ipText(parsed))?.country?.iso_code;
    } catch {
      if (!countryReadFailureReported) {
        countryReadFailureReported = true;
        report("GEOIP_COUNTRY_DB_INVALID");
      }
      return UNKNOWN_COUNTRY;
    }
    return typeof iso === "string" && ISO_COUNTRY.test(iso) && iso !== DBIP_UNKNOWN_COUNTRY
      ? iso : UNKNOWN_COUNTRY;
  };

  const lookup = (ip: string): GeoLookupResult => {
    if (closed) refuse("GEO_LOOKUP_CLOSED");
    refresh(clock());
    const parsed = parseIp(ip);
    if (parsed === null || isPrivateOrReserved(parsed)) {
      return Object.freeze({ country: UNKNOWN_COUNTRY, tor: false });
    }
    return Object.freeze({ country: countryOf(parsed), tor: torExits.has(ipKey(parsed)) });
  };

  return Object.freeze({
    lookup,
    lookupRegion(ip: string): GeoRegionResult {
      return Object.freeze({ country: lookup(ip).country, region: null });
    },
    close(): void {
      closed = true;
    }
  });
}
