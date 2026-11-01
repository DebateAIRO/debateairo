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
 * name went, the Reports section, and the two presses, signed in and signed out.
 */
const lane = vi.hoisted(() => ({
  session: true,
  push: vi.fn(),
  refresh: vi.fn(),
  submit: vi.fn(),
  writePublicReport: vi.fn(),
  planTier: "free" as "free" | "premium"
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: lane.push, refresh: lane.refresh }) }));
vi.mock("@/lib/api", async (original) => ({
  ...await original<Record<string, unknown>>(),
  validateSession: async () => { if (!lane.session) throw new Error("no session"); },
  contractClient: {
    writePublicReport: (...args: unknown[]) => lane.writePublicReport(...args),
    readReadingLevel: async () => ({ reading_level: "plain" }),
    saveReadingLevel: async () => ({ reading_level: "plain" })
  }
}));
vi.mock("@/lib/v4/useV4Ask", () => ({
  useV4Ask: () => ({ planTier: lane.planTier, room: null, submit: (...args: unknown[]) => lane.submit(...args), submitting: false, dialogs: null, flagsCrisis: () => false })
}));

import { PublicDebateOverview } from "../../apps/ui/components/PublicDebateOverview.js";
import { seedPublicDebates, PUBLIC_REF, PUBLIC_REF_AUTHOR_GONE, PUBLIC_UPDATE_REF } from "../../tools/v4-mock-api/public-seed.js";

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

beforeEach(() => {
  lane.session = true;
  lane.planTier = "free";
  lane.push = vi.fn();
  lane.refresh = vi.fn();
  lane.submit = vi.fn(async () => ({ kind: "STARTED", runId: "99999999-9999-4999-8999-999999999999" }));
  lane.writePublicReport = vi.fn(async () => ({ state: "WRITING", report_version: 2 }));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  vi.useRealTimers();
});

describe("what the public page shows", () => {
  it("a path at its newest text, who added to it and when; the first text only behind the first answer", async () => {
    await mount(debate());
    const paths = [...host!.querySelectorAll(".publicVerdictText > .publicStory .storyPath")];
    expect(paths[0]!.querySelector(".storyPathLine")!.textContent).toContain("also in small towns");
    expect(paths[0]!.textContent).toContain("Added to by Quiet Heron on October 28, 2026");
    expect(paths[0]!.textContent).toContain("A dig looked at small towns");
    expect(paths[1]!.textContent).not.toContain("Added to by");
    const first = host!.querySelector<HTMLDetailsElement>(".publicFirstAnswer")!;
    expect(first.querySelector("summary")!.textContent).toBe(V4["v4.public.firstAnswer"]);
    expect(first.textContent).toContain("Free fares for everyone: partly held. They help people with little money");
    expect(first.textContent).toContain("Our answer: cheaper fares");
    expect(first.textContent).not.toContain("Added to by");
  });

  it("the main answer shows its update, and the date it changed", async () => {
    await mount(debate());
    const update = host!.querySelector(".publicMainUpdate")!.textContent!;
    expect(update).toContain("Better service first, and free fares for those who need them");
    expect(update).toContain("The answer was updated on October 28, 2026.");
    // Outside the first answer, the first headline is not what is read first.
    expect(host!.querySelector(".publicVerdictText > .publicStory .storyHeadline")).toBeNull();
  });

  it("a page nobody changed reads as it did, with no update and no first-answer link", async () => {
    const { contributions: _c, main_answer_update: _m, reports: _r, ...plain } = debate();
    await mount(plain);
    expect(host!.querySelector(".publicMainUpdate")).toBeNull();
    expect(host!.querySelector(".publicFirstAnswer")).toBeNull();
    expect(text()).toContain("Our answer: cheaper fares");
    expect(text()).not.toContain("Added to by");
  });

  it("a name that went reads \"a contributor\", on a path and on a report", async () => {
    const page = debate();
    await mount({ ...page, contributions: [{ ...page.contributions![0]!, contributor: null }], reports: [{ ...page.reports![0]!, writer: null }] });
    expect(text()).toContain("Added to by a contributor on October 28, 2026");
    expect(text()).toContain("Report written by a contributor");
    expect(text()).not.toContain("Quiet Heron");
  });

  it("a dig's own paths show under its contribution, with their points", async () => {
    await mount(debate());
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
    expect(text()).toContain("Added to by Quiet Heron");
    expect(text()).toContain("Report written by Quiet Heron");
    expect(buttons(V4["v4.public.dig.open"]!)).toEqual([]);
    expect(buttons(V4["v4.public.report.write"]!)).toEqual([]);
    expect(text()).not.toContain(V4["v4.public.dig.signIn"]);
  });
});

describe("not signed in", () => {
  it("each press is a sign-in link back to this page, and nothing is offered to press", async () => {
    lane.session = false;
    await mount(debate());
    const links = [...host!.querySelectorAll("a")].filter((link) => link.textContent === V4["v4.public.dig.signIn"]);
    // Three paths and the dig's own path.
    expect(links).toHaveLength(4);
    expect(links[0]!.getAttribute("href")).toBe(`/login?next=${encodeURIComponent(`/public/debate/${PUBLIC_REF}`)}`);
    expect([...host!.querySelectorAll("a")].some((link) => link.textContent === V4["v4.public.report.signIn"])).toBe(true);
    expect(buttons(V4["v4.public.dig.open"]!)).toEqual([]);
    expect(buttons(V4["v4.public.report.write"]!)).toEqual([]);
  });
});

describe("Dig into this", () => {
  const firstOpen = (): HTMLButtonElement => buttons(V4["v4.public.dig.open"]!)[0]!;

  it("says what it costs and what the check does; nothing starts with an empty box", async () => {
    await mount(debate());
    await click(firstOpen());
    expect(text()).toContain("This dig uses your own quota. An AI checks its result before it can change this public page. If it doesn't pass, it stays private to you and the page is unchanged. If a later part of the update doesn't pass, the page keeps its older text and that part still counts in your quota.");
    expect(buttons(V4["v4.public.dig.start"]!)[0]!.disabled).toBe(true);
    expect(lane.submit).not.toHaveBeenCalled();
  });

  it("a path of the debate: a quick dig named by the page, then the dig's own page; no run id goes out, no AI suggestion is offered", async () => {
    await mount(debate());
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
    const under = host!.querySelector(".v4PubDigPaths")!;
    await click(under.querySelector<HTMLButtonElement>("button")!);
    await write(under.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click([...under.querySelectorAll("button")].find((one) => one.textContent === V4["v4.public.dig.start"])!);
    expect(lane.submit.mock.calls[0]![3]).toMatchObject({ dig_ref: PUBLIC_UPDATE_REF, places: ["path:p-towns"], picks: [{ place: "path:p-towns" }] });
  });

  it("Free combines up to its cap of views, then says so without a number; a paid plan goes on", async () => {
    await mount(debate());
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
    await click(firstOpen());
    for (let at = 0; at < 3; at += 1) await click([...host!.querySelectorAll("button")].find((one) => one.textContent === V4["v4.public.dig.addView"])!);
    expect(host!.querySelectorAll(".v4PubText")).toHaveLength(4);
  });

  it("a refusal reads as the hook said it; the box stays, with the person's words", async () => {
    lane.submit = vi.fn(async () => ({ kind: "REFUSED", message: "Plain words." }));
    await mount(debate());
    await click(firstOpen());
    const field = host!.querySelector<HTMLTextAreaElement>(".v4PubText")!;
    await write(field, "Mine.");
    await click(buttons(V4["v4.public.dig.start"]!)[0]!);
    expect(host!.querySelector("[role=alert]")!.textContent).toBe("Plain words.");
    expect(field.value).toBe("Mine.");
    expect(lane.push).not.toHaveBeenCalled();
  });

  it("a dig that could not join says it runs as the person's own private debate, and goes nowhere", async () => {
    lane.submit = vi.fn(async () => ({ kind: "STARTED", runId: "99999999-9999-4999-8999-999999999999", notJoined: true }));
    await mount(debate());
    await click(firstOpen());
    await write(host!.querySelector<HTMLTextAreaElement>(".v4PubText")!, "Mine.");
    await click(buttons(V4["v4.public.dig.start"]!)[0]!);
    expect(host!.querySelector("[role=alert]")!.textContent).toBe(V4["v4.public.dig.notJoined"]);
    expect(lane.push).not.toHaveBeenCalled();
  });
});

describe("Write a report", () => {
  const press = (): HTMLButtonElement => buttons(V4["v4.public.report.write"]!)[0]!;

  it("says it uses the quota and the name is only a reference; 202 says it's being written, and the page refreshes until it shows", async () => {
    vi.useFakeTimers();
    const page = debate();
    await mount(page);
    expect(text()).toContain("This uses your quota. Your name shows only as a reference.");
    await click(press());
    expect(lane.writePublicReport).toHaveBeenCalledWith(PUBLIC_REF);
    expect(text()).toContain("Your report is being written. This page will show it when it is ready.");
    expect(buttons(V4["v4.public.report.write"]!)).toEqual([]);
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(lane.refresh).toHaveBeenCalledTimes(1);
    // The refreshed page holds version 2: the line goes and no more reads are asked.
    const older = page.reports![0]!;
    await act(async () => root!.render(
      <PublicDebateOverview debate={{ ...page, reports: [older, { ...older, report_version: 2 }] }} catalog={PUBLIC} storyCatalog={PUBLIC} storyLocale="en" locale="en" onDetails={() => undefined} onRead={() => undefined}
        lane={{ catalog: V4, homeCatalog: {}, newDebateCatalog: {}, locale: "en", crisisCountryHint: null }} />
    ));
    expect(text()).not.toContain("Your report is being written");
    expect(press()).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(lane.refresh).toHaveBeenCalledTimes(1);
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
