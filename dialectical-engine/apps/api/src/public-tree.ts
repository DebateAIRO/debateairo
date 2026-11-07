import {
  DIG_LEVEL_MAX, FREE_DIG_PICKS_MAX, InvestigationReportAnswerSchema, InvestigationReportPathSchema, InvestigationReportSourceSchema, InvestigationReportStorySchema, PublicDebateSchema,
  PublicMaterialSchema, PublicReportVersionSchema, type AnswerContribution, StoryFateSchema, cutQuoteAtWordEdge, type AskParent, type PublicContribution, type PublicDebate, type PublicDigParent, type PublicMainAnswer, type PublicMaterial,
  type PublicMaterialPath, type PublicMaterialPoint, type PublicReportVersion, type StoryFate
} from "@debateai/contract";
import type { CryptoEnvelope, PreparedPublicationCipher } from "@debateai/crypto";
import {
  DIG_PICK_CARRIER, PATH_UPDATE_CARRIER, PostgresPublicTreeRunnerRepository, PUBLIC_MATERIAL_CARRIER, PUBLIC_REPORT_CARRIER, crossAccount, decryptContentForRun, encryptAttestedContentForRun, withRunContentLease, type Pool,
  type PostgresPublicDebateRepository, type PostgresPublicDebateRunnerRepository, type PostgresPublicPageRepository, type PostgresPublicTreeRepository, type PublicPageOwed, type PublicPageUpdateRead,
  type PublicReportCopyRead, type WebSealed
} from "@debateai/db";
import { exhaustive } from "@debateai/kernel";
import { digAnchorOf, digPathIndexOf, digPicksOnOnePath, digPickAuthorOf, type DigPathIndex } from "./dig-admission.js";
import type { PublicationCheckResult, PublicationContentCheck } from "./publication-check/check.js";

/**
 * THE PUBLIC TREE, THE API'S HALF (plan 2026-10-31-r22-owner-changes decisions 13, 16, 22; migration 0147). The API holds the publication's key and the runner does not, so three things are
 * here:
 *  - THE COPY: what a stranger's AI work may read is the page, `publicMaterialOf`, sealed again under the dig's (or the report's carrier's) own run key. Nothing else ever reaches them.
 *  - THE ADMISSION: a dig names a page (`public_ref`) and, under a contribution, its public reference (`dig_ref`), never a run id. A debate that is not public is the closed 404, whatever is guessed.
 *  - THE PAGE'S SWEEP: a contribution the AI check passed goes through the publication check (HS-S02) on the very strings that would go public; allowed, it is copied under the publication's key,
 *    as is whatever the climb and the main answer wrote. A text the publication check refuses never reaches the page: the older text stands.
 * `readPublicDebate` serves the first snapshot with these copies merged in (`mergedPublicDebate`); the snapshot itself never changes.
 */

/** A PATH update as the page keeps it, under the publication's key. */
export type PublicPathCopy = Readonly<{
  v: 1; line: string; summary: string; fate: StoryFate; what_changed: readonly string[]; own_rewrite: boolean; written_at: string; on_ref: string | null;
  dig_paths: readonly Readonly<{ position_ref: string; line: string; fate: StoryFate; points: readonly string[] }>[];
}>;
export type PublicAnswerCopy = Readonly<{ v: 1; segments: readonly string[]; written_at: string }>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
const dayOf = (at: string): string => new Date(at).toISOString().slice(0, 10);

/** Decision 33: what a review changed. A correction replaces one string of one piece; the piece itself never changes. `piece_key`: the page's own name for it. */
export type PublicReviewOverlay = Readonly<{ changed: boolean; corrections: readonly Readonly<{ piece_kind: "SNAPSHOT" | "UPDATE" | "REPORT"; piece_key: string; pointer: string; content: CryptoEnvelope }>[] }>;

/** Keys that hold words a person reads. An id, a code, a date or a model is no piece of text. */
const NOT_TEXT = /(_ref|_refs|_id|_ids|_at|_on|_sha256|^v$|^kind$|state|fate|relation|outcome|verdict|language|confidence|band|lineage|model|provider|contract|version|mode|target|lane)/iu;
/** Every string a person reads in a piece, by its pointer. Only these can be corrected. */
export function textPiecesOf(value: unknown, at = ""): readonly Readonly<{ pointer: string; text: string }>[] {
  if (typeof value === "string") return at === "" ? [] : [{ pointer: at, text: value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => textPiecesOf(item, `${at}/${String(index)}`));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => NOT_TEXT.test(key) || !/^[A-Za-z0-9_]{1,64}$/u.test(key) ? [] : textPiecesOf(item, `${at}/${key}`));
}
/** The piece with its corrections. A pointer that no longer lands on a string is an error: the caller fails shut. */
export function correctedPiece<T>(value: T, corrections: readonly Readonly<{ pointer: string; text: string }>[]): T {
  if (corrections.length === 0) return value;
  const copy = structuredClone(value) as unknown;
  for (const { pointer, text } of corrections) {
    const steps = pointer.split("/").slice(1);
    let at: unknown = copy;
    for (const step of steps.slice(0, -1)) at = isRecord(at) || Array.isArray(at) ? (at as Record<string, unknown>)[step] : undefined;
    const last = steps.at(-1)!;
    if ((!isRecord(at) && !Array.isArray(at)) || typeof (at as Record<string, unknown>)[last] !== "string") throw new Error("PUBLIC_REVIEW_POINTER_LOST");
    (at as Record<string, unknown>)[last] = text;
  }
  return copy as T;
}

/** The page as it reads now: the first snapshot, then each copy in order, each with its corrections. A copy that does not open is left out, whatever it was. */
export function mergedPublicDebate(firstSnapshot: PublicDebate, input: Readonly<{
  updates: readonly PublicPageUpdateRead[]; reports: readonly PublicReportCopyRead[]; authorNameGone: boolean; overlay?: PublicReviewOverlay; open: (envelope: CryptoEnvelope) => unknown;
}>): PublicDebate {
  const opened = (input.overlay?.corrections ?? []).map((correction) => {
    const text = input.open(correction.content);
    if (!isRecord(text) || typeof text.text !== "string") throw new Error("PUBLIC_REVIEW_CORRECTION_UNREAD");
    return { kind: correction.piece_kind, key: correction.piece_key, pointer: correction.pointer, text: text.text };
  });
  const correctionsOf = (kind: "SNAPSHOT" | "UPDATE" | "REPORT", key: string | null) => opened.filter((correction) => correction.kind === kind && (key === null || correction.key === key));
  const snapshot = PublicDebateSchema.parse(correctedPiece(firstSnapshot, correctionsOf("SNAPSHOT", null)));
  const contributions: PublicContribution[] = [];
  let main: PublicMainAnswer | null = null;
  for (const update of input.updates) {
    let row: unknown;
    try { row = correctedPiece(input.open(update.content), correctionsOf("UPDATE", update.update_id)); } catch { continue; }
    if (!isRecord(row)) continue;
    const opened = row;
    if (update.kind === "MAIN_ANSWER") {
      const parsed = PublicDebateSchema.shape.main_answer_update.safeParse({ updated_at: new Date(update.recorded_at).toISOString(),
        segments: Array.isArray(opened.segments) ? opened.segments.map((text) => ({ text })) : [] });
      if (parsed.success && parsed.data !== undefined) main = parsed.data;
      continue;
    }
    if (update.position_ref === null || update.contributed_at === null) continue;
    const parsed = PublicDebateSchema.shape.contributions.unwrap().element.safeParse({
      position_ref: update.position_ref, contributor: update.contributor, contributed_on: dayOf(update.contributed_at), line: opened.line, summary: opened.summary, fate: opened.fate,
      what_changed: opened.what_changed, update_ref: update.update_id, own_rewrite: opened.own_rewrite === true, on_ref: opened.on_ref ?? null, dig_paths: opened.dig_paths ?? [] });
    if (parsed.success) contributions.push(parsed.data);
  }
  const reports: PublicReportVersion[] = [];
  for (const report of input.reports) {
    let opened: unknown;
    try { opened = correctedPiece(input.open(report.content), correctionsOf("REPORT", String(report.report_version))); } catch { continue; }
    const parsed = PublicReportVersionSchema.safeParse({ ...(isRecord(opened) ? opened : {}), report_version: report.report_version, written_at: new Date(report.recorded_at).toISOString(), writer: report.writer });
    if (parsed.success) reports.push(parsed.data);
  }
  return PublicDebateSchema.parse({ ...snapshot,
    ...(input.overlay?.changed === true ? { changed_after_review: true } : {}),
    ...(input.authorNameGone ? { author_pseudonym: "a contributor", author_name_gone: true } : {}),
    ...(contributions.length === 0 ? {} : { contributions }),
    ...(main === null ? {} : { main_answer_update: main }),
    ...(reports.length === 0 ? {} : { reports }) });
}

/* ----------------------------------------------------------------- the copy the runner reads */

const nodePoints = (debate: PublicDebate, ids: readonly string[]): readonly PublicMaterialPoint[] => {
  const here = new Set(ids);
  const nodes = debate.answer.nodes ?? [];
  const edges = debate.answer.edges ?? [];
  return ids.flatMap((id): PublicMaterialPoint[] => {
    const node = nodes.find((candidate) => candidate.node_id === id);
    if (node === undefined) return [];
    const edge = edges.find((candidate) => candidate.from_node_ref === id && candidate.target_kind === "NODE");
    return [{ id, text: node.claim, on_id: edge !== undefined && here.has(edge.target_ref) ? edge.target_ref : null,
      side: edge === undefined ? null : edge.relation === "support" ? "for" : "against", disputed: node.review?.outcome === "dispute" }];
  });
};

/** The page's paths, by the map's ids ("<ref>#2" for a position argued twice), at the first snapshot's text. */
function firstPaths(debate: PublicDebate): readonly PublicMaterialPath[] {
  const seen = new Map<string, number>();
  const nodes = debate.answer.nodes ?? [];
  return (debate.story_short?.paths ?? []).map((path, order) => {
    const times = (seen.get(path.position_ref) ?? 0) + 1;
    seen.set(path.position_ref, times);
    const ids = path.node_refs.filter((id) => id !== path.position_ref);
    const points = nodePoints(debate, ids);
    const extracts = points.flatMap((point) => {
      const sources = nodes.find((node) => node.node_id === point.id)?.sources ?? [];
      return sources.map((source, at) => ({ point_id: point.id, label: `S${String(order + 1)}-${String(at + 1)}`, site: source.site, title: source.title ?? null, link: source.link ?? null,
        quote: cutQuoteAtWordEdge(source.quote), note: source.explanation?.text ?? null }));
    });
    return { ref: times === 1 ? path.position_ref : `${path.position_ref}#${String(times)}`, story_line: path.line, story_fate: path.fate, line: path.line, summary: null, fate: path.fate,
      written_at: null, points: [...points], extracts };
  });
}

/**
 * What the runner may read of this debate: the page, as it reads now, in the copy's shape: each path at its newest text, each allowed dig with its own paths. Run ids are not in it: only the
 * page's own references. `written_at` of each text comes from the source's own time, so the runner can tell a newer contribution from what the copy holds.
 */
export function publicMaterialOf(debate: PublicDebate, input: Readonly<{ writtenAt?: (updateRef: string) => string | null; now: Date }>): PublicMaterial {
  const paths: PublicMaterialPath[] = firstPaths(debate).map((path) => ({ ...path }));
  const digs: PublicMaterial["digs"][number][] = [];
  const contributions = debate.contributions ?? [];
  const pathOf = (ref: string): PublicMaterialPath | null => paths.find((path) => path.ref === ref)
    ?? digs.flatMap((dig) => dig.paths).find((path) => path.ref === ref) ?? null;
  for (const contribution of contributions) {
    const at = input.writtenAt?.(contribution.update_ref ?? "") ?? new Date(`${contribution.contributed_on}T00:00:00.000Z`).toISOString();
    // A dig's own rewrite opens a dig; a climb's row only moves a path's text.
    if (contribution.own_rewrite === true && contribution.update_ref !== undefined) {
      const parent = digs.find((dig) => dig.ref === contribution.on_ref);
      digs.push({ ref: contribution.update_ref, parent_ref: contribution.on_ref ?? null, position_ref: contribution.position_ref, level: Math.min((parent?.level ?? 0) + 1, DIG_LEVEL_MAX),
        contributed_at: at, line: contribution.line, summary: contribution.summary, fate: contribution.fate, what_changed: [...contribution.what_changed],
        paths: (contribution.dig_paths ?? []).map((path, order) => ({ ref: path.position_ref, story_line: path.line, story_fate: path.fate, line: path.line, summary: null, fate: path.fate, written_at: null,
          points: path.points.map((text, point) => ({ id: `${contribution.update_ref!}:${String(order + 1)}:${String(point + 1)}`, text, on_id: null, side: null, disputed: false })), extracts: [] })) });
    }
    const path = pathOf(contribution.position_ref);
    if (path !== null) Object.assign(path, { line: contribution.line, summary: contribution.summary, fate: contribution.fate, written_at: at });
  }
  const main = debate.main_answer_update;
  const report = (debate.reports ?? []).at(-1);
  return PublicMaterialSchema.parse({ v: 1, publication_ref: debate.public_ref, as_of: input.now.toISOString(), question: debate.question, language: debate.language ?? null,
    answer: debate.story_short === undefined ? null : { headline: debate.story_short.headline, summary: debate.story_short.summary, change: debate.story_short.change.text, confidence: debate.story_short.confidence },
    main_answer: main === undefined ? null : { version: 1 + contributions.length, segments: main.segments.map((segment) => segment.text) }, paths, digs,
    earlier_report: report === undefined ? null : { version: report.report_version, segments: report.answer.segments } });
}

/** The paths a dig may land on: the debate's, or those of the contribution it is dug under. Points' ids as the place rule reads them. */
export function publicPathIndexOf(debate: PublicDebate, digRef: string | null): DigPathIndex | null {
  if (digRef === null) {
    const paths = debate.story_short?.paths;
    return paths === undefined ? null : digPathIndexOf(paths.map((path) => ({ position_ref: path.position_ref, node_refs: path.node_refs })));
  }
  const contribution = (debate.contributions ?? []).find((candidate) => candidate.update_ref === digRef);
  return contribution === undefined ? null : Object.freeze((contribution.dig_paths ?? []).map((path) => Object.freeze({ pathId: path.position_ref, nodeRefs: Object.freeze([]) })));
}

export type PublicDigAdmission =
  | Readonly<{ kind: "ADMIT"; positionRef: string; parentRunId: string; publicationRef: string; picks: NonNullable<AskParent["picks"]>; places: readonly string[]; mode: "quick" | "thorough" }>
  | Readonly<{ kind: "NOT_FOUND" }>
  | Readonly<{ kind: "TOO_DEEP" }>
  | Readonly<{ kind: "NEEDS_A_PATH" }>
  | Readonly<{ kind: "MALFORMED"; reason: "FREE_PICKS_OVER" | "PICKS_NOT_ON_ONE_PATH" }>;

/** A dig named by a public page, before anything is charged: is the page public, is the parent on it, one path, one the page shows. */
export async function admitPublicDig(input: Readonly<{ parent: PublicDigParent; free: boolean }>, ports: Readonly<{
  readPublicDebate: (publicationRef: string) => Promise<PublicDebate | null>;
  tree: Pick<PostgresPublicTreeRepository, "readDigParent">;
}>): Promise<PublicDigAdmission> {
  const { parent } = input;
  if (input.free && (parent.picks?.length ?? 0) > FREE_DIG_PICKS_MAX) return Object.freeze({ kind: "MALFORMED", reason: "FREE_PICKS_OVER" });
  const read = await ports.tree.readDigParent(parent.public_ref, parent.dig_ref ?? null);
  if (read === null) return Object.freeze({ kind: "NOT_FOUND" });
  if (read.level > DIG_LEVEL_MAX) return Object.freeze({ kind: "TOO_DEEP" });
  const debate = await ports.readPublicDebate(parent.public_ref);
  if (debate === null) return Object.freeze({ kind: "NOT_FOUND" });
  const index = publicPathIndexOf(debate, parent.dig_ref ?? null);
  const shape = { parent_run_id: "00000000-0000-4000-8000-000000000000", places: parent.places, mode: parent.mode, ...(parent.picks === undefined ? {} : { picks: parent.picks }) } as AskParent;
  if (!digPicksOnOnePath(shape, index)) return Object.freeze({ kind: "MALFORMED", reason: "PICKS_NOT_ON_ONE_PATH" });
  const positionRef = digAnchorOf(shape, index);
  // A place the page does not show is a guess: it has no path to land on.
  if (positionRef === null || !(index ?? []).some((path) => path.pathId === positionRef)) return Object.freeze({ kind: "NEEDS_A_PATH" });
  return Object.freeze({ kind: "ADMIT", positionRef, parentRunId: read.parent_run_id, publicationRef: parent.public_ref, picks: parent.picks ?? [], places: parent.places, mode: parent.mode });
}

const sealFor = (pool: Pool, runId: string, carrier: typeof PUBLIC_MATERIAL_CARRIER, id: string, content: unknown): Promise<WebSealed | null> =>
  withRunContentLease(pool, [runId], () => encryptAttestedContentForRun(pool, runId, carrier, id, content));

/**
 * At start: the dig joins the public tree, keeps its copy of the page, and its picks, each under its own run key. Never throws: a dig that cannot join stays what it is, the person's own
 * private debate, and leaves the page alone (one code line, never a text).
 */
export async function joinPublicDigAtStart(input: Readonly<{ ownerRef: string; childRunId: string; admission: Extract<PublicDigAdmission, { kind: "ADMIT" }>; now: Date; pool: Pool;
  tree: Pick<PostgresPublicTreeRepository, "join" | "recordMaterial">; contributions: Pick<PostgresPublicDebateRepository, "recordPicks">;
  readPublicDebate: (publicationRef: string) => Promise<PublicDebate | null>; log?: (line: string) => void }>): Promise<string> {
  const log = input.log ?? ((line: string) => console.error(line));
  const say = (code: string): string => { log(JSON.stringify({ kind: "DEBATEAI_PUBLIC_DIG", code })); return code; };
  const { admission } = input;
  try {
    const joined = await input.tree.join({ ownerRef: input.ownerRef, publicationRef: admission.publicationRef, parentRunId: admission.parentRunId, childRunId: input.childRunId, positionRef: admission.positionRef });
    if (joined.outcome !== "JOINED" && joined.outcome !== "ALREADY") return say(`PUBLIC_DIG_${joined.outcome}`);
    const debate = await input.readPublicDebate(admission.publicationRef);
    if (debate === null) return say("PUBLIC_DIG_PAGE_UNREAD");
    const sealed = await sealFor(input.pool, input.childRunId, PUBLIC_MATERIAL_CARRIER, input.childRunId, publicMaterialOf(debate, { now: input.now }));
    if (sealed === null) return say("PUBLIC_DIG_NOT_SEALED");
    await input.tree.recordMaterial(input.childRunId, input.childRunId, admission.publicationRef, "DIG", sealed);
    const picks = await withRunContentLease(input.pool, [input.childRunId], async () => {
      const kept = [];
      for (const [at, pick] of admission.picks.entries()) {
        const content = await encryptAttestedContentForRun(input.pool, input.childRunId, DIG_PICK_CARRIER, String(at + 1), { text: pick.text });
        if (content === null) return null;
        kept.push({ kind: pick.kind, suggestion_id: pick.suggestion_id, place: pick.place, author: digPickAuthorOf(pick, null), content: content.envelope, attestation: content.attestation.toString("hex") });
      }
      return kept;
    });
    if (picks === null) return say("PUBLIC_DIG_NOT_SEALED");
    await input.contributions.recordPicks(input.ownerRef, input.childRunId, picks);
    return joined.outcome;
  } catch {
    return say("PUBLIC_DIG_NOT_JOINED");
  }
}

export type PublicReportPress =
  | Readonly<{ kind: "WRITING"; reportVersion: number }>
  | Readonly<{ kind: "ONGOING" }>
  | Readonly<{ kind: "NO_CARRIER" }>
  | Readonly<{ kind: "NOT_FOUND" }>;

/** "Write a report" on a public debate: the writer's own press; the copy is sealed under the carrier so the runner can read it. A second press answers the same version. */
export async function pressPublicReport(input: Readonly<{ ownerRef: string; publicationRef: string; reportId: string; free: boolean; now: Date; pool: Pool;
  tree: Pick<PostgresPublicTreeRepository, "openReport" | "recordMaterial">; readPublicDebate: (publicationRef: string) => Promise<PublicDebate | null> }>): Promise<PublicReportPress> {
  const debate = await input.readPublicDebate(input.publicationRef);
  if (debate === null) return Object.freeze({ kind: "NOT_FOUND" });
  const opened = await input.tree.openReport(input.ownerRef, input.publicationRef, input.reportId, input.free);
  switch (opened.outcome) {
    case "NOT_PUBLIC": return Object.freeze({ kind: "NOT_FOUND" });
    case "ONGOING": return Object.freeze({ kind: "ONGOING" });
    case "NO_CARRIER": return Object.freeze({ kind: "NO_CARRIER" });
    case "WRITING": return Object.freeze({ kind: "WRITING", reportVersion: opened.reportVersion! });
    case "OPENED": {
      // Row-level security X29: a stranger's report of a public debate is sealed under the debate's own run key so the runner can read it, and that run is the
      // author's, which the runtime login does not see inside the stranger's request. The public check is open_public_report, above; only this seal crosses.
      const sealed = await crossAccount("X29", () => sealFor(input.pool, opened.carrierRunId!, PUBLIC_MATERIAL_CARRIER, opened.reportId!, publicMaterialOf(debate, { now: input.now })));
      if (sealed === null) return Object.freeze({ kind: "NO_CARRIER" });
      await input.tree.recordMaterial(opened.reportId!, opened.carrierRunId!, input.publicationRef, "REPORT", sealed);
      return Object.freeze({ kind: "WRITING", reportVersion: opened.reportVersion! });
    }
    default: return exhaustive(opened.outcome);
  }
}

/**
 * The digger's own page (decision 13): their rewrite of the path, as they alone see it, whatever the check said. Read from the parent's line, and only the row of this dig's own turn is opened, under this dig's own key: the first author's
 * private rewrites on the same line are never touched, and no run id leaves here. Null when it is not written, or when a review closed the row (the reader of the line gives no content then). A refused dig's row is hidden from others, not from its own digger. Never throws.
 */
export async function ownDigRewriteOf(pool: Pool, digRunId: string, parentRunId: string): Promise<NonNullable<AnswerContribution["rewrite"]> | null> {
  try {
    const line = await new PostgresPublicTreeRunnerRepository(pool).readLine(parentRunId);
    const own = (line ?? []).find((entry) => entry.source === "PATH_UPDATE" && entry.kind === "PUBLIC_DIG" && entry.run_id.toLowerCase() === digRunId.toLowerCase());
    if (own === undefined || own.entry_id === null || own.content === null || (own.state !== "READY" && own.state !== "READY_WITH_RESERVATION")) return null;
    const copy = pathCopyOf(await openUnder(pool, digRunId, PATH_UPDATE_CARRIER, own.entry_id, own.content), { ownRewrite: false, writtenAt: new Date(0).toISOString(), onRef: null });
    return copy === null ? null : Object.freeze({ line: copy.line, summary: copy.summary, fate: copy.fate, what_changed: [...copy.what_changed] });
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------- the page's sweep */

export type PublicPageSweepDeps = Readonly<{
  pool: Pool;
  page: Pick<PostgresPublicPageRepository, "readChecksPassed" | "readPageOwed" | "readReportsOwed" | "recordReportCopy" | "recordSkip">;
  contributions: Pick<PostgresPublicDebateRunnerRepository, "settleCheck" | "recordPageUpdate">;
  tree: Pick<PostgresPublicTreeRepository, "readTreeOfRun">;
  contentCheck: PublicationContentCheck;
  /** The same check for a report, whose record names the report: `runId` here is the report's id (0149). */
  reportContentCheck: PublicationContentCheck;
  /** The publication's key, under its content lease, with the run its snapshot names. Null: it is not public now. */
  withPublicationKey: <T>(publicationRef: string, use: (cipher: PreparedPublicationCipher) => T) => Promise<T | null>;
  /** How long a publication check may stay unavailable: a contribution then stays private, a later text stays off the page. */
  giveUpMs?: number;
  /** The same for a report: the writer waited and paid, so it is tried for longer. */
  reportGiveUpMs?: number;
  now?: () => Date;
  log?: (event: string, detail: Record<string, unknown>) => void;
}>;

export const PUBLIC_PAGE_SWEEP_DEFAULTS = Object.freeze({ everyMs: 15_000, giveUpMs: 6 * 60 * 60_000, reportGiveUpMs: 24 * 60 * 60_000 });

/**
 * A judge that is down is no cost loop. Every sweep's check goes through this one: after an UNAVAILABLE (or a check that threw) no judge is called until a wait has passed, doubling from a minute
 * to an hour; the first answer the judge gives ends it. While the wait runs the sweeps read "unavailable" with no call, so each row's own give-up still comes by its age.
 */
export function backedOffContentCheck(check: PublicationContentCheck, input: Readonly<{ now?: () => number; firstWaitMs?: number; longestWaitMs?: number }> = {}): PublicationContentCheck {
  const now = input.now ?? Date.now;
  const first = input.firstWaitMs ?? 60_000;
  const longest = input.longestWaitMs ?? 60 * 60_000;
  let wait = 0;
  let until = 0;
  const failed = (): void => { wait = wait === 0 ? first : Math.min(wait * 2, longest); until = now() + wait; };
  return { check: async (request) => {
    if (now() < until) return { outcome: "UNAVAILABLE", cause: "JUDGE_DEADLINE" };
    let result: PublicationCheckResult;
    try {
      result = await check.check(request);
    } catch (error) {
      failed();
      throw error;
    }
    if (result.outcome === "UNAVAILABLE") failed();
    else { wait = 0; until = 0; }
    return result;
  } };
}

const openUnder = (pool: Pool, runId: string, carrier: string, id: string, envelope: CryptoEnvelope | null): Promise<unknown> =>
  withRunContentLease(pool, [runId], () => decryptContentForRun<unknown>(pool, runId, carrier as never, id, envelope, null));

/** The strings a path's copy would put on the page, in the publication check's own lists. */
function checkedPathSnapshot(copy: PublicPathCopy, positionRef: string): PublicDebate {
  return { contributions: [{ position_ref: positionRef, contributor: null, contributed_on: "2000-01-01", line: copy.line, summary: copy.summary, fate: copy.fate, what_changed: [...copy.what_changed],
    dig_paths: copy.dig_paths.map((path) => ({ ...path, points: [...path.points] })) }] } as unknown as PublicDebate;
}
function checkedAnswerSnapshot(segments: readonly string[]): PublicDebate {
  return { main_answer_update: { updated_at: "2000-01-01T00:00:00.000Z", segments: segments.map((text) => ({ text })) } } as unknown as PublicDebate;
}

/** A sealed rewrite or climb row as it goes on the page: only what the page shows, the person's verdict line and the suggestions left behind. */
export function pathCopyOf(value: unknown, input: Readonly<{ ownRewrite: boolean; writtenAt: string; onRef: string | null }>): PublicPathCopy | null {
  if (!isRecord(value) || !isRecord(value.text) || typeof value.text.line !== "string" || typeof value.text.summary !== "string" || !Array.isArray(value.what_changed)) return null;
  const fate = StoryFateSchema.safeParse(value.text.fate);
  if (!fate.success) return null;
  const points = (ref: unknown): readonly string[] => {
    const found = Array.isArray(value.public_points) ? value.public_points.find((entry: unknown) => isRecord(entry) && entry.position_ref === ref) as unknown : undefined;
    return isRecord(found) && Array.isArray(found.points) ? found.points.flatMap((point: unknown) => isRecord(point) && typeof point.text === "string" ? [point.text] : []) : [];
  };
  const digPaths = !input.ownRewrite || !Array.isArray(value.dig_paths) ? [] : value.dig_paths.flatMap((path: unknown) => {
    if (!isRecord(path) || typeof path.position_ref !== "string" || typeof path.line !== "string") return [];
    const pathFate = StoryFateSchema.safeParse(path.fate);
    return pathFate.success ? [{ position_ref: path.position_ref, line: path.line, fate: pathFate.data, points: points(path.position_ref) }] : [];
  });
  return Object.freeze({ v: 1 as const, line: value.text.line, summary: value.text.summary, fate: fate.data, what_changed: value.what_changed.filter((sentence): sentence is string => typeof sentence === "string"),
    own_rewrite: input.ownRewrite, written_at: input.writtenAt, on_ref: input.onRef, dig_paths: digPaths });
}

/** One pass. Never rejects; logs codes and ids only. */
export async function sweepPublicPage(deps: PublicPageSweepDeps): Promise<Readonly<{ settled: number; copied: number; reports: number; skipped: number }>> {
  const now = (deps.now ?? (() => new Date()))();
  const giveUp = deps.giveUpMs ?? PUBLIC_PAGE_SWEEP_DEFAULTS.giveUpMs;
  const reportGiveUp = deps.reportGiveUpMs ?? PUBLIC_PAGE_SWEEP_DEFAULTS.reportGiveUpMs;
  const tooOld = (at: string, limit: number): boolean => now.getTime() - Date.parse(at) >= limit;
  const log = (event: string, detail: Record<string, unknown>): void => { try { deps.log?.(event, detail); } catch { /* A failing log sink costs nothing. */ } };
  const refused = (result: PublicationCheckResult): boolean => result.outcome === "BLOCK" || result.outcome === "UNSURE";
  let settled = 0, copied = 0, reports = 0, skipped = 0;
  // 1. The AI check passed: the publication check decides, on the very strings that would go public.
  for (const passed of await deps.page.readChecksPassed().catch(() => [])) {
    try {
      const opened = await openUnder(deps.pool, passed.dig_run_id, "identity.path_update", passed.update_id, passed.content);
      const copy = pathCopyOf(opened, { ownRewrite: true, writtenAt: now.toISOString(), onRef: null });
      if (copy === null) {
        await deps.contributions.settleCheck(passed.dig_run_id, "UNAVAILABLE", null);
        settled += 1;
        continue;
      }
      const result = await deps.contentCheck.check({ runId: passed.dig_run_id, snapshot: checkedPathSnapshot(copy, passed.position_ref ?? passed.update_id) });
      if (result.outcome === "ALLOW") await deps.contributions.settleCheck(passed.dig_run_id, "ALLOWED", null);
      else if (refused(result)) await deps.contributions.settleCheck(passed.dig_run_id, "REFUSED", null);
      else if (now.getTime() - Date.parse(passed.recorded_at) >= giveUp) await deps.contributions.settleCheck(passed.dig_run_id, "UNAVAILABLE", null);
      else continue;
      settled += 1;
    } catch (error) {
      log("PUBLIC_PAGE_CHECK_NOT_SETTLED", { runId: passed.dig_run_id, code: error instanceof Error ? error.name : "UNTYPED" });
    }
  }
  // 2. What allowed contributions wrote goes on the page, oldest first, each under the publication's key.
  for (const owed of await deps.page.readPageOwed().catch(() => [] as readonly PublicPageOwed[])) {
    try {
      let opened: unknown;
      try {
        opened = await openUnder(deps.pool, owed.sealed_run_id, owed.carrier, owed.source_id, owed.content);
      } catch {
        await deps.page.recordSkip(owed.source_id, owed.publication_ref, owed.kind, "KEY_GONE");
        skipped += 1;
        continue;
      }
      const writtenAt = new Date(owed.recorded_at).toISOString();
      let content: PublicPathCopy | PublicAnswerCopy | null;
      if (owed.kind === "PATH") {
        const on = owed.step === 0 ? await deps.tree.readTreeOfRun(await parentOfDig(deps.pool, owed.dig_run_id)) : null;
        content = pathCopyOf(opened, { ownRewrite: owed.step === 0, writtenAt, onRef: on?.dig_update_id ?? null });
      } else {
        content = isRecord(opened) && Array.isArray(opened.segments) && opened.segments.every((segment) => typeof segment === "string")
          ? Object.freeze({ v: 1 as const, segments: opened.segments as readonly string[], written_at: writtenAt }) : null;
      }
      if (content === null) {
        await deps.page.recordSkip(owed.source_id, owed.publication_ref, owed.kind, "UNREADABLE");
        skipped += 1;
        continue;
      }
      // A dig's own rewrite was checked before it was allowed; what the climb and the main answer wrote since has not been.
      if (!(owed.kind === "PATH" && owed.step === 0)) {
        const result = await deps.contentCheck.check({ runId: owed.dig_run_id, snapshot: owed.kind === "PATH"
          ? checkedPathSnapshot(content as PublicPathCopy, owed.position_ref ?? owed.source_id) : checkedAnswerSnapshot((content as PublicAnswerCopy).segments) });
        if (refused(result)) {
          await deps.page.recordSkip(owed.source_id, owed.publication_ref, owed.kind, "REFUSED");
          skipped += 1;
          continue;
        }
        if (result.outcome !== "ALLOW") {
          // A judge down this long: the page keeps its older text. What the person paid for stays in their own debate; the dig's page line says so beforehand.
          if (tooOld(owed.recorded_at, giveUp)) {
            await deps.page.recordSkip(owed.source_id, owed.publication_ref, owed.kind, "CHECK_UNAVAILABLE");
            skipped += 1;
          }
          continue;
        }
      }
      const sealed = await deps.withPublicationKey(owed.publication_ref, (cipher) => cipher.encrypt(content));
      if (sealed === null) continue;
      const stored = await deps.contributions.recordPageUpdate({ updateId: owed.source_id, publicationRef: owed.publication_ref, kind: owed.kind, positionRef: owed.position_ref, digRunId: owed.dig_run_id, content: sealed });
      if (stored.outcome === "RECORDED") copied += 1;
    } catch (error) {
      log("PUBLIC_PAGE_NOT_COPIED", { sourceId: owed.source_id, code: error instanceof Error ? error.name : "UNTYPED" });
    }
  }
  // 3. Reports: the same, under the publication's key.
  for (const owed of await deps.page.readReportsOwed().catch(() => [])) {
    try {
      let opened: unknown;
      try {
        opened = await openUnder(deps.pool, owed.carrier_run_id, PUBLIC_REPORT_CARRIER, owed.report_id, owed.content);
      } catch {
        await deps.page.recordSkip(owed.report_id, owed.publication_ref, "REPORT", "KEY_GONE");
        skipped += 1;
        continue;
      }
      const version = isRecord(opened) ? {
        answer: InvestigationReportAnswerSchema.safeParse(opened.answer), story: InvestigationReportStorySchema.nullable().safeParse(opened.story),
        sources: InvestigationReportSourceSchema.array().safeParse(opened.sources), paths: InvestigationReportPathSchema.array().optional().safeParse(opened.paths) } : null;
      if (version === null || !version.answer.success || !version.story.success || !version.sources.success || !version.paths.success) {
        await deps.page.recordSkip(owed.report_id, owed.publication_ref, "REPORT", "UNREADABLE");
        skipped += 1;
        continue;
      }
      const body = { answer: version.answer.data, story: version.story.data, sources: version.sources.data, ...(version.paths.data === undefined ? {} : { paths: version.paths.data }),
        shortened: isRecord(opened) && opened.shortened === true };
      const result = await deps.reportContentCheck.check({ runId: owed.report_id, snapshot: { reports: [body] } as unknown as PublicDebate });
      if (refused(result)) {
        await deps.page.recordSkip(owed.report_id, owed.publication_ref, "REPORT", "REFUSED");
        skipped += 1;
        continue;
      }
      if (result.outcome !== "ALLOW") {
        // A judge down this long: this version never reaches the page, the debate is free again, and anyone may press once more.
        if (tooOld(owed.recorded_at, reportGiveUp)) {
          await deps.page.recordSkip(owed.report_id, owed.publication_ref, "REPORT", "CHECK_UNAVAILABLE");
          skipped += 1;
        }
        continue;
      }
      const sealed = await deps.withPublicationKey(owed.publication_ref, (cipher) => cipher.encrypt(body));
      if (sealed === null) continue;
      if (await deps.page.recordReportCopy(owed.publication_ref, owed.report_version, owed.report_id, sealed) === "RECORDED") reports += 1;
    } catch (error) {
      log("PUBLIC_REPORT_NOT_COPIED", { reportId: owed.report_id, code: error instanceof Error ? error.name : "UNTYPED" });
    }
  }
  return Object.freeze({ settled, copied, reports, skipped });
}

/**
 * THE FREE DEBATES' SWEEP (decision 13): each finished Free debate whose ask carried the notice goes public after the publication check, or stays private for good on a refusal. An unavailable
 * check records nothing: the next pass tries again, so a crash anywhere loses nothing. It waits for the story for a while: a debate published a minute earlier would go out without its short answer.
 */
export type FreeSweepDeps = Readonly<{
  contributions: Pick<PostgresPublicDebateRunnerRepository, "readFreeToPublish" | "refuseFree">;
  publishOne: (waiting: Readonly<{ run_id: string; owner_ref: string; notice_at: string }>) => Promise<string>;
  log?: (event: string, detail: Record<string, unknown>) => void;
}>;
export async function sweepFreePublications(deps: FreeSweepDeps): Promise<Readonly<{ listed: number; published: number }>> {
  let published = 0;
  const waiting = await deps.contributions.readFreeToPublish().catch(() => []);
  for (const row of waiting) {
    try {
      const outcome = await deps.publishOne(row);
      if (outcome === "PUBLISHED") published += 1;
      deps.log?.("FREE_PUBLICATION", { runId: row.run_id, outcome });
    } catch (error) {
      deps.log?.("FREE_PUBLICATION_NOT_FINISHED", { runId: row.run_id, code: error instanceof Error ? error.name : "UNTYPED" });
    }
  }
  return Object.freeze({ listed: waiting.length, published });
}
export const FREE_PUBLICATION_STORY_WAIT_MS = 30 * 60_000;

/** The debate a dig was dug from: the contribution's parent. */
async function parentOfDig(pool: Pool, digRunId: string): Promise<string> {
  const next = (await pool.query<{ next: { parent_run_id: string } | null }>("SELECT identity.read_public_climb_next($1) AS next", [digRunId])).rows[0]?.next;
  return next?.parent_run_id ?? digRunId;
}
