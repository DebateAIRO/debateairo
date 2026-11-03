// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, QUESTION_NOT_STARTED, type AskParent, type QuestionNotStarted } from "@debateai/contract";

/*
 * R22's first debate on the test site (2026-11-02): the question check answered 503 QUESTION_CHECK_UNAVAILABLE and the V4 page said "The coordinator
 * could not be reached, so the outcome is unknown." The check's answers are /new's (sf-s04-new-debate-refusal): its subject's screen, or the retry screen.
 * A dig's text is AI-written around a question that already passed, so a dig gets a plain sentence instead of a pop-up (ASK-4, as the crisis gate).
 * The hook and the refusal screens are the real ones; only the server and the other pop-ups are stood in.
 */
const server = vi.hoisted(() => ({
  createDebate: vi.fn(async (..._args: unknown[]): Promise<{ id: string }> => ({ id: "unused" })),
  room: null as null | Record<string, unknown>,
  languageAnswer: "KEEP" as "KEEP" | "USE",
  offers: 0
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// The ask page learns the session beside the page (ask-d1 D): a signed-in person here.
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => ReactNode }) => children("IN") }));
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
vi.mock("@/components/SensitiveDataConsent", () => ({
  isSensitiveDataConsentRefusal: () => false,
  useSensitiveDataConsent: () => ({ ensureConsent: async () => true, declined: false, dialog: null })
}));
vi.mock("@/components/QuestionLanguageChoice", () => ({
  useQuestionLanguageChoice: () => ({ ensureChoice: async () => { server.offers += 1; return server.languageAnswer; }, dialog: null })
}));
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
import { useV4Ask, type V4AskOutcome } from "../../apps/ui/lib/v4/useV4Ask.js";
import { QuestionLanguageChoiceNeededError } from "../../apps/ui/lib/v3/requestFailure.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const HOME = messages("home");
const NEW_DEBATE = messages("newDebate");
const UNREACHABLE = "The coordinator could not be reached";
const unavailable = () => new ContractHttpError("SERVER_FAILURE", 503, "QUESTION_CHECK_UNAVAILABLE", "QUESTION_CHECK_UNAVAILABLE");
const notStarted = (refusal: QuestionNotStarted) =>
  new ContractHttpError("UNPROCESSABLE", 422, QUESTION_NOT_STARTED, QUESTION_NOT_STARTED, null, null, null, refusal);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  server.createDebate.mockReset(); router.push.mockReset();
  server.room = null; server.languageAnswer = "KEEP"; server.offers = 0;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function render(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return host;
}
const button = (name: string): HTMLButtonElement => [...host!.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(name))!;
const click = async (target: HTMLElement): Promise<void> => {
  await act(async () => { target.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
};

/** The owner's path on 2 Nov: a question, Continue, then Start on "How we read your question", which the server refuses. */
async function startRefusedWith(error: unknown): Promise<HTMLDivElement> {
  server.createDebate.mockRejectedValue(error);
  const page = await render(<V4AskClient catalog={CATALOG} homeCatalog={HOME} newDebateCatalog={NEW_DEBATE} billingCatalog={messages("billing")}
    locale="en" crisisCountryHint={null} initialQuestion="Should the city fund the tram line?" initialLevel="plain" />);
  await click(button(CATALOG["v4.ask.continue"]!));
  await click(button(CATALOG["v4.read.start"]!));
  expect(server.createDebate).toHaveBeenCalledTimes(1);
  return page;
}

describe("the V4 ask page shows the question check's own answers", () => {
  it("a check that cannot run now opens the retry screen, never 'the coordinator could not be reached'", async () => {
    const page = await startRefusedWith(unavailable());
    expect(page.querySelector('[data-dialog="question-refusal"] [data-part="try-again"]')?.textContent).toBe(HOME["home.questionRefusal.unavailable"]);
    expect(page.textContent).not.toContain(UNREACHABLE);
    expect(router.push).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "DRUGS", screen: "REFUSE", emergencyNumber: false },
    { kind: "SUICIDE_AND_ASSISTED_DYING", screen: "SENSITIVE", emergencyNumber: false }
  ] as const)("a question the check does not start (%j) opens its subject's screen", async (refusal) => {
    const page = await startRefusedWith(notStarted(refusal));
    expect(page.querySelector('[data-dialog="question-refusal"]')).not.toBeNull();
    expect(page.querySelector('[data-part="try-again"]')).toBeNull();
    expect(page.textContent).not.toContain(UNREACHABLE);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Back closes the screen and keeps the person on the page with the question", async () => {
    const page = await startRefusedWith(unavailable());
    await click(page.querySelector<HTMLButtonElement>('[data-part="back"]')!);
    expect(page.querySelector('[data-dialog="question-refusal"]')).toBeNull();
    expect(page.textContent).toContain("Should the city fund the tram line?");
  });
});

describe("a rewrite the person accepted survives the check's screen (ASK-5)", () => {
  it("the language pop-up's rewrite, then the retry screen: the next Start sends the rewrite, with no second pop-up", async () => {
    const REWRITE = "Should the city pay for the tram line?";
    server.room = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null, shape_settings: true };
    server.languageAnswer = "USE";
    server.createDebate
      .mockRejectedValueOnce(new QuestionLanguageChoiceNeededError({ check_ref: "made-up-ref", main_language: { code: "en", name: "English" },
        languages_seen: [{ code: "en", name: "English" }, { code: "ro", name: "Romanian" }], proposed_question: REWRITE }))
      .mockRejectedValueOnce(unavailable())
      .mockRejectedValueOnce(unavailable());
    const page = await render(<V4AskClient catalog={CATALOG} homeCatalog={HOME} newDebateCatalog={NEW_DEBATE} billingCatalog={messages("billing")}
      locale="en" crisisCountryHint={null} initialQuestion="Should the city fund the tram line?" initialLevel="plain" />);
    await click(button(CATALOG["v4.ask.continue"]!));
    await click(button(CATALOG["v4.read.start"]!));
    expect(server.createDebate).toHaveBeenCalledTimes(2);
    expect(server.createDebate.mock.calls[1]![0]).toBe(REWRITE);
    expect(page.querySelector('[data-part="try-again"]')).not.toBeNull();
    await click(page.querySelector<HTMLButtonElement>('[data-part="back"]')!);
    await click(button(CATALOG["v4.read.start"]!));
    expect(server.createDebate).toHaveBeenCalledTimes(3);
    expect(server.createDebate.mock.calls[2]![0]).toBe(REWRITE);
    expect(server.offers).toBe(1);
  });
});

describe("a dig the question check refuses gets a plain sentence, no pop-up", () => {
  const PARENT: AskParent = { parent_run_id: "11111111-1111-4111-8111-111111111111", places: [], mode: "quick" };

  async function dig(error: unknown): Promise<V4AskOutcome> {
    server.createDebate.mockRejectedValue(error);
    let submit: ReturnType<typeof useV4Ask>["submit"] | null = null;
    function MapPage(): ReactNode {
      const ask = useV4Ask({ catalog: CATALOG, homeCatalog: HOME, newDebateCatalog: NEW_DEBATE, locale: "en", crisisCountryHint: null,
        mode: "quick", readingLevel: "plain", dig: { parentRunId: PARENT.parent_run_id, picks: 0 } });
      submit = ask.submit;
      return <>{ask.dialogs}</>;
    }
    await render(<MapPage />);
    let outcome: V4AskOutcome | null = null;
    await act(async () => { outcome = await submit!("What would the tram line cost each year to run?", "quick", "dig", PARENT); });
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(host!.querySelector('[data-dialog="question-refusal"]')).toBeNull();
    return outcome!;
  }

  it("not started: this part can't be followed up", async () => {
    expect(await dig(notStarted({ kind: "DRUGS", screen: "REFUSE", emergencyNumber: false })))
      .toEqual({ kind: "REFUSED", message: CATALOG["v4.digError.cannotFollow"] });
  });

  it("the check cannot run now: nothing started, try again", async () => {
    expect(await dig(unavailable())).toEqual({ kind: "REFUSED", message: CATALOG["v4.ask.failed"] });
  });

  it("but a dig carrying the person's own view is their words (the owner, 1 Nov): the subject's screen opens, help numbers and all", async () => {
    server.createDebate.mockRejectedValue(notStarted({ kind: "SUICIDE_AND_ASSISTED_DYING", screen: "SENSITIVE", emergencyNumber: true }));
    let submit: ReturnType<typeof useV4Ask>["submit"] | null = null;
    function MapPage(): ReactNode {
      const ask = useV4Ask({ catalog: CATALOG, homeCatalog: HOME, newDebateCatalog: NEW_DEBATE, locale: "en", crisisCountryHint: null,
        mode: "quick", readingLevel: "plain", dig: { parentRunId: PARENT.parent_run_id, picks: 1 } });
      submit = ask.submit;
      return <>{ask.dialogs}</>;
    }
    await render(<MapPage />);
    const own: AskParent = { ...PARENT, picks: [{ kind: "OWN_VIEW", suggestion_id: null, place: "made-up-place", text: "My own view on it, in my words" }] };
    let outcome: V4AskOutcome | null = null;
    await act(async () => { outcome = await submit!("What would the tram line cost each year to run?", "quick", "dig", own); });
    expect(outcome).toEqual({ kind: "STOPPED" });
    expect(host!.querySelector('[data-dialog="question-refusal"]')).not.toBeNull();
  });
});
