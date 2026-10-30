import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW,
  MIXED_SETTINGS_ROW_MEMBERS,
  composeDebateCostEnvelope,
  costEnvelopePolicyFromValue,
  ownerDayShareMicrosOf
} from "@debateai/register";
import { AskRoom, type AskRoomLine, type AskRoomOptions, type AskRoomSpend, type RoomQuestion } from "../../apps/api/src/ask-room.js";

/**
 * NV-43 (security audit run 3) — WITH BILLING OFF, ONE ACCOUNT MAY TAKE ONLY ITS SHARE OF THE SITE'S DAY. The share is
 * an optional member of the operator's `costEnvelopePolicy` (`owner_day_share_basis_points`, absent = 5000, half the
 * day), computed into micros beside the one denominator (`ownerDayShareMicrosOf`) and handed to the room by both
 * compositions. An owner with no window of their own measures one more room, PERSON_DAY: their RUN+STORY spend charged
 * today plus their live runs' unspent holds against the share. At it only their own question waits (PERSON). Over
 * fakes; the embedded-Postgres proof is the NV-43 describe of tests/integration/b6a-room-decisions.test.ts.
 */
const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string): string => readFileSync(resolve(ROOT, path), "utf8");
const ROW = COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW;
const SOUND = ROW.value as Readonly<Record<string, unknown>>;
const NOW = new Date("2031-08-20T10:00:20.000Z");
const MIDNIGHT = new Date("2031-08-21T00:00:00.000Z");
const OWNER = "43434343-4343-4343-8343-434343434343";
const CLASS = Object.freeze({ planTier: "free" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 });
const MINE: RoomQuestion = Object.freeze({ access: Object.freeze({ ownerRef: OWNER, legacyAskerId: null }), settingsClass: CLASS });
const LEGACY: RoomQuestion = Object.freeze({
  access: Object.freeze({ ownerRef: null, legacyAskerId: "legacy:nv43" }), settingsClass: CLASS
});

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code ?? (error as Error).message;
  }
  return undefined;
}

describe("NV-43 the owner's day share in costEnvelopePolicy", () => {
  it("reads 5000 (half the day) from a row without the member; the code-owned row carries none", () => {
    expect(Object.hasOwn(ROW.value, "owner_day_share_basis_points")).toBe(false);
    expect(costEnvelopePolicyFromValue(ROW.value, ROW.sourceRef).ownerDayShareBasisPoints).toBe(5_000);
  });

  it("parses 1 and 10000, and refuses 0, 10001, a fraction, a string and null", () => {
    for (const share of [1, 10_000]) {
      expect(costEnvelopePolicyFromValue({ ...SOUND, owner_day_share_basis_points: share }, "test").ownerDayShareBasisPoints)
        .toBe(share);
    }
    for (const share of [0, 10_001, 2_500.5, "2500", null]) {
      expect(codeOf(() => costEnvelopePolicyFromValue({ ...SOUND, owner_day_share_basis_points: share }, "test")), String(share))
        .toBe("COST_ENVELOPE_POLICY_INVALID");
    }
  });

  it("computes the share in micros, rounded down and at least one", () => {
    expect(ownerDayShareMicrosOf({ dailyCeilingMicros: 2_000_000, ownerDayShareBasisPoints: 5_000 })).toBe(1_000_000);
    expect(ownerDayShareMicrosOf({ dailyCeilingMicros: 1, ownerDayShareBasisPoints: 1 })).toBe(1);
    expect(ownerDayShareMicrosOf({ dailyCeilingMicros: 3, ownerDayShareBasisPoints: 5_000 })).toBe(1);
    expect(codeOf(() => ownerDayShareMicrosOf({ dailyCeilingMicros: 2_000_000, ownerDayShareBasisPoints: 0 })))
      .toBe("COST_ENVELOPE_POLICY_INVALID");
    expect(codeOf(() => ownerDayShareMicrosOf({ dailyCeilingMicros: 0, ownerDayShareBasisPoints: 5_000 })))
      .toBe("COST_ENVELOPE_POLICY_INVALID");
  });

  it("is a site member, and a debate's composed envelope keeps the site's share", () => {
    expect(MIXED_SETTINGS_ROW_MEMBERS.costEnvelopePolicy.site).toContain("owner_day_share_basis_points");
    expect(MIXED_SETTINGS_ROW_MEMBERS.costEnvelopePolicy.debate).not.toContain("owner_day_share_basis_points");
    const site = costEnvelopePolicyFromValue({ ...SOUND, owner_day_share_basis_points: 4_000 }, "site");
    const debate = costEnvelopePolicyFromValue({ ...SOUND, owner_day_share_basis_points: 9_000 }, "debate");
    expect(composeDebateCostEnvelope(site, debate).ownerDayShareBasisPoints).toBe(4_000);
    expect(composeDebateCostEnvelope(site, site)).toEqual(site);
  });
});

/** A room over fakes: the site's day has spent 1,000,000 of 2,000,000; the owner spent 1,000,000 of it today. */
function roomOf(overrides: Partial<AskRoomOptions> = {}, readers = true): AskRoom {
  const base = {
    readDaySpentMicros: async () => 1_000_000,
    readSiteCountedHoldsMicros: async () => 0,
    readOwnerSpentMicros: async () => 0,
    readOwnerCountedHoldsMicros: async () => 0,
    openHold: async () => {}
  };
  const spend: AskRoomSpend = readers
    ? { ...base, readOwnerDaySpentMicros: async () => 1_000_000, readOwnerLiveHoldsMicros: async () => 0 }
    : base;
  const line: AskRoomLine = {
    siteLineBlocking: async () => false,
    wakeCandidates: async () => [],
    waitingForOwner: async () => [],
    waitingForLegacyAsker: async () => [],
    readWaiting: async () => null,
    isWaiting: async () => false,
    enterWait: async () => {},
    recordReason: async () => {},
    markStarted: async () => {}
  };
  return new AskRoom({
    lockPool: {} as Pool,
    spend,
    line,
    estimator: { estimateMicros: async () => 300_000 },
    personAllowance: { read: async () => [] },
    entitlements: null,
    dailyCeilingMicros: 2_000_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    clock: () => NOW,
    ownerDayShareMicros: 1_000_000,
    ...overrides
  });
}

describe("NV-43 the room measures an owner without a window against their day share", () => {
  it("an owner whose spend today fills the share waits for their own person until UTC midnight", async () => {
    // The site's day FITS: 1,000,000 spent + 300,000 estimated is below the 1,900,000 close line.
    const preview = await roomOf().precheck(MINE);
    expect(preview.admission).toMatchObject({ kind: "WAIT", worstScope: "PERSON_DAY", waitsUntil: MIDNIGHT });
    expect(preview.waitReason).toEqual({ waitsFor: "PERSON", personRecheckAt: MIDNIGHT });
    // The share is an admission gate, not one of the windows the picker plans with.
    expect(preview.personUses).toEqual([]);
  });

  it("a legacy asker has no share and starts on the site's day", async () => {
    expect((await roomOf().precheck(LEGACY)).admission).toMatchObject({ kind: "START", worst: "FITS" });
  });

  it("without the option the room measures as before", async () => {
    const room = new AskRoom({ ...optionsWithout(), clock: () => NOW });
    expect((await room.precheck(MINE)).admission).toMatchObject({ kind: "START" });
  });

  it("refuses a share below one, an unsafe share, or a spend without the two readers", () => {
    expect(codeOf(() => roomOf({ ownerDayShareMicros: 0 }))).toBe("ASK_ROOM_OPTIONS_INVALID");
    expect(codeOf(() => roomOf({ ownerDayShareMicros: 1.5 }))).toBe("ASK_ROOM_OPTIONS_INVALID");
    expect(codeOf(() => roomOf({}, false))).toBe("ASK_ROOM_OPTIONS_INVALID");
    expect(codeOf(() => roomOf())).toBeUndefined();
  });
});

/** The fake room's options without `ownerDayShareMicros` (every room before NV-43). */
function optionsWithout(): AskRoomOptions {
  const spend: AskRoomSpend = {
    readDaySpentMicros: async () => 1_000_000,
    readSiteCountedHoldsMicros: async () => 0,
    readOwnerSpentMicros: async () => 0,
    readOwnerCountedHoldsMicros: async () => 0,
    openHold: async () => {}
  };
  return {
    lockPool: {} as Pool,
    spend,
    line: {
      siteLineBlocking: async () => false, wakeCandidates: async () => [], waitingForOwner: async () => [],
      waitingForLegacyAsker: async () => [], readWaiting: async () => null, isWaiting: async () => false,
      enterWait: async () => {}, recordReason: async () => {}, markStarted: async () => {}
    },
    estimator: { estimateMicros: async () => 300_000 },
    personAllowance: { read: async () => [] },
    entitlements: null,
    dailyCeilingMicros: 2_000_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1
  };
}

describe("NV-43 both compositions hand the share to the room, and the runbook names the member", () => {
  it("main.ts and the practice pass ownerDayShareMicrosOf of the site's envelope", () => {
    expect(read("apps/api/src/main.ts")).toContain("ownerDayShareMicros: ownerDayShareMicrosOf(runPolicy),");
    expect(read("tools/preview-practice/practice-ask-composition.ts"))
      .toContain("ownerDayShareMicros: ownerDayShareMicrosOf(money.siteCostEnvelopePolicy),");
  });

  it("the README's money section documents owner_day_share_basis_points", () => {
    const readme = read("deploy/vps/README.md");
    const money = readme.slice(readme.indexOf("### The cost envelopes (V-28)"), readme.indexOf("#### One answer's record"));
    expect(money).toContain("`owner_day_share_basis_points`");
  });
});
