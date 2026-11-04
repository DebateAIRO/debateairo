// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * V4 review (owner picks 3 Nov; the word is "quota"). public-d3 A: the header's pill is steady: it always shows the plan's
 * own window, today on paid plans and the month on Free (public-f15), and another window only when that one blocks a
 * start because it is used up (ask-f4: a Free or paid person whose month is used up reads "This month: 100%", never
 * today's share; a tie names the longest window, as the server's room sentence does). A team grant names the window that
 * binds first. Past 100% it says "more than your quota" (map-f9). Tapping it shows today, this week and this month. It is
 * read again after each quota moment and when the tab is shown again (wait-f22, public-f15, map-f9). Nothing shows
 * without a read.
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

// ask-d6 A: the header's account button has its own test (v4-header-account); this one is about the quota line.
vi.mock("@/components/v4/V4AccountMenu", () => ({ V4AccountMenu: () => null }));
import { V4Header, tightestWindow } from "../../apps/ui/components/v4/V4Header.js";
import { pillDetails, pillText, pillWindow } from "../../apps/ui/components/v4/V4QuotaPill.js";
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
      ? <V4Header catalog={CATALOG} readingLevel={null} />
      : <V4Header catalog={CATALOG} readingLevel={null} showQuota={showQuota} />);
  });
  await flush();
  return host;
}

async function headerQuota(showQuota?: boolean): Promise<string | null> {
  const host = await mountHeader(showQuota);
  return host.querySelector(".v4HdrAllowance")?.textContent ?? null;
}

describe("the V4 header's quota line", () => {
  it.each([
    ["a paid person mid-day reads today's share", paid(window_("PERSON_DAY", 15), window_("PERSON_WEEK", 5), window_("PERSON_MONTH", 2)), "Today: 15% of your quota used"],
    // public-d3 A: steady. The fuller week is named where it blocks a start, never by the pill while it does not.
    ["a paid person whose week is fuller still reads today (the pill is steady)", paid(window_("PERSON_DAY", 10), window_("PERSON_WEEK", 70), window_("PERSON_MONTH", 30)), "Today: 10% of your quota used"],
    ["a Free person reads the month", free(60), "This month: 60% of your quota used"],
    ["a Free person whose month is used up reads the month, not today", free(100), "This month: 100% of your quota used"],
    ["a used-up month outweighs a lighter day", paid(window_("PERSON_DAY", 5), window_("PERSON_WEEK", 40), window_("PERSON_MONTH", 100)), "This month: 100% of your quota used"],
    ["a used-up week is named on a paid plan", paid(window_("PERSON_DAY", 20), window_("PERSON_WEEK", 100), window_("PERSON_MONTH", 40)), "This week: 100% of your quota used"],
    ["a tie names the longest window", paid(window_("PERSON_DAY", 100), window_("PERSON_WEEK", 100), window_("PERSON_MONTH", 100)), "This month: 100% of your quota used"],
    // map-f9: past it, never "100%".
    ["a finish leeway past 100% reads 'more than'", paid(window_("PERSON_DAY", 108), window_("PERSON_WEEK", 20), window_("PERSON_MONTH", 4)), "Today: more than your quota used"],
    ["a team grant that binds reads 'In total'", team(window_("PERSON_DAY", 10), window_("PERSON_WEEK", 20), window_("PERSON_GRANT", 90)), "In total: 90% of your quota used"]
  ])("%s", async (_name, usage, line) => {
    server.usage = usage;
    expect(await headerQuota()).toBe(line);
  });

  it("journey-f19: a page that shows no quota (a public page's note) reads no usage and shows no share (review F8)", async () => {
    server.usage = paid(window_("PERSON_DAY", 15));
    expect(await headerQuota(false)).toBeNull();
    expect(server.reads).toBe(0);
  });

  describe("ask-f16 with the wave-2 checks: the pill's place is held only for a signed-in person", () => {
    async function mountWith(session: "CHECKING" | "IN" | "OUT" | undefined, answer: Promise<unknown>): Promise<HTMLDivElement> {
      const host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);
      server.answer = answer;
      await act(async () => {
        root!.render(session === undefined
          ? <V4Header catalog={CATALOG} readingLevel={null} />
          : <V4Header catalog={CATALOG} readingLevel={null} session={session} />);
      });
      return host;
    }

    it("signed in (or a signed-in-only page): an empty, hidden place until the read answers, then the pill in it", async () => {
      for (const session of ["IN", undefined] as const) {
        let answer: (usage: unknown) => void = () => undefined;
        const host = await mountWith(session, new Promise((resolve) => { answer = resolve; }));
        const hold = host.querySelector(".v4HdrQuotaHold");
        expect(hold).not.toBeNull();
        expect(hold!.getAttribute("aria-hidden")).toBe("true");
        expect(hold!.textContent).toBe("");
        await act(async () => answer(free(60)));
        await flush();
        expect(host.querySelector(".v4HdrQuotaHold")).toBeNull();
        expect(host.querySelector(".v4HdrAllowance")?.textContent).toBe("This month: 60% of your quota used");
        await act(async () => root!.unmount());
        root = null;
        host.remove();
      }
    });

    it("signed out, or still checking: no held place and no usage read (they never get a pill, so nothing jumps)", async () => {
      for (const session of ["OUT", "CHECKING"] as const) {
        server.reads = 0;
        const host = await mountWith(session, Promise.resolve(free(60)));
        await flush();
        expect(host.querySelector(".v4HdrQuotaHold")).toBeNull();
        expect(host.querySelector(".v4HdrAllowance")).toBeNull();
        expect(server.reads).toBe(0);
        await act(async () => root!.unmount());
        root = null;
        host.remove();
      }
    });

    it("a read that fails lets the held place go (billing off): nothing is left behind", async () => {
      const host = await mountWith("IN", Promise.reject(new Error("404: billing off")));
      await flush();
      expect(host.querySelector(".v4HdrQuotaHold")).toBeNull();
      expect(host.querySelector(".v4HdrAllowance")).toBeNull();
    });
  });

  it("shows nothing when the usage read fails (billing off, a local site)", async () => {
    server.usage = null;
    expect(await headerQuota()).toBeNull();
  });

  it("shows nothing when the read names no window", () => {
    expect(tightestWindow({ plan_id: "PLUS", windows: [] } as never)).toBeNull();
    expect(tightestWindow(null)).toBeNull();
    expect(pillWindow({ plan_id: "PLUS", windows: [] } as never)).toBeNull();
    expect(pillWindow(null)).toBeNull();
    expect(pillDetails(null)).toEqual([]);
  });

  it("public-d3 A: tapping the pill shows today, this week and this month in words, and Escape or a click outside closes it", async () => {
    server.usage = paid(window_("PERSON_MONTH", 9), window_("PERSON_DAY", 14), window_("PERSON_WEEK", 31));
    const host = await mountHeader();
    const pill = host.querySelector<HTMLButtonElement>(".v4HdrQuotaButton")!;
    expect(pill.textContent).toBe("Today: 14% of your quota used");
    const list = host.querySelector<HTMLUListElement>(".v4HdrQuotaList")!;
    expect(list.hidden).toBe(true);
    expect(pill.getAttribute("aria-expanded")).toBe("false");
    await act(async () => pill.click());
    expect(list.hidden).toBe(false);
    expect(pill.getAttribute("aria-controls")).toBe(list.id);
    expect([...list.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "Today: 14% of your quota used", "This week: 31% of your quota used", "This month: 9% of your quota used"
    ]);
    await act(async () => pill.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(list.hidden).toBe(true);
    await act(async () => pill.click());
    await act(async () => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(list.hidden).toBe(true);
    // Never what is left (r2-2 A, journey-f8).
    expect(host.textContent).not.toMatch(/\bleft\b/u);
  });

  it("a Free read with its month only is plain text: nothing more to open", async () => {
    server.usage = free(30);
    const host = await mountHeader();
    expect(host.querySelector(".v4HdrQuotaButton")).toBeNull();
    expect(host.querySelector(".v4HdrAllowance")?.textContent).toBe("This month: 30% of your quota used");
  });

  it("wait-f22 / public-f15 / map-f9: read again after a quota moment and when the tab is shown again, quietly", async () => {
    server.usage = paid(window_("PERSON_DAY", 14), window_("PERSON_WEEK", 31), window_("PERSON_MONTH", 9));
    const host = await mountHeader();
    expect(server.reads).toBe(1);
    server.usage = paid(window_("PERSON_DAY", 34), window_("PERSON_WEEK", 40), window_("PERSON_MONTH", 12));
    await act(async () => quotaChanged());
    await flush();
    expect(server.reads).toBe(2);
    expect(host.querySelector(".v4HdrAllowance")?.textContent).toBe("Today: 34% of your quota used");
    // A failed read keeps what was shown (no blinking out).
    server.usage = null;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await flush();
    expect(server.reads).toBe(3);
    expect(host.querySelector(".v4HdrAllowance")?.textContent).toBe("Today: 34% of your quota used");
  });

  it("every window has its 'more than' line, and the pill's words come from the catalogue", () => {
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
