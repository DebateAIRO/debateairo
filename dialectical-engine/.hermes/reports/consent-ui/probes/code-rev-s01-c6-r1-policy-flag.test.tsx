// @vitest-environment jsdom

/**
 * REVIEWER PROBE — CODE-REV-S01-C6 round 1.
 *
 * Subject: the `setPolicyOpen(false)` the author DELETED from `openCard`
 * (declared unpinnable, mutant M8 = `11 passed (11)`).
 *
 * The author's justification is quoted in `CookieConsent.tsx:83-87`: "while the
 * policy is open it is the topmost surface, it owns the keystroke, and ITS SCRIM
 * COVERS EVERY CONTROL OF THE CARD". The first two clauses are code and hold.
 * The third is a CSS claim, and this probe exists because that CSS does not
 * exist in this lane: `apps/ui/app/globals.css` at HEAD contains ONE delimited
 * block (`=== consent-ui S01 ===`) and no `.policyScrim` / `.policyBezel` rule
 * at all — S02 has declared the z-index tokens' consumers but written no
 * stylesheet yet.
 *
 * So this measures the pointer route the missing rule would otherwise block,
 * and records what the NEXT open shows.
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
const dialogs = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
const consentScrim = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(".consentScrim");

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

describe("REVIEWER PROBE — the deleted setPolicyOpen(false) in openCard", () => {
  it("RECORDS the source fact the author's justification rests on: no .policyScrim rule exists", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");
    const policyRules = css.split("\n").filter((line) => /^\s*\.policy[A-Za-z]*\s*[,{]/.test(line));
    expect(policyRules, "S02 has written no policy stylesheet in this lane").toEqual([]);
    expect(css.includes("=== consent-ui S02 ==="), "and no S02 delimited block").toBe(false);
    // The tokens S01-C1 declared FOR that stylesheet do exist, which is what
    // makes this "not written yet" rather than "not intended".
    expect(css, "the z-index tokens are declared and unconsumed").toContain("--z-policy-scrim:");
  });

  it("a click on the CARD's scrim while the policy is open closes the card and STRANDS the flag", () => {
    act(() => root!.render(<CookieConsent />));
    activate(byText("Choose what to store"));
    activate(byText("Privacy notice"));
    expect(policy(), "the policy is open over the card").not.toBeNull();

    // The route: a pointer click landing ON the card's own scrim. In the shipped
    // browser this is prevented ONLY by a `.policyScrim { position: fixed; inset: 0;
    // z-index: var(--z-policy-scrim) }` rule that does not exist yet.
    const scrim = consentScrim()!;
    act(() => scrim.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(card(), "the card is dismissed through backdropCloseHandler").toBeNull();
    expect(policy(), "and the policy element unmounts with it").toBeNull();

    // The flag lives in CookieConsent, which is STILL MOUNTED. Reopen the card.
    activate(byText("Choose what to store"));

    expect(card(), "the card is open again").not.toBeNull();
    // This is the observable consequence of the deleted line.
    expect(
      policy(),
      "STRANDED FLAG: the policy comes back with a card the visitor opened fresh"
    ).not.toBeNull();
    expect(dialogs().length, "two dialogs on a first-open card").toBe(2);
  });

  it("same stranding through the SETTINGS entry, reached programmatically", () => {
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
    activate(byText("Cookie preferences"));
    activate(byText("Privacy notice"));
    expect(policy()).not.toBeNull();

    // `Save choices` is behind the policy visually, but it is in the document and
    // enabled. Any route that settles the card while the policy is open strands
    // the flag identically.
    act(() => byText("Save choices").click());
    expect(card(), "the card settled and closed").toBeNull();

    activate(byText("Cookie preferences"));
    expect(card(), "reopened from Settings").not.toBeNull();
    expect(policy(), "STRANDED FLAG again, through a different route").not.toBeNull();
  });

  it("CONTROL: with the policy closed the normal way, a reopened card is clean", () => {
    act(() => root!.render(<CookieConsent />));
    activate(byText("Choose what to store"));
    activate(byText("Privacy notice"));
    activate(byText("Close"));
    expect(policy()).toBeNull();

    const scrim = consentScrim()!;
    act(() => scrim.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(card()).toBeNull();

    activate(byText("Choose what to store"));
    expect(card()).not.toBeNull();
    expect(policy(), "no policy — the one onClose route cleared the flag").toBeNull();
    expect(dialogs().length).toBe(1);
  });
});
