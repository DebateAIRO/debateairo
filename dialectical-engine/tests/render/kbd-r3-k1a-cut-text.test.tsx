// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { V4NotStarted } from "../../apps/ui/components/v4/V4NotStarted.js";
import { V4TopLine } from "../../apps/ui/components/v4/V4QuestionShare.js";

/*
 * Keyboard audit round 2, wave 3 (2026-11-12), CSS-7 (V4A-19), the V4 parts: text cut short whose whole words lived only in
 * a `title` tooltip, which a keyboard can never open.
 *  - "Not started yet" (V4NotStarted): the saved question is cut to two lines; while its line holds the keyboard's ring
 *    (Pick up or Delete), the whole question shows. A screen reader already has it: the question is the line's text and
 *    describes both buttons.
 *  - The map's top line (V4TopLine): one line, cut with "…"; while the question's own card on the map or the outline holds
 *    the keyboard's ring, the whole question shows there. A screen reader has it in the page's heading (the line is hidden
 *    from it on purpose).
 * jsdom computes no style, so the rules are read as text.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (file: string): string => readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4", file), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const LONG = "Should a small town in the hills build a new road through the old forest when the people who live there disagree about the jobs, the noise, the animals and the cost of keeping it up for thirty years?";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});
async function mount(node: React.ReactNode): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

describe("CSS-7: cut-off V4 text shows whole without a pointer", () => {
  // Wave-3 fix round (A4 iii): every question in the list shows whole while the ring is anywhere in it, so moving down the
  // list does not grow one line and shrink another under the person's focus.
  it("Not started yet: every question shows whole while the keyboard's ring is anywhere in the list", () => {
    const css = read("v4-ask.css");
    expect(css).not.toMatch(/\.v4NotStartedItem:has\(:focus-visible\)/);
    const rule = /\.v4NotStartedList:has\(:focus-visible\) \.v4NotStartedQuestion\s*\{([^}]*)\}/.exec(css);
    expect(rule, "the unclamp rule").not.toBeNull();
    expect(rule![1]).toMatch(/-webkit-line-clamp:\s*unset/);
    expect(rule![1]).toMatch(/overflow:\s*visible/);
  });

  it("Not started yet: a screen reader gets the whole question as the line's text and the buttons' description", async () => {
    await mount(<V4NotStarted
      items={[{ id: "q1", question: LONG, saved_at: "2026-11-01T10:00:00Z" } as never]}
      locale="en"
      catalog={{}}
      onPickUp={() => undefined}
      onDelete={() => undefined}
    />);
    const line = host!.querySelector<HTMLElement>(".v4NotStartedQuestion")!;
    expect(line.textContent).toBe(LONG);
    expect(line.getAttribute("aria-hidden")).toBeNull();
    for (const button of host!.querySelectorAll("button")) expect(button.getAttribute("aria-describedby")).toBe(line.id);
  });

  // Wave-3 fix round (A4 i): the ring on ANY part of the map or the outline, not only the question's card, so the top line
  // changes once as focus enters the map and not on every arrow press.
  it("the map's top line: the whole question shows while the keyboard's ring is anywhere in the map or the outline", () => {
    const css = read("v4-map-looks.css");
    expect(css).not.toMatch(/\.v4MapRoot:focus-visible, \.v4OutRoot:focus-visible/);
    const rule = /\.v4DebBehind:has\(\.v4MapCanvas :focus-visible, \.v4OutTree :focus-visible\) \.v4TopLineQuestion\s*\{([^}]*)\}/.exec(css);
    expect(rule, "the unclamp rule").not.toBeNull();
    expect(rule![1]).toMatch(/white-space:\s*normal/);
    expect(rule![1]).toMatch(/overflow:\s*visible/);
  });

  it("the map's top line keeps the whole question as its text (hidden from screen readers: the page's heading says it)", async () => {
    await mount(<V4TopLine question={LONG} share={null} catalog={{}} />);
    const line = host!.querySelector<HTMLElement>(".v4TopLineQuestion")!;
    expect(line.textContent).toBe(LONG);
    expect(line.getAttribute("aria-hidden")).toBe("true");
  });
});
