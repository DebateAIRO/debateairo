// B1 part 2 (NETOPIA answers 2026-10-21, Q22): `pnpm billing:renewal-resume` — the owner releases every renewal held
// by our own setup refusal for one more send. No arguments; plain English lines; exit 0, a usage refusal exits 2.
import { describe, expect, it, vi } from "vitest";
import { parseBillingRenewalResumeEnvironment } from "@debateai/register";
import { hostCommand } from "../../apps/api/src/billing/refunds.js";
import { renderRenewalResumeResult, runBillingRenewalResumeCli } from "../../apps/api/src/billing/renewal-resume-cli.js";
import { runbookBillingCommands } from "../support/runbookHostCommands.js";

/** C2: a resumed renewal still waits for its card's daily allowance (2 sends in 24 hours, NETOPIA Q22). */
const LATER = " (later if that card was already tried twice in the last 24 hours)";

const output = () => {
  const lines = { out: "", err: "" };
  return { lines, sink: { stdout: (text: string) => { lines.out += text; }, stderr: (text: string) => { lines.err += text; } } };
};
const resumer = (result: Readonly<{ resumed: number; busy: number }>) => {
  const close = vi.fn(async () => undefined);
  const resume = vi.fn(async () => result);
  return { close, resume, open: vi.fn(async () => ({ resume, close })) };
};

describe("B1 the owner's resume command (pnpm billing:renewal-resume)", () => {
  it("says how many held renewals go out again, or that none is waiting, and asks for a second run when some were busy", () => {
    expect(renderRenewalResumeResult({ resumed: 2, busy: 0 }))
      .toBe(`Sent again: 2 held renewal(s) will each be tried once more within a minute${LATER}.\n`);
    expect(renderRenewalResumeResult({ resumed: 0, busy: 0 })).toBe("Nothing to resume: no renewal is waiting for you.\n");
    expect(renderRenewalResumeResult({ resumed: 1, busy: 3 })).toBe("Sent again: 1 held renewal(s) will each be tried once more"
      + ` within a minute${LATER}.\nBusy: 3 renewal(s) were being worked on; run the command again in a minute.\n`);
    expect(renderRenewalResumeResult({ resumed: 0, busy: 1 })).toBe("Nothing to resume: no renewal is waiting for you.\n"
      + "Busy: 1 renewal(s) were being worked on; run the command again in a minute.\n");
  });

  it("runs with no arguments, prints the result, exits 0 and closes its connection", async () => {
    const held = resumer({ resumed: 1, busy: 0 });
    const run = output();
    expect(await runBillingRenewalResumeCli([], run.sink, held.open)).toBe(0);
    expect(run.lines.out).toBe(`Sent again: 1 held renewal(s) will each be tried once more within a minute${LATER}.\n`);
    expect(run.lines.err).toBe("");
    expect(held.resume).toHaveBeenCalledTimes(1);
    expect(held.close).toHaveBeenCalledTimes(1);
  });

  it("refuses any argument with BILLING_RENEWAL_RESUME_USAGE (exit 2) and opens nothing", async () => {
    for (const args of [["--confirm"], ["--charge", "a".repeat(32)], [""]]) {
      const held = resumer({ resumed: 0, busy: 0 });
      const run = output();
      expect(await runBillingRenewalResumeCli(args, run.sink, held.open), args.join(" ")).toBe(2);
      expect(run.lines.err).toBe("BILLING_RENEWAL_RESUME_USAGE\n");
      expect(run.lines.out).toBe("");
      expect(held.open).not.toHaveBeenCalled();
    }
  });

  it("prints one code on a failure (exit 1), never the error's text, and still closes", async () => {
    const close = vi.fn(async () => undefined);
    const failing = output();
    const open = async () => ({
      resume: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:5432"); }, close
    });
    expect(await runBillingRenewalResumeCli([], failing.sink, open)).toBe(1);
    expect(failing.lines.err).toBe("BILLING_RENEWAL_RESUME_FAILED\n");
    expect(close).toHaveBeenCalledTimes(1);
    const refused = output();
    expect(await runBillingRenewalResumeCli([], refused.sink, async () => {
      throw new TypeError("BILLING_RENEWAL_RESUME_OTHER_PAYMENT_SYSTEM");
    })).toBe(1);
    expect(refused.lines.err).toBe("BILLING_RENEWAL_RESUME_OTHER_PAYMENT_SYSTEM\n");
  });

  it("reads NETOPIA's base URL from the API's EnvironmentFile, and refuses to start without it", () => {
    const base = { DATABASE_URL: "postgres://api@127.0.0.1/debateai", NODE_ENV: "test", REGISTER_VERSION: "3" };
    expect(parseBillingRenewalResumeEnvironment({ ...base, NETOPIA_API_BASE_URL: "https://secure-sandbox.netopia-payments.com" })
      .NETOPIA_API_BASE_URL).toBe("https://secure-sandbox.netopia-payments.com");
    expect(() => parseBillingRenewalResumeEnvironment(base)).toThrow();
  });

  it("C6: reads the OWNER-RUN sandbox's billing clock offset, as the API does (absent in every real deployment)", () => {
    const base = {
      DATABASE_URL: "postgres://api@127.0.0.1/debateai", NODE_ENV: "test", REGISTER_VERSION: "3",
      NETOPIA_API_BASE_URL: "https://secure-sandbox.netopia-payments.com"
    };
    expect(parseBillingRenewalResumeEnvironment(base).BILLING_STAGE_CLOCK_OFFSET_DAYS).toBeUndefined();
    expect(parseBillingRenewalResumeEnvironment({ ...base, BILLING_STAGE_CLOCK_OFFSET_DAYS: "30" })
      .BILLING_STAGE_CLOCK_OFFSET_DAYS).toBe(30);
    expect(() => parseBillingRenewalResumeEnvironment({ ...base, BILLING_STAGE_CLOCK_OFFSET_DAYS: "0" })).toThrow();
  });

  it("is in the runbook in its host form (README §14), as the O3 prints it", () => {
    expect(runbookBillingCommands()).toContain(hostCommand("billing:renewal-resume"));
  });
});
