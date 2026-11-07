/*
 * The owner's answers of 5 Nov 2026 (OPEN-OWNER-QUESTIONS-2026-11-04.md), for the click-test; every text here is MADE UP.
 *
 * Question 3 A: a dig that did not finish says why, about the dig, one line for each of the seven reason groups of
 * apps/ui/lib/v3/runFailure.ts. So that every line can be read in place, one debate (FAILED_DIGS_PARENT) carries seven
 * digs that did not finish, one per reason group, each with a code of that group and what its draft view says it took
 * from the quota (`quota_used`, NOT in the contract yet: the website says it once the contract carries it).
 * The wave-4 browser check (5 Nov): each dig digs a place of its own (one of the four paths, or one open question), and
 * is asked exactly as the website asks such a dig (lib/v4/askText.ts digQuestion; the stand-in test holds them to it), so
 * the map reads seven different digs, each panel offers "Try this dig again", and no pair reads as one dig that failed
 * twice ("This keeps failing" is seen with dig=FAIL, by failing a dig again).
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
  /** Where on its parent's map it was dug (its dig link's one place): a whole path, or one open question. */
  place: string;
  mode: "quick" | "thorough";
  question: string;
  askedAt: string;
}>;

const PARENT_QUESTION = "Should my country build new nuclear power, or put the money into renewables and storage? (seven digs that did not finish)";

/** The debate the seven failed digs were dug from: a finished debate (the mock's one English answer, its own question line). */
export const FAILED_DIGS_PARENT = Object.freeze({
  runRef: "f0000000-0000-4000-8000-000000000000",
  answerId: "aaaaf000-0000-4000-8000-000000000000",
  seq: 16,
  question: PARENT_QUESTION,
  askedAt: "2026-11-01T09:00:00.000Z",
  settledAt: "2026-11-01T09:25:00.000Z"
});

/**
 * A dig's question as the website writes it on an English page (apps/ui/messages/en/v4.json v4.digText.*): what it digs,
 * a blank line, then the earlier question. The items are the seeded answer's own path lines and open questions (seed.ts).
 */
const asDig = (item: string): string => `${item}\n\nThis follows from an earlier question: “${PARENT_QUESTION}”`;
const PATH_LINES = Object.freeze({
  mix: "Mostly renewables, plus some nuclear: held up. The cheapest clean grids pair a lot of wind and sun with a smaller share of firm power, and nuclear is one of the few firm sources without emissions.",
  renew: "Only renewables and storage: partly held. It is the cheapest and fastest way to add clean power, but the claim that batteries can already cover lulls of several days was disputed.",
  nuclear: "Nuclear first: did not hold. Recent reactors in Europe and the US took 12 to 17 years and two to three times their budgets, so betting mainly on nuclear delays cutting emissions.",
  smr: "Wait for small modular reactors: set aside. None is running commercially in Europe or North America yet, so their cost could not be weighed."
});
const pathDig = (line: string): string => asDig(`Look deeper into this part of the answer: ${line}`);

/**
 * One failed dig per reason group. Only a dig that ran partway (STOPPED) took some of the quota; the others never began,
 * or were waived (SET_ASIDE, CHOICE_GONE: their own line already says they did not use the quota).
 */
export const FAILED_DIGS: readonly FailedDigSeed[] = Object.freeze([
  {
    kind: "STOPPED", runRef: "f1000000-0000-4000-8000-000000000001", seq: 17, reason: "RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED",
    quotaUsed: "SOME", place: "path:n-mix", mode: "quick", question: pathDig(PATH_LINES.mix),
    askedAt: "2026-11-01T10:00:00.000Z"
  },
  {
    kind: "NOT_STARTED", runRef: "f1000000-0000-4000-8000-000000000002", seq: 18, reason: "RUN_ROLE_ASSIGNMENT_INVALID",
    quotaUsed: "NONE", place: "path:n-renew", mode: "quick", question: pathDig(PATH_LINES.renew),
    askedAt: "2026-11-01T10:05:00.000Z"
  },
  {
    kind: "MODELS_UNAVAILABLE", runRef: "f1000000-0000-4000-8000-000000000003", seq: 19, reason: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM",
    quotaUsed: "NONE", place: "p:n-renew-storage", mode: "thorough",
    question: asDig("Does this hold up, and when? Batteries and long-distance power lines can already cover multi-day lulls in wind and sun at an acceptable cost."),
    askedAt: "2026-11-01T10:10:00.000Z"
  },
  {
    kind: "RUN_LIMIT_REACHED", runRef: "f1000000-0000-4000-8000-000000000004", seq: 20, reason: "RUN_CEILING_BELOW_FIRST_CALL",
    quotaUsed: "NONE", place: "o:0", mode: "quick",
    question: asDig("How strong is this objection, and does it change the answer? The cost comparison counts the price of producing electricity, but not all the extra grid lines and backup that a mostly renewable system needs."),
    askedAt: "2026-11-01T10:15:00.000Z"
  },
  {
    kind: "PLAN_ENDED", runRef: "f1000000-0000-4000-8000-000000000005", seq: 21, reason: "RUN_SETUP_FAILED:PLAN_CHANGED",
    quotaUsed: "NONE", place: "path:n-nuclear", mode: "thorough", question: pathDig(PATH_LINES.nuclear),
    askedAt: "2026-11-01T10:20:00.000Z"
  },
  {
    kind: "SET_ASIDE", runRef: "f1000000-0000-4000-8000-000000000006", seq: 22, reason: "RUN_SET_ASIDE:BACKSTOP",
    quotaUsed: "NONE", place: "path:n-smr", mode: "quick", question: pathDig(PATH_LINES.smr),
    askedAt: "2026-11-01T10:25:00.000Z"
  },
  {
    kind: "CHOICE_GONE", runRef: "f1000000-0000-4000-8000-000000000007", seq: 23, reason: "RUN_SETUP_FAILED:CHOICE_UNAVAILABLE",
    quotaUsed: "NONE", place: "w", mode: "quick",
    question: asDig("Would this change the answer? The answer would change if storing power for days or weeks became cheap enough to carry a grid through a windless winter week. Then renewables and storage alone would be enough, and new nuclear would not be needed."),
    askedAt: "2026-11-01T10:30:00.000Z"
  }
]);

/** Question 20 A: a failed question whose part that ran used some of the quota (it stopped partway). */
export const RUN_FAILED_SOME = Object.freeze({
  runRef: "45000000-0000-4000-8000-000000000045",
  seq: 24,
  reason: "RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED",
  quotaUsed: "SOME" as const,
  question: "Should my city make its buses free for everyone, or only for people on low incomes?",
  // V4 start step, Task 57e (the owner's 6 Nov rule: re-use what was already paid for): it kept its clarifying answers and the paths chosen
  // from the list, so its read says `reusable` ("What already ran is kept for your next try, ..."). The first failed question kept nothing.
  reusable: true as const
});
