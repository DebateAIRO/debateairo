import { createHash } from "node:crypto";
import { TypedDomainError, type PersonalDataKind } from "@debateai/kernel";
import type { QueryPolarity } from "./index.js";
import { guardSearch, type CleanedPart, type GuardedSearch, type SearchHoldReason } from "./query-guard.js";
import { isWebPace, lookBackWindow, type WebPace } from "./window.js";

/**
 * THE FROZEN WEB QUERY SET (web search plan W1-2, 2026-10-30), with the owner's Q10 answer of 30 Oct:
 * "per path, 2 English searches (for, against); when the planner decides local information helps, 2 more in the local
 * language and country (for, against): 4 in all."
 *
 * The planner's reply becomes this set in code, with no AI:
 * - every search must belong to a path on the map (the rule `freezeQuerySet` already has: a search not drawn from the
 *   question is refused, OFF_PLAN_QUERY_REFUSED);
 * - each pair (English, and local when planned) needs its search for AND its search against
 *   (OPPOSITION_QUERY_REQUIRED, SUPPORTING_QUERY_REQUIRED), and the two may not be the same words once cleaned;
 * - each search is cleaned and guarded (`guardSearch`); a held search holds its partner back too, so a path never sends
 *   one side of a pair alone (PAIR_PARTNER_HELD);
 * - the look-back date comes from the path's pace word and the run's date;
 * - English searches carry no country; local ones carry `localSearchTarget`'s language and country, and are held back
 *   (NO_LOCAL_TARGET) when none can be worked out.
 * A plan with no searches at all is valid: the planner may decide no path needs the web.
 */
export type WebSearchScope = "ENGLISH" | "LOCAL";

export type PlannedWebSearch = Readonly<{ scope: WebSearchScope; polarity: QueryPolarity; text: string }>;

export type PlannedWebPath = Readonly<{
  pathId: string;
  web: boolean;
  /** The planner's reason, for a path with the web and one without (the page shows the no-search reason). */
  reason: string;
  pace: WebPace | null;
  localHelps: boolean;
  searches: readonly PlannedWebSearch[];
}>;

export type WebPlanContext = Readonly<{
  /** The map's fixed paths: the only paths a search may belong to. */
  pathIds: readonly string[];
  /** The run's date; the look-back window counts back from it. */
  asOf: Date;
  /** The run's locked language tag ("ro", "sr-Latn"), or null when the run has none. */
  questionLanguage: string | null;
  /** The ISO 3166-1 country the question's place names, or null when it names none (or names a region like the EU). */
  placeCountry: string | null;
}>;

export type LocalSearchTarget = Readonly<{ language: string; country: string; countryFrom: "PLACE" | "LANGUAGE" }>;

export type FrozenWebPath = Readonly<{
  pathId: string;
  web: boolean;
  reason: string;
  pace: WebPace | null;
  localHelps: boolean;
  localTarget: LocalSearchTarget | null;
}>;

export type FrozenWebSearch = Readonly<{
  searchId: string;
  pathId: string;
  scope: WebSearchScope;
  polarity: QueryPolarity;
  language: string | null;
  country: string | null;
  status: "SEND" | "HELD";
  /** The cleaned words; null when they were held for personal data or first-person words (no copy is kept). */
  text: string | null;
  heldBecause: readonly SearchHoldReason[];
  personalData: readonly PersonalDataKind[];
  removed: readonly CleanedPart[];
  afterDate: string | null;
}>;

export type FrozenWebQuerySet = Readonly<{
  paths: readonly FrozenWebPath[];
  searches: readonly FrozenWebSearch[];
  contentHash: string;
}>;

/**
 * The home country of a site language whose speakers mostly live in one country. Arabic, English, Spanish, Portuguese
 * and Chinese have several, so a question in one of them names no country by its language alone.
 */
const LANGUAGE_HOME_COUNTRY: Readonly<Record<string, string>> = Object.freeze({
  bg: "BG", cs: "CZ", da: "DK", de: "DE", el: "GR", et: "EE", fi: "FI", fr: "FR", ga: "IE", he: "IL", hi: "IN", hr: "HR",
  hu: "HU", id: "ID", it: "IT", ja: "JP", ko: "KR", lt: "LT", lv: "LV", mt: "MT", nl: "NL", pl: "PL", ro: "RO", ru: "RU",
  sk: "SK", sl: "SI", sv: "SE", tr: "TR", uk: "UA", vi: "VN"
});

/**
 * The main language of a country with one clear main language. A country of several (Belgium, Switzerland, Canada,
 * India, Luxembourg, Singapore, South Africa, Malta and others) is left out: its local searches use the question's
 * language.
 */
const COUNTRY_MAIN_LANGUAGE: Readonly<Record<string, string>> = Object.freeze({
  DZ: "ar", EG: "ar", MA: "ar", TN: "ar", SN: "fr", ET: "am", GH: "en", NG: "en", UG: "en",
  CN: "zh", TW: "zh", ID: "id", JP: "ja", KR: "ko", TH: "th", VN: "vi", MY: "ms",
  AT: "de", BG: "bg", HR: "hr", CY: "el", CZ: "cs", DK: "da", EE: "et", FI: "fi", FR: "fr", DE: "de", GR: "el",
  HU: "hu", IE: "en", IT: "it", LV: "lv", LT: "lt", MD: "ro", NL: "nl", NO: "no", PL: "pl", PT: "pt", RO: "ro",
  RS: "sr", SK: "sk", SI: "sl", ES: "es", SE: "sv", UA: "uk", GB: "en",
  BH: "ar", IL: "he", JO: "ar", KW: "ar", LB: "ar", OM: "ar", QA: "ar", SA: "ar", TR: "tr", AE: "ar",
  CR: "es", MX: "es", PA: "es", US: "en",
  AR: "es", BR: "pt", CL: "es", CO: "es", EC: "es", PE: "es", UY: "es",
  AU: "en", NZ: "en", FJ: "en"
});

/** Codes that name a group or nothing, never one country. */
const NOT_A_COUNTRY = new Set(["EU", "EZ", "UN", "QO", "ZZ"]);
const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
const LANGUAGE_TAG = /^([a-z]{2})(?:-[A-Za-z]{4})?$/u;

function countryCode(value: string): string {
  let name: string | undefined;
  try {
    name = /^[A-Z]{2}$/u.test(value) && !NOT_A_COUNTRY.has(value) ? REGION_NAMES.of(value) : undefined;
  } catch {
    name = undefined;
  }
  if (name === undefined) throw new TypedDomainError("WEB_PLACE_COUNTRY_INVALID", "A place country must be one ISO 3166-1 country code");
  return value;
}

/**
 * Where a path's local searches look. The country comes from the question's place when it names one, else from the
 * question's language. The language is the place country's main language when it has one, else the question's.
 * Null when neither gives a country (an English question with no place, for example).
 */
export function localSearchTarget(input: Readonly<{ questionLanguage: string | null; placeCountry: string | null }>): LocalSearchTarget | null {
  let primary: string | null = null;
  if (input.questionLanguage !== null) {
    const tag = LANGUAGE_TAG.exec(input.questionLanguage);
    if (tag === null) throw new TypedDomainError("WEB_QUESTION_LANGUAGE_INVALID", "The question's language must be a locked language tag");
    primary = tag[1]!;
  }
  if (input.placeCountry !== null) {
    const country = countryCode(input.placeCountry);
    const language = COUNTRY_MAIN_LANGUAGE[country] ?? primary;
    return language === null ? null : Object.freeze({ language, country, countryFrom: "PLACE" });
  }
  const country = primary === null ? undefined : LANGUAGE_HOME_COUNTRY[primary];
  return country === undefined || primary === null ? null : Object.freeze({ language: primary, country, countryFrom: "LANGUAGE" });
}

const POLARITIES: readonly QueryPolarity[] = ["SUPPORTING", "DISCONFIRMING"];
const SCOPES: readonly WebSearchScope[] = ["ENGLISH", "LOCAL"];

const refuse = (code: string, message: string): never => {
  throw new TypedDomainError(code, message);
};

function frozenPair(
  path: PlannedWebPath,
  scope: WebSearchScope,
  afterDate: string | null,
  target: LocalSearchTarget | null
): FrozenWebSearch[] {
  const planned = path.searches.filter((search) => search.scope === scope);
  if (planned.length === 0 || planned.length > 2) {
    refuse("WEB_PLAN_SEARCH_COUNT_INVALID", "A web path has one search for and one against in each planned language");
  }
  const bySide = POLARITIES.map((polarity) => planned.filter((search) => search.polarity === polarity));
  if (bySide[1]!.length === 0) refuse("OPPOSITION_QUERY_REQUIRED", "Each pair of searches must include its search against");
  if (bySide[0]!.length === 0) refuse("SUPPORTING_QUERY_REQUIRED", "Each pair of searches must include its search for");
  const guarded: GuardedSearch[] = bySide.map((side) => guardSearch(side[0]!.text));
  const [forText, againstText] = guarded.map((search) => search.text?.toLocaleLowerCase("en") ?? null);
  if (forText !== null && forText === againstText) {
    refuse("OPPOSITION_QUERY_REQUIRED", "The search against must differ from the search for");
  }
  const noTarget = scope === "LOCAL" && target === null;
  const partnerHeld = guarded.some((search) => search.outcome === "HOLD");
  return POLARITIES.map((polarity, index) => {
    const search = guarded[index]!;
    const heldBecause: SearchHoldReason[] = [...search.reasons];
    if (heldBecause.length === 0 && partnerHeld) heldBecause.push("PAIR_PARTNER_HELD");
    if (noTarget) heldBecause.push("NO_LOCAL_TARGET");
    return Object.freeze({
      searchId: `${path.pathId}:${scope}:${polarity}`,
      pathId: path.pathId,
      scope,
      polarity,
      language: scope === "ENGLISH" ? "en" : target?.language ?? null,
      country: scope === "ENGLISH" ? null : target?.country ?? null,
      status: heldBecause.length === 0 ? "SEND" as const : "HELD" as const,
      text: search.text,
      heldBecause: Object.freeze(heldBecause),
      personalData: search.personalData,
      removed: search.removed,
      afterDate
    });
  });
}

/** The planner's reply as the run's frozen web query set, or a typed refusal when the reply breaks a rule. */
export function freezeWebQuerySet(plan: readonly PlannedWebPath[], context: WebPlanContext): FrozenWebQuerySet {
  if (context.pathIds.length === 0 || new Set(context.pathIds).size !== context.pathIds.length
    || context.pathIds.some((pathId) => typeof pathId !== "string" || pathId.trim() === "")) {
    refuse("WEB_PLAN_PATHS_INVALID", "The map's paths must be distinct, non-blank ids");
  }
  const target = localSearchTarget(context);
  const planned = new Map<string, PlannedWebPath>();
  for (const path of plan) {
    if (!context.pathIds.includes(path.pathId)) refuse("OFF_PLAN_QUERY_REFUSED", "Retrieval queries must be derived from the frozen question");
    if (planned.has(path.pathId)) refuse("WEB_PLAN_PATH_REPEATED", "Each path is planned once");
    planned.set(path.pathId, path);
  }
  const paths: FrozenWebPath[] = [];
  const searches: FrozenWebSearch[] = [];
  for (const pathId of context.pathIds) {
    const path = planned.get(pathId) ?? refuse("WEB_PLAN_PATH_MISSING", "Every path on the map needs a web decision");
    const reason = typeof path.reason === "string" ? path.reason.trim() : "";
    if (reason === "") refuse("WEB_PLAN_REASON_REQUIRED", "The planner says why a path does or does not need the web");
    if (!path.web) {
      if (path.searches.length > 0 || path.localHelps) {
        refuse("WEB_PLAN_SEARCH_COUNT_INVALID", "A path that needs no web has no searches");
      }
      paths.push(Object.freeze({ pathId, web: false, reason, pace: null, localHelps: false, localTarget: null }));
      continue;
    }
    if (!isWebPace(path.pace)) refuse("WEB_PACE_INVALID", "A web path needs a known pace word");
    const pace = path.pace as WebPace;
    if (path.searches.some((search) => !SCOPES.includes(search.scope) || !POLARITIES.includes(search.polarity))) {
      refuse("WEB_PLAN_SEARCH_COUNT_INVALID", "A search is English or local, for or against");
    }
    if (!path.localHelps && path.searches.some((search) => search.scope === "LOCAL")) {
      refuse("WEB_PLAN_SEARCH_COUNT_INVALID", "Local searches come only with the planner's local help");
    }
    const { afterDate } = lookBackWindow(pace, context.asOf);
    searches.push(...frozenPair(path, "ENGLISH", afterDate, target));
    if (path.localHelps) searches.push(...frozenPair(path, "LOCAL", afterDate, target));
    paths.push(Object.freeze({ pathId, web: true, reason, pace, localHelps: path.localHelps, localTarget: path.localHelps ? target : null }));
  }
  const frozenPaths = Object.freeze(paths);
  const frozenSearches = Object.freeze(searches);
  const contentHash = createHash("sha256").update(JSON.stringify({ paths: frozenPaths, searches: frozenSearches })).digest("hex");
  return Object.freeze({ paths: frozenPaths, searches: frozenSearches, contentHash });
}
