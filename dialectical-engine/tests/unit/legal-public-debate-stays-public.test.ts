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

/**
 * Other people build on a public debate with their own credit, so it stays after its first author closes the account.
 * The English texts say what makes that lawful: the licence outlasts the account and lets others build on the content,
 * nobody owns the page, staying public is a contract term and not a consent a person could withdraw, and the Privacy
 * Policy names a basis for the time after closure, which a person can object to.
 */
describe("a public debate stays after its author leaves, in the English legal texts", () => {
  const terms = read("terms-of-service.md");
  const privacy = read("privacy-policy.md");

  it("the Terms' licence outlasts the account and lets others build on the content", () => {
    expect(terms).toContain("The licence lasts as long as any rights in the content last and continues after you close your account.");
    expect(terms).toContain("to let others build on it — dig into it, add to it and have reports written on it");
    expect(terms).not.toContain("for as long as it remains published");
  });

  it("the Terms say nobody owns the page, and that asking does not make you the author of what the AIs write", () => {
    expect(terms).toContain("Nobody owns the page: a public debate is built by several people and by the AIs.");
    expect(terms).toContain("Nobody, the first author included, can have another person's contribution removed or stop others adding to it, except through the reporting route in section 10.");
    expect(terms).toContain("does not by itself make you the author or the owner of the text the AIs write.");
  });

  it("staying public is a term of the contract, never a consent", () => {
    expect(terms).toContain("This is a term of our contract with you: you accept it when you press Publish or, on the Free plan, when you start the debate.");
    expect(privacy).toContain("That a public debate stays public is a term of our contract with you, not a consent, so it does not end if you change your mind.");
    const publishing = privacy.split("\n").filter((line) => line.startsWith("| Making a debate public"));
    expect(publishing).toHaveLength(1);
    expect(publishing[0]).not.toMatch(/consent/iu);
  });

  it("the Privacy Policy names the basis for keeping the text after closure, and a person can object to it", () => {
    const publishing = privacy.split("\n").find((line) => line.startsWith("| Making a debate public"))!;
    expect(publishing).toContain("**Contract** — Art. 6(1)(b)");
    expect(publishing).toContain("After you close your account, **legitimate interests** — point (f) of the same paragraph");
    expect(publishing).toContain("You may object; section 10");
    const objection = privacy.split("\n").find((line) => line.startsWith("| **Objection** (Art. 21)"))!;
    expect(objection).toContain("This includes our keeping a public debate after you close your account; section 6 says how we decide |");
    expect(privacy).toContain("If a public text contains personal details about you, write to us and we will remove them.");
  });
});
