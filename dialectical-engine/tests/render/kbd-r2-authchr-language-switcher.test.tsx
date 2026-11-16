// @vitest-environment jsdom
// Keyboard audit 2026-11-12 (CHR1-3): the arrow-key highlight in the language list was a faint tint and was never
// scrolled into the 320px list, so ArrowDown could move it out of sight. The highlighted row is now scrolled into
// view each time it moves, and it carries the focus ring.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "../../apps/ui/components/LanguageSwitcher.js";

let root: Root;
const scrolled: Array<{ id: string; options: unknown }> = [];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  scrolled.length = 0;
  // jsdom has no scrollIntoView: record the calls.
  (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView = function (this: HTMLElement, options: unknown) { scrolled.push({ id: this.id, options }); };
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  vi.unstubAllGlobals();
});
const search = () => document.querySelector<HTMLInputElement>('[role="combobox"]')!;
async function key(name: string) {
  await act(async () => { search().dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })); });
}

it("scrolls the highlighted row into view each time the arrows move it", async () => {
  await act(async () => root.render(<LanguageSwitcher />));
  const trigger = document.querySelector<HTMLButtonElement>(".languageSwitcherButton")!;
  await act(async () => { trigger.focus(); trigger.click(); });
  for (const name of ["ArrowDown", "ArrowDown", "End"]) {
    await key(name);
    const active = search().getAttribute("aria-activedescendant")!;
    expect(document.getElementById(active)!.getAttribute("data-highlighted")).toBe("true");
    expect(scrolled.at(-1)).toEqual({ id: active, options: { block: "nearest" } });
  }
});

it("still opens and moves where scrollIntoView does not exist", async () => {
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  await act(async () => root.render(<LanguageSwitcher />));
  const trigger = document.querySelector<HTMLButtonElement>(".languageSwitcherButton")!;
  await act(async () => { trigger.focus(); trigger.click(); });
  await key("ArrowDown");
  expect(search().getAttribute("aria-activedescendant")).not.toBeNull();
});

it("rings the highlighted row with the focus colour, inset so the list's edge does not clip it, only for a person using keys", () => {
  const css = readFileSync(resolve(process.cwd(), "apps/ui/app/language-switcher.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = /(?:^|\})\s*\.languageSwitcherPanel\[data-keys="true"\] \.languageSwitcherRow\[data-highlighted="true"\]\s*\{([^}]*)\}/m.exec(css);
  expect(rule).not.toBeNull();
  expect(rule![1]).toContain("outline: 2px solid var(--focus)");
  expect(rule![1]).toContain("outline-offset: -2px");
  // No rule rings the highlighted row without that mark.
  const bare = [...css.matchAll(/(?:^|[},])\s*\.languageSwitcherRow\[data-highlighted="true"\]\s*\{([^}]*)\}/gm)].map((match) => match[1]!).join(";");
  expect(bare).not.toContain("outline");
});

const panel = () => document.querySelector<HTMLElement>(".languageSwitcherPanel")!;

it("opened with a pointer: the list is not scrolled and no row is marked for the ring, until a key is used in it", async () => {
  await act(async () => root.render(<LanguageSwitcher />));
  const trigger = document.querySelector<HTMLButtonElement>(".languageSwitcherButton")!;
  await act(async () => { trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })); });
  expect(panel().hasAttribute("data-keys")).toBe(false);
  expect(scrolled).toEqual([]);
  await key("ArrowDown");
  expect(panel().getAttribute("data-keys")).toBe("true");
  expect(scrolled.at(-1)!.id).toBe(search().getAttribute("aria-activedescendant"));
  // The pointer again: the mark goes.
  await act(async () => { panel().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
  expect(panel().hasAttribute("data-keys")).toBe(false);
});

it("opened from the keyboard: the row Enter would choose is marked and in view at once", async () => {
  await act(async () => root.render(<LanguageSwitcher />));
  const trigger = document.querySelector<HTMLButtonElement>(".languageSwitcherButton")!;
  await act(async () => { trigger.focus(); trigger.click(); });
  expect(panel().getAttribute("data-keys")).toBe("true");
  expect(scrolled.at(-1)!.id).toBe(search().getAttribute("aria-activedescendant"));
});
