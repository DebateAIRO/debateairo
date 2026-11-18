// @vitest-environment jsdom
// Keyboard audit round 4 (12 Nov 2026), fixer E.
// E5: the language panel (48px head, 54px search, a 320px list) had no height limit. In a short window (667 x 375,
//     320 x 256) it ran past the window's foot, and the arrow keys' ringed row left the window before the list
//     scrolled. The panel is now never taller than the window less 12px each side, its list shrinks and scrolls, and
//     its placement keeps it wholly inside the window.
// E8: the list is drawn in two columns, but only Up/Down moved, one place at a time in reading order (Down went to the
//     row beside), and Left/Right did nothing; Home/End were always taken from the search box. Now, with two columns,
//     Down/Up move by a drawn row and Left/Right by one (mirrored in right-to-left); with one column (a phone) Up/Down
//     move by one. Home/End and Left/Right belong to the search box while it has text, to the list while it is empty.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "../../apps/ui/components/LanguageSwitcher.js";
import { handleLanguageSwitcherKey } from "../../apps/ui/components/languageSwitcherState.js";
import { filterLocales, OFFERED_LOCALE_PREFERENCES } from "../../apps/ui/lib/i18n/locales.js";
import { rulesFor, stylesheet } from "./kbd-r4-e-css.js";

let root: Root;
let phone = false;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  phone = false;
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: phone && query.includes("560px"), media: query, addEventListener() {}, removeEventListener() {} }));
  document.body.innerHTML = '<div id="root"></div>';
  document.documentElement.removeAttribute("dir");
  root = createRoot(document.getElementById("root")!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  document.documentElement.removeAttribute("dir");
  vi.unstubAllGlobals();
});

const search = () => document.querySelector<HTMLInputElement>('[role="combobox"]')!;
const panel = () => document.querySelector<HTMLElement>(".languageSwitcherPanel")!;
// The panel lists only the offered languages (English US, English UK, Romanian): two drawn rows in two columns.
const all = filterLocales("", OFFERED_LOCALE_PREFERENCES).map(({ code }) => code);
const active = () => search().getAttribute("aria-activedescendant")!.split("-list-").at(-1);
async function open(): Promise<void> {
  await act(async () => root.render(<LanguageSwitcher />));
  const trigger = document.querySelector<HTMLButtonElement>(".languageSwitcherButton")!;
  await act(async () => { trigger.focus(); trigger.click(); });
}
async function key(name: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init });
  await act(async () => { search().dispatchEvent(event); });
  return event;
}
async function type(value: string, caret: number): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(search(), value); search().dispatchEvent(new Event("input", { bubbles: true })); });
  search().setSelectionRange(caret, caret);
}

describe("E5: the language panel in a short window", () => {
  it("is a column whose list shrinks and scrolls, never taller than the window", () => {
    const css = stylesheet("language-switcher.css");
    const box = rulesFor(css, ".languageSwitcherPanel")[0]!.body;
    expect(box).toMatch(/display:\s*flex/);
    expect(box).toMatch(/flex-direction:\s*column/);
    expect(box).toMatch(/max-height:\s*calc\(100dvh - 24px\)/);
    expect(rulesFor(css, ".languageSwitcherList")[0]!.body).toMatch(/min-height:\s*0/);
    expect(rulesFor(css, ".languageSwitcherHead")[0]!.body).toMatch(/flex:\s*none/);
    expect(rulesFor(css, ".languageSwitcherSearch")[0]!.body).toMatch(/flex:\s*none/);
  });

  it("its placement keeps it wholly inside a 320 x 256 window", async () => {
    vi.stubGlobal("innerHeight", 256);
    vi.stubGlobal("innerWidth", 320);
    await open();
    const top = Number.parseFloat(panel().style.top);
    const max = Number.parseFloat(panel().style.maxHeight);
    expect(max).toBe(232);
    expect(top).toBeGreaterThanOrEqual(12);
    expect(top + max).toBeLessThanOrEqual(256 - 12);
  });
});

describe("E8: the arrow keys follow the two columns", () => {
  it("the key rule: Down/Up by a row and Left/Right by one with two columns, mirrored in right-to-left", () => {
    expect(handleLanguageSwitcherKey("ArrowDown", 0, 35, 2).highlightedIndex).toBe(2);
    expect(handleLanguageSwitcherKey("ArrowUp", 3, 35, 2).highlightedIndex).toBe(1);
    expect(handleLanguageSwitcherKey("ArrowRight", 0, 35, 2).highlightedIndex).toBe(1);
    expect(handleLanguageSwitcherKey("ArrowLeft", 1, 35, 2).highlightedIndex).toBe(0);
    expect(handleLanguageSwitcherKey("ArrowRight", 1, 35, 2, true).highlightedIndex).toBe(0);
    // Down past the last row goes to the top of the same column; Up past the first, to the foot of the same column.
    expect(handleLanguageSwitcherKey("ArrowDown", 33, 35, 2).highlightedIndex).toBe(1);
    expect(handleLanguageSwitcherKey("ArrowUp", 1, 35, 2).highlightedIndex).toBe(33);
    expect(handleLanguageSwitcherKey("ArrowUp", 0, 35, 2).highlightedIndex).toBe(34);
    // One column: as before.
    expect(handleLanguageSwitcherKey("ArrowDown", 0, 35).highlightedIndex).toBe(1);
  });

  it("in the panel, ArrowDown goes to the row below and ArrowRight to the one beside", async () => {
    await open();
    const start = all.indexOf(active() as (typeof all)[number]);
    await key("ArrowDown");
    expect(active()).toBe(all[(start + 2) % all.length]);
    await key("ArrowRight");
    expect(active()).toBe(all[(start + 3) % all.length]);
  });

  it("right-to-left: ArrowLeft goes to the next language", async () => {
    document.documentElement.setAttribute("dir", "rtl");
    await open();
    await key("Home");
    expect(active()).toBe(all[0]);
    await key("ArrowLeft");
    expect(active()).toBe(all[1]);
  });

  it("one column (a phone): ArrowDown goes to the next language, and Left/Right stay with the search box", async () => {
    phone = true;
    await open();
    await key("Home");
    await key("ArrowDown");
    expect(active()).toBe(all[1]);
    const event = await key("ArrowRight");
    expect(event.defaultPrevented).toBe(false);
    expect(active()).toBe(all[1]);
  });

  it("with text in the search box, Home, End, Left and Right are always the text's; with it empty, the list's", async () => {
    await open();
    // "n" is in all three offered rows (English, Română), so the filtered list still has more than two.
    await type("n", 1);
    const matches = filterLocales("n", OFFERED_LOCALE_PREFERENCES).map(({ code }) => code);
    expect(matches.length).toBeGreaterThan(2);
    const ringed = active();
    // Round 4 review: with the caret at the end, Right went to the list and Left to the caret, so the ring could move
    // right but never back. Now all four stay with the text while it has any, wherever the caret is.
    for (const name of ["Home", "End", "ArrowLeft", "ArrowRight"]) {
      search().setSelectionRange(1, 1);
      expect((await key(name)).defaultPrevented, `${name} with the caret at the end`).toBe(false);
      search().setSelectionRange(0, 0);
      expect((await key(name)).defaultPrevented, `${name} with the caret at the start`).toBe(false);
    }
    expect(active(), "the ring did not move").toBe(ringed);
    // Down and Up still move through the filtered list.
    expect((await key("ArrowDown")).defaultPrevented).toBe(true);
    // An empty search box: Home/End go to the list, as before.
    await type("", 0);
    expect((await key("End")).defaultPrevented).toBe(true);
    expect(active()).toBe(all.at(-1));
    expect((await key("Home", { shiftKey: true })).defaultPrevented, "with a modifier it is the text box's").toBe(false);
  });
});
