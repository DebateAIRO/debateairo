// apps/runner/src/web-step.ts
/**
 * WEB SEARCH: THE WEB STEP AT THE START OF A DEBATE (Perplexity plan 2026-10-30, task W3-1; design PERPLEXITY-DESIGN.md
 * v2 §3; the owner's answers of 2026-10-29/30, and the money rule of 31 Oct, override the plan).
 *
 * Plain words: once the map's answer check has fixed the paths, and before root 0 is argued, this step looks things up
 * on the web for the paths that need it: the planner (W2-3) decides per path and writes the searches, Perplexity runs
 * them (W2-1), reader 1 reads every page it found and picks the top pages (W2-4), readers 2 and 3 read those again
 * (W2-5), and code keeps each path's checked extracts as its PACK, which the arguing calls read (W4-1).
 *
 * The rules it keeps:
 * - Everything at once (owner, 31 Oct): every path, every search of a path and every reader call starts together; the
 *   debate's call lane holds them to its limits (3 at a time per AI). Never path by path.
 * - Free never searches, and the web setting can be off: then NO call is made, nothing is charged, and each path's
 *   decision (NOT_ON_PLAN, SWITCHED_OFF) is recorded. The planner's per-path decision (`webPlanPathStatuses`) is written
 *   once, before any search, through `recordPlanPathStatuses` (0134's identity.web_plan_path, W3-6). A planned map opens
 *   the run's key first, so each NO_SEARCH_PLANNED reason (model text) is sealed under it, never kept in the clear.
 * - Store first: a search's row is written as soon as it answers, and a path's pages (with their texts, sealed under the
 *   run's key) before any reader call of that path. A run claimed again finds its stored searches and pages, never
 *   searches again, reads the same pages in the same order and so sends byte-identical prompts, which the replay book
 *   answers for free (run-replay.ts): no reader is paid twice.
 * - Page texts never enter a call record (owner Q4, W3-0): every reader prompt names its pages by `webPageTextRef`, and
 *   only the vendor gets the texts (`vendorPacketOf`). A path read back from the store rebuilds the sent form from the
 *   store itself (`storedWebPageTextsSentForm`, the real decrypt under the run's lease, digests checked).
 * - Nothing here stops the debate: a gate that is down, a planner that plans none or fails, a search that fails, a
 *   reader that fails or a store write refused leave that path without the web, with its mark. Failed searches cost
 *   nothing. Only an error `abandon` names (the run must stop) passes through, after every path has settled.
 * - Money: no new wall. Searches are charged through W2-2's search seam, and every AI call through the run's own seam,
 *   each keeping root 0's room (`keepRoomMicros`).
 *
 * The step's ids (searches, pages, readings, extracts, packs) are worked out by code from the run's id and the frozen
 * plan, so a second copy of the run writes the same rows (ALREADY) instead of new ones.
 */
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import {
  PostgresWebEvidenceRepository, WEB_EVIDENCE_CARRIERS, WEB_PLAN_CARRIER, decryptLeasedContentForRun, encryptAttestedLeasedContentForRun,
  prepareLeasedContentEncryptionForRun, type CryptoEnvelope, type WebEvidenceRead, type WebPlanPathRecord, type WebSealed
} from "@debateai/db";
import { findVerbatim, selectPathPages, siteOf, type FrozenWebSearch } from "@debateai/evidence";
import {
  WEB_TOP_COUNT_BY_MODE, type WebMode, type WebPlannerPoint
} from "@debateai/judgement";
import { TypedDomainError, type QuestionLanguage } from "@debateai/kernel";
import {
  buildFramedPrompt, packetWithPageTexts, type CallBound, type FramedMaterialField, type PerplexityPage,
  type PerplexitySearchPort, type PerplexitySearchRequest, type PromptContract, type PromptPacket, type ProviderGateway
} from "@debateai/providers";
import type { WebSearchCostSeam } from "@debateai/budget";
import type { PlanId } from "@debateai/register";
import { laneSearchPort } from "./call-lane-gateway.js";
import type { CallScheduler, CallSubject, DebateCallLane } from "./call-scheduler.js";
import { runWebPageTextDigest, storedWebPageTextsSentForm, type WebPageTextDigestKey } from "./web-page-text-gateway.js";
import { planWebSearches, webPlannerSeats, webPlanPathStatuses, type WebPlanOutcome, type WebPlanPathStatus } from "./web-planner.js";
import { WEB_READER_ONE_LIMITS, readAllPages, type ReaderOneCall, type ReaderOnePage, type ReaderOnePageRead } from "./web-reader-all.js";
import { runWebTopReaders, webMaterialWithPageTexts, type WebTopReaderCall, type WebTopReadersResult } from "./web-readers-top.js";

/* ----------------------------------------------------------------- who reads */

/** Reader 1 (owner, 30 Oct): Claude Haiku, the cheapest reader and the best at copying word for word. */
export const WEB_READER_ONE_MODEL = "claude-haiku-5-5" as const;
/** Readers 2 and 3, in the line-up's order (owner Q11): DeepSeek and GLM, Qwen as the other choice. */
export const WEB_TOP_READER_MODEL_ORDER = Object.freeze([
  "deepseek-ai/DeepSeek-V4.1-Flash", "zai-org/GLM-5.3-Flash", "Qwen/Qwen3.8-Flash"
] as const);
/** The most extracts one pack names (0132's `extract_labels` limit). */
export const WEB_PACK_EXTRACTS_MAX = 64 as const;

/* ----------------------------------------------------------------- the shapes */

/** One AI the run may call: its gateway (through the debate's lane), its ref, its maker and its model. */
export type WebStepMember = Readonly<{ provider: ProviderGateway; providerRef: string; maker: string; model: string }>;
/** One fixed path of the map: its ref (the map's answer id, what 0132's `path_ref` and the plan's `pathId` hold). */
export type WebStepPath = Readonly<{
  pathRef: string; answer: string; forPoints: readonly WebPlannerPoint[]; againstPoints: readonly WebPlannerPoint[];
}>;
/** 0132's writers and readers the step uses (`PostgresWebEvidenceRepository`). */
export type WebStepStore = Pick<PostgresWebEvidenceRepository,
  "recordSearch" | "recordPage" | "recordReading" | "recordExtract" | "recordPicks" | "recordPack" | "read" | "readPageTexts">;
type WebCarrier = typeof WEB_EVIDENCE_CARRIERS[keyof typeof WEB_EVIDENCE_CARRIERS] | typeof WEB_PLAN_CARRIER;
/** The run's key, as the step uses it: seal a value for a carrier and primary key, open one, and the digest secret. */
export type WebStepCipher = Readonly<{
  seal: (carrier: WebCarrier, primaryKey: string, value: unknown) => WebSealed;
  open: (carrier: WebCarrier, primaryKey: string, envelope: CryptoEnvelope) => unknown;
  lease: WebPageTextDigestKey;
}>;
/** What the step stores into, opened only once the planner planned a search (Free and the off switch touch nothing). */
export type WebStepPorts = Readonly<{ store: WebStepStore; cipher: WebStepCipher; close: () => Promise<void> }>;
/**
 * The planner's per-path decision, stored so the page can say "no search planned, because …" (serve W3-3). Written once,
 * before any search; a run claimed again writes the same decision again, which the store answers as already there.
 * `cipher` is the run's key under the step's own lease (`prepare`), or null when none was opened (Free, the setting off,
 * a failed planner: no reason to seal) or it could not be (then a NO_SEARCH_PLANNED reason cannot be kept).
 */
export type RecordPlanPathStatuses = (runId: string, statuses: readonly WebPlanPathStatus[],
  cipher: Pick<WebStepCipher, "seal"> | null) => Promise<void>;

export type WebStepInput = Readonly<{
  runId: string;
  /** The claimed work item: the replay book is read by it, so a re-claim of the same item replays these calls. */
  subjectItemId: string;
  /** The run's plan as billing pinned it; null when none is known (local mode, a team grant): no search. */
  planId: PlanId | null;
  webSwitchedOn: boolean;
  mode: WebMode;
  question: string;
  questionLanguage: QuestionLanguage | null;
  placeCountry: string | null;
  asOf: Date;
  /** The language reader 1 writes its lines in (owner Q8): its code (stored beside the line) and its name (the prompt). */
  siteLanguage: Readonly<{ code: string; name: string }>;
  paths: readonly WebStepPath[];
  members: readonly WebStepMember[];
  /** `engineContractHash()`, the seal that covers the web contracts. */
  contractHash: string;
  bound: CallBound;
  /** Root 0's room, which no web call and no search may cut into. */
  keepRoomMicros?: number;
  search: PerplexitySearchPort;
  /** A fresh money seam for one search (W2-2), or null where nothing is charged (local mode). */
  searchSeam: (() => WebSearchCostSeam) | null;
  recordPlanPathStatuses: RecordPlanPathStatuses;
  prepare: () => Promise<WebStepPorts>;
  /** An error the run must stop for (rethrown once every path has settled). */
  abandon?: (error: unknown) => boolean;
  /** A planner error after which no backup is tried (a money stop). */
  stopsHere?: (error: unknown) => boolean;
  log?: (event: string, detail: Readonly<Record<string, unknown>>) => void;
}>;

/** A path's web status, the contract's words (WEB_SEARCH_STATUSES). */
export type WebStepPathStatus = "SEARCHED" | "NO_SEARCH_PLANNED" | "FAILED" | "NOT_ON_PLAN" | "SWITCHED_OFF";
export type WebStepPathOutcome = Readonly<{
  pathRef: string;
  status: WebStepPathStatus;
  /** Why it failed, or what went missing on a path that searched (codes only); null when all went as planned. */
  code: string | null;
  /** The searches this path sent now (0 for a path read back from the store or one with nothing to send). */
  searchesSent: number;
  /** Its pages, in reading order (search order, then Perplexity's rank). */
  pageIds: readonly string[];
  /** Its top pages, best first. */
  top: readonly string[];
  /** Its pack's id and extract ids (`S<path>-<n>`), or null and none when it kept no pack. */
  packId: string | null;
  extractLabels: readonly string[];
}>;
export type WebStepResult = Readonly<{ plan: WebPlanOutcome["kind"] | "NO_PATHS"; paths: readonly WebStepPathOutcome[] }>;

/* ----------------------------------------------------------------- ids, words and small helpers */

/** A uuid worked out by code from the run and the row's own key, so every copy of the run names a row the same way. */
export function webStepRowId(runId: string, kind: string, ...parts: readonly string[]): string {
  const hex = createHash("sha256").update(["debateai:web-step:row-id:v1", runId, kind, ...parts].join("\0"), "utf8").digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** 0132's maker shape (lower case letters, digits, dots and dashes): "Z.AI" is `z.ai`, "DeepSeek" is `deepseek`. */
export function webMakerSlug(maker: string): string {
  const slug = maker.toLowerCase().replace(/[^a-z0-9.-]+/gu, "-").replace(/^[^a-z0-9]+/u, "").slice(0, 40);
  return slug === "" ? "unknown" : slug;
}

const LOOK_BACK = Object.freeze({ FAST: "12m", NORMAL: "3y", SLOW: "none" } as const);
const STORED_DEPTH = Object.freeze({ WHOLE: "whole", PREVIEW_ONLY: "preview", ABSTRACT_ONLY: "abstract" } as const);
const codeOf = (error: unknown): string => error instanceof TypedDomainError ? error.code : "UNTYPED";
const defaultLog = (event: string, detail: Readonly<Record<string, unknown>>): void => {
  console.warn(JSON.stringify({ kind: "DEBATEAI_WEB_STEP", event, ...detail }));
};

/** A writer's answer: RECORDED and ALREADY go on; NOT_LIVE (the debate is gone) and any refusal end the path. */
function written(outcome: string): void {
  if (outcome === "RECORDED" || outcome === "ALREADY") return;
  throw new TypedDomainError(outcome === "NOT_LIVE" ? "WEB_EVIDENCE_NOT_LIVE" : `WEB_EVIDENCE_${outcome}`, "The web store refused a row");
}

/** How a field's content stands inside the material block (the block writes the fields as JSON). */
const asInBlock = (content: string): string => JSON.stringify(content).slice(1, -1);
const pagesField = (fields: readonly FramedMaterialField[]): string => fields.find((field) => field.name === "pages")!.content;

/**
 * Readers 2 and 3's recorded packet: framed over the real texts (so the fence is checked against them, as reader 1's
 * is), then the pages field put back to its references. Only the material block changes; the vendor's form is
 * `packetWithPageTexts(recorded, pageTexts)`, the same bytes as the frame built over the texts.
 */
export function webTopRecordedPacket(contract: PromptContract, material: readonly FramedMaterialField[],
  pageTexts: ReadonlyMap<string, string>): PromptPacket {
  const withTexts = webMaterialWithPageTexts(material, pageTexts);
  const vendor = buildFramedPrompt({ contract, material: withTexts }).packet;
  const from = asInBlock(pagesField(withTexts));
  const to = asInBlock(pagesField(material));
  const block = vendor.messages[1];
  const at = block?.role === "user" ? block.content.indexOf(from) : -1;
  if (block === undefined || at < 0 || block.content.indexOf(from, at + 1) >= 0) {
    throw new TypedDomainError("WEB_READER_PACKET_NOT_OURS", "The packet does not carry the pages once, in its material block");
  }
  const content = `${block.content.slice(0, at)}${to}${block.content.slice(at + from.length)}`;
  return Object.freeze({ messages: Object.freeze(vendor.messages.map((message, index) =>
    index === 1 ? Object.freeze({ role: message.role, content }) : message)) });
}

/* ----------------------------------------------------------------- one path's pages */

type StepPage = Readonly<{
  pageId: string; searchId: string; searchOrder: number; rank: number; url: string; site: string; title: string | null;
  date: string | null; readDepth: "whole" | "preview" | "abstract"; text: string; textDigest: Buffer;
}>;
type SearchDone = Readonly<{
  searchId: string; order: number; answered: boolean; failure: string | null; sent: boolean;
  /** Fresh pages (this copy's search), before the path's own page rules. */
  found: readonly PerplexityPage[];
}>;

/** A stored page's sealed `about`, read back (`{url, site, title, date}`, serve W3-3's shape). */
function aboutOf(value: unknown): Readonly<{ url: string; site: string; title: string | null; date: string | null }> | null {
  if (typeof value !== "object" || value === null) return null;
  const about = value as Record<string, unknown>;
  if (typeof about.url !== "string" || typeof about.site !== "string") return null;
  return { url: about.url, site: about.site, title: typeof about.title === "string" ? about.title : null,
    date: typeof about.date === "string" ? about.date : null };
}

/* ----------------------------------------------------------------- the step */

/**
 * The web step. Never throws for anything a search, a reader or the store did: each path ends with its status. Throws
 * only an error `abandon` names (after every path has settled), or a wiring defect in its input.
 */
export async function runWebStep(input: WebStepInput): Promise<WebStepResult> {
  const log = input.log ?? defaultLog;
  if (input.paths.length === 0) return Object.freeze({ plan: "NO_PATHS", paths: Object.freeze([]) });
  const pathRefs = input.paths.map((path) => path.pathRef);
  const keepRoom = input.keepRoomMicros !== undefined && input.keepRoomMicros > 0 ? { keepRoomMicros: input.keepRoomMicros } : {};

  const plan = await planWebSearches({
    planId: input.planId ?? "FREE", webSwitchedOn: input.webSwitchedOn, mode: input.mode, runId: input.runId,
    subjectItemId: input.subjectItemId, question: input.question, questionLanguage: input.questionLanguage,
    placeCountry: input.placeCountry, asOf: input.asOf,
    paths: input.paths.map((path) => ({ pathId: path.pathRef, answer: path.answer, forPoints: path.forPoints, againstPoints: path.againstPoints })),
    seats: webPlannerSeats(input.members), contractHash: input.contractHash, bound: input.bound, ...keepRoom,
    ...(input.abandon === undefined ? {} : { abandon: input.abandon }),
    ...(input.stopsHere === undefined ? {} : { stopsHere: input.stopsHere })
  });
  const statuses = webPlanPathStatuses(plan, pathRefs);
  // The decision, once, before any search. A failure to keep it (NOT_LIVE included, WEB_EVIDENCE_NOT_LIVE) is logged:
  // the debate goes on, the web too.
  const keepDecision = async (cipher: WebStepCipher | null): Promise<void> => {
    try {
      await input.recordPlanPathStatuses(input.runId, statuses, cipher);
    } catch (error) {
      if (input.abandon?.(error) === true) throw error;
      log("WEB_PLAN_STATUS_NOT_RECORDED", { runId: input.runId, code: codeOf(error) });
    }
  };
  const bare = (pathRef: string, status: WebStepPathStatus, code: string | null): WebStepPathOutcome => Object.freeze({
    pathRef, status, code, searchesSent: 0, pageIds: Object.freeze([]), top: Object.freeze([]), packId: null, extractLabels: Object.freeze([])
  });
  if (plan.kind !== "PLANNED") {
    // Free, the setting off, or no planner answered: no reason to seal, so no key is opened.
    await keepDecision(null);
    log("WEB_STEP_NO_SEARCH", { runId: input.runId, plan: plan.kind, ...(plan.kind === "FAILED" ? { code: plan.code } : {}) });
    return Object.freeze({ plan: plan.kind, paths: Object.freeze(statuses.map((entry) =>
      bare(entry.pathId, entry.status === "PLANNED" ? "FAILED" : entry.status, plan.kind === "FAILED" ? plan.code : null))) });
  }

  // Only now is anything opened: the store, and the run's key under its lease (a reason to seal, or searches to send).
  let ports: WebStepPorts;
  let stored: WebEvidenceRead | null;
  try {
    ports = await input.prepare();
  } catch (error) {
    if (input.abandon?.(error) === true) throw error;
    log("WEB_STEP_UNAVAILABLE", { runId: input.runId, code: codeOf(error) });
    // Without the key no reason can be sealed: a map with one keeps no decision (WEB_PLAN_REASON_UNSEALED, logged).
    await keepDecision(null);
    return Object.freeze({ plan: plan.kind, paths: Object.freeze(statuses.map((entry) =>
      entry.status === "PLANNED" ? bare(entry.pathId, "FAILED", codeOf(error)) : bare(entry.pathId, "NO_SEARCH_PLANNED", null))) });
  }
  try {
    await keepDecision(ports.cipher);
    if (!statuses.some((entry) => entry.status === "PLANNED")) {
      return Object.freeze({ plan: plan.kind, paths: Object.freeze(statuses.map((entry) => bare(entry.pathId, "NO_SEARCH_PLANNED", null))) });
    }
    try {
      stored = await ports.store.read(input.runId);
    } catch (error) {
      if (input.abandon?.(error) === true) throw error;
      stored = null;
      log("WEB_EVIDENCE_UNREADABLE", { runId: input.runId, code: codeOf(error) });
      return Object.freeze({ plan: plan.kind, paths: Object.freeze(statuses.map((entry) =>
        entry.status === "PLANNED" ? bare(entry.pathId, "FAILED", "WEB_EVIDENCE_UNREADABLE") : bare(entry.pathId, "NO_SEARCH_PLANNED", null))) });
    }
    if (stored === null) {
      return Object.freeze({ plan: plan.kind, paths: Object.freeze(statuses.map((entry) =>
        entry.status === "PLANNED" ? bare(entry.pathId, "FAILED", "WEB_EVIDENCE_NOT_LIVE") : bare(entry.pathId, "NO_SEARCH_PLANNED", null))) });
    }
    const evidence = stored;
    const readerOne = input.members.find((member) => member.model === WEB_READER_ONE_MODEL) ?? null;
    const topMembers = WEB_TOP_READER_MODEL_ORDER.flatMap((model) => input.members.filter((member) => member.model === model).slice(0, 1));
    const settled = await Promise.allSettled(input.paths.map((path, index) =>
      statuses[index]!.status !== "PLANNED" ? Promise.resolve(bare(path.pathRef, "NO_SEARCH_PLANNED", null))
        : runPath({ input, ports, evidence, plan, path, index, readerOne, topMembers, keepRoom, log })));
    const abandoned = settled.find((entry): entry is PromiseRejectedResult =>
      entry.status === "rejected" && input.abandon?.(entry.reason) === true);
    if (abandoned !== undefined) throw abandoned.reason;
    const paths = settled.map((entry, index) => {
      if (entry.status === "fulfilled") return entry.value;
      log("WEB_PATH_FAILED", { runId: input.runId, path: index, code: codeOf(entry.reason) });
      return bare(input.paths[index]!.pathRef, "FAILED", codeOf(entry.reason));
    });
    return Object.freeze({ plan: plan.kind, paths: Object.freeze(paths) });
  } finally {
    await ports.close().catch(() => undefined);
  }
}

type PathContext = Readonly<{
  input: WebStepInput;
  ports: WebStepPorts;
  evidence: WebEvidenceRead;
  plan: Extract<WebPlanOutcome, { kind: "PLANNED" }>;
  path: WebStepPath;
  index: number;
  readerOne: WebStepMember | null;
  topMembers: readonly WebStepMember[];
  keepRoom: Readonly<{ keepRoomMicros?: number }>;
  log: (event: string, detail: Readonly<Record<string, unknown>>) => void;
}>;

/** One path, from its searches to its pack. Throws only for what ends the path (the caller marks it FAILED). */
async function runPath(context: PathContext): Promise<WebStepPathOutcome> {
  const { input, ports, evidence, plan, path, index, log } = context;
  const { store, cipher } = ports;
  const runId = input.runId;
  const frozenPath = plan.querySet.paths.find((entry) => entry.pathId === path.pathRef)!;
  const lookBack = frozenPath.pace === null ? "none" : LOOK_BACK[frozenPath.pace];
  const searches = plan.querySet.searches.filter((search) => search.pathId === path.pathRef);
  const storedSearches = new Map(evidence.searches.map((search) => [search.search_id, search]));

  const searchRow = async (search: FrozenWebSearch, searchId: string, outcome: "FOUND" | "EMPTY" | "FAILED" | "REFUSED",
    chargeMicros: number, resultCount: number): Promise<boolean> => {
    // A local search that found no country to search in cannot be a row (0132: a local search names its country).
    if (search.language === null || (search.scope === "LOCAL" && search.country === null)) return false;
    written(await store.recordSearch({
      runId, searchId, pathRef: path.pathRef, side: search.polarity === "SUPPORTING" ? "for" : "against",
      languageKind: search.scope === "ENGLISH" ? "english" : "local", language: search.language, country: search.country,
      lookBack, outcome, chargeMicros, resultCount: outcome === "FOUND" ? resultCount : 0,
      words: outcome === "REFUSED" || search.text === null ? null : cipher.seal(WEB_EVIDENCE_CARRIERS.search, searchId, { query: search.text })
    }));
    return true;
  };

  /** One search: read back when this run stored it already, else sent now (charged only when answered), then its row. */
  const searchOnce = async (search: FrozenWebSearch, order: number): Promise<SearchDone> => {
    const searchId = webStepRowId(runId, "search", search.searchId);
    const kept = storedSearches.get(searchId);
    if (kept !== undefined) {
      const answered = kept.outcome === "FOUND" || kept.outcome === "EMPTY";
      return { searchId, order, answered, failure: answered ? null : `WEB_SEARCH_${kept.outcome}`, sent: false, found: [] };
    }
    if (search.status === "HELD") {
      await searchRow(search, searchId, "REFUSED", 0, 0);
      return { searchId, order, answered: false, failure: "WEB_SEARCH_HELD", sent: false, found: [] };
    }
    const seam = input.searchSeam?.() ?? null;
    let admission: Awaited<ReturnType<WebSearchCostSeam["assertSearchAllowed"]>>;
    try {
      admission = await seam?.assertSearchAllowed(context.keepRoom);
    } catch (error) {
      if (input.abandon?.(error) === true) throw error;
      seam?.releaseInFlight();
      // Refused before sending (money): never sent, costs nothing; not stored, so a later copy may still send it.
      return { searchId, order, answered: false, failure: codeOf(error), sent: false, found: [] };
    }
    const request: PerplexitySearchRequest = Object.freeze({
      query: search.text!, mode: "START", afterDate: search.afterDate, language: search.language, country: search.country
    });
    const outcome = await input.search.search(request);
    const answered = outcome.outcome === "FOUND" || outcome.outcome === "EMPTY";
    try {
      await seam?.recordSearch({ outcome: answered ? "SUCCEEDED" : "FAILED", ...(admission === undefined ? {} : { admission }) });
    } catch (error) {
      if (input.abandon?.(error) === true) throw error;
      log("WEB_SEARCH_CHARGE_NOT_RECORDED", { runId, path: index, code: codeOf(error) });
    } finally {
      seam?.releaseInFlight();
    }
    await searchRow(search, searchId, outcome.outcome, outcome.chargeMicros, outcome.resultCount);
    return {
      searchId, order, answered, sent: true,
      failure: outcome.outcome === "FAILED" ? `WEB_SEARCH_${outcome.failure}` : outcome.outcome === "REFUSED" ? `WEB_SEARCH_${outcome.refusal}` : null,
      found: answered ? [...outcome.pages, ...outcome.reused] : []
    };
  };

  const done = await Promise.all(searches.map((search, order) => searchOnce(search, order)));
  const orderOf = new Map(done.map((entry) => [entry.searchId, entry.order]));

  // The pages stored by an earlier copy of this run, read back with their texts, in reading order.
  const keptPages = evidence.pages.filter((page) => orderOf.has(page.search_id));
  const resumed = keptPages.length > 0;
  const pages: StepPage[] = [];
  if (resumed) {
    const live = keptPages.filter((page) => page.text_state === "STORED").map((page) => page.page_id);
    const texts = new Map<string, Readonly<{ text: string; textDigest: Buffer }>>();
    for (let from = 0; from < live.length; from += 64) {
      for (const row of await store.readPageTexts(runId, live.slice(from, from + 64))) {
        const text = cipher.open(WEB_EVIDENCE_CARRIERS.pageText, row.pageId, row.envelope);
        if (typeof text === "string") texts.set(row.pageId, { text, textDigest: row.textDigest });
      }
    }
    for (const page of keptPages) {
      const text = texts.get(page.page_id);
      const about = aboutOf(cipher.open(WEB_EVIDENCE_CARRIERS.page, page.page_id, page.content));
      if (text === undefined || about === null) continue;
      pages.push(Object.freeze({ pageId: page.page_id, searchId: page.search_id, searchOrder: orderOf.get(page.search_id)!,
        rank: page.rank, ...about, readDepth: page.read_depth as StepPage["readDepth"], text: text.text, textDigest: text.textDigest }));
    }
  }
  // The pages found now: the path's page rules across its searches (one page per site, each address once), then stored,
  // every one, before any reader call.
  const fresh = done.flatMap((entry) => entry.found.map((page) => ({ ...page, searchId: entry.searchId, order: entry.order })))
    .sort((a, b) => a.order - b.order || a.rank - b.rank);
  const takenSites = new Set(pages.map((page) => page.site));
  const chosen = selectPathPages(fresh, new Set()).read.filter((page) => { const site = siteOf(page.url); return site !== null && !takenSites.has(site); });
  for (const page of chosen) {
    const pageId = webStepRowId(runId, "page", page.searchId, String(page.rank));
    const site = siteOf(page.url)!;
    const textDigest = runWebPageTextDigest(cipher.lease, pageId, page.text);
    const about = { url: page.url, site, title: page.title, date: page.date };
    written(await store.recordPage({
      runId, pageId, searchId: page.searchId, rank: page.rank, readDepth: STORED_DEPTH[page.readDepth],
      about: cipher.seal(WEB_EVIDENCE_CARRIERS.page, pageId, about),
      text: { chars: page.text.length, digest: textDigest, sealed: cipher.seal(WEB_EVIDENCE_CARRIERS.pageText, pageId, page.text) }
    }));
    pages.push(Object.freeze({ pageId, searchId: page.searchId, searchOrder: page.order, rank: page.rank, ...about,
      readDepth: STORED_DEPTH[page.readDepth], text: page.text, textDigest }));
  }
  pages.sort((a, b) => a.searchOrder - b.searchOrder || a.rank - b.rank);

  const answeredAny = done.some((entry) => entry.answered);
  const searchesSent = done.filter((entry) => entry.sent).length;
  const firstFailure = done.find((entry) => entry.failure !== null)?.failure ?? null;
  const outcome = (code: string | null, top: readonly string[] = [], packId: string | null = null, labels: readonly string[] = []) =>
    Object.freeze({ pathRef: path.pathRef, status: answeredAny ? "SEARCHED" as const : "FAILED" as const,
      code: answeredAny ? code : firstFailure ?? code, searchesSent, pageIds: Object.freeze(pages.map((page) => page.pageId)),
      top: Object.freeze([...top]), packId, extractLabels: Object.freeze([...labels]) });
  if (!answeredAny) return outcome(firstFailure);
  if (pages.length === 0) return outcome(null);
  if (context.readerOne === null) return outcome("WEB_READER_ONE_NO_SEAT");

  // A path read back from the store sends its texts as the store holds them (the real decrypt, the digests checked).
  const fromStore = resumed
    ? storedWebPageTextsSentForm({ runId, store, openText: (pageId, envelope) => {
      const text = cipher.open(WEB_EVIDENCE_CARRIERS.pageText, pageId, envelope);
      if (typeof text !== "string") throw new TypedDomainError("WEB_PAGE_TEXT_UNREADABLE", "A stored page text does not read");
      return text;
    }, lease: cipher.lease })
    : null;
  const call = callShape(input, context.keepRoom);

  // Reader 1 and its pick.
  const readerOne = context.readerOne;
  const readerOneCall: ReaderOneCall = async (request) => {
    try {
      const result = await readerOne.provider.call({ ...call, callSiteKey: request.callSiteKey, providerRef: readerOne.providerRef,
        packet: request.packet, vendorPacketOf: fromStore ?? request.vendorPacketOf,
        sentInputTokensBelow: WEB_READER_ONE_LIMITS.callInputTokensBelow, classifyContent: request.classifyContent });
      return { kind: "ANSWERED", content: result.content, maker: result.maker, rawArtifactRef: result.rawArtifactRef };
    } catch (error) {
      if (input.abandon?.(error) === true) throw error;
      log("WEB_READER_CALL_UNAVAILABLE", { runId, path: index, callSiteKey: request.callSiteKey, code: codeOf(error) });
      return { kind: "UNAVAILABLE" };
    }
  };
  const asReaderPage = (page: StepPage): ReaderOnePage => Object.freeze({ pageId: page.pageId, title: page.title ?? page.site,
    site: page.site, date: page.date, text: page.text, textDigest: page.textDigest });
  const read = await readAllPages({ answerIndex: index, question: input.question, answer: path.answer,
    siteLanguage: input.siteLanguage.name, topCount: WEB_TOP_COUNT_BY_MODE[input.mode], pages: pages.map(asReaderPage), call: readerOneCall });
  const pageOf = new Map(pages.map((page) => [page.pageId, page]));

  // Readers 2 and 3 on the top pages.
  const topCall: WebTopReaderCall = async (request) => {
    const member = context.topMembers.find((entry) => entry.providerRef === request.seat.providerRef)!;
    try {
      const packet = webTopRecordedPacket(request.contract, request.material, request.pageTexts);
      const result = await member.provider.call({ ...call, callSiteKey: request.callSiteKey, providerRef: member.providerRef, packet,
        vendorPacketOf: fromStore ?? ((recorded) => packetWithPageTexts(recorded, request.pageTexts)),
        classifyContent: request.classifyContent });
      return { kind: "ANSWERED", content: result.content, maker: result.maker };
    } catch (error) {
      if (input.abandon?.(error) === true) throw error;
      log("WEB_READER_CALL_UNAVAILABLE", { runId, path: index, callSiteKey: request.callSiteKey, code: codeOf(error) });
      return { kind: "UNAVAILABLE" };
    }
  };
  const readOf = new Map(read.pages.filter((page): page is ReaderOnePageRead => page.outcome === "READ").map((page) => [page.pageId, page]));
  const top: WebTopReadersResult = await runWebTopReaders({
    pathIndex: index, mode: input.mode, question: input.question, answer: path.answer,
    pages: read.top.map((pageId) => { const page = pageOf.get(pageId)!; return Object.freeze({ pageId, title: page.title ?? page.site,
      site: page.site, date: page.date, text: page.text, textDigest: page.textDigest }); }),
    readerOne: read.top.flatMap((pageId) => { const got = readOf.get(pageId); return got === undefined ? []
      : [{ pageId, grade: got.grade, extracts: got.extracts.map((extract) => extract.text) }]; }),
    readerOneMaker: readerOne.maker,
    candidates: context.topMembers.map((member) => Object.freeze({ maker: member.maker, providerRef: member.providerRef })),
    verbatim: (pageText, extract) => findVerbatim(pageText, extract) !== null,
    call: topCall
  });

  // The readings: reader 1 for every page (its one line, in the site's language), readers 2 and 3 for the top pages.
  const readings = [
    ...read.pages.map((page) => ({ pageId: page.pageId, reader: 1 as const,
      maker: webMakerSlug(page.outcome === "READ" ? page.maker : readerOne.maker), outcome: page.outcome === "READ" ? "READ" as const : "FAILED" as const,
      grade: page.outcome === "READ" ? page.grade : null,
      line: page.outcome === "READ" ? { line: page.adds, language: input.siteLanguage.code } : null })),
    ...top.readings.map((reading) => ({ pageId: reading.pageId, reader: reading.reader, maker: webMakerSlug(reading.maker),
      outcome: reading.outcome, grade: reading.grade,
      line: reading.outcome === "READ" ? { leads: top.leads.filter((lead) => lead.from.includes(reading.reader)).map((lead) => lead.text) } : null }))
  ];
  for (const reading of readings) {
    const readingId = webStepRowId(runId, "reading", reading.pageId, String(reading.reader));
    const answer = await store.recordReading({ runId, readingId, pageId: reading.pageId, reader: reading.reader, maker: reading.maker,
      outcome: reading.outcome, grade: reading.grade,
      line: reading.line === null ? null : cipher.seal(WEB_EVIDENCE_CARRIERS.reading, readingId, reading.line) });
    // Two readers of one company on a page is refused by 0132; the reading is left out, the path goes on.
    if (answer === "SAME_MAKER") { log("WEB_READING_SAME_MAKER", { runId, path: index, reader: reading.reader }); continue; }
    written(answer);
  }

  // The checked extracts of the top pages (merged across readers), in top order, labelled S<path>-<n>.
  const extracts = top.extracts.slice(0, WEB_PACK_EXTRACTS_MAX).map((extract, at) => Object.freeze({
    ...extract, label: `S${String(index + 1)}-${String(at + 1)}` }));
  for (const extract of extracts) {
    const extractId = webStepRowId(runId, "extract", extract.label);
    written(await store.recordExtract({ runId, extractId, pageId: extract.pageId, label: extract.label, foundBy: extract.foundBy,
      quote: cipher.seal(WEB_EVIDENCE_CARRIERS.extract, extractId, { quote: extract.quote }) }));
  }
  if (read.top.length > 0) written(await store.recordPicks(runId, path.pathRef, read.top));

  // The pack the arguing calls read (W4-1): the top pages and their checked extracts, and the readers' leads.
  const packId = webStepRowId(runId, "pack", path.pathRef);
  const labels = extracts.map((extract) => extract.label);
  written(await store.recordPack({ runId, packId, pathRef: path.pathRef, extractLabels: labels,
    pack: cipher.seal(WEB_EVIDENCE_CARRIERS.pack, packId, {
      path_ref: path.pathRef,
      pages: read.top.map((pageId, rank) => { const page = pageOf.get(pageId)!; return { page_id: pageId, rank: rank + 1,
        title: page.title, site: page.site, url: page.url, date: page.date, read_depth: page.readDepth }; }),
      extracts: extracts.map((extract) => ({ label: extract.label, page_id: extract.pageId, quote: extract.quote, found_by: extract.foundBy })),
      leads: top.leads.map((lead) => lead.text)
    }) }));
  const missing = read.calls.some((entry) => entry.outcome === "UNAVAILABLE") ? "WEB_READER_CALL_UNAVAILABLE"
    : top.readers.some((reader) => reader.outcome === "FAILED") ? "WEB_TOP_READER_FAILED" : firstFailure;
  return outcome(missing, read.top, packId, labels);
}

/** What every web reader call shares (the planner's shape): the run, the work item, the seal, the bound, root 0's room. */
function callShape(input: WebStepInput, keepRoom: Readonly<{ keepRoomMicros?: number }>) {
  return Object.freeze({ runId: input.runId, subjectItemId: input.subjectItemId, role: "JUDGE" as const, lane: "served" as const,
    bound: input.bound, contractHash: input.contractHash, ...keepRoom });
}

/* ----------------------------------------------------------------- the runner's wiring */

/**
 * The runner's web settings (run-settings.ts `runnerWebSearchSettings`; main.ts hands them in). `switchedOn` is the web
 * setting (owner Q16); `search` is null where this server has no search gate (the step is then SWITCHED_OFF).
 */
export type WebStepRunnerSettings = Readonly<{
  switchedOn: boolean;
  search: PerplexitySearchPort | null;
  searchSubject: CallSubject;
  searchSeamOf: ((runId: string) => WebSearchCostSeam) | null;
  readRunPlan: (runId: string) => Promise<PlanId | null>;
}>;

/**
 * 0134's rows for the planner's decision: each NO_SEARCH_PLANNED reason sealed under the run's key (carrier
 * WEB_PLAN_CARRIER, the path_ref as its key, `{ reason }` as serve W3-6 opens it); every other status keeps none. A
 * reason with no key to seal it is refused before anything is written (WEB_PLAN_REASON_UNSEALED): never in the clear.
 */
export function webPlanPathRecords(statuses: readonly WebPlanPathStatus[], cipher: Pick<WebStepCipher, "seal"> | null):
  readonly WebPlanPathRecord[] {
  return Object.freeze(statuses.map((entry): WebPlanPathRecord => {
    if (entry.status !== "NO_SEARCH_PLANNED") {
      return Object.freeze({ pathRef: entry.pathId, status: entry.status, searchesToSend: entry.searchesToSend, reason: null });
    }
    if (cipher === null) throw new TypedDomainError("WEB_PLAN_REASON_UNSEALED", "A path's reason is kept only under the run's key");
    return Object.freeze({ pathRef: entry.pathId, status: entry.status, searchesToSend: 0,
      reason: cipher.seal(WEB_PLAN_CARRIER, entry.pathId, { reason: entry.reason ?? "" }) });
  }));
}

/**
 * The real store of the planner's decision (0134, `recordPlanStatuses` on the runner's pool). ALREADY is success: a run
 * claimed again writes the same decision again and the first stays. NOT_LIVE (the debate is gone) is the step's own
 * WEB_EVIDENCE_NOT_LIVE, which the step logs; its paths go on.
 */
export function postgresWebPlanStatusRecorder(pool: Pick<Pool, "query">): RecordPlanPathStatuses {
  return async (runId, statuses, cipher) => {
    if (statuses.length === 0) return;
    const answer = await new PostgresWebEvidenceRepository(pool).recordPlanStatuses(runId, webPlanPathRecords(statuses, cipher));
    if (answer === "NOT_LIVE") throw new TypedDomainError("WEB_EVIDENCE_NOT_LIVE", "The web store refused the plan");
  };
}

/** The store and the run's key, under its own content lease (closed when the step ends). */
export async function postgresWebStepPorts(pool: Pool, runId: string): Promise<WebStepPorts> {
  const leased = await prepareLeasedContentEncryptionForRun(pool, runId);
  const prepared = leased.prepared;
  if (prepared === null) {
    await leased.close();
    throw new TypedDomainError("WEB_EVIDENCE_ENCRYPTION_REQUIRED", "The web step keeps nothing without the run's content key");
  }
  const cipher: WebStepCipher = Object.freeze({
    seal: (carrier, primaryKey, value) => encryptAttestedLeasedContentForRun(leased, carrier, primaryKey, value)!,
    open: (carrier, primaryKey, envelope) => decryptLeasedContentForRun<unknown>(leased, carrier, primaryKey, envelope, null),
    lease: Object.freeze({ databaseAttestationSecret: () => prepared.databaseAttestationSecret() })
  });
  return Object.freeze({ store: new PostgresWebEvidenceRepository(pool), cipher, close: () => leased.close() });
}

/**
 * The one call the runner makes (index.ts, after the map's answer check): the run's plan read, the searches through the
 * debate's lane, the store opened on the runner's pool, and the planner's decision kept in 0134's store on the same
 * pool, its reasons sealed under the step's one lease. Absent settings: nothing runs and nothing is recorded.
 */
export async function runRunnerWebStep(input: Omit<WebStepInput, "planId" | "webSwitchedOn" | "search" | "searchSeam"
  | "recordPlanPathStatuses" | "prepare"> & Readonly<{
  pool: Pool;
  settings: WebStepRunnerSettings;
  lane: Readonly<{ lane: DebateCallLane; scheduler: CallScheduler }> | null;
}>): Promise<WebStepResult> {
  const { pool, settings, lane, ...rest } = input;
  if (rest.paths.length === 0) return Object.freeze({ plan: "NO_PATHS", paths: Object.freeze([]) });
  let planId: PlanId | null = null;
  try {
    planId = await settings.readRunPlan(rest.runId);
  } catch (error) {
    if (rest.abandon?.(error) === true) throw error;
    (rest.log ?? defaultLog)("WEB_RUN_PLAN_UNREAD", { runId: rest.runId, code: codeOf(error) });
  }
  const unconfigured: PerplexitySearchPort = Object.freeze({
    search: async () => Object.freeze({ outcome: "FAILED" as const, failure: "NOT_CONFIGURED" as const, chargeMicros: 0 as const, resultCount: 0 as const })
  });
  const port = settings.search ?? unconfigured;
  return runWebStep({
    ...rest,
    planId,
    webSwitchedOn: settings.switchedOn && settings.search !== null,
    search: lane === null ? port : laneSearchPort({ lane: lane.lane, scheduler: lane.scheduler, subject: settings.searchSubject, port }),
    searchSeam: settings.searchSeamOf === null ? null : () => settings.searchSeamOf!(rest.runId),
    recordPlanPathStatuses: postgresWebPlanStatusRecorder(pool),
    prepare: () => postgresWebStepPorts(pool, rest.runId)
  });
}
