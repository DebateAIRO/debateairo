import {
  canDigFromLevel,
  DigLevelSchema,
  RUN_PATH_LIMITS,
  type Answer,
  type AnswerBranch,
  type AnswerBranches,
  type AnswerStory,
  type DigSuggestion,
  type PathRewrite,
  type RunPathFinding,
  type RunPathProgress,
  type RunProjection,
  type StartPathAuthor,
  type StoryFate
} from "@debateai/contract";
import { pathSuggestionsOf } from "./suggestions.js";
import { countTrust, emptyCounts, pointsOf, servedRewriteCounts, servedRewriteWords } from "./trust.js";
import type {
  RewriteState,
  TrustWord,
  V4Branch,
  V4Map,
  V4MoreItem,
  V4OpenQuestion,
  V4Path,
  V4PathRewrites,
  V4PathTag,
  V4PathWeb,
  V4Point
} from "./types.js";
import { pathWebOf, webNoteOf } from "./web.js";

/*
 * V4 initial (2026-10-28): one served answer (+ its story, when written) as the map row D draws (R/42 §7). Paths are
 * the story's paths.
 * Dig model revision W4-6 (owner Q-D13, 31 Oct): a dig keeps its points and its answer text and writes NO story, so a
 * dig's own map never reads one: its paths are the ones its rewrite names (Q-D2: each with its line and fate), or, until
 * the rewrite is written, the positions it argued (each line the position's own claim, no fate invented). Every path a
 * dig rewrote shows its newest finished text (Answer.path_rewrites), and keeps what it said before.
 * V4 start step, Task 60 (spec 2026-11-03 §2 items 7 and 8): on a path debate (`Answer.branches`) the paths are the ones
 * the person chose before Start, in their order, each named by its path id and holding the nodes under its root. The run
 * read draws the same paths while the debate runs (`buildV4RunMap`), each filling in from its own progress, and Start's
 * 10 s draws them before any run exists (`buildV4PendingMap`, answer Q11). No path is ever made up (map-f4): an answer
 * with no story path and no branch has no path, and every point is the question's own.
 */

type StoryBody = NonNullable<AnswerStory["story"]>;

/** Local reasons for a story read that failed for a moment (V3's useAnswerStory "fail" path). */
const PASSING_STORY_FAILURES: ReadonlySet<string> = new Set(["STORY_UNREADABLE", "STORY_READ_FAILED"]);

/**
 * DATA-3/DATA-10: true when this story record is a failed read worth trying again: the server's STORY_UNREADABLE
 * answer, or a read that failed for another passing reason (loadStory's local STORY_READ_FAILED record). V3 accepts
 * it only after 4 failures in a row (STORY_POLLING.readFailureLimit). A 404, SESSION_REQUIRED or FORBIDDEN is final.
 */
export function storyReadFailed(story: AnswerStory | null): boolean {
  return story !== null && story.status === "UNAVAILABLE" && story.unavailable_reason !== null
    && PASSING_STORY_FAILURES.has(story.unavailable_reason);
}

function readyBody(story: AnswerStory | null): StoryBody | null {
  if (story === null || story.story === null) return null;
  return story.status === "READY" || story.status === "READY_WITH_RESERVATION" ? story.story : null;
}

/**
 * A read that failed for a moment (DATA-3/DATA-10) reads like "still being written" until the page stops trying,
 * as V3's story poll keeps what it showed while it retries.
 */
function storyStateOf(story: AnswerStory | null, body: StoryBody | null, gaveUp: boolean): V4Map["storyState"] {
  if (body !== null) return "READY";
  // R2TIME-3 (minimal part): a story still WRITING reads as unavailable only once the page has given up waiting (the
  // pages back off and give up only after a long wait), so the page never says it updates by itself when it no longer asks.
  if (story?.status === "WRITING") return gaveUp ? "UNAVAILABLE" : "WRITING";
  if ((story === null || storyReadFailed(story)) && !gaveUp) return "WRITING";
  return "UNAVAILABLE";
}

/** Any id shaped like a node's (packages/story's STORY_NODE_ID_TEXT), in any letter case. */
const NODE_ID_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const POINT_TOKEN = /\bP[1-9][0-9]*\b/gu;

/** After cutting tokens out: drop brackets left empty, stray separators and doubled spaces. */
function tidy(text: string): string {
  return text
    .replace(/[([]\s*(?:[,;/&]\s*)*[)\]]/gu, "")
    .replace(/([([])\s*(?:[,;]\s*)+/gu, "$1")
    .replace(/(?:\s*[,;])+\s*([)\]])/gu, "$1")
    .replace(/([,;])(?:\s*[,;])+/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/[ \t]+([,.;:!?)\]])/gu, "$1")
    .replace(/([([])[ \t]+/gu, "$1")
    .replace(/^[\s,;:]+/u, "")
    .trim();
}

/**
 * DATA-4: the story's why reasons and long sections may cite points as "P3" (packages/story); V4 shows no point
 * numbers, so only the tokens the story's own point_numbers really use are cut, and ordinary words stay untouched.
 */
function withoutPointNumbers(text: string, tokens: ReadonlySet<string>): string {
  if (tokens.size === 0) return text;
  let cut = false;
  const stripped = text.replace(POINT_TOKEN, (token) => {
    if (!tokens.has(token)) return token;
    cut = true;
    return "";
  });
  return cut ? tidy(stripped) : text;
}

/** DATA-7 fallback: the critic's raw turning point may carry node ids; they are cut (no English stand-in). */
function withoutNodeIds(text: string): string {
  let cut = false;
  const stripped = text.replace(NODE_ID_TEXT, () => {
    cut = true;
    return "";
  });
  return cut ? tidy(stripped) : text.trim();
}

/** A path's open questions: its still-argued points (row D decision 9, "everything is a question"). */
function stillArgued(points: readonly V4Point[], pathId: string | null): V4OpenQuestion[] {
  return points
    .filter((point) => point.trust === "STILL_ARGUED")
    .map((point) => ({ id: `p:${point.id}`, kind: "STILL_ARGUED" as const, text: point.text, star: false, pathId }));
}

function pathOf(id: string, fate: V4Path["fate"], line: string, points: readonly V4Point[], web?: V4PathWeb,
  suggestions: readonly DigSuggestion[] = []): V4Path {
  const { counts, unchecked } = countTrust(points);
  return {
    id, fate, line, points, counts, unchecked, open: stillArgued(points, id),
    ...(web === undefined ? {} : { web }),
    ...(suggestions.length === 0 ? {} : { suggestions })
  };
}

/** W3-4: this debate's dig level from its answer (`Answer.dig.level`); null when the answer does not say. */
function digLevelOf(answer: Answer): number | null {
  const level = answer.dig?.level;
  return level !== undefined && DigLevelSchema.safeParse(level).success ? level : null;
}

/**
 * One path before its points are placed: the position it stands for, its line and fate, and the nodes it holds. `node`:
 * the node it stands for (a story or dig path's position; a chosen path's root, null while it has none). `branch`: the
 * path the person chose before Start (Task 60).
 */
type PathSpec = Readonly<{
  id: string; positionRef: string; node: string | null; fate: StoryFate | null; line: string; nodeRefs: readonly string[]; branch?: V4Branch;
}>;

/** The story's paths (a repeated position gets "#2", "#3" on its id). */
function storySpecs(body: StoryBody | null): PathSpec[] {
  if (body === null) return [];
  const seen = new Map<string, number>();
  return body.short.paths.map((storyPath) => {
    const times = (seen.get(storyPath.position_ref) ?? 0) + 1;
    seen.set(storyPath.position_ref, times);
    const id = times === 1 ? storyPath.position_ref : `${storyPath.position_ref}#${times}`;
    return { id, positionRef: storyPath.position_ref, node: storyPath.position_ref, fate: storyPath.fate, line: storyPath.line,
      nodeRefs: storyPath.node_refs };
  });
}

/** W4-6: each node's parent through the answer's edges (a point attacking an edge sits with the point that edge starts from). */
function parentsOf(answer: Answer): ReadonlyMap<string, string> {
  const edgeFrom = new Map(answer.edges.map((edge) => [edge.edge_id, edge.from_node_ref]));
  const parentOf = new Map<string, string>();
  for (const edge of answer.edges) {
    const target = edge.target_kind === "NODE" ? edge.target_ref : edgeFrom.get(edge.target_ref);
    if (target !== undefined && target !== edge.from_node_ref && !parentOf.has(edge.from_node_ref)) parentOf.set(edge.from_node_ref, target);
  }
  return parentOf;
}

/**
 * W4-6: the nodes under each position, through the answer's edges, the position first, then the answer's order. A node no
 * edge leaves is a position: what the story would call a path.
 */
function positionTrees(answer: Answer): ReadonlyMap<string, readonly string[]> {
  const parentOf = parentsOf(answer);
  const rootOf = (id: string): string => {
    let at = id;
    // A loop in the edges ends the climb (each step is counted, so it cannot run on).
    for (let steps = 0; steps <= answer.nodes.length; steps += 1) {
      const up = parentOf.get(at);
      if (up === undefined) return at;
      at = up;
    }
    return at;
  };
  const trees = new Map<string, string[]>();
  const ids = [...new Set(answer.nodes.map((node) => node.node_id))];
  for (const id of ids) if (!parentOf.has(id)) trees.set(id, [id]);
  for (const id of ids) {
    if (!parentOf.has(id)) continue;
    trees.get(rootOf(id))?.push(id);
  }
  return trees;
}

/**
 * W4-6: a dig's own paths (owner Q-D2): the ones its finished rewrite names, each with its line and fate; until then the
 * positions it argued, each with its own claim and no fate. A dig writes no story (Q-D13), so none is read.
 */
function digSpecs(answer: Answer): PathSpec[] {
  const trees = positionTrees(answer);
  const rewrite = answer.dig?.rewrite ?? null;
  const named = rewrite !== null && isFinishedRewrite(rewrite) ? rewrite.dig_paths : [];
  if (named.length > 0) {
    return named.map((path) => ({
      id: path.position_ref, positionRef: path.position_ref, node: path.position_ref, fate: path.fate, line: path.line,
      nodeRefs: trees.get(path.position_ref) ?? []
    }));
  }
  const claims = new Map(answer.nodes.map((node) => [node.node_id, node.claim]));
  return [...trees.entries()].map(([id, nodeRefs]) => ({ id, positionRef: id, node: id, fate: null, line: claims.get(id) ?? "", nodeRefs }));
}

/** Task 60: the root and every node whose parents climb to it, in the answer's order (a loop in the edges ends the climb). */
function nodesUnder(answer: Answer, parentOf: ReadonlyMap<string, string>, root: string): readonly string[] {
  const under = (id: string): boolean => {
    let at = id;
    for (let steps = 0; steps <= answer.nodes.length; steps += 1) {
      const up = parentOf.get(at);
      if (up === undefined) return false;
      if (up === root) return true;
      at = up;
    }
    return false;
  };
  const ids = [...new Set(answer.nodes.map((node) => node.node_id))];
  return [root, ...ids.filter((id) => id !== root && under(id))];
}

/**
 * V4 start step, Task 60: a path debate's paths, one per chosen path in the person's order. Its id and position are its path
 * id; it holds the nodes under its root; its line is its answer so far's, else its title; its fate its answer so far's, else
 * the story's path of the same id (a dig's rewrite then moves both, as on any path).
 */
function branchSpecs(answer: Answer, branches: AnswerBranches, body: StoryBody | null): PathSpec[] {
  const parentOf = parentsOf(answer);
  const storyFates = new Map<string, StoryFate>();
  for (const storyPath of body?.short.paths ?? []) {
    if (!storyFates.has(storyPath.position_ref)) storyFates.set(storyPath.position_ref, storyPath.fate);
  }
  return branches.paths.map((branch) => {
    const text = branch.outcome?.text ?? null;
    return {
      id: branch.path_id, positionRef: branch.path_id, node: branch.root_node_id,
      fate: text?.fate ?? storyFates.get(branch.path_id) ?? null,
      line: text?.line ?? branch.title,
      nodeRefs: branch.root_node_id === null ? [] : nodesUnder(answer, parentOf, branch.root_node_id),
      branch: v4BranchOf(branch, null)
    };
  });
}

/**
 * Task 60 (owner answer Q16): a chosen path's tag: the person's own path ADDED, their rewrite EDITED, their combine
 * COMBINED, and an AI's path TOGETHER only when it puts two viewpoints or more together (else no tag).
 */
export function pathTagOf(branch: Pick<AnswerBranch, "author" | "viewpoints">): V4PathTag | null {
  if (branch.author === "PERSON_OWN_VIEW") return "ADDED";
  if (branch.author === "PERSON_EDITED") return "EDITED";
  if (branch.author === "AI_COMBINED") return "COMBINED";
  return branch.viewpoints.length >= 2 ? "TOGETHER" : null;
}

/**
 * Task 60: one chosen path as the map shows it: its answer so far (the outcome's line and summary), what changed, the point
 * of view line and its trust word, once argued; its step and dots only while it is being looked into (the run read's).
 */
export function v4BranchOf(branch: AnswerBranch, progress: RunPathProgress | null): V4Branch {
  const outcome = branch.outcome;
  return {
    order: branch.order,
    title: branch.title,
    question: branch.question,
    author: branch.author,
    tag: pathTagOf(branch),
    viewpoints: branch.viewpoints,
    state: branch.state,
    answerSoFar: outcome?.text?.line ?? null,
    summary: outcome?.text?.summary ?? null,
    whatChanged: outcome?.what_changed ?? [],
    view: outcome?.view ?? null,
    trust: outcome?.trust ?? null,
    progress: branch.state === "LOOKING" && progress !== null
      ? { step: progress.step, dots: progress.points.slice(0, RUN_PATH_LIMITS.pointsShownMax) }
      : null
  };
}

/** Task 60 (journey-f1): a filled path's findings as points: each its node, its words and its word, and nothing else (first copy wins). */
export function pointsOfFindings(findings: readonly RunPathFinding[]): readonly V4Point[] {
  const seen = new Set<string>();
  return findings.flatMap((finding): V4Point[] => {
    if (seen.has(finding.node_ref)) return [];
    seen.add(finding.node_ref);
    return [{ id: finding.node_ref, text: finding.text, trust: finding.trust, basis: null, reasons: [], answeredBy: null, asOf: null }];
  });
}

/** Task 60: "+ N more to explore", in menu order. */
function moreOf(branches: AnswerBranches | undefined): readonly V4MoreItem[] {
  return (branches?.more ?? []).map((item) => ({ id: item.more_id, title: item.title, question: item.question, isNew: item.is_new }));
}

/** W4-6: a finished rewrite (the checker passed it, or its last round left a reservation): it carries the path's new text. */
export function isFinishedRewrite(rewrite: PathRewrite): rewrite is Extract<PathRewrite, { state: "READY" | "READY_WITH_RESERVATION" }> {
  return rewrite.state === "READY" || rewrite.state === "READY_WITH_RESERVATION";
}

/** W4-6: what became of a path's newest rewrite (draft 5.5's four states); null when no dig rewrote it (only marked below). */
export function rewriteStateOf(rewrite: PathRewrite | null | undefined): RewriteState | null {
  if (rewrite === null || rewrite === undefined) return null;
  if (rewrite.state === "WRITING") return "REWRITING";
  if (rewrite.state === "FAILED") return "FAILED";
  return rewrite.changed ? "REWRITTEN" : "NO_CHANGE";
}

/** W4-6: each path's rewrites by position, and its text now (Answer.path_rewrites; an answer from before R22 has none). */
function applyRewrites(answer: Answer, specs: readonly PathSpec[]): ReadonlyArray<PathSpec & { rewrites?: V4PathRewrites }> {
  const byPosition = new Map((answer.path_rewrites?.paths ?? []).map((path) => [path.position_ref, path]));
  return specs.map((spec) => {
    const served = byPosition.get(spec.positionRef);
    if (served === undefined) return spec;
    const rewrites: V4PathRewrites = {
      original: { line: spec.line, fate: spec.fate },
      history: served.history,
      changedBelow: served.changed_below === true
    };
    const current = served.current;
    return current === null ? { ...spec, rewrites } : { ...spec, line: current.line, fate: current.fate, rewrites };
  });
}

/** W2-6: each path gets its web part by the position that argued it (a repeated position: every copy the same). */
function placePaths(answer: Answer, specs: ReadonlyArray<PathSpec & { rewrites?: V4PathRewrites }>,
  byId: ReadonlyMap<string, V4Point>): V4Path[] {
  // W3-4: the deepest level's paths cannot be dug, so they offer no suggestions.
  const level = digLevelOf(answer);
  const diggable = level === null || canDigFromLevel(level);
  return specs.map((spec) => {
    const points: V4Point[] = [];
    const taken = new Set<string>();
    for (const ref of spec.nodeRefs) {
      const point = byId.get(ref);
      if (point === undefined || taken.has(ref)) continue;
      taken.add(ref);
      points.push(point);
    }
    const path = pathOf(spec.id, spec.fate, spec.line, points, pathWebOf(answer, spec.positionRef),
      diggable ? pathSuggestionsOf(answer, spec.positionRef) : []);
    // W4-8 (owner Q-D3): a rewritten path counts the words the server worked out (its own points plus the dig's points
    // its newest rewrite rests on); a path no dig rewrote, or one served without them, keeps its own points' counts.
    const served = servedRewriteCounts(spec.rewrites?.history);
    return { ...path, ...(served === null ? {} : served), positionRef: spec.positionRef,
      trust: pathTrustOf(spec, byId),
      ...(spec.rewrites === undefined ? {} : { rewrites: spec.rewrites }),
      ...(spec.branch === undefined ? {} : { branch: spec.branch }) };
  });
}

/**
 * Owner r2-20 A: a path's one trust word — the word of the point it stands for (its position). For a rewritten path the
 * word the server worked out for that point wins (W4-8), else the page's own (which already reads the path's fate now).
 * Task 60: a chosen path's word is its answer so far's, worked out from its points by the server (as the run read gave it,
 * so nothing changes when the answer lands), unless a dig's rewrite gave its root one.
 */
function pathTrustOf(spec: PathSpec & { rewrites?: V4PathRewrites }, byId: ReadonlyMap<string, V4Point>): TrustWord | null {
  const served = servedRewriteWords(spec.rewrites?.history);
  if (spec.node !== null && served.has(spec.node)) return served.get(spec.node) ?? null;
  if (spec.branch !== undefined) return spec.branch.trust;
  return spec.node === null ? null : byId.get(spec.node)?.trust ?? null;
}

type TurningPoint = Readonly<{ text: string | null; alt: string | null }>;

/**
 * DATA-7: the story's checked "change" paragraph when a ready body has one, else the answer's reversal_point.
 * R2DIG-4 / R2REG-2: `alt` is the reversal_point (node ids cut) when the story's text is the one used and the two
 * differ, so a dig named after the earlier text still finds "w"; null otherwise.
 */
function turningPoint(answer: Answer, body: StoryBody | null): TurningPoint {
  const fromStory = body === null ? "" : body.short.change.text.trim();
  const raw = withoutNodeIds(answer.reversal_point);
  const rawText = raw.length > 0 ? raw : null;
  if (fromStory.length > 0) {
    const differs = rawText !== null && rawText.replace(/\s+/gu, " ") !== fromStory.replace(/\s+/gu, " ");
    return { text: fromStory, alt: differs ? rawText : null };
  }
  return { text: rawText, alt: null };
}

function rootOpen(answer: Answer, turn: string | null): V4OpenQuestion[] {
  const open: V4OpenQuestion[] = [];
  answer.residual_objections.forEach((objection, index) => {
    const text = objection.trim();
    if (text.length > 0) open.push({ id: `o:${index}`, kind: "OBJECTION", text, star: false, pathId: null });
  });
  // The id stays "w" whatever the text's source, so dig links and the page's snapshots stay stable.
  if (turn !== null) open.push({ id: "w", kind: "WOULD_CHANGE", text: turn, star: false, pathId: null });
  return open;
}

type Located = Readonly<{ question: V4OpenQuestion; pathIndex: number | null }>;

/**
 * Exactly one star when anything is open: what would change it; else the first objection; else the first still-argued
 * point under a path that held up (fully or partly); else the first open question under a path; else the first
 * still-argued point no path cites (DATA-6: those hang under the question itself).
 */
function pickStar(root: readonly V4OpenQuestion[], paths: readonly V4Path[]): Located | null {
  const turn = root.find((question) => question.kind === "WOULD_CHANGE");
  if (turn !== undefined) return { question: turn, pathIndex: null };
  const objection = root.find((question) => question.kind === "OBJECTION");
  if (objection !== undefined) return { question: objection, pathIndex: null };
  const held = firstUnder(paths, (path) => path.fate === "HELD_UP" || path.fate === "PARTLY_HELD");
  const underPath = held ?? firstUnder(paths, () => true);
  if (underPath !== null) return underPath;
  const loose = root[0];
  return loose === undefined ? null : { question: loose, pathIndex: null };
}

function firstUnder(paths: readonly V4Path[], accept: (path: V4Path) => boolean): Located | null {
  for (const [pathIndex, path] of paths.entries()) {
    const question = path.open[0];
    if (question !== undefined && accept(path)) return { question, pathIndex };
  }
  return null;
}

function starred(list: readonly V4OpenQuestion[], target: V4OpenQuestion): V4OpenQuestion[] {
  return list.map((question) => (question === target ? { ...question, star: true } : question));
}

function unstarred(list: readonly V4OpenQuestion[]): V4OpenQuestion[] {
  return list.map((question) => (question.star ? { ...question, star: false } : question));
}

/**
 * map-f5 / journey-f12 (3 Nov): exactly one star, on an open question no dig covers yet, chosen in the same order as the
 * first star (what would change the answer, then objections, then points under paths that held). When the starred
 * question is dug, the star moves on to the next one; with nothing left undug there is no star. `dug` names the open
 * questions a dig that did not fail covers. The map comes back unchanged when its star already sits there.
 */
export function restarMap(map: V4Map, dug: ReadonlySet<string>): V4Map {
  const free = (list: readonly V4OpenQuestion[]): V4OpenQuestion[] => list.filter((question) => !dug.has(question.id));
  const root = unstarred(map.open);
  const paths = map.paths.map((path) => (path.open.some((question) => question.star) ? { ...path, open: unstarred(path.open) } : path));
  const star = pickStar(free(root), paths.map((path) => ({ ...path, open: free(path.open) })));
  const before = [...map.open.map((question) => ({ question, pathIndex: null as number | null })),
    ...map.paths.flatMap((path, pathIndex) => path.open.map((question) => ({ question, pathIndex })))]
    .filter((entry) => entry.question.star);
  const same = star === null
    ? before.length === 0
    : before.length === 1 && before[0]!.question.id === star.question.id && before[0]!.pathIndex === star.pathIndex;
  if (same) return map;
  if (star === null) return { ...map, open: root, paths };
  if (star.pathIndex === null) return { ...map, open: starred(root, star.question), paths };
  const index = star.pathIndex;
  return { ...map, open: root, paths: paths.map((path, at) => (at === index ? { ...path, open: starred(path.open, star.question) } : path)) };
}

/** DATA-2: V3's toStoryView fallback — today's composed answer, null when nothing was composed (e.g. COMPONENTS_ONLY). */
function composedText(answer: Answer): string | null {
  const composed = answer.composed_text
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
  return composed.length > 0 ? composed : null;
}

export function buildV4Map(input: Readonly<{
  runId: string;
  answer: Answer;
  story: AnswerStory | null;
  /** The page stopped waiting for the story (no more tries): a missing story then reads as unavailable. */
  storyGaveUp?: boolean;
}>): V4Map {
  const { answer } = input;
  // W4-6 (owner Q-D13): a dig writes no story, so its map never reads one, nor waits for one.
  // A dig on a public debate has no `dig` part (it would name the debate above it) and writes no story either: its `contribution` says it is one.
  const isDig = answer.dig !== undefined || answer.contribution !== undefined;
  const story = isDig ? null : input.story;
  const body = readyBody(story);
  // Task 60: a path debate's paths are the ones the person chose (a dig of one too); else the story's, or a dig's own.
  const branches = answer.branches;
  const specs = applyRewrites(answer, branches !== undefined ? branchSpecs(answer, branches, body) : isDig ? digSpecs(answer) : storySpecs(body));
  // Decision B on the map's own fates: the story's, a dig's own, a chosen path's answer so far, and what a rewrite made of a path.
  const fell = new Set(specs.flatMap((spec) => (spec.fate === "FELL" && spec.node !== null ? [spec.node] : [])));
  const byId = pointsOf(answer, story, fell);
  const allPoints = [...byId.values()];
  // map-f4 (Task 60): no made-up path. With no story path and no chosen path there is none, and every point is the question's own.
  let paths = placePaths(answer, specs, byId);
  const turning = turningPoint(answer, body);
  const turn = turning.text;
  let open = rootOpen(answer, turn);
  // DATA-6: a still-argued point no path cites still counts as open; it hangs under the question itself (all of them, with no path).
  const covered = new Set(paths.flatMap((path) => path.open.map((question) => question.id)));
  open = [...open, ...stillArgued(allPoints, null).filter((question) => !covered.has(question.id))];
  const star = pickStar(open, paths);
  if (star !== null) {
    if (star.pathIndex === null) open = starred(open, star.question);
    else {
      const index = star.pathIndex;
      paths = paths.map((path, at) => (at === index ? { ...path, open: starred(path.open, star.question) } : path));
    }
  }
  const { counts, unchecked } = countTrust(allPoints);
  const numbers = story === null ? null : story.point_numbers;
  const tokens = new Set(numbers === null ? [] : Object.values(numbers));
  return {
    runId: input.runId,
    answerId: answer.answer_id,
    answerVersion: answer.answer_version,
    question: answer.question_line,
    headline: body?.short.headline ?? null,
    summary: body?.short.summary ?? null,
    confidence: body?.short.confidence ?? null,
    why: body === null
      ? []
      : body.why.reasons.map((reason) => withoutPointNumbers(reason.text, tokens)).filter((text) => text.length > 0),
    sections: body === null
      ? []
      : body.long.sections.map((section) => ({
        title: section.title,
        paragraphs: section.paragraphs
          .map((paragraph) => withoutPointNumbers(paragraph.text, tokens))
          .filter((text) => text.length > 0)
      })),
    paths,
    points: allPoints,
    open,
    counts,
    unchecked,
    wouldChange: turn,
    wouldChangeAlt: turning.alt,
    objections: answer.residual_objections.map((objection) => objection.trim()).filter((objection) => objection.length > 0),
    storyState: isDig ? "NONE" : storyStateOf(story, body, input.storyGaveUp === true),
    fallbackText: body === null ? composedText(answer) : null,
    reservation: body !== null && story?.status === "READY_WITH_RESERVATION",
    webNote: webNoteOf(answer),
    digLevel: digLevelOf(answer),
    changedSince: answer.path_rewrites?.changed_since ?? null,
    dig: answer.dig ?? null,
    ...(branches === undefined ? {} : {
      more: moreOf(branches), alsoRaised: [...branches.also_raised], mainTrust: branches.main_trust,
      carryOnToReport: branches.carry_on_to_report
    })
  };
}

/**
 * Task 60: the map's shape while a path debate runs or is about to: no answer, no story, nothing open and an empty bar for the
 * question (its bar waits for the main answer, which comes last).
 */
function runShape(runId: string, question: string, pending: boolean): V4Map {
  return {
    runId, answerId: "", answerVersion: 0, question, headline: null, summary: null, confidence: null, why: [], sections: [],
    paths: [], points: [], open: [], counts: emptyCounts(), unchecked: 0, wouldChange: null, wouldChangeAlt: null, objections: [],
    storyState: "NONE", fallbackText: null, reservation: false,
    phase: "RUN", pending, more: [], alsoRaised: [], mainTrust: null, carryOnToReport: false
  };
}

/**
 * V4 start step, Task 60 (wait-d1, map-d2, journey-f1, wait-f16): the map while a path debate runs, drawn from its run read
 * at once: the question as it was sent (its answers are sentences in it, r2-8 under answer Q17), and one path per chosen path,
 * in order, with the same ids the served answer gives them. A path being looked into shows its step and dots; a path whose
 * own checks are done shows its findings, its line and its word. Null for a failed run and for an R22 run read (no progress).
 * With `path_progress` [] the AIs are still choosing the paths (pending); before they are named the server sends the carry-on
 * part only when the box is ticked (Task 57b).
 */
export function buildV4RunMap(input: Readonly<{ runId: string; run: RunProjection }>): V4Map | null {
  const { run } = input;
  const progress = run.path_progress;
  if (run.state === "FAILED" || progress === undefined) return null;
  const byPath = new Map(progress.map((entry) => [entry.path_id, entry] as const));
  const paths = (run.branches?.paths ?? []).map((branch): V4Path => {
    const entry = byPath.get(branch.path_id) ?? null;
    const points = branch.state === "ARGUED" && entry !== null ? pointsOfFindings(entry.findings) : [];
    const text = branch.outcome?.text ?? null;
    const shown = v4BranchOf(branch, entry);
    return {
      id: branch.path_id, positionRef: branch.path_id, fate: text?.fate ?? null, line: text?.line ?? branch.title,
      points, counts: countTrust(points).counts, unchecked: 0, open: [], trust: shown.trust, branch: shown
    };
  });
  // Every point once (the question's own panel groups them all).
  const points: V4Point[] = [];
  const seen = new Set<string>();
  for (const point of paths.flatMap((path) => path.points)) {
    if (seen.has(point.id)) continue;
    seen.add(point.id);
    points.push(point);
  }
  return {
    ...runShape(input.runId, run.question_line, progress.length === 0),
    paths,
    points,
    more: moreOf(run.branches),
    alsoRaised: [...(run.branches?.also_raised ?? [])],
    carryOnToReport: run.branches === undefined ? run.carry_on_part !== undefined : run.branches.carry_on_to_report
  };
}

/** Task 60: each tag's author, for the paths drawn during Start's 10 s (an AI's path when it has no tag or TOGETHER). */
const AUTHOR_OF_TAG: Readonly<Record<V4PathTag, StartPathAuthor>> = Object.freeze({
  TOGETHER: "AI_SUGGESTION", COMBINED: "AI_COMBINED", EDITED: "PERSON_EDITED", ADDED: "PERSON_OWN_VIEW"
});

/**
 * V4 start step, Task 60 (answer Q11, chat-undo-after-start): the map during Start's 10 s, before any run exists: the question
 * line and each chosen path being looked into, `b<n>` in the person's order, with no progress. Pure: it reads no server data
 * and is never cached (Task 76b draws it; Undo turns it back into the card).
 */
export function buildV4PendingMap(input: Readonly<{ questionLine: string;
  paths: readonly Readonly<{ title: string; question: string; tag: V4PathTag | null }>[] }>): V4Map {
  const paths = input.paths.map((path, index): V4Path => {
    const id = `b${index + 1}`;
    const branch: V4Branch = {
      order: index + 1, title: path.title, question: path.question, author: path.tag === null ? "AI_SUGGESTION" : AUTHOR_OF_TAG[path.tag],
      tag: path.tag, viewpoints: [], state: "LOOKING", answerSoFar: null, summary: null, whatChanged: [], view: null, trust: null, progress: null
    };
    return { id, positionRef: id, fate: null, line: path.title, points: [], counts: emptyCounts(), unchecked: 0, open: [], trust: null, branch };
  });
  return { ...runShape("", input.questionLine, paths.length === 0), paths };
}

/** W4-6: the path a dig rewrote on this map and that dig's rewrite of it (by the dig's run), or null when none here. */
export function rewriteByDig(map: V4Map, digRunId: string): Readonly<{ path: V4Path; rewrite: PathRewrite }> | null {
  for (const path of map.paths) {
    const rewrite = path.rewrites?.history.find((candidate) => candidate.dig_run_id === digRunId);
    if (rewrite !== undefined) return { path, rewrite };
  }
  return null;
}

/** W4-6: something on this map is still being rewritten: one of its paths, or (on a dig's own map) the path it came from. */
export function rewriteWaiting(map: V4Map): boolean {
  if (map.dig?.rewrite?.state === "WRITING") return true;
  return map.paths.some((path) => path.rewrites?.history.at(-1)?.state === "WRITING");
}

/** Every open question on the map: the question's own, then each path's, with the star first. */
export function openQuestionsOf(map: V4Map): readonly V4OpenQuestion[] {
  const all = [...map.open, ...map.paths.flatMap((path) => path.open)];
  const star = all.filter((question) => question.star);
  return [...star, ...all.filter((question) => !question.star)];
}

/**
 * FIT-1/FIT-2: every open question once by id (a point argued under several paths is one question), star first.
 * Use it for picks, counts and dig targets.
 */
export function uniqueOpenQuestions(map: V4Map): readonly V4OpenQuestion[] {
  const seen = new Set<string>();
  return openQuestionsOf(map).filter((question) => {
    if (seen.has(question.id)) return false;
    seen.add(question.id);
    return true;
  });
}

/** The open question with this id (a point still argued under several paths: the starred copy, else the first). */
export function findOpenQuestion(map: V4Map, id: string): V4OpenQuestion | null {
  return openQuestionsOf(map).find((question) => question.id === id) ?? null;
}

export function findPath(map: V4Map, id: string): V4Path | null {
  return map.paths.find((path) => path.id === id) ?? null;
}
