// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { UsageBars } from "../../apps/ui/components/billing/UsageBars.js";
import { formatReset } from "../../apps/ui/lib/billing/formatReset.js";

/**
 * Paid-plans spec §1.2, §2.9 (U1), §2.10: three bars, "Today 40% · This week
 * 22% · This month 15%", each with "Resets {time}" under it. There is never a
 * dollar amount. Free has its month only. Billing off answers 404, and then
 * nothing is shown.
 */
const billing = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(process.cwd(), "apps/ui/messages", locale, "billing.json"), "utf8")) as Record<string, string>;
const RESET = new Date(Date.now() + 30 * 86_400_000).toISOString();
const resets = formatReset(new Date(RESET), new Date(), "en");

let root: Root | null = null;
async function mount(client: unknown, locale = "en", onPlan?: (planId: string) => void): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(
    <UsageBars catalog={billing(locale)} locale={locale} client={client as never} {...(onPlan === undefined ? {} : { onPlan })} />
  ));
  await act(async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  });
  return container;
}

beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("UsageBars", () => {
  it("shows the day, week and month with their resets and no money", async () => {
    const container = await mount({ getBillingUsage: async () => ({
      plan_id: "PLUS",
      windows: [
        { scope: "PERSON_DAY", percent: 40, resets_at: RESET },
        { scope: "PERSON_WEEK", percent: 22, resets_at: RESET },
        { scope: "PERSON_MONTH", percent: 15, resets_at: RESET }
      ]
    }) });
    expect(container.querySelector(".usageLine")?.textContent).toBe("Today 40% · This week 22% · This month 15%");
    const meters = [...container.querySelectorAll('[role="meter"]')];
    expect(meters.map((meter) => [meter.getAttribute("aria-label"), meter.getAttribute("aria-valuenow")]))
      .toEqual([["Today", "40"], ["This week", "22"], ["This month", "15"]]);
    expect([...container.querySelectorAll(".usageReset")].map((line) => line.textContent))
      .toEqual([`Resets ${resets}`, `Resets ${resets}`, `Resets ${resets}`]);
    expect(container.textContent).not.toMatch(/\$|USD/u);
  });

  it("shows Free's month alone", async () => {
    const container = await mount({ getBillingUsage: async () => ({
      plan_id: "FREE", windows: [{ scope: "PERSON_MONTH", percent: 55, resets_at: RESET }]
    }) });
    expect(container.querySelector(".usageLine")?.textContent).toBe("This month 55%");
    expect(container.querySelectorAll('[role="meter"]')).toHaveLength(1);
  });

  it("shows a debate's finish leeway as 110%, with the bar full, not overflowing", async () => {
    const container = await mount({ getBillingUsage: async () => ({
      plan_id: "FREE", windows: [{ scope: "PERSON_MONTH", percent: 110, resets_at: RESET }]
    }) });
    expect(container.querySelector('[role="meter"]')?.getAttribute("aria-valuenow")).toBe("110");
    expect((container.querySelector(".usageFill") as HTMLElement).style.width).toBe("100%");
  });

  it("shows nothing when billing is off (404) or the read fails", async () => {
    for (const client of [
      { getBillingUsage: async () => { throw new ContractHttpError("NOT_FOUND", 404, "NOT_FOUND"); } },
      {}
    ]) {
      const container = await mount(client);
      expect(container.querySelector(".usageBars")).toBeNull();
      await act(async () => root!.unmount());
      root = null;
      document.body.replaceChildren();
    }
  });

  it("speaks the interface's language", async () => {
    const container = await mount({ getBillingUsage: async () => ({
      plan_id: "FREE", windows: [{ scope: "PERSON_MONTH", percent: 5, resets_at: RESET }]
    }) }, "ro");
    expect(container.querySelector(".usageLine")?.textContent).toBe(billing("ro")["billing.usage.lineFree"]!.replace("{monthPct}", "5"));
  });

  it("tells its page the plan it read (the second source of /new's decided plan), and nothing when the read fails", async () => {
    const seen: string[] = [];
    await mount({ getBillingUsage: async () => ({
      plan_id: "PRO", windows: [{ scope: "PERSON_MONTH", percent: 5, resets_at: RESET }]
    }) }, "en", (planId) => seen.push(planId));
    expect(seen).toEqual(["PRO"]);
    await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    await mount({ getBillingUsage: async () => { throw new ContractHttpError("NOT_FOUND", 404, "NOT_FOUND"); } },
      "en", (planId) => seen.push(planId));
    expect(seen).toEqual(["PRO"]);
  });
});
