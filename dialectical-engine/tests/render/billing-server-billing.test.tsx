// .tsx, not .ts: apps/ui/lib/billing/serverBilling.ts imports next/headers, which the root tsc (NodeNext,
// tests/**/*.ts only, no next in the root node_modules) cannot resolve; vitest's alias stubs it. The same reason
// tests/unit/t9-age-return-path.test.tsx is .tsx.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";

const mocks = vi.hoisted(() => ({
  getBillingPlans: vi.fn(),
  readAgeConfirmation: vi.fn(),
  readSession: vi.fn(),
  sessions: [] as Array<string | undefined>
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "server-billing-test" }) }));
vi.mock("../../apps/ui/lib/serverApi.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: (_fetch: unknown, sessionCookie?: string) => {
    mocks.sessions.push(sessionCookie);
    return {
      getBillingPlans: mocks.getBillingPlans, readAgeConfirmation: mocks.readAgeConfirmation, readSession: mocks.readSession
    };
  }
}));

import { ageConfirmationOwed, billingIsOn, sessionConfirmed } from "../../apps/ui/lib/billing/serverBilling.js";

describe("P19 the billing pages exist only while billing is on", () => {
  beforeEach(() => {
    mocks.getBillingPlans.mockReset();
    mocks.readAgeConfirmation.mockReset();
    mocks.readSession.mockReset();
    mocks.sessions = [];
  });

  it("is on when the public plans answer, off when they answer 404, and on for any other failure", async () => {
    mocks.getBillingPlans.mockResolvedValue({ currency: "USD", plans: [] });
    expect(await billingIsOn()).toBe(true);
    mocks.getBillingPlans.mockRejectedValue(new ContractHttpError("NOT_FOUND", 404, "Not found"));
    expect(await billingIsOn()).toBe(false);
    // A 503 is not "billing off": the page renders, and its own calls say "try again in a minute".
    mocks.getBillingPlans.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "Unavailable"));
    expect(await billingIsOn()).toBe(true);
    // The public plans are read without the person's session.
    expect(mocks.sessions.every((session) => session === undefined)).toBe(true);
  });

  it("asks the age gate with the person's own session, and a failed read owes nothing, as on the home page (R3-2)", async () => {
    const token = "t".repeat(43);
    mocks.readAgeConfirmation.mockResolvedValue({ status: "required" });
    expect(await ageConfirmationOwed(token)).toBe(true);
    mocks.readAgeConfirmation.mockResolvedValue({ status: "confirmed" });
    expect(await ageConfirmationOwed(token)).toBe(false);
    mocks.readAgeConfirmation.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "Unavailable"));
    expect(await ageConfirmationOwed(token)).toBe(false);
    expect(mocks.sessions).toEqual([token, token, token]);
  });

  it("confirms the session with the person's own cookie: only a 401 means signed out, an outage keeps the page (spec §2.10)", async () => {
    const token = "s".repeat(43);
    mocks.readSession.mockResolvedValue({ user: { id: "u" } });
    expect(await sessionConfirmed(token)).toBe(true);
    mocks.readSession.mockRejectedValue(new ContractHttpError("SESSION_REQUIRED", 401, "Session required"));
    expect(await sessionConfirmed(token)).toBe(false);
    // A 503 is not "signed out": the page renders, and its own calls say "try again".
    mocks.readSession.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "Unavailable"));
    expect(await sessionConfirmed(token)).toBe(true);
    expect(mocks.readSession).toHaveBeenCalledTimes(3);
    expect(mocks.sessions).toEqual([token, token, token]);
  });
});
