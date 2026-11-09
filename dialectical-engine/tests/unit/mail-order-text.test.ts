import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MailTemplateError, ORDER_TEXT_KINDS, renderOrderText, type OrderTextKindId } from "@debateai/mail-templates";
import { catalogueOrderText } from "../../apps/api/src/billing/order-text-catalogue.js";
import { englishOrderText, invoiceDate, planName, type OrderTextKind } from "../../apps/api/src/billing/order-text.js";

// D6a declared its port before these catalogues existed; these lines stop compiling the day the two drift apart.
type SameKinds = [OrderTextKind] extends [OrderTextKindId]
  ? ([OrderTextKindId] extends [OrderTextKind] ? true : false) : false;
const SAME_KINDS: SameKinds = true;

const PARAMS: Readonly<Record<OrderTextKindId, Readonly<Record<string, string>>>> = Object.freeze({
  ORDER_PLAN: Object.freeze({ plan: planName("PLUS") }),
  CARD_CHECK: Object.freeze({}),
  INVOICE_LINE: Object.freeze({ plan: planName("PRO"), from: "1 October 2026", to: "1 November 2026" })
});

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof MailTemplateError) return error.code;
    throw error;
  }
  throw new Error("expected a MailTemplateError");
}

describe("P17 the order and invoice sentences (D6a's orderText port)", () => {
  it("says in English exactly what D6a's English fallback says, for every kind", () => {
    expect(SAME_KINDS).toBe(true);
    expect([...ORDER_TEXT_KINDS].sort()).toEqual(["CARD_CHECK", "INVOICE_LINE", "ORDER_PLAN"]);
    for (const kind of ORDER_TEXT_KINDS) {
      expect(catalogueOrderText(kind, "en", PARAMS[kind]), kind).toBe(englishOrderText(kind, "en", PARAMS[kind]));
    }
  });

  it("writes an invoice line's dates day first in every English, as the pages do (owner's answer to question 5, 5 Nov 2026)", () => {
    for (const english of ["en", "en-US", "en-GB"]) {
      expect(invoiceDate(new Date("2026-10-01T00:00:00.000Z"), english)).toBe("1 October 2026");
      expect(invoiceDate(new Date("2026-11-30T23:59:59.000Z"), english)).toBe("30 November 2026");
    }
    // Other languages keep their own order.
    expect(invoiceDate(new Date("2026-10-01T00:00:00.000Z"), "ro")).toBe("1 octombrie 2026");
    expect(invoiceDate(new Date("2026-10-01T00:00:00.000Z"), "de")).toBe("1. Oktober 2026");
  });

  it("speaks the buyer's language, keeps the product names, and falls back to English", () => {
    const romanian = renderOrderText("ORDER_PLAN", "ro", { plan: "Plus" });
    expect(romanian).not.toBe("Dialectical Engine Plus monthly plan");
    expect(romanian).toContain("Dialectical Engine");
    expect(romanian).toContain("Plus");
    expect(renderOrderText("INVOICE_LINE", "de", PARAMS.INVOICE_LINE)).toContain("1 October 2026");
    expect(renderOrderText("CARD_CHECK", "xx", {})).toBe("Dialectical Engine card check");
  });

  it("refuses a missing, unknown or multi-line param, and an unknown kind, with a code and no value", () => {
    expect(codeOf(() => renderOrderText("ORDER_PLAN", "en", {}))).toBe("MAIL_TEMPLATE_PARAM_MISSING");
    expect(codeOf(() => renderOrderText("CARD_CHECK", "en", { plan: "Plus" }))).toBe("MAIL_TEMPLATE_PARAM_UNKNOWN");
    expect(codeOf(() => renderOrderText("ORDER_PLAN", "en", { plan: "Plus\r\nBcc: x" }))).toBe("MAIL_TEMPLATE_PARAM_INVALID");
    expect(codeOf(() => renderOrderText("NOPE" as OrderTextKindId, "en", {}))).toBe("MAIL_TEMPLATE_UNKNOWN");
    try {
      renderOrderText("ORDER_PLAN", "en", { plan: "secret\nline" });
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  });

  it("the billing runtime signs checkout orders and words invoice lines through the catalogue", () => {
    const runtime = readFileSync(resolve("apps/api/src/billing/runtime.ts"), "utf8");
    const slice = (anchor: string, end: string): string => {
      const start = runtime.indexOf(anchor);
      expect(start, anchor).toBeGreaterThanOrEqual(0);
      return runtime.slice(start, runtime.indexOf(end, start));
    };
    expect(slice("const checkout = new CheckoutService({", "});")).toContain("orderText: catalogueOrderText");
    expect(slice("const invoiceDeps = {", "};")).toContain("orderText: catalogueOrderText");
  });
});
