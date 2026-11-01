// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Decision 13: the notice shows before every Start press of a person the server named as Free, and only then; the ask then says it was shown. The hook is the
 * real one (only the server and the pop-ups are stood in), so what is proved is the fact itself: a Free room, a paid room, no plans (a local site), a dig.
 */
const server = vi.hoisted(() => ({
  room: null as null | Record<string, unknown>,
  createDebate: vi.fn(async (..._args: unknown[]) => ({ id: "11111111-1111-4111-8111-111111111111" }))
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: (token: string) => ReactNode }) => children("token") }));
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
vi.mock("@/components/SensitiveDataConsent", () => ({
  isSensitiveDataConsentRefusal: () => false,
  useSensitiveDataConsent: () => ({ ensureConsent: async () => true, declined: false, dialog: null })
}));
vi.mock("@/components/CrisisSupport", () => ({
  isCrisisSupportRefusal: () => false,
  useCrisisSupport: () => ({ offerIfCrisis: () => false, offer: () => undefined, flags: () => false, dialog: null })
}));
vi.mock("@/components/QuestionLanguageChoice", () => ({ useQuestionLanguageChoice: () => ({ ensureChoice: async () => "KEEP", dialog: null }) }));
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie",
  createDebate: (...args: unknown[]) => server.createDebate(...args),
  contractClient: {
    readAnswerIndex: async () => ({ items: [], open_runs: [] }),
    getAskRoom: async () => server.room,
    clarifyAsk: async () => ({ source: "NONE" }),
    readReadingLevel: async () => ({ reading_level: "plain" }),
    saveReadingLevel: async () => ({ reading_level: "plain" })
  }
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (locale: string, name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/${locale}/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("en", "v4");
const NOTICE = "On the Free plan your question and its debate are public. Don't include personal details.";
const room = (planId: string | null) => ({ room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: planId });

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(newDebateCatalog: Record<string, string> = messages("en", "newDebate")): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4AskClient catalog={CATALOG} homeCatalog={messages("en", "home")} newDebateCatalog={newDebateCatalog} billingCatalog={messages("en", "billing")}
      locale="en" crisisCountryHint={null} initialQuestion="Should the city fund the tram line?" initialLevel="plain" />
  ));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return host;
}
const notice = (): string | null => host!.querySelector(".v4AskPublicNotice")?.textContent ?? null;
const button = (name: string): HTMLButtonElement => [...host!.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(name))!;
const click = async (target: HTMLElement): Promise<void> => { await act(async () => { target.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(() => { server.createDebate.mockClear(); server.room = null; });
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
});

describe("the Free notice on the ask page", () => {
  it("a Free person reads it on both steps before pressing, and both presses send that it was shown", async () => {
    server.room = room("FREE");
    await mount();
    // Step 1 has a Start press of its own ("Just answer it"): the notice stands before it.
    expect(notice()).toBe(NOTICE);
    const shown = host!.querySelector(".v4AskPublicNotice")!;
    expect(shown.compareDocumentPosition(host!.querySelector(".v4AskActions")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click(button(CATALOG["v4.ask.continue"]!));
    expect(notice()).toBe(NOTICE);
    expect(host!.querySelector(".v4AskBar .v4AskPublicNotice")).not.toBeNull();
    await click(button(CATALOG["v4.read.start"]!));
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.createDebate.mock.calls[0]![7]).toEqual({ freePublicNotice: true });
  });

  it("step 1's own press sends it too", async () => {
    server.room = room("FREE");
    await mount();
    await click(button(CATALOG["v4.ask.justAnswer"]!));
    expect(server.createDebate.mock.calls[0]![7]).toEqual({ freePublicNotice: true });
  });

  it("a paid plan: no notice, no flag", async () => {
    server.room = room("PLUS");
    await mount();
    expect(notice()).toBeNull();
    await click(button(CATALOG["v4.ask.justAnswer"]!));
    expect(server.createDebate.mock.calls[0]?.[7]).toBeUndefined();
  });

  it("no plans (a local site), or a room read that failed: no notice, no flag, so nothing goes public unseen", async () => {
    server.room = room(null);
    await mount();
    expect(notice()).toBeNull();
    await click(button(CATALOG["v4.ask.justAnswer"]!));
    expect(server.createDebate.mock.calls[0]?.[7]).toBeUndefined();
    await act(async () => root?.unmount());
    host?.remove();
    server.createDebate.mockClear();
    server.room = null;
    await mount();
    expect(notice()).toBeNull();
    await click(button(CATALOG["v4.ask.justAnswer"]!));
    expect(server.createDebate.mock.calls[0]?.[7]).toBeUndefined();
  });

  it("the person's language: the catalogue's sentence, not the English", async () => {
    server.room = room("FREE");
    const ro = messages("ro", "newDebate");
    await mount(ro);
    expect(notice()).toBe(ro["newDebate.freePublicNotice"]);
    expect(notice()).not.toBe(NOTICE);
  });
});
