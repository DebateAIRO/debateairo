// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { AskClarifyResponse, ClarifyQuestion } from "@debateai/contract";

import { V4AskQuestions } from "../../apps/ui/components/v4/V4AskQuestions.js";
import type { V4Goal, V4GoalAnswer } from "../../apps/ui/lib/v4/types.js";

/*
 * Keyboard audit 2026-11-12 (V4A-5): once the answered questions fold, a question still open stays where it is when it gets
 * answered: the pressed answer keeps its place, stays visible and keeps the focus ("Other…" puts the cursor in a line the
 * person can see). The fold holds what was answered when it closed. Every text is made up.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const NEW_DEBATE = messages("newDebate");

const REGION: ClarifyQuestion = { text: "Which region?", answers: ["The north.", "The south."] };
const YEARS: ClarifyQuestion = { text: "Which years?", answers: ["Soon.", "Later."] };
const REPLY: AskClarifyResponse = { source: "AI", questions: [REGION, YEARS] };

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let setFolded: ((folded: boolean) => void) | null = null;

function Page({ startFolded }: Readonly<{ startFolded: boolean }>) {
  const [goal, setGoal] = useState<V4Goal>({ answers: [{ question: REGION.text, answer: "The north.", other: false }], matters: "" });
  const [folded, fold] = useState(startFolded);
  setFolded = fold;
  const onAnswer = (question: ClarifyQuestion, next: V4GoalAnswer | null): void => {
    setGoal((current) => {
      const others = current.answers.filter((one) => one.question !== question.text);
      return { ...current, answers: next === null ? others : [...others, next] };
    });
  };
  return (
    <V4AskQuestions
      clarify={{ reply: REPLY, waiting: false, startedAt: null, retry: () => undefined }}
      questions={REPLY.questions}
      goal={goal}
      planIsFree={false}
      seeded
      onAnswer={onAnswer}
      fold={{ folded, onShow: () => fold(false) }}
      catalog={CATALOG}
      newDebateCatalog={NEW_DEBATE}
      locale="en"
    />
  );
}

async function mount(startFolded: boolean): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Page startFolded={startFolded} />));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  setFolded = null;
});

const blockOf = (question: ClarifyQuestion): HTMLElement =>
  [...host!.querySelectorAll<HTMLElement>('.v4AskBlock[role="group"]')].find((one) => one.querySelector(".v4AskLabel")?.textContent === question.text)!;
const buttonIn = (within: ParentNode, name: string): HTMLButtonElement =>
  [...within.querySelectorAll<HTMLButtonElement>("button")].find((one) => one.textContent?.trim() === name)!;
const hiddenAbove = (element: Element): boolean => element.closest("[hidden]") !== null;

describe("an open question answered while the answers are folded (V4A-5)", () => {
  it("folded by a press on a path: the open question's answer keeps its place, stays visible and keeps the focus", async () => {
    await mount(false);
    await act(async () => setFolded!(true));
    expect(hiddenAbove(blockOf(REGION))).toBe(true);
    const soon = buttonIn(blockOf(YEARS), "Soon.");
    expect(hiddenAbove(soon)).toBe(false);
    await act(async () => { soon.focus(); });
    await act(async () => { soon.click(); });
    expect(soon.isConnected).toBe(true);
    expect(soon.getAttribute("aria-pressed")).toBe("true");
    expect(hiddenAbove(soon)).toBe(false);
    expect(document.activeElement).toBe(soon);
  });

  it("'Other…' on the open question puts the cursor in a line that is not hidden", async () => {
    await mount(true);
    const other = buttonIn(blockOf(YEARS), NEW_DEBATE["newDebate.askText.otherAnswer"]!);
    await act(async () => { other.focus(); });
    await act(async () => { other.click(); });
    const field = blockOf(YEARS).querySelector<HTMLInputElement>("input")!;
    expect(field).not.toBeNull();
    expect(hiddenAbove(field)).toBe(false);
    expect(document.activeElement).toBe(field);
  });

  it("folding again takes in what was answered since", async () => {
    await mount(true);
    await act(async () => { buttonIn(blockOf(YEARS), "Later.").click(); });
    expect(hiddenAbove(blockOf(YEARS))).toBe(false);
    await act(async () => setFolded!(false));
    await act(async () => setFolded!(true));
    expect(hiddenAbove(blockOf(REGION))).toBe(true);
    expect(hiddenAbove(blockOf(YEARS))).toBe(true);
  });
});
