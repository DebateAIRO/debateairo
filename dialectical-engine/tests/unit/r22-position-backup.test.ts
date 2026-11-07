import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Judge, JudgeContentRefusedError } from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  type ProviderCallResult,
  type ProviderGateway
} from "@debateai/providers";
import type { RoleAssignment, RoleSeat, SeatCandidate } from "@debateai/scorecard";
import {
  BACKUP_MODEL_USED_WORDING,
  backupModelUsedRecords,
  backupSwitchEventValue,
  buildAssignedRunSeatBook,
  buildLegacyRunSeatBook,
  createSeatCaller,
  type BackupSwitchRecord,
  type ConfiguredSeatMaker,
  type RouteHealth,
  type RunSeat,
  type SeatMember
} from "@debateai/runner";

/**
 * R22 (owner ruling 2026-10-29, "Backup AI takes the seat") — A POSITION WHOSE ANSWER KEEPS BEING REFUSED IS WRITTEN BY
 * THE SEAT'S BACKUP, NEVER LOST WITH THE DEBATE.
 *
 * The shape of the R21 failure (run 3714be1b…, PHASE-B.md and scripts-2/diag-run3..5): MiMo's reply failed the content
 * schema on its original answer (attempt 1, form ORIGINAL) and on the patch follow-up (attempt 2, form PATCH); the
 * gateway gave up with a content refusal naming that second attempt, and the Judge turned it into JUDGE_SCHEMA_FAILURE
 * (`JudgeContentRefusedError`). There it was a cross-exchange (R22's first fix halts that leg). Here the same refusal
 * meets a ROOT POSITION: its seat's backup member — another maker, up, not sitting out — writes the position instead, the
 * switch is told like every other backup switch, and the answer discloses it with the existing BACKUP-MODEL-USED mark.
 * Without a usable backup (the legacy book has none, nor a backup of the same maker or one that sits out) the refusal
 * travels exactly as today.
 */

/** What the gateway threw at the end of MiMo's two tries: attempt 2 (the patch) refused, its own artifact and row. */
const mimoRefusal = () => new JudgeContentRefusedError(new ProviderContentUnacceptedError(
  2, "SCHEMA_FAILED", "content schema failed at named members", "artifact:7f0ee65a", "ledger:7f0ee65a"
));

function okGateway(label: string): ProviderGateway {
  return {
    call: async (): Promise<ProviderCallResult> => ({
      rawArtifactRef: `artifact:${label}`, ledgerEntryRef: `ledger:${label}`, content: "{}",
      provider: "openai-compatible-http", model: `model:${label}`, maker: label, modelVersion: `model:${label}`
    })
  };
}
function configured(label: string, maker = `maker:${label}`): ConfiguredSeatMaker {
  const provider = okGateway(label);
  return { judge: new Judge(provider), provider, providerRef: `provider:${label}`, maker };
}
function candidate(label: string, maker = `maker:${label}`): SeatCandidate {
  return { candidateId: `candidate:${label}`, providerRef: `provider:${label}`, maker, modelId: `model:${label}`, thinkingLevel: "DEFAULT_ONLY" };
}
function pinned(seatIndex: number, main: SeatCandidate, runnerUp: SeatCandidate | null): RoleSeat {
  // Share 0: the runner-up is the main's backup only, so the 80-20 split stays out of the way.
  return { seatIndex, main, runnerUp, diversityShare: 0, source: "SCORECARD" };
}

/** Root 0's POSITION seat: MiMo (Xiaomi) planned, DeepSeek its backup; root 1 is GLM (Z.AI). */
function positionSeat(backupMaker = "DeepSeek"): RunSeat {
  const mimo = candidate("mimo", "Xiaomi");
  const backup = candidate("deepseek", backupMaker);
  const glm = candidate("glm", "Z.AI");
  const assignment: RoleAssignment = {
    scorecardVersion: 7,
    strength: "BALANCED",
    roles: {
      POSITION: [pinned(0, mimo, backup), pinned(1, glm, null)], SUPPORT_ATTACK: [], CROSS_EXCHANGE: [],
      JUDGE: [], REVIEWER: [],
      ANSWER_WRITER: [pinned(0, glm, null)], ANSWER_CHECKER: [pinned(0, mimo, null)]
    }
  };
  const routes = [configured("mimo", "Xiaomi"), configured("deepseek", backupMaker), configured("glm", "Z.AI")];
  const healthy = new Map<string, RouteHealth>(routes.map((route) => [route.providerRef, { state: "HEALTHY" }]));
  return buildAssignedRunSeatBook({
    assignment, configured: new Map(routes.map((route) => [route.providerRef, route])), routeHealth: healthy
  }).book.position[0]!;
}

/** The runner's rule for a root's backup (`positionBackup`): another maker, not sitting out. */
const anyOtherMaker = (backup: SeatMember, refused: SeatMember): boolean => backup.maker !== refused.maker;

function scripted(outcomes: Readonly<Record<string, () => string>>) {
  const calls: string[] = [];
  const call = async (member: SeatMember, callSiteKey: string): Promise<string> => {
    calls.push(`${member.providerRef}@${callSiteKey}`);
    return outcomes[member.providerRef]!();
  };
  return { calls, call };
}
const refuses = (): string => { throw mimoRefusal(); };

describe("R22 · a root position refused after every repair is written by the seat's backup", () => {
  it("hands the position to the backup under its own key, telling the switch BEFORE the backup is asked", async () => {
    const seat = positionSeat();
    const events: string[] = [];
    const caller = createSeatCaller({
      assigned: true, runId: "run:3714be1b",
      onSwitch: async (record) => { events.push(`switch:${record.cause}:${record.callSiteKey ?? "claim"}`); }
    });
    const script = scripted({
      "provider:mimo": refuses,
      "provider:deepseek": () => { events.push("backup-asked"); return "position-by-deepseek"; }
    });
    const answer = await caller.callSeat({ seat, callSiteKey: "JUDGE", contentRefusalBackup: anyOtherMaker, call: script.call });
    expect(answer).toMatchObject({ value: "position-by-deepseek", callSiteKey: "JUDGE:seat:runnerUp" });
    // The member that ANSWERED is the position's author from here on: its lineage, its panel's author, its maker for
    // the judges' own-maker rule and the neutral seating, and the writer of its cross-exchanges (`positionAnswerers`).
    expect(answer.member).toMatchObject({ providerRef: "provider:deepseek", maker: "DeepSeek", pinnedAs: "RUNNER_UP" });
    expect(script.calls).toEqual(["provider:mimo@JUDGE:seat:main", "provider:deepseek@JUDGE:seat:runnerUp"]);
    expect(events).toEqual(["switch:CONTENT_REFUSED:JUDGE:seat:main", "backup-asked"]);
    expect(caller.switches()).toEqual([{
      role: "POSITION", seatIndex: 0, fromProviderRef: "provider:mimo", fromCandidateId: "candidate:mimo",
      toProviderRef: "provider:deepseek", toCandidateId: "candidate:deepseek", cause: "CONTENT_REFUSED",
      callSiteKey: "JUDGE:seat:main"
    } satisfies BackupSwitchRecord]);
    expect(caller.answered("POSITION")).toEqual(["provider:deepseek"]);
  });

  it("discloses it the way every backup is disclosed: one stand-in answer, the plain BACKUP-MODEL-USED record, and the switch event", async () => {
    const seat = positionSeat();
    const caller = createSeatCaller({ assigned: true, runId: "run:3714be1b" });
    const script = scripted({ "provider:mimo": refuses, "provider:deepseek": () => "ok" });
    await caller.callSeat({ seat, callSiteKey: "JUDGE", contentRefusalBackup: anyOtherMaker, call: script.call });
    expect(caller.backupAnswers()).toEqual([{
      role: "POSITION", seatIndex: 0, callSiteKey: "JUDGE:seat:runnerUp", plannedSlot: "MAIN", answeredSlot: "RUNNER_UP",
      providerRef: "provider:deepseek"
    }]);
    const records = backupModelUsedRecords({ answers: caller.backupAnswers(), fallbackRoles: [] }, "node:root-0");
    expect(records).toEqual([expect.objectContaining({
      mark: "BACKUP-MODEL-USED", scope: "answer", subjectRef: BACKUP_MODEL_USED_WORDING.STAND_IN.subject,
      reason: BACKUP_MODEL_USED_WORDING.STAND_IN.reason, callSiteKey: null, terminalTransportOutcome: null
    })]);
    expect(backupSwitchEventValue(caller.switches()[0]!)).toEqual({
      state: "BACKUP_MODEL_ENGAGED", role: "POSITION", seat_index: 0, from_provider_ref: "provider:mimo",
      to_provider_ref: "provider:deepseek", cause: "CONTENT_REFUSED", call_site_key: "JUDGE:seat:main"
    });
  });

  it("keeps the refused member off the site: the post-cooldown retry after the backup's own outage goes to the backup, never back to the refused key", async () => {
    const seat = positionSeat();
    const caller = createSeatCaller({ assigned: true, runId: "run:3714be1b" });
    const outage = new ProviderCallFailedError(new Error("socket hang up"), 3, "FAILED", "ledger:dead");
    const backupOutcomes: (() => string)[] = [() => { throw outage; }, () => "position-on-retry"];
    const script = scripted({ "provider:mimo": refuses, "provider:deepseek": () => backupOutcomes.shift()!() });
    // Sequence 1: MiMo refused, the backup's connection died — that failure leaves for the runner's cooldown.
    await expect(caller.callSeat({ seat, callSiteKey: "JUDGE", contentRefusalBackup: anyOtherMaker, call: script.call }))
      .rejects.toBe(outage);
    // Between the sequences the runner asks who retries (`retrySeatMember`): the backup, as after a usage cap.
    expect(caller.plan(seat, "JUDGE")?.providerRef).toBe("provider:deepseek");
    await expect(caller.callSeat({ seat, callSiteKey: "JUDGE", contentRefusalBackup: anyOtherMaker, call: script.call }))
      .resolves.toMatchObject({ value: "position-on-retry", callSiteKey: "JUDGE:seat:runnerUp" });
    expect(script.calls).toEqual([
      "provider:mimo@JUDGE:seat:main", "provider:deepseek@JUDGE:seat:runnerUp", "provider:deepseek@JUDGE:seat:runnerUp"
    ]);
    expect(caller.switches().map((record) => record.cause)).toEqual(["CONTENT_REFUSED"]);
  });

  it("lets the backup's own refusal travel as today: one switch, no third member, no loop", async () => {
    const seat = positionSeat();
    const caller = createSeatCaller({ assigned: true, runId: "run:3714be1b" });
    const backupRefusal = mimoRefusal();
    const script = scripted({ "provider:mimo": refuses, "provider:deepseek": () => { throw backupRefusal; } });
    await expect(caller.callSeat({ seat, callSiteKey: "JUDGE", contentRefusalBackup: anyOtherMaker, call: script.call }))
      .rejects.toBe(backupRefusal);
    expect(script.calls).toEqual(["provider:mimo@JUDGE:seat:main", "provider:deepseek@JUDGE:seat:runnerUp"]);
    expect(caller.switches()).toHaveLength(1);
  });
});

describe("R22 · with no usable backup the refusal travels exactly as today", () => {
  it("on the legacy book (no scorecard: the test site's book has no backups), nothing switches", async () => {
    const refusal = mimoRefusal();
    const legacy = buildLegacyRunSeatBook([configured("mimo", "Xiaomi"), configured("glm", "Z.AI")]).position[0]!;
    const caller = createSeatCaller({ assigned: false, runId: "run:3714be1b" });
    await expect(caller.callSeat({
      seat: legacy, callSiteKey: "JUDGE", contentRefusalBackup: anyOtherMaker, call: async () => { throw refusal; }
    })).rejects.toBe(refusal);
    expect(caller.switches()).toEqual([]);
    expect(caller.backupAnswers()).toEqual([]);
  });

  it.each([
    ["a backup of the same maker", positionSeat("Xiaomi"), anyOtherMaker],
    ["a backup that sits out the rest of the run", positionSeat(),
      (backup: SeatMember, refused: SeatMember) => anyOtherMaker(backup, refused) && backup.providerRef !== "provider:deepseek"]
  ] as const)("never hands the position to %s: the backup is not asked", async (_label, seat, rule) => {
    const refusal = mimoRefusal();
    const script = scripted({ "provider:mimo": () => { throw refusal; }, "provider:deepseek": () => "never" });
    const caller = createSeatCaller({ assigned: true, runId: "run:3714be1b" });
    await expect(caller.callSeat({ seat, callSiteKey: "JUDGE", contentRefusalBackup: rule, call: script.call })).rejects.toBe(refusal);
    expect(script.calls).toEqual(["provider:mimo@JUDGE:seat:main"]);
    expect(caller.switches()).toEqual([]);
  });

  it("never switches a call that did not ask for it (a review, a panel, every other seat call): R4 stands", async () => {
    const refusal = mimoRefusal();
    const script = scripted({ "provider:mimo": () => { throw refusal; }, "provider:deepseek": () => "never" });
    const caller = createSeatCaller({ assigned: true, runId: "run:3714be1b" });
    await expect(caller.callSeat({ seat: positionSeat(), callSiteKey: "JUDGE", call: script.call })).rejects.toBe(refusal);
    expect(script.calls).toEqual(["provider:mimo@JUDGE:seat:main"]);
    expect(caller.switches()).toEqual([]);
  });

  it("switches only on the gateway's refusal after its repairs, never on a schema failure it did not refuse", async () => {
    // An accepted reply whose claim type cannot be resolved is a plain JUDGE_SCHEMA_FAILURE: no repair chain ran out.
    const plain = new TypedDomainError("JUDGE_SCHEMA_FAILURE", "claim type unresolved");
    const script = scripted({ "provider:mimo": () => { throw plain; }, "provider:deepseek": () => "never" });
    const caller = createSeatCaller({ assigned: true, runId: "run:3714be1b" });
    await expect(caller.callSeat({ seat: positionSeat(), callSiteKey: "JUDGE", contentRefusalBackup: anyOtherMaker, call: script.call }))
      .rejects.toBe(plain);
    expect(script.calls).toEqual(["provider:mimo@JUDGE:seat:main"]);
  });
});

describe("R22 · the runner hands a root position, and only a root position, to its backup", () => {
  const source = readFileSync(fileURLToPath(new URL("../../apps/runner/src/index.ts", import.meta.url)), "utf8");
  const between = (start: string, end: string): string => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    return source.slice(from, to);
  };

  it("the backup rule is another maker that does not sit out the run (the preview's sit-out book)", () => {
    expect(source).toContain(
      "const positionBackup = (backup: SeatMember, refused: SeatMember): boolean =>\n"
      + "      backup.maker !== refused.maker && sitOut?.sitsOut(backup.providerRef) !== true;"
    );
  });

  it("root 0's author call passes it", () => {
    const opener = between("const openFirstPosition = async (", "let primaryAttempt = await openFirstPosition(");
    expect(opener).toContain("contentRefusalBackup: positionBackup,");
  });

  it("every other author call passes it only for a root (a POSITION seat with no parent); replies and cross-exchanges halt instead", () => {
    const author = between("const childPlan = seatCallPlan(", "if (childAttempt.kind === \"HALTED\") return childAttempt;");
    expect(author).toContain("haltsOnContentRefusal: input.parentNodeId !== null,");
    expect(author).toContain(
      "...(input.parentNodeId === null && input.seat.role === \"POSITION\" ? { contentRefusalBackup: positionBackup } : {}),"
    );
  });

  it("no review, panel or synthesis call passes it", () => {
    expect([...source.matchAll(/contentRefusalBackup/gu)]).toHaveLength(2);
  });
});
