import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The legal tests read the Terms of Service and the Privacy Policy as they are now (tests/support/legalText.ts).
 *
 * They once read each text through a chain of helpers, one per version, each turning the newer text back into the
 * older one so that the older version's checks kept passing. Every new version then needed a file of "undo" pairs for
 * 35 languages and an edit in every older version's test: 19 new lines of English took 1,840 lines of test changes.
 * The released texts need no such proof: the archive keeps each one byte for byte under its sha256.
 *
 * So a check of a wording that is gone is deleted with the wording, and nothing here may bring the chain back.
 */

const tests = resolve(process.cwd(), "tests");
const sources = (["unit", "render", "architecture", "integration", "support"] as const).flatMap((folder) =>
  readdirSync(resolve(tests, folder), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/u.test(entry.name))
    .map((entry) => `${folder}/${entry.name}`));

describe("the legal tests read the text as it is", () => {
  it("keeps no file of undo pairs beside the test helpers", () => {
    expect(readdirSync(resolve(tests, "support")).filter((name) => /^legal.*\.json$/u.test(name))).toEqual([]);
  });

  it("has no helper that turns a legal text back into an older version", () => {
    const self = "unit/legal-tests-read-the-text-as-it-is.test.ts";
    const undo = /\bwithout(Reset|Privacy|Terms|Release|SignIn)\w*\s*\(|\b(RESET|PRIVACY|TERMS)_\d+_SWAPS\b/u;
    const found = sources.filter((file) => file !== self && undo.test(readFileSync(resolve(tests, file), "utf8")));
    expect(found, "read the text with tests/support/legalText.ts; delete a check whose wording is gone").toEqual([]);
  });

  it("names no legal test helper after a version", () => {
    expect(readdirSync(resolve(tests, "support")).filter((name) => /^legal[A-Za-z]*\d/u.test(name))).toEqual([]);
  });
});
