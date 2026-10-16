import { z } from "zod";
import type { ReplyLanguageExpectation } from "@debateai/kernel";
import { decodeModelJson, decodedRepairsOf, fixReplyStructure, parsedWithRepairs, type ContentClassification, type ModelJsonRepair,
  type ModelReplyFacts, type ReplyFixerOptions } from "@debateai/providers";
import type { MapReplySalvage } from "./salvage.js";
import { mapNamesInternalWord } from "./internal-words.js";
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

/**
 * LG-A (pre-flight PF-A30, ruling R5): the fixer's repairs that move a member to another path. The step salvages keep
 * every path (salvage.ts); these do not, so a refusal's paths after one of them would name members the reply as written
 * does not have, while the patch follow-up merges into the reply as written.
 */
const PATH_MOVING_FIXER_REPAIRS: ReadonlySet<ModelJsonRepair> = new Set<ModelJsonRepair>(["MEMBER_UNNESTED", "MEMBER_WRAPPED", "PARAGRAPHS_JOINED"]);

/**
 * LG-A Task 9: the map's fixer keeps a stray text under a name the step's schema declares as a text
 * (`keepDeclaredTexts`). Those names hold the AI's own words, and several reach a reader: a merged key point's `claim`, a
 * merged `answer`, a chosen answer's `statement`. A merge answer written inside a key point (`key_points[0].answer`)
 * would otherwise be dropped and the debate would lose that answer without a word; kept, the reply stays refused and
 * the follow-up (or the structure-repair call) keeps it. A name the schema never declares is still dropped.
 */
const MAP_FIXER_OPTIONS: ReplyFixerOptions = Object.freeze({ keepDeclaredTexts: true });
const mapText = (max: number) => z.string().trim().min(1).max(max);
const mapPoint = z.object({
  claim: mapText(L.claimMaxChars),
  why_it_matters: mapText(L.whyMaxChars),
  leans: z.enum(MAP_LEANS)
}).strict();

export const mapAnglesReplySchema = z.object({
  // Question-language spec 2026-10-13 (L7, deviation 5): REQUIRED in the answer form, OPTIONAL here. A missing one
  // records nothing and costs no re-ask. It is a code, never prose: mapAnglesCheck never reads it. Final review M3: it
  // is measured only, so an unusable one (null, "", an object, more than 35 characters) reads as missing, never as a
  // schema failure (no patch, no re-ask, no fallback angles). The rest of the reply stays strict.
  question_language: z.string().trim().min(1).max(35).optional().catch(undefined),
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
 * a normally finished reply), the step's code salvage when it has one (`salvage.ts`, ruling MAP-SALVAGE: on the decoded
 * JSON before the schema, then on the parsed value before the content check), the strict schema, then the step's own
 * content check. Without a salvage, a reply is read exactly as before.
 *
 * LG-A (spec 2026-10-15, L31): when the schema refuses the salvaged reply, the reply fixer (`fixReplyStructure`, with
 * `MAP_FIXER_OPTIONS`) repairs its form and the schema reads it again; the step's own content check follows as before.
 *
 * `repairs`: every repair an ACCEPTED reply needed, in order (the decode's, the decoded salvage's, the fixer's, the parsed
 * salvage's); empty for a refused one. The classification names them all when there are two or more (LG-A), so the
 * gateway records them (`specs.ts` passes the classification through); its `jsonRepair` names the first salvage repair
 * when there is one (the reply's content was changed), else the decode's, else the first. A reply the fixer repaired by
 * moving a member (MEMBER_UNNESTED, MEMBER_WRAPPED, PARAGRAPHS_JOINED) that the content check then refuses is refused
 * with the schema's own issues on the reply as written, so the patch follow-up's paths name members of the reply it
 * merges into (pre-flight PF-A30, ruling R5).
 */
export function mapClassifyReply<T>(content: string, reply: ModelReplyFacts | undefined, schema: z.ZodType<T>,
  check: MapReplyCheck<T>, salvage: MapReplySalvage<T> = {}): Readonly<{ classification: ContentClassification; value: T | null;
  repairs: readonly ModelJsonRepair[] }> {
  const refused = (classification: ContentClassification) => Object.freeze({ classification, value: null, repairs: Object.freeze([]) });
  const decoded = decodeModelJson(content, reply);
  if (!decoded.ok) return refused({ parseStatus: "PARSE_FAILED", parseError: "MAP_REPLY_NOT_JSON" });
  const before = salvage.decoded?.(decoded.value) ?? { value: decoded.value, repairs: [] };
  const first = schema.safeParse(before.value);
  /** One reading's schema refusal in the gateway's repair format: `{ code, path, message: "SCHEMA_FAILED" }` per issue. */
  const schemaRefusal = (result: typeof first) => refused({ parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(
    result.success ? [] : result.error.issues.map((issue) => ({ code: issue.code,
      path: issue.path.map((segment) => (typeof segment === "number" ? segment : String(segment))), message: "SCHEMA_FAILED" }))) });
  // LG-A (spec 2026-10-15, L31): the reply fixer, after the step's own salvage, on what the schema refused.
  let parsed = first;
  let fixerRepairs: readonly ModelJsonRepair[] = [];
  if (!first.success) {
    const fixed = fixReplyStructure(before.value, schema, MAP_FIXER_OPTIONS);
    if (fixed !== null) {
      const refixed = schema.safeParse(fixed.value);
      if (refixed.success) { parsed = refixed; fixerRepairs = fixed.repairs; }
    }
  }
  if (!parsed.success) return schemaRefusal(parsed);
  const after = salvage.parsed?.(parsed.data) ?? { value: parsed.data, repairs: [] };
  const problems = check(after.value);
  if (problems.length > 0) {
    // (pre-flight PF-A30, ruling R5) A value the fixer moved a member in is refused with the PRE-fixer schema refusal:
    // its paths name members of the reply as written, which is what the patch follow-up merges into.
    if (fixerRepairs.some((repair) => PATH_MOVING_FIXER_REPAIRS.has(repair))) return schemaRefusal(first);
    const issues = problems.map((problem) => ({ code: "custom", path: [...problem.path], message: problem.code }));
    return refused({ parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(issues) });
  }
  const salvaged = [...before.repairs, ...after.repairs];
  const repairs: ModelJsonRepair[] = [...decodedRepairsOf(decoded), ...before.repairs, ...fixerRepairs, ...after.repairs];
  // The step's headline repair is today's: its first salvage repair, else the decode's; a fixer-only reply names its first.
  const classification = parsedWithRepairs(repairs, salvaged[0] ?? decoded.repair);
  return Object.freeze({ classification, value: after.value, repairs: Object.freeze(repairs) });
}

/**
 * One issue at `path` when the texts together are confidently in another language than the question's. Always called
 * with ALL the texts of one field and that field's path (ruling R-3): the engine's detector misreads a single short
 * sentence with high confidence (a real run refused a valid Romanian merge three times over two short claims), so a
 * field's language is never judged on one member alone. The verdict itself is the kernel's reply-side check (R-5).
 */
function mapLanguageIssues(texts: readonly string[], expected: ReplyLanguageExpectation, path: readonly (string | number)[]): readonly MapReplyIssue[] {
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
      // Practice 2026-10-15: a statement that talks about the prompt's own fields (angle_focus, key_point_id …) or an item id
      // is about the engine, not the question, and a chosen statement is shown as it is: refused at its own statement,
      // like MAP_ANSWER_NO_WORDS, so the repair re-asks that member. Never edited.
      if (mapNamesInternalWord(answer.statement)) issues.push({ path: ["answers", index, "statement"], code: "MAP_ANSWER_NAMES_FIELD" });
      if (statement !== "") statements.add(statement);
    });
    issues.push(...mapLanguageIssues(value.answers.map((answer) => answer.statement), expected, ["answers"]));
    return issues;
  };
}
