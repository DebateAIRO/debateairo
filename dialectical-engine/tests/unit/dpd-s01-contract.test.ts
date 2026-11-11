import { describe, expect, it } from "vitest";
import {
  AccountErasureCancelledSchema,
  AccountErasureScheduleRequestSchema,
  AccountErasureStatusSchema
} from "../../packages/contract/src/index.js";
import { createContractClient } from "../../packages/contract/src/client.js";

const grant = "g".repeat(43);
const scheduleBody = { confirmation: "DELETE MY ACCOUNT", step_up_grant: grant };
const scheduled = {
  status: "SCHEDULED",
  execute_at: "2026-10-13T00:00:00.000Z",
  cancellation_ref: "55555555-5555-4555-8555-555555555555"
};

describe("R22 decision 21: erasing an account has no public-debate choice", () => {
  it("the schedule body refuses the old option, whatever its value", () => {
    expect(AccountErasureScheduleRequestSchema.safeParse(scheduleBody).success).toBe(true);
    for (const value of [true, false, "true", 1, null]) {
      expect(AccountErasureScheduleRequestSchema.safeParse({ ...scheduleBody, delete_public_debates: value }).success).toBe(false);
    }
    expect(AccountErasureScheduleRequestSchema.safeParse({ ...scheduleBody, extra: 1 }).success).toBe(false);
  });

  it("the status names no choice; NONE and the cancel response are unchanged", () => {
    for (const status of ["SCHEDULED", "DUE", "PROCESSING"] as const) {
      expect(AccountErasureStatusSchema.safeParse({ ...scheduled, status }).success).toBe(true);
      expect(AccountErasureStatusSchema.safeParse({ ...scheduled, status, delete_public_debates: false }).success).toBe(false);
    }
    expect(AccountErasureStatusSchema.safeParse({ status: "NONE" }).success).toBe(true);
    expect(AccountErasureCancelledSchema.safeParse({ status: "CANCELLED" }).success).toBe(true);
  });

  it("the client sends the confirmation and the grant, nothing else", async () => {
    const bodies: string[] = [];
    const fakeFetch: typeof fetch = async (_input, init) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify(scheduled), { status: 202, headers: { "content-type": "application/json" } });
    };
    await createContractClient("http://api.test", fakeFetch).scheduleAccountErasure(grant);
    expect(bodies).toEqual([`{"confirmation":"DELETE MY ACCOUNT","step_up_grant":"${grant}"}`]);
  });
});
