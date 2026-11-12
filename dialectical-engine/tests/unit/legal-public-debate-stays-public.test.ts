import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A person cannot take their own public debate down: only our team can remove one, after it has been flagged. The
 * English Privacy Policy and Terms say so, and no sentence in either says or implies that you can take a published
 * debate down, unpublish it or delete it. (The translations follow before release: English first.)
 */

const read = (name: string): string => readFileSync(resolve(process.cwd(), "apps/ui/legal/en", name), "utf8");
const sentences = (text: string): string[] => text.split("\n").flatMap((line) => line.split(/(?<=[.;])\s+/u));

/** "you can/may" followed, in the same sentence, by taking something down, back or away; asking us to is not that. */
const SELF_REMOVAL = /\byou (?:can|may) (?!ask\b)[^.;]*?\b(?:take (?:it |them )?(?:down|back)|unpublish|delete|remove|withdraw)\b/iu;

describe("a public debate stays public, in the English legal texts", () => {
  it("the Privacy Policy and the Terms still say there is no way to unpublish or delete a public debate", () => {
    expect(read("privacy-policy.md")).toContain("Once a debate is public it stays public. There is no way to unpublish it or delete it.");
    expect(read("terms-of-service.md")).toContain("**No take-back.** Once a debate is public it stays public. You cannot unpublish it or delete it");
  });

  it("no sentence says you can take a published debate down, back or away", () => {
    for (const name of ["privacy-policy.md", "terms-of-service.md"]) {
      const offenders = sentences(read(name)).filter((sentence) => SELF_REMOVAL.test(sentence) && /publi/iu.test(sentence));
      expect(offenders, name).toEqual([]);
    }
    // The control the leftover sentences named is not offered.
    expect(read("terms-of-service.md")).not.toContain("Take down");
  });
});
