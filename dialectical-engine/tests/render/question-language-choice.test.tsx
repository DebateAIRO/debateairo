// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pre-flight PF-L54: copied from tests/render/sensitive-data-consent.test.tsx (~16–43, ~70–77, ~104–111): mocks made with
// vi.hoisted (a plain const is not yet defined when vi.mock's factory runs); consent mocks answer { status }, never { state };
// readSession REJECTS (as the consent test does), never resolves {}; the textarea is filled through the native value setter.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const mocks = vi.hoisted(() => ({
  createDebate: vi.fn(), validateSession: vi.fn(), readSession: vi.fn(),
  readSensitiveDataConsent: vi.fn(), giveSensitiveDataConsent: vi.fn(), push: vi.fn()
}));
const createDebate = mocks.createDebate;
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stubs/next-navigation.js")>()),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  return { ...actual, COOKIE_SESSION_MARKER: "cookie-session", createDebate: mocks.createDebate, validateSession: mocks.validateSession,
    contractClient: { readSession: mocks.readSession, readSensitiveDataConsent: mocks.readSensitiveDataConsent,
      giveSensitiveDataConsent: mocks.giveSensitiveDataConsent } };
});
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => ReactNode }) => children("test-token")
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));

import { QuestionLanguageChoiceNeededError } from "../../apps/ui/lib/api.js";
import { ContractHttpError } from "@debateai/contract";
import NewDebatePageClient from "../../apps/ui/app/new/NewDebatePageClient.js";

// There is no catalogsFor helper: build the three catalogues the page takes from apps/ui/messages/<locale>/<ns>.json.
const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalogue = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
const catalogsFor = (locale: string) => ({ catalog: catalogue(locale, "newDebate"), homeCatalog: catalogue(locale, "home"), chromeCatalog: catalogue(locale, "chrome") });

const MIXED = "Ar trebui România să adopte euro, or should it wait until wages catch up?";
const OFFER = { check_ref: "ref.sig", main_language: { code: "ro", name: "Romanian" },
  languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }],
  proposed_question: "Ar trebui România să adopte euro sau să aștepte până cresc salariile?" };

async function renderNew(locale: "ro" | "en" | "el") {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(<NewDebatePageClient locale={locale} {...catalogsFor(locale)} />); });
  return { host, root };
}
async function askWith(host: HTMLElement, text: string) {
  const box = host.querySelector("textarea") as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;   // React reads the native setter
  await act(async () => { setter!.call(box, text); box.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { (host.querySelector('button[type="submit"]') as HTMLButtonElement).click(); });
  await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
}
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.validateSession.mockReset().mockResolvedValue(undefined);
  mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable in render test"));
  mocks.readSensitiveDataConsent.mockReset().mockResolvedValue({ status: "given" });
  mocks.giveSensitiveDataConsent.mockReset().mockResolvedValue({ status: "given" });
  mocks.push.mockReset();
});
afterEach(() => { createDebate.mockReset(); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("/new: the question's language (question-language spec 2026-10-13)", () => {
  it("sends the page's language with every ask", async () => {
    createDebate.mockResolvedValue({ id: "run-1" });
    const { host } = await renderNew("ro");
    await askWith(host, "Ar trebui România să adopte euro?");
    expect(createDebate).toHaveBeenCalledWith("Ar trebui România să adopte euro?", expect.anything(), "test-token", undefined, { siteLanguage: "ro" });
  });

  it("a real mix: the pop-up names the languages in the site language; 'Use this version' sends the server's rewrite and the reference", async () => {
    createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER))
      .mockResolvedValueOnce({ id: "run-1" });
    const { host } = await renderNew("ro");
    await askWith(host, MIXED);
    const dialog = document.querySelector('[data-dialog="question-language"]')!;
    expect(dialog.textContent).toContain("Întrebarea ta amestecă limbile");
    expect(dialog.querySelector("blockquote")!.getAttribute("lang")).toBe("ro");
    expect(dialog.textContent).toContain(OFFER.proposed_question);
    expect(dialog.textContent).not.toMatch(/eld|score|model|check_ref/iu);
    await act(async () => { button("Folosește varianta propusă").click(); });
    expect(createDebate).toHaveBeenLastCalledWith(OFFER.proposed_question, expect.anything(), "test-token", undefined,
      { siteLanguage: "ro", choice: { check_ref: "ref.sig", choice: "USE_REWRITE", original_question_line: MIXED } });
  });

  it("'Keep my wording' sends the person's own question with the reference", async () => {
    createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER))
      .mockResolvedValueOnce({ id: "run-1" });
    const { host } = await renderNew("en");
    await askWith(host, MIXED);
    expect(document.querySelector('[data-dialog="question-language"]')!.textContent).toContain("Your question mixes Romanian and English.");
    await act(async () => { button("Keep my wording").click(); });
    expect(createDebate).toHaveBeenLastCalledWith(MIXED, expect.anything(), "test-token", undefined,
      { siteLanguage: "en", choice: { check_ref: "ref.sig", choice: "KEEP_MINE" } });
  });

  it("CR-5: the pop-up shows at most once per submit; a second offer is answered with the person's own wording", async () => {
    const SECOND = { ...OFFER, check_ref: "ref2.sig" };
    createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER))
      // The client's 409 for a stale reference: codeForStatus (packages/contract/src/client.ts) gives a 409 "SERVER_FAILURE".
      .mockRejectedValueOnce(new ContractHttpError("SERVER_FAILURE", 409, "QUESTION_LANGUAGE_CHECK_EXPIRED: QUESTION_LANGUAGE_CHECK_EXPIRED", "QUESTION_LANGUAGE_CHECK_EXPIRED"))
      .mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(SECOND))
      .mockResolvedValueOnce({ id: "run-1" });
    const { host } = await renderNew("en");
    await askWith(host, MIXED);
    await act(async () => { button("Use this version").click(); });
    expect(document.querySelectorAll('[data-dialog="question-language"]').length).toBe(0);
    expect(createDebate).toHaveBeenLastCalledWith(MIXED, expect.anything(), "test-token", undefined,
      { siteLanguage: "en", choice: { check_ref: "ref2.sig", choice: "KEEP_MINE" } });
  });

  it("'Edit' and Esc send nothing more and put the person back in the question box", async () => {
    for (const close of [() => button("Edit").click(), () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))]) {
      createDebate.mockReset();
      createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER));
      const { host, root } = await renderNew("en");
      await askWith(host, MIXED);
      await act(async () => { close(); });
      expect(createDebate).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[data-dialog="question-language"]')).toBeNull();
      expect(document.activeElement).toBe(host.querySelector("textarea"));
      root.unmount();
    }
  });

  // Task 18 additions (controller notes): the cases the brief's five do not pin on their own.

  it("CR-5: after a stale refusal the page never resends that reference; it checks once more with the person's words and no choice", async () => {
    createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER))
      .mockRejectedValueOnce(new ContractHttpError("SERVER_FAILURE", 409, "QUESTION_LANGUAGE_CHOICE_MISMATCH: QUESTION_LANGUAGE_CHOICE_MISMATCH", "QUESTION_LANGUAGE_CHOICE_MISMATCH"))
      .mockResolvedValueOnce({ id: "run-1" });
    const { host } = await renderNew("en");
    await askWith(host, `  ${MIXED}  `);
    await act(async () => { button("Use this version").click(); });
    expect(createDebate).toHaveBeenCalledTimes(3);
    expect(createDebate.mock.calls[1]![0]).toBe(OFFER.proposed_question);
    expect(createDebate.mock.calls[1]![4]).toEqual({ siteLanguage: "en",
      choice: { check_ref: "ref.sig", choice: "USE_REWRITE", original_question_line: MIXED } });
    expect(createDebate.mock.calls[2]).toEqual([MIXED, expect.anything(), "test-token", undefined, { siteLanguage: "en" }]);
    expect(mocks.push).toHaveBeenCalledWith("/debate/run-1?starting=1");
  });

  it("'Edit' after a press of Start (focus on the button, which is disabled while the ask runs) still lands in the question box", async () => {
    createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER));
    const { host } = await renderNew("en");
    const box = host.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => { setter!.call(box, MIXED); box.dispatchEvent(new Event("input", { bubbles: true })); });
    const start = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => { start.focus(); start.click(); });
    await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
    expect(document.activeElement?.textContent).toBe("Use this version");
    await act(async () => { button("Edit").click(); });
    expect(document.activeElement).toBe(box);
  });

  it("D1: a plan refusal on the answering call is today's banner, never a second pop-up", async () => {
    createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER))
      .mockRejectedValueOnce(new ContractHttpError("UNPROCESSABLE", 422, "ASK_PLAN_TIER_INVALID: refused", "ASK_PLAN_TIER_INVALID"));
    const { host } = await renderNew("en");
    await askWith(host, MIXED);
    await act(async () => { button("Keep my wording").click(); });
    expect(createDebate).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-dialog="question-language"]')).toBeNull();
    const en = catalogue("en", "newDebate");
    expect(host.querySelector(".error")!.textContent).toBe(
      `${en["requestFailure.subject.DEBATE_CREATE"]} ${en["requestFailure.kind.PLAN_TIER_INVALID"]}`);
  });

  it("el: Greek running text writes the language names in lower case", async () => {
    createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER));
    const { host } = await renderNew("el");
    await askWith(host, MIXED);
    const text = document.querySelector('[data-dialog="question-language"]')!.textContent!;
    expect(text).toContain("συνδυάζει ρουμανικά και αγγλικά.");
    expect(text).toContain("στα ρουμανικά:");
  });

  it("a language the browser cannot name keeps the server's English name", async () => {
    createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError({ ...OFFER,
      languages_seen: [{ code: "ro", name: "Romanian" }, { code: "qaa", name: "Klingon" }] }));
    const { host } = await renderNew("en");
    await askWith(host, MIXED);
    expect(document.querySelector('[data-dialog="question-language"]')!.textContent).toContain("Your question mixes Romanian and Klingon.");
  });
});
