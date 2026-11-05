import { describe, expect, it } from "vitest";
import { dateLocale, formatDate } from "../../apps/ui/lib/i18n/translate.js";
import { formatReset } from "../../apps/ui/lib/billing/formatReset.js";
import { relativeTime } from "../../apps/ui/lib/format.js";
import { debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";

/**
 * Owner's answer to question 5 (5 Nov 2026, B, and its follow-ups): every English page writes the day first
 * ("5 November 2026", "1 December", "5 Nov 2026") on the 24-hour clock ("5 Nov 2026, 14:30"), V4 and the older
 * pages (Settings, the classic view, staff pages) alike, whichever English the reader chose: plain English,
 * "English (United States)" or "English (United Kingdom)". Other languages keep their own order. The rule lives in
 * the shared helpers, so no page can write an English date another way.
 */
const AT = "2026-11-05T14:30:00.000Z";
const UTC = { timeZone: "UTC" } as const;
const ENGLISH = ["en", "en-US", "en-GB"] as const;

describe("English dates: day first", () => {
  it.each(ENGLISH)("%s writes the day before the month, with and without the year", (locale) => {
    expect(formatDate(locale, AT, { dateStyle: "long", ...UTC })).toBe("5 November 2026");
    expect(formatDate(locale, AT, { year: "numeric", month: "long", day: "numeric", ...UTC })).toBe("5 November 2026");
    expect(formatDate(locale, AT, { dateStyle: "medium", ...UTC })).toBe("5 Nov 2026");
    expect(formatDate(locale, "2026-12-01T00:00:00.000Z", { day: "numeric", month: "long", ...UTC })).toBe("1 December");
    expect(formatDate(locale, AT, { day: "numeric", month: "short", ...UTC })).toBe("5 Nov");
  });

  it("falls back to day-first English for a language code it cannot read", () => {
    expect(formatDate("not a language!", AT, { dateStyle: "long", ...UTC })).toBe("5 November 2026");
  });

  it("names the British form as the English date form and leaves every other language alone", () => {
    for (const locale of ENGLISH) expect(dateLocale(locale)).toBe("en-GB");
    for (const locale of ["ro", "de", "fr", "ja", "ar", "pt"]) {
      expect(dateLocale(locale)).toBe(locale);
      for (const options of [{ dateStyle: "long" }, { dateStyle: "medium", timeStyle: "short" }] as const) {
        expect(formatDate(locale, AT, { ...options, ...UTC }))
          .toBe(new Intl.DateTimeFormat(locale, { ...options, ...UTC }).format(new Date(AT)));
      }
    }
  });

  it("writes a date more than five weeks old day first in the classic home list", () => {
    expect(relativeTime("2020-10-20T12:00:00.000Z", undefined, "en")).toBe("20/10/2020");
    expect(relativeTime("2020-10-20T12:00:00.000Z", undefined, "en-US")).toBe("20/10/2020");
  });
});

describe("English times: the 24-hour clock", () => {
  it.each(ENGLISH)("%s writes a date and time as \"5 Nov 2026, 14:30\"", (locale) => {
    expect(formatDate(locale, AT, { dateStyle: "medium", timeStyle: "short", ...UTC })).toBe("5 Nov 2026, 14:30");
    expect(formatDate(locale, AT, { hour: "2-digit", minute: "2-digit", ...UTC })).toBe("14:30");
    expect(formatDate(locale, "2026-11-05T03:00:00.000Z", { timeStyle: "short", ...UTC })).toBe("03:00");
  });

  it.each(["en", "en-US"])("%s writes the reset time day first on the 24-hour clock", (locale) => {
    const now = new Date("2026-09-29T01:00:00.000Z"); // a Tuesday
    expect(formatReset(new Date("2026-09-29T15:00:00.000Z"), now, locale, "UTC")).toBe("15:00");
    expect(formatReset(new Date("2026-10-01T15:00:00.000Z"), now, locale, "UTC")).toBe("Thu 15:00");
    expect(formatReset(new Date("2026-10-19T03:00:00.000Z"), now, locale, "UTC")).toBe("19 Oct, 03:00");
  });

  it("writes the classic page's provider-hold time in the site's language, never the browser's own form", () => {
    const holdUntil = "2026-11-05T14:30:00.000Z";
    const run = {
      run_ref: "run:hold", question_line: "Q?", state: "HOLDING" as const, terminal_reason: null,
      hold_until: holdUntil, waits_until: null
    };
    const reason = (locale: string): string =>
      (debateDetailFromRunProjection(run as never, undefined, locale) as { completion?: { humanReason?: string } })
        .completion?.humanReason ?? "";
    const local = (locale: string): string =>
      new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(holdUntil));
    for (const locale of ENGLISH) {
      expect(reason(locale)).toContain(local("en-GB"));
      expect(reason(locale)).not.toMatch(/\b(AM|PM)\b/);
    }
    expect(reason("ro")).toContain(local("ro"));
  });
});
