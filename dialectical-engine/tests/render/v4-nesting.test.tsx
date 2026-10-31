// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortText } from "../../apps/ui/components/v4/V4MapTree.js";
import { AnswerSchema, DIG_LEVEL_MAX, type Answer, type PathRewrite } from "../../packages/contract/src/index.js";
import { DEEPEST_DIG, DIG_ANSWERS, DIG_RUNS, PATH_REWRITES } from "../../tools/v4-mock-api/rewrite-seed.js";
import {
  branch, buttonNamed, buttonsNamed, CATALOG, click, harness, mountMap, openPath, page, panel, PATHS, resetHarness, seededAnswer, unmountMap
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
 * Dig model revision W4-6 (draft 5.5, "Nesting"): digs nest to DIG_LEVEL_MAX levels. A dig's own map shows where it sits
 * (the main question, each path dug on the way down, "Level {n} of 10"), every path of the dig with its line and fate and
 * "Dig here too" on each; at the deepest level nothing more can be dug. A path higher up is only marked "A dig further down
 * changed part of this." (owner Q-D5). A dig's own page says what it looked into and the path it rewrote, with a link back,
 * in place of a short answer (owner Q-D13: its points and answer text stay; it writes no story). The dig trail is the mock
 * API's: 1111 (the first debate) → 8888 (level 1) → d200 (level 2) → d300 (level 3), and a dig at level 10.
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
type Ready = Extract<PathRewrite, { state: "READY" }>;
const ready = (rewrite: PathRewrite | null | undefined): Ready => rewrite as Ready;

/** The seeded answer of each run of the dig trail, as the website reads it. */
function trailAnswer(runId: string): Answer {
  const dig = DIG_ANSWERS[runId];
  const rewrites = PATH_REWRITES[runId];
  return AnswerSchema.parse(seededAnswer(runId, { ...(dig === undefined ? {} : { dig }), ...(rewrites === undefined ? {} : { path_rewrites: rewrites }) }));
}

function seedTrail(): void {
  for (const runId of [DIG_RUNS.root, DIG_RUNS.levelOne, DIG_RUNS.levelTwo, DIG_RUNS.levelThree]) harness.ancestors[runId] = trailAnswer(runId);
}

const linkNamed = (name: string, within: ParentNode = page()): HTMLAnchorElement | undefined =>
  [...within.querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.textContent?.replace(/\s+/g, " ").trim() === name);

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("the breadcrumb on a dig's map", () => {
  it("goes from the main question down each dug path, with the level, every part opening that map at that path", async () => {
    seedTrail();
    harness.answer = trailAnswer(DIG_RUNS.levelThree);
    await mountMap(1280, DIG_RUNS.levelThree);
    const trail = page().querySelector<HTMLElement>(".v4Trail")!;
    expect(trail.getAttribute("aria-label")).toBe(CATALOG["v4.nest.trailLabel"]);
    expect(trail.querySelector(".v4TrailLevel")!.textContent).toBe(word("v4.nest.level", { n: 3 }));
    const parts = [...trail.querySelectorAll<HTMLAnchorElement>(".v4TrailParts a")];
    expect(parts.map((part) => part.textContent)).toEqual([
      CATALOG["v4.nest.trailRoot"],
      // 1111's n-renew, as 8888 rewrote it; 8888's n-renew, as d200 rewrote it; d200's own n-nuclear (its rewrite's line).
      shortText(ready(DIG_ANSWERS[DIG_RUNS.levelOne]!.rewrite).text.line, 40),
      shortText(ready(DIG_ANSWERS[DIG_RUNS.levelTwo]!.rewrite).text.line, 40),
      shortText(ready(DIG_ANSWERS[DIG_RUNS.levelTwo]!.rewrite).dig_paths.find((path) => path.position_ref === "n-nuclear")!.line, 40)
    ]);
    expect(parts.map((part) => part.getAttribute("href"))).toEqual([
      `/v4/debate/${DIG_RUNS.root}?level=background`,
      `/v4/debate/${DIG_RUNS.root}?path=n-renew&level=background`,
      `/v4/debate/${DIG_RUNS.levelOne}?path=n-renew&level=background`,
      `/v4/debate/${DIG_RUNS.levelTwo}?path=n-nuclear&level=background`
    ]);
  });

  it("a debate above that cannot be read leaves the level and what is known, never a wrong main question", async () => {
    seedTrail();
    delete harness.ancestors[DIG_RUNS.root];
    harness.answer = trailAnswer(DIG_RUNS.levelThree);
    await mountMap(1280, DIG_RUNS.levelThree);
    const trail = page().querySelector<HTMLElement>(".v4Trail")!;
    expect(trail.textContent).not.toContain(CATALOG["v4.nest.trailRoot"]);
    expect(trail.querySelectorAll(".v4TrailParts a")).toHaveLength(2);
    expect(trail.querySelector(".v4TrailLevel")!.textContent).toBe(word("v4.nest.level", { n: 3 }));
  });

  it("a first debate has no breadcrumb", async () => {
    harness.answer = trailAnswer(DIG_RUNS.root);
    await mountMap(1280, DIG_RUNS.root);
    expect(page().querySelector(".v4Trail")).toBeNull();
  });
});

describe("a dig's own map", () => {
  it("shows every path of the dig with its line and fate, and offers \"Dig here too\" on each", async () => {
    seedTrail();
    harness.answer = trailAnswer(DIG_RUNS.levelOne);
    await mountMap(1280, DIG_RUNS.levelOne);
    const own = ready(DIG_ANSWERS[DIG_RUNS.levelOne]!.rewrite).dig_paths;
    // n-renew of this dig was rewritten in turn by d200 (level 2): it shows that newer text and fate.
    const newer = ready(DIG_ANSWERS[DIG_RUNS.levelTwo]!.rewrite).text;
    const expected = own.map((path) => (path.position_ref === "n-renew" ? { line: newer.line, fate: newer.fate } : path));
    for (const [index, path] of expected.entries()) {
      const card = branch(index).querySelector<HTMLElement>(".v4MapPath")!;
      expect(card.querySelector(".v4MapPathTitle")!.textContent, `path ${index}`).toBe(shortText(path.line));
      expect(card.querySelector(".v4MapFate")!.textContent, `path ${index}`).toBe(CATALOG[`v4.fate.${path.fate}`]);
      expect(buttonsNamed(CATALOG["v4.nest.digHereToo"]!, branch(index)), `path ${index}`).toHaveLength(1);
    }
    expect(page().querySelectorAll(".v4MapBranch")).toHaveLength(own.length);
    // The deeper rewrite's whole text (the card cuts it), and its line on the card.
    expect(branch(PATHS.renew).querySelector(".v4RewriteNoteLine")).not.toBeNull();
    await openPath(PATHS.renew);
    expect(panel().textContent).toContain(newer.line);
    expect(panel().textContent).not.toContain(own[1]!.line);
    // A dig writes no story: nothing on its page waits for one.
    expect(page().textContent).not.toContain(CATALOG["v4.debate.storyWriting"]);
  });

  it("before its rewrite is written, shows the positions it argued, with no fate made up", async () => {
    seedTrail();
    harness.answer = trailAnswer(DIG_RUNS.levelThree);
    await mountMap(1280, DIG_RUNS.levelThree);
    expect(page().querySelectorAll(".v4MapBranch")).toHaveLength(4);
    expect(page().querySelectorAll(".v4MapBranch .v4MapFate")).toHaveLength(0);
    for (const index of Object.values(PATHS)) expect(buttonsNamed(CATALOG["v4.nest.digHereToo"]!, branch(index))).toHaveLength(1);
  });

  it("at level 10 says so, and offers no \"Dig here too\" and no dig anywhere", async () => {
    seedTrail();
    const runId = DEEPEST_DIG.runRef;
    harness.answer = AnswerSchema.parse(seededAnswer(runId, { dig: DEEPEST_DIG.dig }));
    await mountMap(1280, runId);
    expect(page().querySelector(".v4TrailLevel")!.textContent).toBe(word("v4.nest.level", { n: DIG_LEVEL_MAX }));
    expect(page().textContent).toContain(CATALOG["v4.nest.deepest"]);
    expect(buttonsNamed(CATALOG["v4.nest.digHereToo"]!)).toHaveLength(0);
    await openPath(PATHS.renew);
    expect(buttonsNamed(CATALOG["v4.nest.digHereToo"]!)).toHaveLength(0);
    expect(buttonsNamed(CATALOG["v4.panel.dig"]!)).toHaveLength(0);
    expect(panel().textContent).toContain(CATALOG["v4.nest.deepest"]);
  });
});

describe("changed further down (owner Q-D5: marked, never rewritten)", () => {
  /** A rewrite three levels down (d300 of d200's n-nuclear) marks the paths above it at levels 1 and 0. */
  const marked = (runId: string, rewrites: Answer["path_rewrites"]): Answer => AnswerSchema.parse(seededAnswer(runId, { path_rewrites: rewrites }));
  const BELOW_ONLY = { position_ref: "n-smr", current: null, history: [], changed_below: true as const };

  it("three levels up, the path shows the mark on the tree, the outline and the panel", async () => {
    const root = PATH_REWRITES[DIG_RUNS.root]!;
    harness.answer = marked(DIG_RUNS.root, { ...root, paths: [...root.paths.filter((path) => path.position_ref !== "n-smr"), BELOW_ONLY] });
    await mountMap(1280, DIG_RUNS.root);
    // n-renew: rewritten by 8888 and marked; n-smr: only marked (no dig rewrote it).
    expect(branch(PATHS.renew).querySelector(".v4RewriteNoteBelow")!.textContent).toBe(CATALOG["v4.rewrite.changedBelow"]);
    const smr = branch(PATHS.smr).querySelector<HTMLElement>(".v4RewriteNote")!;
    expect(smr.textContent).toBe(CATALOG["v4.rewrite.changedBelow"]);
    // Only marked: the path's own text and fate stay as they were.
    expect(branch(PATHS.smr).querySelector(".v4MapFate")!.textContent).toBe(CATALOG["v4.fate.SET_ASIDE"]);
    await openPath(PATHS.smr);
    expect(panel().querySelector(".v4RewriteBelow")!.textContent).toBe(CATALOG["v4.rewrite.changedBelow"]);
    expect(panel().querySelector(".v4RewriteState")).toBeNull();
    expect(panel().querySelector(".v4RewriteChanged")).toBeNull();
  });

  it("at every level between, too (level 1, phone outline)", async () => {
    const one = PATH_REWRITES[DIG_RUNS.levelOne]!;
    harness.answer = AnswerSchema.parse(seededAnswer(DIG_RUNS.levelOne, {
      dig: DIG_ANSWERS[DIG_RUNS.levelOne], path_rewrites: { ...one, paths: one.paths.map((path) => ({ ...path, changed_below: true as const })) }
    }));
    await mountMap(375, DIG_RUNS.levelOne);
    await click(buttonNamed(CATALOG["v4.debate.mapButton"]!));
    const renew = [...page().querySelectorAll<HTMLButtonElement>(".v4OutPath")][PATHS.renew]!;
    expect(renew.querySelector(".v4RewriteNoteBelow")!.textContent).toBe(CATALOG["v4.rewrite.changedBelow"]);
  });
});

describe("a dig's own page (in place of its short answer)", () => {
  it("says what it looked into and the path it rewrote, links back to that path, and shows its answer text", async () => {
    seedTrail();
    harness.answer = trailAnswer(DIG_RUNS.levelOne);
    await mountMap(1280, DIG_RUNS.levelOne);
    const intro = panel().querySelector<HTMLElement>(".v4DigPage")!;
    const dig = DIG_ANSWERS[DIG_RUNS.levelOne]!;
    expect(intro.textContent).toContain(word("v4.digPage.lookedInto", { picks: "" }).trim());
    expect([...intro.querySelectorAll(".v4DigPagePicks li")].map((item) => item.textContent)).toEqual(dig.picks.map((pick) => pick.text));
    expect(intro.textContent).toContain(word("v4.digPage.rewrote", { line: ready(dig.rewrite).text.line }));
    expect(linkNamed(CATALOG["v4.digPage.backToPath"]!, intro)!.getAttribute("href"))
      .toBe(`/v4/debate/${DIG_RUNS.root}?path=n-renew&level=background`);
    // Its own answer text, as usual; nothing says a short answer is missing or still being written.
    expect(panel().textContent).toContain(harness.answer.composed_text[0]!.text);
    for (const key of ["v4.panel.fallbackMissing", "v4.panel.fallbackWriting", "v4.panel.storyMissing", "v4.panel.storyWriting"]) {
      expect(panel().textContent, key).not.toContain(CATALOG[key]);
    }
  });

  it("while it rewrites the path it came from, says so", async () => {
    seedTrail();
    harness.answer = trailAnswer(DIG_RUNS.levelThree);
    await mountMap(1280, DIG_RUNS.levelThree);
    expect(panel().querySelector(".v4DigPage .v4RewriteState")!.textContent).toBe(CATALOG["v4.digPage.rewriting"]);
  });

  it("the person's own view, quoted, with the verdict, on the dig that carried it", async () => {
    seedTrail();
    harness.answer = AnswerSchema.parse(seededAnswer(DIG_RUNS.ownView, { dig: DIG_ANSWERS[DIG_RUNS.ownView] }));
    await mountMap(1280, DIG_RUNS.ownView);
    expect(panel().querySelector(".v4DigPage .v4RewriteVerdict")!.textContent).toBe(CATALOG["v4.view.HELPED.MAIN_QUESTION"]);
  });

  it("the link back opens the map above at that path", async () => {
    harness.answer = trailAnswer(DIG_RUNS.root);
    await mountMap(1280, DIG_RUNS.root, "n-renew");
    expect(panel().classList.contains("v4Panel-path")).toBe(true);
    expect(panel().querySelector(".v4Rewrite")).not.toBeNull();
  });
});
