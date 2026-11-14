// @vitest-environment jsdom
// Keyboard audit round 4 (C8, the review of 14 Nov 2026): on a phone and in a short window the page scrolls under the
// owner's Visibility card, which sticks to the window's foot. The page keeps the card's height clear when it scrolls a
// focused control into view. Chrome draws the stuck card at its least height (6rem) and scrolls inside it, but another
// browser may draw it at its content height (up to 45% of the window), so the card publishes its real height
// (--visibility-card-room, read by globals.css) and keeps it current; the stylesheet's fallback is the least height.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PublicationControl } from "../../apps/ui/components/PublicationControl.js";
import pub from "../../apps/ui/messages/en/public.json" with { type: "json" };

const runId = "11111111-1111-4111-8111-111111111111";
const client = {
  readRunVisibility: vi.fn(async () => ({ state: "PRIVATE" as const, public_ref: null })),
  readPublicationReview: vi.fn(async () => ({ flagged: false, state: "NONE", categories: [], asks_used: 0, may_ask: false, refusal: null }))
};

let root: Root | null = null;
let resize: (() => void) | null = null;
let height = 280;
const room = (): string => document.documentElement.style.getPropertyValue("--visibility-card-room");

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe(): void {}
    disconnect(): void { resize = null; }
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { height: this.classList.contains("publicationControl") ? height : 0, width: 0, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0, toJSON() {} } as DOMRect;
  });
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  document.documentElement.style.removeProperty("--visibility-card-room");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("the card publishes its real height, follows it as it changes, and takes it away when it goes", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(<PublicationControl runId={runId} client={client as never} catalog={pub} />); });
  expect(room()).toBe("280px");
  height = 96.4;
  act(() => resize?.());
  expect(room(), "rounded up, so the room is never short of the card").toBe("97px");
  await act(async () => root!.unmount());
  root = null;
  expect(room()).toBe("");
});
