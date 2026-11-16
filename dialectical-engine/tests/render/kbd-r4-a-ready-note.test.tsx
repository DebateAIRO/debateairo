// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V4StartBar, type StartBarState } from "../../apps/ui/components/v4/V4StartBar.js";
import type { DigMode, ReadingLevel } from "../../apps/ui/lib/v4/types.js";

/*
 * Keyboard audit round 4 (2026-11-12), A5: "Your paths are ready ↓" goes after its 4 seconds (the page's readyNote turns
 * false). While it has focus it stays, so it never vanishes under the person; it goes once focus has left it. Nothing changes
 * for anyone not focused on it. Both layouts (the computer's bar and the phone's line).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;

type Props = Parameters<typeof V4StartBar>[0];

function props(over: Partial<Props> = {}): Props {
  return {
    job: "START",
    catalog: CATALOG, locale: "en", freePlan: false, level: "plain" as ReadingLevel, widths: { options: [3, 5, 7], default: 5 }, width: 5,
    onWidth: () => undefined, mode: "quick" as DigMode, onMode: () => undefined, pathCount: 5, sharePercent: 18, shareDelta: null,
    state: "READY" as StartBarState, onStart: () => undefined, justAnswer: { shown: true, ready: true, onPress: () => undefined },
    carryOnOffered: false, carryOn: false, onCarryOn: () => undefined, readyNote: false, onReadyNote: () => undefined,
    publicNotice: null, above: null, combineLine: null, narrow: false, textFocused: false, helpFirst: false,
    ...over
  } as Props;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
// The window has focus, as in a browser the person is using (jsdom says it never does).
beforeEach(() => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

async function render(given: Props): Promise<void> {
  if (host === null) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(<V4StartBar {...given} />));
}

const ready = (): HTMLButtonElement | null => host!.querySelector<HTMLButtonElement>(".v4StartBarReady");

describe("A5: the ready line stays while it has focus", () => {
  for (const narrow of [false, true]) {
    it(`${narrow ? "phone" : "computer"}: focused, it outlives its 4 seconds; once focus leaves, it goes`, async () => {
      await render(props({ narrow, readyNote: true }));
      const button = ready()!;
      expect(button).not.toBeNull();
      await act(async () => button.focus());
      await render(props({ narrow, readyNote: false }));
      expect(ready(), "still there under focus").toBe(button);
      expect(document.activeElement).toBe(button);
      await act(async () => host!.querySelector<HTMLButtonElement>(".v4StartBarStart")!.focus());
      expect(ready(), "gone once focus has left").toBeNull();
    });

    it(`${narrow ? "phone" : "computer"}: not focused, it goes on time as before`, async () => {
      await render(props({ narrow, readyNote: true }));
      expect(ready()).not.toBeNull();
      await render(props({ narrow, readyNote: false }));
      expect(ready()).toBeNull();
    });
  }

  it("a switch to another window while it has focus does not take it away (round 4 review)", async () => {
    await render(props({ readyNote: true }));
    const button = ready()!;
    await act(async () => button.focus());
    const windowFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    await act(async () => { button.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null })); button.dispatchEvent(new FocusEvent("blur", { relatedTarget: null })); });
    await render(props({ readyNote: false }));
    windowFocus.mockReturnValue(true);
    expect(ready(), "still there for the person coming back").toBe(button);
  });

  it("focus that left before the 4 seconds were over does not keep it", async () => {
    await render(props({ readyNote: true }));
    await act(async () => ready()!.focus());
    await act(async () => host!.querySelector<HTMLButtonElement>(".v4StartBarStart")!.focus());
    expect(ready(), "still within its 4 seconds").not.toBeNull();
    await render(props({ readyNote: false }));
    expect(ready()).toBeNull();
  });
});
