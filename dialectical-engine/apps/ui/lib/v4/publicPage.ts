import {
  ContractHttpError, DIG_FREE_PICKS_MAX, DIG_PICKS_ONE_PATH, DIG_TOO_DEEP,
  type ContractClient, type DigSuggestion, type PublicContribution, type PublicDebate, type PublicDigParent, type PublicReportVersion, type StoryFate
} from "@debateai/contract";
import { contractClient } from "../api.js";
import { t, type MessageCatalog } from "../i18n/translate.js";
import { digQuestion } from "./askText.js";
import { startsWaitLine } from "./money.js";
import { ownViewPick, publicParentOf, suggestionPick } from "./suggestions.js";
import { TRUST_WORDS, type DigMode, type DigTarget, type TrustCounts, type V4Path } from "./types.js";
import type { AskRoom } from "../billing/room.js";

/*
 * Decisions 13, 16 and 22 of 31 Oct: what a public page shows of the contributions made since its snapshot, and what its Dig and Report presses send.
 * The snapshot itself never changes: each path is read here at its newest text, oldest contribution first (the order the API serves them, and the order
 * apps/api/src/public-tree.ts publicMaterialOf reads them for the runner, so the page and the AIs read the same text). Nothing here carries a run id.
 */

/** Who added to a path and when; `contributor` null once the name went: the page says "a contributor". */
export type PublicAddition = Readonly<{ contributor: string | null; on: string; whatChanged: readonly string[] }>;

export type PublicPathView = {
  ref: string;
  /** `PublicDigParent.dig_ref` of a dig on this path: null on the debate's own paths, the contribution's reference under a dig. */
  digRef: string | null;
  canDig: boolean;
  line: string;
  fate: StoryFate;
  /** The newest contribution's own text about the path; null while none changed it. */
  summary: string | null;
  points: readonly string[];
  /** Newest first. */
  additions: PublicAddition[];
  digs: PublicDigView[];
};

/** An allowed dig on a path, with its own paths. */
export type PublicDigView = { ref: string | null; paths: PublicPathView[] };

function digPathView(path: NonNullable<PublicContribution["dig_paths"]>[number], digRef: string | null): PublicPathView {
  return { ref: path.position_ref, digRef, canDig: digRef !== null, line: path.line, fate: path.fate, summary: null, points: path.points, additions: [], digs: [] };
}

/** The debate's paths at their newest text, each with who added to it, and the digs under it with their own paths. Empty for a snapshot with no story. */
export function publicPathViews(debate: PublicDebate): readonly PublicPathView[] {
  const paths: PublicPathView[] = (debate.story_short?.paths ?? []).map((path) => ({
    ref: path.position_ref, digRef: null, canDig: true, line: path.line, fate: path.fate, summary: null, points: [], additions: [], digs: []
  }));
  const digs: PublicDigView[] = [];
  const pathOf = (ref: string): PublicPathView | null => paths.find((path) => path.ref === ref)
    ?? digs.flatMap((dig) => dig.paths).find((path) => path.ref === ref) ?? null;
  for (const contribution of debate.contributions ?? []) {
    // A dig's own rewrite opens a dig, under the dig it was made on; a row that only moves a higher path's text opens none.
    const path = digs.find((dig) => dig.ref === contribution.on_ref)?.paths.find((own) => own.ref === contribution.position_ref) ?? pathOf(contribution.position_ref);
    if (path === null) continue;
    if (contribution.own_rewrite === true || (contribution.dig_paths?.length ?? 0) > 0) {
      const ref = contribution.update_ref ?? null;
      const dig: PublicDigView = { ref, paths: (contribution.dig_paths ?? []).map((own) => digPathView(own, ref)) };
      digs.push(dig);
      path.digs.push(dig);
    }
    path.line = contribution.line;
    path.fate = contribution.fate;
    path.summary = contribution.summary;
    path.additions.unshift({ contributor: contribution.contributor, on: contribution.contributed_on, whatChanged: contribution.what_changed });
  }
  return paths;
}

/** The name a page shows: a contributor's or a report writer's pseudonym, or "a contributor" once it went. */
export function contributorName(name: string | null, catalog: MessageCatalog): string {
  return name ?? t(catalog, "v4.public.aContributor");
}

/** Every report version, newest first (the API serves them oldest first). */
export function reportsNewestFirst(reports: readonly PublicReportVersion[] | undefined): readonly PublicReportVersion[] {
  return [...(reports ?? [])].sort((a, b) => b.report_version - a.report_version);
}

/**
 * What a dig on this path sends: the question built as a dig's question is on the V4 map (digQuestion, from the path's line and the person's own views under
 * the debate's question), and its `public_parent`. Owner screen review (public-f11, public-d2): a quick look unless the person chose Thorough (`mode`, paid
 * plans only: the caller sends Free's quick look), and the path's own suggestions the person tapped (`chips`) first, then their own views. `target` is the
 * dig as the site's one Undo list keeps it. Null when it would not pass the contract's shape: nothing is sent then.
 */
export function publicDigAsk(input: Readonly<{
  publicRef: string; question: string; path: Pick<PublicPathView, "ref" | "digRef" | "line" | "fate">; views: readonly string[]; catalog: MessageCatalog; locale: string;
  mode?: DigMode; chips?: readonly DigSuggestion[];
}>): Readonly<{ questionLine: string; parent: PublicDigParent; target: DigTarget }> | null {
  const { path } = input;
  const standIn: V4Path = { id: path.ref, fate: path.fate, line: path.line, points: [], counts: Object.fromEntries(TRUST_WORDS.map((word) => [word, 0])) as TrustCounts, unchecked: 0, open: [] };
  const chosen = (input.chips ?? []).map((suggestion) => suggestionPick(path.ref, suggestion));
  const views = input.views.map((view) => view.trim()).filter((view) => view.length > 0).map((view, serial) => ownViewPick(path.ref, view, serial));
  const picks = [...chosen, ...views];
  if (picks.length === 0) return null;
  const target: DigTarget = { kind: "picks", path: standIn, picks };
  const parent = publicParentOf(input.publicRef, path.digRef, target, input.mode ?? "quick");
  return parent === null ? null : { questionLine: digQuestion(target, input.question, input.catalog, input.locale), parent, target };
}

/** A refusal of a public page's dig in plain words: no level, no count, no code. Null: any other failure, which the ask's own handling says. */
export function publicDigRefusalWords(failure: unknown, catalog: MessageCatalog, room: AskRoom | null, locale: string): string | null {
  if (!(failure instanceof ContractHttpError)) return null;
  if (failure.status === 404) return t(catalog, "v4.public.refusal.notFound");
  if (failure.status === 400 && failure.serverCode === "PUBLIC_DIG_NEEDS_A_PATH") return t(catalog, "v4.public.refusal.needsAPath");
  if (failure.status === 400 && failure.serverCode === DIG_PICKS_ONE_PATH) return t(catalog, "v4.public.refusal.needsAPath");
  if (failure.status === 400 && failure.serverCode === DIG_FREE_PICKS_MAX) return t(catalog, "v4.public.refusal.freeMax");
  if (failure.status === 409 && failure.serverCode === DIG_TOO_DEEP) return t(catalog, "v4.public.refusal.tooDeep");
  if (failure.status === 409 && failure.serverCode === "PUBLIC_DEBATE_REPORT_WRITING") return t(catalog, "v4.public.refusal.reportWriting");
  if (failure.status === 409 && failure.serverCode === "PUBLIC_DEBATE_WAITS_FOR_RESET") return usedUpWords(catalog, room, locale);
  return null;
}

/** The site's plain line for a used-up limit, with its time when the room read knows it. */
export function usedUpWords(catalog: MessageCatalog, room: AskRoom | null, locale: string): string {
  const line = startsWaitLine(room, locale);
  return line === null ? t(catalog, "v4.public.refusal.waitsForReset") : t(catalog, line.key, line.values);
}

export type PublicReportPress = Readonly<{ kind: "WRITING"; version: number }> | Readonly<{ kind: "REFUSED"; message: string }>;

/** "Write a report": what the API said, in the page's words. */
export async function pressPublicReport(publicRef: string, input: Readonly<{ catalog: MessageCatalog; room: AskRoom | null; locale: string }>,
  client: Pick<ContractClient, "writePublicReport"> = contractClient): Promise<PublicReportPress> {
  const { catalog, room, locale } = input;
  const refused = (key: string): PublicReportPress => ({ kind: "REFUSED", message: t(catalog, key) });
  try {
    const answer = await client.writePublicReport(publicRef);
    if ("state" in answer) return { kind: "WRITING", version: answer.report_version };
    switch (answer.error) {
      case "PUBLIC_DEBATE_ONGOING": return refused("v4.public.report.ongoing");
      case "PUBLIC_DEBATE_NO_CARRIER": return refused("v4.public.report.noCarrier");
      case "PUBLIC_DEBATE_REPORT_WRITING": return refused("v4.public.refusal.reportWriting");
      case "PUBLIC_DEBATE_WAITS_FOR_RESET": return { kind: "REFUSED", message: usedUpWords(catalog, room, locale) };
      default: return refused("v4.public.report.failed");
    }
  } catch {
    return refused("v4.public.report.failed");
  }
}
