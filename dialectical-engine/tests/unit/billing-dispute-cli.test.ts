import { describe, expect, it, vi } from "vitest";
import { createPool } from "@debateai/db";
import { parseBillingOperatorEnvironment } from "@debateai/register";
import {
  parseDisputeArguments,
  renderDisputeResult,
  runBillingDisputeCli
} from "../../apps/api/src/billing/dispute-cli.js";

const REF = "a".repeat(32);
const output = () => {
  const lines = { out: "", err: "" };
  return { lines, sink: { stdout: (text: string) => { lines.out += text; }, stderr: (text: string) => { lines.err += text; } } };
};

describe("P14b the dispute command", () => {
  it("accepts exactly --charge <32 hex> --outcome won|lost", () => {
    expect(parseDisputeArguments(["--charge", REF, "--outcome", "won"])).toEqual({ chargeRef: REF, outcome: "won" });
    expect(parseDisputeArguments(["--outcome", "lost", "--charge", REF])).toEqual({ chargeRef: REF, outcome: "lost" });
    for (const args of [[], ["--charge", REF], ["--charge", "xyz", "--outcome", "won"], ["--charge", REF, "--outcome", "maybe"],
      ["--charge", REF, "--outcome", "won", "--extra", "1"]]) {
      expect(() => parseDisputeArguments(args), args.join(" ")).toThrow("BILLING_DISPUTE_USAGE");
    }
  });

  it("prints one plain line per outcome and exits 2 on bad usage, 1 on a refusal", async () => {
    expect(renderDisputeResult("RESUMED", { chargeRef: REF, outcome: "won" })).toContain("paid features are back");
    expect(renderDisputeResult("ENDED_DISPUTE", { chargeRef: REF, outcome: "lost" })).toContain("has ended");
    expect(renderDisputeResult("SECOND_PAYMENT", { chargeRef: REF, outcome: "won" })).toContain("second payment");
    expect(renderDisputeResult("SECOND_PAYMENT", { chargeRef: REF, outcome: "lost" })).toContain("plan is unchanged");
    const usage = output();
    expect(await runBillingDisputeCli(["--charge"], usage.sink, vi.fn())).toBe(2);
    expect(usage.lines.err).toBe("BILLING_DISPUTE_USAGE\n");
    const refused = output();
    const open = vi.fn(async () => ({ record: async () => { throw new TypeError("BILLING_DISPUTE_NO_CHARGEBACK"); }, close: async () => undefined }));
    expect(await runBillingDisputeCli(["--charge", REF, "--outcome", "won"], refused.sink, open)).toBe(1);
    expect(refused.lines.err).toBe("BILLING_DISPUTE_NO_CHARGEBACK\n");
    const done = output();
    const ok = vi.fn(async () => ({ record: async () => "RESUMED" as const, close: async () => undefined }));
    expect(await runBillingDisputeCli(["--charge", REF, "--outcome", "won"], done.sink, ok)).toBe(0);
    expect(done.lines.out).toContain(REF);
  });

  it("reads the API's database, register version and mode, and nothing else", () => {
    expect(parseBillingOperatorEnvironment({
      DATABASE_URL: "postgresql://debateai_prod_api_runtime:x@localhost/debateai", REGISTER_VERSION: "7", NODE_ENV: "test"
    })).toMatchObject({ REGISTER_VERSION: 7 });
    expect(() => parseBillingOperatorEnvironment({ REGISTER_VERSION: "7" })).toThrow();
  });

  it("refuses a pool whose connection wait is not a bounded whole number of milliseconds", () => {
    for (const connectionTimeoutMillis of [0, -1, 1.5, 600_001]) {
      expect(() => createPool("postgresql://nobody@localhost/none", { connectionTimeoutMillis }), String(connectionTimeoutMillis))
        .toThrow("DATABASE_POOL_CONNECTION_TIMEOUT_INVALID");
    }
  });
});
