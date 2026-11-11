import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { levelHref, parseReadingLevel } from "../../apps/ui/lib/v4/storage.js";

/*
 * V4 initial, fix wave 1 (Decision A): V4 stores nothing in the browser. The reading level lives in the page address
 * (`?level=`), is checked when read, and every V4 link carries it.
 */

const here = dirname(fileURLToPath(import.meta.url));

describe("parseReadingLevel", () => {
  it("accepts the three levels only", () => {
    expect(parseReadingLevel("plain")).toBe("plain");
    expect(parseReadingLevel("background")).toBe("background");
    expect(parseReadingLevel("expert")).toBe("expert");
    for (const value of [undefined, null, "", "Plain", "basic", 1, {}, ["nope"]]) expect(parseReadingLevel(value)).toBeNull();
  });

  it("reads the first value when the address repeats the parameter", () => {
    expect(parseReadingLevel(["expert", "plain"])).toBe("expert");
  });
});

describe("levelHref", () => {
  it("adds the level to a plain path", () => {
    expect(levelHref("/v4/debate/run-1", "plain")).toBe("/v4/debate/run-1?level=plain");
  });

  it("keeps other parameters and the #part, and replaces an older level", () => {
    expect(levelHref("/v4?topic=nuclear%20power#recent", "expert")).toBe("/v4?topic=nuclear+power&level=expert#recent");
    expect(levelHref("/v4/debate/run-1?level=plain&x=1", "background")).toBe("/v4/debate/run-1?level=background&x=1");
  });

  it("leaves the path as it is when no level is chosen", () => {
    expect(levelHref("/v4/debate/run-1?x=1", null)).toBe("/v4/debate/run-1?x=1");
    expect(levelHref("/v4", "loud" as never)).toBe("/v4");
  });
});

describe("no browser storage (Decision A, S01-R17)", () => {
  it("lib/v4 never writes browser storage or cookies", () => {
    for (const file of ["storage.ts", "digIndex.ts", "askText.ts", "askConfig.ts", "useV4Ask.tsx", "trust.ts", "web.ts",
      // Perplexity plan W3-4: choosing what to dig and the money lines keep nothing in the browser either.
      "suggestions.ts", "money.ts",
      // Dig model revision W4-6: the rewrites, the dig trail and the news of a finished rewrite keep nothing in the browser.
      "mapModel.ts", "changes.ts", "load.ts", "types.ts",
      // The owner's screen review (3 Nov): the "Your maps" shelf keeps its dig links in memory only.
      "mapShelf.ts",
      // Wave 2 (dig-f4, dig-f9): where picks are dug, and the queue that runs a dig's checks at its click, keep nothing in the
      // browser.
      "digDock.ts", "useDigQueue.tsx",
      // The wave-2 review fixes (4 Nov): the one click-time check a map dig and a public page's dig share keeps nothing either.
      "useDigClickCheck.ts",
      // V4 start step, Task 79: a dig's path plan (its picks as paths) keeps nothing in the browser.
      "digPathPlan.ts"]) {
      const source = readFileSync(resolve(here, "../../apps/ui/lib/v4", file), "utf8");
      expect(source, file).not.toMatch(/\.setItem\(|localStorage|sessionStorage|document\.cookie/);
    }
  });

  it("the V4 map pieces that hold the dig choice and the rewrites never write browser storage or cookies (W3-4, W4-6)", () => {
    for (const file of ["V4DigSuggest.tsx", "V4DebateClient.tsx", "V4MapTree.tsx", "V4Outline.tsx", "V4Panel.tsx", "V4Rail.tsx", "V4AskClient.tsx",
      // W4-6: a path's rewrites, the top of the map, a dig's trail and the news bar.
      "V4PathRewrite.tsx", "V4LevelTrail.tsx", "V4ChangesBar.tsx", "V4Header.tsx",
      // The owner's screen review (3 Nov): the report page, its own header and Share keep nothing in the browser either.
      "V4ReportClient.tsx", "V4ReportHeader.tsx",
      // The owner's screen review (3 Nov): the ask page's session, the seed of the map, "Your maps" and "All my maps".
      "V4AskGate.tsx", "V4MapSeed.tsx", "V4MapShelf.tsx", "V4AllMaps.tsx",
      // ask-d6 A / journey-f18: the header's account menu (the language and the mode are the site's existing choices, changed
      // by the site's own LanguageSwitcher and ModeToggle) and the one step marker.
      "V4AccountMenu.tsx", "V4Steps.tsx",
      // Wave 2 (dig-f4): the docked tray and the phone's list of picks.
      "V4DigTray.tsx",
      // V4 start step, Task 79: a dig's path rows and their combine calls.
      "V4DigPaths.tsx"]) {
      const source = readFileSync(resolve(here, "../../apps/ui/components/v4", file), "utf8");
      expect(source, file).not.toMatch(/\.setItem\(|localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
  });

  it("no file of the V4 pages writes browser storage or cookies (every file, not a hand-kept list: the review of 4 Nov)", () => {
    const roots = ["lib/v4", "components/v4", "app/v4"].map((folder) => resolve(here, "../../apps/ui", folder));
    const files = roots.flatMap((root) => readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((name) => /\.(ts|tsx|js|mjs)$/u.test(name))
      .map((name) => resolve(root, name)));
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\.setItem\(|localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
  });
});

/**
 * V4 start step, Task 82 (owner answer Q3 A: the words, and after Start the debate's id, live in this tab's history entry, never in a
 * cookie or site storage): every shipped file the start step added to the V4 pages, the saved questions' included.
 * apps/ui/scripts/no-hardcoded-english.test.mjs scans the same files for hard-coded English.
 */
const START_STEP_FILES: readonly string[] = [
  // Tasks 72-75: the choosing card's seven V4Start* pieces.
  "components/v4/V4StartBar.tsx", "components/v4/V4StartCard.tsx", "components/v4/V4StartCombineBar.tsx", "components/v4/V4StartMore.tsx",
  "components/v4/V4StartRow.tsx", "components/v4/V4StartSuggest.tsx", "components/v4/V4StartWays.tsx",
  // Task 62: the paths under the map's first card. Task 79: a dig's paths and their plan.
  "components/v4/V4RunPaths.tsx", "components/v4/V4DigPaths.tsx", "lib/v4/digPathPlan.ts",
  // Tasks 64, 70, 76g, 76c and 76b, and Task 76e's update banner (owner answer Q8).
  "lib/v4/pathPlan.ts", "lib/v4/useStartPaths.ts", "lib/v4/questionBox.ts", "lib/v4/askHistory.ts", "lib/v4/startUndo.ts",
  "lib/v4/siteVersion.ts",
  // 4 Nov night: the saved questions and the kept step 2 (Tasks 76f and 76e), the clarifying questions (Task 76h), the map before the
  // first read and the hand-over (Tasks 76b and 76i), the fold (Task 76b) and the report's paths (Task 55c).
  "lib/v4/savedQuestion.ts", "lib/v4/useSavedQuestion.ts", "lib/v4/startKept.ts", "components/v4/V4NotStarted.tsx",
  "components/v4/V4AskQuestions.tsx", "lib/v4/clarifyWait.ts", "components/v4/V4PendingMap.tsx", "lib/v4/startHandOff.ts",
  "lib/v4/foldMove.ts", "lib/v4/reportPaths.ts",
  // Found by Task 82 among the files this branch added: the carry-on switch (Task 56), the site's country first (Task 76d), a dig's
  // failed page reading its map (Task 76j) and the stopped page's "Continue where it stopped" (Task 57g).
  "lib/v4/carryOn.ts", "lib/v4/clarifyPlace.ts", "lib/v4/useParentDigRetry.ts", "components/v4/useStoppedContinue.tsx"
];
const ui = resolve(here, "../../apps/ui");
const BROWSER_STORAGE = /\.setItem\(|localStorage|sessionStorage|indexedDB|document\.cookie/u;
/** A write to this tab's history entry, and one that keeps something in the entry's state (anything but `null`). */
const HISTORY_WRITE = /\bhistory\.(?:pushState|replaceState)\s*\(/u;
const HISTORY_STATE_WRITE = /\bhistory\.(?:pushState|replaceState)\s*\(\s*(?!null\s*,)/u;
/** The two files that keep the ask page's words, a saved question's id and a started question's debate in the entry. */
const HISTORY_KEEPERS: readonly string[] = ["lib/v4/askHistory.ts", "components/v4/V4AskClient.tsx"];

describe("V4 start step, Task 82: the start step keeps nothing in the browser but this tab's history entry", () => {
  const source = (path: string): string => readFileSync(resolve(ui, path), "utf8");

  it("none of the start step's files writes browser storage or cookies, the saved questions' included", () => {
    expect(START_STEP_FILES.filter((path) => BROWSER_STORAGE.test(source(path)))).toEqual([]);
  });

  it("among the start step's files, only askHistory.ts and V4AskClient.tsx write this tab's history", () => {
    const writers = [...START_STEP_FILES, "components/v4/V4AskClient.tsx"].filter((path) => HISTORY_WRITE.test(source(path)));
    // The ask page does write its entry (step 2, a started question), so the check reads real calls.
    expect(writers).toContain("components/v4/V4AskClient.tsx");
    expect(writers.filter((path) => !HISTORY_KEEPERS.includes(path))).toEqual([]);
  });

  it("no other V4 file keeps anything in the tab's history entry: elsewhere a write changes the address alone (state null)", () => {
    // The reading level, a question's address, the report page and a public page write their address with a null state.
    const files = ["lib/v4", "components/v4", "app/v4"].flatMap((folder) => readdirSync(resolve(ui, folder), { recursive: true, encoding: "utf8" })
      .filter((name) => /\.(ts|tsx|js|mjs)$/u.test(name))
      .map((name) => `${folder}/${name}`));
    const keepers = files.filter((path) => HISTORY_STATE_WRITE.test(source(path)));
    expect(keepers).toContain("components/v4/V4AskClient.tsx");
    expect(keepers.filter((path) => !HISTORY_KEEPERS.includes(path))).toEqual([]);
  });
});
