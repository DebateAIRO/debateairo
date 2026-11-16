// @vitest-environment jsdom
// Keyboard audit 2026-11-12 (CHR2-2, hook half): the question-refusal screen opens after Start disabled itself, so
// the modal helper captured <body> as the opener and Back, Escape or the "help numbers" screen's Back left focus on
// the page. `useQuestionRefusal` now takes a `returnFocusRef`, passed to both screens, as `useCrisisSupport` does.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractHttpError, QUESTION_NOT_STARTED } from "@debateai/contract";
import { useQuestionRefusal } from "../../apps/ui/components/QuestionRefusal.js";
import { installFocusFixup } from "./kbd-focus-fixup.js";

const home = JSON.parse(readFileSync(resolve(process.cwd(), "apps/ui/messages/en/home.json"), "utf8")) as Record<string, string>;
const sensitive = new ContractHttpError("UNPROCESSABLE", 422, QUESTION_NOT_STARTED, QUESTION_NOT_STARTED, null, null, null,
  { kind: "SUICIDE_AND_ASSISTED_DYING", screen: "SENSITIVE", emergencyNumber: false });

let root: Root;
let uninstall: () => void;
let offer: (failure: unknown) => boolean = () => false;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  uninstall = installFocusFixup();
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  uninstall();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function Page({ start }: Readonly<{ start: (disable: () => void) => ReactNode }>) {
  const question = useRef<HTMLTextAreaElement>(null);
  const refusal = useQuestionRefusal({ catalog: home, locale: "en", returnFocusRef: question });
  offer = refusal.offer;
  return <><textarea ref={question} id="question" />{start(() => undefined)}{refusal.dialog}</>;
}

/** Start held focus and disabled itself while the ask ran, so the browser dropped focus to the page. */
async function refusedAfterStart(): Promise<void> {
  await act(async () => root.render(<Page start={() => <button type="button" id="start">Start</button>} />));
  const start = document.getElementById("start") as HTMLButtonElement;
  start.focus();
  await act(async () => { start.disabled = true; await Promise.resolve(); });
  expect(document.activeElement).toBe(document.body);
  await act(async () => { offer(sensitive); });
  expect(document.querySelector('[data-dialog="question-refusal"]')).not.toBeNull();
}
const question = () => document.getElementById("question");

it("Back returns focus to the question", async () => {
  await refusedAfterStart();
  await act(async () => document.querySelector<HTMLButtonElement>('[data-part="back"]')!.click());
  expect(document.querySelector('[data-dialog="question-refusal"]')).toBeNull();
  expect(document.activeElement).toBe(question());
});

it("Escape returns focus to the question", async () => {
  await refusedAfterStart();
  await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
  expect(document.querySelector('[data-dialog="question-refusal"]')).toBeNull();
  expect(document.activeElement).toBe(question());
});

it("the help numbers screen's Back returns focus to the question too", async () => {
  await refusedAfterStart();
  await act(async () => document.querySelector<HTMLAnchorElement>('[data-part="help-numbers"]')!.click());
  expect(document.querySelector('[data-dialog="question-refusal"]')).toBeNull();
  const back = document.querySelector<HTMLButtonElement>(".crisisSupportBack")!;
  expect(back).not.toBeNull();
  await act(async () => back.click());
  expect(document.querySelector(".crisisSupportBack")).toBeNull();
  expect(document.activeElement).toBe(question());
});
