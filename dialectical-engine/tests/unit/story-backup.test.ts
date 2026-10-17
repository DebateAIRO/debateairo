import { describe, expect, it } from "vitest";
import {
  DAILY_COST_ENVELOPE_REACHED,
  PERSON_ALLOWANCE_REACHED,
  RUN_COST_ENVELOPE_MONEY_REACHED,
  STORY_COST_ENVELOPE_REACHED
} from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import {
  PROVIDER_CONTENT_LENGTH_EXCEEDED,
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  type ProviderGateway
} from "@debateai/providers";
import {
  STORY_BACKUP_SIGNALS,
  STORY_BACKUP_USED,
  pickBackupStoryteller,
  storyBackupSignalOf,
  type StoryBackupCandidate
} from "@debateai/story";

/**
 * Engine redesign R1d (spec 2026-10-15 §7.2 item 11, P4.6, G7; R1d decision 5): a backup storyteller only when the first
 * really cannot provide the story. Four signals, each read off the typed error the round-1 write threw; every other
 * ending (money, the attempt allowance, the call lane, an erased run, anything unknown) is no signal and no backup.
 */
describe("the backup storyteller's four signals", () => {
  it("names exactly four signals, frozen, and one record code", () => {
    expect(STORY_BACKUP_SIGNALS).toEqual(["UNREACHABLE", "TOO_SLOW", "OUT_OF_ROOM", "UNUSABLE"]);
    expect(Object.isFrozen(STORY_BACKUP_SIGNALS)).toBe(true);
    expect(STORY_BACKUP_USED).toBe("STORY_BACKUP_USED");
  });

  it("reads each signal from a constructed error of its class", () => {
    expect(storyBackupSignalOf(new ProviderCallFailedError(new Error("socket hang up"), 2, "FAILED", "ledger:dead")))
      .toBe("UNREACHABLE");
    expect(storyBackupSignalOf(new ProviderCallFailedError(new Error("deadline"), 2, "TIMED_OUT", "ledger:slow")))
      .toBe("TOO_SLOW");
    expect(storyBackupSignalOf(new ProviderContentUnacceptedError(
      2, PROVIDER_CONTENT_LENGTH_EXCEEDED, "cut off at the token ceiling", "artifact:cut", "ledger:cut",
      { cutOffs: 2, lastAtLowestLevel: true }
    ))).toBe("OUT_OF_ROOM");
    expect(storyBackupSignalOf(new ProviderContentUnacceptedError(2, "SCHEMA_FAILED", "[]", "artifact:bad", "ledger:bad")))
      .toBe("UNUSABLE");
    expect(storyBackupSignalOf(new ProviderContentUnacceptedError(2, "PARSE_FAILED", "not json", "artifact:bad", "ledger:bad")))
      .toBe("UNUSABLE");
  });

  // Pre-flight PF-D6.5 (controller ruling: spec §7.2 item 11 (c) exactly): out of room only when the storyteller ran out
  // of room twice, the second time at its lowest level (after LG-B's one-level-lower retry, or a call with no lower one).
  it("out of room only after two cut-offs, the second at the lowest level", () => {
    const cut = (attempts: number, facts?: { cutOffs: number; lastAtLowestLevel: boolean }) => new ProviderContentUnacceptedError(
      attempts, PROVIDER_CONTENT_LENGTH_EXCEEDED, "cut off at the token ceiling", "artifact:cut", "ledger:cut", facts ?? null);
    expect(storyBackupSignalOf(cut(2, { cutOffs: 2, lastAtLowestLevel: true }))).toBe("OUT_OF_ROOM");
    // A single cut-off (one POST, or the first of two): no signal, no backup.
    expect(storyBackupSignalOf(cut(1, { cutOffs: 1, lastAtLowestLevel: false }))).toBeNull();
    expect(storyBackupSignalOf(cut(1, { cutOffs: 1, lastAtLowestLevel: true }))).toBeNull();
    // Two cut-offs, the second above the lowest level (thinking left the answer its room, so LG-B did not lower it).
    expect(storyBackupSignalOf(cut(2, { cutOffs: 2, lastAtLowestLevel: false }))).toBeNull();
    // A cut-off whose facts are unknown (not raised by the gateway's own end): no signal.
    expect(storyBackupSignalOf(cut(2))).toBeNull();
    // An earlier try was refused for another reason and the repair try after it was cut off (the salvage's follow-up B,
    // or a full re-ask off the preview): the reply stayed unusable after repair, signal (d).
    expect(storyBackupSignalOf(cut(2, { cutOffs: 1, lastAtLowestLevel: false }))).toBe("UNUSABLE");
  });

  it("gives no signal for money, the attempt allowance, the call lane, an erased run, or anything unknown", () => {
    const codes = [
      STORY_COST_ENVELOPE_REACHED,
      RUN_COST_ENVELOPE_MONEY_REACHED,
      DAILY_COST_ENVELOPE_REACHED,
      PERSON_ALLOWANCE_REACHED,
      "CALL_BUDGET_EXHAUSTED",
      "CALL_LANE_STOPPED",
      "CALL_LANE_HELD_BACK",
      "PRIVATE_CONTENT_ERASED",
      // LG-A: the structure-repair wrapper passes the run's attempt ceiling through unchanged.
      "RUN_COST_ENVELOPE_EXHAUSTED"
    ];
    for (const code of codes) expect(storyBackupSignalOf(new TypedDomainError(code, "refused"))).toBeNull();
    // Pre-flight PF-D6.1: a money stop the structure-repair call met keeps its name (structure-repair.ts passed stops),
    // so it reaches here as the stop itself — tests/unit/lg-a-repair-wiring.test.ts pins the wrapper's side.
    expect(storyBackupSignalOf(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "refused"))).toBeNull();
    expect(storyBackupSignalOf(new Error("plain"))).toBeNull();
    expect(storyBackupSignalOf(undefined)).toBeNull();
    expect(storyBackupSignalOf("TIMED_OUT")).toBeNull();
    expect(storyBackupSignalOf({ lastOutcome: "TIMED_OUT" })).toBeNull();
  });
});

describe("the backup storyteller's pick", () => {
  const member = (providerRef: string, maker: string): StoryBackupCandidate => Object.freeze({
    provider: { call: async () => { throw new Error("unused"); } } as ProviderGateway, providerRef, maker
  });
  const A = member("provider:a", "maker x");
  const B = member("provider:b", "maker y");
  const C = member("provider:c", "maker z");
  const D = member("provider:d", "maker w");
  const A2 = member("provider:a2", "maker x");
  const pick = (candidates: readonly StoryBackupCandidate[], first: string, checker: string) =>
    pickBackupStoryteller({ candidates, firstRef: first, checkerRef: checker });

  it("skips the first storyteller's maker and the checker's maker, and returns the member's own gateway", () => {
    const chosen = pick([A, B, A2, C], A.providerRef, B.providerRef);
    expect(chosen).toEqual({ provider: C.provider, providerRef: "provider:c" });
    expect(chosen?.provider).toBe(C.provider);
    // The role maker carries no maker name: it is a StoryRoleMaker.
    expect(Object.keys(chosen ?? {}).sort()).toEqual(["provider", "providerRef"]);
  });

  it("keeps the given order", () => {
    expect(pick([A, B, D, C], A.providerRef, B.providerRef)?.providerRef).toBe("provider:d");
    expect(pick([A, B, C, D], A.providerRef, B.providerRef)?.providerRef).toBe("provider:c");
  });

  it("returns null when every candidate shares a maker with the first storyteller or the checker", () => {
    expect(pick([A, B, A2], A.providerRef, B.providerRef)).toBeNull();
    expect(pick([], A.providerRef, B.providerRef)).toBeNull();
  });

  it("a ref not among the candidates excludes only itself", () => {
    // The first storyteller was the register's out-of-panel ref: its maker is unknown, so only B (the checker's maker) is skipped.
    expect(pick([A, B, C], "provider:off-panel", B.providerRef)?.providerRef).toBe("provider:a");
    // The checker is not a candidate: only the first storyteller's maker is skipped.
    expect(pick([A, A2, B, C], A.providerRef, "provider:sealed-checker")?.providerRef).toBe("provider:b");
    // Neither is a candidate: the first candidate serves.
    expect(pick([A, B], "provider:off-panel", "provider:sealed-checker")?.providerRef).toBe("provider:a");
  });

  // Whole-branch review Minor 1 (ruling W1; Review Focus 5): the maker rule reads the RESOLVED roles' makers from every
  // claim-eligible member of the run, before the sit-out filter, so a role whose ref the filter (or the panel) left out of
  // the candidates still excludes its maker.
  const makersOf = (members: readonly StoryBackupCandidate[]) =>
    members.map((candidate) => Object.freeze({ providerRef: candidate.providerRef, maker: candidate.maker }));

  it("the first storyteller benched: a second ref of the same maker, not benched, is never picked", () => {
    // The sit-out book benched A (the first storyteller): the runner leaves A out of the candidates, not out of the makers.
    const chosen = pickBackupStoryteller({
      candidates: [B, A2, C], firstRef: A.providerRef, checkerRef: B.providerRef, makers: makersOf([A, B, A2, C])
    });
    expect(chosen?.providerRef).toBe("provider:c");
    expect(pickBackupStoryteller({
      candidates: [B, A2], firstRef: A.providerRef, checkerRef: B.providerRef, makers: makersOf([A, B, A2])
    })).toBeNull();
  });

  it("a role ref outside the panel (rotation off: the register's checker ref) still excludes its maker", () => {
    // The register's checker ref is claim-eligible but not a panel member: never a candidate, still a known maker.
    const sealedChecker = Object.freeze({ providerRef: "provider:sealed-checker", maker: "maker y" });
    const chosen = pickBackupStoryteller({
      candidates: [A, B, C], firstRef: A.providerRef, checkerRef: sealedChecker.providerRef,
      makers: [...makersOf([A, B, C]), sealedChecker]
    });
    expect(chosen?.providerRef).toBe("provider:c");
  });
});
