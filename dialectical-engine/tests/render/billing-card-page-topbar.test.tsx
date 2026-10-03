// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { setPathname } from "next/navigation";

/**
 * P2-I14 (Part 2's final review): the three card pages are the only documents that carry xMoney's looser policy
 * (AMENDMENTS-R1 A11, `isCardFormPath`). A browser keeps a document's policy for as long as the document lives, so a
 * client-side (`next/link`) move from a card page to /settings would carry that policy, and xMoney's loaded script,
 * into the page where the password and the 2-step code are typed. On a card page every top-bar link must therefore be
 * a plain `<a>` (a full document load). `next/link` is stubbed with a marker so a test can tell the two apart; the
 * stub names the file the UI package resolves, because `next` is installed for apps/ui only and a bare "next/link"
 * from this folder would stub nothing.
 */
vi.mock("../../apps/ui/node_modules/next/link.js", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => (
    <a data-client-navigation="next/link" {...props}>{children}</a>
  )
}));

import { TopBar } from "../../apps/ui/components/TopBar.js";

const CARD_PATHS = ["/checkout", "/checkout/return", "/settings/card"] as const;

function render(pathname: string): Document {
  setPathname(pathname);
  return new DOMParser().parseFromString(renderToStaticMarkup(<TopBar />), "text/html");
}

function linkByText(document: Document, label: string): HTMLAnchorElement | undefined {
  return [...document.querySelectorAll<HTMLAnchorElement>("a")]
    .find(link => link.textContent?.replace(/\s+/gu, " ").trim() === label);
}

/** The four top-bar links: the brand, Account, New debate and the gear. */
function topBarLinks(document: Document): readonly (HTMLAnchorElement | null | undefined)[] {
  return [
    document.querySelector<HTMLAnchorElement>('a.brand[aria-label="Dialectical Engine — home"]'),
    linkByText(document, "Account"),
    linkByText(document, "+ New debate"),
    document.querySelector<HTMLAnchorElement>('a[aria-label="Settings"]')
  ];
}

describe("P2-I14 — the card pages' top bar leaves by a full document load", () => {
  it.each(CARD_PATHS)("renders every top-bar link on %s as a plain <a>, the brand included", pathname => {
    const document = render(pathname);
    const [brand, account, newDebate, gear] = topBarLinks(document);

    expect(document.querySelector(".topBar")).not.toBeNull();
    expect(brand?.getAttribute("href")).toBe("/");
    expect(account?.getAttribute("href")).toBe("/settings");
    expect(newDebate?.getAttribute("href")).toBe("/new");
    expect(gear?.getAttribute("href")).toBe("/settings");
    expect(document.querySelectorAll("a").length).toBe(4);
    expect(document.querySelectorAll("[data-client-navigation]").length).toBe(0);
  });

  it.each(["/", "/settings", "/new", "/pricing", "/checkout/elsewhere", "/settings/cards"])(
    "keeps client-side links on %s, which carries no card-page policy (the stub is what tells them apart)",
    pathname => {
      const document = render(pathname);
      const links = topBarLinks(document);

      expect(links.every(link => link?.getAttribute("data-client-navigation") === "next/link")).toBe(true);
      expect(document.querySelectorAll("a:not([data-client-navigation])").length).toBe(0);
    }
  );
});
