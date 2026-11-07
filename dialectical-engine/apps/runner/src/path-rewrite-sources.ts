import {
  PATH_ID_PATTERN, PurposeLinesSchema, purposeLinesMaterial, readingLevelOf, StoryBodySchema, StoryFateSchema, type PathOutcome, type PurposeLines,
  type StoryFate
} from "@debateai/contract";
import {
  PATH_REWRITE_CARRIER, PATH_UPDATE_CARRIER, PostgresDigModelRunnerRepository, PostgresDigPicksRunnerRepository, PostgresPassageRetentionRepository,
  PostgresPathResultsRepository, PostgresStartPathsStore,
  PostgresTreeUpdateRunnerRepository, PostgresWebEvidenceRepository, RUN_PURPOSE_LINES_CARRIER, RunRepository, WEB_EVIDENCE_CARRIERS, WEB_SHOWN_QUOTE_CARRIER,
  decryptContentForRun, decryptLeasedContentForRun, prepareLeasedContentEncryptionForRun,
  withRunContentLease, type CryptoEnvelope, type Pool, type StoredStartPathSet
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { readStoryEnrichment } from "@debateai/story";
import type {
  PathRewriteDigPath, PathRewriteExtract, PathRewriteParentPath, PathRewritePoint
} from "./path-rewrite-material.js";
import type { PathRewriteDig, PathRewriteSources, PathRewriteStoredInput } from "./path-rewrite.js";

/**
 * THE PATH REWRITE'S SOURCES IN POSTGRESQL (dig-model revision task W3-7): what `runDigPathRewrite` and the sweep read
 * besides the settled run's snapshot, on the runner's pool (debateai_runtime), each sealed value opened under its own
 * run's key. Every read is deterministic for the same stored rows, so a rewrite run again sends the same prompts.
 *  - `digOf`: 0135's picks (null for a run that keeps none, or whose picks hang under the main question: it gets its
 *    story), 0134's level, the dig's own ask (Free, the reading level) and the main question: the investigation's first
 *    debate's question, found by walking the picks' parents up (a debate with no pick set is the first). The main
 *    question's place, time and purpose lines (R22 decision 5): 0138's, written at its ask; an old debate has none; the locked
 *    question language: not read here (null: the reply's language is checked against the question line).
 *  - `parentPathOf`: the path on the parent's latest story (its line and fate; the map's path ids, "<ref>#2" for a
 *    position argued twice), its text replaced by the base rewrite's (0134, opened under that dig's key) when there is
 *    one; its points are the story path's points (each node's own words), each pointing at the point it argues when that
 *    point is on the path too (core.edge), disputed when the second AI disputed it (ledger.node_review), no trust word;
 *    and only the checked extracts their locators name (0132, W3-3's rule). V4 start step, Task 55: on a path debate the
 *    path is named by its id b<n>, and the point left out is that path's root in force (0160), its own answer. Task 55b: with
 *    no rewrite or climb written on it yet, a path b<n>'s text is its answer so far (0160; a FAILED one: its question, SET_ASIDE).
 *  - `pathRootsOf`: a run's roots in force (0160), each by its path id; none for a run that is no path debate.
 *  - `digExtractsOf`: the same extract rule on the dig's own points, whose passages it may read (decision 6).
 *  - `recordInput` / `storedInputOf`: 0135's identity.path_rewrite_input, the dig's own paths as `{ v: 2, dig_paths }`.
 *  - `parentCodesOf`: clear codes only, for a FAILED row (the base rewrite's version and fate, else the story's).
 */

const LOCATOR_EXTRACT_IDS = /(?<![A-Za-z0-9])S[0-9]{1,4}-[0-9]{1,4}(?![0-9])/gu;
/** R22 (decision 7): version 2 keeps no quote: a passage stored here would outlive the wipe. It is read back by its label. */
const INPUT_VERSION = 2;
const DIG_CHAIN_MAX = 12;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const unread = (what: string): never => { throw new TypedDomainError("PATH_REWRITE_SOURCE_UNREAD", what); };

type StoryPathRead = Readonly<{ answerVersion: number; positionNodeId: string; line: string; fate: StoryFate; nodeRefs: readonly string[] }>;

/** The parent's latest story path with the map's id `pathId`; null when the parent has no story or no such path. */
async function storyPathOf(pool: Pool, runId: string, pathId: string): Promise<StoryPathRead | null> {
  const row = (await pool.query<{ story_id: string; answer_version: number; content: unknown; content_ciphertext: CryptoEnvelope | null }>(
    `SELECT story.story_id::text AS story_id, story.answer_version, story.content, story.content_ciphertext
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
  for (const path of body.data.short.paths) {
    const times = (seen.get(path.position_ref) ?? 0) + 1;
    seen.set(path.position_ref, times);
    if ((times === 1 ? path.position_ref : `${path.position_ref}#${String(times)}`) !== pathId) continue;
    return Object.freeze({ answerVersion: Number(row.answer_version), positionNodeId: path.position_ref, line: path.line, fate: path.fate,
      nodeRefs: Object.freeze([...path.node_refs]) });
  }
  return null;
}

/**
 * What each point's locator names, in the locator's order, each once, with reader 1's note on its page. Decision 6:
 * "PASSAGE" is the dig's own rewrite right after it: the checked extract while it is stored (0139 holds it until that
 * rewrite is written), else its shown quote. "SHOWN" is every older debate's: only the shown quote, whether or not its
 * passages are still stored, so what a later prompt reads never depends on when the sweep ran.
 */
async function extractsOfPoints(pool: Pool, runId: string, pointIds: readonly string[], read: "PASSAGE" | "SHOWN"): Promise<ReadonlyMap<string, readonly PathRewriteExtract[]>> {
  const result = new Map<string, PathRewriteExtract[]>();
  if (pointIds.length === 0) return result;
  const located = (await pool.query<{ node_id: string; locator: string | null }>(
    "SELECT node_id::text AS node_id, locator FROM core.node WHERE run_id = $1 AND node_id = ANY($2::uuid[])", [runId, [...pointIds]])).rows;
  const named = located.flatMap((row) => [...new Set(row.locator?.match(LOCATOR_EXTRACT_IDS) ?? [])].map((label) => ({ pointId: row.node_id, label })));
  if (named.length === 0) return result;
  const evidence = await new PostgresWebEvidenceRepository(pool).read(runId);
  const shownQuotes = (await new PostgresPassageRetentionRepository(pool).readShownQuotes(runId)) ?? [];
  if (evidence === null || shownQuotes.length === 0) return result;
  const callerId = new Map(pointIds.map((id) => [id.toLowerCase(), id] as const));
  const cipher = await prepareLeasedContentEncryptionForRun(pool, runId);
  try {
    for (const { pointId, label } of named) {
      const shown = shownQuotes.find((candidate) => candidate.label === label);
      const page = shown === undefined ? undefined : evidence.pages.find((candidate) => candidate.page_id === shown.page_id);
      if (shown === undefined || page === undefined) continue;
      const extract = read === "PASSAGE" ? evidence.extracts.find((candidate) => candidate.label === label) : undefined;
      const quote = extract === undefined
        ? decryptLeasedContentForRun<unknown>(cipher, WEB_SHOWN_QUOTE_CARRIER, shown.extract_id, shown.content, null)
        : decryptLeasedContentForRun<unknown>(cipher, WEB_EVIDENCE_CARRIERS.extract, extract.extract_id, extract.content, null);
      const about = decryptLeasedContentForRun<unknown>(cipher, WEB_EVIDENCE_CARRIERS.page, page.page_id, page.content, null);
      if (!isRecord(quote) || typeof quote.quote !== "string" || !isRecord(about) || typeof about.site !== "string") continue;
      const reading = evidence.readings.find((candidate) => candidate.page_id === page.page_id && candidate.reader === 1 && candidate.outcome === "READ" && candidate.content !== null);
      const opened = reading === undefined ? null : decryptLeasedContentForRun<unknown>(cipher, WEB_EVIDENCE_CARRIERS.reading, reading.reading_id, reading.content, null);
      const id = callerId.get(pointId.toLowerCase()) ?? pointId;
      result.set(id, [...(result.get(id) ?? []), Object.freeze({ pointId: id, label, site: about.site,
        title: typeof about.title === "string" ? about.title : null, quote: quote.quote,
        ...(isRecord(opened) && typeof opened.note === "string" && opened.note !== "" ? { note: opened.note } : {}) })]);
    }
    await cipher.assertLive();
  } finally {
    await cipher.close();
  }
  return result;
}

/** The story path's points: each node's own words, in the story's order, the point it argues when that one is here too. */
export async function pointsOf(pool: Pool, runId: string, nodeIds: readonly string[]): Promise<readonly PathRewritePoint[]> {
  if (nodeIds.length === 0) return [];
  const nodes = (await pool.query<{ node_id: string; claim_text: string; content_ciphertext: CryptoEnvelope | null }>(
    "SELECT node_id::text AS node_id, claim_text, content_ciphertext FROM core.node WHERE run_id = $1 AND node_id = ANY($2::uuid[])",
    [runId, [...nodeIds]])).rows;
  const edges = (await pool.query<{ source_node_id: string; target_node_id: string; polarity: "support" | "attack" }>(
    `SELECT edge.source_node_id::text AS source_node_id, edge.target_node_id::text AS target_node_id, edge.polarity
       FROM core.edge AS edge
      WHERE edge.run_id = $1 AND edge.source_node_id = ANY($2::uuid[]) AND edge.target_node_id IS NOT NULL
      ORDER BY edge.edge_id`, [runId, [...nodeIds]])).rows;
  const reviews = (await pool.query<{ node_id: string; outcome: string }>(
    `SELECT review.node_id::text AS node_id, review.outcome FROM ledger.node_review AS review
      WHERE review.run_id = $1 AND review.node_id = ANY($2::uuid[]) ORDER BY review.at_seq`, [runId, [...nodeIds]])).rows;
  const disputed = new Map<string, boolean>();
  for (const review of reviews) disputed.set(review.node_id.toLowerCase(), review.outcome === "dispute");
  const here = new Set(nodeIds.map((id) => id.toLowerCase()));
  const texts = await withRunContentLease(pool, [runId], async () => {
    const cipher = await prepareLeasedContentEncryptionForRun(pool, runId);
    try {
      return new Map(nodes.map((node) => {
        const opened = decryptLeasedContentForRun<unknown>(cipher, "core.node", node.node_id, node.content_ciphertext, { claimText: node.claim_text });
        return [node.node_id.toLowerCase(), isRecord(opened) && typeof opened.claimText === "string" ? opened.claimText : unread("core.node")] as const;
      }));
    } finally {
      await cipher.close();
    }
  });
  return Object.freeze(nodeIds.flatMap((id) => {
    const text = texts.get(id.toLowerCase());
    if (text === undefined) return [];
    const edge = edges.find((candidate) => candidate.source_node_id.toLowerCase() === id.toLowerCase());
    const on = edge !== undefined && here.has(edge.target_node_id.toLowerCase())
      ? nodeIds.find((other) => other.toLowerCase() === edge.target_node_id.toLowerCase())! : null;
    return [Object.freeze({ id, text, onId: on, side: edge === undefined ? null : edge.polarity === "support" ? "for" as const : "against" as const,
      trust: null, disputed: disputed.get(id.toLowerCase()) === true })];
  }));
}

function storedPoint(value: unknown): PathRewritePoint {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.text !== "string"
    || !(value.onId === null || typeof value.onId === "string") || !(value.side === null || value.side === "for" || value.side === "against")
    || !(value.trust === null || typeof value.trust === "string") || typeof value.disputed !== "boolean") return unread("point");
  return Object.freeze({ id: value.id, text: value.text, onId: value.onId, side: value.side, trust: value.trust, disputed: value.disputed });
}
function storedExtractPoint(value: unknown): string {
  if (!isRecord(value) || typeof value.pointId !== "string" || typeof value.label !== "string") return unread("extract");
  return value.pointId;
}
/**
 * 0135's stored dig paths, checked member by member (the same objects `pathRewriteDigPathsOf` built), with each path's
 * extracts read again by `extractsOf` (stored as labels only): the same bytes while the dig's passages are held.
 */
export function storedDigPathsOf(value: unknown, extractsOf: ReadonlyMap<string, readonly PathRewriteExtract[]> = new Map()): readonly PathRewriteDigPath[] {
  if (!isRecord(value) || value.v !== INPUT_VERSION || !Array.isArray(value.dig_paths)) return unread("input");
  return Object.freeze(value.dig_paths.map((path: unknown) => {
    if (!isRecord(path) || typeof path.positionRef !== "string" || typeof path.statement !== "string"
      || !Array.isArray(path.points) || !Array.isArray(path.extracts)) return unread("dig path");
    const cited = new Set(path.extracts.map(storedExtractPoint));
    const points = Object.freeze(path.points.map(storedPoint));
    return Object.freeze({ positionRef: path.positionRef, statement: path.statement, points,
      extracts: Object.freeze(points.flatMap((point) => cited.has(point.id) ? extractsOf.get(point.id) ?? [] : [])) });
  }));
}

/** R22 decisions 5 and 29: a debate's step-2 lines, opened under its own key; null when it has none (an old debate). */
export async function purposeLinesOf(pool: Pool, runId: string): Promise<PurposeLines | null> {
  const sealed = await new PostgresTreeUpdateRunnerRepository(pool).readPurposeLines(runId);
  if (sealed === null) return null;
  const opened = await withRunContentLease(pool, [runId], () => decryptContentForRun<unknown>(pool, runId, RUN_PURPOSE_LINES_CARRIER, runId, sealed, null));
  const parsed = PurposeLinesSchema.safeParse(opened);
  return parsed.success ? parsed.data : null;
}

/**
 * V4 start step, Task 55b: a path debate's path b<n> before any rewrite or climb: its answer so far (its line, summary and fate); a FAILED
 * one is named as not finished (its question, SET_ASIDE). Null when no answer so far is stored for it (the story's line stands).
 */
export function pathOutcomeBaseOf(set: StoredStartPathSet, outcomes: ReadonlyMap<string, PathOutcome>, pathId: string):
  Readonly<{ line: string; summary: string | null; fate: StoryFate }> | null {
  const outcome = outcomes.get(pathId);
  if (outcome === undefined) return null;
  if (outcome.state !== "FAILED" && outcome.text !== null) {
    return Object.freeze({ line: outcome.text.line, summary: outcome.text.summary, fate: outcome.text.fate });
  }
  const question = set.paths.find((path) => path.pathId === pathId)?.question;
  return question === undefined ? null : Object.freeze({ line: question, summary: null, fate: "SET_ASIDE" as const });
}

/** What 0135's row keeps of the dig's paths: each extract by its point and label, never its words (decision 7). */
export function digPathsForStore(digPaths: readonly PathRewriteDigPath[]): Readonly<{ v: number; dig_paths: readonly unknown[] }> {
  return Object.freeze({ v: INPUT_VERSION, dig_paths: digPaths.map((path) =>
    Object.freeze({ ...path, extracts: path.extracts.map(({ pointId, label }) => Object.freeze({ pointId, label })) })) });
}

export function postgresPathRewriteSources(pool: Pool): PathRewriteSources {
  const picks = new PostgresDigPicksRunnerRepository(pool);
  const digModel = new PostgresDigModelRunnerRepository(pool);
  const runs = new RunRepository(pool);
  const tree = new PostgresTreeUpdateRunnerRepository(pool);
  const pathResults = new PostgresPathResultsRepository(pool);
  /** V4 start step, Task 55: a path debate's roots in force (ids and codes only, no lease), each by its path id; [] for any other run. */
  const pathRootsOf = async (runId: string): Promise<readonly Readonly<{ ref: string; rootNodeId: string }>[]> =>
    Object.freeze((await pathResults.readPathRoots(runId)).filter((root) => !root.stale)
      .map((root) => Object.freeze({ ref: root.pathId, rootNodeId: root.rootNodeId })));
  const startPaths = new PostgresStartPathsStore(pool);
  /** V4 start step, Task 55b: a path debate's path's answer so far as its first text (`pathOutcomeBaseOf`); null on any other run. */
  const outcomeBaseOf = async (runId: string, pathId: string) => {
    if (await startPaths.readStartPathIds(runId) === null) return null;
    const set = await startPaths.readStartPaths(runId);
    return set === null ? null : pathOutcomeBaseOf(set, await pathResults.readPathOutcomes(runId), pathId);
  };

  const rewriteText = async (parentRunId: string, baseRewriteId: string) => {
    const entry = (await digModel.readPathRewrites(parentRunId))?.paths.find((candidate) => candidate.rewrite_id === baseRewriteId);
    if (entry === undefined || entry.parent_answer_version === null || entry.fate_after === null) return unread("base rewrite");
    return entry;
  };

  const updateTextOf = async (parentRunId: string, updateId: string) => {
    const entry = (await tree.readLine(parentRunId))?.find((candidate) => candidate.source === "PATH_UPDATE" && candidate.entry_id?.toLowerCase() === updateId.toLowerCase());
    if (entry === undefined || entry.content === null) return unread("base update");
    const opened = await withRunContentLease(pool, [entry.run_id], () => decryptContentForRun<unknown>(pool, entry.run_id,
      PATH_UPDATE_CARRIER, updateId, entry.content, null));
    const written = isRecord(opened) && isRecord(opened.text) ? opened.text : null;
    const fate = StoryFateSchema.safeParse(written?.fate);
    if (written === null || typeof written.line !== "string" || typeof written.summary !== "string" || !fate.success) return unread("base update text");
    return Object.freeze({ line: written.line, summary: written.summary, fate: fate.data });
  };

  /**
   * R22 decision 1: one path of a dig, for the dig dug from it. Its points and sources are what the dig's settled run gave its own
   * rewrite (0135's stored paths); its line and fate are what that rewrite wrote for it (`dig_paths`). A dig whose own rewrite failed or
   * is still writing has no such line: its answer on that path stands, and its fate is not known. Null: no such path, or nothing stored.
   */
  const digPathOf = async (parentRunId: string, positionRef: string): Promise<Readonly<{ answerVersion: number; line: string; fate: StoryFate;
    rewritten: boolean; points: readonly PathRewritePoint[]; extracts: readonly PathRewriteExtract[] }> | null> => {
    const stored = (await picks.read(parentRunId))?.input?.value;
    if (stored === undefined || stored === null) return null;
    const path = storedDigPathsOf(stored).find((candidate) => candidate.positionRef.toLowerCase() === positionRef.toLowerCase());
    if (path === undefined) return null;
    const version = (await pool.query<{ answer_version: number }>(
      "SELECT answer_version FROM serve.answer WHERE run_id = $1 ORDER BY answer_version DESC LIMIT 1", [parentRunId])).rows[0];
    const answerVersion = version === undefined ? 1 : Number(version.answer_version);
    const own = (await digModel.readPathRewrites(parentRunId))?.own ?? null;
    let written: Readonly<{ line: string; fate: StoryFate }> | null = null;
    if (own !== null && (own.state === "READY" || own.state === "READY_WITH_RESERVATION") && own.rewrite_id !== null) {
      const opened = await withRunContentLease(pool, [parentRunId], () => decryptContentForRun<unknown>(pool, parentRunId,
        PATH_REWRITE_CARRIER, own.rewrite_id!, (own.content ?? null) as CryptoEnvelope | null, null));
      const line = isRecord(opened) && Array.isArray(opened.dig_paths) ? opened.dig_paths.find((candidate: unknown) => isRecord(candidate)
        && typeof candidate.position_ref === "string" && candidate.position_ref.toLowerCase() === positionRef.toLowerCase()) as unknown : undefined;
      const fate = isRecord(line) ? StoryFateSchema.safeParse(line.fate) : null;
      if (isRecord(line) && typeof line.line === "string" && fate?.success === true) written = Object.freeze({ line: line.line, fate: fate.data });
    }
    return Object.freeze({ answerVersion, line: written?.line ?? path.statement, fate: written?.fate ?? "SET_ASIDE",
      rewritten: written !== null, points: path.points, extracts: path.extracts });
  };

  return Object.freeze({
    digOf: async (runId: string): Promise<PathRewriteDig | null> => {
      const own = await picks.read(runId);
      if (own === null || own.positionRef === null) return null;
      const level = await digModel.readDigLevel(runId);
      if (level < 1) return null;
      let root = own.parentRunId;
      for (let hops = 0; hops < DIG_CHAIN_MAX; hops += 1) {
        const above = await picks.read(root);
        if (above === null) break;
        root = above.parentRunId;
      }
      const ask = await runs.readStoredAsk(runId);
      const main = await runs.readStoredAsk(root);
      if (ask === null || main === null) return unread("ask");
      // Decision 5: the step-2 lines are the first debate's, written at its ask; an old debate has none. Decision 29: its question already says them.
      const lines = purposeLinesMaterial(main.questionLine, await purposeLinesOf(pool, root));
      return Object.freeze({
        parentRunId: own.parentRunId, positionRef: own.positionRef, level, free: ask.planTier === "free",
        question: Object.freeze({ line: main.questionLine, place: lines.place, time: lines.time, purpose: lines.purpose,
          readingLevel: readingLevelOf(ask.depthParams), language: null }),
        picks: Object.freeze(own.picks.map((pick) => Object.freeze({ text: pick.text, by: pick.author })))
      });
    },
    parentPathOf: async ({ parentRunId, positionRef, baseRewriteId, baseUpdateId }): Promise<PathRewriteParentPath> => {
      const story = await storyPathOf(pool, parentRunId, positionRef);
      // R22 decision 1: a dig has no story, so a path of a dig (a dig of level 2 or deeper is dug from one) is read from that dig.
      const digPath = story === null ? await digPathOf(parentRunId, positionRef) : null;
      if (story === null && digPath === null) return unread("parent path");
      let text: Readonly<{ answerVersion: number; line: string; summary: string | null; fate: StoryFate }> = story !== null
        ? { answerVersion: story.answerVersion, line: story.line, summary: null, fate: story.fate }
        : { answerVersion: digPath!.answerVersion, line: digPath!.line, summary: null, fate: digPath!.fate };
      if (baseRewriteId !== null) {
        const entry = await rewriteText(parentRunId, baseRewriteId);
        const opened = await withRunContentLease(pool, [entry.run_id], () => decryptContentForRun<unknown>(pool, entry.run_id,
          PATH_REWRITE_CARRIER, baseRewriteId, (entry.content ?? null) as CryptoEnvelope | null, null));
        const written = isRecord(opened) && isRecord(opened.text) ? opened.text : null;
        const fate = StoryFateSchema.safeParse(written?.fate);
        if (written === null || typeof written.line !== "string" || typeof written.summary !== "string" || !fate.success) return unread("base text");
        text = { answerVersion: entry.parent_answer_version!, line: written.line, summary: written.summary, fate: fate.data };
      } else if (baseUpdateId !== null && baseUpdateId !== undefined) {
        // R22 decision 2: the path's newest text is a climb's row, sealed under the dig that started the climb.
        const written = await updateTextOf(parentRunId, baseUpdateId);
        text = { answerVersion: text.answerVersion, line: written.line, summary: written.summary, fate: written.fate };
      } else if (PATH_ID_PATTERN.test(positionRef) && digPath?.rewritten !== true) {
        // V4 start step, Task 55b: a path debate's path b<n> that nothing rewrote yet stands as its answer so far (FAILED: its question).
        // Review of Task 88 (R22 decision 1, r22-end-to-end path 4): a dig's path b<n> that the dig's own rewrite wrote a line for
        // was rewritten: that line stands, never the dig's answer so far under it.
        const base = await outcomeBaseOf(parentRunId, positionRef);
        if (base !== null) text = { answerVersion: text.answerVersion, line: base.line, summary: base.summary, fate: base.fate };
      }
      if (digPath !== null) {
        return Object.freeze({ positionRef, answerVersion: text.answerVersion, line: text.line, summary: text.summary, fate: text.fate,
          points: digPath.points, extracts: digPath.extracts });
      }
      // The path's own answer is its line, not one of its points: on R22 the story path's position; on a path debate (V4 start step,
      // Task 55) the path is named by its id b<n>, and its answer is that path's root in force.
      const ownAnswer = PATH_ID_PATTERN.test(positionRef)
        ? (await pathRootsOf(parentRunId)).find((root) => root.ref === positionRef)?.rootNodeId ?? story!.positionNodeId : story!.positionNodeId;
      const pointIds = story!.nodeRefs.filter((id) => id.toLowerCase() !== ownAnswer.toLowerCase());
      const points = await pointsOf(pool, parentRunId, pointIds);
      // Decision 6: the parent is an older debate: AI text and the shown quote, never a passage.
      const extracts = await extractsOfPoints(pool, parentRunId, points.map((point) => point.id), "SHOWN");
      return Object.freeze({ positionRef, answerVersion: text.answerVersion, line: text.line, summary: text.summary, fate: text.fate,
        points, extracts: Object.freeze(points.flatMap((point) => extracts.get(point.id) ?? [])) });
    },
    readEnrichment: (input) => readStoryEnrichment(pool, input),
    digExtractsOf: (runId, pointIds) => extractsOfPoints(pool, runId, pointIds, "PASSAGE"),
    pathRootsOf,
    recordInput: (runId, workItemId, digPaths) => picks.recordInput(runId, workItemId, digPathsForStore(digPaths)),
    storedInputOf: async (runId: string): Promise<PathRewriteStoredInput | null> => {
      const input = (await picks.read(runId))?.input ?? null;
      if (input === null) return null;
      const stored = storedDigPathsOf(input.value);
      const extracts = await extractsOfPoints(pool, runId, stored.flatMap((path) => path.points.map((point) => point.id)), "PASSAGE");
      return Object.freeze({ workItemId: input.workItemId, digPaths: storedDigPathsOf(input.value, extracts) });
    },
    parentCodesOf: async ({ parentRunId, positionRef, baseRewriteId }) => {
      if (baseRewriteId !== null) {
        const entry = await rewriteText(parentRunId, baseRewriteId);
        return Object.freeze({ answerVersion: entry.parent_answer_version!, fate: entry.fate_after! });
      }
      const story = await storyPathOf(pool, parentRunId, positionRef).catch(() => null);
      // V4 start step, Task 55b: a path debate's path b<n> was first written as its answer so far: its fate is the one before.
      const base = PATH_ID_PATTERN.test(positionRef) ? await outcomeBaseOf(parentRunId, positionRef).catch(() => null) : null;
      if (story !== null) return Object.freeze({ answerVersion: story.answerVersion, fate: base?.fate ?? story.fate });
      const version = (await pool.query<{ answer_version: number }>(
        "SELECT answer_version FROM serve.answer WHERE run_id = $1 ORDER BY answer_version DESC LIMIT 1", [parentRunId])).rows[0];
      return Object.freeze({ answerVersion: version === undefined ? 1 : Number(version.answer_version), fate: base?.fate ?? "SET_ASIDE" });
    }
  });
}
