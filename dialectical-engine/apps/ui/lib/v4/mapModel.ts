import type { Answer, AnswerStory } from "@debateai/contract";
import { countTrust, pointsOf } from "./trust.js";
import type { V4Map, V4OpenQuestion, V4Path, V4Point } from "./types.js";

/*
 * V4 initial (2026-10-28): one served answer (+ its story, when written) as the map row D draws (R/42 §7). Paths are
 * the story's paths; without a story there is one stand-in path holding every point, with no fate invented.
 */

type StoryBody = NonNullable<AnswerStory["story"]>;

function readyBody(story: AnswerStory | null): StoryBody | null {
  if (story === null || story.story === null) return null;
  return story.status === "READY" || story.status === "READY_WITH_RESERVATION" ? story.story : null;
}

function storyStateOf(story: AnswerStory | null, body: StoryBody | null, gaveUp: boolean): V4Map["storyState"] {
  if (body !== null) return "READY";
  if (story?.status === "WRITING" || (story === null && !gaveUp)) return "WRITING";
  return "UNAVAILABLE";
}

/** A path's open questions: its still-argued points (row D decision 9, "everything is a question"). */
function stillArgued(points: readonly V4Point[], pathId: string): V4OpenQuestion[] {
  return points
    .filter((point) => point.trust === "STILL_ARGUED")
    .map((point) => ({ id: `p:${point.id}`, kind: "STILL_ARGUED" as const, text: point.text, star: false, pathId }));
}

function pathOf(id: string, fate: V4Path["fate"], line: string, points: readonly V4Point[]): V4Path {
  const { counts, unchecked } = countTrust(points);
  return { id, fate, line, points, counts, unchecked, open: stillArgued(points, id) };
}

function storyPaths(body: StoryBody | null, byId: ReadonlyMap<string, V4Point>): V4Path[] {
  if (body === null) return [];
  const seen = new Map<string, number>();
  return body.short.paths.map((storyPath) => {
    const times = (seen.get(storyPath.position_ref) ?? 0) + 1;
    seen.set(storyPath.position_ref, times);
    const id = times === 1 ? storyPath.position_ref : `${storyPath.position_ref}#${times}`;
    const points: V4Point[] = [];
    const taken = new Set<string>();
    for (const ref of storyPath.node_refs) {
      const point = byId.get(ref);
      if (point === undefined || taken.has(ref)) continue;
      taken.add(ref);
      points.push(point);
    }
    return pathOf(id, storyPath.fate, storyPath.line, points);
  });
}

function rootOpen(answer: Answer): V4OpenQuestion[] {
  const open: V4OpenQuestion[] = [];
  answer.residual_objections.forEach((objection, index) => {
    const text = objection.trim();
    if (text.length > 0) open.push({ id: `o:${index}`, kind: "OBJECTION", text, star: false, pathId: null });
  });
  const turn = answer.reversal_point.trim();
  if (turn.length > 0) open.push({ id: "w", kind: "WOULD_CHANGE", text: turn, star: false, pathId: null });
  return open;
}

type Located = Readonly<{ question: V4OpenQuestion; pathIndex: number | null }>;

/**
 * Exactly one star when anything is open: what would change it; else the first objection; else the first still-argued
 * point under a path that held up (fully or partly); else the first open question.
 */
function pickStar(root: readonly V4OpenQuestion[], paths: readonly V4Path[]): Located | null {
  const turn = root.find((question) => question.kind === "WOULD_CHANGE");
  if (turn !== undefined) return { question: turn, pathIndex: null };
  const objection = root.find((question) => question.kind === "OBJECTION");
  if (objection !== undefined) return { question: objection, pathIndex: null };
  const held = firstUnder(paths, (path) => path.fate === "HELD_UP" || path.fate === "PARTLY_HELD");
  // The question's own list holds only the two kinds above, so what is left lives under the paths.
  return held ?? firstUnder(paths, () => true);
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

export function buildV4Map(input: Readonly<{
  runId: string;
  answer: Answer;
  story: AnswerStory | null;
  /** The page stopped waiting for the story (no more tries): a missing story then reads as unavailable. */
  storyGaveUp?: boolean;
}>): V4Map {
  const { answer, story } = input;
  const body = readyBody(story);
  const byId = pointsOf(answer);
  const allPoints = [...byId.values()];
  let paths = storyPaths(body, byId);
  if (paths.length === 0) {
    const first = answer.composed_text.find((segment) => segment.text.trim().length > 0);
    paths = [pathOf("all", null, first === undefined ? answer.question_line : first.text, allPoints)];
  }
  let open = rootOpen(answer);
  const star = pickStar(open, paths);
  if (star !== null) {
    if (star.pathIndex === null) open = starred(open, star.question);
    else {
      const index = star.pathIndex;
      paths = paths.map((path, at) => (at === index ? { ...path, open: starred(path.open, star.question) } : path));
    }
  }
  const { counts, unchecked } = countTrust(allPoints);
  const turn = answer.reversal_point.trim();
  return {
    runId: input.runId,
    answerId: answer.answer_id,
    answerVersion: answer.answer_version,
    question: answer.question_line,
    headline: body?.short.headline ?? null,
    summary: body?.short.summary ?? null,
    confidence: body?.short.confidence ?? null,
    why: body === null ? [] : body.why.reasons.map((reason) => reason.text),
    sections: body === null
      ? []
      : body.long.sections.map((section) => ({ title: section.title, paragraphs: section.paragraphs.map((paragraph) => paragraph.text) })),
    paths,
    points: allPoints,
    open,
    counts,
    unchecked,
    wouldChange: turn.length > 0 ? turn : null,
    objections: answer.residual_objections.map((objection) => objection.trim()).filter((objection) => objection.length > 0),
    storyState: storyStateOf(story, body, input.storyGaveUp === true)
  };
}

/** Every open question on the map: the question's own, then each path's, with the star first. */
export function openQuestionsOf(map: V4Map): readonly V4OpenQuestion[] {
  const all = [...map.open, ...map.paths.flatMap((path) => path.open)];
  const star = all.filter((question) => question.star);
  return [...star, ...all.filter((question) => !question.star)];
}

/** The open question with this id (a point still argued under several paths: the starred copy, else the first). */
export function findOpenQuestion(map: V4Map, id: string): V4OpenQuestion | null {
  return openQuestionsOf(map).find((question) => question.id === id) ?? null;
}

export function findPath(map: V4Map, id: string): V4Path | null {
  return map.paths.find((path) => path.id === id) ?? null;
}
