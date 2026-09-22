// @vitest-environment jsdom

/**
 * CODE-REV-CROSS-02 r1 — the REVIEWER's own fixture, built from the CLAIM, not from the
 * author's test file (`heartbeat-reviewer` §2).
 *
 * The claim under review: at c334136d, `Escape` reaches the surface the visitor opened LAST
 * (the last registered stack entry whose container is `null` or still connected), and on
 * `/sign-up` that discharges CODE-REV-S02-C9 r1 B1.
 *
 * Every selector below was read out of the PRODUCT source, not out of any test:
 *   CookieBar.tsx:47      `.consentBar` role=region aria-label="Cookie consent"
 *   CookieBar.tsx:72      the `Choose what to store` control
 *   CookiePreferencesCard.tsx:142-143  `.consentCard` role=dialog
 *   CookiePreferencesCard.tsx:207      the `Privacy notice` control
 *   PrivacyPolicyModal.tsx:162-163     `.policyBezel` role=dialog
 *   SignUpFlow.tsx:287-291             `.consentRow` carrying `input[name=privacy-accepted]`
 *   layout.tsx:47-49                   TopBar, {children}, <CookieConsent /> — the mount order
 */

import { act, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "@/components/SignUpFlow";
import { CookieConsent } from "@/components/consent/CookieConsent";
import { openSurfaceCount, useModalSurface } from "@/components/consent/modalSemantics";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** jsdom reports 0 for all three scroll metrics; the policy's gate reads them. */
const KEYS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
const METRICS: Record<string, number> = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
function stubScrollMetrics(): void {
  for (const k of KEYS)
    Object.defineProperty(HTMLElement.prototype, k, {
      configurable: true,
      get(this: HTMLElement): number {
        return this.classList.contains("policyBody") ? METRICS[k]! : 0;
      }
    });
}
function unstubScrollMetrics(): void {
  for (const k of KEYS) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  stubScrollMetrics();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  host = null;
  document.body.replaceChildren();
  unstubScrollMetrics();
  vi.unstubAllGlobals();
  localStorage.clear();
  expect(openSurfaceCount(), "the stack must be empty between cases").toBe(0);
});

const button = (label: string): HTMLButtonElement => {
  const hits = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => b.textContent?.trim() === label
  );
  expect(hits.length, `exactly one control labelled ${label}`).toBe(1);
  return hits[0]!;
};
const consentCard = (): HTMLElement | null => document.querySelector(".consentCard");
const policyBezel = (): HTMLElement | null => document.querySelector(".policyBezel");
const cookieBar = (): HTMLElement | null =>
  document.querySelector('[role="region"][aria-label="Cookie consent"]');
const privacyCheckbox = (): HTMLInputElement =>
  document.querySelector<HTMLInputElement>('input[name="privacy-accepted"]')!;
const dialogCount = (): number => document.querySelectorAll('[role="dialog"]').length;
const escape = (): void => {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
  });
};
const press = (b: HTMLButtonElement): void => {
  act(() => {
    b.focus();
    b.click();
  });
};

/** `layout.tsx:47-49`'s composition: page content first, `<CookieConsent />` LAST. */
async function mountSignUpPage(): Promise<void> {
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

/** The S01-only page: `<CookieConsent />` with no sign-up card on it. */
async function mountCookieOnly(): Promise<void> {
  await act(async () => {
    root!.render(
      <div className="appShell">
        <CookieConsent />
      </div>
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("CODE-REV-CROSS-02 r1 — the Esc stack at c334136d", () => {
  it("R1 · /sign-up: card open, then the sign-up policy, ONE Escape closes the POLICY (B1)", async () => {
    await mountSignUpPage();
    expect(openSurfaceCount(), "nothing open at rest").toBe(0);

    press(button("Choose what to store"));
    expect(consentCard(), "the cookie card opened").not.toBeNull();
    expect(openSurfaceCount(), "one surface registered").toBe(1);

    await act(async () => {
      privacyCheckbox().click();
    });
    expect(policyBezel(), "the sign-up policy opened over the card").not.toBeNull();
    expect(openSurfaceCount(), "two surfaces registered").toBe(2);
    expect(dialogCount()).toBe(2);

    escape();

    expect(openSurfaceCount(), "(i) 2 -> 1: exactly one surface consumed the key").toBe(1);
    expect(policyBezel(), "(iii) the policy — opened last — is the one that closed").toBeNull();
    expect(consentCard(), "(ii) the cookie card underneath SURVIVED").not.toBeNull();
    expect(cookieBar(), "(ii) so the bar did NOT come back underneath").toBeNull();

    escape();
    expect(openSurfaceCount(), "a second Escape closes the card").toBe(0);
  });

  it("R2 · /sign-up, opened the OTHER way round: ONE Escape closes the CARD", async () => {
    await mountSignUpPage();
    await act(async () => {
      privacyCheckbox().click(); // policy FIRST
    });
    expect(policyBezel()).not.toBeNull();
    press(button("Choose what to store")); // card SECOND
    expect(consentCard()).not.toBeNull();
    expect(openSurfaceCount()).toBe(2);

    escape();

    expect(consentCard(), "the card — opened last — closed").toBeNull();
    expect(policyBezel(), "the policy, opened first, is still open").not.toBeNull();
    expect(openSurfaceCount()).toBe(1);
    escape();
  });

  it("R3 · S01 alone: card + `Privacy notice` policy, ONE Escape closes only the policy", async () => {
    await mountCookieOnly();
    press(button("Choose what to store"));
    expect(consentCard()).not.toBeNull();
    press(button("Privacy notice"));
    expect(policyBezel()).not.toBeNull();
    expect(openSurfaceCount()).toBe(2);

    escape();

    expect(policyBezel(), "the policy closed").toBeNull();
    expect(consentCard(), "the card stayed").not.toBeNull();
    expect(cookieBar(), "the bar stayed away").toBeNull();
    expect(openSurfaceCount()).toBe(1);
    escape();
  });

  it("R7 · after the policy closes on /sign-up, focus is back on the privacy checkbox", async () => {
    await mountSignUpPage();
    press(button("Choose what to store"));
    const switches = (): HTMLElement[] => [
      ...document.querySelectorAll<HTMLElement>('.consentCard [role="switch"]')
    ];
    const state = (): string[] => switches().map((s) => s.getAttribute("aria-checked") ?? "");
    expect(switches().length, "the card's category switches").toBe(3);
    act(() => switches()[1]!.click()); // an UNSAVED choice
    const before = state();

    await act(async () => {
      privacyCheckbox().click();
    });
    escape();

    expect(policyBezel()).toBeNull();
    expect(consentCard()).not.toBeNull();
    expect(state(), "the unsaved category choices survived").toEqual(before);
    // eslint-disable-next-line no-console
    console.log(
      `R7 focus after the policy closed: <${document.activeElement?.tagName}` +
        ` name=${(document.activeElement as HTMLInputElement | null)?.name ?? "-"}` +
        ` class=${document.activeElement?.className || "-"}>`
    );
    expect(document.activeElement, "focus returned to the control that opened it").toBe(
      privacyCheckbox()
    );
    escape();
  });
});

/* ------------------------------------------------------------------------------------ *
 * Synthetic surfaces — the shapes the product does not have, built on the real helper.  *
 * ------------------------------------------------------------------------------------ */

function Surface({
  open = true,
  name,
  onClose,
  renderContainer = true,
  children
}: Readonly<{
  open?: boolean;
  name: string;
  onClose: () => void;
  renderContainer?: boolean;
  children?: ReactNode;
}>): ReactNode {
  const containerRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  useModalSurface(open, { containerRef, initialFocusRef, onClose });
  if (!open || !renderContainer) return null;
  return (
    <div
      data-surface={name}
      ref={(node) => {
        containerRef.current = node;
      }}
    >
      <button
        type="button"
        ref={(node) => {
          initialFocusRef.current = node;
        }}
      >
        {`close-${name}`}
      </button>
      {children}
    </div>
  );
}

describe("CODE-REV-CROSS-02 r1 — shapes the product does not have", () => {
  it("R4 · a nested PAIR mounted in ONE commit hands Escape to the OUTER surface", async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    await act(async () => {
      root!.render(
        <Surface name="outer" onClose={outer}>
          <Surface name="inner" onClose={inner} />
        </Surface>
      );
    });
    expect(openSurfaceCount()).toBe(2);

    escape();

    // eslint-disable-next-line no-console
    console.log(`R4 single-commit nested pair: outer=${outer.mock.calls.length} inner=${inner.mock.calls.length}`);
    expect(outer, "the OUTER surface answered — React runs effects child-first").toHaveBeenCalledTimes(1);
    expect(inner, "the inner surface did not").toHaveBeenCalledTimes(0);

    await act(async () => root!.render(<></>));
  });

  it("R5 · the walk skips EVERY detached entry above the live one", async () => {
    const closed: string[] = [];
    const rec = (n: string) => () => closed.push(n);
    const refs: Record<string, { current: HTMLElement | null }> = {};

    function Detaching({ name, mounted }: { name: string; mounted: boolean }): ReactNode {
      const containerRef = useRef<HTMLElement | null>(null);
      const initialFocusRef = useRef<HTMLElement | null>(null);
      refs[name] = containerRef;
      useModalSurface(true, { containerRef, initialFocusRef, onClose: rec(name) });
      if (!mounted) return null;
      return (
        <div
          data-surface={name}
          ref={(node) => {
            containerRef.current = node;
            return () => {};
          }}
        >
          <button
            type="button"
            ref={(node) => {
              initialFocusRef.current = node;
            }}
          >
            {`close-${name}`}
          </button>
        </div>
      );
    }

    function Harness({ mounted }: { mounted: boolean }): ReactNode {
      return (
        <>
          <Surface name="live" onClose={rec("live")} />
          <Detaching name="d1" mounted={mounted} />
          <Detaching name="d2" mounted={mounted} />
        </>
      );
    }

    await act(async () => root!.render(<Harness mounted />));
    expect(openSurfaceCount()).toBe(3);
    await act(async () => root!.render(<Harness mounted={false} />));
    expect(openSurfaceCount(), "the detached surfaces stay registered").toBe(3);
    for (const n of ["d1", "d2"]) {
      expect(refs[n]!.current, `${n} still holds its container ref`).not.toBeNull();
      expect(refs[n]!.current!.isConnected, `${n} has left the document`).toBe(false);
    }

    escape();

    expect(closed, "only the live surface answered").toEqual(["live"]);
    await act(async () => root!.render(<></>));
  });

  it("R6 · an entry whose container is NULL still receives Escape", async () => {
    const withContainer = vi.fn();
    const withoutContainer = vi.fn();
    await act(async () => {
      root!.render(
        <>
          <Surface name="has-container" onClose={withContainer} />
          <Surface name="no-container" onClose={withoutContainer} renderContainer={false} />
        </>
      );
    });
    expect(openSurfaceCount()).toBe(2);
    expect(document.querySelector('[data-surface="no-container"]')).toBeNull();

    escape();

    expect(withoutContainer, "the null-container entry, registered last, answered").toHaveBeenCalledTimes(1);
    expect(withContainer).toHaveBeenCalledTimes(0);
    await act(async () => root!.render(<></>));
  });
});
