/*
 * The owner's answers of 5 Nov 2026 (OPEN-OWNER-QUESTIONS-2026-11-04.md), for the click-test; every text here is MADE UP.
 *
 * Question 3 A: a dig that did not finish says why, about the dig, one line for each of the seven reason groups of
 * apps/ui/lib/v3/runFailure.ts. So that every line can be read in place, one debate (FAILED_DIGS_PARENT) carries seven
 * digs that did not finish, one per reason group, each with a code of that group and what its draft view says it took
 * from the quota (`quota_used`, NOT in the contract yet: the website says it once the contract carries it).
 *
 * Question 20 A: a failed question that used some of the quota (RUN_FAILED_SOME, draft view `quota_used: "SOME"`), beside
 * the seeded failed question that took nothing (4444, `quota_used: "NONE"`), so both of its lines have a case.
 */

/** The seven reason groups of apps/ui/lib/v3/runFailure.ts (RUN_FAILURE_KINDS), as this seed names them. */
export type FailedDigKind =
  | "NOT_STARTED" | "PLAN_ENDED" | "MODELS_UNAVAILABLE" | "RUN_LIMIT_REACHED" | "SET_ASIDE" | "STOPPED" | "CHOICE_GONE";

export type FailedDigSeed = Readonly<{
  kind: FailedDigKind;
  runRef: string;
  seq: number;
  /** A stored code of that group (the page shows only the dig's plain line for it, never the code). */
  reason: string;
  /** What the draft view says the dig took from the quota. */
  quotaUsed: "NONE" | "SOME";
  /** Where on its parent's map it was dug (its dig link's places). */
  place: string;
  mode: "quick" | "thorough";
  question: string;
  askedAt: string;
}>;

/** The debate the seven failed digs were dug from: a finished debate (the mock's one English answer, its own question line). */
export const FAILED_DIGS_PARENT = Object.freeze({
  runRef: "f0000000-0000-4000-8000-000000000000",
  answerId: "aaaaf000-0000-4000-8000-000000000000",
  seq: 16,
  question: "Should my country build new nuclear power, or put the money into renewables and storage? (seven digs that did not finish)",
  askedAt: "2026-11-01T09:00:00.000Z",
  settledAt: "2026-11-01T09:25:00.000Z"
});

/**
 * One failed dig per reason group. Only a dig that ran partway (STOPPED) took some of the quota; the others never began,
 * or were waived (SET_ASIDE, CHOICE_GONE: their own line already says they did not use the quota).
 */
export const FAILED_DIGS: readonly FailedDigSeed[] = Object.freeze([
  {
    kind: "STOPPED", runRef: "f1000000-0000-4000-8000-000000000001", seq: 17, reason: "RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED",
    quotaUsed: "SOME", place: "path:n-mix", mode: "quick", question: "Can batteries carry a windless week at a cost most countries can bear?",
    askedAt: "2026-11-01T10:00:00.000Z"
  },
  {
    kind: "NOT_STARTED", runRef: "f1000000-0000-4000-8000-000000000002", seq: 18, reason: "RUN_ROLE_ASSIGNMENT_INVALID",
    quotaUsed: "NONE", place: "path:n-mix", mode: "quick", question: "Is gas a cheaper winter back-up than new nuclear?",
    askedAt: "2026-11-01T10:05:00.000Z"
  },
  {
    kind: "MODELS_UNAVAILABLE", runRef: "f1000000-0000-4000-8000-000000000003", seq: 19, reason: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM",
    quotaUsed: "NONE", place: "path:n-renew", mode: "thorough", question: "How fast can power lines between countries be built?",
    askedAt: "2026-11-01T10:10:00.000Z"
  },
  {
    kind: "RUN_LIMIT_REACHED", runRef: "f1000000-0000-4000-8000-000000000004", seq: 20, reason: "RUN_CEILING_BELOW_FIRST_CALL",
    quotaUsed: "NONE", place: "path:n-renew", mode: "quick", question: "Do wind farms at sea last as long as their makers say?",
    askedAt: "2026-11-01T10:15:00.000Z"
  },
  {
    kind: "PLAN_ENDED", runRef: "f1000000-0000-4000-8000-000000000005", seq: 21, reason: "RUN_SETUP_FAILED:PLAN_CHANGED",
    quotaUsed: "NONE", place: "path:n-nuclear", mode: "thorough", question: "What did the last three reactors in Europe cost per year of power?",
    askedAt: "2026-11-01T10:20:00.000Z"
  },
  {
    kind: "SET_ASIDE", runRef: "f1000000-0000-4000-8000-000000000006", seq: 22, reason: "RUN_SET_ASIDE:BACKSTOP",
    quotaUsed: "NONE", place: "path:n-smr", mode: "quick", question: "When could the first small reactor run in a country like mine?",
    askedAt: "2026-11-01T10:25:00.000Z"
  },
  {
    kind: "CHOICE_GONE", runRef: "f1000000-0000-4000-8000-000000000007", seq: 23, reason: "RUN_SETUP_FAILED:CHOICE_UNAVAILABLE",
    quotaUsed: "NONE", place: "path:n-smr", mode: "quick", question: "Who pays to store the waste of a small reactor?",
    askedAt: "2026-11-01T10:30:00.000Z"
  }
]);

/** Question 20 A: a failed question whose part that ran used some of the quota (it stopped partway). */
export const RUN_FAILED_SOME = Object.freeze({
  runRef: "45000000-0000-4000-8000-000000000045",
  seq: 24,
  reason: "RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED",
  quotaUsed: "SOME" as const,
  question: "Should my city make its buses free for everyone, or only for people on low incomes?"
});
