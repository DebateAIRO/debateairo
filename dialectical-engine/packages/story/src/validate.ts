import { z } from "zod";
import { StoryBodySchema, type StoryBody } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import type { ContentClassification } from "@debateai/providers";

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
 * site and the PDF never render it as anything else.
 */

/** What the material offers a story to cite. Built by `buildStoryMaterial`. */
export interface StoryMaterialIndex {
  readonly nodeIds: ReadonlySet<string>;
  readonly positionIds: ReadonlySet<string>;
  readonly shapeIds: ReadonlySet<string>;
  readonly pathCap: number;
}

export const StoryCheckerVerdictSchema = z.object({
  satisfied: z.boolean(),
  objection: z.string().trim().min(1).max(2000).nullable(),
  criteria: z.object({
    faithful_to_material: z.boolean(),
    agrees_with_label: z.boolean(),
    fair_to_losing_paths: z.boolean(),
    no_overstatement: z.boolean(),
    citations_correct: z.boolean(),
    reviewer_note_separate: z.boolean(),
    goal_marked_as_reading: z.boolean()
  }).strict()
}).strict().superRefine((verdict, context) => {
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

function storyReferenceIssues(body: StoryBody, index: StoryMaterialIndex): readonly StoryIssue[] {
  const issues: StoryIssue[] = [];
  const issue = (path: readonly (string | number)[], message: string): void => {
    issues.push(Object.freeze({ code: "custom", path: Object.freeze([...path]), message }));
  };
  const citations = (refs: readonly string[], at: readonly (string | number)[]): void => {
    refs.forEach((ref, position) => {
      if (!index.nodeIds.has(ref)) issue([...at, "node_refs", position], "STORY_UNKNOWN_NODE_REF");
    });
  };

  if (!index.shapeIds.has(body.shape_id)) issue(["shape_id"], "STORY_UNKNOWN_SHAPE");

  const covered = new Set<string>();
  let pathsWellFormed = true;
  body.short.paths.forEach((path, position) => {
    if (!index.positionIds.has(path.position_ref)) {
      pathsWellFormed = false;
      issue(["short", "paths", position, "position_ref"], "STORY_NOT_A_POSITION");
    } else if (covered.has(path.position_ref)) {
      pathsWellFormed = false;
      issue(["short", "paths", position, "position_ref"], "STORY_DUPLICATE_POSITION");
    }
    covered.add(path.position_ref);
    citations(path.node_refs, ["short", "paths", position]);
  });
  // Every position once while they fit under the cap; exactly the cap beyond it.
  const expected = Math.min(index.positionIds.size, index.pathCap);
  if (pathsWellFormed && body.short.paths.length !== expected) {
    issue(["short", "paths"], "STORY_POSITION_COVERAGE");
  }

  citations(body.short.change.node_refs, ["short", "change"]);
  body.long.sections.forEach((section, sectionIndex) => {
    section.paragraphs.forEach((paragraph, paragraphIndex) => {
      citations(paragraph.node_refs, ["long", "sections", sectionIndex, "paragraphs", paragraphIndex]);
    });
  });
  if (body.reviewer_note !== null) citations(body.reviewer_note.node_refs, ["reviewer_note"]);
  return issues.slice(0, STORY_ISSUE_LIMIT);
}

function decodeStoryJson(content: string): { readonly ok: true; readonly value: unknown } | {
  readonly ok: false;
  readonly error: string;
} {
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The storyteller's content classifier: the JSON form, then every reference and the coverage. */
export function classifyStoryContent(content: string, index: StoryMaterialIndex): ContentClassification {
  const decoded = decodeStoryJson(content);
  if (!decoded.ok) return { parseStatus: "PARSE_FAILED", parseError: decoded.error };
  const parsed = StoryBodySchema.safeParse(decoded.value);
  if (!parsed.success) return { parseStatus: "SCHEMA_FAILED", parseError: parsed.error.message };
  const issues = storyReferenceIssues(parsed.data, index);
  return issues.length === 0
    ? { parseStatus: "PARSED", parseError: null }
    : { parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(issues) };
}

/** The accepted story. Throws `STORY_CONTENT_INVALID` for content the classifier refuses. */
export function parseStoryBody(content: string, index: StoryMaterialIndex): StoryBody {
  const classified = classifyStoryContent(content, index);
  if (classified.parseStatus !== "PARSED") {
    throw new TypedDomainError("STORY_CONTENT_INVALID", classified.parseStatus);
  }
  return StoryBodySchema.parse(JSON.parse(content));
}

/** The checker's content classifier. */
export function classifyCheckerContent(content: string): ContentClassification {
  const decoded = decodeStoryJson(content);
  if (!decoded.ok) return { parseStatus: "PARSE_FAILED", parseError: decoded.error };
  const parsed = StoryCheckerVerdictSchema.safeParse(decoded.value);
  return parsed.success
    ? { parseStatus: "PARSED", parseError: null }
    : { parseStatus: "SCHEMA_FAILED", parseError: parsed.error.message };
}

/** The accepted checker verdict. Throws `STORY_CHECKER_CONTENT_INVALID` for refused content. */
export function parseCheckerVerdict(content: string): StoryCheckerVerdict {
  const classified = classifyCheckerContent(content);
  if (classified.parseStatus !== "PARSED") {
    throw new TypedDomainError("STORY_CHECKER_CONTENT_INVALID", classified.parseStatus);
  }
  return StoryCheckerVerdictSchema.parse(JSON.parse(content));
}
