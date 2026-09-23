// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";
import { openSurfaceCount } from "../../apps/ui/components/consent/modalSemantics.js";

/**
 * The CROSS-SLICE integration suite (`COMMON.md` §10.53): both slices' surfaces in ONE
 * document, mounted in the order `apps/ui/app/layout.tsx:45-49` composes them — page content
 * (which on `/sign-up` is `SignUpFlow`, and its policy modal renders INLINE inside it,
 * `SignUpFlow.tsx:339-347`) and then `<CookieConsent />`.
 *
 * Promoted from the blind reviewer's own fixture,
 * `.hermes/reports/consent-ui/probes/code-rev-s02-c9-r1-crossslice.probe.test.tsx`
 * (CODE-REV-S02-C9 r1, finding B1). Changes from that file, all declared: the `LANE`
 * environment variable becomes `process.cwd()`, which is where the acceptance command runs
 * (same idiom as `consent-policy-link.test.tsx:29`); the `@/…` specifiers become the
 * `../../apps/ui/….js` form every other suite in `tests/render/` uses; P4 carries the
 * assertions the reviewer's REMEDY names instead of a `console.log`; P6 and P7 are rewritten
 * to the mechanism and the outcome this commit ships. P1, P2, P3 and P5 are the reviewer's.
 *
 * Why this file exists at all: nine clusters of this mission ran without one test mounting both
 * slices together, and B1 — one `Escape` closing the cookie card UNDERNEATH the open sign-up
 * policy — lived in exactly that gap.
 */

const CSS = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/**
 * `PrivacyPolicyModal`'s scroll gate reads these three metrics, and jsdom reports 0 for all of
 * them. Stubbed on the prototype and scoped to `.policyBody`, so the gate sees a scrollable
 * region that is NOT yet at its end.
 */
const KEYS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
const METRICS: Record<string, number> = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
function stub(): void {
  for (const k of KEYS)
    Object.defineProperty(HTMLElement.prototype, k, {
      configurable: true,
      get(this: HTMLElement): number {
        return this.classList.contains("policyBody") ? METRICS[k]! : 0;
      }
    });
}
function unstub(): void {
  for (const k of KEYS) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  stub();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container = null;
  document.body.replaceChildren();
  unstub();
  vi.unstubAllGlobals();
  localStorage.clear();
  expect(openSurfaceCount(), "no surface leaked out of this case").toBe(0);
});

const labelled = (label: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => b.textContent?.trim() === label
  );
  expect(found.length, `expected exactly one control labelled ${label}`).toBe(1);
  return found[0]!;
};
const dialogs = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
const card = (): HTMLElement | null => document.querySelector<HTMLElement>(".consentCard");
const policy = (): HTMLElement | null => document.querySelector<HTMLElement>(".policyBezel");
const bar = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="region"][aria-label="Cookie consent"]');
const privacyBox = (): HTMLInputElement =>
  document.querySelector<HTMLInputElement>('input[name="privacy-accepted"]')!;
const press = (key: string): void => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};
const activate = (b: HTMLButtonElement): void => {
  act(() => {
    b.focus();
    b.click();
  });
};

/** BOTH slices mounted in ONE document, the way `layout.tsx:45-49` composes them. */
async function mountBoth(): Promise<void> {
  const client = { register: vi.fn(), resendVerification: vi.fn() };
  await act(async () => {
    root!.render(
      <div className="appShell">
        <SignUpFlow client={client} />
        <CookieConsent />
      </div>
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("cross-slice integration — both consent surfaces in one document", () => {
  it("P1 · both slices' surfaces coexist in one document", async () => {
    await mountBoth();
    expect(document.querySelectorAll(".consentGroup .consentRow").length, "S02 rows").toBe(3);
    expect(bar(), "S01 cookie bar").not.toBeNull();
    expect(dialogs().length, "no dialog open at rest").toBe(0);
  });

  it("P2 · the Esc STACK: cookie card open + policy from `Privacy notice` -> Esc closes ONLY the policy", async () => {
    await mountBoth();
    activate(labelled("Choose what to store"));
    expect(card(), "the cookie preferences card must be open").not.toBeNull();
    activate(labelled("Privacy notice"));
    expect(policy(), "the policy must be open over the card").not.toBeNull();
    expect(dialogs().length, "two surfaces open").toBe(2);

    press("Escape");

    expect(policy(), "Escape closes the policy").toBeNull();
    expect(card(), "and the card underneath STAYS open").not.toBeNull();
    expect(dialogs().length, "exactly one surface left").toBe(1);

    press("Escape");
    expect(card(), "a second Escape closes the card").toBeNull();
  });

  it("P3 · the S01 card asks for READ mode; the sign-up card asks for CONSENT mode", async () => {
    await mountBoth();
    activate(labelled("Choose what to store"));
    activate(labelled("Privacy notice"));
    const readButtons = [...document.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(readButtons, "read mode: a Close, and NO `I have read it`").toContain("Close");
    expect(readButtons).not.toContain("I have read it");
    press("Escape");
    press("Escape");

    await act(async () => {
      privacyBox().click();
    });
    const consentButtons = [...document.querySelectorAll("button")].map((b) =>
      b.textContent?.trim()
    );
    expect(consentButtons, "consent mode: `I have read it` present").toContain("I have read it");
    expect(consentButtons, "consent mode: no bare `Close` label").not.toContain("Close");
    press("Escape");
  });

  /**
   * P4 — THE BINDING CASE (CODE-REV-S02-C9 r1 B1, ticket `t_cde7254d`).
   *
   * PROPERTY: `Escape` reaches the surface the visitor most recently OPENED, which on this page
   * is the one painted on top (`--z-policy-card: 78` over `--z-consent-card: 76`,
   * `globals.css:93-94`) — never the surface underneath it.
   *
   * This is the arrangement no single-slice suite can reach. `<CookieConsent />` is mounted
   * AFTER `{children}` (`layout.tsx:45-49`) while the sign-up policy renders inside them, so the
   * cookie card is LATER in document order and HIGHER on the screen is the policy. Ranking by
   * `compareDocumentPosition` — the mechanism at base `bd314084` — hands `Escape` to the card:
   * the visitor loses the category choices they were making, the bar flashes back underneath,
   * and the policy they are reading stays open with focus trapped inside it.
   */
  it("P4 · one Escape closes the sign-up policy, not the cookie card underneath it", async () => {
    await mountBoth();
    expect(openSurfaceCount(), "nothing is open at rest").toBe(0);

    activate(labelled("Choose what to store"));
    expect(card(), "the cookie preferences card is open").not.toBeNull();
    expect(openSurfaceCount(), "one surface on the stack").toBe(1);

    await act(async () => {
      privacyBox().click();
    });
    expect(policy(), "the sign-up policy is open OVER the card").not.toBeNull();
    expect(openSurfaceCount(), "two surfaces on the stack").toBe(2);
    expect(dialogs().length, "two dialogs in the document").toBe(2);

    press("Escape");

    expect(openSurfaceCount(), "(i) exactly one surface consumed the Escape: 2 -> 1").toBe(1);
    expect(card(), "(ii) the cookie card the visitor was filling in is STILL open").not.toBeNull();
    expect(bar(), "(ii) so the cookie bar has NOT come back underneath").toBeNull();
    expect(policy(), "(iii) the policy — the surface on top — is the one that closed").toBeNull();
    expect(dialogs().length, "exactly one dialog left").toBe(1);

    press("Escape");
    expect(openSurfaceCount(), "a second Escape closes the card").toBe(0);
  });

  it("P5 · the MERGED stylesheet resolves both families with no shared selector", () => {
    // The suite already runs in jsdom, so the ambient document IS the parser.
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);
    const sheet = document.styleSheets[document.styleSheets.length - 1]!;
    const rules = [...(sheet.cssRules as unknown as CSSRule[])];
    const sel = (r: CSSRule): string =>
      (r as unknown as { selectorText?: string }).selectorText ?? "";
    const has = (s: string): boolean =>
      rules.some((r) =>
        sel(r)
          .split(",")
          .map((x) => x.trim())
          .includes(s)
      );
    for (const s of [
      ".consentBar",
      ".consentCard",
      ".policyScrim",
      ".consentGroup",
      ".consentBox",
      ".consentPolicyLink"
    ]) {
      expect(has(s), `the merged sheet must carry a rule for ${s}`).toBe(true);
    }
    expect(rules.length, "the merged sheet parsed into rules").toBeGreaterThan(500);
    style.remove();
  });

  /**
   * P6 — the MECHANISM pin, and P4's mirror image.
   *
   * The reviewer built this case as the control that discriminated document order from open
   * order: with the two surfaces opened the OTHER way round, ranking by document position gives
   * `Escape` to the cookie card in BOTH orders, which is what proved the winner was not the
   * last-opened surface. Under V-20 (b) the answer is no longer the same in both orders — it is
   * the surface opened LAST in each of them. Here that surface is the cookie card, so the
   * ASSERTIONS below are unchanged from the reviewer's fixture and only their reason moved;
   * P4 is the same pair in the opposite order and expects the opposite surface. Neither case
   * alone pins open order — the PAIR does, and a helper that ranks by document position, or by
   * the FIRST registered entry, fails one of the two.
   */
  it("P6 · with the policy opened FIRST, Escape closes the cookie card — the one opened LAST", async () => {
    await mountBoth();
    await act(async () => {
      privacyBox().click(); // the sign-up policy FIRST
    });
    expect(policy(), "the sign-up policy is open").not.toBeNull();
    activate(labelled("Choose what to store")); // the cookie card SECOND
    expect(card(), "the cookie card is open").not.toBeNull();
    expect(dialogs().length, "two surfaces open").toBe(2);

    press("Escape");

    expect(card(), "the cookie card — opened last — is the one that closed").toBeNull();
    expect(policy(), "and the policy, opened first, is STILL open").not.toBeNull();
    expect(openSurfaceCount(), "exactly one surface consumed the Escape").toBe(1);

    press("Escape");
  });

  /**
   * P7 — what the visitor is left with, asserted rather than logged.
   *
   * The reviewer's version recorded the DEFECT's aftermath (the bar back, the policy still
   * trapping focus). This one records the shipped outcome: the surface that closes is the one
   * the visitor was last in, their unsaved category choices survive underneath, and focus
   * returns to the control that opened the policy — the privacy checkbox in the sign-up card,
   * which is still on the page.
   */
  it("P7 · the closed policy returns focus to its own opener and leaves the card's state alone", async () => {
    const switches = (): HTMLElement[] => [
      ...document.querySelectorAll<HTMLElement>('.consentCard [role="switch"]')
    ];
    const checked = (): string[] =>
      switches().map((control) => control.getAttribute("aria-checked") ?? "");

    await mountBoth();
    activate(labelled("Choose what to store"));
    expect(switches().length, "the card's three category switches are present").toBe(3);
    const [, quality] = switches() as [HTMLElement, HTMLElement, HTMLElement];
    act(() => quality.click()); // an UNSAVED choice, which is what the defect discarded
    const before = checked();

    await act(async () => {
      privacyBox().click();
    });
    press("Escape");

    expect(policy(), "the policy closed").toBeNull();
    expect(card(), "the card is still there").not.toBeNull();
    expect(bar(), "the bar has not come back underneath it").toBeNull();
    expect(checked(), "and the visitor's unsaved category choices are untouched").toEqual(before);
    expect(document.activeElement, "focus returns to the control that opened the policy").toBe(
      privacyBox()
    );

    press("Escape");
  });
});
