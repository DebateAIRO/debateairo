import { z } from "zod";
import { START_PATH_AUTHORS, START_PATHS_SOURCES, START_STEP_LIMITS, pathIdOf } from "@debateai/kernel";
import { PathOutcomeSchema, PATH_OUTCOME_STATES } from "./path-outcome.js";
import { PathIdSchema } from "./start-paths.js";
import { PathTextSchema, TrustWordSchema } from "./web.js";

/**
 * V4 start step, Task 16 (spec 2026-11-03 §2.7, §2.8, §4.3): a path debate's paths, as the answer, the run read and
 * the public snapshot show them. Each chosen path is a branch argued from its angle: being looked into, argued (with its
 * answer so far) or failed. "+ N more to explore" lists the menu paths not chosen; "also raised" the gap round's points
 * no path took. The public snapshot keeps what a reader of a public debate may see: never the "more" list, the person's
 * point-of-view line, the carry-on box, the evidence ids or the root's node id.
 */
export const ANSWER_BRANCH_LIMITS = Object.freeze({ pathsMax: 8,
  /** Every viewpoint of a path, a merged group whole (Task 92a: the owner's merge words of 4 Nov set no group size). */
  viewpointsMax: START_STEP_LIMITS.pathMembersMax,
  moreMax: 54, alsoRaisedMax: 40, alsoRaisedMaxChars: 400, titleMaxChars: 120, questionMaxChars: 1000, moreTitleMaxChars: 80,
  moreQuestionMaxChars: 240, nodeRefMaxChars: 160 });
export const BRANCH_STATES = Object.freeze(["LOOKING", "ARGUED", "FAILED"] as const);
export type BranchState = typeof BRANCH_STATES[number];
/** A "+ N more" item's id: more-<the menu path's ref>. */
export const MORE_ID_PATTERN = /^more-kp[0-5][0-9]$/u;

const B = ANSWER_BRANCH_LIMITS;
const words = (max: number) => z.string().trim().min(1).max(max);

/** One viewpoint of a path: an AI's suggestion (its title and question) or the person's own words (no title). */
export const AnswerBranchViewpointSchema = z.object({
  title: words(B.titleMaxChars).nullable(),
  question: words(B.questionMaxChars),
  own: z.boolean()
}).strict().superRefine((viewpoint, context) => {
  if (viewpoint.own && viewpoint.title !== null) context.addIssue({ code: "custom", path: ["title"], message: "the person's own words carry no title" });
});
export type AnswerBranchViewpoint = z.infer<typeof AnswerBranchViewpointSchema>;

export const AnswerBranchSchema = z.object({
  path_id: PathIdSchema,
  order: z.number().int().min(1).max(B.pathsMax),
  title: words(B.titleMaxChars),
  question: words(B.questionMaxChars),
  author: z.enum(START_PATH_AUTHORS),
  viewpoints: z.array(AnswerBranchViewpointSchema).max(B.viewpointsMax),
  state: z.enum(BRANCH_STATES),
  root_node_id: z.string().min(1).max(B.nodeRefMaxChars).nullable(),
  outcome: PathOutcomeSchema.nullable()
}).strict().superRefine((branch, context) => {
  if (branch.state === "LOOKING") {
    if (branch.outcome !== null) context.addIssue({ code: "custom", path: ["outcome"], message: "a path still being looked into has no outcome" });
    return;
  }
  const failed = branch.outcome?.state === "FAILED";
  if (branch.outcome === null || failed !== (branch.state === "FAILED")) {
    context.addIssue({ code: "custom", path: ["state"], message: "a path's state follows its outcome" });
  }
});
export type AnswerBranch = z.infer<typeof AnswerBranchSchema>;

/** A "+ N more to explore" item (startMoreOf's shape). */
export const AnswerBranchMoreSchema = z.object({
  more_id: z.string().regex(MORE_ID_PATTERN),
  title: words(B.moreTitleMaxChars),
  question: words(B.moreQuestionMaxChars),
  is_new: z.boolean()
}).strict();
export type AnswerBranchMore = z.infer<typeof AnswerBranchMoreSchema>;

export const AnswerBranchesSchema = z.object({
  source: z.enum(START_PATHS_SOURCES),
  width: z.number().int().min(1).max(B.pathsMax),
  paths: z.array(AnswerBranchSchema).min(1).max(B.pathsMax),
  more: z.array(AnswerBranchMoreSchema).max(B.moreMax),
  also_raised: z.array(words(B.alsoRaisedMaxChars)).max(B.alsoRaisedMax),
  main_trust: TrustWordSchema.nullable(),
  carry_on_to_report: z.boolean()
}).strict().superRefine((branches, context) => {
  if (!branches.paths.every((branch, index) => branch.path_id === pathIdOf(index + 1) && branch.order === index + 1)) {
    context.addIssue({ code: "custom", path: ["paths"], message: "paths are numbered b1..bN in their order" });
  }
  const more = branches.more.map((item) => item.more_id);
  if (new Set(more).size !== more.length) context.addIssue({ code: "custom", path: ["more"], message: "each more item is listed once" });
});
export type AnswerBranches = z.infer<typeof AnswerBranchesSchema>;

/** What a reader of a public debate sees of its paths. */
export const PublicBranchesSchema = z.object({
  source: z.enum(START_PATHS_SOURCES),
  width: z.number().int().min(1).max(B.pathsMax),
  paths: z.array(z.object({
    path_id: PathIdSchema,
    order: z.number().int().min(1).max(B.pathsMax),
    title: words(B.titleMaxChars),
    question: words(B.questionMaxChars),
    author: z.enum(START_PATH_AUTHORS),
    viewpoints: z.array(AnswerBranchViewpointSchema).max(B.viewpointsMax),
    state: z.enum(BRANCH_STATES),
    outcome: z.object({
      state: z.enum(PATH_OUTCOME_STATES),
      text: PathTextSchema.nullable(),
      what_changed: z.array(z.string().trim().min(1)).max(3),
      trust: TrustWordSchema.nullable()
    }).strict().nullable()
  }).strict()).min(1).max(B.pathsMax),
  also_raised: z.array(words(B.alsoRaisedMaxChars)).max(B.alsoRaisedMax),
  main_trust: TrustWordSchema.nullable()
}).strict();
export type PublicBranches = z.infer<typeof PublicBranchesSchema>;

/** The public snapshot's paths: never the "more" list, the point-of-view line, the carry-on box, the evidence or the root id. */
export function publicBranchesOf(branches: AnswerBranches): PublicBranches {
  return Object.freeze({
    source: branches.source,
    width: branches.width,
    paths: branches.paths.map((branch) => Object.freeze({
      path_id: branch.path_id,
      order: branch.order,
      title: branch.title,
      question: branch.question,
      author: branch.author,
      viewpoints: branch.viewpoints.map((viewpoint) => Object.freeze({ title: viewpoint.title, question: viewpoint.question, own: viewpoint.own })),
      state: branch.state,
      outcome: branch.outcome === null ? null : Object.freeze({ state: branch.outcome.state, text: branch.outcome.text,
        what_changed: [...branch.outcome.what_changed], trust: branch.outcome.trust })
    })),
    also_raised: [...branches.also_raised],
    main_trust: branches.main_trust
  });
}
