// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";
import { CONSENT_BAR_ROOM } from "../../apps/ui/components/consent/useConsentBarRoom.js";

/*
 * Keyboard audit, 12 Nov 2026 (WCAG 2.4.11, Focus Not Obscured): while the first-visit cookie bar shows, the room it
 * covers at the foot of the window is published on <html>, and taken away with the bar. globals.css turns that room into
 * scroll room for focused controls (`kbd-r2-chrome-css.test.ts` pins the rules).
 */

let root: Root | null = null;
let observed: Element[] = [];
let resize: (() => void) | null = null;
let barTop = 600;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  observed = [];
  resize = null;
  barTop = 600;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe(element: Element): void {
        observed.push(element);
      }
      disconnect(): void {
        observed = [];
      }
    }
  );
  vi.stubGlobal("innerHeight", 768);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = this.classList.contains("consentBar") ? barTop : 0;
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const room = (): string => document.documentElement.style.getPropertyValue(CONSENT_BAR_ROOM);

describe("the cookie bar's room at the foot of the window", () => {
  it("is published while the bar shows: what the bar covers, plus a little air", () => {
    act(() => root!.render(<CookieConsent />));
    const bar = document.querySelector(".consentBar");
    expect(bar, "the first-visit bar shows").not.toBeNull();
    expect(room()).toBe("180px");
    expect(observed, "the bar is watched for a change of size").toEqual([bar]);
  });

  it("follows the bar when its size changes (another language, a narrower window)", () => {
    act(() => root!.render(<CookieConsent />));
    barTop = 500;
    act(() => resize?.());
    expect(room()).toBe("280px");
  });

  it("goes with the bar: OK leaves no room behind", () => {
    act(() => root!.render(<CookieConsent />));
    act(() => document.querySelector<HTMLButtonElement>(".consentBar button.consentPrimary")!.click());
    expect(document.querySelector(".consentBar")).toBeNull();
    expect(room()).toBe("");
  });

  it("is not kept while the storage card stands in for the bar, and comes back with the bar", () => {
    act(() => root!.render(<CookieConsent />));
    act(() => document.querySelector<HTMLButtonElement>(".consentBar button.consentGhostStrong")!.click());
    expect(document.querySelector(".consentBar")).toBeNull();
    expect(room()).toBe("");
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector(".consentBar"), "closing the card with nothing stored brings the bar back").not.toBeNull();
    expect(room()).toBe("180px");
  });

  it("is never published for a returning visitor", () => {
    localStorage.setItem("debateai.consent", '{"acknowledgedAt":"2026-09-29T00:00:00.000Z","v":2}');
    act(() => root!.render(<CookieConsent />));
    expect(document.querySelector(".consentBar")).toBeNull();
    expect(room()).toBe("");
  });
});
