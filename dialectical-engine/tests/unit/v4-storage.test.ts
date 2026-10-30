import { readFileSync } from "node:fs";
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
    for (const file of ["storage.ts", "useReadingLevel.ts", "digIndex.ts", "askText.ts", "askConfig.ts", "useV4Ask.tsx", "trust.ts", "web.ts"]) {
      const source = readFileSync(resolve(here, "../../apps/ui/lib/v4", file), "utf8");
      expect(source, file).not.toMatch(/\.setItem\(|localStorage|sessionStorage|document\.cookie/);
    }
  });
});
