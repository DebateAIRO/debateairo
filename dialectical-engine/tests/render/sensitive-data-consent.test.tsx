// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";

/**
 * Sensitive-data consent (V's ruling of 2026-09-29): before the first debate a person starts,
 * the screen asks once. Agree, and the debate starts. Decline, and it does not; the screen
 * comes back the next time. Both places a debate starts — the home composer and /new — ask.
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
const HOME_EN = catalogue("en", "home");
const QUESTION = "Should a state church be disestablished?";

const consentRefusal = () => new ContractHttpError(
  "FORBIDDEN", 403, "SENSITIVE_DATA_CONSENT_REQUIRED: SENSITIVE_DATA_CONSENT_REQUIRED", "SENSITIVE_DATA_CONSENT_REQUIRED"
);

let root: Root | null = null;

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

async function click(element: Element | null): Promise<void> {
  expect(element).not.toBeNull();
  await act(async () => (element as HTMLElement).click());
  await settle();
}

const dialog = () => document.querySelector("[data-dialog='sensitive-data-consent']");
const agreeButton = () => dialog()?.querySelector<HTMLButtonElement>(".policyPrimary") ?? null;
const declineButton = () => dialog()?.querySelector<HTMLButtonElement>(".sensitiveConsentDecline") ?? null;

async function startFromHome(locale = "en"): Promise<HTMLElement> {
  const catalog = Object.freeze({ ...catalogue(locale, "home"), ...catalogue(locale, "chrome") });
  const container = await mount(
    <LibraryComposer catalog={catalog} newDebateCatalog={catalogue(locale, "newDebate")} locale={locale} />
  );
  await type(container.querySelector<HTMLTextAreaElement>("#library-claim")!, QUESTION);
  await click(container.querySelector(".libStart"));
  return container;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("the home composer asks before the first debate", () => {
  it("shows the screen instead of starting the debate", async () => {
    await startFromHome();
    expect(dialog()).not.toBeNull();
    expect(dialog()?.getAttribute("role")).toBe("dialog");
    expect(dialog()?.textContent).toContain(HOME_EN["home.sensitiveConsent.title"]);
    expect(dialog()?.textContent).toContain(HOME_EN["home.sensitiveConsent.statement"]);
    expect(mocks.createDebate).not.toHaveBeenCalled();
  });

  it("agreeing records the consent in the interface language, then starts the debate", async () => {
    await startFromHome("ro");
    await click(agreeButton());
    expect(mocks.giveSensitiveDataConsent).toHaveBeenCalledWith("ro");
    expect(dialog()).toBeNull();
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/debate/run-1");
  });

  it("declining starts nothing, keeps what was typed, and says why", async () => {
    const container = await startFromHome();
    await click(declineButton());
    expect(dialog()).toBeNull();
    expect(mocks.giveSensitiveDataConsent).not.toHaveBeenCalled();
    expect(mocks.createDebate).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(container.querySelector(".sensitiveConsentDeclined")?.textContent)
      .toBe(HOME_EN["home.sensitiveConsent.declined"]);
    expect(container.querySelector<HTMLTextAreaElement>("#library-claim")?.value).toBe(QUESTION);
    expect(container.querySelector<HTMLButtonElement>(".libStart")?.disabled).toBe(false);
  });

  it("asks again on the next attempt after a decline", async () => {
    const container = await startFromHome();
    await click(declineButton());
    await click(container.querySelector(".libStart"));
    expect(dialog()).not.toBeNull();
  });

  it("Escape declines; it never agrees on the person's behalf", async () => {
    await startFromHome();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(dialog()).toBeNull();
    expect(mocks.giveSensitiveDataConsent).not.toHaveBeenCalled();
    expect(mocks.createDebate).not.toHaveBeenCalled();
  });

  it("keeps the screen open and says so when the answer cannot be saved", async () => {
    mocks.giveSensitiveDataConsent.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "down"));
    await startFromHome();
    await click(agreeButton());
    expect(dialog()).not.toBeNull();
    expect(dialog()?.querySelector("[role='alert']")?.textContent).toBe(HOME_EN["home.sensitiveConsent.failed"]);
    expect(mocks.createDebate).not.toHaveBeenCalled();
  });

  it("does not show the screen to an account that already agreed", async () => {
    mocks.readSensitiveDataConsent.mockResolvedValue({ status: "given" });
    await startFromHome();
    expect(dialog()).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith("/debate/run-1");
  });

  it("shows the screen when the server refuses the debate for want of consent", async () => {
    mocks.readSensitiveDataConsent.mockResolvedValue({ status: "given" });
    mocks.createDebate.mockRejectedValueOnce(consentRefusal()).mockResolvedValueOnce({ id: "run-2" });
    await startFromHome();
    expect(dialog()).not.toBeNull();
    await click(agreeButton());
    expect(mocks.createDebate).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenCalledWith("/debate/run-2");
  });
});

describe("/new asks before the first debate too", () => {
  async function startFromNew(): Promise<HTMLElement> {
    const container = await mount(
      <NewDebatePage
        catalog={catalogue("en", "newDebate")}
        homeCatalog={HOME_EN}
        chromeCatalog={catalogue("en", "chrome")}
        locale="en"
      />
    );
    await type(container.querySelector<HTMLTextAreaElement>("#topic")!, QUESTION);
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
    return container;
  }

  it("declining starts nothing and says why", async () => {
    const container = await startFromNew();
    expect(dialog()).not.toBeNull();
    await click(declineButton());
    expect(mocks.createDebate).not.toHaveBeenCalled();
    expect(container.querySelector(".sensitiveConsentDeclined")?.textContent)
      .toBe(HOME_EN["home.sensitiveConsent.declined"]);
  });

  it("agreeing starts the debate", async () => {
    await startFromNew();
    await click(agreeButton());
    expect(mocks.giveSensitiveDataConsent).toHaveBeenCalledWith("en");
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/debate/run-1?starting=1");
  });
});
