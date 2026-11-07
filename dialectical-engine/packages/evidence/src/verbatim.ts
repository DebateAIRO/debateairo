/**
 * THE WORD-FOR-WORD QUOTE CHECK (Perplexity plan 2026-10-30, task W2-4; owner 2026-10-30).
 *
 * Plain words: a reader AI copies passages ("extracts") from a page. Code keeps an extract only when the page as stored
 * holds it word for word. Only two things are evened out first, on both sides: every run of spaces, line breaks and
 * no-break spaces becomes one space, and curly, low-high and angle quote marks become the straight ' and ". Nothing
 * else: letter case, punctuation, dashes, numbers and accents must match exactly, and a passage shortened with "..." is
 * not on the page. (The kitchen's `pagecheck.py` also forgave near matches, case, dashes and thousands separators; the
 * owner's rule for the product is stricter.)
 *
 * What is kept is the PAGE's own words at that place (`text`, with `start` and `end` in the page text), never the
 * reader's copy, so a kept quote is always the page's.
 *
 * Shared: reader 1 (apps/runner/src/web-reader-all.ts) and readers 2 and 3 (W2-5) use this one checker; `verbatimKey`
 * is the form they merge the same passage found by several readers by.
 */

/** The quote marks read as a straight double quote (curly, low-high, reversed, angle, prime, full width). */
export const VERBATIM_DOUBLE_QUOTES = Object.freeze([
  "“", "”", "„", "‟", "″", "‶", "«", "»", "〝", "〞", "〟", "＂"
] as const);
/** The quote marks read as a straight single quote (curly, low, reversed, angle, prime, full width). */
export const VERBATIM_SINGLE_QUOTES = Object.freeze([
  "‘", "’", "‚", "‛", "′", "‵", "‹", "›", "＇"
] as const);

const QUOTE_OF: ReadonlyMap<string, string> = new Map([
  ...VERBATIM_DOUBLE_QUOTES.map((mark) => [mark, "\""] as const),
  ...VERBATIM_SINGLE_QUOTES.map((mark) => [mark, "'"] as const)
]);
/** One space character: JavaScript's white space and line terminators (the no-break and thin spaces included). */
const SPACE = /\s/u;

/** The evened-out text and, per code unit of it, where it came from in the original (start, end exclusive). */
type Evened = Readonly<{ text: string; from: readonly number[]; to: readonly number[] }>;

function evenOut(original: string): Evened {
  let text = "";
  const from: number[] = [];
  const to: number[] = [];
  let index = 0;
  while (index < original.length) {
    const unit = original[index]!;
    if (SPACE.test(unit)) {
      let end = index + 1;
      while (end < original.length && SPACE.test(original[end]!)) end += 1;
      text += " ";
      from.push(index);
      to.push(end);
      index = end;
      continue;
    }
    text += QUOTE_OF.get(unit) ?? unit;
    from.push(index);
    to.push(index + 1);
    index += 1;
  }
  return Object.freeze({ text, from, to });
}

/** The form two passages are compared in: spaces and quote marks evened out, then the ends trimmed. */
export function verbatimKey(text: string): string {
  return evenOut(text).text.trim();
}

/** An extract found on the page: the page's own words there, and their place in the page text. */
export type VerbatimFound = Readonly<{ start: number; end: number; text: string }>;

/** A page read once for many extracts. */
export type VerbatimPage = Readonly<{ find: (extract: string) => VerbatimFound | null }>;

export function verbatimPage(pageText: string): VerbatimPage {
  const page = evenOut(pageText);
  return Object.freeze({
    find(extract: string): VerbatimFound | null {
      const key = verbatimKey(extract);
      if (key === "") return null;
      const at = page.text.indexOf(key);
      if (at < 0) return null;
      const start = page.from[at]!;
      const end = page.to[at + key.length - 1]!;
      return Object.freeze({ start, end, text: pageText.slice(start, end) });
    }
  });
}

/** One extract against one page: the page's words there, or null when the page does not hold it word for word. */
export function findVerbatim(pageText: string, extract: string): VerbatimFound | null {
  return verbatimPage(pageText).find(extract);
}

/** A reply's extracts for one page: the found ones in reply order, each passage once; the others, as written, dropped. */
export type VerbatimCheck = Readonly<{ kept: readonly VerbatimFound[]; dropped: readonly string[] }>;

export function checkVerbatimExtracts(pageText: string, extracts: readonly string[]): VerbatimCheck {
  const page = verbatimPage(pageText);
  const kept: VerbatimFound[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const extract of extracts) {
    const found = page.find(extract);
    if (found === null) { dropped.push(extract); continue; }
    const key = verbatimKey(found.text);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(found);
  }
  return Object.freeze({ kept: Object.freeze(kept), dropped: Object.freeze(dropped) });
}
