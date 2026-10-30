import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import type { ContinueOutcome } from "../../apps/ui/lib/v4/money.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import type { V4AskOutcome } from "../../apps/ui/lib/v4/useV4Ask.js";
import type { Answer, AnswerStory, AskParent, DigLinks, RunProjection, UsageBorrow } from "../../packages/contract/src/index.js";
import { createSeed } from "../../tools/v4-mock-api/seed.js";

/*
 * Perplexity plan W3-4: the V4 map page (V4DebateClient) in jsdom, for the dig-flow click tests. The page's own code
 * runs (map builder, tree, outline, panel, tray, dig choice, money lines, Undo timer); only its reads and the ask are
 * stand-ins, set per test on `harness`. The seeded answer is the mock API's (tools/v4-mock-api): four paths with dig
 * suggestions of every kind. Each test mounts its own run id, because the page keeps the digs started in this visit in
 * module memory (Decision A: never in the browser).
 *
 * The test files register these stand-ins with vi.mock (vi.mock must sit in the test file itself):
 *   vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
 *   … see tests/render/v4-dig-suggestions.test.tsx.
 */

export const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;

const seed = createSeed(fixture);
const ANSWER_ID = "aaaa1111-1111-4111-8111-111111111111";

export function seededAnswer(runId: string, extra: Partial<Answer> = {}): Answer {
  return {
    ...(seed.answer({
      answerId: ANSWER_ID, runRef: runId,
      question: "Should countries build new nuclear power, or put the money into renewables and storage?",
      askedAt: "2026-10-27T15:12:00.000Z", servedAt: "2026-10-27T15:40:00.000Z", web: "PAID"
    }) as Answer),
    ...extra
  };
}

export const seededStory = (): AnswerStory => seed.story(ANSWER_ID, "READY", "2026-10-27T15:41:00.000Z") as AnswerStory;

/** The answer's `dig` part at `level` (a dig of a path of `parentRunId`). */
export function digPart(parentRunId: string, level: number): Answer["dig"] {
  return { parent_run_id: parentRunId, position_ref: "n-mix", places: ["path:n-mix"], level, picks: [], rewrite: null };
}

type Submit = (questionLine: string, mode: string, origin?: string, parent?: AskParent | null) => Promise<V4AskOutcome>;

export const harness = {
  planTier: "premium" as "free" | "premium",
  room: null as AskRoom | null,
  submit: vi.fn<Submit>(),
  /** Every `dig` the page handed useV4Ask (its room read), newest last. */
  digRooms: [] as unknown[],
  answer: null as Answer | null,
  story: null as AnswerStory | null,
  /** Set: the page reads a running (not yet served) debate. */
  run: null as RunProjection | null,
  records: { parent: null, children: [] } as DigLinks,
  borrowed: [] as UsageBorrow[],
  continueRun: vi.fn<(runId: string) => Promise<ContinueOutcome>>()
};

export function resetHarness(): void {
  harness.planTier = "premium";
  harness.room = null;
  harness.submit = vi.fn<Submit>(async () => ({ kind: "STARTED", runId: crypto.randomUUID() }));
  harness.digRooms = [];
  harness.answer = null;
  harness.story = seededStory();
  harness.run = null;
  harness.records = { parent: null, children: [] };
  harness.borrowed = [];
  harness.continueRun = vi.fn(async () => ({ kind: "CONTINUING" as const }));
}
resetHarness();

// ── The stand-ins (each test file registers them with vi.mock) ────────────────────────────────────────────────────
export const authGateMock = {
  AuthGate: ({ children }: { children: (token: string) => ReactNode }) => children("token")
};
export const headerMock = {
  V4Header: ({ children }: { children?: ReactNode }) => <header className="v4StandInHeader">{children}</header>
};
export const roomNoticeMock = { RoomNotice: () => null };
export const useV4AskMock = {
  useV4Ask: (input: { dig?: unknown }) => {
    harness.digRooms.push(input.dig ?? null);
    return {
      planTier: harness.planTier,
      submit: (...args: Parameters<Submit>) => harness.submit(...args),
      flagsCrisis: () => false,
      room: harness.room,
      submitting: false,
      dialogs: null
    };
  }
};
export function loadMock(original: Record<string, unknown>) {
  return {
    ...original,
    loadV4: async (id: string) => harness.run !== null
      ? { kind: "RUN", runId: id, run: harness.run }
      : { kind: "SERVED", runId: id, answer: harness.answer ?? seededAnswer(id), story: harness.story },
    loadStory: async () => harness.story,
    loadDigView: async (link: DigLink): Promise<DigView> => ({
      link, state: "DONE", headline: "The dig's short answer.", counts: { SURE: 1, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 }
    })
  };
}
export function digIndexMock(original: Record<string, unknown>) {
  return { ...original, readQuestionIndex: async () => [] };
}
export function accountMemoryMock(original: Record<string, unknown>) {
  return {
    ...original,
    readDigRecords: async () => harness.records,
    readLastVisit: async () => null,
    recordLastVisit: async () => true,
    recordDig: async () => true
  };
}
export function moneyMock(original: Record<string, unknown>) {
  return { ...original, readBorrowed: async () => harness.borrowed, continueRun: (runId: string) => harness.continueRun(runId) };
}

// ── Mounting ──────────────────────────────────────────────────────────────────────────────────────────────────────
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** The page's layout queries: phone (< 768 px) or desktop. */
function stubWidth(width: 375 | 1280): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const max = Number(/max-width:\s*(\d+)px/u.exec(query)?.[1] ?? "0");
      return { matches: width <= max, media: query, addEventListener() {}, removeEventListener() {} };
    }
  });
}

/** Lets the page's reads land (fake timers: their promises, then any timer up to `ms`). */
export async function settle(ms = 1): Promise<void> {
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(round === 0 ? ms : 1);
    });
  }
}

/** Moves the fake clock on by `ms`, inside act (the Undo countdown and the send are timers). */
export async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Mounts the map page of a fresh run id at `width`; returns the run id. */
export async function mountMap(width: 375 | 1280 = 1280, runId: string = crypto.randomUUID()): Promise<string> {
  stubWidth(width);
  const { V4DebateClient } = await import("../../apps/ui/components/v4/V4DebateClient.js");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <V4DebateClient id={runId} initialLevel="background" catalog={CATALOG} homeCatalog={{}} newDebateCatalog={{}}
      billingCatalog={{}} locale="en" crisisCountryHint={null} />
  ));
  await settle();
  return runId;
}

export async function unmountMap(): Promise<void> {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
}

// ── Finding things on the page ────────────────────────────────────────────────────────────────────────────────────
export function page(): HTMLDivElement {
  if (host === null) throw new Error("not mounted");
  return host;
}

export function text(): string {
  return (page().textContent ?? "").replace(/\s+/g, " ");
}

export function buttonNamed(name: string, within: ParentNode = page()): HTMLButtonElement {
  const found = [...within.querySelectorAll("button")].find((button) => button.textContent?.replace(/\s+/g, " ").trim() === name);
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

export function buttonsNamed(name: string, within: ParentNode = page()): HTMLButtonElement[] {
  return [...within.querySelectorAll("button")].filter((button) => button.textContent?.replace(/\s+/g, " ").trim() === name);
}

export async function click(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
  await settle();
}

/** Types into a textarea the way React hears it. */
export async function typeInto(area: HTMLTextAreaElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(area, value);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The tree's branch of a path (desktop), by the path's position in the answer: n-mix, n-renew, n-nuclear, n-smr. */
export function branch(index: number): HTMLElement {
  const found = page().querySelectorAll<HTMLElement>(".v4MapBranch")[index];
  if (found === undefined) throw new Error(`no branch ${index}`);
  return found;
}

/** Opens a path in the panel by its tree card. */
export async function openPath(index: number): Promise<void> {
  await click(branch(index).querySelector<HTMLButtonElement>(".v4MapPath")!);
}

export function panel(): HTMLElement {
  return page().querySelector<HTMLElement>(".v4Panel")!;
}

export function tray(): HTMLElement | null {
  return page().querySelector<HTMLElement>(".v4DebTray");
}

export const PATHS = Object.freeze({ mix: 0, renew: 1, nuclear: 2, smr: 3 });
