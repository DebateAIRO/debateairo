// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { V4StartList } from "../../apps/ui/components/v4/V4StartRow.js";
import { pathPlanFromMenu, pathPlanReduce } from "../../apps/ui/lib/v4/pathPlan.js";
import { NUCLEAR_MENU } from "../support/v4-start-menu.js";

/*
 * Keyboard audit round 2, wave 3 (2026-11-12), V4A-18: on the ask page's path list a row's viewpoint chips (and each chip's
 * ⋯) are reached with ArrowRight from the row, which is the spec's key model and stays. What was missing is a word saying
 * so: a row that has chips is described by a short line (a screen reader hears it with the row), and the line shows while
 * that row, or one of its chips, has the keyboard's ring (v4-ask.css). A row with one viewpoint draws no chips and no line.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const CSS = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(): Promise<HTMLDivElement> {
  const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4StartList
      plan={plan}
      catalog={CATALOG}
      locale="en"
      dispatch={(action) => pathPlanReduce(plan, action).refusal}
      onRefusal={() => undefined}
      share={null}
      narrow={false}
    />
  ));
  return host;
}

describe("V4A-18: a row with viewpoint chips says how to reach them", () => {
  it("the line is in the English catalogue", () => {
    expect(CATALOG["v4.start.chip.keysHint"]).toContain("Right arrow");
    expect(CATALOG["v4.start.chip.keysHint"]).toContain("Enter");
  });

  it("each row with chips is described by its line; a row without chips has neither", async () => {
    await mount();
    const rows = [...host!.querySelectorAll<HTMLElement>(".v4StartRow")];
    const withChips = rows.filter((row) => row.querySelector(".v4StartChip") !== null);
    const without = rows.filter((row) => row.querySelector(".v4StartChip") === null);
    expect(withChips.length).toBeGreaterThan(0);
    expect(without.length).toBeGreaterThan(0);
    for (const row of withChips) {
      const button = row.querySelector<HTMLButtonElement>(".v4StartRowButton")!;
      const hint = row.querySelector<HTMLElement>(".v4StartChipsHint")!;
      expect(hint).not.toBeNull();
      expect(hint.textContent).toBe(CATALOG["v4.start.chip.keysHint"]);
      expect((button.getAttribute("aria-describedby") ?? "").split(/\s+/)).toContain(hint.id);
      // Only the row is described: the key model itself is unchanged (the chips stay out of the Tab order).
      for (const chip of row.querySelectorAll<HTMLButtonElement>(".v4StartChip")) expect(chip.tabIndex).toBe(-1);
    }
    for (const row of without) {
      expect(row.querySelector(".v4StartChipsHint")).toBeNull();
      expect(row.querySelector(".v4StartRowButton")!.hasAttribute("aria-describedby")).toBe(false);
    }
  });

  it("on a right-to-left page the keys are mirrored, so the line names the Left arrow", async () => {
    // The v4 catalogue is English in every language, and the page's `dir` still mirrors the keys (V4StartRow's rightToLeft).
    expect(CATALOG["v4.start.chip.keysHintRtl"]).toContain("Left arrow");
    expect(CATALOG["v4.start.chip.keysHintRtl"]).not.toContain("Right arrow");
    document.documentElement.setAttribute("dir", "rtl");
    try {
      await mount();
      const hints = [...host!.querySelectorAll<HTMLElement>(".v4StartChipsHint")];
      expect(hints.length).toBeGreaterThan(0);
      for (const hint of hints) expect(hint.textContent).toBe(CATALOG["v4.start.chip.keysHintRtl"]);
    } finally {
      document.documentElement.removeAttribute("dir");
    }
  });

  // Wave-3 fix round (A4 ii): while the ring is anywhere in the list every hint keeps its line (hidden), so the list changes
  // height once as the keyboard enters it and never while moving inside it; only the ringed row's hint is seen.
  it("the line shows only while its row or one of its chips has the keyboard's ring, and keeps its place while the ring is in the list", () => {
    expect(CSS).toMatch(/\.v4StartChipsHint\s*\{[^}]*display:\s*none/);
    const kept = /\.v4StartList:has\(:focus-visible\) \.v4StartChipsHint\s*\{([^}]*)\}/.exec(CSS);
    expect(kept, "the rule that keeps every hint's line").not.toBeNull();
    expect(kept![1]).toMatch(/display:\s*block/);
    expect(kept![1]).toMatch(/visibility:\s*hidden/);
    const seen = /\.v4StartList \.v4StartRow:has\(\.v4StartRowButton:focus-visible, \.v4StartChip:focus-visible\) \.v4StartChipsHint\s*\{([^}]*)\}/.exec(CSS);
    expect(seen, "the rule that shows the ringed row's hint").not.toBeNull();
    expect(seen![1]).toMatch(/visibility:\s*visible/);
  });
});
