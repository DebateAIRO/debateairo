/*
 * DRAFT (owner's screen review, 3 Nov 2026: dig-d1 B "Findings arrive one by one", journey-f3, wait-d2 A): what a running dig
 * reports of itself, so the click-through can see the running dig's panel with its steps and its checked findings. The real
 * API has no such read yet (plan C13a: API and serve work); the website reads it from GET /v1/runs/{id}/progress and shows
 * the one calm line while that read answers 404, as today's API does. The mock serves it only with the switch live=ON
 * (MOCK_LIVE=ON at start); with live=OFF it answers 404 like today's API.
 *
 * The shape is the one the website reads (apps/ui/lib/v4/digProgress.ts) and the track report gives the server:
 *   { run_ref, steps, now, findings: [{ finding_id, text, trust, passed_at }] }
 * Here the steps move on at fixed shares of the dig's run time, and the findings pass their checks one by one while it
 * reads and checks. With a web search (paid): Finding sources › Reading › Checking › Writing what changed. Without one
 * (Free, or a search that failed): Arguing for and against › Checking › Writing what changed. Free never says "Sure".
 * Nothing unchecked is ever listed, and "Didn't hold" never is (it exists only after the path rewrite at the end).
 * Every text here is MADE UP.
 */
import { z } from "zod";
import { TrustWordSchema } from "../../packages/contract/src/web.js";

export const LIVE_MODES = ["OFF", "ON"] as const;
export type LiveMode = (typeof LIVE_MODES)[number];

export const LIVE_STEPS = ["FINDING_SOURCES", "READING", "ARGUING", "CHECKING", "WRITING"] as const;
export type LiveStep = (typeof LIVE_STEPS)[number];
export const LIVE_STEPS_WEB: readonly LiveStep[] = Object.freeze(["FINDING_SOURCES", "READING", "CHECKING", "WRITING"]);
export const LIVE_STEPS_NO_WEB: readonly LiveStep[] = Object.freeze(["ARGUING", "CHECKING", "WRITING"]);

/** The draft shape of the progress read (strict: the mock checks every body against it before it is sent). */
const LiveTrustSchema = TrustWordSchema.exclude(["DIDNT_HOLD"]);
export const DraftDigProgressSchema = z.object({
  run_ref: z.uuid(),
  steps: z.array(z.enum(LIVE_STEPS)).min(1).max(LIVE_STEPS.length),
  now: z.enum(LIVE_STEPS).nullable(),
  findings: z.array(z.object({
    finding_id: z.string().trim().min(1).max(160),
    text: z.string().trim().min(1).max(600),
    trust: LiveTrustSchema,
    passed_at: z.iso.datetime()
  }).strict()).max(40)
}).strict().superRefine((body, context) => {
  if (new Set(body.steps).size !== body.steps.length) context.addIssue({ code: "custom", message: "each step is listed once" });
  const order = body.steps.map((step) => LIVE_STEPS.indexOf(step));
  if (order.some((at, index) => index > 0 && at <= order[index - 1]!)) context.addIssue({ code: "custom", message: "steps go in their order" });
  if (body.now !== null && !body.steps.includes(body.now)) context.addIssue({ code: "custom", message: "now is one of the steps" });
  if (new Set(body.findings.map((finding) => finding.finding_id)).size !== body.findings.length) {
    context.addIssue({ code: "custom", message: "each finding is listed once" });
  }
  if (body.findings.some((finding, index) => index > 0 && Date.parse(finding.passed_at) < Date.parse(body.findings[index - 1]!.passed_at))) {
    context.addIssue({ code: "custom", message: "findings go in the order they passed" });
  }
});
export type DraftDigProgress = z.infer<typeof DraftDigProgressSchema>;

type LiveTrust = z.infer<typeof LiveTrustSchema>;
type FindingSeed = Readonly<{ id: string; text: string; trust: LiveTrust; freeTrust: Exclude<LiveTrust, "SURE"> }>;

/** The made-up findings every running dig reports, in the order they pass (each dig shows the same few). */
const FINDINGS: readonly FindingSeed[] = Object.freeze([
  { id: "live-pumped-days", text: "Pumped-storage plants in Europe cover days, not weeks, of low wind.", trust: "SURE", freeTrust: "SURE_FOR_CASE" },
  { id: "live-lines-share", text: "Long power lines let one region lend another its spare wind on most winter days.", trust: "SURE_FOR_CASE", freeTrust: "SURE_FOR_CASE" },
  { id: "live-battery-cost", text: "Whether batteries for a two-week lull are affordable by 2035 is still argued.", trust: "STILL_ARGUED", freeTrust: "STILL_ARGUED" }
]);

/** Where each step begins, as a share of the dig's run time (the last one runs until it settles). */
const STEP_STARTS_WEB = Object.freeze([0, 0.2, 0.45, 0.85]);
const STEP_STARTS_NO_WEB = Object.freeze([0, 0.4, 0.85]);
/** When each finding passes its checks, as a share of the run time (during reading and checking). */
const FINDING_SHARES = Object.freeze([0.35, 0.55, 0.75]);

export type LiveRunInput = Readonly<{
  runRef: string;
  /** When the dig started running (ms); its run time ends at `settleAt`. */
  startedAt: number;
  settleAt: number;
  /** True: it searches the web (a paid dig whose search works); false: Free, or a failed search. */
  web: boolean;
  /** Free never says "Sure". */
  free: boolean;
  /** True while it still waits to start (nothing has begun). */
  waiting: boolean;
}>;

const iso = (ms: number): string => new Date(ms).toISOString();

/** The progress read of one dig at `now` (a dig that has settled reports its last step and every finding). */
export function digProgressAt(run: LiveRunInput, now: number): DraftDigProgress {
  const steps = run.web ? LIVE_STEPS_WEB : LIVE_STEPS_NO_WEB;
  if (run.waiting) return { run_ref: run.runRef, steps: [...steps], now: null, findings: [] };
  const span = Math.max(1, run.settleAt - run.startedAt);
  const share = Math.min(1, Math.max(0, (now - run.startedAt) / span));
  const starts = run.web ? STEP_STARTS_WEB : STEP_STARTS_NO_WEB;
  let at = 0;
  starts.forEach((start, index) => {
    if (share >= start) at = index;
  });
  const findings = FINDINGS.flatMap((finding, index) => {
    const passedAt = run.startedAt + Math.round(FINDING_SHARES[index]! * span);
    if (passedAt > now) return [];
    return [{ finding_id: finding.id, text: finding.text, trust: run.free ? finding.freeTrust : finding.trust, passed_at: iso(passedAt) }];
  });
  return { run_ref: run.runRef, steps: [...steps], now: steps[at]!, findings };
}
