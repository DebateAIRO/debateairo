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
 */
const tier = vi.hoisted(() => ({ value: "free" as "free" | "premium" }));
const submitted = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: (token: string) => React.ReactNode }) => children("token") }));
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
const clarify = vi.hoisted(() => ({ asked: [] as string[], answer: (_text: string, _signal?: AbortSignal): Promise<unknown> => Promise.resolve({ source: "GENERIC" }), consent: true }));
vi.mock("@/lib/api", () => ({ contractClient: { readAnswerIndex: async () => ({ items: [], open_runs: [] }),
  clarifyAsk: async (input: { question_line: string }, signal?: AbortSignal) => { clarify.asked.push(input.question_line); return clarify.answer(input.question_line, signal); } } }));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: () => ({ planTier: tier.value, submit: async (...args: unknown[]) => { submitted.calls.push(args); return { kind: "STOPPED" }; }, ensureConsent: async () => clarify.consent, flagsCrisis: () => false, room: null, submitting: false, dialogs: null })
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

const sentText = (page: HTMLDivElement): string => page.querySelector(".v4AskSent")?.textContent ?? "";
const sentLines = (page: HTMLDivElement): readonly string[] => sentText(page).split("\n\n")[1]?.split("\n") ?? [];
const input = (page: HTMLDivElement, placeholder: string) => page.querySelector(`input[placeholder="${CATALOG[placeholder]}"]`) as HTMLInputElement;
const startName = () => CATALOG["v4.read.start"]!;

clarify.answer = async () => AI;

describe("V4 step 2: the AI's questions, in the same look", () => {
  it("asks once with the question, shows each question with its answers and Other, and the purpose question last", async () => {
    const page = await atStepTwo("premium");
    expect(clarify.asked).toEqual([QUESTION]);
    const labels = [...page.querySelectorAll('.v4AskBlock[role="group"] .v4AskLabel')].map((label) => label.textContent);
    expect(labels).toEqual(["Which region?", "Which years?", "What do you want it for?"]);
    expect(page.querySelectorAll('.v4AskBlock[role="group"] .v4Chip')).toHaveLength(9);
    expect(page.querySelector('[id$="-matters"]')).not.toBeNull();
  });

  it("the answers show as plain text before Start, and go in the question and in the field every later AI reads", async () => {
    const page = await atStepTwo("premium");
    await press("The north");
    await press("To teach");
    expect(sentText(page)).toBe(`${QUESTION}\n\nWhich region? The north.\nWhat do you want it for? To teach.`);
    await act(async () => buttonNamed(startName()).click());
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
    await act(async () => buttonNamed(startName()).click());
    expect(submitted.calls.at(-1)![0]).toBe(QUESTION);
    expect(submitted.calls.at(-1)![4]).toBeUndefined();
  });

  it("an edited question calls again and drops the answers that no longer apply", async () => {
    const page = await atStepTwo("premium");
    await press("The north");
    await press("To teach");
    vi.useFakeTimers();
    clarify.answer = async () => ({ source: "AI", questions: [], purpose: AI.purpose });
    const field = page.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Should Bulgaria build more nuclear plants?");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(clarify.asked).toEqual([QUESTION, "Should Bulgaria build more nuclear plants?"]);
    expect(sentLines(page)).toEqual(["What do you want it for? To teach."]);
  });
});

describe("V4 step 2 on every language", () => {
  it.each(["en", "ro", "de", "ar", "ja"])("%s: the step, what matters and the angles all show, and go in the question", async (locale) => {
    const page = await atStepTwo("premium", locale);
    expect(page.querySelectorAll('.v4AskBlock[role="group"]')).toHaveLength(3);
    expect(page.querySelector('[id$="-matters"]')).not.toBeNull();
    expect(page.textContent).not.toContain("only on the English site");
    await press("The north");
    const matters = page.querySelector('[id$="-matters"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(matters, "cost");
      matters.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(sentLines(page)[0]).toBe("Which region? The north.");
    expect(sentLines(page)[1]).toBe(messages(locale, "newDebate")["newDebate.askText.matters"]!.replace("{matters}", "cost"));
    await act(async () => buttonNamed(startName()).click());
    expect(submitted.calls.at(-1)![0]).toBe(sentText(page));
    expect(submitted.calls.at(-1)![4]).toMatchObject({ matters: "cost" });
  });
});

describe("V4 step 2 never gets stuck", () => {
  const generic = (locale = "en") => { const catalog = messages(locale, "newDebate"); return { question: catalog["newDebate.askText.purposeQuestion"]!, decide: catalog["newDebate.askText.purposeDecide"]! }; };

  it("a failed call: the generic purpose options, in the page's language", async () => {
    clarify.answer = async () => { throw new Error("down"); };
    const page = await atStepTwo("premium", "ro");
    const { question, decide } = generic("ro");
    expect(page.textContent).toContain(question);
    await press(decide);
    expect(sentLines(page)).toEqual([`${question} ${decide}.`]);
  });

  it("the server's generic answer: the same", async () => {
    clarify.answer = async () => ({ source: "GENERIC" });
    const page = await atStepTwo("premium");
    expect(page.textContent).toContain(generic().question);
    expect(page.querySelectorAll('.v4AskBlock[role="group"]')).toHaveLength(1);
  });

  it("a call that never answers: Start works while it waits, and the generic options come at the page's limit", async () => {
    vi.useFakeTimers();
    clarify.answer = () => new Promise(() => undefined);
    const page = await atStepTwo("premium");
    expect(page.querySelector('[role="status"]')?.textContent).toBe(CATALOG["v4.read.clarifyWaiting"]);
    expect(buttonNamed(startName()).disabled).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(ASK_CLARIFY_PAGE_WAIT_MS); });
    expect(page.querySelector('[role="status"]')).toBeNull();
    expect(page.textContent).toContain(generic().question);
  });

  it("the consent refused: no call, the generic options, and D2 still opens", async () => {
    clarify.consent = false;
    const page = await atStepTwo("premium");
    expect(clarify.asked).toEqual([]);
    expect(page.textContent).toContain(generic().question);
  });
});

describe("V4 step 2 on the Free plan: at most 3 choices", () => {
  it("says so, and after three choices only the ones already set can change", async () => {
    const page = await atStepTwo("free");
    const hint = CATALOG["v4.read.freeChoices"]!.replace("{count}", "3");
    expect(page.textContent).toContain(hint);
    await press("The north");
    await press("Soon");
    expect(buttonNamed("To teach").disabled).toBe(false);
    await press("To teach");
    // Three set: every other choice waits; the set ones can still move or be cleared.
    expect(buttonNamed("Later").disabled).toBe(false);
    expect(buttonNamed("The south").disabled).toBe(false);
    expect(input(page, "v4.read.matters.placeholder").disabled).toBe(true);
    expect(input(page, "v4.read.angles.placeholder").disabled).toBe(true);
    expect(sentLines(page)).toHaveLength(3);
    // Clearing one opens the others again.
    await press("To teach");
    expect(input(page, "v4.read.matters.placeholder").disabled).toBe(false);
    expect(sentLines(page)).toHaveLength(2);
  });

  it("with four questions, the fourth waits once three are answered", async () => {
    clarify.answer = async () => ({ ...AI, questions: [...AI.questions, { text: "Whose money?", answers: ["Public", "Private"] }] });
    await atStepTwo("free");
    await press("The north");
    await press("Soon");
    await press("Public");
    expect(buttonNamed("To teach").disabled).toBe(true);
  });

  it("a paid plan keeps every choice and shows no Free sentence", async () => {
    const page = await atStepTwo("premium");
    expect(page.textContent).not.toContain(CATALOG["v4.read.freeChoices"]!.replace("{count}", "3"));
    await press("The north");
    await press("Soon");
    await press("To teach");
    expect(input(page, "v4.read.matters.placeholder").disabled).toBe(false);
    expect(input(page, "v4.read.angles.placeholder").disabled).toBe(false);
  });
});
