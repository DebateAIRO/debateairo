import { cutQuoteAtWordEdge, WEB_CONTRACT_LIMITS, webRanOnFree, type Answer, type WebOtherPage, type WebSource } from "@debateai/contract";
import type { V4PathWeb, V4WebNote } from "./types.js";

/*
 * Perplexity plan W2-6 (2026-10-30): what the V4 pages read from the answer's optional web fields (contract W1-6,
 * packages/contract/src/web.ts). Owner rules (OWNER-ANSWERS-2026-10-29, "Perplexity design round" to the end):
 *  - every quote shown is at most 120 characters, cut at a word edge, with reader 1's one line about its page;
 *  - never a grade or a score (the contract carries none; nothing here reads one);
 *  - Free never searches, so a Free debate says "Not checked on the web; paid plans look things up." and is never "Sure";
 *  - a failed search says so, and the debate's points then come from the AIs' own knowledge.
 * An answer from before R22 has no web fields: every function here then gives "nothing", and the pages read as before.
 */

type AnswerNode = Answer["nodes"][number];

/** Only a plain web address is ever a link on a V4 page (the contract allows http and https only; this holds it). */
const WEB_LINK = /^https?:\/\//iu;

function shownPage<T extends Readonly<{ link: string }>>(page: T): boolean {
  return WEB_LINK.test(page.link);
}

/**
 * A point's sources as the page shows them: at most the contract's 8, each quote cut again to 120 characters at a word
 * edge (the cut is idempotent, so a served quote stays as it is), a source without a plain web link left out.
 */
export function sourcesOf(node: AnswerNode): readonly WebSource[] {
  const sources = node.sources ?? [];
  return Object.freeze(sources
    .filter(shownPage)
    .slice(0, WEB_CONTRACT_LIMITS.sourcesPerPointMax)
    .map((source) => Object.freeze({ ...source, quote: cutQuoteAtWordEdge(source.quote) })));
}

/** Free never searches: a debate whose web part says "not on this plan" for any path ran on Free (owner: never "Sure"). */
export function ranOnFree(answer: Answer): boolean {
  return webRanOnFree(answer.web);
}

/** One path's web part, by the opening position that argued it (a story path's `position_ref`); absent when unknown. */
export function pathWebOf(answer: Answer, positionRef: string): V4PathWeb | undefined {
  const path = (answer.web?.paths ?? []).find((candidate) => candidate.position_ref === positionRef);
  if (path === undefined) return undefined;
  // Only a path that searched lists other pages (the contract's rule); a page without a plain web link is left out.
  const otherPages: readonly WebOtherPage[] = path.search.status === "SEARCHED"
    ? Object.freeze(path.other_pages.filter(shownPage))
    : Object.freeze([]);
  return Object.freeze({ search: path.search, otherPages });
}

/**
 * The debate's one web note: FREE when it ran on Free; FAILED or SWITCHED_OFF when every path says so. Otherwise null
 * (it searched, a mix that each path states for itself, or an answer from before R22 with no web part).
 */
export function webNoteOf(answer: Answer): V4WebNote | null {
  const paths = answer.web?.paths ?? [];
  if (paths.length === 0) return null;
  if (ranOnFree(answer)) return "FREE";
  if (paths.every((path) => path.search.status === "FAILED")) return "FAILED";
  if (paths.every((path) => path.search.status === "SWITCHED_OFF")) return "SWITCHED_OFF";
  return null;
}
