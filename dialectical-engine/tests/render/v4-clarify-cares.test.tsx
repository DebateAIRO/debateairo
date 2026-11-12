// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * V4 start step, Task 76d (owner answers Q4 and Q5 of 4 Nov; read-d3, read-f8, read-f22, r2-5): what step 2 does with a version 2
 * reply of the clarifying call (sealed only through Task 92; here the server is stood in with one). The care question, "What do you
 * care about most?", shows last, after the question about what the answer is for, and is answered like any other: a tap puts the
 * AI's sentence in the question box ("What I care about is: keeping bills low.") and its {question, answer} in the purpose lines; it
 * counts in Free's cap of 3, muted like any other once the cap is reached. Each offered answer's sentence is the AI's own; the site's
 * country comes first among the place question's answers, never ticked. A version 1 reply shows no care question and today's pairs.
 * No "what matters most" box. Every text and figure is made up.
 */
const tier = vi.hoisted(() => ({ value: "premium" as "free" | "premium" }));
const submitted = vi.hoisted(() => ({ calls: [] as unknown[][] }));
const clarify = vi.hoisted(() => ({ asked: [] as string[], answer: (): Promise<unknown> => Promise.resolve({ source: "NONE" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => React.ReactNode }) => children("IN") }));
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null, alreadyWaitingShown: () => false }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
vi.mock("@/lib/api", () => ({ contractClient: { readAnswerIndex: async () => ({ items: [], open_runs: [] }),
  clarifyAsk: async (input: { question_line: string }) => { clarify.asked.push(input.question_line); return clarify.answer(); } } }));
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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (locale: string, name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/${locale}/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("en", "v4");
let root: Root | null = null;
let host: HTMLDivElement | null = null;

const QUESTION = "Should the town keep its old power plant open?";
const WHERE = { text: "Which region?", answers: ["The north", "The south"], sentences: ["I mean the north of the country.", "I mean the south of the country."],
  about_place: true };
const YEARS = { text: "Which years?", answers: ["Soon", "Later"], sentences: ["I mean the next few years.", "I mean later on."] };
const PURPOSE = { text: "What do you want it for?", answers: ["To vote", "To teach"], sentences: ["I want it to vote.", "I want it to teach."] };
const CARES = { text: "What do you care about most?", answers: ["Keeping bills low", "Keeping the lights on", "Less harm to the climate"],
  sentences: ["What I care about is: keeping bills low.", "What I care about is: keeping the lights on.", "What I care about is: less harm to the climate."] };
const V2 = { source: "AI", questions: [WHERE, YEARS], purpose: PURPOSE, cares: CARES };
const plain = (question: Readonly<{ text: string; answers: readonly string[] }>) => ({ text: question.text, answers: [...question.answers] });
const V1 = { source: "AI", questions: [plain(WHERE), plain(YEARS)], purpose: plain(PURPOSE) };

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  tier.value = "premium";
  submitted.calls = [];
  clarify.asked = [];
  clarify.answer = async () => V2;
  window.history.replaceState(null, "", "/v4");
});
clarify.answer = async () => V2;

async function flush(): Promise<void> {
  for (let round = 0; round < 4; round += 1) await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
}

/** The page at step 2, for a question long enough to go on. */
async function atStepTwo(planTier: "free" | "premium", options: Readonly<{ locale?: string; countryHint?: string | null }> = {}): Promise<HTMLDivElement> {
  tier.value = planTier;
  const locale = options.locale ?? "en";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <V4AskClient catalog={CATALOG} homeCatalog={{}} newDebateCatalog={messages(locale, "newDebate")} billingCatalog={{}} locale={locale}
      crisisCountryHint={options.countryHint ?? null} initialQuestion={QUESTION} initialLevel="plain" />
  ));
  await act(async () => buttonNamed(CATALOG["v4.ask.continue"]!).click());
  await flush();
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

/** Task 76b: Start, then its Undo window (0 here) runs out and the ask is sent. */
async function pressStart(): Promise<void> {
  await act(async () => buttonNamed(CATALOG["v4.start.start"]!).click());
  await flush();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  await flush();
}

const labels = (page: HTMLDivElement): readonly (string | null)[] =>
  [...page.querySelectorAll('.v4AskBlock[role="group"] .v4AskLabel')].map((label) => label.textContent);
const chipsOf = (page: HTMLDivElement, question: string): readonly string[] => {
  const block = [...page.querySelectorAll('.v4AskBlock[role="group"]')].find((one) => one.querySelector(".v4AskLabel")?.textContent === question);
  return [...(block?.querySelectorAll(".v4Chip") ?? [])].map((chip) => chip.textContent?.trim() ?? "");
};
const boxText = (page: HTMLDivElement): string => page.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")?.value ?? "";
const boxLines = (page: HTMLDivElement): readonly string[] => boxText(page).split("\n\n")[1]?.split("\n") ?? [];

describe("the care question (Q4)", () => {
  it("shows last, after the question about what the answer is for, with its answers and Other…", async () => {
    const page = await atStepTwo("premium");
    expect(clarify.asked).toEqual([QUESTION]);
    expect(labels(page)).toEqual(["Which region?", "Which years?", "What do you want it for?", "What do you care about most?"]);
    expect(chipsOf(page, "What do you care about most?")).toEqual(["Keeping bills low", "Keeping the lights on", "Less harm to the climate", "Other…"]);
    // No "what matters most" box: the care question replaces it.
    expect(page.textContent).not.toContain("If the answers pull in different directions");
    expect(page.querySelector('[id$="-matters"]')).toBeNull();
  });

  it("a tap puts the AI's sentence in the question box and {question, answer} last in the purpose lines; untick takes the sentence out", async () => {
    const page = await atStepTwo("premium");
    await press("To teach");
    await press("Keeping bills low");
    expect(boxText(page)).toBe(`${QUESTION}\n\nI want it to teach.\nWhat I care about is: keeping bills low.`);
    expect(buttonNamed("Keeping bills low").getAttribute("aria-pressed")).toBe("true");
    await pressStart();
    const call = submitted.calls.at(-1)!;
    expect(call[0]).toBe(boxText(page));
    const lines = call[4] as { answers: readonly unknown[] };
    // Task 50b: the care question's answer goes marked, so the run knows a goal was stated without reading the words.
    expect(lines.answers.at(-1)).toEqual({ question: "What do you care about most?", answer: "Keeping bills low", cares: true });
    expect(lines).toEqual({ answers: [{ question: "What do you want it for?", answer: "To teach" },
      { question: "What do you care about most?", answer: "Keeping bills low", cares: true }] });
    await press("Keeping bills low");
    expect(boxLines(page)).toEqual(["I want it to teach."]);
    expect(boxText(page)).not.toContain("What I care about is");
  });

  it("its Other… puts the cursor in its line (read-f15, Task 76h), and a typed answer there keeps today's pair", async () => {
    const page = await atStepTwo("premium");
    const others = [...page.querySelectorAll("button")].filter((button) => button.textContent?.trim() === "Other…");
    expect(others).toHaveLength(4);
    await act(async () => others.at(-1)!.click());
    const typed = page.querySelector(".v4AskInline input") as HTMLInputElement;
    expect(typed.closest('.v4AskBlock[role="group"]')?.querySelector(".v4AskLabel")?.textContent).toBe("What do you care about most?");
    expect(document.activeElement).toBe(typed);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(typed, "Lower bills");
      typed.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(boxLines(page)).toEqual(["What do you care about most? Lower bills."]);
    // Task 50b: a typed goal is a stated goal too: Start sends it marked.
    await pressStart();
    expect((submitted.calls.at(-1)![4] as { answers: readonly unknown[] }).answers)
      .toEqual([{ question: "What do you care about most?", answer: "Lower bills", cares: true }]);
  });

  it("on Free it is one of the 3 choices: with three answers given elsewhere its answers are muted, reachable, and a press changes nothing", async () => {
    const page = await atStepTwo("free");
    await press("The north");
    await press("Soon");
    await press("To vote");
    expect(boxLines(page)).toHaveLength(3);
    for (const name of ["Keeping bills low", "Keeping the lights on", "Less harm to the climate", "Other…"]) {
      const chip = [...page.querySelectorAll('.v4AskBlock[role="group"]')].at(-1)!;
      const button = [...chip.querySelectorAll("button")].find((one) => one.textContent?.trim() === name)!;
      expect(button.getAttribute("aria-disabled"), name).toBe("true");
      expect(button.disabled, name).toBe(false);
      expect(button.tabIndex, name).toBe(0);
    }
    await press("Keeping bills low");
    expect(buttonNamed("Keeping bills low").getAttribute("aria-pressed")).toBe("false");
    expect(boxLines(page)).toHaveLength(3);
    expect(boxText(page)).not.toContain("What I care about is");
    // Clearing one answer frees the care question.
    await press("To vote");
    await press("Keeping bills low");
    expect(boxLines(page)).toEqual(["I mean the north of the country.", "I mean the next few years.", "What I care about is: keeping bills low."]);
  });
});

describe("each answer's own sentence (Q5) and the site's country first (r2-5)", () => {
  it("an offered answer puts the AI's sentence in the box", async () => {
    const page = await atStepTwo("premium");
    await press("The north");
    expect(boxLines(page)).toEqual(["I mean the north of the country."]);
  });

  it("the visitor's country comes first among the place question's answers, never ticked; a tap gives the pair", async () => {
    const page = await atStepTwo("premium", { countryHint: "RO" });
    expect(chipsOf(page, "Which region?")).toEqual(["Romania", "The north", "The south", "Other…"]);
    expect(buttonNamed("Romania").getAttribute("aria-pressed")).toBe("false");
    expect(boxText(page)).toBe(QUESTION);
    // Only the place question gets it.
    expect(chipsOf(page, "Which years?")).toEqual(["Soon", "Later", "Other…"]);
    await press("Romania");
    expect(boxLines(page)).toEqual(["Which region? Romania."]);
  });

  it("the Romanian site: Romania, in the site's language, whatever the visitor's country", async () => {
    const page = await atStepTwo("premium", { locale: "ro", countryHint: "DE" });
    expect(chipsOf(page, "Which region?")[0]).toBe("România");
  });

  it("a version 1 reply (until the seal): no care question, no country added, and today's pairs", async () => {
    clarify.answer = async () => V1;
    const page = await atStepTwo("premium", { countryHint: "RO" });
    expect(labels(page)).toEqual(["Which region?", "Which years?", "What do you want it for?"]);
    expect(page.textContent).not.toContain("What do you care about most?");
    expect(chipsOf(page, "Which region?")).toEqual(["The north", "The south", "Other…"]);
    await press("The north");
    expect(boxLines(page)).toEqual(["Which region? The north."]);
    // Task 50b: no care question, no mark.
    await pressStart();
    expect((submitted.calls.at(-1)![4] as { answers: readonly unknown[] }).answers).toEqual([{ question: "Which region?", answer: "The north" }]);
  });
});
