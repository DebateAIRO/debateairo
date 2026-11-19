// PREVIEW_ASKS_OPEN_TO at the API's boot, once the room and billing are built: open asks need the room (it alone bounds
// each person's spending), "everyone" is refused while billing runs on the sandbox (a public test card would buy real AI
// credit), and "everyone-with-test-payments" is refused on any other payment system, so the boot line is always true.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertPreviewAsksOpenBoot, previewAsksOpenBootLine } from "../../apps/api/src/preview-asks-open.js";

const refusals = await import("../../deploy/" + "preview-auth-dev/v1/startup-refusals.mjs");

const VALUES = [undefined, "everyone", "everyone-with-test-payments"] as const;
const PAYMENTS = ["sandbox", "live", null] as const;

/** The expected verdict, written out case by case: null passes, else the code. */
function expected(asksOpen: typeof VALUES[number], roomComposed: boolean, payment: typeof PAYMENTS[number]): string | null {
  if (asksOpen === undefined) return null;
  if (!roomComposed) return "PREVIEW_ASKS_OPEN_TO_WITHOUT_ROOM";
  if (asksOpen === "everyone") return payment === "sandbox" ? "PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING" : null;
  return payment === "sandbox" ? null : "PREVIEW_ASKS_OPEN_TO_TEST_PAYMENTS_NOT_SANDBOX";
}

describe("assertPreviewAsksOpenBoot", () => {
  const table = VALUES.flatMap((asksOpen) => [true, false].flatMap((roomComposed) => PAYMENTS.map((payment) => [asksOpen, roomComposed, payment] as const)));
  it.each(table)("asks %s, room %s, payments %s", (asksOpen, roomComposed, paymentEnvironment) => {
    const code = expected(asksOpen, roomComposed, paymentEnvironment);
    const run = () => assertPreviewAsksOpenBoot({ asksOpen, roomComposed, paymentEnvironment });
    if (code === null) expect(run).not.toThrow();
    else {
      expect(run).toThrow(new RegExp(`^${code}$`));
      // A TypeError whose message is the code: the API launcher prints it by name.
      try { run(); } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
        expect(refusals.startupRefusedLine("PREVIEW_API_STARTUP_REFUSED", error)).toBe(`PREVIEW_API_STARTUP_REFUSED ${code}`);
      }
    }
  });

  it("names the four cases the owner meets", () => {
    expect(expected("everyone", true, "live")).toBeNull();
    expect(expected("everyone", true, null)).toBeNull();
    expect(expected("everyone-with-test-payments", true, "sandbox")).toBeNull();
    expect(expected("everyone", true, "sandbox")).toBe("PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING");
  });

  it("the boot line names the opening that runs, and nothing with the team rule", () => {
    expect(previewAsksOpenBootLine(undefined)).toBeNull();
    expect(JSON.parse(previewAsksOpenBootLine("everyone")!)).toEqual({ event: "api.preview.asks_open", to: "everyone" });
    expect(JSON.parse(previewAsksOpenBootLine("everyone-with-test-payments")!)).toEqual({ event: "api.preview.asks_open", to: "everyone-with-test-payments" });
  });
});

describe("apps/api/src/main.ts wires the setting", () => {
  const main = readFileSync(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
  const count = (needle: string) => main.split(needle).length - 1;

  it("checks it exactly once, as its own boot stage, after billing and its live and sandbox record checks", () => {
    expect(count("assertPreviewAsksOpenBoot(")).toBe(1);
    const check = main.indexOf('boot.runSync("preview-asks-open", () => assertPreviewAsksOpenBoot({');
    expect(check).toBeGreaterThan(0);
    for (const before of ["const askRoom = askRoomComposition?.room;", "const billingConnectors: BillingConnectors | null",
      'await boot.run("billing-other-system-records"', 'await boot.run("billing-records-dated-ahead"', 'await boot.run("billing-live-records-on-sandbox"']) {
      expect(main.indexOf(before), before).toBeGreaterThan(0);
      expect(main.indexOf(before), before).toBeLessThan(check);
    }
    expect(main.slice(check, check + 400).replace(/\s+/gu, " ")).toContain(
      "asksOpen: environment.PREVIEW_ASKS_OPEN, roomComposed: askRoom !== undefined, paymentEnvironment: billingConnectors?.paymentEnvironment ?? null");
    // Checked before the API is built, so a refused boot never listens.
    expect(check).toBeLessThan(main.indexOf("const api = buildApi({"));
  });

  it("hands the open mode to the route gate and the submit gate, keyed on the preview's gate part, as new lines only", () => {
    const spread = "...(previewGate === undefined || environment.PREVIEW_ASKS_OPEN === undefined ? {} : { previewAsksOpen: true as const }),";
    expect(count(spread)).toBe(2);
    const application = main.indexOf("const application = new PostgresAskApplication(");
    const api = main.indexOf("const api = buildApi({");
    const first = main.indexOf(spread), second = main.lastIndexOf(spread);
    expect(first).toBeGreaterThan(application); expect(first).toBeLessThan(api); expect(second).toBeGreaterThan(api);
  });
});
