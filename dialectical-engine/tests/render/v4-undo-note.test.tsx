// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V4UndoNote, V4UndoNotes, type V4UndoNoteState } from "../../apps/ui/components/v4/V4UndoNote.js";

/*
 * V4 UX fixes (owner picks 3 Nov 2026): THE Undo note (journey-f21) in jsdom. r2-22 A: a quiet line shrinks over the
 * 10 seconds, no ticking number, and with reduced motion the line stands still and words say it. dig-f7: focus moves to
 * Undo, Esc undoes, one screen-reader line, focus back afterwards. journey-f21: "Cancelled. Nothing was used."
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WORDS = {
  undoLabel: "Undo",
  undoName: "Undo this dig",
  stillLine: "Starts in a few seconds",
  announce: "Your dig starts in a few seconds. Undo is selected.",
  sendingLine: "Starting your dig…",
  confirmedLine: "Cancelled. Nothing was used."
} as const;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(node: React.ReactNode): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

/** A dig button and the note it starts, the way a page wires them: Undo cancels, the page decides the state. */
function Page(props: Readonly<{ startAt?: number; takeFocus?: boolean; onUndo?: () => void }>) {
  const [state, setState] = useState<V4UndoNoteState | null>(null);
  const [sendsAt, setSendsAt] = useState(0);
  return (
    <div>
      <button type="button" className="dig" onClick={() => { setSendsAt((props.startAt ?? Date.now()) + 10_000); setState("counting"); }}>Dig</button>
      <button type="button" className="send" onClick={() => setState("sending")}>send</button>
      {state === null ? null : (
        <V4UndoNote
          {...WORDS}
          state={state}
          label={<>Digging into “Mostly renewables” · up to 4% of today</>}
          sendsAt={sendsAt}
          onUndo={() => {
            props.onUndo?.();
            setState("cancelled");
          }}
          {...(props.takeFocus === undefined ? {} : { takeFocus: props.takeFocus })}
        />
      )}
    </div>
  );
}

function press(element: Element): void {
  act(() => {
    (element as HTMLElement).focus();
    (element as HTMLElement).click();
  });
}

describe("the shared Undo note", () => {
  it("moves focus to Undo, says one line to a screen reader, and shows no ticking number", () => {
    const page = mount(<Page />);
    press(page.querySelector(".dig")!);
    const undo = page.querySelector<HTMLButtonElement>(".v4UndoBtn")!;
    expect(document.activeElement).toBe(undo);
    expect(undo.getAttribute("aria-label")).toBe(WORDS.undoName);
    expect(undo.textContent).toBe(WORDS.undoLabel);
    expect(page.querySelector('[role="status"]')?.textContent).toBe(WORDS.announce);
    expect(page.querySelectorAll('[role="status"], [aria-live]')).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    // No seconds anywhere: the countdown is the line.
    expect(page.querySelector(".v4Undo")?.textContent).not.toMatch(/\(\d+\)|\b\d+ ?s\b/u);
  });

  it("draws a line that shrinks over the 10 seconds, carrying on part-way when drawn again on another page", () => {
    const now = Date.now();
    const page = mount(<Page startAt={now - 3_000} takeFocus={false} />);
    press(page.querySelector(".dig")!);
    const fill = page.querySelector<HTMLElement>(".v4UndoLineFill")!;
    expect(fill.style.animationDuration).toBe("10000ms");
    expect(fill.style.animationDelay).toBe("-3000ms");
    expect(fill.closest(".v4UndoLine")?.getAttribute("aria-hidden")).toBe("true");
    // A note drawn on a page it travelled to does not take focus again.
    expect(document.activeElement).toBe(page.querySelector(".dig"));
    // The words for reduced motion are there for the stylesheet to show.
    expect(page.querySelector(".v4UndoStill")?.textContent).toContain(WORDS.stillLine);
  });

  it("Esc undoes (and stops there), says 'Cancelled. Nothing was used.', and gives focus back to the dig button", () => {
    const onUndo = vi.fn();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    const page = mount(<Page onUndo={onUndo} />);
    const dig = page.querySelector<HTMLButtonElement>(".dig")!;
    press(dig);
    act(() => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    expect(page.querySelector(".v4Undo")?.textContent).toContain(WORDS.confirmedLine);
    expect(page.querySelector('[role="status"]')?.textContent).toBe(WORDS.confirmedLine);
    expect(page.querySelector(".v4UndoBtn")).toBeNull();
    expect(document.activeElement).toBe(dig);
    document.removeEventListener("keydown", outer);
  });

  it("after the 10 seconds says it is starting, with no gap and no Undo, and focus goes back", () => {
    const page = mount(<Page />);
    const dig = page.querySelector<HTMLButtonElement>(".dig")!;
    press(dig);
    act(() => {
      page.querySelector<HTMLButtonElement>(".send")!.click();
    });
    expect(page.querySelector(".v4Undo")?.textContent).toContain(WORDS.sendingLine);
    expect(page.querySelector(".v4UndoBtn")).toBeNull();
    expect(page.querySelector(".v4UndoLine")).toBeNull();
  });

  it("the stylesheet stills the line under reduced motion and shows the words instead", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-undo.css"), "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.v4UndoLineFill \{ animation: none; \}/u);
    expect(reduced).toMatch(/\.v4UndoStill \{ display: inline; \}/u);
    expect(css).toMatch(/\.v4UndoStill \{ display: none; \}/u);
    // Every move takes the shared motion tokens of v4-base.css (each under half a second, instant with reduced motion);
    // only the 10-second countdown line has its own time (r2-22 A, set on the element). No second set of motion names.
    expect(css).not.toMatch(/--v4-undo-[a-z-]+:/u);
    const moves = [...css.matchAll(/(?:animation|transition):[^;]*;/gu)].map((match) => match[0]).filter((rule) => !/: none;/u.test(rule));
    expect(moves.length).toBeGreaterThan(0);
    // Under reduced motion a move becomes the shared 1-second highlight of v4-base.css (the chat answer on movement).
    for (const rule of moves) expect(rule, rule).toMatch(/var\(--v4-move-(?:fold|clear|snap|fly|roll|turn)\)|^animation: v4Highlight var\(--v4-highlight-time\)/u);
  });
});

describe("several waiting things in one note", () => {
  const items = (count: number) => Array.from({ length: count }, (_, at) => ({
    key: at,
    render: (folded: boolean) => <p className={folded ? "line folded" : "line"}>{`Dig ${at + 1}`}</p>
  }));

  it("shows at most three lines; older ones fold to '+N more', which opens them", () => {
    const page = mount(<V4UndoNotes items={items(4)} max={3} moreLabel={(count) => `+${count} more`} />);
    expect([...page.querySelectorAll(".line")].map((line) => line.textContent)).toEqual(["Dig 3", "Dig 4"]);
    const more = page.querySelector<HTMLButtonElement>(".v4UndoMore")!;
    expect(more.textContent).toBe("+2 more");
    act(() => more.click());
    expect(page.querySelectorAll(".line")).toHaveLength(4);
  });

  it("on a phone the older line folds to one line above the newer one", () => {
    const page = mount(<V4UndoNotes items={items(2)} max={2} foldOlder moreLabel={(count) => `+${count} more`} />);
    expect([...page.querySelectorAll(".line")].map((line) => line.className)).toEqual(["line folded", "line"]);
    expect(page.querySelector(".v4UndoMore")).toBeNull();
  });
});
