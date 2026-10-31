// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomNotice, roomSentence } from "../../apps/ui/components/billing/RoomNotice.js";
import { UsageBars } from "../../apps/ui/components/billing/UsageBars.js";
import { composerRoomCatalog } from "../../apps/ui/lib/billing/roomCatalog.js";
import english from "../../apps/ui/messages/en/billing.json";

/** Decisions 14 and 24: a funded person waiting on the team's month reads one plain sentence, and their own room stays percent bars with no price. */
const KEY = "newDebate.room.internalTeamFull";
const SENTENCE = "The team's room for this month is used up. New questions wait until one of the owners raises it, or the month starts again.";
const EXPIRY = "2099-01-01T00:00:00.000Z";
const funded = (room: string, scope: string) => ({ room, scope, resets_at: EXPIRY, waiting_run_ref: null, plan_id: null, funding: { kind: "INTERNAL", expires_at: EXPIRY } }) as never;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe("the team's month on the ask page", () => {
  it("prints the sentence with no time and no upgrade", async () => {
    await act(async () => root.render(<RoomNotice room={funded("FULL", "TEAM_MONTH")} catalog={english} locale="en"/>));
    expect(host.querySelector(".roomNoticeText")?.textContent).toBe(SENTENCE);
    expect(host.querySelector("time")).toBeNull();
    expect(host.querySelector("a")).toBeNull();
    expect(roomSentence(funded("FULL", "TEAM_MONTH"))).toEqual({ key: KEY, at: null, upgrade: false, waitingRunRef: null });
  });
  it("leaves the funded person's own grant and window sentences as they were", () => {
    expect(roomSentence(funded("FULL", "PERSON_GRANT"))?.key).toBe("newDebate.room.internalGrantFull");
    expect(roomSentence(funded("FULL", "PERSON_DAY"))?.key).toBe("newDebate.room.internalWindowFull");
  });
  it("reaches the home composer's cut-down catalogue", () => {
    expect(composerRoomCatalog({}, english)[KEY]).toBe(SENTENCE);
  });
  it("is translated in every locale, one line beside the grant sentence", () => {
    const root = resolve(process.cwd(), "apps/ui/messages");
    const locales = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
    expect(locales.length).toBeGreaterThan(30);
    const seen = new Set<string>();
    for (const locale of locales) {
      const source = readFileSync(resolve(root, locale, "billing.json"), "utf8");
      const catalog = JSON.parse(source) as Record<string, string>;
      const keys = Object.keys(catalog);
      expect(keys.indexOf(KEY), locale).toBe(keys.indexOf("newDebate.room.internalGrantFull") + 1);
      const value = catalog[KEY]!;
      expect(value.length, locale).toBeGreaterThan(20);
      expect(value, locale).not.toMatch(/[{}]/u);
      if (locale !== "en") expect(value, locale).not.toBe(SENTENCE);
      expect(seen.has(value), locale).toBe(false);
      seen.add(value);
    }
  });
});

describe("a funded member's own room", () => {
  const usage = { plan_id: null, funding: { kind: "INTERNAL", expires_at: EXPIRY }, windows: [
    { scope: "PERSON_DAY", percent: 10, resets_at: EXPIRY }, { scope: "PERSON_WEEK", percent: 20, resets_at: EXPIRY }, { scope: "PERSON_GRANT", percent: 30, resets_at: EXPIRY }
  ] };
  const meters = () => [...host.querySelectorAll('[role="meter"]')].map(meter => meter.getAttribute("aria-valuenow"));
  it("is percent bars, with no price anywhere", async () => {
    await act(async () => root.render(<UsageBars catalog={english} locale="en" client={{ getBillingUsage: async () => usage } as never}/>));
    expect(meters()).toEqual(["10", "20", "30"]);
    expect(host.textContent).toContain("30%");
    expect(host.textContent).not.toMatch(/[$€£]|USD|EUR|dollar|micro/iu);
  });
  it("ignores a window for the team's month: the team's figures are never a member's", async () => {
    const withTeam = { ...usage, windows: [...usage.windows, { scope: "TEAM_MONTH", percent: 99, resets_at: EXPIRY }] };
    await act(async () => root.render(<UsageBars catalog={english} locale="en" client={{ getBillingUsage: async () => withTeam } as never}/>));
    expect(meters()).toEqual(["10", "20", "30"]);
    expect(host.textContent).not.toContain("99");
  });
});
