// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The header's quota circle (the owner's answers of 5 Nov 2026, questions 14 B and 15 with both rounds of follow-ups; the
 * word is "quota"). A round circle fills as quota is used, with the whole percentage inside, and shows the FULLEST period
 * the plan counts, the longest on a tie (a Free or paid person whose month is used up reads the month). Past 100% (a
 * running debate's finish leeway, map-f9: never "100%") it is a full ring with "Over" inside. Its name says the period in
 * words. Tapping it opens one bar per period the plan counts (paid: today, this week, this month; Free: this month; a team
 * grant: its own windows), each with its percentage; a bar past 100% says "Today: more than your quota used". Never what
 * is left. It is read again after each quota moment and when the tab is shown again (wait-f22, public-f15, map-f9),
 * quietly, in place. Nothing shows without a read.
 */
const server = vi.hoisted(() => ({ usage: null as unknown, reads: 0, answer: null as Promise<unknown> | null }));
vi.mock("@/lib/api", () => ({
  contractClient: {
    getBillingUsage: async () => {
      server.reads += 1;
      // A test that holds the answer back (ask-f16's held place) hands its own promise.
      if (server.answer !== null) return server.answer;
      if (server.usage === null) throw new Error("404: billing off");
      return server.usage;
    },
    readReadingLevel: async () => ({ reading_level: "plain" }),
    saveReadingLevel: async () => ({ reading_level: "plain" })
  }
}));

// ask-d6 A: the header's account button has its own test (v4-header-account); this one is about the quota circle.
vi.mock("@/components/v4/V4AccountMenu", () => ({ V4AccountMenu: () => null }));
import { V4Header } from "../../apps/ui/components/v4/V4Header.js";
import { circleName, circleShare, pillDetails, pillText, pillWindow } from "../../apps/ui/components/v4/V4QuotaPill.js";
import { quotaChanged } from "../../apps/ui/lib/v4/quotaPulse.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const RESET = "2026-12-01T00:00:00.000Z";
const window_ = (scope: string, percent: number) => ({ scope, percent, resets_at: RESET });
const paid = (...windows: ReturnType<typeof window_>[]) => ({ plan_id: "PLUS", windows });
const free = (percent: number) => ({ plan_id: "FREE", windows: [window_("PERSON_MONTH", percent)] });
const team = (...windows: ReturnType<typeof window_>[]) => ({ plan_id: null, funding: { kind: "INTERNAL", expires_at: RESET }, windows });

let root: Root | null = null;
beforeEach(() => { server.usage = null; server.reads = 0; server.answer = null; });
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
});

async function flush(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
  });
}

async function mountHeader(showQuota?: boolean): Promise<HTMLDivElement> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(showQuota === undefined
      ? <V4Header catalog={CATALOG} />
      : <V4Header catalog={CATALOG} showQuota={showQuota} />);
  });
  await flush();
  return host;
}

const circleOf = (host: ParentNode): HTMLButtonElement | null => host.querySelector<HTMLButtonElement>(".v4HdrQuotaCircle");
/** What the circle shows inside, and its name; null when there is no circle. */
const shownBy = (host: ParentNode): Readonly<{ share: string; name: string | null }> | null => {
  const circle = circleOf(host);
  return circle === null ? null : { share: circle.querySelector(".v4HdrQuotaShare")!.textContent ?? "", name: circle.getAttribute("aria-label") };
};
/** How much of the ring is drawn, out of 100. */
const ringOf = (host: ParentNode): string | null => host.querySelector(".v4HdrQuotaFill")?.getAttribute("stroke-dasharray") ?? null;

describe("the V4 header's quota circle (questions 14 B and 15, 5 Nov)", () => {
  it.each([
    ["a paid person mid-day reads today", paid(window_("PERSON_DAY", 15), window_("PERSON_WEEK", 5), window_("PERSON_MONTH", 2)), "15%", "Quota used: today 15%", "15 100"],
    // 14 B: always the fullest period, so a fuller week is named even while today is light.
    ["a paid person whose week is fuller reads the week", paid(window_("PERSON_DAY", 10), window_("PERSON_WEEK", 70), window_("PERSON_MONTH", 30)), "70%", "Quota used: this week 70%", "70 100"],
    ["a paid person whose month is fuller reads the month", paid(window_("PERSON_DAY", 10), window_("PERSON_WEEK", 20), window_("PERSON_MONTH", 45)), "45%", "Quota used: this month 45%", "45 100"],
    ["a Free person reads the month", free(60), "60%", "Quota used: this month 60%", "60 100"],
    ["a Free person whose month is used up reads a full month", free(100), "100%", "Quota used: this month 100%", "100 100"],
    ["a used-up month outweighs a lighter day", paid(window_("PERSON_DAY", 5), window_("PERSON_WEEK", 40), window_("PERSON_MONTH", 100)), "100%", "Quota used: this month 100%", "100 100"],
    ["a tie names the longest period", paid(window_("PERSON_DAY", 40), window_("PERSON_WEEK", 40), window_("PERSON_MONTH", 12)), "40%", "Quota used: this week 40%", "40 100"],
    ["a tie at the top names the longest period", paid(window_("PERSON_DAY", 100), window_("PERSON_WEEK", 100), window_("PERSON_MONTH", 100)), "100%", "Quota used: this month 100%", "100 100"],
    // The second round of follow-ups (5 Nov) with map-f9: past 100% a full ring with "Over", never "100%" or the real share.
    ["a finish leeway past 100% is a full ring with 'Over'", paid(window_("PERSON_DAY", 108), window_("PERSON_WEEK", 20), window_("PERSON_MONTH", 4)), "Over", "Quota used: today, over your quota", "100 100"],
    ["a team grant reads its fullest window, 'In total' here", team(window_("PERSON_DAY", 10), window_("PERSON_WEEK", 20), window_("PERSON_GRANT", 90)), "90%", "Quota used: in total 90%", "90 100"]
  ])("%s", async (_name, usage, share, name, ring) => {
    server.usage = usage;
    const host = await mountHeader();
    expect(shownBy(host)).toEqual({ share, name });
    expect(ringOf(host)).toBe(ring);
    // The old words ("Today: 14% of your quota used") are not on the header any more, at any size.
    expect(host.querySelector(".v4HdrAllowance")).toBeNull();
    expect(circleOf(host)!.hasAttribute("data-quota-over")).toBe(share === "Over");
  });

  it("the circle's name keeps the figure it shows (WCAG 2.5.3), and never says 100% past it", () => {
    for (const percent of [0, 7, 70, 100]) {
      const window = { scope: "PERSON_WEEK" as const, percent };
      expect(circleName(window, CATALOG)).toContain(circleShare(window, CATALOG));
    }
    const over = { scope: "PERSON_MONTH" as const, percent: 104 };
    expect(circleShare(over, CATALOG)).toBe("Over");
    expect(circleName(over, CATALOG).toLowerCase()).toContain(circleShare(over, CATALOG).toLowerCase());
    expect(circleName(over, CATALOG)).not.toMatch(/\d/u);
  });

  it("journey-f19: a page that shows no quota (a public page's note) reads no usage and shows no circle (review F8)", async () => {
    server.usage = paid(window_("PERSON_DAY", 15));
    const host = await mountHeader(false);
    expect(circleOf(host)).toBeNull();
    expect(host.querySelector(".v4HdrQuotaHold")).toBeNull();
    expect(server.reads).toBe(0);
  });

  describe("ask-f16 with the wave-2 checks: the circle's place is held for a person who is, or may be, signed in", () => {
    async function mountWith(session: "CHECKING" | "IN" | "OUT" | undefined, answer: Promise<unknown>): Promise<HTMLDivElement> {
      const host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);
      server.answer = answer;
      await act(async () => {
        root!.render(session === undefined
          ? <V4Header catalog={CATALOG} />
          : <V4Header catalog={CATALOG} session={session} />);
      });
      return host;
    }

    it("signed in (or a signed-in-only page): an empty, hidden place until the read answers, then the circle in it", async () => {
      for (const session of ["IN", undefined] as const) {
        let answer: (usage: unknown) => void = () => undefined;
        const host = await mountWith(session, new Promise((resolve) => { answer = resolve; }));
        const hold = host.querySelector(".v4HdrQuotaHold");
        expect(hold).not.toBeNull();
        expect(hold!.getAttribute("aria-hidden")).toBe("true");
        expect(hold!.textContent).toBe("");
        expect(circleOf(host)).toBeNull();
        await act(async () => answer(free(60)));
        await flush();
        expect(host.querySelector(".v4HdrQuotaHold")).toBeNull();
        expect(shownBy(host)).toEqual({ share: "60%", name: "Quota used: this month 60%" });
        await act(async () => root!.unmount());
        root = null;
        host.remove();
      }
    });

    it("signed out: no held place and no usage read (they never get a circle, so nothing jumps)", async () => {
      const host = await mountWith("OUT", Promise.resolve(free(60)));
      await flush();
      expect(host.querySelector(".v4HdrQuotaHold")).toBeNull();
      expect(circleOf(host)).toBeNull();
      expect(server.reads).toBe(0);
    });

    const render = async (session: "CHECKING" | "IN" | "OUT"): Promise<void> => {
      await act(async () => root!.render(<V4Header catalog={CATALOG} session={session} />));
    };

    it("the wave-2 checks (P2 / W2L-1): still checking, the place is held from the first frame and nothing is read; signed in, the same place waits for the read", async () => {
      let answer: (usage: unknown) => void = () => undefined;
      const host = await mountWith("CHECKING", new Promise((resolve) => { answer = resolve; }));
      await flush();
      const held = host.querySelector(".v4HdrQuotaHold");
      expect(held).not.toBeNull();
      expect(held!.getAttribute("aria-hidden")).toBe("true");
      expect(server.reads).toBe(0);
      // The session answers IN: the very same held place stays (nothing moves), and only now is the usage read.
      await render("IN");
      await flush();
      expect(host.querySelector(".v4HdrQuotaHold")).toBe(held);
      expect(server.reads).toBe(1);
      await act(async () => answer(free(60)));
      await flush();
      expect(host.querySelector(".v4HdrQuotaHold")).toBeNull();
      expect(shownBy(host)?.share).toBe("60%");
    });

    it("the wave-2 checks (P2): still checking and then signed out, the held place closes at once and nothing was read", async () => {
      const host = await mountWith("CHECKING", Promise.resolve(free(60)));
      await flush();
      expect(host.querySelector(".v4HdrQuotaHold")).not.toBeNull();
      await render("OUT");
      await flush();
      expect(host.querySelector(".v4HdrQuotaHold")).toBeNull();
      expect(circleOf(host)).toBeNull();
      expect(server.reads).toBe(0);
    });

    it("a read that fails lets the held place go (billing off): nothing is left behind", async () => {
      const host = await mountWith("IN", Promise.reject(new Error("404: billing off")));
      await flush();
      expect(host.querySelector(".v4HdrQuotaHold")).toBeNull();
      expect(circleOf(host)).toBeNull();
    });
  });

  it("shows nothing when the usage read fails (billing off, a local site)", async () => {
    server.usage = null;
    const host = await mountHeader();
    expect(circleOf(host)).toBeNull();
    expect(host.querySelector(".v4HdrQuota")).toBeNull();
  });

  it("shows nothing when the read names no window", () => {
    expect(pillWindow({ plan_id: "PLUS", windows: [] } as never)).toBeNull();
    expect(pillWindow(null)).toBeNull();
    expect(pillDetails(null)).toEqual([]);
  });

  /** The open circle's bars: what each shows, what each reads out, and how full each is drawn. */
  const barsOf = (host: ParentNode) => [...host.querySelectorAll<HTMLLIElement>(".v4HdrQuotaBars > li")].map((bar) => ({
    shows: bar.querySelector(".v4HdrQuotaBarHead")!.textContent,
    says: bar.querySelector(".v4SrOnly")!.textContent,
    fill: bar.querySelector<HTMLElement>(".v4HdrQuotaBarFill")!.style.width
  }));

  it("tapping the circle opens one bar per period, day first, each with its percentage; Escape or a click outside closes them", async () => {
    server.usage = paid(window_("PERSON_MONTH", 9), window_("PERSON_DAY", 14), window_("PERSON_WEEK", 31));
    const host = await mountHeader();
    const circle = circleOf(host)!;
    expect(shownBy(host)).toEqual({ share: "31%", name: "Quota used: this week 31%" });
    const bars = host.querySelector<HTMLUListElement>(".v4HdrQuotaBars")!;
    expect(bars.hidden).toBe(true);
    expect(circle.getAttribute("aria-expanded")).toBe("false");
    expect(circle.getAttribute("aria-controls")).toBe(bars.id);
    expect(bars.getAttribute("aria-label")).toBe(CATALOG["v4.header.quotaDetails"]);
    await act(async () => circle.click());
    expect(bars.hidden).toBe(false);
    expect(circle.getAttribute("aria-expanded")).toBe("true");
    expect(barsOf(host)).toEqual([
      { shows: "Today14%", says: "Today: 14% of your quota used", fill: "14%" },
      { shows: "This week31%", says: "This week: 31% of your quota used", fill: "31%" },
      { shows: "This month9%", says: "This month: 9% of your quota used", fill: "9%" }
    ]);
    await act(async () => circle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(bars.hidden).toBe(true);
    expect(document.activeElement).toBe(circle);
    await act(async () => circle.click());
    await act(async () => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(bars.hidden).toBe(true);
    // Never what is left (r2-2 A, journey-f8).
    expect(host.textContent).not.toMatch(/\bleft\b/u);
  });

  it("Free opens too: one bar, this month", async () => {
    server.usage = free(30);
    const host = await mountHeader();
    await act(async () => circleOf(host)!.click());
    expect(barsOf(host)).toEqual([{ shows: "This month30%", says: "This month: 30% of your quota used", fill: "30%" }]);
  });

  it("a team grant opens its own windows, its total named 'In total'", async () => {
    server.usage = team(window_("PERSON_GRANT", 50), window_("PERSON_DAY", 10));
    const host = await mountHeader();
    await act(async () => circleOf(host)!.click());
    expect(barsOf(host).map((bar) => bar.says)).toEqual(["Today: 10% of your quota used", "In total: 50% of your quota used"]);
  });

  it("past 100%: the full bar says 'Today: more than your quota used', and nothing says 100% or the real share", async () => {
    server.usage = paid(window_("PERSON_DAY", 108), window_("PERSON_WEEK", 20), window_("PERSON_MONTH", 4));
    const host = await mountHeader();
    await act(async () => circleOf(host)!.click());
    expect(barsOf(host)[0]).toEqual({ shows: "Today: more than your quota used", says: "Today: more than your quota used", fill: "100%" });
    expect(host.textContent).not.toMatch(/100%|108/u);
  });

  it("wait-f22 / public-f15 / map-f9: read again after a quota moment and when the tab is shown again, quietly and in place", async () => {
    server.usage = paid(window_("PERSON_DAY", 14), window_("PERSON_WEEK", 31), window_("PERSON_MONTH", 9));
    const host = await mountHeader();
    const circle = circleOf(host)!;
    expect(server.reads).toBe(1);
    server.usage = paid(window_("PERSON_DAY", 34), window_("PERSON_WEEK", 40), window_("PERSON_MONTH", 12));
    await act(async () => quotaChanged());
    await flush();
    expect(server.reads).toBe(2);
    // The same circle, redrawn at once: no new element, no highlight, no animation.
    expect(circleOf(host)).toBe(circle);
    expect(shownBy(host)).toEqual({ share: "40%", name: "Quota used: this week 40%" });
    expect(ringOf(host)).toBe("40 100");
    expect(host.querySelector(".v4Highlight")).toBeNull();
    // A failed read keeps what was shown (no blinking out).
    server.usage = null;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await flush();
    expect(server.reads).toBe(3);
    expect(shownBy(host)?.share).toBe("40%");
  });

  it("the circle and its bars never move: no transition or animation in their styles, and the same circle at every screen size", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-quota.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/gu)].filter(([, selector]) => /\.v4HdrQuota/u.test(selector!));
    expect(rules.length).toBeGreaterThan(5);
    for (const [, selector, body] of rules) expect(body, selector).not.toMatch(/transition|animation/u);
    // No screen size hides it or swaps it for words.
    expect(css).not.toMatch(/@media[^{]*\{[^@]*\.v4HdrQuota/u);
    expect(css).not.toMatch(/\.v4HdrAllowance/u);
  });

  it("every window has its 'more than' line, and the bars' words come from the catalogue", () => {
    for (const scope of ["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH", "PERSON_GRANT"]) {
      expect(CATALOG[`v4.header.over.${scope}`], scope).toMatch(/^[A-Z][a-z ]+: more than your quota used$/u);
    }
    expect(pillText({ scope: "PERSON_MONTH", percent: 101 }, CATALOG)).toBe("This month: more than your quota used");
    expect(pillText({ scope: "PERSON_DAY", percent: 100 }, CATALOG)).toBe("Today: 100% of your quota used");
  });

  it("every window it can name has its own line, in the word the owner chose and with no other number", () => {
    for (const scope of ["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH", "PERSON_GRANT"]) {
      const line = CATALOG[`v4.header.used.${scope}`];
      expect(line, scope).toMatch(/^[A-Z][a-z ]+: \{percent\}% of your quota used$/u);
    }
    expect(Object.values(CATALOG).filter((line) => /allowance/u.test(line) && /\{percent\}% of your/u.test(line))).toEqual([]);
  });
});
