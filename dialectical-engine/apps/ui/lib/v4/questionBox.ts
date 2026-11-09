/*
 * V4 start step (spec 2026-11-03 §2 item 2, read-d3, read-d2): step 2's question box. It starts as the line read at Next. Each answer the
 * person taps puts one sentence into it, under their words, and unticking takes that sentence out again; the person may type anywhere. What
 * the box says is what Start sends, so a sentence they deleted or rewrote is no longer placed (boxDropped names its key, and the page unticks
 * that answer), and words they typed are never moved or touched. Untouched, the box reads exactly as R22's composeQuestion. The box lives in
 * the page's memory only and never cuts anything (string positions here are UTF-16 code units, as the page's lengths are).
 */

/** One answer's sentence. `key`: the clarifying question's text ("What do you care about most?" too); `text`: the sentence as placed. */
export type BoxSentence = Readonly<{ key: string; text: string }>;

/** The box: its whole text, and the sentences still written there as placed, top to bottom. */
export type QuestionBox = Readonly<{ text: string; placed: readonly BoxSentence[] }>;

/** The first blank line (as askText's ownWords reads it): the person's words come before it, the sentences and lines typed under them after it. */
const BLANK_LINE = /\n[^\S\n]*\n/;
/** A run of blank lines (lines holding at most spaces), with the line breaks around it. */
const BLANK_RUN = /\n(?:[^\S\n]*\n)+/g;

type Parts = Readonly<{
  /**
   * The person's words: the text before the first blank line, or before the first line still holding a placed sentence when that line comes
   * first (the whole text when there is neither).
   */
  words: string;
  /** The first blank line as written; a line break when a sentence's line comes first (nothing when it is the first line); null for neither. */
  blank: string | null;
  /** The lines after it (none when there is neither). */
  lines: readonly string[];
}>;

type Found = Readonly<{ sentence: BoxSentence; at: number }>;

/** One line: runs of spaces and line breaks become one space (as composeQuestion writes an answer). */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Whether this line still holds one of the sentences as placed: the whole line, spaces around it aside. */
function holdsSentence(line: string, sentences: readonly BoxSentence[]): boolean {
  const said = line.trim();
  return sentences.some((sentence) => sentence.text === said);
}

/**
 * The words and the lines under them. The blank line is looked for after any leading blank space, as ownWords trims before it looks. Only
 * deleting or rewriting a sentence takes its answer out (spec §2 item 2; the owner's "type more anywhere in the box"), so when the person
 * typed on the blank line, deleted it, moved it below the sentences or erased their words, the words end at the first line still holding a
 * placed sentence.
 */
function partsOf(text: string, sentences: readonly BoxSentence[]): Parts {
  const lead = text.length - text.trimStart().length;
  const match = BLANK_LINE.exec(text.slice(lead));
  const blankAt = match === null ? text.length : lead + match.index;
  let start = 0;
  for (const line of text.split("\n")) {
    if (start > blankAt) break;
    if (holdsSentence(line, sentences)) {
      return start === 0
        ? { words: "", blank: "", lines: text.split("\n") }
        : { words: text.slice(0, start - 1), blank: "\n", lines: text.slice(start).split("\n") };
    }
    start += line.length + 1;
  }
  if (match === null) return { words: text, blank: null, lines: [] };
  return { words: text.slice(0, blankAt), blank: match[0], lines: text.slice(blankAt + match[0].length).split("\n") };
}

function textOf(words: string, blank: string, lines: readonly string[]): string {
  return `${words}${blank}${lines.join("\n")}`;
}

function holdsSomething(line: string): boolean {
  return line.trim().length > 0;
}

/** Where each sentence is still written as placed: a line of its own under the words, each line taken once; top to bottom. */
function locate(lines: readonly string[], sentences: readonly BoxSentence[]): readonly Found[] {
  const taken = new Set<number>();
  const found: Found[] = [];
  for (const sentence of sentences) {
    const at = lines.findIndex((line, index) => !taken.has(index) && holdsSentence(line, [sentence]));
    if (at === -1) continue;
    taken.add(at);
    found.push({ sentence, at });
  }
  return found.sort((first, second) => first.at - second.at);
}

/** A box of this text; of `sentences`, only those still written as placed stay placed. */
function made(text: string, sentences: readonly BoxSentence[]): QuestionBox {
  const { blank, lines } = partsOf(text, sentences);
  const placed = blank === null ? [] : locate(lines, sentences).map((found) => found.sentence);
  return Object.freeze({ text, placed: Object.freeze(placed) });
}

/**
 * Where a new sentence goes among the lines after the blank line: right after the placed sentence shown before it; the first one in the
 * shown order right under the blank line; a sentence whose question is not shown after the last line that holds anything.
 */
function insertAt(lines: readonly string[], found: readonly Found[], key: string, order: readonly string[]): number {
  const rank = order.indexOf(key);
  if (rank === -1) {
    for (let at = lines.length - 1; at >= 0; at -= 1) if (holdsSomething(lines[at] ?? "")) return at + 1;
    return 0;
  }
  for (let before = rank - 1; before >= 0; before -= 1) {
    const hit = found.find((placed) => placed.sentence.key === order[before]);
    if (hit !== undefined) return hit.at + 1;
  }
  return 0;
}

/** The line read at Next, nothing placed. */
export function boxOf(readLine: string): QuestionBox {
  return Object.freeze({ text: readLine, placed: Object.freeze([]) });
}

/**
 * Places one answer's sentence, on one line. The first goes after one blank line under the person's words; each later one on its own line,
 * in `order` (the order the questions are shown). A key placed again has its sentence replaced where it is still written; a blank sentence
 * (an "Other…" with nothing typed) says nothing, so it only takes the key's sentence out.
 */
export function boxPlace(box: QuestionBox, sentence: BoxSentence, order: readonly string[]): QuestionBox {
  const text = oneLine(sentence.text);
  if (text.length === 0) return boxRemove(box, sentence.key);
  const placing: BoxSentence = Object.freeze({ key: sentence.key, text });
  const sentences = [...box.placed.filter((placed) => placed.key !== sentence.key), placing];
  const { words, blank, lines } = partsOf(box.text, box.placed);
  if (blank === null) return made(`${words.trimEnd()}\n\n${text}`, sentences);
  if (!lines.some(holdsSomething)) return made(textOf(words, blank, [text]), sentences);
  const found = locate(lines, box.placed);
  const own = found.find((placed) => placed.sentence.key === sentence.key);
  const next = [...lines];
  if (own === undefined) next.splice(insertAt(lines, found, sentence.key, order), 0, text);
  else next[own.at] = text;
  return made(textOf(words, blank, next), sentences);
}

/**
 * Takes a key's sentence out: exactly its line, and the blank line too when nothing the person typed and no placed sentence is left under
 * their words. A sentence the person edited is no longer placed, so its text stays as it is.
 */
export function boxRemove(box: QuestionBox, key: string): QuestionBox {
  const { words, blank, lines } = partsOf(box.text, box.placed);
  const own = locate(lines, box.placed).find((placed) => placed.sentence.key === key);
  const kept = box.placed.filter((placed) => placed.key !== key);
  if (blank === null || own === undefined) return kept.length === box.placed.length ? box : made(box.text, kept);
  const next = lines.filter((_, at) => at !== own.at);
  return made(next.some(holdsSomething) ? textOf(words, blank, next) : words, kept);
}

/**
 * Make this my question (and an accepted language rewrite): the new words replace the words before the first blank line; everything under
 * it stays. A blank line inside the new words is closed up to one line break, as composeQuestion closes the person's words; when the
 * person had deleted the blank line above the sentences, one blank line goes back between the new words and them.
 */
export function boxOwnWords(box: QuestionBox, words: string): QuestionBox {
  const own = words.trim().replace(/\n\s*\n/g, "\n");
  const { blank, lines } = partsOf(box.text, box.placed);
  return made(blank === null ? own : textOf(own, BLANK_LINE.test(blank) ? blank : "\n\n", lines), box.placed);
}

/**
 * V4 start step, Task 76g (read-f1, read-d3): a new reading keeps an answer under a reworded question. The sentence stays where it
 * is, byte for byte; only the key it is placed under changes (`from` to `to`). A key not placed, or the same key: the box as it is.
 */
export function boxRekey(box: QuestionBox, from: string, to: string): QuestionBox {
  if (from === to || !box.placed.some((placed) => placed.key === from)) return box;
  return Object.freeze({
    text: box.text,
    placed: Object.freeze(box.placed.map((placed) => (placed.key === from ? Object.freeze({ key: to, text: placed.text }) : placed)))
  });
}

/** The person typed: the text is theirs; only the sentences still written as placed stay placed. */
export function boxTyped(box: QuestionBox, text: string): QuestionBox {
  return made(text, box.placed);
}

/** The keys placed before and no longer placed (deleted or edited by typing): the page unticks those answers. */
export function boxDropped(before: QuestionBox, after: QuestionBox): readonly string[] {
  const still = new Set(after.placed.map((placed) => placed.key));
  return Object.freeze(before.placed.map((placed) => placed.key).filter((key) => !still.has(key)));
}

/** The box as sent: trimmed, and every run of blank lines one blank line. */
export function boxLine(box: QuestionBox): string {
  return box.text.trim().replace(BLANK_RUN, "\n\n");
}

/** True when the box no longer says the line read at Next. */
export function boxChanged(box: QuestionBox, readLine: string): boolean {
  return boxLine(box) !== readLine.trim();
}
