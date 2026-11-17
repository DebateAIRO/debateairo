// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { V4StartList } from "../../apps/ui/components/v4/V4StartRow.js";
import { pathPlanFromMenu, pathPlanReduce, type PathPlanAction } from "../../apps/ui/lib/v4/pathPlan.js";
import { NUCLEAR_MENU } from "../support/v4-start-menu.js";

/*
 * Keyboard audit round 4 (2026-11-12), A1: Space on a path row or a viewpoint chip opens its ⋯ menu and nothing else.
 * The menu moves focus to its first item as it opens; a browser that clicks the control focused at key-up must not then
 * press that item ("Rewrite" on a row, "Move to path N" on a chip). Two key-up models (as region-field's AUTH-19 case):
 * FOCUSED clicks whatever has focus at key-up; OWN clicks the pressed button itself unless its key-down was cancelled.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const sent: PathPlanAction[] = [];

async function mount(): Promise<HTMLDivElement> {
  sent.length = 0;
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4StartList
      plan={plan}
      catalog={CATALOG}
      locale="en"
      dispatch={(action) => { sent.push(action); return pathPlanReduce(plan, action).refusal; }}
      onRefusal={() => undefined}
      share={null}
      narrow={false}
    />
  ));
  return host;
}

type KeyUp = "FOCUSED" | "OWN";

async function space(target: HTMLElement, keyup: KeyUp): Promise<void> {
  target.focus();
  let allowed = true;
  await act(async () => { allowed = target.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })); });
  await act(async () => { await Promise.resolve(); });
  const up = keyup === "FOCUSED" ? (document.activeElement as HTMLElement) : target;
  await act(async () => { up.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true })); });
  if (keyup === "FOCUSED" || allowed) await act(async () => up.click());
}

async function enter(target: HTMLElement): Promise<void> {
  target.focus();
  let allowed = true;
  await act(async () => { allowed = target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  if (allowed) await act(async () => target.click());
}

describe("A1: Space opens a ⋯ menu and chooses nothing", () => {
  for (const keyup of ["FOCUSED", "OWN"] as const) {
    it(`a path row (${keyup} key-up)`, async () => {
      await mount();
      const row = host!.querySelector<HTMLButtonElement>(".v4StartRowButton")!;
      await space(row, keyup);
      const menu = host!.querySelector('[role="menu"]');
      expect(menu, "the row's menu is open").not.toBeNull();
      expect(host!.querySelector(".v4StartRewrite"), "no editor opened").toBeNull();
      expect(document.activeElement).toBe(menu!.querySelector('[role="menuitem"]'));
      expect(sent).toEqual([]);
    });

    it(`a viewpoint chip (${keyup} key-up)`, async () => {
      await mount();
      const chip = host!.querySelector<HTMLButtonElement>(".v4StartChip")!;
      expect(chip).not.toBeNull();
      await space(chip, keyup);
      const menu = host!.querySelector('[role="menu"]');
      expect(menu, "the chip's menu is open").not.toBeNull();
      expect(document.activeElement).toBe(menu!.querySelector('[role="menuitem"]'));
      expect(sent, "no chip was moved").toEqual([]);
    });
  }

  it("Enter is unchanged: it opens the menu once, on the row and on a chip", async () => {
    await mount();
    await enter(host!.querySelector<HTMLButtonElement>(".v4StartRowButton")!);
    expect(host!.querySelector('[role="menu"]')).not.toBeNull();
    expect(host!.querySelector(".v4StartRewrite")).toBeNull();
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    expect(host!.querySelector('[role="menu"]')).toBeNull();
    await enter(host!.querySelector<HTMLButtonElement>(".v4StartChip")!);
    expect(host!.querySelector('[role="menu"]')).not.toBeNull();
    expect(sent).toEqual([]);
  });
});
