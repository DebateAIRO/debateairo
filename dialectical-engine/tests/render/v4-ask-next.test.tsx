// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, warmCrisisCheck } from "@debateai/contract";

/*
 * V4 start step, Task 70b (spec 2026-11-03 §2 items 1-2; read-f13, ask-f9, r2-4, chat-just-answer-it, ask-f2, choose-f3,
 * read-f14, read-d2, owner answer Q1; 4 Nov night: ask-f3, ask-f8, ask-f17, read-f1, read-f3, read-f17): what Next does.
 * Crisis words get the help screen first, whatever their length and whatever greys the buttons; a second press does nothing;
 * the one-time consent comes before any reading, a no keeps the person on step 1 with one line right under Next; "Reading…"
 * shows only after the yes, then step 2 opens; the question is read once, at Next (the clarifying questions and the lists),
 * and nothing on step 2 is read again; Enter presses Next on a computer; the grey quota line under Next on every visit; the
 * plan still loading reads "Getting ready…"; a plan read that failed twice shows the Free notice; when the room notice says
 * one question already waits (sentence D), no second line. The hooks, the pop-ups and the room notice are the real ones;
 * only the session and the server are stood in.
 */
const gate = vi.hoisted(() => ({ session: "IN" as "CHECKING" | "IN" | "OUT" }));
const server = vi.hoisted(() => ({
  /** Each room read's answer; the default is a Plus room with the start step on. */
  roomAnswer: (_read: number): Promise<unknown> => Promise.resolve(null),
  roomReads: 0,
  consent: "required" as "required" | "given",
  consentReads: 0,
  clarifyAnswer: (_line: string, _signal?: AbortSignal): Promise<unknown> => Promise.resolve({ source: "NONE" }),
  asked: [] as string[],
  lists: [] as Array<Record<string, unknown>>,
  createDebate: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ id: "11111111-1111-4111-8111-111111111111" }))
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: string) => ReactNode }) => children(gate.session) }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
// V4 start step, Task 76b: a press of Start or "Just answer it" waits its 10-second Undo window before the send; here the
// window is 0 and `sent` lets its timer run (the 10 seconds themselves: tests/render/v4-start-undo.test.tsx).
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
    readSensitiveDataConsent: async () => {
      server.consentReads += 1;
      return { status: server.consent };
    },
    giveSensitiveDataConsent: async () => {
      server.consent = "given";
      return { status: "given" };
    },
    clarifyAsk: async (input: { question_line: string }, signal?: AbortSignal) => {
      server.asked.push(input.question_line);
      return server.clarifyAnswer(input.question_line, signal);
    },
    startPathLists: (input: Record<string, unknown>, _onEvent: unknown, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
      server.lists.push(input);
      signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    })
  }
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { useV4Ask } from "../../apps/ui/lib/v4/useV4Ask.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// The crisis patterns are compiled before the page mounts, as the page's idle warm-up does in a browser.
warmCrisisCheck();

const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const HOME = messages("home");
const NEW_DEBATE = messages("newDebate");
const BILLING = messages("billing");

const QUESTION = "Should Romania build new nuclear plants?";
const OTHER_QUESTION = "Should Bulgaria build new nuclear plants?";
/** 60 characters (ask-f3: crisis help whatever the length). */
const CRISIS_LONG = "I want to kill myself tonight and I do not know who to tell.";
/** 4 characters. */
const CRISIS_SHORT = "死にたい";
const NOTICE = "On the Free plan your question and its debate are public. Don't include personal details.";
const JUST_ANSWER = "Just answer it: skip the questions, the AIs choose what to look into.";
const QUOTA_LINE = "Reading your question uses a little of your quota.";
const DECLINED = "No AI reads your question without your OK. You can agree at any time.";
const OLD_DECLINED = "You can't start a debate without this consent";
const AI = { source: "AI", questions: [{ text: "Which region?", answers: ["The north", "The south"] }] };

const START_STEP = { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [4, 6, 8, 10, 12, 14, 16] };
const room = (over: Record<string, unknown> = {}) => ({
  room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", start_step: START_STEP, ...over
});
const QUOTA_USED = room({ room: "FULL", scope: "PERSON_DAY", resets_at: "2026-11-06T08:00:00.000Z", new_starts: "BLOCKED_UNTIL_RESET" });
const WAITING = room({ room: "ALREADY_WAITING", scope: null, resets_at: "2026-11-06T08:00:00.000Z", waiting_run_ref: "22222222-2222-4222-8222-222222222222" });
const never = (): Promise<unknown> => new Promise(() => undefined);
const down = (): Promise<unknown> => Promise.reject(new Error("SERVER_FAILURE"));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  gate.session = "IN";
  server.roomAnswer = () => Promise.resolve(room());
  server.roomReads = 0;
  server.consent = "required";
  server.consentReads = 0;
  server.clarifyAnswer = () => Promise.resolve(AI);
  server.asked = [];
  server.lists = [];
  server.createDebate.mockReset();
  server.createDebate.mockImplementation(async () => ({ id: "11111111-1111-4111-8111-111111111111" }));
  window.history.replaceState(null, "", "/v4");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
});

/** Lets every pending read answer (each round is one more step of a chain: a read, its re-render, the read it starts). */
async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
  }
}

async function mount(question = QUESTION): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4AskClient catalog={CATALOG} homeCatalog={HOME} newDebateCatalog={NEW_DEBATE} billingCatalog={BILLING} locale="en"
      crisisCountryHint={null} initialQuestion={question} initialLevel="plain" />
  ));
  await settle();
  return host;
}

const buttons = (): HTMLButtonElement[] => [...host!.querySelectorAll("button")];
const button = (name: string): HTMLButtonElement | undefined => buttons().find((candidate) => candidate.textContent?.trim() === name);
const nextButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4AskActions .v4BtnPrimary")!;
const justButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4AskActions .v4AskJust")!;
const field = (): HTMLTextAreaElement => host!.querySelector("textarea")!;
const onStepTwo = (): boolean => host!.querySelector(".v4AskReadTitle") !== null;
const consentOpen = (): boolean => document.querySelector('[data-dialog="sensitive-data-consent"]') !== null;
const helpOpen = (): boolean => document.querySelector('[data-dialog="crisis-support"]') !== null;

async function click(target: HTMLElement): Promise<void> {
  await act(async () => { target.click(); });
  await settle();
}

/** Task 76b: after a press, its Undo window (0 here) runs out and what it sends settles. */
async function sent(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  await settle();
}

/** A press the browser would not deliver (the button is greyed): the page's own handler, called directly. */
async function forceClick(target: HTMLElement): Promise<void> {
  const key = Object.keys(target).find((name) => name.startsWith("__reactProps$"))!;
  const props = (target as unknown as Record<string, { onClick?: (event: unknown) => void }>)[key]!;
  await act(async () => { props.onClick?.({ preventDefault: () => undefined, stopPropagation: () => undefined }); });
  await settle();
}

async function type(target: HTMLTextAreaElement, text: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(target, text);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Presses a key in the step-1 box; answers whether the page stopped the browser's own action (a new line). */
async function key(init: KeyboardEventInit & { keyCode?: number }): Promise<boolean> {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  if (init.keyCode !== undefined) Object.defineProperty(event, "keyCode", { value: init.keyCode });
  let stopped = false;
  await act(async () => { stopped = !field().dispatchEvent(event); });
  await settle();
  return stopped;
}

async function agree(): Promise<void> {
  await click(document.querySelector<HTMLButtonElement>('[data-dialog="sensitive-data-consent"] .policyPrimary')!);
}
async function decline(): Promise<void> {
  await click(document.querySelector<HTMLButtonElement>('[data-dialog="sensitive-data-consent"] .sensitiveConsentDecline')!);
}

/** Next with the consent already given: step 2 opens. */
async function toStepTwo(question = QUESTION): Promise<HTMLDivElement> {
  server.consent = "given";
  const page = await mount(question);
  await click(nextButton());
  expect(onStepTwo()).toBe(true);
  return page;
}

describe("Next: crisis help first, whatever the length (ask-f3)", () => {
  it.each([["a 60-character message", CRISIS_LONG], ["a 4-character one", CRISIS_SHORT]])("%s: the help screen, and nothing else", async (_name, words) => {
    if (words === CRISIS_LONG) expect(words).toHaveLength(60);
    else expect(words).toHaveLength(4);
    await mount(words);
    await click(nextButton());
    expect(helpOpen()).toBe(true);
    expect(server.consentReads).toBe(0);
    expect(consentOpen()).toBe(false);
    expect(server.asked).toEqual([]);
    expect(server.lists).toEqual([]);
    expect(onStepTwo()).toBe(false);
  });

  it("with the plan still loading, both buttons stay pressable for the help screen, read their usual words, and the press reads nothing", async () => {
    server.roomAnswer = never;
    await mount(CRISIS_LONG);
    expect(nextButton().disabled).toBe(false);
    expect(nextButton().textContent).toBe("Next");
    expect(justButton().disabled).toBe(false);
    expect(justButton().textContent).toBe(JUST_ANSWER);
    const reads = server.roomReads;
    await click(justButton());
    expect(helpOpen()).toBe(true);
    expect(server.consentReads).toBe(0);
    expect(server.asked).toEqual([]);
    expect(server.lists).toEqual([]);
    expect(server.roomReads).toBe(reads);
    expect(server.createDebate).not.toHaveBeenCalled();
  });

  it("the same with the quota used up", async () => {
    server.roomAnswer = () => Promise.resolve(QUOTA_USED);
    await mount(CRISIS_LONG);
    expect(nextButton().disabled).toBe(false);
    expect(justButton().disabled).toBe(false);
    const reads = server.roomReads;
    await click(nextButton());
    expect(helpOpen()).toBe(true);
    expect([server.consentReads, server.asked.length, server.lists.length, server.roomReads - reads]).toEqual([0, 0, 0, 0]);
  });

  it("the same while the session is still being checked", async () => {
    gate.session = "CHECKING";
    await mount(CRISIS_LONG);
    expect(nextButton().disabled).toBe(false);
    expect(justButton().disabled).toBe(false);
    const reads = server.roomReads;
    await click(nextButton());
    expect(helpOpen()).toBe(true);
    expect([server.consentReads, server.asked.length, server.lists.length, server.roomReads - reads]).toEqual([0, 0, 0, 0]);
  });

  it("the same with a 4-character message while the plan is loading", async () => {
    server.roomAnswer = never;
    await mount(CRISIS_SHORT);
    expect(nextButton().textContent).toBe("Next");
    expect(nextButton().disabled).toBe(false);
    await click(nextButton());
    expect(helpOpen()).toBe(true);
    expect([server.consentReads, server.asked.length, server.lists.length]).toEqual([0, 0, 0]);
  });
});

describe("Next: one press, the consent before any reading (read-f13, ask-f9, answer Q1, ask-f8)", () => {
  it("pressed twice within 50 ms: one consent read, one clarifying call, one lists post", async () => {
    await mount();
    await act(async () => { nextButton().click(); nextButton().click(); });
    await settle();
    await click(nextButton());
    expect(server.consentReads).toBe(1);
    await agree();
    expect(onStepTwo()).toBe(true);
    expect(server.asked).toEqual([QUESTION]);
    expect(server.lists).toHaveLength(1);
    expect(server.lists[0]).toEqual({ question_line: QUESTION, site_language: "en", reading_level: "plain" });
  });

  it("while the consent window is open Next is busy and still reads Next; after the yes it reads Reading…, then step 2's heading has focus", async () => {
    await mount();
    const next = nextButton();
    await click(next);
    expect(consentOpen()).toBe(true);
    expect(next.getAttribute("aria-busy")).toBe("true");
    expect(next.disabled).toBe(true);
    expect(next.textContent).toBe("Next");
    expect(server.asked).toEqual([]);
    await agree();
    // The step-1 button, now gone from the page, read "Reading…" before step 2 took its place.
    expect(next.isConnected).toBe(false);
    expect(next.textContent).toBe("Reading…");
    expect(document.activeElement).toBe(host!.querySelector(".v4AskReadTitle"));
  });

  it("declined: step 1 stays with the line right under Next, nothing is read; Show it again reopens the window, and a yes opens step 2", async () => {
    const page = await mount();
    await click(nextButton());
    await decline();
    expect(onStepTwo()).toBe(false);
    expect(field().value).toBe(QUESTION);
    expect(server.asked).toEqual([]);
    expect(server.lists).toEqual([]);
    const line = page.querySelector(".v4AskDeclined")!;
    expect(line.textContent).toContain(DECLINED);
    // ask-f8: the old bottom line is not on the ask page.
    expect(page.querySelector(".sensitiveConsentDeclined")).toBeNull();
    expect(document.body.textContent).not.toContain(OLD_DECLINED);
    // Right after Next, before "Just answer it".
    expect(nextButton().compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.compareDocumentPosition(justButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click(button(CATALOG["v4.ask.consentShowAgain"]!)!);
    expect(consentOpen()).toBe(true);
    expect(server.consentReads).toBe(2);
    await agree();
    expect(onStepTwo()).toBe(true);
    expect(document.activeElement).toBe(page.querySelector(".v4AskReadTitle"));
    expect(server.asked).toEqual([QUESTION]);
  });

  it("'Just answer it' declined on step 1: the same line under Next, nothing sent", async () => {
    const page = await mount();
    await click(justButton());
    expect(consentOpen()).toBe(true);
    await decline();
    expect(page.querySelector(".v4AskDeclined")?.textContent).toContain(DECLINED);
    expect(page.querySelector(".sensitiveConsentDeclined")).toBeNull();
    expect(server.createDebate).not.toHaveBeenCalled();
  });
});

describe("the plan (ask-f2, read-f3)", () => {
  it("still loading: both buttons read Getting ready… and wait; the box takes typing", async () => {
    server.roomAnswer = never;
    await mount("");
    expect(nextButton().textContent).toBe(CATALOG["v4.ask.gettingReady"]);
    expect(nextButton().disabled).toBe(true);
    expect(justButton().textContent).toBe(CATALOG["v4.ask.gettingReady"]);
    expect(justButton().disabled).toBe(true);
    await type(field(), "Should");
    expect(field().value).toBe("Should");
  });

  // Task 76b (read-f3, the coordinator's ruling of 4 Nov night): the same setup; the press now reads the plan once more first.
  // The notice's flag goes only when that read names FREE; with that read failing too, nothing is sent.
  it("a room read failing twice: the Free notice shows; 'Just answer it' reads the plan first and sends that it was shown when the read names FREE", async () => {
    server.roomAnswer = down;
    await mount();
    expect(server.roomReads).toBe(2);
    expect(host!.querySelector(".v4AskPublicNotice")?.textContent).toBe(NOTICE);
    expect(nextButton().textContent).toBe("Next");
    server.consent = "given";
    server.roomAnswer = () => Promise.resolve(room({ plan_id: "FREE", start_step: undefined }));
    await click(justButton());
    await sent();
    expect(server.roomReads).toBe(3);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.createDebate.mock.calls[0]![7]).toEqual({ freePublicNotice: true });
  });

  it("a room read failing twice, and the press's read too: 'Just answer it' sends nothing and says the plan could not be checked", async () => {
    server.roomAnswer = down;
    await mount();
    server.consent = "given";
    await click(justButton());
    await sent();
    expect(server.roomReads).toBe(3);
    expect(server.createDebate).not.toHaveBeenCalled();
    expect(host!.textContent).toContain(CATALOG["v4.ask.planUnknown"]);
  });

  it("a room read failing twice: Start reads the plan first too, and sends the notice's flag when the read names FREE", async () => {
    server.roomAnswer = down;
    await toStepTwo();
    // Task 76: step 2's Start is the start bar's, with the notice directly above it.
    expect(host!.querySelector(".v4StartBar .v4AskPublicNotice")?.textContent).toBe(NOTICE);
    server.roomAnswer = () => Promise.resolve(room({ plan_id: "FREE", start_step: undefined }));
    await click(button(CATALOG["v4.start.start"]!)!);
    await sent();
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.createDebate.mock.calls[0]![7]).toEqual({ freePublicNotice: true });
  });

  // Review of Task 70b (ask-f2): one failed read is tried again; when that read answers, the plan is known and the buttons
  // work (never "Getting ready…" for good). A Free room keeps the room's query as it was, so no other read can hide it.
  it("one failed read, then the second answers: the plan is known, both buttons read their words", async () => {
    server.roomAnswer = (read) => read === 1 ? down() : Promise.resolve(room({ plan_id: "FREE" }));
    await mount();
    expect(server.roomReads).toBe(2);
    expect(nextButton().textContent).toBe("Next");
    expect(nextButton().disabled).toBe(false);
    expect(justButton().textContent).toBe(JUST_ANSWER);
    expect(justButton().disabled).toBe(false);
    expect(host!.querySelector(".v4AskPublicNotice")?.textContent).toBe(NOTICE);
  });

  it("a known Plus plan whose later read fails: no notice, no flag", async () => {
    server.roomAnswer = (read) => read === 1 ? Promise.resolve(room()) : down();
    await toStepTwo();
    expect(server.roomReads).toBeGreaterThan(1);
    expect(host!.querySelector(".v4AskPublicNotice")).toBeNull();
    await click(button(CATALOG["v4.start.start"]!)!);
    await sent();
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.createDebate.mock.calls[0]![7]).toBeUndefined();
  });

  it("read-f3: one failed read is not enough; after the second the hook says FAILED, not Free, and the notice shows", async () => {
    const failReads: Array<(error: unknown) => void> = [];
    server.roomAnswer = () => new Promise((_resolve, reject) => { failReads.push(reject); });
    let ask: ReturnType<typeof useV4Ask> | null = null;
    function Probe(): ReactNode {
      ask = useV4Ask({ catalog: CATALOG, homeCatalog: HOME, newDebateCatalog: NEW_DEBATE, locale: "en", crisisCountryHint: null, mode: "quick", readingLevel: "plain" });
      return null;
    }
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<Probe />));
    await settle();
    expect([server.roomReads, ask!.planState, ask!.freePublicNotice]).toEqual([1, "LOADING", false]);
    await act(async () => { failReads[0]!(new Error("SERVER_FAILURE")); });
    await settle();
    expect([server.roomReads, ask!.planState, ask!.freePublicNotice]).toEqual([2, "LOADING", false]);
    await act(async () => { failReads[1]!(new Error("SERVER_FAILURE")); });
    await settle();
    expect(server.roomReads).toBe(2);
    expect(ask!.planState).toBe("FAILED");
    expect(ask!.planIsFree).toBe(false);
    expect(ask!.freePublicNotice).toBe(true);
  });

  it("read-f3: a Free plan the server named is Free, and known", async () => {
    server.roomAnswer = () => Promise.resolve(room({ plan_id: "FREE" }));
    let ask: ReturnType<typeof useV4Ask> | null = null;
    function Probe(): ReactNode {
      ask = useV4Ask({ catalog: CATALOG, homeCatalog: HOME, newDebateCatalog: NEW_DEBATE, locale: "en", crisisCountryHint: null, mode: "quick", readingLevel: "plain" });
      return null;
    }
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<Probe />));
    await settle();
    expect([ask!.planState, ask!.planIsFree, ask!.freePublicNotice]).toEqual(["KNOWN", true, true]);
    let fresh: unknown = null;
    await act(async () => { fresh = await ask!.refreshRoom(); });
    expect(fresh).toMatchObject({ plan_id: "FREE" });
  });
});

describe("the lines under Next (r2-4, chat-just-answer-it)", () => {
  it("the grey quota line on a fresh mount and again after Back; 'Just answer it' in the record's words", async () => {
    const page = await toStepTwo();
    await click(page.querySelector<HTMLButtonElement>(".v4AskBack")!);
    expect(onStepTwo()).toBe(false);
    expect(page.querySelector(".v4AskQuotaNote")?.textContent).toBe(QUOTA_LINE);
    expect(justButton().textContent).toBe(JUST_ANSWER);
    await act(async () => root?.unmount());
    host?.remove();
    const fresh = await mount();
    expect(fresh.querySelector(".v4AskQuotaNote")?.textContent).toBe(QUOTA_LINE);
    expect(justButton().compareDocumentPosition(fresh.querySelector(".v4AskQuotaNote")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the quota used up: Next is greyed, and a forced press opens no step 2 and asks nothing", async () => {
    server.roomAnswer = () => Promise.resolve(QUOTA_USED);
    server.consent = "given";
    await mount();
    expect(nextButton().disabled).toBe(true);
    expect(justButton().disabled).toBe(true);
    await forceClick(nextButton());
    await forceClick(justButton());
    expect(onStepTwo()).toBe(false);
    expect([server.consentReads, server.asked.length, server.lists.length]).toEqual([0, 0, 0]);
    expect(server.createDebate).not.toHaveBeenCalled();
  });
});

describe("read once, at Next (read-f14, read-d2, choose-d2)", () => {
  it("step 2 asks at once with the read line: no timer runs first", async () => {
    vi.useFakeTimers();
    await toStepTwo();
    expect(server.asked).toEqual([QUESTION]);
    expect(server.lists).toHaveLength(1);
  });

  it("typing into the step-2 box asks nothing again, however long it waits", async () => {
    await toStepTwo();
    vi.useFakeTimers();
    const box = host!.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")!;
    expect(box.value).toBe(QUESTION);
    await type(box, `${QUESTION}\n\nAlso the cost to households.`);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(box.value).toBe(`${QUESTION}\n\nAlso the cost to households.`);
    expect(server.asked).toEqual([QUESTION]);
    expect(server.lists).toHaveLength(1);
  });

  it("Back, the same words, Next: step 2 as it was, with no new call", async () => {
    const page = await toStepTwo();
    const box = page.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")!;
    await type(box, `${QUESTION}\n\nAlso the cost to households.`);
    await click(page.querySelector<HTMLButtonElement>(".v4AskBack")!);
    expect(field().value).toBe(QUESTION);
    await click(nextButton());
    expect(onStepTwo()).toBe(true);
    expect(page.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")!.value).toBe(`${QUESTION}\n\nAlso the cost to households.`);
    expect(server.asked).toEqual([QUESTION]);
    expect(server.lists).toHaveLength(1);
  });

  /** A clarifying answer the test gives by hand; like a real request, it fails once its signal is aborted. */
  function heldClarify(): { give: (value: unknown) => void } {
    const held = { give: (_value: unknown): void => undefined };
    server.clarifyAnswer = (_line, signal) => new Promise((resolve, reject) => {
      held.give = resolve;
      signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    });
    return held;
  }

  // Review of Task 70b (read-d2, ask-f12: "Next with the same words brings back the same questions"): Back while the
  // clarifying questions are still being asked stops nothing, so Next with the same words waits for that one call.
  it("Back while the questions are still being asked, the same words, Next: no new call, and the questions arrive", async () => {
    const held = heldClarify();
    const page = await toStepTwo();
    expect(server.asked).toEqual([QUESTION]);
    await click(page.querySelector<HTMLButtonElement>(".v4AskBack")!);
    await click(nextButton());
    expect(onStepTwo()).toBe(true);
    expect(server.asked).toEqual([QUESTION]);
    await act(async () => { held.give(AI); });
    await settle();
    expect(page.textContent).toContain("Which region?");
    expect(server.asked).toEqual([QUESTION]);
  });

  it("the questions arrive while the person is back on step 1: Next with the same words shows them, with no new call", async () => {
    const held = heldClarify();
    const page = await toStepTwo();
    await click(page.querySelector<HTMLButtonElement>(".v4AskBack")!);
    await act(async () => { held.give(AI); });
    await settle();
    await click(nextButton());
    expect(onStepTwo()).toBe(true);
    expect(page.textContent).toContain("Which region?");
    expect(server.asked).toEqual([QUESTION]);
  });

  it("Back, changed words, Next: one clarifying call at once and one lists post, with the new line; a fresh box", async () => {
    const page = await toStepTwo();
    await click(page.querySelector<HTMLButtonElement>(".v4AskBack")!);
    await type(field(), OTHER_QUESTION);
    await click(nextButton());
    expect(server.asked).toEqual([QUESTION, OTHER_QUESTION]);
    expect(server.lists.map((post) => post.question_line)).toEqual([QUESTION, OTHER_QUESTION]);
    expect(page.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")!.value).toBe(OTHER_QUESTION);
  });
});

describe("Enter presses Next on a computer (ask-f17)", () => {
  it("Enter with a question: one consent read and step 2, and no new line in the box", async () => {
    await mount();
    expect(await key({ key: "Enter" })).toBe(true);
    expect(server.consentReads).toBe(1);
    expect(field().value).toBe(QUESTION);
    await agree();
    expect(onStepTwo()).toBe(true);
  });

  it("Shift+Enter makes a new line and presses nothing", async () => {
    await mount();
    expect(await key({ key: "Enter", shiftKey: true })).toBe(false);
    expect(server.consentReads).toBe(0);
    expect(consentOpen()).toBe(false);
  });

  it("while a word is being composed, Enter is the typing helper's", async () => {
    await mount();
    expect(await key({ key: "Enter", isComposing: true })).toBe(false);
    expect(await key({ key: "Enter", keyCode: 229 })).toBe(false);
    expect(server.consentReads).toBe(0);
  });

  it("on a phone, Enter keeps its new line and presses nothing", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true, value: (query: string) => ({ matches: query === "(pointer: coarse)", media: query, addEventListener: () => undefined, removeEventListener: () => undefined })
    });
    await mount();
    expect(await key({ key: "Enter" })).toBe(false);
    expect(server.consentReads).toBe(0);
  });

  it("on an empty box Enter does nothing and adds no line", async () => {
    await mount("");
    expect(await key({ key: "Enter" })).toBe(true);
    expect(field().value).toBe("");
    expect(server.consentReads).toBe(0);
  });

  it("Enter twice within 50 ms: one consent read", async () => {
    await mount();
    const first = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    const second = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => { field().dispatchEvent(first); field().dispatchEvent(second); });
    await settle();
    expect(server.consentReads).toBe(1);
  });

  it("Enter with crisis words while the plan loads: the help screen", async () => {
    server.roomAnswer = never;
    await mount(CRISIS_LONG);
    expect(await key({ key: "Enter" })).toBe(true);
    expect(helpOpen()).toBe(true);
    expect(server.consentReads).toBe(0);
  });
});

describe("one line, never both, while one question already waits (read-f17)", () => {
  it("sentence D once; Next and 'Just answer it' greyed and described by it; a forced press reads nothing and adds no refusal", async () => {
    server.roomAnswer = () => Promise.resolve(WAITING);
    const page = await mount();
    const notices = [...page.querySelectorAll(".roomNotice")];
    expect(notices).toHaveLength(1);
    expect(notices[0]!.textContent).toContain("One question can wait at a time.");
    expect(nextButton().disabled).toBe(true);
    expect(justButton().disabled).toBe(true);
    const described = (element: Element): string => (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? "").join(" | ");
    expect(described(nextButton())).toContain("One question can wait at a time.");
    expect(described(justButton())).toContain("One question can wait at a time.");
    await forceClick(nextButton());
    await forceClick(justButton());
    expect([server.consentReads, server.asked.length, server.lists.length]).toEqual([0, 0, 0]);
    expect(server.createDebate).not.toHaveBeenCalled();
    expect(page.textContent).not.toContain("One question is already waiting for a free spot");
  });

  it("the server says so at the press: the room read again shows sentence D, and no refusal line beside it", async () => {
    server.consent = "given";
    server.createDebate.mockImplementation(async () => {
      // From now on the room says one question waits, with its time.
      server.roomAnswer = () => Promise.resolve(WAITING);
      throw new ContractHttpError("UNPROCESSABLE", 422, "ASK_ALREADY_WAITING: ASK_ALREADY_WAITING", "ASK_ALREADY_WAITING");
    });
    const page = await mount();
    await click(justButton());
    await sent();
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(page.querySelectorAll(".roomNotice")).toHaveLength(1);
    expect(page.textContent).not.toContain("One question is already waiting for a free spot");
  });

  it("ALREADY_WAITING with no time (no sentence D): the refusal line shows after a press, as today", async () => {
    server.consent = "given";
    server.roomAnswer = () => Promise.resolve(room({ room: "ALREADY_WAITING", resets_at: null }));
    const page = await mount();
    expect(page.querySelector(".roomNotice")).toBeNull();
    expect(justButton().disabled).toBe(false);
    await click(justButton());
    await sent();
    expect(page.querySelector(".v4AskRefusal")?.textContent).toBe(CATALOG["v4.askError.alreadyWaiting"]);
  });
});
