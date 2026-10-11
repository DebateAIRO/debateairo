import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Spec 2026-10-05 §2.16.4 (Part C, task C2): on the price side every charge, NETOPIA request, Quaderno record and
 * SmartBill document takes the charge's, quote's or subscription's currency. A quoted "USD" there is a currency nobody
 * chose. The settings (packages/register), the fold's pre-Part-C default (packages/billing-core/src/subscription.ts)
 * and the AI-credit side (credit, caps, cost envelopes, budget, evaluator, story policy) keep USD and are not scanned.
 * Task C3 extends it to the mail renderer and the UI's money helper (spec 2026-10-05 §2.16.5), and to the owner's
 * texts: none prints an amount followed by a currency word it did not read from the charge.
 *
 * An exemption is one line, never a file: an ALLOWED entry names its file and the exact trimmed source line, and a
 * stale or reworded entry fails the second case. The mail renderer's two default-currency lines are exempted so.
 */
const ENGINE = fileURLToPath(new URL("../..", import.meta.url));

const PRICE_DIRECTORIES: ReadonlyArray<string> = Object.freeze([
  "apps/api/src/billing",
  "packages/tax-quaderno/src",
  "packages/invoice-smartbill/src",
  "packages/payments-netopia/src"
]);
const PRICE_FILES: ReadonlyArray<string> = Object.freeze([
  "packages/billing-core/src/ports.ts",
  "packages/db/src/billing.ts",
  "packages/mail-templates/src/render.ts",
  "apps/ui/lib/billing/format.ts"
]);

/** One exempted line: its file (relative to dialectical-engine/), its exact trimmed text, and why a quoted USD is right. */
type AllowedLine = Readonly<{ file: string; text: string; reason: string }>;
const ALLOWED: ReadonlyArray<AllowedLine> = Object.freeze([
  Object.freeze({
    file: "apps/api/src/billing/check-cli.ts",
    text: 'const CURRENCY_LINE_ORDER: ReadonlyArray<BillingCurrency> = Object.freeze(["RON", "EUR", "USD"]);',
    reason: "C1's D10: the check command's display order of the three currencies; it names every currency and prices nothing"
  }),
  Object.freeze({
    file: "packages/mail-templates/src/render.ts",
    text: 'const PRICE_CURRENCIES: ReadonlySet<string> = new Set<PriceCurrency>(["USD", "EUR", "RON"]);',
    reason: "C3's D5: the three currencies an email's params.currency may name; it names every currency and prices nothing"
  }),
  Object.freeze({
    file: "packages/mail-templates/src/render.ts",
    text: 'if (value === undefined) return "USD";',
    reason: "C3's D5: an email queued before Part C names no currency, and every such email was in US dollars"
  })
]);
const isAllowed = (file: string, text: string): boolean =>
  ALLOWED.some((entry) => entry.file === file && entry.text === text);

const QUOTED_USD = /["'`]USD["'`]/u;
const isScanned = (name: string): boolean => name.endsWith(".ts") && !/\.(?:test|spec)\.ts$/u.test(name);

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return walk(path);
    return isScanned(name) ? [path] : [];
  });
}

function priceSideFiles(): string[] {
  const found = [
    ...PRICE_DIRECTORIES.flatMap((directory) => walk(join(ENGINE, directory))),
    ...PRICE_FILES.map((file) => join(ENGINE, file))
  ];
  return found.map((path) => relative(ENGINE, path).split("\\").join("/")).sort();
}

describe("the price side names no currency of its own (spec 2026-10-05 §2.16.4)", () => {
  it("has no quoted USD outside ALLOWED", () => {
    const hits = priceSideFiles().flatMap((file) => readFileSync(join(ENGINE, file), "utf8").split("\n")
      .map((line, index) => ({ file, line: index + 1, text: line.trim() }))
      .filter((entry) => QUOTED_USD.test(entry.text) && !isAllowed(entry.file, entry.text)));
    expect(hits).toEqual([]);
  });

  it("reads the files that make charges, NETOPIA requests and documents (a moved directory fails here)", () => {
    expect(priceSideFiles()).toEqual(expect.arrayContaining([
      "apps/api/src/billing/checkout.ts",
      "apps/api/src/billing/renewal.ts",
      "apps/api/src/billing/upgrade.ts",
      "apps/api/src/billing/card-change.ts",
      "packages/tax-quaderno/src/index.ts",
      "packages/invoice-smartbill/src/index.ts",
      "packages/billing-core/src/ports.ts",
      "packages/db/src/billing.ts"
    ]));
    expect(priceSideFiles()).toEqual(expect.arrayContaining([
      "packages/mail-templates/src/render.ts", "apps/ui/lib/billing/format.ts"
    ]));
    for (const entry of ALLOWED) {
      expect(priceSideFiles()).toContain(entry.file);
      const lines = readFileSync(join(ENGINE, entry.file), "utf8").split("\n").map((line) => line.trim());
      expect(lines, `${entry.file} no longer holds the exempted line`).toContain(entry.text);
    }
  });

  it("prints no owner text's amount with a hard-coded currency word (spec 2026-10-05 §2.16.5)", () => {
    const AMOUNT_THEN_USD = /\)\}\s?USD\b/u;
    const ownerTexts = ["tax-summary.ts", "withdraw-cli.ts", "invoice-cli.ts", "refund-done-cli.ts"]
      .map((name) => `apps/api/src/billing/${name}`);
    const hits = ownerTexts.flatMap((file) => readFileSync(join(ENGINE, file), "utf8").split("\n")
      .map((line, index) => ({ file, line: index + 1, text: line.trim() }))
      .filter((entry) => AMOUNT_THEN_USD.test(entry.text)));
    expect(hits).toEqual([]);
    // The pattern catches the shape these texts used before Part C.
    expect(AMOUNT_THEN_USD.test("`Net sales ${microsToDecimal(line.netMicros)} USD,`")).toBe(true);
  });
});
