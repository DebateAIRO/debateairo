// @vitest-environment jsdom

/**
 * REVIEWER PROBE — CODE-REV-S01-C6 round 2.
 *
 * Subject: the ROUTE half of B1's class, which the rework's sweep states as
 * "the card can be closed while the policy still stands over it — by the card's
 * own backdrop, and by `Save choices`" (CookieConsent.tsx:82-83), and which the
 * rework handoff §10 restates as "the two reachable routes are exactly the
 * card's own backdrop and `Save choices`".
 *
 * The card footer carries THREE controls, not two
 * (`CookiePreferencesCard.tsx:192,196,199`): `Privacy notice`, **`Essential
 * only`** and `Save choices`. `Essential only` calls `onEssentialOnly` ->
 * `settle` (`CookieConsent.tsx:191,144-147`) — the same close class as
 * `Save choices`, and it is not among the pinned routes.
 *
 * These cases assert the PROPERTY in the correct direction (green when the
 * component is right), unlike the round-1 oracle which asserted the defect.
 * They are expected GREEN at 97859c58 and RED with the restored
 * `setPolicyOpen(false)` deleted.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY } from "../../apps/ui/lib/consent.js";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";
import { ConsentSettingsPanel } from "../../apps/ui/components/consent/ConsentSettingsPanel.js";

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

const card = (): HTMLElement | null => document.querySelector<HTMLElement>(".consentCard");
const policy = (): HTMLElement | null => document.querySelector<HTMLElement>(".policyBezel");
const bar = (): HTMLElement | null => document.querySelector<HTMLElement>(".consentBar");
const dialogs = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
const raw = (): string | null => localStorage.getItem(CONSENT_KEY);

function byText(label: string): HTMLButtonElement {
  const hits = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => b.textContent?.trim() === label
  );
  expect(hits.length, `exactly one control labelled ${label}`).toBe(1);
  return hits[0]!;
}

function activate(button: HTMLButtonElement): void {
  act(() => {
    button.focus();
    button.click();
  });
}

const VALID = JSON.stringify({
  v: 1,
  essential: true,
  quality: true,
  analytics: false,
  decidedAt: "2026-02-02T00:00:00.000Z"
});

describe("REVIEWER PROBE r2 — every card-closing route leaves a CLEAN next open", () => {
  it("ROUTE 3 (UNPINNED by the rework): Essential only, clicked from under an open policy", () => {
    // The third footer control. Same `settle` class as `Save choices`, entered
    // from the BAR. The Settings panel is in the tree FROM THE START and the
    // tree is never re-rendered with a different shape: a second `root.render`
    // of a different root element remounts `CookieConsent`, which resets
    // `policyOpen` for free and MASKS the very stranding under test. (Measured:
    // an earlier draft of this case did exactly that and passed against a
    // mutant it was written to catch.)
    act(() =>
      root!.render(
        <div className="appShell">
          <ConsentSettingsPanel />
          <CookieConsent />
        </div>
      )
    );
    activate(byText("Choose what to store"));
    activate(byText("Privacy notice"));
    expect(policy(), "the policy is open over the card").not.toBeNull();
    expect(dialogs().length, "two dialogs while both are open").toBe(2);

    // Clicked without focusing, exactly as the suite's `Save choices` case does:
    // the point is that this control settles the card from BEHIND the policy.
    act(() => byText("Essential only").click());

    expect(card(), "the card settled and closed").toBeNull();
    expect(policy(), "and the policy element unmounts with it").toBeNull();
    expect(raw(), "Essential only writes a decision").not.toBeNull();

    // Storage is now valid, so the bar does not return; the card comes back
    // through Settings — same mounted component, so the flag really is the
    // one that survived.
    activate(byText("Cookie preferences"));

    expect(card(), "the card is open again").not.toBeNull();
    expect(
      policy(),
      "CLEAN — Essential only is a third route to the stranded flag and it is covered too"
    ).toBeNull();
    expect(dialogs().length, "exactly one dialog on a freshly opened card").toBe(1);
  });

  it("ROUTE 3 from the SETTINGS entry, where the opener outlives the card", () => {
    localStorage.setItem(CONSENT_KEY, VALID);
    act(() =>
      root!.render(
        <div className="appShell">
          <ConsentSettingsPanel />
          <CookieConsent />
        </div>
      )
    );
    activate(byText("Cookie preferences"));
    activate(byText("Privacy notice"));
    expect(policy(), "the policy is open over the card").not.toBeNull();

    act(() => byText("Essential only").click());
    expect(card(), "settled and closed").toBeNull();

    activate(byText("Cookie preferences"));
    expect(card(), "reopened from Settings").not.toBeNull();
    expect(policy(), "CLEAN through the settings direction too").toBeNull();
    expect(dialogs().length, "one dialog, not two").toBe(1);
  });

  it("enumerates the card's closing surface, so a fourth route cannot be added unseen", () => {
    // A guard over the ROUTE CLASS itself rather than over one member: if a
    // control is added to the card footer, this case names it and fails, which
    // is what the rework's two pins cannot do.
    act(() => root!.render(<CookieConsent />));
    activate(byText("Choose what to store"));

    const labels = [...document.querySelectorAll<HTMLButtonElement>(".consentCardFooter button")]
      .map((b) => b.textContent?.trim())
      .sort();
    expect(labels, "the card footer's three controls").toEqual([
      "Essential only",
      "Privacy notice",
      "Save choices"
    ]);
    // Plus the scrim (backdrop) and the shared helper's dismiss key: five ways
    // out, three of which close the card while a policy could stand over it.
    expect(
      document.querySelector(".consentScrim"),
      "the backdrop is the fourth way out"
    ).not.toBeNull();
  });

  it("the reset covers ANY route, because openCard is the only entry to the card surface", () => {
    // Property, stated structurally rather than per-route: whatever closed the
    // previous card, the next card can only arrive through `openCard`, so the
    // reset there is total. Driven here through a MIXED pair of exits, on ONE
    // mounted tree throughout — no re-render, so no remount can launder the flag.
    act(() =>
      root!.render(
        <div className="appShell">
          <ConsentSettingsPanel />
          <CookieConsent />
        </div>
      )
    );

    // exit A: dismissal by backdrop, under an open policy
    activate(byText("Choose what to store"));
    activate(byText("Privacy notice"));
    const scrim = document.querySelector<HTMLElement>(".consentScrim")!;
    act(() => scrim.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(bar(), "the bar returns — nothing stored").not.toBeNull();

    // exit B: settle by Essential only, under an open policy, on the NEXT open
    activate(byText("Choose what to store"));
    expect(policy(), "the second open is clean before we touch anything").toBeNull();
    activate(byText("Privacy notice"));
    act(() => byText("Essential only").click());
    expect(card(), "settled").toBeNull();

    // and the third open, through Settings this time — same component instance
    activate(byText("Cookie preferences"));
    expect(card(), "third open").not.toBeNull();
    expect(policy(), "still clean after two different stranding exits").toBeNull();
    expect(dialogs().length, "one dialog").toBe(1);
  });
});
