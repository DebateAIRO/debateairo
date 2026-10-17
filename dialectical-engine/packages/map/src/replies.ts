import { z } from "zod";
import type { ReplyLanguageExpectation } from "@debateai/kernel";
import { decodeModelJson, decodedRepairsOf, fixReplyStructure, parsedWithRepairs, type ContentClassification, type ModelJsonRepair,
  type ModelReplyFacts, type ReplyFixerOptions } from "@debateai/providers";
import type { MapReplySalvage } from "./salvage.js";
import { MAP_ENGINE_INTERNAL_FIELD_NAMES, MAP_INTERNAL_FIELD_NAMES, mapNamesInternalWord } from "./internal-words.js";
import { mapNormaliseText, mapWrongLanguage } from "./text.js";
import { MAP_ENGINE_LIMITS, MAP_FIXED_ANGLE_KINDS, MAP_LEANS, MAP_LIMITS, MAP_RESTS_ON, mapLimitsFor, type MapLimits } from "./types.js";

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
/** The map's six strict reply schemas under one set of limits (today's, or the length row's runaway ones). */
export function mapReplySchemasFor(L: MapLimits) {
  const mapText = (max: number) => z.string().trim().min(1).max(max);
  const mapPoint = z.object({ claim: mapText(L.claimMaxChars), why_it_matters: mapText(L.whyMaxChars), leans: z.enum(MAP_LEANS) }).strict();
  return Object.freeze({
    angles: z.object({
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
    }).strict(),
    list: z.object({
      points: z.array(mapPoint).min(L.listPointsMin).max(L.listPointsMax),
      candidate_answers: z.array(mapText(L.candidateAnswerMaxChars)).min(L.listAnswersMin).max(L.listAnswersMax)
    }).strict(),
    snowball: z.object({
      points: z.array(mapPoint).max(L.snowballPointsMax),
      candidate_answers: z.array(mapText(L.candidateAnswerMaxChars)).max(L.snowballAnswersMax)
    }).strict(),
    merge: z.object({
      key_points: z.array(z.object({ key_point_id: mapId, claim: mapText(L.claimMaxChars), member_item_ids: z.array(mapId).min(1) }).strict()),
      answers: z.array(z.object({ answer_id: mapId, answer: mapText(L.candidateAnswerMaxChars), member_item_ids: z.array(mapId).min(1) }).strict())
    }).strict(),
    gap: z.object({
      new_points: z.array(mapPoint).max(L.gapPointsMax),
      framing_challenges: z.array(mapText(L.claimMaxChars)).max(L.framingChallengesMax)
    }).strict(),
    choose: z.object({
      answers: z.array(z.object({
        answer_id: mapId,
        statement: mapText(L.claimMaxChars),
        for: z.array(mapId).max(L.choosePointsPerSideMax),
        against: z.array(mapId).max(L.choosePointsPerSideMax),
        strongest_rival: mapId.nullable()
      }).strict()).min(L.chooseAnswersMin).max(L.chooseAnswersMax)
    }).strict()
  });
}
const TODAYS_SCHEMAS = mapReplySchemasFor(MAP_LIMITS);
export const mapAnglesReplySchema = TODAYS_SCHEMAS.angles;
export const mapListReplySchema = TODAYS_SCHEMAS.list;
export const mapSnowballReplySchema = TODAYS_SCHEMAS.snowball;
export const mapMergeReplySchema = TODAYS_SCHEMAS.merge;
export const mapGapReplySchema = TODAYS_SCHEMAS.gap;
export const mapChooseReplySchema = TODAYS_SCHEMAS.choose;
/**
 * Length guidance (spec 2026-10-15 §3.9): the six schemas under the runaway limits, built ONCE (pre-flight PF-C5.13), so every
 * lengthed spec and the practice re-check read the same objects and the fixer's schema walk sees one identity per step.
 */
export const MAP_LENGTHED_REPLY_SCHEMAS = mapReplySchemasFor(mapLimitsFor(true));

export type MapAnglesReply = z.infer<typeof mapAnglesReplySchema>;
export type MapListReply = z.infer<typeof mapListReplySchema>;
export type MapSnowballReply = z.infer<typeof mapSnowballReplySchema>;
export type MapMergeReply = z.infer<typeof mapMergeReplySchema>;
export type MapGapReply = z.infer<typeof mapGapReplySchema>;
export type MapChooseReply = z.infer<typeof mapChooseReplySchema>;

/**
 * ENGINE 2 (spec 2026-10-15 §5.2, INTERFACE §10.2): the v2 twins. A point carries `rests_on` (required); a merged key
 * point carries the merger's `rests_on`; choose's answers carry 0..3 assumptions and the reply 0..2 reserve answers
 * (both optional: a missing list is none); the check's reply is one entry per id shown, each with the REQUIRED nullable
 * `cost_can_be_named` (D4b's third question; null only for a premise challenge; FINAL Ruling D4(b) encoding, deviation
 * 12). Read with LG-C's runaway limits.
 */
export function mapReplySchemasV2For(L: MapLimits) {
  const today = mapReplySchemasFor(L);
  const mapText = (max: number) => z.string().trim().min(1).max(max);
  const restsOn = z.enum(MAP_RESTS_ON);
  const point = z.object({ claim: mapText(L.claimMaxChars), why_it_matters: mapText(L.whyMaxChars), leans: z.enum(MAP_LEANS),
    rests_on: restsOn }).strict();
  const sides = { for: z.array(mapId).max(L.choosePointsPerSideMax), against: z.array(mapId).max(L.choosePointsPerSideMax) };
  const assumptions = z.array(mapText(L.claimMaxChars)).max(MAP_ENGINE_LIMITS.assumptionsMax).optional();
  return Object.freeze({
    angles: today.angles,
    list: z.object({
      points: z.array(point).min(L.listPointsMin).max(L.listPointsMax),
      candidate_answers: z.array(mapText(L.candidateAnswerMaxChars)).min(L.listAnswersMin).max(L.listAnswersMax)
    }).strict(),
    snowball: z.object({
      points: z.array(point).max(L.snowballPointsMax),
      candidate_answers: z.array(mapText(L.candidateAnswerMaxChars)).max(L.snowballAnswersMax)
    }).strict(),
    merge: z.object({
      key_points: z.array(z.object({ key_point_id: mapId, claim: mapText(L.claimMaxChars), rests_on: restsOn,
        member_item_ids: z.array(mapId).min(1) }).strict()),
      answers: z.array(z.object({ answer_id: mapId, answer: mapText(L.candidateAnswerMaxChars), member_item_ids: z.array(mapId).min(1) }).strict())
    }).strict(),
    gap: z.object({
      new_points: z.array(point).max(L.gapPointsMax),
      framing_challenges: z.array(mapText(L.claimMaxChars)).max(L.framingChallengesMax)
    }).strict(),
    choose: z.object({
      answers: z.array(z.object({ answer_id: mapId, statement: mapText(L.claimMaxChars), ...sides, strongest_rival: mapId.nullable(),
        assumptions }).strict()).min(L.chooseAnswersMin).max(L.chooseAnswersMax),
      reserve_answers: z.array(z.object({ statement: mapText(L.claimMaxChars), ...sides, assumptions }).strict())
        .max(MAP_ENGINE_LIMITS.reservesMax).optional()
    }).strict(),
    check: z.object({
      checks: z.array(z.object({
        check_id: z.string().regex(/^(a[1-4]|c[1-4])$/u),
        answers_question: z.boolean(),
        adds_unstated_fact: z.boolean(),
        // (pre-flight PF-R3-2.2, FINAL Ruling D4(b) encoding) REQUIRED, nullable: never `.optional()`.
        cost_can_be_named: z.boolean().nullable(),
        reason: mapText(L.claimMaxChars).nullable()
      }).strict()).min(1).max(MAP_ENGINE_LIMITS.checkIdsMax)
    }).strict()
  });
}
/**
 * (pre-flight PF-R3-2.10) Built ONCE, like LG-C's MAP_LENGTHED_REPLY_SCHEMAS (pre-flight PF-C5.13): every engine-2 spec
 * (Task 6) and the practice re-check (Task 17) read these same objects, so the fixer's schema walk sees one identity per step.
 */
export const MAP_ENGINE_REPLY_SCHEMAS = mapReplySchemasV2For(mapLimitsFor(true));
/** INTERFACE §10.2's names for the v2 twins. */
export const mapListReplySchemaV2 = MAP_ENGINE_REPLY_SCHEMAS.list;
export const mapSnowballReplySchemaV2 = MAP_ENGINE_REPLY_SCHEMAS.snowball;
export const mapMergeReplySchemaV2 = MAP_ENGINE_REPLY_SCHEMAS.merge;
export const mapGapReplySchemaV2 = MAP_ENGINE_REPLY_SCHEMAS.gap;
export const mapChooseReplySchemaV2 = MAP_ENGINE_REPLY_SCHEMAS.choose;
export const mapCheckReplySchema = MAP_ENGINE_REPLY_SCHEMAS.check;
export type MapListReplyV2 = z.infer<typeof mapListReplySchemaV2>;
export type MapSnowballReplyV2 = z.infer<typeof mapSnowballReplySchemaV2>;
export type MapMergeReplyV2 = z.infer<typeof mapMergeReplySchemaV2>;
export type MapGapReplyV2 = z.infer<typeof mapGapReplySchemaV2>;
export type MapChooseReplyV2 = z.infer<typeof mapChooseReplySchemaV2>;
export type MapCheckReply = z.infer<typeof mapCheckReplySchema>;

export type MapReplyIssue = Readonly<{ path: readonly (string | number)[]; code: string }>;
export type MapReplyCheck<T> = (value: T) => readonly MapReplyIssue[];

/** Engine 2 (P2.3, INTERFACE §10.5): `exactLimits` keeps zod's limit members, so the follow-up states the exact limit. */
export type MapClassifyOptions = Readonly<{ exactLimits?: boolean }>;

/** zod's members `issueSizeLimit` (packages/providers/src/prompt-frame.ts) reads to state a limit. */
const LIMIT_MEMBERS = Object.freeze(["maximum", "minimum", "origin", "inclusive", "exact"] as const);

/**
 * One refusal entry per zod issue. Without `exactLimits`: today's `{ code, path, message: "SCHEMA_FAILED" }`, byte for
 * byte. With it: the same plus zod's limit members; and an id that fails its form (a regex) becomes the content code
 * MAP_ID_FORM (its plain sentence states the id rule), or MAP_CHECK_UNKNOWN_ID for a check id.
 */
function mapSchemaIssues(issues: readonly z.core.$ZodIssue[], options: MapClassifyOptions): readonly Record<string, unknown>[] {
  return issues.map((issue) => {
    const path = issue.path.map((segment) => (typeof segment === "number" ? segment : String(segment)));
    if (options.exactLimits !== true) return { code: issue.code, path, message: "SCHEMA_FAILED" };
    const last = path.at(-1);
    if (issue.code === "invalid_format" && (issue as { format?: unknown }).format === "regex") {
      return { code: "custom", path, message: last === "check_id" ? "MAP_CHECK_UNKNOWN_ID" : "MAP_ID_FORM" };
    }
    const limits = Object.fromEntries(LIMIT_MEMBERS.flatMap((member) => (member in issue ? [[member, (issue as unknown as Record<string, unknown>)[member]]] : [])));
    return { code: issue.code, path, message: "SCHEMA_FAILED", ...limits };
  });
}

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
  check: MapReplyCheck<T>, salvage: MapReplySalvage<T> = {}, options: MapClassifyOptions = {}): Readonly<{ classification: ContentClassification; value: T | null;
  repairs: readonly ModelJsonRepair[] }> {
  const refused = (classification: ContentClassification) => Object.freeze({ classification, value: null, repairs: Object.freeze([]) });
  const decoded = decodeModelJson(content, reply);
  if (!decoded.ok) return refused({ parseStatus: "PARSE_FAILED", parseError: "MAP_REPLY_NOT_JSON" });
  const before = salvage.decoded?.(decoded.value) ?? { value: decoded.value, repairs: [] };
  const first = schema.safeParse(before.value);
  /** One reading's schema refusal in the gateway's repair format (engine 2 with `exactLimits`: zod's limit members kept). */
  const schemaRefusal = (result: typeof first) => refused({ parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(
    result.success ? [] : mapSchemaIssues(result.error.issues, options)) });
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
export function mapListCheck(expected: ReplyLanguageExpectation): MapReplyCheck<Readonly<{ points: readonly Readonly<{ claim: string;
  why_it_matters: string }>[]; candidate_answers: readonly string[] }>> {
  return (value) => [
    ...mapLanguageIssues(value.points.flatMap((point) => [point.claim, point.why_it_matters]), expected, ["points"]),
    ...mapLanguageIssues(value.candidate_answers, expected, ["candidate_answers"])
  ];
}

export function mapMergeCheck(pointIds: ReadonlySet<string>, answerIds: ReadonlySet<string>, expected: ReplyLanguageExpectation): MapReplyCheck<Readonly<{
  key_points: readonly Readonly<{ key_point_id: string; claim: string; member_item_ids: readonly string[] }>[];
  answers: readonly Readonly<{ answer_id: string; answer: string; member_item_ids: readonly string[] }>[] }>> {
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

export function mapGapCheck(expected: ReplyLanguageExpectation): MapReplyCheck<Readonly<{ new_points: readonly Readonly<{ claim: string;
  why_it_matters: string }>[] }>> {
  return (value) => mapLanguageIssues(value.new_points.flatMap((point) => [point.claim, point.why_it_matters]), expected, ["new_points"]);
}

/**
 * Today's per-answer rules (ids, sides, rival, words, duplicates, internal words), for any field-name list: the body of
 * today's `mapChooseCheck` (`replies.ts:224-257`, R1c part 2) moved as it is, its loop `:229-253` byte for byte except
 * `mapNamesInternalWord(answer.statement, names)` (pre-flight PF-R3-2.5: the complete body, no placeholder).
 */
function mapChooseAnswerIssues(answers: readonly Readonly<{ answer_id: string; statement: string; for: readonly string[];
  against: readonly string[]; strongest_rival: string | null }>[], keyPointIds: ReadonlySet<string>, names: readonly string[]): MapReplyIssue[] {
  const issues: MapReplyIssue[] = [];
  const ids = answers.map((answer) => answer.answer_id);
  const statements = new Set<string>();
  answers.forEach((answer, index) => {
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
    if (mapNamesInternalWord(answer.statement, names)) issues.push({ path: ["answers", index, "statement"], code: "MAP_ANSWER_NAMES_FIELD" });
    if (statement !== "") statements.add(statement);
  });
  return issues;
}

export function mapChooseCheck(keyPointIds: ReadonlySet<string>, expected: ReplyLanguageExpectation): MapReplyCheck<MapChooseReply> {
  return (value) => [
    ...mapChooseAnswerIssues(value.answers, keyPointIds, MAP_INTERNAL_FIELD_NAMES),
    ...mapLanguageIssues(value.answers.map((answer) => answer.statement), expected, ["answers"])
  ];
}

/**
 * ENGINE 2 (spec §5.2 items 2-3): today's rules for the answers, with engine 2's internal words, plus the assumptions
 * (words, no internal word) and the reserves (words, no internal word, no repeat of a chosen answer or of each other,
 * known key points each once). The language check reads each field's texts together (ruling R-3).
 */
export function mapChooseCheckV2(keyPointIds: ReadonlySet<string>, expected: ReplyLanguageExpectation): MapReplyCheck<MapChooseReplyV2> {
  const names = MAP_ENGINE_INTERNAL_FIELD_NAMES;
  return (value) => {
    const issues: MapReplyIssue[] = [...mapChooseAnswerIssues(value.answers, keyPointIds, names)];
    const textIssues = (text: string, path: readonly (string | number)[]): void => {
      if (mapNormaliseText(text) === "") issues.push({ path, code: "MAP_ANSWER_NO_WORDS" });
      else if (mapNamesInternalWord(text, names)) issues.push({ path, code: "MAP_ANSWER_NAMES_FIELD" });
    };
    value.answers.forEach((answer, index) => (answer.assumptions ?? []).forEach((text, at) => textIssues(text, ["answers", index, "assumptions", at])));
    const taken = new Set(value.answers.map((answer) => mapNormaliseText(answer.statement)).filter((key) => key !== ""));
    (value.reserve_answers ?? []).forEach((reserve, index) => {
      const key = mapNormaliseText(reserve.statement);
      textIssues(reserve.statement, ["reserve_answers", index, "statement"]);
      if (key !== "" && taken.has(key)) issues.push({ path: ["reserve_answers", index, "statement"], code: "MAP_ANSWER_DUPLICATE" });
      if (key !== "") taken.add(key);
      const seen = new Set<string>();
      for (const side of ["for", "against"] as const) {
        reserve[side].forEach((id, at) => {
          if (!keyPointIds.has(id)) issues.push({ path: ["reserve_answers", index, side, at], code: "MAP_UNKNOWN_KEY_POINT_ID" });
          else if (seen.has(id)) issues.push({ path: ["reserve_answers", index, side, at], code: "MAP_KEY_POINT_REPEATED" });
          seen.add(id);
        });
      }
      (reserve.assumptions ?? []).forEach((text, at) => textIssues(text, ["reserve_answers", index, "assumptions", at]));
    });
    issues.push(...mapLanguageIssues([...value.answers.flatMap((answer) => [answer.statement, ...(answer.assumptions ?? [])])], expected, ["answers"]));
    issues.push(...mapLanguageIssues((value.reserve_answers ?? []).flatMap((reserve) => [reserve.statement, ...(reserve.assumptions ?? [])]),
      expected, ["reserve_answers"]));
    return issues;
  };
}

/**
 * ENGINE 2 (spec §5.2 item 5, INTERFACE §10.4 as superseded by the FINAL D4(b) ruling, deviation 12): one entry per id
 * shown, each once (MAP_CHECK_UNKNOWN_ID, MAP_CHECK_ID_REPEATED, MAP_CHECK_ID_MISSING), and a reason for every answer
 * that fails ANY of the three tests (MAP_CHECK_REASON_MISSING): it does not answer, it adds an unstated fact, or no cost
 * of following it can be named (`cost_can_be_named === false`; null is the checker's own premise exemption, no failure).
 * The reasons' language is checked together. Code never decides a pass or a fail (G1): it only checks the reply's form.
 */
export function mapCheckCheck(shownIds: readonly string[], expected: ReplyLanguageExpectation): MapReplyCheck<MapCheckReply> {
  return (value) => {
    const issues: MapReplyIssue[] = [];
    const seen = new Set<string>();
    value.checks.forEach((entry, index) => {
      if (!shownIds.includes(entry.check_id)) issues.push({ path: ["checks", index, "check_id"], code: "MAP_CHECK_UNKNOWN_ID" });
      else if (seen.has(entry.check_id)) issues.push({ path: ["checks", index, "check_id"], code: "MAP_CHECK_ID_REPEATED" });
      seen.add(entry.check_id);
      // (pre-flight PF-R3-2.2, FINAL Ruling D4(b) encoding) any failed test, the third included.
      const fails = !entry.answers_question || entry.adds_unstated_fact || entry.cost_can_be_named === false;
      if (fails && (entry.reason === null || mapNormaliseText(entry.reason) === "")) {
        issues.push({ path: ["checks", index, "reason"], code: "MAP_CHECK_REASON_MISSING" });
      }
    });
    if (shownIds.some((id) => !seen.has(id))) issues.push({ path: ["checks"], code: "MAP_CHECK_ID_MISSING" });
    issues.push(...mapLanguageIssues(value.checks.flatMap((entry) => (entry.reason === null ? [] : [entry.reason])), expected, ["checks"]));
    return issues;
  };
}
