// @vitest-environment jsdom
/**
 * CODE-REV-S02-C9 r1 — MY OWN cross-slice integration fixture, built from the CLAIM and not
 * from any author test. Both slices' surfaces in ONE document at the merged head.
 * LANE from the env; nothing is written into the lane.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "@/components/SignUpFlow";
import { CookieConsent } from "@/components/consent/CookieConsent";
import { openSurfaceCount } from "@/components/consent/modalSemantics";

const LANE = process.env.LANE!;
const CSS = readFileSync(resolve(LANE, "apps/ui/app/globals.css"), "utf8");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

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
  root = null; container = null;
  document.body.replaceChildren();
  unstub();
  vi.unstubAllGlobals();
  localStorage.clear();
  expect(openSurfaceCount(), "no surface leaked out of this case").toBe(0);
});

const labelled = (label: string): HTMLButtonElement => {
  const f = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => b.textContent?.trim() === label
  );
  expect(f.length, `expected exactly one control labelled ${label}`).toBe(1);
  return f[0]!;
};
const dialogs = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
const card = (): HTMLElement | null => document.querySelector<HTMLElement>(".consentCard");
const policy = (): HTMLElement | null => document.querySelector<HTMLElement>(".policyBezel");
const press = (key: string): void => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};
const activate = (b: HTMLButtonElement): void => { act(() => { b.focus(); b.click(); }); };

/** BOTH slices mounted in ONE document, the way the app composes them. */
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
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe("CODE-REV-S02-C9 r1 — cross-slice integration at the merged head", () => {
  it("P1 · both slices' surfaces coexist in one document", async () => {
    await mountBoth();
    expect(document.querySelectorAll(".consentGroup .consentRow").length, "S02 rows").toBe(2);
    expect(
      document.querySelector('[role="region"][aria-label="Cookie consent"]'),
      "S01 cookie bar"
    ).not.toBeNull();
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
    press("Escape"); press("Escape");

    const privacyBox = document.querySelector<HTMLInputElement>('input[name="privacy-accepted"]')!;
    await act(async () => { privacyBox.click(); });
    const consentButtons = [...document.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(consentButtons, "consent mode: `I have read it` present").toContain("I have read it");
    expect(consentButtons, "consent mode: no bare `Close` label").not.toContain("Close");
    press("Escape");
  });

  it("P4 · one Escape with BOTH the cookie card and the sign-up policy open moves exactly one surface", async () => {
    const snap = (tag: string): void => {
      const labels = dialogs().map(
        (d) => `${d.className || "(no class)"}|aria-label=${d.getAttribute("aria-label") ?? "-"}|labelledby=${d.getAttribute("aria-labelledby") ?? "-"}`
      );
      // eslint-disable-next-line no-console
      console.log(`P4 ${tag}: openSurfaceCount=${openSurfaceCount()} dialogs=${dialogs().length} card=${card() !== null} policyBezel=${policy() !== null} :: ${JSON.stringify(labels)}`);
    };
    await mountBoth();
    snap("00 mounted");
    activate(labelled("Choose what to store"));
    snap("01 card opened");
    const privacyBox = document.querySelector<HTMLInputElement>('input[name="privacy-accepted"]')!;
    await act(async () => { privacyBox.click(); });
    snap("02 sign-up policy opened");
    press("Escape");
    snap("03 after ONE Escape");
    expect(dialogs().length, "exactly ONE surface consumed the Escape").toBe(1);
    press("Escape");
    snap("04 after a second Escape");
  });


  /* P6 — ROOT-CAUSE CONTROL. If the winner were decided by OPEN ORDER (LIFO), opening the
     sign-up policy FIRST and the cookie card SECOND would make the card consume Escape, and
     the reverse order (P4) would make the policy consume it. It is decided by DOCUMENT ORDER
     instead (`modalSemantics.ts:105-127`), so BOTH orders give Escape to the cookie card —
     which on `/sign-up` is the surface UNDERNEATH (`--z-consent-card: 76` vs
     `--z-policy-card: 78`, globals.css:93-94) because `layout.tsx:46-49` mounts
     `<CookieConsent />` AFTER `{children}`. */
  it("P6 · the winner is document order, not open order: the card takes Escape in BOTH orders", async () => {
    await mountBoth();
    const privacyBox = document.querySelector<HTMLInputElement>('input[name="privacy-accepted"]')!;
    await act(async () => { privacyBox.click(); });          // sign-up policy FIRST
    expect(policy(), "the sign-up policy is open").not.toBeNull();
    activate(labelled("Choose what to store"));               // cookie card SECOND
    expect(card(), "the cookie card is open").not.toBeNull();
    expect(dialogs().length).toBe(2);

    press("Escape");

    // eslint-disable-next-line no-console
    console.log(`P6 after ONE Escape (policy opened FIRST): card=${card() !== null} policyBezel=${policy() !== null}`);
    expect(policy(), "the policy — the surface painted on top — is STILL open").not.toBeNull();
    expect(card(), "and the cookie card underneath is the one that closed").toBeNull();
    press("Escape");
  });

  /* P7 — what the visitor is left with after the wrong surface closes. */
  it("P7 · the cookie bar returns underneath while the policy still holds the focus trap", async () => {
    await mountBoth();
    activate(labelled("Choose what to store"));
    const privacyBox = document.querySelector<HTMLInputElement>('input[name="privacy-accepted"]')!;
    await act(async () => { privacyBox.click(); });
    press("Escape");
    const bar = document.querySelector('[role="region"][aria-label="Cookie consent"]');
    // eslint-disable-next-line no-console
    console.log(`P7 after the wrong close: policyOpen=${policy() !== null} cookieBarBack=${bar !== null} activeElement=${document.activeElement?.className || document.activeElement?.tagName}`);
    expect(policy(), "the policy the visitor is looking at is still open").not.toBeNull();
    press("Escape");
  });

  it("P5 · the MERGED stylesheet resolves both families with no shared selector", () => {
    // The probe already runs in jsdom, so the ambient document IS the parser.
    // (A bare `jsdom` import cannot resolve from a scratchpad-rooted runner — see my
    //  TOOLING-TRAPS append; the aliased specifiers resolve, bare package names do not.)
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);
    const sheet = document.styleSheets[document.styleSheets.length - 1]!;
    const rules = [...(sheet.cssRules as unknown as CSSRule[])];
    const sel = (r: CSSRule): string => (r as unknown as { selectorText?: string }).selectorText ?? "";
    const has = (s: string): boolean => rules.some((r) => sel(r).split(",").map((x) => x.trim()).includes(s));
    for (const s of [".consentBar", ".consentCard", ".policyScrim", ".consentGroup", ".consentBox", ".consentPolicyLink"]) {
      expect(has(s), `the merged sheet must carry a rule for ${s}`).toBe(true);
    }
    expect(rules.length, "the merged sheet parsed into rules").toBeGreaterThan(500);
    style.remove();
  });
});
