// @vitest-environment jsdom
/*
 * Design Document v2 (3a): the top bar's identity pill. It shows the account's own pseudonym when the account read
 * carries one, with its first letter on the round face; the button's name then holds the name it shows. A read
 * without a pseudonym leaves the generic word, and the face shows the first letter of the address and nothing else of it.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setPathname } from "next/navigation";

const account = vi.hoisted(() => ({ read: (): Promise<unknown> => Promise.reject(new Error("unset")) }));
vi.mock("@/lib/api", () => ({ contractClient: {
  readSession: () => Promise.resolve({ session_id: "synthetic" }),
  readAccountEmail: () => account.read(),
  logout: async () => {}
} }));

import { TopBar } from "../../apps/ui/components/TopBar.js";

let root: Root | undefined;
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); });

async function renderBar(): Promise<HTMLElement> {
  setPathname("/");
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(<TopBar />); for (let turn = 0; turn < 8; turn++) await Promise.resolve(); });
  return host;
}
const pill = (host: HTMLElement) => host.querySelector<HTMLButtonElement>("button.topBarIdentity");

describe("the top bar's identity pill", () => {
  it("shows the account's pseudonym, its first letter on the face, and names the button with it", async () => {
    account.read = () => Promise.resolve({ email: "maria@example.com", recovery_email: null, pending: null, pseudonym: "CobaltFalcon4821" });
    const host = await renderBar();
    expect(pill(host)?.querySelector(".topBarIdentityName")?.textContent).toBe("CobaltFalcon4821");
    expect(pill(host)?.querySelector(".topBarIdentityFace")?.textContent).toBe("C");
    expect(pill(host)?.getAttribute("aria-label")).toBe("Account: CobaltFalcon4821");
    expect(pill(host)?.textContent).not.toContain("maria");
  });

  it("keeps the generic word when the read carries no pseudonym, and shows only the address's first letter", async () => {
    account.read = () => Promise.resolve({ email: "maria@example.com", recovery_email: null, pending: null });
    const host = await renderBar();
    expect(pill(host)?.querySelector(".topBarIdentityName")?.textContent).toBe("Account");
    expect(pill(host)?.querySelector(".topBarIdentityFace")?.textContent).toBe("M");
    expect(pill(host)?.getAttribute("aria-label")).toBe("Account");
  });

  it("leaves a plain face and the generic word when the read fails", async () => {
    account.read = () => Promise.reject(new Error("EMAIL_CHANGE_UNAVAILABLE"));
    const host = await renderBar();
    expect(pill(host)?.querySelector(".topBarIdentityName")?.textContent).toBe("Account");
    expect(pill(host)?.querySelector(".topBarIdentityFace")?.textContent).toBe("");
    expect(pill(host)?.getAttribute("aria-label")).toBe("Account");
  });
});
