// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskClarifyResponse, ClarifyQuestion } from "@debateai/contract";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

import { V4AskQuestions, type SetAsideAnswer } from "../../apps/ui/components/v4/V4AskQuestions.js";
import type { V4Goal, V4GoalAnswer } from "../../apps/ui/lib/v4/types.js";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (V4A-4): "Put it back" under the site's focus guard. The line holding the pressed
 * button goes and the answer comes back as a question block, after the new questions or in the question that already has
 * those words (V4AskClient's putBack, reduced here to what it does to the props). The questions block is the real one, as in
 * kbd-r2-v4a-fold.test.tsx. Every text is made up.
 */

const messages = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const NEW_DEBATE = messages("newDebate");

const REGION: ClarifyQuestion = { text: "Which region?", answers: ["The north.", "The south."] };
const YEARS: ClarifyQuestion = { text: "Which years?", answers: ["Soon.", "Later."] };
const COST: ClarifyQuestion = { text: "Which cost?", answers: ["Low.", "High."] };
const REPLY: AskClarifyResponse = { source: "AI", questions: [REGION, YEARS] };

function Page({ aside }: Readonly<{ aside: SetAsideAnswer }>) {
  const [goal, setGoal] = useState<V4Goal>({ answers: [], matters: "" });
  const [questions, setQuestions] = useState<readonly ClarifyQuestion[]>(REPLY.questions);
  const [setAside, setSetAside] = useState<readonly SetAsideAnswer[]>([aside]);
  const onAnswer = (question: ClarifyQuestion, next: V4GoalAnswer | null): void => {
    setGoal((current) => {
      const others = current.answers.filter((one) => one.question !== question.text);
      return { ...current, answers: next === null ? others : [...others, next] };
    });
  };
  const onPutBack = (back: SetAsideAnswer): void => {
    if (!questions.some((one) => one.text === back.question.text)) setQuestions([...questions, back.question]);
    setGoal((current) => ({ ...current, answers: [...current.answers.filter((one) => one.question !== back.given.question), back.given] }));
    setSetAside((now) => now.filter((one) => one !== back));
  };
  return (
    <V4AskQuestions
      clarify={{ reply: REPLY, waiting: false, startedAt: null, retry: () => undefined }}
      questions={questions}
      goal={goal}
      planIsFree={false}
      seeded
      onAnswer={onAnswer}
      setAside={setAside}
      onPutBack={onPutBack}
      catalog={CATALOG}
      newDebateCatalog={NEW_DEBATE}
      locale="en"
    />
  );
}

// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
let root: Root | null = null;
let stop: () => void = () => undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stop = guarded ? startFocusGuard() : installFocusFixup();
});
afterEach(() => {
  stop();
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function mount(aside: SetAsideAnswer): Promise<void> {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => root!.render(<Page aside={aside} />));
}

const blockOf = (question: ClarifyQuestion): HTMLElement =>
  [...document.querySelectorAll<HTMLElement>('.v4AskBlock[role="group"]')].find((one) => one.querySelector(".v4AskLabel")?.textContent === question.text)!;
const buttonIn = (within: ParentNode, name: string): HTMLButtonElement =>
  [...within.querySelectorAll<HTMLButtonElement>("button")].find((one) => one.textContent?.trim() === name)!;
const putBack = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>(".v4AskPutBack")!;

describe("'Put it back' under the focus guard (V4A-4)", () => {
  it("a question no longer on screen: its block comes back after the new ones, and focus is on the answer put back", async () => {
    await mount({ given: { question: COST.text, answer: "High.", other: false }, question: COST, at: 0 });
    pressByKeyboard(putBack());
    await guardSettled();
    expect(document.querySelector(".v4AskSetAside")).toBeNull();
    expect(document.activeElement).toBe(buttonIn(blockOf(COST), "High."));
    expect(buttonIn(blockOf(COST), "High.").getAttribute("aria-pressed")).toBe("true");
  });

  it("a question still on screen: the answer goes there, and focus is on it", async () => {
    await mount({ given: { question: YEARS.text, answer: "Later.", other: false }, question: YEARS, at: 1 });
    pressByKeyboard(putBack());
    await guardSettled();
    expect(document.activeElement).toBe(buttonIn(blockOf(YEARS), "Later."));
  });

  it("typed words put back: focus is in the 'Other' line that holds them", async () => {
    await mount({ given: { question: COST.text, answer: "Whatever it takes.", other: true }, question: COST, at: 2 });
    pressByKeyboard(putBack());
    await guardSettled();
    const field = blockOf(COST).querySelector<HTMLInputElement>("input")!;
    expect(field.value).toBe("Whatever it takes.");
    expect(document.activeElement).toBe(field);
  });
});
