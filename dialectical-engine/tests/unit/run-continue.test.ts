// V4 start step, Task 57f (the owner's 7 Nov answers, his words: "we need to have a way to continue where it 'broke', and not charge the
// customer again ... Only if we can't re-use, then we need to pay for this ourselves"; cards "Only what never ran" and "Button on the stopped
// page", both Recommended) — A FAILED DEBATE CONTINUES WHERE IT STOPPED, AND THE PERSON PAYS ONLY FOR WHAT NEVER RAN.
//
// POST /v1/runs/{id}/continue, today's month-wall Continue, also continues the person's own FAILED debate when it is continuable: its stop
// was ours, its content is live, it was not set aside by an upload, and it has not been re-opened since it failed. The same work item goes
// back to be claimed and the runner resumes it from what it saved (0119's true resume: every call already answered is replayed, never bought
// again). A call an earlier copy paid for whose answer cannot be re-used is bought again by the copy that continues; the earlier charge is
// then the site's (0165's call waiver), so the person pays each call once, as an unbroken debate would. The FAILED read says `continuable`.
// 57e's `again_of` is gone. Every id, question and figure here is made up.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { RUN_PATH_SET_REFUSALS, RUN_STOPS_NOT_OURS } from "@debateai/battery";
import {
  AskRequestSchema, RUN_CONTINUE_NO_ROOM, RUN_NOT_CONTINUABLE, RunNotContinuedSchema, RunProjectionSchema, createContractClient, type RunProjection
} from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { buildFramedPrompt, type PromptContract, type ProviderCallRequest, type ProviderCallResult, type ProviderGateway } from "@debateai/providers";
import { runFailureRetriesOnce, runnerTerminalFailureReason } from "@debateai/runner";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import {
  continueFailedRun, continueRoomOf, failedRunContinuable, failedRunKeepsFailing, readFailedRunMark, stopIsOurs, stopIsSetAside,
  type FailedRunContinuePort, type RunContinueFacts,
  type RunReopenOutcome
} from "../../apps/api/src/run-continue.js";
import { PATHS_RUN_CODES } from "../../apps/runner/src/paths-run.js";
import { callCreditsOf, createReplayBook, recordedCalls, replayingGateway, type RecordedAttempt } from "../../apps/runner/src/run-replay.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const RUN = "44444444-4444-4444-8444-444444444444";
const OWNER = testHttpIdentity("run-continue-owner");
const STOPPED: RunContinueFacts = Object.freeze({
  state: "FAILED", terminal_reason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", content_live: true, waived: false, settled: false,
  paused: false, reopened: false, failed_continues: 0
});

describe("which stops are ours (the runner's one-retry rule, read from the recorded terminal reason)", () => {
  it("a provider out, a time limit, a fault of ours and a reason recorded without a typed code are ours", () => {
    for (const reason of ["RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", "RUNNER_EXECUTION_FAILED:RUNNER_TIME_LIMIT_REACHED",
      "RUNNER_EXECUTION_FAILED:UNEXPECTED_ERROR", "RUNNER_EXECUTION_FAILED:UNRECOGNIZED_DOMAIN_ERROR", "RUN_ROLE_ROTATION_INVALID",
      "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM"]) {
      expect(stopIsOurs(reason), reason).toBe(true);
    }
  });

  it("never the person's own act, a spending wall or a step's tries used up; never a set-aside, a debate never queued, or none", () => {
    for (const code of RUN_STOPS_NOT_OURS) {
      expect(stopIsOurs(`RUNNER_EXECUTION_FAILED:${code}`), code).toBe(false);
      expect(stopIsOurs(code), code).toBe(false);
    }
    // Task 57j: nor a set-aside, as recorded or wrapped (the debate's own stop it is not; it continues only where it moves, below).
    for (const reason of ["RUN_SET_ASIDE:BACKSTOP", "RUN_SET_ASIDE:OWNER_STOPPED", "RUNNER_EXECUTION_FAILED:RUN_SET_ASIDE:BACKSTOP",
      "RUN_SETUP_FAILED:COST_RECORD", "RUN_SETUP_FAILED:RELEASE_NOT_SERVED", null, ""]) {
      expect(stopIsOurs(reason), String(reason)).toBe(false);
    }
  });

  it("reads exactly as the runner decided the automatic retry, for every stop the runner records with its code", () => {
    // INTERNAL_FUNDING_UNAVAILABLE (a team grant's funding the site could not read) is outside the runner's diagnostic alphabet: the runner
    // records it as RUNNER_EXECUTION_FAILED:UNRECOGNIZED_DOMAIN_ERROR, a fault of ours like any unknown code, so it reads as continuable.
    const unrecorded = "INTERNAL_FUNDING_UNAVAILABLE";
    expect(runnerTerminalFailureReason(new TypedDomainError(unrecorded, unrecorded))).toBe("RUNNER_EXECUTION_FAILED:UNRECOGNIZED_DOMAIN_ERROR");
    expect(stopIsOurs(runnerTerminalFailureReason(new TypedDomainError(unrecorded, unrecorded)))).toBe(true);
    for (const code of [...RUN_STOPS_NOT_OURS, "PROVIDER_CALL_FAILED", "RUNNER_TIME_LIMIT_REACHED", "PROVIDER_CONTENT_UNACCEPTED"]) {
      if (code === unrecorded) continue;
      const error = new TypedDomainError(code, code);
      expect(runnerTerminalFailureReason(error), code).toBe(`RUNNER_EXECUTION_FAILED:${code}`);
      expect(stopIsOurs(runnerTerminalFailureReason(error)), code).toBe(runFailureRetriesOnce(error));
    }
    const untyped = new Error("socket hang up");
    expect(stopIsOurs(runnerTerminalFailureReason(untyped))).toBe(runFailureRetriesOnce(untyped));
    expect(runFailureRetriesOnce(untyped)).toBe(true);
  });
});

describe("whether a failed debate is continuable (one pure rule the read and the route share)", () => {
  it("the person's own FAILED debate, stopped on our side, live, never set aside and not re-opened", () => {
    expect(failedRunContinuable(STOPPED)).toBe(true);
    // A debate that failed before Task 57e's retry existed is read the same way: nothing here asks for a retry row.
    expect(failedRunContinuable({ ...STOPPED, terminal_reason: "RUNNER_EXECUTION_FAILED:UNEXPECTED_ERROR" })).toBe(true);
  });

  it("not another's (no facts), not erased, not a wall or the person's act, not set aside, not settled, not paused, not running", () => {
    expect(failedRunContinuable(null)).toBe(false);
    expect(failedRunContinuable({ ...STOPPED, content_live: false })).toBe(false);
    expect(failedRunContinuable({ ...STOPPED, terminal_reason: "RUNNER_EXECUTION_FAILED:PRIVATE_CONTENT_ERASED" })).toBe(false);
    expect(failedRunContinuable({ ...STOPPED, terminal_reason: "RUNNER_EXECUTION_FAILED:PERSON_ALLOWANCE_REACHED" })).toBe(false);
    expect(failedRunContinuable({ ...STOPPED, terminal_reason: "CALL_BUDGET_EXHAUSTED", settled: true })).toBe(false);
    // Task 57j: a set-aside only where Continue moves it to this release (below); the waiver alone no longer refuses.
    expect(failedRunContinuable({ ...STOPPED, terminal_reason: "RUN_SET_ASIDE:BACKSTOP", waived: true })).toBe(false);
    expect(failedRunContinuable({ ...STOPPED, paused: true })).toBe(false);
    for (const state of ["NONE", "OPEN", "DONE"] as const) expect(failedRunContinuable({ ...STOPPED, state, reopened: true })).toBe(false);
  });
});

/**
 * Task 57h (the 57f/57g review; the owner's 7 Nov words "Only if we can't re-use, then we need to pay for this ourselves") — TWO STOPS THAT
 * CONTINUE CAN NEVER GET PAST. A debate's own call budget used up (RUN_COST_ENVELOPE_EXHAUSTED, its attempt ceiling, beside its money
 * ceiling) is a limit the debate reached: never retried, never continued. A path debate's claim-time refusal that its stored set makes final
 * (no set, a menu the contract refuses, more paths than its receipt priced) meets every copy again: never continued (0165 gives its list
 * charge back, tests/integration/pre-start-charge-database.test.ts).
 */
describe("Task 57h: a debate's own call budget, and a path set that can never run, are never continued", () => {
  const ENVELOPE = "RUN_COST_ENVELOPE_EXHAUSTED";

  it("the attempt ceiling is a limit the debate reached: not ours, never retried, never continuable", () => {
    expect(RUN_STOPS_NOT_OURS.has(ENVELOPE)).toBe(true);
    const error = new TypedDomainError(ENVELOPE, ENVELOPE);
    expect(runFailureRetriesOnce(error)).toBe(false);
    expect(runnerTerminalFailureReason(error)).toBe(`RUNNER_EXECUTION_FAILED:${ENVELOPE}`);
    expect(stopIsOurs(runnerTerminalFailureReason(error))).toBe(false);
    expect(failedRunContinuable({ ...STOPPED, terminal_reason: runnerTerminalFailureReason(error) })).toBe(false);
  });

  it("the path-set refusals are the runner's terminal codes, recorded as they are; none is ever continuable", () => {
    expect([...RUN_PATH_SET_REFUSALS].sort()).toEqual([PATHS_RUN_CODES.noSet, PATHS_RUN_CODES.menuInvalid, PATHS_RUN_CODES.overReceipt].sort());
    for (const code of RUN_PATH_SET_REFUSALS) {
      expect(stopIsOurs(code), code).toBe(false);
      expect(failedRunContinuable({ ...STOPPED, terminal_reason: code }), code).toBe(false);
    }
  });

  it("the press: NOT_CONTINUABLE for each, nothing re-opened or woken", async () => {
    const input = { ownerRef: OWNER.authenticated.ownerRef, runId: RUN, now: new Date("2026-11-07T08:00:00.000Z") };
    for (const reason of [`RUNNER_EXECUTION_FAILED:${ENVELOPE}`, ...RUN_PATH_SET_REFUSALS]) {
      const { store } = storeOver({ ...STOPPED, terminal_reason: reason });
      const wake = vi.fn(async () => undefined);
      await expect(continueFailedRun(input, { store, room: { continueHasRoom: async () => true }, wake: { wake } }), reason)
        .resolves.toEqual({ kind: "NOT_CONTINUABLE" });
      expect(store.reopen, reason).not.toHaveBeenCalled();
      expect(wake, reason).not.toHaveBeenCalled();
    }
  });
});

/**
 * Task 57j (the owner's answer of 7 Nov afternoon, "Continue, they pay the rest"; it supersedes 57f's ruling that a set-aside is not
 * continued) — A DEBATE AN UPDATE SET ASIDE CONTINUES WHERE IT STOPPED. Continue moves the debate to this release (the route's hand-over), so
 * it is continuable exactly where it would move: on its own release the same wall (a retired runner, a version it cannot run, the owner's
 * stop) would meet it again. The waiver no longer refuses Continue: what ran before the set-aside stays the
 * site's, what runs after Continue is the person's (0168).
 */
describe("Task 57j: a debate an update set aside continues where it stopped, only where Continue moves it to this release", () => {
  const SET_ASIDE = ["RUN_SET_ASIDE:BACKSTOP", "RUN_SET_ASIDE:SETTINGS_VERSION_UNSUPPORTED", "RUN_SET_ASIDE:OWNER_STOPPED",
    "RUNNER_EXECUTION_FAILED:RUN_SET_ASIDE:BACKSTOP"] as const;
  const input = { ownerRef: OWNER.authenticated.ownerRef, runId: RUN, now: new Date("2026-11-07T08:00:00.000Z") };
  const destination = Object.freeze({ releaseKey: "r23-aaaaaaaaaaaa", registerVersion: 7 });
  const moving = { destinationOf: async () => destination, resumeInRelease: async () => "RECORDED" as const };
  const staying = { destinationOf: async () => null, resumeInRelease: async () => "RECORDED" as const };

  it("a set-aside reads as one as recorded or as the runner's catch wraps it; nothing else is a set-aside", () => {
    for (const reason of SET_ASIDE) {
      expect(stopIsSetAside(reason), reason).toBe(true);
      expect(stopIsOurs(reason), reason).toBe(false);
    }
    for (const reason of [STOPPED.terminal_reason, "RUN_SETUP_FAILED:RELEASE_NOT_SERVED", "RUNNER_EXECUTION_FAILED:PERSON_ALLOWANCE_REACHED", null, ""]) {
      expect(stopIsSetAside(reason), String(reason)).toBe(false);
    }
  });

  it("continuable only where Continue moves it; the other conditions hold as for any stop; the waiver alone never refuses", () => {
    for (const reason of SET_ASIDE) {
      const facts = { ...STOPPED, terminal_reason: reason, waived: true };
      expect(failedRunContinuable(facts), reason).toBe(false);
      expect(failedRunContinuable(facts, true), reason).toBe(true);
      for (const other of [{ content_live: false }, { settled: true }, { paused: true }, { state: "OPEN" as const }]) {
        expect(failedRunContinuable({ ...facts, ...other }, true), `${reason} ${JSON.stringify(other)}`).toBe(false);
      }
    }
    // A continued set-aside debate that then stopped on our side keeps its waiver row: it continues like any.
    expect(failedRunContinuable({ ...STOPPED, waived: true })).toBe(true);
    // Moving changes nothing for a stop that is not a set-aside.
    expect(failedRunContinuable({ ...STOPPED, terminal_reason: "RUNNER_EXECUTION_FAILED:PERSON_ALLOWANCE_REACHED" }, true)).toBe(false);
  });

  it("the press: moved and re-opened in one step where the hand-over has a destination; NOT_CONTINUABLE on its own release or with no hand-over", async () => {
    for (const reason of SET_ASIDE) {
      const { store, reopened } = storeOver({ ...STOPPED, terminal_reason: reason, waived: true });
      const wake = vi.fn(async () => undefined);
      await expect(continueFailedRun(input, { store, handover: moving, wake: { wake } }), reason).resolves.toEqual({ kind: "CONTINUING" });
      expect(reopened, reason).toEqual([destination]);
      expect(wake, reason).toHaveBeenCalledWith(RUN);
      for (const handover of [staying, undefined]) {
        const refused = storeOver({ ...STOPPED, terminal_reason: reason, waived: true });
        await expect(continueFailedRun(input, { store: refused.store, ...(handover === undefined ? {} : { handover }) }), reason)
          .resolves.toEqual({ kind: "NOT_CONTINUABLE" });
        expect(refused.store.reopen, reason).not.toHaveBeenCalled();
      }
    }
    // No room for the rest: NO_ROOM, as for any stop.
    const { store } = storeOver({ ...STOPPED, terminal_reason: "RUN_SET_ASIDE:BACKSTOP", waived: true });
    await expect(continueFailedRun(input, { store, handover: moving, room: { continueHasRoom: async () => false } })).resolves.toEqual({ kind: "NO_ROOM" });
    expect(store.reopen).not.toHaveBeenCalled();
  });
});

/**
 * Task 57m (the owner's 8 Nov words: "if it keeps failing we shouldn't tell the user that it can continue, because he clearly cannot. We
 * should stop after 2 continues that fail"; "Yes, same rule" for a whole debate) — AFTER TWO CONTINUES THAT FAIL, NO MORE CONTINUE. The facts'
 * `failed_continues` (0168) counts the re-opens that ended FAILED again; at 2 the rule says no, for a first question and a dig alike (the
 * facts are the same for both), and the read says why (`keeps_failing`), only when nothing else would refuse it.
 */
describe("Task 57m: after two continues that fail, Continue is no longer offered", () => {
  const input = { ownerRef: OWNER.authenticated.ownerRef, runId: RUN, now: new Date("2026-11-08T08:00:00.000Z") };

  it("continuable after 0 or 1 failed continues; not after 2 or more", () => {
    expect(failedRunContinuable({ ...STOPPED, failed_continues: 0 })).toBe(true);
    expect(failedRunContinuable({ ...STOPPED, failed_continues: 1, reopened: true })).toBe(true);
    expect(failedRunContinuable({ ...STOPPED, failed_continues: 2, reopened: true })).toBe(false);
    expect(failedRunContinuable({ ...STOPPED, failed_continues: 3, reopened: true })).toBe(false);
    // A set-aside that would move counts the same (the database already leaves every update's set-aside out of the count, below).
    const setAside = { ...STOPPED, terminal_reason: "RUN_SET_ASIDE:BACKSTOP", waived: true, reopened: true };
    expect(failedRunContinuable({ ...setAside, failed_continues: 1 }, true)).toBe(true);
    expect(failedRunContinuable({ ...setAside, failed_continues: 2 }, true)).toBe(false);
  });

  it("the mark only for this reason: every other condition holds and two continues failed", () => {
    expect(failedRunKeepsFailing({ ...STOPPED, failed_continues: 2, reopened: true })).toBe(true);
    expect(failedRunKeepsFailing({ ...STOPPED, failed_continues: 3, reopened: true })).toBe(true);
    for (const count of [0, 1]) expect(failedRunKeepsFailing({ ...STOPPED, failed_continues: count }), String(count)).toBe(false);
    for (const other of [{ content_live: false }, { settled: true }, { paused: true }, { state: "OPEN" as const },
      { terminal_reason: "RUNNER_EXECUTION_FAILED:PERSON_ALLOWANCE_REACHED" }, { terminal_reason: "RUN_SET_ASIDE:BACKSTOP", waived: true },
      { terminal_reason: PATHS_RUN_CODES.noSet }]) {
      const facts = { ...STOPPED, failed_continues: 2, reopened: true, ...other };
      expect(failedRunKeepsFailing(facts), JSON.stringify(other)).toBe(false);
      expect(failedRunContinuable(facts), JSON.stringify(other)).toBe(false);
    }
    expect(failedRunKeepsFailing(null)).toBe(false);
    // A set-aside: only where it would move (else it is refused for another reason, and no mark).
    const setAside = { ...STOPPED, terminal_reason: "RUN_SET_ASIDE:BACKSTOP", waived: true, failed_continues: 3, reopened: true };
    expect(failedRunKeepsFailing(setAside, true)).toBe(true);
    expect(failedRunKeepsFailing(setAside, false)).toBe(false);
  });

  it("Task 57m-fix: `failed_continues` is the database's exact count (0168 leaves out every re-open an update set aside, the newest and the earlier ones), so nothing more is taken off here", () => {
    const setAsideNow = { ...STOPPED, terminal_reason: "RUN_SET_ASIDE:BACKSTOP", waived: true, reopened: true };
    // One continue that failed on our side, then set aside by an upload (the database says 1): it moves on.
    expect(failedRunContinuable({ ...setAsideNow, failed_continues: 1 }, true)).toBe(true);
    expect(failedRunKeepsFailing({ ...setAsideNow, failed_continues: 1 }, true)).toBe(false);
    // Two continues that failed on our side, then set aside (the database says 2): it keeps failing.
    expect(failedRunContinuable({ ...setAsideNow, failed_continues: 2 }, true)).toBe(false);
    expect(failedRunKeepsFailing({ ...setAsideNow, failed_continues: 2 }, true)).toBe(true);
  });

  it("the press: NOT_CONTINUABLE after two failed continues, nothing re-opened or woken", async () => {
    const { store } = storeOver({ ...STOPPED, failed_continues: 2, reopened: true });
    const wake = vi.fn(async () => undefined);
    await expect(continueFailedRun(input, { store, room: { continueHasRoom: async () => true }, wake: { wake } })).resolves.toEqual({ kind: "NOT_CONTINUABLE" });
    expect(store.reopen).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
    // After one, it still continues.
    const once = storeOver({ ...STOPPED, failed_continues: 1, reopened: true });
    await expect(continueFailedRun(input, { store: once.store })).resolves.toEqual({ kind: "CONTINUING" });
  });

  it("the read's verdict: CONTINUABLE, KEEPS_FAILING (only for this reason) or null", async () => {
    const over = (facts: RunContinueFacts | null) => readFailedRunMark({ ownerRef: OWNER.authenticated.ownerRef, runId: RUN },
      { store: { readContinue: async () => facts, reopen: async () => "NOT_FAILED" as const } });
    expect(await over(STOPPED)).toBe("CONTINUABLE");
    expect(await over({ ...STOPPED, failed_continues: 2, reopened: true })).toBe("KEEPS_FAILING");
    expect(await over({ ...STOPPED, failed_continues: 2, reopened: true, content_live: false })).toBeNull();
    expect(await over(null)).toBeNull();
  });
});

/** A store over one debate: FAILED until re-opened once, then open (CONTINUING); `owner` reads it, anyone else reads nothing. */
function storeOver(facts: RunContinueFacts, owner = OWNER.authenticated.ownerRef) {
  let current: RunContinueFacts = facts;
  const reopened: unknown[] = [];
  const store: FailedRunContinuePort = {
    readContinue: async (ownerRef, runId) => ownerRef === owner && runId === RUN ? current : null,
    reopen: vi.fn(async (ownerRef: string, runId: string, destination): Promise<RunReopenOutcome> => {
      if (ownerRef !== owner || runId !== RUN) return "NOT_OWNED";
      if (current.state === "OPEN" && current.reopened) return "CONTINUING";
      if (current.state !== "FAILED") return "NOT_FAILED";
      reopened.push(destination);
      current = Object.freeze({ ...current, state: "OPEN", terminal_reason: null, reopened: true });
      return "RECORDED";
    })
  };
  return { store, reopened };
}

describe("continueFailedRun", () => {
  const now = new Date("2026-11-07T08:00:00.000Z");
  const input = { ownerRef: OWNER.authenticated.ownerRef, runId: RUN, now };

  it("re-opens a continuable debate once and wakes its runner; a second press while it runs is CONTINUING with nothing re-opened again", async () => {
    const { store, reopened } = storeOver(STOPPED);
    const wake = vi.fn(async () => undefined);
    await expect(continueFailedRun(input, { store, room: { continueHasRoom: async () => true }, wake: { wake } })).resolves.toEqual({ kind: "CONTINUING" });
    await expect(continueFailedRun(input, { store, room: { continueHasRoom: async () => true }, wake: { wake } })).resolves.toEqual({ kind: "CONTINUING" });
    expect(reopened).toEqual([null]);
    expect(store.reopen).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledTimes(2);
    expect(wake).toHaveBeenCalledWith(RUN);
  });

  it("another account's debate is NOT_FOUND and nothing is re-opened", async () => {
    const { store } = storeOver(STOPPED, "someone-else");
    await expect(continueFailedRun(input, { store })).resolves.toEqual({ kind: "NOT_FOUND" });
    expect(store.reopen).not.toHaveBeenCalled();
  });

  it("a debate that is not FAILED and was not re-opened is NOT_FAILED (the route's month-wall path answers it, as today)", async () => {
    for (const state of ["NONE", "OPEN", "DONE"] as const) {
      const { store } = storeOver({ ...STOPPED, state, terminal_reason: null });
      await expect(continueFailedRun(input, { store })).resolves.toEqual({ kind: "NOT_FAILED" });
      expect(store.reopen).not.toHaveBeenCalled();
    }
  });

  it("a debate paused at the month wall is NOT_FAILED whatever its work item says (a continued one that reached the wall too): never woken here", async () => {
    for (const facts of [{ ...STOPPED, paused: true }, { ...STOPPED, state: "OPEN" as const, terminal_reason: null, paused: true, reopened: true }]) {
      const { store } = storeOver(facts);
      const wake = vi.fn(async () => undefined);
      await expect(continueFailedRun(input, { store, wake: { wake } })).resolves.toEqual({ kind: "NOT_FAILED" });
      expect(store.reopen).not.toHaveBeenCalled();
      expect(wake).not.toHaveBeenCalled();
    }
  });

  it("a failed debate that is not continuable is NOT_CONTINUABLE, nothing re-opened", async () => {
    for (const facts of [{ ...STOPPED, content_live: false }, { ...STOPPED, terminal_reason: "RUNNER_EXECUTION_FAILED:DAILY_COST_ENVELOPE_REACHED" },
      { ...STOPPED, terminal_reason: "RUNNER_EXECUTION_FAILED:PRIVATE_CONTENT_ERASED" }, { ...STOPPED, terminal_reason: "RUN_SET_ASIDE:BACKSTOP", waived: true }]) {
      const { store } = storeOver(facts);
      await expect(continueFailedRun(input, { store })).resolves.toEqual({ kind: "NOT_CONTINUABLE" });
      expect(store.reopen).not.toHaveBeenCalled();
    }
  });

  it("no room for the rest (the person's quota or the day's pot): NO_ROOM, nothing re-opened", async () => {
    const { store } = storeOver(STOPPED);
    await expect(continueFailedRun(input, { store, room: { continueHasRoom: async () => false } })).resolves.toEqual({ kind: "NO_ROOM" });
    expect(store.reopen).not.toHaveBeenCalled();
  });

  it("an older release's debate is handed over to this one in the same step; an upload switching over answers TRY_AGAIN", async () => {
    const destination = Object.freeze({ releaseKey: "r23-aaaaaaaaaaaa", registerVersion: 7 });
    const handover = { destinationOf: async () => destination, resumeInRelease: async () => "RECORDED" as const };
    const { store, reopened } = storeOver(STOPPED);
    await expect(continueFailedRun(input, { store, handover })).resolves.toEqual({ kind: "CONTINUING" });
    expect(reopened).toEqual([destination]);
    for (const outcome of ["NOT_CURRENT", "VERSION_NOT_PASSED"] as const) {
      const busy: FailedRunContinuePort = { readContinue: async () => STOPPED, reopen: async () => outcome };
      await expect(continueFailedRun(input, { store: busy, handover })).resolves.toEqual({ kind: "TRY_AGAIN" });
    }
  });

  it("a wake that fails is only logged, with a fixed kind and a code", async () => {
    const { store } = storeOver(STOPPED);
    const lines: string[] = [];
    const wake = { wake: async () => { throw Object.assign(new Error("hatchet down"), { code: "HATCHET_UNAVAILABLE" }); } };
    await expect(continueFailedRun(input, { store, wake, log: (line) => lines.push(line) })).resolves.toEqual({ kind: "CONTINUING" });
    expect(lines).toEqual([JSON.stringify({ kind: "DEBATEAI_RUN_CONTINUE_WAKE", event: "WAKE_FAILED", code: "HATCHET_UNAVAILABLE" })]);
  });
});

describe("the continue room: the person's quota and the day's pot", () => {
  const now = new Date("2026-11-07T08:00:00.000Z");
  it("room only while the person's pool is not empty and the site's day is below its ceiling", async () => {
    const days: string[] = [];
    const room = (empty: boolean, spent: number) => continueRoomOf({
      personPool: async () => ({ empty }), daySpentMicros: async (day) => { days.push(day); return spent; }, dailyCeilingMicros: 1_000
    });
    expect(await room(false, 999).continueHasRoom("owner", now)).toBe(true);
    expect(await room(true, 0).continueHasRoom("owner", now)).toBe(false);
    expect(await room(false, 1_000).continueHasRoom("owner", now)).toBe(false);
    expect(days[0]).toBe("2026-11-07");
  });
});

// ── The money: a call an earlier copy paid for and cannot hand back is the site's once it is bought again ─────────────────────────────

const artifact = (content: string, attempt = 1) => Object.freeze({
  rawText: JSON.stringify({ id: "x", model: "vendor/model-1", usage: { prompt_tokens: 10, completion_tokens: 5 },
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] }),
  provider: "openai-compatible-http", modelId: "vendor/model-1", maker: "vendor", modelVersion: "vendor/model-1", thinkingTokens: null, attempt
});
let sequence = 0;
const attempt = (input: Partial<RecordedAttempt> & Pick<RecordedAttempt, "callSiteKey" | "outcome" | "promptFingerprint">): RecordedAttempt => {
  sequence += 1;
  return Object.freeze({ actorRef: "preview:vendor", ledgerEntryRef: `entry-${String(sequence)}`, rawArtifactRef: `artifact-${String(sequence)}`,
    thinkingLevel: null, artifact: null, attemptId: `attempt-${String(sequence)}`, charged: true, ...input });
};
const bookOf = (attempts: readonly RecordedAttempt[]) => createReplayBook({ calls: recordedCalls(attempts), earlierNodes: [],
  credits: callCreditsOf(attempts) });
const CONTRACT: PromptContract = Object.freeze({ contractId: "test.continue.v1", instruction: "Judge the statement on its merits.",
  answerForm: "Return only one JSON object." });
// Every call frames its packet afresh (its own fence and canary), as a later copy's call does.
const packetOf = (text: string) => buildFramedPrompt({ contract: CONTRACT, material: [{ name: "question_line", content: text }] }).packet;
const fp = (text: string): string => canonicalPromptFingerprint(packetOf(text).messages);
const request = (callSiteKey: string, text: string): ProviderCallRequest => ({
  runId: RUN, subjectItemId: "item", callSiteKey, role: "JUDGE", lane: "served", bound: { maxAttempts: 3, deadlineMs: 1000, tokenCeiling: 100 },
  contractHash: "contract", providerRef: "preview:vendor", packet: packetOf(text)
});
function vendor(fails = false) {
  const sent: string[] = [];
  const inner: ProviderGateway = {
    call: async (call: ProviderCallRequest): Promise<ProviderCallResult> => {
      sent.push(call.callSiteKey);
      if (fails) throw new TypedDomainError("PROVIDER_CALL_FAILED", "vendor unreachable");
      return { rawArtifactRef: "fresh", ledgerEntryRef: "fresh", content: "{}", provider: "openai-compatible-http", model: "vendor/model-1",
        maker: "vendor", modelVersion: "vendor/model-1" };
    }
  };
  return { sent, inner };
}

describe("the calls an earlier copy paid for and could not keep (callCreditsOf)", () => {
  it("one per call at a site and member that charged anything: answered calls and the unanswered tail alike; nothing for free attempts", () => {
    const credits = callCreditsOf([
      attempt({ callSiteKey: "JUDGE", outcome: "FAILED", promptFingerprint: "a", attemptId: "j1" }),
      attempt({ callSiteKey: "JUDGE", outcome: "OK", promptFingerprint: "a", attemptId: "j2", artifact: artifact("{}", 2) }),
      attempt({ callSiteKey: "REVIEW", outcome: "TIMED_OUT", promptFingerprint: "r", attemptId: "r1", charged: false }),
      attempt({ callSiteKey: "PANEL", outcome: "FAILED", promptFingerprint: "p", attemptId: "p1" }),
      attempt({ callSiteKey: "PANEL", outcome: "FAILED", promptFingerprint: "p", attemptId: "p2" })
    ]);
    expect(credits.map((credit) => [credit.callSiteKey, credit.answered, credit.attemptIds])).toEqual([
      ["JUDGE", true, ["j1", "j2"]], ["PANEL", false, ["p1", "p2"]]
    ]);
  });
});

describe("the replaying gateway hands the earlier charge to the site when it buys a call again", () => {
  it("a call answered before and handed back from the record costs nothing more, and its charge stays the person's (one purchase)", async () => {
    const book = bookOf([attempt({ callSiteKey: "JUDGE", outcome: "OK", promptFingerprint: fp("q"), attemptId: "j1", artifact: artifact("{}") })]);
    expect(book.redoCredits).toBe(1);
    const { sent, inner } = vendor();
    const waived: unknown[] = [];
    const gateway = replayingGateway(book, inner, () => undefined, false, async (_runId, ids) => { waived.push(ids); });
    expect((await gateway.call(request("JUDGE", "q"))).rawArtifactRef).not.toBe("fresh");
    expect(book.redoCredits).toBe(0);
    // A new call at the same site later is the person's own: nothing of the replayed one is handed to the site.
    await gateway.call(request("JUDGE", "another question"));
    expect(sent).toEqual(["JUDGE"]);
    expect(waived).toEqual([]);
  });

  it("a call the stopped copy was charged for but never got answered: bought again, and the stopped copy's charges are the site's", async () => {
    const book = bookOf([attempt({ callSiteKey: "PANEL", outcome: "FAILED", promptFingerprint: "p", attemptId: "p1" })]);
    expect(book.pending).toBe(0);
    expect(book.redoCredits).toBe(1);
    const { sent, inner } = vendor();
    const waived: unknown[] = [];
    const gateway = replayingGateway(book, inner, () => undefined, false, async (runId, ids) => { waived.push([runId, ids]); });
    await gateway.call(request("PANEL", "the panel's question"));
    expect(sent).toEqual(["PANEL"]);
    expect(waived).toEqual([[RUN, ["p1"]]]);
    // Once: the next call at the site is the person's own new call.
    await gateway.call(request("PANEL", "the panel's question"));
    expect(waived).toHaveLength(1);
    expect(book.redoCredits).toBe(0);
  });

  it("a call answered before whose answer cannot be handed back (another question now): the earlier answer's charge is the site's", async () => {
    const book = bookOf([attempt({ callSiteKey: "JUDGE", outcome: "OK", promptFingerprint: "not-this-prompt", attemptId: "j1",
      artifact: artifact("{}") })]);
    const { inner } = vendor();
    const waived: unknown[] = [];
    await replayingGateway(book, inner, () => undefined, false, async (_runId, ids) => { waived.push(ids); }).call(request("JUDGE", "q"));
    expect(waived).toEqual([["j1"]]);
  });

  it("nothing is the site's when the earlier attempts cost nothing, at another site, or when the new call fails (kept for the next copy)", async () => {
    const free = bookOf([attempt({ callSiteKey: "PANEL", outcome: "FAILED", promptFingerprint: "p", attemptId: "p1", charged: false })]);
    expect(free.redoCredits).toBe(0);
    const book = bookOf([attempt({ callSiteKey: "PANEL", outcome: "FAILED", promptFingerprint: "p", attemptId: "p1" })]);
    const waived: unknown[] = [];
    const waive = async (_runId: string, ids: readonly string[]) => { waived.push(ids); };
    await replayingGateway(book, vendor().inner, () => undefined, false, waive).call(request("REVIEW", "q"));
    await expect(replayingGateway(book, vendor(true).inner, () => undefined, false, waive).call(request("PANEL", "q")))
      .rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect(waived).toEqual([]);
    expect(book.redoCredits).toBe(1);
    await replayingGateway(book, vendor().inner, () => undefined, false, waive).call(request("PANEL", "q"));
    expect(waived).toEqual([["p1"]]);
  });

  it("a waiver that cannot be written never fails the debate: the call's answer stands, one content-free line", async () => {
    const book = bookOf([attempt({ callSiteKey: "PANEL", outcome: "FAILED", promptFingerprint: "p", attemptId: "p1" })]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const answered = await replayingGateway(book, vendor().inner, () => undefined, false,
        async () => { throw Object.assign(new Error("db down"), { code: "57P01" }); }).call(request("PANEL", "q"));
      expect(answered.rawArtifactRef).toBe("fresh");
      expect(warn).toHaveBeenCalledWith(JSON.stringify({ kind: "DEBATEAI_RUN_CALL_WAIVER", event: "NOT_WRITTEN", runId: RUN, calls: 1 }));
    } finally {
      warn.mockRestore();
    }
  });

  // Independent review (wave 16): the owner's own case, a provider out and its one retry out too. The stopped copies' member at a seat was
  // charged and never answered; on the copy that continues it fails again and the seat's runner-up answers the call. That call is answered
  // now, so every stopped copy's charged attempt at it, at either seat and by any member, is the site's; the person pays this copy's own
  // attempts, what an unbroken debate whose member failed and whose runner-up answered would cost.
  it("a call the stopped copies' member never answered, answered now by the seat's runner-up: every earlier failed charge at it is the site's", async () => {
    const MAIN = "JUDGE:attack:root0:r1:p0:seat:main";
    const RUNNER_UP = "JUDGE:attack:root0:r1:p0:seat:runnerUp";
    const book = bookOf([
      attempt({ callSiteKey: MAIN, outcome: "FAILED", promptFingerprint: "a", attemptId: "x1" }),
      attempt({ callSiteKey: RUNNER_UP, actorRef: "preview:backup", outcome: "FAILED", promptFingerprint: "a", attemptId: "y1" }),
      attempt({ callSiteKey: MAIN, outcome: "FAILED", promptFingerprint: "a", attemptId: "x2" })
    ]);
    const waived: (readonly string[])[] = [];
    const waive = async (_runId: string, ids: readonly string[]) => { waived.push(ids); };
    await expect(replayingGateway(book, vendor(true).inner, () => undefined, false, waive).call(request(MAIN, "q")))
      .rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect(waived).toEqual([]);
    await replayingGateway(book, vendor().inner, () => undefined, false, waive).call({ ...request(RUNNER_UP, "q"), providerRef: "preview:backup" });
    expect(waived.map((ids) => [...ids].sort())).toEqual([["x1", "x2", "y1"]]);
    expect(book.redoCredits).toBe(0);
  });

  it("the same with no seat marker (another member at the same site); an answered call of another member is never taken by it", async () => {
    const book = bookOf([
      attempt({ callSiteKey: "PANEL", outcome: "FAILED", promptFingerprint: "p", attemptId: "p1" }),
      attempt({ callSiteKey: "JUDGE:attack:root1:r1:p0:seat:main", outcome: "OK", promptFingerprint: "not-this-prompt", attemptId: "j1",
        artifact: artifact("{}") })
    ]);
    const waived: (readonly string[])[] = [];
    const waive = async (_runId: string, ids: readonly string[]) => { waived.push(ids); };
    const gateway = replayingGateway(book, vendor().inner, () => undefined, false, waive);
    await gateway.call({ ...request("PANEL", "q"), providerRef: "preview:backup" });
    await gateway.call({ ...request("JUDGE:attack:root1:r1:p0:seat:runnerUp", "q"), providerRef: "preview:backup" });
    expect(waived).toEqual([["p1"]]);
    expect(book.redoCredits).toBe(1);
  });

  it("without the waiver port the gateway is today's: a free first claim is never wrapped", async () => {
    const book = bookOf([attempt({ callSiteKey: "PANEL", outcome: "FAILED", promptFingerprint: "p", attemptId: "p1" })]);
    const { sent, inner } = vendor();
    await replayingGateway(book, inner).call(request("PANEL", "q"));
    expect(sent).toEqual(["PANEL"]);
    expect(book.redoCredits).toBe(1);
  });
});

// ── The contract, the FAILED read and the removal of 57e's `again_of` ─────────────────────────────────────────────────────────────────

const FAILED: RunProjection = Object.freeze({ run_ref: RUN, question_line: "Will AI tutors replace homework help?", state: "FAILED",
  terminal_reason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", hold_until: null });

describe("the contract", () => {
  it("names the refusal of a failed debate that cannot continue, and the press with no room left, as data", () => {
    expect(RUN_NOT_CONTINUABLE).toBe("RUN_NOT_CONTINUABLE");
    expect(RUN_CONTINUE_NO_ROOM).toBe("RUN_CONTINUE_NO_ROOM");
    for (const code of [RUN_NOT_CONTINUABLE, RUN_CONTINUE_NO_ROOM]) {
      expect(RunNotContinuedSchema.parse({ error: code, message: code })).toEqual({ error: code, message: code });
    }
    expect(RunNotContinuedSchema.safeParse({ error: RUN_NOT_CONTINUABLE, message: RUN_CONTINUE_NO_ROOM }).success).toBe(false);
    expect(RunNotContinuedSchema.safeParse({ error: "RUN_NOT_PAUSED", message: "RUN_NOT_PAUSED" }).success).toBe(false);
  });

  it("`continuable` (renamed from 57e's `reusable`) rides a FAILED run only, last and optional", () => {
    // Task 57m: `keeps_failing` follows it, last.
    expect(Object.keys(RunProjectionSchema.shape).slice(-3)).toEqual(["quota_used", "continuable", "keeps_failing"]);
    expect(RunProjectionSchema.safeParse({ ...FAILED, continuable: true }).success).toBe(true);
    expect(RunProjectionSchema.safeParse(FAILED).success).toBe(true);
    expect(RunProjectionSchema.safeParse({ ...FAILED, continuable: false }).success).toBe(false);
    expect(RunProjectionSchema.safeParse({ ...FAILED, state: "RUNNING", terminal_reason: null, continuable: true }).success).toBe(false);
    expect(RunProjectionSchema.safeParse({ ...FAILED, reusable: true }).success).toBe(false);
  });

  it("Task 57m: `keeps_failing` rides a FAILED run only, last and optional, and never beside `continuable`", () => {
    expect(RunProjectionSchema.safeParse({ ...FAILED, keeps_failing: true }).success).toBe(true);
    expect(RunProjectionSchema.safeParse({ ...FAILED, keeps_failing: false }).success).toBe(false);
    expect(RunProjectionSchema.safeParse({ ...FAILED, state: "RUNNING", terminal_reason: null, keeps_failing: true }).success).toBe(false);
    expect(RunProjectionSchema.safeParse({ ...FAILED, continuable: true, keeps_failing: true }).success).toBe(false);
  });

  it("57e's `again_of` is gone from the ask: an ask that sends it is refused like any unknown member", () => {
    expect(Object.keys(AskRequestSchema.shape)).not.toContain("again_of");
    expect(Object.keys(AskRequestSchema.shape).at(-1)).toBe("saved_question_id");
  });

  it("the typed client's continueRun answers both refusals as data; anything else stays an error", async () => {
    const over = (status: number, body: unknown) => createContractClient("https://debate.example", (async () =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch,
    { mode: "cookie", csrfToken: () => "csrf-1" });
    for (const code of [RUN_NOT_CONTINUABLE, RUN_CONTINUE_NO_ROOM]) {
      expect(await over(409, { error: code, message: code }).continueRun(RUN)).toEqual({ error: code, message: code });
    }
    await expect(over(409, { error: "RUN_NOT_PAUSED", message: "RUN_NOT_PAUSED" }).continueRun(RUN)).rejects.toMatchObject({ status: 409 });
  });
});

describe("GET /v1/runs/{id}: a failed debate says `continuable` exactly when the route would continue it", () => {
  function readOver(run: RunProjection, facts: RunContinueFacts | null) {
    const application = { readRun: async () => run, readRunQuotaUsed: async () => "SOME" as const } as unknown as AskApplication;
    const asked: string[] = [];
    const api = buildApi({
      application, sessions: testSessionApplication([OWNER]), allowedOrigin: TEST_APP_ORIGIN,
      failedRunContinue: { store: { readContinue: async (ownerRef: string, runId: string) => { asked.push(`${ownerRef}:${runId}`); return facts; },
        reopen: async () => "NOT_FAILED" as const } }
    } as never);
    return { api, asked, read: () => api.inject({ method: "GET", url: `/v1/runs/${RUN}`, headers: testSessionHeaders(OWNER) }) };
  }

  it("continuable: true for the person's own continuable failed debate, beside quota_used", async () => {
    const h = readOver(FAILED, STOPPED);
    expect((await h.read()).json()).toEqual({ ...FAILED, quota_used: "SOME", continuable: true });
    expect(h.asked).toEqual([`${OWNER.authenticated.ownerRef}:${RUN}`]);
    await h.api.close();
  });

  it("absent when it is not continuable, cannot be read, or the read fails; never read for a debate that did not fail", async () => {
    for (const facts of [{ ...STOPPED, content_live: false }, { ...STOPPED, terminal_reason: "RUNNER_EXECUTION_FAILED:PERSON_ALLOWANCE_REACHED" }, null]) {
      const h = readOver(FAILED, facts);
      expect((await h.read()).json()).toEqual({ ...FAILED, quota_used: "SOME" });
      await h.api.close();
    }
    const running = readOver({ ...FAILED, state: "RUNNING", terminal_reason: null }, STOPPED);
    expect((await running.read()).json()).not.toHaveProperty("continuable");
    expect(running.asked).toEqual([]);
    await running.api.close();
  });

  it("Task 57j: a debate an update set aside says continuable exactly where Continue would move it to this release", async () => {
    const setAside = { ...FAILED, terminal_reason: "RUN_SET_ASIDE:BACKSTOP" };
    const facts = { ...STOPPED, terminal_reason: "RUN_SET_ASIDE:BACKSTOP", waived: true };
    const over = (destination: Readonly<{ releaseKey: string; registerVersion: number }> | null | undefined) => {
      const application = { readRun: async () => setAside, readRunQuotaUsed: async () => "NONE" as const } as unknown as AskApplication;
      return buildApi({
        application, sessions: testSessionApplication([OWNER]), allowedOrigin: TEST_APP_ORIGIN,
        failedRunContinue: { store: { readContinue: async () => facts, reopen: async () => "NOT_FAILED" as const } },
        ...(destination === undefined ? {} : { runHandover: { destinationOf: async () => destination, resumeInRelease: async () => "RECORDED" as const } })
      } as never);
    };
    for (const [destination, continuable] of [[{ releaseKey: "r23-aaaaaaaaaaaa", registerVersion: 7 }, true], [null, false], [undefined, false]] as const) {
      const api = over(destination);
      const body = (await api.inject({ method: "GET", url: `/v1/runs/${RUN}`, headers: testSessionHeaders(OWNER) })).json();
      expect(body, String(destination)).toEqual({ ...setAside, quota_used: "NONE", ...(continuable ? { continuable: true } : {}) });
      await api.close();
    }
  });

  it("Task 57m: after two continues that fail, `keeps_failing: true` and no `continuable`; the mark only for this reason", async () => {
    const keeps = readOver(FAILED, { ...STOPPED, failed_continues: 2, reopened: true });
    expect((await keeps.read()).json()).toEqual({ ...FAILED, quota_used: "SOME", keeps_failing: true });
    await keeps.api.close();
    const once = readOver(FAILED, { ...STOPPED, failed_continues: 1, reopened: true });
    expect((await once.read()).json()).toEqual({ ...FAILED, quota_used: "SOME", continuable: true });
    await once.api.close();
    const erased = readOver(FAILED, { ...STOPPED, failed_continues: 2, reopened: true, content_live: false });
    expect((await erased.read()).json()).toEqual({ ...FAILED, quota_used: "SOME" });
    await erased.api.close();
  });

  it("Task 57h: absent for a debate's own call budget used up and for each path set that can never run", async () => {
    for (const reason of ["RUNNER_EXECUTION_FAILED:RUN_COST_ENVELOPE_EXHAUSTED", ...RUN_PATH_SET_REFUSALS]) {
      const h = readOver({ ...FAILED, terminal_reason: reason }, { ...STOPPED, terminal_reason: reason });
      expect((await h.read()).json(), reason).toEqual({ ...FAILED, terminal_reason: reason, quota_used: "SOME" });
      await h.api.close();
    }
  });
});

describe("57e's Ask again link is removed", () => {
  it("no again_of, no askAgainOf and no reader of what a failed question kept for a new ask", () => {
    const api = readFileSync(new URL("../../apps/api/src/index.ts", import.meta.url), "utf8");
    for (const gone of ["again_of", "askAgainOf", "askAgainHandOverOf", "readAskAgainSource", "readAskAgain", "./ask-again.js"]) {
      expect(api.includes(gone), gone).toBe(false);
    }
    expect(existsSync(new URL("../../apps/api/src/ask-again.ts", import.meta.url))).toBe(false);
  });
});
