// apps/runner/src/web-reader-all.ts
/**
 * WEB SEARCH: READER 1 AND THE TOP PICK (Perplexity plan 2026-10-30, task W2-4; the owner's answers of 2026-10-29/30,
 * "Perplexity design round" to the end, override the plan).
 *
 * Plain words: for one path (one answer of the map), reader 1 (Claude Haiku) reads EVERY page its searches found, whole.
 * The pages go in batches of at most 80K tokens, and every call stays under 100K input tokens, checked by code before it
 * is sent. For each page reader 1 gives a grade from 0 to 3, one line in the site's language on what it adds, and the
 * passages it copied word for word. Code keeps a passage only when the stored page holds it word for word (spaces and
 * quote marks evened out, nothing else: `@debateai/evidence` verbatim.ts, shared with readers 2 and 3). Then one short
 * call picks the top pages (3 on Quick look, 5 on Thorough), judged against each other from the grades and lines alone.
 * Every page outside the top is kept as an "other page". Both calls run at low thinking.
 *
 * - Where a page's text goes. The AI call record (`ledger.call_prompt`, replayed byte for byte) must never hold page
 *   text (0132, `packages/db/src/web-evidence.ts`): each request carries `packet`, whose pages name their text by
 *   `webPageTextRef(pageId, textDigest)`, and `vendorPacketOf`, which puts the texts in for the vendor only. Both are the
 *   one frame (`buildFramedPrompt`, built over the real texts, so the fence is checked against them), with the same
 *   fence and canary. The call port records `packet` and sends `vendorPacketOf(packet)`, for every attempt.
 * - The measure. A call's input tokens are counted by the window wall (`estimateWindowTokens`, UTF-8 bytes / 2), the
 *   project's one conservative count, on the packet as sent. It over-counts English about twice on purpose, so a batch
 *   of "80K" is about 40K real tokens of English and the 100K price line of Haiku is never crossed. A request is also
 *   kept within the call's body cap (the STANDARD tier's 256 KiB, less headroom).
 * - Slips (the owner's recovery order). Code salvages first: an entry naming a page not sent, a page named twice or a
 *   broken entry is dropped, and a non-text extract is dropped. A page a usable reply left out then gets ONE follow-up
 *   call carrying only the pages left out (the smallest follow-up). A reply with nothing usable is refused by the
 *   classifier, so the gateway's own follow-up runs. A pick naming unknown pages is completed by grade, in code.
 * - Nothing here fails the debate: an unavailable call leaves its pages unread, an unavailable pick falls back to the
 *   grades. The port returns UNAVAILABLE for a vendor failure and throws only what must stop the run.
 *
 * The runner passes in the call, so this file holds the rules alone and is tested with scripted calls. Storing the
 * readings, extracts and picks (0132) is the web step's (W3-1), with the results this returns.
 */
import { webPageTextRef } from "@debateai/db";
import { checkVerbatimExtracts, type VerbatimFound } from "@debateai/evidence";
import {
  WEB_PICK_V2_PROMPT_CONTRACT, WEB_PROMPT_LIMITS, WEB_READ_ALL_PROMPT_CONTRACT, webPickCallSiteKey, webPickV2MaterialFields,
  webReadAllCallSiteKey, webReadAllMaterialFields, type WebPage, type WebTopCount
} from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import {
  PREVIEW_REQUEST_BODY_MAX_BYTES, buildFramedPrompt, decodeModelJson, decodedRepairsOf, estimateWindowTokens, parsedWithRepairs,
  rememberingAcceptedReply, type ContentClassification, type FramedMaterialField, type ModelReplyFacts, type PromptPacket
} from "@debateai/providers";

/** The owner's limits (2026-10-30): batches of at most 80K, every Haiku call under 100K; one follow-up round. */
export const WEB_READER_ONE_LIMITS = Object.freeze({
  batchTokensMax: 80_000,
  /** Exclusive: a call is sent only when its input counts fewer tokens than this. */
  callInputTokensBelow: 100_000,
  /** The STANDARD call's body cap less 8 KiB for the body's other members (model, bound, thinking). */
  requestBytesMax: PREVIEW_REQUEST_BODY_MAX_BYTES - 8 * 1024,
  followUpRounds: 1
} as const);
/** Reader 1 and the pick think at the low level (owner, 2026-10-30): their steps are web_reader and web_pick. */
export const WEB_READER_ONE_THINKING = "low" as const;
export const WEB_READER_INPUT_OVER_LIMIT = "WEB_READER_INPUT_OVER_LIMIT" as const;

/** A stored page as reader 1 reads it: its text as stored, and the run's keyed digest of that text. */
export type ReaderOnePage = Readonly<{
  pageId: string; title: string; site: string; date: string | null; text: string; textDigest: Buffer;
}>;

/** One call, as the port sends it: record `packet`, send `vendorPacketOf(packet)` (and so for every repair packet). */
export type ReaderOneCallRequest = Readonly<{
  callSiteKey: string;
  contractId: string;
  packet: PromptPacket;
  /** The packet as sent: page texts put in, then the 100K guard; throws WEB_READER_INPUT_OVER_LIMIT. */
  vendorPacketOf: (packet: PromptPacket) => PromptPacket;
  /** The window count of `vendorPacketOf(packet)`. */
  inputTokens: number;
  thinking: typeof WEB_READER_ONE_THINKING;
  classifyContent: (content: string, reply?: ModelReplyFacts) => ContentClassification;
}>;
export type ReaderOneCallOutcome =
  | Readonly<{ kind: "ANSWERED"; content: string; maker: string; rawArtifactRef: string }>
  | Readonly<{ kind: "UNAVAILABLE" }>;
export type ReaderOneCall = (request: ReaderOneCallRequest) => Promise<ReaderOneCallOutcome>;

export type ReaderOneGrade = 0 | 1 | 2 | 3;
export type ReaderOnePageRead = Readonly<{
  pageId: string; outcome: "READ"; grade: ReaderOneGrade; adds: string;
  /** The passages found word for word, as the PAGE writes them, each once. */
  extracts: readonly VerbatimFound[];
  /** How many copied passages the page does not hold word for word. */
  extractsDropped: number;
  maker: string; rawArtifactRef: string; callSiteKey: string;
}>;
/** TOO_LARGE: alone it would pass a limit, so it was never sent. LEFT_OUT_OF_REPLY: sent twice, answered for neither time. */
export type ReaderOnePageNotRead = Readonly<{
  pageId: string; outcome: "NOT_READ"; reason: "TOO_LARGE" | "CALL_UNAVAILABLE" | "LEFT_OUT_OF_REPLY";
}>;
export type ReaderOnePageResult = ReaderOnePageRead | ReaderOnePageNotRead;
/**
 * How the top was chosen: PICK (the pick call, as it answered); PICK_COMPLETED_BY_GRADE (its usable ids, the rest by
 * grade); GRADE_ORDER (the pick call was unavailable); NO_PICK_NEEDED (top_count or fewer pages help: all of them).
 */
export type ReaderOneTopChosenBy = "PICK" | "PICK_COMPLETED_BY_GRADE" | "GRADE_ORDER" | "NO_PICK_NEEDED";
export type ReaderOneCallRecord = Readonly<{ callSiteKey: string; outcome: "ANSWERED" | "UNAVAILABLE"; pageIds: readonly string[] }>;
export type ReaderOnePathResult = Readonly<{
  answerIndex: number;
  /** One per page, in the order given (the search order). */
  pages: readonly ReaderOnePageResult[];
  /** The top pages, best first: what readers 2 and 3 read. */
  top: readonly string[];
  topChosenBy: ReaderOneTopChosenBy;
  /** Every other page, in the order given: read or not, kept with reader 1's line when it has one. */
  otherPageIds: readonly string[];
  calls: readonly ReaderOneCallRecord[];
}>;

/* ----------------------------------------------------------------- the packets */

type Sendable = Readonly<{ page: ReaderOnePage; promptId: string; ref: string }>;
type Batch = Readonly<{
  items: readonly Sendable[];
  packet: PromptPacket;
  vendorPacketOf: (packet: PromptPacket) => PromptPacket;
  inputTokens: number;
  requestBytes: number;
}>;

/** How a field's content stands inside the material block (`renderMaterialBlock` writes the fields as JSON). */
const asInBlock = (content: string): string => JSON.stringify(content).slice(1, -1);
const pagesField = (fields: readonly FramedMaterialField[]): string => fields.find((field) => field.name === "pages")!.content;

/** The packet with `from` replaced by `to` in its material block, which must hold `from` exactly once. */
function swapped(packet: PromptPacket, from: string, to: string): PromptPacket {
  const block = packet.messages[1];
  const at = block?.role === "user" ? block.content.indexOf(from) : -1;
  if (block === undefined || at < 0 || block.content.indexOf(from, at + 1) >= 0
    || packet.messages.some((message, index) => index !== 1 && message.content.includes(from))) {
    throw new TypedDomainError("WEB_READER_PACKET_NOT_OURS", "The packet does not carry this batch's pages once, in its material block");
  }
  const content = `${block.content.slice(0, at)}${to}${block.content.slice(at + from.length)}`;
  return Object.freeze({ messages: Object.freeze(packet.messages.map((message, index) =>
    index === 1 ? Object.freeze({ role: message.role, content }) : message)) });
}

/** The 100K guard, on a packet as it will be sent. */
function guarded(packet: PromptPacket): PromptPacket {
  if (estimateWindowTokens(packet.messages) >= WEB_READER_ONE_LIMITS.callInputTokensBelow) {
    throw new TypedDomainError(WEB_READER_INPUT_OVER_LIMIT, "A reader call is sent only under 100,000 input tokens");
  }
  return packet;
}

const requestBytesOf = (packet: PromptPacket): number => Buffer.byteLength(JSON.stringify(packet.messages), "utf8");

function buildBatch(input: Readonly<{ question: string; answer: string; siteLanguage: string }>, items: readonly Sendable[]): Batch {
  const asPage = (item: Sendable, text: string): WebPage =>
    ({ pageId: item.promptId, title: item.page.title, site: item.page.site, date: item.page.date, text });
  const common = { question: input.question, answer: input.answer, siteLanguage: input.siteLanguage };
  const withTexts = webReadAllMaterialFields({ ...common, pages: items.map((item) => asPage(item, item.page.text)) });
  const withRefs = webReadAllMaterialFields({ ...common, pages: items.map((item) => asPage(item, item.ref)) });
  const vendorPages = asInBlock(pagesField(withTexts));
  const recordedPages = asInBlock(pagesField(withRefs));
  const vendor = buildFramedPrompt({ contract: WEB_READ_ALL_PROMPT_CONTRACT, material: withTexts }).packet;
  const packet = swapped(vendor, vendorPages, recordedPages);
  return Object.freeze({
    items: Object.freeze([...items]),
    packet,
    // A packet without this batch's pages (another call's, such as a structure repair) carries no page: sent as it is.
    vendorPacketOf: (sent: PromptPacket) =>
      guarded(sent.messages.some((message) => message.content.includes(recordedPages)) ? swapped(sent, recordedPages, vendorPages) : sent),
    inputTokens: estimateWindowTokens(vendor.messages),
    requestBytes: requestBytesOf(vendor)
  });
}

/**
 * The pages in batches, in the order given: a batch grows while it stays within 80K and the body cap; a page that alone
 * passes 80K (but not 100K) goes alone. `tooLarge` are the pages that alone pass 100K or the body cap: never sent.
 */
function planBatches(input: Readonly<{ question: string; answer: string; siteLanguage: string; requestBytesMax: number }>,
  items: readonly Sendable[]): Readonly<{ batches: readonly Batch[]; tooLarge: readonly Sendable[] }> {
  const batches: Batch[] = [];
  const tooLarge: Sendable[] = [];
  const within = (batch: Batch, tokens: number) => batch.inputTokens <= tokens && batch.requestBytes <= input.requestBytesMax;
  let current: Batch | null = null;
  for (const item of items) {
    if (current !== null) {
      const grown = buildBatch(input, [...current.items, item]);
      if (within(grown, WEB_READER_ONE_LIMITS.batchTokensMax)) { current = grown; continue; }
      batches.push(current);
      current = null;
    }
    const alone = buildBatch(input, [item]);
    if (within(alone, WEB_READER_ONE_LIMITS.batchTokensMax)) current = alone;
    else if (within(alone, WEB_READER_ONE_LIMITS.callInputTokensBelow - 1)) batches.push(alone);
    else tooLarge.push(item);
  }
  if (current !== null) batches.push(current);
  return Object.freeze({ batches: Object.freeze(batches), tooLarge: Object.freeze(tooLarge) });
}

/* ----------------------------------------------------------------- the replies */

type ReadEntry = Readonly<{ grade: ReaderOneGrade; adds: string; extracts: readonly string[] }>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
/** One line: every run of spaces and line breaks becomes one space. */
const oneLine = (text: string): string => text.replace(/\s+/gu, " ").trim();

/** Reader 1's usable entries, by prompt id: the first whole entry of each page sent; anything else dropped (salvage). */
function readEntries(value: unknown, promptIds: readonly string[]): ReadonlyMap<string, ReadEntry> {
  const entries = new Map<string, ReadEntry>();
  if (!isRecord(value) || !Array.isArray(value.pages)) return entries;
  const sent = new Set(promptIds);
  for (const entry of value.pages as readonly unknown[]) {
    if (!isRecord(entry) || typeof entry.page_id !== "string" || !sent.has(entry.page_id) || entries.has(entry.page_id)) continue;
    const { grade, adds, extracts } = entry;
    if (typeof grade !== "number" || !Number.isInteger(grade) || grade < 0 || grade > WEB_PROMPT_LIMITS.gradeMax) continue;
    if (typeof adds !== "string" || oneLine(adds) === "") continue;
    if (extracts !== undefined && !Array.isArray(extracts)) continue;
    entries.set(entry.page_id, Object.freeze({
      grade: grade as ReaderOneGrade,
      adds: oneLine(adds),
      extracts: Object.freeze(((extracts ?? []) as readonly unknown[])
        .filter((extract): extract is string => typeof extract === "string" && extract.trim() !== ""))
    }));
  }
  return entries;
}

const refusedSchema = (path: string, code: string): ContentClassification => Object.freeze({
  parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify([{ code: "custom", path: [path], message: code }])
});

/** Reader 1's classifier: a reply with at least one usable entry passes (code salvages the rest); none is refused. */
export function classifyReadAllReply(content: string, promptIds: readonly string[], reply?: ModelReplyFacts): ContentClassification {
  const decoded = decodeModelJson(content, reply);
  if (!decoded.ok) return Object.freeze({ parseStatus: "PARSE_FAILED", parseError: "WEB_READ_ALL_REPLY_NOT_JSON" });
  if (readEntries(decoded.value, promptIds).size === 0) return refusedSchema("pages", "WEB_REPLY_IDS_INCOMPLETE");
  return parsedWithRepairs(decodedRepairsOf(decoded));
}

/** The pick's usable ids: each one shown, once, in reply order. */
function pickedIds(value: unknown, promptIds: readonly string[]): readonly string[] {
  if (!isRecord(value) || !Array.isArray(value.top)) return Object.freeze([]);
  const shown = new Set(promptIds);
  return Object.freeze([...new Set((value.top as readonly unknown[])
    .filter((id): id is string => typeof id === "string" && shown.has(id)))]);
}

/** The pick's classifier: a reply naming at least one page shown passes (code completes it); none is refused. */
export function classifyPickReply(content: string, promptIds: readonly string[], reply?: ModelReplyFacts): ContentClassification {
  const decoded = decodeModelJson(content, reply);
  if (!decoded.ok) return Object.freeze({ parseStatus: "PARSE_FAILED", parseError: "WEB_PICK_REPLY_NOT_JSON" });
  if (pickedIds(decoded.value, promptIds).length === 0) return refusedSchema("top", "WEB_REPLY_IDS_INCOMPLETE");
  return parsedWithRepairs(decodedRepairsOf(decoded));
}

/** One call through the port; on an answer, the value the classifier accepted, read as it read it. */
async function ask(call: ReaderOneCall, request: Omit<ReaderOneCallRequest, "classifyContent" | "thinking">,
  classify: (content: string, reply: ModelReplyFacts | undefined) => ContentClassification):
  Promise<Readonly<{ kind: "ANSWERED"; value: unknown; maker: string; rawArtifactRef: string }> | Readonly<{ kind: "UNAVAILABLE" }>> {
  const remembered = rememberingAcceptedReply(classify);
  const outcome = await call(Object.freeze({ ...request, thinking: WEB_READER_ONE_THINKING, classifyContent: remembered.classifyContent }));
  if (outcome.kind === "UNAVAILABLE") return outcome;
  const decoded = decodeModelJson(outcome.content, remembered.acceptedAs(outcome.content).reply);
  return Object.freeze({ kind: "ANSWERED", value: decoded.ok ? decoded.value : null, maker: outcome.maker, rawArtifactRef: outcome.rawArtifactRef });
}

/* ----------------------------------------------------------------- the step */

const byGrade = (pages: readonly ReaderOnePageRead[]): readonly ReaderOnePageRead[] =>
  pages.map((page, index) => ({ page, index })).sort((a, b) => b.page.grade - a.page.grade || a.index - b.index).map(({ page }) => page);

/** Reader 1 over one path's pages (in search order), then its top pick. */
export async function readAllPages(input: Readonly<{
  answerIndex: number;
  question: string;
  answer: string;
  /** The name of the language the site is shown in: reader 1 writes its lines in it (owner Q8). */
  siteLanguage: string;
  topCount: WebTopCount;
  pages: readonly ReaderOnePage[];
  call: ReaderOneCall;
  /** The call's body cap, less headroom; the STANDARD tier's by default. */
  requestBytesMax?: number;
}>): Promise<ReaderOnePathResult> {
  if (new Set(input.pages.map((page) => page.pageId)).size !== input.pages.length
    || input.pages.some((page) => page.pageId.trim() === "")) {
    throw new TypedDomainError("WEB_READER_PAGES_INVALID", "Each page is given once, by its id");
  }
  // Short prompt ids, by search order: the same on a follow-up and on a resumed run, so replies map back and replay.
  const items: readonly Sendable[] = input.pages.map((page, index) => Object.freeze({
    page, promptId: `p${String(index + 1)}`, ref: webPageTextRef(page.pageId, page.textDigest)
  }));
  const shape = { question: input.question, answer: input.answer, siteLanguage: input.siteLanguage,
    requestBytesMax: input.requestBytesMax ?? WEB_READER_ONE_LIMITS.requestBytesMax };
  const results = new Map<string, ReaderOnePageResult>();
  const calls: ReaderOneCallRecord[] = [];

  let plan = planBatches(shape, items);
  let nextIndex = 0;
  for (let round = 0; round <= WEB_READER_ONE_LIMITS.followUpRounds; round += 1) {
    for (const item of plan.tooLarge) {
      results.set(item.page.pageId, Object.freeze({ pageId: item.page.pageId, outcome: "NOT_READ", reason: "TOO_LARGE" }));
    }
    if (plan.batches.length === 0) break;
    const lastRound = round === WEB_READER_ONE_LIMITS.followUpRounds;
    const keyed = plan.batches.map((batch) => ({ batch, callSiteKey: webReadAllCallSiteKey(input.answerIndex, nextIndex++) }));
    const answers = await Promise.all(keyed.map(({ batch, callSiteKey }) => {
      const promptIds = batch.items.map((item) => item.promptId);
      return ask(input.call, { callSiteKey, contractId: WEB_READ_ALL_PROMPT_CONTRACT.contractId, packet: batch.packet,
        vendorPacketOf: batch.vendorPacketOf, inputTokens: batch.inputTokens },
      (content, reply) => classifyReadAllReply(content, promptIds, reply));
    }));
    const leftOut: Sendable[] = [];
    keyed.forEach(({ batch, callSiteKey }, at) => {
      const answer = answers[at]!;
      calls.push(Object.freeze({ callSiteKey, outcome: answer.kind, pageIds: Object.freeze(batch.items.map((item) => item.page.pageId)) }));
      if (answer.kind === "UNAVAILABLE") {
        for (const item of batch.items) results.set(item.page.pageId, Object.freeze({ pageId: item.page.pageId, outcome: "NOT_READ", reason: "CALL_UNAVAILABLE" }));
        return;
      }
      const entries = readEntries(answer.value, batch.items.map((item) => item.promptId));
      for (const item of batch.items) {
        const entry = entries.get(item.promptId);
        if (entry === undefined) {
          if (lastRound) results.set(item.page.pageId, Object.freeze({ pageId: item.page.pageId, outcome: "NOT_READ", reason: "LEFT_OUT_OF_REPLY" }));
          else leftOut.push(item);
          continue;
        }
        const checked = checkVerbatimExtracts(item.page.text, entry.extracts);
        results.set(item.page.pageId, Object.freeze({
          pageId: item.page.pageId, outcome: "READ", grade: entry.grade, adds: entry.adds,
          extracts: checked.kept, extractsDropped: checked.dropped.length,
          maker: answer.maker, rawArtifactRef: answer.rawArtifactRef, callSiteKey
        }));
      }
    });
    // A page left out is sent again in a follow-up carrying only the pages left out, in search order.
    const order = new Map(items.map((item, index) => [item.page.pageId, index]));
    plan = planBatches(shape, [...leftOut].sort((a, b) => order.get(a.page.pageId)! - order.get(b.page.pageId)!));
  }

  const pages = Object.freeze(input.pages.map((page) => results.get(page.pageId)!));
  // Only a page that helps (grade 1 or more) can be a top page; readers 2 and 3 never spend on a grade 0.
  const helpful = pages.filter((page): page is ReaderOnePageRead => page.outcome === "READ" && page.grade > 0);
  let top: readonly string[];
  let topChosenBy: ReaderOneTopChosenBy;
  if (helpful.length <= input.topCount) {
    top = byGrade(helpful).map((page) => page.pageId);
    topChosenBy = "NO_PICK_NEEDED";
  } else {
    const promptIdOf = new Map(items.map((item) => [item.page.pageId, item.promptId]));
    const pageIdOf = new Map(items.map((item) => [item.promptId, item.page.pageId]));
    const shown = helpful.map((page) => promptIdOf.get(page.pageId)!);
    const titled = new Map(input.pages.map((page) => [page.pageId, page]));
    const material = webPickV2MaterialFields({ question: input.question, answer: input.answer, topCount: input.topCount,
      pages: helpful.map((page) => ({ pageId: promptIdOf.get(page.pageId)!, title: titled.get(page.pageId)!.title,
        site: titled.get(page.pageId)!.site, grade: page.grade, adds: page.adds })) });
    const packet = buildFramedPrompt({ contract: WEB_PICK_V2_PROMPT_CONTRACT, material }).packet;
    const callSiteKey = webPickCallSiteKey(input.answerIndex);
    const answer = await ask(input.call, { callSiteKey, contractId: WEB_PICK_V2_PROMPT_CONTRACT.contractId, packet,
      vendorPacketOf: (sent) => guarded(sent), inputTokens: estimateWindowTokens(packet.messages) },
    (content, reply) => classifyPickReply(content, shown, reply));
    calls.push(Object.freeze({ callSiteKey, outcome: answer.kind, pageIds: Object.freeze(helpful.map((page) => page.pageId)) }));
    const picked = answer.kind === "ANSWERED" ? pickedIds(answer.value, shown).slice(0, input.topCount).map((id) => pageIdOf.get(id)!) : [];
    const rest = byGrade(helpful).map((page) => page.pageId).filter((id) => !picked.includes(id));
    top = [...picked, ...rest].slice(0, input.topCount);
    topChosenBy = answer.kind === "UNAVAILABLE" ? "GRADE_ORDER" : picked.length === input.topCount ? "PICK" : "PICK_COMPLETED_BY_GRADE";
  }
  return Object.freeze({
    answerIndex: input.answerIndex,
    pages,
    top: Object.freeze([...top]),
    topChosenBy,
    otherPageIds: Object.freeze(input.pages.map((page) => page.pageId).filter((id) => !top.includes(id))),
    calls: Object.freeze(calls)
  });
}
