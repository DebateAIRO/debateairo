// @vitest-environment jsdom
// CODE-REV-S01-C3C4 r1 — PROBE X: `initial` is read only by the useState
// initialiser. If cluster C5/C6 keeps the card MOUNTED and re-renders it with a
// different `initial` (Settings re-entry after a Save, or a second open without
// an unmount), the toggles keep the FIRST value. Measured, not argued.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookiePreferencesCard } from "../apps/ui/components/consent/CookiePreferencesCard.js";

let root: Root | null = null;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const c = document.createElement("div");
  document.body.append(c);
  root = createRoot(c);
});
afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const noop = (): void => {};
const render = (initial: { quality: boolean; analytics: boolean }) =>
  act(() => {
    root!.render(
      <CookiePreferencesCard
        initial={initial}
        onSave={noop}
        onEssentialOnly={noop}
        onDismiss={noop}
        onRequestPolicy={noop}
      />
    );
  });
const checked = () =>
  [...document.querySelectorAll('[role="switch"]')].map((s) => s.getAttribute("aria-checked"));

describe("REV — the card's `initial` across a re-render", () => {
  it("documents what the card does when `initial` changes without a remount", () => {
    render({ quality: true, analytics: false });
    expect(checked(), "first open").toEqual(["true", "true", "false"]);
    render({ quality: false, analytics: true });
    // eslint-disable-next-line no-console
    console.log("after re-render with a DIFFERENT initial ->", JSON.stringify(checked()));
    expect(checked(), "second open, same mounted instance").toEqual(["true", "false", "true"]);
  });

  it("a remount DOES pick the new initial up (the shape C5 must use)", () => {
    render({ quality: true, analytics: false });
    act(() => root!.unmount());
    const c = document.createElement("div");
    document.body.append(c);
    root = createRoot(c);
    render({ quality: false, analytics: true });
    expect(checked(), "after a real remount").toEqual(["true", "false", "true"]);
  });
});
