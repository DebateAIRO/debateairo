// @vitest-environment jsdom
// V4 start step, Task 57g (the owner's 7 Nov answers, replacing Task 57e's re-use link): "if it stays the same, we need to use whatever
// was already generated and paid for ... if they change the question, then it's a new question". The ask page opened from the stopped
// page's "Change the question" (`?again=<run id>`) reads the stopped debate back (useAskAgain) and learns whether the server can continue it
// (`continuable`). With the words left as they were (trimmed equal) and a debate that can continue, Next runs no reading, asks for no
// consent and charges nothing: the page goes back to that debate's map, which starts the same Continue there with its 10-second Undo
// (the map's side: tests/render/v4-failed-continue.test.tsx). Changed words are a new question, as today. Every question here is made up.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunProjection } from "@debateai/contract";

const mocks = vi.hoisted(() => ({
  readRun: vi.fn(),
  clarify: vi.fn(async () => ({ source: "NONE" })),
  push: vi.fn(),
  consent: vi.fn(async () => true),
  submit: vi.fn(async () => ({ kind: "STOPPED" }))
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => ReactNode }) => children("IN") }));
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null, alreadyWaitingShown: () => false }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
vi.mock("@/lib/v4/startUndo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/v4/startUndo.js")>()), START_UNDO_MS: 0
}));
vi.mock("@/lib/api", () => ({
  contractClient: {
    readAnswerIndex: async () => ({ items: [], open_runs: [] }),
    clarifyAsk: (...args: unknown[]) => mocks.clarify(...(args as [])),
    readRun: (runId: string) => mocks.readRun(runId)
  }
}));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: () => ({
    planTier: "premium", submit: (...args: unknown[]) => mocks.submit(...(args as [])), ensureConsent: () => mocks.consent(), flagsCrisis: () => false,
    offerCrisisHelp: () => false, room: null, submitting: false, dialogs: null
  })
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { askAgainContinuable, sameStoppedWords, takeContinueHandOff } from "../../apps/ui/lib/v4/failedRun.js";
import { useAskAgain, type AskAgain } from "../../apps/ui/lib/v4/useAskAgain.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const RUN_ID = "55555555-5555-4555-8555-555555555555";
const OWN = "Should Harbour Town build a second ferry pier?";
const LINE = `${OWN}\n\nLooking at Harbour Town.`;
const FAILED: RunProjection = Object.freeze({ run_ref: RUN_ID, question_line: LINE, state: "FAILED",
  terminal_reason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", hold_until: null, quota_used: "SOME", continuable: true,
  reading_level: "background" } as RunProjection);
const { continuable: _continuable, ...NOT_CONTINUABLE_FIELDS } = FAILED as RunProjection & { continuable?: true };
void _continuable;
const NOT_CONTINUABLE = NOT_CONTINUABLE_FIELDS as RunProjection;
const DIG_LINE = `Look deeper into this part of the answer: Ferry queues.\n\nThis follows from an earlier question: “${OWN}”`;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  mocks.readRun.mockReset();
  mocks.clarify.mockClear();
  mocks.push.mockClear();
  mocks.consent.mockClear();
  mocks.submit.mockClear();
  takeContinueHandOff(RUN_ID, Date.now());
});

function mountInto(node: ReactNode): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  return act(async () => { root!.render(node); });
}

/** What useAskAgain gives for `run`, once its read has landed. */
async function againOf(run: RunProjection): Promise<AskAgain | null> {
  mocks.readRun.mockResolvedValue(run);
  let seen: AskAgain | null = null;
  function Probe() {
    seen = useAskAgain(RUN_ID, CATALOG);
    return null;
  }
  await mountInto(<Probe />);
  await act(async () => { await Promise.resolve(); });
  return seen;
}

/** The ask page opened from "Change the question" of `run`, with its words filled in from the server. */
async function mountAsk(run: RunProjection): Promise<HTMLTextAreaElement> {
  mocks.readRun.mockResolvedValue(run);
  await mountInto(
    <V4AskClient catalog={CATALOG} homeCatalog={{}} newDebateCatalog={messages("newDebate")} billingCatalog={{}} locale="en" crisisCountryHint={null}
      initialQuestion="" initialLevel="plain" againRunId={RUN_ID} />
  );
  for (let round = 0; round < 4; round += 1) await act(async () => undefined);
  return host!.querySelector<HTMLTextAreaElement>("textarea")!;
}

async function typeInto(box: HTMLTextAreaElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(box, value);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const buttonCalled = (name: string): HTMLButtonElement => [...host!.querySelectorAll("button")].find((button) => button.textContent?.trim() === name)!;

async function press(name: string): Promise<void> {
  await act(async () => buttonCalled(name).click());
  for (let round = 0; round < 4; round += 1) await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
}

describe("the stopped debate's read says whether it can continue (Task 57g)", () => {
  it("a FAILED read that says continuable: continuable, beside today's words and level", async () => {
    expect(await againOf(FAILED)).toEqual({ question: OWN, level: "background", continuable: true });
  });

  it("not continuable when the read does not say it, when the run did not fail, and for a dig", async () => {
    expect(await againOf(NOT_CONTINUABLE)).toEqual({ question: OWN, level: "background", continuable: false });
    expect(askAgainContinuable({ ...FAILED, state: "SETTLED", terminal_reason: null } as RunProjection, CATALOG)).toBe(false);
    expect(askAgainContinuable({ ...FAILED, question_line: DIG_LINE } as RunProjection, CATALOG)).toBe(false);
    expect(askAgainContinuable(FAILED, CATALOG)).toBe(true);
  });

  it("the same words are the same words once trimmed; any other change is a new question", () => {
    expect(sameStoppedWords(`  ${OWN}\n`, OWN)).toBe(true);
    expect(sameStoppedWords(`${OWN} Today?`, OWN)).toBe(false);
    expect(sameStoppedWords(OWN, null)).toBe(false);
  });
});

describe("Next with the words unchanged continues the stopped debate; changed words ask a new one (Task 57g)", () => {
  it("unchanged words: back to its map, which continues it; no consent, no reading, no ask", async () => {
    const box = await mountAsk(FAILED);
    expect(box.value).toBe(OWN);
    await press(CATALOG["v4.ask.continue"]!);
    expect(mocks.push).toHaveBeenCalledWith(`/v4/debate/${RUN_ID}`);
    expect(takeContinueHandOff(RUN_ID, Date.now())).toBe(true);
    expect(mocks.consent).not.toHaveBeenCalled();
    expect(mocks.clarify).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("unchanged words with spaces around them: the same", async () => {
    const box = await mountAsk(FAILED);
    await typeInto(box, `${OWN}  `);
    await press(CATALOG["v4.ask.continue"]!);
    expect(mocks.push).toHaveBeenCalledWith(`/v4/debate/${RUN_ID}`);
    expect(mocks.consent).not.toHaveBeenCalled();
  });

  it("'Just answer it' with the words unchanged continues it too, never a second debate", async () => {
    await mountAsk(FAILED);
    await press(CATALOG["v4.ask.justAnswer"]!);
    expect(mocks.push).toHaveBeenCalledWith(`/v4/debate/${RUN_ID}`);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.consent).not.toHaveBeenCalled();
  });

  it("changed words: a new question (the consent, then the reading), and nothing is handed to the map", async () => {
    const box = await mountAsk(FAILED);
    await typeInto(box, `${OWN} And a third one by 2030?`);
    await press(CATALOG["v4.ask.continue"]!);
    expect(mocks.consent).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(takeContinueHandOff(RUN_ID, Date.now())).toBe(false);
  });

  it("a stopped debate that cannot continue: the same words are a new question, as before", async () => {
    await mountAsk(NOT_CONTINUABLE);
    await press(CATALOG["v4.ask.continue"]!);
    expect(mocks.consent).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(takeContinueHandOff(RUN_ID, Date.now())).toBe(false);
  });
});
