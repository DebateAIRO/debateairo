/*
 * Owner's screen review, 3 Nov 2026 (dig-d1 B "Findings arrive one by one", with journey-f3 and wait-d2 A): while a dig
 * runs, its panel shows the steps the server REALLY reports ("Finding sources › Reading › Checking › Writing what
 * changed"; with no web search "Arguing for and against › Checking › Writing what changed"), and each finding the moment
 * it passes its checks, with its trust word. Nothing unchecked is ever shown, not even greyed out; the page never guesses
 * a step (journey-f3): with no progress read it shows the one calm line of the waiting card (lib/v4/stateWords.ts).
 *
 * The server does not report this yet (plan C13a: API and serve work). The page reads it from an OPTIONAL read of its own,
 * GET /v1/runs/{run_id}/progress, because the run read (RunProjection) is strict: a new field there would make today's
 * page refuse the whole read. Today that route answers 404, which means "no progress here": the page stops asking for that
 * dig until its state changes. The stand-in API (tools/v4-mock-api, switch live=ON) serves it, so the click-through sees it.
 *
 * The shape (the server note in the track report says the same):
 *   { run_ref, steps: DigStep[] (the steps THIS run goes through, in order), now: DigStep | null (the one working now; null
 *     before the first has begun; it stays on the last once that is done, as the dig's own read then says it finished),
 *     findings: [{ finding_id, text, trust, passed_at }] (only points that passed
 *     their checks, in the order they passed; trust is Sure, Sure for the case named or Still argued: "Didn't hold" exists
 *     only after the path rewrite at the end) }.
 * The reader is forgiving where it may be: a finding it cannot read is left out, keys it does not know are ignored. A read
 * whose steps make no sense is no progress at all, so the calm line shows rather than a guessed step.
 * Nothing here is kept in the browser.
 */

/** Every step a dig can report, in the only order they can come (a dig's steps are a part of this list, in this order). */
export const DIG_STEPS = ["FINDING_SOURCES", "READING", "ARGUING", "CHECKING", "WRITING"] as const;
export type DigStep = (typeof DIG_STEPS)[number];

/** The trust words a finding may carry while the dig runs (never "Didn't hold": that exists only after the rewrite). */
export const LIVE_TRUST_WORDS = ["SURE", "SURE_FOR_CASE", "STILL_ARGUED"] as const;
export type LiveTrustWord = (typeof LIVE_TRUST_WORDS)[number];

export type DigFinding = Readonly<{
  /** The point's id on the dig's own debate (stable, so a finding already shown is never shown twice). */
  id: string;
  /** The point in the AIs' words (AI text). */
  text: string;
  trust: LiveTrustWord;
}>;

export type DigProgress = Readonly<{
  /** The steps this dig goes through, in order (empty: the server names none yet). */
  steps: readonly DigStep[];
  /** The step working now, one of `steps` (the steps before it are done); null before the first has begun. */
  now: DigStep | null;
  /** The findings that passed their checks, oldest first. */
  findings: readonly DigFinding[];
}>;

/** What one read of a dig's progress gave: something to show, or no progress here (stop asking until its state changes). */
export type DigProgressRead = Readonly<{ kind: "SHOWN"; progress: DigProgress }> | Readonly<{ kind: "ABSENT" }>;

export const DIG_PROGRESS_ABSENT: DigProgressRead = Object.freeze({ kind: "ABSENT" });

/** The most the page reads of one progress read (the server note asks for at most 40 findings). */
export const DIG_PROGRESS_LIMITS = Object.freeze({ findingsMax: 64, textMax: 2_000, idMax: 160 });

/** The read's path on the API (the website's /api proxy forwards it as it forwards every /v1 read). */
export function digProgressPath(runId: string): string {
  return `/v1/runs/${encodeURIComponent(runId)}/progress`;
}

type Loose = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStep(value: unknown): value is DigStep {
  return typeof value === "string" && (DIG_STEPS as readonly string[]).includes(value);
}

function isLiveTrust(value: unknown): value is LiveTrustWord {
  return typeof value === "string" && (LIVE_TRUST_WORDS as readonly string[]).includes(value);
}

/** The steps as listed, or null when they make no sense (unknown, twice, out of order, or too many). */
function stepsOf(value: unknown): readonly DigStep[] | null {
  if (!Array.isArray(value) || value.length > DIG_STEPS.length || !value.every(isStep)) return null;
  const order = value.map((step) => DIG_STEPS.indexOf(step));
  if (order.some((at, index) => index > 0 && at <= order[index - 1]!)) return null;
  return Object.freeze([...value]);
}

function findingOf(value: unknown): DigFinding | null {
  if (!isObject(value)) return null;
  const id = typeof value.finding_id === "string" ? value.finding_id.trim() : "";
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (id.length === 0 || id.length > DIG_PROGRESS_LIMITS.idMax) return null;
  if (text.length === 0 || text.length > DIG_PROGRESS_LIMITS.textMax) return null;
  if (!isLiveTrust(value.trust)) return null;
  return Object.freeze({ id, text, trust: value.trust });
}

/**
 * A progress read's body as the page shows it, or null when it is not this run's or its steps make no sense. Findings it
 * cannot read are left out (and a finding named twice is shown once), so one bad finding never hides the others.
 */
export function parseDigProgress(body: unknown, runId: string): DigProgress | null {
  if (!isObject(body)) return null;
  if (typeof body.run_ref !== "string" || body.run_ref.toLowerCase() !== runId.toLowerCase()) return null;
  const steps = stepsOf(body.steps);
  if (steps === null) return null;
  const now = body.now === null || body.now === undefined ? null : isStep(body.now) && steps.includes(body.now) ? body.now : undefined;
  if (now === undefined) return null;
  const listed = Array.isArray(body.findings) ? body.findings.slice(0, DIG_PROGRESS_LIMITS.findingsMax) : [];
  const seen = new Set<string>();
  const findings: DigFinding[] = [];
  for (const entry of listed) {
    const finding = findingOf(entry);
    if (finding === null || seen.has(finding.id)) continue;
    seen.add(finding.id);
    findings.push(finding);
  }
  return Object.freeze({ steps, now, findings: Object.freeze(findings) });
}

/** Where each step stands for the list of steps: done (before `now`), now, or still to come. */
export type StepState = "DONE" | "NOW" | "NEXT";

export function stepStates(progress: Pick<DigProgress, "steps" | "now">): readonly Readonly<{ step: DigStep; state: StepState }>[] {
  const at = progress.now === null ? -1 : progress.steps.indexOf(progress.now);
  return progress.steps.map((step, index) => ({ step, state: at === -1 ? "NEXT" : index < at ? "DONE" : index === at ? "NOW" : "NEXT" }));
}
