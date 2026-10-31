// apps/runner/src/web-researched.ts
/**
 * "ADD TO RESEARCHED", THE RUNNER'S HALF (dig-model revision task W4-4; owner Q7 and Q-D9; plan 2026-10-31 decision 7).
 *
 * Plain words: a person adds one of a path's "other pages" from the map, outside a debate. Reader 1 already read that page whole
 * when the debate ran and wrote its note, so this buys what it did not: readers 2 and 3 read it now, as they read a top page (about
 * a cent, on the same sealed wording), code keeps what they copied only when the page holds it word for word, and the page's quotes
 * join that path. The page then says whether it adds to the argument. It does NOT rewrite the path (Q-D9): the next dig on the path
 * and the report read its note and quotes.
 *
 * What this file respects:
 *  - Whole texts and passages never enter the call records: a prompt names the page by `webPageTextRef` and the reply goes to 0139's
 *    own store (`replyRecord`). Each quote is kept for good with `recordShownQuote` right after its extract, and once the outcome is
 *    settled the debate's wipe takes the page's text, the extracts and the replies.
 *  - A page reader 1 could not read has no note. Reader 1 then reads it now (web.read-all.v2, decision 8's sentence). 0132 keeps one
 *    reading per reader and page, so that note is sealed with the page's shown quotes, which is where the page and later AIs read it.
 *  - Once the 30 days have passed the page's text is gone: its one search brings it back for this reading only (owner Q4, about 0.1 of
 *    a cent) and it is not stored. A page the search no longer finds settles FAILED, which the page says plainly.
 *  - Paid once. Everything is keyed by the run and the page; a call the stopped copy got answered is replayed from the record, free; a
 *    search already recorded is never sent again. A second press is ALREADY at the API, so nothing runs twice.
 *  - The money: each call names the page's own run on the story lane, so it counts for that run's owner and is never walled once started
 *    (the gateway's climb seam). A search keeps its own seam, and one refused there settles FAILED with nothing charged.
 * Nothing here throws on a vendor's failure; the sweep gives up on a page after `giveUpMs` so no debate holds its passages for ever.
 */
import {
  PostgresDigPicksRunnerRepository, PostgresPassageRetentionRepository, PostgresWebEvidenceRepository, RunRepository, WEB_EVIDENCE_CARRIERS, WEB_REPLY_TEXT_CARRIER,
  WEB_SHOWN_QUOTE_CARRIER, readMapRootsInForce, webReplyTextRef, type Pool, type WebResearchedUnsettled
} from "@debateai/db";
import type { WebSearchCostSeam } from "@debateai/budget";
import { cutQuoteAtWordEdge, isDigPickPathRef } from "@debateai/contract";
import { addressKey, findVerbatim } from "@debateai/evidence";
import { webResearchedReadAllCallSiteKey, webResearchedReadTopCallSiteKey } from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import { packetWithPageTexts, type PerplexitySearchPort, type ProviderGateway, type ProviderReplyRecord } from "@debateai/providers";
import { PATH_REWRITE_POLICY } from "@debateai/register";
import { engineContractHash } from "./engine-contracts.js";
import { wipeDebatePassages } from "./passage-sweep.js";
import { pointsOf } from "./path-rewrite-sources.js";
import { readReplayBook, replayingGateway, type ReplayBook } from "./run-replay.js";
import { runWebPageTextDigest } from "./web-page-text-gateway.js";
import { WEB_READER_ONE_LIMITS, readAllPages, type ReaderOneCall, type ReaderOnePageRead } from "./web-reader-all.js";
import { runWebTopReaders, type WebTopReaderCall } from "./web-readers-top.js";
import {
  WEB_READER_ONE_MODEL, WEB_TOP_READER_MODEL_ORDER, aboutOf, postgresWebStepPorts, storedAskSiteLanguage, webMakerSlug, webStepRowId,
  webTopRecordedPacket, type WebStepMember
} from "./web-step.js";

/** The extract ids of added pages: their own group, S99-<n>, which no path of a debate reaches. */
const RESEARCHED_LABEL_GROUP = "S99-" as const;
/** 0132's extract label holds three digits. */
const RESEARCHED_LABEL_MAX = 999 as const;
/** The most quotes one added page keeps. */
export const WEB_RESEARCHED_EXTRACTS_MAX = 8 as const;
/** At least one reader must grade the page above this for it to add to the argument (grade 0: nothing on the page helps). */
const NOTHING_GRADE = 0 as const;
export const WEB_RESEARCHED_SWEEP_DEFAULTS = Object.freeze({ everyMs: 15_000, limit: 20, giveUpMs: 6 * 60 * 60_000 });

export type WebResearchedSettings = Readonly<{
  pool: Pool;
  members: readonly WebStepMember[];
  /** The search that brings a wiped page back; null where this server has no search gate (such a page settles FAILED). */
  search: PerplexitySearchPort | null;
  searchSeamOf: ((runId: string) => WebSearchCostSeam) | null;
  contractHash?: string;
  /** An error the copy must stop for (a test's lost runner): rethrown, nothing settled. */
  abandon?: (error: unknown) => boolean;
  log?: (event: string, detail: Readonly<Record<string, unknown>>) => void;
  replayBookOf?: (runId: string, subjectItemId: string) => Promise<ReplayBook>;
  giveUpMs?: number;
  now?: () => Date;
}>;

export type WebResearchedOutcome = "ADDS" | "DOES_NOT_ADD" | "FAILED" | "ALREADY" | "NOT_LIVE";

const codeOf = (error: unknown): string => error instanceof TypedDomainError ? error.code : "UNTYPED";
const defaultLog = (event: string, detail: Readonly<Record<string, unknown>>): void => {
  console.warn(JSON.stringify({ kind: "DEBATEAI_WEB_RESEARCHED", event, ...detail }));
};
const accepted = (outcome: string): void => {
  if (outcome === "RECORDED" || outcome === "ALREADY") return;
  throw new TypedDomainError(`WEB_RESEARCHED_${outcome}`, "The web store refused a row");
};

/** The ledger's subject of the page's calls: its replay book, and how many tries each site has had. */
export const webResearchedSubjectOf = (runId: string, pageId: string): string => webStepRowId(runId, "researched", pageId);

/**
 * What the readers read the page against, as the debate read it: a first debate's path is its position's own words, a dig's pick is
 * the pick's text; with neither, the question.
 */
async function pathAnswerOf(pool: Pool, runId: string, pathRef: string, question: string): Promise<string> {
  if (isDigPickPathRef(pathRef)) {
    const picks = await new PostgresDigPicksRunnerRepository(pool).read(runId);
    const pickNo = Number(pathRef.slice(pathRef.lastIndexOf("-") + 1));
    return picks?.picks.find((pick) => pick.pickNo === pickNo)?.text ?? question;
  }
  const root = (await readMapRootsInForce(pool, runId)).find((candidate) => candidate.answerId === pathRef && !candidate.stale);
  if (root === undefined) return question;
  return (await pointsOf(pool, runId, [root.rootNodeId]))[0]?.text ?? question;
}

/** One added page, from reading to its outcome. Throws only what `abandon` names and what a later pass may try again. */
export async function weighAddedPage(settings: WebResearchedSettings, chosen: Readonly<{ runId: string; pageId: string }>): Promise<WebResearchedOutcome> {
  const { pool, members } = settings;
  const { runId, pageId } = chosen;
  const log = settings.log ?? defaultLog;
  const ports = await postgresWebStepPorts(pool, runId);
  const { cipher } = ports;
  const store = new PostgresWebEvidenceRepository(pool);
  const retention = new PostgresPassageRetentionRepository(pool);
  const settle = async (outcome: "ADDS" | "DOES_NOT_ADD" | "FAILED"): Promise<WebResearchedOutcome> => {
    const answer = await store.settleResearched(runId, pageId, outcome);
    if (answer === "NOT_LIVE" || answer === "NOT_CHOSEN") return "NOT_LIVE";
    log("WEB_RESEARCHED_SETTLED", { runId, pageId, outcome });
    return answer === "ALREADY" ? "ALREADY" : outcome;
  };
  let outcome: WebResearchedOutcome;
  try {
    const evidence = await store.read(runId);
    const choice = evidence?.researched.find((row) => row.page_id === pageId);
    if (evidence === null || choice === undefined) return "NOT_LIVE";
    if (choice.outcome !== null) return "ALREADY";
    const page = evidence.pages.find((row) => row.page_id === pageId);
    const about = page === undefined ? null : aboutOf(cipher.open(WEB_EVIDENCE_CARRIERS.page, pageId, page.content));
    const foundBy = evidence.searches.find((search) => search.search_id === page?.search_id);
    const ask = await new RunRepository(pool).readStoredAsk(runId);
    if (page === undefined || about === null || foundBy === undefined || ask === null) return await settle("FAILED");

    /* The text: as stored, or brought back by one search for this reading only. */
    let text: string | null = null;
    if (page.text_state === "STORED") {
      const kept = (await store.readPageTexts(runId, [pageId]))[0];
      const opened = kept === undefined ? null : cipher.open(WEB_EVIDENCE_CARRIERS.pageText, pageId, kept.envelope);
      text = typeof opened === "string" ? opened : null;
    } else {
      const searchId = webStepRowId(runId, "researched-search", pageId);
      const asked = evidence.searches.some((search) => search.search_id === searchId);
      if (!asked && settings.search !== null) {
        const seam = settings.searchSeamOf?.(runId) ?? null;
        try {
          const admission = await seam?.assertSearchAllowed();
          const query = (about.title ?? about.site).slice(0, 200);
          const found = await settings.search.search(Object.freeze({ query, mode: "DIG" as const, afterDate: null, language: foundBy.language,
            country: foundBy.language_kind === "local" ? foundBy.country : null }));
          const answered = found.outcome === "FOUND" || found.outcome === "EMPTY";
          await seam?.recordSearch({ outcome: answered ? "SUCCEEDED" : "FAILED", ...(admission === undefined ? {} : { admission }) });
          accepted(await store.recordSearch({ runId, searchId, pathRef: foundBy.path_ref, side: "dig", languageKind: foundBy.language_kind === "local" ? "local" : "english",
            language: foundBy.language, country: foundBy.language_kind === "local" ? foundBy.country : null, lookBack: "none", outcome: found.outcome,
            chargeMicros: found.chargeMicros, resultCount: found.outcome === "FOUND" ? found.resultCount : 0,
            words: found.outcome === "REFUSED" ? null : cipher.seal(WEB_EVIDENCE_CARRIERS.search, searchId, { query }) }));
          const wanted = addressKey(about.url);
          text = !answered ? null : [...found.pages, ...found.reused].find((candidate) => addressKey(candidate.url) === wanted)?.text ?? null;
        } catch (error) {
          if (settings.abandon?.(error) === true) throw error;
          log("WEB_RESEARCHED_FETCH_FAILED", { runId, pageId, code: codeOf(error) });
        } finally {
          seam?.releaseInFlight();
        }
      }
    }
    if (text === null) return await settle("FAILED");
    const pageText = text;
    const textDigest = runWebPageTextDigest(cipher.lease, pageId, pageText);
    const readerPage = Object.freeze({ pageId, title: about.title ?? about.site, site: about.site, date: about.date, text: pageText, textDigest });

    const subjectItemId = webResearchedSubjectOf(runId, pageId);
    const book = await (settings.replayBookOf ?? ((run: string, subject: string) => readReplayBook(pool, run, subject)))(runId, subjectItemId);
    const gateway = (member: WebStepMember): ProviderGateway => replayingGateway(book, member.provider);
    const replyRecord: ProviderReplyRecord = Object.freeze({
      store: async (artifactId: string, rawText: string) => {
        await retention.recordReplyText(runId, artifactId, cipher.seal(WEB_REPLY_TEXT_CARRIER, artifactId, rawText));
        return webReplyTextRef(artifactId);
      },
      refOf: webReplyTextRef
    });
    const call = Object.freeze({ runId, subjectItemId, role: "JUDGE" as const, lane: "story" as const, bound: PATH_REWRITE_POLICY.writerBound,
      contractHash: settings.contractHash ?? engineContractHash(), replyRecord });

    const question = ask.questionLine;
    const answer = await pathAnswerOf(pool, runId, foundBy.path_ref, question);
    const seatOne = members.find((member) => member.model === WEB_READER_ONE_MODEL) ?? null;
    const readingOne = evidence.readings.find((reading) => reading.page_id === pageId && reading.reader === 1);

    /* Reader 1, only for a page it could not read when the debate ran: the note the page and later AIs read. */
    let readNow: ReaderOnePageRead | null = null;
    const siteLanguage = storedAskSiteLanguage(ask.askContract) ?? { code: "en", name: "English" };
    if (readingOne?.outcome !== "READ" && seatOne !== null) {
      const readerOneCall: ReaderOneCall = async (request) => {
        try {
          const result = await gateway(seatOne).call({ ...call, callSiteKey: webResearchedReadAllCallSiteKey(), providerRef: seatOne.providerRef,
            packet: request.packet, vendorPacketOf: request.vendorPacketOf, sentInputTokensBelow: WEB_READER_ONE_LIMITS.callInputTokensBelow, classifyContent: request.classifyContent });
          return { kind: "ANSWERED", content: result.content, maker: result.maker, rawArtifactRef: result.rawArtifactRef };
        } catch (error) {
          if (settings.abandon?.(error) === true) throw error;
          log("WEB_RESEARCHED_CALL_UNAVAILABLE", { runId, pageId, code: codeOf(error) });
          return { kind: "UNAVAILABLE" };
        }
      };
      const read = await readAllPages({ answerIndex: 0, question, answer, siteLanguage: siteLanguage.name, topCount: 3, pages: [readerPage], call: readerOneCall });
      const got = read.pages[0];
      if (got?.outcome === "READ") {
        readNow = got;
        if (readingOne === undefined) {
          const readingId = webStepRowId(runId, "reading", pageId, "1");
          accepted(await store.recordReading({ runId, readingId, pageId, reader: 1, maker: webMakerSlug(got.maker), outcome: "READ", grade: got.grade,
            line: cipher.seal(WEB_EVIDENCE_CARRIERS.reading, readingId, { line: got.adds, language: siteLanguage.code, ...(got.note === null ? {} : { note: got.note }) }) }));
        }
      }
    }

    /* Readers 2 and 3, as on a top page. */
    const topCall: WebTopReaderCall = async (request) => {
      const member = members.find((entry) => entry.providerRef === request.seat.providerRef)!;
      try {
        const result = await gateway(member).call({ ...call, callSiteKey: webResearchedReadTopCallSiteKey(request.reader), providerRef: member.providerRef,
          packet: webTopRecordedPacket(request.contract, request.material, request.pageTexts),
          vendorPacketOf: (recorded) => packetWithPageTexts(recorded, request.pageTexts), classifyContent: request.classifyContent });
        return { kind: "ANSWERED", content: result.content, maker: result.maker };
      } catch (error) {
        if (settings.abandon?.(error) === true) throw error;
        log("WEB_RESEARCHED_CALL_UNAVAILABLE", { runId, pageId, code: codeOf(error) });
        return { kind: "UNAVAILABLE" };
      }
    };
    const top = await runWebTopReaders({
      pathIndex: 0, mode: "quick", question, answer, pages: [readerPage],
      readerOne: readNow === null ? [] : [{ pageId, grade: readNow.grade, extracts: readNow.extracts.map((extract) => extract.text) }],
      readerOneMaker: readingOne?.maker ?? seatOne?.maker ?? "",
      candidates: WEB_TOP_READER_MODEL_ORDER.flatMap((model) => members.filter((member) => member.model === model).slice(0, 1))
        .map((member) => Object.freeze({ maker: member.maker, providerRef: member.providerRef })),
      verbatim: (onPage, extract) => findVerbatim(onPage, extract) !== null,
      call: topCall
    });
    for (const reading of top.readings) {
      const readingId = webStepRowId(runId, "reading", pageId, String(reading.reader));
      const answered = await store.recordReading({ runId, readingId, pageId, reader: reading.reader, maker: webMakerSlug(reading.maker), outcome: reading.outcome, grade: reading.grade,
        line: reading.outcome === "READ" ? cipher.seal(WEB_EVIDENCE_CARRIERS.reading, readingId, { leads: top.leads.filter((lead) => lead.from.includes(reading.reader)).map((lead) => lead.text) }) : null });
      if (answered !== "SAME_MAKER") accepted(answered);
    }

    const grades = [top.pages[0]?.grades[2] ?? null, top.pages[0]?.grades[3] ?? null, readNow?.grade ?? null].filter((grade): grade is NonNullable<typeof grade> => grade !== null);
    if (grades.length === 0) outcome = await settle("FAILED");
    else {
      const extracts = top.extracts.slice(0, WEB_RESEARCHED_EXTRACTS_MAX);
      if (Math.max(...grades) <= NOTHING_GRADE || extracts.length === 0) outcome = await settle("DOES_NOT_ADD");
      else {
        // The quote outlives the passage, so a label is free only when neither names it; a quote this page already holds keeps its id.
        const shown = (await retention.readShownQuotes(runId)) ?? [];
        const taken = new Set([...shown.map((quote) => quote.label), ...evidence.extracts.map((extract) => extract.label)]);
        let next = 1;
        for (const [at, extract] of extracts.entries()) {
          const extractId = webStepRowId(runId, "researched-extract", pageId, String(at));
          while (taken.has(`${RESEARCHED_LABEL_GROUP}${String(next)}`)) next += 1;
          if (next > RESEARCHED_LABEL_MAX) throw new TypedDomainError("WEB_RESEARCHED_LABELS_FULL", "No extract label is free");
          const label = `${RESEARCHED_LABEL_GROUP}${String(next)}`;
          const stored = await store.recordExtract({ runId, extractId, pageId, label, foundBy: extract.foundBy,
            quote: cipher.seal(WEB_EVIDENCE_CARRIERS.extract, extractId, { quote: extract.quote }) });
          accepted(stored);
          if (stored === "RECORDED") taken.add(label);
          // Reader 1's note, when it wrote one only now, goes with the quote (0132 keeps one reading per reader and page).
          const lateNote = readNow !== null && readingOne !== undefined ? readNow.note : null;
          accepted(await retention.recordShownQuote(runId, extractId, cipher.seal(WEB_SHOWN_QUOTE_CARRIER, extractId, {
            quote: cutQuoteAtWordEdge(extract.quote), ...(lateNote === null ? {} : { note: lateNote, language: siteLanguage.code }) })));
        }
        outcome = await settle("ADDS");
      }
    }
  } finally {
    await ports.close().catch(() => undefined);
  }
  return outcome;
}

/* ----------------------------------------------------------------- the sweep */

export type WebResearchedPass = Readonly<{ listed: number; settled: number; skipped: number }>;

/**
 * One pass: every page waiting, debate by debate, each debate's pages one after another (they take labels from one list). A page settled
 * here takes its debate's text and passages with it at once (`wipeDebatePassages`). A page that cannot be read is tried again on a later
 * pass until `giveUpMs` after it was added, then settled FAILED.
 */
export async function sweepWebResearched(settings: WebResearchedSettings, limit: number = WEB_RESEARCHED_SWEEP_DEFAULTS.limit): Promise<WebResearchedPass> {
  const log = settings.log ?? defaultLog;
  const store = new PostgresWebEvidenceRepository(settings.pool);
  let listed: readonly WebResearchedUnsettled[];
  try {
    listed = await store.readUnsettledResearched(limit);
  } catch (error) {
    log("WEB_RESEARCHED_UNREAD", { code: codeOf(error) });
    return Object.freeze({ listed: 0, settled: 0, skipped: 0 });
  }
  const byRun = new Map<string, WebResearchedUnsettled[]>();
  for (const row of listed) byRun.set(row.run_id, [...(byRun.get(row.run_id) ?? []), row]);
  let settled = 0;
  let skipped = 0;
  const now = (settings.now ?? (() => new Date()))().getTime();
  const giveUpMs = settings.giveUpMs ?? WEB_RESEARCHED_SWEEP_DEFAULTS.giveUpMs;
  await Promise.all([...byRun.entries()].map(async ([runId, rows]) => {
    for (const row of rows) {
      try {
        const outcome = await weighAddedPage(settings, { runId, pageId: row.page_id });
        if (outcome === "ADDS" || outcome === "DOES_NOT_ADD" || outcome === "FAILED") settled += 1;
      } catch (error) {
        if (settings.abandon?.(error) === true) throw error;
        log("WEB_RESEARCHED_NOT_SETTLED", { runId, pageId: row.page_id, code: codeOf(error) });
        if (now - Date.parse(row.chosen_at) >= giveUpMs) {
          await store.settleResearched(runId, row.page_id, "FAILED").catch(() => undefined);
          settled += 1;
        } else skipped += 1;
      }
    }
    // Decision 7: the page has been read, so its text, its passages and the readers' replies go now.
    await wipeDebatePassages(settings.pool, runId, "NOTHING_RUNS");
  }));
  return Object.freeze({ listed: listed.length, settled, skipped });
}

/** The sweep at boot and every `everyMs` (default 15 seconds: the person is waiting), one pass at a time; none while `paused()`. */
export function startWebResearchedSweep(settings: WebResearchedSettings & Readonly<{ everyMs?: number; paused?: () => boolean }>)
  : Readonly<{ stop: () => void; idle: () => Promise<void> }> {
  let running: Promise<unknown> = Promise.resolve();
  let busy = false;
  const pass = (): void => {
    if (busy || settings.paused?.() === true) return;
    busy = true;
    running = sweepWebResearched(settings).catch(() => undefined).finally(() => { busy = false; });
  };
  pass();
  const timer = setInterval(pass, settings.everyMs ?? WEB_RESEARCHED_SWEEP_DEFAULTS.everyMs);
  timer.unref?.();
  return Object.freeze({ stop: () => { clearInterval(timer); }, idle: () => running.then(() => undefined) });
}

/**
 * The configured members with their
 * models; undefined with no reader 2 or 3 on the line-up (nobody could read an added page).
 */
export function composeWebResearched(input: Readonly<{
  pool: Pool;
  targets: readonly Readonly<{ providerRef: string; model: string }>[];
  members: readonly Readonly<{ provider: ProviderGateway; providerRef: string; maker: string }>[];
  search: PerplexitySearchPort | null;
  searchSeamOf: ((runId: string) => WebSearchCostSeam) | null;
  log?: (event: string, detail: Readonly<Record<string, unknown>>) => void;
}>): WebResearchedSettings | undefined {
  const modelOf = new Map(input.targets.map((target) => [target.providerRef, target.model] as const));
  const members = input.members.flatMap((member): WebStepMember[] => {
    const model = modelOf.get(member.providerRef);
    return model === undefined ? [] : [Object.freeze({ provider: member.provider, providerRef: member.providerRef, maker: member.maker, model })];
  });
  if (!members.some((member) => (WEB_TOP_READER_MODEL_ORDER as readonly string[]).includes(member.model))) return undefined;
  return Object.freeze({ pool: input.pool, members: Object.freeze(members), search: input.search, searchSeamOf: input.searchSeamOf,
    ...(input.log === undefined ? {} : { log: input.log }) });
}
