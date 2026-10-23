import { describe, expect, it } from "vitest";
import { createMemorySupportCallRecords } from "../../apps/api/src/support/memory-call-records.js";

describe("createMemorySupportCallRecords", () => {
  it("records dailyCap calls on one UTC day and refuses the next", async () => {
    const records = createMemorySupportCallRecords();
    const at = new Date("2026-01-01T12:00:00.000Z");
    expect(await records.reserveModelCall({ at, dailyCap: 2, callId: "ignored" })).toEqual({ kind: "RECORDED" });
    expect(await records.reserveModelCall({ at, dailyCap: 2 })).toEqual({ kind: "RECORDED" });
    expect(await records.reserveModelCall({ at, dailyCap: 2 })).toEqual({ kind: "DAILY_CAP" });
    expect(records.countFor("2026-01-01")).toBe(2);
  });

  it("records the first call of the next UTC day with a count of one", async () => {
    const records = createMemorySupportCallRecords();
    expect(await records.reserveModelCall({ at: new Date("2026-01-01T23:59:59.999Z"), dailyCap: 1 })).toEqual({ kind: "RECORDED" });
    expect(await records.reserveModelCall({ at: new Date("2026-01-02T00:00:00.000Z"), dailyCap: 1 })).toEqual({ kind: "RECORDED" });
    expect(records.countFor("2026-01-02")).toBe(1);
    expect(records.countFor("2026-01-01")).toBe(0);
  });

  it("starts from zero in a second instance after a restart", async () => {
    const first = createMemorySupportCallRecords();
    const at = new Date("2026-01-01T12:00:00.000Z");
    expect(await first.reserveModelCall({ at, dailyCap: 1 })).toEqual({ kind: "RECORDED" });
    expect(await first.reserveModelCall({ at, dailyCap: 1 })).toEqual({ kind: "DAILY_CAP" });
    const restarted = createMemorySupportCallRecords();
    expect(restarted.countFor("2026-01-01")).toBe(0);
    expect(await restarted.reserveModelCall({ at, dailyCap: 1 })).toEqual({ kind: "RECORDED" });
  });
});
