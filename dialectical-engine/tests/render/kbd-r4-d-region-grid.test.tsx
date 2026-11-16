// @vitest-environment jsdom
vi.mock("@/components/auth/TurnstileChallenge", async () => { const { useEffect } = await import("react"); return { TurnstileChallenge: ({ onToken }: { onToken: (token: string) => void }) => { useEffect(() => onToken("test-proof"), [onToken]); return null; } }; });
// Keyboard audit round 4 (2026-11-12), D4: in the region picker (sign-up, social sign-up, /pricing) every country was
// its own Tab stop (35 in Europe: 27 presses to reach Romania) and the visible grid had no arrow keys. Now the grid is
// one Tab stop (roving tabindex on `.regionCountry`): Left/Right move by one (mirrored on a right-to-left page), Up/Down
// by a row of the grid as laid out (two columns; one in a narrow container), Home/End to the first and last; a letter
// jumps to the next country whose name starts with it. The stop is the chosen country when there is one, else the
// first. Escape, Back and Tab out are unchanged. Sign-up is tested on the hosted site by the owner, so this file is the
// proof here: it drives RegionField alone, inside a right-to-left page, and inside SignUpFlow.
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { regionCountriesOf, regionCountryName } from "@debateai/kernel";
import { RegionField, EMPTY_REGION_PICK, type RegionPick } from "../../apps/ui/components/RegionField.js";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import english from "../../apps/ui/messages/en/auth.json";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); document.documentElement.removeAttribute("dir"); vi.unstubAllGlobals(); });

const europe = regionCountriesOf("Europe", "en").map(({ code }) => code);
const cells = () => [...host.querySelectorAll<HTMLButtonElement>(".regionCountry")];
const cell = (code: string) => host.querySelector<HTMLButtonElement>(`.regionCountry[data-code="${code}"]`)!;
const stops = () => cells().filter((button) => button.tabIndex === 0);
const focusedCode = () => (document.activeElement as HTMLElement | null)?.dataset.code;
const popover = () => host.querySelector(".regionPopover");

function Controlled({ initial = EMPTY_REGION_PICK, onPick }: { initial?: RegionPick; onPick?: (next: RegionPick) => void }) {
  const [value, setValue] = useState<RegionPick>(initial);
  return <RegionField catalog={english} locale="en" value={value} onChange={(next) => { setValue(next); onPick?.(next); }} disabled={false} />;
}
async function press(target: Element, key: string, init: KeyboardEventInit = {}): Promise<boolean> {
  let prevented = false;
  await act(async () => { prevented = !target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })); });
  return prevented;
}
async function arrow(key: string): Promise<void> { await press(document.activeElement!, key); }
async function openEurope(): Promise<void> {
  const trigger = host.querySelector<HTMLButtonElement>(".regionTrigger")!;
  trigger.focus();
  await act(async () => trigger.click());
  if (host.querySelector(".regionBack") === null) {
    await act(async () => host.querySelector<HTMLButtonElement>('.regionContinent[data-continent="Europe"]')!.click());
  }
  expect(cells().length).toBe(europe.length);
}

describe("the country grid is one Tab stop", () => {
  it("with nothing chosen, the stop is the first country and every other country is out of the Tab order", async () => {
    await act(async () => root.render(<Controlled />));
    await openEurope();
    expect(stops().map((button) => button.dataset.code)).toEqual([europe[0]]);
    expect(cells().slice(1).every((button) => button.tabIndex === -1)).toBe(true);
    // Back, then the grid: two stops in the open popover, where there were 36.
    const inPopover = [...popover()!.querySelectorAll<HTMLElement>("button")].filter((button) => button.tabIndex >= 0);
    expect(inPopover).toEqual([host.querySelector(".regionBack"), cell(europe[0]!)]);
  });

  it("with a country chosen, the stop is that country", async () => {
    await act(async () => root.render(<Controlled initial={{ country: "RO", usState: "" }} />));
    await openEurope();
    expect(stops().map((button) => button.dataset.code)).toEqual(["RO"]);
  });

  it("the stop follows the arrows, so Tab back into the grid lands where the person left it", async () => {
    await act(async () => root.render(<Controlled />));
    await openEurope();
    cell(europe[0]!).focus();
    await arrow("ArrowRight");
    await arrow("ArrowRight");
    expect(stops().map((button) => button.dataset.code)).toEqual([europe[2]]);
  });
});

describe("what a screen reader is told (round 4 review)", () => {
  it("the grid is a list named by the continent shown, each country an option that says whether it is the chosen one", async () => {
    await act(async () => root.render(<Controlled initial={{ country: "RO", usState: "" }} />));
    await openEurope();
    const grid = host.querySelector<HTMLElement>(".regionGrid")!;
    expect(grid.getAttribute("role")).toBe("listbox");
    const title = document.getElementById(grid.getAttribute("aria-labelledby") ?? "");
    expect(title?.classList.contains("regionContinentTitle")).toBe(true);
    expect(title?.textContent).toBe(host.querySelector(".regionContinentTitle")!.textContent);
    expect(cells().every((button) => button.getAttribute("role") === "option")).toBe(true);
    expect(cells().filter((button) => button.getAttribute("aria-selected") === "true").map((button) => button.dataset.code)).toEqual(["RO"]);
    expect(cells().filter((button) => button.getAttribute("aria-selected") === "false")).toHaveLength(europe.length - 1);
  });
});

describe("arrow keys, Home and End in the grid (two columns, as the CSS lays it out)", () => {
  it("Left/Right move by one, Up/Down by a row of two, and stop at the edges", async () => {
    await act(async () => root.render(<Controlled />));
    await openEurope();
    cell(europe[0]!).focus();
    await arrow("ArrowRight");
    expect(focusedCode()).toBe(europe[1]);
    await arrow("ArrowDown");
    expect(focusedCode()).toBe(europe[3]);
    await arrow("ArrowLeft");
    expect(focusedCode()).toBe(europe[2]);
    await arrow("ArrowUp");
    expect(focusedCode()).toBe(europe[0]);
    await arrow("ArrowUp");
    await arrow("ArrowLeft");
    expect(focusedCode()).toBe(europe[0]);
  });

  it("Home and End go to the first and last country", async () => {
    await act(async () => root.render(<Controlled />));
    await openEurope();
    cell(europe[4]!).focus();
    await arrow("End");
    expect(focusedCode()).toBe(europe.at(-1));
    await arrow("ArrowDown");
    await arrow("ArrowRight");
    expect(focusedCode()).toBe(europe.at(-1));
    await arrow("Home");
    expect(focusedCode()).toBe(europe[0]);
  });

  it("the arrow keys do not scroll the page (their default is prevented)", async () => {
    await act(async () => root.render(<Controlled />));
    await openEurope();
    cell(europe[0]!).focus();
    for (const key of ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"]) {
      expect(await press(document.activeElement!, key), key).toBe(true);
    }
  });

  it("in a narrow container the grid has one column, and Up/Down move by one", async () => {
    await act(async () => root.render(<Controlled />));
    await openEurope();
    host.querySelector<HTMLElement>(".regionGrid")!.style.gridTemplateColumns = "260px";
    cell(europe[0]!).focus();
    await arrow("ArrowDown");
    expect(focusedCode()).toBe(europe[1]);
    host.querySelector<HTMLElement>(".regionGrid")!.style.gridTemplateColumns = "130px 130px";
    await arrow("ArrowDown");
    expect(focusedCode()).toBe(europe[3]);
  });

  it("on a right-to-left page Left and Right are mirrored", async () => {
    document.documentElement.setAttribute("dir", "rtl");
    await act(async () => root.render(<Controlled />));
    await openEurope();
    cell(europe[2]!).focus();
    await arrow("ArrowLeft");
    expect(focusedCode()).toBe(europe[3]);
    await arrow("ArrowRight");
    expect(focusedCode()).toBe(europe[2]);
    await arrow("ArrowDown");
    expect(focusedCode()).toBe(europe[4]);
  });
});

describe("typing a letter", () => {
  it("jumps to the next country whose name starts with it, and again to the one after", async () => {
    await act(async () => root.render(<Controlled />));
    await openEurope();
    cell(europe[0]!).focus();
    const starting = (letter: string) => europe.filter((code) => regionCountryName(code, "en").toLowerCase().startsWith(letter));
    const s = starting("s");
    expect(s.length).toBeGreaterThan(1);
    expect(await press(document.activeElement!, "s")).toBe(true);
    expect(focusedCode()).toBe(s[0]);
    await press(document.activeElement!, "S");
    expect(focusedCode()).toBe(s[1]);
    await arrow("r");
    expect(focusedCode()).toBe("RO");
  });

  it("a letter no country starts with, Space, or a key with Control does nothing", async () => {
    await act(async () => root.render(<Controlled />));
    await openEurope();
    cell(europe[0]!).focus();
    expect(await press(document.activeElement!, "q")).toBe(false);
    expect(focusedCode()).toBe(europe[0]);
    expect(await press(document.activeElement!, " ")).toBe(false);
    expect(await press(document.activeElement!, "r", { ctrlKey: true })).toBe(false);
    expect(focusedCode()).toBe(europe[0]);
  });
});

describe("what stays as it was", () => {
  it("Enter on a country still picks it (a native button), and focus goes back to the trigger", async () => {
    const onPick = vi.fn();
    await act(async () => root.render(<Controlled onPick={onPick} />));
    await openEurope();
    cell(europe[0]!).focus();
    await arrow("r");
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    await act(async () => { await Promise.resolve(); });
    expect(onPick).toHaveBeenCalledWith({ country: "RO", usState: "" });
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(host.querySelector(".regionTrigger"));
  });

  it("Escape from the grid closes it and puts focus on the trigger", async () => {
    await act(async () => root.render(<Controlled />));
    await openEurope();
    cell(europe[0]!).focus();
    await arrow("ArrowRight");
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(host.querySelector(".regionTrigger"));
  });

  it("Tab from the grid's stop leaves the popover and closes it; Shift+Tab from it goes back to Back and keeps it open", async () => {
    await act(async () => root.render(<Controlled />));
    await openEurope();
    cell(europe[0]!).focus();
    await arrow("ArrowDown");
    expect(await press(document.activeElement!, "Tab", { shiftKey: true })).toBe(false);
    expect(popover()).not.toBeNull();
    expect(await press(document.activeElement!, "Tab")).toBe(false);
    expect(popover()).toBeNull();
  });

  it("Back still returns to the continents, with no stop left behind", async () => {
    await act(async () => root.render(<Controlled />));
    await openEurope();
    await act(async () => host.querySelector<HTMLButtonElement>(".regionBack")!.click());
    await act(async () => { await Promise.resolve(); });
    expect(cells()).toEqual([]);
    expect(document.activeElement).toBe(host.querySelector('.regionContinent[data-continent="Europe"]'));
  });

  it("a mouse click on a country focuses nothing new and still picks it", async () => {
    const onPick = vi.fn();
    await act(async () => root.render(<Controlled onPick={onPick} />));
    await openEurope();
    await act(async () => cell("DE").click());
    expect(onPick).toHaveBeenCalledWith({ country: "DE", usState: "" });
  });
});

describe("inside the sign-up form", () => {
  it("the grid is one stop and the arrows work there too", async () => {
    await act(async () => root.render(<SignUpFlow catalog={english} turnstile={{ siteKey: "test-site", nonce: "test-nonce" }} client={{ checkAge: vi.fn(), register: vi.fn() } as never} />));
    await act(async () => host.querySelector<HTMLButtonElement>("#signup-region-trigger")!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.regionContinent[data-continent="Europe"]')!.click());
    expect(stops().length).toBe(1);
    stops()[0]!.focus();
    await arrow("End");
    expect(focusedCode()).toBe(europe.at(-1));
    expect(stops().map((button) => button.dataset.code)).toEqual([europe.at(-1)]);
  });
});
