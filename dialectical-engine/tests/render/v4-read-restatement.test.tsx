// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskClarifyResponseSchema, PurposeLinesSchema } from "@debateai/contract";

/*
 * Design Document v2 (16b), "How we read your question": what step 2 does with a clarifying reply that says the question back in
 * one sentence (`restatement`; here the server is stood in with one). The person's question heads the step, under a small label
 * with "Edit my question" beside it (the way back to step 1, in Back's place). The hard card holds the title, a hint, the
 * sentence and what its two lines mean. A stretch of the sentence that stands for an answer is a link to its question: dotted
 * while it shows the AI's assumption, bold in the brand colour once the person chose an answer. The assumed answer's button has a
 * dashed edge and ends with "(our assumption)", never pressed. "Use my words instead" puts the question box where the sentence
 * was, and "Show how we read it" brings the sentence back; the box also comes by itself when it has something to say. Start
 * sends the question and the person's answers as ever and, while the sentence is on screen, each assumption left unchanged with
 * them, marked as assumed (owner answer of 17 Nov 2026). A reply without the sentence leaves step 2 as it was. Every text is made up.
 */
const submitted = vi.hoisted(() => ({ calls: [] as unknown[][] }));
const crisis = vi.hoisted(() => ({ flagged: false }));
const clarify = vi.hoisted(() => ({ asked: [] as string[], answer: (): Promise<unknown> => Promise.resolve({ source: "NONE" }) }));
const tier = vi.hoisted(() => ({ free: false }));
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
  useV4Ask: () => ({ planTier: tier.free ? "free" : "premium", planIsFree: tier.free, planState: "KNOWN",
    submit: async (...args: unknown[]) => { submitted.calls.push(args); return { kind: "STOPPED" }; }, ensureConsent: async () => true,
    flagsCrisis: () => crisis.flagged, offerCrisisHelp: () => false, room: null, submitting: false, dialogs: null })
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (locale: string, name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/${locale}/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("en", "v4");
const CSS = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8");
let root: Root | null = null;
let host: HTMLDivElement | null = null;

const QUESTION = "Should the town keep its old power plant open?";
const WHERE = { text: "Which region?", answers: ["The north", "The south"], sentences: ["I mean the north of the country.", "I mean the south of the country."],
  about_place: true };
const YEARS = { text: "Which years?", answers: ["Soon", "Later"], sentences: ["I mean the next few years.", "I mean later on."] };
const PURPOSE = { text: "What do you want it for?", answers: ["To vote", "To teach"], sentences: ["I want it to vote.", "I want it to teach."] };
const CARES = { text: "What do you care about most?", answers: ["Keeping bills low", "Keeping the lights on", "Less harm to the climate"],
  sentences: ["What I care about is: keeping bills low.", "What I care about is: keeping the lights on.", "What I care about is: less harm to the climate."] };
const PLAIN = { source: "AI", questions: [WHERE, YEARS], purpose: PURPOSE, cares: CARES };
/** The sentence: a stretch for the region (the south assumed), the years (soon assumed) and the care question; none for the purpose. */
const RESTATEMENT = { parts: [
  { text: "You want to know whether the old plant should stay open in " },
  { about: 0, phrases: ["the north of the country", "the south of the country"], assumed: 1 },
  { text: ", " },
  { about: 1, phrases: ["in the next few years", "later on"], assumed: 0 },
  { text: ", so that " },
  { about: "cares", phrases: ["bills stay low", "the lights stay on", "the climate is harmed less"], assumed: 0 },
  { text: "." }
] };
const RESTATED = { ...PLAIN, restatement: RESTATEMENT };

const TITLE = "How we read your question";
const HINT = "The dotted parts are our assumptions. Tap one to change it.";
const USE_MINE = "Use my words instead";
const SHOW_READING = "Show how we read it";
const EDIT = "Edit my question";

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  submitted.calls = [];
  crisis.flagged = false;
  tier.free = false;
  clarify.asked = [];
  clarify.answer = async () => RESTATED;
  window.history.replaceState(null, "", "/v4");
});
clarify.answer = async () => RESTATED;

async function flush(): Promise<void> {
  for (let round = 0; round < 4; round += 1) await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
}

/** The page at step 2, for a question long enough to go on. */
async function atStepTwo(options: Readonly<{ countryHint?: string | null }> = {}): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <V4AskClient catalog={CATALOG} homeCatalog={{}} newDebateCatalog={messages("en", "newDebate")} billingCatalog={{}} locale="en"
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
const hasButton = (name: string): boolean => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === name);

async function press(name: string): Promise<void> {
  await act(async () => buttonNamed(name).click());
}

/** Start, then its Undo window (0 here) runs out and the ask is sent. */
async function pressStart(): Promise<void> {
  await act(async () => buttonNamed(CATALOG["v4.start.start"]!).click());
  await flush();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  await flush();
}

async function type(field: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const groupOf = (page: HTMLDivElement, question: string): HTMLElement =>
  [...page.querySelectorAll<HTMLElement>('.v4AskBlock[role="group"]')].find((one) => one.querySelector(".v4AskLabel")?.textContent === question)!;
const chipsOf = (page: HTMLDivElement, question: string): readonly HTMLButtonElement[] => [...groupOf(page, question).querySelectorAll<HTMLButtonElement>(".v4Chip")];
const chipWords = (page: HTMLDivElement, question: string): readonly string[] => chipsOf(page, question).map((chip) => chip.textContent?.trim() ?? "");
const slots = (page: HTMLDivElement): readonly HTMLAnchorElement[] => [...page.querySelectorAll<HTMLAnchorElement>(".v4ReadSentence a.v4ReadSlot")];
/** A stretch's words as seen (without the words only a screen reader hears). */
const seen = (slot: HTMLAnchorElement): string => [...slot.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join("");
const box = (page: HTMLDivElement): HTMLTextAreaElement | null => page.querySelector<HTMLTextAreaElement>(".v4AskCard textarea");

describe("the fixture", () => {
  it("is a reply the contract accepts, with and without the sentence", () => {
    expect(AskClarifyResponseSchema.safeParse(RESTATED).success).toBe(true);
    expect(AskClarifyResponseSchema.safeParse(PLAIN).success).toBe(true);
  });
});

describe("step 2 with a sentence that says the question back (16b)", () => {
  it("the person's question heads the step, with its label and 'Edit my question' in Back's place, and takes the focus on arrival", async () => {
    const page = await atStepTwo();
    expect(clarify.asked).toEqual([QUESTION]);
    const headings = [...page.querySelectorAll("h1")];
    expect(headings.map((one) => one.textContent)).toEqual([QUESTION]);
    expect(headings[0]!.className).toBe("v4ReadAskedTitle v4Serif");
    expect(document.activeElement).toBe(headings[0]);
    const head = page.querySelector(".v4ReadAskedHead")!;
    expect(head.querySelector(".v4ReadAskedLabel")?.textContent).toBe("Your question");
    expect(head.querySelector("button.v4ReadEdit")?.textContent).toBe(EDIT);
    // "Edit my question" stands where Back was.
    expect(page.querySelector(".v4AskBack")).toBeNull();
    expect(hasButton("‹ Back")).toBe(false);
  });

  it("'Edit my question' leads back to step 1, the words kept, as Back does", async () => {
    const page = await atStepTwo();
    await press(EDIT);
    expect(page.querySelector(".v4AskMainRead")).toBeNull();
    expect(page.querySelector<HTMLTextAreaElement>(".v4AskQuestion textarea")?.value).toBe(QUESTION);
  });

  it("the hard card: the title as a second-level heading, the hint, the sentence, the legend and 'Use my words instead'; no box", async () => {
    const page = await atStepTwo();
    const card = page.querySelector(".v4Hard.v4AskRead")!;
    const title = card.querySelector(".v4ReadHead h2")!;
    expect(title.textContent).toBe(TITLE);
    expect(page.querySelector("section.v4AskCard")!.getAttribute("aria-labelledby")).toBe(title.id);
    expect(card.querySelector(".v4ReadHead .v4ReadHint")?.textContent).toBe(HINT);
    expect(card.querySelector(".v4ReadSentence")?.textContent).toBe("You want to know whether the old plant should stay open in "
      + "our assumption: the south of the country, our assumption: in the next few years, so that our assumption: bills stay low.");
    expect([...card.querySelectorAll(".v4ReadLegend .v4ReadKey")].map((key) => key.textContent)).toEqual(["our assumption", "your choice"]);
    expect([...card.querySelectorAll(".v4ReadLegend .v4ReadKeyLine")].map((line) => line.getAttribute("aria-hidden"))).toEqual(["true", "true"]);
    expect(card.querySelector(".v4ReadLegend button.v4ReadSwap")?.textContent).toBe(USE_MINE);
    expect(box(page)).toBeNull();
    // ask-f13's "Use my words instead" (a rewrite's) is another thing, and is not here.
    expect(page.querySelector(".v4AskUseMine")).toBeNull();
  });

  it("each stretch that stands for an answer is a link to its question's group, dotted while it shows our assumption", async () => {
    const page = await atStepTwo();
    const links = slots(page);
    expect(links.map(seen)).toEqual(["the south of the country", "in the next few years", "bills stay low"]);
    expect(links.map((link) => link.className)).toEqual(Array.from({ length: 3 }, () => "v4ReadSlot v4ReadSlot--assumed"));
    // A screen reader hears which kind each stretch is, in the legend's words.
    expect(links.map((link) => link.querySelector(".v4SrOnly")?.textContent)).toEqual(Array.from({ length: 3 }, () => "our assumption: "));
    expect(links.map((link) => link.getAttribute("data-ai-generated"))).toEqual(["true", "true", "true"]);
    const targets = links.map((link) => document.getElementById(link.getAttribute("href")!.slice(1)));
    expect(links.every((link) => link.getAttribute("href")!.startsWith("#"))).toBe(true);
    expect(targets).toEqual([groupOf(page, "Which region?"), groupOf(page, "Which years?"), groupOf(page, "What do you care about most?")]);
    expect(new Set(targets.map((target) => target!.id)).size).toBe(3);
    // The question the sentence has no stretch for has no id.
    expect(groupOf(page, "What do you want it for?").id).toBe("");
  });

  it("activating a stretch moves the focus to the answer it showed, without a new entry in the tab's history", async () => {
    const page = await atStepTwo();
    const entries = window.history.length;
    const address = window.location.href;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => { slots(page)[1]!.dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(chipsOf(page, "Which years?")[0]);
    expect(document.activeElement?.textContent).toBe("Soon (our assumption)");
    expect(window.history.length).toBe(entries);
    expect(window.location.href).toBe(address);
    // Once the person chose an answer there, the focus goes to that answer.
    await press("Later");
    await act(async () => { slots(page)[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(chipsOf(page, "Which years?")[1]);
  });

  it("the assumed answer's button is dashed, ends with '(our assumption)' and is not pressed; the other buttons are as ever", async () => {
    const page = await atStepTwo();
    expect(chipWords(page, "Which region?")).toEqual(["The north", "The south (our assumption)", "Other…"]);
    expect(chipWords(page, "Which years?")).toEqual(["Soon (our assumption)", "Later", "Other…"]);
    expect(chipWords(page, "What do you care about most?")).toEqual(["Keeping bills low (our assumption)", "Keeping the lights on", "Less harm to the climate", "Other…"]);
    expect(chipWords(page, "What do you want it for?")).toEqual(["To vote", "To teach", "Other…"]);
    const assumed = [...page.querySelectorAll<HTMLButtonElement>(".v4Chip.v4ChipAssumed")];
    expect(assumed.map((chip) => chip.textContent)).toEqual(["The south (our assumption)", "Soon (our assumption)", "Keeping bills low (our assumption)"]);
    expect(assumed.map((chip) => chip.getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
    expect(assumed.map((chip) => chip.className)).toEqual(["v4Chip v4ChipAssumed", "v4Chip v4ChipAssumed", "v4Chip v4ChipAssumed"]);
    expect(page.querySelectorAll('.v4Chip[aria-pressed="true"]')).toHaveLength(0);
  });

  it("choosing an answer turns its stretch into 'your choice' and takes the dashed look away; unticking brings the assumption back", async () => {
    const page = await atStepTwo();
    await press("The north");
    const [region, years] = slots(page);
    expect(seen(region!)).toBe("the north of the country");
    expect(region!.className).toBe("v4ReadSlot v4ReadSlot--chosen");
    expect(region!.querySelector(".v4SrOnly")?.textContent).toBe("your choice: ");
    expect(years!.className).toBe("v4ReadSlot v4ReadSlot--assumed");
    expect(chipWords(page, "Which region?")).toEqual(["The north", "The south", "Other…"]);
    expect(groupOf(page, "Which region?").querySelector(".v4ChipAssumed")).toBeNull();
    expect(buttonNamed("The north").getAttribute("aria-pressed")).toBe("true");
    // Choosing the answer that was assumed makes it the person's: pressed, solid, without the suffix.
    await press("Soon (our assumption)");
    expect(seen(slots(page)[1]!)).toBe("in the next few years");
    expect(slots(page)[1]!.className).toBe("v4ReadSlot v4ReadSlot--chosen");
    expect(buttonNamed("Soon").getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Soon").className).toBe("v4Chip");
    // Unticking: the assumption shows again.
    await press("The north");
    expect(seen(slots(page)[0]!)).toBe("the south of the country");
    expect(slots(page)[0]!.className).toBe("v4ReadSlot v4ReadSlot--assumed");
    expect(chipWords(page, "Which region?")).toEqual(["The north", "The south (our assumption)", "Other…"]);
    // No box came out for any of it.
    expect(box(page)).toBeNull();
  });

  it("the person's own typed answer shows in its stretch as their choice, in their words; an empty 'Other…' says nothing yet", async () => {
    const page = await atStepTwo();
    const other = chipsOf(page, "Which region?").at(-1)!;
    await act(async () => other.click());
    expect(seen(slots(page)[0]!)).toBe("the south of the country");
    expect(slots(page)[0]!.className).toBe("v4ReadSlot v4ReadSlot--assumed");
    expect(chipWords(page, "Which region?")[1]).toBe("The south (our assumption)");
    await type(groupOf(page, "Which region?").querySelector<HTMLInputElement>(".v4AskInline input")!, "  The valley  towns ");
    expect(seen(slots(page)[0]!)).toBe("The valley towns");
    expect(slots(page)[0]!.className).toBe("v4ReadSlot v4ReadSlot--chosen");
    // The person's own words are not marked as AI text.
    expect(slots(page)[0]!.hasAttribute("data-ai-generated")).toBe(false);
    expect(groupOf(page, "Which region?").querySelector(".v4ChipAssumed")).toBeNull();
  });

  it("an answer the page added (the site's country) shows by its own words when chosen", async () => {
    const page = await atStepTwo({ countryHint: "RO" });
    expect(chipWords(page, "Which region?")).toEqual(["Romania", "The north", "The south (our assumption)", "Other…"]);
    await press("Romania");
    expect(seen(slots(page)[0]!)).toBe("Romania");
    expect(slots(page)[0]!.className).toBe("v4ReadSlot v4ReadSlot--chosen");
  });

  it("'Use my words instead' puts the question box where the sentence was, the cursor in it; 'Show how we read it' brings the sentence back", async () => {
    const page = await atStepTwo();
    await press("The north");
    await press(USE_MINE);
    const field = box(page)!;
    expect(field.value).toBe(`${QUESTION}\n\nI mean the north of the country.`);
    expect(document.activeElement).toBe(field);
    expect(page.querySelector(".v4Hard.v4AskRead .v4AskBlock .v4AskLabel")?.textContent).toBe("Your question");
    expect(page.querySelector(".v4ReadSentence")).toBeNull();
    expect(page.querySelector(".v4ReadHint")).toBeNull();
    expect(page.querySelector(".v4ReadKey")).toBeNull();
    // The heading and the title stay; the assumptions are not drawn while the sentence that explains them is away.
    expect([...page.querySelectorAll("h1")].map((one) => one.textContent)).toEqual([QUESTION]);
    expect(page.querySelector(".v4ReadHead h2")?.textContent).toBe(TITLE);
    expect(page.querySelector(".v4ChipAssumed")).toBeNull();
    expect(chipWords(page, "Which years?")).toEqual(["Soon", "Later", "Other…"]);
    expect(hasButton(USE_MINE)).toBe(false);
    const swap = buttonNamed(SHOW_READING);
    await act(async () => swap.click());
    expect(box(page)).toBeNull();
    expect(slots(page).map(seen)).toEqual(["the north of the country", "in the next few years", "bills stay low"]);
    // One button for both ways, so the focus is not lost on the change.
    expect(buttonNamed(USE_MINE)).toBe(swap);
    expect(chipWords(page, "Which years?")).toEqual(["Soon (our assumption)", "Later", "Other…"]);
  });

  it("words the person types in the box keep the box on screen (no way back hides them), and the heading follows their words", async () => {
    const page = await atStepTwo();
    await press(USE_MINE);
    await type(box(page)!, "Should the town close its old power plant?");
    expect(box(page)!.value).toBe("Should the town close its old power plant?");
    expect(hasButton(SHOW_READING)).toBe(false);
    expect(hasButton(USE_MINE)).toBe(false);
    expect(page.querySelector("h1")?.textContent).toBe("Should the town close its old power plant?");
    // Their words as read at Next again: the way back returns.
    await type(box(page)!, QUESTION);
    expect(hasButton(SHOW_READING)).toBe(true);
  });

  it("the box comes by itself when it has something to say, and no button hides it: words that read as a person in crisis", async () => {
    const page = await atStepTwo();
    expect(box(page)).toBeNull();
    crisis.flagged = true;
    await press("The north");
    expect(box(page)).not.toBeNull();
    expect(page.querySelector(".v4ReadSentence")).toBeNull();
    expect(page.querySelector(".v4ReadLegend")).toBeNull();
    crisis.flagged = false;
    await press("The north");
    expect(box(page)).toBeNull();
    expect(page.querySelector(".v4ReadSentence")).not.toBeNull();
  });

  it("Start sends each assumption left unchanged with the answers, marked as assumed; the question's words stay the person's", async () => {
    await atStepTwo();
    await pressStart();
    const sent = submitted.calls.at(-1)!;
    expect(sent[0]).toBe(QUESTION);
    // In the sentence's order. The assumed care is no stated goal: it carries no `cares` mark.
    expect(sent[4]).toEqual({ answers: [
      { question: "Which region?", answer: "The south", assumed: true },
      { question: "Which years?", answer: "Soon", assumed: true },
      { question: "What do you care about most?", answer: "Keeping bills low", assumed: true }
    ] });
    expect(PurposeLinesSchema.safeParse(sent[4]).success).toBe(true);
  });

  it("an answer the person chose goes as theirs, in the question's words, as without the sentence; the rest stay assumed after it", async () => {
    await atStepTwo();
    await press("The north");
    await press("Keeping the lights on");
    await pressStart();
    const restated = submitted.calls.at(-1)!;
    expect(restated[0]).toBe(`${QUESTION}\n\nI mean the north of the country.\nWhat I care about is: keeping the lights on.`);
    expect(restated[4]).toEqual({ answers: [
      { question: "Which region?", answer: "The north" },
      { question: "What do you care about most?", answer: "Keeping the lights on", cares: true },
      { question: "Which years?", answer: "Soon", assumed: true }
    ] });
    await act(async () => root?.unmount());
    host?.remove();
    submitted.calls = [];
    // The same choices under a reply without the sentence: the same question and the same answers of the person's, and no assumption.
    clarify.answer = async () => PLAIN;
    await atStepTwo();
    await press("The north");
    await press("Keeping the lights on");
    await pressStart();
    const plain = submitted.calls.at(-1)!;
    expect(plain[0]).toBe(restated[0]);
    expect(plain[4]).toEqual({ answers: [
      { question: "Which region?", answer: "The north" },
      { question: "What do you care about most?", answer: "Keeping the lights on", cares: true }
    ] });
  });

  it("an 'Other…' with nothing typed says nothing, so its question's assumption still goes", async () => {
    const page = await atStepTwo();
    await act(async () => chipsOf(page, "Which years?").at(-1)!.click());
    expect(slots(page).map((slot) => slot.className)).toEqual(Array.from({ length: 3 }, () => "v4ReadSlot v4ReadSlot--assumed"));
    await pressStart();
    expect((submitted.calls.at(-1)![4] as { answers: unknown[] }).answers).toContainEqual({ question: "Which years?", answer: "Soon", assumed: true });
  });

  it("with the person's own words in the sentence's place, no assumption is sent: 'Use my words instead', and words typed in the box", async () => {
    const page = await atStepTwo();
    await press(USE_MINE);
    await pressStart();
    expect(submitted.calls.at(-1)![0]).toBe(QUESTION);
    expect(submitted.calls.at(-1)![4]).toBeUndefined();
    await act(async () => root?.unmount());
    host?.remove();
    submitted.calls = [];
    const again = await atStepTwo();
    await press(USE_MINE);
    await type(box(again)!, "Should the town close its old power plant?");
    await pressStart();
    expect(submitted.calls.at(-1)![0]).toBe("Should the town close its old power plant?");
    expect(submitted.calls.at(-1)![4]).toBeUndefined();
    expect(page).not.toBe(again);
  });

  it("'Show how we read it' brings the assumptions back into what Start sends", async () => {
    await atStepTwo();
    await press(USE_MINE);
    await press(SHOW_READING);
    await pressStart();
    expect((submitted.calls.at(-1)![4] as { answers: unknown[] }).answers).toHaveLength(3);
  });

  it("on Free an assumption counts against the cap on choices as a choice does: the person's answers first, then the first assumptions that fit", async () => {
    tier.free = true;
    await atStepTwo();
    await press("To vote");
    await pressStart();
    expect(submitted.calls.at(-1)![4]).toEqual({ answers: [
      { question: "What do you want it for?", answer: "To vote" },
      { question: "Which region?", answer: "The south", assumed: true },
      { question: "Which years?", answer: "Soon", assumed: true }
    ] });
  });
});

describe("step 2 without the sentence is as it was", () => {
  it("Back, the title as the step's heading, the question box, and nothing of the new view", async () => {
    clarify.answer = async () => PLAIN;
    const page = await atStepTwo();
    expect(page.querySelector("button.v4AskBack")?.textContent).toBe("‹ Back");
    const headings = [...page.querySelectorAll("h1")];
    expect(headings.map((one) => one.textContent)).toEqual([TITLE]);
    expect(headings[0]!.className).toBe("v4AskReadTitle v4Serif");
    expect(document.activeElement).toBe(headings[0]);
    expect(page.querySelector("section.v4AskCard")!.getAttribute("aria-labelledby")).toBe(headings[0]!.id);
    expect(page.querySelector(".v4Hard.v4AskRead h2")).toBeNull();
    expect(box(page)!.value).toBe(QUESTION);
    // The hard card holds the title and the box's block, and nothing else.
    expect([...page.querySelector(".v4Hard.v4AskRead")!.children].map((child) => `${child.tagName}.${child.className}`))
      .toEqual(["H1.v4AskReadTitle v4Serif", "DIV.v4AskBlock"]);
    expect(page.querySelector('[class*="v4Read"]:not(.v4AskReadTitle)')).toBeNull();
    expect(page.querySelector(".v4ChipAssumed")).toBeNull();
    expect(page.textContent).not.toContain("our assumption");
    expect(page.textContent).not.toContain(USE_MINE);
    expect(page.textContent).not.toContain(EDIT);
    expect(page.querySelector(".v4AskCard a")).toBeNull();
    for (const group of page.querySelectorAll('.v4AskBlock[role="group"]')) expect(group.hasAttribute("id")).toBe(false);
    expect(chipWords(page, "Which region?")).toEqual(["The north", "The south", "Other…"]);
    for (const chip of page.querySelectorAll(".v4AskBlock .v4Chip")) expect(chip.className).toBe("v4Chip");
    await press("The north");
    expect(box(page)!.value).toBe(`${QUESTION}\n\nI mean the north of the country.`);
  });

  it("no reading at all (no AI): the same", async () => {
    clarify.answer = async () => ({ source: "NONE" });
    const page = await atStepTwo();
    expect(page.querySelector("button.v4AskBack")).not.toBeNull();
    expect([...page.querySelectorAll("h1")].map((one) => one.textContent)).toEqual([TITLE]);
    expect(box(page)!.value).toBe(QUESTION);
    expect(page.querySelector('[class*="v4Read"]:not(.v4AskReadTitle)')).toBeNull();
  });
});

describe("the CSS (read as text)", () => {
  const uncommented = CSS.replace(/\/\*[\s\S]*?\*\//gu, "");
  const rule = (selector: string): string => {
    const at = uncommented.indexOf(`\n${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return uncommented.slice(at, uncommented.indexOf("}", at));
  };

  it("the two kinds of stretch: a dotted ink line for our assumption, the brand colour, bold, over a solid line for the person's choice", () => {
    expect(rule(".v4ReadSlot")).toMatch(/text-decoration-line: underline; text-decoration-thickness: 2px; text-underline-offset: 6px;/u);
    expect(rule(".v4ReadSlot--assumed")).toContain("color: inherit; text-decoration-style: dotted; text-decoration-color: var(--ink);");
    expect(rule(".v4ReadSlot--chosen")).toContain("color: var(--brand); font-weight: 700; text-decoration-style: solid; text-decoration-color: var(--brand);");
    expect(rule(".v4ReadKeyLine")).toContain("border-block-end: 2px dotted var(--ink)");
    expect(rule(".v4ReadKeyLine--chosen")).toContain("border-block-end: 2px solid var(--brand)");
  });

  it("the assumed answer's button has a dashed edge in the second text colour; the heading drops to 28px on a phone", () => {
    expect(rule(".v4Chip.v4ChipAssumed")).toContain("border-style: dashed; border-color: var(--text-2);");
    expect(rule(".v4ReadAskedTitle")).toMatch(/font-size: 42px; line-height: 1\.06; letter-spacing: -\.035em; text-wrap: balance;/u);
    expect(uncommented).toMatch(/@media \(max-width: 640px\) \{\s*\.v4ReadAskedTitle \{ font-size: 28px;/u);
    expect(rule(".v4ReadHead")).toContain("flex-wrap: wrap");
    expect(rule(".v4ReadSentence")).toContain("font-size: 19px; line-height: 1.75; text-wrap: pretty;");
  });

  it("the new rules use tokens only, and sit before the start step's own blocks", () => {
    const from = CSS.indexOf("/* Design Document v2 (16b), \"How we read your question\"");
    expect(from).toBeGreaterThan(-1);
    expect(from).toBeLessThan(CSS.indexOf("/* ---- V4 start step"));
    const mine = uncommented.split("\n").filter((line) => /\.v4Read[A-Z]|\.v4ChipAssumed/u.test(line)).join("\n");
    expect(mine).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/iu);
  });
});
