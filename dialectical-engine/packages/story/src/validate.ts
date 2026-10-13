import { z } from "zod";
import { STORY_BODY_LIMITS, StoryBodySchema, type StoryBody } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { decodeModelJson, type ContentClassification, type ModelJsonDecoded, type ModelReplyFacts } from "@debateai/providers";
import { STORY_CHECKER_OBJECTION_MAX_CHARS } from "./contracts.js";

/**
 * THE DETERMINISTIC CHECKS (spec §5.3), run as each story call's content
 * classifier, so a failure is repaired INSIDE the call's own attempts exactly
 * as the synthesizer's schema repairs are.
 *
 * A failure is reported the way zod reports one: `SCHEMA_FAILED` with a JSON
 * array of issues whose `path` is the machine address of the bad member and
 * whose `message` is a code. `schemaFailureLocator` reads only the status and
 * the path, so the repair packet carries a code and a path and never a byte of
 * what the model wrote.
 *
 * The story's TEXT is not inspected for markup: it is plain-text data, and the
 * site and the PDF never render it as anything else. It is inspected for
 * control and bidirectional-override characters, which can hide or reorder
 * what a reader sees however the text is rendered. The texts the site shows
 * (the short version's, the confidence sentence among them, and the reviewer's
 * note) are also refused a point number: the owner's and the public page have
 * no appendix to look one up in. And no text may print a score or a threshold
 * of the material, or one of its code tokens (spec §14.1): the story speaks to
 * the person about their question, never in the engine's numbers or codes.
 */

/** What the material offers a story to cite. Built by `buildStoryMaterial`. */
export interface StoryMaterialIndex {
  readonly nodeIds: ReadonlySet<string>;
  readonly positionIds: ReadonlySet<string>;
  /** The same references as `positionIds`, strongest first: past `pathCap` positions, only the first `pathCap` may be paths. */
  readonly positionOrder: readonly string[];
  readonly shapeIds: ReadonlySet<string>;
  /** 1 to `STORY_BODY_LIMITS.maxPaths`, so the check and the schema can never disagree. */
  readonly pathCap: number;
  /**
   * Every score and threshold of the material as a story might print it: two
   * decimals, and the value as the material prints it (0.6412, 0.7), each with
   * "." and with "," (0.64, 0,64). A form the question or a claim also states
   * is the person's own figure and is not held. A text holding one as a whole
   * token (no digit on either side, and no percent sign after it) is refused,
   * STORY_TEXT_SCORE_VALUE.
   */
  readonly scoreTexts: ReadonlySet<string>;
  /**
   * The material's code tokens a story may not use (`STORY_ENGINE_TOKENS`),
   * less any the question or a claim itself uses as a whole token: "Open RAN"
   * in the question is the person's word, and the story may repeat it. A text
   * holding one as a whole, case-sensitive token is refused, STORY_TEXT_ENGINE_TOKEN.
   */
  readonly engineTokens: ReadonlySet<string>;
}

/**
 * C0 control characters other than tab and line feed, and the bidirectional
 * embedding, override and isolate characters (U+202A–U+202E, U+2066–U+2069):
 * refused in every model text a person reads, the story's and the checker's objection.
 */
const STORY_TEXT_FORBIDDEN = /[\u0000-\u0008\u000B-\u001F\u202A-\u202E\u2066-\u2069]/u;

/**
 * A point number (P1, P14) standing as a word of its own. Refused in the texts
 * the site shows without the appendix that numbers the points: the short
 * version's (headline, summary, each path line, the change text) and the
 * reviewer's note's. The long version and every node_refs array may still use
 * them. "P0", "PS" and "MP3" are not point numbers.
 */
const STORY_SHORT_POINT_NUMBER = /\bP[1-9][0-9]*\b/u;

/**
 * What an engine token is: an all-capitals code (SUPPORTED, HELD_UP) or a
 * lowercase key with an underscore (known_by), as code's enums and keys are.
 * A lowercase word on its own ("ran") is never one: it would refuse ordinary
 * text. Anything else is code's mistake.
 */
const STORY_ENGINE_TOKEN_TEXT = /^(?:[A-Z]+(?:_[A-Z]+)*|[a-z]+(?:_[a-z]+)+)$/u;

/**
 * One pattern for the index's engine tokens, each as a whole, case-sensitive
 * token: no letter, digit or underscore right before or after it.
 * Language-independent, and it never refuses an ordinary word: "ran", "fell"
 * and "supported" are not "RAN", "FELL" and "SUPPORTED", and "RANDOM" is not
 * "RAN". The tokens are letters and underscores only (checked on the index),
 * so none needs escaping. Null when there is none to refuse.
 */
function storyEngineTokenPattern(tokens: ReadonlySet<string>): RegExp | null {
  if (tokens.size === 0) return null;
  const alternatives = [...tokens].sort((left, right) => right.length - left.length || (left < right ? -1 : left > right ? 1 : 0));
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}_])`, "u");
}

/** What a score text is: digits, a point or a comma, digits. Anything else is code's mistake. */
const STORY_SCORE_TEXT = /^[0-9]+[.,][0-9]+$/u;

/**
 * One pattern for all the material's score texts, each standing as a whole
 * token: no digit, in any script, right before or right after it. "10,640 lei"
 * therefore never matches 0,64, and "35%" never matches 0.35. A percentage is
 * the debate's own figure, never a score (scores are not percentages), so a
 * match followed by a percent sign, with or without a space, is not refused:
 * "0,35% a month" is an interest rate, whatever the low cut is. Null when the
 * material holds no score at all.
 */
function storyScorePattern(scoreTexts: ReadonlySet<string>): RegExp | null {
  if (scoreTexts.size === 0) return null;
  // Longest first, so the pattern names the whole printed value it found. Each
  // entry is digits and one separator (checked on the index), so the point is
  // the only character to escape; a comma needs none, and the u flag refuses one.
  const alternatives = [...scoreTexts]
    .sort((left, right) => right.length - left.length || (left < right ? -1 : left > right ? 1 : 0))
    .map((text) => text.replace(".", "\\."));
  return new RegExp(`(?<!\\p{Nd})(?:${alternatives.join("|")})(?!\\p{Nd})(?![\\p{Zs}]?%)`, "u");
}

/**
 * The objection's limit is the current answer form's (checker v3, 2026-10-13: 4000 characters, raised from 2000 because
 * the checker lists every problem in one objection). Raising it accepts every verdict the older limit accepted.
 */
export const StoryCheckerVerdictSchema = z.object({
  satisfied: z.boolean(),
  objection: z.string().trim().min(1).max(STORY_CHECKER_OBJECTION_MAX_CHARS).nullable(),
  criteria: z.object({
    faithful_to_material: z.boolean(),
    agrees_with_label: z.boolean(),
    fair_to_losing_paths: z.boolean(),
    no_overstatement: z.boolean(),
    citations_correct: z.boolean(),
    reviewer_note_separate: z.boolean(),
    goal_marked_as_reading: z.boolean(),
    /** Spec §14.1: false whenever the story uses engine vocabulary or talks about the machinery instead of the question. */
    speaks_to_the_person: z.boolean()
  }).strict()
}).strict().superRefine((verdict, context) => {
  if (verdict.satisfied && Object.values(verdict.criteria).some((met) => !met)) {
    context.addIssue({ code: "custom", path: ["satisfied"], message: "STORY_CHECKER_SATISFIED_WITH_UNMET_CRITERION" });
  }
  if (verdict.objection !== null && STORY_TEXT_FORBIDDEN.test(verdict.objection)) {
    context.addIssue({ code: "custom", path: ["objection"], message: "STORY_TEXT_CONTROL_CHARACTER" });
  }
  if (!verdict.satisfied && verdict.objection === null) {
    context.addIssue({ code: "custom", path: ["objection"], message: "STORY_CHECKER_OBJECTION_REQUIRED" });
  }
});
export type StoryCheckerVerdict = z.infer<typeof StoryCheckerVerdictSchema>;

interface StoryIssue {
  readonly code: "custom";
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/** Enough issues to name the first few problems; the locator reads only the first. */
const STORY_ISSUE_LIMIT = 20;

/**
 * The index is code's, built by `buildStoryMaterial`; a wrong one is a
 * programming error, refused loudly rather than judged as the model's fault.
 */
function assertStoryMaterialIndex(index: StoryMaterialIndex): void {
  if (!Number.isInteger(index.pathCap) || index.pathCap < 1 || index.pathCap > STORY_BODY_LIMITS.maxPaths) {
    throw new TypedDomainError(
      "STORY_PATH_CAP_INVALID",
      `pathCap must be an integer from 1 to ${String(STORY_BODY_LIMITS.maxPaths)}`
    );
  }
  const ordered = new Set(index.positionOrder);
  if (ordered.size !== index.positionOrder.length || ordered.size !== index.positionIds.size
    || index.positionOrder.some((ref) => !index.positionIds.has(ref))) {
    throw new TypedDomainError(
      "STORY_POSITION_ORDER_INVALID",
      "positionOrder must list every position exactly once"
    );
  }
  // An empty or malformed entry would match (or break) every text, refusing every story.
  if ([...index.scoreTexts].some((text) => !STORY_SCORE_TEXT.test(text))) {
    throw new TypedDomainError(
      "STORY_SCORE_TEXTS_INVALID",
      "scoreTexts must hold only printed decimals such as 0.64 or 0,64"
    );
  }
  if ([...index.engineTokens].some((token) => !STORY_ENGINE_TOKEN_TEXT.test(token))) {
    throw new TypedDomainError(
      "STORY_ENGINE_TOKENS_INVALID",
      "engineTokens must hold only code tokens such as SUPPORTED or known_by"
    );
  }
}

function storyContentIssues(body: StoryBody, index: StoryMaterialIndex): readonly StoryIssue[] {
  const issues: StoryIssue[] = [];
  const issue = (path: readonly (string | number)[], message: string): void => {
    issues.push(Object.freeze({ code: "custom", path: Object.freeze([...path]), message }));
  };
  const scores = storyScorePattern(index.scoreTexts);
  const engineTokens = storyEngineTokenPattern(index.engineTokens);
  /** Every text a person reads: no hidden or reordering characters, none of the material's scores, none of its codes. */
  const text = (value: string, at: readonly (string | number)[]): void => {
    if (STORY_TEXT_FORBIDDEN.test(value)) issue(at, "STORY_TEXT_CONTROL_CHARACTER");
    if (scores !== null && scores.test(value)) issue(at, "STORY_TEXT_SCORE_VALUE");
    if (engineTokens !== null && engineTokens.test(value)) issue(at, "STORY_TEXT_ENGINE_TOKEN");
  };
  /** A text the site shows: checked like every text, and refused a point number. */
  const siteText = (value: string, at: readonly (string | number)[]): void => {
    text(value, at);
    if (STORY_SHORT_POINT_NUMBER.test(value)) issue(at, "STORY_SHORT_POINT_NUMBER");
  };
  const citations = (refs: readonly string[], at: readonly (string | number)[]): void => {
    refs.forEach((ref, position) => {
      if (!index.nodeIds.has(ref)) issue([...at, "node_refs", position], "STORY_UNKNOWN_NODE_REF");
    });
  };

  if (!index.shapeIds.has(body.shape_id)) issue(["shape_id"], "STORY_UNKNOWN_SHAPE");
  siteText(body.short.headline, ["short", "headline"]);
  siteText(body.short.summary, ["short", "summary"]);
  siteText(body.short.confidence, ["short", "confidence"]);

  // Past the cap, only the strongest positions may be paths. Under it, every position is among them.
  const strongest = new Set(index.positionOrder.slice(0, index.pathCap));
  const covered = new Set<string>();
  let pathsWellFormed = true;
  body.short.paths.forEach((path, position) => {
    if (!index.positionIds.has(path.position_ref)) {
      pathsWellFormed = false;
      issue(["short", "paths", position, "position_ref"], "STORY_NOT_A_POSITION");
    } else if (covered.has(path.position_ref)) {
      pathsWellFormed = false;
      issue(["short", "paths", position, "position_ref"], "STORY_DUPLICATE_POSITION");
    } else if (!strongest.has(path.position_ref)) {
      pathsWellFormed = false;
      issue(["short", "paths", position, "position_ref"], "STORY_PATH_NOT_AMONG_STRONGEST");
    }
    covered.add(path.position_ref);
    siteText(path.line, ["short", "paths", position, "line"]);
    citations(path.node_refs, ["short", "paths", position]);
  });
  // Every position once while they fit under the cap; exactly the cap beyond it.
  const expected = Math.min(index.positionIds.size, index.pathCap);
  if (pathsWellFormed && body.short.paths.length !== expected) {
    issue(["short", "paths"], "STORY_POSITION_COVERAGE");
  }

  siteText(body.short.change.text, ["short", "change", "text"]);
  citations(body.short.change.node_refs, ["short", "change"]);
  // The reasons are printed only in the full report, beside its appendix: a point number may stand in them.
  body.why.reasons.forEach((reason, reasonIndex) => {
    text(reason.text, ["why", "reasons", reasonIndex, "text"]);
    citations(reason.node_refs, ["why", "reasons", reasonIndex]);
  });
  body.long.sections.forEach((section, sectionIndex) => {
    text(section.title, ["long", "sections", sectionIndex, "title"]);
    section.paragraphs.forEach((paragraph, paragraphIndex) => {
      const at = ["long", "sections", sectionIndex, "paragraphs", paragraphIndex] as const;
      text(paragraph.text, [...at, "text"]);
      citations(paragraph.node_refs, at);
    });
  });
  if (body.reviewer_note !== null) {
    siteText(body.reviewer_note.text, ["reviewer_note", "text"]);
    citations(body.reviewer_note.node_refs, ["reviewer_note"]);
  }
  return issues.slice(0, STORY_ISSUE_LIMIT);
}

/**
 * Story format robustness (2026-10-12): both story sites read the model's answer with the providers' tolerant
 * decode (`decodeModelJson`): strict JSON, else one fence's body, else the outermost object with prose around
 * it, else straight quotes inside text values escaped, else, only for a reply that finished normally, the
 * brackets still open at the very end closed. Never anything else, and never a reply cut off at its token
 * ceiling. Whatever it returns still goes through the full schema and content checks below, and the stored
 * artifact stays the vendor's own bytes. `reply` is how the call ended, as the gateway saw it; without it the
 * ending is unknown and the last repair is not made.
 *
 * R15 practice debate (2026-10-13): both sites also ask for the decode's last resort, TRAILING_OBJECT (a reply that
 * finished normally, wrote its reasoning out as prose, and ENDS with one complete object, bare or in its one code
 * fence), and accept it only when that object passes the site's full checks (schema, and for the story its content
 * checks too): otherwise the reply stays the PARSE_FAILED it was, so the repair never turns a refused reply into a
 * differently refused one. It comes after every other repair, so no reply those read is read differently.
 *
 * A PARSED classification carries the repair code only when one was needed.
 */
function parsedWith(decoded: Extract<ModelJsonDecoded, { ok: true }>): ContentClassification {
  return decoded.repair === null
    ? { parseStatus: "PARSED", parseError: null }
    : { parseStatus: "PARSED", parseError: null, jsonRepair: decoded.repair };
}

type StoryDecision =
  | { readonly classification: ContentClassification; readonly body: StoryBody }
  | { readonly classification: ContentClassification; readonly body: null };

function decideStory(content: string, index: StoryMaterialIndex, reply: ModelReplyFacts | undefined): StoryDecision {
  assertStoryMaterialIndex(index);
  const decoded = decodeModelJson(content, reply, { trailingObjectAccepted: (value) => {
    const candidate = StoryBodySchema.safeParse(value);
    return candidate.success && storyContentIssues(candidate.data, index).length === 0;
  } });
  if (!decoded.ok) return { classification: { parseStatus: "PARSE_FAILED", parseError: decoded.error }, body: null };
  const parsed = StoryBodySchema.safeParse(decoded.value);
  if (!parsed.success) return { classification: { parseStatus: "SCHEMA_FAILED", parseError: parsed.error.message }, body: null };
  const issues = storyContentIssues(parsed.data, index);
  return issues.length === 0
    ? { classification: parsedWith(decoded), body: parsed.data }
    : { classification: { parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(issues) }, body: null };
}

/**
 * The storyteller's content classifier: the JSON form, then the text
 * characters and score values, every reference and the coverage. Throws
 * `STORY_PATH_CAP_INVALID`, `STORY_POSITION_ORDER_INVALID`,
 * `STORY_SCORE_TEXTS_INVALID` or `STORY_ENGINE_TOKENS_INVALID` for an index
 * code built wrongly.
 */
export function classifyStoryContent(content: string, index: StoryMaterialIndex, reply?: ModelReplyFacts): ContentClassification {
  return decideStory(content, index, reply).classification;
}

/**
 * The accepted story, decoded exactly as the classifier decoded it (pass the same `reply`). Throws
 * `STORY_CONTENT_INVALID` for content the classifier refuses.
 */
export function parseStoryBody(content: string, index: StoryMaterialIndex, reply?: ModelReplyFacts): StoryBody {
  const decided = decideStory(content, index, reply);
  if (decided.body === null) {
    throw new TypedDomainError("STORY_CONTENT_INVALID", decided.classification.parseStatus);
  }
  return decided.body;
}

function decideChecker(content: string, reply: ModelReplyFacts | undefined):
  { readonly classification: ContentClassification; readonly verdict: StoryCheckerVerdict | null } {
  const decoded = decodeModelJson(content, reply, { trailingObjectAccepted: (value) => StoryCheckerVerdictSchema.safeParse(value).success });
  if (!decoded.ok) return { classification: { parseStatus: "PARSE_FAILED", parseError: decoded.error }, verdict: null };
  const parsed = StoryCheckerVerdictSchema.safeParse(decoded.value);
  return parsed.success
    ? { classification: parsedWith(decoded), verdict: parsed.data }
    : { classification: { parseStatus: "SCHEMA_FAILED", parseError: parsed.error.message }, verdict: null };
}

/** The checker's content classifier. */
export function classifyCheckerContent(content: string, reply?: ModelReplyFacts): ContentClassification {
  return decideChecker(content, reply).classification;
}

/**
 * The accepted checker verdict, decoded exactly as the classifier decoded it (pass the same `reply`).
 * Throws `STORY_CHECKER_CONTENT_INVALID` for refused content.
 */
export function parseCheckerVerdict(content: string, reply?: ModelReplyFacts): StoryCheckerVerdict {
  const decided = decideChecker(content, reply);
  if (decided.verdict === null) {
    throw new TypedDomainError("STORY_CHECKER_CONTENT_INVALID", decided.classification.parseStatus);
  }
  return decided.verdict;
}
