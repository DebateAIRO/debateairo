import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Spec 2026-10-05 §2.16.4 (Part C, task C2): on the price side every charge, NETOPIA request, Quaderno record and
 * SmartBill document takes the charge's, quote's or subscription's currency. A quoted "USD" there is a currency nobody
 * chose. The settings (packages/register), the fold's pre-Part-C default (packages/billing-core/src/subscription.ts)
 * and the AI-credit side (credit, caps, cost envelopes, budget, evaluator, story policy) keep USD and are not scanned.
 * Task C3 extends this file to the mail renderer and the UI's money helper.
 *
 * An exemption is one line, never a file: an ALLOWED entry names its file and the exact trimmed source line, and a
 * stale or reworded entry fails the second case. C3 adds the mail renderer's default-currency lines the same way.
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
  "packages/db/src/billing.ts"
]);

/** One exempted line: its file (relative to dialectical-engine/), its exact trimmed text, and why a quoted USD is right. */
type AllowedLine = Readonly<{ file: string; text: string; reason: string }>;
const ALLOWED: ReadonlyArray<AllowedLine> = Object.freeze([
  Object.freeze({
    file: "apps/api/src/billing/check-cli.ts",
    text: 'const CURRENCY_LINE_ORDER: ReadonlyArray<BillingCurrency> = Object.freeze(["RON", "EUR", "USD"]);',
    reason: "C1's D10: the check command's display order of the three currencies; it names every currency and prices nothing"
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
    for (const entry of ALLOWED) {
      expect(priceSideFiles()).toContain(entry.file);
      const lines = readFileSync(join(ENGINE, entry.file), "utf8").split("\n").map((line) => line.trim());
      expect(lines, `${entry.file} no longer holds the exempted line`).toContain(entry.text);
    }
  });
});
