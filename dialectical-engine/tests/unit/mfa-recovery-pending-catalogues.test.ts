/**
 * Owner ruling 2026-10-09: the Settings → Security banner for an authenticator recovery that is waiting its 24 hours
 * exists in all 35 interface locales, English exactly as committed, translated (never an English stand-in), and every
 * locale keeps the {time} placeholder where the finish time goes.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MESSAGES = new URL("../../apps/ui/messages/", import.meta.url);
const read = (locale: string): Record<string, string> => JSON.parse(readFileSync(new URL(`${locale}/settings.json`, MESSAGES), "utf8")) as Record<string, string>;
const LOCALES = readdirSync(MESSAGES, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
const ENGLISH = Object.freeze({
  "settings.security.pendingRecovery.title": "Someone started replacing your authenticator",
  // Review M2 2026-10-09: it never finishes by itself, so the banner says from when it can be finished, and "now" after that.
  "settings.security.pendingRecovery.body": "Someone used your password and an email link to start replacing the authenticator on this account. You can finish it from {time}.",
  "settings.security.pendingRecovery.bodyReady": "Someone used your password and an email link to start replacing the authenticator on this account. You can finish it now — use the link in your email.",
  "settings.security.pendingRecovery.keep": "Until it is finished, your current authenticator, recovery codes and sessions keep working. If this wasn't you, cancel it.",
  "settings.security.pendingRecovery.cancel": "Cancel",
  "settings.security.pendingRecovery.cancelled": "Recovery cancelled.",
  "settings.security.pendingRecovery.failed": "We could not cancel it. Reload the page and try again."
});

describe("the waiting-recovery banner in every interface locale", () => {
  it("has 35 locales", () => { expect(LOCALES).toHaveLength(35); });
  it("English is exactly the committed sentence", () => {
    const english = read("en");
    for (const [key, value] of Object.entries(ENGLISH)) expect(english[key], key).toBe(value);
  });
  it("every locale carries every key, translated, never empty", () => {
    for (const locale of LOCALES) {
      const catalog = read(locale);
      for (const [key, value] of Object.entries(ENGLISH)) {
        expect(typeof catalog[key], `${locale}:${key}`).toBe("string");
        expect(catalog[key]!.trim(), `${locale}:${key}`).not.toBe("");
        if (locale !== "en") expect(catalog[key], `${locale}:${key}`).not.toBe(value);
      }
    }
  });
  it("every locale keeps exactly one {time} for the finish time and no other placeholder", () => {
    for (const locale of LOCALES) {
      const catalog = read(locale);
      for (const key of Object.keys(ENGLISH)) {
        const placeholders = catalog[key]?.match(/\{[^}]*\}/g) ?? [];
        expect(placeholders, `${locale}:${key}`).toEqual(key.endsWith(".body") ? ["{time}"] : []);
      }
    }
  });
});
