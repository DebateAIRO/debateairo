// @vitest-environment jsdom

import { act, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { digTitle, resolveSelection, V4MapTree, type MapPiecesProps } from "../../apps/ui/components/v4/V4MapTree.js";
import { V4Outline } from "../../apps/ui/components/v4/V4Outline.js";
import { V4Panel } from "../../apps/ui/components/v4/V4Panel.js";
import { depthDots, depthOf, swipeTarget } from "../../apps/ui/components/v4/V4MapPlace.js";
import { t } from "../../apps/ui/lib/i18n/translate.js";
import type { DigView, TrustCounts, V4Map, V4OpenQuestion, V4Path, V4Point } from "../../apps/ui/lib/v4/types.js";
import type { PathRewrite } from "../../packages/contract/src/index.js";
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

/*
 * V4 screen review (owner picks of 3 Nov, OWNER-PICKS-2026-11-03.md) on the map pieces:
 *   journey-f2 / map-d5: one look per state (open ground, being looked into, new, settled), the star only on open ground.
 *   r2-20 A / journey-f11 / dig-d4: a path's one trust word, the result tag in place of the "New" dot, the "Holds" seal.
 *   dig-f27: the paths a dig opened, dashed "New · your dig opened this" while that news is unopened.
 *   map-f29 / dig-f20: dig titles in the words of what was dug, marked as AI text only when an AI wrote them.
 *   map-d3: on laptops only the opened path unfolds; the others show the "Open ground" mark.
 *   map-f10: one keyboard stop per map, arrows to move, Space to pick; "+N more" unfolds and reads "Show fewer".
 *   map-f7: the depth dots.
 */

const catalog = v4English as Readonly<Record<string, string>>;
const counts = (sure: number, kase: number, argued: number, fell: number): TrustCounts =>
  ({ SURE: sure, SURE_FOR_CASE: kase, STILL_ARGUED: argued, DIDNT_HOLD: fell });
const point = (id: string, trust: V4Point["trust"]): V4Point =>
  ({ id, text: `Claim ${id}`, trust, basis: null, reasons: [], answeredBy: null, asOf: null });
const open = (id: string, pathId: string | null, star = false, kind: V4OpenQuestion["kind"] = "STILL_ARGUED"): V4OpenQuestion =>
  ({ id, kind, text: `Open question ${id}`, star, pathId });

const FINISHED = "2026-10-30T09:15:00.000Z";
const confirming: PathRewrite = {
  rewrite_id: "rw-a", dig_run_id: "c-a", dig_level: 1, dig_finished_at: FINISHED, state: "READY", rewritten_at: "2026-10-30T09:18:00.000Z",
  changed: false, text: { line: "Mostly renewables: held up. Because.", summary: "S.", fate: "HELD_UP" }, what_changed: ["Nothing moved."],
  fate_before: "HELD_UP", view: null,
  dig_paths: [{ position_ref: "q-1", line: "Storage for a week: still argued. Batteries cover hours.", fate: "PARTLY_HELD" }]
};

function path(id: string, extra: Partial<V4Path> = {}): V4Path {
  return { id, fate: "HELD_UP", line: `Line ${id}: held up. More.`, points: [], counts: counts(1, 2, 0, 0), unchecked: 0, open: [], trust: "SURE_FOR_CASE", ...extra };
}

function buildMap(): V4Map {
  return {
    runId: "run-1", answerId: "a-1", answerVersion: 1, question: "Should we?", headline: "Probably.", summary: "It depends.", confidence: null,
    why: [], sections: [],
    paths: [
      path("a", {
        line: "Mostly renewables: held up. Because.",
        open: [open("p:a1", "a"), open("p:a2", "a"), open("p:a3", "a")],
        rewrites: { original: { line: "Mostly renewables: held up. Because.", fate: "HELD_UP" }, history: [confirming], changedBelow: false }
      }),
      path("b", { open: [open("p:b1", "b", true)], trust: "STILL_ARGUED", counts: counts(0, 0, 2, 0) }),
      path("c", { fate: "FELL", trust: "DIDNT_HOLD", counts: counts(0, 0, 0, 1) })
    ],
    points: [], open: [open("o:0", null, false, "OBJECTION")], counts: counts(1, 2, 2, 1), unchecked: 0, wouldChange: null, wouldChangeAlt: null,
    objections: [], storyState: "READY", fallbackText: null, reservation: false
  };
}

const doneDig: DigView = {
  link: { parentRunId: "run-1", childRunId: "c-a", openQuestionIds: ["path:a"], questions: ["Mostly renewables: held up. Because."], mode: "quick", startedAt: null },
  state: "DONE", headline: null, counts: counts(1, 0, 0, 0), rewrite: confirming, points: [point("d1", "SURE")]
};
const runningDig: DigView = {
  link: { parentRunId: "run-1", childRunId: "c-run", openQuestionIds: ["o:0"], questions: ["Open question o:0"], mode: "quick", startedAt: null },
  state: "RUNNING", headline: null, counts: null
};

const noop = () => {};
function props(extra: Partial<MapPiecesProps> = {}): MapPiecesProps {
  return {
    map: buildMap(), digs: [doneDig, runningDig], selected: "root", changed: new Set(), picked: new Set(), onSelect: noop, onTogglePick: noop,
    catalog, ...extra
  };
}
function dom(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

describe("journey-f2: one look per state", () => {
  it("open ground is hatched with the word \"Open\" and carries the one star; a dig at work is being looked into; the rest is settled", () => {
    const root = dom(renderToStaticMarkup(<V4MapTree {...props()} />));
    const openCards = [...root.querySelectorAll(".v4MapOpen")];
    expect(openCards.length).toBeGreaterThan(0);
    for (const card of openCards) {
      expect(card.classList.contains("v4GroundOPEN")).toBe(true);
      expect(card.querySelector(".v4GroundWord")!.textContent).toBe(t(catalog, "v4.ground.open"));
    }
    // journey-f12: the star's one label, said in words beside the mark.
    const star = root.querySelector(".v4MapOpen .v4MapStar")!.closest(".v4MapOpen")!;
    expect(star.textContent).toContain(t(catalog, "v4.map.starHint"));
    expect(root.querySelectorAll(".v4MapStar[aria-hidden]").length).toBeGreaterThanOrEqual(1);
    expect(root.querySelector(".v4MapDigRUNNING")!.classList.contains("v4GroundLOOKING")).toBe(true);
    expect(root.querySelector(".v4MapDigRUNNING .v4MapNote")!.textContent).toContain(t(catalog, "v4.rewrite.digCard.RUNNING"));
    expect(root.querySelector(".v4MapDigDONE")!.classList.contains("v4GroundSETTLED")).toBe(true);
    for (const card of root.querySelectorAll(".v4MapPath")) expect(card.classList.contains("v4GroundSETTLED")).toBe(true);
    // The legend names every look.
    const legend = root.querySelector(".v4MapLegend")!.textContent;
    for (const key of ["v4.map.legendOpen", "v4.map.legendLooking", "v4.map.legendNew", "v4.map.legendStar"]) expect(legend).toContain(t(catalog, key));
  });
});

describe("r2-20 A / journey-f11 / dig-d4: trust words, result tags and the seal", () => {
  it("each path shows its one trust word and no outcome tag", () => {
    const root = dom(renderToStaticMarkup(<V4MapTree {...props()} />));
    const words = [...root.querySelectorAll(".v4MapPath .v4MapTrust")].map((tag) => tag.textContent);
    expect(words).toEqual([t(catalog, "v4.trust.SURE_FOR_CASE"), t(catalog, "v4.trust.STILL_ARGUED"), t(catalog, "v4.trust.DIDNT_HOLD")]);
    expect(root.querySelector(".v4MapFate")).toBeNull();
    // map-f25: the card titles carry the label, never the outcome clause of the line.
    expect([...root.querySelectorAll(".v4MapPathTitle")].map((title) => title.textContent)).toEqual(["Mostly renewables", "Line b", "Line c"]);
  });

  it("a confirmed path carries its result tag in place of the \"New\" dot while that news is unopened, and its seal", () => {
    const fresh = dom(renderToStaticMarkup(<V4MapTree {...props({ changed: new Set(["path:a"]) })} />));
    const card = fresh.querySelectorAll(".v4MapPath")[0]!;
    expect(card.querySelector(".v4ResultTag")!.textContent).toContain(t(catalog, "v4.result.tag.CONFIRMED"));
    expect(card.querySelector(".v4MapNew")).toBeNull();
    expect(card.querySelector(".v4MapSeal")!.textContent).toContain(t(catalog, "v4.result.holds"));
    // Opened: the tag goes; the seal stays while the path holds.
    const seen = dom(renderToStaticMarkup(<V4MapTree {...props()} />)).querySelectorAll(".v4MapPath")[0]!;
    expect(seen.querySelector(".v4ResultTag")).toBeNull();
    expect(seen.querySelector(".v4MapSeal")).not.toBeNull();
    // The dig's own card says what it found.
    expect(fresh.querySelector(".v4MapDigDONE .v4MapNote")!.textContent).toBe(t(catalog, "v4.result.card.CONFIRMED"));
  });

  it("a card with news plays its one-time reveal", () => {
    const root = dom(renderToStaticMarkup(<V4MapTree {...props({ changed: new Set(["path:a"]), reveal: new Set(["path:a"]) })} />));
    expect(root.querySelectorAll(".v4Reveal")).toHaveLength(1);
    expect(root.querySelectorAll(".v4MapPath")[0]!.classList.contains("v4Reveal")).toBe(true);
  });
});

describe("dig-f27: the paths a dig opened", () => {
  it("sprout under the dig's card, dashed \"New\" while that news is unopened, then plain", () => {
    const fresh = dom(renderToStaticMarkup(<V4MapTree {...props({ changed: new Set(["dig:c-a"]) })} />));
    const sprout = fresh.querySelector<HTMLElement>(".v4MapSprout")!;
    expect(sprout.classList.contains("v4GroundNEW")).toBe(true);
    expect(sprout.querySelector(".v4GroundNewTag")!.textContent).toBe(t(catalog, "v4.ground.new"));
    expect(sprout.querySelector("[data-ai-generated='true']")!.textContent).toBe("Storage for a week");
    const seen = dom(renderToStaticMarkup(<V4MapTree {...props()} />)).querySelector<HTMLElement>(".v4MapSprout")!;
    expect(seen.classList.contains("v4GroundNEW")).toBe(false);
    expect(seen.querySelector(".v4GroundNewTag")).toBeNull();
  });
});

describe("map-f29 / dig-f20: dig titles", () => {
  const map = buildMap();
  it("never the path's own line: a whole-path dig says so in the site's words", () => {
    expect(digTitle(doneDig, catalog, 70, map)).toEqual({ text: t(catalog, "v4.map.digWholePath"), ai: false, more: 0 });
  });

  it("the first pick's own words, marked as AI text only when an AI wrote them", () => {
    const own: DigView = { ...doneDig, picks: [{ text: "My own view.", by: "PERSON_OWN_VIEW" }, { text: "Theirs.", by: "AI_SUGGESTION" }] };
    expect(digTitle(own, catalog, 70, map)).toEqual({ text: "My own view.", ai: false, more: 1 });
    const theirs: DigView = { ...doneDig, picks: [{ text: "Twice the cost of wind?", by: "AI_SUGGESTION" }] };
    expect(digTitle(theirs, catalog, 70, map)).toEqual({ text: "Twice the cost of wind?", ai: true, more: 0 });
    // Found by text, the path's line first: the pick is the title.
    const found: DigView = { ...doneDig, link: { ...doneDig.link, questions: ["Mostly renewables: held up. Because.", "Is storage cheap enough?"] } };
    expect(digTitle(found, catalog, 70, map)).toEqual({ text: "Is storage cheap enough?", ai: true, more: 0 });
    // Started in this visit from the person's own view.
    const mine: DigView = { ...runningDig, link: { ...runningDig.link, questions: ["Pumped hydro could carry it."], firstBy: "PERSON" } };
    expect(digTitle(mine, catalog, 70, map).ai).toBe(false);
    const panel = dom(renderToStaticMarkup(
      <V4Panel map={map} digs={[own]} selected="dig:c-a" readingLevel="plain" picked={new Set()} onTogglePick={noop} onSelect={noop}
        digMode="quick" onDigMode={noop} onDig={noop} digBusy={false} headingRef={createRef<HTMLHeadingElement>()} catalog={catalog} locale="en" />
    ));
    expect(panel.querySelector("h2")!.textContent).toBe("My own view.");
    expect(panel.querySelector("h2")!.hasAttribute("data-ai-generated")).toBe(false);
  });
});

describe("map-d3: laptops fold every path but the opened one", () => {
  it("unfolds the opened path, gives the others the \"Open ground\" mark, and keeps the star in view", () => {
    const root = dom(renderToStaticMarkup(<V4MapTree {...props({ fold: true, selected: "path:a" })} />));
    expect(root.querySelector(".v4Map")!.classList.contains("v4MapFold")).toBe(true);
    const [a, b, c] = [...root.querySelectorAll(".v4MapBranch")];
    expect(a!.querySelector(".v4MapPath")!.getAttribute("aria-expanded")).toBe("true");
    expect(a!.querySelectorAll(".v4MapOpen").length).toBeGreaterThan(0);
    // b is folded: its star (which always shows) stays in view on one line.
    expect(b!.querySelector(".v4MapPath")!.getAttribute("aria-expanded")).toBe("false");
    expect(b!.querySelector(".v4MapLeavesFolded .v4MapStar")).not.toBeNull();
    // c has nothing open: no mark.
    expect(c!.querySelector(".v4MapGroundMark")).toBeNull();
    expect(root.querySelector(".v4MapHeads")!.children).toHaveLength(2);
  });

  it("folds a path whose open questions are not the star behind the mark", () => {
    const map = buildMap();
    const root = dom(renderToStaticMarkup(<V4MapTree {...props({ fold: true, selected: "root", digs: [], map })} />));
    const a = root.querySelectorAll(".v4MapBranch")[0]!;
    expect(a.querySelector(".v4MapOpen")).toBeNull();
    expect(a.querySelector(".v4MapGroundMark")!.textContent).toBe(t(catalog, "v4.map.openGround"));
  });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let mounted: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => mounted?.unmount());
  host?.remove();
  mounted = null;
  host = null;
});
async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  mounted = createRoot(host);
  await act(async () => mounted!.render(node));
  return host;
}
const key = async (target: Element, name: string): Promise<void> => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });
};

describe("map-f10: one keyboard stop, moved with the arrow keys", () => {
  it("the drawn map has one tab stop; Down and Up move between cards; Space ticks the card's pick box", async () => {
    const toggled: string[] = [];
    const root = await mount(<V4MapTree {...props({ digs: [], onTogglePick: (id) => toggled.push(id) })} />);
    const canvas = root.querySelector(".v4MapCanvas")!;
    const stops = [...canvas.querySelectorAll<HTMLElement>("button, a, input")].filter((element) => element.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]!.classList.contains("v4MapRoot")).toBe(true);
    // Every pick box is reached from its card, not by Tab.
    for (const box of canvas.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) expect(box.tabIndex).toBe(-1);
    stops[0]!.focus();
    await key(stops[0]!, "ArrowDown");
    const next = document.activeElement as HTMLElement;
    expect(next).not.toBe(stops[0]);
    expect(next.classList.contains("v4MapOpenMain")).toBe(true);
    expect(next.tabIndex).toBe(0);
    await key(next, " ");
    expect(toggled).toEqual(["o:0"]);
    await key(next, "ArrowUp");
    expect(document.activeElement).toBe(stops[0]);
    // Every card says its level to a screen reader.
    expect(stops[0]!.textContent).toContain(t(catalog, "v4.map.level", { n: 1 }));
  });

  it("\"+N more\" unfolds, then reads \"Show fewer\" and says it is open", async () => {
    const root = await mount(<V4MapTree {...props({ digs: [] })} />);
    const more = [...root.querySelectorAll<HTMLButtonElement>(".v4MapLeafMore .v4MapMore")][0]!;
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await act(async () => more.click());
    const after = [...root.querySelectorAll<HTMLButtonElement>(".v4MapLeafMore .v4MapMore")].find((button) => button.getAttribute("aria-expanded") === "true")!;
    expect(after.textContent).toBe(t(catalog, "v4.map.showFewer"));
  });

  it("the outline folds a path with Left, unfolds it with Right, and keeps \"What the shades mean\" folded at its top", async () => {
    const root = await mount(<V4Outline {...props()} />);
    const shades = root.querySelector<HTMLDetailsElement>("details.v4OutShades")!;
    expect(shades.open).toBe(false);
    expect(shades.querySelector("summary")!.textContent).toBe(t(catalog, "v4.outline.shades"));
    expect(root.querySelector(".v4Out")!.firstElementChild).toBe(shades);
    const pathA = root.querySelector<HTMLButtonElement>(".v4OutPath")!;
    expect(pathA.getAttribute("aria-expanded")).toBe("true");
    pathA.focus();
    await key(pathA, "ArrowLeft");
    expect(root.querySelector(".v4OutPath")!.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector(".v4OutFoldedMark")).not.toBeNull();
    await key(root.querySelector(".v4OutPath")!, "ArrowRight");
    expect(root.querySelector(".v4OutPath")!.getAttribute("aria-expanded")).toBe("true");
    const stops = [...root.querySelectorAll<HTMLElement>(".v4OutTree button, .v4OutTree input")].filter((element) => element.tabIndex === 0);
    expect(stops).toHaveLength(1);
  });
});

describe("map-f7 / map-d3 B: where you are, and the sideways swipe", () => {
  const map = buildMap();
  it("counts the levels of the chain and shortens deep chains to the first, \"…\" and the last three", () => {
    expect(depthOf(resolveSelection(map, [], "root"), map, [])).toEqual({ level: 1, total: 3 });
    expect(depthOf(resolveSelection(map, [], "path:a"), map, [])).toEqual({ level: 2, total: 3 });
    expect(depthOf(resolveSelection(map, [], "open:p:a1"), map, [])).toEqual({ level: 3, total: 3 });
    expect(depthOf(resolveSelection({ ...map, digLevel: 2 }, [], "path:a"), { ...map, digLevel: 2 }, [])).toEqual({ level: 6, total: 7 });
    expect(depthDots(2, 3)).toEqual(["off", "on", "off"]);
    expect(depthDots(6, 7)).toEqual(["off", "gap", "off", "on", "off"]);
  });

  it("moves to the next or the previous first-level path, and back to the question from the first", () => {
    expect(swipeTarget(map, [], "root", 1)).toEqual({ selection: "path:a", n: 1, total: 3 });
    expect(swipeTarget(map, [], "open:p:a1", 1)).toEqual({ selection: "path:b", n: 2, total: 3 });
    expect(swipeTarget(map, [], "path:a", -1)).toEqual({ selection: "root", n: 0, total: 3 });
    expect(swipeTarget(map, [], "path:c", 1)).toBeNull();
    expect(swipeTarget(map, [], "root", -1)).toBeNull();
  });
});

describe("map-d1: the panel of \"Your question\" shows the evidence when the answer stands above the map", () => {
  it("leaves the answer out of the panel, keeping the bar with how sure", () => {
    const render = (answerOnTop: boolean) => dom(renderToStaticMarkup(
      <V4Panel map={buildMap()} digs={[]} selected="root" readingLevel="plain" picked={new Set()} onTogglePick={noop} onSelect={noop}
        digMode="quick" onDigMode={noop} onDig={noop} digBusy={false} answerOnTop={answerOnTop} headingRef={createRef<HTMLHeadingElement>()}
        catalog={catalog} locale="en" />
    ));
    expect(render(false).textContent).toContain("Probably.");
    const evidence = render(true);
    expect(evidence.textContent).not.toContain("Probably.");
    expect(evidence.querySelector(".v4PanelBar .v4BarCounts")).not.toBeNull();
  });

  it("a path's panel says its whole line under the heading, which is its label", () => {
    const panel = dom(renderToStaticMarkup(
      <V4Panel map={buildMap()} digs={[]} selected="path:b" readingLevel="plain" picked={new Set()} onTogglePick={noop} onSelect={noop}
        digMode="quick" onDigMode={noop} onDig={noop} digBusy={false} headingRef={createRef<HTMLHeadingElement>()} catalog={catalog} locale="en" />
    ));
    expect(panel.querySelector("h2")!.textContent).toBe("Line b");
    expect(panel.textContent).toContain("Line b: held up. More.");
    expect(panel.querySelector(".v4MapFate")).toBeNull();
  });
});
