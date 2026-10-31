import type { StoryFate } from "@debateai/contract";
import { TypedDomainError, withQuestionLanguageField, withReaderField, type QuestionLanguage, type ReadingLevel } from "@debateai/kernel";
import { buildFramedPrompt, type FramedMaterialField, type PromptPacket } from "@debateai/providers";
import {
  PATH_REWRITE_WRITER_PROMPT_CONTRACT, withoutStoryNodeIds, type PathRewriteCallMaterial, type PathRewriteDraft,
  type PathRewritePickMark, type StoryNodeEnrichment, type StoryWriteInput
} from "@debateai/story";

/**
 * THE PATH REWRITE'S MATERIAL (dig-model revision 2026-10-30, task W3-5), built by code from what the runner and the store
 * hand in, the same bytes every time for the same input:
 *  - the main question, with its place, time and purpose lines when step 2 gave them, and the reading level (the kernel's
 *    `reader` field) and the locked language (`question_language`) last;
 *  - the parent path's current text (its newest checked rewrite, else the story's line and fate), its points with their
 *    trust words, and only the extracts its points cite (the approved item-7 rule);
 *  - the dig's picks word for word, each marked AI_SUGGESTION, PERSON_EDITED or PERSON_OWN_VIEW;
 *  - the dig's own paths in the judges' order, their points, which of them are still disputed, and the extracts they cite.
 * Everything a model or the person wrote is evidence: it travels only inside the fence, one named field each, as JSON.
 * Points are named P1…Pn (the parent path's first, then each dig path's) and the dig's paths D1…Dk; ids never reach a
 * model, and the maps here turn the refs back before anything is stored.
 *
 * THE 100K GUARD (W0-1 §1.4): a call may go only if (body bytes / 2) + 2,048 ≤ 100,000, a body of at most 195,904 bytes.
 * The largest call is the writer's second round (the material, its own draft, the checker's problem), so the material is
 * fitted to the first round's packet plus a fixed room for that turn; every packet sent passes the guard again
 * (`pathRewriteGuard`). THE LADDER (W0-1's whole-statement rule, never a cut inside a text): the first step that fits is
 * used; each step keeps fewer whole points (disputed points first) and only the extracts of the points kept; the question,
 * the path's text, the picks and every path's statement always stay whole. Nothing fits: TOO_LARGE, the rewrite fails.
 */

export const PATH_REWRITE_TOKEN_LINE = 100_000 as const;
/** The guard's room for what the body holds besides the messages, in tokens (W0-1 §1.4). */
export const PATH_REWRITE_GUARD_ROOM_TOKENS = 2_048 as const;
/** (195,904 / 2) + 2,048 = 100,000: the largest body a rewrite call may send. */
export const PATH_REWRITE_BODY_MAX_BYTES = 195_904 as const;
/** The body's members besides the messages (model, max_tokens, response format, thinking), counted at a fixed allowance. */
export const PATH_REWRITE_BODY_OTHER_MEMBERS_BYTES = 1_024 as const;
/** Room for round 2's turn: the writer's own draft (at most 8,192 tokens) and the checker's problem. */
export const PATH_REWRITE_ROUND_TWO_ROOM_BYTES = 40 * 1024;
export const PATH_REWRITE_INPUT_OVER_LIMIT = "PATH_REWRITE_INPUT_OVER_LIMIT" as const;

/** The guard: true exactly when (bodyBytes / 2) + 2,048 ≤ 100,000. */
export function pathRewriteBodyFits(bodyBytes: number): boolean {
  if (!Number.isSafeInteger(bodyBytes) || bodyBytes < 0) throw new RangeError("PATH_REWRITE_BODY_BYTES_INVALID");
  return bodyBytes / 2 + PATH_REWRITE_GUARD_ROOM_TOKENS <= PATH_REWRITE_TOKEN_LINE;
}

/** A packet's body as the guard measures it: the messages as JSON, plus the fixed allowance for the other members. */
export function pathRewriteBodyBytes(packet: PromptPacket): number {
  return Buffer.byteLength(JSON.stringify({ messages: packet.messages }), "utf8") + PATH_REWRITE_BODY_OTHER_MEMBERS_BYTES;
}

/** Every packet a rewrite call sends passes here before it goes; one over the line is refused, nothing sent. */
export function pathRewriteGuard(packet: PromptPacket): PromptPacket {
  if (!pathRewriteBodyFits(pathRewriteBodyBytes(packet))) {
    throw new TypedDomainError(PATH_REWRITE_INPUT_OVER_LIMIT, "A path-rewrite call stays under 100,000 tokens");
  }
  return packet;
}

/* ----------------------------------------------------------------- the input */

export type PathRewriteQuestion = Readonly<{
  /** The main question (the investigation's first debate), as the person asked it. */
  line: string;
  place: string | null;
  time: string | null;
  purpose: string | null;
  readingLevel: ReadingLevel | null;
  /** The locked question language (its one named field), or null. */
  language: QuestionLanguage | null;
}>;

/** One point as the rewrite reads it. `trust` is the trust word code set (the parent's), null when none. */
export type PathRewritePoint = Readonly<{
  id: string;
  text: string;
  /** The point it argues for or against (another point's id), or null when it argues the path's own answer. */
  onId: string | null;
  side: "for" | "against" | null;
  trust: string | null;
  disputed: boolean;
}>;

/** A checked extract a point cites, word for word as the page writes it. */
export type PathRewriteExtract = Readonly<{ pointId: string; label: string; site: string; title: string | null; quote: string }>;

export type PathRewriteParentPath = Readonly<{
  positionRef: string;
  /** The parent's answer version the path's text belongs to. */
  answerVersion: number;
  /** The path's current text: its newest checked rewrite, else the story's line (no summary) and fate. */
  line: string;
  summary: string | null;
  fate: StoryFate;
  points: readonly PathRewritePoint[];
  extracts: readonly PathRewriteExtract[];
}>;

export type PathRewritePick = Readonly<{ text: string; by: PathRewritePickMark }>;

/** One of the dig's own paths, in the judges' order: its answer and its points. */
export type PathRewriteDigPath = Readonly<{
  positionRef: string;
  statement: string;
  points: readonly PathRewritePoint[];
  extracts: readonly PathRewriteExtract[];
}>;

export type PathRewriteMaterialInput = Readonly<{
  question: PathRewriteQuestion;
  parent: PathRewriteParentPath;
  picks: readonly PathRewritePick[];
  digPaths: readonly PathRewriteDigPath[];
}>;

export type PathRewriteMaterial =
  | Readonly<{
    kind: "BUILT";
    material: PathRewriteCallMaterial;
    /** P-ref → point id, D-ref → the dig path's position ref. */
    pointIds: ReadonlyMap<string, string>;
    digPathRefs: ReadonlyMap<string, string>;
    /** The ladder step used, 1 (everything whole) to 5. */
    ladderStep: number;
    /** The first round's writer body, as the guard measures it. */
    bodyBytes: number;
  }>
  | Readonly<{ kind: "TOO_LARGE"; bodyBytes: number }>;

/** Each step's caps: whole points kept per dig path, and on the parent path (Infinity: all). */
export const PATH_REWRITE_LADDER = Object.freeze([
  Object.freeze({ digPoints: Number.POSITIVE_INFINITY, parentPoints: Number.POSITIVE_INFINITY }),
  Object.freeze({ digPoints: 8, parentPoints: Number.POSITIVE_INFINITY }),
  Object.freeze({ digPoints: 4, parentPoints: 12 }),
  Object.freeze({ digPoints: 2, parentPoints: 6 }),
  Object.freeze({ digPoints: 0, parentPoints: 3 })
]);

/* ----------------------------------------------------------------- the build */

const field = (name: string, content: string): FramedMaterialField => Object.freeze({ name, content });

/** The points a step keeps: disputed points first, then in order, up to the cap; written in their own order. */
function keptPoints(points: readonly PathRewritePoint[], cap: number): readonly PathRewritePoint[] {
  if (points.length <= cap) return points;
  const chosen = new Set([...points.filter((point) => point.disputed), ...points.filter((point) => !point.disputed)]
    .slice(0, cap).map((point) => point.id));
  return points.filter((point) => chosen.has(point.id));
}

type Refs = Readonly<{ pointRef: ReadonlyMap<string, string>; digRef: ReadonlyMap<string, string> }>;

/** Refs over the WHOLE input, before any step: a point keeps its P-number on every step of the ladder. */
function refsOf(input: PathRewriteMaterialInput): Refs {
  const pointRef = new Map<string, string>();
  for (const point of [...input.parent.points, ...input.digPaths.flatMap((path) => path.points)]) {
    if (pointRef.has(point.id)) throw new TypedDomainError("PATH_REWRITE_POINT_IDS_INVALID", "A point is given once");
    pointRef.set(point.id, `P${String(pointRef.size + 1)}`);
  }
  const digRef = new Map<string, string>();
  for (const path of input.digPaths) {
    if (digRef.has(path.positionRef)) throw new TypedDomainError("PATH_REWRITE_DIG_PATHS_INVALID", "A dig path is given once");
    digRef.set(path.positionRef, `D${String(digRef.size + 1)}`);
  }
  return Object.freeze({ pointRef, digRef });
}

/** A point argues its path's answer (`on` the path's ref) or another point kept beside it (that point's ref). */
function pointsJson(points: readonly PathRewritePoint[], refs: Refs, ownRef: string) {
  const here = new Set(points.map((point) => point.id));
  return points.map((point) => ({
    ref: refs.pointRef.get(point.id)!,
    text: point.text,
    on: point.onId !== null && here.has(point.onId) ? refs.pointRef.get(point.onId)! : ownRef,
    ...(point.side === null ? {} : { side: point.side }),
    ...(point.trust === null ? {} : { trust: point.trust }),
    ...(point.disputed ? { disputed: true } : {})
  }));
}

/** Only the extracts the kept points cite, in the order given. */
function sourcesJson(extracts: readonly PathRewriteExtract[], kept: readonly PathRewritePoint[], refs: Refs) {
  const keptIds = new Set(kept.map((point) => point.id));
  return extracts.filter((extract) => keptIds.has(extract.pointId)).map((extract) => ({
    ref: extract.label,
    point: refs.pointRef.get(extract.pointId)!,
    site: extract.site,
    ...(extract.title === null ? {} : { title: extract.title }),
    quote: extract.quote
  }));
}

type Step = Readonly<{ fields: readonly FramedMaterialField[]; keptRefs: ReadonlySet<string> }>;

function fieldsAt(input: PathRewriteMaterialInput, refs: Refs, step: (typeof PATH_REWRITE_LADDER)[number]): Step {
  const question = input.question;
  const parentPoints = keptPoints(input.parent.points, step.parentPoints);
  const kept = new Set(parentPoints.map((point) => refs.pointRef.get(point.id)!));
  const path = {
    line: input.parent.line,
    ...(input.parent.summary === null ? {} : { summary: input.parent.summary }),
    fate: input.parent.fate,
    points: pointsJson(parentPoints, refs, "path"),
    sources: sourcesJson(input.parent.extracts, parentPoints, refs)
  };
  const digPaths = input.digPaths.map((digPath, at) => {
    const ownRef = refs.digRef.get(digPath.positionRef)!;
    const keptHere = keptPoints(digPath.points, step.digPoints);
    for (const point of keptHere) kept.add(refs.pointRef.get(point.id)!);
    return { ref: ownRef, place: at + 1, statement: digPath.statement, points: pointsJson(keptHere, refs, ownRef),
      sources: sourcesJson(digPath.extracts, keptHere, refs) };
  });
  return Object.freeze({ keptRefs: kept, fields: Object.freeze([
    field("question", question.line),
    ...(question.place === null ? [] : [field("place", question.place)]),
    ...(question.time === null ? [] : [field("time", question.time)]),
    ...(question.purpose === null ? [] : [field("purpose", question.purpose)]),
    field("path", JSON.stringify(path)),
    field("picks", JSON.stringify(input.picks.map((pick) => ({ text: pick.text, marked: pick.by })))),
    field("dig_paths", JSON.stringify(digPaths))
  ]) });
}

/** The reader and locked-language fields, last, as every final writer's material ends. */
function closing(input: PathRewriteMaterialInput, fields: readonly FramedMaterialField[]): readonly FramedMaterialField[] {
  return Object.freeze(withQuestionLanguageField(withReaderField(fields, input.question.readingLevel), input.question.language));
}

/**
 * The material, at the first ladder step whose first-round writer packet plus round 2's room passes the guard. The refs
 * the reply may rest on are the points that step kept.
 */
export function buildPathRewriteMaterial(input: PathRewriteMaterialInput): PathRewriteMaterial {
  const refs = refsOf(input);
  const personWords = input.picks.some((pick) => pick.by !== "AI_SUGGESTION");
  let bodyBytes = 0;
  for (const [at, step] of PATH_REWRITE_LADDER.entries()) {
    const { fields, keptRefs } = fieldsAt(input, refs, step);
    const writer = closing(input, fields);
    bodyBytes = pathRewriteBodyBytes(buildFramedPrompt({ contract: PATH_REWRITE_WRITER_PROMPT_CONTRACT, material: writer }).packet);
    if (!pathRewriteBodyFits(bodyBytes + PATH_REWRITE_ROUND_TWO_ROOM_BYTES)) continue;
    const index = Object.freeze({ pointRefs: keptRefs, digPathRefs: Object.freeze([...refs.digRef.values()]), personWords });
    const checkerOf = (candidate: PathRewriteDraft): readonly FramedMaterialField[] =>
      closing(input, [...fields, field("rewrite", JSON.stringify(candidate))]);
    return Object.freeze({
      kind: "BUILT" as const,
      material: Object.freeze({ writer, checkerOf, index }),
      pointIds: new Map([...refs.pointRef].map(([id, name]) => [name, id] as const)),
      digPathRefs: new Map([...refs.digRef].map(([id, name]) => [name, id] as const)),
      ladderStep: at + 1,
      bodyBytes
    });
  }
  return Object.freeze({ kind: "TOO_LARGE" as const, bodyBytes });
}

/* ----------------------------------------------------------------- the dig's own paths, from its settled run */

/**
 * The dig's own paths from the snapshot its story would have read: its positions in the judges' order (the winner, the
 * runner-up, then by final strength, then by id), each with the points that argue it, each point right after the one it
 * argues, following the arrows in their recorded order, each point once; a set-aside node is left out. `disputed` is the second AI's dispute (the story's
 * enrichment). Node ids in free text become "(a point)", as the story's do.
 */
export function pathRewriteDigPathsOf(
  snapshot: Pick<StoryWriteInput, "nodes" | "arrows" | "verdictBasis">,
  enrichment: ReadonlyMap<string, Pick<StoryNodeEnrichment, "reviewOutcome">>,
  extracts: ReadonlyMap<string, readonly PathRewriteExtract[]> = new Map()
): readonly PathRewriteDigPath[] {
  const live = snapshot.nodes.filter((node) => node.excludedReason === null);
  const byId = new Map(live.map((node) => [node.nodeId, node] as const));
  const first = [snapshot.verdictBasis.winner_node_id, snapshot.verdictBasis.runner_up_node_id];
  const rank = (nodeId: string): number => { const at = first.indexOf(nodeId); return at < 0 ? first.length : at; };
  const positions = live.filter((node) => node.isPosition).sort((a, b) => rank(a.nodeId) - rank(b.nodeId)
    || (b.finalStrength ?? Number.NEGATIVE_INFINITY) - (a.finalStrength ?? Number.NEGATIVE_INFINITY)
    || (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
  const claimed = new Set<string>(positions.map((node) => node.nodeId));
  return Object.freeze(positions.map((position) => {
    const points: PathRewritePoint[] = [];
    const visit = (targetId: string) => {
      for (const arrow of snapshot.arrows) {
        if (arrow.targetNodeId !== targetId || claimed.has(arrow.sourceNodeId)) continue;
        const node = byId.get(arrow.sourceNodeId);
        if (node === undefined) continue;
        claimed.add(node.nodeId);
        points.push(Object.freeze({
          id: node.nodeId,
          text: withoutStoryNodeIds(node.claim),
          onId: targetId === position.nodeId ? null : targetId,
          side: arrow.polarity === "support" ? "for" as const : "against" as const,
          trust: null,
          disputed: enrichment.get(node.nodeId)?.reviewOutcome === "dispute"
        }));
        visit(node.nodeId);
      }
    };
    visit(position.nodeId);
    const pointIds = new Set(points.map((point) => point.id));
    return Object.freeze({
      positionRef: position.nodeId,
      statement: withoutStoryNodeIds(position.claim),
      points: Object.freeze(points),
      extracts: Object.freeze([...points.flatMap((point) => extracts.get(point.id) ?? [])].filter((entry) => pointIds.has(entry.pointId)))
    });
  }));
}
