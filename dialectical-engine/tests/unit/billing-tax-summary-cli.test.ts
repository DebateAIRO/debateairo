import { describe, expect, it, vi } from "vitest";
import { TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW, taxAuthoritiesFromValue } from "@debateai/register";
import { runBillingTaxSummaryCli } from "../../apps/api/src/billing/tax-summary-cli.js";

const sink = () => {
  const lines = { out: "", err: "" };
  return { lines, output: { stdout: (text: string) => { lines.out += text; }, stderr: (text: string) => { lines.err += text; } } };
};
const authorities = taxAuthoritiesFromValue(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value, "test");
const reader = (found: typeof authorities | null, rows = vi.fn(async () => []), efactura = vi.fn(async () => [])) => vi.fn(async () => ({
  rows, invoiceUnknown: async () => [], efactura, paymentsToCheck: async () => [], authorities: async () => found,
  close: async () => undefined
}));

describe("P16b pnpm billing:tax-summary", () => {
  it("needs exactly --quarter YYYY-Qn", async () => {
    for (const args of [[], ["--quarter"], ["--quarter", "2026-Q9"], ["2026-Q4"], ["--quarter", "2026-Q4", "--x"]]) {
      const { lines, output } = sink();
      expect(await runBillingTaxSummaryCli(args, output, vi.fn()), args.join(" ")).toBe(2);
      expect(lines.err).toBe("BILLING_TAX_SUMMARY_USAGE\n");
    }
  });

  it("prints the summary for the quarter it was asked, and refuses a register without the row", async () => {
    const rows = vi.fn(async () => []);
    const efactura = vi.fn(async () => []);
    const ok = sink();
    expect(await runBillingTaxSummaryCli(["--quarter", "2026-Q4"], ok.output, reader(authorities, rows, efactura))).toBe(0);
    expect(rows).toHaveBeenCalledWith(new Date("2026-10-01T00:00:00.000Z"), new Date("2027-01-01T00:00:00.000Z"));
    expect(efactura).toHaveBeenCalledWith(new Date("2026-10-01T00:00:00.000Z"), new Date("2027-01-01T00:00:00.000Z"));
    expect(ok.lines.out).toContain("DebateAI tax summary for 2026-Q4");
    expect(ok.lines.out).toContain("Payments to check by hand in xMoney: none.");
    const missing = sink();
    expect(await runBillingTaxSummaryCli(["--quarter", "2026-Q4"], missing.output, reader(null))).toBe(1);
    expect(missing.lines.err).toBe("TAX_AUTHORITIES_UNRESOLVED\n");
  });
});
