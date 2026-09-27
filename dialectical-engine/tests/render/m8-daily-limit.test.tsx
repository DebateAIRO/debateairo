// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, type PublicDebateSummary } from "@debateai/contract";
import type { DebateSummary } from "../../apps/ui/lib/types.js";

/**
 * Task M8 (spec 2026-09-26 §14.4.7). The daily limit for NEW debates stays, and
 * the person is told so in plain calm words: today's limit is reached, try
 * again tomorrow. The home composer used to swallow every failure and send the
 * person to /new, which would only refuse the same ask again; for this refusal
 * it now says so where the person typed, as /new does.
 */

const mocks = vi.hoisted(() => ({
  createDebate: vi.fn(),
  validateSession: vi.fn(),
  readSession: vi.fn(),
  push: vi.fn(),
  composerProps: [] as Record<string, unknown>[],
  locale: "en",
  readPublicDebates: vi.fn(async () => ({ items: [] as PublicDebateSummary[], total: 0 })),
  listDebatesPageServer: vi.fn(async () => ({ summaries: [] as DebateSummary[], shown: 0, total: 0 }))
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
  contractClient: { readSession: mocks.readSession }
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => ReactNode }) => children("test-token")
}));
// The home page's own render: the composer records what it was handed.
vi.mock("@/components/LibraryComposer", () => ({
  LibraryComposer: (props: Record<string, unknown>) => {
    mocks.composerProps.push(props);
    return null;
  }
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));
vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({ readPublicDebates: mocks.readPublicDebates }),
  listDebatesPageServer: mocks.listDebatesPageServer
}));
vi.mock("next/headers", async () => {
  const { LOCALE_COOKIE } = await import("../../apps/ui/lib/i18n/locales.js");
  return {
    cookies: async () => ({
      get: (name: string) => name === "__Host-debateai-session"
        ? { value: "t".repeat(43) }
        : name === LOCALE_COOKIE ? { value: mocks.locale } : undefined
    }),
    headers: async () => new Headers({ "user-agent": "m8-render-test" })
  };
});

import NewDebatePage from "../../apps/ui/app/new/NewDebatePageClient.js";
import HomePage from "../../apps/ui/app/page.js";

type ComposerModule = typeof import("../../apps/ui/components/LibraryComposer.js");
const { LibraryComposer } = await vi.importActual<ComposerModule>("../../apps/ui/components/LibraryComposer.js");

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalogue = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;

/** What POST /v1/asks answers once the day's spend would not admit one more run. */
const dayRefusal = () => new ContractHttpError(
  "RATE_LIMITED", 429, "DAILY_COST_ENVELOPE_REACHED: DAILY_COST_ENVELOPE_REACHED", "DAILY_COST_ENVELOPE_REACHED"
);

const DAY_EN = "Starting this debate did not complete. We've reached today's limit for new debates. Please try again tomorrow.";
const DAY_RO = "Pornirea acestei dezbateri nu s-a finalizat. "
  + "Am atins limita de azi pentru dezbateri noi. Vă rugăm să încercați din nou mâine.";

let root: Root | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
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

function composer(locale: "en" | "ro"): ReactElement {
  const catalog = Object.freeze({ ...catalogue(locale, "home"), ...catalogue(locale, "chrome") });
  return <LibraryComposer catalog={catalog} newDebateCatalog={catalogue(locale, "newDebate")} />;
}

async function startFromHome(locale: "en" | "ro"): Promise<HTMLElement> {
  const container = await mount(composer(locale));
  await type(container.querySelector<HTMLTextAreaElement>("#library-claim")!, "Cities should ban cars downtown");
  await act(async () => container.querySelector<HTMLButtonElement>(".libStart")!.click());
  await settle();
  return container;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.createDebate.mockReset();
  mocks.validateSession.mockReset().mockResolvedValue(undefined);
  mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable in render test"));
  mocks.push.mockReset();
  mocks.composerProps = [];
  mocks.locale = "en";
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("the home composer says today's limit where the person typed (§14.4.7)", () => {
  it("shows the friendly words and does not send the person to /new", async () => {
    mocks.createDebate.mockRejectedValue(dayRefusal());
    const container = await startFromHome("en");
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".libComposer .error")?.textContent).toBe(DAY_EN);
    expect(mocks.push).not.toHaveBeenCalled();
    // What was typed stays, and the button is ready again.
    expect(container.querySelector<HTMLTextAreaElement>("#library-claim")?.value).toBe("Cities should ban cars downtown");
    const start = container.querySelector<HTMLButtonElement>(".libStart")!;
    expect(start.disabled).toBe(false);
    expect(start.textContent).toContain("Start debate");
  });

  it("says it in the interface's language", async () => {
    mocks.createDebate.mockRejectedValue(dayRefusal());
    const container = await startFromHome("ro");
    expect(container.querySelector(".libComposer .error")?.textContent).toBe(DAY_RO);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("clears the words when the person starts again", async () => {
    mocks.createDebate.mockRejectedValueOnce(dayRefusal()).mockResolvedValueOnce({ id: "run-next-day" });
    const container = await startFromHome("en");
    expect(container.querySelector(".libComposer .error")).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>(".libStart")!.click());
    await settle();
    expect(container.querySelector(".libComposer .error")).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith("/debate/run-next-day");
  });

  it("still hands every other failure to /new, as before", async () => {
    for (const failure of [
      new Error("ASK_FIELD_REQUIRED: risk_tier must be supplied explicitly; the UI invents no ask values."),
      new ContractHttpError("RATE_LIMITED", 429, "ADMISSION_RATE_LIMITED: x", "ADMISSION_RATE_LIMITED"),
      new ContractHttpError("SERVER_FAILURE", 503, "down")
    ]) {
      mocks.push.mockReset();
      mocks.createDebate.mockReset().mockRejectedValue(failure);
      const container = await startFromHome("en");
      expect(mocks.push, String(failure)).toHaveBeenCalledWith(`/new?topic=${encodeURIComponent("Cities should ban cars downtown")}`);
      expect(container.querySelector(".libComposer .error")).toBeNull();
      await act(async () => root!.unmount());
      root = null;
      document.body.replaceChildren();
    }
  });
});

describe("the /new page shows the same words (§14.4.7)", () => {
  it("says today's limit is reached and to try again tomorrow", async () => {
    mocks.createDebate.mockRejectedValue(dayRefusal());
    const container = await mount(
      <NewDebatePage catalog={catalogue("en", "newDebate")} homeCatalog={catalogue("en", "home")} chromeCatalog={catalogue("en", "chrome")} />
    );
    const topic = container.querySelector<HTMLTextAreaElement>("#topic")!;
    await type(topic, "Cities should ban cars downtown");
    await act(async () => {
      container.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    // Exactly one banner says it, in the exact words (no "coordinator", no "rate-limiting", no hour).
    const banners = [...container.querySelectorAll(".error")].map((banner) => banner.textContent);
    expect(banners.filter((text) => text?.includes("today's limit"))).toEqual([DAY_EN]);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("the home page hands the composer the newDebate catalogue of the interface's language", () => {
  it("threads it as a prop, never a module default", async () => {
    mocks.locale = "ro";
    const page = await HomePage({ searchParams: Promise.resolve({ tab: "yours" }) });
    renderToStaticMarkup(page as ReactElement);
    expect(mocks.composerProps).toHaveLength(1);
    const handed = mocks.composerProps[0]!.newDebateCatalog as Record<string, string>;
    expect(handed["requestFailure.kind.DAILY_LIMIT_REACHED"]).toBe(catalogue("ro", "newDebate")["requestFailure.kind.DAILY_LIMIT_REACHED"]);
    expect(handed["requestFailure.subject.DEBATE_CREATE"]).toBe("Pornirea acestei dezbateri nu s-a finalizat.");
    // Only the two values the message prints: the composer's props ship to the browser (Task 16, M8 review).
    expect(Object.keys(handed).sort()).toEqual(["requestFailure.kind.DAILY_LIMIT_REACHED", "requestFailure.subject.DEBATE_CREATE"]);
  });
});
