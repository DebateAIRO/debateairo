import { describe, expect, it } from "vitest";
import { BreachNoticeRefusal } from "../../apps/api/src/breach-notice/text.js";
import {
  countByPlace,
  parseAccountList,
  parseIdList,
  placeOf,
  selectAccounts,
  type BreachNoticeSelector
} from "../../apps/api/src/breach-notice/selection.js";

// Who a breach notice goes to (docs/operations/breach-runbook.md part 6). The accounts list is what the runbook's
// BREACHLIST step writes: one account a line, with the country and the US state it declared at sign-up.

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LIST = [
  `${id(1)}|RO|-`,
  `${id(2)}|RO|-`,
  `${id(3)}|KR|-`,
  `${id(4)}|US|NY`,
  `${id(5)}|US|CA`,
  `${id(6)}|-|-`
].join("\n");

const NONE: BreachNoticeSelector = Object.freeze({ all: false, countries: [], usStates: [], undeclared: false, ids: null });
const refusal = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (error instanceof BreachNoticeRefusal) return error.code;
    throw error;
  }
  return "NO_REFUSAL";
};

describe("the accounts list", () => {
  it("reads one account a line, with '-' for nothing declared", () => {
    const accounts = parseAccountList(`${LIST}\n`);
    expect(accounts).toHaveLength(6);
    expect(accounts[3]).toEqual({ userId: id(4), country: "US", usState: "NY" });
    expect(accounts[5]).toEqual({ userId: id(6), country: null, usState: null });
  });

  it.each([
    ["a line that is not an account", `${LIST}\nhello`],
    ["a country that is not two capital letters", `${id(7)}|rou|-`],
    ["a state on a country that is not the United States", `${id(7)}|RO|NY`],
    ["the United States with no state", `${id(7)}|US|-`],
    ["a state that is not two capital letters", `${id(7)}|US|ny`],
    ["a line with a fourth field", `${id(7)}|RO|-|x`],
    ["an account id in capitals", `${id(7).replace("4000", "4AAA")}|RO|-`],
    ["an empty line in the middle", `${id(1)}|RO|-\n\n${id(2)}|RO|-`]
  ])("refuses %s, naming the line and nothing of it", (_name, raw) => {
    expect(refusal(() => parseAccountList(raw))).toBe("BREACH_NOTICE_ACCOUNTS_LINE_INVALID");
  });

  it("refuses the same account twice, and an empty list", () => {
    expect(refusal(() => parseAccountList(`${id(1)}|RO|-\n${id(1)}|RO|-`))).toBe("BREACH_NOTICE_ACCOUNTS_DUPLICATE");
    expect(refusal(() => parseAccountList("\n"))).toBe("BREACH_NOTICE_ACCOUNTS_EMPTY");
  });

  it("a refusal says which line, never what was on it", () => {
    try {
      parseAccountList(`${LIST}\nperson@example.test|RO|-`);
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain("line 7");
      expect((error as Error).message).not.toContain("person@example.test");
    }
  });
});

describe("the file of account ids", () => {
  it("reads one id a line and skips empty lines and # notes", () => {
    expect(parseIdList(`# the affected accounts\n${id(1)}\n\n${id(3)}\n`)).toEqual([id(1), id(3)]);
  });

  it("refuses a line that is not an id, the same id twice and a file with none", () => {
    expect(refusal(() => parseIdList(`${id(1)}\nnot-an-id`))).toBe("BREACH_NOTICE_IDS_LINE_INVALID");
    expect(refusal(() => parseIdList(`${id(1)}\n${id(1)}`))).toBe("BREACH_NOTICE_IDS_DUPLICATE");
    expect(refusal(() => parseIdList("# nothing\n"))).toBe("BREACH_NOTICE_IDS_EMPTY");
  });
});

describe("choosing the accounts", () => {
  const list = parseAccountList(LIST);
  const chosenIds = (selector: BreachNoticeSelector): string[] => selectAccounts(list, selector).chosen.map((account) => account.userId);

  it("all accounts", () => {
    expect(chosenIds({ ...NONE, all: true })).toEqual([id(1), id(2), id(3), id(4), id(5), id(6)]);
  });

  it("by declared country", () => {
    expect(chosenIds({ ...NONE, countries: ["RO"] })).toEqual([id(1), id(2)]);
    expect(chosenIds({ ...NONE, countries: ["KR", "US"] })).toEqual([id(3), id(4), id(5)]);
  });

  it("by US state, and a country together with a state", () => {
    expect(chosenIds({ ...NONE, usStates: ["NY"] })).toEqual([id(4)]);
    expect(chosenIds({ ...NONE, countries: ["KR"], usStates: ["NY"] })).toEqual([id(3), id(4)]);
  });

  it("an account that declared no country is chosen only when asked for", () => {
    expect(chosenIds({ ...NONE, countries: ["RO"], undeclared: true })).toEqual([id(1), id(2), id(6)]);
    expect(chosenIds({ ...NONE, undeclared: true })).toEqual([id(6)]);
  });

  it("from a file of ids: only accounts on the list, and the others are counted", () => {
    const picked = selectAccounts(list, { ...NONE, ids: [id(5), id(1), id(99)] });
    expect(picked.chosen.map((account) => account.userId)).toEqual([id(1), id(5)]);
    expect(picked.idsNotListed).toBe(1);
  });

  it("refuses no choice, two kinds of choice at once, and a country or state nobody on the list declared (a typing mistake)", () => {
    expect(refusal(() => selectAccounts(list, NONE))).toBe("BREACH_NOTICE_SELECTION_INVALID");
    expect(refusal(() => selectAccounts(list, { ...NONE, all: true, countries: ["RO"] }))).toBe("BREACH_NOTICE_SELECTION_INVALID");
    expect(refusal(() => selectAccounts(list, { ...NONE, ids: [id(1)], undeclared: true }))).toBe("BREACH_NOTICE_SELECTION_INVALID");
    expect(refusal(() => selectAccounts(list, { ...NONE, countries: ["XX"] }))).toBe("BREACH_NOTICE_SELECTION_INVALID");
    expect(refusal(() => selectAccounts(list, { ...NONE, usStates: ["ZZ"] }))).toBe("BREACH_NOTICE_SELECTION_INVALID");
  });

  it("counts by country, with the United States by state and the undeclared apart", () => {
    expect(list.map(placeOf)).toEqual(["RO", "RO", "KR", "US-NY", "US-CA", "none declared"]);
    expect([...countByPlace(list)]).toEqual([["KR", 1], ["RO", 2], ["US-CA", 1], ["US-NY", 1], ["none declared", 1]]);
  });
});
