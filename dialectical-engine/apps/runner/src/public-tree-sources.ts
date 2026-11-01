import {
  PublicMaterialSchema, StoryFateSchema, cutQuoteAtWordEdge, readingLevelOf, type PublicMaterial, type PublicMaterialPath, type StoryFate
} from "@debateai/contract";
import {
  MAIN_ANSWER_UPDATE_CARRIER, PATH_UPDATE_CARRIER, PUBLIC_ANSWER_UPDATE_CARRIER, PUBLIC_DIG_INPUT_CARRIER, PUBLIC_MATERIAL_CARRIER, PostgresDigPicksRunnerRepository, PostgresPublicDebateRunnerRepository,
  PostgresPublicTreeRunnerRepository, PostgresTreeUpdateRunnerRepository, RunRepository, decryptContentForRun, encryptAttestedContentForRun, withRunContentLease,
  type PathLineEntry, type Pool, type PublicContributionRead, type WebSealed
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { InvestigationCloseInput } from "./investigation-close.js";
import type { DossierDig, DossierInput, DossierPath, DossierText } from "./investigation-dossier.js";
import type { MainAnswerContent, TreeUpdatePorts } from "./path-climb.js";
import type { PathRewriteDigPath, PathRewriteExtract, PathRewriteParentPath, PathRewritePoint } from "./path-rewrite-material.js";
import type { PathRewriteContent, PathRewriteDig, PathRewriteSources } from "./path-rewrite.js";
import { postgresPathRewriteSources, storedDigPathsOf } from "./path-rewrite-sources.js";
import { readReplayBook } from "./run-replay.js";

/**
 * THE PUBLIC TREE'S SOURCES (plan 2026-10-31-r22-owner-changes decisions 13 and 22; migration 0147). What a dig on a public debate reads, whoever it belongs to, whether or not the
 * first author is still here. The rule is short: THE PUBLIC COPY, AND NOTHING ELSE.
 *  - The API read the page under the publication's key and sealed it again under the dig's own run key (`identity.public_material`). Everything about the debate comes from that row:
 *    the question, the answer, the paths and their points. So a stranger's prompts cannot hold the author's private digs, their purpose lines, or another digger's refused dig, and a
 *    root whose key is gone costs nothing. The page's ids are all it names: never a run id.
 *  - The one thing newer than the copy: a contribution ALLOWED after the copy was made, on the path line 0138 keeps, opened under its digger's key. Only a row whose contribution is
 *    ALLOWED counts; the author's private rewrites on the same line, and a held or refused dig, never do. The newer of the two wins (`written_at`); a digger who erased their account
 *    leaves no row, and the page's copy of their text stands.
 *  - What the dig made of itself (its picks, its stored paths) is its own, under its own key.
 * WHY THE LINE IS SAFE TO READ: 0147's identity.read_public_path_line lists every row of a path, private ones too, and the runner holds every live key, so this is a rule of code, not a
 * key boundary. It holds in one place: `allowedTextsOf` is the only reader of those rows' text here, and it opens a row only when it is a PATH_UPDATE whose dig's contribution is ALLOWED. A 0134
 * rewrite of the author's is never opened; its id may stand as a turn's "based on", which is bookkeeping and carries no text. tests/integration/public-tree-flow.test.ts holds this.
 * THE MAIN ANSWER: while the root's key lives, 0138's row under the root's key, so its author's page shows it too. Once it is gone, 0147's row under the dig's key. Either way the API's
 * sweep copies it to the page, under the publication's key.
 */

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
const unread = (what: string): never => { throw new TypedDomainError("PUBLIC_TREE_SOURCE_UNREAD", what); };

/** The copy sealed for this dig or this report's carrier. Null: there is none. */
export async function openPublicMaterial(pool: Pool, materialId: string): Promise<PublicMaterial | null> {
  const row = await new PostgresPublicTreeRunnerRepository(pool).readMaterial(materialId);
  if (row === null) return null;
  const opened = await withRunContentLease(pool, [row.run_id], () => decryptContentForRun<unknown>(pool, row.run_id, PUBLIC_MATERIAL_CARRIER, materialId, row.content, null));
  return PublicMaterialSchema.parse(opened);
}

const pointsOfPath = (path: PublicMaterialPath): readonly PathRewritePoint[] => Object.freeze(path.points.map((point) => Object.freeze({
  id: point.id, text: point.text, onId: point.on_id, side: point.side, trust: null, disputed: point.disputed })));
const extractsOfPath = (path: PublicMaterialPath): readonly PathRewriteExtract[] => Object.freeze(path.extracts.map((extract) => Object.freeze({
  pointId: extract.point_id, label: extract.label, site: extract.site, title: extract.title, quote: extract.quote, ...(extract.note === null ? {} : { note: extract.note }) })));

/** The dig's own paths as its settled run stored them, with each cited extract read again by its label (decision 6: its own passages, right after it). */
export async function readPublicDigInput(pool: Pool, digRunId: string, extractsOf: PathRewriteSources["digExtractsOf"]): Promise<Readonly<{ workItemId: string; digPaths: readonly PathRewriteDigPath[] }> | null> {
  const row = await new PostgresPublicTreeRunnerRepository(pool).readDigInput(digRunId);
  if (row === null) return null;
  const opened = await withRunContentLease(pool, [digRunId], () => decryptContentForRun<unknown>(pool, digRunId, PUBLIC_DIG_INPUT_CARRIER, digRunId.toLowerCase(), row.content, null));
  const stored = storedDigPathsOf(opened);
  const extracts = extractsOf === undefined ? new Map() : await extractsOf(digRunId, stored.flatMap((path) => path.points.map((point) => point.id)));
  return Object.freeze({ workItemId: row.work_item_id, digPaths: storedDigPathsOf(opened, extracts) });
}

/** A path of the debate or of an allowed dig, by the map's id. */
export function publicPathOf(material: PublicMaterial, positionRef: string): PublicMaterialPath | null {
  const key = positionRef.toLowerCase();
  return material.paths.find((path) => path.ref.toLowerCase() === key)
    ?? material.digs.flatMap((dig) => dig.paths).find((path) => path.ref.toLowerCase() === key) ?? null;
}

const textOfContent = (value: unknown): Readonly<{ line: string; summary: string; fate: StoryFate }> | null => {
  if (!isRecord(value) || !isRecord(value.text)) return null;
  const fate = StoryFateSchema.safeParse(value.text.fate);
  return typeof value.text.line === "string" && typeof value.text.summary === "string" && fate.success
    ? Object.freeze({ line: value.text.line, summary: value.text.summary, fate: fate.data }) : null;
};

/** A row of the line is a public text only when its dig's contribution is ALLOWED: the author's private rewrites and a held or refused dig never are. */
async function allowedTextsOf(pool: Pool, line: readonly PathLineEntry[]): Promise<ReadonlyMap<string, Readonly<{ written_at: string; line: string; summary: string; fate: StoryFate }>>> {
  const contributions = new PostgresPublicDebateRunnerRepository(pool);
  const allowed = new Map<string, boolean>();
  const newest = new Map<string, { written_at: string; line: string; summary: string; fate: StoryFate }>();
  for (const entry of line) {
    if (entry.source !== "PATH_UPDATE" || entry.held || entry.hidden || entry.entry_id === null || entry.content === null || entry.recorded_at === null
      || (entry.state !== "READY" && entry.state !== "READY_WITH_RESERVATION")) continue;
    const key = entry.run_id.toLowerCase();
    if (!allowed.has(key)) allowed.set(key, (await contributions.readContribution(entry.run_id))?.outcome === "ALLOWED");
    if (allowed.get(key) !== true) continue;
    const opened = await withRunContentLease(pool, [entry.run_id], () => decryptContentForRun<unknown>(pool, entry.run_id, PATH_UPDATE_CARRIER, entry.entry_id!, entry.content, null)).catch(() => null);
    const text = textOfContent(opened);
    if (text !== null) newest.set(entry.position_ref.toLowerCase(), { written_at: entry.recorded_at, ...text });
  }
  return newest;
}

/** The dig's level, by walking its contributions up. */
async function levelOf(tree: PostgresPublicTreeRunnerRepository, runId: string): Promise<number> {
  let level = 0;
  let at: string | null = runId;
  while (at !== null && level < 12) {
    const next = await tree.readClimbNext(at);
    if (next === null) break;
    level += 1;
    at = next.parent_run_id;
  }
  return level;
}

/**
 * The dossier the report's own writer reads, from the copy alone (decisions 13 and 26). `newer`: paths written since the copy; `own`: the dig that triggered this version, not yet on
 * the page. Run ids never appear: the page's references name every dig.
 */
export function dossierFromMaterial(material: PublicMaterial, input: Readonly<{
  newer?: ReadonlyMap<string, Readonly<{ written_at: string; line: string; summary: string; fate: StoryFate }>>;
  own?: DossierDig;
  earlier: Readonly<{ version: number; segments: readonly string[] }> | null;
}>): DossierInput {
  const current = (path: PublicMaterialPath): DossierText | null => {
    const newer = input.newer?.get(path.ref.toLowerCase());
    if (newer !== undefined && (path.written_at === null || newer.written_at > path.written_at)) return Object.freeze({ line: newer.line, summary: newer.summary, fate: newer.fate });
    return path.written_at === null ? null : Object.freeze({ line: path.line, summary: path.summary, fate: path.fate });
  };
  const paths: readonly DossierPath[] = Object.freeze(material.paths.map((path) => Object.freeze({
    ref: path.ref, storyLine: path.story_line, storyFate: path.story_fate, points: pointsOfPath(path),
    sources: Object.freeze(path.extracts.map((extract) => Object.freeze({ pointId: extract.point_id, site: extract.site, link: extract.link, title: extract.title,
      quote: cutQuoteAtWordEdge(extract.quote), line: extract.note }))),
    current: current(path)
  })));
  const digs: readonly DossierDig[] = Object.freeze(material.digs.map((dig) => {
    const before = publicPathOf(material, dig.position_ref);
    const digPaths: readonly PathRewriteDigPath[] = Object.freeze(dig.paths.map((path) => Object.freeze({ positionRef: path.ref, statement: path.line,
      points: pointsOfPath(path), extracts: extractsOfPath(path) })));
    return Object.freeze({
      runId: dig.ref, parentRunId: dig.parent_ref ?? material.publication_ref, positionRef: dig.position_ref, level: dig.level, finishedAt: dig.contributed_at, picks: Object.freeze([]),
      rewrite: Object.freeze({ rewriteId: dig.ref, recordedAt: dig.contributed_at, state: "READY" as const,
        before: Object.freeze({ line: before?.story_line ?? dig.line, summary: null, fate: before?.story_fate ?? dig.fate }),
        after: Object.freeze({ line: dig.line, summary: dig.summary, fate: dig.fate }),
        whatChanged: Object.freeze([...dig.what_changed]), view: null,
        digPaths: Object.freeze(dig.paths.map((path) => Object.freeze({ positionRef: path.ref, line: path.line, fate: path.fate }))) }),
      ownMaterial: Object.freeze({ answer: Object.freeze([]), paths: digPaths, sources: Object.freeze([]) })
    });
  }));
  return Object.freeze({
    question: Object.freeze({ line: material.question, place: null, time: null, purpose: null, readingLevel: null, language: null }),
    first: Object.freeze({ runId: material.publication_ref, answer: material.answer, paths }),
    digs: input.own === undefined ? digs : Object.freeze([...digs, input.own]),
    earlier: input.earlier
  });
}

/** Whether the root's key still lives: 0138's reader answers null once it does not. */
const rootLives = async (tree: PostgresTreeUpdateRunnerRepository, rootRunId: string): Promise<boolean> => (await tree.readMainAnswers(rootRunId)) !== null;

/** What the climb reads for one public dig (`climbFrom` and `writePublicDigLevel`'s ports). The copy is read once per dig. */
export function publicTreePortsOf(pool: Pool, digRunId: string): TreeUpdatePorts {
  const publicTree = new PostgresPublicTreeRunnerRepository(pool);
  const liveTree = new PostgresTreeUpdateRunnerRepository(pool);
  const contributions = new PostgresPublicDebateRunnerRepository(pool);
  const picks = new PostgresDigPicksRunnerRepository(pool);
  const runs = new RunRepository(pool);
  const own = postgresPathRewriteSources(pool);
  let copy: Promise<PublicMaterial | null> | null = null;
  const material = async (): Promise<PublicMaterial> => {
    copy ??= openPublicMaterial(pool, digRunId);
    return (await copy) ?? unread("copy");
  };
  /** The path's newest public text, whichever is newer: the copy's, or an allowed contribution's since. */
  const parentPathOf = async (parentRunId: string, positionRef: string): Promise<PathRewriteParentPath> => {
    const page = await material();
    const path = publicPathOf(page, positionRef) ?? ownPathOf(await ownPaths(), positionRef) ?? unread("public path");
    const newer = await allowedTextsOf(pool, (await publicTree.readLine(parentRunId)) ?? []);
    const after = newer.get(positionRef.toLowerCase());
    const useNewer = after !== undefined && (path.written_at === null || after.written_at > path.written_at);
    return Object.freeze({ positionRef, answerVersion: 1, line: useNewer ? after.line : path.line, summary: useNewer ? after.summary : path.summary, fate: useNewer ? after.fate : path.fate,
      points: pointsOfPath(path), extracts: extractsOfPath(path) });
  };
  /** The dig's own stored paths, for its own rewrite's first level and a climb through it. */
  const storedInput = async (): Promise<Readonly<{ workItemId: string; digPaths: readonly PathRewriteDigPath[] }> | null> => readPublicDigInput(pool, digRunId, own.digExtractsOf);
  const ownPaths = async (): Promise<readonly PathRewriteDigPath[]> => (await storedInput())?.digPaths ?? [];
  const ownPathOf = (paths: readonly PathRewriteDigPath[], positionRef: string): PublicMaterialPath | null => {
    const found = paths.find((path) => path.positionRef.toLowerCase() === positionRef.toLowerCase());
    return found === undefined ? null : { ref: found.positionRef, story_line: found.statement, story_fate: "SET_ASIDE", line: found.statement, summary: null, fate: "SET_ASIDE", written_at: null,
      points: found.points.map((point) => ({ id: point.id, text: point.text, on_id: point.onId, side: point.side, disputed: point.disputed })), extracts: [] };
  };
  const sealUnder = (runId: string, carrier: string, id: string, content: unknown, failure: string): Promise<WebSealed> => withRunContentLease(pool, [runId], async () => {
    const sealed = await encryptAttestedContentForRun(pool, runId, carrier as never, id, content);
    if (sealed === null) throw new TypedDomainError(failure, "Kept only under its run's key");
    return sealed;
  });
  return Object.freeze({
    tree: Object.freeze({
      takeTurn: (input) => publicTree.takeTurn(input),
      readTurn: (updateId) => publicTree.readTurn(updateId),
      record: (record) => publicTree.record(record),
      readLine: (runId) => publicTree.readLine(runId),
      readClimbNext: (runId) => publicTree.readClimbNext(runId),
      readMainAnswers: async (runId) => (await liveTree.readMainAnswers(runId)) ?? publicTree.readGoneAnswers(runId),
      recordMainAnswer: async (record) => {
        if (await rootLives(liveTree, record.rootRunId)) return liveTree.recordMainAnswer(record);
        const stored = await publicTree.recordGoneAnswer(record);
        return Object.freeze({ outcome: stored.outcome === "NOT_PUBLIC" ? "NOT_LIVE" as const : stored.outcome, answerSeq: stored.answerSeq });
      }
    }) satisfies TreeUpdatePorts["tree"],
    digOf: async (runId: string): Promise<PathRewriteDig | null> => {
      const contribution: PublicContributionRead | null = await contributions.readContribution(runId);
      if (contribution === null || contribution.position_ref === null) return null;
      const [ask, kept, page] = [await runs.readStoredAsk(runId), await picks.read(runId), await material()];
      if (ask === null) return unread("ask");
      return Object.freeze({ parentRunId: contribution.parent_run_id, positionRef: contribution.position_ref, level: await levelOf(publicTree, runId), free: ask.planTier === "free",
        question: Object.freeze({ line: page.question, place: null, time: null, purpose: null, readingLevel: readingLevelOf(ask.depthParams), language: null }),
        picks: Object.freeze((kept?.picks ?? []).map((pick) => Object.freeze({ text: pick.text, by: pick.author }))) });
    },
    ownRewriteOf: async () => null,
    parentPathOf: ({ parentRunId, positionRef }) => parentPathOf(parentRunId, positionRef),
    childOf: async (runId: string) => {
      if (runId.toLowerCase() === digRunId.toLowerCase()) {
        const kept = await picks.read(runId);
        const stored = await storedInput();
        if (kept === null || stored === null) return null;
        return Object.freeze({ picks: Object.freeze(kept.picks.map((pick) => Object.freeze({ text: pick.text, by: pick.author }))), digPaths: stored.digPaths });
      }
      // A debate above the dig: an allowed contribution's, or the first debate's, read from the copy; only its paths and points: its person's own words were checked as its rewrite.
      const page = await material();
      const line = await allowedTextsOf(pool, (await publicTree.readLine(runId)) ?? []);
      const atNew = (path: PublicMaterialPath): PathRewriteDigPath => {
        const newer = line.get(path.ref.toLowerCase());
        const text = newer !== undefined && (path.written_at === null || newer.written_at > path.written_at) ? `${newer.line} ${newer.summary}` : path.summary === null ? path.line : `${path.line} ${path.summary}`;
        return Object.freeze({ positionRef: path.ref, statement: text, points: pointsOfPath(path), extracts: extractsOfPath(path) });
      };
      const candidates = [...line.keys()];
      const dig = page.digs.find((candidate) => candidate.paths.some((path) => candidates.includes(path.ref.toLowerCase())));
      const paths = dig?.paths ?? page.paths;
      return Object.freeze({ picks: Object.freeze([]), digPaths: Object.freeze(paths.map(atNew)) });
    },
    sealUpdate: (runId: string, updateId: string, content: PathRewriteContent) => sealUnder(runId, PATH_UPDATE_CARRIER, updateId, content, "PATH_CLIMB_ENCRYPTION_REQUIRED"),
    sealMainAnswer: async (rootRunId: string, updateId: string, content: MainAnswerContent) => (await rootLives(liveTree, rootRunId))
      ? sealUnder(rootRunId, MAIN_ANSWER_UPDATE_CARRIER, updateId, content, "MAIN_ANSWER_ENCRYPTION_REQUIRED")
      : sealUnder(digRunId, PUBLIC_ANSWER_UPDATE_CARRIER, updateId, content, "MAIN_ANSWER_ENCRYPTION_REQUIRED"),
    // Only a version a public contribution caused is ever opened here. A version from the author's private digs (0138 lists them too, for the bookkeeping of "based on") stays
    // shut: no prompt holds it, and the page's own main answer stands in for it.
    openMainAnswer: async (rootRunId, row) => {
      // 0150: a row older than the debate's last review step has no content here: the page's copy stands for it, corrected.
      if (row.content === null || (await contributions.readContribution(row.trigger_run_id))?.outcome !== "ALLOWED") return null;
      const lives = await rootLives(liveTree, rootRunId);
      const under = lives ? rootRunId : row.trigger_run_id;
      const opened = await withRunContentLease(pool, [under], () => decryptContentForRun<unknown>(pool, under, lives ? MAIN_ANSWER_UPDATE_CARRIER : PUBLIC_ANSWER_UPDATE_CARRIER,
        row.update_id, row.content, null));
      return isRecord(opened) && Array.isArray(opened.segments) && opened.segments.every((segment) => typeof segment === "string") ? opened.segments as readonly string[] : null;
    },
    answerInputOf: async (rootRunId, earlier): Promise<InvestigationCloseInput | null> => {
      const page = await material();
      const contribution = await contributions.readContribution(digRunId);
      const ask = await runs.readStoredAsk(digRunId);
      if (contribution === null || ask === null) return null;
      // Everything written since the copy, on the dig's own line up to the first debate.
      const newer = new Map<string, Readonly<{ written_at: string; line: string; summary: string; fate: StoryFate }>>();
      for (let at: string | null = contribution.parent_run_id, hops = 0; at !== null && hops < 12; hops += 1) {
        for (const [ref, text] of await allowedTextsOf(pool, (await publicTree.readLine(at)) ?? [])) newer.set(ref, text);
        at = (await publicTree.readClimbNext(at))?.parent_run_id ?? null;
      }
      const stored = await storedInput();
      const kept = await picks.read(digRunId);
      const after = newer.get((contribution.position_ref ?? "").toLowerCase());
      const ownDig: DossierDig | undefined = stored === null || after === undefined ? undefined : Object.freeze({
        runId: digRunId, parentRunId: page.publication_ref, positionRef: contribution.position_ref, level: await levelOf(publicTree, digRunId), finishedAt: contribution.contributed_at,
        picks: Object.freeze((kept?.picks ?? []).map((pick) => Object.freeze({ text: pick.text, by: pick.author }))), rewrite: null,
        ownMaterial: Object.freeze({ answer: Object.freeze([]), paths: stored.digPaths, sources: Object.freeze([]) }) });
      const input = dossierFromMaterial(page, { newer, ...(ownDig === undefined ? {} : { own: ownDig }),
        earlier: earlier ?? (page.main_answer === null ? null : Object.freeze({ version: page.main_answer.version, segments: page.main_answer.segments })) });
      return Object.freeze({ input, free: ask.planTier === "free", questionLine: page.question });
    },
    payerOf: async (runId: string) => {
      const asker = (await runs.readStoredAsk(runId))?.askerId;
      return asker?.startsWith("owner:") === true ? asker.slice("owner:".length) : null;
    },
    answerSpentMicros: async (runId: string) => Number((await pool.query<{ spent: string | null }>(
      `SELECT COALESCE(sum(charge_micros), 0)::text AS spent FROM ledger.model_spend WHERE run_id = $1 AND spend_source = 'ANSWER_UPDATE'`, [runId])).rows[0]?.spent ?? 0),
    replayBookOf: (runId: string, subjectItemId: string) => readReplayBook(pool, runId, subjectItemId)
  });
}
