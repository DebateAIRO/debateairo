import { z } from "zod";
import {
  PATH_RESULT_LIMITS, READER_SENTENCE_WRITING, TypedDomainError, lockedReplyLanguageExpectation, replyLanguageExpectation, withQuestionLanguageField,
  withReaderField, type PathId, type ReadingLevel
} from "@debateai/kernel";
import type { PathGapRound } from "@debateai/contract";
import type { FramedMaterialField, MapReplySalvageRepair, ModelReplyFacts } from "@debateai/providers";
import { mapNamesInternalWord } from "./internal-words.js";
import { mapErrorCodeOf, type MapCallOutcome, type MapCaller } from "./orchestrator.js";
import { PATH_GAP_DRAFT_CONTRACTS, PATH_GAP_LIMITS } from "./path-gap-prompts.js";
import { mapContractInLanguage } from "./prompts.js";
import { mapClassifyReply, type MapReplyCheck } from "./replies.js";
import type { MapReplySalvage, MapSalvaged } from "./salvage.js";
import { mapLockedLanguage, type MapStepSpec } from "./specs.js";
import { mapNormaliseText, mapWrongLanguage } from "./text.js";
import type { MapCallRecord, MapSeat } from "./types.js";

/**
 * The gap round after Start (V4 start step, spec 2026-11-03 §4.3): round k asks seat (k − 1) mod n, under map.gap-paths.v1 (a draft), with
 * the run's chosen paths and every point raised so far (the run's, then the earlier rounds'), so round k + 1 reads round k's points. Each
 * reply is read with exact limits, and salvaged in code first: a point for a path it was not given is the question's (null); a repeat (of a
 * point raised so far or of one earlier in the reply), a text over 400 characters, one that copies a form's placeholder or names an engine
 * field or a path's id, and the points past 20 in a round or 40 in all are left out. A failed round gives nothing and leaves the others; a
 * stop asks nothing more.
 */

/** Round `round`'s call (1-based). */
export function pathGapCallSiteKey(round: number): string {
  return `MAP:gap-paths:${String(round)}`;
}

const R = PATH_RESULT_LIMITS;
const GAP_CLASSIFY = Object.freeze({ exactLimits: true });
/** The material's field names a point must not name (an engine word, never the person's). */
const PATH_GAP_INTERNAL_FIELD_NAMES = Object.freeze(["already_raised", "question_language", "question_line"]);
/** A chosen path's id as a word: the person never sees it. */
const PATH_ID_WORD = /(?<![\p{L}\p{N}_])b[1-8](?![\p{L}\p{N}_])/u;

export const pathGapReplySchema = z.object({
  points: z.array(z.object({ text: z.string().trim().min(1).max(R.gapPointMaxChars), path: z.string().nullable() }).strict())
    .max(PATH_GAP_LIMITS.pointsPerRoundMax)
}).strict();
export type PathGapReply = Readonly<{ points: readonly Readonly<{ text: string; path: string | null }>[] }>;
const PathGapShape = z.object({ points: z.array(z.object({ text: z.string(), path: z.string().nullable() }).strict()) }).strict();

/** One salvage, before the schema and again after the reply fixer: idempotent. */
function pathGapSalvage(pathIds: ReadonlySet<string>, raised: readonly string[], room: number): MapReplySalvage<PathGapReply> {
  const run = (value: unknown): MapSalvaged<unknown> => {
    const shape = PathGapShape.safeParse(value);
    if (!shape.success) return { value, repairs: [] };
    const seen = new Set(raised.map(mapNormaliseText));
    let dropped = false;
    let normalised = false;
    const kept: { text: string; path: string | null }[] = [];
    for (const one of shape.data.points) {
      const text = one.text.trim();
      const key = mapNormaliseText(text);
      if (text.length === 0 || text.length > R.gapPointMaxChars || key === "" || seen.has(key) || kept.length >= room || /<[^<>]*>/u.test(text)
        || PATH_ID_WORD.test(text.normalize("NFKC")) || mapNamesInternalWord(text, PATH_GAP_INTERNAL_FIELD_NAMES)) { dropped = true; continue; }
      seen.add(key);
      const path = one.path !== null && pathIds.has(one.path) ? one.path : null;
      if (path !== one.path) normalised = true;
      kept.push({ text: one.text, path });
    }
    const repairs: MapReplySalvageRepair[] = [...(dropped ? ["MAP_IDS_DROPPED" as const] : []), ...(normalised ? ["MAP_IDS_NORMALISED" as const] : [])];
    return repairs.length === 0 ? { value, repairs } : { value: { points: kept }, repairs };
  };
  return { decoded: run, parsed: (value: PathGapReply) => run(value) as MapSalvaged<PathGapReply> };
}

/** Every point's text is judged together, at the points' place; an empty list (nothing missing) passes. */
const pathGapCheck = (expected: ReturnType<typeof replyLanguageExpectation>): MapReplyCheck<PathGapReply> => (reply) =>
  reply.points.length > 0 && mapWrongLanguage(reply.points.map((one) => one.text).join(" "), expected)
    ? [Object.freeze({ path: ["points"], code: "MAP_WRONG_LANGUAGE" })] : [];

export type PathGapPath = Readonly<{ pathId: PathId; title: string; question: string; viewpoints: readonly string[] }>;

/**
 * One round's call: the draft (the reader sentence after a blank line only with a level) in the question's language; material question_line,
 * paths [{id, title, question, viewpoints}], already_raised, then reader (only with a level) and question_language last.
 */
export function pathGapSpec(ctx: Readonly<{ questionLine: string; languageName: string; languageTag: string; readingLevel: ReadingLevel | null }>,
  input: Readonly<{ paths: readonly PathGapPath[]; alreadyRaised: readonly string[]; room: number }>): MapStepSpec<PathGapReply> {
  if (input.paths.length === 0) throw new TypedDomainError("PATH_GAP_INVALID", "PATH_GAP_INVALID: a gap round is given one path or more");
  const lock = mapLockedLanguage(ctx);
  const expected = lock === null ? replyLanguageExpectation(ctx.questionLine) : lockedReplyLanguageExpectation(lock, ctx.questionLine);
  const [draft] = PATH_GAP_DRAFT_CONTRACTS;
  const told = ctx.readingLevel === null ? draft! : Object.freeze({ ...draft!, instruction: `${draft!.instruction}\n\n${READER_SENTENCE_WRITING}` });
  const material: FramedMaterialField[] = [{ name: "question_line", content: ctx.questionLine },
    { name: "paths", content: JSON.stringify(input.paths.map((path) => ({ id: path.pathId, title: path.title, question: path.question,
      viewpoints: path.viewpoints }))) },
    { name: "already_raised", content: JSON.stringify(input.alreadyRaised) }];
  const schema = pathGapReplySchema as z.ZodType<PathGapReply>;
  const check = pathGapCheck(expected);
  const salvage = pathGapSalvage(new Set(input.paths.map((path) => path.pathId)), input.alreadyRaised, input.room);
  return Object.freeze({
    step: "GAP" as const,
    contract: mapContractInLanguage(told, lock, ctx.languageName),
    material: Object.freeze(withQuestionLanguageField(withReaderField(material, ctx.readingLevel), lock).map((entry) => Object.freeze({ ...entry }))),
    guidedWords: null,
    replyWordsCeiling: null,
    classify: (content: string, reply?: ModelReplyFacts) => mapClassifyReply(content, reply, schema, check, salvage, GAP_CLASSIFY).classification,
    read: (content: string, reply?: ModelReplyFacts) => {
      const out = mapClassifyReply(content, reply, schema, check, salvage, GAP_CLASSIFY);
      if (out.value === null) throw new TypedDomainError("MAP_REPLY_UNREADABLE", "MAP_REPLY_UNREADABLE: the GAP reply did not pass its check");
      return out.value;
    }
  });
}

/**
 * The gap rounds of a path debate: min(rounds, 2), round k on seats[(k − 1) mod n]. The round's points in order, each for its path or null;
 * `roundCount` counts the rounds asked (a failed one too); `calls` in plan order. No round, no seat or no path: nothing is asked.
 */
export async function mapRunPathGapRounds(run: Readonly<{ questionLine: string; languageName: string; languageTag: string;
  readingLevel: ReadingLevel | null; paths: readonly PathGapPath[]; alreadyRaised: readonly string[]; rounds: number; seats: readonly MapSeat[];
  caller: MapCaller }>): Promise<Readonly<{ round: PathGapRound; roundCount: number; calls: readonly MapCallRecord[] }>> {
  const rounds = run.seats.length === 0 || run.paths.length === 0 ? 0 : Math.max(0, Math.min(Math.trunc(run.rounds), PATH_GAP_LIMITS.roundsMax));
  const points: PathGapRound["points"] = [];
  const calls: MapCallRecord[] = [];
  let roundCount = 0;
  for (let round = 1; round <= rounds; round += 1) {
    const room = Math.min(PATH_GAP_LIMITS.pointsPerRoundMax, R.gapPointsMax - points.length);
    if (room <= 0) break;
    const seat = run.seats[(round - 1) % run.seats.length]!;
    const callSiteKey = pathGapCallSiteKey(round);
    const spec = pathGapSpec(run, { paths: run.paths, alreadyRaised: [...run.alreadyRaised, ...points.map((one) => one.text)], room });
    let outcome: MapCallOutcome<PathGapReply>;
    try {
      outcome = await run.caller.call({ step: "GAP", callSiteKey, seat, order: round - 1, shown: run.paths.map((path) => path.pathId), spec });
    } catch (error) {
      outcome = { kind: "FAILED", code: mapErrorCodeOf(error) };
    }
    roundCount += 1;
    calls.push(Object.freeze({ step: "GAP" as const, callSiteKey, aiRef: seat.aiRef, maker: seat.maker, order: round - 1,
      shown: Object.freeze(run.paths.map((path) => path.pathId)), outcome: outcome.kind, code: outcome.kind === "OK" ? null : outcome.code }));
    if (outcome.kind === "OK") for (const one of outcome.value.points) points.push({ text: one.text, path_id: one.path });
    if (outcome.kind === "STOPPED") break;
  }
  return Object.freeze({ round: { points }, roundCount, calls: Object.freeze(calls) });
}
