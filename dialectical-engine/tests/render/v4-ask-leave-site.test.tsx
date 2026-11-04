// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * V4 screen review, 3 Nov (journey-d4 A): before Next, the browser's own "Leave site?" protects the words typed in the
 * question box (a reload or a closed tab). Words a reload brings back (the question the address carried) are not at risk,
 * and after Next the step-2 card is the start-step's (its draft kept with the account is server work, not tonight).
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: (token: string) => React.ReactNode }) => children("token") }));
// A signed-in person (a signed-out visitor's Next goes to sign in instead: tests/render/v4-ask-step-one.test.tsx).
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: string) => React.ReactNode }) => children("IN") }));
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
vi.mock("@/lib/api", () => ({ contractClient: { readAnswerIndex: async () => ({ items: [], open_runs: [] }), clarifyAsk: async () => ({ source: "NONE" }) } }));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: () => ({ planTier: "premium", submit: async () => ({ kind: "STOPPED" }), ensureConsent: async () => true, flagsCrisis: () => false, room: null, submitting: false, dialogs: null })
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(initialQuestion: string): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <V4AskClient catalog={CATALOG} homeCatalog={{}} newDebateCatalog={messages("newDebate")} billingCatalog={{}} locale="en" crisisCountryHint={null}
      initialQuestion={initialQuestion} initialLevel="plain" />
  ));
  return host;
}

async function type(area: HTMLTextAreaElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(area, value);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Whether the browser would ask "Leave site?" now. */
function asksBeforeLeaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("V4 step 1: the browser's own \"Leave site?\" before Next", () => {
  it("asks once words are typed, and not for an empty box", async () => {
    const page = await mount("");
    expect(asksBeforeLeaving()).toBe(false);
    await type(page.querySelector("textarea")!, "Should my town build a heat pump network?");
    expect(asksBeforeLeaving()).toBe(true);
    await type(page.querySelector("textarea")!, "   ");
    expect(asksBeforeLeaving()).toBe(false);
  });

  it("does not ask for the words the address brought (a reload brings them back), only for a change", async () => {
    const page = await mount("Should Romania build more nuclear plants?");
    expect(asksBeforeLeaving()).toBe(false);
    await type(page.querySelector("textarea")!, "Should Romania build more nuclear plants by 2040?");
    expect(asksBeforeLeaving()).toBe(true);
  });

  it("stops asking once Next is pressed (step 2 is the start-step's)", async () => {
    const page = await mount("");
    await type(page.querySelector("textarea")!, "Should my town build a heat pump network?");
    await act(async () => [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === CATALOG["v4.ask.continue"])!.click());
    await act(async () => undefined);
    expect(asksBeforeLeaving()).toBe(false);
  });
});
