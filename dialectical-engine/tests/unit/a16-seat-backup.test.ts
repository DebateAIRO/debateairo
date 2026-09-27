import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Judge, PanelMemberFailure } from "@debateai/judgement";
import { TypedDomainError, type DebateRole } from "@debateai/kernel";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway
} from "@debateai/providers";
import { selectSeatCandidate, type RoleAssignment, type RoleSeat, type SeatCandidate } from "@debateai/scorecard";
import {
  buildAssignedRunSeatBook,
  buildLegacyRunSeatBook,
  createSeatCaller,
  seatFailureCause,
  seatSiteOrdinal,
  withCooldownRetry,
  type BackupSwitchRecord,
  type ConfiguredSeatMaker,
  type RouteHealth,
  type RunSeat,
  type RunSeatBook,
  type SeatCaller,
  type SeatMember
} from "@debateai/runner";

/**
 * Model scorecard A16 — owner rulings R3 (80-20) and R4 (which failures move a
 * seat to its runner-up). Every trigger AND every non-trigger is a row here.
 *
 * A16a deviates from the plan's brief in one place, by controller carry 1: the
 * 80-20 ordinal is a PURE FUNCTION OF THE SITE (`seatSiteOrdinal`: the run, the
 * seat and the site's base key), never the call index within a seat — a visit
 * counter resets on restart and breaks DR-184-v5's exactness. The brief's
 * "every fifth call" cases are therefore stated against that function.
 */
const transportFailure = (): ProviderCallFailedError =>
  new ProviderCallFailedError(new Error("socket hang up"), 3, "FAILED", "ledger:failed");
const transportTimeout = (): ProviderCallFailedError =>
  new ProviderCallFailedError(new Error("deadline"), 3, "TIMED_OUT", "ledger:timeout");
const usageCap = (): TypedDomainError => new TypedDomainError("PROVIDER_USAGE_CAP", "subscription usage cap reached");
const packetTooLarge = (): ProviderCallFailedError =>
  new ProviderCallFailedError(new TypedDomainError("PROVIDER_PACKET_TOO_LARGE", "big"), 1, "FAILED", "ledger:big");

const PANEL_ASSESSMENT = JSON.stringify({
  steelman: { summary: "Assessed.", fidelity: 0.5 },
  critic: { summary: "Countered.", counterargumentStrength: 0.5, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.5, relevance: 0.5 },
  context: { fit: 0.5, ambiguityFlags: [] },
  fallacy: { severity: 0.5, fatalFlags: [] }
});

function okGateway(label: string, requests: ProviderCallRequest[] = [], content = "{}"): ProviderGateway {
  return {
    call: async (request): Promise<ProviderCallResult> => {
      requests.push(request);
      return {
        rawArtifactRef: `artifact:${label}`, ledgerEntryRef: `ledger:${label}`, content,
        provider: "openai-compatible-http", model: `model:${label}`, maker: `maker:${label}`, modelVersion: `model:${label}`
      };
    }
  };
}

function configured(label: string, provider: ProviderGateway = okGateway(label)): ConfiguredSeatMaker {
  return { judge: new Judge(provider), provider, providerRef: `provider:${label}`, maker: `maker:${label}` };
}

function candidate(label: string, thinkingLevel = "DEFAULT_ONLY"): SeatCandidate {
  return { candidateId: `candidate:${label}`, providerRef: `provider:${label}`, maker: `maker:${label}`, modelId: `model:${label}`, thinkingLevel };
}

// RoleAssignmentSchema's law: no runner-up, no share (pre-flight fix F2). A seat
// WITH a runner-up may pass 0: the runner-up is then its backup only.
function pinned(seatIndex: number, main: string, runnerUp: string | null, diversityShare = runnerUp === null ? 0 : 0.2): RoleSeat {
  return { seatIndex, main: candidate(main), runnerUp: runnerUp === null ? null : candidate(runnerUp), diversityShare, source: "SCORECARD" };
}

function healthy(...labels: string[]): ReadonlyMap<string, RouteHealth> {
  return new Map<string, RouteHealth>(labels.map((label) => [`provider:${label}`, { state: "HEALTHY" }]));
}

function makers(...entries: ConfiguredSeatMaker[]): ReadonlyMap<string, ConfiguredSeatMaker> {
  return new Map(entries.map((entry) => [entry.providerRef, entry]));
}

/**
 * One JUDGE seat: main `a`, runner-up `b` (the POSITION seat only makes the
 * assignment seatable). Every call builds the book afresh, as a claim does.
 */
function judgeSeat(diversityShare = 0.2): RunSeat {
  const assignment: RoleAssignment = {
    scorecardVersion: 7,
    strength: "BALANCED",
    roles: {
      POSITION: [pinned(0, "a", null)], SUPPORT_ATTACK: [], CROSS_EXCHANGE: [],
      JUDGE: [pinned(0, "a", "b", diversityShare)], REVIEWER: [],
      ANSWER_WRITER: [pinned(0, "a", null)], ANSWER_CHECKER: [pinned(0, "b", null)]
    }
  };
  return buildAssignedRunSeatBook({
    assignment, configured: makers(configured("a"), configured("b")), routeHealth: healthy("a", "b")
  }).book.judge[0]!;
}

/** The backup cases hold the split out of the way: share 0 makes the runner-up the backup only. */
const backupOnlySeat = (): RunSeat => judgeSeat(0);

/** A seat call whose members fail or answer by route. */
function scripted(outcomes: Readonly<Record<string, () => never | string>>) {
  const calls: string[] = [];
  const call = async (member: SeatMember, callSiteKey: string): Promise<string> => {
    calls.push(`${member.providerRef}@${callSiteKey}`);
    return outcomes[member.providerRef]!();
  };
  return { calls, call };
}
const throws = (make: () => unknown) => (): never => { throw make(); };
const answers = (value: string) => (): string => value;

describe("A16 · R4 — which failures move a seat to its runner-up", () => {
  it.each([
    ["a transport failure after the normal retries", transportFailure(), "TRANSPORT_FAILURE"],
    ["a transport timeout after the normal retries", transportTimeout(), "TRANSPORT_FAILURE"],
    ["a subscription usage cap", usageCap(), "USAGE_CAP"],
    ["a usage cap carried as the cause of a transport failure",
      new ProviderCallFailedError(usageCap(), 1, "FAILED", "ledger:cap"), "USAGE_CAP"],
    ["a panel member's timeout, wrapped around the transport failure",
      new PanelMemberFailure("TIMEOUT", "PROVIDER_CALL_FAILED:TIMED_OUT", { cause: transportTimeout() }), "TRANSPORT_FAILURE"],
    ["a panel member's provider error, wrapped around a usage cap",
      new PanelMemberFailure("PROVIDER_ERROR", "cap", { cause: usageCap() }), "USAGE_CAP"]
  ] as const)("switches on %s", (_label, error, cause) => {
    expect(seatFailureCause(error)).toBe(cause);
  });

  it.each([
    ["a wrong-format answer (content refused after the repair loop)",
      new ProviderContentUnacceptedError(3, "SCHEMA_FAILED", "bad", "artifact:x", "ledger:x")],
    ["a judge schema failure", new TypedDomainError("JUDGE_SCHEMA_FAILURE", "bad")],
    ["a panel member's schema failure", new PanelMemberFailure("SCHEMA_FAILURE", "bad")],
    ["a panel member's parse failure", new PanelMemberFailure("PARSE_FAILURE", "prose")],
    ["the run's money ceiling", new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "money")],
    ["the application's daily ceiling", new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "day")],
    ["the run's attempt ceiling", new TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", "attempts")],
    ["a panel member wrapped around the attempt ceiling",
      new PanelMemberFailure("PROVIDER_ERROR", "attempts", { cause: new TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", "attempts") })],
    ["a transport failure whose cause is the run's money ceiling (the RUN's stop, V-28)",
      new ProviderCallFailedError(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "money"), 1, "FAILED", "ledger:money")],
    ["an unsupported thinking level", new TypedDomainError("PROVIDER_THINKING_LEVEL_UNSUPPORTED", "level")],
    ["a context window the prompt cannot fit", new TypedDomainError("PROVIDER_CONTEXT_WINDOW_EXCEEDED", "window")],
    ["a changed model identity", new TypedDomainError("PROVIDER_MODEL_IDENTITY_CHANGED", "model")],
    ["an oversized packet, which is as large on any route (pre-flight fix F12)", packetTooLarge()],
    ["an exhausted per-site allowance", new TypedDomainError("CALL_BUDGET_EXHAUSTED", "site")],
    ["a panel member wrapped around an exhausted per-site allowance",
      new PanelMemberFailure("PROVIDER_ERROR", "site", { cause: new TypedDomainError("CALL_BUDGET_EXHAUSTED", "site") })],
    ["a plain error", new Error("boom")]
  ] as const)("never switches on %s", (_label, error) => {
    expect(seatFailureCause(error)).toBeNull();
  });

  it("keeps the provider failure as the cause Judge.assess wraps", async () => {
    const failing = (error: unknown): ProviderGateway => ({ call: async () => { throw error; } });
    const input = {
      runId: null, subjectItemId: "work:a16", callSiteKey: "PANEL:root:provider:a", questionLine: "Q?",
      statement: "S.", authorMaker: "maker:z", providerRef: "provider:a", contractHash: "c".repeat(64),
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 1_000 }
    };
    const timeout = transportTimeout();
    const assessedTimeout = await new Judge(failing(timeout)).assess(input).catch((error: unknown) => error);
    expect(assessedTimeout).toBeInstanceOf(PanelMemberFailure);
    expect(assessedTimeout).toMatchObject({ failureKind: "TIMEOUT", message: "PROVIDER_CALL_FAILED:TIMED_OUT" });
    expect((assessedTimeout as PanelMemberFailure).cause).toBe(timeout);
    expect(seatFailureCause(assessedTimeout)).toBe("TRANSPORT_FAILURE");
    const assessedCap = await new Judge(failing(usageCap())).assess(input).catch((error: unknown) => error);
    expect(seatFailureCause(assessedCap)).toBe("USAGE_CAP");
    const boom = new Error("boom");
    const assessedBoom = await new Judge(failing(boom)).assess(input).catch((error: unknown) => error);
    expect(assessedBoom).toMatchObject({ failureKind: "PROVIDER_ERROR", message: "boom", cause: boom });
    expect(seatFailureCause(assessedBoom)).toBeNull();
  });
});

describe("A16 · callSeat — backup", () => {
  it("switches to the runner-up after a transport failure, records the switch first, and keys the backup its own", async () => {
    const seat = backupOnlySeat();
    const events: string[] = [];
    const caller = createSeatCaller({
      assigned: true,
      onSwitch: async (record) => { events.push(`switch:${record.cause}:${record.callSiteKey ?? "claim"}`); }
    });
    const script = scripted({
      "provider:a": throws(transportFailure),
      "provider:b": () => { events.push("backup-called"); return "judged-by-b"; }
    });
    const answer = await caller.callSeat({
      seat, callSiteKey: "PANEL:root", keyFor: (member) => `PANEL:root:${member.providerRef}`, call: script.call
    });
    expect(answer).toMatchObject({ value: "judged-by-b", callSiteKey: "PANEL:root:provider:b:seat:runnerUp" });
    expect(answer.member.providerRef).toBe("provider:b");
    expect(script.calls).toEqual([
      "provider:a@PANEL:root:provider:a:seat:main", "provider:b@PANEL:root:provider:b:seat:runnerUp"
    ]);
    expect(events).toEqual(["switch:TRANSPORT_FAILURE:PANEL:root:provider:a:seat:main", "backup-called"]);
    expect(caller.switches()).toEqual([{
      role: "JUDGE", seatIndex: 0, fromProviderRef: "provider:a", fromCandidateId: "candidate:a",
      toProviderRef: "provider:b", toCandidateId: "candidate:b", cause: "TRANSPORT_FAILURE",
      callSiteKey: "PANEL:root:provider:a:seat:main"
    } satisfies BackupSwitchRecord]);
    expect(caller.answered("JUDGE")).toEqual(["provider:b"]);
  });

  it("switches immediately on a usage cap: the main is called exactly once", async () => {
    const script = scripted({ "provider:a": throws(usageCap), "provider:b": answers("ok") });
    const caller = createSeatCaller({ assigned: true });
    await expect(caller.callSeat({ seat: backupOnlySeat(), callSiteKey: "k", call: script.call }))
      .resolves.toMatchObject({ value: "ok" });
    expect(script.calls.filter((entry) => entry.startsWith("provider:a"))).toHaveLength(1);
    expect(caller.switches().map((record) => record.cause)).toEqual(["USAGE_CAP"]);
  });

  it.each([
    ["a schema failure", () => new TypedDomainError("JUDGE_SCHEMA_FAILURE", "bad")],
    ["a content refusal", () => new ProviderContentUnacceptedError(3, "SCHEMA_FAILED", "bad", "artifact:x", "ledger:x")],
    ["the run's money ceiling", () => new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "money")],
    ["the run's attempt ceiling", () => new TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", "attempts")],
    ["an unsupported thinking level", () => new TypedDomainError("PROVIDER_THINKING_LEVEL_UNSUPPORTED", "level")],
    ["an oversized packet", packetTooLarge],
    ["an exhausted per-site allowance", () => new TypedDomainError("CALL_BUDGET_EXHAUSTED", "site")]
  ] as const)("never moves the seat on %s: the failure leaves unchanged and the runner-up is not called", async (_label, make) => {
    const error = make();
    const script = scripted({ "provider:a": () => { throw error; }, "provider:b": answers("never") });
    const caller = createSeatCaller({ assigned: true });
    await expect(caller.callSeat({ seat: backupOnlySeat(), callSiteKey: "k", call: script.call })).rejects.toBe(error);
    expect(script.calls).toEqual(["provider:a@k:seat:main"]);
    expect(caller.switches()).toEqual([]);
  });

  it("keeps today's behaviour without a runner-up: the transport failure leaves unchanged", async () => {
    const failure = transportFailure();
    const legacy = buildLegacyRunSeatBook([configured("a")]).position[0]!;
    const caller = createSeatCaller({ assigned: false });
    await expect(caller.callSeat({ seat: legacy, callSiteKey: "JUDGE", call: async () => { throw failure; } }))
      .rejects.toBe(failure);
    expect(caller.switches()).toEqual([]);
  });

  it("keeps today's behaviour at a usage cap without a runner-up: the wrapped cap leaves unchanged (F11)", async () => {
    // The gateway delivers a cap as PROVIDER_CALL_FAILED with the cap as its cause (A7b, pre-flight
    // ruling F11), so a legacy caller's existing ProviderCallFailedError handling halts the member,
    // exactly as a relay failure does today, instead of ending the run.
    const capped = new ProviderCallFailedError(usageCap(), 1, "FAILED", "ledger:cap");
    const legacy = buildLegacyRunSeatBook([configured("a")]).position[0]!;
    const caller = createSeatCaller({ assigned: false });
    await expect(caller.callSeat({ seat: legacy, callSiteKey: "JUDGE", call: async () => { throw capped; } }))
      .rejects.toBe(capped);
    expect(caller.switches()).toEqual([]);
  });

  it("records the switch on the first call that skips a main downed while its runner-up was barred (F12)", async () => {
    const seat = backupOnlySeat();
    const events: string[] = [];
    const failure = transportFailure();
    const script = scripted({
      "provider:a": () => { throw failure; },
      "provider:b": () => { events.push("backup-called"); return "b"; }
    });
    const caller = createSeatCaller({
      assigned: true,
      onSwitch: async (record) => { events.push(`switch:${record.fromProviderRef}->${record.toProviderRef}`); }
    });
    // Call 1: the fairness rule bars the runner-up, so the main's failure leaves unchanged and nothing switches.
    await expect(caller.callSeat({
      seat, callSiteKey: "k1", eligible: (member) => member.providerRef !== "provider:b", call: script.call
    })).rejects.toBe(failure);
    expect(caller.switches()).toEqual([]);
    // Call 2: the main is down, so the runner-up answers — that IS the switch, recorded before it answers.
    await expect(caller.callSeat({ seat, callSiteKey: "k2", call: script.call })).resolves.toMatchObject({ value: "b" });
    expect(events).toEqual(["switch:provider:a->provider:b", "backup-called"]);
    expect(caller.switches()).toEqual([{
      role: "JUDGE", seatIndex: 0, fromProviderRef: "provider:a", fromCandidateId: "candidate:a",
      toProviderRef: "provider:b", toCandidateId: "candidate:b", cause: "TRANSPORT_FAILURE",
      callSiteKey: "k1:seat:main"
    } satisfies BackupSwitchRecord]);
    expect(script.calls).toEqual(["provider:a@k1:seat:main", "provider:b@k2:seat:runnerUp"]);
  });

  it("rethrows the runner-up's own failure when both fail, after exactly one switch — and keeps both down", async () => {
    const seat = backupOnlySeat();
    const second = transportTimeout();
    const script = scripted({ "provider:a": throws(transportFailure), "provider:b": () => { throw second; } });
    const caller = createSeatCaller({ assigned: true });
    await expect(caller.callSeat({ seat, callSiteKey: "k", call: script.call })).rejects.toBe(second);
    expect(caller.switches()).toHaveLength(1);
    // Both are down now, so a later site calls the preferred member under its own key — no second switch.
    expect(caller.plan(seat, "k2")?.pinnedAs).toBe("MAIN");
    await expect(caller.callSeat({ seat, callSiteKey: "k2", call: script.call })).rejects.toBeInstanceOf(ProviderCallFailedError);
    expect(script.calls).toEqual(["provider:a@k:seat:main", "provider:b@k:seat:runnerUp", "provider:a@k2:seat:main"]);
    expect(caller.switches()).toHaveLength(1);
  });

  it("does not down a backup whose answer was refused: the schema failure leaves unchanged, the backup answers the next site", async () => {
    // Only a switching cause downs a member; a refused answer from the backup is the backup's answer.
    const seat = backupOnlySeat();
    const refused = new TypedDomainError("JUDGE_SCHEMA_FAILURE", "bad");
    const outcomes: (() => string)[] = [() => { throw refused; }, () => "b"];
    const script = scripted({ "provider:a": throws(transportFailure), "provider:b": () => outcomes.shift()!() });
    const caller = createSeatCaller({ assigned: true });
    await expect(caller.callSeat({ seat, callSiteKey: "k", call: script.call })).rejects.toBe(refused);
    await expect(caller.callSeat({ seat, callSiteKey: "k2", call: script.call })).resolves.toMatchObject({ value: "b" });
    expect(script.calls).toEqual(["provider:a@k:seat:main", "provider:b@k:seat:runnerUp", "provider:b@k2:seat:runnerUp"]);
  });

  it("keeps a failed main down for the rest of the run: later calls go straight to the runner-up", async () => {
    const seat = backupOnlySeat();
    const script = scripted({ "provider:a": throws(transportFailure), "provider:b": answers("ok") });
    const caller = createSeatCaller({ assigned: true });
    await caller.callSeat({ seat, callSiteKey: "k1", call: script.call });
    await caller.callSeat({ seat, callSiteKey: "k2", call: script.call });
    expect(script.calls).toEqual(["provider:a@k1:seat:main", "provider:b@k1:seat:runnerUp", "provider:b@k2:seat:runnerUp"]);
    expect(caller.switches()).toHaveLength(1);
  });

  it("holds a backup to the call's fairness rule: an ineligible runner-up is never called", async () => {
    const failure = transportFailure();
    const script = scripted({ "provider:a": () => { throw failure; }, "provider:b": answers("never") });
    const caller = createSeatCaller({ assigned: true });
    await expect(caller.callSeat({
      seat: backupOnlySeat(), callSiteKey: "k", eligible: (member) => member.providerRef !== "provider:b", call: script.call
    })).rejects.toBe(failure);
    expect(script.calls).toEqual(["provider:a@k:seat:main"]);
  });

  it("reports a switch made at claim with the switches made during calls", async () => {
    const atClaim: BackupSwitchRecord = {
      role: "POSITION", seatIndex: 0, fromProviderRef: "provider:a", fromCandidateId: "candidate:a",
      toProviderRef: "provider:b", toCandidateId: "candidate:b", cause: "ABSENT_AT_CLAIM", callSiteKey: null
    };
    expect(createSeatCaller({ assigned: true, claimSwitches: [atClaim] }).switches()).toEqual([atClaim]);
    const caller = createSeatCaller({ assigned: true, claimSwitches: [atClaim] });
    const script = scripted({ "provider:a": throws(transportFailure), "provider:b": answers("ok") });
    await caller.callSeat({ seat: backupOnlySeat(), callSiteKey: "k", call: script.call });
    expect(caller.switches().map((record) => record.cause)).toEqual(["ABSENT_AT_CLAIM", "TRANSPORT_FAILURE"]);
  });

  it("gives a runner-up chosen by the split the main as ITS backup (R3/R4: each is the other's)", async () => {
    const seat = judgeSeat(0.2);
    const site = sitesWith(seat, "RUNNER_UP", 1)[0]!;
    const script = scripted({ "provider:a": answers("a"), "provider:b": throws(transportFailure) });
    const caller = createSeatCaller({ assigned: true });
    await expect(caller.callSeat({ seat, callSiteKey: site, call: script.call })).resolves.toMatchObject({
      value: "a", callSiteKey: `${site}:seat:main`
    });
    expect(script.calls).toEqual([`provider:b@${site}:seat:runnerUp`, `provider:a@${site}:seat:main`]);
    expect(caller.switches()).toEqual([{
      role: "JUDGE", seatIndex: 0, fromProviderRef: "provider:b", fromCandidateId: "candidate:b",
      toProviderRef: "provider:a", toCandidateId: "candidate:a", cause: "TRANSPORT_FAILURE",
      callSiteKey: `${site}:seat:runnerUp`
    } satisfies BackupSwitchRecord]);
  });
});

/** The ordinal of `site` on `seat`, the one `createSeatCaller` reads (carry 1). */
function viaAt(seat: RunSeat, callSiteKey: string, runId: string | null = null): "MAIN" | "RUNNER_UP" {
  return selectSeatCandidate(seat.pinned!, seatSiteOrdinal({
    runId, role: seat.role, pinnedSeatIndex: seat.pinnedSeatIndex, callSiteKey
  })).via;
}

/** The first `count` sites `site:<n>` whose ordinal names `via` on this seat. */
function sitesWith(seat: RunSeat, via: "MAIN" | "RUNNER_UP", count: number, runId: string | null = null): readonly string[] {
  const found: string[] = [];
  for (let index = 0; found.length < count; index += 1) {
    if (viaAt(seat, `site:${String(index)}`, runId) === via) found.push(`site:${String(index)}`);
  }
  return found;
}

const RUN = "run:a16-split";
/**
 * `seatSiteOrdinal({ runId: RUN, role: "JUDGE", pinnedSeatIndex: 0, callSiteKey: "PANEL:root" })`:
 * the first 48 bits of sha256('["run:a16-split","JUDGE",0,"PANEL:root"]'), computed outside the engine.
 */
const PINNED_ORDINAL = 31_307_577_835_366;

async function recorded(caller: SeatCaller, seat: RunSeat, callSiteKey: string) {
  const answer = await caller.callSeat({ seat, callSiteKey, call: async () => null });
  return [answer.member.providerRef, answer.member.pinnedAs, answer.callSiteKey] as const;
}

describe("A16 · callSeat — R3's 80-20 split, a pure function of the site (carry 1)", () => {
  it("sends a site to the runner-up exactly when the site's ordinal names it — about one site in five at share 0.2", async () => {
    const seat = judgeSeat(0.2);
    const script = scripted({ "provider:a": answers("a"), "provider:b": answers("b") });
    const caller = createSeatCaller({ assigned: true, runId: RUN });
    const sites = Array.from({ length: 200 }, (_, index) => `PANEL:node:${String(index)}`);
    const answered: string[] = [];
    for (const site of sites) answered.push((await caller.callSeat({ seat, callSiteKey: site, call: script.call })).value);
    expect(answered).toEqual(sites.map((site) => (viaAt(seat, site, RUN) === "RUNNER_UP" ? "b" : "a")));
    const share = answered.filter((label) => label === "b").length / sites.length;
    expect(share).toBeGreaterThan(0.12);
    expect(share).toBeLessThan(0.28);
    expect(caller.answered("JUDGE" satisfies DebateRole)).toEqual(answered.map((label) => `provider:${label}`));
    // Splitting is not a switch: nothing failed.
    expect(caller.switches()).toEqual([]);
  });

  it("chooses the same member at every site on a rebuilt book and a fresh caller visiting the sites in reverse", async () => {
    const sites = Array.from({ length: 40 }, (_, index) => `JUDGE:review:node-${String(index)}`);
    const firstSeat = judgeSeat(0.2);
    const firstPass = createSeatCaller({ assigned: true, runId: RUN });
    const chosen = new Map<string, readonly [string, string, string]>();
    for (const site of sites) chosen.set(site, await recorded(firstPass, firstSeat, site));
    // Both members answer somewhere, so the split is live on these sites.
    expect(new Set([...chosen.values()].map((entry) => entry[1]))).toEqual(new Set(["MAIN", "RUNNER_UP"]));
    // A resumed pass: a FRESH caller on a SECOND book, visiting the sites in another order.
    const resumedSeat = judgeSeat(0.2);
    expect(resumedSeat).not.toBe(firstSeat);
    const resumed = createSeatCaller({ assigned: true, runId: RUN });
    for (const site of [...sites].reverse()) {
      expect(resumed.plan(resumedSeat, site)?.pinnedAs).toBe(chosen.get(site)![1]);
      expect(await recorded(resumed, resumedSeat, site)).toEqual(chosen.get(site));
    }
  });

  it("is the site's own ordinal: the seat marker is ignored, and the run, the seat and the site each move it", () => {
    const site = { runId: RUN, role: "JUDGE" as const, pinnedSeatIndex: 0, callSiteKey: "PANEL:root" };
    const ordinal = seatSiteOrdinal(site);
    expect(Number.isSafeInteger(ordinal) && ordinal >= 0).toBe(true);
    // Pinned, so a change to the function — which would re-seat every resumed run — is a visible one.
    expect(ordinal).toBe(PINNED_ORDINAL);
    expect(seatSiteOrdinal({ ...site, callSiteKey: "PANEL:root:seat:runnerUp" })).toBe(ordinal);
    expect(seatSiteOrdinal({ ...site, callSiteKey: "PANEL:root:seat:main" })).toBe(ordinal);
    const distinct = (vary: (index: number) => Parameters<typeof seatSiteOrdinal>[0]): number =>
      new Set(Array.from({ length: 20 }, (_, index) => seatSiteOrdinal(vary(index)))).size;
    expect(distinct((index) => ({ ...site, runId: `run:${String(index)}` }))).toBe(20);
    expect(distinct((index) => ({ ...site, pinnedSeatIndex: index }))).toBe(20);
    expect(distinct((index) => ({ ...site, callSiteKey: `PANEL:node:${String(index)}` }))).toBe(20);
    expect(seatSiteOrdinal({ ...site, role: "REVIEWER" })).not.toBe(ordinal);
    expect(seatSiteOrdinal({ ...site, runId: null })).not.toBe(ordinal);
  });

  it("gives a repeated call site (the cooldown's second sequence) the SAME member", async () => {
    const seat = judgeSeat(0.2);
    const [toRunnerUp] = sitesWith(seat, "RUNNER_UP", 1);
    const [toMain] = sitesWith(seat, "MAIN", 1);
    const script = scripted({ "provider:a": answers("a"), "provider:b": answers("b") });
    const caller = createSeatCaller({ assigned: true });
    expect(caller.plan(seat, toRunnerUp!)?.providerRef).toBe("provider:b");
    expect((await caller.callSeat({ seat, callSiteKey: toRunnerUp!, call: script.call })).value).toBe("b");
    expect((await caller.callSeat({ seat, callSiteKey: toRunnerUp!, call: script.call })).value).toBe("b");
    expect((await caller.callSeat({ seat, callSiteKey: toMain!, call: script.call })).value).toBe("a");
  });

  it("uses an explicit ordinal as given (the synthesis roles' per-run ordinal) instead of the site's", async () => {
    const seat = judgeSeat(0.2);
    const script = scripted({ "provider:a": answers("a"), "provider:b": answers("b") });
    const caller = createSeatCaller({ assigned: true });
    const [toRunnerUp] = sitesWith(seat, "RUNNER_UP", 1);
    const [toMain] = sitesWith(seat, "MAIN", 1);
    expect((await caller.callSeat({ seat, callSiteKey: toMain!, ordinal: 9, call: script.call })).value).toBe("b");
    expect((await caller.callSeat({ seat, callSiteKey: toRunnerUp!, ordinal: 3, call: script.call })).value).toBe("a");
    expect(caller.plan(seat, "w", { ordinal: 4 })?.providerRef).toBe("provider:b");
    expect(caller.plan(seat, "w", { ordinal: 5 })?.providerRef).toBe("provider:a");
  });

  it("never splits a seat with no runner-up or a zero share", async () => {
    const seat = judgeSeat(0);
    const script = scripted({ "provider:a": answers("a"), "provider:b": answers("b") });
    const caller = createSeatCaller({ assigned: true, runId: RUN });
    for (let call = 0; call < 50; call += 1) {
      expect((await caller.callSeat({ seat, callSiteKey: `z:${String(call)}`, call: script.call })).value).toBe("a");
    }
    const legacy = buildLegacyRunSeatBook([configured("a")]).judge[0]!;
    for (let call = 0; call < 20; call += 1) {
      expect((await createSeatCaller({ assigned: false }).callSeat({
        seat: legacy, callSiteKey: `z:${String(call)}`, call: async (_member, key) => key
      })).value).toBe(`z:${String(call)}`);
    }
  });

  it("keeps A15b's M5 guard: a bare-key caller refuses a seat with a runner-up before any call", async () => {
    const bare = createSeatCaller({ assigned: false });
    let called = false;
    expect(() => bare.plan(judgeSeat(0.2), "k")).toThrowError(expect.objectContaining({ code: "CALL_SITE_SEAT_MARKER_REQUIRED" }));
    await expect(bare.callSeat({ seat: judgeSeat(0), callSiteKey: "k", call: async () => { called = true; return null; } }))
      .rejects.toMatchObject({ code: "CALL_SITE_SEAT_MARKER_REQUIRED" });
    expect(called).toBe(false);
  });
});

describe("A16 · fix round 1 — a restored slot is a preference, and its seat keeps the backup", () => {
  it("tries the preferred slot first in place of the 80-20 choice, whichever the ordinal names", async () => {
    const seat = judgeSeat(0.2);
    const [toMain] = sitesWith(seat, "MAIN", 1);
    const [toRunnerUp] = sitesWith(seat, "RUNNER_UP", 1);
    const script = scripted({ "provider:a": answers("a"), "provider:b": answers("b") });
    const caller = createSeatCaller({ assigned: true });
    expect(caller.plan(seat, toMain!, { prefer: "RUNNER_UP" })?.providerRef).toBe("provider:b");
    expect((await caller.callSeat({ seat, callSiteKey: toMain!, prefer: "RUNNER_UP", call: script.call })).value).toBe("b");
    expect((await caller.callSeat({ seat, callSiteKey: toRunnerUp!, prefer: "MAIN", call: script.call })).value).toBe("a");
  });

  it("keeps the other member as the preferred slot's backup: an outage there switches, as R4 says", async () => {
    const script = scripted({ "provider:a": answers("a"), "provider:b": throws(transportFailure) });
    const caller = createSeatCaller({ assigned: true });
    await expect(caller.callSeat({ seat: backupOnlySeat(), callSiteKey: "k", prefer: "RUNNER_UP", call: script.call }))
      .resolves.toMatchObject({ value: "a", callSiteKey: "k:seat:main" });
    expect(script.calls).toEqual(["provider:b@k:seat:runnerUp", "provider:a@k:seat:main"]);
    expect(caller.switches().map((record) => [record.fromProviderRef, record.toProviderRef, record.cause]))
      .toEqual([["provider:b", "provider:a", "TRANSPORT_FAILURE"]]);
  });
});

describe("A16 · carry 3 — the split and the backup choose only among the members the call's rule leaves", () => {
  const notB = (member: SeatMember): boolean => member.providerRef !== "provider:b";
  const notA = (member: SeatMember): boolean => member.providerRef !== "provider:a";

  it("sends a site whose ordinal names a spent runner-up to the main, and a site with a spent main to the runner-up", async () => {
    const seat = judgeSeat(0.2);
    const [toRunnerUp] = sitesWith(seat, "RUNNER_UP", 1);
    const [toMain] = sitesWith(seat, "MAIN", 1);
    const script = scripted({ "provider:a": answers("a"), "provider:b": answers("b") });
    const caller = createSeatCaller({ assigned: true });
    expect(caller.plan(seat, toRunnerUp!, { eligible: notB })?.providerRef).toBe("provider:a");
    expect((await caller.callSeat({ seat, callSiteKey: toRunnerUp!, eligible: notB, call: script.call })).value).toBe("a");
    expect(caller.plan(seat, toMain!, { eligible: notA })?.providerRef).toBe("provider:b");
    expect((await caller.callSeat({ seat, callSiteKey: toMain!, eligible: notA, call: script.call })).value).toBe("b");
    // A member the rule removed is not a switch the caller made (the ledger's spent slot is A16c's to disclose).
    expect(caller.switches()).toEqual([]);
  });

  it("never backs a failed member up with one the rule removed, whichever member the split chose", async () => {
    const seat = judgeSeat(0.2);
    const [toRunnerUp] = sitesWith(seat, "RUNNER_UP", 1);
    const failure = transportFailure();
    const script = scripted({ "provider:a": answers("never"), "provider:b": () => { throw failure; } });
    const caller = createSeatCaller({ assigned: true });
    await expect(caller.callSeat({ seat, callSiteKey: toRunnerUp!, eligible: notA, call: script.call })).rejects.toBe(failure);
    expect(script.calls).toEqual([`provider:b@${toRunnerUp!}:seat:runnerUp`]);
    expect(caller.switches()).toEqual([]);
  });
});

describe("A16 · carry 4 — a cross-exchange seat has no backup: never split, never switched", () => {
  function crossExchangeBook(): RunSeatBook {
    const position = [pinned(0, "a", "b"), pinned(1, "c", null)];
    return buildAssignedRunSeatBook({
      assignment: {
        scorecardVersion: 7, strength: "BALANCED",
        roles: {
          POSITION: position, SUPPORT_ATTACK: [], CROSS_EXCHANGE: position, JUDGE: [], REVIEWER: [],
          ANSWER_WRITER: [pinned(0, "a", null)], ANSWER_CHECKER: [pinned(0, "c", null)]
        }
      },
      configured: makers(configured("a"), configured("b"), configured("c")),
      routeHealth: healthy("a", "b", "c")
    }).book;
  }

  it("answers every site from the root's writer, and a transport failure there leaves unchanged", async () => {
    const book = crossExchangeBook();
    const cross = book.crossExchange[0]!;
    expect([cross.runnerUp, cross.diversityShare]).toEqual([null, 0]);
    // The POSITION seat it mirrors DOES split, so the absence of a split below is the mirror's.
    expect(book.position[0]!.runnerUp?.providerRef).toBe("provider:b");
    const caller = createSeatCaller({ assigned: true, runId: RUN });
    for (let index = 0; index < 50; index += 1) {
      const site = `JUDGE:cross-root:0->1:${String(index)}`;
      expect(await recorded(caller, cross, site)).toEqual(["provider:a", "MAIN", `${site}:seat:main`]);
    }
    const failure = transportFailure();
    await expect(caller.callSeat({ seat: cross, callSiteKey: "JUDGE:cross-root:0->1", call: async () => { throw failure; } }))
      .rejects.toBe(failure);
    expect(caller.switches()).toEqual([]);
  });
});

/**
 * DR-184-v5 in miniature: the ledgered gateway caps each KEY at the
 * `maxAttempts` its caller passes (`remaining = maxAttempts - consumed`, a key
 * at its cap refused before any spend), and the cooldown wrapper grants the
 * site's final retry only while the planned member's OTHER key has not passed
 * the sequence bound (A15d carry 3, as `cooldownAttempt` asks the ledger).
 */
function cappedLedger(behaviour: Readonly<Record<string, "TRANSPORT" | "CAP" | "OK">>) {
  const counts = new Map<string, number>();
  const count = (key: string): number => counts.get(key) ?? 0;
  const call = async (member: SeatMember, key: string, maxAttempts: number): Promise<string> => {
    const remaining = maxAttempts - count(key);
    if (remaining <= 0) throw new TypedDomainError("CALL_BUDGET_EXHAUSTED", key);
    const mode = behaviour[member.providerRef]!;
    if (mode === "OK") {
      counts.set(key, count(key) + 1);
      return member.providerRef;
    }
    // A cap stops the gateway's loop on the attempt that met it (F11); a dead transport spends them all.
    const spent = mode === "CAP" ? 1 : remaining;
    counts.set(key, count(key) + spent);
    throw new ProviderCallFailedError(mode === "CAP" ? usageCap() : new Error("down"), spent, "FAILED", `ledger:${key}`);
  };
  const total = (site: string): number => count(`${site}:seat:main`) + count(`${site}:seat:runnerUp`);
  return { count, call, total };
}

const J = 2;
const F = 1;

async function cooldownSite(caller: SeatCaller, seat: RunSeat, site: string, ledger: ReturnType<typeof cappedLedger>) {
  const planned = caller.plan(seat, site);
  return withCooldownRetry({
    runId: "run:a16", callSiteKey: site, parentNodeId: "node:parent", plannedLegCount: 1, baseMaxAttempts: J,
    failureScope: "EXPANSION", policy: { cooldownMs: 1, finalRetryAttempts: F, maxCooldownHoldsPerRun: 2 },
    hold: { countCooldownHolds: async () => 0, record: async () => undefined, wait: async () => undefined },
    attempt: (maxAttempts) => caller.callSeat({
      seat, callSiteKey: site, call: (member, key) => ledger.call(member, key, maxAttempts)
    }),
    // As `cooldownAttempt` does (A16a fix round 1): the key opposite the member that ACTUALLY retries,
    // asked between the sequences.
    ...(planned === null ? {} : {
      finalRetryPermitted: async () => {
        const retrying = caller.plan(seat, site) ?? planned;
        return ledger.count(`${site}:seat:${retrying.pinnedAs === "MAIN" ? "runnerUp" : "main"}`) <= J;
      }
    })
  });
}

describe("A16 · carry 5 — a backup gets ONE sequence per site: a cooldown site stays within 2j + f, a cross-exchange within j + f", () => {
  it("spends j on the backup and the final retry on the first member's own key when both are down", async () => {
    const ledger = cappedLedger({ "provider:a": "TRANSPORT", "provider:b": "TRANSPORT" });
    const caller = createSeatCaller({ assigned: true });
    await expect(cooldownSite(caller, backupOnlySeat(), "leg", ledger)).resolves.toMatchObject({ kind: "HALTED" });
    expect([ledger.count("leg:seat:main"), ledger.count("leg:seat:runnerUp")]).toEqual([J + F, J]);
    expect(ledger.total("leg")).toBe(2 * J + F);
    expect(caller.switches()).toHaveLength(1);
    // A resumed pass meets the per-key law, not a second allowance: the spent main is refused before any
    // spend (the runner's preflight turns this into today's halt or terminal — A15d, carry 7).
    await expect(cooldownSite(createSeatCaller({ assigned: true }), backupOnlySeat(), "leg", ledger))
      .rejects.toMatchObject({ code: "CALL_BUDGET_EXHAUSTED" });
    expect(ledger.total("leg")).toBe(2 * J + F);
  });

  it("switches at a usage cap at once, and the post-cooldown retry never returns to the capped key", async () => {
    // Fix round 1 (R4: cap → switch NOW): the capped main spends k = 1; the runner-up runs its sequence
    // (j) and then the site's one retry (f). k + j + f = 1 + 2 + 1 = 4 <= 2j + f = 5, because k <= j.
    const ledger = cappedLedger({ "provider:a": "CAP", "provider:b": "TRANSPORT" });
    const caller = createSeatCaller({ assigned: true });
    await expect(cooldownSite(caller, backupOnlySeat(), "leg", ledger)).resolves.toMatchObject({ kind: "HALTED" });
    expect([ledger.count("leg:seat:main"), ledger.count("leg:seat:runnerUp")]).toEqual([1, J + F]);
    expect(ledger.total("leg")).toBeLessThanOrEqual(2 * J + F);
    expect(caller.switches().map((record) => record.cause)).toEqual(["USAGE_CAP"]);
  });

  it("sends the retry to the main when the split's runner-up was the one capped", async () => {
    const seat = judgeSeat(0.2);
    const [site] = sitesWith(seat, "RUNNER_UP", 1);
    const ledger = cappedLedger({ "provider:a": "TRANSPORT", "provider:b": "CAP" });
    const caller = createSeatCaller({ assigned: true });
    await expect(cooldownSite(caller, seat, site!, ledger)).resolves.toMatchObject({ kind: "HALTED" });
    // k (the runner-up's cap) + j + f on the main's key: 1 + 2 + 1 = 4 <= 2j + f.
    expect([ledger.count(`${site!}:seat:main`), ledger.count(`${site!}:seat:runnerUp`)]).toEqual([J + F, 1]);
  });

  it("the named worst case: the split's runner-up fails, the main fails, the retry returns to the runner-up's key", async () => {
    const seat = judgeSeat(0.2);
    const [site] = sitesWith(seat, "RUNNER_UP", 1);
    const ledger = cappedLedger({ "provider:a": "TRANSPORT", "provider:b": "TRANSPORT" });
    const caller = createSeatCaller({ assigned: true });
    await expect(cooldownSite(caller, seat, site!, ledger)).resolves.toMatchObject({ kind: "HALTED" });
    // main j, runner-up j + f: exactly v5's 2j + f.
    expect([ledger.count(`${site!}:seat:main`), ledger.count(`${site!}:seat:runnerUp`)]).toEqual([J, J + F]);
    expect(ledger.total(site!)).toBe(2 * J + F);
  });

  it("answers from the backup inside the first sequence, with no cooldown", async () => {
    const ledger = cappedLedger({ "provider:a": "TRANSPORT", "provider:b": "OK" });
    const caller = createSeatCaller({ assigned: true });
    await expect(cooldownSite(caller, backupOnlySeat(), "leg", ledger)).resolves.toMatchObject({
      kind: "AUTHORED", value: { value: "provider:b", callSiteKey: "leg:seat:runnerUp" }
    });
    expect([ledger.count("leg:seat:main"), ledger.count("leg:seat:runnerUp")]).toEqual([J, 1]);
  });

  it("sends a site's post-cooldown final retry back to the member that ran its first sequence, never to a fresh key", async () => {
    // The main went down at an earlier site, so this site's first sequence is the runner-up's. The final
    // retry adds only that key's remainder; the downed main is not woken with a whole new allowance.
    const ledger = cappedLedger({ "provider:a": "TRANSPORT", "provider:b": "OK" });
    const seat = backupOnlySeat();
    const caller = createSeatCaller({ assigned: true });
    await cooldownSite(caller, seat, "earlier", ledger);
    const failing = cappedLedger({ "provider:a": "TRANSPORT", "provider:b": "TRANSPORT" });
    await expect(cooldownSite(caller, seat, "leg", failing)).resolves.toMatchObject({ kind: "HALTED" });
    expect([failing.count("leg:seat:main"), failing.count("leg:seat:runnerUp")]).toEqual([0, J + F]);
  });

  it("never switches on the post-cooldown retry: a site whose first sequence did not switch gives the backup no sequence", async () => {
    // Sequence 1 ends on a failure that is no reason to switch (an oversized packet); should the retry
    // then meet a dead transport, a switch there would hand the backup `judge + final` — above v5.
    const seat = backupOnlySeat();
    const caller = createSeatCaller({ assigned: true });
    const failures = [packetTooLarge(), transportFailure()];
    const script = scripted({ "provider:a": () => { throw failures.shift(); }, "provider:b": answers("never") });
    await expect(caller.callSeat({ seat, callSiteKey: "leg", call: script.call })).rejects.toBeInstanceOf(ProviderCallFailedError);
    await expect(caller.callSeat({ seat, callSiteKey: "leg", call: script.call })).rejects.toBeInstanceOf(ProviderCallFailedError);
    expect(script.calls).toEqual(["provider:a@leg:seat:main", "provider:a@leg:seat:main"]);
    expect(caller.switches()).toEqual([]);
  });

  it("keeps a cross-exchange site on its one key: j + f", async () => {
    const position = [pinned(0, "a", "b"), pinned(1, "c", null)];
    const cross = buildAssignedRunSeatBook({
      assignment: {
        scorecardVersion: 7, strength: "BALANCED",
        roles: {
          POSITION: position, SUPPORT_ATTACK: [], CROSS_EXCHANGE: position, JUDGE: [], REVIEWER: [],
          ANSWER_WRITER: [pinned(0, "a", null)], ANSWER_CHECKER: [pinned(0, "c", null)]
        }
      },
      configured: makers(configured("a"), configured("b"), configured("c")),
      routeHealth: healthy("a", "b", "c")
    }).book.crossExchange[0]!;
    const ledger = cappedLedger({ "provider:a": "TRANSPORT", "provider:b": "OK" });
    await expect(cooldownSite(createSeatCaller({ assigned: true }), cross, "cross", ledger))
      .resolves.toMatchObject({ kind: "HALTED" });
    expect([ledger.count("cross:seat:main"), ledger.count("cross:seat:runnerUp")]).toEqual([J + F, 0]);
  });
});

describe("A16 · pre-review ruling 2 — hold and halt records report the SITE's true attempts", () => {
  const records = () => {
    const events: { state: string; attemptsSpent: number }[] = [];
    return {
      events,
      hold: {
        countCooldownHolds: async () => 0,
        record: async (event: { state: string; attemptsSpent: number }) => { events.push({ state: event.state, attemptsSpent: event.attemptsSpent }); },
        wait: async () => undefined
      }
    };
  };
  const failing = (attempts: number) => async (): Promise<never> => {
    throw new ProviderCallFailedError(new Error("down"), attempts, "FAILED", "ledger:down");
  };
  const site = {
    runId: "run:a16", callSiteKey: "leg", parentNodeId: "node:parent", plannedLegCount: 1, baseMaxAttempts: 1,
    failureScope: "EXPANSION" as const, policy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 2 }
  };

  it("reads the site's count for the hold, the retry and the halt when the caller supplies it", async () => {
    const { events, hold } = records();
    const ledgerTotals = [2, 3];
    await expect(withCooldownRetry({ ...site, hold, attempt: failing(1), siteAttemptsSpent: async () => ledgerTotals.shift()! }))
      .resolves.toMatchObject({ kind: "HALTED" });
    expect(events).toEqual([
      { state: "COOLDOWN_HOLD", attemptsSpent: 2 }, { state: "COOLDOWN_RETRY", attemptsSpent: 2 },
      { state: "EXPANSION_HALTED", attemptsSpent: 3 }
    ]);
  });

  it("keeps today's arithmetic when it does not (every legacy run)", async () => {
    const { events, hold } = records();
    await withCooldownRetry({ ...site, hold, attempt: failing(1) });
    expect(events).toEqual([
      { state: "COOLDOWN_HOLD", attemptsSpent: 1 }, { state: "COOLDOWN_RETRY", attemptsSpent: 1 },
      { state: "EXPANSION_HALTED", attemptsSpent: 2 }
    ]);
  });
});

describe("A16 · carry 6 — a backup's call is stamped as its own candidate, under its own seat key", () => {
  it("sends the runner-up's model role, thinking level, candidate and scorecard version, keyed `:seat:runnerUp`", async () => {
    const requests: ProviderCallRequest[] = [];
    const failingMain: ProviderGateway = { call: async () => { throw transportFailure(); } };
    const assignment: RoleAssignment = {
      scorecardVersion: 7,
      strength: "BALANCED",
      roles: {
        POSITION: [pinned(0, "c", null)], SUPPORT_ATTACK: [], CROSS_EXCHANGE: [],
        JUDGE: [{ ...pinned(0, "a", "b", 0), runnerUp: candidate("b", "high") }], REVIEWER: [],
        ANSWER_WRITER: [pinned(0, "c", null)], ANSWER_CHECKER: [pinned(0, "c", null)]
      }
    };
    const seat = buildAssignedRunSeatBook({
      assignment,
      configured: makers(configured("a", failingMain), configured("b", okGateway("b", requests, PANEL_ASSESSMENT)), configured("c")),
      routeHealth: healthy("a", "b", "c")
    }).book.judge[0]!;
    const caller = createSeatCaller({ assigned: true, runId: RUN });
    const answer = await caller.callSeat({
      seat,
      callSiteKey: "PANEL:root",
      keyFor: (member) => `PANEL:root:${member.providerRef}`,
      call: (member, callSiteKey) => member.judge.assess({
        runId: RUN, subjectItemId: "work:a16", callSiteKey, questionLine: "Q?", statement: "S.",
        authorMaker: "maker:c", providerRef: member.providerRef, contractHash: "c".repeat(64),
        bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 1_000 }
      })
    });
    expect(answer.callSiteKey).toBe("PANEL:root:provider:b:seat:runnerUp");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      callSiteKey: "PANEL:root:provider:b:seat:runnerUp", providerRef: "provider:b", role: "JUDGE", modelRole: "JUDGE",
      thinkingLevel: "high", candidateId: "candidate:b", scorecardVersion: 7
    });
    expect(caller.switches().map((record) => [record.cause, record.callSiteKey]))
      .toEqual([["TRANSPORT_FAILURE", "PANEL:root:provider:a:seat:main"]]);
  });
});

describe("A16 · carry 1 in the runner — its one seat caller salts every site's ordinal with the run", () => {
  it("builds the caller with the run's id and the switches made at claim", () => {
    const source = readFileSync(fileURLToPath(new URL("../../apps/runner/src/index.ts", import.meta.url)), "utf8");
    const built = [...source.matchAll(/createSeatCaller\(\{([^}]*)\}\)/gu)].map((match) => match[1]!.replace(/\s+/gu, " ").trim());
    expect(built).toEqual(["assigned: seatBook.assigned, runId: run.runId, claimSwitches: assignedSeats?.claimSwitches ?? []"]);
  });
});
