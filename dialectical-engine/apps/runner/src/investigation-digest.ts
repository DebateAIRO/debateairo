// apps/runner/src/investigation-digest.ts
import { PATH_ID_PATTERN, StoryBodySchema, type PublicMaterial, type PublicMaterialPath } from "@debateai/contract";
import {
  PATH_REWRITE_CARRIER, PostgresDigModelRunnerRepository, PostgresDigPicksRunnerRepository, PostgresInvestigationRunnerRepository,
  PostgresPathResultsRepository, PostgresWebEvidenceRepository, RunRepository, WEB_EVIDENCE_CARRIERS, decryptContentForRun,
  decryptLeasedContentForRun, prepareLeasedContentEncryptionForRun, withOwnRunContentLease, withRunContentLease, type CryptoEnvelope,
  type Pool
} from "@debateai/db";
import { pointsOf, storedDigPathsOf } from "./path-rewrite-sources.js";
import { openPublicMaterial } from "./public-tree-sources.js";
import { addedPagesOf } from "./web-researched-read.js";

/**
 * WHAT THE WHOLE DEBATE ALREADY INVESTIGATED (R22 decision 9 and W4-3; owner Q7, 31 Oct: "it should already know the points
 * already investigated in this whole debate, so only new POV or deeper insights that could change the dig path should be
 * included"). The digest a dig's planners and the suggestions on its own paths read.
 *
 * Plain words: every debate of the investigation before this dig, each with its paths' lines and what became of them, their
 * points, what its dig changed, the searches it sent and what reader 1 wrote about each page it read. AI text only (R22
 * decision 6): points, verdicts and notes. NEVER a passage: a stored dig path's `extracts`, a pack and an extract are not
 * opened or read here, and neither is a page's text. The one quote read is the 120-character one of a page the person added.
 *
 * - A dig has no story: its paths are the ones 0135 stored for its rewrite, with the lines its rewrite wrote for them. So a
 *   dig below level 1 plans from its parent dig's own AI text.
 * - Same bytes on a re-claim: only what was stored before `cutAt` is read (the dig's joining the investigation for its
 *   planners, its stored paths for its suggestions), in a fixed order, so a sibling that settles meanwhile changes nothing.
 *   A member with no key, or erased, is left out; nothing here stops the dig.
 * - V4 start step, Task 55d: the runner reads this inside the dig's own content lease, which may never widen to another debate.
 *   Each other debate is read under a short lease of its own, outside the dig's (`withOwnRunContentLease`); one whose lease cannot
 *   be had in time (an erasure holds it) is left out like an erased one.
 * - A path debate's story names a path by its id b<n> (Task 55d, as Task 55's parentPathOf): the point left out of that path's
 *   points is its root in force (0159), its own answer (`storyPathPointIds`).
 * - The size: at most DIG_INVESTIGATED_MAX_BYTES, cut by code. Every line first (the dig's own line of parents, nearest first,
 *   then the others in the order they joined), then what the digs changed, then the points, then the notes and searches,
 *   each kept while the whole still fits (`investigatedText`).
 */

/** The most bytes of the digest: about 16,000 tokens at the estimate's 2 bytes a token (WEB_DIG_INVESTIGATED_TOKENS). */
export const DIG_INVESTIGATED_MAX_BYTES = 32_000 as const;

export type InvestigatedPoint = Readonly<{ text: string; side: "for" | "against" | null; disputed: boolean }>;
export type InvestigatedPath = Readonly<{ line: string; fate: string | null; points: readonly InvestigatedPoint[] }>;
export type InvestigatedNote = Readonly<{ site: string; title: string | null; note: string }>;
/** W4-4: a page the person added to researched that added to the argument: reader 1's note and its shown quotes (0139), never a passage. */
export type InvestigatedAddedPage = Readonly<{ site: string; title: string | null; note: string | null; quotes: readonly string[] }>;
export type InvestigatedDebate = Readonly<{
  /** 0 for this dig's nearest parent, 1 for the one above it, …; null for a debate that is not in its line of parents. */
  nearness: number | null;
  /** What this debate's dig changed in the path above it, sentence by sentence (none for the first debate). */
  changed: readonly string[];
  paths: readonly InvestigatedPath[];
  searched: readonly string[];
  notes: readonly InvestigatedNote[];
  /** W4-4 (owner Q-D9): pages added to researched, which the next dig and report weigh; absent when none. */
  added?: readonly InvestigatedAddedPage[];
}>;

const fits = (value: unknown, max: number): boolean => Buffer.byteLength(JSON.stringify(value), "utf8") <= max;

/**
 * The digest as the prompt carries it, at most `maxBytes`, the same bytes every time. Debates keep their given order; what is
 * added first (in nearness order, then the given order) is what survives a large investigation: lines, then what changed,
 * then points, then notes and searches. Pure.
 */
export function investigatedText(debates: readonly InvestigatedDebate[], maxBytes: number = DIG_INVESTIGATED_MAX_BYTES): string {
  type Shown = { changed: string[]; paths: { line: string; fate: string | null; points: InvestigatedPoint[] }[]; searched: string[]; notes: InvestigatedNote[]; added: InvestigatedAddedPage[] };
  const shown: Shown[] = debates.map(() => ({ changed: [], paths: [], searched: [], notes: [], added: [] }));
  const order = debates.map((_, at) => at).sort((left, right) =>
    (debates[left]!.nearness ?? Number.MAX_SAFE_INTEGER) - (debates[right]!.nearness ?? Number.MAX_SAFE_INTEGER) || left - right);
  const whole = (): unknown => shown.map((debate) => ({ ...(debate.changed.length === 0 ? {} : { changed: debate.changed }), paths: debate.paths,
    ...(debate.searched.length === 0 ? {} : { searched: debate.searched }), ...(debate.notes.length === 0 ? {} : { notes: debate.notes }),
    ...(debate.added.length === 0 ? {} : { added: debate.added }) }));
  // One addition at a time, taken back when the whole no longer fits.
  const tryAdd = <T>(list: T[], item: T): void => {
    list.push(item);
    if (!fits(whole(), maxBytes)) list.pop();
  };
  for (const at of order) for (const path of debates[at]!.paths) tryAdd(shown[at]!.paths, { line: path.line, fate: path.fate, points: [] });
  for (const at of order) for (const sentence of debates[at]!.changed) tryAdd(shown[at]!.changed, sentence);
  for (const at of order) {
    const kept = new Map(shown[at]!.paths.map((path) => [path.line, path] as const));
    for (const path of debates[at]!.paths) {
      const target = kept.get(path.line);
      if (target !== undefined) for (const point of path.points) tryAdd(target.points, point);
    }
  }
  // W4-4: a page the person chose comes before the notes the readers wrote on every page they read.
  for (const at of order) for (const page of debates[at]!.added ?? []) tryAdd(shown[at]!.added, page);
  for (const at of order) {
    for (const note of debates[at]!.notes) tryAdd(shown[at]!.notes, note);
    for (const words of debates[at]!.searched) tryAdd(shown[at]!.searched, words);
  }
  return JSON.stringify(whole());
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const before = (at: string | null | undefined, cutAt: string): boolean => typeof at === "string" && Date.parse(at) <= Date.parse(cutAt);
const lower = (id: string): string => id.toLowerCase();

const asPoint = (point: Readonly<{ text: string; side: "for" | "against" | null; disputed: boolean }>): InvestigatedPoint =>
  Object.freeze({ text: point.text, side: point.side, disputed: point.disputed });

/**
 * The ids of a story path's points: the nodes it names, without the path's own answer. On R22 that answer is the story path's
 * position (its `position_ref`). On a path debate (V4 start step, Task 55d; Task 55's rule in parentPathOf) the path is named by its
 * id b<n>, and its answer is that path's root in force (0159), which `roots` names; with none read, only the id is left out. Pure.
 */
export function storyPathPointIds(path: Readonly<{ position_ref: string; node_refs: readonly string[] }>,
  roots: readonly Readonly<{ ref: string; rootNodeId: string }>[]): readonly string[] {
  const ownAnswer = PATH_ID_PATTERN.test(path.position_ref)
    ? roots.find((root) => root.ref === path.position_ref)?.rootNodeId ?? path.position_ref : path.position_ref;
  return Object.freeze(path.node_refs.filter((id) => lower(id) !== lower(ownAnswer)));
}

/** The newest story of a debate as of `cutAt`, its paths with their points; none when it has no story by then. */
async function storyPathsOf(pool: Pool, runId: string, cutAt: string): Promise<readonly InvestigatedPath[]> {
  const row = (await pool.query<{ story_id: string; content: unknown; content_ciphertext: CryptoEnvelope | null }>(
    `SELECT story.story_id::text AS story_id, story.content, story.content_ciphertext
       FROM serve.answer_story AS story
      WHERE story.run_id = $1 AND story.created_at <= $2
      ORDER BY story.answer_version DESC, story.created_at DESC
      LIMIT 1`, [runId, cutAt])).rows[0];
  if (row === undefined) return [];
  const content = await withRunContentLease(pool, [runId], () =>
    decryptContentForRun<unknown>(pool, runId, "serve.answer_story", row.story_id, row.content_ciphertext, row.content));
  const body = StoryBodySchema.nullable().safeParse(isRecord(content) ? content.body : undefined);
  if (!body.success || body.data === null) return [];
  // A path debate's roots in force (ids only), read only when its story names a path by its id b<n>: an R22 story reads nothing more.
  const roots = body.data.short.paths.some((path) => PATH_ID_PATTERN.test(path.position_ref))
    ? (await new PostgresPathResultsRepository(pool).readPathRoots(runId)).filter((root) => !root.stale)
      .map((root) => Object.freeze({ ref: root.pathId, rootNodeId: root.rootNodeId }))
    : [];
  const paths: InvestigatedPath[] = [];
  for (const path of body.data.short.paths) {
    const points = await pointsOf(pool, runId, storyPathPointIds(path, roots));
    paths.push(Object.freeze({ line: path.line, fate: path.fate, points: Object.freeze(points.map(asPoint)) }));
  }
  return Object.freeze(paths);
}

/**
 * A dig's text from what 0135 stored for its rewrite and what its rewrite sealed: its own paths with the lines the rewrite wrote
 * for them, their points, and what it changed. Never the stored paths' `extracts`: those hold passages (R22 decision 6).
 */
export function digDebateTextOf(storedInput: unknown, opened: unknown): Pick<InvestigatedDebate, "changed" | "paths"> {
  const lines = isRecord(opened) && Array.isArray(opened.dig_paths) ? opened.dig_paths : [];
  const lineOf = (positionRef: string): Readonly<{ line: string; fate: string | null }> | null => {
    const found = lines.find((entry: unknown) => isRecord(entry) && entry.position_ref === positionRef) as Record<string, unknown> | undefined;
    return found !== undefined && typeof found.line === "string" ? { line: found.line, fate: typeof found.fate === "string" ? found.fate : null } : null;
  };
  const changed = isRecord(opened) && Array.isArray(opened.what_changed)
    ? opened.what_changed.filter((sentence): sentence is string => typeof sentence === "string") : [];
  return Object.freeze({
    changed: Object.freeze(changed),
    paths: Object.freeze(storedDigPathsOf(storedInput).map((path) => {
      const line = lineOf(path.positionRef);
      return Object.freeze({ line: line?.line ?? path.statement, fate: line?.fate ?? null, points: Object.freeze(path.points.map(asPoint)) });
    }))
  });
}

/** A dig's text as of `cutAt`: nothing when it had stored no paths by then (it was still running). */
async function digTextOf(pool: Pool, runId: string, cutAt: string): Promise<Pick<InvestigatedDebate, "changed" | "paths"> | null> {
  const stored = (await new PostgresDigPicksRunnerRepository(pool).read(runId))?.input ?? null;
  if (stored === null || !before(stored.recordedAt, cutAt)) return null;
  const own = (await new PostgresDigModelRunnerRepository(pool).readPathRewrites(runId))?.own ?? null;
  const opened = own === null || own.rewrite_id === null || own.content === null || own.content === undefined || !before(own.recorded_at, cutAt) ? null
    : await withRunContentLease(pool, [runId], () => decryptContentForRun<unknown>(pool, runId, PATH_REWRITE_CARRIER, own.rewrite_id!,
      own.content as CryptoEnvelope, null));
  return digDebateTextOf(stored.value, opened);
}

/** What a debate's web step wrote before `cutAt`: the searches it sent, reader 1's note on each page and the pages added to researched. Never a passage. */
async function webTextOf(pool: Pool, runId: string, cutAt: string): Promise<Pick<InvestigatedDebate, "searched" | "notes" | "added">> {
  const evidence = await new PostgresWebEvidenceRepository(pool).read(runId);
  if (evidence === null || evidence.searches.length === 0) return Object.freeze({ searched: Object.freeze([]), notes: Object.freeze([]) });
  const leased = await prepareLeasedContentEncryptionForRun(pool, runId);
  try {
    if (leased.prepared === null) return Object.freeze({ searched: Object.freeze([]), notes: Object.freeze([]) });
    const open = (carrier: (typeof WEB_EVIDENCE_CARRIERS)[keyof typeof WEB_EVIDENCE_CARRIERS], id: string, envelope: CryptoEnvelope | null): unknown =>
      decryptLeasedContentForRun<unknown>(leased, carrier, id, envelope, null);
    const searched = evidence.searches.flatMap((search) => {
      if (search.content === null || !before(search.searched_at, cutAt)) return [];
      const opened = open(WEB_EVIDENCE_CARRIERS.search, search.search_id, search.content);
      return isRecord(opened) && typeof opened.query === "string" ? [opened.query] : [];
    });
    const notes = evidence.readings.flatMap((reading): InvestigatedNote[] => {
      if (reading.reader !== 1 || reading.outcome !== "READ" || reading.content === null || !before(reading.read_at, cutAt)) return [];
      const page = evidence.pages.find((candidate) => candidate.page_id === reading.page_id);
      const line = open(WEB_EVIDENCE_CARRIERS.reading, reading.reading_id, reading.content);
      const about = page === undefined ? null : open(WEB_EVIDENCE_CARRIERS.page, page.page_id, page.content);
      if (!isRecord(line) || typeof line.line !== "string" || !isRecord(about) || typeof about.site !== "string") return [];
      return [Object.freeze({ site: about.site, title: typeof about.title === "string" ? about.title : null, note: line.line })];
    });
    const added = await addedPagesOf(pool, runId, evidence, (carrier, id, envelope) => decryptLeasedContentForRun<unknown>(leased, carrier, id, envelope, null), cutAt);
    await leased.assertLive();
    return Object.freeze({ searched: Object.freeze([...new Set(searched)]), notes: Object.freeze(notes), ...(added.length === 0 ? {} : { added: Object.freeze(added.map((page) => Object.freeze({
      site: page.site, title: page.title, note: page.note, quotes: page.quotes }))) }) });
  } finally {
    await leased.close();
  }
}

/** What the public copy says was investigated, in the digest's own shape: the first debate's paths and each allowed dig's. */
function publicDebatesOf(copy: PublicMaterial): readonly InvestigatedDebate[] {
  const pathsOf = (paths: readonly PublicMaterialPath[]) => Object.freeze(paths.map((path) => Object.freeze({ line: path.line, fate: path.fate, points: Object.freeze(path.points.map((point) => Object.freeze({ text: point.text, side: point.side, disputed: point.disputed }))) })));
  return Object.freeze([
    Object.freeze({ nearness: null, changed: Object.freeze([]), paths: pathsOf(copy.paths), notes: Object.freeze(copy.paths.flatMap((path) => path.extracts.flatMap((extract) => extract.note === null ? [] : [{ site: extract.site, title: extract.title, note: extract.note }]))), searched: Object.freeze([]) }),
    ...copy.digs.map((dig) => Object.freeze({ nearness: null, changed: Object.freeze([...dig.what_changed]), paths: pathsOf(dig.paths), notes: Object.freeze([]), searched: Object.freeze([]) }))
  ]);
}

/**
 * The digest for `runId`, on the runner's pool: the investigation's other debates that joined by `cutAt`. Null `cutAt`
 * (the run is in no investigation yet): nothing known, "[]".
 */
export async function readAlreadyInvestigated(pool: Pool, runId: string, cutAt: string | null): Promise<string> {
  // Decision 13: a dig on a public debate knows what the page shows and nothing else: never a private dig, never someone's refused one.
  const copy = await openPublicMaterial(pool, runId).catch(() => null);
  if (copy !== null) return investigatedText(publicDebatesOf(copy));
  if (cutAt === null) return "[]";
  const investigation = await new PostgresInvestigationRunnerRepository(pool).ofRun(runId);
  if (investigation === null) return "[]";
  const picks = new PostgresDigPicksRunnerRepository(pool);
  // The line of parents: the nearest first, walking up the members' own links.
  const parentOf = new Map(investigation.members.map((member) => [lower(member.run_id), member.parent_run_id] as const));
  const nearness = new Map<string, number>();
  let above = parentOf.get(lower(runId)) ?? null;
  for (let hops = 0; above !== null && hops < 12; hops += 1) {
    nearness.set(lower(above), hops);
    above = parentOf.get(lower(above)) ?? null;
  }
  const debates: InvestigatedDebate[] = [];
  for (const member of investigation.members) {
    if (lower(member.run_id) === lower(runId) || !before(member.joined_at, cutAt)) continue;
    try {
      // Task 55d: under the member's own short lease, outside this run's (which the runner holds here and which may not widen).
      const debate = await withOwnRunContentLease(pool, member.run_id, async (): Promise<InvestigatedDebate | null> => {
        const isDig = (await picks.read(member.run_id)) !== null;
        const text = isDig ? await digTextOf(pool, member.run_id, cutAt)
          : { changed: Object.freeze([]), paths: await storyPathsOf(pool, member.run_id, cutAt) };
        // A dig still running at the cut has stored nothing yet: nothing of it is known.
        if (text === null) return null;
        const web = await webTextOf(pool, member.run_id, cutAt);
        if (text.paths.length === 0 && web.notes.length === 0 && web.searched.length === 0) return null;
        return Object.freeze({ nearness: nearness.get(lower(member.run_id)) ?? null, ...text, ...web });
      });
      if (debate !== null) debates.push(debate);
    } catch {
      // A member that is erased or cannot be opened is left out: the digest is what can be read, and it never stops the dig.
    }
  }
  return investigatedText(debates);
}

/** What a first debate's suggestions need from its stored ask and newest story: Free or not, and the story's "what would change it". */
export function firstDebateSuggestionFacts(pool: Pool): (runId: string) => Promise<Readonly<{ free: boolean; wouldChangeIt: string | null }>> {
  return async (runId) => {
    const ask = await new RunRepository(pool).readStoredAsk(runId);
    if (ask === null || ask.planTier === "free") return Object.freeze({ free: true, wouldChangeIt: null });
    const row = (await pool.query<{ story_id: string; content: unknown; content_ciphertext: CryptoEnvelope | null }>(
      `SELECT story.story_id::text AS story_id, story.content, story.content_ciphertext FROM serve.answer_story AS story
        WHERE story.run_id = $1 ORDER BY story.answer_version DESC, story.created_at DESC LIMIT 1`, [runId])).rows[0];
    if (row === undefined) return Object.freeze({ free: false, wouldChangeIt: null });
    const content = await withRunContentLease(pool, [runId], () =>
      decryptContentForRun<unknown>(pool, runId, "serve.answer_story", row.story_id, row.content_ciphertext, row.content));
    const body = StoryBodySchema.nullable().safeParse(isRecord(content) ? content.body : undefined);
    return Object.freeze({ free: false, wouldChangeIt: body.success ? body.data?.short.change.text ?? null : null });
  };
}
