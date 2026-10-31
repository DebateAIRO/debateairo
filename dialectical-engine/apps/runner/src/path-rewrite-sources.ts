import { readingLevelOf, StoryBodySchema, StoryFateSchema, type StoryFate } from "@debateai/contract";
import {
  PATH_REWRITE_CARRIER, PostgresDigModelRunnerRepository, PostgresDigPicksRunnerRepository, PostgresWebEvidenceRepository,
  RunRepository, WEB_EVIDENCE_CARRIERS, decryptContentForRun, decryptLeasedContentForRun, prepareLeasedContentEncryptionForRun,
  withRunContentLease, type CryptoEnvelope, type Pool
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
 *    question's place, time and purpose lines: none are stored by the asks route, so none; the locked question
 *    language: not read here (null: the reply's language is checked against the question line).
 *  - `parentPathOf`: the path on the parent's latest story (its line and fate; the map's path ids, "<ref>#2" for a
 *    position argued twice), its text replaced by the base rewrite's (0134, opened under that dig's key) when there is
 *    one; its points are the story path's points (each node's own words), each pointing at the point it argues when that
 *    point is on the path too (core.edge), disputed when the second AI disputed it (ledger.node_review), no trust word;
 *    and only the checked extracts their locators name (0132, W3-3's rule).
 *  - `digExtractsOf`: the same extract rule on the dig's own points.
 *  - `recordInput` / `storedInputOf`: 0135's identity.path_rewrite_input, the dig's own paths as `{ v: 1, dig_paths }`.
 *  - `parentCodesOf`: clear codes only, for a FAILED row (the base rewrite's version and fate, else the story's).
 */

const LOCATOR_EXTRACT_IDS = /(?<![A-Za-z0-9])S[0-9]{1,4}-[0-9]{1,4}(?![0-9])/gu;
const INPUT_VERSION = 1;
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

/** The checked extracts each point's locator names, in the locator's order, each once. */
async function extractsOfPoints(pool: Pool, runId: string, pointIds: readonly string[]): Promise<ReadonlyMap<string, readonly PathRewriteExtract[]>> {
  const result = new Map<string, PathRewriteExtract[]>();
  if (pointIds.length === 0) return result;
  const located = (await pool.query<{ node_id: string; locator: string | null }>(
    "SELECT node_id::text AS node_id, locator FROM core.node WHERE run_id = $1 AND node_id = ANY($2::uuid[])", [runId, [...pointIds]])).rows;
  const named = located.flatMap((row) => [...new Set(row.locator?.match(LOCATOR_EXTRACT_IDS) ?? [])].map((label) => ({ pointId: row.node_id, label })));
  if (named.length === 0) return result;
  const evidence = await new PostgresWebEvidenceRepository(pool).read(runId);
  if (evidence === null || evidence.extracts.length === 0) return result;
  const callerId = new Map(pointIds.map((id) => [id.toLowerCase(), id] as const));
  const cipher = await prepareLeasedContentEncryptionForRun(pool, runId);
  try {
    for (const { pointId, label } of named) {
      const extract = evidence.extracts.find((candidate) => candidate.label === label);
      const page = extract === undefined ? undefined : evidence.pages.find((candidate) => candidate.page_id === extract.page_id);
      if (extract === undefined || page === undefined) continue;
      const quote = decryptLeasedContentForRun<unknown>(cipher, WEB_EVIDENCE_CARRIERS.extract, extract.extract_id, extract.content, null);
      const about = decryptLeasedContentForRun<unknown>(cipher, WEB_EVIDENCE_CARRIERS.page, page.page_id, page.content, null);
      if (!isRecord(quote) || typeof quote.quote !== "string" || !isRecord(about) || typeof about.site !== "string") continue;
      const id = callerId.get(pointId.toLowerCase()) ?? pointId;
      result.set(id, [...(result.get(id) ?? []), Object.freeze({ pointId: id, label, site: about.site,
        title: typeof about.title === "string" ? about.title : null, quote: quote.quote })]);
    }
    await cipher.assertLive();
  } finally {
    await cipher.close();
  }
  return result;
}

/** The story path's points: each node's own words, in the story's order, the point it argues when that one is here too. */
async function pointsOf(pool: Pool, runId: string, nodeIds: readonly string[]): Promise<readonly PathRewritePoint[]> {
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
function storedExtract(value: unknown): PathRewriteExtract {
  if (!isRecord(value) || typeof value.pointId !== "string" || typeof value.label !== "string" || typeof value.site !== "string"
    || !(value.title === null || typeof value.title === "string") || typeof value.quote !== "string") return unread("extract");
  return Object.freeze({ pointId: value.pointId, label: value.label, site: value.site, title: value.title, quote: value.quote });
}
/** 0135's stored dig paths, checked member by member (the same objects `pathRewriteDigPathsOf` built). */
export function storedDigPathsOf(value: unknown): readonly PathRewriteDigPath[] {
  if (!isRecord(value) || value.v !== INPUT_VERSION || !Array.isArray(value.dig_paths)) return unread("input");
  return Object.freeze(value.dig_paths.map((path: unknown) => {
    if (!isRecord(path) || typeof path.positionRef !== "string" || typeof path.statement !== "string"
      || !Array.isArray(path.points) || !Array.isArray(path.extracts)) return unread("dig path");
    return Object.freeze({ positionRef: path.positionRef, statement: path.statement,
      points: Object.freeze(path.points.map(storedPoint)), extracts: Object.freeze(path.extracts.map(storedExtract)) });
  }));
}

export function postgresPathRewriteSources(pool: Pool): PathRewriteSources {
  const picks = new PostgresDigPicksRunnerRepository(pool);
  const digModel = new PostgresDigModelRunnerRepository(pool);
  const runs = new RunRepository(pool);

  const rewriteText = async (parentRunId: string, baseRewriteId: string) => {
    const entry = (await digModel.readPathRewrites(parentRunId))?.paths.find((candidate) => candidate.rewrite_id === baseRewriteId);
    if (entry === undefined || entry.parent_answer_version === null || entry.fate_after === null) return unread("base rewrite");
    return entry;
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
      return Object.freeze({
        parentRunId: own.parentRunId, positionRef: own.positionRef, level, free: ask.planTier === "free",
        question: Object.freeze({ line: main.questionLine, place: null, time: null, purpose: null,
          readingLevel: readingLevelOf(ask.depthParams), language: null }),
        picks: Object.freeze(own.picks.map((pick) => Object.freeze({ text: pick.text, by: pick.author })))
      });
    },
    parentPathOf: async ({ parentRunId, positionRef, baseRewriteId }): Promise<PathRewriteParentPath> => {
      const story = await storyPathOf(pool, parentRunId, positionRef);
      if (story === null) return unread("parent story path");
      let text: Readonly<{ answerVersion: number; line: string; summary: string | null; fate: StoryFate }> =
        { answerVersion: story.answerVersion, line: story.line, summary: null, fate: story.fate };
      if (baseRewriteId !== null) {
        const entry = await rewriteText(parentRunId, baseRewriteId);
        const opened = await withRunContentLease(pool, [entry.run_id], () => decryptContentForRun<unknown>(pool, entry.run_id,
          PATH_REWRITE_CARRIER, baseRewriteId, (entry.content ?? null) as CryptoEnvelope | null, null));
        const written = isRecord(opened) && isRecord(opened.text) ? opened.text : null;
        const fate = StoryFateSchema.safeParse(written?.fate);
        if (written === null || typeof written.line !== "string" || typeof written.summary !== "string" || !fate.success) return unread("base text");
        text = { answerVersion: entry.parent_answer_version!, line: written.line, summary: written.summary, fate: fate.data };
      }
      const pointIds = story.nodeRefs.filter((id) => id.toLowerCase() !== story.positionNodeId.toLowerCase());
      const points = await pointsOf(pool, parentRunId, pointIds);
      const extracts = await extractsOfPoints(pool, parentRunId, points.map((point) => point.id));
      return Object.freeze({ positionRef, answerVersion: text.answerVersion, line: text.line, summary: text.summary, fate: text.fate,
        points, extracts: Object.freeze(points.flatMap((point) => extracts.get(point.id) ?? [])) });
    },
    readEnrichment: (input) => readStoryEnrichment(pool, input),
    digExtractsOf: (runId, pointIds) => extractsOfPoints(pool, runId, pointIds),
    recordInput: (runId, workItemId, digPaths) => picks.recordInput(runId, workItemId, { v: INPUT_VERSION, dig_paths: digPaths }),
    storedInputOf: async (runId: string): Promise<PathRewriteStoredInput | null> => {
      const input = (await picks.read(runId))?.input ?? null;
      return input === null ? null : Object.freeze({ workItemId: input.workItemId, digPaths: storedDigPathsOf(input.value) });
    },
    parentCodesOf: async ({ parentRunId, positionRef, baseRewriteId }) => {
      if (baseRewriteId !== null) {
        const entry = await rewriteText(parentRunId, baseRewriteId);
        return Object.freeze({ answerVersion: entry.parent_answer_version!, fate: entry.fate_after! });
      }
      const story = await storyPathOf(pool, parentRunId, positionRef).catch(() => null);
      if (story !== null) return Object.freeze({ answerVersion: story.answerVersion, fate: story.fate });
      const version = (await pool.query<{ answer_version: number }>(
        "SELECT answer_version FROM serve.answer WHERE run_id = $1 ORDER BY answer_version DESC LIMIT 1", [parentRunId])).rows[0];
      return Object.freeze({ answerVersion: version === undefined ? 1 : Number(version.answer_version), fate: "SET_ASIDE" as const });
    }
  });
}
