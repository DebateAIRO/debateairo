// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * V4 start step, Task 76g (read-f1, owner "All in this build", 4 Nov night; read-d3): after Back, new words and Next, the new
 * reading keeps the person's answers where it can. At Next the box holds the new words with the answers' sentences at once,
 * and the clarifying call is told the earlier questions and answers (`earlier`). When the reading lands, an answer it offers
 * again sits under its new question, its sentence untouched; a typed answer stays under its own question's words; an answer
 * it no longer offers is set aside where its question was ("Set aside: To 2035 · Put it back"), out of the box and the purpose
 * lines, until put back. A reading that brings nothing back keeps the earlier questions and answers exactly. Back with the same
 * words asks nothing. The page is the real one; the session, the consent, the plan and the server are stood in. Every text is
 * made up.
 */
const tier = vi.hoisted(() => ({ value: "premium" as "free" | "premium" }));
const submitted = vi.hoisted(() => ({ calls: [] as unknown[][] }));
const clarify = vi.hoisted(() => ({
  requests: [] as unknown[],
  answer: (_line: string): Promise<unknown> => Promise.resolve({ source: "NONE" })
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => ReactNode }) => children("IN") }));
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null, alreadyWaitingShown: () => false }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
vi.mock("@/lib/api", () => ({ contractClient: { readAnswerIndex: async () => ({ items: [], open_runs: [] }),
  clarifyAsk: async (input: { question_line: string }) => { clarify.requests.push(input); return clarify.answer(input.question_line); } } }));
// Start waits out its Undo window before the send; here the window is 0.
vi.mock("@/lib/v4/startUndo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/v4/startUndo.js")>()), START_UNDO_MS: 0
}));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: () => ({ planTier: tier.value, planIsFree: tier.value === "free", planState: "KNOWN",
    submit: async (...args: unknown[]) => { submitted.calls.push(args); return { kind: "STOPPED" }; }, ensureConsent: async () => true,
    flagsCrisis: () => false, offerCrisisHelp: () => false, room: null, submitting: false, dialogs: null })
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { ASK_CLARIFY_PAGE_WAIT_MS } from "../../apps/ui/lib/v4/useAskClarify.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const NEW_DEBATE = messages("newDebate");

const Q1 = "Should the town build a second pier?";
const Q2 = "Should the town build a second pier by the old harbour?";
const OVER = { text: "Over what time?", answers: ["To 2035", "To 2050"] };
const REGION = { text: "Which region?", answers: ["The north", "The south"] };
const PURPOSE = { text: "What do you want it for?", answers: ["To vote", "To teach"] };
const FIRST = { source: "AI", questions: [OVER, REGION], purpose: PURPOSE };
const SET_ASIDE = "Set aside: To 2035";
const PUT_BACK = "Put it back";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
/** The second reading's answer, held until a case gives it. */
let release: ((reply: unknown) => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  tier.value = "premium";
  submitted.calls = [];
  clarify.requests = [];
  release = null;
  clarify.answer = (line) => (line === Q1 ? Promise.resolve(FIRST) : new Promise((resolve) => { release = resolve; }));
  window.history.replaceState(null, "", "/v4");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
}

function buttonNamed(name: string, within: ParentNode = document): HTMLButtonElement {
  const found = [...within.querySelectorAll("button")].find((button) => button.textContent?.trim() === name);
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

async function press(name: string, within: ParentNode = document): Promise<void> {
  await act(async () => buttonNamed(name, within).click());
  await settle();
}

async function type(field: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void> {
  const prototype = field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The page at step 2 for Q1, its questions read. */
async function atStepTwo(planTier: "free" | "premium" = "premium"): Promise<HTMLDivElement> {
  tier.value = planTier;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <V4AskClient catalog={CATALOG} homeCatalog={{}} newDebateCatalog={NEW_DEBATE} billingCatalog={{}} locale="en" crisisCountryHint={null}
      initialQuestion={Q1} initialLevel="plain" />
  ));
  await press(CATALOG["v4.ask.continue"]!);
  return host;
}

/** The page's own Back, then the tab's move back lands (each queued step one fake millisecond later). */
async function back(): Promise<void> {
  let moved = false;
  const onMove = (): void => { moved = true; };
  window.addEventListener("popstate", onMove);
  try {
    await act(async () => host!.querySelector<HTMLButtonElement>(".v4AskBack")!.click());
    await act(async () => {
      for (let turn = 0; turn < 20 && !moved; turn += 1) await vi.advanceTimersByTimeAsync(1);
    });
  } finally {
    window.removeEventListener("popstate", onMove);
  }
  expect(moved, "the tab did not move back").toBe(true);
  await settle();
  expect(host!.querySelector(".v4AskReadTitle")).toBeNull();
}

/** Back, the words changed to Q2 (or kept), and Next. */
async function nextWith(words: string): Promise<void> {
  await back();
  await type(host!.querySelector("textarea")!, words);
  await press(CATALOG["v4.ask.continue"]!);
  expect(host!.querySelector(".v4AskReadTitle")).not.toBeNull();
}

async function answer(reply: unknown): Promise<void> {
  await act(async () => { release!(reply); });
  await settle();
}

/** Task 76b: Start, then its Undo window (0 here) runs out and the ask is sent. */
async function pressStart(): Promise<readonly unknown[]> {
  await act(async () => buttonNamed(CATALOG["v4.start.start"]!).click());
  await settle();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  await settle();
  expect(submitted.calls).toHaveLength(1);
  return submitted.calls[0]!;
}

const boxText = (): string => host!.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")?.value ?? "";
const blocks = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>('.v4AskBlock[role="group"]')];
const labels = (): readonly (string | null)[] => blocks().map((block) => block.querySelector(".v4AskLabel")!.textContent);
const blockOf = (question: string): HTMLElement => {
  const found = blocks().find((block) => block.querySelector(".v4AskLabel")?.textContent === question);
  if (found === undefined) throw new Error(`no block "${question}"`);
  return found;
};
const pressed = (question: string): readonly string[] =>
  [...blockOf(question).querySelectorAll('button[aria-pressed="true"]')].map((button) => button.textContent?.trim() ?? "");
const setAsideLines = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>(".v4AskSetAside")];

describe("a new reading keeps the person's answers (read-f1)", () => {
  it("Back, changed words, Next: the box holds the new words and the answer's sentence at once, and the call is told the earlier questions and answer", async () => {
    await atStepTwo();
    await press("To 2035");
    expect(boxText()).toBe(`${Q1}\n\nOver what time? To 2035.`);
    await nextWith(Q2);
    // At once, before the new reading answers.
    expect(boxText()).toBe(`${Q2}\n\nOver what time? To 2035.`);
    expect(clarify.requests).toEqual([
      { question_line: Q1 },
      { question_line: Q2, earlier: { questions: [OVER, REGION, PURPOSE], answers: [{ question: "Over what time?", answer: "To 2035" }] } }
    ]);
  });

  it("a reading that asks 'By when?' offering 'To 2035': that chip is pressed under 'By when?', and the box's sentence is unchanged", async () => {
    await atStepTwo();
    await press("To 2035");
    await nextWith(Q2);
    await answer({ source: "AI", questions: [{ text: "By when?", answers: ["To 2030", "To 2035"] }], purpose: PURPOSE });
    expect(labels()).toEqual(["By when?", "What do you want it for?"]);
    expect(pressed("By when?")).toEqual(["To 2035"]);
    expect(boxText()).toBe(`${Q2}\n\nOver what time? To 2035.`);
    expect(setAsideLines()).toHaveLength(0);
    const call = await pressStart();
    expect(call[0]).toBe(boxText());
    expect(call[4]).toEqual({ answers: [{ question: "By when?", answer: "To 2035" }] });
  });

  it("a reading that no longer offers it: 'Set aside: To 2035' with 'Put it back' where its question was, the sentence out of the box and of Start's purpose lines", async () => {
    await atStepTwo();
    await press("To 2035");
    await press("To teach");
    await nextWith(Q2);
    expect(boxText()).toBe(`${Q2}\n\nOver what time? To 2035.\nWhat do you want it for? To teach.`);
    await answer({ source: "AI", questions: [{ text: "By when?", answers: ["To 2050", "To 2060"] }], purpose: PURPOSE });
    expect(setAsideLines()).toHaveLength(1);
    const line = setAsideLines()[0]!;
    expect(line.textContent).toContain(SET_ASIDE);
    expect(buttonNamed(PUT_BACK, line)).toBeDefined();
    // Its question was the first: the line comes before the first question.
    expect(line.compareDocumentPosition(blocks()[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(labels()).toEqual(["By when?", "What do you want it for?"]);
    expect(pressed("By when?")).toEqual([]);
    expect(pressed("What do you want it for?")).toEqual(["To teach"]);
    expect(boxText()).toBe(`${Q2}\n\nWhat do you want it for? To teach.`);
    const call = await pressStart();
    expect(call[0]).toBe(`${Q2}\n\nWhat do you want it for? To teach.`);
    expect(call[4]).toEqual({ answers: [{ question: "What do you want it for?", answer: "To teach" }] });
  });

  it("'Put it back': a block headed 'Over what time?' with 'To 2035' pressed, and the sentence back in the box", async () => {
    await atStepTwo();
    await press("To 2035");
    await press("To teach");
    await nextWith(Q2);
    await answer({ source: "AI", questions: [{ text: "By when?", answers: ["To 2050", "To 2060"] }], purpose: PURPOSE });
    await press(PUT_BACK, setAsideLines()[0]!);
    expect(setAsideLines()).toHaveLength(0);
    expect(labels()).toEqual(["By when?", "What do you want it for?", "Over what time?"]);
    expect(blockOf("Over what time?").querySelector(".v4AskLabel")!.getAttribute("data-ai-generated")).toBe("true");
    expect(pressed("Over what time?")).toEqual(["To 2035"]);
    expect(boxText()).toBe(`${Q2}\n\nWhat do you want it for? To teach.\nOver what time? To 2035.`);
    const call = await pressStart();
    expect(call[4]).toEqual({ answers: [{ question: "What do you want it for?", answer: "To teach" }, { question: "Over what time?", answer: "To 2035" }] });
  });

  it("a typed 'Other…' answer survives a reworded reading, under its own question's words", async () => {
    await atStepTwo();
    await act(async () => buttonNamed("Other…", blockOf("Over what time?")).click());
    await type(blockOf("Over what time?").querySelector<HTMLInputElement>(".v4AskInline input")!, "2040");
    expect(boxText()).toBe(`${Q1}\n\nOver what time? 2040.`);
    await nextWith(Q2);
    await answer({ source: "AI", questions: [REGION], purpose: PURPOSE });
    expect(labels()).toEqual(["Which region?", "What do you want it for?", "Over what time?"]);
    const kept = blockOf("Over what time?");
    expect(kept.querySelector(".v4AskLabel")!.getAttribute("data-ai-generated")).toBe("true");
    expect(pressed("Over what time?")).toEqual(["Other…"]);
    expect(kept.querySelector<HTMLInputElement>(".v4AskInline input")!.value).toBe("2040");
    expect(boxText()).toBe(`${Q2}\n\nOver what time? 2040.`);
    expect(setAsideLines()).toHaveLength(0);
    const call = await pressStart();
    expect(call[4]).toEqual({ answers: [{ question: "Over what time?", answer: "2040" }] });
  });

  it.each([
    ["the reading failed", async () => { await answer({ source: "NONE" }); }],
    ["the reading was too slow", async () => {
      await act(async () => { await vi.advanceTimersByTimeAsync(ASK_CLARIFY_PAGE_WAIT_MS); });
      await settle();
    }]
  ])("%s: the earlier questions and answers stay exactly as they were, and the status line says nothing new", async (_name, settleReading) => {
    await atStepTwo();
    await press("To 2035");
    await press("To teach");
    await nextWith(Q2);
    // The one status line waits with the reading, then says nothing new.
    const status = host!.querySelector('.v4AskCard [role="status"]')!;
    expect(status.textContent).toBe(CATALOG["v4.read.clarifyWaiting"]);
    await settleReading();
    expect(labels()).toEqual(["Over what time?", "Which region?", "What do you want it for?"]);
    expect(pressed("Over what time?")).toEqual(["To 2035"]);
    expect(pressed("Which region?")).toEqual([]);
    expect(pressed("What do you want it for?")).toEqual(["To teach"]);
    expect(boxText()).toBe(`${Q2}\n\nOver what time? To 2035.\nWhat do you want it for? To teach.`);
    expect(host!.textContent).not.toContain(CATALOG["v4.read.noQuestions"]);
    expect(host!.querySelectorAll('.v4AskCard [role="status"]')).toHaveLength(1);
    expect(host!.querySelector('.v4AskCard [role="status"]')).toBe(status);
    expect(status.textContent).toBe("");
    expect(host!.querySelectorAll(".v4AskHeldRow")).toHaveLength(0);
    expect(setAsideLines()).toHaveLength(0);
    const call = await pressStart();
    expect(call[4]).toEqual({ answers: [{ question: "Over what time?", answer: "To 2035" }, { question: "What do you want it for?", answer: "To teach" }] });
  });

  it("Back, the same words, Next: no clarifying request, and step 2 as it was", async () => {
    await atStepTwo();
    await press("To 2035");
    await nextWith(Q1);
    expect(clarify.requests).toEqual([{ question_line: Q1 }]);
    expect(labels()).toEqual(["Over what time?", "Which region?", "What do you want it for?"]);
    expect(pressed("Over what time?")).toEqual(["To 2035"]);
    expect(boxText()).toBe(`${Q1}\n\nOver what time? To 2035.`);
  });

  it("Free's cap holds across readings: a set-aside answer counts once put back, and 'Put it back' waits, muted, while three are given", async () => {
    await atStepTwo("free");
    await press("To 2035");
    await press("The north");
    await press("To teach");
    await nextWith(Q2);
    await answer({ source: "AI", questions: [{ text: "Which part?", answers: ["The north", "The west"] }, { text: "By when?", answers: ["Soon", "Later"] }],
      purpose: PURPOSE });
    expect(pressed("Which part?")).toEqual(["The north"]);
    expect(pressed("What do you want it for?")).toEqual(["To teach"]);
    expect(setAsideLines()[0]!.textContent).toContain(SET_ASIDE);
    await press("Soon");
    const putBack = buttonNamed(PUT_BACK, setAsideLines()[0]!);
    expect(putBack.getAttribute("aria-disabled")).toBe("true");
    expect(putBack.disabled).toBe(false);
    expect(putBack.tabIndex).toBe(0);
    const cap = host!.querySelector(".v4AskCapLine")!;
    expect(putBack.getAttribute("aria-describedby")).toBe(cap.id);
    await act(async () => putBack.click());
    await settle();
    expect(setAsideLines()).toHaveLength(1);
    expect(labels()).not.toContain("Over what time?");
    expect(boxText()).not.toContain("To 2035");
    // Clearing one answer lets it come back.
    await press("Soon");
    await press(PUT_BACK, setAsideLines()[0]!);
    expect(pressed("Over what time?")).toEqual(["To 2035"]);
    // The kept answers' sentences as they were ("Which region? The north." under "Which part?"), the put-back one last.
    expect(boxText()).toBe(`${Q2}\n\nWhich region? The north.\nWhat do you want it for? To teach.\nOver what time? To 2035.`);
  });
});

/*
 * Independent review of Task 76g: kept blocks and "Put it back" can put more questions on screen than one reading asks, but an
 * ask (and a merge) carries at most clarifyQuestionsMax + 2 answers (PurposeLinesSchema, StartMergeRequestSchema): a sixth
 * answer is refused by the server. On every plan the answers given stop there, the way Free's cap does at 3: what would be one
 * more waits, muted and reachable, under the cap line, which shows only while something waits.
 */
describe("the most answers an ask carries holds on a paid plan too (review of Task 76g)", () => {
  const BUDGET = { text: "Which budget?", answers: ["Small", "Large"] };
  const PAYS = { text: "Who pays?", answers: ["The town", "The state"] };
  const SIZE = { text: "How big?", answers: ["One berth", "Two berths"] };
  const CARES = { text: "What do you care about most?", answers: ["Lower bills", "Cleaner air"] };
  const FIVE_GIVEN = "5 answers given. Clear one to change.";

  it("kept typed answers put six questions on screen: five answers mute the sixth question's, and Start sends five", async () => {
    await atStepTwo();
    await act(async () => buttonNamed("Other…", blockOf("Over what time?")).click());
    await type(blockOf("Over what time?").querySelector<HTMLInputElement>(".v4AskInline input")!, "2040");
    await act(async () => buttonNamed("Other…", blockOf("Which region?")).click());
    await type(blockOf("Which region?").querySelector<HTMLInputElement>(".v4AskInline input")!, "Up north");
    await press("To teach");
    await nextWith(Q2);
    await answer({ source: "AI", questions: [BUDGET, PAYS, SIZE], purpose: PURPOSE });
    expect(labels()).toEqual(["Which budget?", "Who pays?", "How big?", "What do you want it for?", "Over what time?", "Which region?"]);
    await press("Small");
    expect(host!.querySelector(".v4AskCapLine")).toBeNull();
    await press("The town");
    const cap = host!.querySelector(".v4AskCapLine");
    expect(cap?.textContent).toBe(FIVE_GIVEN);
    const berth = buttonNamed("One berth", blockOf("How big?"));
    expect(berth.getAttribute("aria-disabled")).toBe("true");
    expect(berth.disabled).toBe(false);
    expect(berth.getAttribute("aria-describedby")).toBe(cap!.id);
    await act(async () => berth.click());
    await settle();
    expect(pressed("How big?")).toEqual([]);
    const call = await pressStart();
    expect((call[4] as { answers: readonly unknown[] }).answers).toHaveLength(5);
  });

  it("'Put it back' waits, muted, once five answers are given", async () => {
    await atStepTwo();
    await press("To 2035");
    await press("The north");
    await press("To teach");
    await nextWith(Q2);
    await answer({ source: "AI", questions: [BUDGET, PAYS, SIZE], purpose: PURPOSE });
    expect(setAsideLines()).toHaveLength(2);
    await press("Small");
    await press("The town");
    await press("One berth");
    await press(PUT_BACK, setAsideLines()[0]!);
    expect(setAsideLines()).toHaveLength(1);
    const cap = host!.querySelector(".v4AskCapLine");
    expect(cap?.textContent).toBe(FIVE_GIVEN);
    const putBack = buttonNamed(PUT_BACK, setAsideLines()[0]!);
    expect(putBack.getAttribute("aria-disabled")).toBe("true");
    expect(putBack.getAttribute("aria-describedby")).toBe(cap!.id);
    await act(async () => putBack.click());
    await settle();
    expect(setAsideLines()).toHaveLength(1);
    const call = await pressStart();
    expect((call[4] as { answers: readonly unknown[] }).answers).toHaveLength(5);
  });

  it("five questions, all answered: nothing waits, so no cap line and nothing muted", async () => {
    clarify.answer = () => Promise.resolve({ source: "AI", questions: [OVER, REGION, SIZE], purpose: PURPOSE, cares: CARES });
    await atStepTwo();
    for (const name of ["To 2035", "The north", "One berth", "To teach", "Lower bills"]) await press(name);
    expect(host!.querySelector(".v4AskCapLine")).toBeNull();
    expect(host!.querySelectorAll('.v4AskQuestions [aria-disabled="true"]')).toHaveLength(0);
  });
});
