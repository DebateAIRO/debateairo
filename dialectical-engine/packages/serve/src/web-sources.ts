import {
  WEB_CONTRACT_LIMITS, WebExplanationSchema, WebOtherPageSchema, WebPathSchema, WebSourceSchema, cutQuoteAtWordEdge,
  type AnswerWeb, type Node, type WebExplanation, type WebOtherPage, type WebPath, type WebReadDepth, type WebResearched,
  type WebSearchStatus, type WebSource
} from "@debateai/contract";
import { exhaustive } from "@debateai/kernel";

/**
 * SERVE: SOURCES AND WEB STATUS TO THE ANSWER (plan 2026-10-30 task W3-3; owner answers of 2026-10-29/30, "Perplexity
 * design round" to the end). Plain words: what one debate's web step kept (migration 0132, read through
 * identity.read_web_evidence and opened under the run's key by the repository in ./index.ts) becomes
 *  - under each point, its `sources[]`: the checked extracts its locator names, each quote cut to 120 characters at a
 *    word edge, with the page's title, site, link, how much of it was read, its date and reader 1's one line about it,
 *    in the language the site was shown in (Q8), and `fewer_readers` when a planned reader did not read the page;
 *  - on a looked-up point, the server's `looked_up_checked` flag: true only when its locator is an extract of THIS
 *    debate and the reviewer agreed with the point ("Sure" needs it, Q17);
 *  - on the answer, `web.paths[]`: each path's search status and its other pages (dig suggestions are W4-3's), each
 *    path named by its opening position, the root node id in force (W3-6, `webPathsAtRoots`), as the story paths and the
 *    map view name it; the store keys it by the map's answer id.
 *
 * Rules this file keeps:
 *  - never a grade or a score: the input below has no grade, no spread and no maker, so none can reach the answer;
 *  - quotes come from the stored extracts, never from a page's text or an AI call record, so a debate whose page texts
 *    were wiped serves the same quotes and lines (F9: only the shown quotes and reader 1's line stay);
 *  - an answer whose debate kept no web rows serves exactly as before: no `web`, no `sources`, no flag;
 *  - a stored value that does not make a valid shape is left out (that source, that page or that path), never failing
 *    the answer, as A21's projection does.
 * Pure: the repository reads and opens the rows; this file only shapes them.
 */

/* ----------------------------------------------------------------- what the web step seals (W3-1 writes these) */

/** identity.web_page's sealed value: the page's address, its site (the host), its title and its own date, as found. */
export type WebStoredPageAbout = Readonly<{ url: string; site: string; title: string | null; date: string | null }>;
/** identity.web_reading's sealed value for reader 1: its one line about the page, in the site's language then (Q8). */
export type WebStoredReadingLine = Readonly<{ line: string; language: string; leads?: readonly string[] }>;
/** identity.web_extract's sealed value: the checked extract, word for word as the page writes it. */
export type WebStoredExtractQuote = Readonly<{ quote: string }>;
/** identity.web_plan_path's sealed value (0134, NO_SEARCH_PLANNED only): the planner's reason, model text. */
export type WebStoredPlanReason = Readonly<{ reason: string }>;

/* ----------------------------------------------------------------- the input */

/**
 * One run's web rows as the repository hands them in: 0132's lists, in its order, with the sealed values opened (each
 * `unknown` until checked here). Left out on purpose: every grade, the reader's maker, the search words, the charge and
 * every page text and text state.
 */
export type WebServeEvidence = Readonly<{
  searches: readonly Readonly<{ searchId: string; pathRef: string; outcome: string }>[];
  pages: readonly Readonly<{ pageId: string; searchId: string; rank: number; readDepth: string; about: unknown }>[];
  /** `line` is opened for reader 1's READ rows only (null otherwise). */
  readings: readonly Readonly<{ pageId: string; reader: number; outcome: string; line: unknown }>[];
  extracts: readonly Readonly<{ pageId: string; pathRef: string; label: string; quote: unknown }>[];
  picks: readonly Readonly<{ pathRef: string; rank: number; pageId: string }>[];
  researched: readonly Readonly<{ pageId: string; pathRef: string; outcome: string | null }>[];
}>;

/**
 * The planner's decision for one path, as the runner's `webPlanPathStatuses` gives it (apps/runner/src/web-planner.ts):
 * PLANNED (searches were planned: the stored searches then say SEARCHED or FAILED), NO_SEARCH_PLANNED with its reason,
 * NOT_ON_PLAN (Free), SWITCHED_OFF (the setting) or FAILED (no planner answered).
 */
export type WebPlanPathRecord = Readonly<{
  pathId: string;
  status: "PLANNED" | "NO_SEARCH_PLANNED" | "NOT_ON_PLAN" | "SWITCHED_OFF" | "FAILED";
  reason: string | null;
}>;

/** What one answer's web part is: the paths, and every checked source of the debate by its extract id. */
export type ServedWeb = Readonly<{ web: AnswerWeb; sources: ReadonlyMap<string, WebSource> }>;

/* ----------------------------------------------------------------- reading the stored values */

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => typeof value === "string" && value.trim().length > 0 ? value : null;

function pageAbout(value: unknown): WebStoredPageAbout | null {
  if (!isRecord(value)) return null;
  const url = text(value.url), site = text(value.site);
  if (url === null || site === null) return null;
  return { url, site: site.trim(), title: text(value.title), date: text(value.date) };
}

function readingLine(value: unknown): WebExplanation | null {
  if (!isRecord(value)) return null;
  const line = text(value.line);
  if (line === null) return null;
  const parsed = WebExplanationSchema.safeParse({
    text: cutQuoteAtWordEdge(line, WEB_CONTRACT_LIMITS.explanationMaxChars), language: value.language
  });
  return parsed.success ? parsed.data : null;
}

function extractQuote(value: unknown): string | null {
  const quote = isRecord(value) ? text(value.quote) : null;
  return quote === null ? null : cutQuoteAtWordEdge(quote);
}

/** The page's own date as a calendar day, when it names one (YYYY-MM-DD, or a timestamp starting with one). */
function calendarDay(value: string | null): string | null {
  const day = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/u);
  if (day === null || day === undefined) return null;
  const date = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
  return date.toISOString().slice(0, 10) === `${day[1]}-${day[2]}-${day[3]}` ? `${day[1]}-${day[2]}-${day[3]}` : null;
}

const READ_DEPTHS: Readonly<Record<string, WebReadDepth>> = Object.freeze({
  whole: "WHOLE", preview: "PREVIEW_ONLY", abstract: "ABSTRACT_ONLY"
});

/** A top page, and a page the person added to researched once it is weighed (Q7), is planned for readers 1, 2 and 3;
 * every other page for reader 1 alone. */
const PLANNED_READERS = Object.freeze({ top: 3, other: 1 });

/** The planner's word for a web path that gave no reason (WEB_PLAN_NO_REASON_GIVEN, apps/runner/src/web-planner.ts). */
const NO_REASON_GIVEN = "NO_REASON_GIVEN";

/** Extract ids a locator names ("S2-3"; a locator naming several gives each, in order, once). */
const LOCATOR_EXTRACT_IDS = /(?<![A-Za-z0-9])S[0-9]{1,4}-[0-9]{1,4}(?![0-9])/gu;

/* ----------------------------------------------------------------- the answer's web part */

type PageFields = Pick<WebSource, "title" | "site" | "link" | "read_depth" | "explanation">;

/**
 * One debate's web part, or null when it kept nothing (no search and no plan): such an answer serves exactly as before.
 * `plan` is the planner's per-path decision when one is stored; without it, the paths are those the searches name.
 */
export function serveWebEvidence(input: Readonly<{
  evidence: WebServeEvidence | null;
  plan: readonly WebPlanPathRecord[] | null;
}>): ServedWeb | null {
  const evidence = input.evidence;
  const plan = input.plan ?? [];
  const searches = evidence?.searches ?? [];
  if (searches.length === 0 && plan.length === 0) return null;

  const pathOfSearch = new Map(searches.map((search) => [search.searchId, search.pathRef]));
  const topPages = new Set((evidence?.picks ?? []).map((pick) => pick.pageId));
  const weighed = new Set((evidence?.researched ?? []).filter((chosen) => chosen.outcome !== null).map((chosen) => chosen.pageId));
  const readersOf = new Map<string, Set<number>>();
  const lineOf = new Map<string, WebExplanation>();
  for (const reading of evidence?.readings ?? []) {
    if (reading.outcome !== "READ") continue;
    readersOf.set(reading.pageId, (readersOf.get(reading.pageId) ?? new Set()).add(reading.reader));
    if (reading.reader === 1) {
      const explanation = readingLine(reading.line);
      if (explanation !== null) lineOf.set(reading.pageId, explanation);
    }
  }

  const pageFields = new Map<string, PageFields & { published_on: string | null }>();
  for (const page of evidence?.pages ?? []) {
    const about = pageAbout(page.about);
    const readDepth = READ_DEPTHS[page.readDepth];
    if (about === null || readDepth === undefined) continue;
    pageFields.set(page.pageId, {
      title: about.title === null ? null : cutQuoteAtWordEdge(about.title, WEB_CONTRACT_LIMITS.titleMaxChars),
      site: about.site,
      link: about.url,
      read_depth: readDepth,
      explanation: lineOf.get(page.pageId) ?? null,
      published_on: calendarDay(about.date)
    });
  }

  const sources = new Map<string, WebSource>();
  const sourcesOfPage = new Map<string, WebSource[]>();
  for (const extract of evidence?.extracts ?? []) {
    const fields = pageFields.get(extract.pageId);
    const quote = extractQuote(extract.quote);
    if (fields === undefined || quote === null || sources.has(extract.label)) continue;
    const planned = topPages.has(extract.pageId) || weighed.has(extract.pageId) ? PLANNED_READERS.top : PLANNED_READERS.other;
    const fewer = (readersOf.get(extract.pageId)?.size ?? 0) < planned;
    const parsed = WebSourceSchema.safeParse({
      extract_id: extract.label, quote, ...fields, ...(fewer ? { fewer_readers: true } : {})
    });
    if (!parsed.success) continue;
    sources.set(extract.label, parsed.data);
    sourcesOfPage.set(extract.pageId, [...(sourcesOfPage.get(extract.pageId) ?? []), parsed.data]);
  }

  const researchedOf = new Map((evidence?.researched ?? []).map((chosen) => [`${chosen.pathRef}\n${chosen.pageId}`, chosen.outcome]));
  const researched = (pathRef: string, pageId: string): WebResearched | undefined => {
    const key = `${pathRef}\n${pageId}`;
    if (!researchedOf.has(key)) return undefined;
    const outcome = researchedOf.get(key);
    if (outcome === null || outcome === undefined) return { state: "READING" };
    if (outcome === "FAILED") return { state: "FAILED" };
    const added = (sourcesOfPage.get(pageId) ?? []).slice(0, WEB_CONTRACT_LIMITS.sourcesPerPointMax);
    // ADDS whose checked quotes are all gone added nothing the page could show.
    return outcome === "ADDS" && added.length > 0 ? { state: "ADDS", sources: added } : { state: "ADDS_NOTHING" };
  };

  const otherPages = (pathRef: string): WebOtherPage[] => {
    const pages: WebOtherPage[] = [];
    const links = new Set<string>();
    for (const page of evidence?.pages ?? []) {
      const fields = pageFields.get(page.pageId);
      if (pathOfSearch.get(page.searchId) !== pathRef || topPages.has(page.pageId) || fields === undefined
        || links.has(fields.link) || pages.length >= WEB_CONTRACT_LIMITS.otherPagesPerPathMax) continue;
      const { published_on: _date, ...shown } = fields;
      const chosen = researched(pathRef, page.pageId);
      const parsed = WebOtherPageSchema.safeParse({ page_ref: page.pageId, ...shown, ...(chosen === undefined ? {} : { researched: chosen }) });
      if (!parsed.success) continue;
      links.add(fields.link);
      pages.push(parsed.data);
    }
    return pages;
  };

  const searchStatus = (pathRef: string): WebSearchStatus => {
    const answered = searches.some((search) => search.pathRef === pathRef && (search.outcome === "FOUND" || search.outcome === "EMPTY"));
    if (answered) return { status: "SEARCHED" };
    const decided = plan.find((record) => record.pathId === pathRef);
    const status = decided?.status;
    switch (status) {
      case "NO_SEARCH_PLANNED": {
        const reason = text(decided?.reason ?? null);
        return { status: "NO_SEARCH_PLANNED",
          reason: reason === null || reason === NO_REASON_GIVEN ? null : cutQuoteAtWordEdge(reason, WEB_CONTRACT_LIMITS.reasonMaxChars) };
      }
      case "NOT_ON_PLAN": return { status: "NOT_ON_PLAN" };
      case "SWITCHED_OFF": return { status: "SWITCHED_OFF" };
      // Planned with no search answered, the planner failed, or searches with no plan: the path went on without the web.
      case "PLANNED": case "FAILED": case undefined: return { status: "FAILED" };
      default: return exhaustive(status);
    }
  };

  const pathRefs = [...new Set([...plan.map((record) => record.pathId), ...searches.map((search) => search.pathRef)])];
  const paths: WebPath[] = [];
  for (const pathRef of pathRefs) {
    if (paths.length >= WEB_CONTRACT_LIMITS.pathsMax) break;
    const search = searchStatus(pathRef);
    const parsed = WebPathSchema.safeParse({
      position_ref: pathRef, search, other_pages: search.status === "SEARCHED" ? otherPages(pathRef) : [], suggestions: []
    });
    if (parsed.success) paths.push(parsed.data);
  }
  return { web: { paths }, sources };
}

/** The planner's reason as stored (0134's sealed `{ reason }`, opened), or null when it is not one. */
export function webPlanReasonOf(value: unknown): string | null {
  return isRecord(value) ? text(value.reason) : null;
}

/* ----------------------------------------------------------------- path names (W3-6) */

/**
 * Each answer id of the map with a live root in force, to that root's node id (core.map_position with its re-points,
 * migration 0119; packages/db `readMapRootsInForce`). An answer whose root is not argued yet, or whose root in force was
 * set aside ('stale') and not yet re-pointed, has none: no node of the answer names it.
 */
export type WebPathRoots = ReadonlyMap<string, string>;

export function webPathRootsOf(roots: readonly Readonly<{ answerId: string; rootNodeId: string; stale: boolean }>[]): WebPathRoots {
  return new Map(roots.filter((root) => !root.stale).map((root) => [root.answerId, root.rootNodeId.toLowerCase()] as const));
}

/**
 * The answer's web paths named as the contract names them (`WebPathSchema.position_ref`): by the root node id in force,
 * not the answer id the store keys them by. A path whose answer has no root is left out; the points' sources hang on
 * nodes and are untouched. With no web part, none.
 */
export function webPathsAtRoots(served: ServedWeb | null, roots: WebPathRoots): ServedWeb | null {
  if (served === null) return null;
  const paths = served.web.paths.flatMap((path) => {
    const root = roots.get(path.position_ref);
    return root === undefined ? [] : [{ ...path, position_ref: root }];
  });
  return { web: { paths }, sources: served.sources };
}

/**
 * "Add to researched" (W4-4, `ResearchedAddRequestSchema.position_ref`): the stored path_ref (the map's answer id) of the
 * path a served position names (its root node id in force), or null when no answer of the run has that root now.
 */
export function webPathRefOfPosition(positionRef: string, roots: WebPathRoots): string | null {
  const wanted = positionRef.trim().toLowerCase();
  for (const [answerId, root] of roots) if (root === wanted) return answerId;
  return null;
}

/* ----------------------------------------------------------------- the points */

/** Whether a point is "checked looked up": a looked-up point whose locator is one of THIS debate's extracts, agreed with. */
export function lookedUpChecked(node: Pick<Node, "way_of_knowing" | "locator" | "review">,
  sources: ReadonlyMap<string, WebSource>): boolean {
  return node.way_of_knowing === "LOOKED_UP" && node.locator !== null && sources.has(node.locator)
    && node.review?.outcome === "agree";
}

/**
 * The points with their sources (the extracts their locators name, at most 8, only when there is one) and, on every
 * looked-up point, the checked flag. With no web part the very same points come back, so an old answer is unchanged.
 */
export function withWebSources(nodes: readonly Node[], served: ServedWeb | null): Node[] {
  if (served === null) return [...nodes];
  return nodes.map((node) => {
    const named = [...new Set(node.locator?.match(LOCATOR_EXTRACT_IDS) ?? [])];
    const shown = named.flatMap((id) => served.sources.get(id) ?? []).slice(0, WEB_CONTRACT_LIMITS.sourcesPerPointMax);
    return {
      ...node,
      ...(shown.length === 0 ? {} : { sources: shown }),
      ...(node.way_of_knowing === "LOOKED_UP" ? { looked_up_checked: lookedUpChecked(node, served.sources) } : {})
    };
  });
}
