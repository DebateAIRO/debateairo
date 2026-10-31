// apps/runner/src/web-packs.ts
/**
 * WEB SEARCH: THE PACKS IN THE ARGUING CALLS, AND THE LOCATOR CHECKED (Perplexity plan 2026-10-30, task W4-1; design
 * PERPLEXITY-DESIGN.md v2 §3.5; owner answers of 2026-10-29/30, item 7: writers see only the cited extract).
 *
 * Plain words: the web step (web-step.ts, W3-1) keeps one PACK per path that read pages: its top pages and their checked
 * extracts, labelled S<path>-<n>. This file reads those packs back from the store, cuts each to the plan's size, and
 * says what each call of the debate is shown:
 *  - a path's case writer, defender and critic read its pack (the `sources` field of their sources variant);
 *  - a reply to a rival (the cross-reply) reads its own path's pack and the rival's;
 *  - the reviewer, the comparing judges, the answer writer and the storyteller never see a pack: only the one extract a
 *    point cites, copied by code from the stored pack; the answer checker reads the extracts the writer read (W4-7);
 *  - "looked up" stays only for a locator that is exactly an extract id of THIS debate's packs (`Judge.judge`'s
 *    `debateExtractIds`); any other locator becomes "reasoning", with the downgrade note the engine already has.
 *  - a dig (W4-2) keeps ONE pack, under its first path, and every path of the dig reads it (W4-7): the step's outcomes
 *    name the pack each path reads, so a dig path with no pack row of its own reads the first path's, the same bytes.
 * Nothing here searches the web: the debate reads what the web step stored, and only that.
 *
 * The rules it keeps:
 * - No packs (Free, the web off, a path the planner left alone, an old run): every function hands back what it was
 *   given, the same object, so every prompt is today's, byte for byte.
 * - The cut is a code rule, the same bytes every time: a pack's pages in the pick's rank, then its extracts in the pick's
 *   rank of their page and, within a page, in the pack's own order; each extract is kept when the pack still fits in
 *   WEB_PACK_LIMITS.bytes, and left out when it does not (a later, shorter one may still fit).
 * - Page texts never reach here: a pack holds quotes, titles, sites and dates only (W3-0).
 */
import { z } from "zod";
import type { Pool } from "pg";
import { WEB_EVIDENCE_CARRIERS } from "@debateai/db";
import { TypedDomainError, type EngineCitedExtract, type EngineMaterialSource } from "@debateai/kernel";
import type { JudgeLeg } from "@debateai/judgement";
import { postgresWebStepPorts, type WebStepPorts } from "./web-step.js";

/* ----------------------------------------------------------------- the size */

/**
 * The plan's pack: about 3,000 tokens a path (design §3.5). Counted in UTF-8 bytes of the pack as the leg reads it, at
 * 4 bytes a token (about an English token; the money seam still prices every call that reads it its own way, 2 bytes a
 * token, so no wall under-counts it).
 */
export const WEB_PACK_LIMITS = Object.freeze({ tokens: 3000, bytesPerToken: 4, bytes: 12_000 });
/**
 * The most bytes a case writer's `sources` text holds: its one pack at the cut, plus the list and the `for` member around
 * it. Root 0's room is framed with this many characters of sources when the web step keeps it (index.ts).
 */
export const WEB_ROOT_SOURCES_MAX_BYTES = WEB_PACK_LIMITS.bytes + 64;

/* ----------------------------------------------------------------- the stored pack */

const text = z.string().min(1);
/** The pack's sealed value, as web-step.ts writes it (`recordPack`): only the members read here are checked. */
const storedPackSchema = z.object({
  path_ref: text,
  pages: z.array(z.object({
    page_id: text, rank: z.number().int().min(1), title: z.string().nullable(), site: text, date: z.string().nullable(),
    read_depth: z.enum(["whole", "preview", "abstract"])
  })),
  extracts: z.array(z.object({ label: z.string().regex(/^S[1-9][0-9]*-[1-9][0-9]*$/u), page_id: text, quote: text }))
});

export type WebPackPage = Readonly<{
  pageId: string; rank: number; title: string | null; site: string; date: string | null; readDepth: "whole" | "preview" | "abstract";
}>;
export type WebPackExtract = Readonly<{ label: string; pageId: string; quote: string }>;
/** One path's pack: its top pages, best first, and its checked extracts in the pack's own order. */
export type WebPack = Readonly<{ pathRef: string; pages: readonly WebPackPage[]; extracts: readonly WebPackExtract[] }>;

/** A stored pack's opened value as a pack, or null when it is not one (that pack is left out, never failing the run). */
export function webPackOf(value: unknown): WebPack | null {
  const parsed = storedPackSchema.safeParse(value);
  if (!parsed.success) return null;
  const pages = [...parsed.data.pages].sort((left, right) => left.rank - right.rank);
  const known = new Set(pages.map((page) => page.page_id));
  return Object.freeze({
    pathRef: parsed.data.path_ref,
    pages: Object.freeze(pages.map((page) => Object.freeze({ pageId: page.page_id, rank: page.rank, title: page.title, site: page.site,
      date: page.date, readDepth: page.read_depth }))),
    // An extract of a page the pack does not list has no page to name: left out.
    extracts: Object.freeze(parsed.data.extracts.filter((extract) => known.has(extract.page_id))
      .map((extract) => Object.freeze({ label: extract.label, pageId: extract.page_id, quote: extract.quote })))
  });
}

/* ----------------------------------------------------------------- the cut */

/** How a pack reads in a leg's `sources` field (code's keys): pages by their rank, extracts by their id. */
type ShownPack = Readonly<{
  pages: readonly Readonly<{ page: number; title: string | null; site: string; date: string | null; read: string }>[];
  extracts: readonly Readonly<{ id: string; page: number; quote: string }>[];
}>;

const bytesOf = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");

/**
 * THE CUT: the pack as a leg reads it, within WEB_PACK_LIMITS.bytes. Pages in the pick's rank, then extracts in the
 * pick's rank of their page and the pack's own order; each kept while the whole still fits, a later one still tried.
 * Pure: the same pack gives the same bytes every time.
 */
export function webPackShown(pack: WebPack): ShownPack {
  // The pages first, in rank order, each while the pack still fits (a pack is never over the size, whatever the titles).
  const shownPages: ShownPack["pages"][number][] = [];
  const rankOf = new Map<string, number>();
  for (const page of pack.pages) {
    const entry = Object.freeze({ page: page.rank, title: page.title, site: page.site, date: page.date, read: page.readDepth });
    if (bytesOf({ pages: [...shownPages, entry], extracts: [] }) > WEB_PACK_LIMITS.bytes) continue;
    shownPages.push(entry);
    rankOf.set(page.pageId, page.rank);
  }
  const pages = Object.freeze(shownPages);
  // An extract of a page left out has no page to name: left out with it.
  const ordered = pack.extracts.filter((extract) => rankOf.has(extract.pageId)).map((extract, order) => ({ extract, order }))
    .sort((left, right) => rankOf.get(left.extract.pageId)! - rankOf.get(right.extract.pageId)! || left.order - right.order);
  const kept: Readonly<{ id: string; page: number; quote: string }>[] = [];
  for (const { extract } of ordered) {
    const entry = Object.freeze({ id: extract.label, page: rankOf.get(extract.pageId)!, quote: extract.quote });
    if (bytesOf({ pages, extracts: [...kept, entry] }) <= WEB_PACK_LIMITS.bytes) kept.push(entry);
  }
  return Object.freeze({ pages, extracts: Object.freeze(kept) });
}

/* ----------------------------------------------------------------- the debate's packs */

/** Which material field a pack backs in a leg (the leg's own field names). */
export type WebPackFor = "assigned_answer" | "position_under_debate" | "own_position" | "other_makers_position";

export type DebateWebPacks = Readonly<{
  /** Every extract id of this debate's packs (the locator check's list). */
  extractIds: ReadonlySet<string>;
  /** The pack of a path, by its ref (the map's answer id), or undefined when the path kept none. */
  packOf: (pathRef: string) => WebPack | undefined;
  /** The extract a locator names, exactly, as the reviewer, judges and writers read it; undefined for any other locator. */
  citedExtract: (locator: string | null) => EngineCitedExtract | undefined;
}>;

/**
 * A path that reads a pack kept under another path's ref (W4-7): on a dig, every path but the first reads the one pack
 * kept under the first (W4-2; 0132 ties a pack to its searches' path, so the others have no pack row of their own).
 */
export type WebPackShare = Readonly<{ pathRef: string; keptUnder: string }>;

/**
 * The debate's packs, or null when it kept none (then nothing in the debate changes). `shared` names the paths that read
 * a pack kept under another path (a dig's); none on a first debate, where each path reads only its own.
 */
export function debateWebPacks(packs: readonly WebPack[], shared: readonly WebPackShare[] = []): DebateWebPacks | null {
  const kept = packs.filter((pack) => pack.extracts.length > 0 || pack.pages.length > 0);
  if (kept.length === 0) return null;
  const byPath = new Map(kept.map((pack) => [pack.pathRef, pack] as const));
  // A path's own pack wins; a shared path reads the very pack object of the path it is kept under (the same cut, the same bytes).
  for (const share of shared) {
    const pack = byPath.get(share.keptUnder);
    if (pack !== undefined && !byPath.has(share.pathRef)) byPath.set(share.pathRef, pack);
  }
  const extracts = new Map<string, EngineCitedExtract>();
  for (const pack of kept) {
    const pageOf = new Map(pack.pages.map((page) => [page.pageId, page] as const));
    for (const extract of pack.extracts) {
      const page = pageOf.get(extract.pageId)!;
      extracts.set(extract.label, Object.freeze({ id: extract.label, quote: extract.quote, title: page.title, site: page.site, date: page.date }));
    }
  }
  return Object.freeze({
    extractIds: new Set(extracts.keys()),
    packOf: (pathRef) => byPath.get(pathRef),
    citedExtract: (locator) => locator === null ? undefined : extracts.get(locator)
  });
}

/**
 * The `sources` text a leg reads: one entry per pack it is given, in the order given (own path first), each naming the
 * field it backs. Undefined when none of the paths kept a pack (the leg is then today's).
 */
export function webSourcesText(packs: DebateWebPacks | null,
  entries: readonly Readonly<{ pathRef: string | null; for: WebPackFor }>[]): string | undefined {
  if (packs === null) return undefined;
  const shown = entries.flatMap((entry) => {
    const pack = entry.pathRef === null ? undefined : packs.packOf(entry.pathRef);
    return pack === undefined ? [] : [Object.freeze({ for: entry.for, ...webPackShown(pack) })];
  });
  return shown.length === 0 ? undefined : JSON.stringify(shown);
}

/**
 * WHO READS WHICH PACK: the leg with its `sources`, or the very same leg when it reads none. An engine-2 case writer reads
 * its path's pack; a defender or critic, the pack of the path its chain is under; a cross-reply, its own path's then the
 * rival's. Every other leg (today's openings, an assigned root without engine 2) reads none.
 */
export function legWithWebSources(leg: JudgeLeg, packs: DebateWebPacks | null,
  paths: Readonly<{ own: string | null; rival?: string | null }>): JudgeLeg {
  if (packs === null) return leg;
  const sources = leg.kind === "assigned-root" && leg.engine !== undefined
    ? webSourcesText(packs, [{ pathRef: paths.own, for: "assigned_answer" }])
    : leg.kind === "support" || leg.kind === "attack"
      ? webSourcesText(packs, [{ pathRef: paths.own, for: "position_under_debate" }])
      : leg.kind === "cross-root"
        ? webSourcesText(packs, [{ pathRef: paths.own, for: "own_position" }, { pathRef: paths.rival ?? null, for: "other_makers_position" }])
        : undefined;
  return sources === undefined ? leg : Object.freeze({ ...leg, sources });
}

/* ----------------------------------------------------------------- what the readers of a point see */

/** A node as the readers' material reads it: its way of knowing and its locator (after the locator check). */
export type WebCitingNode = Readonly<{ nodeId: string; wayOfKnowing: string; locator: string | null }>;

/** The extract each looked-up node cites (only those whose locator is one of this debate's), by node id. */
export function webCitedExtractsOf(packs: DebateWebPacks | null, nodes: readonly WebCitingNode[]): ReadonlyMap<string, EngineCitedExtract> {
  const cited = new Map<string, EngineCitedExtract>();
  if (packs === null) return cited;
  for (const node of nodes) {
    if (node.wayOfKnowing !== "LOOKED_UP") continue;
    const extract = packs.citedExtract(node.locator);
    if (extract !== undefined) cited.set(node.nodeId, extract);
  }
  return cited;
}

/**
 * The review's `cited_extract` (item 6), spread into its call: on a lengthed review of a looked-up point whose locator is
 * one of this debate's extract ids, that extract as one JSON text; nothing otherwise (today's review, byte for byte).
 */
export function webReviewInput(packs: DebateWebPacks | null, node: WebCitingNode, lengthed: boolean): Readonly<{ citedExtract?: string }> {
  if (packs === null || !lengthed) return {};
  const extract = webCitedExtractsOf(packs, [node]).get(node.nodeId);
  return extract === undefined ? {}
    : { citedExtract: JSON.stringify({ id: extract.id, quote: extract.quote, title: extract.title, site: extract.site, date: extract.date }) };
}

/** The comparing judges' source with each cited extract on its case or point; the same source when none cites one. */
export function engineSourceWithCitedExtracts(source: EngineMaterialSource, cited: ReadonlyMap<string, EngineCitedExtract>):
  EngineMaterialSource {
  if (cited.size === 0) return source;
  const withCited = <T extends Readonly<Record<string, unknown>>>(entry: T, nodeId: string): T => {
    const extract = cited.get(nodeId);
    return extract === undefined ? entry : Object.freeze({ ...entry, citedExtract: extract });
  };
  return Object.freeze({
    ...source,
    answers: Object.freeze(source.answers.map((answer) => withCited(answer, answer.rootNodeId))),
    points: Object.freeze(source.points.map((point) => withCited(point, point.nodeId)))
  });
}

/* ----------------------------------------------------------------- the store */

/** A path's web step outcome as the packs reader reads it: the pack it names (`WebStepPathOutcome`'s two members). */
export type WebPackOfPath = Readonly<{ pathRef: string; packId: string | null }>;

/**
 * The run's packs, read back from the web store (0132) and opened under the run's key on a content lease of their own,
 * closed before returning. A pack that does not open or is not a pack is left out (logged); a store that cannot be read
 * leaves the debate without packs (logged), unless `abandon` names the error (the run must stop). Null when none is kept.
 * W4-7: `paths` are the web step's outcomes; a path whose outcome names a pack kept under another path (every path of a
 * dig but the first) reads that pack. Without them, or on a first debate, each path reads only its own.
 */
export async function readDebateWebPacks(input: Readonly<{
  pool: Pool;
  runId: string;
  paths?: readonly WebPackOfPath[];
  ports?: (pool: Pool, runId: string) => Promise<WebStepPorts>;
  abandon?: (error: unknown) => boolean;
  log?: (event: string, detail: Readonly<Record<string, unknown>>) => void;
}>): Promise<DebateWebPacks | null> {
  const log = input.log ?? ((event, detail) => { console.warn(JSON.stringify({ kind: "DEBATEAI_WEB_PACKS", event, ...detail })); });
  let ports: WebStepPorts | null = null;
  try {
    ports = await (input.ports ?? postgresWebStepPorts)(input.pool, input.runId);
    const read = await ports.store.read(input.runId);
    /** Each opened pack's path, by its pack id (the ids the step's outcomes name). */
    const keptUnder = new Map<string, string>();
    const packs = (read?.packs ?? []).flatMap((stored) => {
      let opened: unknown;
      try {
        opened = ports!.cipher.open(WEB_EVIDENCE_CARRIERS.pack, stored.pack_id, stored.content);
      } catch (error) {
        log("WEB_PACK_UNOPENED", { runId: input.runId, code: error instanceof TypedDomainError ? error.code : "UNTYPED" });
        return [];
      }
      const pack = webPackOf(opened);
      if (pack === null || pack.pathRef !== stored.path_ref) {
        log("WEB_PACK_INVALID", { runId: input.runId });
        return [];
      }
      keptUnder.set(stored.pack_id, stored.path_ref);
      return [pack];
    });
    // W4-7: a path whose outcome names a pack kept under another path reads it (a dig's paths after the first).
    const shared = (input.paths ?? []).flatMap((path): WebPackShare[] => {
      const home = path.packId === null ? undefined : keptUnder.get(path.packId);
      return home === undefined || home === path.pathRef ? [] : [Object.freeze({ pathRef: path.pathRef, keptUnder: home })];
    });
    // The store's order is its own; the debate reads packs by path, so the order never reaches a prompt.
    return debateWebPacks(packs, shared);
  } catch (error) {
    if (input.abandon?.(error) === true) throw error;
    log("WEB_PACKS_UNREAD", { runId: input.runId, code: error instanceof TypedDomainError ? error.code : "UNTYPED" });
    return null;
  } finally {
    await ports?.close();
  }
}
