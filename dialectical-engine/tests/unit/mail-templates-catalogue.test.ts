import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAIL_LOCALES, MAIL_TEMPLATES, RESERVED_MAIL_PARAMS } from "@debateai/mail-templates";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { assertLocalizedCatalog, assertTranslationSample } from "../support/mailCatalogueContract.js";

const MESSAGES = resolve("packages/mail-templates/messages");
const read = (path: string): Record<string, string> =>
  JSON.parse(readFileSync(join(MESSAGES, path), "utf8")) as Record<string, string>;
const placeholders = (value: string): string[] =>
  [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]!);

describe("P17 mail catalogues", () => {
  it("names exactly the interface's 35 locales, one directory each", () => {
    expect([...MAIL_LOCALES].sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    const directories = readdirSync(MESSAGES, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    expect(directories).toEqual([...MAIL_LOCALES].sort());
  });

  it("keeps every locale's mail.json in key and placeholder parity with English", () => {
    const english = read("en/mail.json");
    const catalogs = new Map<string, Record<string, string>>();
    for (const locale of MAIL_LOCALES) {
      const localized = read(`${locale}/mail.json`);
      assertLocalizedCatalog({ english, localized, locale, namespace: "mail" });
      catalogs.set(locale, localized);
    }
    assertTranslationSample({ catalogs, english, namespace: "mail" });
  });

  it("uses in each template only the params it declares, and declares none it never uses", () => {
    const english = { ...read("en/mail.json"), ...read("en/owner.json") };
    const reserved = new Set<string>(RESERVED_MAIL_PARAMS);
    for (const [id, template] of Object.entries(MAIL_TEMPLATES)) {
      const declared: Record<string, string> = { ...template.params, ...(template.optional ?? {}) };
      // Every sentence a paragraph may show counts: both sides of an attachment or param condition.
      const keys = [template.subject];
      const used = new Set<string>();
      for (const paragraph of template.paragraphs) {
        if (typeof paragraph === "string") keys.push(paragraph);
        else if ("block" in paragraph) used.add(paragraph.block);
        else if ("ifAttached" in paragraph) keys.push(paragraph.attached, paragraph.missing);
        else {
          used.add(paragraph.ifParam);
          keys.push(paragraph.then, ...(paragraph.otherwise === null ? [] : [paragraph.otherwise]));
        }
      }
      for (const key of keys) {
        expect(english[key], `${id}: ${key}`).toBeDefined();
        for (const name of placeholders(english[key]!)) {
          used.add(name);
          // A flag only chooses a sentence; no sentence prints it.
          expect(declared[name], `${id} ${key} prints {${name}}`).not.toBe("flag");
        }
      }
      for (const name of used) {
        expect(Object.hasOwn(declared, name) || reserved.has(name), `${id} uses {${name}}`).toBe(true);
      }
      for (const name of Object.keys(declared)) expect(used.has(name), `${id} declares ${name}`).toBe(true);
      for (const paragraph of template.paragraphs) {
        if (typeof paragraph === "string" || !("ifAttached" in paragraph)) continue;
        // Both sentences need the same params, so an email reads whole whichever one the attachments pick.
        expect(placeholders(english[paragraph.attached]!).filter((name) => !reserved.has(name)).sort(), `${id} ${paragraph.attached}`)
          .toEqual(placeholders(english[paragraph.missing]!).filter((name) => !reserved.has(name)).sort());
      }
    }
  });

  it("reads an optional param only where it is present, and tests each param as its kind allows", () => {
    const english = read("en/mail.json");
    for (const [id, template] of Object.entries(MAIL_TEMPLATES)) {
      const optional = new Set(Object.keys(template.optional ?? {}));
      const declared: Record<string, string> = { ...template.params, ...(template.optional ?? {}) };
      for (const name of optional) expect(Object.hasOwn(template.params, name), `${id} ${name} twice`).toBe(false);
      for (const name of placeholders(english[template.subject] ?? "")) {
        expect(optional.has(name), `${id} subject reads optional {${name}}`).toBe(false);
      }
      for (const paragraph of template.paragraphs) {
        if (typeof paragraph === "string") {
          for (const name of placeholders(english[paragraph] ?? "")) {
            expect(optional.has(name), `${id} ${paragraph} reads {${name}}`).toBe(false);
          }
          continue;
        }
        if ("block" in paragraph) continue;
        if ("ifAttached" in paragraph) {
          for (const key of [paragraph.attached, paragraph.missing]) {
            for (const name of placeholders(english[key]!)) expect(optional.has(name), `${id} ${key} reads {${name}}`).toBe(false);
          }
          continue;
        }
        // Only the `then` sentence of a `present` test on that very param may read an optional param.
        for (const key of [paragraph.then, ...(paragraph.otherwise === null ? [] : [paragraph.otherwise])]) {
          for (const name of placeholders(english[key]!).filter((candidate) => optional.has(candidate))) {
            expect(paragraph.test === "present" && paragraph.ifParam === name && key === paragraph.then, `${id} ${key} reads {${name}}`)
              .toBe(true);
          }
        }
        const kind = declared[paragraph.ifParam];
        const fits = paragraph.test === "present" ? optional.has(paragraph.ifParam)
          : paragraph.test === "true" ? kind === "flag" : kind === "amount";
        expect(fits, `${id}: ${paragraph.test} on ${paragraph.ifParam} (${String(kind)})`).toBe(true);
      }
    }
  });

  it("keeps the three order and invoice sentences exact in English and in parity in every locale", () => {
    const english = read("en/order.json");
    // D6a's englishOrderText says the same three sentences; tests/unit/mail-order-text.test.ts compares them.
    expect(english).toEqual({
      "order.planDescription": "DebateAI {plan} monthly plan",
      "order.cardCheck": "DebateAI card check",
      "invoice.line": "DebateAI {plan} plan, {from} to {to}"
    });
    const catalogs = new Map<string, Record<string, string>>();
    for (const locale of MAIL_LOCALES) {
      const localized = read(`${locale}/order.json`);
      assertLocalizedCatalog({ english, localized, locale, namespace: "order" });
      // The product and plan names stay as they are in every language (contract §10).
      expect(localized["order.cardCheck"], `${locale} names DebateAI`).toContain("DebateAI");
      catalogs.set(locale, localized);
    }
    assertTranslationSample({ catalogs, english, namespace: "order" });
  });

  it("tracks the UI's parity rules: the copy is re-read whenever the original changes", () => {
    const original = readFileSync(resolve("apps/ui/lib/i18n/catalogContractAssertions.mjs"));
    expect(createHash("sha256").update(original).digest("hex"),
      "apps/ui/lib/i18n/catalogContractAssertions.mjs changed: update tests/support/mailCatalogueContract.ts to match, then this pin")
      .toBe("0dee2a311e3671b57167d46ba8f2ab882f2aff82ddf0774f3af243aad9ff654c");
  });

  it("the copied rules refuse a missing key and a lost placeholder", () => {
    const english = { "mail.x": "Hello {name}", "mail.y": "Bye" };
    expect(() => assertLocalizedCatalog({ english, localized: { "mail.x": "Salut {name}" }, locale: "ro", namespace: "mail" }))
      .toThrow(/keys/);
    expect(() => assertLocalizedCatalog({ english, localized: { "mail.x": "Salut", "mail.y": "Pa" }, locale: "ro", namespace: "mail" }))
      .toThrow(/placeholders/);
  });

  it("keeps no company-facts file of its own: no _company.json and no _merchant.json (ruling R3-4, one mirror)", () => {
    // The emails read P6a's SELLER_COMPANY; a JSON file beside the locale directories would be a second mirror.
    expect(readdirSync(MESSAGES).filter((name) => name.endsWith(".json"))).toEqual([]);
  });
});
