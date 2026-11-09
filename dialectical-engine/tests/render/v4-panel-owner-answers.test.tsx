// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSource } from "../../packages/contract/src/index.js";
import type { V4DigChoice } from "../../apps/ui/components/v4/V4DigSuggest.js";
import { V4Panel } from "../../apps/ui/components/v4/V4Panel.js";
import { V4SourceList } from "../../apps/ui/components/v4/V4Sources.js";
import { formatDate, t } from "../../apps/ui/lib/i18n/translate.js";
import { openPick, pickRefusal } from "../../apps/ui/lib/v4/suggestions.js";
import type {
  ReadingLevel, TrustBasis, TrustCounts, V4DigDraft, V4DigPick, V4Map, V4OpenQuestion, V4Path, V4Point, V4Selection
} from "../../apps/ui/lib/v4/types.js";
import {
  buttonNamed, buttonsNamed, CATALOG, click, mountMap, openPath, panel, PATHS, resetHarness, unmountMap
} from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * V4 start step, Task 76k: the map panel's part of the owner's answers of 5 Nov 2026 (OPEN-OWNER-QUESTIONS-2026-11-04.md,
 * "Your answers (5 Nov 2026)") and item 9 of the review session's wiring list (FOR-START-STEP-2026-11-06-wiring.md):
 *  - question 26 A: "Your question" offers "Go to them · Clear them" beside its line when the picks wait on a path, as
 *    every path does;
 *  - question 27 A: at Plain words too, a point a second AI checked that has no sources gets the folded line "From the
 *    AIs' own knowledge · checked by a second AI ▸", which opens the check line the other levels show;
 *  - questions 4 A and 5 B: the dates under a point (the "as of" date of a dated point, a source page's date) take the long
 *    form with the year, day first in English. English expectations are built day first through formatDate("en", …), and
 *    pinned once in words. Made-up pages and claims only.
 */

const catalog = CATALOG as Readonly<Record<string, string>>;
const noop = () => {};
/** Whether `a` comes before `b` in the page. */
const before = (a: Node, b: Node): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

const counts = (sure: number, kase: number, argued: number, fell: number): TrustCounts =>
  ({ SURE: sure, SURE_FOR_CASE: kase, STILL_ARGUED: argued, DIDNT_HOLD: fell });
const none = counts(0, 0, 0, 0);

const source = (id: string, published: string | null = "2025-06-12"): WebSource => ({
  extract_id: `ex-${id}`, quote: `A made-up line from page ${id}.`, title: `Made-up page ${id}`, site: "grid-costs.example",
  link: `https://grid-costs.example/${id}`, read_depth: "WHOLE", explanation: null, published_on: published
});

/** A checked point with the given basis; the word follows the contract's rule for that basis. */
const point = (id: string, basis: TrustBasis | null, extra: Partial<V4Point> = {}): V4Point => ({
  id,
  text: `Claim ${id}`,
  trust: basis === null ? null
    : basis === "WEB_CHECKED_AND_AGREED" ? "SURE"
      : basis === "DISPUTED" || basis === "COULD_NOT_CHECK" ? "STILL_ARGUED"
        : basis === "FELL" || basis === "ANSWERED" ? "DIDNT_HOLD" : "SURE_FOR_CASE",
  basis,
  reasons: [],
  answeredBy: null,
  asOf: basis === "AGREED_BUT_DATED" ? "2026-10-28T12:00:00.000Z" : null,
  ...extra
});

const open = (id: string, pathId: string | null, star = false): V4OpenQuestion =>
  ({ id, kind: "STILL_ARGUED", text: `Open question ${id}`, star, pathId });

const path = (id: string, extra: Partial<V4Path> = {}): V4Path =>
  ({ id, fate: "HELD_UP", line: `Mostly renewables, path ${id}`, points: [], counts: none, unchecked: 0, open: [], ...extra });

function mapWith(points: readonly V4Point[], extra: Partial<V4Map> = {}): V4Map {
  return {
    runId: "run-1", answerId: "answer-1", answerVersion: 1, question: "Should we do the thing?", headline: "Probably yes",
    summary: "It depends.", confidence: null, why: [], sections: [], paths: [path("b1"), path("b2")], points: [...points], open: [],
    counts: counts(0, points.length, 0, 0), unchecked: 0, wouldChange: null, objections: [], storyState: "READY", fallbackText: null,
    wouldChangeAlt: null, reservation: false, ...extra
  };
}

function choiceFor(draft: V4DigDraft, extra: Partial<V4DigChoice> = {}): V4DigChoice {
  return {
    draft, planTier: "premium", canDig: true, digHereToo: () => false,
    refusalFor: (group) => pickRefusal(draft, group, "premium"),
    onToggleSuggestion: noop, onEditPick: () => null, onAddOwnView: () => null, onRemovePick: noop, onClear: noop, ...extra
  };
}

function element(map: V4Map, selected: V4Selection, level: ReadingLevel, choice?: V4DigChoice, locale = "en") {
  return (
    <V4Panel
      map={map}
      digs={[]}
      selected={selected}
      readingLevel={level}
      picked={new Set()}
      onTogglePick={noop}
      onSelect={noop}
      digMode="quick"
      onDigMode={noop}
      onDig={noop}
      digBusy={false}
      {...(choice === undefined ? {} : { choice })}
      headingRef={createRef<HTMLHeadingElement>()}
      catalog={catalog}
      locale={locale}
    />
  );
}

function render(map: V4Map, selected: V4Selection, level: ReadingLevel, choice?: V4DigChoice, locale = "en"): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(element(map, selected, level, choice, locale));
  return container;
}

let staticRoot: Root | null = null;
let staticHost: HTMLDivElement | null = null;

async function mountPanel(map: V4Map, selected: V4Selection, level: ReadingLevel, choice?: V4DigChoice): Promise<HTMLDivElement> {
  staticHost = document.createElement("div");
  document.body.append(staticHost);
  staticRoot = createRoot(staticHost);
  await act(async () => staticRoot?.render(element(map, selected, level, choice)));
  return staticHost;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  await act(async () => staticRoot?.unmount());
  staticHost?.remove();
  staticRoot = null;
  staticHost = null;
  vi.useRealTimers();
});

describe("question 26 A: 'Your question' offers Go to them · Clear them when the picks wait on a path", () => {
  it("on the map page: beside its line, 'Go to them' opens the path the picks wait on, with the picks kept", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    const pathHeading = panel().querySelector("h2")!.textContent;
    await click(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]")!);
    await click(buttonNamed(CATALOG["v4.panel.crumbRoot"]!, panel()));
    expect(panel().classList.contains("v4Panel-root")).toBe(true);
    const line = panel().querySelector<HTMLElement>(".v4PanelReasonRow .v4PickReason")!;
    expect(line).not.toBeNull();
    const go = buttonsNamed(CATALOG["v4.suggest.goToPicks"]!, panel());
    const clear = buttonsNamed(CATALOG["v4.suggest.clearPicks"]!, panel());
    expect(go).toHaveLength(1);
    expect(clear).toHaveLength(1);
    // Right after the line and before the first greyed box, as on every path (the same words and buttons).
    const firstGreyed = [...panel().querySelectorAll<HTMLInputElement>(".v4PanelOpenRow input[type=checkbox]")].find((box) => box.disabled)!;
    expect(firstGreyed).toBeDefined();
    expect(before(line, go[0]!)).toBe(true);
    expect(before(go[0]!, clear[0]!)).toBe(true);
    expect(before(clear[0]!, firstGreyed)).toBe(true);
    expect(go[0]!.className).toBe("v4Btn");
    await click(go[0]!);
    expect(panel().classList.contains("v4Panel-path")).toBe(true);
    expect(panel().querySelector("h2")!.textContent).toBe(pathHeading);
    expect(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]")!.checked).toBe(true);
  });

  it("on the map page: 'Clear them' clears the picks, so the boxes open again and the line and buttons go", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    await click(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]")!);
    await click(buttonNamed(CATALOG["v4.panel.crumbRoot"]!, panel()));
    await click(buttonNamed(CATALOG["v4.suggest.clearPicks"]!, panel()));
    expect(panel().classList.contains("v4Panel-root")).toBe(true);
    expect(panel().querySelector(".v4PickReason")).toBeNull();
    expect(buttonsNamed(CATALOG["v4.suggest.goToPicks"]!, panel())).toHaveLength(0);
    expect(buttonsNamed(CATALOG["v4.suggest.clearPicks"]!, panel())).toHaveLength(0);
    const boxes = [...panel().querySelectorAll<HTMLInputElement>(".v4PanelOpenRow input[type=checkbox]")];
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.filter((box) => box.disabled)).toEqual([]);
    await openPath(PATHS.renew);
    expect(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]")!.checked).toBe(false);
  });

  it("a path keeps its one 'Go to them', in 'Choose what to dig' (none is added beside its own greyed boxes)", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    await click(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]")!);
    await openPath(PATHS.nuclear);
    expect(panel().classList.contains("v4Panel-path")).toBe(true);
    expect(buttonsNamed(CATALOG["v4.suggest.goToPicks"]!, panel())).toHaveLength(1);
    expect(buttonsNamed(CATALOG["v4.suggest.clearPicks"]!, panel())).toHaveLength(1);
    expect(panel().querySelector(".v4PanelReasonRow button")).toBeNull();
  });

  it("calls the page's own Go and Clear, and offers neither when the picks are on 'Your question' itself", async () => {
    const own = open("o:0", null);
    const starred = open("p:x", "b2", true);
    const map: V4Map = { ...mapWith([]), open: [own], paths: [path("b1"), path("b2", { open: [starred] })] };
    const onGo = vi.fn();
    const onClear = vi.fn();
    const onB2: V4DigDraft = { group: "b2", picks: [openPick(starred)] };
    const host = await mountPanel(map, "root", "plain", choiceFor(onB2, {
      onClear, picksPlace: { title: { text: "Mostly renewables, path b2", ai: true }, onGo }
    }));
    expect(host.querySelector(".v4PanelReasonRow .v4PickReason")!.textContent)
      .toBe(t(catalog, "v4.suggest.picksOn", { path: "Mostly renewables, path b2" }));
    await act(async () => buttonNamed(CATALOG["v4.suggest.goToPicks"]!, host).click());
    expect(onGo).toHaveBeenCalledTimes(1);
    await act(async () => buttonNamed(CATALOG["v4.suggest.clearPicks"]!, host).click());
    expect(onClear).toHaveBeenCalledTimes(1);
    // Picks on "Your question" itself grey the starred question of a path listed there; there is nowhere to go.
    const onRoot: V4DigDraft = { group: null, picks: [openPick(own)] };
    const here = render(map, "root", "plain", choiceFor(onRoot, {
      picksPlace: { title: { text: t(catalog, "v4.nest.trailRoot"), ai: false }, onGo }
    }));
    expect(here.querySelector(".v4PanelReasonRow .v4PickReason")).not.toBeNull();
    expect(buttonsNamed(CATALOG["v4.suggest.goToPicks"]!, here)).toHaveLength(0);
    expect(buttonsNamed(CATALOG["v4.suggest.clearPicks"]!, here)).toHaveLength(0);
  });

  // Independent review (Task 76k): on a path debate "Your question" lists the menu paths left out first ("+ N more", Task 62),
  // and picks waiting on a path grey them too. The line and its two buttons sit right above the first box greyed (dig-f22),
  // once, also when no open question follows them.
  const MORE = (id: string): V4DigPick => ({
    kind: "MORE", key: `more-${id}`, group: null, more: { id, title: `Made-up left-out path ${id}`, question: `Made-up question ${id}?`, isNew: false }
  });
  for (const withOpen of [true, false]) {
    it(`a path debate's "+ N more" rows come first: the line and Go to them · Clear them sit above them (${withOpen ? "with" : "with no"} open question after)`, async () => {
      const starred = open("p:x", "b2", true);
      const map: V4Map = { ...mapWith([]), open: withOpen ? [open("o:0", null)] : [], paths: [path("b1"), path("b2", { open: [starred] })] };
      const onGo = vi.fn();
      const onB2: V4DigDraft = { group: "b2", picks: [openPick(starred)] };
      const host = await mountPanel(map, "root", "plain", choiceFor(onB2, {
        mainQuestionPicks: [MORE("kp06"), MORE("kp07")], onToggleMainPick: noop,
        picksPlace: { title: { text: "Mostly renewables, path b2", ai: true }, onGo }
      }));
      const lines = [...host.querySelectorAll(".v4PickReason")];
      expect(lines).toHaveLength(1);
      const go = buttonsNamed(CATALOG["v4.suggest.goToPicks"]!, host);
      const clear = buttonsNamed(CATALOG["v4.suggest.clearPicks"]!, host);
      expect(go).toHaveLength(1);
      expect(clear).toHaveLength(1);
      const firstGreyed = host.querySelector<HTMLInputElement>(".v4MorePick input[type=checkbox]")!;
      expect(firstGreyed.disabled).toBe(true);
      expect(before(lines[0]!, go[0]!)).toBe(true);
      expect(before(clear[0]!, firstGreyed)).toBe(true);
      await act(async () => go[0]!.click());
      expect(onGo).toHaveBeenCalledTimes(1);
    });
  }
});

describe("question 27 A: at Plain words, a point a second AI checked with no sources gets the own-knowledge line", () => {
  const OWN = (): string => t(catalog, "v4.web.ownKnowledge");

  it("is drafted in the catalogue with the drawn words (the ▸ is the fold's own mark)", () => {
    expect(catalog["v4.web.ownKnowledge"]).toBe("From the AIs' own knowledge · checked by a second AI");
  });

  it("folds the check line under the point, closed, where the other levels show it open", async () => {
    const argued = point("n1", "ARGUED_AND_AGREED");
    const host = await mountPanel(mapWith([argued]), "root", "plain");
    const item = host.querySelector<HTMLElement>(".v4PanelPoint")!;
    const fold = item.querySelector<HTMLDetailsElement>("details.v4SourcesFold")!;
    expect(fold).not.toBeNull();
    expect(fold.open).toBe(false);
    expect(fold.querySelector("summary.v4SourcesFoldLine")!.textContent).toBe(OWN());
    // Nothing of the check line outside the fold at Plain words.
    expect([...item.querySelectorAll(".v4PanelBasis")].filter((line) => fold.contains(line) === false)).toEqual([]);
    await act(async () => {
      fold.open = true;
    });
    expect(fold.querySelector(".v4PanelBasis")!.textContent).toBe(t(catalog, "v4.basis.ARGUED_AND_AGREED"));
    // Some background and Expert keep the check line as it is, with no fold.
    for (const level of ["background", "expert"] as const) {
      const other = render(mapWith([argued]), "root", level);
      expect(other.querySelector(".v4PanelPoint .v4PanelBasis")!.textContent, level).toBe(t(catalog, "v4.basis.ARGUED_AND_AGREED"));
      expect(other.textContent, level).not.toContain(OWN());
    }
  });

  it("only on a point a second AI checked: agreed, dated or disputed; never one it could not check, one that fell, or one with sources", () => {
    const checked = [point("a", "LOOKED_UP_AND_AGREED"), point("b", "ARGUED_AND_AGREED"), point("c", "AGREED_BUT_DATED"), point("d", "DISPUTED")];
    const unchecked = [point("e", "COULD_NOT_CHECK"), point("f", "FELL"), point("g", "ANSWERED")];
    const sourced = [point("h", "WEB_CHECKED_AND_AGREED", { sources: [source("S1")] }), point("i", "ARGUED_AND_AGREED", { sources: [source("S2")] })];
    const root = render(mapWith([...checked, ...unchecked, ...sourced], { counts: counts(1, 4, 2, 2) }), "root", "plain");
    const own = (id: string): HTMLElement | null => {
      const item = [...root.querySelectorAll<HTMLElement>(".v4PanelPoint")].find((li) => li.querySelector(".v4PanelPointText")?.textContent === `Claim ${id}`);
      if (item === undefined) throw new Error(`no point ${id}`);
      return [...item.querySelectorAll<HTMLElement>("summary")].find((summary) => summary.textContent === OWN()) ?? null;
    };
    for (const each of checked) expect(own(each.id), each.id).not.toBeNull();
    for (const each of [...unchecked, ...sourced]) expect(own(each.id), each.id).toBeNull();
    // A point with sources keeps its one sources line at Plain words, and no check line.
    const withSources = [...root.querySelectorAll<HTMLElement>(".v4PanelPoint")].find((li) => li.textContent?.includes("Claim i"))!;
    expect([...withSources.querySelectorAll("summary")].map((summary) => summary.textContent)).toEqual([
      t(catalog, "v4.web.sourcesFrom", { sites: "grid-costs.example" })
    ]);
    expect(withSources.querySelector(".v4PanelBasis")).toBeNull();
    // The disputed point's fold opens on what the second AI said.
    const disputed = own("d")!.closest("details")!;
    expect(disputed.querySelector(".v4PanelBasis")!.textContent).toBe(t(catalog, "v4.basis.DISPUTED"));
  });
});

describe("questions 4 A and 5 B: the dates under a point are long, with the year, day first in English", () => {
  it("a dated point's 'as of' date, at Some background and inside the Plain-words fold", () => {
    const dated = point("n2", "AGREED_BUT_DATED");
    const long = formatDate("en", dated.asOf!, { dateStyle: "long" });
    expect(long).toBe("28 October 2026");
    const expected = t(catalog, "v4.basis.AGREED_BUT_DATED", { date: long });
    const background = render(mapWith([dated]), "root", "background");
    expect(background.querySelector(".v4PanelPoint .v4PanelBasis")!.textContent).toBe(expected);
    const plain = render(mapWith([dated]), "root", "plain");
    expect(plain.querySelector(".v4PanelPoint details .v4PanelBasis")!.textContent).toBe(expected);
    // Another language writes its own long form.
    const german = render(mapWith([dated]), "root", "background", undefined, "de");
    expect(german.querySelector(".v4PanelPoint .v4PanelBasis")!.textContent)
      .toBe(t(catalog, "v4.basis.AGREED_BUT_DATED", { date: formatDate("de", dated.asOf!, { dateStyle: "long" }) }));
  });

  it("a source page's date, read as the calendar day it is (UTC)", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<V4SourceList sources={[source("S3", "2026-10-28")]} catalog={catalog} locale="en" />);
    const time = container.querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe("2026-10-28");
    expect(time.textContent).toBe(formatDate("en", "2026-10-28T00:00:00Z", { dateStyle: "long", timeZone: "UTC" }));
    expect(time.textContent).toBe("28 October 2026");
  });
});

// Independent review (Task 79, wave 16): on a path debate a "+ N more" pick would be one more path of the dig, so a dig already
// at its most paths closes those boxes (V4MorePickRows asks with makesPath). The visible line above them (dig-f22) says the same
// reason, the dig's own ("A dig looks into up to 7 paths. …"), never nothing while the boxes are greyed.
describe("Task 79: the '+ N more' rows of a dig at its most paths say why they are closed", () => {
  const MORE = (id: string): V4DigPick => ({
    kind: "MORE", key: `more-${id}`, group: null, more: { id, title: `Made-up left-out path ${id}`, question: `Made-up question ${id}?`, isNew: false }
  });
  it("the reason line above the greyed '+ N more' boxes is the dig's PATHS_FULL line", async () => {
    const map: V4Map = { ...mapWith([]), open: [], paths: [path("b1"), path("b2")] };
    const draft: V4DigDraft = { group: null, picks: [MORE("kp06")] };
    const host = await mountPanel(map, "root", "plain", choiceFor(draft, {
      refusalFor: (group, makesPath) => pickRefusal(draft, group, "premium") ?? (makesPath === true ? "PATHS_FULL" : null),
      mainQuestionPicks: [MORE("kp06"), MORE("kp07")], onToggleMainPick: noop, pathsParent: true
    }));
    const greyed = [...host.querySelectorAll<HTMLInputElement>(".v4MorePick input[type=checkbox]")].filter((box) => box.disabled);
    expect(greyed).toHaveLength(1);
    const lines = [...host.querySelectorAll<HTMLElement>(".v4PanelReasonRow .v4PickReason")].map((line) => line.textContent);
    expect(lines).toEqual([t(catalog, "v4.digPaths.full")]);
  });
});
