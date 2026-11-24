import { describe, expect, it } from "vitest";
import { canonicalPreviewBuyerBinding, maskedAddress } from "../../apps/api/src/staff/preview-buyers.js";

/**
 * The preview's approved buyers (0186): how the Owner's list shows an address, and what a proof binds. The shortened
 * address keeps a first, a middle and a last piece of the name before the @, of 3, 2 or 1 characters by the name's
 * length, with three dots between them whatever is left out, and the domain in full. Every address here is made up.
 */
describe("maskedAddress", () => {
  it("reads stefan.nour@example.com as ste•••n.n•••our@example.com", () => {
    expect(maskedAddress("stefan.nour@example.com")).toBe("ste•••n.n•••our@example.com");
  });
  it.each([
    // Long (11 characters or more): pieces of 3.
    ["abcdefghijk@example.com", "abc•••fgh•••ijk@example.com"],
    ["maria.popescu@example.net", "mar•••pop•••scu@example.net"],
    ["a.very.long.local.part.indeed@mail.example.co.uk", "a.v•••cal•••eed@mail.example.co.uk"],
    // Medium (8 to 10): pieces of 2.
    ["anabella@example.org", "an•••be•••la@example.org"],
    ["abcdefghij@example.com", "ab•••ef•••ij@example.com"],
    // Short (5 to 7): pieces of 1.
    ["maria@example.com", "m•••i•••a@example.com"],
    ["abcdefg@example.com", "a•••e•••g@example.com"],
    // Very short (1 to 4): the first character and the dots.
    ["anna@example.com", "a•••@example.com"],
    ["ab@example.com", "a•••@example.com"],
    ["x@example.com", "x•••@example.com"]
  ])("%s reads %s", (address, shown) => {
    expect(maskedAddress(address)).toBe(shown);
  });
  it("leaves out at least two characters of every name of five or more, and never shows the name's length", () => {
    for (let length = 5; length <= 40; length++) {
      const name = Array.from({ length }, (_value, index) => String.fromCharCode(97 + (index % 26))).join("");
      const shown = maskedAddress(`${name}@example.com`)!;
      const kept = shown.split("@")[0]!.replaceAll("•••", "");
      expect(length - kept.length, `length ${length}`).toBeGreaterThanOrEqual(2);
      expect(shown.split("•••")).toHaveLength(3);
    }
  });
  it("cuts between characters, never inside one: accents, other scripts and emoji", () => {
    expect(maskedAddress("ștefănescu.ioană@exemplu.ro")).toBe("ște•••scu•••ană@exemplu.ro");
    expect(maskedAddress("пётр.иванов@пример.рф")).toBe("пёт•••ива•••нов@пример.рф");
    expect(maskedAddress("😀😁😂😃😄@example.com")).toBe("😀•••😃•••😄@example.com");
    // Sub-domains and a domain in another script are shown in full.
    expect(maskedAddress("anabella@mail.eu.example.org")).toBe("an•••be•••la@mail.eu.example.org");
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
