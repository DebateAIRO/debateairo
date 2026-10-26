// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { installFocusFixup } from "./kbd-focus-fixup.js";

/**
 * Keyboard-only check (2026-10-17, re-checked 2026-10-22): the crisis screen can open after the
 * API refused the ask as a crisis. Start was disabled while that request ran, so the browser had
 * already dropped focus to the page and the modal helper captured `<body>` as the opener: with
 * nothing else named, "Back to my question" and Escape left focus on the page. Both now put the
 * person back in the question. When the screen opens from the pre-check, Start was never disabled,
 * so closing still returns to Start itself.
 */

const mocks = vi.hoisted(() => ({
  createDebate: vi.fn(),
  validateSession: vi.fn(),
  readSession: vi.fn(),
  readSensitiveDataConsent: vi.fn(),
  giveSensitiveDataConsent: vi.fn(),
  getAskRoom: vi.fn(),
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
    giveSensitiveDataConsent: mocks.giveSensitiveDataConsent,
    getAskRoom: mocks.getAskRoom
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
const CRISIS = "Should I kill myself?";
/** Passes the client's pre-check; the API is what refuses it in these cases. */
const POLICY = "Should assisted suicide be legal?";

const crisisRefusal = () => new ContractHttpError(
  "UNPROCESSABLE", 422, "CRISIS_SUPPORT_OFFERED: CRISIS_SUPPORT_OFFERED", "CRISIS_SUPPORT_OFFERED"
);

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

const crisisDialog = () => document.querySelector("[data-dialog='crisis-support']");
const backButton = () => crisisDialog()?.querySelector<HTMLButtonElement>(".crisisSupportBack");

function expectFocusOn(element: Element | null): void {
  expect(element).not.toBeNull();
  expect(document.activeElement, "focus is not dropped to the page").not.toBe(document.body);
  expect(document.activeElement).toBe(element);
}

async function mountHome(question: string): Promise<HTMLElement> {
  const catalog = Object.freeze({ ...catalogue("en", "home"), ...catalogue("en", "chrome") });
  const container = await mount(
    <LibraryComposer catalog={catalog} newDebateCatalog={catalogue("en", "newDebate")} locale="en" crisisCountryHint="RO" />
  );
  await type(container.querySelector<HTMLTextAreaElement>("#library-claim")!, question);
  return container;
}

/** /new, its Start pressed for a question the API then refuses as a crisis. */
async function openFromNewRefusal(): Promise<HTMLElement> {
  mocks.createDebate.mockRejectedValue(crisisRefusal());
  const container = await mount(
    <NewDebatePage
      catalog={catalogue("en", "newDebate")}
      homeCatalog={catalogue("en", "home")}
      chromeCatalog={catalogue("en", "chrome")}
      locale="en"
      crisisCountryHint="RO"
    />
  );
  await type(container.querySelector<HTMLTextAreaElement>("#topic")!, POLICY);
  await press(container.querySelector(".ndStart"));
  expect(mocks.createDebate, "the ask was sent and refused").toHaveBeenCalledTimes(1);
  expect(crisisDialog(), "the screen is open").not.toBeNull();
  return container;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  uninstallFocusFixup = installFocusFixup();
  mocks.createDebate.mockReset().mockResolvedValue({ id: "run-1" });
  mocks.validateSession.mockReset().mockResolvedValue(undefined);
  mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable in render test"));
  mocks.readSensitiveDataConsent.mockReset().mockResolvedValue({ status: "given" });
  mocks.giveSensitiveDataConsent.mockReset().mockResolvedValue({ status: "given" });
  mocks.getAskRoom.mockReset().mockRejectedValue(new Error("no room in render test"));
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

describe("keyboard: the crisis screen opened after /new's ask was refused", () => {
  it("\"Back to my question\" puts focus back in the question", async () => {
    const container = await openFromNewRefusal();
    await press(backButton());
    expect(crisisDialog()).toBeNull();
    expectFocusOn(container.querySelector("#topic"));
  });

  it("Escape puts focus back in the question", async () => {
    const container = await openFromNewRefusal();
    await escape();
    expect(crisisDialog()).toBeNull();
    expectFocusOn(container.querySelector("#topic"));
  });
});

describe("keyboard: the crisis screen on the home composer", () => {
  it("opened after a refusal, \"Back to my question\" puts focus back in the question", async () => {
    mocks.validateSession.mockRejectedValue(crisisRefusal());
    const container = await mountHome(POLICY);
    await press(container.querySelector(".libStart"));
    expect(crisisDialog(), "the screen is open").not.toBeNull();
    await press(backButton());
    expect(crisisDialog()).toBeNull();
    expectFocusOn(container.querySelector("#library-claim"));
  });

  it("opened by the pre-check from Start, which stays enabled, closing returns to Start", async () => {
    const container = await mountHome(CRISIS);
    const start = container.querySelector<HTMLButtonElement>(".libStart")!;
    await press(start);
    expect(crisisDialog(), "the screen is open").not.toBeNull();
    expect(start.disabled).toBe(false);
    await escape();
    expect(crisisDialog()).toBeNull();
    expectFocusOn(start);
  });
});
