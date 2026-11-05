// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The owner's answers of 5 Nov 2026 (OPEN-OWNER-QUESTIONS-2026-11-04.md, "Your answers"):
 *   question 12 B  "Open in the classic view" is in the account menu only (journey-f19, "nowhere else"): the report page's
 *                  foot link and its small link under "Ask a new question" went, and the report header's round account
 *                  button now carries it, once, just above "Sign out".
 *   level ruling   the reading level is fixed for a debate: the report's links carry no ?level=, the menu's neither.
 * The real account menu, inside the report's own header row.
 */
vi.mock("@/lib/api", () => ({
  contractClient: {
    readSession: async () => ({ session_id: "synthetic" }),
    readAccountEmail: async () => ({ email: "maria@example.com", recovery_email: null, pending: null }),
    logout: async () => undefined,
    revokeAllSessions: async () => ({ revoked: 0 })
  }
}));

import { V4ReportHeader } from "../../apps/ui/components/v4/V4ReportHeader.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const RUN = "11111111-1111-4111-8111-111111111111";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => {
  window.history.replaceState(null, "", `/v4/debate/${RUN}/report`);
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.replaceChildren();
});

async function mount(props: Partial<Parameters<typeof V4ReportHeader>[0]> = {}): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4ReportHeader catalog={CATALOG} backHref={`/v4/debate/${RUN}`} level="plain" onLevel={() => undefined} share={[]} status={null} {...props} />
  ));
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  });
  return host;
}

const menuItems = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("[role=menu] [role=menuitem]")];
async function openMenu(): Promise<void> {
  await act(async () => document.querySelector<HTMLButtonElement>(".v4HdrAccountButton")!.click());
  expect(document.querySelector("[role=menu]")).not.toBeNull();
}

describe("the report header's account menu (owner 5 Nov)", () => {
  it("question 12 B: holds 'Open in the classic view' once, just above Sign out, to the debate's classic page", async () => {
    const node = await mount({ classicHref: `/debate/${RUN}` });
    // The row itself shows no classic link: only the menu does.
    expect(node.querySelector(`.v4RepHdr > a[href="/debate/${RUN}"]`)).toBeNull();
    await openMenu();
    const classic = [...document.querySelectorAll("[data-v4-menu=classic]")];
    expect(classic).toHaveLength(1);
    expect(classic[0]!.textContent).toBe(CATALOG["v4.common.classicView"]);
    expect(classic[0]!.getAttribute("href")).toBe(`/debate/${RUN}`);
    const items = menuItems();
    expect(items.at(-2)).toBe(classic[0]);
    expect(items.at(-1)!.textContent).toBe(CATALOG["v4.header.menu.signOut"]);
  });

  it("a header given no classic view (a report that cannot be found, or a caller that passes none) keeps the menu without it", async () => {
    await mount();
    await openMenu();
    expect(document.querySelector("[data-v4-menu=classic]")).toBeNull();
    await act(async () => root!.unmount());
    root = null;
    host?.remove();
    document.body.replaceChildren();
    await mount({ classicHref: null });
    await openMenu();
    expect(document.querySelector("[data-v4-menu=classic]")).toBeNull();
  });

  it("the level ruling: no menu link carries ?level=, whatever level the header still shows", async () => {
    await mount({ classicHref: `/debate/${RUN}`, level: "expert" });
    await openMenu();
    const hrefs = menuItems().map((item) => item.getAttribute("href")).filter((href): href is string => href !== null);
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((href) => href.includes("level="))).toEqual([]);
  });
});
