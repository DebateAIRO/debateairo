import { z } from "zod";
import { WEB_CONTRACT_LIMITS } from "./web.js";

/**
 * THE FINAL REPORT OVER AN INVESTIGATION (plan 2026-10-30 task W5-1; design W0-1 with the owner's answers F1-F14, the
 * dig-model revision's section 4 and draft 5.6, approved; the money rule of 31 Oct). "Write my report" closes the
 * investigation (a debate and all its digs), numbers its next report version, and the runner writes over the whole of
 * it: the answer (Claude Haiku), its check (GLM), the story in the investigation's sections (Haiku), its check (GLM).
 * The PDF is made from a stored version by code. Reopening and closing again writes a new version; every earlier one
 * stays readable, and the newest finished one is current (owner Q5). The current version's answer is what the map's top
 * shows (owner Q-D11), with the first debate's answer one click away.
 *
 * What these shapes hold, and what they never do:
 *  - the report's own texts (its answer's segments, its story's parts) and the sources it rests on, each with the quote
 *    people see (at most 120 characters, cut at a word edge) and reader 1's line about the page (owner F9);
 *  - never an engine number, a score, a lineage, a round count or a failure code;
 *  - a version still being written may be waiting for the digs still running and their rewrites (owner F7 A): the page
 *    then says so (`waiting_for_digs`, how many);
 *  - a shortened dossier is disclosed with the approved line (owner F13), `shortened: true`.
 *
 * It imports only zod and the zod-only modules beside it (never ./index.js), for the module-cycle reason web.ts gives.
 */
export const INVESTIGATION_REPORT_LIMITS = Object.freeze({
  /** R4's answer form: at most two segments (the answer, then what evidence would decide it). */
  answerSegmentsMax: 2,
  /** Runaway guards (about 5-10 times what the AIs are asked for), as STORY_RUNAWAY_LIMITS are. */
  segmentMaxChars: 12_000,
  partMaxChars: 8_000,
  stillOpenMax: 12,
  sourcesMax: 200,
  versionsMax: WEB_CONTRACT_LIMITS.reportVersionsMax,
  digsMax: WEB_CONTRACT_LIMITS.investigationDigsMax
});

const Part = z.string().trim().min(1).max(INVESTIGATION_REPORT_LIMITS.partMaxChars);

/** The report's answer over the whole investigation: one or two plain segments (R4's form, never a heading or a label). */
export const InvestigationReportAnswerSchema = z.object({
  segments: z.array(z.string().trim().min(1).max(INVESTIGATION_REPORT_LIMITS.segmentMaxChars))
    .min(1).max(INVESTIGATION_REPORT_LIMITS.answerSegmentsMax)
}).strict();
export type InvestigationReportAnswer = z.infer<typeof InvestigationReportAnswerSchema>;

/**
 * The report's story in the investigation's sections (W0-1 §2.6, approved): "The answer" (`short_answer`), "What would
 * change it", "How the investigation went" (one paragraph per follow-up debate that mattered, in map order, each naming
 * its dig), "What is still open". "Sources" is the version's `sources`, listed by code.
 */
export const InvestigationReportStorySchema = z.object({
  short_answer: Part,
  what_would_change: Part,
  how_it_went: z.array(z.object({ dig_run_id: z.uuid(), paragraph: Part }).strict()).max(INVESTIGATION_REPORT_LIMITS.digsMax),
  still_open: z.array(Part).max(INVESTIGATION_REPORT_LIMITS.stillOpenMax)
}).strict().superRefine((story, context) => {
  if (new Set(story.how_it_went.map((entry) => entry.dig_run_id.toLowerCase())).size !== story.how_it_went.length) {
    context.addIssue({ code: "custom", message: "each dig has at most one paragraph" });
  }
});
export type InvestigationReportStory = z.infer<typeof InvestigationReportStorySchema>;

/** One source the report rests on: the page, the quote people see (at most 120 characters) and reader 1's line. */
export const InvestigationReportSourceSchema = z.object({
  site: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.siteMaxChars),
  title: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.titleMaxChars).nullable(),
  quote: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.quoteMaxChars),
  line: z.string().trim().min(1).max(WEB_CONTRACT_LIMITS.explanationMaxChars).nullable()
}).strict();
export type InvestigationReportSource = z.infer<typeof InvestigationReportSourceSchema>;

const VersionBase = {
  report_version: z.number().int().positive(),
  closed_at: z.iso.datetime()
};

/** A finished version: the answer, the story (null: it could not be written, the page shows the N14 line), the sources. */
function finishedVersion<S extends "READY" | "READY_WITH_RESERVATION">(state: S) {
  return z.object({
    ...VersionBase,
    state: z.literal(state),
    written_at: z.iso.datetime(),
    answer: InvestigationReportAnswerSchema,
    story: InvestigationReportStorySchema.nullable(),
    sources: z.array(InvestigationReportSourceSchema).max(INVESTIGATION_REPORT_LIMITS.sourcesMax),
    /** The dossier was shortened (ladder steps 2-5): the approved F13 line is shown. */
    shortened: z.boolean()
  }).strict();
}

/**
 * One report version. WRITING: the runner is writing it, or waiting for `waiting_for_digs` digs still running (or still
 * rewriting their paths) before it starts (F7 A). FAILED: no answer could be written; the person may write it again
 * (a new version). READY / READY_WITH_RESERVATION: written and checked (the last round may leave a reservation).
 */
export const InvestigationReportVersionSchema = z.discriminatedUnion("state", [
  z.object({ ...VersionBase, state: z.literal("WRITING"), waiting_for_digs: z.number().int().min(0).max(INVESTIGATION_REPORT_LIMITS.digsMax) }).strict(),
  z.object({ ...VersionBase, state: z.literal("FAILED"), written_at: z.iso.datetime() }).strict(),
  finishedVersion("READY"),
  finishedVersion("READY_WITH_RESERVATION")
]);
export type InvestigationReportVersion = z.infer<typeof InvestigationReportVersionSchema>;

/**
 * GET /v1/runs/{id}/investigation: the investigation the debate is in, its versions oldest first (1, 2, 3…; only the
 * newest may still be WRITING), and `current`, the newest finished version's number (null before any). A debate in no
 * investigation answers OPEN with no versions and no id.
 */
export const InvestigationReportsSchema = z.object({
  investigation_id: z.uuid().nullable(),
  root_run_id: z.uuid(),
  state: z.enum(["OPEN", "CLOSED"]),
  digs: z.number().int().min(0).max(INVESTIGATION_REPORT_LIMITS.digsMax),
  versions: z.array(InvestigationReportVersionSchema).max(INVESTIGATION_REPORT_LIMITS.versionsMax),
  current: z.number().int().positive().nullable()
}).strict().superRefine((read, context) => {
  if (read.versions.some((version, at) => version.report_version !== at + 1)) {
    context.addIssue({ code: "custom", message: "report versions are 1, 2, 3… in order" });
  }
  if (read.versions.slice(0, -1).some((version) => version.state === "WRITING")) {
    context.addIssue({ code: "custom", message: "only the newest version may still be writing" });
  }
  const finished = read.versions.filter((version) => version.state === "READY" || version.state === "READY_WITH_RESERVATION");
  if (read.current !== (finished.at(-1)?.report_version ?? null)) {
    context.addIssue({ code: "custom", message: "the current version is the newest finished one" });
  }
  if (read.investigation_id === null && (read.versions.length > 0 || read.state !== "OPEN")) {
    context.addIssue({ code: "custom", message: "a debate in no investigation has no versions and is open" });
  }
});
export type InvestigationReports = z.infer<typeof InvestigationReportsSchema>;

/** 202 of "Write my report" (POST /v1/runs/{id}/report, body InvestigationCloseRequestSchema): the version now writing. */
export const InvestigationReportAcceptedSchema = z.object({
  state: z.literal("WRITING"),
  report_version: z.number().int().positive(),
  waiting_for_digs: z.number().int().min(0).max(INVESTIGATION_REPORT_LIMITS.digsMax)
}).strict();
export type InvestigationReportAccepted = z.infer<typeof InvestigationReportAcceptedSchema>;

/** POST /v1/runs/{id}/reopen: nothing but the request. A dig on a closed investigation reopens it too (owner Q2, Q5). */
export const InvestigationReopenRequestSchema = z.object({}).strict();
export const InvestigationReopenedSchema = z.object({ state: z.literal("OPEN") }).strict();
export type InvestigationReopened = z.infer<typeof InvestigationReopenedSchema>;

/** 409 of a reopen (or another "Write my report") while the newest version is still being written: nothing changed. */
export const INVESTIGATION_REPORT_WRITING = "INVESTIGATION_REPORT_WRITING" as const;
export const InvestigationReportWritingSchema = z.object({
  error: z.literal(INVESTIGATION_REPORT_WRITING),
  message: z.literal(INVESTIGATION_REPORT_WRITING),
  report_version: z.number().int().positive()
}).strict();
export type InvestigationReportWriting = z.infer<typeof InvestigationReportWritingSchema>;
