// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askQuestionMaxBytes } from "@debateai/contract";

/*
 * The ask page's step 1 after the owner's screen review (3 Nov 2026): ask-d1 D (a signed-out visitor sees the real page,
 * "Sign in" at the end of the header (drawn by the header itself since ask-d6 A), the promise line, the seed of the map on
 * a first visit), journey-f18 / read-f25 (the four steps above the title), ask-f14 / read-f18 (a
 * visible reason, read out with both buttons, and the red line cleared by new words), ask-f15 (one choice of three),
 * ask-f16 (the level's place held), ask-f18 / ask-d4 C (the used-up line above the box) and ask-d5 B (the "Your maps"
 * shelf with its state words and digs). The session, the ask hook and the server are stood in.
 */
const gate = vi.hoisted(() => ({ session: "IN" as "CHECKING" | "IN" | "OUT" }));
const ask = vi.hoisted(() => ({
  room: null as null | Record<string, unknown>,
  submit: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ kind: "STOPPED" }))
}));
const server = vi.hoisted(() => ({
  readAnswerIndex: vi.fn(async (_limit: number, _offset: number): Promise<unknown> => ({ items: [], open_runs: [], limit: 32, offset: 0, total: 0 })),
  readDigLinks: vi.fn(async (_runId: string): Promise<unknown> => ({ parent: null, children: [] })),
  level: Promise.resolve({ reading_level: null }) as Promise<{ reading_level: string | null }>
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: string) => ReactNode }) => children(gate.session) }));
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null }));
// ask-d6 A: the header draws "Sign in" or the round account button itself (tests/render/v4-header-account.test.tsx); the
// stand-in shows what the page hands it: the session it learnt and any classic link.
vi.mock("@/components/v4/V4Header", () => ({
  V4Header: ({ children, session, classicHref = null }: { children?: ReactNode; session?: string; classicHref?: string | null }) => (
    <header className="v4Hdr" data-session={session ?? "absent"} data-classic={classicHref ?? "none"}>{children}</header>
  )
}));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: () => ({
    planTier: "premium", freePublicNotice: false, room: ask.room, submitting: false, dialogs: null,
    submit: (...args: unknown[]) => ask.submit(...args), ensureConsent: async () => true, flagsCrisis: () => false
  })
}));
vi.mock("@/lib/api", () => ({
  contractClient: {
    readAnswerIndex: (limit: number, offset: number) => server.readAnswerIndex(limit, offset),
    readDigLinks: (runId: string) => server.readDigLinks(runId),
    readReadingLevel: () => server.level,
    saveReadingLevel: async () => ({ reading_level: "plain" }),
    clarifyAsk: async () => ({ source: "NONE" })
  }
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const QUESTION = "Should the city fund the tram line?";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

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
const button = (name: string): HTMLButtonElement => [...host!.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name)!;
const nextButton = () => button(CATALOG["v4.ask.continue"]!);
const justButton = () => button(CATALOG["v4.ask.justAnswer"]!);

async function type(text: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field(), text);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/**
 * Presses a link and answers whether the page's own handler stopped it; the link is then stopped anyway (jsdom has no
 * navigation).
 */
async function pressLink(link: HTMLAnchorElement): Promise<boolean> {
  let stopped = false;
  const after = (event: Event): void => {
    stopped = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", after);
  try {
    await act(async () => { link.click(); });
  } finally {
    document.removeEventListener("click", after);
  }
  return stopped;
}

/** The text of the elements an element's aria-describedby names. */
function describedBy(element: Element): string {
  return (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean)
    .map((name) => document.getElementById(name)?.textContent ?? "").join(" | ");
}

beforeEach(() => {
  gate.session = "IN";
  // The page's own address (the way back after signing in is read from it).
  window.history.replaceState(null, "", "/v4");
  ask.room = null;
  ask.submit.mockReset();
  ask.submit.mockImplementation(async () => ({ kind: "STOPPED" }));
  server.readAnswerIndex.mockReset();
  server.readAnswerIndex.mockImplementation(async () => ({ items: [], open_runs: [], limit: 32, offset: 0, total: 0 }));
  server.readDigLinks.mockReset();
  server.readDigLinks.mockImplementation(async () => ({ parent: null, children: [] }));
  server.level = Promise.resolve({ reading_level: null });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("a signed-out visitor (ask-d1 D)", () => {
  it("sees the real page: the title, the promise line, the box, and a header told the visitor is signed out", async () => {
    gate.session = "OUT";
    await mount();
    expect(host!.querySelector("h1")?.textContent).toBe(CATALOG["v4.ask.title"]);
    expect(host!.querySelector(".v4AskPromise")?.textContent).toBe(
      "Several AIs from different companies argue it from all sides. You choose what they look into. You get a plain answer and see what holds up and what doesn't.");
    expect(field().value).toBe(QUESTION);
    // ask-d6 A: the header puts "Sign in" in its account button's place, with the way back to this page.
    expect(host!.querySelector(".v4Hdr")?.getAttribute("data-session")).toBe("OUT");
    // ask-f6 / journey-f19: the ask page has no classic link, in the header or its menu.
    expect(host!.querySelector(".v4Hdr")?.getAttribute("data-classic")).toBe("none");
    expect(host!.querySelector(".v4Hdr a")).toBeNull();
    // Nothing of the account is read for a stranger.
    expect(server.readAnswerIndex).not.toHaveBeenCalled();
  });

  it("journey-f18 / read-f25: step 1 shows the four steps, with Your question marked", async () => {
    await mount();
    const steps = host!.querySelector("nav.v4Steps-line")!;
    expect(steps.getAttribute("aria-label")).toBe(CATALOG["v4.rail.label"]);
    expect([...steps.querySelectorAll(".v4StepsName")].map((name) => name.textContent)).toEqual(
      ["Your question", "What we'll look into", "The map", "Your report"]);
    expect(steps.querySelector("[aria-current=step]")?.textContent).toBe("Your question");
    // Nothing ahead of step 1 is a link: the steps after it are not open yet.
    expect(steps.querySelector("a")).toBeNull();
    // It sits above the title, on step 1 only.
    expect(steps.compareDocumentPosition(host!.querySelector("h1")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gets the seed of the map, whose solid card mirrors the words as they are typed", async () => {
    gate.session = "OUT";
    await mount();
    expect(host!.querySelector(".v4SeedLabel")?.textContent).toBe("Your question");
    expect(host!.querySelector(".v4SeedWords")?.textContent).toBe(QUESTION);
    expect(host!.querySelectorAll(".v4SeedOpen")).toHaveLength(3);
    // The owner's answers of 5 Nov (question 22 A and its follow-up): each card is journey-f2's hatched "Open" ground, and
    // keeps the star, the "?" and the word "Open" (the map's own word for it).
    expect([...host!.querySelectorAll(".v4SeedOpen")].every((card) => card.textContent === `★?${CATALOG["v4.ground.open"]!}`)).toBe(true);
    expect(host!.querySelectorAll(".v4SeedOpen .v4GroundWord")).toHaveLength(3);
    const askCss = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8");
    const seedRule = /\.v4SeedOpen \{([^}]*)\}/u.exec(askCss)![1]!;
    expect(seedRule).not.toMatch(/dashed/u);
    expect(seedRule).toMatch(/var\(--v4-look-hatch\)/u);
    expect(host!.querySelector(".v4Seed figcaption")?.textContent).toBe("Your map starts here. You'll choose which of these the AIs look into.");
    expect(host!.querySelector(".v4SeedPicture")?.getAttribute("aria-hidden")).toBe("true");
    await type("Should my town close its centre to cars?");
    expect(host!.querySelector(".v4SeedWords")?.textContent).toBe("Should my town close its centre to cars?");
  });

  it("a signed-in person's header has no Sign in; while the session is still unknown neither shows", async () => {
    gate.session = "CHECKING";
    await mount();
    // The header holds the account button's place empty while the page still checks (tests/render/v4-header-account.test.tsx).
    expect(host!.querySelector(".v4Hdr")?.getAttribute("data-session")).toBe("CHECKING");
    expect(host!.querySelector(".v4Hdr a")).toBeNull();
    expect(host!.querySelector(".v4Seed")).toBeNull();
    expect(field()).not.toBeNull();
    // Nothing can start before the session is known: both step-1 buttons wait (no consent screen for a stranger).
    expect(nextButton().disabled).toBe(true);
    expect(justButton().disabled).toBe(true);
    // The promise line's place is held (ask-f16) until it is known whether this is a first visit.
    const promise = host!.querySelector<HTMLElement>(".v4AskPromise");
    expect(promise?.getAttribute("aria-hidden")).toBe("true");
    expect(promise?.style.visibility).toBe("hidden");
  });

  it("Next and 'Just answer it' go to sign in with the way back here, and say so under Next; nothing is asked or sent", async () => {
    gate.session = "OUT";
    window.history.replaceState(null, "", "/v4?level=plain&topic=trams");
    await mount();
    const wayBack = `/login?next=${encodeURIComponent("/v4?level=plain&topic=trams")}`;
    const links = [...host!.querySelectorAll<HTMLAnchorElement>(".v4AskActions a")];
    expect(links.map((link) => link.textContent)).toEqual([CATALOG["v4.ask.continue"], CATALOG["v4.ask.justAnswer"]]);
    expect(links.every((link) => link.getAttribute("href") === wayBack)).toBe(true);
    // No button that would run the ask (the consent screen, step 2) is on the page for a stranger.
    expect([...host!.querySelectorAll(".v4AskActions button")]).toHaveLength(0);
    const line = host!.querySelector(".v4AskSignInFirst");
    expect(line?.textContent).toBe("You'll sign in first, then come back to this page.");
    expect(links.every((link) => describedBy(link) === line?.textContent)).toBe(true);
    // ask-d6 A: the page tells the header the visitor is signed out; the header then draws its own Sign in, a plain link
    // with the same way back (lib/signInWayBack, tests/render/v4-header-account.test.tsx).
    expect(host!.querySelector(".v4Hdr")?.getAttribute("data-session")).toBe("OUT");
    // A plain question: the press goes on to sign in (nothing stops the link).
    expect(await pressLink(links[0]!)).toBe(false);
    expect(ask.submit).not.toHaveBeenCalled();
  });

  it("words of a person in crisis get the help screen before any sign-in step; the page stays (V, 2026-09-30)", async () => {
    gate.session = "OUT";
    await mount({ question: "I want to kill myself" });
    for (const link of [...host!.querySelectorAll<HTMLAnchorElement>(".v4AskActions a")]) {
      ask.submit.mockClear();
      // The page does not go to sign in; useV4Ask's own first check opens the help screen and sends nothing.
      expect(await pressLink(link)).toBe(true);
      expect(ask.submit).toHaveBeenCalledTimes(1);
      expect(ask.submit.mock.calls[0]![0]).toBe("I want to kill myself");
    }
  });

  it("the promise line is for first visits only: a returning person never sees it", async () => {
    server.readAnswerIndex.mockImplementation(async () => ({
      items: [{ run_ref: "11111111-1111-4111-8111-111111111111", question_line: QUESTION, created_at_sequence: 1 }],
      open_runs: [], limit: 32, offset: 0, total: 1
    }));
    await mount();
    expect(host!.querySelector(".v4AskPromise")).toBeNull();
  });
});

describe("why a step-1 button cannot be pressed (ask-f14, read-f18)", () => {
  it("one line under the box, read out with both buttons", async () => {
    await mount({ question: "" });
    const why = host!.querySelector(".v4AskWhy");
    expect(why?.textContent).toBe("Type your question first.");
    expect(describedBy(nextButton())).toBe("Type your question first.");
    expect(describedBy(justButton())).toBe("Type your question first.");
    expect(describedBy(field())).toBe("Type your question first.");
    await type("Tax");
    expect(host!.querySelector(".v4AskWhy")?.textContent).toBe(CATALOG["v4.ask.tooShort"]);
    await type("x".repeat(askQuestionMaxBytes() + 1));
    expect(host!.querySelector(".v4AskWhy")?.textContent).toBe("This is too long to send. Please shorten it a little.");
    expect(justButton().disabled).toBe(true);
    expect(describedBy(justButton())).toBe("This is too long to send. Please shorten it a little.");
    await type(QUESTION);
    expect(host!.querySelector(".v4AskWhy")).toBeNull();
    expect(nextButton().hasAttribute("aria-describedby")).toBe(false);
  });

  it("the red 'nothing was started' line goes as soon as the words change", async () => {
    ask.submit.mockImplementation(async () => ({ kind: "REFUSED", message: CATALOG["v4.ask.failed"] }));
    await mount();
    await act(async () => justButton().click());
    await settle();
    expect(host!.querySelector(".v4AskRefusal")?.textContent).toBe(CATALOG["v4.ask.failed"]);
    await type(`${QUESTION} And the buses?`);
    expect(host!.querySelector(".v4AskRefusal")).toBeNull();
  });
});

describe("the used-up quota (ask-f18, ask-d4 C)", () => {
  it("one line above the box names today's quota and the time; the box keeps the words", async () => {
    ask.room = { room: "FULL", scope: "PERSON_DAY", resets_at: "2026-11-05T08:00:00.000Z", waiting_run_ref: null, plan_id: "PLUS", new_starts: "BLOCKED_UNTIL_RESET" };
    await mount();
    const line = host!.querySelector(".v4AskUsedUp")!;
    expect(line.textContent).toMatch(/^You've used today's quota\. New questions start after \d{2}:\d{2}\.$/u);
    expect(line.compareDocumentPosition(field()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(field().value).toBe(QUESTION);
    expect(describedBy(nextButton())).toBe(line.textContent);
    // The reset line is no longer repeated under the buttons on step 1.
    expect(host!.textContent).not.toContain("New questions and digs can start after");
  });

  it("Free counts by the month and names the day", async () => {
    ask.room = { room: "FULL", scope: "PERSON_MONTH", resets_at: "2026-12-01T12:00:00.000Z", waiting_run_ref: null, plan_id: "FREE", new_starts: "BLOCKED_UNTIL_RESET" };
    await mount();
    // Owner's answer to question 5 (5 Nov 2026): day first on English pages.
    expect(host!.querySelector(".v4AskUsedUp")?.textContent).toBe("You've used this month's quota. New questions start on 1 December.");
  });
});

describe("the detail level (ask-f15, ask-f16)", () => {
  it("its place is held until the account answers, then it is one choice of three", async () => {
    let answer: (value: { reading_level: string | null }) => void = () => undefined;
    server.level = new Promise((resolveLevel) => { answer = resolveLevel; });
    await mount({ level: null });
    expect(host!.querySelector(".v4AskLevelsHold")).not.toBeNull();
    expect(host!.querySelector(".v4AskLevels")).toBeNull();
    await act(async () => { answer({ reading_level: null }); });
    await settle();
    expect(host!.querySelector(".v4AskLevelsHold")).toBeNull();
    const radios = [...host!.querySelectorAll<HTMLInputElement>(".v4AskLevels input[type=radio]")];
    expect(radios).toHaveLength(3);
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    expect(radios.map((radio) => radio.checked)).toEqual([true, false, false]);
    await act(async () => radios[2]!.click());
    expect(radios.map((radio) => radio.checked)).toEqual([false, false, true]);
    expect(host!.querySelector(".v4AskSample")?.textContent).toContain(CATALOG["v4.ask.levelShows.expert"]);
    expect(host!.querySelector(".v4AskLevelChip[data-checked=true]")?.textContent).toBe(CATALOG["v4.readingLevel.expert"]);
  });

  it("a level already chosen closes the held place at once", async () => {
    server.level = Promise.resolve({ reading_level: "background" });
    await mount({ level: null });
    expect(host!.querySelector(".v4AskLevelsHold")).toBeNull();
    expect(host!.querySelector(".v4AskLevels")).toBeNull();
  });

  it("the box follows the writing direction and grows with the words (no fixed handle)", async () => {
    await mount();
    expect(field().getAttribute("dir")).toBe("auto");
    expect(field().classList.contains("v4AskFieldGrow")).toBe(true);
  });
});

describe("Your maps (ask-d5 B, ask-f10, wait-f13, map-f34, dig-f30)", () => {
  const PARENT = "11111111-1111-4111-8111-111111111111";
  const DIG = "88888888-8888-4888-8888-888888888888";
  const RUNNING = "22222222-2222-4222-8222-222222222222";
  const FAILED = "44444444-4444-4444-8444-444444444444";

  it("cards with one state word, the bar and New when the server gives them, digs under their question, and All my maps", async () => {
    server.readAnswerIndex.mockImplementation(async () => ({
      items: [
        { run_ref: DIG, question_line: "Does this hold up, and when? Batteries can cover multi-day lulls.", created_at_sequence: 8 },
        { run_ref: PARENT, question_line: "Should countries build new nuclear power?", created_at_sequence: 1,
          map_bar: { sure: 4, sure_for_case: 5, still_argued: 2, didnt_hold: 1 }, changed_since_visit: true }
      ],
      open_runs: [
        { run_ref: RUNNING, question_line: "Is a four-day week good for workers?", state: "RUNNING", terminal_reason: null, created_at_sequence: 5,
          started_at: new Date(new Date().setHours(14, 0, 0, 0)).toISOString() },
        { run_ref: FAILED, question_line: "Will AI tutors replace homework help?", state: "FAILED", terminal_reason: "RUN_FAILED", created_at_sequence: 4 }
      ],
      limit: 32, offset: 0, total: 2
    }));
    server.readDigLinks.mockImplementation(async (runId: string) => ({
      parent: runId === DIG ? { parent_run_id: PARENT, child_run_id: DIG, places: [], mode: "quick", created_at: "2026-10-29T08:00:00.000Z" } : null,
      children: []
    }));
    await mount();
    const shelf = host!.querySelector(".v4Shelf")!;
    expect(shelf.querySelector("h2")?.textContent).toBe("Your maps");
    const cards = [...shelf.querySelectorAll(".v4ShelfCard")];
    expect(cards.map((card) => card.querySelector(".v4ShelfQuestion")?.textContent)).toEqual([
      "Is a four-day week good for workers?", "Will AI tutors replace homework help?", "Should countries build new nuclear power?"
    ]);
    expect(cards.map((card) => card.querySelector(".v4ShelfState")?.textContent)).toEqual([
      // journey-f22: one list of state words everywhere (the waiting card's lib/v4/stateWords.ts list); journey-f16: its
      // "Started 14:00" too (WHOLE-12).
      "Looking into it · Started 14:00", "Didn't finish", "Ready"
    ]);
    expect(cards[0]!.querySelector(".v4ShelfPulse")).not.toBeNull();
    expect(cards[2]!.querySelector(".v4Bar")).not.toBeNull();
    expect(cards[2]!.querySelector(".v4ShelfNew")?.textContent).toBe("New");
    expect(cards[0]!.querySelector(".v4Bar")).toBeNull();
    expect(cards[0]!.querySelector(".v4ShelfNew")).toBeNull();
    // The dig is not a card; it hangs under its question, in the person's words, and opens its own map.
    const dig = shelf.querySelector<HTMLAnchorElement>(".v4ShelfDig")!;
    expect(dig.closest(".v4ShelfItem")?.querySelector(".v4ShelfQuestion")?.textContent).toBe("Should countries build new nuclear power?");
    expect(dig.querySelector(".v4ShelfDigText")?.textContent).toBe("Dig: Batteries can cover multi-day lulls.");
    // The reading-level ruling (5 Nov): links carry no level; the map still uses the account's level until the run read
    // names the debate's own level (the server field), as it did when these links carried the account's level.
    expect(dig.getAttribute("href")).toBe(`/v4/debate/${DIG}`);
    expect(cards[2]!.getAttribute("href")).toBe(`/v4/debate/${PARENT}`);
    expect(shelf.querySelector<HTMLAnchorElement>(".v4ShelfAll")?.getAttribute("href")).toBe("/v4?maps=all");
    expect(shelf.querySelector<HTMLAnchorElement>(".v4ShelfAll")?.textContent).toBe("All my maps");
    // No counts anywhere, and no seed: this account has maps.
    expect(shelf.textContent).not.toMatch(/\d+ (maps|questions|digs)/u);
    expect(host!.querySelector(".v4Seed")).toBeNull();
  });

  it("an account with no debate yet gets the seed and no shelf; a failed read shows neither", async () => {
    await mount();
    expect(server.readAnswerIndex).toHaveBeenCalled();
    expect(host!.querySelector(".v4Seed")).not.toBeNull();
    expect(host!.querySelector(".v4Shelf")).toBeNull();
    await act(async () => root?.unmount());
    host?.remove();
    server.readAnswerIndex.mockImplementation(async () => { throw new Error("SERVER_FAILURE"); });
    await mount();
    expect(host!.querySelector(".v4Seed")).toBeNull();
    expect(host!.querySelector(".v4Shelf")).toBeNull();
  });
});
