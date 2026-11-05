import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import { digTargetQuestions } from "../../apps/ui/lib/v4/askText.js";
import { digRetryOf, rebuildDigTarget, retryPending, sameDig } from "../../apps/ui/lib/v4/digRetry.js";
import { rememberSentDig, sentDigOf } from "../../apps/ui/lib/v4/useSentDigs.js";
import {
  askAgainHref, askAgainQuestion, askAgainRunId, digFailureMessage, failedQuotaKey, quotaSomeUsed, quotaUntouched, reasonSaysNothingUsed,
  sayNothingTaken, saySomeUsed
} from "../../apps/ui/lib/v4/failedRun.js";
import { RUN_FAILURE_KINDS } from "../../apps/ui/lib/v3/runFailure.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import {
  digPauseCardLine, pauseOfDig, pauseOfRun, pausePhoneBar, pausedDigCount, pauseSentence
} from "../../apps/ui/lib/v4/monthPause.js";
import { openPick, ownViewPick, placesOf, suggestionPick } from "../../apps/ui/lib/v4/suggestions.js";
import type { DigLink, DigTarget, DigView } from "../../apps/ui/lib/v4/types.js";
import type { Answer, RunProjection } from "../../packages/contract/src/index.js";
import { createSeed } from "../../tools/v4-mock-api/seed.js";

/*
 * Owner review 3 Nov 2026 (OWNER-PICKS-2026-11-03.md): failure, retry and the month pause as pure rules.
 *  - wait-f11/map-f30: "Ask this again" names only the debate in the address; its words come back from the server;
 *    "nothing was taken" is said only when the server confirms it, and never twice;
 *  - wait-f18/dig-f12: a failed dig is tried again with the same picks and mode; a second failure says "keeps failing";
 *  - wait-f2/wait-f5/map-f31/public-f16: one pause, from the server's two facts (until, can continue).
 */

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const seed = createSeed(fixture);
const RUN = "11111111-1111-4111-8111-111111111111";
const answer = (): Answer => seed.answer({
  answerId: "aaaa1111-1111-4111-8111-111111111111", runRef: RUN,
  question: "Should countries build new nuclear power, or put the money into renewables and storage?",
  askedAt: "2026-10-27T15:12:00.000Z", servedAt: "2026-10-27T15:40:00.000Z", web: "PAID"
}) as Answer;
const map = buildV4Map({ runId: RUN, answer: answer(), story: seed.story("aaaa1111-1111-4111-8111-111111111111", "READY", "2026-10-27T15:41:00.000Z") });
const NEXT_MONTH = "2026-12-01T00:00:00.000Z";

function failedRun(extra: Record<string, unknown> = {}, reason = "RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED"): RunProjection {
  return { run_ref: RUN, question_line: "Will AI tutors replace homework help?", state: "FAILED", terminal_reason: reason, hold_until: null, ...extra } as RunProjection;
}

/** The link the page records for a dig of `target` (V4DebateClient's send). */
function linkOf(target: DigTarget, childRunId: string, mode: DigLink["mode"] = "thorough"): DigLink {
  return { parentRunId: RUN, childRunId, openQuestionIds: placesOf(target), questions: digTargetQuestions(target), mode, startedAt: null };
}

function view(link: DigLink, state: DigView["state"]): DigView {
  return { link, state, headline: null, counts: null };
}

describe("the failed page (wait-f11, map-f30)", () => {
  it("'nothing was taken' only when the server says quota_used NONE, and never on top of a sentence that says it", () => {
    expect(quotaUntouched(failedRun())).toBe(false);
    expect(quotaUntouched(failedRun({ quota_used: "SOME" }))).toBe(false);
    expect(quotaUntouched(failedRun({ quota_used: "NONE" }))).toBe(true);
    expect(quotaUntouched({ ...failedRun({ quota_used: "NONE" }), state: "RUNNING", terminal_reason: null })).toBe(false);
    // An upload set it aside, or a choice is gone: their own sentence already says it used none of the allowance.
    expect(reasonSaysNothingUsed("RUN_SET_ASIDE:BACKSTOP")).toBe(true);
    expect(reasonSaysNothingUsed("RUN_SETUP_FAILED:CHOICE_UNAVAILABLE")).toBe(true);
    expect(reasonSaysNothingUsed("RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM")).toBe(false);
    expect(sayNothingTaken("RUN_SET_ASIDE:BACKSTOP", true)).toBe(false);
    expect(sayNothingTaken("RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM", true)).toBe(true);
    expect(sayNothingTaken("RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM", false)).toBe(false);
  });

  it("question 20 A: a failed question says the server's NONE or SOME; a dig says only NONE; nothing without the field", () => {
    expect(quotaSomeUsed(failedRun({ quota_used: "SOME" }))).toBe(true);
    expect(quotaSomeUsed(failedRun({ quota_used: "NONE" }))).toBe(false);
    expect(quotaSomeUsed(failedRun())).toBe(false);
    expect(quotaSomeUsed({ ...failedRun({ quota_used: "SOME" }), state: "RUNNING", terminal_reason: null })).toBe(false);
    expect(saySomeUsed("RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED", true)).toBe(true);
    expect(saySomeUsed("RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED", false)).toBe(false);
    // A waived run never reads SOME; if it did, the page would not contradict the reason's own "did not use your quota".
    expect(saySomeUsed("RUN_SET_ASIDE:BACKSTOP", true)).toBe(false);
    // The question's lines.
    expect(failedQuotaKey(failedRun({ quota_used: "NONE" }), false)).toBe("v4.debate.failedNothingTaken");
    expect(failedQuotaKey(failedRun({ quota_used: "SOME" }), false)).toBe("v4.debate.failedSomeTaken");
    expect(failedQuotaKey(failedRun(), false)).toBeNull();
    expect(failedQuotaKey(failedRun({ quota_used: "NONE" }, "RUN_SETUP_FAILED:CHOICE_UNAVAILABLE"), false)).toBeNull();
    expect(failedQuotaKey(failedRun({ quota_used: "SOME" }, "RUN_SET_ASIDE:BACKSTOP"), false)).toBeNull();
    // The dig's lines: "nothing was taken" when confirmed, and nothing at all when some was used.
    expect(failedQuotaKey(failedRun({ quota_used: "NONE" }), true)).toBe("v4.digFailed.nothingTaken");
    expect(failedQuotaKey(failedRun({ quota_used: "SOME" }), true)).toBeNull();
    expect(failedQuotaKey(failedRun(), true)).toBeNull();
    expect(failedQuotaKey(failedRun({ quota_used: "NONE" }, "RUN_SET_ASIDE:BACKSTOP"), true)).toBeNull();
    expect(CATALOG["v4.debate.failedSomeTaken"]).toBe("The part that ran used some of your quota.");
  });

  it("question 3 A: a dig's reason is said about the dig, one line per reason group, never the code", () => {
    const codes: Readonly<Record<string, string>> = {
      NOT_STARTED: "RUN_ROLE_ASSIGNMENT_INVALID",
      PLAN_ENDED: "RUN_SETUP_FAILED:PLAN_CHANGED",
      MODELS_UNAVAILABLE: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM",
      RUN_LIMIT_REACHED: "RUN_CEILING_BELOW_FIRST_CALL",
      SET_ASIDE: "RUN_SET_ASIDE:BACKSTOP",
      STOPPED: "RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED",
      CHOICE_GONE: "RUN_SETUP_FAILED:CHOICE_UNAVAILABLE"
    };
    expect(Object.keys(codes).sort()).toEqual([...RUN_FAILURE_KINDS].sort());
    const lines = RUN_FAILURE_KINDS.map((kind) => digFailureMessage(codes[kind], CATALOG));
    expect(lines).toEqual(RUN_FAILURE_KINDS.map((kind) => CATALOG[`v4.digFailed.reason.${kind}`]));
    expect(new Set(lines).size).toBe(RUN_FAILURE_KINDS.length);
    expect(digFailureMessage("RUNNER_EXECUTION_FAILED:CALL_BUDGET_EXHAUSTED", CATALOG)).toBe("This dig stopped partway because of a problem on our side.");
    // A code nobody mapped, or none, reads as stopped partway (lib/v3/runFailure.ts); the code is never shown.
    expect(digFailureMessage("SOMETHING_NEW:42", CATALOG)).toBe(CATALOG["v4.digFailed.reason.STOPPED"]);
    expect(digFailureMessage(null, CATALOG)).toBe(CATALOG["v4.digFailed.reason.STOPPED"]);
    for (const line of lines) expect(line).not.toMatch(/[A-Z]{2,}_/u);
  });

  it("'Ask this again' names only the debate's id; the ask page reads the person's own words back", () => {
    expect(askAgainHref("44444444-4444-4444-8444-444444444444")).toBe("/v4?again=44444444-4444-4444-8444-444444444444");
    expect(askAgainRunId("44444444-4444-4444-8444-444444444444")).toBe("44444444-4444-4444-8444-444444444444");
    expect(askAgainRunId(" 44444444-4444-4444-8444-44444444444A ")).toBe("44444444-4444-4444-8444-44444444444a");
    for (const bad of [undefined, null, "", "not-a-run", "Will AI tutors replace homework help?", "../v1/runs"]) expect(askAgainRunId(bad)).toBeNull();
    // The person's own words: the lines added from their step-2 answers are left for the ask step to add again.
    expect(askAgainQuestion({ question_line: "Will AI tutors replace homework help?\n\nWhere? Romania." }, CATALOG)).toBe("Will AI tutors replace homework help?");
    expect(askAgainQuestion({ question_line: "   " }, CATALOG)).toBeNull();
  });
});

describe("a dig that did not finish (wait-f18, dig-f12)", () => {
  const mix = map.paths.find((path) => path.id === "n-mix")!;
  const renew = map.paths.find((path) => path.id === "n-renew")!;
  const suggestion = mix.suggestions![0]!;

  it("rebuilds a whole path's dig, open questions, and picks (suggestion as written, own view) from the link alone", () => {
    const pathTarget: DigTarget = { kind: "path", path: mix };
    expect(rebuildDigTarget(linkOf(pathTarget, "c1"), map)).toEqual(pathTarget);
    const question = map.paths.flatMap((path) => path.open)[0]!;
    expect(rebuildDigTarget(linkOf({ kind: "open", questions: [question] }, "c2"), map)).toEqual({ kind: "open", questions: [question] });
    const picks: DigTarget = { kind: "picks", path: mix, picks: [suggestionPick(mix.id, suggestion), ownViewPick(mix.id, "Small towns behave differently.", 1)] };
    const rebuilt = rebuildDigTarget(linkOf(picks, "c3"), map);
    expect(rebuilt?.kind).toBe("picks");
    // The same texts and places: the dig asked again is the one sent.
    expect(digTargetQuestions(rebuilt!)).toEqual(digTargetQuestions(picks));
    expect(placesOf(rebuilt!)).toEqual(placesOf(picks));
    expect(rebuilt?.kind === "picks" ? rebuilt.picks.map((pick) => pick.kind) : []).toEqual(["SUGGESTION", "OWN_VIEW"]);
    // Its own view gets a key of its own, so sending it never takes the person's current picks off the tray.
    expect(rebuilt?.kind === "picks" ? rebuilt.picks[1]!.key : "").toBe("retry:c3:1");
  });

  it("offers nothing when what it dug is no longer on the map", () => {
    expect(rebuildDigTarget({ ...linkOf({ kind: "path", path: mix }, "c4"), openQuestionIds: ["path:gone"] }, map)).toBeNull();
    expect(rebuildDigTarget({ ...linkOf({ kind: "path", path: mix }, "c5"), questions: ["  "] }, map)).toBeNull();
    expect(rebuildDigTarget({ ...linkOf({ kind: "path", path: mix }, "c6"), openQuestionIds: ["p:gone"] }, map)).toBeNull();
  });

  it("try again with the same mode; tried again: nothing more; failed twice: keeps failing", () => {
    const target: DigTarget = { kind: "picks", path: renew, picks: [openPick(renew.open[0]!)] };
    const same = () => true;
    const first = view(linkOf(target, "c-1", "thorough"), "FAILED");
    expect(digRetryOf(first, [first], map, null, same)).toMatchObject({ kind: "OFFER", mode: "thorough" });
    // Rebuilt from its link: offered only when it would ask exactly what the failed run asked.
    expect(digRetryOf(first, [first], map, null, () => false)).toEqual({ kind: "NONE" });
    // Remembered from this visit: exactly the target sent, whatever the rebuild would say.
    expect(digRetryOf(first, [first], map, { target, mode: "thorough" }, () => false)).toEqual({ kind: "OFFER", target, mode: "thorough" });
    const second = view(linkOf(target, "c-2", "thorough"), "RUNNING");
    expect(digRetryOf(first, [first, second], map, null, same)).toEqual({ kind: "RETRIED" });
    const secondFailed = { ...second, state: "FAILED" as const };
    expect(digRetryOf(first, [first, secondFailed], map, null, same)).toEqual({ kind: "KEEPS_FAILING" });
    expect(digRetryOf(secondFailed, [first, secondFailed], map, null, same)).toEqual({ kind: "KEEPS_FAILING" });
    // Another dig of the same path with other picks is not the same dig.
    const other = view(linkOf({ kind: "path", path: mix }, "c-3"), "FAILED");
    expect(sameDig(first.link, other.link)).toBe(false);
    expect(digRetryOf(view(first.link, "DONE"), [first], map, null, same)).toEqual({ kind: "NONE" });
    expect(retryPending({ kind: "OFFER", target, mode: "thorough" }, "thorough", 1_000, 10_000)).toEqual({ target, mode: "thorough", sendsAt: 11_000 });
  });

  it("a dig found again by its question's text (the path's line first) is rebuilt to the same picks", () => {
    const picks: DigTarget = { kind: "picks", path: mix, picks: [ownViewPick(mix.id, "Small towns behave differently.", 1)] };
    const byText = { ...linkOf(picks, "c-9"), questions: [mix.line, "Small towns behave differently."] };
    const rebuilt = rebuildDigTarget(byText, map);
    expect(rebuilt === null ? null : digTargetQuestions(rebuilt)).toEqual(["Small towns behave differently."]);
  });

  it("a dig this visit sent is remembered exactly as sent, under its new run (the send records it, integration)", () => {
    const target: DigTarget = { kind: "picks", path: renew, picks: [openPick(renew.open[0]!)] };
    expect(sentDigOf("c-7")).toBeNull();
    rememberSentDig("c-7", { target, mode: "thorough" });
    expect(sentDigOf("c-7")).toEqual({ target, mode: "thorough" });
    expect(sentDigOf("c-8")).toBeNull();
  });
});

describe("the month pause (wait-f2, wait-f5, map-f31, public-f16)", () => {
  const paused = (canContinue: boolean): RunProjection => ({
    run_ref: RUN, question_line: "q", state: "RUNNING", terminal_reason: null, hold_until: null, month_pause: { until: NEXT_MONTH, can_continue: canContinue }
  });
  const pausedDig = (canContinue?: boolean): DigView => ({
    ...view(linkOf({ kind: "path", path: map.paths[0]! }, "c-p"), "RUNNING"),
    pausedUntil: NEXT_MONTH, ...(canContinue === undefined ? {} : { canContinue })
  });

  it("reads the server's two facts, never the clock", () => {
    expect(pauseOfRun(paused(false))).toEqual({ until: NEXT_MONTH, canContinue: false });
    expect(pauseOfRun(paused(true))).toEqual({ until: NEXT_MONTH, canContinue: true });
    expect(pauseOfRun({ ...paused(true), month_pause: undefined })).toBeNull();
    expect(pauseOfDig(pausedDig(true))).toEqual({ until: NEXT_MONTH, canContinue: true });
    expect(pauseOfDig(pausedDig())).toEqual({ until: NEXT_MONTH, canContinue: false });
    expect(pauseOfDig({ ...pausedDig(true), state: "DONE" })).toBeNull();
    expect(pausedDigCount([pausedDig(), pausedDig(true), view(pausedDig().link, "RUNNING")])).toBe(2);
  });

  it("says it once, in the owner's words, before and after the reset", () => {
    // journey-f22 / journey-f15 (the wave-2 checks): one date form for the month pause, in a sentence and on a label alike.
    // Day first on English pages (owner's answer to question 5, 5 Nov 2026): "1 December".
    const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(new Date(NEXT_MONTH));
    const day = date;
    // No year: the record's "Paused until 1 December" (the wave-2 checks, P6: asserted on what the code says, any year).
    for (const line of [
      pauseSentence({ until: NEXT_MONTH, canContinue: false }, CATALOG, "en"),
      digPauseCardLine({ until: NEXT_MONTH, canContinue: false }, CATALOG, "en"),
      pausePhoneBar({ until: NEXT_MONTH, canContinue: false }, CATALOG, "en").untilLabel ?? ""
    ]) expect(line).not.toMatch(/\b\d{4}\b/u);
    expect(pauseSentence({ until: NEXT_MONTH, canContinue: false }, CATALOG, "en"))
      .toBe(`Paused: this month's quota is used up. You can continue from ${date}.`);
    expect(pauseSentence({ until: NEXT_MONTH, canContinue: true }, CATALOG, "en")).toBe("Your new month has started.");
    expect(digPauseCardLine({ until: NEXT_MONTH, canContinue: false }, CATALOG, "en")).toBe(`Dig · paused until ${day}`);
    expect(digPauseCardLine({ until: NEXT_MONTH, canContinue: true }, CATALOG, "en")).toBe("Dig · ready to continue");
    expect(pausePhoneBar({ until: NEXT_MONTH, canContinue: true }, CATALOG, "en"))
      .toEqual({ label: "Paused", continueLabel: "Continue", untilLabel: null, reason: null });
    // The owner's answers of 5 Nov (question 19 A): before the reset the bar's greyed button reads public-d4 A's "Continue on
    // 1 December", with the pause's one sentence as the visible line that says why (journey-f14).
    expect(pausePhoneBar({ until: NEXT_MONTH, canContinue: false }, CATALOG, "en")).toEqual({
      label: "Paused", continueLabel: null, untilLabel: `Continue on ${day}`,
      reason: `Paused: this month's quota is used up. You can continue from ${date}.`
    });
  });
});

describe("the greyed Continue before the new month (the owner's answers of 5 Nov, question 19 A)", () => {
  it("has no dashed outline: dashed is kept for \"New\" (journey-f2), and the old plain label's rule is gone", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-debate.css"), "utf8");
    const pauseRules = [...css.matchAll(/([^{}]*\.v4(?:Pause|DebPhonePaused)[^{}]*)\{([^}]*)\}/gu)];
    expect(pauseRules.length).toBeGreaterThan(0);
    for (const [, selector, body] of pauseRules) expect(body, selector!.trim()).not.toMatch(/dashed/u);
    expect(css).not.toMatch(/\.v4PauseUntil\b/u);
  });
});

describe("the owner's words (OWNER-PICKS-2026-11-03.md), word for word", () => {
  it("are in the catalogue as the record has them ('quota' for 'allowance', the chat's share word)", () => {
    const approved: Readonly<Record<string, string>> = {
      // wait-f11
      "v4.debate.askAgain": "Ask this again",
      "v4.debate.askAgainNote": "Your question and your picks are kept. The list of paths is made again, which uses a little of your quota, like any new question.",
      "v4.debate.failedNothingTaken": "Nothing was taken for the failed try.",
      "v4.debate.askNew": "Ask a new question",
      // wait-f18, dig-f12
      "v4.digFailed.retry": "Try this dig again",
      "v4.digFailed.nothingTaken": "Nothing was taken from your quota for this.",
      "v4.digFailed.keepsFailing": "This keeps failing. Write your report; it uses everything that finished.",
      // wait-f5, map-f31, wait-f2
      "v4.money.paused": "Paused: this month's quota is used up. You can continue from {date}.",
      "v4.money.pausedReady": "Your new month has started.",
      "v4.money.continueNote": "What is already done is not paid for again.",
      // The record's words (public-d4 A), which the owner's answers of 5 Nov (question 19 A) name for the greyed button before
      // the reset. Not a click-test approval: the key waits on DRAFTED_UNTIL_CLICK_TEST (tests/unit/v4-catalog-keys.test.ts).
      "v4.pause.continuesOn": "Continue on {date}",
      "v4.pause.digCard": "Dig · paused until {date}",
      "v4.pause.digCardReady": "Dig · ready to continue"
    };
    expect(Object.fromEntries(Object.keys(approved).map((key) => [key, CATALOG[key]]))).toEqual(approved);
  });

  it("never say 'allowance' or 'limit' in these lines", () => {
    const keys = Object.keys(CATALOG).filter((key) => /^v4\.(digFailed|pause)\./u.test(key)
      || ["v4.money.paused", "v4.money.pausedReady", "v4.debate.askAgain", "v4.debate.askAgainNote", "v4.debate.askAgainNoteQuestion",
        "v4.debate.failedNothingTaken", "v4.debate.digFailedBackNote", "v4.report.backToQuestion"].includes(key));
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) expect(CATALOG[key], key).not.toMatch(/allowance|limit/iu);
  });
});
