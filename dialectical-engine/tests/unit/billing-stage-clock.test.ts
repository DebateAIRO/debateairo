import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  assertLiveInvoicersAreLive,
  assertStageInvoicersAreSandboxes,
  billingClock
} from "../../apps/api/src/billing/stage-clock.js";

const FIXED = new Date("2026-10-01T00:00:00.000Z");
const DAY = 86_400_000;
const codeOf = (run: () => unknown): string => {
  try { run(); } catch (error) { if (error instanceof TypedDomainError) return error.code; throw error; }
  throw new Error("expected a refusal");
};

describe("N8 the sandbox clock (spec 2026-10-05 §2.3: renew by advancing the clock)", () => {
  it("is the real clock, with no offset, when none is set, on sandbox and on live", () => {
    for (const paymentEnvironment of ["sandbox", "live", null] as const) {
      const stage = billingClock({ paymentEnvironment, offsetDays: null, now: () => FIXED });
      expect(stage.clock()).toEqual(FIXED);
      expect(stage.offsetMs).toBe(0);
    }
  });

  it("moves the billing clock forward by whole days against NETOPIA's sandbox only, and says by how much", () => {
    const stage = billingClock({ paymentEnvironment: "sandbox", offsetDays: 31, now: () => FIXED });
    expect(stage.clock().toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(stage.offsetMs).toBe(31 * DAY);
  });

  it("never lets a sandbox payment reach a live invoicing service, whatever the clock", () => {
    const sandboxes = {
      paymentEnvironment: "sandbox" as const,
      quadernoApiBaseUrl: "https://debateai.sandbox-quadernoapp.com/api",
      smartbillApiBaseUrl: "https://smartbill.invalid"
    };
    expect(() => assertStageInvoicersAreSandboxes(sandboxes)).not.toThrow();
    expect(codeOf(() => assertStageInvoicersAreSandboxes({ ...sandboxes, quadernoApiBaseUrl: "https://debateai.quadernoapp.com/api" })))
      .toBe("BILLING_STAGE_LIVE_INVOICER_REFUSED");
    expect(codeOf(() => assertStageInvoicersAreSandboxes({ ...sandboxes, smartbillApiBaseUrl: "https://ws.smartbill.ro/SBORO/api" })))
      .toBe("BILLING_STAGE_LIVE_INVOICER_REFUSED");
    expect(codeOf(() => assertStageInvoicersAreSandboxes({ ...sandboxes, quadernoApiBaseUrl: null })))
      .toBe("BILLING_STAGE_LIVE_INVOICER_REFUSED");
    for (const smartbillApiBaseUrl of ["https://ws.smartbill.ro./SBORO/api", "https://203.0.113.5/SBORO/api", null]) {
      expect(codeOf(() => assertStageInvoicersAreSandboxes({ ...sandboxes, smartbillApiBaseUrl })), String(smartbillApiBaseUrl))
        .toBe("BILLING_STAGE_LIVE_INVOICER_REFUSED");
    }
    expect(() => assertStageInvoicersAreSandboxes({
      paymentEnvironment: "live",
      quadernoApiBaseUrl: "https://debateai.quadernoapp.com/api", smartbillApiBaseUrl: "https://ws.smartbill.ro/SBORO/api"
    })).not.toThrow();
  });

  it("never lets a live payment meet a sandbox invoicer (exactly one legal invoice per charge)", () => {
    const live = {
      paymentEnvironment: "live" as const,
      quadernoApiBaseUrl: "https://debateai.quadernoapp.com/api",
      smartbillApiBaseUrl: "https://ws.smartbill.ro/SBORO/api"
    };
    expect(() => assertLiveInvoicersAreLive(live)).not.toThrow();
    expect(codeOf(() => assertLiveInvoicersAreLive({ ...live, quadernoApiBaseUrl: "https://debateai.sandbox-quadernoapp.com/api" })))
      .toBe("BILLING_LIVE_SANDBOX_INVOICER_REFUSED");
    expect(codeOf(() => assertLiveInvoicersAreLive({ ...live, smartbillApiBaseUrl: "https://smartbill.invalid" })))
      .toBe("BILLING_LIVE_SANDBOX_INVOICER_REFUSED");
    // The sandbox's own pairing is the other guard's business.
    expect(() => assertLiveInvoicersAreLive({
      paymentEnvironment: "sandbox",
      quadernoApiBaseUrl: "https://debateai.sandbox-quadernoapp.com/api", smartbillApiBaseUrl: "https://smartbill.invalid"
    })).not.toThrow();
  });

  it("main.ts checks both invoicer rules on the payment environment and hands the runtime the clock and the shifted port", () => {
    const main = readFileSync(resolve("apps/api/src/main.ts"), "utf8");
    const start = main.indexOf('boot.runSync("billing-runtime"');
    const create = main.indexOf("createBillingRuntime({", start);
    const end = main.indexOf("reportPending", create);
    expect(start).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(create);
    const step = main.slice(start, end);
    expect(step).toContain("assertStageInvoicersAreSandboxes({");
    expect(step).toContain("assertLiveInvoicersAreLive({");
    expect(step).toContain("paymentEnvironment: billingConnectors.paymentEnvironment,");
    expect(step).toContain("billingClock({");
    expect(step).toContain("payments: new TimeShiftedCardPayments(billingConnectors.payments, stageOffsetDays)");
    expect(step).toContain("connectors: runtimeConnectors");
    expect(step).toContain("clock: stageClock.clock");
    const runtime = main.slice(create, end);
    expect(runtime).not.toContain("connectors: billingConnectors,");
    expect(runtime).not.toContain("clock: () => new Date()");
  });

  it("refuses to move the clock against live money, or by a senseless amount", () => {
    expect(codeOf(() => billingClock({ paymentEnvironment: "live", offsetDays: 31 })))
      .toBe("BILLING_STAGE_CLOCK_LIVE_REFUSED");
    expect(codeOf(() => billingClock({ paymentEnvironment: null, offsetDays: 1 })))
      .toBe("BILLING_STAGE_CLOCK_LIVE_REFUSED");
    for (const offsetDays of [0, -1, 401, 1.5]) {
      expect(codeOf(() => billingClock({ paymentEnvironment: "sandbox", offsetDays })), String(offsetDays))
        .toBe("BILLING_STAGE_CLOCK_OFFSET_INVALID");
    }
  });
});
