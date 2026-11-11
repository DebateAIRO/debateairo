// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * WHOLE-14 (the wave-2 checks, 4 Nov; W2L-7): one render of the real ask page with its real header (V4Header and its
 * V4AccountMenu), so the header's "Sign in" and the step-1 buttons are compared on the page itself, never through a copied
 * address or the source text. Only the session gate, the ask hook and the contract reads are stood in.
 */
const gate = vi.hoisted(() => ({ session: "OUT" as "CHECKING" | "IN" | "OUT" }));
const server = vi.hoisted(() => ({
  level: Promise.resolve({ reading_level: null }) as Promise<{ reading_level: string | null }>,
  sessionReads: 0,
  emailReads: 0,
  usageReads: 0
}));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: string) => ReactNode }) => children(gate.session) }));
// V4 start step, Task 70b: no notice shows, so it never says one question already waits (sentence D).
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null, alreadyWaitingShown: () => false }));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: () => ({
    planTier: "premium", freePublicNotice: false, room: null, submitting: false, dialogs: null,
    submit: async () => ({ kind: "STOPPED" }), ensureConsent: async () => true, flagsCrisis: () => false
  })
}));
vi.mock("@/lib/api", () => ({
  validateSession: async () => { server.sessionReads += 1; throw new Error("SESSION_REQUIRED"); },
  contractClient: {
    readAnswerIndex: async () => ({ items: [], open_runs: [], limit: 32, offset: 0, total: 0 }),
    readDigLinks: async () => ({ parent: null, children: [] }),
    readReadingLevel: () => server.level,
    saveReadingLevel: async () => ({ reading_level: "plain" }),
    clarifyAsk: async () => ({ source: "NONE" }),
    readSession: async () => { server.sessionReads += 1; throw new Error("SESSION_REQUIRED"); },
    readAccountEmail: async () => { server.emailReads += 1; throw new Error("SESSION_REQUIRED"); },
    getBillingUsage: async () => { server.usageReads += 1; throw new Error("404: billing off"); },
    logout: async () => undefined,
    revokeAllSessions: async () => ({ revoked: 0 })
  }
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(initialLevel: "plain" | null): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4AskClient catalog={CATALOG} homeCatalog={messages("home")} newDebateCatalog={messages("newDebate")} billingCatalog={{}}
      locale="en" crisisCountryHint={null} initialQuestion="Should the city fund the tram line?" initialLevel={initialLevel} />
  ));
  await act(async () => { for (let turn = 0; turn < 8; turn += 1) await Promise.resolve(); });
  return host;
}

beforeEach(() => {
  gate.session = "OUT";
  server.level = Promise.resolve({ reading_level: null });
  server.sessionReads = 0;
  server.emailReads = 0;
  server.usageReads = 0;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.replaceChildren();
});

describe("WHOLE-14: the ask page's header Sign in and its step-1 buttons carry the same way back", () => {
  for (const [address, initialLevel] of [["/v4?level=plain&topic=trams", "plain"], ["/v4?topic=trams", null]] as const) {
    it(`${address} (level ${initialLevel ?? "not chosen"}): the header's Sign in is exactly each step-1 button's address`, async () => {
      window.history.replaceState(null, "", address);
      const page = await mount(initialLevel);
      const signIn = page.querySelector<HTMLAnchorElement>(".v4Hdr .v4HdrAccount a")!;
      expect(signIn.textContent).toBe(CATALOG["v4.ask.signIn"]);
      const links = [...page.querySelectorAll<HTMLAnchorElement>(".v4AskActions a")];
      expect(links.map((link) => link.textContent)).toEqual([CATALOG["v4.ask.continue"], CATALOG["v4.ask.justAnswer"]]);
      for (const link of links) expect(link.getAttribute("href")).toBe(signIn.getAttribute("href"));
      // The way back is this page, with the level only when the person chose one (R2REG-5).
      expect(signIn.getAttribute("href")).toBe(`/login?next=${encodeURIComponent(address)}`);
      // A stranger: nothing of the account or the quota is read, and the page's own session answer is used.
      expect(server.sessionReads).toBe(0);
      expect(server.emailReads).toBe(0);
      expect(server.usageReads).toBe(0);
      expect(page.querySelector(".v4HdrQuotaHold")).toBeNull();
    });
  }

  it("ask-f16 with the wave-2 checks (W2L-1 / W2L-8): while the page still checks, the quota's place and the account button's are held together", async () => {
    gate.session = "CHECKING";
    window.history.replaceState(null, "", "/v4?topic=trams");
    const page = await mount(null);
    const right = page.querySelector(".v4HdrRight")!;
    expect(right.querySelector(".v4HdrQuotaHold")).not.toBeNull();
    expect(right.querySelector(".v4HdrAccount")).not.toBeNull();
    expect(right.querySelector(".v4HdrAccount a, .v4HdrAccount button")).toBeNull();
    expect(server.usageReads).toBe(0);
    expect(server.sessionReads).toBe(0);
  });
});
