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

/** File (relative to dialectical-engine/) → why a quoted USD is right there. */
const ALLOWED: Readonly<Record<string, string>> = Object.freeze({
  // C1's D10: the owner's check command lists the whole currency set read from the register, in the plans line's order
  // (RON, EUR, USD). It names every currency, never a charge's, and prices nothing.
  "apps/api/src/billing/check-cli.ts": "the check command's display order of the three currencies (spec 2026-10-05 §2.16.1)"
});

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
      .filter((entry) => QUOTED_USD.test(entry.text) && ALLOWED[entry.file] === undefined));
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
    for (const file of Object.keys(ALLOWED)) expect(priceSideFiles()).toContain(file);
  });
});
