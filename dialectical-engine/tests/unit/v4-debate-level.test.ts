import { describe, expect, it } from "vitest";

import { loadedLevelOf, publicDebateLevel, readingLevelOf } from "../../apps/ui/lib/v4/debateLevel.js";

/*
 * The owner's level ruling (5 Nov 2026, question 15 and the second round of follow-ups): a debate keeps the reading level it
 * was asked at, for its map, its digs, its report and its public page. The server says that level as `reading_level` on the
 * run read and on the public debate (the start-step session's Tasks 75c and 75d); a debate asked or published before that
 * field has none, and a page reads it as Plain words. The report reads it through the map's own loader, which names it
 * `level` (lib/v4/load.ts on the start-step branch).
 */
describe("the debate's own reading level", () => {
  it("reads the server's reading_level only when it is one of the three levels, never a guess", () => {
    expect(readingLevelOf({ reading_level: "plain" })).toBe("plain");
    expect(readingLevelOf({ reading_level: "background" })).toBe("background");
    expect(readingLevelOf({ reading_level: "expert" })).toBe("expert");
    expect(readingLevelOf({})).toBeNull();
    expect(readingLevelOf({ reading_level: null })).toBeNull();
    expect(readingLevelOf({ reading_level: "EXPERT" })).toBeNull();
    expect(readingLevelOf({ reading_level: 2 })).toBeNull();
  });

  it("a public debate with no level of its own reads as Plain words, as the contract says a page reads one", () => {
    expect(publicDebateLevel({ reading_level: "expert" })).toBe("expert");
    expect(publicDebateLevel({ reading_level: "background" })).toBe("background");
    expect(publicDebateLevel({})).toBe("plain");
    expect(publicDebateLevel({ reading_level: "deep" })).toBe("plain");
  });

  it("the map's loader names the level `level`; with none the page keeps what it had (null)", () => {
    expect(loadedLevelOf({ kind: "SERVED", level: "expert" })).toBe("expert");
    expect(loadedLevelOf({ kind: "SERVED" })).toBeNull();
    expect(loadedLevelOf({ kind: "SERVED", level: "loud" })).toBeNull();
  });
});
