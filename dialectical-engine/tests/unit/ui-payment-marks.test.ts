import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { availablePaymentMarks } from "../../apps/ui/lib/billing/paymentMarks.js";

describe("P21, N25b NETOPIA's, Visa's and Mastercard's marks appear only when the owner's files are there", () => {
  it("finds them from the UI's own directory and from the repository root, and reports each one", () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-marks-"));
    try {
      expect(availablePaymentMarks(root)).toEqual({ netopia: false, visa: false, mastercard: false });
      mkdirSync(join(root, "apps/ui/public/payment-marks"), { recursive: true });
      writeFileSync(join(root, "apps/ui/public/payment-marks/visa.svg"), "<svg/>");
      expect(availablePaymentMarks(root)).toEqual({ netopia: false, visa: true, mastercard: false });
      mkdirSync(join(root, "ui/public/payment-marks"), { recursive: true });
      writeFileSync(join(root, "ui/public/payment-marks/mastercard.svg"), "<svg/>");
      writeFileSync(join(root, "ui/public/payment-marks/visa.svg"), "<svg/>");
      expect(availablePaymentMarks(join(root, "ui"))).toEqual({ netopia: false, visa: true, mastercard: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds NETOPIA's mark on its own (spec §2.18), and none of the three without their files", () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-marks-"));
    try {
      mkdirSync(join(root, "public/payment-marks"), { recursive: true });
      expect(availablePaymentMarks(root)).toEqual({ netopia: false, visa: false, mastercard: false });
      writeFileSync(join(root, "public/payment-marks/netopia.svg"), "<svg/>");
      expect(availablePaymentMarks(root)).toEqual({ netopia: true, visa: false, mastercard: false });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
