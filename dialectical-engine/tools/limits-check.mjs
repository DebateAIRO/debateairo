#!/usr/bin/env node
// R22 decision 18: the site's real limits live only on the server. This check refuses them in new commits.
//
// TWO HALVES.
//  - The list: the real figures, one per line, read from outside the repository: the LIMITS_CHECK_LIST environment value
//    (in CI, the GitHub Actions secret of that name), or else the file LIMITS_CHECK_LIST_FILE names, or else
//    $HOME/.config/debateai/limits-list.txt. Never committed, and never hashed: a hash of a small number is reversible.
//    No list: a plain note and a pass for this half, because adding the secret is the owner's step.
//  - The shape: what is knowable with no list. A plan's figure in an example file must be one of the marked made-up values
//    below, and a sentence may not put a money amount beside a plan's limit unless the amount is a marked made-up one.
//
// ONLY CHANGED TEXT is read: added lines, new file names and commit messages. A normal number elsewhere never triggers it.
// NOTHING SECRET IS PRINTED. A refusal names the place and the entry's number, never the value and never the line, because
// a public repository's CI logs are public.
//
//   node tools/limits-check.mjs --base <commit>   the text added since <commit>, and the commit messages since it
//   node tools/limits-check.mjs --staged          what is about to be committed
//   node tools/limits-check.mjs --whole-tree      an audit: every tracked file, counts per file (not used by CI)
//
// A line holding the mark limits-check-ok passes both halves: for a number that only looks like a limit, such as a timeout.
// The check says how many lines carried it, for the reviewer. Exit: 0 pass, 1 refused, 2 could not run.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MARK = "limits-check-ok";

/** The marked made-up values: what an example file may hold. Plainly fake, multiples of eleven; they say nothing about the real ones. */
export const MADE_UP_MEMBER_VALUES = Object.freeze({
  monthly_credit_micros: [330_000, 6_600_000, 33_000_000, 220_000_000],
  finish_overflow_micros: [220_000],
  reserve_micros: [88_000, 440_000],
  day_bp: [1_100],
  week_bp: [4_400],
  per_run_ceiling_micros: [440_000],
  daily_ceiling_micros: [5_500_000],
  serve_reserve_basis_points: [3_300],
  serve_overrun_basis_points: [2_200],
  admission_close_basis_points: [8_800],
  finish_up_to_basis_points: [11_000],
  clarify_per_hour: [11],
  clarify_per_day: [22],
  flag_per_person_hour: [11],
  flag_per_debate_day: [22],
  flag_per_site_day: [99],
  cancel_links_per_day: [11],
  mail_domain_checks_per_minute: [110]
});
const MADE_UP_DOLLARS = new Set([0.088, 0.22, 0.33, 0.44, 5.5, 6.6, 33, 220]);
const MADE_UP_CENTS = new Set([8.8, 22, 33, 44]);

const LIMIT_WORD = /\b(?:monthly credit|credit|reserve|overflow|allowance|monthly limit|month'?s limit|plan'?s (?:limit|cap)|team'?s? (?:limit|pot)|cost goal|margin|per user|run ceiling|daily ceiling)\b/iu;
const TEXT_FILE = /\.(?:md|markdown|txt|ya?ml|json|html?|saved)$/iu;
const COMMENT_LINE = /^\s*(?:\/\/|\/?\*|#|--)/u;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/** Digit separators are not part of a figure: the three spellings of one number are one number. */
function normalise(text) {
  return text.toLowerCase().replace(/(?<=\d)[_,](?=\d)/gu, "");
}

function readList() {
  const fromEnvironment = process.env.LIMITS_CHECK_LIST;
  let text = typeof fromEnvironment === "string" ? fromEnvironment : "";
  if (text.trim() === "") {
    const file = process.env.LIMITS_CHECK_LIST_FILE ?? join(homedir(), ".config", "debateai", "limits-list.txt");
    if (existsSync(file)) text = readFileSync(file, "utf8");
  }
  return text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#")).map(normalise);
}

/** Where `entry` stands alone in `line`: never inside a longer number, a decimal, or a longer word. */
function holds(line, entry) {
  let from = 0;
  for (;;) {
    const at = line.indexOf(entry, from);
    if (at < 0) return false;
    const before = at > 0 ? line.slice(Math.max(0, at - 2), at) : "";
    const after = line.slice(at + entry.length, at + entry.length + 2);
    const startsFree = !/[0-9a-z]$/u.test(before) && !/\d\.$/u.test(before) && !/^\.$/u.test(before);
    const endsFree = !/^[0-9a-z]/u.test(after) && !/^\.\d/u.test(after);
    if (startsFree && endsFree) return true;
    from = at + 1;
  }
}

function listEntryIn(line, entries) {
  const text = normalise(line);
  const found = entries.findIndex((entry) => holds(text, entry));
  return found < 0 ? null : found + 1;
}

/** The first shape this line breaks, in words, or null. Words only: never the figure. */
function shapeRefusal(path, line) {
  if (/\.example\.[a-z]+$/iu.test(path)) {
    const text = normalise(line);
    for (const [member, allowed] of Object.entries(MADE_UP_MEMBER_VALUES)) {
      for (const match of text.matchAll(new RegExp(`\\b${member}"?\\s*:\\s*(\\d+)`, "gu"))) {
        if (!allowed.includes(Number(match[1]))) return `${member} in an example file is not a marked made-up value`;
      }
    }
  }
  if (!LIMIT_WORD.test(line)) return null;
  const text = normalise(line);
  const dollars = [
    ...[...text.matchAll(/\$\s?(\d+\.\d+)/gu)].map((match) => match[1]),
    ...[...text.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s?(?:usd|dollars?)\b/gu)].map((match) => match[1])
  ];
  // A bare $5 is a positional parameter in SQL. It counts only where a sentence is written: a text file or a comment.
  if (TEXT_FILE.test(path) || COMMENT_LINE.test(line)) {
    dollars.push(...[...text.matchAll(/\$\s?(\d+)(?![\d.])/gu)].map((match) => match[1]));
  }
  const cents = [...text.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s?(?:¢|-?\s?cents?\b)/gu)].map((match) => match[1]);
  if (dollars.some((amount) => !MADE_UP_DOLLARS.has(Number(amount))) || cents.some((amount) => !MADE_UP_CENTS.has(Number(amount)))) {
    return "a money amount beside a plan's limit";
  }
  return null;
}

/** The added lines of a unified diff with no context, with their new line numbers, and the new files' names. */
function addedText(diff) {
  const lines = [];
  const names = [];
  let path = null;
  let lineNumber = 0;
  let wasDevNull = false;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("--- ")) { wasDevNull = raw === "--- /dev/null"; continue; }
    if (raw.startsWith("+++ ")) {
      path = raw === "+++ /dev/null" ? null : raw.slice(4).replace(/^"?b\//u, "").replace(/"$/u, "");
      if (path !== null && wasDevNull) names.push(path);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(raw);
    if (hunk !== null) { lineNumber = Number(hunk[1]); continue; }
    if (raw.startsWith("+") && path !== null) {
      lines.push({ path, lineNumber, text: raw.slice(1) });
      lineNumber += 1;
    }
  }
  return { lines, names };
}

function commitMessages(base) {
  return git(["log", "--format=%H%x00%B%x01", `${base}..HEAD`]).split("\u0001")
    .map((record) => record.replace(/^\s+/u, ""))
    .filter((record) => record !== "")
    .map((record) => {
      const [sha, body] = record.split("\u0000");
      return { sha: sha.slice(0, 12), body };
    });
}

function wholeTree(entries) {
  const paths = git(["ls-files", "-z"]).split("\u0000").filter((path) => path !== "");
  const counts = new Map();
  for (const path of paths) {
    let text;
    try { text = readFileSync(path); } catch { continue; }
    if (text.includes(0)) continue;
    for (const line of text.toString("utf8").split("\n")) {
      if (line.includes(MARK)) continue;
      if (listEntryIn(line, entries) !== null) counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  for (const [path, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) console.log(`${path}: ${String(count)}`);
  console.log(`LIMITS_CHECK_WHOLE_TREE ${String(counts.size)} file(s) hold a listed figure.`);
  return counts.size === 0 ? 0 : 1;
}

function main(argv) {
  const baseAt = argv.indexOf("--base");
  const staged = argv.includes("--staged");
  const entries = readList();
  if (argv.includes("--whole-tree")) {
    if (entries.length === 0) { console.log("LIMITS_CHECK_NO_LIST: nothing to audit against."); return 2; }
    return wholeTree(entries);
  }
  const base = baseAt >= 0 ? argv[baseAt + 1] : undefined;
  if (!staged && (base === undefined || base === "")) {
    console.log("LIMITS_CHECK_UNUSABLE: name --base <commit>, --staged or --whole-tree.");
    return 2;
  }
  let diff;
  let messages = [];
  try {
    const shape = ["--unified=0", "--no-color", "--no-ext-diff", "--no-renames", "--text"];
    diff = staged ? git(["diff", "--cached", ...shape]) : git(["diff", ...shape, `${base}...HEAD`]);
    if (!staged) messages = commitMessages(base);
  } catch {
    console.log("LIMITS_CHECK_UNUSABLE: git could not compare with that commit, so nothing was checked.");
    return 2;
  }
  if (entries.length === 0) {
    console.log("LIMITS_CHECK_NO_LIST: no list of real figures here (the LIMITS_CHECK_LIST secret is not set, or this is a fork's pull request). The list half is skipped; the shape half still runs.");
  }
  const refusals = [];
  let marked = 0;
  const { lines, names } = addedText(diff);
  for (const { path, lineNumber, text } of lines) {
    if (text.includes(MARK)) { marked += 1; continue; }
    const entry = listEntryIn(text, entries);
    if (entry !== null) refusals.push(`LIMITS_CHECK_REFUSED ${path}:${String(lineNumber)} holds list entry ${String(entry)}`);
    const shape = shapeRefusal(path, text);
    if (shape !== null) refusals.push(`LIMITS_CHECK_SHAPE ${path}:${String(lineNumber)}: ${shape}`);
  }
  for (const path of names) {
    const entry = listEntryIn(path, entries);
    if (entry !== null) refusals.push(`LIMITS_CHECK_REFUSED a file name new in this change holds list entry ${String(entry)}`);
  }
  for (const { sha, body } of messages) {
    for (const line of body.split("\n")) {
      if (line.includes(MARK)) continue;
      const entry = listEntryIn(line, entries);
      if (entry !== null) refusals.push(`LIMITS_CHECK_REFUSED the commit message of ${sha} holds list entry ${String(entry)}`);
    }
  }
  for (const refusal of refusals) console.log(refusal);
  if (marked > 0) console.log(`LIMITS_CHECK_NOTE ${String(marked)} ${marked === 1 ? "line" : "lines"} carried the mark ${MARK}: look at ${marked === 1 ? "it" : "them"} in review.`);
  if (refusals.length > 0) {
    console.log(`LIMITS_CHECK_FAILED ${String(refusals.length)} refusal(s). Real limits live only on the server: write "the plan's limit", or a marked made-up value.`);
    return 1;
  }
  console.log(`LIMITS_CHECK_OK ${String(lines.length)} added line(s) read.`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
