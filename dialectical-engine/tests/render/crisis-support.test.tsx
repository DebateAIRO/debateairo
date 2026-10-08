// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, warmCrisisCheck } from "@debateai/contract";

/**
 * Crisis check (V, 2026-09-30): a question that reads as a person in crisis gets help numbers,
 * never a debate. Both places a debate starts — the home composer and /new — check first,
 * before the session check and before the sensitive-data consent screen.
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
// Test numbers only: the screen's behaviour, not the directory's contents.
vi.mock("@/lib/crisisLineDirectory", () => ({
  CRISIS_LINES_CHECKED_AT: "2026-09-30",
  CRISIS_LINE_DIRECTORY: {
    RO: {
      emergency: "112",
      lines: [{
        name: "Test Line RO", phone: "0800 000 001", tel: "0800000001", sms: null, chatUrl: null,
        website: "https://example.test/ro", open247: true, hours: null, free: true, sourceUrl: "https://example.test/ro"
      }]
    },
    GB: {
      emergency: "999",
      lines: [{
        name: "Test Line GB", phone: "000 000", tel: "000000", sms: "85258", chatUrl: "https://example.test/chat",
        website: "https://example.test/gb", open247: true, hours: null, free: true, sourceUrl: "https://example.test/gb"
      }]
    }
  }
}));

import NewDebatePage from "../../apps/ui/app/new/NewDebatePageClient.js";
import { LibraryComposer } from "../../apps/ui/components/LibraryComposer.js";

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalogue = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
const HOME_EN = catalogue("en", "home");
const CRISIS = "Should I kill myself?";
const POLICY = "Should assisted suicide be legal?";
/** "I want to die", three letters: shorter than any debate question, still a crisis. */
const SHORT_CRISIS = "\u6211\u60f3\u6b7b";

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

const crisisDialog = () => document.querySelector("[data-dialog='crisis-support']");
/** The screen's text without the direction isolates that keep numbers left to right. */
const crisisText = () => (crisisDialog()?.textContent ?? "").replace(/[\u2066\u2069]/gu, "");
const consentDialog = () => document.querySelector("[data-dialog='sensitive-data-consent']");

async function startFromHome(question: string, countryHint: string | null = null): Promise<HTMLElement> {
  const catalog = Object.freeze({ ...catalogue("en", "home"), ...catalogue("en", "chrome") });
  const container = await mount(
    <LibraryComposer catalog={catalog} newDebateCatalog={catalogue("en", "newDebate")} locale="en" crisisCountryHint={countryHint} />
  );
  await type(container.querySelector<HTMLTextAreaElement>("#library-claim")!, question);
  await click(container.querySelector(".libStart"));
  return container;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.createDebate.mockReset().mockResolvedValue({ id: "run-1" });
  mocks.validateSession.mockReset().mockResolvedValue(undefined);
  mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable in render test"));
  mocks.readSensitiveDataConsent.mockReset().mockResolvedValue({ status: "given" });
  mocks.giveSensitiveDataConsent.mockReset().mockResolvedValue({ status: "given" });
  // No room unless a case sets one: the room read fails and the page asks as before.
  mocks.getAskRoom.mockReset().mockRejectedValue(new Error("no room in render test"));
  mocks.push.mockReset();
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("crisis check on the home composer", () => {
  it("shows help numbers instead of a debate, before the session or consent is checked", async () => {
    mocks.readSensitiveDataConsent.mockResolvedValue({ status: "required" });
    await startFromHome(CRISIS, "RO");
    expect(crisisDialog()).not.toBeNull();
    expect(consentDialog()).toBeNull();
    expect(mocks.validateSession).not.toHaveBeenCalled();
    expect(mocks.readSensitiveDataConsent).not.toHaveBeenCalled();
    expect(mocks.createDebate).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(crisisText()).toContain(HOME_EN["home.crisisSupport.title"]);
    const call = crisisDialog()!.querySelector<HTMLAnchorElement>(".crisisSupportCall");
    expect(call?.getAttribute("href")).toBe("tel:0800000001");
    expect(crisisText()).toContain(HOME_EN["home.crisisSupport.emergency"].replace("{number}", "112"));
    expect(crisisDialog()!.querySelector("a[href='https://findahelpline.com']")).not.toBeNull();
  });

  it("switches the helplines when another country is chosen", async () => {
    await startFromHome(CRISIS, "RO");
    const select = crisisDialog()!.querySelector("select")!;
    await act(async () => {
      select.value = "GB";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(crisisDialog()!.querySelector(".crisisSupportCall")?.getAttribute("href")).toBe("tel:000000");
    expect(crisisDialog()!.querySelector("a[href='sms:85258']")).not.toBeNull();
    expect(crisisText()).toContain(HOME_EN["home.crisisSupport.emergency"].replace("{number}", "999"));
  });

  it("asks for the country when none is known, and still names the emergency number", async () => {
    vi.stubGlobal("navigator", { languages: ["zz"], language: "zz" });
    const catalog = Object.freeze({ ...catalogue("ar", "home"), ...catalogue("ar", "chrome") });
    const container = await mount(
      <LibraryComposer catalog={catalog} newDebateCatalog={catalogue("ar", "newDebate")} locale="ar" />
    );
    await type(container.querySelector<HTMLTextAreaElement>("#library-claim")!, CRISIS);
    await click(container.querySelector(".libStart"));
    expect(crisisDialog()).not.toBeNull();
    expect(crisisDialog()!.querySelector(".crisisSupportCall")).toBeNull();
    expect(crisisDialog()!.querySelector(".crisisSupportEmergency")).not.toBeNull();
  });

  it("links the emergency number, keeps numbers left to right, and focuses its title", async () => {
    await startFromHome(CRISIS, "RO");
    expect(crisisDialog()!.querySelector(".crisisSupportEmergencyCall")?.getAttribute("href")).toBe("tel:112");
    expect(crisisDialog()!.querySelector(".crisisSupportCall")!.textContent).toContain("\u20660800 000 001\u2069");
    expect(document.activeElement?.id).toBe("crisis-support-title");
  });

  it("closes on Esc but not on a click on the backdrop", async () => {
    await startFromHome(CRISIS, "RO");
    await click(document.querySelector(".policyScrim"));
    expect(crisisDialog()).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(crisisDialog()).toBeNull();
    expect(mocks.createDebate).not.toHaveBeenCalled();
  });

  it("goes back to the question, which is kept, and never starts a debate", async () => {
    const container = await startFromHome(CRISIS, "RO");
    await click(crisisDialog()!.querySelector(".crisisSupportBack"));
    expect(crisisDialog()).toBeNull();
    expect(container.querySelector<HTMLTextAreaElement>("#library-claim")!.value).toBe(CRISIS);
    expect(mocks.createDebate).not.toHaveBeenCalled();
  });

  it("preserves a policy question about suicide in the complete /new flow", async () => {
    await startFromHome(POLICY);
    expect(crisisDialog()).toBeNull();
    expect(mocks.createDebate).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith(`/new?topic=${encodeURIComponent(POLICY)}`);
  });

  it("shows the screen on /new when the API refuses the ask as a crisis", async () => {
    mocks.createDebate.mockRejectedValue(new ContractHttpError(
      "UNPROCESSABLE", 422, "CRISIS_SUPPORT_OFFERED: CRISIS_SUPPORT_OFFERED", "CRISIS_SUPPORT_OFFERED"
    ));
    const container = await mount(<NewDebatePage catalog={catalogue("en", "newDebate")} homeCatalog={catalogue("en", "home")} chromeCatalog={catalogue("en", "chrome")} locale="en" crisisCountryHint="RO"/>);
    await type(container.querySelector<HTMLTextAreaElement>("textarea")!, POLICY);
    await act(async()=>{container.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
    await settle();
    expect(crisisDialog()).not.toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

// V, 2026-10-01: "make sure this crisis check is done in the pre-flight. if a question is
// flagged as a crisis thing, no debate start and do the crisis workflow." The pre-flight runs
// before the form's own rules too: a crisis question too short to be a debate still gets help.
describe("crisis check before the form's own rules", () => {
  beforeEach(() => { warmCrisisCheck(); });

  it("opens the screen on the home composer for a crisis question too short to debate", async () => {
    const catalog = Object.freeze({ ...catalogue("en", "home"), ...catalogue("en", "chrome") });
    const container = await mount(
      <LibraryComposer catalog={catalog} newDebateCatalog={catalogue("en", "newDebate")} locale="en" crisisCountryHint="RO" />
    );
    const field = container.querySelector<HTMLTextAreaElement>("#library-claim")!;
    await type(field, "hello");
    expect(container.querySelector<HTMLButtonElement>(".libStart")!.disabled).toBe(true);
    await type(field, SHORT_CRISIS);
    expect(container.querySelector<HTMLButtonElement>(".libStart")!.disabled).toBe(false);
    await click(container.querySelector(".libStart"));
    expect(crisisDialog()).not.toBeNull();
    expect(mocks.validateSession).not.toHaveBeenCalled();
    expect(mocks.createDebate).not.toHaveBeenCalled();
  });

  it("opens the screen on /new for a crisis question too short to debate", async () => {
    const container = await mount(
      <NewDebatePage
        catalog={catalogue("en", "newDebate")}
        homeCatalog={catalogue("en", "home")}
        chromeCatalog={catalogue("en", "chrome")}
        locale="en"
        crisisCountryHint="GB"
      />
    );
    await type(container.querySelector<HTMLTextAreaElement>("textarea")!, SHORT_CRISIS);
    const button = container.querySelector<HTMLButtonElement>(".ndStart")!;
    expect(button.disabled).toBe(false);
    await click(button);
    expect(crisisDialog()).not.toBeNull();
    expect(mocks.readSensitiveDataConsent).not.toHaveBeenCalled();
    expect(mocks.createDebate).not.toHaveBeenCalled();
  });
});

describe("crisis check on /new", () => {
  it("shows help numbers instead of a debate, before the consent screen", async () => {
    mocks.readSensitiveDataConsent.mockResolvedValue({ status: "required" });
    const container = await mount(
      <NewDebatePage
        catalog={catalogue("en", "newDebate")}
        homeCatalog={catalogue("en", "home")}
        chromeCatalog={catalogue("en", "chrome")}
        locale="en"
        crisisCountryHint="GB"
      />
    );
    const field = container.querySelector<HTMLTextAreaElement>("textarea")!;
    await type(field, CRISIS);
    const form = container.querySelector("form")!;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await settle();
    expect(crisisDialog()).not.toBeNull();
    expect(consentDialog()).toBeNull();
    expect(mocks.readSensitiveDataConsent).not.toHaveBeenCalled();
    expect(mocks.createDebate).not.toHaveBeenCalled();
    expect(crisisDialog()!.querySelector(".crisisSupportCall")?.getAttribute("href")).toBe("tel:000000");
  });
});

// Part 1b merged with the crisis check (2026-10-01): a person whose earlier question already
// waits for the budget (sentence D) can still reach the help numbers. While a question waits
// both start buttons are disabled, except for a question the crisis check flags: that one
// enables them, and Start opens the help screen instead of sending anything.
describe("crisis check while another question already waits", () => {
  const waiting = () => ({
    room: "ALREADY_WAITING", scope: "PERSON", resets_at: new Date(Date.now() + 86_400_000).toISOString(),
    waiting_run_ref: "run:waiting", plan_id: null
  });

  it("shows help numbers on the home composer", async () => {
    mocks.getAskRoom.mockResolvedValue(waiting());
    await startFromHome(CRISIS, "RO");
    expect(crisisDialog()).not.toBeNull();
    expect(mocks.createDebate).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("shows help numbers on /new from its Start button", async () => {
    mocks.getAskRoom.mockResolvedValue(waiting());
    const container = await mount(
      <NewDebatePage
        catalog={catalogue("en", "newDebate")}
        homeCatalog={catalogue("en", "home")}
        chromeCatalog={catalogue("en", "chrome")}
        locale="en"
        crisisCountryHint="GB"
      />
    );
    await type(container.querySelector<HTMLTextAreaElement>("textarea")!, CRISIS);
    await click(container.querySelector(".ndStart"));
    expect(crisisDialog()).not.toBeNull();
    expect(mocks.createDebate).not.toHaveBeenCalled();
  });
});
