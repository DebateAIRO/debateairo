import { describe, expect, it } from "vitest";
import { formatReset } from "../../apps/ui/lib/billing/formatReset.js";

/**
 * `{time}` (budget spec §2.11; contract §10): Intl.DateTimeFormat in the site
 * locale and the viewer's time zone. It shows the time alone when the instant
 * is today, the weekday and time within the next six days, and the date WITH
 * its time otherwise: a person's week or month wait still says when, to the
 * minute, that the debate starts. "Today" is the VIEWER's calendar day.
 */
const now = new Date("2026-09-29T01:00:00.000Z"); // a Tuesday

describe("formatReset", () => {
  it("shows the time alone for later today", () => {
    expect(formatReset(new Date("2026-09-29T03:00:00.000Z"), now, "en-GB", "UTC")).toBe("03:00");
  });

  it("shows the weekday and time within six days", () => {
    expect(formatReset(new Date("2026-10-01T03:00:00.000Z"), now, "en-GB", "UTC")).toBe("Thu 03:00");
    expect(formatReset(new Date("2026-10-05T03:00:00.000Z"), now, "en-GB", "UTC")).toBe("Mon 03:00");
  });

  it("shows the date and its time from the seventh day on, so a long wait never loses its start time", () => {
    expect(formatReset(new Date("2026-10-06T03:00:00.000Z"), now, "en-GB", "UTC")).toBe("6 Oct, 03:00");
    expect(formatReset(new Date("2026-10-12T03:00:00.000Z"), now, "en-GB", "UTC")).toBe("12 Oct, 03:00");
    expect(formatReset(new Date("2026-10-19T17:45:00.000Z"), now, "en-GB", "UTC")).toBe("19 Oct, 17:45");
  });

  it("decides 'today' in the viewer's time zone", () => {
    const at = new Date("2026-09-29T23:30:00.000Z");
    const evening = new Date("2026-09-29T20:00:00.000Z");
    expect(formatReset(at, evening, "en-GB", "UTC")).toBe("23:30");
    // Bucharest is UTC+3 in September: 23:00 on the 29th, and the reset is 02:30 on the 30th.
    expect(formatReset(at, evening, "en-GB", "Europe/Bucharest")).toBe("Wed 02:30");
  });

  it("speaks the site locale", () => {
    expect(formatReset(new Date("2026-10-12T03:00:00.000Z"), now, "ro", "UTC")).not.toBe("12 Oct, 03:00");
    expect(formatReset(new Date("2026-10-12T03:00:00.000Z"), now, "ro", "UTC")).toContain("03:00");
  });
});
