// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setPathname } from "next/navigation";

/**
 * Spec 2026-10-05 §2.18: no page of ours carries a card form any more (NETOPIA's page is NETOPIA's own site), so the
 * card pages keep the site's normal policy and the top bar moves client-side there like everywhere else. `next/link`
 * is stubbed with a marker (the file the UI package resolves).
 */
vi.mock("../../apps/ui/node_modules/next/link.js", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => (
    <a data-client-navigation="next/link" {...props}>{children}</a>
  )
}));
vi.mock("@/lib/api", () => ({ contractClient: { readSession: async () => ({ session_id: "synthetic-authenticated" }) } }));

import { TopBar } from "../../apps/ui/components/TopBar.js";

let root: Root | undefined;
beforeEach(()=>vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true));
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();vi.unstubAllGlobals();});
async function render(pathname: string): Promise<Document> {
  setPathname(pathname);
  const host=document.createElement("div");document.body.append(host);root=createRoot(host);
  await act(async()=>{root!.render(<TopBar />);for(let turn=0;turn<4;turn++)await Promise.resolve();});
  const trigger=document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  expect(trigger).not.toBeNull();await act(async()=>trigger!.click());
  return document;
}

function linkByText(document: Document, label: string): HTMLAnchorElement | undefined {
  return [...document.querySelectorAll<HTMLAnchorElement>("a")]
    .find(link => link.textContent?.replace(/\s+/gu, " ").trim() === label);
}

/** The four links once the account menu is open: the brand, the menu's Account and Security, and New debate. */
function topBarLinks(document: Document): readonly (HTMLAnchorElement | null | undefined)[] {
  return [
    document.querySelector<HTMLAnchorElement>('a.brand[aria-label="Dialectical Engine — home"]'),
    linkByText(document, "Account"),
    linkByText(document, "+ New debate"),
    document.querySelector<HTMLAnchorElement>('a[role="menuitem"][href="/settings/security"]')
  ];
}

describe("N19 the card pages' top bar is the site's own", () => {
  it.each(["/checkout", "/checkout/return", "/settings/card", "/", "/settings", "/new", "/pricing"])(
    "renders the same top bar on %s: brand and New debate move client-side, the account menu's exits load a document",
    async pathname => {
      const document = await render(pathname);
      const [brand, account, newDebate, security] = topBarLinks(document);

      expect(document.querySelector(".topBar")).not.toBeNull();
      expect(brand?.getAttribute("href")).toBe("/");
      expect(account?.getAttribute("href")).toBe("/settings");
      expect(newDebate?.getAttribute("href")).toBe("/new");
      expect(security?.getAttribute("href")).toBe("/settings/security");
      expect(document.querySelectorAll("a").length).toBe(4);
      // No card page is special any more (spec 2026-10-05 §2.18): the brand and New debate use next/link everywhere.
      expect([brand, newDebate].every(link => link?.getAttribute("data-client-navigation") === "next/link")).toBe(true);
      // The account menu's exits are always full-document navigations (dev's account menu), on every page.
      expect([account, security].every(link => link?.getAttribute("data-client-navigation") === null)).toBe(true);
    }
  );
});
