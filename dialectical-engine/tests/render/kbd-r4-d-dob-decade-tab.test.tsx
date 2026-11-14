// @vitest-environment jsdom
// Keyboard audit round 4 (2026-11-12), D3: in the year grid the "Previous decade" / "Next decade" buttons come before the
// grid, focus starts in the grid, and any Tab from a cell closed the popover, so Shift+Tab could never reach them. Now:
// Shift+Tab from a year cell goes to the decade buttons and the popover stays open; Tab from the last decade button goes
// back into the grid; only Tab out of the last stop (a cell) or Shift+Tab out of the first (the first live decade button)
// closes it. jsdom does no Tab navigation itself, so a key the field leaves to the browser is followed by moving focus
// to the next stop in page order, as the browser would.
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DobParts } from "@debateai/kernel";
import { DateOfBirthField, EMPTY_DOB } from "../../apps/ui/components/DateOfBirthField.js";
import { resolveDobLocale } from "../../apps/ui/lib/dob/dobLocale.js";
import english from "../../apps/ui/messages/en/auth.json";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(Date.UTC(2026, 8, 28)) });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function Harness({ year = "" }: { year?: string }) {
  const [value, setValue] = useState<DobParts>({ ...EMPTY_DOB, y: year });
  return <DateOfBirthField catalog={english} locale={resolveDobLocale("en")} value={value} error={null} onChange={setValue} />;
}
const input = (part: "d" | "m" | "y") => host.querySelector<HTMLInputElement>(`input[name="dob-${part}"]`)!;
const toggle = (part: "d" | "m" | "y") => input(part).parentElement!.querySelector<HTMLButtonElement>("button.dobPickerToggle")!;
const popover = () => host.querySelector<HTMLElement>(".dobPopover");
const previous = () => host.querySelector<HTMLButtonElement>('button[aria-label="Previous decade"]')!;
const next = () => host.querySelector<HTMLButtonElement>('button[aria-label="Next decade"]')!;
const activeCell = () => host.querySelector<HTMLElement>('.dobCell[tabindex="0"]')!;
/** Everything Tab can stop on in page order (enough for this field: inputs, buttons, tabindex 0). */
const stops = () => [...document.querySelectorAll<HTMLElement>("input, button, [tabindex]")]
  .filter((el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0);

/** Tab or Shift+Tab: the key goes down on the focused element; unless prevented, focus moves as the browser moves it. */
async function tab(shift = false): Promise<boolean> {
  const from = document.activeElement as HTMLElement;
  const list = stops();
  const at = list.indexOf(from);
  let prevented = false;
  await act(async () => {
    prevented = !from.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true }));
  });
  if (!prevented) {
    // The browser carries on from where the control was, even if it has gone with the popover.
    const target = list[at + (shift ? -1 : 1)];
    const live = target && target.isConnected ? target : stops()[shift ? 0 : stops().length - 1];
    await act(async () => live?.focus());
  }
  return prevented;
}
async function openYears(): Promise<void> {
  toggle("y").focus();
  await act(async () => toggle("y").click());
  expect(popover()).not.toBeNull();
  expect(document.activeElement).toBe(activeCell());
}

describe("the year grid's decade buttons can be reached with Shift+Tab", () => {
  it("Shift+Tab from a year cell moves to the decade buttons and keeps the popover open", async () => {
    await act(async () => root.render(<Harness year="1984" />));
    await openYears();
    expect(await tab(true)).toBe(true);
    expect(popover()).not.toBeNull();
    expect(document.activeElement).toBe(next());
    await tab(true);
    expect(popover()).not.toBeNull();
    expect(document.activeElement).toBe(previous());
  });

  it("Tab from the last decade button goes back into the grid, onto its one stop", async () => {
    await act(async () => root.render(<Harness year="1984" />));
    await openYears();
    const cell = activeCell();
    await tab(true);
    expect(document.activeElement).toBe(next());
    await tab();
    expect(popover()).not.toBeNull();
    expect(document.activeElement).toBe(cell);
  });

  it("a decade button turned with the keyboard still works after Shift+Tab, and the grid follows", async () => {
    await act(async () => root.render(<Harness year="1984" />));
    await openYears();
    await tab(true);
    await tab(true);
    await act(async () => previous().click());
    expect(host.querySelector(".dobDecadeLabel")?.textContent).toBe("1970–1979");
    expect(document.activeElement).toBe(previous());
  });

  it("Shift+Tab out of the first decade button closes the popover and lands on the toggle", async () => {
    await act(async () => root.render(<Harness year="1984" />));
    await openYears();
    await tab(true);
    await tab(true);
    expect(document.activeElement).toBe(previous());
    expect(await tab(true)).toBe(false);
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(toggle("y"));
  });

  it("in this decade (Next is off) Shift+Tab from a cell reaches Previous, and Shift+Tab from there closes", async () => {
    await act(async () => root.render(<Harness year="2021" />));
    await openYears();
    expect(next().disabled).toBe(true);
    await tab(true);
    expect(document.activeElement).toBe(previous());
    expect(popover()).not.toBeNull();
    await tab(true);
    expect(popover()).toBeNull();
  });

  it("Tab (forward) from a year cell still closes the popover: the grid is the last stop", async () => {
    await act(async () => root.render(<Harness year="1984" />));
    await openYears();
    expect(await tab()).toBe(false);
    expect(popover()).toBeNull();
  });

  it("the day grid, with no other stop, still closes on Shift+Tab as before", async () => {
    await act(async () => root.render(<Harness />));
    toggle("d").focus();
    await act(async () => toggle("d").click());
    expect(popover()).not.toBeNull();
    expect(await tab(true)).toBe(false);
    expect(popover()).toBeNull();
  });

  it("adds no text", async () => {
    await act(async () => root.render(<Harness year="1984" />));
    await openYears();
    expect(popover()!.textContent).toBe(`‹1980–1989›${Array.from({ length: 10 }, (_, i) => 1980 + i).join("")}`);
  });
});
