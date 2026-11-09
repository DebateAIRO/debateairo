// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { warmCrisisCheck, type AskClarifyResponse } from "@debateai/contract";

/*
 * V4 start step, Task 76h (4 Nov night: ask-d3, read-f5, read-f8, read-f15, read-f23; the owner's cards "Add these as extra
 * moves" and "As picked, on measured time"): step 2's clarifying questions. One status line stays for the whole step and only
 * its words change; two pale rows hold the questions' place while they are read; the questions take them top first, later
 * ones slide in; a slow reading says so (and, past the measured usual time, offers a free "Try again"); "Other…" puts the
 * cursor in its line; Free's cap counts only real answers, says so in one still line, and keeps every button reachable. The
 * page, its hooks, the card and the bar are the real ones; only the session, the consent and the server are stood in.
 * Every figure and text is made up.
 */
const server = vi.hoisted(() => ({
  roomAnswer: (_read: number): Promise<unknown> => Promise.resolve(null),
  clarifyAnswer: (_line: string): Promise<unknown> => Promise.resolve({ source: "NONE" }),
  asked: [] as string[],
  lists: 0,
  merges: 0
}));
const wait = vi.hoisted(() => ({ usualTop: null as number | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => ReactNode }) => children("IN") }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
vi.mock("@/components/SensitiveDataConsent", () => ({
  isSensitiveDataConsentRefusal: () => false,
  useSensitiveDataConsent: () => ({ ensureConsent: async () => true, declined: false, dialog: null })
}));
// The measured usual time of the clarifying call (Task 91c's sitting): each case says what it is.
vi.mock("@/lib/v4/clarifyWait", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../apps/ui/lib/v4/clarifyWait.js")>();
  return { ...real, get ASK_CLARIFY_USUAL_TOP_MS() { return wait.usualTop; } };
});
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie",
  createDebate: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
  contractClient: {
    readAnswerIndex: async () => ({ items: [], open_runs: [], limit: 32, offset: 0, total: 0 }),
    readDigLinks: async () => ({ parent: null, children: [] }),
    readReadingLevel: async () => ({ reading_level: "plain" }),
    saveReadingLevel: async () => ({ reading_level: "plain" }),
    getAskRoom: async () => server.roomAnswer(0),
    clarifyAsk: async (input: { question_line: string }) => {
      server.asked.push(input.question_line);
      return server.clarifyAnswer(input.question_line);
    },
    startPathLists: () => {
      server.lists += 1;
      return new Promise<void>(() => undefined);
    },
    startPathMerge: () => {
      server.merges += 1;
      return new Promise(() => undefined);
    },
    startPathCombine: () => new Promise(() => undefined),
    startPathFit: () => new Promise(() => undefined)
  }
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { V4AskQuestions } from "../../apps/ui/components/v4/V4AskQuestions.js";
import { clarifyingQuestions } from "../../apps/ui/lib/v4/askText.js";
import { EMPTY_GOAL } from "../../apps/ui/lib/v4/types.js";
import { START_FIXTURE_QUESTION } from "../support/v4-start-menu.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
warmCrisisCheck();

const messages = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const NEW_DEBATE = messages("newDebate");
const CSS = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8");

const Q = START_FIXTURE_QUESTION;
const ANALYZING = "Analyzing your question…";
const STILL = "Still analyzing. Your words are still here.";
const LONGER = "This is taking longer than usual. You can wait, or try again.";
const TITLE = "A few things that would change the answer";
const NO_QUESTIONS = "No extra questions for this one.";
const CAP = "3 answers given. Clear one to change.";
const FREE_JOINED = "Free: up to 3 answers above, up to 3 paths below.";
const HONEST = "These would help us better understand your question";
const OTHER_LABEL = "Your own extra clarification";

const REGION = { text: "Which region?", answers: ["The north.", "The south."] };
const YEARS = { text: "Which years?", answers: ["Soon.", "Later."] };
const MONEY = { text: "Whose money?", answers: ["Public.", "Private."] };
const PURPOSE = { text: "What do you want it for?", answers: ["To vote.", "To teach."] };
/** Three questions on the page: two of the AI's and the purpose question, last. */
const THREE: AskClarifyResponse = { source: "AI", questions: [REGION, YEARS], purpose: PURPOSE };
const ONE: AskClarifyResponse = { source: "AI", questions: [REGION] };
const FOUR: AskClarifyResponse = { source: "AI", questions: [REGION, YEARS, MONEY], purpose: PURPOSE };

const START_STEP = { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [4, 6, 8, 10, 12, 14, 16] };
const PLUS_ROOM = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", start_step: START_STEP };
const FREE_ROOM = { ...PLUS_ROOM, plan_id: "FREE", start_step: { lists: "ON", widths: { options: [3], default: 3 }, share_by_paths: [5, 8, 11] } };
const never = (): Promise<unknown> => new Promise(() => undefined);

let root: Root | null = null;
let host: HTMLDivElement | null = null;
/** The clarifying call's answer, held until a case gives it. */
let release: ((reply: unknown) => void) | null = null;
const held = (): Promise<unknown> => new Promise((resolve) => { release = resolve; });

beforeEach(() => {
  server.roomAnswer = () => Promise.resolve(PLUS_ROOM);
  server.clarifyAnswer = held;
  server.asked = [];
  server.lists = 0;
  server.merges = 0;
  wait.usualTop = null;
  release = null;
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

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
  }
}

async function click(target: Element): Promise<void> {
  await act(async () => { (target as HTMLElement).click(); });
  await settle();
}

async function toStepTwo(): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4AskClient catalog={CATALOG} homeCatalog={messages("home")} newDebateCatalog={NEW_DEBATE} billingCatalog={messages("billing")} locale="en"
      crisisCountryHint={null} initialQuestion={Q} initialLevel="plain" />
  ));
  await settle();
  await click(host.querySelector(".v4AskActions .v4BtnPrimary")!);
  expect(host.querySelector(".v4AskReadTitle")).not.toBeNull();
  return host;
}

async function answer(reply: unknown): Promise<void> {
  await act(async () => { release!(reply); });
  await settle();
}

async function advance(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await settle();
}

/** Back by the page's own button, then the browser's history move it starts lands. */
async function backThenNext(): Promise<void> {
  await click(host!.querySelector(".v4AskBack")!);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  await settle();
  await click(host!.querySelector(".v4AskActions .v4BtnPrimary")!);
}

function reduceMotion(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true, writable: true,
    value: (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })
  });
}

const region = (): HTMLElement => host!.querySelector<HTMLElement>('.v4AskCard [role="status"]')!;
const heldRows = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>(".v4AskHeldRow")];
const blocks = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>('.v4AskBlock[role="group"]')];
const buttonNamed = (name: string, within: ParentNode = host!): HTMLButtonElement | undefined =>
  [...within.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
const box = (): HTMLTextAreaElement => host!.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")!;
const textCount = (text: string): number => (host!.textContent ?? "").split(text).length - 1;
const capLine = (): HTMLElement | undefined => [...host!.querySelectorAll<HTMLElement>("p")].find((one) => one.textContent === CAP);

describe("one status line for the whole of step 2 (read-f5), and the wait (ask-d3, read-f23)", () => {
  it("after Next and a yes: the line reads 'Analyzing your question…' over a moving line nobody hears, with two held rows and no Free line", async () => {
    vi.useFakeTimers();
    server.roomAnswer = () => Promise.resolve(FREE_ROOM);
    await toStepTwo();
    expect(region().textContent).toBe(ANALYZING);
    expect(host!.querySelectorAll('.v4AskCard [role="status"]')).toHaveLength(1);
    const line = host!.querySelector(".v4AskWaitLine")!;
    expect(line.getAttribute("aria-hidden")).toBe("true");
    expect(region().compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heldRows()).toHaveLength(2);
    for (const row of heldRows()) expect(row.closest('[aria-hidden="true"]')).not.toBeNull();
    // The held rows come before the Free line and the card would (read-f8: no Free line while they show).
    expect(heldRows()[1]!.compareDocumentPosition(host!.querySelector(".v4StartCard")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host!.textContent).not.toContain("Free: up to");
    expect(blocks()).toHaveLength(0);
  });

  it("at 6 seconds the same line reads 'Still analyzing. Your words are still here.'", async () => {
    vi.useFakeTimers();
    await toStepTwo();
    const status = region();
    await advance(5_999);
    expect(status.textContent).toBe(ANALYZING);
    await advance(1);
    expect(region()).toBe(status);
    expect(status.textContent).toBe(STILL);
  });

  it("past the measured usual time: the longer line and 'Try again' after it, which asks once more for the same line, posts no list and keeps the focus", async () => {
    vi.useFakeTimers();
    wait.usualTop = 7_000;
    await toStepTwo();
    const status = region();
    expect(server.asked).toEqual([Q]);
    expect(server.lists).toBe(1);
    await advance(7_000);
    expect(status.textContent).toBe(STILL);
    expect(buttonNamed("Try again")).toBeUndefined();
    await advance(1);
    expect(status.textContent).toBe(LONGER);
    const again = buttonNamed("Try again")!;
    // Right after the line, outside it.
    expect(status.nextElementSibling).toBe(again);
    expect(status.contains(again)).toBe(false);
    again.focus();
    await click(again);
    expect(server.asked).toEqual([Q, Q]);
    expect(server.lists).toBe(1);
    expect(server.merges).toBe(0);
    expect(document.activeElement).toBe(again);
    expect(region()).toBe(status);
    expect(status.textContent).toBe(LONGER);
    // The page's own wait starts again from the press: no give-up at the first call's 10 seconds.
    await advance(9_999);
    expect(status.textContent).toBe(LONGER);
    expect(heldRows()).toHaveLength(2);
    await advance(1);
    expect(status.textContent).toBe(NO_QUESTIONS);
    expect(buttonNamed("Try again")).toBeUndefined();
  });

  it("with no usual time measured, no longer line and no 'Try again' (still none at 9_999 ms)", async () => {
    vi.useFakeTimers();
    await toStepTwo();
    await advance(9_999);
    expect(region().textContent).toBe(STILL);
    expect(host!.textContent).not.toContain(LONGER);
    expect(buttonNamed("Try again")).toBeUndefined();
  });

  it("at the page's wait it gives up: 'No extra questions for this one.' in the same line, with no held row", async () => {
    vi.useFakeTimers();
    server.clarifyAnswer = never;
    await toStepTwo();
    const status = region();
    await advance(10_000);
    expect(region()).toBe(status);
    expect(status.textContent).toBe(NO_QUESTIONS);
    expect(heldRows()).toHaveLength(0);
    expect(host!.querySelector(".v4AskWaitLine")).toBeNull();
  });

  it("NONE: the same line says there are none, with no heading, no Free line, no honest note and no held row", async () => {
    server.roomAnswer = () => Promise.resolve(FREE_ROOM);
    await toStepTwo();
    const status = region();
    await answer({ source: "NONE" });
    expect(region()).toBe(status);
    expect(status.textContent).toBe(NO_QUESTIONS);
    expect(status.classList.contains("v4SrOnly")).toBe(false);
    expect(host!.querySelector(".v4AskCard h2")).toBeNull();
    expect(host!.textContent).not.toContain(FREE_JOINED);
    expect(host!.textContent).not.toContain(HONEST);
    expect(heldRows()).toHaveLength(0);
  });
});

describe("the arrival (read-f23, ask-d3: the owner's 'Add these as extra moves')", () => {
  it("three questions: the line announces the section title once, the first two take the held rows top first, the third slides in", async () => {
    await toStepTwo();
    const status = region();
    await answer(THREE);
    expect(region()).toBe(status);
    expect(status.textContent).toBe(TITLE);
    // Visually hidden: the heading shows the same words.
    expect(status.classList.contains("v4SrOnly")).toBe(true);
    expect(host!.querySelector(".v4AskCard h2")!.textContent).toContain(TITLE);
    const [first, second, third] = blocks();
    expect(first!.classList.contains("v4AskReveal")).toBe(true);
    expect(first!.style.animationDelay).toBe("0ms");
    expect(second!.classList.contains("v4AskReveal")).toBe(true);
    expect(second!.style.animationDelay).toBe("150ms");
    expect(third!.classList.contains("v4AskArrive")).toBe(true);
    expect(third!.classList.contains("v4AskReveal")).toBe(false);
    expect(third!.style.animationDelay).toBe("270ms");
    expect(heldRows()).toHaveLength(0);
    expect(host!.querySelector(".v4AskWaitLine")).toBeNull();
    // A later change leaves the line as it is: no count, no second sentence.
    await click(buttonNamed("The north.")!);
    expect(region()).toBe(status);
    expect(status.textContent).toBe(TITLE);
  });

  it("one question: the unused held row folds shut, and goes once its fold has ended", async () => {
    await toStepTwo();
    await answer(ONE);
    expect(blocks()).toHaveLength(1);
    expect(blocks()[0]!.classList.contains("v4AskReveal")).toBe(true);
    const rows = heldRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.classList.contains("v4AskHeldFold")).toBe(true);
    await act(async () => { rows[0]!.dispatchEvent(new Event("transitionend", { bubbles: true })); });
    await settle();
    expect(heldRows()).toHaveLength(0);
  });

  it("with less motion: changing dots instead of the moving line, then the questions at once with the 1-second highlight", async () => {
    vi.useFakeTimers();
    reduceMotion();
    await toStepTwo();
    expect(host!.querySelector(".v4AskWaitLine")).toBeNull();
    const dots = host!.querySelector(".v4AskWaitDots")!;
    expect(dots.getAttribute("aria-hidden")).toBe("true");
    expect(dots.querySelectorAll(".v4AskWaitDot")).toHaveLength(3);
    await answer(THREE);
    for (const block of blocks()) {
      expect(block.style.animationDelay).toBe("");
      expect(block.classList.contains("v4AskReveal") || block.classList.contains("v4AskArrive")).toBe(false);
    }
    expect(heldRows()).toHaveLength(0);
    const questions = host!.querySelector(".v4AskQuestions")!;
    expect(questions.classList.contains("v4Highlight")).toBe(true);
    await advance(999);
    expect(questions.classList.contains("v4Highlight")).toBe(true);
    await advance(1);
    expect(questions.classList.contains("v4Highlight")).toBe(false);
  });

  it("a reply the page already holds (Back, then Next with the same words) shows at once: no held row, no wait words, no move", async () => {
    await toStepTwo();
    await answer(THREE);
    await backThenNext();
    expect(host!.querySelector(".v4AskReadTitle")).not.toBeNull();
    expect(server.asked).toEqual([Q]);
    expect(blocks()).toHaveLength(3);
    expect(heldRows()).toHaveLength(0);
    expect(region().textContent).toBe(TITLE);
    expect(host!.textContent).not.toContain(ANALYZING);
    expect(host!.querySelector(".v4AskReveal, .v4AskArrive, .v4AskWaitLine")).toBeNull();
  });

  it("seeded (Task 76e's and 76f's restore): drawn at once, even right after a wait, with no held row and no move", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const draw = async (reply: AskClarifyResponse | null, waiting: boolean, seeded: boolean): Promise<void> => {
      await act(async () => root!.render(
        <div className="v4AskCard">
          <V4AskQuestions clarify={{ reply, waiting, startedAt: waiting ? Date.now() : null, retry: () => undefined }}
            questions={reply === null ? [] : clarifyingQuestions(reply)} goal={EMPTY_GOAL} planIsFree={false} seeded={seeded}
            onAnswer={() => undefined} catalog={CATALOG} newDebateCatalog={NEW_DEBATE} locale="en" />
        </div>
      ));
    };
    await draw(null, true, false);
    expect(heldRows()).toHaveLength(2);
    await draw(THREE, false, true);
    expect(blocks()).toHaveLength(3);
    expect(heldRows()).toHaveLength(0);
    expect(region().textContent).toBe(TITLE);
    expect(host.querySelector(".v4AskReveal, .v4AskArrive")).toBeNull();
    // Seeded from the first frame: no wait words at all.
    await act(async () => root!.unmount());
    root = createRoot(host);
    await draw(THREE, false, true);
    expect(region().textContent).toBe(TITLE);
    expect(heldRows()).toHaveLength(0);
  });
});

describe("'Other…' puts the cursor in its line (read-f15)", () => {
  it("on every question, the purpose question included; a restore never moves the focus", async () => {
    await toStepTwo();
    await answer(THREE);
    for (const block of blocks()) {
      await click(buttonNamed("Other…", block)!);
      const input = block.querySelector<HTMLInputElement>(".v4AskInline input")!;
      expect(document.activeElement).toBe(input);
      expect(block.querySelector(`label[for="${input.id}"]`)?.textContent).toBe(OTHER_LABEL);
    }
    // Back and Next with the same words: the lines come back open, and the focus goes to step 2's heading, not into them.
    await backThenNext();
    expect(blocks()[0]!.querySelector(".v4AskInline input")).not.toBeNull();
    expect(document.activeElement).toBe(host!.querySelector(".v4AskReadTitle"));
  });
});

describe("Free's cap (read-f8)", () => {
  it("three answers: one still line under the title; every other button stays reachable, muted, described by it; a press changes nothing", async () => {
    server.roomAnswer = () => Promise.resolve(FREE_ROOM);
    await toStepTwo();
    await answer(FOUR);
    expect(textCount(FREE_JOINED)).toBe(1);
    for (const name of ["The north.", "Soon.", "Public."]) await click(buttonNamed(name)!);
    const cap = capLine()!;
    expect(cap).toBeDefined();
    expect(textCount(CAP)).toBe(1);
    expect(cap.getAttribute("role")).toBeNull();
    const heading = host!.querySelector(".v4AskCard h2")!;
    expect(heading.compareDocumentPosition(cap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cap.compareDocumentPosition(blocks()[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The purpose question is the one left: all of its buttons wait, still in the keyboard's order.
    const purpose = blocks()[3]!;
    const waiting = [...purpose.querySelectorAll<HTMLButtonElement>("button")];
    expect(waiting.map((button) => button.textContent?.trim())).toEqual(["To vote.", "To teach.", "Other…"]);
    for (const button of waiting) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.disabled).toBe(false);
      expect(button.tabIndex).toBe(0);
      expect(button.classList.contains("v4ChipMuted")).toBe(true);
      expect(button.getAttribute("aria-describedby")).toBe(cap.id);
    }
    // The answered questions can still move or be cleared.
    for (const name of ["The south.", "Later.", "Private."]) expect(buttonNamed(name)!.getAttribute("aria-disabled")).toBeNull();
    const before = box().value;
    await click(buttonNamed("To vote.")!);
    await click(buttonNamed("Other…", purpose)!);
    expect(buttonNamed("To vote.")!.getAttribute("aria-pressed")).toBe("false");
    expect(purpose.querySelector(".v4AskInline")).toBeNull();
    expect(box().value).toBe(before);
    // No dots and no counter: the still line is all.
    expect(host!.textContent).not.toMatch(/3\s*\/\s*3|\d of 3/u);
    await click(buttonNamed("Soon.")!);
    expect(capLine()).toBeUndefined();
    expect(buttonNamed("To vote.")!.getAttribute("aria-disabled")).toBeNull();
  });

  it("two answers and an empty 'Other…' are not the cap; a third real answer is, and the empty line then takes no typing", async () => {
    server.roomAnswer = () => Promise.resolve(FREE_ROOM);
    await toStepTwo();
    await answer(FOUR);
    await click(buttonNamed("The north.")!);
    await click(buttonNamed("Soon.")!);
    const money = blocks()[2]!;
    await click(buttonNamed("Other…", money)!);
    expect(capLine()).toBeUndefined();
    expect(buttonNamed("To vote.")!.getAttribute("aria-disabled")).toBeNull();
    await click(buttonNamed("To vote.")!);
    const cap = capLine()!;
    expect(cap).toBeDefined();
    const empty = money.querySelector<HTMLInputElement>(".v4AskInline input")!;
    expect(empty.readOnly).toBe(true);
    expect(empty.getAttribute("aria-describedby")).toBe(cap.id);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(empty, "Both");
      empty.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(money.querySelector<HTMLInputElement>(".v4AskInline input")!.value).toBe("");
    expect(box().value.split("\n\n")[1]!.split("\n")).toHaveLength(3);
    // Its question's answers would be a fourth: they wait too.
    expect(buttonNamed("Public.")!.getAttribute("aria-disabled")).toBe("true");
  });

  it("a paid plan has no cap line and no muted button", async () => {
    await toStepTwo();
    await answer(FOUR);
    for (const name of ["The north.", "Soon.", "Public."]) await click(buttonNamed(name)!);
    expect(capLine()).toBeUndefined();
    expect(host!.querySelector(".v4ChipMuted, [aria-disabled='true'].v4Chip")).toBeNull();
  });
});

describe("the CSS (read as text)", () => {
  const at = CSS.indexOf("/* ---- V4 start step — Task 76h");
  const end = CSS.indexOf("/* ---- ", at + 10);
  const block = at < 0 ? "" : CSS.slice(at, end < 0 ? undefined : end);
  const own = block.replace(/\/\*[\s\S]*?\*\//gu, "");

  it("the two moves' tokens, each under 0.5 s, and both 0.01ms with the wait line still under reduced motion", () => {
    expect(own).toMatch(/--v4-move-reveal:\s*200ms;/u);
    expect(own).toMatch(/--v4-move-arrive:\s*250ms;/u);
    const reduced = own.slice(own.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(own).toContain("@media (prefers-reduced-motion: reduce)");
    expect(reduced).toMatch(/--v4-move-reveal:\s*0\.01ms;/u);
    expect(reduced).toMatch(/--v4-move-arrive:\s*0\.01ms;/u);
    expect(reduced).toMatch(/\.v4AskWaitLine\s*\{\s*animation:\s*none;\s*\}/u);
  });

  it("the reveal, the slide and the fold each run on their own token, from where they wait", () => {
    expect(own).toMatch(/\.v4AskReveal\s*\{[^}]*animation:[^;}]*var\(--v4-move-reveal\)/u);
    expect(own).toMatch(/\.v4AskArrive\s*\{[^}]*animation:[^;}]*var\(--v4-move-arrive\)/u);
    expect(own).toMatch(/@keyframes v4AskArrive\s*\{[^}]*translateY\(8px\)/u);
    expect(own).toMatch(/\.v4AskHeldRow\s*\{[^}]*transition:[^;}]*var\(--v4-move-reveal\)/u);
    // No shimmer on the held rows.
    expect(own).not.toMatch(/shimmer/iu);
  });

  it("logical properties only and no px value above 44 (Task 77's rules, ahead of time)", () => {
    expect(block.length).toBeGreaterThan(100);
    expect(own).not.toMatch(/(?:^|[\s;{])(?:left|right|margin-left|margin-right|padding-left|padding-right)\s*:/mu);
    expect(own).not.toMatch(/text-align:\s*(?:left|right)/u);
    const px = [...own.matchAll(/(\d+(?:\.\d+)?)px/gu)].map((match) => Number(match[1]));
    expect(px.filter((value) => value > 44)).toEqual([]);
  });
});
