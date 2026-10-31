import { PurposeLinesSchema, cutQuoteAtWordEdge, readingLevelOf, StoryBodySchema, StoryFateSchema, trustOfPoint, type StoryFate, type TrustWord } from "@debateai/contract";
import {
  INVESTIGATION_REPORT_CARRIER, PATH_REWRITE_CARRIER, PATH_UPDATE_CARRIER, PostgresDigModelRunnerRepository, PostgresDigPicksRunnerRepository,
  PostgresInvestigationReportRunnerRepository, PostgresInvestigationRunnerRepository, PostgresPassageRetentionRepository,
  PostgresTreeUpdateRunnerRepository, PostgresWebEvidenceRepository, RUN_PURPOSE_LINES_CARRIER, RunRepository, WEB_EVIDENCE_CARRIERS,
  WEB_SHOWN_QUOTE_CARRIER, decryptContentForRun, decryptLeasedContentForRun, encryptAttestedContentForRun,
  prepareLeasedContentEncryptionForRun, withRunContentLease, type CryptoEnvelope, type InvestigationReportsRead, type PathLineEntry,
  type PathRewriteEntry, type Pool, type UnreportedClosing, type WebSealed
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { LivenessRepository } from "@debateai/serve";
import type { ProviderGateway, ProviderCallRequest, TokenCounter } from "@debateai/providers";
import { INVESTIGATION_REPORT_POLICY } from "@debateai/register";
import { projectedCallCeilingMicros, type ProviderTargetPrice } from "@debateai/budget";
import {
  storedReportAnswerOf, type InvestigationCloseInput, type InvestigationCloseSettings, type InvestigationCloseSources,
  type InvestigationReportContent, type InvestigationReportPayer, type InvestigationReportSettled
} from "./investigation-close.js";
import type { DossierDig, DossierPath, DossierRewrite, DossierSource, DossierText } from "./investigation-dossier.js";
import { pathRewriteBodyBytes, type PathRewriteDigPath } from "./path-rewrite-material.js";
import { PATH_REWRITE_CHECKER_MODEL, PATH_REWRITE_WRITER_MODEL } from "./path-rewrite-composition.js";
import { backfillShownQuotes } from "./passage-sweep.js";
import { pointsOf, storedDigPathsOf } from "./path-rewrite-sources.js";
import { readReplayBook } from "./run-replay.js";

/**
 * THE CLOSING'S SOURCES IN POSTGRESQL, AND THE CLOSING COMPOSED (plan 2026-10-30 task W5-1), on the runner's pool
 * (debateai_runtime), each sealed value opened under its own run's key. Every read is deterministic for the same stored
 * rows (fixed orders everywhere), so a closing run again builds the same dossier:
 *  - the main question: the root's own ask (its line, its reading level; Free when its plan is);
 *  - the first debate: the root's latest story (its short answer, "what would change it", and each path in the map's
 *    order with the map's ids, "<ref>#2" for a position argued twice), each path's whole points (path-rewrite-sources'
 *    `pointsOf`: the node's own words, the point it argues, disputed when the second AI disputed it) and the sources they
 *    cite, each as its shown quote and reader 1's page note;
 *  - each dig (0133's members): its picks and path (0135), its level (0134), its rewrite (0134, opened under the dig's
 *    key), the text the rewrite was written on (the base rewrite's, else the parent's story line), and its own paths with
 *    every point on them, as 0135 stored them for the rewrite (a dig under the main question has none stored: its own story's);
 *  - a path's newest text when a later update wrote it (0138's line: a climb, a public dig; a public dig its check did not
 *    allow is left out whole);
 *  - the debate's place, time and purpose lines (0138, decision 5; an old debate has none);
 *  - the earlier report's answer (0136, opened under the root's key), from version 2 on (F8 A).
 *
 * DECISION 6, AI TEXT ONLY: nothing here opens a passage. Quotes come from 0139's shown quotes, cut to 120 characters when
 * they were written, never from identity.web_extract or a pack; 0135's stored paths keep no words of their extracts (version 2). An extract
 * a stopped runner left without its shown quote gets it first (passage-sweep.ts `backfillShownQuotes`, the one reader of the
 * passage here, which only cuts it to the quote), so no reader of the report loses a source to a crash.
 * tests/architecture/report-reads-ai-text-only.test.ts holds this file to it.
 */

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const unread = (what: string): never => { throw new TypedDomainError("INVESTIGATION_REPORT_SOURCE_UNREAD", what); };
const LOCATOR_EXTRACT_IDS = /(?<![A-Za-z0-9])S[0-9]{1,4}-[0-9]{1,4}(?![0-9])/gu;

type StoryRead = Readonly<{
  answer: Readonly<{ headline: string; summary: string; change: string; confidence: string }>;
  paths: readonly Readonly<{ ref: string; positionNodeId: string; line: string; fate: StoryFate; nodeRefs: readonly string[] }>[];
}>;

/** The run's latest story: its short answer and its paths by the map's ids; null when it has none. */
async function storyOf(pool: Pool, runId: string): Promise<StoryRead | null> {
  const row = (await pool.query<{ story_id: string; content: unknown; content_ciphertext: CryptoEnvelope | null }>(
    `SELECT story.story_id::text AS story_id, story.content, story.content_ciphertext
       FROM serve.answer_story AS story
      WHERE story.run_id = $1
      ORDER BY story.answer_version DESC, story.created_at DESC
      LIMIT 1`, [runId])).rows[0];
  if (row === undefined) return null;
  const content = await withRunContentLease(pool, [runId], () =>
    decryptContentForRun<unknown>(pool, runId, "serve.answer_story", row.story_id, row.content_ciphertext, row.content));
  const body = StoryBodySchema.nullable().safeParse(isRecord(content) ? content.body : undefined);
  if (!body.success || body.data === null) return null;
  const seen = new Map<string, number>();
  const paths = body.data.short.paths.map((path) => {
    const times = (seen.get(path.position_ref) ?? 0) + 1;
    seen.set(path.position_ref, times);
    return Object.freeze({ ref: times === 1 ? path.position_ref : `${path.position_ref}#${String(times)}`, positionNodeId: path.position_ref,
      line: path.line, fate: path.fate, nodeRefs: Object.freeze([...path.node_refs]) });
  });
  return Object.freeze({ answer: Object.freeze({ headline: body.data.short.headline, summary: body.data.short.summary,
    change: body.data.short.change.text, confidence: body.data.short.confidence }), paths: Object.freeze(paths) });
}

/** The sources each point's locator names, each as its shown quote (0139) and reader 1's page note, in the locator's order. */
async function sourcesOfPoints(pool: Pool, runId: string, pointIds: readonly string[]): Promise<readonly DossierSource[]> {
  if (pointIds.length === 0) return [];
  const located = (await pool.query<{ node_id: string; locator: string | null }>(
    "SELECT node_id::text AS node_id, locator FROM core.node WHERE run_id = $1 AND node_id = ANY($2::uuid[]) ORDER BY node_id",
    [runId, [...pointIds]])).rows;
  const callerId = new Map(pointIds.map((id) => [id.toLowerCase(), id] as const));
  const named = pointIds.flatMap((id) => {
    const row = located.find((candidate) => candidate.node_id.toLowerCase() === id.toLowerCase());
    return [...new Set(row?.locator?.match(LOCATOR_EXTRACT_IDS) ?? [])].map((label) => ({ pointId: callerId.get(id.toLowerCase()) ?? id, label }));
  });
  if (named.length === 0) return [];
  // A runner stopped between an extract and its shown quote leaves no quote: written now, so the report still lists the source.
  await backfillShownQuotes(pool, runId);
  const quotes = await new PostgresPassageRetentionRepository(pool).readShownQuotes(runId);
  if (quotes === null || quotes.length === 0) return [];
  const evidence = await new PostgresWebEvidenceRepository(pool).read(runId);
  if (evidence === null) return [];
  return withRunContentLease(pool, [runId], async () => {
    const cipher = await prepareLeasedContentEncryptionForRun(pool, runId);
    try {
      const sources: DossierSource[] = [];
      for (const { pointId, label } of named) {
        const shown = quotes.find((candidate) => candidate.label === label);
        const page = shown === undefined ? undefined : evidence.pages.find((candidate) => candidate.page_id === shown.page_id);
        if (shown === undefined || page === undefined) continue;
        const quote = decryptLeasedContentForRun<unknown>(cipher, WEB_SHOWN_QUOTE_CARRIER, shown.extract_id, shown.content, null);
        const about = decryptLeasedContentForRun<unknown>(cipher, WEB_EVIDENCE_CARRIERS.page, page.page_id, page.content, null);
        if (!isRecord(quote) || typeof quote.quote !== "string" || quote.quote.trim() === "" || !isRecord(about) || typeof about.site !== "string") continue;
        const reading = evidence.readings.find((candidate) => candidate.page_id === page.page_id && candidate.reader === 1
          && candidate.outcome === "READ" && candidate.content !== null);
        const opened = reading === undefined ? null
          : decryptLeasedContentForRun<unknown>(cipher, WEB_EVIDENCE_CARRIERS.reading, reading.reading_id, reading.content, null);
        sources.push(Object.freeze({ pointId, site: about.site, link: typeof about.url === "string" ? about.url : null,
          title: typeof about.title === "string" ? about.title : null, quote: cutQuoteAtWordEdge(quote.quote),
          line: isRecord(opened) && typeof opened.line === "string" && opened.line.trim() !== "" ? opened.line : null }));
      }
      await cipher.assertLive();
      return Object.freeze(sources);
    } finally {
      await cipher.close();
    }
  });
}

/**
 * Decision 27: each point's trust word, by the contract's one rule (`trustOfPoint`), for the stored version's PDF. Unread points have
 * no word (the caller lets a failed read cost the words, never the report). Never in the writer's material: a word can change with time.
 */
export async function trustWordsOf(pool: Pool, runId: string, free: boolean, pointIds: readonly string[]): Promise<ReadonlyMap<string, TrustWord>> {
  const words = new Map<string, TrustWord>();
  if (pointIds.length === 0) return words;
  const liveness = new LivenessRepository(pool);
  const rows = (await pool.query<{ node_id: string; way_of_knowing: string; locator: string | null; relevant_as_of: Date; outcome: string | null }>(
    `SELECT node.node_id::text AS node_id, node.way_of_knowing, node.locator, node.relevant_as_of, review.outcome
       FROM core.node AS node
       LEFT JOIN LATERAL (SELECT outcome FROM ledger.node_review WHERE node_id = node.node_id ORDER BY at_seq DESC LIMIT 1) AS review ON true
      WHERE node.run_id = $1 AND node.node_id = ANY($2::uuid[])`, [runId, [...pointIds]])).rows;
  const quotes = await new PostgresPassageRetentionRepository(pool).readShownQuotes(runId);
  const labels = new Set((quotes ?? []).map((quote) => quote.label));
  for (const row of rows) {
    const staleness = await liveness.readSubjectStaleness({ runId, subjectKind: "NODE", subjectRef: row.node_id, relevantAsOf: row.relevant_as_of });
    const placed = trustOfPoint({ review: row.outcome === null ? null : { outcome: row.outcome }, staleness_state: staleness.state, way_of_knowing: row.way_of_knowing,
      looked_up_checked: row.way_of_knowing === "LOOKED_UP" && row.locator !== null && labels.has(row.locator) && row.outcome === "agree" }, { free, fell: false });
    if (placed.trust !== null) words.set(row.node_id.toLowerCase(), placed.trust);
  }
  return words;
}

/** Each path's newest text on one debate when a later update wrote it (0138), and the digs its line says are not to be read. */
async function lineOf(pool: Pool, runId: string): Promise<Readonly<{ newest: ReadonlyMap<string, DossierText>; hiddenDigs: ReadonlySet<string> }>> {
  const line = (await new PostgresTreeUpdateRunnerRepository(pool).readLine(runId)) ?? [];
  const hiddenDigs = new Set(line.filter((entry) => entry.hidden || entry.held).map((entry) => entry.run_id.toLowerCase()));
  const lastOf = new Map<string, PathLineEntry>();
  for (const entry of line) {
    if (entry.hidden || entry.held || (entry.state !== "READY" && entry.state !== "READY_WITH_RESERVATION")) continue;
    lastOf.set(entry.position_ref, entry);
  }
  const newest = new Map<string, DossierText>();
  for (const [ref, entry] of lastOf) {
    if (entry.source !== "PATH_UPDATE" || entry.entry_id === null || entry.content === null) continue;
    const opened = await withRunContentLease(pool, [entry.run_id], () => decryptContentForRun<unknown>(pool, entry.run_id,
      PATH_UPDATE_CARRIER, entry.entry_id!, entry.content, null)).catch(() => null);
    const text = isRecord(opened) && isRecord(opened.text) ? opened.text : null;
    const fate = StoryFateSchema.safeParse(entry.fate_after ?? text?.fate);
    if (text !== null && typeof text.line === "string" && fate.success) {
      newest.set(ref, Object.freeze({ line: text.line, summary: typeof text.summary === "string" ? text.summary : null, fate: fate.data }));
    }
  }
  return Object.freeze({ newest, hiddenDigs });
}

/** The debate's place, time and purpose lines (decision 5), opened under its key; all null for an old debate. */
async function purposeLinesOf(pool: Pool, runId: string): Promise<Readonly<{ place: string | null; time: string | null; purpose: string | null }>> {
  const sealed = await new PostgresTreeUpdateRunnerRepository(pool).readPurposeLines(runId);
  const none = Object.freeze({ place: null, time: null, purpose: null });
  if (sealed === null) return none;
  const opened = await withRunContentLease(pool, [runId], () => decryptContentForRun<unknown>(pool, runId, RUN_PURPOSE_LINES_CARRIER, runId.toLowerCase(), sealed, null));
  const lines = PurposeLinesSchema.safeParse(opened);
  return lines.success ? Object.freeze({ place: lines.data.place ?? null, time: lines.data.time ?? null, purpose: lines.data.purpose ?? null }) : none;
}

type StoredRewrite = Readonly<{ text: DossierText; whatChanged: readonly string[]; viewReason: string | null;
  digPaths: readonly Readonly<{ positionRef: string; line: string; fate: StoryFate }>[] }>;

function storedRewriteOf(value: unknown): StoredRewrite | null {
  if (!isRecord(value) || !isRecord(value.text) || !Array.isArray(value.what_changed) || !Array.isArray(value.dig_paths)) return null;
  const fate = StoryFateSchema.safeParse(value.text.fate);
  if (typeof value.text.line !== "string" || typeof value.text.summary !== "string" || !fate.success) return null;
  const digPaths = value.dig_paths.flatMap((path: unknown) => {
    const pathFate = isRecord(path) ? StoryFateSchema.safeParse(path.fate) : null;
    return isRecord(path) && typeof path.position_ref === "string" && typeof path.line === "string" && pathFate?.success === true
      ? [Object.freeze({ positionRef: path.position_ref, line: path.line, fate: pathFate.data })] : [];
  });
  return Object.freeze({
    text: Object.freeze({ line: value.text.line, summary: value.text.summary, fate: fate.data }),
    whatChanged: Object.freeze(value.what_changed.filter((sentence): sentence is string => typeof sentence === "string")),
    viewReason: typeof value.view_reason === "string" ? value.view_reason : null,
    digPaths: Object.freeze(digPaths)
  });
}

/** An investigation's material read by its root: what a closing reads, and what an automatic main-answer update reads too. */
export type InvestigationInputReader = (rootRunId: string, earlier: Readonly<{ version: number; segments: readonly string[] }> | null)
  => Promise<InvestigationCloseInput | null>;

export function postgresInvestigationCloseSources(pool: Pool, log?: (event: string, detail: Record<string, unknown>) => void): InvestigationCloseSources & Readonly<{ investigationInputOf: InvestigationInputReader }> {
  const runs = new RunRepository(pool);
  const picks = new PostgresDigPicksRunnerRepository(pool);
  const digModel = new PostgresDigModelRunnerRepository(pool);
  const investigations = new PostgresInvestigationRunnerRepository(pool);

  const openRewrite = async (entry: PathRewriteEntry): Promise<StoredRewrite | null> => {
    if (entry.rewrite_id === null || entry.content === null || entry.content === undefined) return null;
    const opened = await withRunContentLease(pool, [entry.run_id], () => decryptContentForRun<unknown>(pool, entry.run_id,
      PATH_REWRITE_CARRIER, entry.rewrite_id!, entry.content as CryptoEnvelope, null));
    return storedRewriteOf(opened);
  };

  /** The text a turn was written on: its base rewrite's, else the parent's story line for the path (or its stored fate). */
  const beforeOf = async (entry: PathRewriteEntry, parentTurns: readonly PathRewriteEntry[], storyLine: (runId: string, ref: string) =>
    Promise<Readonly<{ line: string; fate: StoryFate }> | null>): Promise<DossierText> => {
    if (entry.based_on_rewrite_id !== null) {
      const base = parentTurns.find((candidate) => candidate.rewrite_id?.toLowerCase() === entry.based_on_rewrite_id!.toLowerCase());
      const text = base === undefined ? null : await openRewrite(base);
      if (text !== null) return text.text;
    }
    const story = await storyLine(entry.parent_run_id, entry.position_ref);
    return Object.freeze({ line: story?.line ?? "", summary: null, fate: story?.fate ?? entry.fate_before ?? "SET_ASIDE" });
  };

  const readInput = async (root: string, earlierAnswer: Parameters<InvestigationInputReader>[1], forReport: boolean): Promise<InvestigationCloseInput | null> => {
    const ask = await runs.readStoredAsk(root);
    const investigation = await investigations.ofRun(root);
    if (ask === null || investigation === null) return null;
    const story = await storyOf(pool, root);
    const stories = new Map<string, StoryRead | null>([[root.toLowerCase(), story]]);
    const storyLine = async (runId: string, ref: string) => {
      if (!stories.has(runId.toLowerCase())) stories.set(runId.toLowerCase(), await storyOf(pool, runId).catch(() => null));
      const path = stories.get(runId.toLowerCase())?.paths.find((candidate) => candidate.ref === ref);
      return path === undefined ? null : Object.freeze({ line: path.line, fate: path.fate });
    };
    const rootLine = await lineOf(pool, root);
    const paths: DossierPath[] = [];
    for (const path of story?.paths ?? []) {
      const pointIds = path.nodeRefs.filter((id) => id.toLowerCase() !== path.positionNodeId.toLowerCase());
      const points = await pointsOf(pool, root, pointIds);
      paths.push(Object.freeze({ ref: path.ref, storyLine: path.line, storyFate: path.fate, points,
        sources: await sourcesOfPoints(pool, root, points.map((point) => point.id)), current: rootLine.newest.get(path.ref) ?? null }));
    }
    const digs: DossierDig[] = [];
    const turnsOfParent = new Map<string, readonly PathRewriteEntry[]>();
    const members = [...investigation.members].filter((member) => member.parent_run_id !== null)
      .sort((a, b) => (a.run_id < b.run_id ? -1 : a.run_id > b.run_id ? 1 : 0));
    // A public dig its check did not allow is not part of the debate (decision 13), nor anything dug from it.
    const lines = new Map<string, Awaited<ReturnType<typeof lineOf>>>();
    for (const member of members) lines.set(member.run_id.toLowerCase(), await lineOf(pool, member.run_id));
    const hidden = new Set([...rootLine.hiddenDigs, ...[...lines.values()].flatMap((line) => [...line.hiddenDigs])]);
    for (let grew = hidden.size > 0; grew;) {
      grew = false;
      for (const member of members) {
        if (!hidden.has(member.run_id.toLowerCase()) && hidden.has(member.parent_run_id!.toLowerCase())) {
          hidden.add(member.run_id.toLowerCase());
          grew = true;
        }
      }
    }
    for (const member of members) {
      if (hidden.has(member.run_id.toLowerCase())) continue;
      const own = await picks.read(member.run_id);
      const level = await digModel.readDigLevel(member.run_id);
      const read = await digModel.readPathRewrites(member.run_id);
      const turn = read?.own ?? null;
      const parentRunId = own?.parentRunId ?? member.parent_run_id!;
      const newest = lines.get(member.run_id.toLowerCase())!.newest;
      if (!turnsOfParent.has(parentRunId.toLowerCase())) {
        turnsOfParent.set(parentRunId.toLowerCase(), (await digModel.readPathRewrites(parentRunId))?.paths ?? []);
      }
      let rewrite: DossierRewrite | null = null;
      if (turn !== null && turn.state !== "WRITING" && turn.rewrite_id !== null && turn.recorded_at !== null) {
        const before = await beforeOf(turn, turnsOfParent.get(parentRunId.toLowerCase())!, storyLine);
        const opened = turn.state === "FAILED" ? null : await openRewrite(turn).catch(() => null);
        const finished = opened !== null && turn.fate_after !== null;
        rewrite = Object.freeze({
          rewriteId: turn.rewrite_id, recordedAt: new Date(Date.parse(turn.recorded_at)).toISOString(),
          state: finished ? turn.state : "FAILED",
          before,
          after: finished ? Object.freeze({ ...opened.text, fate: turn.fate_after! }) : null,
          whatChanged: finished ? opened.whatChanged : [],
          view: finished && turn.verdict_outcome !== null && turn.verdict_scope !== null && opened.viewReason !== null
            ? Object.freeze({ outcome: turn.verdict_outcome, scope: turn.verdict_scope, reason: opened.viewReason }) : null,
          // Each of the dig's own paths at its newest text, when a deeper dig's change climbed to it.
          digPaths: finished ? Object.freeze(opened.digPaths.map((path) => {
            const update = newest.get(path.positionRef);
            return update === undefined ? path : Object.freeze({ positionRef: path.positionRef, line: update.line, fate: update.fate });
          })) : []
        });
      }
      const stored = own?.input?.value;
      const storedPaths: readonly PathRewriteDigPath[] = stored === undefined || stored === null ? [] : (() => {
        try { return storedDigPathsOf(stored); } catch { return []; }
      })();
      let digPaths: readonly PathRewriteDigPath[] = storedPaths;
      if (digPaths.length === 0) {
        // No paths stored (a dig under the main question, or one from before 0135): its own story's.
        if (!stories.has(member.run_id.toLowerCase())) stories.set(member.run_id.toLowerCase(), await storyOf(pool, member.run_id).catch(() => null));
        const ownStory = stories.get(member.run_id.toLowerCase()) ?? null;
        const fromStory: PathRewriteDigPath[] = [];
        for (const path of ownStory?.paths ?? []) {
          const ids = path.nodeRefs.filter((id) => id.toLowerCase() !== path.positionNodeId.toLowerCase());
          fromStory.push(Object.freeze({ positionRef: path.ref, statement: path.line, points: await pointsOf(pool, member.run_id, ids), extracts: Object.freeze([]) }));
        }
        digPaths = fromStory;
      }
      // Only what the AIs wrote: a stored path's extract words are dropped here, unread; its sources are the shown quotes.
      const aiText = Object.freeze(digPaths.map((path) => Object.freeze({ positionRef: path.positionRef, statement: path.statement,
        points: path.points, extracts: Object.freeze([]) })));
      const pointIds = aiText.flatMap((path) => path.points.map((point) => point.id));
      const ownMaterial: DossierDig["ownMaterial"] = aiText.length === 0 ? null : Object.freeze({
        answer: Object.freeze([]),
        paths: aiText,
        sources: await sourcesOfPoints(pool, member.run_id, pointIds)
      });
      digs.push(Object.freeze({
        runId: member.run_id, parentRunId, positionRef: own?.positionRef ?? null, level: Math.max(1, level),
        finishedAt: new Date(Date.parse(turn?.taken_at ?? member.joined_at)).toISOString(),
        picks: Object.freeze((own?.picks ?? []).map((pick) => Object.freeze({ text: pick.text, by: pick.author }))),
        rewrite, ownMaterial
      }));
    }
    const purpose = await purposeLinesOf(pool, root);
    const trustWords = new Map<string, TrustWord>();
    if (forReport) {
      const free = ask.planTier === "free";
      try {
        for (const [id, word] of await trustWordsOf(pool, root, free, paths.flatMap((path) => path.points.map((point) => point.id)))) trustWords.set(id, word);
        for (const dig of digs) {
          const ids = dig.ownMaterial?.paths.flatMap((path) => path.points.map((point) => point.id)) ?? [];
          for (const [id, word] of await trustWordsOf(pool, dig.runId, free, ids)) trustWords.set(id, word);
        }
      } catch (error) {
        log?.("INVESTIGATION_REPORT_TRUST_WORDS_UNREAD", { runId: root, code: error instanceof TypedDomainError ? error.code : error instanceof Error ? error.name : "UNTYPED" });
        trustWords.clear();
      }
    }
    return Object.freeze({
      free: ask.planTier === "free",
      questionLine: ask.questionLine,
      input: Object.freeze({
        question: Object.freeze({ line: ask.questionLine, place: purpose.place, time: purpose.time, purpose: purpose.purpose,
          readingLevel: readingLevelOf(ask.depthParams), language: null }),
        first: Object.freeze({ runId: root, answer: story?.answer ?? null, paths: Object.freeze(paths) }),
        digs: Object.freeze(digs),
        earlier: earlierAnswer,
        ...(trustWords.size === 0 ? {} : { trustWords })
      })
    });
  };

  return Object.freeze({
    investigationInputOf: (root, earlier) => readInput(root, earlier, false),
    inputOf: async (closing: UnreportedClosing, earlier: InvestigationReportsRead | null): Promise<InvestigationCloseInput | null> => {
      const root = closing.rootRunId;
      // F8 A: the newest finished version before this one, opened under the root's key.
      let earlierAnswer: Readonly<{ version: number; segments: readonly string[] }> | null = null;
      const prior = (earlier?.reports ?? []).filter((entry) => entry.report_version < closing.reportVersion
        && entry.outcome !== "FAILED" && entry.content !== null).sort((a, b) => b.report_version - a.report_version)[0];
      if (prior !== undefined) {
        const opened = await withRunContentLease(pool, [root], () => decryptContentForRun<unknown>(pool, root, INVESTIGATION_REPORT_CARRIER,
          prior.report_id, prior.content as CryptoEnvelope, null)).catch(() => null);
        const segments = storedReportAnswerOf(opened);
        if (segments !== null) earlierAnswer = Object.freeze({ version: prior.report_version, segments });
      }
      return readInput(root, earlierAnswer, true);
    }
  });
}

/** The closing's spend so far: INVESTIGATION_REPORT charges on the root run since its open closing began (0136). */
async function closingSpentMicros(pool: Pool, rootRunId: string): Promise<number> {
  const since = await new PostgresInvestigationReportRunnerRepository(pool).readClosingSince(rootRunId);
  if (since === null) return 0;
  const row = (await pool.query<{ spent: string | null }>(
    `SELECT COALESCE(sum(charge_micros), 0)::text AS spent FROM ledger.model_spend
      WHERE run_id = $1 AND spend_source = 'INVESTIGATION_REPORT' AND recorded_at >= $2`, [rootRunId, since])).rows[0];
  return Number(row?.spent ?? 0);
}

/**
 * The closing composed (main.ts): Claude Haiku 5.5 writes, GLM checks (owner F6; the rewrite's models), the runner's
 * configured members are the backups, each version sealed under the root's key, the recorded calls its replay book.
 * Absent when the configured targets hold no Haiku or no GLM.
 */
export function composeInvestigationClose(input: Readonly<{
  pool: Pool;
  targets: readonly Readonly<{ providerRef: string; model: string }>[];
  members: readonly Readonly<{ provider: ProviderGateway; providerRef: string; maker: string }>[];
  /** Each target's price (hosted); a target without one is counted at zero (local mode: free models). */
  priceOf: (providerRef: string) => ProviderTargetPrice | null;
  /** Decision 28: Anthropic's free token count for the writer's calls (main.ts). */
  tokenCount?: TokenCounter;
  /** Who pays when it is not the debate's owner (PUBLIC, decision 13). */
  payerOf?: (closing: UnreportedClosing, read: InvestigationCloseInput) => Promise<InvestigationReportPayer>;
  /** After a closing's row stands (RETENTION's wipe, decision 7; PUBLIC's reopening). */
  onReportSettled?: (settled: InvestigationReportSettled) => Promise<void> | void;
  log: (event: string, detail: Record<string, unknown>) => void;
}>): InvestigationCloseSettings | undefined {
  const writerRoleRef = input.targets.find((target) => target.model === PATH_REWRITE_WRITER_MODEL)?.providerRef;
  const checkerRoleRef = input.targets.find((target) => target.model === PATH_REWRITE_CHECKER_MODEL)?.providerRef;
  if (writerRoleRef === undefined || checkerRoleRef === undefined) return undefined;
  const pool = input.pool;
  const members = Object.freeze([...input.members]);
  return Object.freeze({
    reports: new PostgresInvestigationReportRunnerRepository(pool),
    sources: postgresInvestigationCloseSources(pool, input.log),
    seal: (rootRunId: string, reportId: string, content: InvestigationReportContent): Promise<WebSealed> =>
      withRunContentLease(pool, [rootRunId], async () => {
        const sealed = await encryptAttestedContentForRun(pool, rootRunId, INVESTIGATION_REPORT_CARRIER, reportId, content);
        if (sealed === null) throw new TypedDomainError("INVESTIGATION_REPORT_ENCRYPTION_REQUIRED", "A report is kept only under its root's run key");
        return sealed;
      }),
    roles: Object.freeze({
      resolveProvider: (roleRef: string) => {
        const member = members.find((candidate) => candidate.providerRef === roleRef);
        return member === undefined ? null : { provider: member.provider, providerRef: member.providerRef };
      },
      backupCandidates: members,
      backupMakers: Object.freeze(members.map((member) => Object.freeze({ providerRef: member.providerRef, maker: member.maker })))
    }),
    writerRoleRef,
    checkerRoleRef,
    admission: Object.freeze({
      spentMicros: (rootRunId: string) => closingSpentMicros(pool, rootRunId),
      projectedMicros: (request: ProviderCallRequest) => investigationReportProjectedMicros(request, input.priceOf(request.providerRef))
    }),
    reserveMicros: INVESTIGATION_REPORT_POLICY.reserveMicros,
    replayBookOf: (rootRunId: string, subject: string) => readReplayBook(pool, rootRunId, subject),
    ...(input.tokenCount === undefined ? {} : { tokenCount: input.tokenCount }),
    ...(input.payerOf === undefined ? {} : { payerOf: input.payerOf }),
    ...(input.onReportSettled === undefined ? {} : { onReportSettled: input.onReportSettled }),
    climbsOpen: async (rootRunId: string) => {
      const tree = new PostgresTreeUpdateRunnerRepository(pool);
      const members = (await new PostgresInvestigationRunnerRepository(pool).ofRun(rootRunId))?.members ?? [];
      let open = 0;
      for (const member of members) open += ((await tree.readLine(member.run_id)) ?? []).filter((entry) => entry.source === "PATH_UPDATE" && entry.state === "WRITING").length;
      return open;
    },
    log: input.log
  });
}

/** A call's projected maximum by the engine's own counting (packages/budget `projectedCallCeilingMicros`); 0 unpriced. */
export function investigationReportProjectedMicros(request: Pick<ProviderCallRequest, "packet" | "bound">, price: ProviderTargetPrice | null): number {
  if (price === null) return 0;
  return projectedCallCeilingMicros(price, { requestBytes: pathRewriteBodyBytes(request.packet), completionTokenCeiling: request.bound.tokenCeiling });
}
