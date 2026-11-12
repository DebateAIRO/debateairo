// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Owner review 3 Nov 2026 (wait-f11, map-f30): "Ask this again" opens the ask step with the question filled in. The address
 * names only the debate (`?again=<run id>`); the person's own words are read back from the server (their own debate), the
 * lines added from their step-2 answers are left for the ask step to add again, a dig's text is never put in the box, and
 * words the person already typed are never replaced. Nothing starts by itself.
 */
const reads = vi.hoisted(() => ({ runs: new Map<string, unknown>(), asked: [] as string[] }));
const submitted = vi.hoisted(() => ({ calls: [] as unknown[][], levels: [] as unknown[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// The ask page learns the session beside the page (ask-d1 D, w1-step1's V4AskGate): a signed-in person here, whose
// earlier debate the page may read.
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => React.ReactNode }) => children("IN") }));
// V4 start step, Task 70b: no notice shows, so it never says one question already waits (sentence D).
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null, alreadyWaitingShown: () => false }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
// "Just answer it" waits out its Undo window before the send; here the window is 0 and the test lets its timer run.
vi.mock("@/lib/v4/startUndo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/v4/startUndo.js")>()), START_UNDO_MS: 0
}));
vi.mock("@/lib/api", () => ({
  contractClient: {
    readAnswerIndex: async () => ({ items: [], open_runs: [] }),
    clarifyAsk: async () => ({ source: "NONE" }),
    readRun: async (runId: string) => {
      reads.asked.push(runId);
      const run = reads.runs.get(runId);
      if (run === undefined) throw new Error("not found");
      return run;
    }
  }
}));
vi.mock("@/lib/v4/useV4Ask", () => ({
  // Task 75d: the level the page hands the ask hook is the level its asks are sent at.
  useV4Ask: (options: { readingLevel?: unknown }) => {
    submitted.levels.push(options.readingLevel);
    return { planTier: "premium", submit: async (...args: unknown[]) => { submitted.calls.push([...args, options.readingLevel]); return { kind: "STOPPED" }; }, ensureConsent: async () => true, flagsCrisis: () => false, room: null, submitting: false, dialogs: null };
  }
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { digQuestion } from "../../apps/ui/lib/v4/askText.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const RUN = "44444444-4444-4444-8444-444444444444";
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  reads.runs.clear();
  reads.asked = [];
  submitted.calls = [];
  submitted.levels = [];
});

async function mountAsk(againRunId: string | null, initialQuestion = ""): Promise<HTMLTextAreaElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <V4AskClient catalog={CATALOG} homeCatalog={{}} newDebateCatalog={messages("newDebate")} billingCatalog={{}} locale="en" crisisCountryHint={null}
      initialQuestion={initialQuestion} initialLevel="plain" againRunId={againRunId} />
  ));
  for (let round = 0; round < 3; round += 1) await act(async () => undefined);
  return host.querySelector<HTMLTextAreaElement>("textarea")!;
}

function failed(questionLine: string, readingLevel?: "plain" | "background" | "expert") {
  return { run_ref: RUN, question_line: questionLine, state: "FAILED", terminal_reason: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM", hold_until: null,
    ...(readingLevel === undefined ? {} : { reading_level: readingLevel }) };
}

const levelsChecked = (): boolean[] => [...host!.querySelectorAll<HTMLInputElement>(".v4AskLevels input[type=radio]")].map((radio) => radio.checked);
const justAnswer = (): HTMLButtonElement => [...host!.querySelectorAll("button")].find((button) => button.textContent?.trim() === CATALOG["v4.ask.justAnswer"])!;

describe("'Ask this again' fills the ask step from the server (wait-f11)", () => {
  it("fills the box with the person's own words of that debate, and sends nothing", async () => {
    reads.runs.set(RUN, failed("Will AI tutors replace homework help from teachers within five years?\n\nWhere? Romania."));
    const box = await mountAsk(RUN);
    expect(reads.asked).toEqual([RUN]);
    expect(box.value).toBe("Will AI tutors replace homework help from teachers within five years?");
    expect(submitted.calls).toEqual([]);
  });

  it("never puts a dig's text for the AIs in the box, and leaves the box empty when the debate cannot be read", async () => {
    const dig = digQuestion({ kind: "open", questions: [{ id: "w", kind: "WOULD_CHANGE", text: "What would change it?", star: false, pathId: null }] },
      "Should we build it?", CATALOG, "en");
    reads.runs.set(RUN, failed(dig));
    expect((await mountAsk(RUN)).value).toBe("");
    await act(async () => root?.unmount());
    host?.remove();
    expect((await mountAsk("55555555-5555-4555-8555-555555555555")).value).toBe("");
  });

  it("does not replace words the person typed before the question came back, and reads nothing without a debate named", async () => {
    let answer: (run: unknown) => void = () => undefined;
    reads.runs.set(RUN, new Promise((resolve) => { answer = resolve; }));
    const box = await mountAsk(RUN);
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(box, "Something I started writing");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => answer(failed("Will AI tutors replace homework help?")));
    await act(async () => undefined);
    expect(box.value).toBe("Something I started writing");
    await act(async () => root?.unmount());
    host?.remove();
    reads.asked = [];
    expect((await mountAsk(null)).value).toBe("");
    expect(reads.asked).toEqual([]);
  });
});

/*
 * V4 start step, Task 75d (owner, 5 Nov): "Ask this again" carries the failed debate's own level. The address names only the
 * debate; its level is read back from the server with its words (the run read's `reading_level`), never from the address. A
 * debate asked without one starts on Plain words, as every new question does; a level the person chose meanwhile stays.
 */
describe("'Ask this again' keeps the failed debate's level (Task 75d)", () => {
  it("a failed Expert debate: step 1 shows Expert chosen, and the ask is sent at Expert", async () => {
    reads.runs.set(RUN, failed("Will AI tutors replace homework help?", "expert"));
    window.history.replaceState(null, "", `/v4?again=${RUN}&level=plain`);
    try {
      await mountAsk(RUN);
      expect(levelsChecked()).toEqual([false, false, true]);
      await act(async () => justAnswer().click());
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      for (let round = 0; round < 3; round += 1) await act(async () => undefined);
      expect(submitted.calls).toHaveLength(1);
      expect(submitted.calls[0]!.at(-1)).toBe("expert");
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("a failed debate asked without a level starts on Plain words", async () => {
    reads.runs.set(RUN, failed("Will AI tutors replace homework help?"));
    await mountAsk(RUN);
    expect(levelsChecked()).toEqual([true, false, false]);
    expect(submitted.levels.at(-1)).toBe("plain");
  });

  it("a level the person chose before the debate came back stays theirs", async () => {
    let answer: (run: unknown) => void = () => undefined;
    reads.runs.set(RUN, new Promise((resolve) => { answer = resolve; }));
    await mountAsk(RUN);
    const background = host!.querySelectorAll<HTMLInputElement>(".v4AskLevels input[type=radio]")[1]!;
    await act(async () => background.click());
    await act(async () => answer(failed("Will AI tutors replace homework help?", "expert")));
    await act(async () => undefined);
    expect(levelsChecked()).toEqual([false, true, false]);
    expect(submitted.levels.at(-1)).toBe("background");
  });
});
