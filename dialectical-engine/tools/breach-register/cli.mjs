#!/usr/bin/env node
// The breach register's tool. docs/operations/breach-runbook.md is the procedure; this only keeps the paperwork straight.
//
// THE REGISTER IS NOT IN THIS REPOSITORY. This repository is public; a breach record is not. The register is a folder
// the owner keeps with the company's papers, off the server, with a backup: one sub-folder per breach, holding
// `record.md` and a copy of everything sent. Name the folder with --register, or once in BREACH_REGISTER_DIR.
// The tool refuses a folder inside any Git repository, so a record can never be committed by accident.
//
//   node tools/breach-register/cli.mjs clocks [--aware "2026-11-22 14:05"]
//       Every region's time limits. With --aware, as real dates. Needs no register.
//   node tools/breach-register/cli.mjs open --aware "2026-11-22 14:05" --title "a few words" [--practice]
//       A new record, and its time limits. --aware is the moment we became aware (runbook part 1).
//   node tools/breach-register/cli.mjs status [--id BR-2026-001]
//       Every open record: what is late, what comes next, what `close` still asks for.
//   node tools/breach-register/cli.mjs close --id BR-2026-001
//       Checks the record is complete, then marks it closed and writes how long to keep it.
//
// It needs only Node: no install, no database, no network. So it runs on any machine, also on a day the server is
// down. Times without a zone are Romanian time. Exit: 0 fine, 1 something is late, unreadable or incomplete,
// 2 could not run.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BREACH_CLOCKS, RECORD_KEEP_YEARS, WORKING_TARGET_HOURS, deadlineMoment } from "./clocks.mjs";
import { RECORD_FILE, closedText, newRecordText, owed, readRecord } from "./record.mjs";
import { HOUR_MS, ownerTime, parseMoment, showMoment } from "./time.mjs";

class Refusal extends Error {
  constructor(message, code = 2) { super(message); this.code = code; }
}

const USAGE = [
  "Usage:",
  "  breach-register clocks [--aware \"2026-11-22 14:05\"]",
  "  breach-register open --aware \"2026-11-22 14:05\" --title \"a few words\" [--practice] [--register <folder>]",
  "  breach-register status [--id BR-2026-001] [--register <folder>]",
  "  breach-register close --id BR-2026-001 [--register <folder>]",
  "The register folder comes from --register or from BREACH_REGISTER_DIR. Times without a zone are Romanian time."
].join("\n");

const VALUE_OPTIONS = new Set(["--aware", "--title", "--register", "--id", "--now"]);
const FLAG_OPTIONS = new Set(["--practice"]);

/** The command and its options. An unknown option, or one written twice, is refused: a typo must not be ignored. */
export function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index];
    if (options.has(name)) throw new Refusal(`${name} is written twice.\n${USAGE}`);
    if (FLAG_OPTIONS.has(name)) { options.set(name, "yes"); continue; }
    const value = rest[index + 1];
    if (!VALUE_OPTIONS.has(name) || value === undefined || value.startsWith("--")) throw new Refusal(`Not understood: ${name}\n${USAGE}`);
    options.set(name, value);
    index += 1;
  }
  return { command, options };
}

/** True when the folder, or any folder above it, is a Git repository or a worktree of one. */
function insideGit(folder) {
  for (let at = folder; ; at = dirname(at)) {
    if (existsSync(join(at, ".git"))) return true;
    if (dirname(at) === at) return false;
  }
}

function registerFolder(options, env) {
  const named = options.get("--register") ?? env.BREACH_REGISTER_DIR;
  if (named === undefined || named === "") {
    throw new Refusal("Name the register's folder: --register <folder>, or set BREACH_REGISTER_DIR once. It is the folder with the company's papers, never this repository.");
  }
  const folder = resolve(named);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new Refusal(`The register's folder does not exist: ${folder}\nMake it yourself first, so a mistyped name never starts a second register.`);
  }
  if (insideGit(folder)) {
    throw new Refusal(`Refused: ${folder} is inside a Git repository. A breach record must never be committed; keep the register with the company's papers.`);
  }
  return folder;
}

function momentOption(options, name) {
  const value = options.get(name);
  if (value === undefined) return null;
  const at = parseMoment(value);
  if (at === null) throw new Refusal(`${name} "${value}" is not a time. Write it like "2026-11-22 14:05" (Romanian time), or add Z or +02:00.`);
  return at;
}

const clockNow = (options, now) => momentOption(options, "--now") ?? now();

/** One region's limits, as lines. With a moment of awareness the limits are dates; without, the law's words. */
function clockLines(clock, awareAt) {
  const when = (deadline) => {
    if (awareAt === null) return deadline.words;
    const at = deadlineMoment(awareAt, deadline);
    return at === null
      ? `"${deadline.words}": our target is ${showMoment(new Date(awareAt.getTime() + WORKING_TARGET_HOURS * HOUR_MS))}`
      : `${showMoment(at)} (${deadline.words})`;
  };
  return [
    `${clock.id}: ${clock.name}`,
    `  ${clock.authority.name}, when ${clock.authority.trigger}`,
    `      by ${when(clock.authority.deadline)}`,
    `      how: ${clock.authority.how}`,
    `  The people affected, when ${clock.people.trigger}`,
    `      by ${when(clock.people.deadline)}`,
    ...(clock.finalReport === undefined ? [] : [`  Final report: ${when(clock.finalReport.deadline)}`]),
    `  Record: ${clock.record}`,
    `  Law: ${clock.source}`
  ];
}

function runClocks(options, out) {
  const awareAt = momentOption(options, "--aware");
  if (awareAt !== null) out(`Aware: ${showMoment(awareAt)}`, "");
  out(`One working rule covers every region: decide within 48 hours, and tell everyone you must within ${WORKING_TARGET_HOURS} hours of becoming aware.`, "");
  for (const clock of BREACH_CLOCKS) out(...clockLines(clock, awareAt), "");
  return 0;
}

function recordFolders(folder) {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^(?:BR|DRILL)-\d{4}-\d{3}$/u.test(entry.name))
    .map((entry) => entry.name).sort();
}

function runOpen(options, env, now, out) {
  const awareAt = momentOption(options, "--aware");
  const title = (options.get("--title") ?? "").trim();
  if (awareAt === null || title === "" || /[\n\r]/u.test(title)) throw new Refusal(`open needs --aware and a one-line --title.\n${USAGE}`);
  const opened = clockNow(options, now);
  if (awareAt.getTime() > opened.getTime() + 5 * 60_000) {
    throw new Refusal(`--aware ${showMoment(awareAt)} is in the future. It is the moment we became aware of the breach.`);
  }
  const folder = registerFolder(options, env);
  const prefix = options.has("--practice") ? "DRILL" : "BR";
  const year = ownerTime(awareAt).slice(0, 4);
  const taken = recordFolders(folder).filter((name) => name.startsWith(`${prefix}-${year}-`)).map((name) => Number(name.slice(-3)));
  const id = `${prefix}-${year}-${String(Math.max(0, ...taken) + 1).padStart(3, "0")}`;
  const file = join(folder, id, RECORD_FILE);
  mkdirSync(join(folder, id));
  writeFileSync(file, newRecordText({ id, title, awareAt, openedAt: opened, practice: options.has("--practice") }), { flag: "wx" });
  out(`Opened ${id}: ${file}`, "", `Aware: ${showMoment(awareAt)}`, "");
  const { next, late } = owed(readRecord(readFileSync(file, "utf8")).record, opened);
  out("Time limits, soonest first. A region drops out once you write 0 people affected there:");
  for (const line of [...late, ...next]) out(`  ${line}`);
  out("", "Now: runbook part 2 (stop the harm), then fill in the record as you learn things.");
  return 0;
}

function runStatus(options, env, now, out) {
  const folder = registerFolder(options, env);
  const at = clockNow(options, now);
  const only = options.get("--id");
  const names = recordFolders(folder).filter((name) => only === undefined || name === only);
  if (only !== undefined && names.length === 0) throw new Refusal(`No record ${only} in ${folder}.`);
  let code = 0;
  let open = 0;
  let closed = 0;
  for (const name of names) {
    const file = join(folder, name, RECORD_FILE);
    if (!existsSync(file)) { out(`${name}: ${RECORD_FILE} is missing from its folder.`, ""); code = 1; continue; }
    const { record, broken } = readRecord(readFileSync(file, "utf8"));
    if (record.id !== name) broken.push(`the record's number (${record.id}) is not its folder's name (${name})`);
    if (record.status === "closed" && broken.length === 0) {
      closed += 1;
      if (only !== undefined) out(`${name}: closed ${record.closedAt === null ? "" : showMoment(record.closedAt)}. Keep until ${record.keepUntil}.`, "");
      continue;
    }
    open += record.status === "closed" ? 0 : 1;
    out(`${name}: ${record.title}${record.awareAt === null ? "" : `. Aware ${showMoment(record.awareAt)}.`}`);
    if (broken.length > 0) {
      code = 1;
      out("  CANNOT READ (fix these lines first):");
      for (const line of broken) out(`    ${line}`);
    }
    const { late, next, toClose } = owed(record, at);
    if (late.length > 0) {
      code = 1;
      out("  LATE (do these now, and write the reason on \"Late because\"):");
      for (const line of late) out(`    ${line}`);
    }
    if (next.length > 0) { out("  Next:"); for (const line of next) out(`    ${line}`); }
    if (toClose.length > 0) { out("  Before it can be closed:"); for (const line of toClose) out(`    ${line}`); }
    if (late.length === 0 && next.length === 0 && toClose.length === 0 && broken.length === 0) out(`  Complete. Close it: close --id ${name}`);
    out("");
  }
  out(`${open} open, ${closed} closed, in ${folder}. Closed records are kept at least ${RECORD_KEEP_YEARS} years.`);
  return code;
}

function runClose(options, env, now, out) {
  const id = options.get("--id");
  if (id === undefined) throw new Refusal(`close needs --id.\n${USAGE}`);
  const folder = registerFolder(options, env);
  const file = join(folder, id, RECORD_FILE);
  if (!/^(?:BR|DRILL)-\d{4}-\d{3}$/u.test(id) || !existsSync(file)) throw new Refusal(`No record ${id} in ${folder}.`);
  const text = readFileSync(file, "utf8");
  const { record, broken } = readRecord(text);
  if (record.status === "closed") { out(`${id} is already closed. Keep until ${record.keepUntil}.`); return 0; }
  const at = clockNow(options, now);
  const { late, toClose } = owed(record, at);
  const blocking = [...broken, ...late, ...toClose];
  if (blocking.length > 0) {
    out(`${id} cannot be closed yet:`);
    for (const line of blocking) out(`  ${line}`);
    return 1;
  }
  writeFileSync(file, closedText(text, at));
  const after = readRecord(readFileSync(file, "utf8")).record;
  out(`${id} is closed. Keep its folder until ${after.keepUntil} at the earliest, with a backup copy.`);
  return 0;
}

/** Runs one command. `out` receives lines; the result is the exit code. */
export function run(argv, { env = process.env, now = () => new Date(), out = (...lines) => console.log(lines.join("\n")) } = {}) {
  try {
    const { command, options } = parseArguments(argv);
    if (command === "clocks") return runClocks(options, out);
    if (command === "open") return runOpen(options, env, now, out);
    if (command === "status") return runStatus(options, env, now, out);
    if (command === "close") return runClose(options, env, now, out);
    throw new Refusal(USAGE);
  } catch (error) {
    if (error instanceof Refusal) { out(error.message); return error.code; }
    throw error;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run(process.argv.slice(2));
}
