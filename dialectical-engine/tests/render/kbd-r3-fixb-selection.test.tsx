// @vitest-environment jsdom
/*
 * Keyboard audit round 2, wave 3 fix round (2026-11-12): the selection hook behind "challenge a passage".
 * B2: a remembered selection must not pre-fill a later Challenge box once it was dropped by a pointer press, once
 *     the pointer route opened its popover, or once the argument's prose no longer holds those words.
 * B3: a touch long-press that ends in `pointercancel` must not leave the hook thinking a pointer is still down.
 * B4: the timer route is for touch and pen only; a mouse selection goes through the views' own `onMouseUp`.
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSelectionChallenge } from "../../apps/ui/lib/useSelectionChallenge.js";

let root: Root | null = null;
const onSelect = vi.fn();
let read: (nodeId: string) => string = () => "";
let setEnabled: (enabled: boolean) => void = () => undefined;
let setProseA: (text: string) => void = () => undefined;

function Harness() {
  const [enabled, setEnabledState] = useState(true);
  const [proseA, setProseAState] = useState("Alpha prose with several plain words in it.");
  setEnabled = setEnabledState;
  setProseA = setProseAState;
  read = useSelectionChallenge(enabled, (nodeId, text) => onSelect(nodeId, text));
  return (
    <div>
      <div data-challenge-prose="a">{proseA}</div>
      <div data-challenge-prose="b">Beta prose with other plain words in it.</div>
      <button type="button" id="challenge-a">Challenge</button>
      <p id="elsewhere">Elsewhere on the page.</p>
    </div>
  );
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  onSelect.mockReset();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Harness />));
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const prose = (id: string) => document.querySelector<HTMLElement>(`[data-challenge-prose="${id}"]`)!;
function select(id: string, words: string): void {
  const text = prose(id).firstChild!;
  const start = (text.textContent ?? "").indexOf(words);
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, start + words.length);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => { document.dispatchEvent(new Event("selectionchange")); });
}
function collapse(): void {
  window.getSelection()!.removeAllRanges();
  act(() => { document.dispatchEvent(new Event("selectionchange")); });
}
function pointer(type: "pointerdown" | "pointerup" | "pointercancel", pointerType: string, target: Element = prose("a")): void {
  act(() => { target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType })); });
}
async function pastTimer(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 760)); });
}

describe("B2: an old selection does not pre-fill a later Challenge box", () => {
  it("still pre-fills from a keyboard selection that collapsed when focus moved to the button (K3)", () => {
    select("a", "several plain words");
    collapse();
    expect(read("a")).toBe("several plain words");
  });

  it("a pointer press that drops the selection forgets the words", () => {
    pointer("pointerdown", "mouse");
    select("a", "several plain words");
    pointer("pointerup", "mouse");
    // Later: a click elsewhere drops the selection.
    pointer("pointerdown", "mouse", document.getElementById("elsewhere")!);
    collapse();
    pointer("pointerup", "mouse", document.getElementById("elsewhere")!);
    expect(read("a")).toBe("");
  });

  it("the pointer route opening its popover forgets the words (the hook is switched off while it is open)", async () => {
    pointer("pointerdown", "mouse");
    select("a", "several plain words");
    pointer("pointerup", "mouse");
    // The view's onMouseUp opened the popover: the page switches the hook off; closing it switches it back on.
    await act(async () => setEnabled(false));
    await act(async () => setEnabled(true));
    collapse();
    expect(read("a")).toBe("");
  });

  it("the timer route opening its popover forgets the words", async () => {
    pointer("pointerdown", "touch");
    pointer("pointerup", "touch");
    select("a", "several plain words");
    await pastTimer();
    expect(onSelect).toHaveBeenCalledWith("a", "several plain words");
    collapse();
    expect(read("a")).toBe("");
  });

  it("words no longer in the argument's prose (it was regenerated) are not offered", async () => {
    select("a", "several plain words");
    collapse();
    await act(async () => setProseA("A regenerated argument that says something else."));
    expect(read("a")).toBe("");
  });
});

describe("B3: a touch long-press that ends in pointercancel", () => {
  it("pointerdown, pointercancel, a selection, a pause: the popover opens", async () => {
    pointer("pointerdown", "touch");
    pointer("pointercancel", "touch");
    select("a", "several plain words");
    await pastTimer();
    expect(onSelect).toHaveBeenCalledWith("a", "several plain words");
  });
});

describe("B4: the timer route is for touch and pen, not the mouse", () => {
  it("a mouse press, then a selection with no key and no mouseup (a screen reader's browse mode): nothing opens", async () => {
    pointer("pointerdown", "mouse", document.getElementById("elsewhere")!);
    pointer("pointerup", "mouse", document.getElementById("elsewhere")!);
    select("a", "several plain words");
    await pastTimer();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("a pen selection opens after the pause", async () => {
    pointer("pointerdown", "pen");
    pointer("pointerup", "pen");
    select("a", "several plain words");
    await pastTimer();
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
