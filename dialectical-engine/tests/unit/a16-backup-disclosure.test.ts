import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { Judge } from "@debateai/judgement";
import { ProviderCallFailedError, type ProviderCallResult, type ProviderGateway } from "@debateai/providers";
import type { RoleAssignment, RoleSeat, SeatCandidate } from "@debateai/scorecard";
import {
  assertRequiredConditionMarkRecords,
  type ServeGateResult
} from "@debateai/serve";
import { TypedDomainError } from "@debateai/kernel";
import {
  BACKUP_MODEL_USED_WORDING,
  backupModelUsedRecords,
  callSynthesisRole,
  backupSwitchEventValue,
  buildAssignedRunSeatBook,
  buildLegacyRunSeatBook,
  createSeatCaller,
  effectiveSynthesisCollapse,
  plannedSeatSlot,
  roleFallbackEventValue,
  withEffectiveDegradedDiversity,
  type BackupAnswer,
  type BackupSwitchRecord,
  type ConfiguredSeatMaker,
  type RouteHealth,
  type RunSeat,
  type SeatMember
} from "@debateai/runner";

/**
 * Model scorecard A16c — the runner DISCLOSES every switch to a backup and
 * derives DEGRADED-DIVERSITY from who actually answered.
 *
 * The brief's record text named the seat, the role, both routes, the cause and
 * the call-site key. Controller carry 15 (the owners' no-internals rule) forbids
 * that in anything the answer drawer shows an END USER, so these tests pin the
 * opposite: plain words, one record per KIND of stand-in (carry 12 gives the
 * runner-up → main direction its own wording), distinct subjects. The internals
 * live in the progress stream's switch events and on the ledger rows.
 */
const SWITCH: BackupSwitchRecord = {
  role: "ANSWER_WRITER", seatIndex: 0, fromProviderRef: "provider:a", fromCandidateId: "candidate:a",
  toProviderRef: "provider:b", toCandidateId: "candidate:b", cause: "USAGE_CAP",
  callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1:seat:main"
};

const TO_RUNNER_UP: BackupAnswer = {
  role: "SUPPORT_ATTACK", seatIndex: 0, callSiteKey: "JUDGE:defender:root0:r1:p0:seat:runnerUp",
  plannedSlot: "MAIN", answeredSlot: "RUNNER_UP", providerRef: "provider:b"
};
const TO_MAIN: BackupAnswer = {
  role: "JUDGE", seatIndex: 1, callSiteKey: "PANEL:root:provider:a:seat:main",
  plannedSlot: "RUNNER_UP", answeredSlot: "MAIN", providerRef: "provider:a"
};

/** Words an end user must never read in this mark's record (carry 15). */
const INTERNALS = [
  /provider:/u, /candidate:/u, /seat/iu, /runner-?up/iu, /\bmain\b/iu, /\brole\b/iu, /POSITION|SUPPORT_ATTACK|CROSS_EXCHANGE|JUDGE|REVIEWER|ANSWER_WRITER|ANSWER_CHECKER/u,
  /TRANSPORT_FAILURE|USAGE_CAP|ABSENT_AT_CLAIM|SPENT_ON_EARLIER_PASS/u, /[A-Z]+_[A-Z_]+/u, /:/u, /#/u
] as const;

function userFacingText(record: { readonly scope: string; readonly subjectRef: string; readonly reason: string; readonly liftPath: string | null }): readonly string[] {
  return [record.scope, record.subjectRef, record.reason, record.liftPath ?? ""];
}

/** Only the members these helpers read; the rest of a result is irrelevant to them. */
function resultWith(conditionMarks: readonly string[], crashClass: ServeGateResult["crashClass"] = null): ServeGateResult {
  return { conditionMarks, degradedDiversity: null, crashClass } as unknown as ServeGateResult;
}

describe("A16c · the answer discloses a stand-in in plain words (carries 8, 12, 15)", () => {
  it("mints one record when a runner-up answered for its main — no seat, role, route, key or cause in any field the drawer shows", () => {
    const records = backupModelUsedRecords({ answers: [TO_RUNNER_UP, { ...TO_RUNNER_UP, seatIndex: 1 }], fallbackRoles: [] }, "node:served");
    expect(records).toEqual([{
      mark: "BACKUP-MODEL-USED", scope: "answer",
      subjectRef: BACKUP_MODEL_USED_WORDING.STAND_IN.subject,
      reason: BACKUP_MODEL_USED_WORDING.STAND_IN.reason,
      liftPath: BACKUP_MODEL_USED_WORDING.STAND_IN.liftPath,
      servedRootRule: null, affectedNodeIds: ["node:served"], callSiteKey: null, terminalTransportOutcome: null
    }]);
    for (const text of userFacingText(records[0]!)) {
      for (const forbidden of INTERNALS) expect(text).not.toMatch(forbidden);
    }
    expect(() => assertRequiredConditionMarkRecords(["BACKUP-MODEL-USED"], records)).not.toThrow();
  });

  it("gives the runner-up → main direction its own wording and subject (carry 12)", () => {
    const records = backupModelUsedRecords({ answers: [TO_MAIN], fallbackRoles: [] }, "node:served");
    expect(records.map((record) => [record.subjectRef, record.reason, record.liftPath])).toEqual([[
      BACKUP_MODEL_USED_WORDING.USUAL.subject, BACKUP_MODEL_USED_WORDING.USUAL.reason, BACKUP_MODEL_USED_WORDING.USUAL.liftPath
    ]]);
    for (const text of userFacingText(records[0]!)) {
      for (const forbidden of INTERNALS) expect(text).not.toMatch(forbidden);
    }
  });

  it("mints both kinds with DISTINCT subjects (the drawer keys on mark + subject), and nothing when nobody stood in", () => {
    const both = backupModelUsedRecords({ answers: [TO_MAIN, TO_RUNNER_UP, TO_MAIN], fallbackRoles: [] }, "node:served");
    expect(both.map((record) => record.subjectRef)).toEqual([
      BACKUP_MODEL_USED_WORDING.STAND_IN.subject, BACKUP_MODEL_USED_WORDING.USUAL.subject
    ]);
    expect(new Set(both.map((record) => `${record.mark}:${record.subjectRef}`)).size).toBe(2);
    expect(backupModelUsedRecords({ answers: [], fallbackRoles: [] }, "node:served")).toEqual([]);
  });

  it("discloses a role whose planned models were all unavailable, so the debaters answered it (carry 8d)", () => {
    expect(backupModelUsedRecords({ answers: [], fallbackRoles: ["JUDGE"] }, "node:served").map((record) => record.subjectRef))
      .toEqual([BACKUP_MODEL_USED_WORDING.STAND_IN.subject]);
  });

  it("keeps every user-facing sentence plain: no code, no key, no seat vocabulary", () => {
    for (const wording of Object.values(BACKUP_MODEL_USED_WORDING)) {
      for (const text of [wording.subject, wording.reason, wording.liftPath]) {
        expect(text.trim().length).toBeGreaterThan(0);
        for (const forbidden of INTERNALS) expect(text).not.toMatch(forbidden);
      }
    }
  });
});

describe("A16c · the progress-stream values carry the internals (owner/admin side)", () => {
  it("shapes the lifecycle value for one switch", () => {
    expect(backupSwitchEventValue(SWITCH)).toEqual({
      state: "BACKUP_MODEL_ENGAGED", role: "ANSWER_WRITER", seat_index: 0,
      from_provider_ref: "provider:a", to_provider_ref: "provider:b", cause: "USAGE_CAP",
      call_site_key: "COMPOSER:SYNTHESIZER:INITIAL:1:seat:main"
    });
    expect(backupSwitchEventValue({ ...SWITCH, role: "POSITION", cause: "ABSENT_AT_CLAIM", callSiteKey: null }))
      .toMatchObject({ role: "POSITION", cause: "ABSENT_AT_CLAIM", call_site_key: null });
  });

  it("shapes the value for a role that fell back to the debaters (carry 8d)", () => {
    const pinnedSeats: readonly RoleSeat[] = [pinned(0, "x", "y", 0.2), pinned(1, "z", null)];
    const book = buildAssignedRunSeatBook({
      assignment: assignmentWith({ POSITION: [pinned(0, "a", "b", 0.2), pinned(1, "c", null)], JUDGE: pinnedSeats }),
      configured: makers("a", "b", "c"),
      routeHealth: healthy("a", "b", "c")
    });
    expect(book.fallbackRoles).toContain("JUDGE");
    expect(roleFallbackEventValue("JUDGE", pinnedSeats, book.book.judge)).toEqual({
      state: "ROLE_FELL_BACK_TO_DEBATERS", role: "JUDGE",
      from_provider_refs: ["provider:x", "provider:y", "provider:z"],
      to_provider_refs: ["provider:a", "provider:b", "provider:c"],
      cause: "ABSENT_AT_CLAIM"
    });
  });
});

function okGateway(label: string): ProviderGateway {
  return {
    call: async (): Promise<ProviderCallResult> => ({
      rawArtifactRef: `artifact:${label}`, ledgerEntryRef: `ledger:${label}`, content: "{}",
      provider: "openai-compatible-http", model: `model:${label}`, maker: `maker:${label}`, modelVersion: `model:${label}`
    })
  };
}

function configured(label: string): ConfiguredSeatMaker {
  const provider = okGateway(label);
  return { judge: new Judge(provider), provider, providerRef: `provider:${label}`, maker: `maker:${label}` };
}

function candidate(label: string): SeatCandidate {
  return { candidateId: `candidate:${label}`, providerRef: `provider:${label}`, maker: `maker:${label}`, modelId: `model:${label}`, thinkingLevel: "DEFAULT_ONLY" };
}

function pinned(seatIndex: number, main: string, runnerUp: string | null, diversityShare = runnerUp === null ? 0 : 0.2): RoleSeat {
  return { seatIndex, main: candidate(main), runnerUp: runnerUp === null ? null : candidate(runnerUp), diversityShare, source: "SCORECARD" };
}

function healthy(...labels: string[]): Map<string, RouteHealth> {
  return new Map<string, RouteHealth>(labels.map((label) => [`provider:${label}`, { state: "HEALTHY" }]));
}

function makers(...labels: string[]): ReadonlyMap<string, ConfiguredSeatMaker> {
  return new Map(labels.map((label) => [`provider:${label}`, configured(label)]));
}

function assignmentWith(roles: Partial<RoleAssignment["roles"]>): RoleAssignment {
  return {
    scorecardVersion: 7,
    strength: "BALANCED",
    roles: {
      POSITION: [pinned(0, "a", null)], SUPPORT_ATTACK: [], CROSS_EXCHANGE: [], JUDGE: [], REVIEWER: [],
      ANSWER_WRITER: [pinned(0, "a", null)], ANSWER_CHECKER: [pinned(0, "b", null)],
      ...roles
    }
  };
}

/** A JUDGE seat, main `a`, runner-up `b`; share 0 makes the runner-up its backup only. */
function judgeSeat(diversityShare = 0): RunSeat {
  return buildAssignedRunSeatBook({
    assignment: assignmentWith({ JUDGE: [pinned(0, "a", "b", diversityShare)] }),
    configured: makers("a", "b"),
    routeHealth: healthy("a", "b")
  }).book.judge[0]!;
}

const transportFailure = (): ProviderCallFailedError =>
  new ProviderCallFailedError(new Error("socket hang up"), 3, "FAILED", "ledger:failed");

function scripted(outcomes: Readonly<Record<string, () => string>>) {
  const calls: string[] = [];
  const call = async (member: SeatMember, callSiteKey: string): Promise<string> => {
    calls.push(`${member.providerRef}@${callSiteKey}`);
    return outcomes[member.providerRef]!();
  };
  return { calls, call };
}
const fails = (): string => { throw transportFailure(); };
const answers = (value: string) => (): string => value;

/** The first site `site:<n>` the seat's split names for `slot`. */
function siteFor(seat: RunSeat, slot: "MAIN" | "RUNNER_UP"): string {
  for (let index = 0; ; index += 1) {
    if (plannedSeatSlot(seat, `site:${String(index)}`, { runId: null }) === slot) return `site:${String(index)}`;
  }
}

describe("A16c · the seat caller counts every site a stand-in ANSWERED (carries 8a–c, 9, 12, 13)", () => {
  it("8a: an in-call switch to the runner-up is one switch, one event, and one stand-in answer", async () => {
    const events: string[] = [];
    const caller = createSeatCaller({ assigned: true, onSwitch: async (record) => { events.push(record.cause); } });
    const script = scripted({ "provider:a": fails, "provider:b": answers("b") });
    await caller.callSeat({ seat: judgeSeat(), callSiteKey: "k", call: script.call });
    expect(events).toEqual(["TRANSPORT_FAILURE"]);
    expect(caller.switches()).toHaveLength(1);
    expect(caller.backupAnswers()).toEqual([{
      role: "JUDGE", seatIndex: 0, callSiteKey: "k:seat:runnerUp", plannedSlot: "MAIN", answeredSlot: "RUNNER_UP", providerRef: "provider:b"
    }]);
  });

  it("12: a runner-up the split picked that fails is answered by its main — the answer's USUAL direction", async () => {
    const seat = judgeSeat(0.2);
    const site = siteFor(seat, "RUNNER_UP");
    const caller = createSeatCaller({ assigned: true });
    await caller.callSeat({ seat, callSiteKey: site, call: scripted({ "provider:a": answers("a"), "provider:b": fails }).call });
    expect(caller.backupAnswers().map((answer) => [answer.plannedSlot, answer.answeredSlot])).toEqual([["RUNNER_UP", "MAIN"]]);
  });

  it("a split is not a stand-in: the runner-up it picked answers, and nothing is disclosed", async () => {
    const seat = judgeSeat(0.2);
    const caller = createSeatCaller({ assigned: true });
    await caller.callSeat({ seat, callSiteKey: siteFor(seat, "RUNNER_UP"), call: scripted({ "provider:a": answers("a"), "provider:b": answers("b") }).call });
    expect([caller.switches(), caller.backupAnswers()]).toEqual([[], []]);
  });

  it("a fairness rule is not a stand-in: a planned member of the author's maker is passed over silently", async () => {
    const caller = createSeatCaller({ assigned: true });
    const barred = (member: { readonly maker: string }): boolean => member.maker !== "maker:a";
    await caller.callSeat({ seat: judgeSeat(), callSiteKey: "k", eligible: barred, fair: barred, call: scripted({ "provider:a": answers("a"), "provider:b": answers("b") }).call });
    expect([caller.switches(), caller.backupAnswers()]).toEqual([[], []]);
  });

  it("8b: a runner-up promoted at claim answers a site planned for its main — a stand-in answer beside the claim switch", async () => {
    const book = buildAssignedRunSeatBook({
      assignment: assignmentWith({ POSITION: [pinned(0, "a", "b", 0)] }),
      configured: makers("a", "b"),
      routeHealth: new Map<string, RouteHealth>([["provider:a", { state: "ABSENT", failureCode: "CLAIM_PROVIDER_ABSENT" }], ["provider:b", { state: "HEALTHY" }]])
    });
    const caller = createSeatCaller({ assigned: true, claimSwitches: book.claimSwitches });
    await caller.callSeat({ seat: book.book.position[0]!, callSiteKey: "JUDGE", call: scripted({ "provider:b": answers("b") }).call });
    expect(caller.switches().map((record) => record.cause)).toEqual(["ABSENT_AT_CLAIM"]);
    expect(caller.backupAnswers()).toEqual([{
      role: "POSITION", seatIndex: 0, callSiteKey: "JUDGE:seat:runnerUp", plannedSlot: "MAIN", answeredSlot: "RUNNER_UP", providerRef: "provider:b"
    }]);
  });

  it("8c: a switch a resumed pass makes through the ledger is recorded and announced BEFORE the other member answers", async () => {
    const events: string[] = [];
    const caller = createSeatCaller({
      assigned: true,
      onSwitch: async (record) => { events.push(`switch:${record.cause}:${String(record.callSiteKey)}`); }
    });
    const script = scripted({ "provider:a": answers("never"), "provider:b": () => { events.push("b-called"); return "b"; } });
    const spentMain = (member: SeatMember): boolean => member.pinnedAs !== "MAIN";
    const ledgerMove = { from: "MAIN" as const, callSiteKey: "k:seat:main" };
    await caller.callSeat({ seat: judgeSeat(), callSiteKey: "k", eligible: spentMain, ledgerMove, call: script.call });
    expect(events).toEqual(["switch:SPENT_ON_EARLIER_PASS:k:seat:main", "b-called"]);
    expect(caller.switches()).toEqual([{
      role: "JUDGE", seatIndex: 0, fromProviderRef: "provider:a", fromCandidateId: "candidate:a",
      toProviderRef: "provider:b", toCandidateId: "candidate:b", cause: "SPENT_ON_EARLIER_PASS", callSiteKey: "k:seat:main"
    } satisfies BackupSwitchRecord]);
    expect(caller.backupAnswers().map((answer) => answer.answeredSlot)).toEqual(["RUNNER_UP"]);
    // One switch per seat slot per pass: a second site the ledger moves the same way adds no record and no event.
    await caller.callSeat({ seat: judgeSeat(), callSiteKey: "k2", eligible: spentMain, ledgerMove: { ...ledgerMove, callSiteKey: "k2:seat:main" }, call: script.call });
    expect(caller.switches()).toHaveLength(1);
    expect(events.filter((event) => event.startsWith("switch:"))).toHaveLength(1);
    // ...while the answer still counts the second site the stand-in answered.
    expect(caller.backupAnswers()).toHaveLength(2);
  });

  it("13: a site an EARLIER pass switched is answered by the same stand-in again — disclosed on the answer, never a second switch", async () => {
    const events: string[] = [];
    const caller = createSeatCaller({ assigned: true, onSwitch: async (record) => { events.push(record.cause); } });
    // The ledger preference (A16a): the runner-up answered this site before, so it goes first. No ledger move is passed.
    await caller.callSeat({ seat: judgeSeat(), callSiteKey: "k", prefer: "RUNNER_UP", call: scripted({ "provider:a": answers("a"), "provider:b": answers("b") }).call });
    expect(events).toEqual([]);
    expect(caller.switches()).toEqual([]);
    expect(caller.backupAnswers().map((answer) => [answer.plannedSlot, answer.answeredSlot])).toEqual([["MAIN", "RUNNER_UP"]]);
  });

  it("9/14a: what the answer counts is the member that ANSWERED — a preferred stand-in that fails back to the planned main discloses nothing", async () => {
    const events: string[] = [];
    const caller = createSeatCaller({ assigned: true, onSwitch: async (record) => { events.push(`${record.fromProviderRef}->${record.toProviderRef}`); } });
    const answer = await caller.callSeat({ seat: judgeSeat(), callSiteKey: "k", prefer: "RUNNER_UP", call: scripted({ "provider:a": answers("a"), "provider:b": fails }).call });
    expect(answer.member.providerRef).toBe("provider:a");
    // The call-level switch is real and announced (owner/admin side)...
    expect(events).toEqual(["provider:b->provider:a"]);
    // ...but the planned member wrote the answer, so the answer owes no disclosure.
    expect(caller.backupAnswers()).toEqual([]);
  });

  it("never records a ledger move on the post-cooldown retry, nor when the planned member answers after all", async () => {
    const caller = createSeatCaller({ assigned: true });
    const ledgerMove = { from: "MAIN" as const, callSiteKey: "k:seat:main" };
    // The member the call reaches first IS the planned one (the ledger's exclusion did not bind): no switch.
    await caller.callSeat({ seat: judgeSeat(), callSiteKey: "k", ledgerMove, call: scripted({ "provider:a": answers("a"), "provider:b": answers("b") }).call });
    expect(caller.switches()).toEqual([]);
    // The same site again on this pass is its post-cooldown retry: it never switches. It completes —
    // the runner-up answers under its own key — so the empty switch list below is about a call that ran.
    const onlyB = (member: SeatMember): boolean => member.pinnedAs !== "MAIN";
    await expect(caller.callSeat({ seat: judgeSeat(), callSiteKey: "k", eligible: onlyB, ledgerMove, call: scripted({ "provider:a": answers("a"), "provider:b": answers("b") }).call }))
      .resolves.toMatchObject({ value: "b", callSiteKey: "k:seat:runnerUp" });
    expect(caller.switches()).toEqual([]);
  });

  it("keeps the legacy book silent: no pinned seat, so nothing is ever a stand-in", async () => {
    const caller = createSeatCaller({ assigned: false });
    await caller.callSeat({ seat: buildLegacyRunSeatBook([configured("a")]).position[0]!, callSiteKey: "JUDGE", call: async () => "a" });
    expect([caller.switches(), caller.backupAnswers()]).toEqual([[], []]);
  });

  it("plans exactly the member the call reaches first when nothing else intervenes", async () => {
    const seat = judgeSeat(0.2);
    for (const slot of ["MAIN", "RUNNER_UP"] as const) {
      const site = siteFor(seat, slot);
      expect(createSeatCaller({ assigned: true }).plan(seat, site)?.pinnedAs).toBe(slot);
    }
  });
});

describe("A16c · DEGRADED-DIVERSITY from the writer and checker that ACTUALLY answered", () => {
  it("finds the identity that answered for both roles, deterministically", () => {
    expect(effectiveSynthesisCollapse(["provider:a"], ["provider:b"])).toBeNull();
    expect(effectiveSynthesisCollapse(["provider:a", "provider:b"], ["provider:b"])).toBe("provider:b");
    expect(effectiveSynthesisCollapse(["provider:c", "provider:b"], ["provider:c", "provider:b"])).toBe("provider:b");
    expect(effectiveSynthesisCollapse([], ["provider:b"])).toBeNull();
  });

  it("adds the mark and its detail for a collapse the plan did not predict", () => {
    const result = withEffectiveDegradedDiversity(resultWith(["LABEL-BASIS-INCOMPLETE"]), "provider:b");
    expect(result.conditionMarks).toEqual(["LABEL-BASIS-INCOMPLETE", "DEGRADED-DIVERSITY"]);
    expect(result.degradedDiversity).toEqual({ roles: ["SYNTHESIZER", "EVALUATOR"], identity: "provider:b" });
  });

  it("removes a planned collapse a backup undid, and keeps an existing mark where it stands", () => {
    expect(withEffectiveDegradedDiversity(resultWith(["DEGRADED-DIVERSITY", "SINGLE-LINEAGE"]), null))
      .toMatchObject({ conditionMarks: ["SINGLE-LINEAGE"], degradedDiversity: null });
    expect(withEffectiveDegradedDiversity(resultWith(["DEGRADED-DIVERSITY", "SINGLE-LINEAGE"]), "provider:a").conditionMarks)
      .toEqual(["DEGRADED-DIVERSITY", "SINGLE-LINEAGE"]);
  });

  it("leaves a crash answer alone: the mark is a property of a SERVED answer (W2), and a crash serves none", () => {
    const crashed = resultWith(["ENVELOPE_EXHAUSTED"], "ENVELOPE_EXHAUSTED");
    expect(withEffectiveDegradedDiversity(crashed, "provider:b")).toBe(crashed);
  });
});

describe("A16c fix round 1 (Minor 6) · a bare usage cap that leaves a synthesis seat is a dead transport", () => {
  const site = { role: "SYNTHESIZER" as const, callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1:seat:main" };

  it("maps a bare PROVIDER_USAGE_CAP to SYNTHESIS_TRANSPORT_DEATH, naming the role and the call site", async () => {
    const capped = callSynthesisRole(async () => {
      throw new TypedDomainError("PROVIDER_USAGE_CAP", "subscription usage cap reached");
    }, site, "COMPOSITION_CONTRACT_ERROR");
    await expect(capped).rejects.toBeInstanceOf(TypedDomainError);
    await expect(capped).rejects.toMatchObject({
      code: "SYNTHESIS_TRANSPORT_DEATH",
      message: "SYNTHESIZER hit a subscription usage cap at COMPOSER:SYNTHESIZER:INITIAL:1:seat:main"
    });
  });

  it("leaves any other typed failure exactly as it arrived", async () => {
    const other = new TypedDomainError("CALL_BUDGET_EXHAUSTED", "site");
    await expect(callSynthesisRole(async () => { throw other; }, site, "COMPOSITION_CONTRACT_ERROR")).rejects.toBe(other);
  });
});

describe("A16c · carry 16 — the 80-20 ordinal has ONE site-pure path, synthesis included", () => {
  it("adds no POSITION ordinal, no call-index ordinal and no run-wide hash; synthesis hashes its role's run-level site", async () => {
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    expect(source).not.toContain("positionOrdinal");
    expect(source).not.toContain("#POSITION#");
    expect(source).not.toContain("diversityOrdinalForRun");
    expect(source).toContain("const synthesisOrdinal = (seat: RunSeat): number => seatSiteOrdinal({");
    // One site per run and role — the sites the serve chain's role controls are planned at — never a round's key.
    expect(source).toContain('callSiteKey: seat.role === "ANSWER_CHECKER" ? "POST_COMPOSE_R9:EVALUATOR" : "COMPOSER:SYNTHESIZER"');
    // Every synthesis call and plan reads it through `synthesisSeatOptions`.
    expect(source).toContain("const ordinal = synthesisOrdinal(seat);");
    expect(source).not.toMatch(/const synthesisOrdinal = 0/u);
  });
});
