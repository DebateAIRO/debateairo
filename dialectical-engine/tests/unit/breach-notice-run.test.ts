import { describe, expect, it } from "vitest";
import { MailDeliveryError, type BreachNoticeMail } from "../../apps/api/src/mail-channel.js";
import { parseBreachNoticeText, type BreachNoticeText } from "../../apps/api/src/breach-notice/text.js";
import { parseAccountList, selectAccounts, type BreachNoticeSelector } from "../../apps/api/src/breach-notice/selection.js";
import {
  planBreachNotice,
  renderBreachNoticeLog,
  renderBreachNoticePlan,
  sendBreachNotice,
  stillOwed,
  type AccountFacts,
  type BreachNoticePlan,
  type BreachNoticeSendDependencies
} from "../../apps/api/src/breach-notice/run.js";

// The plan the owner reads before anything is sent, the sending itself, and the log for the breach record's folder
// (docs/operations/breach-runbook.md part 6). Every number here is a made-up test value.

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const text = (language: string, subject: string): BreachNoticeText =>
  parseBreachNoticeText(language, `Subject: ${subject}\n\nWhat happened.\n\nWrite to privacy@dezbatere.ro.`);
const TEXTS = new Map([["en", text("en", "Notice of Data Breach")], ["ro", text("ro", "Notificare")], ["ko", text("ko", "개인정보 유출 통지")]]);
const ALL: BreachNoticeSelector = Object.freeze({ all: true, countries: [], usStates: [], undeclared: false, ids: null });

const LIST = parseAccountList([
  `${id(1)}|RO|-`, `${id(2)}|RO|-`, `${id(3)}|KR|-`, `${id(4)}|US|NY`, `${id(5)}|FI|-`, `${id(6)}|-|-`
].join("\n"));
const FACTS = new Map<string, AccountFacts>([
  [id(1), { state: "active", language: "ro" }],
  [id(2), { state: "suspended", language: "en" }],
  [id(3), { state: "active", language: "ko" }],
  [id(4), { state: "active", language: "en" }],
  [id(5), { state: "active", language: "fi" }],
  [id(6), { state: "active", language: "en" }]
]);

function planOf(options: Readonly<{ englishFallback?: boolean; sent?: readonly string[]; facts?: ReadonlyMap<string, AccountFacts>; texts?: ReadonlyMap<string, BreachNoticeText> }> = {}): BreachNoticePlan {
  const picked = selectAccounts(LIST, ALL);
  return planBreachNotice({
    chosen: picked.chosen, idsNotListed: picked.idsNotListed, facts: options.facts ?? FACTS, texts: options.texts ?? TEXTS,
    englishFallback: options.englishFallback ?? false, alreadySent: new Set(options.sent ?? [])
  });
}

type World = BreachNoticeSendDependencies & {
  mails: BreachNoticeMail[];
  handedOver: { total: number };
  sentIds: Set<string>;
  failNext: string[];
};
function world(options: Readonly<{ dailyLimit?: number; alreadyToday?: number; addresses?: Readonly<Record<string, string | null | Error>> }> = {}): World {
  const mails: BreachNoticeMail[] = [];
  const handedOver = { total: options.alreadyToday ?? 0 };
  const sentIds = new Set<string>();
  const failNext: string[] = [];
  const dailyLimit = options.dailyLimit ?? 1000;
  let tick = 0;
  let uuid = 0;
  return {
    mails, handedOver, sentIds, failNext, dailyLimit,
    accounts: {
      facts: async () => FACTS,
      address: async (userId) => {
        const fixed = options.addresses?.[userId];
        if (fixed instanceof Error) throw fixed;
        return fixed === undefined ? `person-${userId.slice(-2)}@example.test` : fixed;
      }
    },
    mail: {
      sendBreachNotice: async (mail) => {
        // As the gate does: a hand-off is counted before the mail program runs, and refused at the limit.
        if (handedOver.total >= dailyLimit) throw new MailDeliveryError("MAIL_DAILY_LIMIT");
        const failure = failNext.shift();
        if (failure === "SUPPRESSED") return "SUPPRESSED";
        handedOver.total += 1;
        if (failure !== undefined && failure !== "OK") throw new MailDeliveryError(failure);
        mails.push(mail);
        return "SENT";
      }
    },
    room: { today: async () => ({ total: handedOver.total, day: "2026-11-23" }) },
    progress: { has: (userId) => sentIds.has(userId), add: (userId) => { sentIds.add(userId); } },
    texts: TEXTS,
    clock: () => new Date(Date.UTC(2026, 10, 23, 10, 0, tick++)),
    messageId: () => `11111111-1111-4111-8111-${String(++uuid).padStart(12, "0")}`
  };
}

describe("the plan: who gets which text", () => {
  it("gives each account the text of its language, and refuses an account whose language has no text", () => {
    const plan = planOf();
    expect(plan.accounts.map((planned) => [planned.account.userId.slice(-1), planned.decision, planned.language])).toEqual([
      ["1", "SEND", "ro"], ["2", "SEND", "en"], ["3", "SEND", "ko"], ["4", "SEND", "en"], ["5", "NO_TEXT", "fi"], ["6", "SEND", "en"]
    ]);
  });

  it("sends English to such an account only when the owner allowed it", () => {
    expect(planOf({ englishFallback: true }).accounts[4]).toMatchObject({ decision: "SEND_ENGLISH", language: "fi" });
  });

  it("allowing English with no English text changes nothing", () => {
    const texts = new Map([...TEXTS].filter(([language]) => language !== "en"));
    const plan = planOf({ englishFallback: true, texts });
    expect(plan.accounts.map((planned) => planned.decision)).toEqual(["SEND", "NO_TEXT", "SEND", "NO_TEXT", "NO_TEXT", "NO_TEXT"]);
  });

  it("leaves out an account written to in an earlier run, a deleted account and one that no longer exists", () => {
    const facts = new Map(FACTS);
    facts.set(id(2), { state: "deleted", language: "en" });
    facts.delete(id(4));
    const plan = planOf({ sent: [id(1)], facts });
    expect(plan.accounts.map((planned) => planned.decision)).toEqual(["ALREADY_SENT", "ACCOUNT_GONE", "SEND", "ACCOUNT_GONE", "NO_TEXT", "SEND"]);
  });

  it("prints the count per country before anything is sent, the languages, the mail room, and how to send", () => {
    const printed = renderBreachNoticePlan(planOf(), { texts: TEXTS, room: { total: 40, day: "2026-11-23" }, dailyLimit: 1000, leaveRoom: 0, confirm: false });
    expect(printed).toContain("Accounts chosen: 6");
    expect(printed).toMatch(/KR\s+1\s+1/);
    expect(printed).toMatch(/RO\s+2\s+2/);
    expect(printed).toMatch(/US-NY\s+1\s+1/);
    expect(printed).toMatch(/FI\s+1\s+0/);
    expect(printed).toMatch(/none declared\s+1\s+1/);
    expect(printed).toMatch(/fi\s+1\s+no text: not sent/);
    expect(printed).toMatch(/ro\s+1\s+ro\.txt/);
    expect(printed).toContain("To write to: 5");
    expect(printed).toContain("Today's mail limit is 1000; 40 were handed over so far today, so there is room for 960.");
    expect(printed).toContain("Nothing was sent. Run the same command with --confirm to send.");
    expect(printed).not.toMatch(/00000000-0000/);
  });

  it("says so when the notice does not fit in today's mail room, or would use all of it", () => {
    const tight = renderBreachNoticePlan(planOf(), { texts: TEXTS, room: { total: 997, day: "2026-11-23" }, dailyLimit: 1000, leaveRoom: 0, confirm: false });
    expect(tight).toContain("there is room for 3");
    expect(tight).toContain("NOT ALL OF IT FITS TODAY");
    const kept = renderBreachNoticePlan(planOf(), { texts: TEXTS, room: { total: 0, day: "2026-11-23" }, dailyLimit: 1000, leaveRoom: 998, confirm: false });
    expect(kept).toContain("NOT ALL OF IT FITS TODAY");
    const confirmed = renderBreachNoticePlan(planOf(), { texts: TEXTS, room: { total: 0, day: "2026-11-23" }, dailyLimit: 1000, leaveRoom: 0, confirm: true });
    expect(confirmed).not.toContain("Nothing was sent");
  });
});

describe("sending", () => {
  it("writes one mail of its own to each account, in its language, and remembers who was written to", async () => {
    const deps = world();
    const result = await sendBreachNotice(deps, planOf(), { leaveRoom: 0 });
    expect(deps.mails.map((mail) => [mail.to, mail.language, mail.subject])).toEqual([
      ["person-01@example.test", "ro", "Notificare"],
      ["person-02@example.test", "en", "Notice of Data Breach"],
      ["person-03@example.test", "ko", "개인정보 유출 통지"],
      ["person-04@example.test", "en", "Notice of Data Breach"],
      ["person-06@example.test", "en", "Notice of Data Breach"]
    ]);
    expect(new Set(deps.mails.map((mail) => mail.messageId)).size).toBe(5);
    expect([...deps.sentIds].sort()).toEqual([id(1), id(2), id(3), id(4), id(6)]);
    expect(result.outcomes.map((entry) => entry.outcome)).toEqual(["SENT", "SENT", "SENT", "SENT", "NO_TEXT", "SENT"]);
    expect(result.stopped).toBeNull();
  });

  it("the English fallback goes out as English and is counted apart", async () => {
    const deps = world();
    const result = await sendBreachNotice(deps, planOf({ englishFallback: true }), { leaveRoom: 0 });
    expect(deps.mails[4]).toMatchObject({ to: "person-05@example.test", language: "en", subject: "Notice of Data Breach" });
    expect(result.outcomes[4]).toMatchObject({ outcome: "SENT_ENGLISH", language: "fi" });
  });

  it("a second run writes only to those the first did not reach", async () => {
    const deps = world();
    deps.failNext.push("OK", "SENDMAIL_EXIT_1");
    const first = await sendBreachNotice(deps, planOf(), { leaveRoom: 0 });
    expect(first.outcomes[1]).toMatchObject({ outcome: "MAIL_FAILED", code: "SENDMAIL_EXIT_1" });
    expect(deps.mails).toHaveLength(4);
    const second = await sendBreachNotice(deps, planOf({ sent: [...deps.sentIds] }), { leaveRoom: 0 });
    expect(second.outcomes.map((entry) => entry.outcome)).toEqual(["ALREADY_SENT", "SENT", "ALREADY_SENT", "ALREADY_SENT", "NO_TEXT", "ALREADY_SENT"]);
    expect(deps.mails).toHaveLength(5);
  });

  it("stops at the day's mail limit and tries nobody after it", async () => {
    const deps = world({ dailyLimit: 10, alreadyToday: 8 });
    const result = await sendBreachNotice(deps, planOf(), { leaveRoom: 0 });
    expect(result.outcomes.map((entry) => entry.outcome)).toEqual(["SENT", "SENT", "NOT_TRIED", "NOT_TRIED", "NO_TEXT", "NOT_TRIED"]);
    expect(result.stopped).toBe("DAILY_LIMIT");
    expect(deps.handedOver.total).toBe(10);
  });

  it("keeps the room the owner asked to keep for other mail", async () => {
    const deps = world({ dailyLimit: 10, alreadyToday: 5 });
    const result = await sendBreachNotice(deps, planOf(), { leaveRoom: 3 });
    expect(deps.mails).toHaveLength(2);
    expect(deps.handedOver.total).toBe(7);
    expect(result.stopped).toBe("ROOM_KEPT");
  });

  it("stops when the mail program fails five times in a row, so a closed mail road does not use up the day", async () => {
    const list = parseAccountList(Array.from({ length: 9 }, (_, index) => `${id(index + 1)}|RO|-`).join("\n"));
    const facts = new Map(list.map((account) => [account.userId, { state: "active", language: "ro" }]));
    const plan = planBreachNotice({ chosen: list, idsNotListed: 0, facts, texts: TEXTS, englishFallback: false, alreadySent: new Set() });
    const deps = world();
    deps.failNext.push("OK", "SENDMAIL_EXIT_1", "SENDMAIL_EXIT_1", "SENDMAIL_TIMEOUT", "SENDMAIL_EXIT_1", "SENDMAIL_EXIT_1");
    const result = await sendBreachNotice(deps, plan, { leaveRoom: 0 });
    expect(result.outcomes.map((entry) => entry.outcome)).toEqual(["SENT", "MAIL_FAILED", "MAIL_FAILED", "MAIL_FAILED", "MAIL_FAILED", "MAIL_FAILED", "NOT_TRIED", "NOT_TRIED", "NOT_TRIED"]);
    expect(result.stopped).toBe("MAIL_PROGRAM_FAILING");
  });

  it("a failure between two sent mails does not stop the run", async () => {
    const deps = world();
    deps.failNext.push("SENDMAIL_EXIT_1", "OK", "SENDMAIL_EXIT_1", "OK", "SENDMAIL_EXIT_1");
    const result = await sendBreachNotice(deps, planOf(), { leaveRoom: 0 });
    expect(result.stopped).toBeNull();
    expect(result.outcomes.filter((entry) => entry.outcome === "MAIL_FAILED")).toHaveLength(3);
  });

  it("an account that went, an address that cannot be read and a blocked address are each counted, and the run goes on", async () => {
    const deps = world({ addresses: { [id(1)]: null, [id(2)]: new Error("the key is gone") } });
    deps.failNext.push("SUPPRESSED");
    const result = await sendBreachNotice(deps, planOf(), { leaveRoom: 0 });
    expect(result.outcomes.map((entry) => entry.outcome)).toEqual(["ACCOUNT_GONE", "ADDRESS_UNREADABLE", "ADDRESS_SUPPRESSED", "SENT", "NO_TEXT", "SENT"]);
    expect([...deps.sentIds].sort()).toEqual([id(4), id(6)]);
    // Three are still owed a notice; the account that is gone has nobody left to write to.
    expect(stillOwed(result)).toBe(3);
  });

  it("stops when the day's count cannot be read", async () => {
    const deps = world();
    deps.failNext.push("OK", "OUTBOUND_MAIL_GATE_UNAVAILABLE");
    const result = await sendBreachNotice(deps, planOf(), { leaveRoom: 0 });
    expect(result.outcomes.map((entry) => entry.outcome)).toEqual(["SENT", "NOT_TRIED", "NOT_TRIED", "NOT_TRIED", "NO_TEXT", "NOT_TRIED"]);
    expect(result.stopped).toBe("MAIL_COUNT_UNREADABLE");
  });
});

describe("the log for the breach record's folder", () => {
  it("says how many were sent, per country, when, and how many were not, with no address and no account id", async () => {
    const deps = world({ addresses: { [id(6)]: null } });
    deps.failNext.push("OK", "SENDMAIL_EXIT_1");
    const plan = planOf();
    const result = await sendBreachNotice(deps, plan, { leaveRoom: 0 });
    const log = renderBreachNoticeLog(result, plan, { selection: "--all", texts: TEXTS });
    expect(log).toContain("Started: 2026-11-23 10:00:00 UTC");
    expect(log).toMatch(/Ended: 2026-11-23 10:00:\d\d UTC/);
    expect(log).toContain("Accounts chosen: 6");
    expect(log).toContain("Written to in this run: 3");
    expect(log).toContain("Not written to: 3");
    expect(log).toContain("| RO | 2 | 1 | 0 | 1 |");
    expect(log).toContain("| KR | 1 | 1 | 0 | 0 |");
    expect(log).toContain("| US-NY | 1 | 1 | 0 | 0 |");
    expect(log).toContain("| FI | 1 | 0 | 0 | 1 |");
    expect(log).toContain("| none declared | 1 | 0 | 0 | 1 |");
    expect(log).toContain("| The mail program failed (SENDMAIL_EXIT_1) | 1 |");
    expect(log).toContain("| No text in the account's language (fi) | 1 |");
    expect(log).toContain("| The account no longer exists | 1 |");
    expect(log).toContain(`| ro | Notificare | ${TEXTS.get("ro")!.sha256} |`);
    expect(log).toContain("Chosen with: --all");
    expect(log).not.toMatch(/@example\.test/);
    expect(log).not.toMatch(/00000000-0000/);
  });

  it("says why a run stopped early and what to do next", async () => {
    const deps = world({ dailyLimit: 10, alreadyToday: 8 });
    const plan = planOf({ englishFallback: true });
    const log = renderBreachNoticeLog(await sendBreachNotice(deps, plan, { leaveRoom: 0 }), plan, { selection: "--country RO,KR", texts: TEXTS });
    expect(log).toContain("Stopped early: today's mail limit was reached.");
    expect(log).toContain("| Not tried: the run stopped first | 4 |");
    const done = world();
    const whole = renderBreachNoticeLog(await sendBreachNotice(done, plan, { leaveRoom: 0 }), plan, { selection: "--all", texts: TEXTS });
    expect(whole).toContain("Stopped early: no.");
    expect(whole).toContain("| fi | 1 | 1 |");
  });
});
