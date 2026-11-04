import { z } from "zod";
import { PathIdSchema } from "./start-paths.js";
import { TrustWordSchema } from "./web.js";

/**
 * V4 start step, Task 57a (spec 2026-11-03 §2 items 7 and 8; items wait-d1, journey-f1, wait-f16): what the run read says about each
 * path while a path debate runs, and which part of the carry-on is running. A path being looked into shows one plain step line and
 * at most 6 quiet dots, one per point put forward (no for or against, nothing unchecked to read); once its own checks are done it
 * shows its findings instead, each point as the answer serves it. The carry-on part names the part running for a debate whose box
 * "Let the AIs carry on to the report" is ticked. The server sends both, so the page draws the same after a reload and on another
 * device. RunProjectionSchema and AnswerSchema carry them, optional and last; an R22 run read or answer has neither.
 */
export const RUN_PATH_LIMITS = Object.freeze({ pointsShownMax: 6, findingsMax: 40, nodeRefMaxChars: 160 });
/** A path's step line: finding sources (web search), arguing for and against, checking each point. */
export const RUN_PATH_STEPS = Object.freeze(["FINDING_SOURCES", "ARGUING", "CHECKING"] as const);
export type RunPathStep = typeof RUN_PATH_STEPS[number];
/** One dot: a point put forward, being checked (its ring closes), checked (ink). */
export const RUN_PATH_POINT_STATES = Object.freeze(["PUT_FORWARD", "BEING_CHECKED", "CHECKED"] as const);
export type RunPathPointState = typeof RUN_PATH_POINT_STATES[number];
/** The carry-on line's parts, in their order: "Your answer · then a dig on each path · then your report". */
export const CARRY_ON_PARTS = Object.freeze(["ANSWER", "DIGS", "REPORT"] as const);
export type CarryOnPart = typeof CARRY_ON_PARTS[number];

const R = RUN_PATH_LIMITS;

/** One checked point of a path: its node, its words as the answer serves them (NodeSchema.claim) and its trust word. */
export const RunPathFindingSchema = z.object({
  node_ref: z.string().min(1).max(R.nodeRefMaxChars),
  text: z.string().min(1),
  trust: TrustWordSchema
}).strict();
export type RunPathFinding = z.infer<typeof RunPathFindingSchema>;

/** One path's progress: its step (null once its own checks are done), its dots while it works, then its findings. */
export const RunPathProgressSchema = z.object({
  path_id: PathIdSchema,
  step: z.enum(RUN_PATH_STEPS).nullable(),
  points: z.array(z.enum(RUN_PATH_POINT_STATES)).max(R.pointsShownMax),
  findings: z.array(RunPathFindingSchema).max(R.findingsMax)
}).strict().superRefine((progress, context) => {
  if (progress.step !== null && progress.findings.length > 0) {
    context.addIssue({ code: "custom", path: ["findings"], message: "a path still at work shows no findings" });
  }
  if (progress.points.length > 0 && progress.findings.length > 0) {
    context.addIssue({ code: "custom", path: ["points"], message: "a path shows its findings or its points, never both" });
  }
});
export type RunPathProgress = z.infer<typeof RunPathProgressSchema>;
