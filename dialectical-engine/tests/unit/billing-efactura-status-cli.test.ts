import { describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  parseEfacturaStatusArguments,
  renderEfacturaStatusResult,
  runBillingEfacturaStatusCli
} from "../../apps/api/src/billing/efactura-status-cli.js";

const CHARGE = "a".repeat(32);
const DOCUMENT = Object.freeze({
  invoiceId: "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93", chargeId: CHARGE, kind: "INVOICE" as const
});
const sink = () => {
  const lines = { out: "", err: "" };
  return { lines, output: { stdout: (text: string) => { lines.out += text; }, stderr: (text: string) => { lines.err += text; } } };
};

describe("P16b pnpm billing:efactura-status", () => {
  it("accepts exactly --invoice <series>-<number> --status ACCEPTED|REJECTED", () => {
    expect(parseEfacturaStatusArguments(["--invoice", "DBAI-0042", "--status", "ACCEPTED"]))
      .toEqual({ series: "DBAI", number: "0042", status: "ACCEPTED" });
    expect(parseEfacturaStatusArguments(["--status", "REJECTED", "--invoice", "DBAI-0042"]))
      .toEqual({ series: "DBAI", number: "0042", status: "REJECTED" });
    for (const args of [
      [], ["--invoice", "DBAI-0042"], ["--invoice", "DBAI 0042", "--status", "ACCEPTED"],
      // SENT_BY_ACCOUNT_SETTING is P10b's own record, never the owner's; the status is exact.
      ["--invoice", "DBAI-0042", "--status", "SENT_BY_ACCOUNT_SETTING"], ["--invoice", "DBAI-0042", "--status", "accepted"],
      ["--invoice", "DBAI-0042", "--status", "ACCEPTED", "--invoice", "DBAI-0043"],
      ["--invoice", "DBAI-0042", "--status", "ACCEPTED", "--extra"]
    ]) {
      expect(() => parseEfacturaStatusArguments(args), args.join(" ")).toThrow("BILLING_EFACTURA_STATUS_USAGE");
    }
  });

  it("opens no connection on bad usage, records with its clock, and prints one code on a refusal", async () => {
    const usage = sink();
    const unopened = vi.fn();
    expect(await runBillingEfacturaStatusCli(["--invoice", "DBAI-0042"], usage.output, unopened)).toBe(2);
    expect(usage.lines.err).toBe("BILLING_EFACTURA_STATUS_USAGE\n");
    expect(unopened).not.toHaveBeenCalled();

    const at = new Date("2027-01-12T09:00:00.000Z");
    const record = vi.fn(async () => DOCUMENT);
    const close = vi.fn(async () => undefined);
    const done = sink();
    expect(await runBillingEfacturaStatusCli(["--invoice", "DBAI-0042", "--status", "ACCEPTED"], done.output,
      async () => ({ record, close }), () => at)).toBe(0);
    expect(record).toHaveBeenCalledWith({ series: "DBAI", number: "0042", status: "ACCEPTED" }, at);
    expect(close).toHaveBeenCalledOnce();
    expect(done.lines.out).toBe(renderEfacturaStatusResult({ series: "DBAI", number: "0042", status: "ACCEPTED" }, DOCUMENT));
    expect(done.lines.out).toContain(`invoice DBAI-0042 (charge ${CHARGE})`);
    expect(done.lines.out).toContain("leaves the e-Factura list");
    expect(renderEfacturaStatusResult({ series: "DBAI", number: "0042", status: "REJECTED" }, DOCUMENT))
      .toContain("stays on the e-Factura list");

    const refused = sink();
    const unknownDocument = async () => ({
      record: async (): Promise<never> => {
        throw new TypedDomainError("EFACTURA_DOCUMENT_UNKNOWN", "No SmartBill document has this series and number");
      },
      close: async () => undefined
    });
    expect(await runBillingEfacturaStatusCli(["--invoice", "DBAI-9999", "--status", "REJECTED"], refused.output, unknownDocument))
      .toBe(1);
    expect(refused.lines.err).toBe("EFACTURA_DOCUMENT_UNKNOWN\n");
  });
});
