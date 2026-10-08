// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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

import { TopBar } from "../../apps/ui/components/TopBar.js";

describe("N19 the card pages' top bar is the site's own", () => {
  it.each(["/checkout", "/checkout/return", "/settings/card", "/settings"])("uses client-side links on %s", (pathname) => {
    setPathname(pathname);
    const document = new DOMParser().parseFromString(renderToStaticMarkup(<TopBar />), "text/html");
    const links = [...document.querySelectorAll("a")];
    expect(links.length).toBe(4);
    expect(links.every((link) => link.getAttribute("data-client-navigation") === "next/link")).toBe(true);
  });
});
