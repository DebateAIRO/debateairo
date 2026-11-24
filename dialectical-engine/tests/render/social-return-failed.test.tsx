// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { mount, unmount } from "./task11-harness.js";

/**
 * A return from a sign-in company that did not complete (cancelled there, stale, refused, provider off) lands on
 * /login?social=failed (apps/ui/app/v1/auth/social/[provider]/callback/route.ts). The sign-in page then says so
 * next to the company buttons, in the words a failed start already uses.
 */
const client = () => ({ beginLogin: vi.fn(), completeLogin: vi.fn(), beginSocialLogin: vi.fn(),
  authProviders: vi.fn().mockResolvedValue({ providers: [{ id: "google", name: "Google" }] }) });
const SAID = "Sign-in could not be completed.";
afterEach(() => { window.history.replaceState(null, "", "/login"); });

async function page(address: string) {
  window.history.replaceState(null, "", address);
  const mounted = await mount(<LoginFlow client={client() as any} />);
  await act(async () => { await Promise.resolve(); });
  return mounted;
}

it("says sign-in could not be completed after a failed return", async () => {
  const { host, root } = await page("/login?social=failed");
  try {
    expect(host.querySelector(".authSocial [role=alert]")?.textContent).toBe(SAID);
    expect(host.textContent).toContain("Continue with Google");
  } finally { await unmount(root, host); }
});

it.each(["/login", "/login?social=other", "/login?next=%2Fnew"])("says nothing of it on %s", async address => {
  const { host, root } = await page(address);
  try {
    expect(host.textContent).toContain("Continue with Google");
    expect(host.textContent).not.toContain(SAID);
  } finally { await unmount(root, host); }
});
