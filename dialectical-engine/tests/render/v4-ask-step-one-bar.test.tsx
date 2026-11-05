// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { warmCrisisCheck } from "@debateai/contract";

/*
 * V4 start step, Task 75b (owner's evening card "Steps aside", ask-d2 A; journey-d3 A, r2-4, ask-f3, ask-f8; owner answer Q15
 * of 5 Nov): on a phone, step 1's Next sits in the bottom bar like Start (Task 75's V4StartBar, job NEXT): one pinned element
 * with the Free notice, Next, "Just answer it" and the grey quota line; the share, the room notice and a declined consent's
 * line right before it; and it steps aside while the question box has focus. On a computer the same pieces are one plain row
 * under the level block. The level choice is one row of three pills and one grey line, "You choose it for this question. Its
 * map, digs and report all keep it.", with "What does it change?" opening the honest note in place. The session, the ask hook
 * and the server are stood in.
 */
const ask = vi.hoisted(() => ({
  room: null as null | Record<string, unknown>,
  planState: "READ" as "LOADING" | "READ" | "FAILED",
  planIsFree: false,
  freePublicNotice: false,
  consent: true,
  crisis: false,
  submit: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ kind: "STOPPED" })),
  ensureConsent: vi.fn(async (): Promise<boolean> => true),
  offerCrisisHelp: vi.fn((_words: readonly string[]): boolean => true)
}));
const server = vi.hoisted(() => ({ level: Promise.resolve({ reading_level: null }) as Promise<{ reading_level: string | null }> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: string) => ReactNode }) => children("IN") }));
vi.mock("@/components/billing/RoomNotice", () => ({
  RoomNotice: () => <p className="made-up-room">Made-up room notice.</p>,
  alreadyWaitingShown: () => false
}));
// Task 75c: the stand-in keeps what the page hands the header, so a test can see that no level change is offered.
const header = vi.hoisted(() => ({ props: [] as Array<Readonly<Record<string, unknown>>> }));
vi.mock("@/components/v4/V4Header", () => ({
  V4Header: (props: Readonly<Record<string, unknown>>) => {
    header.props.push(props);
    return <header className="v4Hdr" />;
  }
}));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: () => ({
    planTier: ask.planIsFree ? "free" : "plus",
    planIsFree: ask.planIsFree,
    planState: ask.planState,
    freePublicNotice: ask.freePublicNotice,
    room: ask.room,
    submitting: false,
    dialogs: null,
    submit: (...args: unknown[]) => ask.submit(...args),
    ensureConsent: () => ask.ensureConsent(),
    flagsCrisis: (text: string) => ask.crisis && text.length > 0,
    offerCrisisHelp: (words: readonly string[]) => ask.offerCrisisHelp(words)
  })
}));
vi.mock("@/lib/api", () => ({
  contractClient: {
    readAnswerIndex: async () => ({ items: [], open_runs: [], limit: 32, offset: 0, total: 0 }),
    readDigLinks: async () => ({ parent: null, children: [] }),
    readReadingLevel: () => server.level,
    saveReadingLevel: async () => ({ reading_level: "plain" }),
    clarifyAsk: async () => ({ source: "NONE" })
  }
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
warmCrisisCheck();

const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const CSS = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8");
const QUESTION = "Should the city fund the tram line?";
const CRISIS = "I want to kill myself tonight.";
const JUST = "Just answer it: skip the questions, the AIs choose what to look into.";
const QUOTA = "Reading your question uses a little of your quota.";
const DECLINED = "No AI reads your question without your OK. You can agree at any time.";
const NOTICE = "On the Free plan your question and its debate are public. Don't include personal details.";
const KEPT = "You choose it for this question. Its map, digs and report all keep it.";
const HONEST = "The AIs that write your answer and its story write for this level. It also changes how much detail we show you, and sometimes how long the answer is.";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function phone(narrow: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === "(max-width: 600px)" ? narrow : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    })
  });
}

async function settle(): Promise<void> {
  await act(async () => { for (let at = 0; at < 8; at += 1) await Promise.resolve(); });
}

async function mount(options: Readonly<{ question?: string; level?: "plain" | null }> = {}): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4AskClient catalog={CATALOG} homeCatalog={messages("home")} newDebateCatalog={messages("newDebate")} billingCatalog={{}}
      locale="en" crisisCountryHint={null} initialQuestion={options.question ?? QUESTION} initialLevel={options.level === undefined ? "plain" : options.level} />
  ));
  await settle();
  return host;
}

const field = (): HTMLTextAreaElement => host!.querySelector("textarea")!;
const bar = (): HTMLElement => host!.querySelector<HTMLElement>(".v4StartBar")!;
const buttonNamed = (name: string): HTMLButtonElement | undefined =>
  [...host!.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
const nextButton = (): HTMLButtonElement => buttonNamed(CATALOG["v4.ask.continue"]!)!;
const follows = (first: Node, second: Node): boolean => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
async function press(target: HTMLElement): Promise<void> {
  await act(async () => { target.click(); });
  await settle();
}

beforeEach(() => {
  ask.room = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", start_share_percent: 9 };
  ask.planState = "READ";
  ask.planIsFree = false;
  ask.freePublicNotice = false;
  ask.crisis = false;
  ask.submit.mockClear();
  ask.ensureConsent.mockReset();
  ask.ensureConsent.mockImplementation(async () => true);
  ask.offerCrisisHelp.mockClear();
  server.level = Promise.resolve({ reading_level: null });
  header.props = [];
  window.history.replaceState(null, "", "/v4");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  Reflect.deleteProperty(window, "matchMedia");
});

describe("on a phone: Next in the bottom bar (ask-d2 A, journey-d3 A)", () => {
  beforeEach(() => phone(true));

  it("one pinned element holds exactly Next, 'Just answer it' and the grey quota line, in that order", async () => {
    await mount();
    expect([...bar().children].map((child) => child.textContent)).toEqual([CATALOG["v4.ask.continue"], JUST, QUOTA]);
    expect(bar().classList.contains("v4StartBar--next")).toBe(false);
  });

  it("on Free the public notice comes first inside it", async () => {
    ask.planIsFree = true;
    ask.freePublicNotice = true;
    ask.room = { ...ask.room, plan_id: "FREE" };
    await mount();
    expect(bar().children[0]!.textContent).toBe(NOTICE);
    expect([...bar().children].slice(1).map((child) => child.textContent)).toEqual([CATALOG["v4.ask.continue"], JUST, QUOTA]);
  });

  it("the share line and the room notice come before it, outside it", async () => {
    await mount();
    const share = [...host!.querySelectorAll("p")].find((line) => line.textContent === "This question uses about 9% of today.")!;
    const notice = host!.querySelector(".made-up-room")!;
    for (const line of [share, notice]) {
      expect(bar().contains(line)).toBe(false);
      expect(follows(line, bar())).toBe(true);
    }
  });

  it("it steps aside while the question box has focus, and comes back when it loses it", async () => {
    await mount();
    expect(bar().classList.contains("v4StartBar--aside")).toBe(false);
    await act(async () => { field().focus(); });
    expect(bar().classList.contains("v4StartBar--aside")).toBe(true);
    await act(async () => { field().blur(); });
    expect(bar().classList.contains("v4StartBar--aside")).toBe(false);
  });

  it("after a declined consent, its line and 'Show it again' sit right before it, outside it", async () => {
    ask.ensureConsent.mockImplementation(async () => false);
    await mount();
    await press(nextButton());
    const line = host!.querySelector(".v4AskDeclined")!;
    expect(line.textContent).toContain(DECLINED);
    expect(line.textContent).toContain(CATALOG["v4.ask.consentShowAgain"]);
    expect(bar().contains(line)).toBe(false);
    expect(line.nextElementSibling).toBe(bar());
  });

  it("ask-f3: crisis words while the plan loads keep Next pressable; its press opens the help screen and nothing else", async () => {
    ask.planState = "LOADING";
    ask.crisis = true;
    await mount({ question: CRISIS });
    const next = bar().querySelector<HTMLButtonElement>(".v4BtnPrimary")!;
    expect(next.textContent).toBe(CATALOG["v4.ask.continue"]);
    expect(next.disabled).toBe(false);
    await press(next);
    expect(ask.offerCrisisHelp).toHaveBeenCalledWith([CRISIS]);
    expect(ask.ensureConsent).not.toHaveBeenCalled();
    expect(ask.submit).not.toHaveBeenCalled();
    expect(host!.querySelector(".v4AskReadTitle")).toBeNull();
  });
});

describe("on a computer: one plain row under the level block", () => {
  beforeEach(() => phone(false));

  it("no sticky element: the Next row is the plain row, after the level block", async () => {
    await mount({ level: null });
    expect(host!.querySelectorAll(".v4StartBar")).toHaveLength(1);
    expect(bar().classList.contains("v4StartBar--next")).toBe(true);
    expect(CSS).toMatch(/\.v4StartBar--next\s*\{[^}]*position:\s*static;/u);
    expect(follows(host!.querySelector(".v4AskLevels")!, bar())).toBe(true);
  });

  it("after a decline, the declined line comes right after Next and before the link", async () => {
    ask.ensureConsent.mockImplementation(async () => false);
    await mount();
    await press(nextButton());
    const line = host!.querySelector(".v4AskDeclined")!;
    expect(bar().contains(line)).toBe(true);
    expect(nextButton().nextElementSibling).toBe(line);
    expect(follows(line, buttonNamed(JUST)!)).toBe(true);
  });
});

describe("the CSS (read as text)", () => {
  it("the bar steps aside for the keyboard and for the cookie bar", () => {
    expect(CSS).toMatch(/\.v4StartBar--aside\s*\{\s*position:\s*static;?\s*\}/u);
    expect(CSS).toContain(".appShell:has(.consentBar) .v4StartBar { position: static; }");
  });
});

describe("the level block (every first screen; owner answer Q15, Task 75d)", () => {
  it("three radios in one row, the plain sentence with no label box, and one grey line with 'What does it change?'", async () => {
    await mount({ level: null });
    const radios = [...host!.querySelectorAll<HTMLInputElement>(".v4AskLevels input[type=radio]")];
    expect(radios).toHaveLength(3);
    const row = radios[0]!.closest(".v4AskLevelRow")!;
    expect(radios.every((radio) => row.contains(radio))).toBe(true);
    expect(CSS).toMatch(/\.v4AskLevelRow\s*\{[^}]*flex-wrap:\s*nowrap;/u);
    expect(host!.querySelector(".v4AskSample")?.textContent).toBe(CATALOG["v4.ask.levelShows.plain"]);
    expect(host!.querySelector(".v4AskSample")?.getAttribute("aria-live")).toBe("polite");
    expect(host!.textContent).not.toContain("What this level shows");
    expect(host!.textContent).not.toContain("You choose it here. Later it sits as a small label at the top");
    expect(host!.querySelector(".v4AskLevelKept")?.textContent).toContain(KEPT);
    const what = buttonNamed("What does it change?")!;
    expect(what.getAttribute("aria-expanded")).toBe("false");
    expect(host!.textContent).not.toContain("The AIs that write your answer");
    await press(what);
    expect(what.getAttribute("aria-expanded")).toBe("true");
    expect(host!.textContent).toContain(HONEST);
    expect(host!.textContent).not.toContain("If you change it later");
    await press(what);
    expect(what.getAttribute("aria-expanded")).toBe("false");
    expect(host!.textContent).not.toContain("The AIs that write your answer");
  });

  // Task 75d (owner, 5 Nov, second round): no account level is read, so nothing is held: the block is there from the first frame.
  it("is there from the first frame, on Plain words, while an account would never answer; no held place is left", async () => {
    server.level = new Promise(() => undefined);
    await mount({ level: null });
    expect(host!.querySelector(".v4AskLevelsHold")).toBeNull();
    expect([...host!.querySelectorAll<HTMLInputElement>(".v4AskLevels input[type=radio]")].map((radio) => radio.checked)).toEqual([true, false, false]);
    expect(CSS).not.toContain(".v4AskLevelsHold");
  });

  it("the words: the grey line is the owner's, and the honest note ends after its second sentence", () => {
    expect(CATALOG["v4.ask.levelKept"]).toBe(KEPT);
    expect(CATALOG["v4.ask.levelWhat"]).toBe("What does it change?");
    expect(CATALOG["v4.ask.levelHonest"]).toBe(HONEST);
    expect(CATALOG["v4.ask.levelShowsLabel"]).toBeUndefined();
    expect(CATALOG["v4.ask.levelNote"]).toBeUndefined();
    expect(CATALOG["v4.ask.levelChangeLater"]).toBeUndefined();
  });
});

/*
 * V4 start step, Task 75c (owner answer Q15 of 5 Nov): the level is chosen only on step 1, for this question; the ask page's
 * header offers no level change (the review session's header stops drawing the menu; this page stops handing it one).
 */
describe("Task 75c: the level is chosen only here, for this question", () => {
  it("the ask page's header gets no level change, before and after the level is known", async () => {
    await mount({ level: null });
    expect(header.props.length).toBeGreaterThan(0);
    expect(header.props.every((props) => props.onReadingLevel === undefined)).toBe(true);
    expect(host!.querySelectorAll(".v4AskLevels input[type=radio]")).toHaveLength(3);
  });
});
