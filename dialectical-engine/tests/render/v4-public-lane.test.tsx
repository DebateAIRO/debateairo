// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema, type PublicDebate } from "../../packages/contract/src/index.js";
import { ContractHttpError } from "../../packages/contract/src/client.js";

/*
 * Decisions 13, 16 and 22 on the public page: a path's newest text and who added to it, the main answer's update with the first still reachable, the author whose
 * name went, the Reports section, and the two presses, signed in and signed out. Owner screen review (3 Nov): the credit line is a sentence (r2-17); signed
 * out offers "Create a free account · Sign in", each back to the same place (r2-21, public-f13); the places are held while the session is read (public-f13);
 * the dig's rules are two lines with the rest under "How this works" (r2-16); a dig that runs privately is a calm note with "Open it" (public-f10); extra
 * views are numbered and can be removed (public-f12); a dig on a dig's path is tagged with whose dig it came from, at the same indent (public-f23).
 * Wave 2 (public-d1 A): the paths are rows that unfold, so each test opens the rows it reads; "Write a report" (public-f9) says it is starting, then a
 * card at the top of Reports says the report is being written and the person can leave, the checks slow down and pause in a hidden tab, and after ten
 * minutes the card says it is taking longer, with "Check again"; the ready line is read out once; a report that could not be written says so.
 * Wave 2: the map's dig flow (public-f11, dig-f25): nothing is sent before the site's 10-second Undo, Quick look with Thorough on paid plans, the share when
 * the room read says one; after it the person stays, with a card under the path that reads the dig's own run (public-d2 A); the path's own suggestions as
 * chips when the public read carries them; "This will be public." under the person's own words (journey-f20).
 */
const lane = vi.hoisted(() => ({
  session: true as boolean | "pending",
  push: vi.fn(),
  refresh: vi.fn(),
  submit: vi.fn(),
  writePublicReport: vi.fn(),
  readPublicDebate: vi.fn(),
  readRun: vi.fn(),
  readRunAnswer: vi.fn(),
  planTier: "free" as "free" | "premium",
  room: null as Record<string, unknown> | null,
  // dig-f9 (the wave-2 review): the click's own checks, lent by useV4Ask.
  ensureConsent: vi.fn(async () => true),
  crisis: vi.fn((_words: readonly string[]) => false),
  // The reading level the page hands the one ask hook: the level a dig is asked and priced at.
  askLevels: [] as string[],
  // The visitor's own account level (which a public page must not use).
  accountLevel: "plain"
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: lane.push, refresh: lane.refresh }) }));
vi.mock("@/lib/api", async (original) => ({
  ...await original<Record<string, unknown>>(),
  validateSession: async () => {
    if (lane.session === "pending") await new Promise(() => undefined);
    if (!lane.session) throw new Error("no session");
  },
  contractClient: {
    writePublicReport: (...args: unknown[]) => lane.writePublicReport(...args),
    readPublicDebate: (...args: unknown[]) => lane.readPublicDebate(...args),
    readRun: (...args: unknown[]) => lane.readRun(...args),
    readRunAnswer: (...args: unknown[]) => lane.readRunAnswer(...args),
    readReadingLevel: async () => ({ reading_level: lane.accountLevel }),
    saveReadingLevel: async () => ({ reading_level: "plain" })
  }
}));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: (input: { readingLevel: string }) => (lane.askLevels.push(input.readingLevel), { planTier: lane.planTier, room: lane.room, submit: (...args: unknown[]) => lane.submit(...args), submitting: false, dialogs: null, flagsCrisis: () => false,
    ensureConsent: () => lane.ensureConsent(), offerCrisisHelp: (words: readonly string[]) => lane.crisis(words) })
}));

import { PublicDebateOverview } from "../../apps/ui/components/PublicDebateOverview.js";
import { readDigUndo, resetDigUndo } from "../../apps/ui/lib/v4/digUndo.js";
import { resetPublicDigs } from "../../apps/ui/lib/v4/publicDig.js";
import { contributionOf, seedPublicDebates, PUBLIC_DIG_SUGGESTIONS, PUBLIC_REF, PUBLIC_REF_AUTHOR_GONE, PUBLIC_UPDATE_REF } from "../../tools/v4-mock-api/public-seed.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const V4 = messages("v4");
const PUBLIC = messages("public");
const debate = (at = 0): PublicDebate => PublicDebateSchema.parse(seedPublicDebates()[at]);

let root: Root | null = null;
let host: HTMLDivElement | null = null;
// The press runs its click checks (crisis help, consent) before the 10 seconds start: a few more turns than a plain click.
const flush = async (): Promise<void> => { await act(async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); }); };

async function mount(page: PublicDebate, withLane = true): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <PublicDebateOverview debate={page} catalog={PUBLIC} storyCatalog={PUBLIC} storyLocale="en" locale="en" onDetails={() => undefined} onRead={() => undefined}
      {...(withLane ? { lane: { catalog: V4, homeCatalog: {}, newDebateCatalog: {}, locale: "en", crisisCountryHint: null } } : {})} />
  ));
  await flush();
  return host;
}
const text = (): string => host!.textContent ?? "";
const buttons = (name: string): HTMLButtonElement[] => [...host!.querySelectorAll("button")].filter((candidate) => candidate.textContent?.trim() === name);
/** journey-f13 / dig-f5: the box's Start reads as the map's picks button ("Dig into this · up to 3%" for one pick, question 1 B). */
const startButtons = (): HTMLButtonElement[] => [...host!.querySelectorAll<HTMLButtonElement>("button[data-public-dig-start]")];
const click = async (target: HTMLElement): Promise<void> => { await act(async () => { target.click(); }); await flush(); };
function type(field: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
const write = async (field: HTMLTextAreaElement, value: string): Promise<void> => { await act(async () => { type(field, value); }); };
/** public-d1 A: a path is a row that unfolds; tests that read a path's parts open every row first. */
const rows = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>("[data-public-path]")];
async function openRows(): Promise<void> {
  for (const head of [...host!.querySelectorAll<HTMLButtonElement>(".v4PubRowHead")]) if (head.getAttribute("aria-expanded") === "false") await click(head);
}
/** The site's 10-second Undo runs out (fake timers): the dig is sent, and its answer is read. */
const undoRunsOut = async (): Promise<void> => { await act(async () => { vi.advanceTimersByTime(10_000); }); await flush(); };
const notes = (): Element | null => host!.querySelector(".v4PubNotes .v4UndoHost");

beforeEach(() => {
  resetDigUndo();
  resetPublicDigs();
  lane.ensureConsent = vi.fn(async () => true);
  lane.crisis = vi.fn((_words: readonly string[]) => false);
  lane.session = true;
  lane.planTier = "free";
  lane.room = null;
  lane.readRun = vi.fn(async () => ({ state: "RUNNING", hold_until: null }));
  lane.readRunAnswer = vi.fn(async () => { throw new Error("not settled"); });
  lane.push = vi.fn();
  lane.refresh = vi.fn();
  lane.submit = vi.fn(async () => ({ kind: "STARTED", runId: "99999999-9999-4999-8999-999999999999" }));
  lane.writePublicReport = vi.fn(async () => ({ state: "WRITING", report_version: 2 }));
  lane.readPublicDebate = vi.fn(async () => debate());
  lane.askLevels = [];
  lane.accountLevel = "plain";
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  resetDigUndo();
  resetPublicDigs();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("what the public page shows", () => {
  it("a path at its newest text, who added to it and when; the first text only behind the first answer", async () => {
    await mount(debate());
    await openRows();
    const paths = rows();
    expect(paths[0]!.querySelector(".v4PubRowHead")!.textContent).toContain("also in small towns");
    // r2-17, kept by the owner's answer to question 4 (5 Nov): the credit line's day has no year.
    expect(paths[0]!.textContent).toContain("Quiet Heron added to this on 28 October");
    expect(paths[0]!.textContent).not.toContain("added to this on 28 October 2026");
    expect(paths[0]!.textContent).toContain("A dig looked at small towns");
    expect(paths[1]!.textContent).not.toContain("added to this");
    const first = host!.querySelector<HTMLDetailsElement>(".publicFirstAnswer")!;
    expect(first.querySelector("summary")!.textContent).toBe(V4["v4.public.firstAnswer"]);
    expect(first.textContent).toContain("Free fares for everyone: partly held. They help people with little money");
    expect(first.textContent).toContain("Our answer: cheaper fares");
    expect(first.textContent).not.toContain("added to this");
    // The first text of a path is only behind the first answer, never in its row.
    expect(paths[0]!.textContent).not.toContain("They help people with little money");
  });

  it("an open row shows its trust bar once: the head's small bar steps aside, as its star does, for the large one in the body", async () => {
    await mount(debate());
    const row = rows().find((one) => one.querySelector(".v4PubRowHead .v4Bar") !== null)!;
    expect(row).toBeDefined();
    const head = (): HTMLButtonElement => row.querySelector<HTMLButtonElement>(".v4PubRowHead")!;
    // Folded: the head's small bar, and nothing in the body.
    expect(row.querySelectorAll(".v4Bar")).toHaveLength(1);
    expect(head().querySelector(".v4BarSmall")).not.toBeNull();
    // Open: only the body's large bar.
    await click(head());
    expect(head().getAttribute("aria-expanded")).toBe("true");
    expect(row.querySelectorAll(".v4Bar")).toHaveLength(1);
    expect(head().querySelector(".v4Bar")).toBeNull();
    expect(row.querySelector(".v4PubFound .v4BarLarge")).not.toBeNull();
    // Folded again, the head's bar is back.
    await click(head());
    expect(row.querySelectorAll(".v4Bar")).toHaveLength(1);
    expect(head().querySelector(".v4BarSmall")).not.toBeNull();
  });

  it("the main answer shows its update, and the date it changed", async () => {
    await mount(debate());
    const update = host!.querySelector(".publicMainUpdate")!.textContent!;
    expect(update).toContain("Better service first, and free fares for those who need them");
    expect(update).toContain("The answer was updated on 28 October 2026.");
    // Outside the first answer, the first headline is not what is read first: the update leads the answer card.
    const card = host!.querySelector(".v4PubAnswer")!;
    expect(card.querySelector(".v4AnswerHeadline")!.textContent).toContain("Better service first, and free fares");
    expect(card.querySelector(".v4AnswerHeadline")!.closest(".publicFirstAnswer")).toBeNull();
  });

  it("a page nobody changed reads as it did, with no update and no first-answer link", async () => {
    const { contributions: _c, main_answer_update: _m, reports: _r, ...plain } = debate();
    await mount(plain);
    expect(host!.querySelector(".publicMainUpdate")).toBeNull();
    expect(host!.querySelector(".publicFirstAnswer")).toBeNull();
    expect(text()).toContain("Our answer: cheaper fares");
    expect(text()).not.toContain("added to this");
  });

  it("a name that went reads \"a contributor\", on a path and on a report", async () => {
    const page = debate();
    await mount({ ...page, contributions: [{ ...page.contributions![0]!, contributor: null }], reports: [{ ...page.reports![0]!, writer: null }] });
    await openRows();
    expect(text()).toContain("A contributor added to this on 28 October");
    expect(text()).not.toContain("added to this on 28 October 2026");
    expect(text()).toContain("Report written by a contributor");
    expect(text()).not.toContain("Quiet Heron");
  });

  it("a dig's own paths show under its contribution, with their points", async () => {
    await mount(debate());
    await openRows();
    const under = host!.querySelector(".v4PubDigPaths")!;
    expect(under.textContent).toContain(V4["v4.public.digPaths"]);
    expect(under.textContent).toContain("Small towns behave like large cities here");
    expect(under.textContent).toContain("Only a few towns were studied.");
  });

  it("Reports: every version newest first, the writer only as a reference, the earlier one readable behind a click", async () => {
    const page = debate();
    const older = page.reports![0]!;
    await mount({ ...page, reports: [older, { ...older, report_version: 2, writer: "Second Writer", answer: { segments: ["The newer one."] }, story: { ...older.story!, short_answer: "The newer short answer." } }] });
    const section = host!.querySelector(".v4PubReports")!;
    expect(section.querySelector("h2")!.textContent).toBe("Reports");
    const reads = section.textContent!;
    expect(reads.indexOf("Report written by Second Writer")).toBeLessThan(reads.indexOf("Report written by Quiet Heron"));
    expect(reads).toContain("The newer short answer.");
    const earlier = section.querySelector<HTMLDetailsElement>(".v4PubEarlier")!;
    expect(earlier.querySelector("summary")!.textContent).toBe("Earlier version 1");
    expect(earlier.textContent).toContain("Service first, and free fares for those who need them.");
    expect(earlier.textContent).toContain("Report written by Quiet Heron");
  });

  it("a publication review (no lane) shows the text, and offers no press", async () => {
    await mount(debate(), false);
    await openRows();
    expect(text()).toContain("Quiet Heron added to this");
    expect(text()).toContain("Report written by Quiet Heron");
    expect(buttons(V4["v4.public.dig.open"]!)).toEqual([]);
    expect(buttons(V4["v4.public.report.write"]!)).toEqual([]);
    expect(host!.querySelector("[data-public-sign-in]")).toBeNull();
    // A publication review has nothing to report either.
    expect(host!.querySelector("[data-public-flag]")).toBeNull();
  });

  it("a dig on a dig's path sits at the same indent, tagged with whose dig it came from; long words can wrap", async () => {
    const page = debate();
    const deeper = "77777777-7777-4777-8777-777777777777";
    await mount(PublicDebateSchema.parse({ ...page, contributions: [...page.contributions!, contributionOf("p-towns", PUBLIC_UPDATE_REF, deeper, "2026-10-30", "Rural lines differ.")] }));
    await openRows();
    const boxes = [...host!.querySelectorAll(".v4PubDigPaths")];
    expect(boxes).toHaveLength(2);
    // The first level is indented once; the deeper one carries no indent of its own, only its tag.
    expect(boxes[0]!.classList.contains("v4PubDigPathsDeeper")).toBe(false);
    expect(boxes[1]!.classList.contains("v4PubDigPathsDeeper")).toBe(true);
    expect(boxes[0]!.contains(boxes[1]!)).toBe(true);
    expect(boxes[1]!.querySelector(".v4PubDigFrom")!.textContent).toBe("From Mock Tester's dig");
    expect(boxes[0]!.querySelector(":scope > .v4PubLabel")!.textContent).toBe(V4["v4.public.digPaths"]);
    const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/public/debate/[id]/public-lane.css"), "utf8");
    expect(css).toMatch(/\.v4PubDigPathsDeeper \{ padding-inline-start: 0; border-inline-start: 0; \}/u);
    expect(css).toMatch(/\.v4PubPathNote \{[^}]*overflow-wrap: anywhere;/u);
    // No side line in the lane is fixed to the left: in Arabic it sits on the right.
    expect(css).not.toMatch(/(?:border|padding|margin)-(?:left|right)\b/u);
  });
});

describe("not signed in", () => {
  it("each press offers \"Create a free account · Sign in\", both back to the same place, and nothing is offered to press", async () => {
    lane.session = false;
    await mount(debate());
    await openRows();
    const choices = [...host!.querySelectorAll("[data-public-sign-in]")];
    // Three paths, the dig's own path, and the report.
    expect(choices).toHaveLength(5);
    for (const choice of choices) {
      expect([...choice.querySelectorAll("a")].map((link) => link.textContent)).toEqual(["Create a free account", "Sign in"]);
      expect(choice.textContent).toContain("Create a free account · Sign in");
    }
    expect(choices[0]!.textContent).toMatch(/^To dig into this:/u);
    const hrefs = (at: number): string[] => [...choices[at]!.querySelectorAll("a")].map((link) => link.getAttribute("href")!);
    const back = (path: string): string[] => [`/sign-up?next=${encodeURIComponent(path)}`, `/login?next=${encodeURIComponent(path)}`];
    expect(hrefs(0)).toEqual(back(`/public/debate/${PUBLIC_REF}?dig=p-fares`));
    // The dig's own path names the dig it hangs under, so the way back opens that box and no other.
    expect(choices.map((_, at) => hrefs(at)[1]!)).toContain(`/login?next=${encodeURIComponent(`/public/debate/${PUBLIC_REF}?dig=p-towns&under=${PUBLIC_UPDATE_REF}`)}`);
    const report = choices.find((choice) => choice.textContent!.startsWith("To write a report:"))!;
    expect([...report.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual(back(`/public/debate/${PUBLIC_REF}#public-reports`));
    expect(host!.querySelector("#public-reports")).not.toBeNull();
    expect(buttons(V4["v4.public.dig.open"]!)).toEqual([]);
    expect(buttons(V4["v4.public.report.write"]!)).toEqual([]);
  });

  it("while the session is read, the places are held: nothing pops in, and nothing can be pressed", async () => {
    lane.session = "pending";
    await mount(debate());
    await openRows();
    const held = [...host!.querySelectorAll("[data-public-held]")];
    expect(held).toHaveLength(5);
    for (const place of held) expect(place.getAttribute("aria-hidden")).toBe("true");
    expect(host!.querySelector("[data-public-sign-in]")).toBeNull();
    expect(buttons(V4["v4.public.dig.open"]!)).toEqual([]);
  });
});

describe("Dig here (journey-f13; decision 22 called it \"Dig into this\")", () => {
  const firstOpen = (): HTMLButtonElement => buttons(V4["v4.public.dig.open"]!)[0]!;

  it("says what it costs and what the check does in two lines, the rest under \"How this works\"; nothing starts with an empty box", async () => {
    await mount(debate());
    await openRows();
    await click(firstOpen());
    const box = host!.querySelector(".v4PubDig")!;
    expect(box.querySelector(":scope > .v4PubHint")!.textContent).toBe("This uses your own quota. An AI checks it before it can change this public page.");
    const how = box.querySelector<HTMLDetailsElement>("details.v4PubHow")!;
    expect(how.open).toBe(false);
    expect(how.querySelector("summary")!.textContent).toBe("How this works");
    expect(how.textContent).toContain("it stays private to you and the page is unchanged. If a later part of the update doesn't pass, the page keeps its older text and that part still counts in your quota.");
    // ACCESS-17 (journey-f14): with nothing picked, Start stays focusable and a visible line, linked to it, says why.
    const start = startButtons()[0]!;
    expect(start.getAttribute("aria-disabled")).toBe("true");
    expect(start.textContent).toBe(V4["v4.dig.yourPicks.one"]);
    const why = document.getElementById(start.getAttribute("aria-describedby")!)!;
    expect(why.textContent).toBe(V4["v4.public.dig.writeFirst"]);
    await click(start);
    expect(lane.submit).not.toHaveBeenCalled();
    expect(lane.ensureConsent).not.toHaveBeenCalled();
    // Opening the box puts focus in it; Cancel gives it back to "Dig here".
    expect(document.activeElement).toBe(box.querySelector(".v4PubText"));
    await click(buttons(V4["v4.public.dig.cancel"]!)[0]!);
    expect(document.activeElement).toBe(firstOpen());
  });

  it("a path of the debate: nothing is sent before the 10-second Undo; then a quick dig named by the page, and the person stays", async () => {
    vi.useFakeTimers();
    await mount(debate());
    await openRows();
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Rural towns differ.");
    await click(startButtons()[0]!);
    // journey-f21 / dig-f25: the site's one Undo note, with focus on Undo; the box says it is starting, with the same Undo.
    expect(lane.submit).not.toHaveBeenCalled();
    expect(notes()!.textContent).toContain("Digging into “Rural towns differ.”");
    expect(notes()!.textContent).not.toContain(V4["v4.digMode.quick"]);
    expect(document.activeElement!.textContent).toBe(V4["v4.dig.undo"]);
    expect(host!.querySelector(".v4PubDig")!.textContent).toContain(V4["v4.panel.digStarting"]);
    await act(async () => { vi.advanceTimersByTime(9_000); });
    expect(lane.submit).not.toHaveBeenCalled();
    await undoRunsOut();
    expect(lane.submit).toHaveBeenCalledTimes(1);
    const [line, mode, origin, parent] = lane.submit.mock.calls[0]!;
    expect(mode).toBe("quick");
    expect(origin).toBe("dig");
    expect(parent).toEqual({ public_ref: PUBLIC_REF, places: ["path:p-fares"], mode: "quick", picks: [{ kind: "OWN_VIEW", suggestion_id: null, place: "path:p-fares", text: "Rural towns differ." }] });
    expect(line).toContain("Rural towns differ.");
    expect(line).toContain("Should cities make public transport free?");
    // The path's newest line is what is dug, as on the map.
    expect(line).toContain("also in small towns");
    expect(parent).not.toHaveProperty("parent_run_id");
    // public-d2 A: the person stays on the page; a card under the path says the dig is running, with "Open it" to its own page.
    expect(lane.push).not.toHaveBeenCalled();
    expect(startButtons()).toEqual([]);
    const card = host!.querySelector("[data-public-dig-card]")!;
    expect(card.textContent).toContain(`${V4["v4.seed.yourDig"]} Rural towns differ.`);
    expect(card.textContent).toContain(V4["v4.public.digCard.running"]);
    expect(card.classList.contains("v4GroundLOOKING")).toBe(true);
    expect([...card.querySelectorAll(".v4PubDigStop")].map((stop) => stop.getAttribute("data-reached"))).toEqual(["false", "false"]);
    expect(card.querySelector("a")!.getAttribute("href")).toBe("/v4/debate/99999999-9999-4999-8999-999999999999?level=plain");
    expect(lane.readRun).toHaveBeenCalledWith("99999999-9999-4999-8999-999999999999");
    // The note says it started; its [See it] opens the dig's own page (a public page has no map of the person's).
    expect(notes()!.textContent).toContain("You can leave this page.");
    expect(notes()!.querySelector("a")!.getAttribute("href")).toBe("/v4/debate/99999999-9999-4999-8999-999999999999");
    // Focus that was in the box goes to "Dig here"; the box can be opened again, empty.
    expect(document.activeElement).toBe(firstOpen());
    await click(firstOpen());
    expect(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!.value).toBe("");
  });

  it("Undo: nothing is sent, the box keeps the words, and the note says \"Cancelled. Nothing was used.\"", async () => {
    vi.useFakeTimers();
    await mount(debate());
    await openRows();
    await click(firstOpen());
    const field = host!.querySelector<HTMLTextAreaElement>(".v4PubText")!;
    await write(field, "Mine.");
    await click(startButtons()[0]!);
    // While it waits the words cannot change under it.
    expect(field.readOnly).toBe(true);
    await click(buttons(V4["v4.dig.undo"]!)[0]!);
    expect(notes()!.textContent).toContain(V4["v4.undo.cancelled"]);
    await undoRunsOut();
    expect(lane.submit).not.toHaveBeenCalled();
    expect(field.value).toBe("Mine.");
    expect(field.readOnly).toBe(false);
    expect(startButtons()[0]!.getAttribute("aria-disabled")).toBeNull();
    expect(host!.querySelector("[data-public-dig-card]")).toBeNull();
  });

  // dig-f9 (the wave-2 review, 4 Nov): the map's own click checks, at the press, before the 10 seconds.
  it("dig-f9: words that read as a crisis get the help screen at the press; nothing waits, nothing is sent", async () => {
    vi.useFakeTimers();
    lane.crisis = vi.fn((words: readonly string[]) => words.includes("Mine."));
    await mount(debate());
    await openRows();
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(startButtons()[0]!);
    expect(lane.crisis).toHaveBeenCalledWith(["Mine."]);
    expect(lane.ensureConsent).not.toHaveBeenCalled();
    expect(notes()).toBeNull();
    await undoRunsOut();
    expect(lane.submit).not.toHaveBeenCalled();
  });

  it("dig-f9: the one-time consent opens at the press; the 10 seconds count from the yes, and No starts nothing", async () => {
    vi.useFakeTimers();
    let answer: (agreed: boolean) => void = () => undefined;
    lane.ensureConsent = vi.fn(() => new Promise<boolean>((resolve) => { answer = resolve; }));
    await mount(debate());
    await openRows();
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(startButtons()[0]!);
    expect(lane.ensureConsent).toHaveBeenCalledTimes(1);
    // While the consent is open nothing waits, and a second press asks nothing more.
    expect(notes()).toBeNull();
    await click(startButtons()[0]!);
    expect(lane.ensureConsent).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(30_000); });
    await act(async () => { answer(true); });
    await flush();
    expect(notes()!.textContent).toContain("Digging into “Mine.”");
    await act(async () => { vi.advanceTimersByTime(9_000); });
    expect(lane.submit).not.toHaveBeenCalled();
    await undoRunsOut();
    expect(lane.submit).toHaveBeenCalledTimes(1);
    // The question check's screen, if it answers the send, names the path the dig is about.
    const about = lane.submit.mock.calls[0]![5] as ReactElement;
    const shown = document.createElement("div");
    shown.innerHTML = renderToStaticMarkup(about);
    expect(shown.textContent).toMatch(/^About your dig on “.*also in small towns.*”:$/u);
    // No: nothing waits and nothing is sent.
    await act(async () => root?.unmount());
    host?.remove();
    resetDigUndo();
    lane.submit.mockClear();
    lane.ensureConsent = vi.fn(async () => false);
    await mount(debate());
    await openRows();
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(startButtons()[0]!);
    expect(notes()).toBeNull();
    await undoRunsOut();
    expect(lane.submit).not.toHaveBeenCalled();
  });

  it("a send still waiting while the page is open keeps its place: it is never called failed, and it is not sent twice", async () => {
    vi.useFakeTimers();
    let started: (outcome: unknown) => void = () => undefined;
    lane.submit = vi.fn(() => new Promise((resolve) => { started = resolve; }));
    await mount(debate());
    await openRows();
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(startButtons()[0]!);
    await undoRunsOut();
    expect(lane.submit).toHaveBeenCalledTimes(1);
    // Two minutes without an answer: the note says it is still starting, never the "try again" line.
    await act(async () => { vi.advanceTimersByTime(120_000); });
    await flush();
    expect(text()).not.toContain(V4["v4.dig.failed"]);
    expect(host!.querySelector(".v4PubDig [role=alert]")).toBeNull();
    await act(async () => { started({ kind: "STARTED", runId: "99999999-9999-4999-8999-999999999999" }); });
    await flush();
    expect(host!.querySelector("[data-public-dig-card]")).not.toBeNull();
    expect(lane.submit).toHaveBeenCalledTimes(1);
  });

  it("a send that meets a screen after its page was closed says so in its note, never vanishing without a word", async () => {
    vi.useFakeTimers();
    lane.submit = vi.fn(async () => ({ kind: "STOPPED" }));
    await mount(debate());
    await openRows();
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(startButtons()[0]!);
    // The page goes before the 10 seconds end; the site's list keeps the dig and sends it.
    await act(async () => root?.unmount());
    host?.remove();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    await act(async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); });
    const entry = readDigUndo()[0]!;
    expect(entry.phase).toBe("REFUSED");
    expect(entry.result).toEqual({ kind: "REFUSED", message: V4["v4.public.dig.notStartedAway"] });
  });

  it("a dig's own path names the contribution it hangs under", async () => {
    vi.useFakeTimers();
    await mount(debate());
    await openRows();
    const under = host!.querySelector(".v4PubDigPaths")!;
    await click(under.querySelector<HTMLButtonElement>("button")!);
    await write(under.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(under.querySelector<HTMLButtonElement>("button[data-public-dig-start]")!);
    await undoRunsOut();
    expect(lane.submit.mock.calls[0]![3]).toMatchObject({ dig_ref: PUBLIC_UPDATE_REF, places: ["path:p-towns"], picks: [{ place: "path:p-towns" }] });
  });

  it("Free combines up to its cap of views, then says so without a number; a paid plan goes on", async () => {
    await mount(debate());
    await openRows();
    await click(firstOpen());
    await click([...host!.querySelectorAll("button")].find((one) => one.textContent === V4["v4.public.dig.addView"])!);
    await click([...host!.querySelectorAll("button")].find((one) => one.textContent === V4["v4.public.dig.addView"])!);
    expect(host!.querySelectorAll(".v4PubText")).toHaveLength(3);
    expect([...host!.querySelectorAll("button")].some((one) => one.textContent === V4["v4.public.dig.addView"])).toBe(false);
    expect(text()).toContain(V4["v4.public.dig.viewsFull"]);
    expect(V4["v4.public.dig.viewsFull"]).not.toMatch(/\d/u);
    await act(async () => root?.unmount());
    host?.remove();
    lane.planTier = "premium";
    await mount(debate());
    await openRows();
    await click(firstOpen());
    for (let at = 0; at < 3; at += 1) await click([...host!.querySelectorAll("button")].find((one) => one.textContent === V4["v4.public.dig.addView"])!);
    expect(host!.querySelectorAll(".v4PubText")).toHaveLength(4);
  });

  it("a refusal reads as the hook said it, in the box, after the 10 seconds; the box stays, with the person's words", async () => {
    vi.useFakeTimers();
    lane.submit = vi.fn(async () => ({ kind: "REFUSED", message: "Plain words." }));
    await mount(debate());
    await openRows();
    await click(firstOpen());
    const field = host!.querySelector<HTMLTextAreaElement>(".v4PubText")!;
    await write(field, "Mine.");
    await click(startButtons()[0]!);
    await undoRunsOut();
    expect(host!.querySelector("[role=alert]")!.textContent).toBe("Plain words.");
    expect(field.value).toBe("Mine.");
    expect(lane.push).not.toHaveBeenCalled();
    // Said once, in the box: the site's note steps back.
    expect(notes()).toBeNull();
  });

  it("a dig that could not join is a calm note, not a refusal: it runs as the person's own private debate, with \"Open it\"", async () => {
    vi.useFakeTimers();
    lane.submit = vi.fn(async () => ({ kind: "STARTED", runId: "99999999-9999-4999-8999-999999999999", notJoined: true }));
    await mount(debate());
    await openRows();
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(startButtons()[0]!);
    await undoRunsOut();
    expect(host!.querySelector(".v4PubDig [role=alert]")).toBeNull();
    const note = host!.querySelector("[data-public-dig-private]")!;
    expect(note.getAttribute("role")).toBe("status");
    expect(note.className).toBe("v4PubNote");
    expect(note.textContent).toBe(`${V4["v4.public.dig.notJoined"]} Open it`);
    expect(note.querySelector("a")!.getAttribute("href")).toBe("/v4/debate/99999999-9999-4999-8999-999999999999?level=plain");
    // It started: the box is gone, so it cannot be started twice; its own run is not read for a page it never joined.
    expect(startButtons()).toEqual([]);
    expect(lane.push).not.toHaveBeenCalled();
    expect(lane.readRun).not.toHaveBeenCalled();
  });

  it("extra views are \"Your view 2\" and \"Your view 3\", each with Remove; removing one keeps the others' words", async () => {
    await mount(debate());
    await openRows();
    await click(firstOpen());
    const addView = (): HTMLButtonElement => [...host!.querySelectorAll("button")].find((one) => one.textContent === V4["v4.public.dig.addView"])!;
    await click(addView());
    await click(addView());
    const labels = (): string[] => [...host!.querySelectorAll(".v4PubDig label")].map((label) => label.textContent!);
    expect(labels()).toEqual(["Your own view", "Your view 2", "Your view 3"]);
    const fields = (): HTMLTextAreaElement[] => [...host!.querySelectorAll<HTMLTextAreaElement>(".v4PubText")];
    // A new box takes focus.
    expect(document.activeElement).toBe(fields()[2]);
    await write(fields()[0]!, "First.");
    await write(fields()[1]!, "Second.");
    await write(fields()[2]!, "Third.");
    const removes = buttons(V4["v4.public.dig.removeView"]!);
    expect(removes).toHaveLength(2);
    // Each Remove names its box for a screen reader.
    expect(document.getElementById(removes[0]!.getAttribute("aria-describedby")!)!.textContent).toBe("Your view 2");
    await click(removes[0]!);
    expect(labels()).toEqual(["Your own view", "Your view 2"]);
    expect(fields().map((field) => field.value)).toEqual(["First.", "Third."]);
    expect(document.activeElement).toBe(fields()[0]);
  });

  it("back from signing in, the page opens the same path's dig box from its address alone, and puts focus in it", async () => {
    window.history.replaceState(null, "", `/public/debate/${PUBLIC_REF}?dig=p-service`);
    await mount(debate());
    const boxes = [...host!.querySelectorAll(".v4PubDig")];
    expect(boxes).toHaveLength(1);
    // The address opens that path's row (and no other), so its box can open.
    const path = boxes[0]!.closest<HTMLElement>("[data-public-path]")!;
    expect(path.dataset.publicPath).toBe("p-service");
    expect(path.querySelector(".v4PubRowTitle")!.textContent).toContain("Better service first");
    expect(rows().filter((row) => row.querySelector(".v4PubRowHead")!.getAttribute("aria-expanded") === "true")).toEqual([path]);
    expect(document.activeElement).toBe(boxes[0]!.querySelector(".v4PubText"));
    // The dig's own path is opened only when the address names the dig it hangs under.
    await act(async () => root?.unmount());
    host?.remove();
    window.history.replaceState(null, "", `/public/debate/${PUBLIC_REF}?dig=p-towns&under=${PUBLIC_UPDATE_REF}`);
    await mount(debate());
    // The row that holds the dig's own path opens from the address too.
    expect(host!.querySelector('[data-public-path="p-fares"] .v4PubRowHead')!.getAttribute("aria-expanded")).toBe("true");
    const under = host!.querySelector(".v4PubDigPaths")!;
    expect(under.querySelector(".v4PubDig")).not.toBeNull();
    expect(host!.querySelectorAll(".v4PubDig")).toHaveLength(1);
  });
});

describe("the map's dig flow on a public page (owner screen review, 3 Nov)", () => {
  const firstOpen = (): HTMLButtonElement => buttons(V4["v4.public.dig.open"]!)[0]!;
  const withChips = (): PublicDebate => ({ ...debate(), dig_suggestions: PUBLIC_DIG_SUGGESTIONS } as unknown as PublicDebate);

  it("public-f11: Free has no Thorough and no mode word; a paid plan starts on Quick look and sends Thorough when chosen", async () => {
    vi.useFakeTimers();
    await mount(debate());
    await openRows();
    await click(firstOpen());
    expect(buttons(V4["v4.digMode.thorough"]!)).toEqual([]);
    await act(async () => root?.unmount());
    host?.remove();
    lane.planTier = "premium";
    await mount(debate());
    await openRows();
    await click(firstOpen());
    const quick = buttons(V4["v4.digMode.quick"]!)[0]!;
    expect(quick.getAttribute("aria-pressed")).toBe("true");
    expect(text()).toContain(V4["v4.panel.modeHint.quick"]);
    await click(buttons(V4["v4.digMode.thorough"]!)[0]!);
    expect(text()).toContain(V4["v4.panel.modeHint.thorough"]);
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(startButtons()[0]!);
    expect(notes()!.textContent).toContain(V4["v4.digMode.thorough"]);
    await undoRunsOut();
    expect(lane.submit.mock.calls[0]![1]).toBe("thorough");
    expect(lane.submit.mock.calls[0]![3]).toMatchObject({ mode: "thorough" });
  });

  it("public-f11: no share is shown while the room read has none for this dig, never a new question's; with one, the box says it, Free by the month", async () => {
    lane.planTier = "premium";
    lane.room = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", start_share_percent: 10 };
    await mount(debate());
    await openRows();
    await click(firstOpen());
    expect(host!.querySelector("[data-public-dig-share]")).toBeNull();
    expect(text()).not.toContain("10%");
    await act(async () => root?.unmount());
    host?.remove();
    lane.room = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", dig_share_percent: 5 };
    await mount(debate());
    await openRows();
    await click(firstOpen());
    // journey-f8 / public-d3 A: the share on the button, the period once by the switch (read-f19: the server's window).
    // The owner's answer to question 34 (5 Nov, A, and its follow-up): every reader of a public page sees the period alone;
    // only the person's own map adds "· you can still finish your report".
    expect(host!.querySelector("[data-public-dig-share]")!.textContent).toBe("of today");
    expect(host!.querySelector("[data-public-dig-share]")!.textContent).toBe(V4["v4.public.dig.period.PERSON_DAY"]);
    expect(text()).not.toContain(V4["v4.dig.period.PERSON_DAY"]);
    expect(startButtons()[0]!.textContent).toBe("Dig into this · up to 5%");
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(startButtons()[0]!);
    expect(notes()!.textContent).toContain("up to 5% of today");
    await click(buttons(V4["v4.dig.undo"]!)[0]!);
    await act(async () => root?.unmount());
    host?.remove();
    lane.planTier = "free";
    lane.room = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "FREE", dig_share_percent: 5 };
    await mount(debate());
    await openRows();
    await click(firstOpen());
    expect(host!.querySelector("[data-public-dig-share]")!.textContent).toBe("of this month");
    expect(text()).not.toContain("you can still finish your report");
    // public-f14: the site's one note names the share's own window, so on Free it says the month too, never "of today".
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(startButtons()[0]!);
    expect(notes()!.textContent).toContain("up to 5% of this month");
    expect(notes()!.textContent).not.toContain("of today");
  });

  it("journey-f20: before the person's own words go on the public page, one grey line says so", async () => {
    await mount(debate());
    await openRows();
    await click(firstOpen());
    const line = host!.querySelector("[data-public-will-be]")!;
    expect(line.textContent).toBe("This will be public.");
    expect(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!.getAttribute("aria-describedby")).toBe(line.id);
  });

  it("public-d2 A: the path's own suggestions as chips, \"Or write your own\" folded; a tapped chip goes first into the dig", async () => {
    vi.useFakeTimers();
    await mount(withChips());
    await openRows();
    await click(firstOpen());
    const box = host!.querySelector(".v4PubDig")!;
    const chips = [...box.querySelectorAll<HTMLButtonElement>(".v4PubChip")];
    expect(chips.map((chip) => chip.querySelector("span")!.textContent)).toEqual([
      "Do free fares work the same way in small towns?", "Did any city see many drivers switch for good after fares went free?"
    ]);
    for (const chip of chips) expect(chip.querySelector("[data-ai-generated=true]")).not.toBeNull();
    // Focus goes to the first chip; the person's own box is folded until tapped.
    expect(document.activeElement).toBe(chips[0]);
    expect(box.querySelector(".v4PubText")).toBeNull();
    expect(startButtons()[0]!.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(startButtons()[0]!.getAttribute("aria-describedby")!)!.textContent).toBe(V4["v4.public.dig.pickFirst"]);
    await click(chips[1]!);
    expect(chips[1]!.getAttribute("aria-pressed")).toBe("true");
    await click(buttons(V4["v4.public.dig.writeOwn"]!)[0]!);
    const field = box.querySelector<HTMLTextAreaElement>(".v4PubText")!;
    expect(document.activeElement).toBe(field);
    await write(field, "Mine.");
    await click(startButtons()[0]!);
    await undoRunsOut();
    expect(lane.submit.mock.calls[0]![3]).toEqual({ public_ref: PUBLIC_REF, places: ["path:p-fares"], mode: "quick", picks: [
      { kind: "CONTRADICTING", suggestion_id: "pub-fares-drivers", place: "path:p-fares", text: "Did any city see many drivers switch for good after fares went free?" },
      { kind: "OWN_VIEW", suggestion_id: null, place: "path:p-fares", text: "Mine." }
    ] });
    // The card's title is the first pick, the AIs' words marked as theirs.
    const title = host!.querySelector("[data-public-dig-card] .v4PubDigCardTitle")!;
    expect(title.textContent).toContain("Did any city see many drivers switch");
    expect(title.querySelector("[data-ai-generated=true]")).not.toBeNull();
  });

  it("public-d2 A: a chip someone has dug near says so, with its day, and opens that dig's result on the page instead", async () => {
    await mount(withChips());
    await openRows();
    await click(firstOpen());
    const dug = host!.querySelector<HTMLButtonElement>("[data-public-chip-dug]")!;
    expect(dug.textContent).toContain("Someone dug near here on 28 Oct");
    expect(dug.hasAttribute("aria-pressed")).toBe(false);
    await click(dug);
    const result = document.getElementById(`public-dig-${PUBLIC_UPDATE_REF}`)!;
    expect(result.classList.contains("v4Highlight")).toBe(true);
    expect(document.activeElement).toBe(result);
    expect(lane.submit).not.toHaveBeenCalled();
  });

  it("public-d2 A: the card reads the dig again when the person comes back, then shows both stops and the page's change, new words underlined", async () => {
    vi.useFakeTimers();
    await mount(debate());
    await openRows();
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(startButtons()[0]!);
    await undoRunsOut();
    expect(host!.querySelector("[data-public-dig-card]")!.getAttribute("data-public-dig-card")).toBe("RUNNING");
    // Nothing moves while the person stays: the card is read again only when they come back to the page.
    lane.readRun = vi.fn(async () => ({ state: "SETTLED", hold_until: null }));
    const before = debate().contributions![0]!.line;
    const after = `${before} Rural lines too.`;
    lane.readRunAnswer = vi.fn(async () => ({ contribution: { public_ref: PUBLIC_REF, state: "ON_THE_PAGE", rewrite: { line: after, summary: "s", fate: "PARTLY_HELD", what_changed: ["x"] } } }));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await flush();
    expect(lane.readRun).not.toHaveBeenCalled();
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await flush();
    const card = host!.querySelector("[data-public-dig-card]")!;
    expect(card.getAttribute("data-public-dig-card")).toBe("ON_THE_PAGE");
    expect(card.classList.contains("v4GroundLOOKING")).toBe(false);
    expect([...card.querySelectorAll(".v4PubDigStop")].map((stop) => stop.getAttribute("data-reached"))).toEqual(["true", "true"]);
    expect(card.textContent).toContain(V4["v4.public.digCard.onPage"]);
    expect([...card.querySelectorAll("ins")].map((mark) => mark.textContent)).toEqual(["Rural lines too."]);
    await click([...card.querySelectorAll("button")].find((one) => one.textContent === V4["v4.public.digCard.seeOnPage"])!);
    expect(lane.refresh).toHaveBeenCalled();
    expect(document.getElementById("public-path-root-p-fares")!.classList.contains("v4Highlight")).toBe(true);
  });

  it.each([
    [{ state: "ON_THE_PAGE", rewrite: { line: "SAME", summary: "s", fate: "PARTLY_HELD", what_changed: [] } }, "CONFIRMED", "Confirmed: the answer holds."],
    [{ state: "KEPT_PRIVATE" }, "KEPT_PRIVATE", "Kept with you: the public page is unchanged."],
    [{ state: "CHECKING" }, "CHECKING", "An AI is checking this before it can change the public page."]
  ])("public-d2 A: %o reads as %s", async (contribution, kind, words) => {
    vi.useFakeTimers();
    const line = debate().contributions![0]!.line;
    lane.readRun = vi.fn(async () => ({ state: "SETTLED", hold_until: null }));
    lane.readRunAnswer = vi.fn(async () => ({ contribution: { public_ref: PUBLIC_REF, ...contribution, ...("rewrite" in contribution ? { rewrite: { ...contribution.rewrite, line } } : {}) } }));
    await mount(debate());
    await openRows();
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(startButtons()[0]!);
    await undoRunsOut();
    const card = host!.querySelector("[data-public-dig-card]")!;
    expect(card.getAttribute("data-public-dig-card")).toBe(kind);
    expect(card.textContent).toContain(words);
    expect(card.querySelector("[role=alert]")).toBeNull();
  });
});

describe("Write a report", () => {
  const press = (): HTMLButtonElement => buttons(V4["v4.public.report.write"]!)[0]!;

  const overview = (page: PublicDebate) => (
    <PublicDebateOverview debate={page} catalog={PUBLIC} storyCatalog={PUBLIC} storyLocale="en" locale="en" onDetails={() => undefined} onRead={() => undefined}
      lane={{ catalog: V4, homeCatalog: {}, newDebateCatalog: {}, locale: "en", crisisCountryHint: null }} />
  );
  const card = (): Element | null => host!.querySelector("[data-public-report-writing]");
  const readyLine = (): HTMLElement => host!.querySelector<HTMLElement>("[data-public-report-ready]")!;
  const withVersion = (page: PublicDebate, version: number): PublicDebate => ({ ...page, reports: [...page.reports!, { ...page.reports![0]!, report_version: version }] });
  /** Time goes by in five-second slices, each its own act, so the page draws between checks as a browser would. */
  const advance = async (ms: number): Promise<void> => {
    for (let left = ms; left > 0; left -= 5_000) {
      await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(5_000, left)); });
      await flush();
    }
  };

  it("says it uses the quota and the name is only a reference; the button says it is starting while the press is sent", async () => {
    let answer: (value: unknown) => void = () => undefined;
    lane.writePublicReport = vi.fn(() => new Promise((resolve) => { answer = resolve; }));
    await mount(debate());
    expect(text()).toContain("This uses your quota. Your name shows only as a reference.");
    await click(press());
    const starting = buttons(V4["v4.ask.starting"]!)[0]!;
    // ACCESS-3: it stays focusable while it says it is starting; a second press sends nothing more.
    expect(starting.getAttribute("aria-disabled")).toBe("true");
    expect(starting.getAttribute("aria-busy")).toBe("true");
    await click(starting);
    expect(lane.writePublicReport).toHaveBeenCalledTimes(1);
    expect(card()).toBeNull();
    await act(async () => { answer({ state: "WRITING", report_version: 2 }); });
    await flush();
    expect(buttons(V4["v4.ask.starting"]!)).toEqual([]);
    expect(card()).not.toBeNull();
  });

  it("202: a card at the top of Reports says it is being written and the person can leave; when it arrives the page reads itself again and says so once", async () => {
    vi.useFakeTimers();
    const page = debate();
    await mount(page);
    await click(press());
    expect(lane.writePublicReport).toHaveBeenCalledWith(PUBLIC_REF);
    const section = host!.querySelector(".v4PubReports")!;
    // The card is the first thing under the heading, before the reports already written.
    expect(section.children[1]).toBe(card());
    // ACCESS-3: the button went, so focus moves to the card (report-f16's rule, as on the map), never to the page's body.
    expect(document.activeElement).toBe(card());
    expect(card()!.textContent).toContain(V4["v4.state.BEING_WRITTEN"]);
    expect(card()!.textContent).toMatch(/Started \d/u);
    expect(card()!.textContent).toContain(V4["v4.wait.leave"]);
    // No time is promised that nobody measured.
    expect(card()!.textContent).not.toMatch(/minute/u);
    expect(buttons(V4["v4.public.report.write"]!)).toEqual([]);
    // The status region for the ready line is there from the start, empty, so the line is read out once when it comes.
    expect(readyLine().getAttribute("role")).toBe("status");
    expect(readyLine().textContent).toBe("");
    // One check at once, then every 15 seconds at first; nothing is refreshed while the version is not there.
    expect(lane.readPublicDebate).toHaveBeenCalledTimes(1);
    expect(lane.readPublicDebate).toHaveBeenCalledWith(PUBLIC_REF);
    await advance(15_000);
    expect(lane.readPublicDebate).toHaveBeenCalledTimes(2);
    expect(lane.refresh).not.toHaveBeenCalled();
    // The version arrives: the page reads itself again, the card goes and the ready line shows once, with the shared highlight.
    lane.readPublicDebate = vi.fn(async () => withVersion(page, 2));
    await advance(15_000);
    expect(lane.refresh).toHaveBeenCalledTimes(1);
    expect(card()).toBeNull();
    expect(readyLine().textContent).toBe(V4["v4.ready.report"]);
    expect(readyLine().classList.contains("v4Highlight")).toBe(true);
    // The wave-2 checks: the card held focus and went, so focus goes on to the Reports heading (never the page's body, and
    // never the ready line itself, a status region that would be read twice), without scrolling the page.
    expect(document.activeElement).toBe(host!.querySelector("#public-reports-title"));
    expect(readyLine().hasAttribute("tabindex")).toBe(false);
    await act(async () => root!.render(overview(withVersion(page, 2))));
    expect(press()).toBeTruthy();
    // No more checks once it is there.
    await advance(120_000);
    expect(lane.readPublicDebate).toHaveBeenCalledTimes(1);
    expect(lane.refresh).toHaveBeenCalledTimes(1);
  });

  it("the wave-2 checks (P1 / W2L-2): focus goes on without scrolling, and a click on plain text since the press means focus stays where the person put it", async () => {
    vi.useFakeTimers();
    const page = debate();
    await mount(page);
    await click(press());
    expect(document.activeElement).toBe(card());
    // The person clicks on the debate's text higher up: the card loses focus to the page itself (nothing next).
    await act(async () => { card()!.blur(); });
    expect(document.activeElement).toBe(document.body);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    lane.readPublicDebate = vi.fn(async () => withVersion(page, 2));
    await advance(15_000);
    expect(card()).toBeNull();
    expect(readyLine().textContent).toBe(V4["v4.ready.report"]);
    // The card no longer held focus, so nothing is moved (journey-f17: focus kept where it was).
    expect(document.activeElement).toBe(document.body);
    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
  });

  it("the wave-2 checks (P1): when the card held focus, the hand-off to the Reports heading does not scroll the page", async () => {
    vi.useFakeTimers();
    const page = debate();
    await mount(page);
    await click(press());
    expect(document.activeElement).toBe(card());
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    lane.readPublicDebate = vi.fn(async () => withVersion(page, 2));
    await advance(15_000);
    expect(document.activeElement).toBe(host!.querySelector("#public-reports-title"));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it("the checks slow down over time and pause while the tab is hidden; after ten minutes the card says it is taking longer and keeps checking, with Check again", async () => {
    vi.useFakeTimers();
    await mount(debate());
    await click(press());
    const reads = (): number => lane.readPublicDebate.mock.calls.length;
    // The first two minutes: every 15 seconds (the check at once, then one every 15 seconds).
    await advance(60_000);
    expect(reads()).toBe(5);
    // From two minutes on, every 30 seconds: fewer checks in a minute than at first, and never two reads in a row when the pace changes.
    await advance(2 * 60_000);
    // 1:15, 1:30, 1:45 and 2:00, then 2:30 and 3:00: the pace changed at two minutes with no extra read.
    expect(reads()).toBe(11);
    const atThree = reads();
    await advance(60_000);
    expect(reads() - atThree).toBe(2);
    // Hidden: nothing is checked; shown again: one check at once.
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    const hiddenAt = reads();
    await advance(3 * 60_000);
    expect(reads()).toBe(hiddenAt);
    visibility.mockReturnValue("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await flush();
    expect(reads()).toBe(hiddenAt + 1);
    // Ten minutes after the press the card says so, with "Check again"; nothing is said to have failed, and never that the
    // report is still being written, which the page cannot know (report-f8): "This is taking longer than usual. We keep checking."
    expect(card()!.textContent).not.toContain(V4["v4.investigation.slow"]);
    await advance(3 * 60_000 + 1_000);
    expect(card()!.textContent).toContain(V4["v4.investigation.slow"]);
    expect(card()!.textContent).not.toContain(V4["v4.wait.longer"]);
    const again = buttons(V4["v4.investigation.checkAgain"]!)[0]!;
    expect(again).toBeTruthy();
    // It keeps checking slowly, once a minute, as it says.
    const atTen = reads();
    await advance(10 * 60_000);
    expect(reads() - atTen).toBeGreaterThanOrEqual(9);
    expect(reads() - atTen).toBeLessThanOrEqual(11);
    // "Check again" asks once more at once; still not there, the card stays as it is.
    const before = reads();
    await click(again);
    expect(reads()).toBe(before + 1);
    expect(card()!.textContent).toContain(V4["v4.investigation.slow"]);
    expect(host!.querySelector("[data-public-report-failed]")).toBeNull();
    visibility.mockRestore();
  });

  it("a report the server says could not be written says so, and offers to write it again", async () => {
    vi.useFakeTimers();
    const page = debate();
    await mount(page);
    await click(press());
    // The server's optional `report_writing` (not in today's contract) says the version failed.
    lane.readPublicDebate = vi.fn(async () => ({ ...page, report_writing: { report_version: 2, state: "FAILED" } }));
    await advance(15_000);
    expect(card()).toBeNull();
    const failed = host!.querySelector("[data-public-report-failed]")!;
    expect(failed.textContent).toBe(V4["v4.investigation.failed"]);
    expect(failed.getAttribute("role")).toBe("alert");
    expect(lane.refresh).not.toHaveBeenCalled();
    // The wave-2 checks: the card held focus and went, so focus goes on to "Write it again", never to the page's body.
    expect(document.activeElement).toBe(buttons(V4["v4.investigation.writeAgain"]!)[0]);
    lane.writePublicReport = vi.fn(async () => ({ state: "WRITING", report_version: 3 }));
    await click(buttons(V4["v4.investigation.writeAgain"]!)[0]!);
    expect(lane.writePublicReport).toHaveBeenCalledTimes(1);
    expect(card()).not.toBeNull();
    expect(host!.querySelector("[data-public-report-failed]")).toBeNull();
  });

  it("after a reload, only the server can say a report is being written: someone else's is not called yours when it arrives", async () => {
    vi.useFakeTimers();
    const page = debate();
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    await mount({ ...page, report_writing: { report_version: 2, state: "WRITING", started_at: startedAt } } as PublicDebate);
    expect(card()!.textContent).toContain(V4["v4.state.BEING_WRITTEN"]);
    expect(buttons(V4["v4.public.report.write"]!)).toEqual([]);
    lane.readPublicDebate = vi.fn(async () => withVersion(page, 2));
    await advance(15_000);
    expect(readyLine().textContent).toBe(V4["v4.public.report.ready"]);
    expect(readyLine().textContent).not.toContain("Your");
    // Without the server's word, a reloaded page knows of no report being written.
    await act(async () => root?.unmount());
    host?.remove();
    await mount(page);
    expect(card()).toBeNull();
    expect(press()).toBeTruthy();
  });

  it("W2L-4 (RC-3, the checks of the last fixes): Check again keeps its focus while it checks; a second press asks nothing more", async () => {
    vi.useFakeTimers();
    const page = debate();
    // A report the server says is being written, started eleven minutes ago: the card already says it is taking longer.
    const startedAt = new Date(Date.now() - 11 * 60_000).toISOString();
    await mount({ ...page, report_writing: { report_version: 2, state: "WRITING", started_at: startedAt } } as PublicDebate);
    await advance(5_000);
    const again = buttons(V4["v4.investigation.checkAgain"]!)[0]!;
    expect(again).toBeTruthy();
    const reads = (): number => lane.readPublicDebate.mock.calls.length;
    let answer: (value: PublicDebate) => void = () => undefined;
    lane.readPublicDebate = vi.fn(() => new Promise<PublicDebate>((resolve) => { answer = resolve; }));
    again.focus();
    await click(again);
    expect(reads()).toBe(1);
    // It keeps its focus while it checks: never natively disabled, but aria-disabled and aria-busy.
    expect(again.isConnected).toBe(true);
    expect(again.disabled).toBe(false);
    expect(again.getAttribute("aria-disabled")).toBe("true");
    expect(again.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(again);
    await click(again);
    expect(reads()).toBe(1);
    // Not there yet: the card stays as it is, the button can be pressed again, and focus is still on it.
    await act(async () => { answer(page); });
    await flush();
    expect(again.hasAttribute("aria-busy")).toBe(false);
    expect(again.hasAttribute("aria-disabled")).toBe(false);
    expect(document.activeElement).toBe(again);
  });

  it("the ten minutes and the slow-down are the record's own numbers, and no line promises a time", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../apps/ui/components/v4/V4PublicLane.tsx"), "utf8");
    expect(source).toMatch(/REPORT_LONGER_AFTER_MINUTES = 10;/u);
    for (const key of ["v4.public.report.ready", "v4.investigation.slow", "v4.investigation.failed", "v4.state.BEING_WRITTEN", "v4.wait.leave"]) {
      expect(V4[key], key).not.toMatch(/\d|minute|hour/u);
    }
  });

  it.each([
    ["PUBLIC_DEBATE_ONGOING", "Something is still being added to this debate. Try again when it is finished."],
    ["PUBLIC_DEBATE_NO_CARRIER", "This debate's first author has left and no dig is on it yet, so a report can't be written. Dig into a path first."],
    ["PUBLIC_DEBATE_WAITS_FOR_RESET", "You've used what your plan allows for now. You can carry on once it resets."]
  ])("%s reads in plain words, and the button stays", async (error, words) => {
    lane.writePublicReport = vi.fn(async () => ({ error, message: error }));
    await mount(debate(1));
    await click(press());
    expect(host!.querySelector("[role=alert]")!.textContent).toBe(words);
    expect(press().disabled).toBe(false);
    expect(host!.textContent).not.toContain(error);
  });

  it("a 404 or a failure says only that it could not start", async () => {
    lane.writePublicReport = vi.fn(async () => { throw new ContractHttpError("NOT_FOUND", 404, "x", "DEBATE_NOT_FOUND"); });
    await mount(debate(1));
    expect(debate(1).public_ref).toBe(PUBLIC_REF_AUTHOR_GONE);
    await click(press());
    expect(host!.querySelector("[role=alert]")!.textContent).toBe(V4["v4.public.report.failed"]);
  });
});

/*
 * The owner's level ruling (5 Nov 2026, question 15 and the second round): a debate keeps the level it was asked at, and a
 * public page shows each debate at that level. The public read says it (`reading_level`, the start-step session's Task 75d;
 * not yet in this branch's contract, so these tests hand the page a read that carries it); one without it reads as Plain
 * words. A dig asked there is asked, and its share read, at the debate's level, never the visitor's own, so "up to N%"
 * agrees with what the dig is charged.
 */
describe("a public debate at its own reading level", () => {
  const atLevel = (level: string): PublicDebate => ({ ...debate(), reading_level: level }) as PublicDebate;
  const firstOpen = (): HTMLButtonElement => buttons(V4["v4.public.dig.open"]!)[0]!;
  const basisLines = (): number => host!.querySelectorAll(".v4PubFound .v4PanelBasis").length;

  it("a dig asked there is asked and priced at the debate's level, and its card opens the dig at that level", async () => {
    vi.useFakeTimers();
    await mount(atLevel("expert"));
    expect(lane.askLevels.length).toBeGreaterThan(0);
    expect(new Set(lane.askLevels)).toEqual(new Set(["expert"]));
    await openRows();
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Rural towns differ.");
    await click(startButtons()[0]!);
    await undoRunsOut();
    expect(lane.submit).toHaveBeenCalledTimes(1);
    const card = host!.querySelector("[data-public-dig-card]")!;
    expect(card.querySelector("a")!.getAttribute("href")).toBe("/v4/debate/99999999-9999-4999-8999-999999999999?level=expert");
  });

  it("a debate with no level of its own is asked at Plain words, whatever the visitor's account or the address holds", async () => {
    lane.accountLevel = "expert";
    window.history.replaceState(null, "", "/?level=background");
    await mount(debate());
    await flush();
    expect(new Set(lane.askLevels)).toEqual(new Set(["plain"]));
  });

  it("the points under a path show at the debate's level: Plain words leave out what Some background adds", async () => {
    await mount(debate());
    await openRows();
    expect(basisLines()).toBe(0);
    await act(async () => root?.unmount());
    host?.remove();
    await mount(atLevel("background"));
    await openRows();
    expect(basisLines()).toBeGreaterThan(0);
  });
});
