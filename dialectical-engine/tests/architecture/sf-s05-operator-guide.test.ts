import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const guide = readFileSync(resolve("deploy/vps/README.md"), "utf8");

function between(start: string, end: string): string {
  const first = guide.indexOf(start);
  const last = guide.indexOf(end, first + start.length);
  expect(first, `missing start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(last, `missing end: ${end}`).toBeGreaterThan(first);
  return guide.slice(first, last);
}

describe("S05 operator guide", () => {
  it("G1 withdrawal procedure no longer refers to support cases or chat", () => {
    const withdrawal = between("**A withdrawal sent by email or on the model form.**", "**If the person has scheduled their account deletion.**");
    expect(withdrawal).not.toMatch(/support case|support\.\\?"case\\?"|support chat/i);
  });

  it("G2 looks up the owner reference by sending the address on stdin", () => {
    const withdrawal = between("**A withdrawal sent by email or on the model form.**", "**If the person has scheduled their account deletion.**");
    expect(withdrawal).toContain("pnpm billing:withdraw --owner-of-email");
    expect(withdrawal).toMatch(/read -r ADDRESS && printf '%s\\n' "\$ADDRESS" \| .*pnpm billing:withdraw --owner-of-email/);
    expect(withdrawal).toContain("owner_ref: none");
  });

  it("G3 gives the seven post-0126 actions in order", () => {
    const steps = between("**After migration 0126 — once, by V**", "### Staff independent alerts");
    const numbered = [...steps.matchAll(/^\((\d)\) ([^\n]*)/gm)];
    expect(numbered.map((line) => Number(line[1]))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const [index, phrase] of [
      "VACUUM FULL", "rotate the support KEK", "shred its previous copy", "restore drill",
      "each older envelope", "every backup taken before", "go-live record"
    ].entries()) {
      expect(numbered[index]?.[2]).toContain(phrase);
    }
    expect(numbered[0]?.[2]).toContain("CHECKPOINT");
  });

  it("G4 backup explanation no longer says the dump holds support conversations", () => {
    const supportKey = between("The support KEK (`DL2-F5`)", "**What erasure means for a backup.**");
    const erasure = between("**What erasure means for a backup.**", "Retention 14 daily / 8 weekly");
    expect(supportKey).not.toMatch(/restore opens?[^.]*support conversation/i);
    expect(erasure).toContain("A dump taken after migration 0126 holds no support conversations.");
  });

  it("G5 names none of the removed support operator commands", () => {
    expect(guide).not.toMatch(/support:(?:inbox|case|reply|close)\b/);
  });

  it("G6 says migration 0126 empties support tables and revokes INSERT", () => {
    const migration = guide.split("This release adds `migrations/0126_support_answer_scope.sql`")[1]?.slice(0, 700);
    expect(migration).toMatch(/empt(?:y|ies|ied)[^\n]*support tables/i);
    expect(migration).toMatch(/revokes? INSERT/i);
  });

  it("G7 explains that support counts are process memory cleared by restart", () => {
    const unit = between("**Exactly one API unit.**", "---\n\n## 2. Host preparation");
    expect(unit).toMatch(/support[^\n]*counts[^\n]*process(?:'s)? memory/i);
    expect(unit).toMatch(/restart clears them/i);
  });

  it("G8 known limitations no longer says account deletion leaves support conversations", () => {
    const limitations = between("### Known limitations — what this kit and this tree do NOT do yet", "## 11.");
    expect(limitations).not.toMatch(/account deletion[^\n]*support conversations|deleted account[^\n]*support chats/i);
  });
});
