import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fixturePath = "tests/acceptance/obs-agent-04-fixture.ts";

async function fixtureModule() {
  if (!existsSync(fixturePath)) return null;
  return import("../acceptance/obs-agent-04-fixture.js");
}

describe("OBS-04 stimulus-only acceptance fixture", () => {
  it("plans only open-gap and close-gap against a unique isolated database", async () => {
    const fixture = await fixtureModule();
    expect(fixture).not.toBeNull();
    expect(fixture!.OBS_04_FIXTURE_MODES).toEqual(["open-gap", "close-gap"]);
    const planned = fixture!.planAcceptanceFixture({
      mode: "open-gap",
      adminDatabaseUrl: "postgresql://admin:test-only@127.0.0.1:55432/postgres",
      nonce: "abc123",
      stateDir: "/tmp/obs-04-state",
      targetsPath: resolve("deploy/observation-agent/targets.dev.d"),
      firstSeq: 70_001,
      day: "2026-09-03"
    });
    expect(planned.databaseName).toBe("debateai_obs04_abc123");
    expect(new URL(planned.databaseUrl).pathname).toBe("/debateai_obs04_abc123");
    expect(planned.environmentFile).toContain("export OBS_ACCEPTANCE_DATABASE='debateai_obs04_abc123'");
    expect(planned.environmentFile).toContain("export OBS_ACCEPTANCE_FIRST_SEQ='70001'");
    expect(planned.environmentFile).toContain("export OBS_ACCEPTANCE_DAY='2026-09-03'");
    expect(planned.environmentFile).not.toContain("/debateai'");
  });

  it("rejects the product database and any observation/assertion mode", async () => {
    const fixture = await fixtureModule();
    expect(fixture).not.toBeNull();
    expect(() => fixture!.planAcceptanceFixture({
      mode: "open-gap",
      adminDatabaseUrl: "postgresql://admin:test-only@127.0.0.1:55432/debateai",
      nonce: "abc123", stateDir: "/tmp/obs-04-state", targetsPath: "/tmp/targets",
      firstSeq: 1, day: "2026-09-03"
    })).toThrow("OBS_ACCEPTANCE_ADMIN_DATABASE_MUST_BE_POSTGRES");
    expect(fixture!.parseFixtureArguments([
      "assert-gap", "--env-file", "/tmp/obs-04.env"
    ])).toEqual({ ok: false, code: "OBS_ACCEPTANCE_ARGUMENTS_INVALID" });
  });

  it("writes only an explicit typed completed-gap input and uses no chmod stimulus", async () => {
    const fixture = await fixtureModule();
    expect(fixture).not.toBeNull();
    const calls: Array<Readonly<{ text: string; values: readonly unknown[] }>> = [];
    await fixture!.applyGapStimulus({
      query: async (text: string, values: readonly unknown[] = []) => {
        calls.push({ text, values });
        return { rows: [] };
      }
    }, {
      gapId: "44000000-0000-4000-8000-000000000001",
      source: "obs04_acceptance", gapClass: "QUEUE_FULL", lostCount: 7,
      openedAt: new Date("2026-09-03T08:00:00.000Z"),
      closedAt: new Date("2026-09-03T08:00:01.000Z")
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toContain("INSERT INTO obs.capture_gap");
    expect(calls[0]!.values).toEqual([
      "44000000-0000-4000-8000-000000000001", "obs04_acceptance", "QUEUE_FULL", 7,
      new Date("2026-09-03T08:00:00.000Z"), new Date("2026-09-03T08:00:01.000Z")
    ]);
  });
});
