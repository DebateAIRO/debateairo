// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * V4 review ask-f4 (owner picks 3 Nov; the word is "quota"): the header shows the window that binds first, in its own
 * word. A Free person whose month is used up reads "This month: 100%", never today's share; a paid person mid-day reads
 * today's. A tie goes to the longest window, the way the server's room sentence names one. Nothing shows without a read.
 */
const server = vi.hoisted(() => ({ usage: null as unknown }));
vi.mock("@/lib/api", () => ({
  contractClient: {
    getBillingUsage: async () => {
      if (server.usage === null) throw new Error("404: billing off");
      return server.usage;
    },
    readReadingLevel: async () => ({ reading_level: "plain" }),
    saveReadingLevel: async () => ({ reading_level: "plain" })
  }
}));

import { V4Header, tightestWindow } from "../../apps/ui/components/v4/V4Header.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const RESET = "2026-12-01T00:00:00.000Z";
const window_ = (scope: string, percent: number) => ({ scope, percent, resets_at: RESET });
const paid = (...windows: ReturnType<typeof window_>[]) => ({ plan_id: "PLUS", windows });
const free = (percent: number) => ({ plan_id: "FREE", windows: [window_("PERSON_MONTH", percent)] });
const team = (...windows: ReturnType<typeof window_>[]) => ({ plan_id: null, funding: { kind: "INTERNAL", expires_at: RESET }, windows });

let root: Root | null = null;
beforeEach(() => { server.usage = null; });
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
});

async function headerQuota(): Promise<string | null> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<V4Header catalog={CATALOG} readingLevel={null} />);
    for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
  });
  return host.querySelector(".v4HdrAllowance")?.textContent ?? null;
}

describe("the V4 header's quota line", () => {
  it.each([
    ["a paid person mid-day reads today's share", paid(window_("PERSON_DAY", 15), window_("PERSON_WEEK", 5), window_("PERSON_MONTH", 2)), "Today: 15% of your quota used"],
    ["a paid person whose week binds reads the week", paid(window_("PERSON_DAY", 10), window_("PERSON_WEEK", 70), window_("PERSON_MONTH", 30)), "This week: 70% of your quota used"],
    ["a Free person reads the month", free(60), "This month: 60% of your quota used"],
    ["a Free person whose month is used up reads the month, not today", free(100), "This month: 100% of your quota used"],
    ["a used-up month outweighs a lighter day", paid(window_("PERSON_DAY", 5), window_("PERSON_WEEK", 40), window_("PERSON_MONTH", 100)), "This month: 100% of your quota used"],
    ["a tie names the longest window", paid(window_("PERSON_DAY", 100), window_("PERSON_WEEK", 100), window_("PERSON_MONTH", 100)), "This month: 100% of your quota used"],
    ["a finish leeway past 100% reads 100%", paid(window_("PERSON_DAY", 108), window_("PERSON_WEEK", 20), window_("PERSON_MONTH", 4)), "Today: 100% of your quota used"],
    ["a team grant that binds reads 'In total'", team(window_("PERSON_DAY", 10), window_("PERSON_WEEK", 20), window_("PERSON_GRANT", 90)), "In total: 90% of your quota used"]
  ])("%s", async (_name, usage, line) => {
    server.usage = usage;
    expect(await headerQuota()).toBe(line);
  });

  it("shows nothing when the usage read fails (billing off, a local site)", async () => {
    server.usage = null;
    expect(await headerQuota()).toBeNull();
  });

  it("shows nothing when the read names no window", () => {
    expect(tightestWindow({ plan_id: "PLUS", windows: [] } as never)).toBeNull();
    expect(tightestWindow(null)).toBeNull();
  });

  it("every window it can name has its own line, in the word the owner chose and with no other number", () => {
    for (const scope of ["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH", "PERSON_GRANT"]) {
      const line = CATALOG[`v4.header.used.${scope}`];
      expect(line, scope).toMatch(/^[A-Z][a-z ]+: \{percent\}% of your quota used$/u);
    }
    expect(Object.values(CATALOG).filter((line) => /allowance/u.test(line) && /\{percent\}% of your/u.test(line))).toEqual([]);
  });
});
