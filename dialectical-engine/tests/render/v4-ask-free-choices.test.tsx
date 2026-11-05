// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Decision 29, dynamic step 2: the same look, with the AI's questions and their answers; every language; generic options on failure; the answers
 * reach the text the person sees before Start and the field the later AIs read. Owner 2026-10-29 (Free plan shape): "the choices after the initial
 * question to be capped to 3". On the Free plan the D2 step offers its choices until three are set; then only the choices already set can change,
 * and the text sent carries three at most. A paid plan keeps every choice.
 * V4 start step, Task 76 (read-d3, chat-one-place-for-answers, owner answer Q4; 4 Nov night read-f3, read-f5, read-f8): the
 * answers live in the question box, so the box below ("We'll ask the AIs:") and the "what matters most" box are gone; the
 * honest note sits under the questions' heading; with no question one calm status line says so; Free's line is the joined
 * "Free: up to 3 answers above, up to 3 paths below.", and only a plan the server named Free (planIsFree) is capped.
 */
const tier = vi.hoisted(() => ({ value: "free" as "free" | "premium" }));
const submitted = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// The ask page learns the session beside the page (ask-d1 D): a signed-in person here.
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => React.ReactNode }) => children("IN") }));
// Task 70b: no notice shows, so it never says one question already waits.
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null, alreadyWaitingShown: () => false }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
const clarify = vi.hoisted(() => ({ asked: [] as string[], answer: (_text: string, _signal?: AbortSignal): Promise<unknown> => Promise.resolve({ source: "NONE" }), consent: true }));
vi.mock("@/lib/api", () => ({ contractClient: { readAnswerIndex: async () => ({ items: [], open_runs: [] }),
  clarifyAsk: async (input: { question_line: string }, signal?: AbortSignal) => { clarify.asked.push(input.question_line); return clarify.answer(input.question_line, signal); } } }));
// Task 76 (read-f3): Free-only things read planIsFree, the server's own word for the plan.
// Task 76b: Start waits its 10-second Undo window before the send; here the window is 0 and `pressStart` lets its timer run.
vi.mock("@/lib/v4/startUndo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/v4/startUndo.js")>()), START_UNDO_MS: 0
}));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: () => ({ planTier: tier.value, planIsFree: tier.value === "free", planState: "KNOWN",
    submit: async (...args: unknown[]) => { submitted.calls.push(args); return { kind: "STOPPED" }; }, ensureConsent: async () => clarify.consent,
    flagsCrisis: () => false, offerCrisisHelp: () => false, room: null, submitting: false, dialogs: null })
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { ASK_CLARIFY_PAGE_WAIT_MS } from "../../apps/ui/lib/v4/useAskClarify.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (locale: string, name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/${locale}/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("en", "v4");
let root: Root | null = null;
let host: HTMLDivElement | null = null;

const QUESTION = "Should Romania build more nuclear plants?";
const AI = { source: "AI", purpose: { text: "What do you want it for?", answers: ["To vote", "To teach"] },
  questions: [{ text: "Which region?", answers: ["The north", "The south"] }, { text: "Which years?", answers: ["Soon", "Later"] }] };

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  tier.value = "free";
  submitted.calls = [];
  clarify.asked = [];
  clarify.answer = async () => AI;
  clarify.consent = true;
  vi.useRealTimers();
  // Task 76c: the page keeps its words in this tab's history entry (answer Q3); each case starts on a fresh entry.
  window.history.replaceState(null, "", "/v4");
});

/** The page at its D2 step, for a question long enough to go on. */
async function atStepTwo(planTier: "free" | "premium", locale = "en"): Promise<HTMLDivElement> {
  tier.value = planTier;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <V4AskClient catalog={CATALOG} homeCatalog={{}} newDebateCatalog={messages(locale, "newDebate")} billingCatalog={{}} locale={locale} crisisCountryHint={null}
      initialQuestion={QUESTION} initialLevel="plain" />
  ));
  await act(async () => buttonNamed(CATALOG["v4.ask.continue"]!).click());
  await act(async () => undefined);
  return host;
}

function buttonNamed(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === name);
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

async function press(name: string): Promise<void> {
  await act(async () => buttonNamed(name).click());
}

/** Task 76b: Start, then its Undo window (0 here) runs out and the ask is sent; the step is back once the ask answers. */
async function pressStart(): Promise<void> {
  const flush = async (): Promise<void> => {
    for (let round = 0; round < 4; round += 1) await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
  };
  await act(async () => buttonNamed(startName()).click());
  await flush();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  await flush();
}

// Task 76 (read-d3): what the AIs get is what the question box says.
const sentText = (page: HTMLDivElement): string => page.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")?.value ?? "";
const sentLines = (page: HTMLDivElement): readonly string[] => sentText(page).split("\n\n")[1]?.split("\n") ?? [];
const startName = () => CATALOG["v4.start.start"]!;
const FREE_JOINED = "Free: up to 3 answers above, up to 3 paths below.";

clarify.answer = async () => AI;

describe("V4 step 2: the AI's questions, in the same look", () => {
  it("asks once with the question, shows each question with its answers and Other, and the purpose question last", async () => {
    const page = await atStepTwo("premium");
    expect(clarify.asked).toEqual([QUESTION]);
    const labels = [...page.querySelectorAll('.v4AskBlock[role="group"] .v4AskLabel')].map((label) => label.textContent);
    expect(labels).toEqual(["Which region?", "Which years?", "What do you want it for?"]);
    expect(page.querySelectorAll('.v4AskBlock[role="group"] .v4Chip')).toHaveLength(9);
    // Task 76 (answer Q4): no "If the answers pull in different directions, what matters most to you?" box.
    expect(page.querySelector('[id$="-matters"]')).toBeNull();
  });

  it("decision 2: the own-angle box is gone from step 2 (an own angle is a path added at the choosing step)", async () => {
    const page = await atStepTwo("premium");
    expect(page.querySelector('[id$="-angle"]')).toBeNull();
    expect(page.querySelector(".v4AskAngles")).toBeNull();
    expect(page.textContent).not.toContain("Add your own angle");
    expect([...page.querySelectorAll("button")].map((button) => button.textContent?.trim())).not.toContain("Add");
  });

  // Task 76 (Step 1b): the same sentences and purpose lines, read in the question box (the box below it is gone).
  it("the answers show as plain text in the question box before Start, and go in the question and in the field every later AI reads", async () => {
    const page = await atStepTwo("premium");
    await press("The north");
    await press("To teach");
    expect(page.querySelector(".v4AskSent")).toBeNull();
    expect(page.textContent).not.toContain("We'll ask the AIs:");
    expect(sentText(page)).toBe(`${QUESTION}\n\nWhich region? The north.\nWhat do you want it for? To teach.`);
    await pressStart();
    const call = submitted.calls.at(-1)!;
    expect(call[0]).toBe(sentText(page));
    expect(call[4]).toEqual({ answers: [{ question: "Which region?", answer: "The north" }, { question: "What do you want it for?", answer: "To teach" }] });
  });

  it("answers read in the order the questions show, whichever was pressed first", async () => {
    const page = await atStepTwo("premium");
    await press("To teach");
    await press("Soon");
    expect(sentLines(page)).toEqual(["Which years? Soon.", "What do you want it for? To teach."]);
  });

  it("Other takes the person's own words; pressing an answer again clears it", async () => {
    const page = await atStepTwo("premium");
    const otherChips = [...page.querySelectorAll("button")].filter((button) => button.textContent?.trim() === "Other…");
    expect(otherChips).toHaveLength(3);
    await act(async () => otherChips[0]!.click());
    const typed = page.querySelector('.v4AskInline input') as HTMLInputElement;
    expect(sentLines(page)).toEqual([]);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(typed, "The  capital");
      typed.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(sentLines(page)).toEqual(["Which region? The capital."]);
    await press("The north");
    await press("The north");
    expect(sentLines(page)).toEqual([]);
  });

  it("no choice: the question alone and no field", async () => {
    await atStepTwo("premium");
    await pressStart();
    expect(submitted.calls.at(-1)![0]).toBe(QUESTION);
    expect(submitted.calls.at(-1)![4]).toBeUndefined();
  });

  // Task 70b (read-d2, read-f14): the question is read once, at Next. What used to be read again 1.2 s after an edit on step 2
  // is now read only after Back, new words and Next: at once. V4 start step, Task 76g (Step 1b; read-f1, owner "All in this
  // build", 4 Nov night): the same setup now expects the keeping rule. The answer the new reading still offers is kept, the one
  // it no longer offers is set aside where its question was (not dropped), and "Put it back" brings it back.
  it("an edit on step 2 asks nothing again; Back, a changed question and Next ask once, at once, keep the answers they can and set the others aside", async () => {
    const page = await atStepTwo("premium");
    await press("The north");
    await press("To teach");
    vi.useFakeTimers();
    clarify.answer = async () => ({ source: "AI", questions: [], purpose: AI.purpose });
    const type = async (field: HTMLTextAreaElement, text: string): Promise<void> => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, text);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    // Task 76 (read-d3): the words change in the box, the answers' sentences stay under them.
    await type(page.querySelector("textarea") as HTMLTextAreaElement,
      "Should Bulgaria build more nuclear plants?\n\nWhich region? The north.\nWhat do you want it for? To teach.");
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(clarify.asked).toEqual([QUESTION]);
    expect(sentLines(page)).toEqual(["Which region? The north.", "What do you want it for? To teach."]);
    await act(async () => page.querySelector<HTMLButtonElement>(".v4AskBack")!.click());
    await type(page.querySelector("textarea") as HTMLTextAreaElement, "Should Bulgaria build more nuclear plants?");
    await press(CATALOG["v4.ask.continue"]!);
    await act(async () => { for (let tick = 0; tick < 6; tick += 1) await Promise.resolve(); });
    expect(clarify.asked).toEqual([QUESTION, "Should Bulgaria build more nuclear plants?"]);
    // Kept: "To teach", still offered under "What do you want it for?". Set aside: "The north", where "Which region?" was.
    expect(sentLines(page)).toEqual(["What do you want it for? To teach."]);
    expect(buttonNamed("To teach").getAttribute("aria-pressed")).toBe("true");
    const aside = page.querySelector(".v4AskSetAside");
    expect(aside?.textContent).toContain("Set aside: The north");
    expect(aside!.compareDocumentPosition(page.querySelector('.v4AskBlock[role="group"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // "Put it back": its own question comes back, answered, and its sentence goes back in the box.
    await press("Put it back");
    expect(page.querySelector(".v4AskSetAside")).toBeNull();
    expect(buttonNamed("The north").getAttribute("aria-pressed")).toBe("true");
    expect(sentLines(page)).toEqual(["What do you want it for? To teach.", "Which region? The north."]);
  });
});

describe("V4 step 2 on every language", () => {
  // Task 76 (answer Q4): the "what matters most" box is gone; the answers go in the question and its purpose lines, no matters.
  it.each(["en", "ro", "de", "ar", "ja"])("%s: the step shows and the answers go in the question; no what-matters box (Q4), no own-angle box (decision 2)", async (locale) => {
    const page = await atStepTwo("premium", locale);
    expect(page.querySelectorAll('.v4AskBlock[role="group"]')).toHaveLength(3);
    expect(page.querySelector('[id$="-matters"]')).toBeNull();
    expect(page.querySelector('[id$="-angle"]')).toBeNull();
    expect(page.textContent).not.toContain("only on the English site");
    await press("The north");
    expect(sentLines(page)).toEqual(["Which region? The north."]);
    await pressStart();
    expect(submitted.calls.at(-1)![0]).toBe(sentText(page));
    expect(submitted.calls.at(-1)![4]).toEqual({ answers: [{ question: "Which region?", answer: "The north" }] });
  });
});

describe("V4 step 2 never gets stuck", () => {
  /**
   * No question from the AI: the question box and Start. No general choice in any language (decision 31). Task 76 (r2-6,
   * read-f5, read-f6): one calm status line says there is none; no heading, no honest note, no what-matters box (answer Q4).
   */
  function ownWordsOnly(page: HTMLDivElement) {
    expect(page.querySelectorAll('.v4AskBlock[role="group"]')).toHaveLength(0);
    expect(page.querySelector('[id$="-matters"]')).toBeNull();
    expect(page.querySelector('[id$="-angle"]')).toBeNull();
    expect(page.textContent).not.toContain(CATALOG["v4.read.honestNote"]);
    expect(page.querySelector(".v4AskCard h2")).toBeNull();
    expect(page.querySelector('[role="status"]')?.textContent).toBe("No extra questions for this one.");
    expect(buttonNamed(startName()).disabled).toBe(false);
  }

  it("a failed call: only the own-words boxes, and Start sends the question", async () => {
    clarify.answer = async () => { throw new Error("down"); };
    const page = await atStepTwo("premium", "ro");
    ownWordsOnly(page);
    await pressStart();
    expect(submitted.calls.at(-1)![0]).toBe(QUESTION);
  });

  it("the server has nothing to give (limit, empty pool, local mode, off the team, blocked country): the same", async () => {
    clarify.answer = async () => ({ source: "NONE" });
    ownWordsOnly(await atStepTwo("premium"));
  });

  it("a call that never answers: Start works while it waits, and at the page's limit the wait ends with no questions", async () => {
    vi.useFakeTimers();
    clarify.answer = () => new Promise(() => undefined);
    const page = await atStepTwo("premium");
    expect(page.querySelector('[role="status"]')?.textContent).toBe("Analyzing your question…");
    expect(buttonNamed(startName()).disabled).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(ASK_CLARIFY_PAGE_WAIT_MS); });
    // Task 76 (r2-6): the wait's line goes; the calm no-questions line takes its place.
    expect(page.textContent).not.toContain("Analyzing your question…");
    ownWordsOnly(page);
  });

  // Task 70b (owner answer Q1, ask-f8): step 2 never opens without the consent; the person stays on step 1, with one line
  // right under Next.
  it("the consent refused: no call, and the page stays on step 1 with the line under Next", async () => {
    clarify.consent = false;
    const page = await atStepTwo("premium");
    expect(clarify.asked).toEqual([]);
    expect(page.querySelector(".v4AskReadTitle")).toBeNull();
    const line = page.querySelector(".v4AskDeclined");
    expect(line?.textContent).toContain(CATALOG["v4.ask.consentDeclined"]);
    expect(buttonNamed(CATALOG["v4.ask.continue"]!).compareDocumentPosition(line!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no purpose question: the AI's other questions show", async () => {
    clarify.answer = async () => ({ source: "AI", questions: AI.questions });
    const page = await atStepTwo("premium");
    expect(page.querySelectorAll('.v4AskBlock[role="group"]')).toHaveLength(2);
  });

  // Task 76 (Step 1b, chat-one-place-for-answers): the note moved under the questions' heading.
  it("with questions, the note under the questions' heading says the owner's words, and Other's box its hint", async () => {
    const page = await atStepTwo("premium");
    const heading = page.querySelector(".v4AskCard h2")!;
    expect(heading.textContent).toContain(CATALOG["v4.read.optionalTitle"]);
    expect(heading.nextElementSibling?.textContent).toBe("These would help us better understand your question");
    const other = [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Other…")!;
    await act(async () => other.click());
    expect(page.querySelector(".v4AskInline label")?.textContent).toBe("Your own extra clarification");
  });
});

describe("V4 step 2 on the Free plan: at most 3 choices", () => {
  // Task 76 (choose-f15): Free's one line joins the answers' cap and the paths' cap.
  it("says so, and after three choices only the ones already set can change", async () => {
    const page = await atStepTwo("free");
    expect(page.textContent).toContain(FREE_JOINED);
    await press("The north");
    await press("Soon");
    expect(buttonNamed("To teach").disabled).toBe(false);
    await press("To teach");
    // Three set: every other choice waits; the set ones can still move or be cleared.
    expect(buttonNamed("Later").disabled).toBe(false);
    expect(buttonNamed("The south").disabled).toBe(false);
    const others = [...page.querySelectorAll("button")].filter((button) => button.textContent?.trim() === "Other…");
    expect(others.map((button) => button.disabled)).toEqual([false, false, false]);
    expect(sentLines(page)).toHaveLength(3);
    // Clearing one keeps the other two sentences in the box.
    await press("To teach");
    expect(sentLines(page)).toHaveLength(2);
  });

  // V4 start step, Task 76h (Step 1b, read-f8): the fourth waits, muted, but stays reachable by keyboard and screen readers.
  it("with four questions, the fourth waits once three are answered", async () => {
    clarify.answer = async () => ({ ...AI, questions: [...AI.questions, { text: "Whose money?", answers: ["Public", "Private"] }] });
    const page = await atStepTwo("free");
    await press("The north");
    await press("Soon");
    await press("Public");
    const waiting = buttonNamed("To teach");
    expect(waiting.getAttribute("aria-disabled")).toBe("true");
    expect(waiting.disabled).toBe(false);
    expect(waiting.tabIndex).toBe(0);
    await press("To teach");
    expect(waiting.getAttribute("aria-pressed")).toBe("false");
    expect(sentLines(page)).toHaveLength(3);
  });

  it("a paid plan keeps every choice and shows no Free sentence", async () => {
    clarify.answer = async () => ({ ...AI, questions: [...AI.questions, { text: "Whose money?", answers: ["Public", "Private"] }] });
    const page = await atStepTwo("premium");
    expect(page.textContent).not.toContain(FREE_JOINED);
    await press("The north");
    await press("Soon");
    await press("To teach");
    expect(buttonNamed("Public").disabled).toBe(false);
    await press("Public");
    expect(sentLines(page)).toHaveLength(4);
  });
});
