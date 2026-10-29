// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Owner 2026-10-29 (Free plan shape): "the choices after the initial question to be capped to 3". On the Free plan the
 * D2 step offers its choices until three are set; then only the choices already set can change, and the text sent
 * carries three at most. A paid plan keeps every choice. The one new sentence is a v4 catalogue key.
 */
const tier = vi.hoisted(() => ({ value: "free" as "free" | "premium" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: (token: string) => React.ReactNode }) => children("token") }));
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
vi.mock("@/lib/api", () => ({ contractClient: { readAnswerIndex: async () => ({ items: [], open_runs: [] }) } }));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: () => ({ planTier: tier.value, submit: vi.fn(), flagsCrisis: () => false, room: null, submitting: false, dialogs: null })
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  tier.value = "free";
});

/** The page at its D2 step, for a question long enough to go on. */
async function atStepTwo(planTier: "free" | "premium"): Promise<HTMLDivElement> {
  tier.value = planTier;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <V4AskClient catalog={CATALOG} homeCatalog={{}} newDebateCatalog={{}} billingCatalog={{}} locale="en" crisisCountryHint={null}
      initialQuestion="Should Romania build more nuclear plants?" initialLevel="plain" />
  ));
  await act(async () => buttonNamed(CATALOG["v4.ask.continue"]!).click());
  return host;
}

function buttonNamed(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === name);
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

async function press(name: string): Promise<void> {
  await act(async () => buttonNamed(CATALOG[name]!).click());
}

const sentLines = (page: HTMLDivElement): readonly string[] =>
  (page.querySelector(".v4AskSent")?.textContent ?? "").split("\n\n")[1]?.split("\n") ?? [];

describe("V4 step 2 on the Free plan: at most 3 choices", () => {
  it("says so, and after three choices only the ones already set can change", async () => {
    const page = await atStepTwo("free");
    const hint = CATALOG["v4.read.freeChoices"]!.replace("{count}", "3");
    expect(page.textContent).toContain(hint);
    await press("v4.read.place.EU");
    await press("v4.read.horizon.NOW");
    expect(buttonNamed(CATALOG["v4.read.purpose.DECIDE"]!).disabled).toBe(false);
    await press("v4.read.purpose.DECIDE");
    // Three set: every other choice waits; the set ones can still move or be cleared.
    expect(buttonNamed(CATALOG["v4.read.horizon.FIVE_YEARS"]!).disabled).toBe(false);
    expect(buttonNamed(CATALOG["v4.read.place.ROMANIA"]!).disabled).toBe(false);
    expect((page.querySelector(`input[placeholder="${CATALOG["v4.read.matters.placeholder"]}"]`) as HTMLInputElement).disabled).toBe(true);
    expect((page.querySelector(`input[placeholder="${CATALOG["v4.read.angles.placeholder"]}"]`) as HTMLInputElement).disabled).toBe(true);
    expect(sentLines(page)).toHaveLength(3);
    // Clearing one opens the others again.
    await press("v4.read.purpose.DECIDE");
    expect((page.querySelector(`input[placeholder="${CATALOG["v4.read.matters.placeholder"]}"]`) as HTMLInputElement).disabled).toBe(false);
    expect(sentLines(page)).toHaveLength(2);
  });

  it("a paid plan keeps every choice and shows no Free sentence", async () => {
    const page = await atStepTwo("premium");
    expect(page.textContent).not.toContain(CATALOG["v4.read.freeChoices"]!.replace("{count}", "3"));
    await press("v4.read.place.EU");
    await press("v4.read.horizon.NOW");
    await press("v4.read.purpose.DECIDE");
    expect((page.querySelector(`input[placeholder="${CATALOG["v4.read.matters.placeholder"]}"]`) as HTMLInputElement).disabled).toBe(false);
    expect((page.querySelector(`input[placeholder="${CATALOG["v4.read.angles.placeholder"]}"]`) as HTMLInputElement).disabled).toBe(false);
  });
});
