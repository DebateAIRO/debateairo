// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnswerSchema,
  RunProjectionSchema,
  type Answer,
  type AnswerBranch,
  type AnswerBranches,
  type PathOutcome,
  type RunProjection
} from "../../packages/contract/src/index.js";
import { V4MainAnswer } from "../../apps/ui/components/v4/V4MainAnswer.js";
import { V4CarryOnLine, V4MapCarryOnLine, V4MapTree, V4PathCard, type MapPiecesProps } from "../../apps/ui/components/v4/V4MapTree.js";
import { V4Outline } from "../../apps/ui/components/v4/V4Outline.js";
import { V4Panel } from "../../apps/ui/components/v4/V4Panel.js";
import { t } from "../../apps/ui/lib/i18n/translate.js";
import { STORY_FIXTURE_ANSWER, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import { groundClass } from "../../apps/ui/lib/v4/mapLooks.js";
import { buildV4Map, buildV4RunMap } from "../../apps/ui/lib/v4/mapModel.js";
import type { V4Map, V4MoreItem, V4Path, V4Selection } from "../../apps/ui/lib/v4/types.js";
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

/*
 * V4 start step, Task 61 (spec 2026-11-03 §2 items 7 and 8; items wait-d1 C, journey-f1, journey-f2, map-d2, wait-f16, r2-1,
 * map-f4): one card for a chosen path, the same while the AIs look into it and once it has its answer so far, so nothing
 * changes look when the answer lands. A path being looked into wears journey-f2's "being looked into" look with its step line
 * and quiet dots; a filled path the settled look with its bar and trust word; a path that could not finish says so with no
 * bar. The panel says what the path asks, what it brings together and the person's words first, then what the AIs found.
 * "+ N more to explore" opens the menu paths left out; the carry-on line says which part runs. All words are made up.
 */

const catalog = v4English as Readonly<Record<string, string>>;
const css = (name: string): string => readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4", name), "utf8");

/** journey-f2's "being looked into" look, read from the other session's stylesheet (never a look of this task's own). */
const LOOKING_CLASS = /Being looked into[^\n]*\n\.(v4Ground[A-Z]+)\s*\{/u.exec(css("v4-map-looks.css"))?.[1] ?? "missing";
/** journey-f2's settled look: the class every settled card carries (lib/v4/mapLooks.ts groundClass). */
const SETTLED_CLASS = groundClass("SETTLED").split(" ").at(-1)!;

const carry = vi.hoisted(() => ({ built: false }));
vi.mock("@/lib/v4/carryOn", () => ({ get CARRY_ON_BUILT() { return carry.built; } }));

const Q = "Should Romania build new nuclear plants?";
const T1 = "Whole-system costs";
const T2 = "Cernavodă jobs";
const T3 = "Using less power first";
const OWN = "My own words about the jobs at the plant.";
const FAILED_LINE = "We couldn't finish looking into this. The rest of the debate went on.";

const ready = (line: string, trust: PathOutcome["trust"], extra: Partial<Extract<PathOutcome, { state: "READY" }>> = {}): PathOutcome => ({
  state: "READY", text: { line, summary: `Summary of ${line}`, fate: "HELD_UP" }, what_changed: [], view: null, trust, rests_on: [], ...extra
} as PathOutcome);
const failed: PathOutcome = { state: "FAILED", text: null, what_changed: [], view: null, trust: null, rests_on: [] };

function branch(n: number, extra: Partial<AnswerBranch>): AnswerBranch {
  return {
    path_id: `b${n}`, order: n, title: `Path ${n}`, question: `Question of path ${n}?`, author: "AI_SUGGESTION",
    viewpoints: [{ title: `Viewpoint ${n}`, question: `Question of path ${n}?`, own: false }],
    state: "LOOKING", root_node_id: null, outcome: null, ...extra
  };
}

/** Five viewpoints: a path may hold more than four, and every one is listed (Task 92a). */
const FIVE = ["Plant costs", "Grid costs", "Storage costs", "Import costs", "Clean-up costs"]
  .map((title) => ({ title, question: `What about ${title.toLowerCase()}?`, own: false }));

const B1 = branch(1, {
  title: T1, question: "What does each choice cost the whole power system?", viewpoints: FIVE, state: "ARGUED", root_node_id: "n-yes",
  outcome: ready("Line b1.", "SURE_FOR_CASE")
});
const B2 = branch(2, {
  title: T2, question: "What happens to the jobs at Cernavodă?", author: "PERSON_OWN_VIEW", state: "ARGUED", root_node_id: "n-not-now",
  viewpoints: [{ title: null, question: OWN, own: true }],
  outcome: ready("Line b2.", "SURE", {
    what_changed: ["Changed b2."],
    view: { outcome: "HELPED", scope: "MAIN_QUESTION", reason: "A made-up reason.", own_words: [OWN] }
  })
});
const B3 = branch(3, { title: T3, state: "FAILED", outcome: failed });

function branchesOf(paths: AnswerBranch[], extra: Partial<AnswerBranches> = {}): AnswerBranches {
  return {
    source: "MENU", width: 3, paths,
    more: [
      { more_id: "more-kp02", title: "Falling prices", question: "Will falling prices of solar change the choice?", is_new: false },
      { more_id: "more-kp07", title: "Building delays", question: "How often are new plants late?", is_new: true }
    ],
    also_raised: ["A point no path took."],
    main_trust: "SURE_FOR_CASE",
    carry_on_to_report: true,
    ...extra
  };
}

function served(extra: Partial<AnswerBranches> = {}, paths: AnswerBranch[] = [B1, B2, B3]): V4Map {
  const answer: Answer = AnswerSchema.parse({ ...STORY_FIXTURE_ANSWER, branches: branchesOf(paths, extra) });
  return buildV4Map({ runId: "run-1", answer, story: null });
}

const DOTS = ["PUT_FORWARD", "PUT_FORWARD", "BEING_CHECKED", "PUT_FORWARD", "CHECKED", "PUT_FORWARD"] as const;

/** The run read while the debate runs: b1 arguing with six dots, b2 filled in with two sure findings, b3 not yet started. */
function runRead(extra: Partial<RunProjection> = {}): RunProjection {
  return RunProjectionSchema.parse({
    run_ref: "run-1", question_line: Q, state: "RUNNING", terminal_reason: null, hold_until: null,
    branches: branchesOf([
      branch(1, { title: T1, question: "What does each choice cost the whole power system?", viewpoints: FIVE }),
      branch(2, { title: T2, question: B2.question, author: "PERSON_OWN_VIEW", viewpoints: B2.viewpoints, state: "ARGUED",
        root_node_id: "n-not-now", outcome: ready("Line b2.", "SURE") }),
      branch(3, { title: T3 })
    ], { main_trust: null, carry_on_to_report: false }),
    path_progress: [
      { path_id: "b1", step: "ARGUING", points: [...DOTS], findings: [] },
      { path_id: "b2", step: null, points: [], findings: [
        { node_ref: "n-not-now", text: "A made-up finding about the costs.", trust: "SURE" },
        { node_ref: "n-not-now-once", text: "A made-up finding about the move.", trust: "SURE" }
      ] },
      { path_id: "b3", step: null, points: [], findings: [] }
    ],
    ...extra
  });
}
const running = (): V4Map => buildV4RunMap({ runId: "run-1", run: runRead() })!;

const noop = () => {};
function pieces(map: V4Map, extra: Partial<MapPiecesProps> = {}): MapPiecesProps {
  return { map, digs: [], selected: "root", changed: new Set(), picked: new Set(), onSelect: noop, onTogglePick: noop, catalog, locale: "en", ...extra };
}
function dom(node: ReactNode): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<>{node}</>);
  return container;
}
type PanelExtra = Partial<{ onDigDeeper: (pathId: string) => void; onDigMore: (item: V4MoreItem) => void; onDig: () => void }>;
function panelNode(map: V4Map, selected: V4Selection, extra: PanelExtra = {}): ReactNode {
  return (
    <V4Panel map={map} digs={[]} selected={selected} readingLevel="plain" picked={new Set()} onTogglePick={noop} onSelect={noop}
      digMode="quick" onDigMode={noop} onDig={extra.onDig ?? noop} digBusy={false} headingRef={createRef<HTMLHeadingElement>()}
      {...(extra.onDigDeeper === undefined ? {} : { onDigDeeper: extra.onDigDeeper })}
      {...(extra.onDigMore === undefined ? {} : { onDigMore: extra.onDigMore })}
      catalog={catalog} locale="en" />
  );
}
const card = (root: HTMLElement, id: string): HTMLElement => root.querySelector<HTMLElement>(`[data-path-card="${id}"]`)!;
/** What a card draws on screen (the words for screen readers only, such as its level, left out). */
function drawn(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll(".v4SrOnly")) hidden.remove();
  return copy.textContent ?? "";
}
/** The panel's blocks in order, by their headings and lines. */
const order = (root: HTMLElement, texts: readonly string[]): number[] => {
  const text = root.textContent ?? "";
  return texts.map((piece) => text.indexOf(piece));
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let mounted: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => mounted?.unmount());
  host?.remove();
  mounted = null;
  host = null;
  carry.built = false;
});
async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  mounted = createRoot(host);
  await act(async () => mounted!.render(node));
  return host;
}

/** The tree and the panel with one shared selection, as the page draws them. */
function MapAndPanel(props: Readonly<{ map: V4Map; onDigMore?: (item: V4MoreItem) => void }>) {
  const [selected, setSelected] = useState<V4Selection>("root");
  return (
    <>
      <V4MapTree {...pieces(props.map, { selected, onSelect: (selection) => setSelected(selection) })} />
      {panelNode(props.map, selected, props.onDigMore === undefined ? {} : { onDigMore: props.onDigMore })}
    </>
  );
}

describe("precondition: journey-f2's looks are on this branch", () => {
  it("reads the 'being looked into' class from the other session's stylesheet", () => {
    expect(LOOKING_CLASS).toBe("v4GroundLOOKING");
    expect(SETTLED_CLASS).toBe("v4GroundSETTLED");
  });
});

describe("the served map of a path debate", () => {
  it("tags each card, gives a filled path's bar its trust word, and a path that could not finish its line and no bar", () => {
    const root = dom(<V4MapTree {...pieces(served())} />);
    expect(card(root, "b2").textContent).toContain("Added by you");
    expect(card(root, "b1").textContent).toContain("Put together by us");
    expect(card(root, "b1").querySelector('[role="img"]')!.getAttribute("aria-label")).toContain("How sure: Sure, for the case named");
    expect(card(root, "b1").textContent).toContain("Line b1.");
    expect(card(root, "b1").classList.contains(SETTLED_CLASS)).toBe(true);
    expect(card(root, "b3").textContent).toContain(FAILED_LINE);
    expect(card(root, "b3").querySelector(".v4Bar")).toBeNull();
    expect(card(root, "b3").classList.contains(SETTLED_CLASS)).toBe(true);
    // The person's own path is theirs: its title is not marked as AI text; an AI's path title is.
    expect(card(root, "b2").querySelector(".v4MapPathTitle [data-ai-generated]")).toBeNull();
    expect(card(root, "b1").querySelector(".v4MapPathTitle [data-ai-generated='true']")!.textContent).toBe(T1);
  });

  it("'+ 2 more to explore' opens the list, and 'Dig into this' digs that item; no link when nothing was left out", async () => {
    const asked: V4MoreItem[] = [];
    const root = await mount(<MapAndPanel map={served()} onDigMore={(item) => asked.push(item)} />);
    const more = [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "+ 2 more to explore")!;
    expect(more).toBeDefined();
    await act(async () => more.click());
    const panel = root.querySelector<HTMLElement>(".v4Panel")!;
    expect(panel.querySelector("h2")!.textContent).toBe("More to explore");
    expect(panel.textContent).toContain("What you left out before Start. Dig into one to look into it next.");
    expect(panel.textContent).toContain("Falling prices");
    expect(panel.textContent).toContain("New");
    const dig = [...panel.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.textContent === "Dig into this");
    expect(dig).toHaveLength(2);
    await act(async () => dig[0]!.click());
    expect(asked).toEqual([{ id: "more-kp02", title: "Falling prices", question: "Will falling prices of solar change the choice?", isNew: false }]);
    const none = dom(<V4MapTree {...pieces(served({ more: [] }))} />);
    expect(none.textContent).not.toMatch(/more to explore/u);
  });

  it("a path's panel: what it asks, what it brings together, your words, the answer so far, what changed, your point of view", () => {
    const b1 = dom(panelNode(served(), "path:b1"));
    expect(b1.querySelector("h2")!.textContent).toBe(T1);
    expect(b1.textContent).toContain("What it brings together");
    // Every viewpoint is listed, five of them.
    expect([...b1.querySelectorAll(".v4PathView")].map((chip) => chip.textContent)).toEqual(FIVE.map((viewpoint) => viewpoint.title));
    const deeper: string[] = [];
    const b2 = dom(panelNode(served(), "path:b2", { onDigDeeper: (id) => deeper.push(id) }));
    const blocks = ["What this asks", B2.question, "Your words", OWN, "The answer here so far", "Line b2.", "How sure: Sure", "What changed",
      "Changed b2.", t(catalog, "v4.view.HELPED.MAIN_QUESTION")];
    const at = order(b2, blocks);
    expect(at.every((position) => position >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // The person's own words are theirs, never marked as AI text.
    const words = [...b2.querySelectorAll(".v4PathOwnWords li")];
    expect(words.map((item) => item.textContent)).toEqual([OWN]);
    expect(words[0]!.closest("[data-ai-generated]")).toBeNull();
    expect(b2.querySelector("h2")!.hasAttribute("data-ai-generated")).toBe(false);
  });

  it("the path's one dig button digs deeper into that path", async () => {
    const deeper: string[] = [];
    const root = await mount(panelNode(served(), "path:b2", { onDigDeeper: (id) => deeper.push(id) }));
    const button = root.querySelector<HTMLButtonElement>(".v4PanelDigBtn")!;
    // journey-f13 (owner, 3 Nov): one dig button everywhere, in the record's words; "Dig deeper here" is on no page.
    expect(button.textContent).toBe(t(catalog, "v4.panel.dig"));
    expect(root.textContent).not.toContain("Dig deeper here");
    await act(async () => button.click());
    expect(deeper).toEqual(["b2"]);
  });

  it("titles: the site's own words when a path has none, and a long title cut at a word edge near 70 characters", () => {
    // A path from before the start step (no branch) whose line is empty.
    const { branch: _chosen, ...plain } = served().paths[0]!;
    const untitled: V4Path = { ...plain, line: "  " };
    const fallback = dom(<V4MapTree {...pieces({ ...served(), paths: [untitled] })} />);
    const title = fallback.querySelector(".v4MapPathTitle")!;
    expect(title.textContent).toBe("A path the AIs looked into");
    expect(title.querySelector("[data-ai-generated]")).toBeNull();
    const long = "Whole-system costs of every choice, counted over the next twenty-five years by region and season";
    const root = dom(<V4MapTree {...pieces(served({}, [{ ...B1, title: long }, B2, B3]))} />);
    const cut = card(root, "b1").querySelector(".v4MapPathTitle [data-ai-generated]")!.textContent!;
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(71);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(long[cut.length - 1]).toBe(" ");
    expect(dom(panelNode(served({}, [{ ...B1, title: long }, B2, B3]), "path:b1")).querySelector("h2")!.textContent).toBe(long);
  });

  it("'Also raised, not looked into' shows on the question's panel only when the AIs raised something no path took", () => {
    const some = dom(panelNode(served(), "root"));
    const section = [...some.querySelectorAll("section")].find((element) => element.textContent?.startsWith("Also raised, not looked into"))!;
    expect(section.querySelector("[data-ai-generated='true']")!.textContent).toContain("A point no path took.");
    expect(dom(panelNode(served({ also_raised: [] }), "root")).textContent).not.toContain("Also raised");
  });

  it("no card says 'You picked' or 'Your path' (answer Q16: every path here is one the person picked)", () => {
    for (const map of [served(), running()]) {
      for (const element of dom(<V4MapTree {...pieces(map)} />).querySelectorAll("[data-path-card]")) {
        expect(element.textContent).not.toMatch(/You picked|Your path/u);
      }
    }
  });

  it("the main answer says how sure it is, from what the AIs found", () => {
    const root = dom(<V4MainAnswer mainAnswer={null} mainTrust="SURE_FOR_CASE" catalog={catalog} locale="en" />);
    expect(root.textContent).toBe("How sure the answer is, from what the AIs found: Sure, for the case named");
    expect(dom(<V4MainAnswer mainAnswer={null} catalog={catalog} locale="en" />).textContent).toBe("");
  });
});

describe("the map while the AIs look into each path", () => {
  it("a path being looked into: the looked-into look, 'Looking into it', its step line and its dots; no bar, no star, no number", () => {
    const root = dom(<V4MapTree {...pieces(running(), { running: true })} />);
    const b1 = card(root, "b1");
    expect(b1.textContent).toContain("Looking into it");
    expect(b1.textContent).toContain("Arguing for and against");
    expect(b1.classList.contains(LOOKING_CLASS)).toBe(true);
    expect(b1.classList.contains("v4PathPulse")).toBe(true);
    expect(b1.querySelector(".v4Bar")).toBeNull();
    expect(b1.querySelector(".v4MapStar")).toBeNull();
    expect(drawn(b1).replace(T1, "")).not.toMatch(/\d/u);
    const dots = [...b1.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === "Points being argued on this path")!;
    expect(dots).toBeDefined();
    expect(dots.querySelectorAll(".v4PathDot")).toHaveLength(6);
    expect([...dots.querySelectorAll(".v4PathDot")].map((dot) => dot.classList.contains("v4PathDotRing"))).toEqual([false, false, true, false, false, false]);
    expect(dots.querySelectorAll(".v4PathDotCHECKED")).toHaveLength(1);
    expect(b1.querySelector("button button")).toBeNull();
    // The card's own button and the dots' button sit side by side in the card.
    expect(b1.querySelector(".v4PathCardMain")!.contains(dots)).toBe(false);
  });

  it("pressing the dots says what they are, and focus stays on them", async () => {
    const root = await mount(<V4MapTree {...pieces(running(), { running: true })} />);
    const dots = card(root, "b1").querySelector<HTMLButtonElement>(".v4PathDotsBtn")!;
    const note = (): HTMLElement | null => card(root, "b1").querySelector<HTMLElement>(".v4PathDotsNote");
    expect(dots.getAttribute("aria-expanded")).toBe("false");
    expect(note()?.hidden ?? true).toBe(true);
    dots.focus();
    await act(async () => dots.click());
    expect(dots.getAttribute("aria-expanded")).toBe("true");
    expect(note()!.hidden).toBe(false);
    expect(note()!.textContent).toBe("A point being argued on this path. You can read it once it is checked.");
    expect(document.activeElement).toBe(dots);
  });

  it("a path with no step yet says 'Looking into it' alone; while the run waits nothing pulses and the steps and dots stay", () => {
    const working = dom(<V4MapTree {...pieces(running(), { running: true })} />);
    const b3 = card(working, "b3");
    expect(b3.textContent).toContain("Looking into it");
    expect(b3.querySelector(".v4PathStep")).toBeNull();
    expect(b3.querySelector(".v4PathDotsBtn")).toBeNull();
    const waiting = dom(<V4MapTree {...pieces(running(), { running: false })} />);
    const b1 = card(waiting, "b1");
    expect(b1.className).not.toMatch(/Pulse/u);
    expect(b1.querySelector("[class*='Pulse']")).toBeNull();
    expect(b1.classList.contains(LOOKING_CLASS)).toBe(true);
    expect(b1.querySelector(".v4PathStep")!.textContent).toBe(card(working, "b1").querySelector(".v4PathStep")!.textContent);
    expect(b1.querySelectorAll(".v4PathDot")).toHaveLength(6);
  });

  it("a path that filled in early shows its bar, its trust word and its answer so far in the settled look", () => {
    const b2 = card(dom(<V4MapTree {...pieces(running(), { running: true })} />), "b2");
    expect(b2.querySelector(".v4Bar")).not.toBeNull();
    expect(b2.querySelector('[role="img"]')!.getAttribute("aria-label")).toContain("How sure: Sure");
    expect(b2.textContent).toContain("Line b2.");
    expect(b2.classList.contains(SETTLED_CLASS)).toBe(true);
    expect(b2.classList.contains(LOOKING_CLASS)).toBe(false);
  });

  it("the question's card has no bar and no open-questions chip, and what the page adds sits right under it, never inside", () => {
    const root = dom(<V4MapTree {...pieces(running(), { running: true, rootExtra: <p className="extraForTest">Extra</p> })} />);
    const question = root.querySelector<HTMLElement>(".v4MapRoot")!;
    expect(question.querySelector(".v4Bar")).toBeNull();
    expect(root.querySelector(".v4MapRootChip")).toBeNull();
    expect(root.textContent).not.toContain(t(catalog, "v4.map.openCount", { count: 0 }).replace("0", ""));
    const extra = root.querySelector(".extraForTest")!;
    expect(question.contains(extra)).toBe(false);
    expect(question.nextElementSibling!.contains(extra)).toBe(true);
    // The path column's head says the AIs are at work.
    expect(root.querySelector(".v4MapHeads")!.textContent).toContain("What the AIs are looking into");
  });

  it("a path's panel while it is looked into: what it asks, then where its findings will show; no dig button", () => {
    const root = dom(panelNode(running(), "path:b1"));
    const looking = "The AIs are looking into: Whole-system costs. Findings show here once they pass their checks.";
    const at = order(root, ["What this asks", "What it brings together", looking]);
    expect(at.every((position) => position >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(root.querySelector(".v4PanelDigBtn")).toBeNull();
    expect(root.textContent).not.toContain(t(catalog, "v4.panel.dig"));
  });

  it("a path that filled in lists its findings in the trust groups, still with no dig button", () => {
    const root = dom(panelNode(running(), "path:b2"));
    expect(root.querySelector(".v4PanelGroupSURE")!.textContent).toContain("A made-up finding about the costs.");
    expect(root.textContent).toContain("The answer here so far");
    expect(order(root, ["What this asks", "The answer here so far"])[0]).toBeLessThan(order(root, ["The answer here so far"])[0]!);
    expect(root.querySelector(".v4PanelDigBtn")).toBeNull();
  });

  it("'+ 2 more to explore' opens during the wait, says digging opens once the answer is ready, and offers no dig", async () => {
    const root = await mount(<MapAndPanel map={running()} onDigMore={noop} />);
    const more = [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "+ 2 more to explore")!;
    await act(async () => more.click());
    const panel = root.querySelector<HTMLElement>(".v4Panel")!;
    expect(panel.textContent).toContain("You can dig into these once your answer is ready.");
    expect(panel.textContent).not.toContain("Dig into this");
  });

  it("the outline's rows while the AIs work: the title, the step line and the dots", () => {
    const root = dom(<V4Outline {...pieces(running(), { running: true })} />);
    const b1 = card(root, "b1");
    expect(b1.textContent).toContain(T1);
    expect(b1.querySelector(".v4PathStep")!.textContent).toBe("Arguing for and against");
    expect(b1.querySelectorAll(".v4PathDot")).toHaveLength(6);
    expect(b1.querySelector("button button")).toBeNull();
  });

  it("one card for the wait and the answer: a compact row is the same card", () => {
    const path = running().paths[0]!;
    const row = dom(<V4PathCard path={path} selected={false} changed={false} phase="RUN" running compact onSelect={noop} catalog={catalog} locale="en" />);
    expect(row.querySelector("[data-path-card='b1']")!.classList.contains(LOOKING_CLASS)).toBe(true);
    expect(row.querySelector(".v4PathStep")!.textContent).toBe("Arguing for and against");
  });

  it("a map with no path draws no path column (map-f4), and nothing while the AIs still choose the paths", () => {
    const answer = buildV4Map({ runId: "run-1", answer: STORY_FIXTURE_ANSWER, story: storyFixture("UNAVAILABLE") });
    expect(answer.paths).toEqual([]);
    const tree = dom(<V4MapTree {...pieces(answer)} />);
    expect(tree.querySelector(".v4MapBranches")).toBeNull();
    expect(tree.querySelector(".v4MapPath")).toBeNull();
    expect(tree.querySelector(".v4MapHeads")!.textContent).toBe(t(catalog, "v4.map.colQuestion"));
    const choosing = buildV4RunMap({ runId: "run-1", run: RunProjectionSchema.parse({
      run_ref: "run-1", question_line: Q, state: "RUNNING", terminal_reason: null, hold_until: null, path_progress: [] }) })!;
    const wait = dom(<V4MapTree {...pieces(choosing, { running: true })} />);
    expect(wait.querySelector(".v4MapBranches")).toBeNull();
    expect(wait.querySelector(".v4MapEmpty")).toBeNull();
    expect(wait.querySelector(".v4MapHeads")!.textContent).toBe(t(catalog, "v4.map.colQuestion"));
  });
});

describe("the carry-on line (wait-f16)", () => {
  const steps = (root: HTMLElement): string => root.querySelector(".v4CarryOnSteps")!.textContent ?? "";
  const current = (root: HTMLElement): string[] => [...root.querySelectorAll('[aria-current="step"]')].map((element) => element.textContent ?? "");

  it("says which part runs, the rest in grey, and that there is nothing to do", () => {
    const paid = dom(<V4CarryOnLine part="DIGS" free={false} catalog={catalog} />);
    expect(steps(paid)).toBe("Your answer · then a dig on each path · then your report");
    expect(paid.textContent).toContain("Nothing to do: your report will be ready by itself.");
    expect(current(paid)).toEqual(["then a dig on each path"]);
    expect(steps(dom(<V4CarryOnLine part="DIGS" free catalog={catalog} />))).toBe("Your answer · then one dig · then your report");
    expect(current(dom(<V4CarryOnLine part="ANSWER" free={false} catalog={catalog} />))).toEqual(["Your answer"]);
    expect(current(dom(<V4CarryOnLine part="REPORT" free={false} catalog={catalog} />))).toEqual(["then your report"]);
  });

  it("shows only once carry-on is built, on a map whose box was ticked, with a part from the server", () => {
    const map = served();
    expect(map.carryOnToReport).toBe(true);
    const line = (input: V4Map, part: "ANSWER" | null) => dom(<V4MapCarryOnLine map={input} part={part} free={false} catalog={catalog} />);
    expect(line(map, "ANSWER").querySelector(".v4CarryOn")).toBeNull();
    carry.built = true;
    expect(current(line(map, "ANSWER"))).toEqual(["Your answer"]);
    expect(line(served({ carry_on_to_report: false }), "ANSWER").querySelector(".v4CarryOn")).toBeNull();
    expect(line(map, null).querySelector(".v4CarryOn")).toBeNull();
  });
});

describe("motion", () => {
  it("under reduced motion the dot ring and the pulse stand still (v4-map.css)", () => {
    const text = css("v4-map.css");
    const blocks: string[] = [];
    for (let at = text.indexOf("@media (prefers-reduced-motion: reduce)"); at >= 0; at = text.indexOf("@media (prefers-reduced-motion: reduce)", at + 1)) {
      let depth = 0;
      let end = text.indexOf("{", at);
      for (let i = end; i < text.length; i += 1) {
        if (text[i] === "{") depth += 1;
        if (text[i] === "}") depth -= 1;
        if (depth === 0) { end = i; break; }
      }
      blocks.push(text.slice(at, end + 1));
    }
    const block = blocks.find((candidate) => candidate.includes(".v4PathDotRing") && candidate.includes(".v4PathPulse"));
    expect(block).toBeDefined();
    expect(block).toMatch(/\.v4PathDotRing[^{]*\{[^}]*animation:\s*none/u);
    expect(block).toMatch(/\.v4PathPulse[^{]*\{[^}]*animation:\s*none/u);
  });
});
