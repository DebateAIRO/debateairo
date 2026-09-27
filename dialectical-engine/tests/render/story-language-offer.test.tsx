// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema } from "@debateai/contract";
import { QuestionLanguageOffer } from "../../apps/ui/components/QuestionLanguageOffer.js";
import { LANGUAGE_OFFER_DISMISSED_KEY } from "../../apps/ui/lib/i18n/localeChoice.js";
import { LOCALE_COOKIE } from "../../apps/ui/lib/i18n/locales.js";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import chromeRomanian from "../../apps/ui/messages/ro/chrome.json" with { type: "json" };

/**
 * R2 (spec 2026-09-26 §14.3): when the question's language differs from the
 * interface's, the debate page offers to show itself in the question's
 * language, in the interface's words, and "No, thanks" holds for the session.
 */

const mocks = vi.hoisted(() => ({
  getDebateServer: vi.fn(),
  locale: "en",
  readPublicDebate: vi.fn()
}));

vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  getDebateServer: mocks.getDebateServer,
  createServerContractClient: () => ({ readPublicDebate: mocks.readPublicDebate })
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => React.ReactNode }) => children("t".repeat(43))
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: name === LOCALE_COOKIE ? mocks.locale : "t".repeat(43) })
  }),
  headers: async () => new Headers({ "user-agent": "vitest-render-browser" })
}));

let root: Root | null = null;

async function mount(element: ReactElement): Promise<HTMLElement> {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return container;
}

async function unmount(): Promise<void> {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QuestionLanguageOffer", () => {
  it("offers the question's language, in the interface's words, with its own name isolated", async () => {
    const container = await mount(<QuestionLanguageOffer questionLocale="ro" interfaceLocale="en" catalog={chromeEnglish} />);
    const offer = container.querySelector("section.languageOffer")!;
    expect(offer.getAttribute("aria-label")).toBe("Page language");
    expect(offer.querySelector(".languageOfferText")?.textContent).toBe("This debate is in Română. Show the page in Română?");
    expect([...offer.querySelectorAll("bdi")].map((name) => [name.getAttribute("lang"), name.textContent]))
      .toEqual([["ro", "Română"], ["ro", "Română"], ["ro", "Română"]]);
    expect([...offer.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Switch to Română", "No, thanks"]);
  });

  it("writes the offer in the interface's language, not the question's", async () => {
    const container = await mount(<QuestionLanguageOffer questionLocale="en" interfaceLocale="ro" catalog={chromeRomanian} />);
    expect(container.querySelector(".languageOfferText")?.textContent)
      .toBe("Această dezbatere este în limba English. Afișați pagina în limba English?");
  });

  it("shows nothing when the locales agree, or the question's language is not known", async () => {
    expect(renderToStaticMarkup(<QuestionLanguageOffer questionLocale="en" interfaceLocale="en" catalog={chromeEnglish} />)).toBe("");
    expect(renderToStaticMarkup(<QuestionLanguageOffer questionLocale={null} interfaceLocale="en" catalog={chromeEnglish} />)).toBe("");
  });

  it("never uses the retired 'interface only' caption (dev decision D1)", async () => {
    const container = await mount(<QuestionLanguageOffer questionLocale="ro" interfaceLocale="en" catalog={chromeEnglish} />);
    expect(container.textContent).not.toMatch(/Interface only|stays in the language/iu);
  });

  it("remembers 'No, thanks' for the session, per language", async () => {
    const first = await mount(<QuestionLanguageOffer questionLocale="ro" interfaceLocale="en" catalog={chromeEnglish} />);
    const dismiss = [...first.querySelectorAll("button")].find((button) => button.textContent === "No, thanks")!;
    await act(async () => dismiss.click());
    expect(first.querySelector("section.languageOffer")).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(LANGUAGE_OFFER_DISMISSED_KEY) ?? "[]")).toEqual(["ro"]);
    await unmount();
    const again = await mount(<QuestionLanguageOffer questionLocale="ro" interfaceLocale="en" catalog={chromeEnglish} />);
    expect(again.querySelector("section.languageOffer")).toBeNull();
    await unmount();
    const german = await mount(<QuestionLanguageOffer questionLocale="de" interfaceLocale="en" catalog={chromeEnglish} />);
    expect(german.querySelector("section.languageOffer")).not.toBeNull();
    // Not a cookie: nothing about the choice reaches the server.
    expect(document.cookie).not.toContain("languageOffer");
  });

  it("switches with dev's locale cookie (the same cookie the language switcher writes)", async () => {
    // The reload that follows cannot be observed here: jsdom does not navigate,
    // and its Location is unforgeable, so it cannot be spied on either.
    // French: a language this file has not dismissed (a dismissal also lasts in memory for the page's life).
    const container = await mount(<QuestionLanguageOffer questionLocale="fr" interfaceLocale="en" catalog={chromeEnglish} />);
    const switchButton = container.querySelector<HTMLButtonElement>(".languageOfferSwitch")!;
    expect(switchButton.textContent).toBe("Switch to Français");
    await act(async () => switchButton.click());
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=fr`);
  });
});

describe("the debate pages mount the offer", () => {
  const queuedRun = {
    run_ref: "run:queued",
    question_line: "Ar trebui să ne mutăm la Cluj?",
    state: "QUEUED" as const,
    terminal_reason: null,
    hold_until: null
  };

  async function ownerPage(language: { tag: string; name: string } | null | undefined): Promise<string> {
    const { default: DebatePage } = await import("../../apps/ui/app/debate/[id]/page.js");
    mocks.getDebateServer.mockResolvedValue({
      ok: false,
      kind: "loading",
      run: language === undefined ? queuedRun : { ...queuedRun, argument_language: language }
    });
    return renderToStaticMarkup(await DebatePage({ params: Promise.resolve({ id: queuedRun.run_ref }) }) as ReactElement);
  }

  it("shows the offer on the owner's page when the run's language differs from the interface's", async () => {
    mocks.locale = "en";
    const html = await ownerPage({ tag: "ro", name: "Romanian" });
    expect(html).toContain('<section class="languageOffer" aria-label="Page language">');
    expect(html).toContain("<bdi lang=\"ro\">Română</bdi>");
  });

  it("shows no offer on the owner's page for the same language, und, or a run read without a language", async () => {
    mocks.locale = "en";
    for (const language of [{ tag: "en", name: "English" }, { tag: "und", name: "the same language as the question" }, null, undefined]) {
      expect(await ownerPage(language), JSON.stringify(language)).not.toContain("languageOffer");
    }
  });

  it("shows the offer on the public page from the snapshot's language", async () => {
    const { default: PublicDebatePage } = await import("../../apps/ui/app/public/debate/[id]/page.js");
    mocks.locale = "en";
    mocks.readPublicDebate.mockResolvedValue(PublicDebateSchema.parse({
      public_ref: "22222222-2222-4222-8222-222222222222",
      author_pseudonym: "Stable Public Author",
      question: "Ar trebui să ne mutăm la Cluj?",
      published_at: "2026-09-26T10:00:00.000Z",
      language: "ro",
      answer: {
        terminal: "SERVED", verdict: "CONTESTED", verdict_available: true, confidence_band: "CAPPED",
        summary_segments: [{ text: "Rezumatul vechi." }], badges: [], residual_objections: [],
        reversal_point: "O locuință mai ieftină.", as_of: "2026-09-26T09:00:00.000Z"
      },
      story_short: {
        headline: "Răspunsul nostru: mutați-vă treptat.",
        summary: "Merită, dar în doi pași.",
        confidence: "Destul de siguri.",
        paths: [{ position_ref: "n-1", fate: "PARTLY_HELD", line: "Mutare treptată.", node_refs: [] }],
        change: { text: "Dacă angajatorul refuză.", node_refs: [] },
        reviewer_note: null
      }
    }));
    const html = renderToStaticMarkup(await PublicDebatePage({ params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) }) as ReactElement);
    expect(html).toContain('<section class="languageOffer" aria-label="Page language">');
  });
});
