import { z } from "zod";
import type { ReplyLanguageExpectation } from "@debateai/kernel";
import { decodeModelJson, type ContentClassification, type ModelReplyFacts } from "@debateai/providers";
import { mapNormaliseText, mapWrongLanguage } from "./text.js";
import { MAP_FIXED_ANGLE_KINDS, MAP_LEANS, MAP_LIMITS } from "./types.js";

/**
 * The map's strict reply schemas and checks. A refusal is the gateway's own repair format: a JSON list of issues, each
 * `{ code, path, message }` where `message` is a CODE (never model text). The gateway then sends the smallest repair
 * first: the patch follow-up, which asks only for the members at those paths (packages/providers/src/patch-follow-up.ts),
 * and the full re-ask only when that does not work.
 */
const L = MAP_LIMITS;
const mapId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,23}$/u);
const mapText = (max: number) => z.string().trim().min(1).max(max);
const mapPoint = z.object({
  claim: mapText(L.claimMaxChars),
  why_it_matters: mapText(L.whyMaxChars),
  leans: z.enum(MAP_LEANS)
}).strict();

export const mapAnglesReplySchema = z.object({
  // Question-language spec 2026-10-13 (L7, deviation 5): REQUIRED in the answer form, OPTIONAL here. A missing one
  // records nothing and costs no re-ask. It is a code, never prose: mapAnglesCheck never reads it.
  question_language: z.string().trim().min(1).max(35).optional(),
  angles: z.array(z.object({
    angle_id: mapId,
    kind: z.enum(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "SPECIFIC"]),
    label: mapText(L.angleLabelMaxChars),
    focus: mapText(L.angleFocusMaxChars)
  }).strict()).min(L.anglesMin).max(L.anglesMax)
}).strict();

export const mapListReplySchema = z.object({
  points: z.array(mapPoint).min(L.listPointsMin).max(L.listPointsMax),
  candidate_answers: z.array(mapText(L.candidateAnswerMaxChars)).min(L.listAnswersMin).max(L.listAnswersMax)
}).strict();

export const mapSnowballReplySchema = z.object({
  points: z.array(mapPoint).max(L.snowballPointsMax),
  candidate_answers: z.array(mapText(L.candidateAnswerMaxChars)).max(L.snowballAnswersMax)
}).strict();

export const mapMergeReplySchema = z.object({
  key_points: z.array(z.object({
    key_point_id: mapId,
    claim: mapText(L.claimMaxChars),
    member_item_ids: z.array(mapId).min(1)
  }).strict()),
  answers: z.array(z.object({
    answer_id: mapId,
    answer: mapText(L.candidateAnswerMaxChars),
    member_item_ids: z.array(mapId).min(1)
  }).strict())
}).strict();

export const mapGapReplySchema = z.object({
  new_points: z.array(mapPoint).max(L.gapPointsMax),
  framing_challenges: z.array(mapText(L.claimMaxChars)).max(L.framingChallengesMax)
}).strict();

export const mapChooseReplySchema = z.object({
  answers: z.array(z.object({
    answer_id: mapId,
    statement: mapText(L.claimMaxChars),
    for: z.array(mapId).max(L.choosePointsPerSideMax),
    against: z.array(mapId).max(L.choosePointsPerSideMax),
    strongest_rival: mapId.nullable()
  }).strict()).min(L.chooseAnswersMin).max(L.chooseAnswersMax)
}).strict();

export type MapAnglesReply = z.infer<typeof mapAnglesReplySchema>;
export type MapListReply = z.infer<typeof mapListReplySchema>;
export type MapSnowballReply = z.infer<typeof mapSnowballReplySchema>;
export type MapMergeReply = z.infer<typeof mapMergeReplySchema>;
export type MapGapReply = z.infer<typeof mapGapReplySchema>;
export type MapChooseReply = z.infer<typeof mapChooseReplySchema>;

export type MapReplyIssue = Readonly<{ path: readonly (string | number)[]; code: string }>;
export type MapReplyCheck<T> = (value: T) => readonly MapReplyIssue[];

/**
 * Reads one reply: the shared tolerant decode (code fence, outermost object, inner straight quote, closing brackets on
 * a normally finished reply), the strict schema, then the step's own content check.
 */
export function mapClassifyReply<T>(content: string, reply: ModelReplyFacts | undefined, schema: z.ZodType<T>,
  check: MapReplyCheck<T>): Readonly<{ classification: ContentClassification; value: T | null }> {
  const decoded = decodeModelJson(content, reply);
  if (!decoded.ok) {
    return Object.freeze({ classification: { parseStatus: "PARSE_FAILED" as const, parseError: "MAP_REPLY_NOT_JSON" }, value: null });
  }
  const parsed = schema.safeParse(decoded.value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ code: issue.code,
      path: issue.path.map((segment) => (typeof segment === "number" ? segment : String(segment))), message: "SCHEMA_FAILED" }));
    return Object.freeze({ classification: { parseStatus: "SCHEMA_FAILED" as const, parseError: JSON.stringify(issues) }, value: null });
  }
  const problems = check(parsed.data);
  if (problems.length > 0) {
    const issues = problems.map((problem) => ({ code: "custom", path: [...problem.path], message: problem.code }));
    return Object.freeze({ classification: { parseStatus: "SCHEMA_FAILED" as const, parseError: JSON.stringify(issues) }, value: null });
  }
  const classification: ContentClassification = decoded.repair === null
    ? { parseStatus: "PARSED", parseError: null }
    : { parseStatus: "PARSED", parseError: null, jsonRepair: decoded.repair };
  return Object.freeze({ classification, value: parsed.data });
}

/**
 * One issue at `path` when the texts together are confidently in another language than the question's. Always called
 * with ALL the texts of one field and that field's path (ruling R-3): the engine's detector misreads a single short
 * sentence with high confidence (a real run refused a valid Romanian merge three times over two short claims), so a
 * field's language is never judged on one member alone. The verdict itself is the kernel's reply-side check (R-5).
 */
export function mapLanguageIssues(texts: readonly string[], expected: ReplyLanguageExpectation, path: readonly (string | number)[]): readonly MapReplyIssue[] {
  return mapWrongLanguage(texts.join(" "), expected) ? [Object.freeze({ path, code: "MAP_WRONG_LANGUAGE" })] : [];
}

export const mapAnglesCheck: MapReplyCheck<MapAnglesReply> = (value) => {
  const issues: MapReplyIssue[] = [];
  const seen = new Set<string>();
  value.angles.forEach((angle, index) => {
    if (seen.has(angle.angle_id)) issues.push({ path: ["angles", index, "angle_id"], code: "MAP_ANGLE_ID_REUSED" });
    seen.add(angle.angle_id);
  });
  const count = (kind: string) => value.angles.filter((angle) => angle.kind === kind).length;
  const specific = count("SPECIFIC");
  if (MAP_FIXED_ANGLE_KINDS.some((kind) => count(kind) !== 1) || specific < L.specificAnglesMin || specific > L.specificAnglesMax) {
    issues.push({ path: ["angles"], code: "MAP_ANGLE_KINDS_WRONG" });
  }
  return issues;
};

/** Points and candidate answers are read apart, each field judged on all its texts joined, at the field's path. */
export function mapListCheck(expected: ReplyLanguageExpectation): MapReplyCheck<MapListReply | MapSnowballReply> {
  return (value) => [
    ...mapLanguageIssues(value.points.flatMap((point) => [point.claim, point.why_it_matters]), expected, ["points"]),
    ...mapLanguageIssues(value.candidate_answers, expected, ["candidate_answers"])
  ];
}

export function mapMergeCheck(pointIds: ReadonlySet<string>, answerIds: ReadonlySet<string>, expected: ReplyLanguageExpectation): MapReplyCheck<MapMergeReply> {
  return (value) => {
    const issues: MapReplyIssue[] = [];
    const usedItems = new Set<string>();
    const usedGroups = new Set<string>();
    const visit = (list: "key_points" | "answers", index: number, groupId: string, groupKey: string, members: readonly string[],
      allowed: ReadonlySet<string>) => {
      if (usedGroups.has(groupId)) issues.push({ path: [list, index, groupKey], code: "MAP_GROUP_ID_REUSED" });
      usedGroups.add(groupId);
      members.forEach((id, at) => {
        if (!allowed.has(id)) issues.push({ path: [list, index, "member_item_ids", at], code: "MAP_UNKNOWN_ITEM_ID" });
        else if (usedItems.has(id)) issues.push({ path: [list, index, "member_item_ids", at], code: "MAP_ITEM_ID_REUSED" });
        usedItems.add(id);
      });
    };
    // A merge that places no item at all, while there are items to place, is refused at both lists so the repair path
    // asks again (a code merge would otherwise stand in for a reply that merged nothing).
    if (value.key_points.length === 0 && value.answers.length === 0 && pointIds.size + answerIds.size > 0) {
      if (pointIds.size > 0) issues.push({ path: ["key_points"], code: "MAP_MERGE_EMPTY" });
      if (answerIds.size > 0) issues.push({ path: ["answers"], code: "MAP_MERGE_EMPTY" });
    }
    value.key_points.forEach((group, index) => visit("key_points", index, group.key_point_id, "key_point_id", group.member_item_ids, pointIds));
    value.answers.forEach((group, index) => visit("answers", index, group.answer_id, "answer_id", group.member_item_ids, answerIds));
    issues.push(...mapLanguageIssues(value.key_points.map((group) => group.claim), expected, ["key_points"]));
    issues.push(...mapLanguageIssues(value.answers.map((group) => group.answer), expected, ["answers"]));
    return issues;
  };
}

export function mapGapCheck(expected: ReplyLanguageExpectation): MapReplyCheck<MapGapReply> {
  return (value) => mapLanguageIssues(value.new_points.flatMap((point) => [point.claim, point.why_it_matters]), expected, ["new_points"]);
}

export function mapChooseCheck(keyPointIds: ReadonlySet<string>, expected: ReplyLanguageExpectation): MapReplyCheck<MapChooseReply> {
  return (value) => {
    const issues: MapReplyIssue[] = [];
    const ids = value.answers.map((answer) => answer.answer_id);
    const statements = new Set<string>();
    value.answers.forEach((answer, index) => {
      if (ids.indexOf(answer.answer_id) !== index) issues.push({ path: ["answers", index, "answer_id"], code: "MAP_ANSWER_ID_REUSED" });
      const seen = new Set<string>();
      for (const side of ["for", "against"] as const) {
        answer[side].forEach((id, at) => {
          if (!keyPointIds.has(id)) issues.push({ path: ["answers", index, side, at], code: "MAP_UNKNOWN_KEY_POINT_ID" });
          else if (seen.has(id)) issues.push({ path: ["answers", index, side, at], code: "MAP_KEY_POINT_REPEATED" });
          seen.add(id);
        });
      }
      const rival = answer.strongest_rival;
      if (rival !== null && (rival === answer.answer_id || !ids.includes(rival))) {
        issues.push({ path: ["answers", index, "strongest_rival"], code: "MAP_UNKNOWN_RIVAL" });
      }
      // A statement that normalises to nothing (only signs: no letter or digit) duplicates nothing, and is no answer at
      // all (final review M-3): refused at its own statement, so the repair re-asks that member.
      const statement = mapNormaliseText(answer.statement);
      if (statement === "") issues.push({ path: ["answers", index, "statement"], code: "MAP_ANSWER_NO_WORDS" });
      if (statement !== "" && statements.has(statement)) issues.push({ path: ["answers", index, "statement"], code: "MAP_ANSWER_DUPLICATE" });
      if (statement !== "") statements.add(statement);
    });
    issues.push(...mapLanguageIssues(value.answers.map((answer) => answer.statement), expected, ["answers"]));
    return issues;
  };
}
