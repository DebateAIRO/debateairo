// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContractHttpError, QUESTION_NOT_STARTED, warmCrisisCheck, type StartCombineRequest, type StartCombineResponse, type StartFitRequest,
  type StartFitResponse, type StartListsEvent, type StartListsRequest, type StartMenu, type StartMergeRequest, type StartMergeResponse
} from "@debateai/contract";

/*
 * V4 start step, Task 76 (spec 2026-11-03 §2 items 1-6; chat-one-place-for-answers, read-d3, read-d2, choose-d2, journey-f7,
 * r2-6, read-f24, chat-just-answer-under-start, choose-d5, choose-f14, choose-f15, chat-start-waits-for-paths, read-d6, ask-f7;
 * owner answers Q4, Q8, Q9 and Q10; 4 Nov night: ask-f3, ask-f13, read-f3, read-f5, read-f8, read-f17): step 2 end to end.
 * The answers live in the question box, the card "What we'll look into" sits under the questions, Start waits for the paths
 * and sends exactly what the box says with the check of Next, and the refusal and language screens lead back with "Edit my
 * question". The page, its hooks, the card, the bar, the pop-ups and the room notice are the real ones; only the session,
 * the consent and the server are stood in. Every figure and text is made up.
 */
type ListsCall = { input: StartListsRequest; onEvent: (event: StartListsEvent) => void };
type MergeCall = { input: StartMergeRequest; answer: (response: StartMergeResponse) => void };
type CombineCall = { input: StartCombineRequest; answer: (response: StartCombineResponse) => void };
type FitCall = { input: StartFitRequest; answer: (response: StartFitResponse) => void };

const server = vi.hoisted(() => ({
  roomAnswer: (_read: number): Promise<unknown> => Promise.resolve(null),
  roomReads: 0,
  clarifyAnswer: (_line: string): Promise<unknown> => Promise.resolve({ source: "NONE" }),
  asked: [] as string[],
  lists: [] as ListsCall[],
  merges: [] as MergeCall[],
  combines: [] as CombineCall[],
  fits: [] as FitCall[],
  createDebate: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ id: "11111111-1111-4111-8111-111111111111" }))
}));
const carry = vi.hoisted(() => ({ built: true }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
const abortable = (signal: AbortSignal | undefined, reject: (error: unknown) => void): void => {
  signal?.addEventListener("abort", () => { reject(new DOMException("The operation was aborted.", "AbortError")); });
};
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => ReactNode }) => children("IN") }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
vi.mock("@/components/SensitiveDataConsent", () => ({
  isSensitiveDataConsentRefusal: () => false,
  useSensitiveDataConsent: () => ({ ensureConsent: async () => true, declined: false, dialog: null })
}));
// Task 56: the carry-on box shows only once the behaviour is built; each case says which.
vi.mock("@/lib/v4/carryOn", () => ({ get CARRY_ON_BUILT() { return carry.built; } }));
// Start waits out its Undo window before the send; here the window is 0 and a press lets its timer run (`press`), since
// these cases are about what is sent. The window itself: tests/render/v4-start-undo.test.tsx.
vi.mock("@/lib/v4/startUndo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/v4/startUndo.js")>()), START_UNDO_MS: 0
}));
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie",
  createDebate: (...args: unknown[]) => server.createDebate(...args),
  contractClient: {
    readAnswerIndex: async () => ({ items: [], open_runs: [], limit: 32, offset: 0, total: 0 }),
    readDigLinks: async () => ({ parent: null, children: [] }),
    readReadingLevel: async () => ({ reading_level: "plain" }),
    saveReadingLevel: async () => ({ reading_level: "plain" }),
    getAskRoom: async () => {
      server.roomReads += 1;
      return server.roomAnswer(server.roomReads);
    },
    clarifyAsk: async (input: { question_line: string }) => {
      server.asked.push(input.question_line);
      return server.clarifyAnswer(input.question_line);
    },
    startPathLists: (input: StartListsRequest, onEvent: (event: StartListsEvent) => void, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
      abortable(signal, reject);
      server.lists.push({ input, onEvent });
    }),
    startPathMerge: (input: StartMergeRequest, signal?: AbortSignal) => new Promise<StartMergeResponse>((resolve, reject) => {
      abortable(signal, reject);
      server.merges.push({ input, answer: resolve });
    }),
    startPathCombine: (input: StartCombineRequest, signal?: AbortSignal) => new Promise<StartCombineResponse>((resolve, reject) => {
      abortable(signal, reject);
      server.combines.push({ input, answer: resolve });
    }),
    startPathFit: (input: StartFitRequest, signal?: AbortSignal) => new Promise<StartFitResponse>((resolve, reject) => {
      abortable(signal, reject);
      server.fits.push({ input, answer: resolve });
    })
  }
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { parseDigDetail } from "../../apps/ui/lib/v4/askText.js";
import { pathPlanFromMenu, pathPlanToStartPaths } from "../../apps/ui/lib/v4/pathPlan.js";
import { NUCLEAR_MENU, START_FIXTURE_QUESTION, signedList, signedMenu } from "../support/v4-start-menu.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
warmCrisisCheck();

const messages = (locale: string, name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/${locale}/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("en", "v4");
const HOME = messages("en", "home");
const NEW_DEBATE = messages("en", "newDebate");
const BILLING = messages("en", "billing");

const Q = START_FIXTURE_QUESTION;
const REWRITE = "Should Romania build new nuclear power plants?";
const NORTH = `${Q}\n\nWhich region? The north.`;
const AI = { source: "AI", questions: [{ text: "Which region?", answers: ["The north.", "The south."] }] };
const READ_AGAIN = "We need to read your question again. Press Back, then Next.";
const NARROWED_3 = "We've updated the site: it now looks into up to 3 paths. Combine or remove paths down to 3 to start.";
const NO_QUESTIONS = "No extra questions for this one.";
const FREE_JOINED = "Free: up to 3 answers above, up to 3 paths below.";
const HONEST = "These would help us better understand your question";
const NOTICE = "On the Free plan your question and its debate are public. Don't include personal details.";
const TOP_FIVE = [...pathPlanToStartPaths(pathPlanFromMenu(NUCLEAR_MENU, 5, false))];
const CD1 = NUCLEAR_MENU.cards[0]!;

/** Made-up shares of today for 1..7 paths. */
const START_STEP = { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [4, 6, 8, 10, 12, 14, 16] };
const room = (over: Record<string, unknown> = {}) => ({
  room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", start_step: START_STEP, ...over
});
const FREE_ROOM = room({ plan_id: "FREE", start_step: { lists: "ON", widths: { options: [3], default: 3 }, share_by_paths: [5, 8, 11] } });
const down = (): Promise<unknown> => Promise.reject(new Error("SERVER_FAILURE"));
const never = (): Promise<unknown> => new Promise(() => undefined);

const CHECK: StartListsEvent = { event: "check", data: { check_ref: "chk.sig", language: { code: "en", name: "English" }, seats: 4 } };
const checkOf = (ref: string): StartListsEvent => ({ event: "check", data: { check_ref: ref, language: { code: "en", name: "English" }, seats: 4 } });
const list = (n: number): StartListsEvent => ({ event: "list", data: { list: signedList(n) } });
const cut = (listsIn: number): StartListsEvent => ({ event: "cut", data: { lists_in: listsIn } });
const OFFER = { check_ref: "offer.sig", main_language: { code: "en", name: "English" },
  languages_seen: [{ code: "en", name: "English" }, { code: "ro", name: "Romanian" }], proposed_question: REWRITE };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  server.roomAnswer = () => Promise.resolve(room());
  server.roomReads = 0;
  server.clarifyAnswer = () => Promise.resolve(AI);
  server.asked = [];
  server.lists = [];
  server.merges = [];
  server.combines = [];
  server.fits = [];
  server.createDebate.mockReset();
  server.createDebate.mockImplementation(async () => ({ id: "11111111-1111-4111-8111-111111111111" }));
  router.push.mockReset();
  carry.built = true;
  window.history.replaceState(null, "", "/v4");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
  Reflect.deleteProperty(Element.prototype, "animate");
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
  }
}

async function mount(locale = "en"): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4AskClient catalog={CATALOG} homeCatalog={HOME} newDebateCatalog={messages(locale, "newDebate")} billingCatalog={BILLING} locale={locale}
      crisisCountryHint={null} initialQuestion={Q} initialLevel="plain" />
  ));
  await settle();
  return host;
}

async function click(target: Element): Promise<void> {
  await act(async () => { (target as HTMLElement).click(); });
  await settle();
}

/** Task 76b: a press of Start or "Just answer it", then its Undo window (0 here) runs out and what it sends settles. */
async function press(target: Element): Promise<void> {
  await click(target);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  await settle();
}

const buttonNamed = (name: string, within: ParentNode = document): HTMLButtonElement | undefined =>
  [...within.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
const nextButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4AskActions .v4BtnPrimary")!;
const startButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4StartBarStart")!;
const justLink = (): HTMLButtonElement | null => host!.querySelector<HTMLButtonElement>(".v4StartBarJust");
const box = (): HTMLTextAreaElement => host!.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")!;
const onStepTwo = (): boolean => host!.querySelector(".v4AskReadTitle") !== null;
const rows = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>(".v4StartList .v4StartRow")];
const lane = (call = -1): Record<string, unknown> | undefined => server.createDebate.mock.calls.at(call)![8] as Record<string, unknown> | undefined;
const textCount = (text: string): number => (host!.textContent ?? "").split(text).length - 1;

async function toStepTwo(locale = "en"): Promise<HTMLDivElement> {
  const page = await mount(locale);
  await click(nextButton());
  expect(onStepTwo()).toBe(true);
  return page;
}

async function emit(...events: StartListsEvent[]): Promise<void> {
  await act(async () => { for (const event of events) server.lists.at(-1)!.onEvent(event); });
  await settle();
}

async function answerMerge(menu: StartMenu = NUCLEAR_MENU): Promise<void> {
  await act(async () => { server.merges.at(-1)!.answer({ source: "AI", menu: signedMenu(menu) }); });
  await settle();
}

async function toReady(check: StartListsEvent = CHECK): Promise<void> {
  await emit(check, list(1), list(2), cut(2));
  await answerMerge();
}

async function tap(name: string): Promise<void> {
  const target = buttonNamed(name, host!);
  if (target === undefined) throw new Error(`no button "${name}"`);
  await click(target);
}

async function type(field: HTMLTextAreaElement | HTMLInputElement, text: string): Promise<void> {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

async function removePath(n: number): Promise<void> {
  await click(rows()[n - 1]!.querySelector(".v4StartRowMore")!);
  const remove = [...host!.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.trim() === "Remove");
  await click(remove!);
}

async function undo(): Promise<void> {
  await click(host!.querySelector(".v4StartTools .v4StartUndo")!);
}

describe("the answers live in the question box (read-d3, chat-one-place-for-answers, answer Q4)", () => {
  it("a tap puts the sentence in the box; Start sends the box's line, the check, the answer and a combined path with its reference", async () => {
    await toStepTwo();
    await tap("The north.");
    expect(box().value).toBe(NORTH);
    await toReady();
    const suggestion = [...host!.querySelectorAll(".v4StartSuggestion")].find((one) => buttonNamed("Combine", one) !== undefined)!;
    await click(buttonNamed("Combine", suggestion)!);
    expect(server.combines).toHaveLength(1);
    await act(async () => {
      server.combines[0]!.answer({ source: "AI", title: "Hard weeks and using less", question: "How would Romania get through its hardest weeks?",
        combine_ref: "cmb.sig" });
    });
    await settle();
    expect(startButton().textContent).toBe("Start investigating");
    await press(startButton());
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    const args = server.createDebate.mock.calls[0]!;
    expect(args[0]).toBe(NORTH);
    expect(args[6]).toEqual({ answers: [{ question: "Which region?", answer: "The north." }] });
    expect(parseDigDetail(args[0] as string, CATALOG)).toBeNull();
    const sent = lane()!;
    expect(sent.startCheck).toEqual({ ref: "chk.sig" });
    const paths = (sent.startPaths as { paths: Array<{ combine_ref?: string }>; chosen_by: string }).paths;
    expect(paths.filter((path) => path.combine_ref === "cmb.sig")).toHaveLength(1);
    expect((sent.startPaths as { chosen_by: string }).chosen_by).toBe("PERSON");
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/v4\/debate\/11111111-1111-4111-8111-111111111111(?:\?|$)/u));
  });

  it("no answer and no typing: the question alone with the check of Next", async () => {
    await toStepTwo();
    await toReady();
    await press(startButton());
    expect(server.createDebate.mock.calls[0]![0]).toBe(Q);
    expect(server.createDebate.mock.calls[0]![6]).toBeUndefined();
    expect(lane()!.startCheck).toEqual({ ref: "chk.sig" });
  });

  it("typed words join the box: nothing is read again, the card stays ready, and Start sends the typed line", async () => {
    await toStepTwo();
    await toReady();
    await type(box(), `${Q}\n\nAlso the cost to households.`);
    expect(server.asked).toEqual([Q]);
    expect(server.lists).toHaveLength(1);
    expect(rows()).toHaveLength(5);
    expect(startButton().disabled).toBe(false);
    await press(startButton());
    expect(server.createDebate.mock.calls[0]![0]).toBe(`${Q}\n\nAlso the cost to households.`);
    expect(lane()!.startCheck).toEqual({ ref: "chk.sig" });
  });

  it("typing over an answer's sentence unticks the answer; Start sends no answer for that question", async () => {
    await toStepTwo();
    await tap("The north.");
    await type(box(), `${Q}\n\nWhich region? Mostly the north-east.`);
    expect(buttonNamed("The north.", host!)!.getAttribute("aria-pressed")).toBe("false");
    await toReady();
    await press(startButton());
    expect(server.createDebate.mock.calls[0]![0]).toBe(`${Q}\n\nWhich region? Mostly the north-east.`);
    expect(server.createDebate.mock.calls[0]![6]).toBeUndefined();
  });

  it("unticking takes the sentence out of the box again", async () => {
    await toStepTwo();
    await tap("The north.");
    await tap("The north.");
    expect(box().value).toBe(Q);
  });

  it("one place: no \"We'll ask the AIs:\" box, no \"what matters most\" box, and the honest note right under the questions' heading", async () => {
    const page = await toStepTwo();
    expect(page.textContent).not.toContain("We'll ask the AIs:");
    expect(page.querySelector(".v4AskSent")).toBeNull();
    expect(page.textContent).not.toMatch(/what matters most|pull in different directions/iu);
    expect(page.querySelector('[id$="-matters"]')).toBeNull();
    const heading = page.querySelector(".v4AskCard h2")!;
    expect(heading.textContent).toContain(CATALOG["v4.read.optionalTitle"]);
    expect(heading.nextElementSibling?.textContent).toBe(HONEST);
    await tap("The north.");
    await toReady();
    await press(startButton());
    expect(server.createDebate.mock.calls[0]![6]).not.toHaveProperty("matters");
  });

  it("the fly-in: a copy of the answer travels to the box; with less motion the box is highlighted for a second instead", async () => {
    const animate = vi.fn(() => ({ onfinish: null, oncancel: null }));
    Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true });
    await toStepTwo();
    await tap("The north.");
    expect(animate).toHaveBeenCalledTimes(1);
    expect(box().classList.contains("v4Highlight")).toBe(false);
    Reflect.deleteProperty(Element.prototype, "animate");
    vi.useFakeTimers();
    Object.defineProperty(window, "matchMedia", {
      configurable: true, writable: true,
      value: (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })
    });
    await act(async () => buttonNamed("The south.", host!)!.click());
    expect(box().value).toBe(`${Q}\n\nWhich region? The south.`);
    expect(box().classList.contains("v4Highlight")).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(box().classList.contains("v4Highlight")).toBe(false);
  });
});

describe("the questions' lines (r2-6, read-f5, read-f6, read-f8, choose-f15)", () => {
  it("clarify NONE: one calm status line, no heading, no Free line and no honest note", async () => {
    server.roomAnswer = () => Promise.resolve(FREE_ROOM);
    server.clarifyAnswer = () => Promise.resolve({ source: "NONE" });
    const page = await toStepTwo();
    const status = [...page.querySelectorAll('[role="status"]')].filter((one) => one.textContent === NO_QUESTIONS);
    expect(status).toHaveLength(1);
    expect(page.querySelector(".v4AskCard h2")).toBeNull();
    expect(page.textContent).not.toContain(FREE_JOINED);
    expect(page.textContent).not.toContain(HONEST);
  });

  it("Free with questions: the joined Free line between the questions and the card", async () => {
    server.roomAnswer = () => Promise.resolve(FREE_ROOM);
    const page = await toStepTwo();
    const line = [...page.querySelectorAll("p")].find((one) => one.textContent === FREE_JOINED)!;
    expect(line).toBeDefined();
    const lastQuestion = [...page.querySelectorAll('.v4AskBlock[role="group"]')].at(-1)!;
    expect(lastQuestion.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.compareDocumentPosition(page.querySelector(".v4StartCard")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The card says no Free line of its own while the questions show (choose-f15).
    expect(page.querySelector(".v4StartCard")!.textContent).not.toContain("Free looks into");
  });

  it("read-f8: no Free line while the questions are still being read", async () => {
    server.roomAnswer = () => Promise.resolve(FREE_ROOM);
    server.clarifyAnswer = never;
    const page = await toStepTwo();
    expect(page.textContent).toContain(CATALOG["v4.read.clarifyWaiting"]);
    expect(page.textContent).not.toContain("Free: up to");
  });

  it("read-f3: a room read failing twice: no Free line, the mode switch shows, and five answers can be picked", async () => {
    server.roomAnswer = down;
    server.clarifyAnswer = () => Promise.resolve({ source: "AI",
      questions: [{ text: "Which region?", answers: ["North", "South"] }, { text: "Which years?", answers: ["Soon", "Later"] },
        { text: "Whose money?", answers: ["Public", "Private"] }, { text: "Which plants?", answers: ["Large", "Small"] }],
      purpose: { text: "What do you want it for?", answers: ["To vote", "To teach"] } });
    const page = await toStepTwo();
    expect(page.textContent).not.toContain("Free:");
    expect(page.querySelector(".v4StartBar .v4AskMode")).not.toBeNull();
    for (const name of ["North", "Soon", "Public", "Large", "To vote"]) await tap(name);
    for (const name of ["North", "Soon", "Public", "Large", "To vote"]) expect(buttonNamed(name, page)!.getAttribute("aria-pressed")).toBe("true");
    expect(box().value.split("\n\n")[1]!.split("\n")).toHaveLength(5);
  });
});

describe("Start waits for the paths (chat-start-waits-for-paths, answers Q9 and Q10, read-f24, choose-d5)", () => {
  it("'Paths coming…' and greyed until READY; 'Just answer it' greyed too and sends nothing; then 'Start investigating'", async () => {
    await toStepTwo();
    expect(startButton().textContent).toBe("Paths coming…");
    expect(startButton().disabled).toBe(true);
    expect(justLink()!.getAttribute("aria-disabled")).toBe("true");
    await click(justLink()!);
    expect(server.createDebate).not.toHaveBeenCalled();
    await toReady();
    expect(startButton().textContent).toBe("Start investigating");
    expect(startButton().disabled).toBe(false);
    expect(justLink()!.getAttribute("aria-disabled")).toBeNull();
  });

  it("no list (NONE): Start works at once and sends the check alone", async () => {
    await toStepTwo();
    await emit(CHECK, { event: "none", data: { reason: "NO_LISTS" } }, { event: "end", data: { reason: "NONE" } });
    expect(startButton().disabled).toBe(false);
    await press(startButton());
    expect(lane()).toEqual({ startCheck: { ref: "chk.sig" } });
  });

  it("'Just answer it' at READY sends the menu's top five chosen by the AIs; hidden after a Remove, back after its Undo", async () => {
    await toStepTwo();
    await toReady();
    expect(justLink()).not.toBeNull();
    await removePath(5);
    expect(justLink()).toBeNull();
    await undo();
    expect(justLink()).not.toBeNull();
    await press(justLink()!);
    const paths = lane()!.startPaths as { chosen_by: string; paths: unknown[] };
    expect(paths.chosen_by).toBe("AIS");
    expect(paths.paths).toEqual(TOP_FIVE);
  });

  it("the step-2 bar shows exactly one share line", async () => {
    server.roomAnswer = () => Promise.resolve(room({ start_share_percent: 9 }));
    const page = await toStepTwo();
    expect(page.textContent).not.toContain("This question uses about");
    expect([...page.querySelectorAll("p")].filter((one) => /about \d+% of (today|this month)/u.test(one.textContent ?? ""))).toHaveLength(1);
    expect(page.querySelector(".v4StartBarShare")?.textContent).toContain("about 12% of today");
  });

  it("step 1 says the share of the room's default width", async () => {
    server.roomAnswer = () => Promise.resolve(room({ start_share_percent: 9 }));
    const page = await mount();
    expect(page.textContent).toContain("This question uses about 12% of today.");
  });
});

describe("the check's screens lead back with 'Edit my question' (ask-f7)", () => {
  it("a language rewrite: one pop-up whose way back reads 'Edit my question'; Use puts the rewrite in the box and Start sends the original line", async () => {
    await toStepTwo();
    await emit({ event: "language_offer", data: { offer: OFFER } }, { event: "end", data: { reason: "LANGUAGE_CHOICE" } });
    const dialogs = document.querySelectorAll('[data-dialog="question-language"]');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]!.querySelector(".questionLanguageEdit")?.textContent).toBe("Edit my question");
    await click(buttonNamed(NEW_DEBATE["newDebate.languageCheck.use"]!)!);
    expect(document.querySelector('[data-dialog="question-language"]')).toBeNull();
    expect(box().value).toBe(REWRITE);
    expect(server.lists[1]!.input.question_language_choice).toEqual({ check_ref: "offer.sig", choice: "USE_REWRITE", original_question_line: Q });
    await toReady(checkOf("chk2.sig"));
    await press(startButton());
    expect(server.createDebate.mock.calls[0]![0]).toBe(REWRITE);
    expect(lane()!.startCheck).toEqual({ ref: "chk2.sig", original_question_line: Q });
  });

  it("its 'Edit my question' leads to step 1 with the words untouched", async () => {
    await toStepTwo();
    await emit({ event: "language_offer", data: { offer: OFFER } }, { event: "end", data: { reason: "LANGUAGE_CHOICE" } });
    await click(buttonNamed("Edit my question")!);
    expect(onStepTwo()).toBe(false);
    expect(host!.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(Q);
    expect(server.lists).toHaveLength(1);
  });

  it("a refusal from the lists stream: the check's screen, whose 'Edit my question' leads to step 1 with the words untouched", async () => {
    await toStepTwo();
    await emit({ event: "refused", data: { status: 422, body: { error: QUESTION_NOT_STARTED, message: QUESTION_NOT_STARTED, kind: "WEAPONS",
      screen: "REFUSE", emergency_number: false } } }, { event: "end", data: { reason: "REFUSED" } });
    const dialog = document.querySelector('[data-dialog="question-refusal"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('[data-part="back"]')?.textContent).toBe("Edit my question");
    await click(dialog.querySelector('[data-part="back"]')!);
    expect(document.querySelector('[data-dialog="question-refusal"]')).toBeNull();
    expect(onStepTwo()).toBe(false);
    expect(host!.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(Q);
    expect(server.createDebate).not.toHaveBeenCalled();
  });

  it("ask-f3: crisis words typed while the paths are coming keep Start pressable; the press opens the help screen, which keeps 'Back to my question', and sends nothing", async () => {
    await toStepTwo();
    await type(box(), `${Q}\n\nI want to kill myself tonight.`);
    expect(startButton().disabled).toBe(false);
    await press(startButton());
    const help = document.querySelector('[data-dialog="crisis-support"]')!;
    expect(help).not.toBeNull();
    expect(help.querySelector(".crisisSupportBack")?.textContent).toBe(HOME["home.crisisSupport.back"]);
    expect(HOME["home.crisisSupport.back"]).toBe("Back to my question");
    expect(server.createDebate).not.toHaveBeenCalled();
  });
});

describe("\"Use my words instead\" (ask-f13)", () => {
  it("after an accepted rewrite and a picked answer: the own words come back, read fresh with KEEP_MINE, and Start sends them with the new check", async () => {
    await toStepTwo();
    await emit({ event: "language_offer", data: { offer: OFFER } }, { event: "end", data: { reason: "LANGUAGE_CHOICE" } });
    await click(buttonNamed(NEW_DEBATE["newDebate.languageCheck.use"]!)!);
    await tap("The north.");
    expect(box().value).toBe(`${REWRITE}\n\nWhich region? The north.`);
    const link = buttonNamed("Use my words instead", host!)!;
    expect(link).toBeDefined();
    expect(box().compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click(link);
    expect(box().value).toBe(Q);
    expect(server.lists.filter((call) => call.input.question_language_choice?.choice === "KEEP_MINE")).toHaveLength(1);
    expect(server.lists.at(-1)!.input).toEqual({ question_line: Q, site_language: "en", reading_level: "plain",
      question_language_choice: { check_ref: "offer.sig", choice: "KEEP_MINE" } });
    expect(server.asked.filter((line) => line === Q)).toHaveLength(1);
    expect(host!.querySelector(".v4StartBand")).not.toBeNull();
    expect(document.querySelector('[data-dialog="question-language"]')).toBeNull();
    expect(buttonNamed("Use my words instead", host!)).toBeUndefined();
    expect(buttonNamed("The north.", host!)!.getAttribute("aria-pressed")).toBe("false");
    await toReady(checkOf("chk3.sig"));
    await press(startButton());
    expect(server.createDebate.mock.calls[0]![0]).toBe(Q);
    expect(lane()!.startCheck).toEqual({ ref: "chk3.sig" });
  });
});

describe("refusals at Start (read-d2, answer Q8, read-f17)", () => {
  it("409 START_PATHS_STALE: the read-again line once, and Start greyed", async () => {
    await toStepTwo();
    await toReady();
    server.createDebate.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 409, "START_PATHS_STALE", "START_PATHS_STALE"));
    await press(startButton());
    expect(textCount(READ_AGAIN)).toBe(1);
    expect(startButton().disabled).toBe(true);
  });

  it("409 START_PATHS_NARROWED: the room read again and the narrowed line; Start greyed until two paths are removed", async () => {
    await toStepTwo();
    await toReady();
    server.roomAnswer = () => Promise.resolve(room({ start_step: { lists: "ON", widths: { options: [3], default: 3 }, share_by_paths: [4, 6, 8] } }));
    const reads = server.roomReads;
    server.createDebate.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 409, "START_PATHS_NARROWED", "START_PATHS_NARROWED"));
    await press(startButton());
    expect(server.roomReads).toBeGreaterThan(reads);
    expect(textCount(NARROWED_3)).toBe(1);
    expect(startButton().disabled).toBe(true);
    await removePath(5);
    expect(startButton().disabled).toBe(true);
    await removePath(4);
    expect(textCount(NARROWED_3)).toBe(0);
    expect(startButton().disabled).toBe(false);
  });

  it("read-f17: ALREADY_WAITING with its time: sentence D above the bar, Start greyed, and no refusal line", async () => {
    await toStepTwo();
    await toReady();
    server.roomAnswer = () => Promise.resolve(room({ room: "ALREADY_WAITING", scope: "PERSON_DAY", resets_at: "2026-11-06T08:00:00.000Z",
      waiting_run_ref: "22222222-2222-4222-8222-222222222222" }));
    server.createDebate.mockRejectedValue(new ContractHttpError("UNPROCESSABLE", 422, "ASK_ALREADY_WAITING", "ASK_ALREADY_WAITING"));
    await press(startButton());
    const notice = host!.querySelector('.roomNotice[data-room="ALREADY_WAITING"]')!;
    expect(notice).not.toBeNull();
    expect(notice.compareDocumentPosition(host!.querySelector(".v4StartBar")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(startButton().disabled).toBe(true);
    expect(host!.textContent).not.toContain(CATALOG["v4.askError.alreadyWaiting"]);
    expect(host!.querySelector(".v4AskRefusal")).toBeNull();
  });
});

describe("Make this my question (read-d3, choose-d2)", () => {
  it("the box starts with the card's question and keeps the sentences; Undo restores the words; the lane carries the swap", async () => {
    await toStepTwo();
    await tap("The north.");
    await toReady();
    await tap(CATALOG["v4.start.ways.makeMine"]!);
    expect(box().value).toBe(`${CD1.as_question}\n\nWhich region? The north.`);
    await undo();
    expect(box().value).toBe(NORTH);
    await tap(CATALOG["v4.start.ways.makeMine"]!);
    await press(startButton());
    expect(server.createDebate.mock.calls[0]![0]).toBe(`${CD1.as_question}\n\nWhich region? The north.`);
    expect((lane()!.startPaths as { question_swap?: unknown }).question_swap).toEqual({ card_id: "cd1", original_question_line: Q });
  });
});

describe("the switch, the language, the plan and the carry-on box", () => {
  it("the start step off: no card, Start works at once, the R22 line and no lane", async () => {
    server.roomAnswer = () => Promise.resolve(room({ start_step: undefined }));
    const page = await toStepTwo();
    expect(page.querySelector(".v4StartCard")).toBeNull();
    expect(server.lists).toHaveLength(0);
    await tap("The north.");
    expect(startButton().disabled).toBe(false);
    await press(startButton());
    expect(server.createDebate.mock.calls[0]![0]).toBe(NORTH);
    expect(server.createDebate.mock.calls[0]![6]).toEqual({ answers: [{ question: "Which region?", answer: "The north." }] });
    expect(lane()).toBeUndefined();
  });

  it("the lists post carries the site's language", async () => {
    await toStepTwo("ro");
    expect(server.lists[0]!.input.site_language).toBe("ro");
  });

  it("Free: the notice directly above Start, and three paths", async () => {
    server.roomAnswer = () => Promise.resolve(FREE_ROOM);
    const page = await toStepTwo();
    const notice = page.querySelector(".v4StartBar .v4AskPublicNotice")!;
    expect(notice.textContent).toBe(NOTICE);
    expect(notice.nextElementSibling?.contains(startButton())).toBe(true);
    expect(page.querySelector(".v4StartBarGet")?.textContent).toBe("You'll get: a plain answer from 3 paths.");
    await toReady();
    expect(rows()).toHaveLength(3);
  });

  it("CARRY_ON_BUILT false: no box, and no lane carries the carry-on", async () => {
    carry.built = false;
    const page = await toStepTwo();
    await toReady();
    expect(page.querySelector(".v4StartBarCarryOn")).toBeNull();
    await press(startButton());
    expect(lane()).not.toHaveProperty("carryOnToReport");
  });

  it("CARRY_ON_BUILT true: the box, and a ticked box goes with Start", async () => {
    const page = await toStepTwo();
    await toReady();
    const tick = page.querySelector<HTMLInputElement>(".v4StartBarCarryOn input")!;
    await click(tick);
    await press(startButton());
    expect(lane()!.carryOnToReport).toBe(true);
  });
});
