import { reportWordPieces } from "./reportModel.js";

/**
 * Where a line of the report may break inside a "word", the stretch between
 * two spaces that react-pdf's textkit 7.0.1 hands its hyphenation callback.
 *
 * Chinese and Japanese put no spaces between words, so a whole sentence is one
 * such word. A line may break between any two ideographs, kana or fullwidth
 * characters (UAX #14 style), but never before closing punctuation, a small
 * kana or the long-vowel mark, and never after opening punctuation (the
 * Japanese kinsoku rules). Korean puts spaces between its words and breaks
 * there, like every other script. A long word with no break (a web address a
 * model copied) is cut by reportWordPieces.
 *
 * The breaks are empty pieces between the parts, the zero-width mechanism
 * reportHyphenation uses: textkit breaks there and prints nothing, and not one
 * character is added to the text.
 */

/** Characters a Chinese or Japanese line may break around: Han, kana, CJK symbols and punctuation, fullwidth forms. */
const IDEOGRAPHIC = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-〿ー！-｠￠-￦]/u;

/** Never at the start of a line: closing punctuation, small kana, iteration and long-vowel marks (UAX #14 CL, CP, EX, IS, NS, CJ). */
const NO_BREAK_BEFORE = new Set([
  ..."、。，．：；？！）」』】〕〗〙〛〉》｝］〞〟ー・…‥ゝゞヽヾ々〻〜～",
  ..."ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ",
  ...".,:;!?)]}%’”\u00A0"
]);

/** Never at the end of a line: opening punctuation (UAX #14 OP). */
const NO_BREAK_AFTER = new Set([..."（「『【〔〖〘〚〈《｛［〝‘“([{\u00A0"]);

const GRAPHEMES = new Intl.Segmenter("und", { granularity: "grapheme" });

function graphemes(text: string): string[] {
  return Array.from(GRAPHEMES.segment(text), (part) => part.segment);
}

/** A line may break between `before` and `after` (two graphemes). */
export function reportBreaksBetween(before: string, after: string): boolean {
  if (/\s/u.test(before) || /\s/u.test(after)) return false;
  const first = (grapheme: string) => String.fromCodePoint(grapheme.codePointAt(0)!);
  if (NO_BREAK_AFTER.has(first(before)) || NO_BREAK_BEFORE.has(first(after))) return false;
  return IDEOGRAPHIC.test(before) || IDEOGRAPHIC.test(after);
}

/**
 * The pieces a word may break between, in order (joined, they are the word):
 * first at the Chinese and Japanese break points, then each piece is cut the
 * way reportWordPieces cuts a long word. A word without Han or kana gives
 * exactly reportWordPieces(word).
 */
export function reportBreakPieces(word: string): string[] {
  const characters = graphemes(word);
  const segments: string[] = [];
  let segment = "";
  characters.forEach((character, index) => {
    if (index > 0 && reportBreaksBetween(characters[index - 1]!, character)) {
      segments.push(segment);
      segment = "";
    }
    segment += character;
  });
  if (segment.length > 0) segments.push(segment);
  return segments.flatMap((part) => reportWordPieces(part));
}

/** The pieces with an empty piece between each two: textkit's zero-width break points. */
function withBreaks(pieces: readonly string[]): string[] {
  return pieces.flatMap((piece, index) => (index === 0 ? [piece] : ["", piece]));
}

/**
 * The line-break rule for one text of the report, `text` being all of it.
 * textkit also splits a text into runs wherever its script or font changes (a
 * Japanese sentence changes between Han and kana every few characters), hands
 * each run's words to this rule separately, and breaks between two runs only
 * at a hyphen it prints. So a word may also break before its first character,
 * when the text allows a break there wherever this word appears in it; the
 * rule cannot know which of the word's places in the text textkit is at, so it
 * only breaks where every one of them allows it.
 */
export function reportLineBreaker(text: string): (word: string) => string[] {
  return (word) => {
    const pieces = withBreaks(reportBreakPieces(word));
    return breaksBeforeEverywhere(text, word) ? ["", ...pieces] : pieces;
  };
}

function breaksBeforeEverywhere(text: string, word: string): boolean {
  if (word.length === 0) return false;
  const first = graphemes(word)[0]!;
  let found = false;
  for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
    if (at === 0) return false;
    const before = graphemes(text.slice(Math.max(0, at - 8), at)).at(-1)!;
    if (!reportBreaksBetween(before, first)) return false;
    found = true;
  }
  return found;
}
