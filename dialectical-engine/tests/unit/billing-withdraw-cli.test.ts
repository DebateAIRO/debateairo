import { describe, expect, it, vi } from "vitest";
import { parseBillingWithdrawEnvironment } from "@debateai/register";
import { BillingRefusal } from "../../apps/api/src/billing/refusal.js";
import {
  parseWithdrawArguments,
  renderWithdrawResult,
  runBillingWithdrawCli
} from "../../apps/api/src/billing/withdraw-cli.js";

const OWNER = "0b4e2a9c-6f1d-4c3e-9a7b-2d5f8e1c0a93";
const RECEIVED = "2026-10-12T08:30:00Z";
const output = () => {
  const lines = { out: "", err: "" };
  return { lines, sink: { stdout: (text: string) => { lines.out += text; }, stderr: (text: string) => { lines.err += text; } } };
};

describe("P14c the withdrawal command", () => {
  it("accepts --owner <ref> alone (R2 Q-9), with --received <UTC instant>, or with --refund <amount> [--dashboard <amount>]", () => {
    // Q-9's own form: the statement is taken as received now, when the command runs.
    expect(parseWithdrawArguments(["--owner", OWNER])).toEqual({ kind: "RECORD", ownerRef: OWNER, receivedAt: null });
    expect(parseWithdrawArguments(["--owner", OWNER, "--received", RECEIVED]))
      .toEqual({ kind: "RECORD", ownerRef: OWNER, receivedAt: new Date("2026-10-12T08:30:00.000Z") });
    expect(parseWithdrawArguments(["--refund", "12.10", "--owner", OWNER]))
      .toEqual({ kind: "SETTLE", ownerRef: OWNER, refundMicros: 12_100_000, dashboardMicros: 0 });
    expect(parseWithdrawArguments(["--owner", OWNER, "--refund", "0.00"])).toMatchObject({ refundMicros: 0, dashboardMicros: 0 });
    // What the owner refunded in the xMoney dashboard for this withdrawal: M8 names the sum of both parts.
    expect(parseWithdrawArguments(["--owner", OWNER, "--dashboard", "5.00", "--refund", "3.00"]))
      .toEqual({ kind: "SETTLE", ownerRef: OWNER, refundMicros: 3_000_000, dashboardMicros: 5_000_000 });
    for (const args of [
      [], ["--received", RECEIVED], ["--owner", "not-a-ref", "--refund", "1.00"],
      ["--owner", OWNER, "--received", "2026-10-12"], ["--owner", OWNER, "--received", "2026-10-12T08:30:00+03:00"],
      ["--owner", OWNER, "--refund", "12.1"], ["--owner", OWNER, "--refund", "-1.00"],
      ["--owner", OWNER, "--received", RECEIVED, "--refund", "1.00"],
      ["--owner", OWNER, "--refund", "1.00", "--extra", "1"],
      // The dashboard part only settles, and only in the AMOUNT format.
      ["--owner", OWNER, "--dashboard", "5.00"], ["--owner", OWNER, "--received", RECEIVED, "--dashboard", "5.00"],
      ["--owner", OWNER, "--refund", "1.00", "--dashboard", "5"], ["--owner", OWNER, "--refund", "1.00", "--dashboard", "-5.00"]
    ]) {
      expect(() => parseWithdrawArguments(args), args.join(" ")).toThrow("BILLING_WITHDRAW_USAGE");
    }
  });

  it("prints one plain line per outcome, and names the settling command when the owner must decide", () => {
    const record = parseWithdrawArguments(["--owner", OWNER, "--received", RECEIVED]);
    expect(renderWithdrawResult({ kind: "REFUNDING", refundMicros: 18_150_000 }, record))
      .toContain("18.15 USD goes back to the card");
    expect(renderWithdrawResult({ kind: "NOTHING_DUE" }, record)).toContain("nothing was due back");
    const review = renderWithdrawResult({ kind: "OWNER_REVIEW" }, record);
    // First the dashboard for what the command cannot take back, then the settle with both amounts.
    expect(review).toContain("refund there what this command cannot take back");
    expect(review).toContain(`pnpm billing:withdraw --owner ${OWNER} --refund <amount through this command>`
      + " --dashboard <amount refunded in the dashboard>");
    const settle = parseWithdrawArguments(["--owner", OWNER, "--refund", "3.00", "--dashboard", "5.00"]);
    expect(renderWithdrawResult({ kind: "SETTLED", refundMicros: 3_000_000, dashboardMicros: 5_000_000 }, settle))
      .toContain("3.00 USD goes back to the card and 5.00 USD was refunded in the dashboard (M8 says 8.00)");
    expect(renderWithdrawResult({ kind: "SETTLED", refundMicros: 0, dashboardMicros: 17_590_000 }, settle))
      .toContain("17.59 USD was refunded in the dashboard. M8 is queued");
    expect(renderWithdrawResult({ kind: "SETTLED", refundMicros: 0, dashboardMicros: 0 }, settle)).toContain("nothing more goes back");
  });

  it("exits 2 on bad usage, 1 with one code on a refusal, 0 with the line on success", async () => {
    const usage = output();
    expect(await runBillingWithdrawCli(["--owner"], usage.sink, vi.fn())).toBe(2);
    expect(usage.lines.err).toBe("BILLING_WITHDRAW_USAGE\n");
    const refused = output();
    const closed = vi.fn(async () => ({
      run: async () => { throw new BillingRefusal(409, "WITHDRAWAL_WINDOW_CLOSED"); }, close: async () => undefined
    }));
    expect(await runBillingWithdrawCli(["--owner", OWNER, "--received", RECEIVED], refused.sink, closed)).toBe(1);
    expect(refused.lines.err).toBe("WITHDRAWAL_WINDOW_CLOSED\n");
    const done = output();
    const ok = vi.fn(async () => ({ run: async () => ({ kind: "NOTHING_DUE" as const }), close: async () => undefined }));
    expect(await runBillingWithdrawCli(["--owner", OWNER, "--received", RECEIVED], done.sink, ok)).toBe(0);
    expect(done.lines.out).toContain(OWNER);
    expect(done.lines.err).toBe("");
  });

  it("reads the API's xMoney address too, and refuses to start without it (P2-I4: the system it may refund in)", () => {
    const base = {
      DATABASE_URL: "postgresql://debateai_prod_api_runtime:x@localhost/debateai", REGISTER_VERSION: "7", NODE_ENV: "test"
    };
    expect(parseBillingWithdrawEnvironment({ ...base, XMONEY_API_BASE_URL: "https://api-stage.xmoney.com" }))
      .toMatchObject({ REGISTER_VERSION: 7, XMONEY_API_BASE_URL: "https://api-stage.xmoney.com" });
    expect(() => parseBillingWithdrawEnvironment(base)).toThrow();
  });
});
