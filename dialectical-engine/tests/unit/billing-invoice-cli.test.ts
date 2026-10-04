import { describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { parseInvoiceArguments, runBillingInvoiceCli } from "../../apps/api/src/billing/invoice-cli.js";

const CHARGE = "0123456789abcdef0123456789abcdef";
const sink = () => {
  const lines = { out: "", err: "" };
  return { lines, output: { stdout: (text: string) => { lines.out += text; }, stderr: (text: string) => { lines.err += text; } } };
};

describe("W12 pnpm billing:invoice's grammar (P2-I17)", () => {
  it("takes --charge and --kind with exactly one of --record <reference> or --requeue [--confirm-not-issued], in any order", () => {
    expect(parseInvoiceArguments(["--charge", CHARGE, "--kind", "INVOICE", "--record", "DBAI-0042"]))
      .toEqual({ chargeId: CHARGE, kind: "INVOICE", mode: "RECORD", reference: "DBAI-0042" });
    expect(parseInvoiceArguments(["--kind", "CREDIT_NOTE", "--requeue", "--charge", CHARGE]))
      .toEqual({ chargeId: CHARGE, kind: "CREDIT_NOTE", mode: "REQUEUE", confirmNotIssued: false });
    expect(parseInvoiceArguments(["--charge", CHARGE, "--kind", "INVOICE", "--confirm-not-issued", "--requeue"]))
      .toEqual({ chargeId: CHARGE, kind: "INVOICE", mode: "REQUEUE", confirmNotIssued: true });
    expect(parseInvoiceArguments(["--charge", CHARGE, "--kind", "INVOICE", "--record", "1234567"]))
      .toMatchObject({ mode: "RECORD", reference: "1234567" });
  });

  it("takes --amount <dollars.cents> only with --kind CREDIT_NOTE --record, for a dashboard refund's credit note (P4-K, P2-W12)", () => {
    expect(parseInvoiceArguments(["--charge", CHARGE, "--kind", "CREDIT_NOTE", "--record", "DBAI-0042", "--amount", "12.10"]))
      .toEqual({ chargeId: CHARGE, kind: "CREDIT_NOTE", mode: "RECORD", reference: "DBAI-0042", amountMicros: 12_100_000 });
    expect(parseInvoiceArguments(["--amount", "0.01", "--record", "qd_7f3a91", "--kind", "CREDIT_NOTE", "--charge", CHARGE]))
      .toEqual({ chargeId: CHARGE, kind: "CREDIT_NOTE", mode: "RECORD", reference: "qd_7f3a91", amountMicros: 10_000 });
  });

  it("refuses anything else as usage (exit 2) before any connection is opened", async () => {
    for (const args of [
      [],
      ["--charge", CHARGE, "--kind", "INVOICE"],
      ["--charge", CHARGE, "--kind", "RECEIPT", "--requeue"],
      ["--charge", CHARGE, "--kind", "INVOICE", "--record", "DBAI-1", "--requeue"],
      ["--charge", CHARGE, "--kind", "INVOICE", "--record", "DBAI-1", "--confirm-not-issued"],
      ["--charge", CHARGE, "--kind", "INVOICE", "--record"],
      ["--charge", CHARGE, "--charge", CHARGE, "--kind", "INVOICE", "--requeue"],
      ["--charge", "not a charge", "--kind", "INVOICE", "--requeue"],
      ["--charge", CHARGE, "--kind", "INVOICE", "--requeue", "--force"],
      ["--charge", CHARGE, "--kind", "INVOICE", "--record", "two words"],
      // P4-K: --amount belongs to a credit note's --record only, in whole cents, above zero.
      ["--charge", CHARGE, "--kind", "INVOICE", "--record", "DBAI-1", "--amount", "12.10"],
      ["--charge", CHARGE, "--kind", "CREDIT_NOTE", "--requeue", "--amount", "12.10"],
      ["--charge", CHARGE, "--kind", "CREDIT_NOTE", "--amount", "12.10"],
      ["--charge", CHARGE, "--kind", "CREDIT_NOTE", "--record", "DBAI-1", "--amount"],
      ["--charge", CHARGE, "--kind", "CREDIT_NOTE", "--record", "DBAI-1", "--amount", "12.10", "--amount", "12.10"],
      ...["12", "12.1", "12.100", "12,10", "-1.00", "0.00", "012.10", "1e3", " 12.10"].map((amount) =>
        ["--charge", CHARGE, "--kind", "CREDIT_NOTE", "--record", "DBAI-1", "--amount", amount])
    ]) {
      const { lines, output } = sink();
      const open = vi.fn();
      expect(await runBillingInvoiceCli(args, output, open), args.join(" ")).toBe(2);
      expect(lines.err).toBe("BILLING_INVOICE_USAGE\n");
      expect(open).not.toHaveBeenCalled();
    }
  });

  it("prints one line, or ONE refusal code on stderr (exit 1), and always closes", async () => {
    const close = vi.fn(async () => undefined);
    const done = sink();
    expect(await runBillingInvoiceCli(["--charge", CHARGE, "--kind", "INVOICE", "--requeue"], done.output, async () => ({
      run: async () => ({ kind: "REQUEUED" as const, jobKind: "QUADERNO_RECORD_SALE" as const }), close
    }))).toBe(0);
    expect(done.lines.out).toContain(`Re-queued: the QUADERNO_RECORD_SALE job of charge ${CHARGE}`);
    const refused = sink();
    expect(await runBillingInvoiceCli(["--charge", CHARGE, "--kind", "INVOICE", "--requeue"], refused.output, async () => ({
      run: async () => { throw new TypedDomainError("BILLING_INVOICE_NOTHING_TO_ISSUE", "x"); }, close
    }))).toBe(1);
    expect(refused.lines.err).toBe("BILLING_INVOICE_NOTHING_TO_ISSUE\n");
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("says a dashboard refund's credit note was recorded at the owner's amount, and that the quarter now counts it (P4-K)", async () => {
    const recorded = sink();
    expect(await runBillingInvoiceCli(
      ["--charge", CHARGE, "--kind", "CREDIT_NOTE", "--record", "DBAI-0042", "--amount", "12.10"], recorded.output,
      async () => ({
        run: async () => ({ kind: "RECORDED" as const, document: "CREDIT_NOTE" as const, issuer: "SMARTBILL" as const, creditNoteWaiting: false }),
        close: async () => undefined
      })
    )).toBe(0);
    expect(recorded.lines.out).toContain(`Recorded: SmartBill credit note DBAI-0042 for charge ${CHARGE}.`);
    expect(recorded.lines.out).toContain("The quarter's tax summary now subtracts this refund at 12.10 USD.");
    // Control: a credit note recorded without --amount says nothing of an amount the owner never gave.
    const plain = sink();
    expect(await runBillingInvoiceCli(["--charge", CHARGE, "--kind", "CREDIT_NOTE", "--record", "DBAI-0042"], plain.output,
      async () => ({
        run: async () => ({ kind: "RECORDED" as const, document: "CREDIT_NOTE" as const, issuer: "SMARTBILL" as const, creditNoteWaiting: false }),
        close: async () => undefined
      }))).toBe(0);
    expect(plain.lines.out).not.toContain("USD");
  });
});
