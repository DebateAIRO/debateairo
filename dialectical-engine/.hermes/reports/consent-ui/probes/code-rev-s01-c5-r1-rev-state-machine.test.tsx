// @vitest-environment jsdom

/**
 * CODE-REV-S01-C5 r1 — the reviewer's OWN probe of the C5 state machine.
 *
 * Built from `slices/S01/SPEC.md` S01-R04 / R05 / R06 / R14 / R17 / R21 and from
 * the packet's B1 charge, NOT from `tests/render/consent-mount.test.tsx`. Two
 * things are deliberately different from the author's suite:
 *
 * 1. The dismissal is driven through the DOM (a real click on a real button that
 *    the pass-through hands `onDismiss`), not by calling a recorded prop object.
 *    That exercises React's own event path and `act` batching rather than a
 *    direct function call.
 * 2. Every case that asks "is a decision stored?" is run against an INVALID
 *    stored value as well as against an absent one. The SPEC's R14 sentence is
 *    "the bar returns *iff no valid `v: 1` decision is stored*" — validity, not
 *    presence — and V-19's strict shape is what makes those two differ.
 */

import { act, createElement, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY } from "../apps/ui/lib/consent.js";
import { CookieConsent } from "../apps/ui/components/consent/CookieConsent.js";
import { ConsentSettingsPanel } from "../apps/ui/components/consent/ConsentSettingsPanel.js";

/**
 * A pass-through that renders the REAL card and appends ONE extra control wired
 * to the machine's own `onDismiss`. The shipped card wires no gesture to that
 * prop (cluster C6's shared helper does), so a DOM-driven dismissal needs a
 * button of the reviewer's own. Everything the card itself renders is the real
 * component.
 */
vi.mock("../apps/ui/components/consent/CookiePreferencesCard.js", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../apps/ui/components/consent/CookiePreferencesCard.js"
  );
  const Real = actual.CookiePreferencesCard as (p: Record<string, unknown>) => ReactNode;
  return {
    ...actual,
    CookiePreferencesCard: (props: Record<string, unknown>): ReactNode =>
      createElement("div", { "data-rev-wrap": "1" }, [
        createElement(Real, { ...props, key: "real" }),
        createElement(
          "button",
          {
            key: "dismiss",
            type: "button",
            "data-rev": "dismiss",
            onClick: props.onDismiss as () => void
          },
          "REV dismiss"
        )
      ])
  };
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const bar = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="region"][aria-label="Cookie consent"]');
const card = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]');
const raw = (): string | null => localStorage.getItem(CONSENT_KEY);
const checked = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('[role="switch"]')].map(
    (c) => c.getAttribute("aria-checked") ?? ""
  );

const VALID = JSON.stringify({
  v: 1,
  essential: true,
  quality: false,
  analytics: true,
  decidedAt: "2026-01-01T00:00:00.000Z"
});

/** V-19's strict shape, read in the failure direction: every way a value is NOT a decision. */
const INVALID: readonly (readonly [string, string])[] = [
  ["a future version", JSON.stringify({ v: 2, essential: true, quality: true, analytics: true, decidedAt: "2026-01-01T00:00:00.000Z" })],
  ["essential denied", JSON.stringify({ v: 1, essential: false, quality: true, analytics: true, decidedAt: "2026-01-01T00:00:00.000Z" })],
  ["a sixth key", JSON.stringify({ v: 1, essential: true, quality: true, analytics: true, decidedAt: "2026-01-01T00:00:00.000Z", tracking: true })],
  ["a missing key", JSON.stringify({ v: 1, essential: true, quality: true, decidedAt: "2026-01-01T00:00:00.000Z" })],
  ["a non-boolean toggle", JSON.stringify({ v: 1, essential: true, quality: "yes", analytics: true, decidedAt: "2026-01-01T00:00:00.000Z" })],
  ["a non-ISO instant", JSON.stringify({ v: 1, essential: true, quality: true, analytics: true, decidedAt: "yesterday" })],
  ["a local-time instant", JSON.stringify({ v: 1, essential: true, quality: true, analytics: true, decidedAt: "2026-01-01T00:00:00+02:00" })],
  ["malformed JSON", "{not json"],
  ["a bare string", JSON.stringify("accepted")],
  ["an array", JSON.stringify([1, true, true])]
];

function mount(withSettings: boolean): void {
  act(() => {
    root!.render(
      withSettings
        ? createElement("div", { className: "appShell" }, [
            createElement(ConsentSettingsPanel, { key: "panel" }),
            createElement(CookieConsent, { key: "machine" })
          ])
        : createElement(CookieConsent, null)
    );
  });
}

function clickLabel(label: string): void {
  const b = [...document.querySelectorAll("button")].find(
    (c) => c.textContent?.trim() === label
  );
  expect(b, `no rendered control labelled ${label}`).toBeDefined();
  act(() => (b as HTMLButtonElement).click());
}

/** The DOM route to the machine's `onDismiss` — a real click, not a recorded prop. */
function dismiss(): void {
  const b = document.querySelector<HTMLButtonElement>('button[data-rev="dismiss"]');
  expect(b, "the machine handed the card an onDismiss").not.toBeNull();
  act(() => b!.click());
}

function openFromSettings(): void {
  const b = document.querySelector<HTMLButtonElement>("button.setBtn");
  expect(b, "the Settings opener").not.toBeNull();
  act(() => b!.click());
}

describe("REV C5 · the stored decision is the discriminator", () => {
  it("R06 — nothing on the server, nothing on the first client pass", () => {
    expect(renderToStaticMarkup(createElement(CookieConsent, null))).toBe("");
    let first = "unset";
    act(() => {
      flushSync(() => root!.render(createElement(CookieConsent, null)));
      first = container!.innerHTML;
    });
    expect(first, "first client render pass").toBe("");
    expect(bar(), "the bar after the effect reads storage").not.toBeNull();
  });

  it("R05/R14 — an ABSENT decision shows the bar; a VALID one is silent", () => {
    mount(false);
    expect(bar()).not.toBeNull();
    act(() => root!.unmount());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    localStorage.setItem(CONSENT_KEY, VALID);
    mount(false);
    expect(bar(), "a valid decision keeps the bar away").toBeNull();
  });

  it.each(INVALID)("R14/V-19 — %s is NOT a decision: the bar shows at mount", (_name, value) => {
    localStorage.setItem(CONSENT_KEY, value);
    mount(false);
    expect(bar(), "an invalid stored value must re-ask").not.toBeNull();
    expect(raw(), "and the invalid value is not rewritten at mount").toBe(value);
  });

  it("R04 — the bar's two terminal controls write their exact rows", () => {
    mount(false);
    clickLabel("Accept all");
    expect(bar()).toBeNull();
    expect(JSON.parse(raw()!)).toMatchObject({ v: 1, essential: true, quality: true, analytics: true });

    localStorage.clear();
    act(() => root!.unmount());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mount(false);
    clickLabel("Essential only");
    expect(bar()).toBeNull();
    expect(JSON.parse(raw()!)).toMatchObject({ v: 1, essential: true, quality: false, analytics: false });
  });

  it("R14 — `Choose what to store` opens the card and hides the bar; Save choices writes and closes", () => {
    mount(false);
    clickLabel("Choose what to store");
    expect(card(), "the card is open").not.toBeNull();
    expect(bar(), "the bar is not rendered anywhere while the card is open").toBeNull();
    expect(document.querySelectorAll(".consentScrim").length, "one scrim").toBe(1);

    const [, quality, analytics] = [...document.querySelectorAll<HTMLElement>('[role="switch"]')];
    act(() => quality.click());
    act(() => analytics.click());
    clickLabel("Save choices");
    expect(card()).toBeNull();
    expect(bar()).toBeNull();
    expect(JSON.parse(raw()!)).toMatchObject({ v: 1, essential: true, quality: false, analytics: true });
  });

  it("R04 — the card's `Essential only` writes the identical object the bar writes", () => {
    mount(false);
    clickLabel("Choose what to store");
    clickLabel("Essential only");
    const fromCard = JSON.parse(raw()!) as Record<string, unknown>;
    expect({ ...fromCard, decidedAt: "x" }).toEqual({
      v: 1, essential: true, quality: false, analytics: false, decidedAt: "x"
    });
  });

  it("S01-S30 — dismissed from the BAR entry with nothing stored: the bar RETURNS, nothing written", () => {
    mount(false);
    clickLabel("Choose what to store");
    dismiss();
    expect(bar(), "the bar returns").not.toBeNull();
    expect(card()).toBeNull();
    expect(raw(), "a dismissal is not a decision").toBeNull();
  });

  it("S01-S31 (B1) — dismissed from the SETTINGS entry with nothing stored: the bar RETURNS", () => {
    mount(true);
    expect(bar(), "the bar shows behind Settings because nothing is stored").not.toBeNull();
    openFromSettings();
    expect(card()).not.toBeNull();
    expect(bar(), "hidden while the card is open").toBeNull();
    dismiss();
    expect(bar(), "the ENTRY POINT must not be the discriminator").not.toBeNull();
    expect(raw(), "and nothing was written").toBeNull();
  });

  it.each(INVALID)(
    "S01-S31 (B1, strict) — dismissed from SETTINGS with %s stored: the bar RETURNS",
    (_name, value) => {
      localStorage.setItem(CONSENT_KEY, value);
      mount(true);
      expect(bar(), "an invalid value is no decision, so the bar is showing").not.toBeNull();
      openFromSettings();
      expect(card()).not.toBeNull();
      dismiss();
      expect(bar(), "R14 says *valid*, not *present*").not.toBeNull();
      expect(raw(), "storage untouched").toBe(value);
    }
  );

  it("S01-S32 — dismissed from SETTINGS with a VALID decision: silence, bytes unchanged", () => {
    localStorage.setItem(CONSENT_KEY, VALID);
    mount(true);
    expect(bar()).toBeNull();
    openFromSettings();
    expect(card()).not.toBeNull();
    dismiss();
    expect(bar(), "no bar").toBeNull();
    expect(card(), "no card").toBeNull();
    expect(raw(), "byte-for-byte").toBe(VALID);
  });

  it("S01-S33/R21 — the Settings button opens the SAME card, PRE-FILLED from storage", () => {
    localStorage.setItem(CONSENT_KEY, VALID);
    mount(true);
    expect(document.querySelector(".setSectionTitle")?.textContent).toBe("Privacy");
    expect(document.querySelector(".setSectionHint")?.textContent).toBe(
      "Choose what this browser stores. Asked once; change it here any time."
    );
    expect(document.querySelector<HTMLButtonElement>("button.setBtn")?.textContent?.trim()).toBe(
      "Cookie preferences"
    );
    openFromSettings();
    expect(card()).not.toBeNull();
    expect(checked(), "essential locked on, quality false, analytics true").toEqual([
      "true", "false", "true"
    ]);
    expect(raw(), "opening writes nothing").toBe(VALID);
  });

  it("R17 — both entry points open at the SAME defaults when nothing valid is stored", () => {
    mount(true);
    openFromSettings();
    const fromSettings = checked();
    dismiss();
    clickLabel("Choose what to store");
    expect(checked(), "the two openers agree").toEqual(fromSettings);
    expect(fromSettings, "R17's defaults: quality on, analytics off").toEqual(["true", "true", "false"]);
  });

  it("N6 — a reopen shows what was last SAVED, not what the first open showed", () => {
    mount(true);
    openFromSettings();
    const [, quality, analytics] = [...document.querySelectorAll<HTMLElement>('[role="switch"]')];
    act(() => quality.click());
    act(() => analytics.click());
    clickLabel("Save choices");
    openFromSettings();
    expect(checked(), "pre-filled from the SAVED decision").toEqual(["true", "false", "true"]);
    clickLabel("Save choices");
    expect(JSON.parse(raw()!)).toMatchObject({ quality: false, analytics: true });
  });

  it("R21 — a dismissal from Settings after a SAVE in the same session stays silent", () => {
    // The composite the individual cases do not reach: decide, then reopen from
    // Settings and back out. The machine must read storage, not remember that it
    // was showing the bar earlier in this page's life.
    mount(true);
    clickLabel("Accept all");
    expect(bar()).toBeNull();
    openFromSettings();
    dismiss();
    expect(bar(), "a decision taken this session is still a decision").toBeNull();
    expect(card()).toBeNull();
  });
});
