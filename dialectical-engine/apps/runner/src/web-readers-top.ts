// apps/runner/src/web-readers-top.ts
/**
 * WEB SEARCH: READERS 2 AND 3 (plan 2026-10-30 task W2-5; owner answers of 2026-10-29/30, "Perplexity design round" to
 * the end, which override the plan).
 *
 * Plain words: after reader 1 has read every page of a path and the pick has chosen its top pages, two more AIs read
 * those top pages whole, each from another company. Makers count as companies, even when one vendor hosts them (owner,
 * Q11): DeepSeek and GLM, with Qwen as the other choice, never reader 1's company. They read the top pages there are,
 * up to 3 on Quick look and up to 5 on Thorough, at least 1 (owner, 30 Oct, "read what there is"; code passes the
 * pages, the sealed wording web.read-top.v2 names no number); with no top page they are not asked. Then code, never
 * an AI:
 * - keeps an extract only when the verbatim checker finds it on the stored page text (W2-4's checker, handed in);
 * - merges the same extract found by several readers (reader 1's checked extracts included) into one, with who found it;
 * - records each page's grades by reader and their spread;
 * - keeps the readers' "still worth looking into" lines as suggestion material (W4-3, kind "needs more web");
 * - when a reader fails, marks the page as read by fewer AIs. The debate goes on.
 * Thinking runs low: the call sites are the `web_reader_top` step, which the line-up's thinking table sets to low.
 *
 * The page text never enters the AI call record (0132; packages/db/src/web-evidence.ts): the material names each page by
 * `webPageTextRef`, and the caller puts the texts in only on the way to the vendor (`webMaterialWithPageTexts`).
 *
 * The runner passes in everything that touches the run (the seats, the call, the checker), so this file holds the rules
 * alone and is tested with scripted calls. It writes nothing: W3-1 stores the readings, extracts and leads.
 */
import { webPageTextRef } from "@debateai/db";
import {
  WEB_READ_TOP_V2_PROMPT_CONTRACT, WEB_REPLY_IDS_INCOMPLETE, WEB_TOP_COUNT_BY_MODE, webReadTopCallSiteKey,
  webReadTopReplySchema, webReadTopV2MaterialFields, type WebMode, type WebReadTopReply
} from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import {
  decodeModelJson, decodedRepairsOf, parsedWithRepairs, type ContentClassification, type FramedMaterialField,
  type ModelReplyFacts, type PreviewEffort, type PreviewThinkingStep, type PromptContract
} from "@debateai/providers";

/* ----------------------------------------------------------------- the verbatim checker (W2-4's), as a seam */

/**
 * SEAM (merge note): W2-4 builds the one verbatim checker (packages/evidence/src/verbatim.ts, the kitchen's pagecheck.py
 * rules: spaces and quote marks evened out only). This file never checks text itself: the caller hands that function in.
 * Assumed shape: `(pageText, extract) => true` when the extract is found on the page. If W2-4's export has another shape,
 * the one-line adapter belongs where W3-1 builds this step's input. Two extracts are "the same" exactly when each is found
 * in the other by this checker, so the merge follows the checker's own evening-out and needs no second one.
 */
export type WebVerbatimCheck = (pageText: string, extract: string) => boolean;

/* ----------------------------------------------------------------- the shapes */

/** The readers this file runs (reader 1 is W2-4's). */
export type WebTopReader = 2 | 3;
export type WebReaderNumber = 1 | WebTopReader;
export type WebGrade = 0 | 1 | 2 | 3;
/** The readers by name, not as a list of numbers (the S1-1 scan reads a list of numbers as an enumeration). */
const READER_ONE = 1 as const;
const READER_TWO = 2 as const;
const READER_THREE = 3 as const;
const TOP_READERS: readonly WebTopReader[] = Object.freeze([READER_TWO, READER_THREE]);
const ALL_READERS: readonly WebReaderNumber[] = Object.freeze([READER_ONE, ...TOP_READERS]);

/** A seat that may read: its maker (the company) and the line-up's provider ref. */
export type WebTopReaderSeat = Readonly<{ maker: string; providerRef: string }>;

/** A top page as stored (0132): its store id, what the readers see, its text and the text's keyed digest. */
export type WebTopPage = Readonly<{
  pageId: string; title: string; site: string; date: string | null; text: string; textDigest: Buffer;
}>;

/** Reader 1's reading of a page (W2-4): its grade and its extracts, already checked word for word. */
export type WebReaderOneReading = Readonly<{ pageId: string; grade: WebGrade; extracts: readonly string[] }>;

/** What the caller sends for one reader. `material` is what the call record keeps; `pageTexts` maps each ref to its text. */
export type WebTopReaderCallInput = Readonly<{
  reader: WebTopReader;
  seat: WebTopReaderSeat;
  callSiteKey: string;
  contract: PromptContract;
  material: readonly FramedMaterialField[];
  pageTexts: ReadonlyMap<string, string>;
  classifyContent: (content: string, reply?: ModelReplyFacts) => ContentClassification;
}>;
/**
 * What one reader's call returned. UNAVAILABLE: the vendor failed or the reply stayed unusable after the gateway's own
 * repair. A throw is a code defect or a stop the caller owns, and is not caught here.
 */
export type WebTopReaderCallOutcome =
  | Readonly<{ kind: "ANSWERED"; content: string; maker: string; reply?: ModelReplyFacts }>
  | Readonly<{ kind: "UNAVAILABLE" }>;
export type WebTopReaderCall = (input: WebTopReaderCallInput) => Promise<WebTopReaderCallOutcome>;

/** Why a reader is missing: no other company on the line-up, too few top pages, the call failed, or a same-company answer. */
export type WebTopReaderFailure = "NO_SEAT" | "NO_TOP_PAGES" | "UNAVAILABLE" | "SAME_MAKER" | "UNREADABLE";
export type WebTopReaderOutcome = Readonly<{
  reader: WebTopReader;
  /** The maker that answered when kept, else the planned seat's; null when no seat was planned. */
  maker: string | null;
  providerRef: string | null;
  outcome: "READ" | "FAILED" | "NOT_ASKED";
  failure: WebTopReaderFailure | null;
}>;
/** One reading row for identity.web_reading (readers 2 and 3, the pages they were sent). */
export type WebTopReading = Readonly<{
  pageId: string; reader: WebTopReader; maker: string; outcome: "READ" | "FAILED"; grade: WebGrade | null;
}>;
/** A page's grades by reader, who read it, whether fewer than 3 AIs did, and the spread (max - min, null under 2 grades). */
export type WebTopPageSpread = Readonly<{
  pageId: string;
  grades: Readonly<Record<WebReaderNumber, WebGrade | null>>;
  readBy: readonly WebReaderNumber[];
  fewerReaders: boolean;
  spread: number | null;
}>;
/** One checked extract, merged: the first finder's words, and every reader that found it (in reader order). */
export type WebTopExtract = Readonly<{ pageId: string; quote: string; foundBy: readonly WebReaderNumber[] }>;
/** A "still worth looking into" line, its words as first written, and the readers that wrote it. */
export type WebTopLead = Readonly<{ text: string; from: readonly WebTopReader[] }>;

export type WebTopReadersResult = Readonly<{
  pathIndex: number;
  /** How many pages readers 2 and 3 were sent: 1 up to the mode's count (3 or 5), or 0 when the path has no top page. */
  topCount: number;
  readers: readonly WebTopReaderOutcome[];
  readings: readonly WebTopReading[];
  pages: readonly WebTopPageSpread[];
  extracts: readonly WebTopExtract[];
  /** Extracts readers 2 and 3 copied that the checker did not find on the page (the practice report counts them). */
  droppedExtracts: Readonly<Record<WebTopReader, number>>;
  leads: readonly WebTopLead[];
}>;

/** Thinking low (owner, 2026-10-30): the step the call sites belong to, and the level the line-up's table gives it. */
export const WEB_TOP_READERS_THINKING: Readonly<{ step: PreviewThinkingStep; level: PreviewEffort }> =
  Object.freeze({ step: "web_reader_top", level: "low" });

/* ----------------------------------------------------------------- the company rotation */

const sameMaker = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Readers 2 and 3 for one path: the first two seats, in the line-up's order (DeepSeek, GLM, then Qwen), whose makers are
 * neither reader 1's nor each other's. DeepSeek and GLM take turns as reader 2, path by path. With only one other company
 * there is one reader; with none, none.
 */
export function webTopReaderSeats(input: Readonly<{
  pathIndex: number; readerOneMaker: string; candidates: readonly WebTopReaderSeat[];
}>): readonly Readonly<{ reader: WebTopReader; seat: WebTopReaderSeat }>[] {
  if (!Number.isSafeInteger(input.pathIndex) || input.pathIndex < 0) {
    throw new TypedDomainError("WEB_TOP_READERS_PATH_INVALID", "A path index is a whole number");
  }
  const chosen: WebTopReaderSeat[] = [];
  for (const seat of input.candidates) {
    if (chosen.length === 2) break;
    if (sameMaker(seat.maker, input.readerOneMaker) || chosen.some((other) => sameMaker(other.maker, seat.maker))) continue;
    chosen.push(seat);
  }
  const ordered = chosen.length === 2 && input.pathIndex % 2 === 1 ? [chosen[1]!, chosen[0]!] : chosen;
  return Object.freeze(ordered.map((seat, index) => Object.freeze({ reader: TOP_READERS[index]!, seat })));
}

/* ----------------------------------------------------------------- the material, the texts on the way to the vendor */

/** The id a page goes by in the call: p1, p2, ... in pick order (store ids are too long for the sealed table). */
const promptPageId = (index: number): string => `p${String(index + 1)}`;

/**
 * The material with every page text put back in place of its ref: for the request to the vendor only, never for the call
 * record. A ref stands in the pages field as one whole JSON string, so it is swapped for the text as one whole JSON string.
 */
export function webMaterialWithPageTexts(material: readonly FramedMaterialField[], pageTexts: ReadonlyMap<string, string>):
  readonly FramedMaterialField[] {
  return Object.freeze(material.map((entry) => {
    if (entry.name !== "pages") return entry;
    let content = entry.content;
    for (const [ref, text] of pageTexts) content = content.split(JSON.stringify(ref)).join(JSON.stringify(text));
    return Object.freeze({ name: entry.name, content });
  }));
}

/* ----------------------------------------------------------------- the reply */

/**
 * The classifier the caller hands the gateway (the owner's recovery order: salvage in code first). A reply is refused
 * only when it is unusable: not JSON, not the answer form, or naming none of the pages sent. A missing, unknown or
 * repeated page entry is salvaged when the reply is read: unknown and repeated entries are dropped, a missing page counts
 * as not read by this reader.
 */
export function classifyWebReadTopReply(content: string, reply: ModelReplyFacts | undefined, promptPageIds: readonly string[]):
  ContentClassification {
  const decoded = decodeModelJson(content, reply);
  if (!decoded.ok) return { parseStatus: "PARSE_FAILED", parseError: "WEB_READ_TOP_REPLY_NOT_JSON" };
  const parsed = webReadTopReplySchema.safeParse(decoded.value);
  if (!parsed.success) {
    return { parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(parsed.error.issues.map((issue) =>
      ({ code: issue.code, path: issue.path, message: issue.message }))) };
  }
  if (!parsed.data.pages.some((entry) => promptPageIds.includes(entry.page_id))) {
    return { parseStatus: "SCHEMA_FAILED",
      parseError: JSON.stringify([{ code: WEB_REPLY_IDS_INCOMPLETE, path: ["pages"], message: WEB_REPLY_IDS_INCOMPLETE }]) };
  }
  return parsedWithRepairs(decodedRepairsOf(decoded));
}

/** The accepted reply read again, as the classifier read it; null when it does not read (never expected after PARSED). */
function readReply(content: string, reply: ModelReplyFacts | undefined): WebReadTopReply | null {
  const decoded = decodeModelJson(content, reply);
  if (!decoded.ok) return null;
  const parsed = webReadTopReplySchema.safeParse(decoded.value);
  return parsed.success ? parsed.data : null;
}

/* ----------------------------------------------------------------- the step */

type ReaderRead = Readonly<{
  reader: WebTopReader; maker: string;
  /** By store page id: the first entry the reply gave for that page. */
  pages: ReadonlyMap<string, Readonly<{ grade: WebGrade; extracts: readonly string[] }>>;
  leads: readonly string[];
}>;

/** How many pages readers 2 and 3 are sent: what there is, up to the mode's count; 0 when the path has no top page. */
function sentCount(mode: WebMode, available: number): number {
  return Math.min(WEB_TOP_COUNT_BY_MODE[mode], available);
}

/**
 * Readers 2 and 3 on one path's top pages (`pages` in pick order, best first). Both calls go out together. Nothing a
 * reader does fails the debate: a failed reader leaves the pages read by fewer AIs, said on each page.
 */
export async function runWebTopReaders(input: Readonly<{
  pathIndex: number;
  mode: WebMode;
  question: string;
  answer: string;
  pages: readonly WebTopPage[];
  readerOne: readonly WebReaderOneReading[];
  readerOneMaker: string;
  candidates: readonly WebTopReaderSeat[];
  verbatim: WebVerbatimCheck;
  call: WebTopReaderCall;
}>): Promise<WebTopReadersResult> {
  if (new Set(input.pages.map((page) => page.pageId)).size !== input.pages.length) {
    throw new TypedDomainError("WEB_TOP_READERS_PAGES_INVALID", "Each top page is given once");
  }
  const seats = webTopReaderSeats(input);
  const topCount = sentCount(input.mode, input.pages.length);
  const sent = input.pages.slice(0, topCount);
  const promptIds = sent.map((_, index) => promptPageId(index));
  const storeIdOf = new Map(promptIds.map((id, index) => [id, sent[index]!.pageId]));

  const outcomes = new Map<WebTopReader, WebTopReaderOutcome>();
  const reads: ReaderRead[] = [];
  const readings: WebTopReading[] = [];

  if (topCount !== 0 && seats.length > 0) {
    const pageTexts = new Map(sent.map((page) => [webPageTextRef(page.pageId, page.textDigest), page.text]));
    const material = webReadTopV2MaterialFields({
      question: input.question, answer: input.answer, topCount: WEB_TOP_COUNT_BY_MODE[input.mode],
      pages: sent.map((page, index) => ({ pageId: promptIds[index]!, title: page.title, site: page.site, date: page.date,
        text: webPageTextRef(page.pageId, page.textDigest) }))
    });
    const answered = await Promise.all(seats.map(({ reader, seat }) => input.call({
      reader, seat, callSiteKey: webReadTopCallSiteKey(input.pathIndex, reader), contract: WEB_READ_TOP_V2_PROMPT_CONTRACT,
      material, pageTexts, classifyContent: (content, reply) => classifyWebReadTopReply(content, reply, promptIds)
    })));
    // In reader order. An answer is kept only from a company that is not reader 1's, not the other reader's planned one
    // and not one already kept, so no two readings of a page ever share a maker (0132 refuses that: SAME_MAKER), a
    // FAILED reading under its planned maker included.
    const keptMakers: string[] = [];
    seats.forEach(({ reader, seat }, index) => {
      const got = answered[index]!;
      const otherPlanned = seats.filter((entry) => entry.reader !== reader).map((entry) => entry.seat.maker);
      const failed = (failure: WebTopReaderFailure) => {
        outcomes.set(reader, Object.freeze({ reader, maker: seat.maker, providerRef: seat.providerRef, outcome: "FAILED", failure }));
        for (const page of sent) readings.push(Object.freeze({ pageId: page.pageId, reader, maker: seat.maker, outcome: "FAILED", grade: null }));
      };
      if (got.kind === "UNAVAILABLE") return failed("UNAVAILABLE");
      if ([input.readerOneMaker, ...otherPlanned, ...keptMakers].some((maker) => sameMaker(maker, got.maker))) return failed("SAME_MAKER");
      const reply = readReply(got.content, got.reply);
      if (reply === null) return failed("UNREADABLE");
      keptMakers.push(got.maker);
      const pages = new Map<string, Readonly<{ grade: WebGrade; extracts: readonly string[] }>>();
      for (const entry of reply.pages) {
        const storeId = storeIdOf.get(entry.page_id);
        if (storeId === undefined || pages.has(storeId)) continue;
        pages.set(storeId, Object.freeze({ grade: entry.grade as WebGrade, extracts: entry.extracts }));
      }
      reads.push(Object.freeze({ reader, maker: got.maker, pages, leads: reply.worth_looking_into }));
      outcomes.set(reader, Object.freeze({ reader, maker: got.maker, providerRef: seat.providerRef, outcome: "READ", failure: null }));
      for (const page of sent) {
        const read = pages.get(page.pageId);
        readings.push(Object.freeze({ pageId: page.pageId, reader, maker: got.maker, outcome: read === undefined ? "FAILED" : "READ",
          grade: read?.grade ?? null }));
      }
    });
  }
  for (const reader of TOP_READERS) {
    if (outcomes.has(reader)) continue;
    const planned = seats.find((entry) => entry.reader === reader)?.seat ?? null;
    outcomes.set(reader, Object.freeze({ reader, maker: planned?.maker ?? null, providerRef: planned?.providerRef ?? null,
      outcome: "NOT_ASKED", failure: topCount === 0 ? "NO_TOP_PAGES" : "NO_SEAT" }));
  }

  const readerOneOf = new Map(input.readerOne.map((entry) => [entry.pageId, entry]));
  const dropped: Record<WebTopReader, number> = { 2: 0, 3: 0 };
  const extracts: Array<{ pageId: string; quote: string; foundBy: WebReaderNumber[] }> = [];
  const pages = input.pages.map((page): WebTopPageSpread => {
    const one = readerOneOf.get(page.pageId);
    const grades: Record<WebReaderNumber, WebGrade | null> = { 1: one?.grade ?? null, 2: null, 3: null };
    const onPage: Array<{ pageId: string; quote: string; foundBy: WebReaderNumber[] }> = [];
    const add = (reader: WebReaderNumber, quote: string) => {
      const same = onPage.find((kept) => input.verbatim(kept.quote, quote) && input.verbatim(quote, kept.quote));
      if (same === undefined) onPage.push({ pageId: page.pageId, quote, foundBy: [reader] });
      else if (!same.foundBy.includes(reader)) same.foundBy.push(reader);
    };
    // Reader 1's extracts were checked by W2-4 and are kept as given.
    for (const quote of one?.extracts ?? []) add(READER_ONE, quote);
    for (const read of [...reads].sort((a, b) => a.reader - b.reader)) {
      const got = read.pages.get(page.pageId);
      if (got === undefined) continue;
      grades[read.reader] = got.grade;
      for (const quote of got.extracts) {
        if (input.verbatim(page.text, quote)) add(read.reader, quote);
        else dropped[read.reader] += 1;
      }
    }
    for (const kept of onPage) kept.foundBy.sort((a, b) => a - b);
    extracts.push(...onPage);
    const readBy = ALL_READERS.filter((reader) => grades[reader] !== null);
    const given = readBy.map((reader) => grades[reader]!);
    return Object.freeze({
      pageId: page.pageId, grades: Object.freeze(grades), readBy: Object.freeze(readBy), fewerReaders: readBy.length < 3,
      spread: given.length < 2 ? null : Math.max(...given) - Math.min(...given)
    });
  });

  const leads: Array<{ key: string; text: string; from: WebTopReader[] }> = [];
  for (const read of [...reads].sort((a, b) => a.reader - b.reader)) {
    for (const line of read.leads) {
      const text = line.trim();
      const key = text.replace(/\s+/gu, " ").toLowerCase();
      if (key === "") continue;
      const same = leads.find((lead) => lead.key === key);
      if (same === undefined) leads.push({ key, text, from: [read.reader] });
      else if (!same.from.includes(read.reader)) same.from.push(read.reader);
    }
  }

  return Object.freeze({
    pathIndex: input.pathIndex,
    topCount,
    readers: Object.freeze([outcomes.get(2)!, outcomes.get(3)!]),
    readings: Object.freeze(readings.sort((a, b) => a.reader - b.reader)),
    pages: Object.freeze(pages),
    extracts: Object.freeze(extracts.map((entry) => Object.freeze({ pageId: entry.pageId, quote: entry.quote,
      foundBy: Object.freeze(entry.foundBy) }))),
    droppedExtracts: Object.freeze(dropped),
    leads: Object.freeze(leads.map((lead) => Object.freeze({ text: lead.text, from: Object.freeze(lead.from) })))
  });
}
