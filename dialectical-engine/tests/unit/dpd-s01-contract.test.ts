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

describe("DPD S01 contract", () => {
  it('R9 schedule body: absent, true and false parse; "true", 1, null and an unknown key are refused', () => {
    // Property: only a boolean or absence may select the public-debate choice.
    for (const body of [scheduleBody, { ...scheduleBody, delete_public_debates: true },
      { ...scheduleBody, delete_public_debates: false }]) {
      expect(AccountErasureScheduleRequestSchema.safeParse(body).success).toBe(true);
    }
    for (const value of ["true", 1, null]) {
      expect(AccountErasureScheduleRequestSchema.safeParse({ ...scheduleBody, delete_public_debates: value }).success).toBe(false);
    }
    expect(AccountErasureScheduleRequestSchema.safeParse({ ...scheduleBody, delete_public_debates: true, extra: 1 }).success).toBe(false);
  });

  it("R11 status: SCHEDULED, DUE and PROCESSING require a boolean delete_public_debates; NONE refuses it; the cancel response is unchanged", () => {
    // Property: active status always exposes the persisted choice; NONE and cancellation do not.
    expect(AccountErasureStatusSchema.safeParse(scheduled).success).toBe(false);
    for (const status of ["SCHEDULED", "DUE", "PROCESSING"] as const) {
      expect(AccountErasureStatusSchema.safeParse({ ...scheduled, status, delete_public_debates: true }).success).toBe(true);
    }
    expect(AccountErasureStatusSchema.safeParse({ status: "NONE" }).success).toBe(true);
    expect(AccountErasureStatusSchema.safeParse({ status: "NONE", delete_public_debates: false }).success).toBe(false);
    expect(AccountErasureCancelledSchema.safeParse({ status: "CANCELLED" }).success).toBe(true);
  });

  it("R10 client body carries delete_public_debates false for the one-argument call and true for (grant, true)", async () => {
    // Property: either client call sends the explicit choice with the exact request key order.
    const bodies: string[] = [];
    const fakeFetch: typeof fetch = async (_input, init) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ ...scheduled, delete_public_debates: false }), {
        status: 202,
        headers: { "content-type": "application/json" }
      });
    };
    const client = createContractClient("http://api.test", fakeFetch);
    await client.scheduleAccountErasure(grant);
    await client.scheduleAccountErasure(grant, true);
    expect(bodies).toEqual([
      `{"confirmation":"DELETE MY ACCOUNT","step_up_grant":"${grant}","delete_public_debates":false}`,
      `{"confirmation":"DELETE MY ACCOUNT","step_up_grant":"${grant}","delete_public_debates":true}`
    ]);
  });
});
