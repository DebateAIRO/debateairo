/**
 * Who a breach notice goes to (docs/operations/breach-runbook.md part 6).
 *
 * The command starts from the ACCOUNTS LIST: one account a line, `<account id>|<country>|<US state>`, with `-` where
 * nothing was declared. The runbook's BREACHLIST step writes it on the server, as the database's own administrator.
 * It is a file, not a query of this command's, on purpose: the country a person declared at sign-up is readable by no
 * login of the API, and a command that runs only on the day of a breach is no reason to change that.
 *
 * From the list the owner chooses: all accounts; or the accounts of some countries and US states, with or without
 * those that declared no country (accounts made before sign-up asked); or the accounts named in a file of ids.
 *
 * A refusal names a line number or a code typed on the command line. It never repeats a line of a file.
 */
import { BreachNoticeRefusal } from "./text.js";

export type ListedAccount = Readonly<{ userId: string; country: string | null; usState: string | null }>;

export type BreachNoticeSelector = Readonly<{
  all: boolean;
  countries: readonly string[];
  usStates: readonly string[];
  /** Also the accounts that declared no country. */
  undeclared: boolean;
  /** Account ids from the owner's file, or null when the choice is not by id. */
  ids: readonly string[] | null;
}>;

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CODE = /^[A-Z]{2}$/u;
const NOTHING = "-";
export const NONE_DECLARED = "none declared";

const lineInvalid = (code: string, file: string, line: number): BreachNoticeRefusal =>
  new BreachNoticeRefusal(code, `line ${String(line)} of ${file} is not in the expected form`);

export function parseAccountList(raw: string): readonly ListedAccount[] {
  const lines = raw.replaceAll("\r\n", "\n").replace(/\n+$/u, "").split("\n");
  if (lines.length === 1 && lines[0] === "") throw new BreachNoticeRefusal("BREACH_NOTICE_ACCOUNTS_EMPTY", "the accounts list is empty");
  const seen = new Set<string>();
  return Object.freeze(lines.map((line, index) => {
    const fields = line.split("|");
    const [userId, country, usState] = fields;
    const stateDeclared = usState !== NOTHING;
    if (fields.length !== 3 || userId === undefined || country === undefined || usState === undefined || !ACCOUNT_ID.test(userId)
      || (country !== NOTHING && !CODE.test(country)) || (stateDeclared && !CODE.test(usState)) || stateDeclared !== (country === "US")) {
      throw lineInvalid("BREACH_NOTICE_ACCOUNTS_LINE_INVALID", "the accounts list", index + 1);
    }
    if (seen.has(userId)) throw new BreachNoticeRefusal("BREACH_NOTICE_ACCOUNTS_DUPLICATE", `line ${String(index + 1)} of the accounts list names an account a second time`);
    seen.add(userId);
    return Object.freeze({ userId, country: country === NOTHING ? null : country, usState: stateDeclared ? usState : null });
  }));
}

/** One account id a line. Empty lines and lines that start with `#` are skipped. */
export function parseIdList(raw: string): readonly string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  raw.replaceAll("\r\n", "\n").split("\n").forEach((line, index) => {
    const value = line.trim();
    if (value === "" || value.startsWith("#")) return;
    if (!ACCOUNT_ID.test(value)) throw lineInvalid("BREACH_NOTICE_IDS_LINE_INVALID", "the file of account ids", index + 1);
    if (seen.has(value)) throw new BreachNoticeRefusal("BREACH_NOTICE_IDS_DUPLICATE", `line ${String(index + 1)} of the file of account ids names an account a second time`);
    seen.add(value);
    ids.push(value);
  });
  if (ids.length === 0) throw new BreachNoticeRefusal("BREACH_NOTICE_IDS_EMPTY", "the file of account ids names no account");
  return Object.freeze(ids);
}

/** The place an account is counted under: its country, `US-<state>` for the United States, or "none declared". */
export function placeOf(account: ListedAccount): string {
  if (account.country === null) return NONE_DECLARED;
  return account.usState === null ? account.country : `${account.country}-${account.usState}`;
}

/** Accounts per place, countries in alphabetical order and "none declared" last. */
export function countByPlace(accounts: readonly ListedAccount[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const account of accounts) counts.set(placeOf(account), (counts.get(placeOf(account)) ?? 0) + 1);
  return new Map([...counts].sort(([left], [right]) => comparePlaces(left, right)));
}

export function comparePlaces(left: string, right: string): number {
  if (left === NONE_DECLARED || right === NONE_DECLARED) return left === right ? 0 : left === NONE_DECLARED ? 1 : -1;
  return left < right ? -1 : left > right ? 1 : 0;
}

const invalid = (detail: string): BreachNoticeRefusal => new BreachNoticeRefusal("BREACH_NOTICE_SELECTION_INVALID", detail);

/**
 * The chosen accounts, in the list's order. Exactly one way of choosing: all; or by place (countries, US states and
 * the undeclared, together); or by id. A country or state that nobody on the list declared is refused as a typing
 * mistake. An id that is not on the list is never written to; `idsNotListed` counts those.
 */
export function selectAccounts(
  list: readonly ListedAccount[], selector: BreachNoticeSelector
): Readonly<{ chosen: readonly ListedAccount[]; idsNotListed: number }> {
  const byPlace = selector.countries.length > 0 || selector.usStates.length > 0 || selector.undeclared;
  const ways = [selector.all, byPlace, selector.ids !== null].filter(Boolean).length;
  if (ways !== 1) throw invalid("choose the accounts in exactly one way: all of them, or by country and US state, or from a file of ids");
  if (selector.all) return Object.freeze({ chosen: list, idsNotListed: 0 });
  if (selector.ids !== null) {
    const wanted = new Set(selector.ids);
    const chosen = list.filter((account) => wanted.has(account.userId));
    return Object.freeze({ chosen: Object.freeze(chosen), idsNotListed: wanted.size - chosen.length });
  }
  for (const country of selector.countries) {
    if (!CODE.test(country) || !list.some((account) => account.country === country)) throw invalid(`no account on the list declared the country ${CODE.test(country) ? country : "typed"}`);
  }
  for (const state of selector.usStates) {
    if (!CODE.test(state) || !list.some((account) => account.usState === state)) throw invalid(`no account on the list declared the US state ${CODE.test(state) ? state : "typed"}`);
  }
  const countries = new Set(selector.countries), states = new Set(selector.usStates);
  return Object.freeze({
    chosen: Object.freeze(list.filter((account) => account.country === null
      ? selector.undeclared
      : countries.has(account.country) || (account.usState !== null && states.has(account.usState)))),
    idsNotListed: 0
  });
}
