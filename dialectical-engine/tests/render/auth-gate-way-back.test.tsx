// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * V4 screen review, 3 Nov (map-f6, wait-f1): a page behind AuthGate that finds the person signed out sends them to the
 * sign-in page WITH the way back (its path and query), so after signing in they land on the same question. The sign-in
 * page keeps only a path on this site (lib/returnPath.ts). While the session is checked, a page may show its own look
 * (the V4 map page's grey outline) instead of "Checking session…", through the legal check as well.
 */

const session = vi.hoisted(() => ({ settle: null as null | ((ok: boolean) => void) }));

vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie-session",
  validateSession: () => new Promise<void>((done, fail) => {
    session.settle = (ok: boolean) => (ok ? done() : fail(new Error("signed out")));
  })
}));
vi.mock("@/lib/ageConfirmation", () => ({ ageConfirmationRequired: async () => false, ageConfirmationHref: (next: string) => next }));
vi.mock("@/components/billing/LegalAcceptGate", () => ({
  LegalAcceptGate: ({ children, checkingView }: { children: ReactNode; checkingView?: ReactNode }) => (
    <div className="legalStandIn">{checkingView}{children}</div>
  )
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
  return host;
}

beforeEach(() => {
  session.settle = null;
  window.history.replaceState(null, "", "/v4/debate/11111111-1111-4111-8111-111111111111?path=n-renew&level=plain");
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("AuthGate", () => {
  it("shows the page's own look while the session is checked, and the old line when the page gives none", async () => {
    const { AuthGate } = await import("../../apps/ui/components/AuthGate.js");
    const page = await mount(
      <AuthGate catalog={{ "newDebate.checkingSession": "Checking session…" }} checkingView={<p className="outline">grey outline</p>}>
        {() => <p>inside</p>}
      </AuthGate>
    );
    expect(page.querySelector(".outline")?.textContent).toBe("grey outline");
    expect(page.textContent).not.toContain("Checking session…");
    await act(async () => root?.unmount());
    const plain = await mount(<AuthGate catalog={{ "newDebate.checkingSession": "Checking session…" }}>{() => <p>inside</p>}</AuthGate>);
    expect(plain.textContent).toContain("Checking session…");
  });

  it("signed out: the way to sign in carries the way back to this page, its question and level included", async () => {
    const { AuthGate } = await import("../../apps/ui/components/AuthGate.js");
    const page = await mount(<AuthGate catalog={{ "newDebate.continueToSignIn": "Continue to sign in" }}>{() => <p>inside</p>}</AuthGate>);
    await act(async () => session.settle?.(false));
    const link = page.querySelector("a")!;
    expect(link.textContent).toBe("Continue to sign in");
    expect(link.getAttribute("href")).toBe(
      `/login?next=${encodeURIComponent("/v4/debate/11111111-1111-4111-8111-111111111111?path=n-renew&level=plain")}`
    );
    expect(page.textContent).not.toContain("inside");
  });

  it("signed in: the page shows, and the legal check gets the same look while it reads", async () => {
    const { AuthGate } = await import("../../apps/ui/components/AuthGate.js");
    const page = await mount(<AuthGate checkingView={<p className="outline">grey outline</p>}>{() => <p>inside</p>}</AuthGate>);
    await act(async () => session.settle?.(true));
    expect(page.querySelector(".legalStandIn .outline")).not.toBeNull();
    expect(page.textContent).toContain("inside");
  });
});
