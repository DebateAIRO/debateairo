// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import newDebateEnglish from "../../apps/ui/messages/en/newDebate.json" with { type: "json" };

/*
 * public-f13 (owner screen review, 3 Nov): a signed-out person who opens a link to a V4 debate (or its report) is sent to sign in with the way back to
 * that page, from its address only, and sign-in accepts it, so they land where the link pointed.
 */
vi.mock("@/lib/api", async (original) => ({
  ...await original<Record<string, unknown>>(),
  validateSession: async () => { throw new Error("no session"); }
}));

import { AuthGate } from "../../apps/ui/components/AuthGate.js";
import { safeReturnPath } from "../../apps/ui/lib/returnPath.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const RUN = "99999999-9999-4999-8999-999999999999";
let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  window.history.replaceState(null, "", "/");
});

async function signInLinkAt(address: string): Promise<string> {
  window.history.replaceState(null, "", address);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(<AuthGate catalog={newDebateEnglish}>{() => <p>inside</p>}</AuthGate>); });
  await act(async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); });
  const link = [...host.querySelectorAll("a")].find((one) => one.textContent === newDebateEnglish["newDebate.continueToSignIn"])!;
  return link.getAttribute("href")!;
}

describe("signing in from a V4 page comes back to it", () => {
  it.each([
    [`/v4/debate/${RUN}?level=plain`],
    [`/v4/debate/${RUN}/report`]
  ])("%s", async (address) => {
    const href = await signInLinkAt(address);
    expect(href).toBe(`/login?next=${encodeURIComponent(address)}`);
    expect(host!.textContent).not.toContain("inside");
    // Sign-in takes it as it is.
    expect(safeReturnPath(new URL(href, "https://example.test").searchParams.get("next"))).toBe(address);
  });

  it("a fragment never travels in the way back", async () => {
    const href = await signInLinkAt(`/v4/debate/${RUN}#private`);
    expect(href).toBe(`/login?next=${encodeURIComponent(`/v4/debate/${RUN}`)}`);
  });
});
