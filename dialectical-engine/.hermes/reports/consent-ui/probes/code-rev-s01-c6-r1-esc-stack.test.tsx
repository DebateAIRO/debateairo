// @vitest-environment jsdom

/**
 * REVIEWER PROBE — CODE-REV-S01-C6 round 1. Built from SPEC S01-R18/R20 and
 * PLAN S01-S40 ("with the card open and the policy modal open over it, dispatch
 * ONE `keydown` with `key: "Escape"`, then assert (a) the policy dialog is gone,
 * (b) the preferences card is STILL in the document with its toggle values
 * unchanged, (c) the bar is still absent"), NOT from the author's test file.
 *
 * Deliberately different from the author's fixture in three ways, so it is an
 * independent measurement and not a re-run:
 *   - it drives the SETTINGS entry as well as the bar entry (the author's S40
 *     case only drives the bar);
 *   - it asserts the three `aria-checked` values as an ordered triple captured
 *     BEFORE the policy opens, after flipping BOTH operable toggles (the author
 *     flips one);
 *   - it counts Escape deliveries with a document-level spy, so "one keydown"
 *     is measured rather than assumed.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY } from "../../apps/ui/lib/consent.js";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";
import { ConsentSettingsPanel } from "../../apps/ui/components/consent/ConsentSettingsPanel.js";
import { openSurfaceCount } from "../../apps/ui/components/consent/modalSemantics.js";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  host = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const bar = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="region"][aria-label="Cookie consent"]');
const card = (): HTMLElement | null => document.querySelector<HTMLElement>(".consentCard");
const policy = (): HTMLElement | null => document.querySelector<HTMLElement>(".policyBezel");
const switches = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[role="switch"]')
];
const checkedTriple = (): string[] =>
  switches().map((s) => s.getAttribute("aria-checked") ?? "<none>");

function byText(label: string): HTMLButtonElement {
  const hits = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => b.textContent?.trim() === label
  );
  expect(hits.length, `exactly one control labelled ${label}`).toBe(1);
  return hits[0]!;
}

function pointerActivate(button: HTMLButtonElement): void {
  act(() => {
    button.focus();
    button.click();
  });
}

/** ONE keydown, counted at the document so "exactly one event" is measured. */
function pressEscapeOnce(): number {
  let delivered = 0;
  const count = (): void => {
    delivered += 1;
  };
  document.addEventListener("keydown", count, true);
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
  });
  document.removeEventListener("keydown", count, true);
  return delivered;
}

describe("REVIEWER PROBE — S01-S40 Esc stack, both entry points", () => {
  it("bar entry: one Escape removes ONLY the policy; the card and its toggles survive", () => {
    act(() => root!.render(<CookieConsent />));
    pointerActivate(byText("Choose what to store"));
    expect(card()).not.toBeNull();

    // Flip BOTH operable toggles, so an unchanged read cannot be vacuous.
    const defaults = checkedTriple();
    expect(defaults, "first-visit defaults, measured").toEqual(["true", "true", "false"]);
    const [, quality, analytics] = switches() as [HTMLElement, HTMLElement, HTMLElement];
    act(() => quality.click());
    act(() => analytics.click());
    const before = checkedTriple();
    expect(before, "essential locked; BOTH operable toggles now differ from their defaults").toEqual([
      "true",
      "false",
      "true"
    ]);

    pointerActivate(byText("Privacy notice"));
    expect(policy(), "the policy is open over the card").not.toBeNull();
    expect(openSurfaceCount(), "two surfaces registered").toBe(2);

    // The mechanism the arrangement depends on, asserted independently of the
    // author's helper import: the policy element FOLLOWS the card.
    const rel = card()!.compareDocumentPosition(policy()!);
    expect(rel & Node.DOCUMENT_POSITION_FOLLOWING, "policy follows card").not.toBe(0);
    expect(rel & Node.DOCUMENT_POSITION_PRECEDING, "and does not precede it").toBe(0);

    const delivered = pressEscapeOnce();
    expect(delivered, "exactly ONE keydown was dispatched").toBe(1);

    expect(policy(), "(a) the policy dialog is gone").toBeNull();
    expect(card(), "(b) the preferences card is STILL in the document").not.toBeNull();
    expect(checkedTriple(), "with its three aria-checked unchanged").toEqual(before);
    expect(bar(), "(c) the bar is still absent").toBeNull();
    expect(openSurfaceCount(), "one surface left on the stack").toBe(1);
    expect(localStorage.getItem(CONSENT_KEY), "nothing written").toBeNull();
  });

  it("SETTINGS entry with a valid decision stored: same one-surface-per-Escape rule", () => {
    const stored = JSON.stringify({
      v: 1,
      essential: true,
      quality: true,
      analytics: false,
      decidedAt: "2026-02-02T00:00:00.000Z"
    });
    localStorage.setItem(CONSENT_KEY, stored);
    act(() =>
      root!.render(
        <div className="appShell">
          <ConsentSettingsPanel />
          <CookieConsent />
        </div>
      )
    );
    expect(bar(), "a valid decision means no bar").toBeNull();
    pointerActivate(byText("Cookie preferences"));
    expect(card(), "the card opened from Settings").not.toBeNull();
    const before = checkedTriple();
    expect(before, "seeded decision reflected on open").toEqual(["true", "true", "false"]);

    pointerActivate(byText("Privacy notice"));
    expect(policy()).not.toBeNull();

    const delivered = pressEscapeOnce();
    expect(delivered).toBe(1);

    expect(policy(), "(a) policy gone").toBeNull();
    expect(card(), "(b) card survives from the Settings entry too").not.toBeNull();
    expect(checkedTriple(), "toggles unchanged").toEqual(before);
    expect(bar(), "(c) no bar, a valid decision is stored").toBeNull();
    expect(localStorage.getItem(CONSENT_KEY), "byte-identical").toBe(stored);
  });

  it("a SECOND Escape then closes the card, and the stack empties", () => {
    act(() => root!.render(<CookieConsent />));
    pointerActivate(byText("Choose what to store"));
    pointerActivate(byText("Privacy notice"));

    expect(pressEscapeOnce()).toBe(1);
    expect(policy()).toBeNull();
    expect(card()).not.toBeNull();

    expect(pressEscapeOnce()).toBe(1);
    expect(card(), "the second Escape reaches the card").toBeNull();
    expect(bar(), "and the bar returns, nothing valid stored").not.toBeNull();
    expect(openSurfaceCount(), "the stack is empty").toBe(0);
  });
});
