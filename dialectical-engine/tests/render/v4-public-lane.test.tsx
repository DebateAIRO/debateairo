// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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
 */
const lane = vi.hoisted(() => ({
  session: true as boolean | "pending",
  push: vi.fn(),
  refresh: vi.fn(),
  submit: vi.fn(),
  writePublicReport: vi.fn(),
  readPublicDebate: vi.fn(),
  planTier: "free" as "free" | "premium"
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
    readReadingLevel: async () => ({ reading_level: "plain" }),
    saveReadingLevel: async () => ({ reading_level: "plain" })
  }
}));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: () => ({ planTier: lane.planTier, room: null, submit: (...args: unknown[]) => lane.submit(...args), submitting: false, dialogs: null, flagsCrisis: () => false })
}));

import { PublicDebateOverview } from "../../apps/ui/components/PublicDebateOverview.js";
import { contributionOf, seedPublicDebates, PUBLIC_REF, PUBLIC_REF_AUTHOR_GONE, PUBLIC_UPDATE_REF } from "../../tools/v4-mock-api/public-seed.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const V4 = messages("v4");
const PUBLIC = messages("public");
const debate = (at = 0): PublicDebate => PublicDebateSchema.parse(seedPublicDebates()[at]);

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const flush = async (): Promise<void> => { await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); }); };

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

beforeEach(() => {
  lane.session = true;
  lane.planTier = "free";
  lane.push = vi.fn();
  lane.refresh = vi.fn();
  lane.submit = vi.fn(async () => ({ kind: "STARTED", runId: "99999999-9999-4999-8999-999999999999" }));
  lane.writePublicReport = vi.fn(async () => ({ state: "WRITING", report_version: 2 }));
  lane.readPublicDebate = vi.fn(async () => debate());
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("what the public page shows", () => {
  it("a path at its newest text, who added to it and when; the first text only behind the first answer", async () => {
    await mount(debate());
    await openRows();
    const paths = rows();
    expect(paths[0]!.querySelector(".v4PubRowHead")!.textContent).toContain("also in small towns");
    expect(paths[0]!.textContent).toContain("Quiet Heron added to this on October 28, 2026");
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

  it("the main answer shows its update, and the date it changed", async () => {
    await mount(debate());
    const update = host!.querySelector(".publicMainUpdate")!.textContent!;
    expect(update).toContain("Better service first, and free fares for those who need them");
    expect(update).toContain("The answer was updated on October 28, 2026.");
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
    expect(text()).toContain("A contributor added to this on October 28, 2026");
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

describe("Dig into this", () => {
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
    expect(buttons(V4["v4.public.dig.start"]!)[0]!.disabled).toBe(true);
    expect(lane.submit).not.toHaveBeenCalled();
    // Opening the box puts focus in it; Cancel gives it back to "Dig into this".
    expect(document.activeElement).toBe(box.querySelector(".v4PubText"));
    await click(buttons(V4["v4.public.dig.cancel"]!)[0]!);
    expect(document.activeElement).toBe(firstOpen());
  });

  it("a path of the debate: a quick dig named by the page, then the dig's own page; no run id goes out, no AI suggestion is offered", async () => {
    await mount(debate());
    await openRows();
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Rural towns differ.");
    await click(buttons(V4["v4.public.dig.start"]!)[0]!);
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
    expect(lane.push).toHaveBeenCalledWith("/v4/debate/99999999-9999-4999-8999-999999999999?level=plain");
  });

  it("a dig's own path names the contribution it hangs under", async () => {
    await mount(debate());
    await openRows();
    const under = host!.querySelector(".v4PubDigPaths")!;
    await click(under.querySelector<HTMLButtonElement>("button")!);
    await write(under.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click([...under.querySelectorAll("button")].find((one) => one.textContent === V4["v4.public.dig.start"])!);
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

  it("a refusal reads as the hook said it; the box stays, with the person's words", async () => {
    lane.submit = vi.fn(async () => ({ kind: "REFUSED", message: "Plain words." }));
    await mount(debate());
    await openRows();
    await click(firstOpen());
    const field = host!.querySelector<HTMLTextAreaElement>(".v4PubText")!;
    await write(field, "Mine.");
    await click(buttons(V4["v4.public.dig.start"]!)[0]!);
    expect(host!.querySelector("[role=alert]")!.textContent).toBe("Plain words.");
    expect(field.value).toBe("Mine.");
    expect(lane.push).not.toHaveBeenCalled();
  });

  it("a dig that could not join is a calm note, not a refusal: it runs as the person's own private debate, with \"Open it\"", async () => {
    lane.submit = vi.fn(async () => ({ kind: "STARTED", runId: "99999999-9999-4999-8999-999999999999", notJoined: true }));
    await mount(debate());
    await openRows();
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(buttons(V4["v4.public.dig.start"]!)[0]!);
    expect(host!.querySelector("[role=alert]")).toBeNull();
    const note = host!.querySelector("[data-public-dig-private]")!;
    expect(note.getAttribute("role")).toBe("status");
    expect(note.className).toBe("v4PubNote");
    expect(note.textContent).toBe(`${V4["v4.public.dig.notJoined"]} Open it`);
    expect(note.querySelector("a")!.getAttribute("href")).toBe("/v4/debate/99999999-9999-4999-8999-999999999999?level=plain");
    // It started: the box is gone, so it cannot be started twice.
    expect(buttons(V4["v4.public.dig.start"]!)).toEqual([]);
    expect(lane.push).not.toHaveBeenCalled();
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
    expect(starting.disabled).toBe(true);
    expect(starting.getAttribute("aria-busy")).toBe("true");
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
    await act(async () => root!.render(overview(withVersion(page, 2))));
    expect(press()).toBeTruthy();
    // No more checks once it is there.
    await advance(120_000);
    expect(lane.readPublicDebate).toHaveBeenCalledTimes(1);
    expect(lane.refresh).toHaveBeenCalledTimes(1);
  });

  it("the checks slow down over time and pause while the tab is hidden; after ten minutes the card says it is taking longer, with Check again", async () => {
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
    // Ten minutes after the press the checks stop and the card says so, with "Check again"; nothing is said to have failed.
    expect(card()!.textContent).not.toContain(V4["v4.wait.longer"]);
    await advance(3 * 60_000 + 1_000);
    const stopped = reads();
    expect(card()!.textContent).toContain(V4["v4.wait.longer"]);
    const again = buttons(V4["v4.investigation.checkAgain"]!)[0]!;
    expect(again).toBeTruthy();
    await advance(10 * 60_000);
    expect(reads()).toBe(stopped);
    // "Check again" asks once; still not there, the card stays as it is.
    await click(again);
    expect(reads()).toBe(stopped + 1);
    expect(card()!.textContent).toContain(V4["v4.wait.longer"]);
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

  it("the stop and the slow-down are the record's own numbers, and no line promises a time", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../apps/ui/components/v4/V4PublicLane.tsx"), "utf8");
    expect(source).toMatch(/REPORT_CHECKS_STOP_MINUTES = 10;/u);
    for (const key of ["v4.public.report.ready", "v4.wait.longer", "v4.investigation.failed", "v4.state.BEING_WRITTEN", "v4.wait.leave"]) {
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
