import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availablePaymentMarks, PAYMENT_MARK_NAMES, PAYMENT_MARKS_SETTING } from "../../apps/ui/lib/billing/paymentMarks.js";

const NONE = { netopia: false, visa: false, mastercard: false };
const marks = (value: string) => availablePaymentMarks({ PAYMENT_MARKS_AVAILABLE: value });

describe("P21, N25b NETOPIA's, Visa's and Mastercard's marks appear only when the server's PAYMENT_MARKS_AVAILABLE setting names them", () => {
  it("shows nothing when the setting is absent or empty", () => {
    expect(availablePaymentMarks({})).toEqual(NONE);
    expect(marks("")).toEqual(NONE);
  });

  it("shows exactly the marks the setting names", () => {
    expect(marks("visa,mastercard")).toEqual({ netopia: false, visa: true, mastercard: true });
    expect(marks("netopia")).toEqual({ netopia: true, visa: false, mastercard: false });
    expect(marks("netopia,visa,mastercard")).toEqual({ netopia: true, visa: true, mastercard: true });
  });

  it("forgives spaces and capitals, and ignores unknown names one by one", () => {
    expect(marks(" Netopia , VISA ")).toEqual({ netopia: true, visa: true, mastercard: false });
    expect(marks("visa,amex,,x")).toEqual({ netopia: false, visa: true, mastercard: false });
    expect(marks("amex")).toEqual(NONE);
    expect(marks("visa,visa")).toEqual({ netopia: false, visa: true, mastercard: false });
    expect(Object.isFrozen(marks("visa"))).toBe(true);
  });

  it("never reads the disk: the files live outside every release, served by Caddy", () => {
    const source = readFileSync(new URL("../../apps/ui/lib/billing/paymentMarks.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/node:fs|existsSync|readdirSync/);
    expect(PAYMENT_MARK_NAMES).toEqual(["netopia", "visa", "mastercard"]);
    expect(Object.isFrozen(PAYMENT_MARK_NAMES)).toBe(true);
    expect(PAYMENT_MARKS_SETTING).toBe("PAYMENT_MARKS_AVAILABLE");
  });
});
