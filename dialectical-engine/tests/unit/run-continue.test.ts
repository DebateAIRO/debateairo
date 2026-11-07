// V4 start step, Task 57f (the owner's 7 Nov answers, his words: "we need to have a way to continue where it 'broke', and not charge the
// customer again ... Only if we can't re-use, then we need to pay for this ourselves"; cards "Only what never ran" and "Button on the stopped
// page", both Recommended) — A FAILED DEBATE CONTINUES WHERE IT STOPPED, AND THE PERSON PAYS ONLY FOR WHAT NEVER RAN.
//
// POST /v1/runs/{id}/continue, today's month-wall Continue, also continues the person's own FAILED debate when it is continuable: its stop
// was ours, its content is live, it was not set aside by an upload, and it has not been re-opened since it failed. The same work item goes
// back to be claimed and the runner resumes it from what it saved (0119's true resume: every call already answered is replayed, never bought
// again). A call an earlier copy paid for whose answer cannot be re-used is bought again by the copy that continues; the earlier charge is
// then the site's (0164's call waiver), so the person pays each call once, as an unbroken debate would. The FAILED read says `continuable`.
// 57e's `again_of` is gone. Every id, question and figure here is made up.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { RUN_STOPS_NOT_OURS } from "@debateai/battery";
import {
  AskRequestSchema, RUN_CONTINUE_NO_ROOM, RUN_NOT_CONTINUABLE, RunNotContinuedSchema, RunProjectionSchema, createContractClient, type RunProjection
} from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { buildFramedPrompt, type PromptContract, type ProviderCallRequest, type ProviderCallResult, type ProviderGateway } from "@debateai/providers";
import { runFailureRetriesOnce, runnerTerminalFailureReason } from "@debateai/runner";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import {
  continueFailedRun, continueRoomOf, failedRunContinuable, stopIsOurs, type FailedRunContinuePort, type RunContinueFacts, type RunReopenOutcome
} from "../../apps/api/src/run-continue.js";
import { callCreditsOf, createReplayBook, recordedCalls, replayingGateway, type RecordedAttempt } from "../../apps/runner/src/run-replay.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const RUN = "44444444-4444-4444-8444-444444444444";
const OWNER = testHttpIdentity("run-continue-owner");
const STOPPED: RunContinueFacts = Object.freeze({
  state: "FAILED", terminal_reason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", content_live: true, waived: false, settled: false,
  paused: false, reopened: false
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
    for (const reason of ["RUN_SET_ASIDE:BACKSTOP", "RUN_SET_ASIDE:OWNER_STOPPED", "RUN_SETUP_FAILED:COST_RECORD",
      "RUN_SETUP_FAILED:RELEASE_NOT_SERVED", null, ""]) {
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
    expect(failedRunContinuable({ ...STOPPED, terminal_reason: "RUN_SET_ASIDE:BACKSTOP", waived: true })).toBe(false);
    expect(failedRunContinuable({ ...STOPPED, waived: true })).toBe(false);
    expect(failedRunContinuable({ ...STOPPED, paused: true })).toBe(false);
    for (const state of ["NONE", "OPEN", "DONE"] as const) expect(failedRunContinuable({ ...STOPPED, state, reopened: true })).toBe(false);
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
      { ...STOPPED, terminal_reason: "RUNNER_EXECUTION_FAILED:PRIVATE_CONTENT_ERASED" }, { ...STOPPED, waived: true }]) {
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
    expect(Object.keys(RunProjectionSchema.shape).slice(-2)).toEqual(["quota_used", "continuable"]);
    expect(RunProjectionSchema.safeParse({ ...FAILED, continuable: true }).success).toBe(true);
    expect(RunProjectionSchema.safeParse(FAILED).success).toBe(true);
    expect(RunProjectionSchema.safeParse({ ...FAILED, continuable: false }).success).toBe(false);
    expect(RunProjectionSchema.safeParse({ ...FAILED, state: "RUNNING", terminal_reason: null, continuable: true }).success).toBe(false);
    expect(RunProjectionSchema.safeParse({ ...FAILED, reusable: true }).success).toBe(false);
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
