import { describe, expect, it } from "vitest";
import { canonicalPreviewBuyerBinding, maskedAddress } from "../../apps/api/src/staff/preview-buyers.js";

/**
 * The preview's approved buyers (0186): how the Owner's list shows an address, and what a proof binds. The shortened
 * address never shows the whole name before the @ and always leaves out at least two of its characters (all of a
 * one-character name): a name of 1 or 2 characters shows only the dots, 3 or 4 keep the first character, and longer names keep a first, a middle and a last
 * piece of 1, 2 or 3 characters by their length, with three dots between them. The domain is shown in full. Every
 * address here is made up.
 */
const local = (shown: string) => shown.slice(0, shown.lastIndexOf("@"));
const kept = (shown: string) => Array.from(local(shown).replaceAll("•••", ""));

describe("maskedAddress", () => {
  it("reads stefan.nour@example.com as ste•••n.n•••our@example.com", () => {
    expect(maskedAddress("stefan.nour@example.com")).toBe("ste•••n.n•••our@example.com");
  });
  it.each([
    // 1 or 2 characters: only the dots.
    [1, "a@example.com", "•••@example.com"],
    [2, "ab@example.com", "•••@example.com"],
    // 3 or 4: the first character and the dots.
    [3, "abc@example.com", "a•••@example.com"],
    [4, "abcd@example.com", "a•••@example.com"],
    // 5 to 7: pieces of 1.
    [5, "abcde@example.com", "a•••d•••e@example.com"],
    [6, "abcdef@example.com", "a•••d•••f@example.com"],
    [7, "abcdefg@example.com", "a•••e•••g@example.com"],
    // 8 to 10: pieces of 2.
    [8, "abcdefgh@example.com", "ab•••de•••gh@example.com"],
    [9, "abcdefghi@example.com", "ab•••ef•••hi@example.com"],
    [10, "abcdefghij@example.com", "ab•••ef•••ij@example.com"],
    // 11 or more: pieces of 3.
    [11, "abcdefghijk@example.com", "abc•••fgh•••ijk@example.com"],
    [12, "abcdefghijkl@example.com", "abc•••fgh•••jkl@example.com"]
  ])("a name of %i characters: %s reads %s", (_length, address, shown) => {
    expect(maskedAddress(address)).toBe(shown);
  });
  it.each([
    ["maria@example.com", "m•••i•••a@example.com"],
    ["anabella@example.org", "an•••be•••la@example.org"],
    ["anna@example.com", "a•••@example.com"],
    ["jo@example.com", "•••@example.com"],
    ["maria.popescu@example.net", "mar•••pop•••scu@example.net"],
    // A long name, and one at the longest a mailbox name may be.
    ["a.very.long.local.part.indeed@mail.example.co.uk", "a.v•••cal•••eed@mail.example.co.uk"],
    [`${"abcdefgh".repeat(8)}@example.com`, "abc•••hab•••fgh@example.com"]
  ])("%s reads %s", (address, shown) => {
    expect(maskedAddress(address)).toBe(shown);
  });
  it("treats dots and plus tags as characters of the name like any other", () => {
    expect(maskedAddress("ana.maria+shop@example.com")).toBe("ana•••ria•••hop@example.com");
    expect(maskedAddress("a.b+c@example.com")).toBe("a•••+•••c@example.com");
    expect(maskedAddress("j.d@example.com")).toBe("j•••@example.com");
    expect(maskedAddress("a+@example.com")).toBe("•••@example.com");
    expect(maskedAddress("+tag@example.com")).toBe("+•••@example.com");
  });
  it("counts characters, not bytes or UTF-16 units: accents, other scripts and emoji", () => {
    // Two characters each, though each takes four or more bytes: only the dots.
    expect(maskedAddress("ăș@exemplu.ro")).toBe("•••@exemplu.ro");
    expect(maskedAddress("ив@пример.рф")).toBe("•••@пример.рф");
    expect(maskedAddress("😀😁@example.com")).toBe("•••@example.com");
    expect(maskedAddress("ă@exemplu.ro")).toBe("•••@exemplu.ro");
    // Three and four characters: the first one.
    expect(maskedAddress("ion@exemplu.ro")).toBe("i•••@exemplu.ro");
    expect(maskedAddress("ăîșț@exemplu.ro")).toBe("ă•••@exemplu.ro");
    expect(maskedAddress("😀😁😂😃@example.com")).toBe("😀•••@example.com");
    // Longer names are cut between characters, never inside one.
    expect(maskedAddress("мария@пример.рф")).toBe("м•••и•••я@пример.рф");
    expect(maskedAddress("😀😁😂😃😄@example.com")).toBe("😀•••😃•••😄@example.com");
    expect(maskedAddress("ștefănescu.ioană@exemplu.ro")).toBe("ște•••scu•••ană@exemplu.ro");
    expect(maskedAddress("пётр.иванов@пример.рф")).toBe("пёт•••ива•••нов@пример.рф");
    // Sub-domains and a domain in another script are shown in full.
    expect(maskedAddress("anabella@mail.eu.example.org")).toBe("an•••be•••la@mail.eu.example.org");
  });
  it("never shows the whole name and leaves out at least two characters (all of a one-character name), at every length and in every script", () => {
    const alphabets = [Array.from("abcdefghijklmnopqrstuvwxyz"), Array.from("ăâîșțабвгдеёжзий"), Array.from("😀😁😂😃😄😅😆😇")];
    for (const alphabet of alphabets) {
      for (let length = 1; length <= 64; length++) {
        const name = Array.from({ length }, (_value, index) => alphabet[index % alphabet.length]).join("");
        const shown = maskedAddress(`${name}@example.com`)!;
        expect(shown.endsWith("@example.com"), `${alphabet[0]} ${length}`).toBe(true);
        expect(length - kept(shown).length, `${alphabet[0]} ${length}`).toBeGreaterThanOrEqual(Math.min(2, length));
        expect(local(shown), `${alphabet[0]} ${length}`).not.toContain(name);
        // The dots stand once for a name of up to 4 characters, twice from 5 on, whatever they leave out.
        expect(local(shown).split("•••"), `${alphabet[0]} ${length}`).toHaveLength(length <= 4 ? 2 : 3);
      }
    }
  });
  it("answers nothing for what is not local@domain", () => {
    for (const odd of ["", "@example.com", "name@", "no-at-sign", "two@at@example.com", "sp ace@example.com", "name@exa mple.com"]) {
      expect(maskedAddress(odd), odd).toBeNull();
    }
  });
});

describe("canonicalPreviewBuyerBinding", () => {
  const user = "4b3c2a10-1111-4222-8333-944455556666", op = "0f1e2d3c-4b5a-4697-8877-665544332211";
  it("binds under the existing action TEAM_GRANT, the account as its target, the revision and the operation", () => {
    const binding = canonicalPreviewBuyerBinding("PREVIEW_BUYER_ADD", user, 7, op);
    expect(binding).toMatchObject({ action: "TEAM_GRANT", targetId: user, expectedRevision: 7, operationId: op });
    expect(binding.bodySha256).toMatch(/^[0-9a-f]{64}$/u);
  });
  it("is stable, and each part moves the body digest: the change, the account, the revision and the operation", () => {
    const base = canonicalPreviewBuyerBinding("PREVIEW_BUYER_ADD", user, 7, op);
    expect(canonicalPreviewBuyerBinding("PREVIEW_BUYER_ADD", user, 7, op)).toEqual(base);
    const others = [canonicalPreviewBuyerBinding("PREVIEW_BUYER_REMOVE", user, 7, op), canonicalPreviewBuyerBinding("PREVIEW_BUYER_ADD", op, 7, op),
      canonicalPreviewBuyerBinding("PREVIEW_BUYER_ADD", user, 8, op), canonicalPreviewBuyerBinding("PREVIEW_BUYER_ADD", user, 7, user)];
    expect(new Set([base, ...others].map((binding) => binding.bodySha256)).size).toBe(5);
  });
  it("carries no address", () => {
    expect(JSON.stringify(canonicalPreviewBuyerBinding("PREVIEW_BUYER_ADD", user, 0, op))).not.toContain("@");
  });
});
