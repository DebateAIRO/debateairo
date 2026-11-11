import type { PublicDebate } from "@debateai/contract";
import { buildPublicDebatePresentation } from "../publicDebatePresentation.js";
import type { MessageCatalog } from "../i18n/translate.js";
import { restarMap } from "./mapModel.js";
import { publicPathViews, type PublicPathView } from "./publicPage.js";
import { countTrust, pointsOfNodes } from "./trust.js";
import type { V4Map, V4OpenQuestion, V4Path, V4Point } from "./types.js";

/*
 * Owner's screen review, 3 Nov 2026 (public-d1 A, public-f1, r2-1 A, r2-20 A): the public page is read the way the
 * person's own map is read. This builds the same V4Map from what a public debate already carries: the short story's
 * paths at their newest text (contributions included, lib/v4/publicPage.ts) and, when the tree was published, its
 * points. So the public page and its read-only map use the own map's pieces: one trust word and the four-shade bar per
 * path, the "How sure" sentence, the open questions and the one star. A point's word comes from the own map's builder
 * (lib/v4/trust.ts pointsOfNodes, on the contract's one rule trustOfPoint), so the two pages never word a point apart.
 * Nothing here reads a score, a model or a count of the engine; the scores only rank which point is the strongest on
 * each side (publicSidesOf) and never leave this file.
 * A debate published without its tree has no points: its paths then carry no word and no bar. Server need (public-d1):
 * each path's trust word and bar on every public debate. A path debate's snapshot carries each path's own trust word
 * (the start-step branch's Task 63, `branches`), read here in place of the tree; its bar still needs the tree.
 */

/**
 * The public snapshot carries no web part, so whether its debate ran on Free cannot be read here. "Sure" rests on the
 * server's own checked flag (`looked_up_checked`), which a Free debate never has (Free never searches), so the rule
 * gives a Free debate no "Sure" either way.
 */
const PUBLIC_RAN_ON_FREE = false;

/** The points a path rests on, in its order, each once. */
function pathPoints(nodeRefs: readonly string[], byId: ReadonlyMap<string, V4Point>): V4Point[] {
  const taken = new Set<string>();
  const points: V4Point[] = [];
  for (const ref of nodeRefs) {
    const point = byId.get(ref);
    if (point === undefined || taken.has(ref)) continue;
    taken.add(ref);
    points.push(point);
  }
  return points;
}

/** A still-argued point is an open question under its path (the own map's rule, mapModel.ts stillArgued). */
function stillArguedUnder(points: readonly V4Point[], pathId: string | null): V4OpenQuestion[] {
  return points
    .filter((point) => point.trust === "STILL_ARGUED")
    .map((point) => ({ id: `p:${point.id}`, kind: "STILL_ARGUED" as const, text: point.text, star: false, pathId }));
}

/** What would change the answer: the story's checked line, else the snapshot's reversal point. */
function turningPointOf(debate: PublicDebate): string | null {
  const fromStory = debate.story_short?.change.text.trim() ?? "";
  if (fromStory.length > 0) return fromStory;
  const raw = debate.answer.reversal_point.trim();
  return raw.length > 0 ? raw : null;
}

/** The questions under the question itself: the objections still standing, then what would change the answer (the own map's order and ids). */
function rootOpenOf(debate: PublicDebate, turn: string | null): V4OpenQuestion[] {
  const open: V4OpenQuestion[] = [];
  debate.answer.residual_objections.forEach((objection, index) => {
    const text = objection.trim();
    if (text.length > 0) open.push({ id: `o:${index}`, kind: "OBJECTION", text, star: false, pathId: null });
  });
  if (turn !== null) open.push({ id: "w", kind: "WOULD_CHANGE", text: turn, star: false, pathId: null });
  return open;
}

export type PublicMap = Readonly<{
  map: V4Map;
  /** Each map path's page view (its newest text, who added to it, its digs), by the map path's id. */
  views: ReadonlyMap<string, PublicPathView>;
}>;

/**
 * The public debate as a V4Map. Paths are the short story's, at their newest text; their ids are the story positions
 * (a repeated one gets "#2", as on the own map). Exactly one star (journey-f12: "★ A good place to start"), chosen by the
 * own map's rule among the questions a public page can dig into: a dig on a public page needs a path, so the questions
 * that hang under the question itself are shown, never starred.
 */
export function publicMapOf(debate: PublicDebate): PublicMap {
  const story = debate.story_short;
  const pageViews = publicPathViews(debate);
  const fell = new Set(pageViews.filter((view) => view.fate === "FELL").map((view) => view.ref));
  const byId = debate.answer.tree_included === true
    ? pointsOfNodes(debate.answer.nodes ?? [], { free: PUBLIC_RAN_ON_FREE, fell })
    : new Map<string, V4Point>();
  const seen = new Map<string, number>();
  const views = new Map<string, PublicPathView>();
  const paths: V4Path[] = (story?.paths ?? []).map((storyPath, at) => {
    const count = (seen.get(storyPath.position_ref) ?? 0) + 1;
    seen.set(storyPath.position_ref, count);
    const id = count === 1 ? storyPath.position_ref : `${storyPath.position_ref}#${String(count)}`;
    // publicPathViews gives one view per story path, in the story's order.
    const view = pageViews[at];
    if (view !== undefined) views.set(id, view);
    const points = pathPoints(storyPath.node_refs, byId);
    const { counts, unchecked } = countTrust(points);
    const fate = view?.fate ?? storyPath.fate;
    return {
      id,
      fate,
      line: view?.line ?? storyPath.line,
      points,
      counts,
      unchecked,
      open: stillArguedUnder(points, id),
      positionRef: storyPath.position_ref,
      // r2-20 A: a path's one word is its position's, or on a path debate its path's own (Task 63, no published tree needed); a path that fell
      // (also after a contribution) did not hold.
      trust: fate === "FELL" ? "DIDNT_HOLD"
        : debate.branches?.paths.find((branch) => branch.path_id === storyPath.position_ref)?.outcome?.trust ?? byId.get(storyPath.position_ref)?.trust ?? null
    };
  });
  const allPoints = [...byId.values()];
  if (paths.length === 0 && allPoints.length > 0) {
    // The own map's rule for an answer with no story paths (mapModel.ts buildV4Map): one path that holds every point, named by the first answer text.
    // It stands for no position, so it carries no trust word and no page view (nothing on a public page can dig it).
    const first = debate.answer.summary_segments.find((segment) => segment.text.trim().length > 0)?.text ?? debate.question;
    const { counts: allCounts, unchecked: allUnchecked } = countTrust(allPoints);
    paths.push({ id: "all", fate: null, line: first, points: allPoints, counts: allCounts, unchecked: allUnchecked, open: stillArguedUnder(allPoints, "all") });
  }
  const { counts, unchecked } = countTrust(allPoints);
  const turn = turningPointOf(debate);
  // The own map's DATA-6: a still-argued point no path cites still counts as open, under the question itself.
  const covered = new Set(paths.flatMap((path) => path.open.map((question) => question.id)));
  const root = [...rootOpenOf(debate, turn), ...stillArguedUnder(allPoints, null).filter((question) => !covered.has(question.id))];
  const composed = debate.answer.summary_segments.map((segment) => segment.text.trim()).filter((text) => text.length > 0).join("\n\n");
  const unstarred: V4Map = {
    runId: debate.public_ref,
    answerId: debate.public_ref,
    answerVersion: 1,
    question: debate.question,
    headline: story?.headline ?? null,
    summary: story?.summary ?? null,
    confidence: story?.confidence ?? null,
    why: [],
    sections: [],
    paths,
    points: allPoints,
    open: root,
    counts,
    unchecked,
    wouldChange: turn,
    wouldChangeAlt: null,
    objections: debate.answer.residual_objections.map((objection) => objection.trim()).filter((objection) => objection.length > 0),
    storyState: story === undefined ? "UNAVAILABLE" : "READY",
    fallbackText: story === undefined && composed.length > 0 ? composed : null,
    reservation: story?.double_checked === false,
    webNote: null,
    digLevel: null,
    changedSince: null,
    dig: null
  };
  // The questions under the question itself cannot be dug from a public page: they are left out of the star's choice.
  return { map: restarMap(unstarred, new Set(root.map((question) => question.id))), views };
}

/** True when the published tree gave this page any checked point: only then is there a bar and a trust word to show. */
export function publicHasWords(map: V4Map): boolean {
  return map.points.some((point) => point.trust !== null);
}

/** One side's strongest published point: its sentence, and its node (a publication review's "Read" opens it). */
export type PublicSide = Readonly<{ line: string; nodeId: string }>;

/**
 * public-d1 A: "For" and "Against" in one sentence each: the strongest published point on each side, as the AIs wrote
 * it. No score, no model code, no count reaches the page; a side with no published point is left out (null).
 */
export function publicSidesOf(debate: PublicDebate, catalog: MessageCatalog): Readonly<{ forSide: PublicSide | null; againstSide: PublicSide | null }> {
  if (debate.answer.tree_included !== true) return { forSide: null, againstSide: null };
  const presentation = buildPublicDebatePresentation(debate, catalog);
  const side = (argument: Readonly<{ claim: string; nodeId: string }> | null): PublicSide | null => {
    const text = argument?.claim.replace(/\s+/gu, " ").trim() ?? "";
    return argument === null || text.length === 0 ? null : { line: text, nodeId: argument.nodeId };
  };
  return { forSide: side(presentation.strongestPro), againstSide: side(presentation.strongestCon) };
}
