// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFocusFixup } from "./kbd-focus-fixup.js";

/**
 * Keyboard-only check (2026-10-17, re-checked 2026-10-22): the sensitive-data consent screen opens
 * from a press of Start, and Start is disabled while the screen is up. The browser has already
 * dropped focus to the page by the time the screen opens, so the modal helper captures `<body>` as
 * the opener and, with nothing else named, closing left focus on the page. Every way out that
 * keeps the person on the page — "I don't agree", Escape — puts them back in the question, where
 * they can edit it. "I agree" goes on to start the debate, so it needs no focus work of its own.
 */

const mocks = vi.hoisted(() => ({
  createDebate: vi.fn(),
  validateSession: vi.fn(),
  readSession: vi.fn(),
  readSensitiveDataConsent: vi.fn(),
  giveSensitiveDataConsent: vi.fn(),
  push: vi.fn()
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stubs/next-navigation.js")>()),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie-session",
  createDebate: mocks.createDebate,
  validateSession: mocks.validateSession,
  contractClient: {
    readSession: mocks.readSession,
    readSensitiveDataConsent: mocks.readSensitiveDataConsent,
    giveSensitiveDataConsent: mocks.giveSensitiveDataConsent
  }
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => ReactNode }) => children("test-token")
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));

import NewDebatePage from "../../apps/ui/app/new/NewDebatePageClient.js";
import { LibraryComposer } from "../../apps/ui/components/LibraryComposer.js";

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalogue = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
const QUESTION = "Should a state church be disestablished?";

let root: Root | null = null;
let uninstallFocusFixup: (() => void) | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

async function mount(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  await settle();
  return container;
}

async function type(field: HTMLTextAreaElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    setter!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

/** A keyboard press: focus first, then the activation a press of Enter or Space fires. */
async function press(element: Element | null | undefined): Promise<void> {
  expect(element).toBeInstanceOf(HTMLElement);
  await act(async () => (element as HTMLElement).focus());
  await act(async () => (element as HTMLElement).click());
  await settle();
}

async function escape(): Promise<void> {
  await act(async () => {
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await settle();
}

const dialog = () => document.querySelector("[data-dialog='sensitive-data-consent']");
const declineButton = () => dialog()?.querySelector<HTMLButtonElement>(".sensitiveConsentDecline");

async function openFromHomeStart(): Promise<HTMLElement> {
  const catalog = Object.freeze({ ...catalogue("en", "home"), ...catalogue("en", "chrome") });
  const container = await mount(
    <LibraryComposer catalog={catalog} newDebateCatalog={catalogue("en", "newDebate")} locale="en" />
  );
  await type(container.querySelector<HTMLTextAreaElement>("#library-claim")!, QUESTION);
  const start = container.querySelector<HTMLButtonElement>(".libStart")!;
  await press(start);
  expect(dialog(), "the screen is open").not.toBeNull();
  expect(start.disabled, "Start is disabled while the screen is up").toBe(true);
  return container;
}

async function openFromNewStart(): Promise<HTMLElement> {
  const container = await mount(
    <NewDebatePage
      catalog={catalogue("en", "newDebate")}
      homeCatalog={catalogue("en", "home")}
      chromeCatalog={catalogue("en", "chrome")}
      locale="en"
    />
  );
  await type(container.querySelector<HTMLTextAreaElement>("#topic")!, QUESTION);
  const start = container.querySelector<HTMLButtonElement>(".ndStart")!;
  await press(start);
  expect(dialog(), "the screen is open").not.toBeNull();
  expect(start.disabled, "Start is disabled while the screen is up").toBe(true);
  return container;
}

function expectFocusOn(element: Element | null): void {
  expect(element).not.toBeNull();
  expect(document.activeElement, "focus is not dropped to the page").not.toBe(document.body);
  expect(document.activeElement).toBe(element);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  uninstallFocusFixup = installFocusFixup();
  mocks.createDebate.mockReset().mockResolvedValue({ id: "run-1" });
  mocks.validateSession.mockReset().mockResolvedValue(undefined);
  mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable in render test"));
  mocks.readSensitiveDataConsent.mockReset().mockResolvedValue({ status: "required" });
  mocks.giveSensitiveDataConsent.mockReset().mockResolvedValue({ status: "given" });
  mocks.push.mockReset();
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  uninstallFocusFixup?.();
  uninstallFocusFixup = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("keyboard: the consent screen opened from the home composer's Start", () => {
  it("\"I don't agree\" puts focus back in the question", async () => {
    const container = await openFromHomeStart();
    await press(declineButton());
    expect(dialog()).toBeNull();
    expectFocusOn(container.querySelector("#library-claim"));
  });

  it("Escape puts focus back in the question", async () => {
    const container = await openFromHomeStart();
    await escape();
    expect(dialog()).toBeNull();
    expectFocusOn(container.querySelector("#library-claim"));
  });
});

describe("keyboard: the consent screen opened from /new's Start", () => {
  it("\"I don't agree\" puts focus back in the question", async () => {
    const container = await openFromNewStart();
    await press(declineButton());
    expect(dialog()).toBeNull();
    expect(mocks.createDebate).not.toHaveBeenCalled();
    expectFocusOn(container.querySelector("#topic"));
  });

  it("Escape puts focus back in the question", async () => {
    const container = await openFromNewStart();
    await escape();
    expect(dialog()).toBeNull();
    expectFocusOn(container.querySelector("#topic"));
  });
});
