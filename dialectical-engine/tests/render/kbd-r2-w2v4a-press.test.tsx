// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";
import { ContractHttpError, QUESTION_NOT_STARTED, warmCrisisCheck } from "@debateai/contract";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (V4A-1): Next, Start and step 1's "Just answer it" under the site's focus guard, when
 * their press ends without moving on (a declined consent, a plan that still cannot be read). The page, its hooks, the real
 * consent window and the guard are the real ones, with the stand-ins of v4-ask-next.test.tsx (copied, so that file stays as
 * it is). Made-up texts only.
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
// A press of Start or "Just answer it" waits out its Undo window before the send; here the window is 0 and `sent` lets
// its timer run (the window itself: tests/render/v4-start-undo.test.tsx).
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
  host.id = "main-content";
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

// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
let stopGuard: () => void = () => undefined;
beforeEach(() => { stopGuard = guarded ? startFocusGuard() : installFocusFixup(); });
afterEach(() => { stopGuard(); });

async function keyPress(target: HTMLElement): Promise<void> {
  pressByKeyboard(target);
  await settle();
}
async function keyDecline(): Promise<void> {
  await keyPress(document.querySelector<HTMLButtonElement>('[data-dialog="sensitive-data-consent"] .sensitiveConsentDecline')!);
  await guardSettled();
  await settle();
}
const startButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4StartBarStart")!;
/** The next Tab stop after `from` among the page's buttons, links and fields (jsdom has no Tab). */
function nextStop(from: Element): Element | undefined {
  const all = [...document.querySelectorAll<HTMLElement>("button, a[href], textarea, input")]
    .filter((one) => !(one as HTMLButtonElement).disabled && one.tabIndex >= 0 && one.closest("[hidden]") === null);
  return all.find((one) => from.compareDocumentPosition(one) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("V4A-1: a press that ends without moving on hands focus back to the pressed button", () => {
  it("Next, consent declined: focus is on Next again (switched off while the window was up); the next Tab is 'Show it again'", async () => {
    await mount();
    await keyPress(nextButton());
    expect(consentOpen()).toBe(true);
    expect(nextButton().disabled, "Next is switched off while the window is up").toBe(true);
    await keyDecline();
    expect(consentOpen()).toBe(false);
    expect(document.activeElement).toBe(nextButton());
    expect(nextStop(nextButton())?.textContent).toBe(CATALOG["v4.ask.consentShowAgain"]);
  });

  it("Next, consent window closed with Escape: the same", async () => {
    await mount();
    await keyPress(nextButton());
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await settle();
    await guardSettled();
    expect(consentOpen()).toBe(false);
    expect(document.activeElement).toBe(nextButton());
  });

  it("step 1's 'Just answer it', consent declined: focus is on 'Just answer it' again", async () => {
    await mount();
    await keyPress(justButton());
    expect(consentOpen()).toBe(true);
    await keyDecline();
    expect(document.activeElement).toBe(justButton());
  });

  // The press's own plan read answers later, as over a network: its button is switched off while it reads.
  let failRead: () => void = () => undefined;
  const lateFailure = (read: number): Promise<unknown> => read <= 2 ? down()
    : new Promise((_resolve, reject) => { failRead = () => reject(new Error("SERVER_FAILURE")); });
  async function readFails(): Promise<void> {
    await act(async () => { failRead(); });
    await settle();
    await guardSettled();
  }

  it("step 1's 'Just answer it' with the plan unread and its read failing: focus is back on it, the plan line right under", async () => {
    server.roomAnswer = lateFailure;
    await mount();
    server.consent = "given";
    await keyPress(justButton());
    await guardSettled();
    expect(justButton().disabled, "switched off while it reads the plan").toBe(true);
    await readFails();
    expect(host!.textContent).toContain(CATALOG["v4.ask.planUnknown"]);
    expect(document.activeElement).toBe(justButton());
  });

  it("Start with the plan unread and its read failing: focus is back on Start once the 'could not check' line shows", async () => {
    server.roomAnswer = lateFailure;
    await toStepTwo();
    await keyPress(startButton());
    await guardSettled();
    expect(startButton().disabled, "switched off while it reads the plan").toBe(true);
    await readFails();
    expect(host!.textContent).toContain(CATALOG["v4.ask.planUnknown"]);
    expect(server.createDebate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(startButton());
  });
});

describe("V4A-1 (the orchestrator's question): Back on a refused question", () => {
  const notStarted = () => new ContractHttpError("UNPROCESSABLE", 422, QUESTION_NOT_STARTED, QUESTION_NOT_STARTED, null, null, null,
    { kind: "DRUGS", screen: "REFUSE", emergencyNumber: false });
  const refusalOpen = (): boolean => document.querySelector('[data-dialog="question-refusal"]') !== null;

  it("Start refused by the question check, then Back: focus is on Start again, on step 2 with the question in its box", async () => {
    server.createDebate.mockRejectedValue(notStarted());
    // No start step on this site, so Start sends the ask itself (as v4-question-check-refusal.test.tsx has it).
    server.roomAnswer = () => Promise.resolve(room({ start_step: undefined }));
    await toStepTwo();
    await keyPress(startButton());
    await sent();
    await guardSettled();
    expect(refusalOpen()).toBe(true);
    await keyPress(document.querySelector<HTMLButtonElement>('[data-dialog="question-refusal"] [data-part="back"]')!);
    await guardSettled();
    await settle();
    expect(refusalOpen()).toBe(false);
    expect(onStepTwo()).toBe(true);
    expect(document.activeElement).toBe(startButton());
  });
});
