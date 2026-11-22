/**
 * The owner's command that tells people about a personal data breach (docs/operations/breach-runbook.md part 6):
 *
 *   pnpm breach:notify --accounts <the accounts list> --texts <the folder of notice texts>
 *     ( --all | [--country RO,KR] [--us-state NY,CA] [--undeclared] | --ids <a file of account ids> )
 *     [--english-fallback] [--leave-room <number>] [--out <the log's folder>] [--confirm]
 *
 * WITHOUT --confirm it only prints the plan: how many accounts were chosen, per declared country, which text each
 * language gets, and how much room today's mail limit has left. Nothing is sent and nothing is written.
 *
 * WITH --confirm (and --out) it prints the same plan, then writes ONE mail of its own to each chosen account, to the
 * account's address as it is at that moment, in the account's language. Then it writes two files into --out:
 *   sent-accounts.txt     the ids of the accounts written to. It stays on the server: the next run of the same command
 *                         reads it and writes only to those still owed. Delete it when the breach record is closed.
 *   breach-notice-log.md  counts and times only, no address and no account id. It goes into the breach record's folder.
 *
 * The choice:
 *   --all             every account on the list
 *   --country, --us-state, --undeclared
 *                     the accounts that declared one of these countries or US states at sign-up; --undeclared adds
 *                     the accounts that declared no country (made before sign-up asked for one)
 *   --ids <file>      the accounts named in the file, one id a line
 *
 * --english-fallback  an account whose language has no text gets the English one. Without it such an account is not
 *                     written to, and the plan and the log say how many those are, per language.
 * --leave-room <n>    stop while today's mail limit still has room for n more mails, so password resets keep going out.
 *
 * It runs on the server under `systemd-run` with the API's EnvironmentFile, as the API's own user, because only the API
 * can open an account's address. Every mail goes through the outbound mail gate (the day's limit, the blocked
 * addresses) and then through the mail program named in MAIL_SENDMAIL_PATH, so the mail plan and its allow-list lock
 * hold for it as for any other mail.
 *
 * A refusal is ONE line on stderr: a fixed code, and for the command's own refusals a plain sentence. Exit codes:
 * 0 everyone chosen who still has an account has been written to (now or in an earlier run), or the plan was printed;
 * 1 refused, nothing sent; 2 the command line is wrong; 3 it ran, and somebody was not written to: read the log, then
 * run it again.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, statSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TypedDomainError } from "@debateai/kernel";
import { FileUserDekStore, loadKekRing, loadSecretKey } from "@debateai/crypto";
import { loadBreachNoticeEnvironment, readAuthPolicy, readOutboundMailPolicy, type parseBreachNoticeEnvironment } from "@debateai/register";
import { PostgresOutboundMailStore } from "../../../../packages/db/src/outbound-mail.js";
import { openBillingOperatorPool } from "../billing/operator-connection.js";
import { BreachNoticeMailSender, type BreachNoticeMailChannel } from "../mail-channel.js";
import { OutboundMailGate } from "../outbound-mail-gate.js";
import { PostgresBreachNoticeAccounts } from "./accounts.js";
import {
  planBreachNotice, renderBreachNoticeLog, renderBreachNoticePlan, sendBreachNotice, stillOwed,
  type BreachNoticeAccounts, type BreachNoticeMailRoom, type BreachNoticeProgress
} from "./run.js";
import { parseAccountList, parseIdList, selectAccounts } from "./selection.js";
import { BreachNoticeRefusal, readBreachNoticeTexts } from "./text.js";

export type BreachNoticeArguments = Readonly<{
  accountsFile: string;
  textsFolder: string;
  all: boolean;
  countries: readonly string[];
  usStates: readonly string[];
  undeclared: boolean;
  idsFile: string | null;
  englishFallback: boolean;
  leaveRoom: number;
  outFolder: string | null;
  confirm: boolean;
}>;
export type BreachNoticeCliOutput = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
/** The site's own parts, opened only after the files on the command line were read and found in order. */
export type OpenBreachNotice = () => Promise<Readonly<{
  accounts: BreachNoticeAccounts;
  mail: BreachNoticeMailChannel;
  room: BreachNoticeMailRoom;
  dailyLimit: number;
  close(): Promise<void>;
}>>;

const USAGE = [
  "pnpm breach:notify --accounts <file> --texts <folder>",
  "  ( --all | [--country RO,KR] [--us-state NY,CA] [--undeclared] | --ids <file> )",
  "  [--english-fallback] [--leave-room <number>] [--out <folder>] [--confirm]",
  "Without --confirm it only prints the plan. With --confirm it needs --out, the folder for the log."
].join("\n");
const CODES = /^[A-Z]{2}(,[A-Z]{2})*$/u;
const WHOLE_NUMBER = /^(0|[1-9][0-9]{0,6})$/u;
const PRINTABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
const FLAGS = new Set(["--all", "--undeclared", "--english-fallback", "--confirm"]);
const VALUES = new Set(["--accounts", "--texts", "--country", "--us-state", "--ids", "--leave-room", "--out"]);
const SENT_LIST = "sent-accounts.txt";
const LOG = "breach-notice-log.md";
const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function parseBreachNoticeArguments(args: readonly string[]): BreachNoticeArguments {
  const usage = (): never => { throw new TypeError("BREACH_NOTICE_USAGE"); };
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]!;
    if (FLAGS.has(name)) {
      if (flags.has(name)) usage();
      flags.add(name);
      continue;
    }
    const value = args[index + 1];
    if (!VALUES.has(name) || value === undefined || value === "" || value.startsWith("--") || values.has(name)) usage();
    values.set(name, value!);
    index += 1;
  }
  const accountsFile = values.get("--accounts"), textsFolder = values.get("--texts");
  const country = values.get("--country"), usState = values.get("--us-state"), leaveRoom = values.get("--leave-room") ?? "0";
  if (accountsFile === undefined || textsFolder === undefined || (country !== undefined && !CODES.test(country))
    || (usState !== undefined && !CODES.test(usState)) || !WHOLE_NUMBER.test(leaveRoom)) usage();
  const byPlace = country !== undefined || usState !== undefined || flags.has("--undeclared");
  if ([flags.has("--all"), byPlace, values.has("--ids")].filter(Boolean).length !== 1) usage();
  if (flags.has("--confirm") && !values.has("--out")) usage();
  return Object.freeze({
    accountsFile: accountsFile!, textsFolder: textsFolder!, all: flags.has("--all"),
    countries: Object.freeze(country?.split(",") ?? []), usStates: Object.freeze(usState?.split(",") ?? []),
    undeclared: flags.has("--undeclared"), idsFile: values.get("--ids") ?? null,
    englishFallback: flags.has("--english-fallback"), leaveRoom: Number(leaveRoom),
    outFolder: values.get("--out") ?? null, confirm: flags.has("--confirm")
  });
}

/** The choice as it was typed, for the log; a file of ids is named by how many it holds, never by its path or its lines. */
function selectionText(input: BreachNoticeArguments, idCount: number): string {
  if (input.all) return "--all";
  if (input.idsFile !== null) return `--ids (a file of ${String(idCount)} account ids)`;
  return [
    ...(input.countries.length > 0 ? [`--country ${input.countries.join(",")}`] : []),
    ...(input.usStates.length > 0 ? [`--us-state ${input.usStates.join(",")}`] : []),
    ...(input.undeclared ? ["--undeclared"] : [])
  ].join(" ");
}

function readText(path: string, code: string, what: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new BreachNoticeRefusal(code, `${what} cannot be read`);
  }
}

/**
 * The log's folder must exist, and must not be inside a Git repository: this repository is public, and the list of
 * accounts written to names accounts by id.
 */
function checkedOutFolder(folder: string): string {
  const absolute = resolve(folder);
  let isDirectory = false;
  try { isDirectory = statSync(absolute).isDirectory(); } catch { /* refused below */ }
  if (!isDirectory) throw new BreachNoticeRefusal("BREACH_NOTICE_OUT_UNUSABLE", "the folder named by --out does not exist; make it first");
  for (let current = absolute; ; current = dirname(current)) {
    if (existsSync(join(current, ".git"))) {
      throw new BreachNoticeRefusal("BREACH_NOTICE_OUT_IN_REPOSITORY", "the folder named by --out is inside a Git repository; choose a folder outside it");
    }
    if (dirname(current) === current) break;
  }
  return absolute;
}

/** The accounts written to so far, one id a line. Each new one is on the disk before the next mail is tried. */
function sentList(folder: string | null): BreachNoticeProgress & Readonly<{ close(): void }> {
  const sent = new Set<string>();
  if (folder === null) return { has: () => false, add: () => undefined, close: () => undefined };
  const path = join(folder, SENT_LIST);
  if (existsSync(path)) {
    for (const line of readText(path, "BREACH_NOTICE_SENT_LIST_INVALID", `${SENT_LIST} in the folder named by --out`).split("\n")) {
      if (line === "") continue;
      if (!ACCOUNT_ID.test(line)) {
        throw new BreachNoticeRefusal("BREACH_NOTICE_SENT_LIST_INVALID", `${SENT_LIST} in the folder named by --out is not a list of account ids; look at it before you send again`);
      }
      sent.add(line);
    }
  }
  let descriptor: number | null = null;
  return {
    has: (userId) => sent.has(userId),
    add: (userId) => {
      try {
        descriptor ??= openSync(path, "a", 0o600);
        writeSync(descriptor, `${userId}\n`);
        fsyncSync(descriptor);
      } catch {
        // Without this list a second run would write to everyone again, so the run ends here.
        throw new BreachNoticeRefusal("BREACH_NOTICE_SENT_LIST_UNWRITABLE",
          `${SENT_LIST} could not be written; the run stopped after a mail that is not on the list. Make the folder writable for the API's user before you run it again`);
      }
      sent.add(userId);
    },
    close: () => { if (descriptor !== null) closeSync(descriptor); }
  };
}

function refusalLine(error: unknown): string {
  if (error instanceof BreachNoticeRefusal) return `${error.code}: ${error.message}\n`;
  if (error instanceof TypedDomainError && PRINTABLE_CODE.test(error.code)) return `${error.code}\n`;
  if (error instanceof Error && PRINTABLE_CODE.test(error.message)) return `${error.message}\n`;
  return "BREACH_NOTICE_FAILED\n";
}

export async function runBreachNoticeCli(
  args: readonly string[], output: BreachNoticeCliOutput, open: OpenBreachNotice, clock: () => Date = () => new Date()
): Promise<number> {
  let input: BreachNoticeArguments;
  try {
    input = parseBreachNoticeArguments(args);
  } catch {
    output.stderr(`BREACH_NOTICE_USAGE\n${USAGE}\n`);
    return 2;
  }
  let progress: ReturnType<typeof sentList> | undefined;
  try {
    // Every file on the command line is read and checked before the database is opened or a key is loaded.
    const texts = readBreachNoticeTexts(input.textsFolder);
    const list = parseAccountList(readText(input.accountsFile, "BREACH_NOTICE_ACCOUNTS_UNREADABLE", "the accounts list"));
    const ids = input.idsFile === null ? null : parseIdList(readText(input.idsFile, "BREACH_NOTICE_IDS_UNREADABLE", "the file of account ids"));
    const picked = selectAccounts(list, { all: input.all, countries: input.countries, usStates: input.usStates, undeclared: input.undeclared, ids });
    if (picked.chosen.length === 0) throw new BreachNoticeRefusal("BREACH_NOTICE_NOBODY_CHOSEN", "the choice names no account on the accounts list");
    const outFolder = input.outFolder === null ? null : checkedOutFolder(input.outFolder);
    progress = sentList(outFolder);
    const site = await open();
    try {
      const plan = planBreachNotice({
        chosen: picked.chosen, idsNotListed: picked.idsNotListed, texts, englishFallback: input.englishFallback, alreadySent: progress,
        facts: await site.accounts.facts(picked.chosen.map((account) => account.userId))
      });
      output.stdout(renderBreachNoticePlan(plan, {
        texts, room: await site.room.today(), dailyLimit: site.dailyLimit, leaveRoom: input.leaveRoom, confirm: input.confirm
      }));
      if (!input.confirm || outFolder === null) return 0;
      const result = await sendBreachNotice({
        accounts: site.accounts, mail: site.mail, room: site.room, dailyLimit: site.dailyLimit, progress, texts, clock, messageId: randomUUID
      }, plan, { leaveRoom: input.leaveRoom });
      const log = renderBreachNoticeLog(result, plan, { selection: selectionText(input, ids?.length ?? 0), texts });
      const logPath = join(outFolder, LOG);
      let logWritten = true;
      try { appendFileSync(logPath, log, { mode: 0o600 }); } catch { logWritten = false; }
      output.stdout(`\n${log}`);
      output.stdout(logWritten
        ? `The log above was added to ${logPath}. Copy that file into the breach record's folder.\n`
        : "THE LOG COULD NOT BE WRITTEN to the folder named by --out. Copy the log above into the breach record's folder by hand.\n");
      output.stdout(`The accounts written to are listed in ${join(outFolder, SENT_LIST)}. Leave it there until everyone is written to.\n`);
      const owed = stillOwed(result);
      if (owed === 0) return 0;
      output.stdout(`NOT EVERYONE WAS WRITTEN TO: ${String(owed)} of the chosen accounts have no notice yet. The table "Not written to, by reason" says why.\n`);
      return 3;
    } finally {
      await site.close().catch(() => undefined);
    }
  } catch (error) {
    output.stderr(refusalLine(error));
    return 1;
  } finally {
    try { progress?.close(); } catch { /* the list is already on the disk */ }
  }
}

/**
 * The site's own parts, built as the API builds them (apps/api/src/main.ts): the system login, the day's shared mail
 * count, the outbound mail gate with the register's limit, the key store that opens an account's address, and the mail
 * program with the register's time limit. `journal` gets the gate's own content-free lines (a refusal's code and class,
 * or that a share of the day's limit was reached); no address and no digest is on them. The owner's alert MAIL is the
 * running API's to send: an alert first reached during this run is those lines instead.
 */
export async function openBreachNoticeSite(
  environment: ReturnType<typeof parseBreachNoticeEnvironment>, journal: (line: string) => void
): ReturnType<OpenBreachNotice> {
  // Not read-only: counting a mail against the day's limit is a write (migration 0170).
  const pool = await openBillingOperatorPool(environment.DATABASE_URL, {
    production: environment.NODE_ENV === "production", readOnly: false, max: 1
  });
  try {
    const authPolicy = await readAuthPolicy(pool, environment.REGISTER_VERSION);
    const mailPolicy = await readOutboundMailPolicy(pool, environment.REGISTER_VERSION);
    const blindIndexKey = loadSecretKey(environment.BLIND_INDEX_KEY_PATH);
    const users = new FileUserDekStore(environment.USER_DEK_STORE_PATH, loadKekRing(environment.KEK_PATH, environment.KEK_PREVIOUS_PATH));
    const store = new PostgresOutboundMailStore(pool);
    const gate = new OutboundMailGate({
      policy: mailPolicy, blindIndexKey, ledger: store, suppression: store,
      report: (event) => {
        journal(event.kind === "refused"
          ? `[OUTBOUND_MAIL_REFUSED] code=${event.code} class=${event.purposeClass}\n`
          : `[OUTBOUND_MAIL_ALERT] alert=${event.alert} day=${event.day} total=${String(event.total)} limit=${String(event.dailyLimit)}\n`);
      }
    });
    return Object.freeze({
      accounts: new PostgresBreachNoticeAccounts(pool, users),
      mail: new BreachNoticeMailSender({
        executable: environment.MAIL_SENDMAIL_PATH, from: environment.MAIL_FROM, timeoutMs: authPolicy.channel.transportTimeoutMs, gate
      }),
      room: store,
      dailyLimit: mailPolicy.dailyLimit,
      close: async () => {
        blindIndexKey.fill(0);
        await pool.end();
      }
    });
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runBreachNoticeCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  }, () => openBreachNoticeSite(loadBreachNoticeEnvironment(), (line) => process.stderr.write(line)));
}
