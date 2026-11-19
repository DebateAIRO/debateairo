import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  availablePaymentMarks, NETOPIA_LOGO_ID_FORM, NETOPIA_LOGO_SETTING, netopiaLogoAddress, PAYMENT_MARK_NAMES, PAYMENT_MARKS_SETTING
} from "../../apps/ui/lib/billing/paymentMarks.js";

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

  it("the website and the test site's tools know the same three marks", async () => {
    const environment = await import("../../deploy/" + "preview-auth-dev/v1/environment.mjs");
    expect(environment.PAYMENT_MARK_NAMES).toEqual(PAYMENT_MARK_NAMES);
  });
});

describe("NETOPIA's hosted logo: the NETOPIA_LOGO_ID setting gives one image address on NETOPIA's server", () => {
  // Made-up shop ids: the real one is never in the repository.
  const GOOD = ["1", "123456", "000000000001", "999999999999"];
  const BAD = ["", "12a", " 123", "123 ", "-1", "1.5", "1234567890123", "１２３", "123\n", "0x12"];

  it("is absent until the setting is there, and then NETOPIA's black-on-light picture for that id", () => {
    expect(NETOPIA_LOGO_SETTING).toBe("NETOPIA_LOGO_ID");
    expect(netopiaLogoAddress({})).toBeNull();
    expect(netopiaLogoAddress({ NETOPIA_LOGO_ID: "123456" })).toBe("https://mny.ro/np-black-0.svg?id=123456");
    for (const id of GOOD) expect(netopiaLogoAddress({ NETOPIA_LOGO_ID: id }), id).toBe(`https://mny.ro/np-black-0.svg?id=${id}`);
  });

  it("gives no address for any value that is not 1 to 12 digits", () => {
    for (const id of BAD) expect(netopiaLogoAddress({ NETOPIA_LOGO_ID: id }), JSON.stringify(id)).toBeNull();
  });

  it("the website's start, the test site's tools and this reader hold the same form", async () => {
    const environment = await import("../../deploy/" + "preview-auth-dev/v1/environment.mjs") as { isNetopiaLogoId: (value: unknown) => boolean };
    for (const id of [...GOOD, ...BAD]) expect(environment.isNetopiaLogoId(id), JSON.stringify(id)).toBe(NETOPIA_LOGO_ID_FORM.test(id));
    expect(environment.isNetopiaLogoId(undefined)).toBe(false);
    expect(environment.isNetopiaLogoId(123456)).toBe(false);
    const server = readFileSync(new URL("../../apps/ui/server.mjs", import.meta.url), "utf8");
    expect(NETOPIA_LOGO_ID_FORM.source).toBe("^[0-9]{1,12}$");
    expect(server).toContain(`!/${NETOPIA_LOGO_ID_FORM.source}/.test(netopiaLogoId)) throw refuse("NETOPIA_LOGO_ID_INVALID");`);
    expect(server).toContain("const netopiaLogoId = process.env.NETOPIA_LOGO_ID;");
    // Before the release key is read, so a start without a key (the integration smoke) still names this refusal.
    expect(server.indexOf('throw refuse("NETOPIA_LOGO_ID_INVALID")')).toBeLessThan(server.indexOf("parseWebsiteReleaseKey(process.env.RELEASE_KEY"));
  });

  it("the page's image policy lets exactly that address's host in", async () => {
    const policy = await import("../../apps/ui/" + "content-security-policy.mjs") as { FALLBACK_CONTENT_SECURITY_POLICY: string };
    const origin = new URL(netopiaLogoAddress({ NETOPIA_LOGO_ID: "123456" })!).origin;
    expect(policy.FALLBACK_CONTENT_SECURITY_POLICY.split("; ")).toContain(`img-src 'self' data: ${origin}`);
  });
});
