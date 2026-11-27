// PREVIEW_ASKS_OPEN_TO at the API's boot, once the room and billing are built: open asks need the room (it alone bounds
// each person's spending), "everyone" needs real payments (on the sandbox a public test card would buy real AI credit,
// and with billing off no account has a plan window of its own), "everyone-with-test-payments" is refused on any other
// payment system than the sandbox, so the boot line is always true, and "everyone-with-listed-buyers" runs on the sandbox
// or with real payments (buying stays with the listed accounts either way) and is refused with billing off. With the
// listed buyers' value a second line counts the accounts that may buy.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertPreviewAsksOpenBoot, previewAsksOpenBootLine, previewListedBuyersBootLine } from "../../apps/api/src/preview-asks-open.js";

const refusals = await import("../../deploy/" + "preview-auth-dev/v1/startup-refusals.mjs");

const VALUES = [undefined, "everyone", "everyone-with-test-payments", "everyone-with-listed-buyers"] as const;
const PAYMENTS = ["sandbox", "live", null] as const;

/** The expected verdict, written out case by case: null passes, else the code. */
function expected(asksOpen: typeof VALUES[number], roomComposed: boolean, payment: typeof PAYMENTS[number]): string | null {
  if (asksOpen === undefined) return null;
  if (!roomComposed) return "PREVIEW_ASKS_OPEN_TO_WITHOUT_ROOM";
  if (asksOpen === "everyone") {
    return payment === "sandbox" ? "PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING" : payment === null ? "PREVIEW_ASKS_OPEN_TO_BILLING_OFF" : null;
  }
  if (asksOpen === "everyone-with-test-payments") return payment === "sandbox" ? null : "PREVIEW_ASKS_OPEN_TO_TEST_PAYMENTS_NOT_SANDBOX";
  return payment === null ? "PREVIEW_ASKS_OPEN_TO_LISTED_BUYERS_BILLING_OFF" : null;
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

  it("names the cases the owner meets", () => {
    expect(expected("everyone", true, "live")).toBeNull();
    expect(expected("everyone", true, null)).toBe("PREVIEW_ASKS_OPEN_TO_BILLING_OFF");
    expect(expected("everyone-with-test-payments", true, "sandbox")).toBeNull();
    expect(expected("everyone", true, "sandbox")).toBe("PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING");
    expect(expected("everyone-with-listed-buyers", true, "sandbox")).toBeNull();
    expect(expected("everyone-with-listed-buyers", true, "live")).toBeNull();
    expect(expected("everyone-with-listed-buyers", true, null)).toBe("PREVIEW_ASKS_OPEN_TO_LISTED_BUYERS_BILLING_OFF");
    expect(expected("everyone-with-test-payments", true, "live")).toBe("PREVIEW_ASKS_OPEN_TO_TEST_PAYMENTS_NOT_SANDBOX");
  });

  it("the boot line names the opening that runs, and nothing with the team rule", () => {
    expect(previewAsksOpenBootLine(undefined)).toBeNull();
    expect(JSON.parse(previewAsksOpenBootLine("everyone")!)).toEqual({ event: "api.preview.asks_open", to: "everyone" });
    expect(JSON.parse(previewAsksOpenBootLine("everyone-with-test-payments")!)).toEqual({ event: "api.preview.asks_open", to: "everyone-with-test-payments" });
    expect(JSON.parse(previewAsksOpenBootLine("everyone-with-listed-buyers")!)).toEqual({ event: "api.preview.asks_open", to: "everyone-with-listed-buyers" });
  });

  it("with the listed buyers' value a second line says how many accounts may buy, a count and never an id", () => {
    const ids = ["0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e", "9f8e7d6c-5b4a-4321-9876-543210fedcba"];
    const line = previewListedBuyersBootLine("everyone-with-listed-buyers", ids)!;
    expect(JSON.parse(line)).toEqual({ event: "api.preview.listed_buyers", count: 2 });
    for (const id of ids) expect(line).not.toContain(id);
    expect(JSON.parse(previewListedBuyersBootLine("everyone-with-listed-buyers", [])!)).toEqual({ event: "api.preview.listed_buyers", count: 0 });
    // Any other value, or the team rule: no such line.
    for (const value of [undefined, "everyone", "everyone-with-test-payments"] as const) expect(previewListedBuyersBootLine(value, ids), String(value)).toBeNull();
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

  it("hands buildApi the value itself, under the same condition as the open mode, for the buyer rule", () => {
    const value = "...(previewGate === undefined || environment.PREVIEW_ASKS_OPEN === undefined ? {} : { previewAsksOpenTo: environment.PREVIEW_ASKS_OPEN }),";
    expect(count(value)).toBe(1);
    expect(main.indexOf(value)).toBeGreaterThan(main.indexOf("const api = buildApi({"));
    expect(count("previewAsksOpenTo")).toBe(1);
  });

  it("hands the Team page's list routes the list on the preview with billing on, whether payments are the sandbox's or real", () => {
    const staff = main.slice(main.indexOf("const previewBuyerStaff = "), main.indexOf("};", main.indexOf("const previewBuyerStaff = ")));
    expect(staff.replace(/\s+/gu, " ")).toContain("const previewBuyerStaff = previewBuyerRepository === undefined || billingConnectors === null ? undefined : {");
    expect(staff).toContain("applies: environment.PREVIEW_ASKS_OPEN === \"everyone-with-listed-buyers\"");
    expect(staff).toContain("paymentEnvironment: billingConnectors.paymentEnvironment");
    expect(main).not.toContain('paymentEnvironment !== "sandbox" ? undefined');
    expect(main).toContain("...(previewBuyerStaff === undefined ? {} : { previewBuyers: previewBuyerStaff }),");
  });

  it("prints the count line right after the asks line, from the parsed team line", () => {
    const asksLine = main.indexOf("if (previewAsksOpenLine !== null) console.warn(previewAsksOpenLine);");
    const countLine = main.indexOf("const previewListedBuyersLine = previewListedBuyersBootLine(environment.PREVIEW_ASKS_OPEN, environment.PREVIEW_TEAM_USER_IDS);");
    expect(asksLine).toBeGreaterThan(0);
    expect(countLine).toBeGreaterThan(asksLine);
    expect(main).toContain("if (previewListedBuyersLine !== null) console.warn(previewListedBuyersLine);");
    expect(countLine).toBeLessThan(main.indexOf("const api = buildApi({"));
  });
});
