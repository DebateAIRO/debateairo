import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MailDeliveryError, type BreachNoticeMail } from "../../apps/api/src/mail-channel.js";
import {
  parseBreachNoticeArguments,
  runBreachNoticeCli,
  type OpenBreachNotice
} from "../../apps/api/src/breach-notice/cli.js";
import type { AccountFacts } from "../../apps/api/src/breach-notice/run.js";

// The owner's command for the breach runbook's part 6 (docs/operations/breach-runbook.md):
//   pnpm breach:notify --accounts <file> --texts <folder> (--all | --country … | --us-state … | --undeclared | --ids <file>) [--confirm …]
// Without --confirm it only prints who would be written to. Every number here is a made-up test value.

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ENGLISH = "Subject: Notice of Data Breach\n\nWhat happened.\n\nWrite to privacy@dezbatere.ro.\n";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

type Site = Readonly<{
  root: string; accounts: string; texts: string; out: string; ids: string;
  mails: BreachNoticeMail[]; opened: { count: number; closed: number }; failFor: Set<string>;
  open: OpenBreachNotice;
  run(args: readonly string[]): Promise<Readonly<{ code: number; stdout: string; stderr: string }>>;
}>;

function site(options: Readonly<{ dailyLimit?: number; facts?: ReadonlyMap<string, AccountFacts> }> = {}): Site {
  const root = mkdtempSync(join(tmpdir(), "debateai-breach-cli-"));
  folders.push(root);
  const accounts = join(root, "accounts.txt"), texts = join(root, "texts"), out = join(root, "out"), ids = join(root, "ids.txt");
  writeFileSync(accounts, [`${id(1)}|RO|-`, `${id(2)}|RO|-`, `${id(3)}|KR|-`, `${id(4)}|US|NY`, `${id(5)}|-|-`].join("\n") + "\n");
  mkdirSync(texts);
  mkdirSync(out);
  writeFileSync(join(texts, "en.txt"), ENGLISH);
  writeFileSync(join(texts, "ro.txt"), ENGLISH.replace("Notice of Data Breach", "Notificare"));
  writeFileSync(ids, `${id(3)}\n${id(4)}\n`);
  const facts = options.facts ?? new Map<string, AccountFacts>([
    [id(1), { state: "active", language: "ro" }], [id(2), { state: "active", language: "ro" }], [id(3), { state: "active", language: "ko" }],
    [id(4), { state: "active", language: "en" }], [id(5), { state: "active", language: "en" }]
  ]);
  const mails: BreachNoticeMail[] = [];
  const opened = { count: 0, closed: 0 };
  const failFor = new Set<string>();
  let total = 0;
  const open: OpenBreachNotice = async () => {
    opened.count += 1;
    return {
      dailyLimit: options.dailyLimit ?? 1000,
      accounts: {
        facts: async (userIds) => new Map(userIds.flatMap((userId) => { const found = facts.get(userId); return found === undefined ? [] : [[userId, found] as const]; })),
        address: async (userId) => `person-${userId.slice(-2)}@example.test`
      },
      mail: {
        sendBreachNotice: async (mail) => {
          total += 1;
          if (failFor.has(mail.to)) throw new MailDeliveryError("SENDMAIL_EXIT_1");
          mails.push(mail);
          return "SENT";
        }
      },
      room: { today: async () => ({ total, day: "2026-11-23" }) },
      close: async () => { opened.closed += 1; }
    };
  };
  const run = async (args: readonly string[]) => {
    let stdout = "", stderr = "";
    const code = await runBreachNoticeCli(args, { stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } }, open);
    return { code, stdout, stderr };
  };
  return { root, accounts, texts, out, ids, mails, opened, failFor, open, run };
}

describe("the command's arguments", () => {
  const base = ["--accounts", "/a.txt", "--texts", "/t"];

  it("reads each way of choosing", () => {
    expect(parseBreachNoticeArguments([...base, "--all"])).toMatchObject({ accountsFile: "/a.txt", textsFolder: "/t", all: true, confirm: false, leaveRoom: 0, outFolder: null });
    expect(parseBreachNoticeArguments([...base, "--country", "RO,KR", "--us-state", "NY", "--undeclared"]))
      .toMatchObject({ all: false, countries: ["RO", "KR"], usStates: ["NY"], undeclared: true, idsFile: null });
    expect(parseBreachNoticeArguments([...base, "--ids", "/ids.txt", "--english-fallback", "--leave-room", "50", "--out", "/o", "--confirm"]))
      .toMatchObject({ idsFile: "/ids.txt", englishFallback: true, leaveRoom: 50, outFolder: "/o", confirm: true });
  });

  it.each([
    ["nothing chosen", base],
    ["no accounts list", ["--texts", "/t", "--all"]],
    ["no texts", ["--accounts", "/a.txt", "--all"]],
    ["--all with a country", [...base, "--all", "--country", "RO"]],
    ["--ids with a state", [...base, "--ids", "/i", "--us-state", "NY"]],
    ["a country in small letters", [...base, "--country", "ro"]],
    ["an option twice", [...base, "--all", "--all"]],
    ["an unknown option", [...base, "--all", "--force"]],
    ["a value that is missing", [...base, "--country"]],
    ["a room that is not a whole number", [...base, "--all", "--leave-room", "1.5"]],
    ["--confirm with no --out", [...base, "--all", "--confirm"]],
    ["a bare word", [...base, "--all", "now"]]
  ])("refuses %s", (_name, args) => {
    expect(() => parseBreachNoticeArguments(args)).toThrow("BREACH_NOTICE_USAGE");
  });
});

describe("without --confirm", () => {
  it("prints the count per country and sends nothing", async () => {
    const s = site();
    const result = await s.run(["--accounts", s.accounts, "--texts", s.texts, "--all"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Accounts chosen: 5");
    expect(result.stdout).toMatch(/RO\s+2\s+2/);
    expect(result.stdout).toMatch(/KR\s+1\s+0/);
    expect(result.stdout).toContain("Nothing was sent. Run the same command with --confirm to send.");
    expect(s.mails).toHaveLength(0);
    expect(readdirSync(s.out)).toEqual([]);
    expect(s.opened).toEqual({ count: 1, closed: 1 });
  });

  it("a usage mistake exits 2 with one code and the form of the command", async () => {
    const s = site();
    const result = await s.run(["--accounts", s.accounts, "--texts", s.texts]);
    expect(result.code).toBe(2);
    expect(result.stderr.startsWith("BREACH_NOTICE_USAGE\n")).toBe(true);
    expect(result.stderr).toContain("pnpm breach:notify --accounts");
    expect(s.opened.count).toBe(0);
  });

  it("a text that cannot be sent as written is refused before the database is opened", async () => {
    const s = site();
    writeFileSync(join(s.texts, "ko.txt"), ENGLISH.replace("What happened.", "[what happened]"));
    const result = await s.run(["--accounts", s.accounts, "--texts", s.texts, "--all"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^BREACH_NOTICE_TEXT_PLACEHOLDER_LEFT: ko\.txt /);
    expect(s.opened.count).toBe(0);
  });

  it("refuses a choice that names nobody", async () => {
    const s = site();
    writeFileSync(s.ids, `${id(77)}\n`);
    const result = await s.run(["--accounts", s.accounts, "--texts", s.texts, "--ids", s.ids]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^BREACH_NOTICE_NOBODY_CHOSEN/);
  });

  it("a file that is not there is one plain refusal", async () => {
    const s = site();
    const result = await s.run(["--accounts", join(s.root, "none.txt"), "--texts", s.texts, "--all"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^BREACH_NOTICE_ACCOUNTS_UNREADABLE/);
  });
});

describe("with --confirm", () => {
  it("sends, keeps the list of accounts written to, and writes the log with no address and no account id", async () => {
    const s = site();
    const result = await s.run(["--accounts", s.accounts, "--texts", s.texts, "--country", "RO", "--us-state", "NY", "--out", s.out, "--confirm"]);
    expect(result.code).toBe(0);
    expect(s.mails.map((mail) => [mail.to, mail.language])).toEqual([
      ["person-01@example.test", "ro"], ["person-02@example.test", "ro"], ["person-04@example.test", "en"]
    ]);
    expect(readFileSync(join(s.out, "sent-accounts.txt"), "utf8")).toBe(`${id(1)}\n${id(2)}\n${id(4)}\n`);
    const log = readFileSync(join(s.out, "breach-notice-log.md"), "utf8");
    expect(log).toContain("Chosen with: --country RO --us-state NY");
    expect(log).toContain("Written to in this run: 3");
    expect(log).toContain("| RO | 2 | 2 | 0 | 0 |");
    expect(log).not.toMatch(/@example\.test|00000000-0000/);
    expect(result.stdout).toContain("Written to in this run: 3");
    expect(result.stdout).toContain(join(s.out, "breach-notice-log.md"));
    expect(result.stdout).not.toMatch(/@example\.test/);
  });

  it("exits 3 when somebody was not written to, and the same command again writes only to them", async () => {
    const s = site();
    s.failFor.add("person-02@example.test");
    const args = ["--accounts", s.accounts, "--texts", s.texts, "--all", "--english-fallback", "--out", s.out, "--confirm"];
    const first = await s.run(args);
    expect(first.code).toBe(3);
    expect(first.stdout).toContain("NOT EVERYONE WAS WRITTEN TO");
    expect(s.mails).toHaveLength(4);
    s.failFor.clear();
    const second = await s.run(args);
    expect(second.code).toBe(0);
    expect(s.mails).toHaveLength(5);
    expect(s.mails[4]!.to).toBe("person-02@example.test");
    const log = readFileSync(join(s.out, "breach-notice-log.md"), "utf8");
    expect(log.match(/^# Breach notice: sending log$/gm)).toHaveLength(2);
    expect(log).toContain("Written to in an earlier run: 4");
    expect(readFileSync(join(s.out, "sent-accounts.txt"), "utf8").trim().split("\n")).toHaveLength(5);
  });

  it("an account whose language has no text is not written to, and that is not a finished job", async () => {
    const s = site();
    const result = await s.run(["--accounts", s.accounts, "--texts", s.texts, "--ids", s.ids, "--out", s.out, "--confirm"]);
    expect(result.code).toBe(3);
    expect(s.mails.map((mail) => mail.to)).toEqual(["person-04@example.test"]);
    expect(readFileSync(join(s.out, "breach-notice-log.md"), "utf8")).toContain("| No text in the account's language (ko) | 1 |");
  });

  it("refuses a log folder that is missing, or inside a Git repository (this one is public)", async () => {
    const s = site();
    const missing = await s.run(["--accounts", s.accounts, "--texts", s.texts, "--all", "--out", join(s.root, "nowhere"), "--confirm"]);
    expect([missing.code, missing.stderr.split(":")[0]]).toEqual([1, "BREACH_NOTICE_OUT_UNUSABLE"]);
    mkdirSync(join(s.root, ".git"));
    const inRepository = await s.run(["--accounts", s.accounts, "--texts", s.texts, "--all", "--out", s.out, "--confirm"]);
    expect([inRepository.code, inRepository.stderr.split(":")[0]]).toEqual([1, "BREACH_NOTICE_OUT_IN_REPOSITORY"]);
    expect(s.mails).toHaveLength(0);
    expect(existsSync(join(s.out, "sent-accounts.txt"))).toBe(false);
  });

  it("refuses a list of accounts written to that it cannot read as one, and sends nothing", async () => {
    const s = site();
    writeFileSync(join(s.out, "sent-accounts.txt"), "person@example.test\n");
    const result = await s.run(["--accounts", s.accounts, "--texts", s.texts, "--all", "--out", s.out, "--confirm"]);
    expect([result.code, result.stderr.split(":")[0]]).toEqual([1, "BREACH_NOTICE_SENT_LIST_INVALID"]);
    expect(result.stderr).not.toContain("person@example.test");
    expect(s.mails).toHaveLength(0);
  });

  it("a failure while opening the site's own parts is one code, and nothing is sent", async () => {
    const s = site();
    let stderr = "";
    const code = await runBreachNoticeCli(["--accounts", s.accounts, "--texts", s.texts, "--all", "--out", s.out, "--confirm"],
      { stdout: () => undefined, stderr: (text) => { stderr += text; } }, async () => { throw new TypeError("BILLING_OPERATOR_PRINCIPAL_INVALID"); });
    expect([code, stderr]).toEqual([1, "BILLING_OPERATOR_PRINCIPAL_INVALID\n"]);
  });
});
