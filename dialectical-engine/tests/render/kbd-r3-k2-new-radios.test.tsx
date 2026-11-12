// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), readSession: vi.fn(), getAskRoom: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => unknown }) => children("test-token")
}));
vi.mock("@/lib/api", () => ({
  createDebate: vi.fn(),
  contractClient: { readSession: mocks.readSession, getAskRoom: mocks.getAskRoom, readSensitiveDataConsent: async () => ({ status: "given" as const }) }
}));

import NewDebatePage from "../../apps/ui/app/new/NewDebatePageClient.js";
import homeCatalog from "../../apps/ui/messages/en/home.json" with { type: "json" };
import chromeCatalog from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import newDebateCatalog from "../../apps/ui/messages/en/newDebate.json" with { type: "json" };

/*
 * Keyboard audit 2026-11-12, wave 3 (CHR1-8 / CSS-9, latent: /new redirects to /v4 today): the old /new page's choice groups
 * (the plan cards and each segmented row) are `role="radio"` buttons, and each option was a Tab stop of its own. Now each
 * group is one Tab stop (the chosen option, else the first), the arrow keys move and choose (both axes; on a right-to-left
 * page the side arrows run the other way), and Home / End go to the first and the last. The page is the real one, with
 * its reads stood in.
 */

let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.readSession.mockReset().mockRejectedValue(new Error("no session in this test"));
  mocks.getAskRoom.mockReset().mockResolvedValue({
    room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null, shape_settings: true
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  document.documentElement.removeAttribute("dir");
  vi.unstubAllGlobals();
});

async function settle(): Promise<void> {
  for (let round = 0; round < 2; round += 1) {
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  }
}

async function renderPage(): Promise<void> {
  await act(async () => root!.render(<NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog} />));
  await settle();
}

const group = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
const radios = (within: HTMLElement): HTMLElement[] => [...within.querySelectorAll<HTMLElement>("[role='radio']")];
const checked = (within: HTMLElement): HTMLElement | undefined => radios(within).find((one) => one.getAttribute("aria-checked") === "true");
const stops = (within: HTMLElement): HTMLElement[] => radios(within).filter((one) => one.tabIndex === 0);

async function press(key: string): Promise<void> {
  await act(async () => {
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await settle();
}

const planGroup = (): HTMLElement => group(".ndTier[role='radiogroup']");
/** A segmented row on a paid plan (Free's rows are switched off). */
const segmentGroup = (): HTMLElement => document.querySelector<HTMLElement>(".ndSeg[role='radiogroup']:has([role='radio']:not([disabled]))")!;

describe("the /new choice groups' keyboard (CHR1-8 / CSS-9)", () => {
  it("the plan cards are one Tab stop: the chosen card", async () => {
    await renderPage();
    const plans = planGroup();
    expect(radios(plans).length).toBeGreaterThan(1);
    expect(stops(plans)).toEqual([checked(plans)]);
    expect(radios(plans).filter((one) => one.tabIndex === -1).length).toBe(radios(plans).length - 1);
  });

  it("ArrowRight / ArrowDown move to the next card and choose it; ArrowLeft / ArrowUp go back; at the end they go round", async () => {
    await renderPage();
    const plans = planGroup();
    const all = radios(plans);
    act(() => checked(plans)!.focus());
    const start = all.indexOf(checked(plans)!);
    await press("ArrowRight");
    const next = (start + 1) % all.length;
    expect(document.activeElement).toBe(radios(plans)[next]);
    expect(checked(plans)).toBe(radios(plans)[next]);
    expect(stops(plans)).toEqual([radios(plans)[next]]);
    await press("ArrowUp");
    expect(checked(plans)).toBe(radios(plans)[start]);
    await press("ArrowDown");
    await press("ArrowLeft");
    expect(document.activeElement).toBe(radios(plans)[start]);
    // Round from the first to the last, as native radios do.
    await press("Home");
    await press("ArrowLeft");
    expect(checked(plans)).toBe(radios(plans).at(-1));
  });

  it("Home and End choose the first and the last", async () => {
    await renderPage();
    const plans = planGroup();
    act(() => checked(plans)!.focus());
    await press("End");
    expect(checked(plans)).toBe(radios(plans).at(-1));
    expect(document.activeElement).toBe(radios(plans).at(-1));
    await press("Home");
    expect(checked(plans)).toBe(radios(plans)[0]);
  });

  it("on a right-to-left page the side arrows run the other way", async () => {
    document.documentElement.setAttribute("dir", "rtl");
    await renderPage();
    const plans = planGroup();
    act(() => radios(plans)[0]!.click());
    await settle();
    act(() => radios(plans)[0]!.focus());
    await press("ArrowLeft");
    expect(checked(plans)).toBe(radios(plans)[1]);
    await press("ArrowRight");
    expect(checked(plans)).toBe(radios(plans)[0]);
  });

  it("a segmented row is one Tab stop too, and its arrows move and choose within it", async () => {
    await renderPage();
    // A paid plan's settings can be changed (Free's are fixed).
    const paid = radios(planGroup()).find((one) => one.getAttribute("data-value") !== "free")!;
    act(() => paid.click());
    await settle();
    const row = segmentGroup();
    expect(row, "an editable segmented row").not.toBeNull();
    const chosen = checked(row) ?? radios(row)[0]!;
    expect(stops(row)).toEqual([chosen]);
    act(() => chosen.focus());
    const at = radios(row).indexOf(chosen);
    await press("ArrowRight");
    const next = radios(row)[(at + 1) % radios(row).length]!;
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute("aria-checked")).toBe("true");
  });

  it("keys other than the arrows, Home and End are left alone (Space and Enter still press, Tab leaves)", async () => {
    await renderPage();
    const plans = planGroup();
    act(() => checked(plans)!.focus());
    const before = checked(plans);
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => { document.activeElement!.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(checked(plans)).toBe(before);
  });
});
