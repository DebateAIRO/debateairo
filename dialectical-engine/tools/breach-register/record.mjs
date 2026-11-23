// One breach record: the page `open` writes, how it is read back, and what is still owed on it.
//
// A record is one Markdown file, `record.md`, in its own folder of the register. A person fills it in with any editor;
// it is also the page handed to an authority that asks to see the register. So the format is plain: "- Name: value"
// lines for the facts a check can read, and headed sections for the sentences. Hints sit in HTML comments, which a
// Markdown viewer hides and this reader skips, so a hint never counts as an answer.
//
// What a record must hold comes from the laws in docs/legal-research/assessments/breach-clocks.md: GDPR Art. 33(5)
// (the facts, the effects, the remedial action), the EDPB's Guidelines 9/2022 (the reasons for each decision, above all
// a decision NOT to notify, and the reason for any delay), Canada's Breach of Security Safeguards Regulations s. 6 and
// Quebec's Regulation respecting confidentiality incidents s. 7. docs/operations/breach-runbook.md part 8 maps each
// heading to its law.

import { BREACH_CLOCKS, RECORD_KEEP_YEARS, WORKING_TARGET_HOURS, deadlineMoment } from "./clocks.mjs";
import { HOUR_MS, distance, ownerTime, parseMoment, showMoment, storedMoment } from "./time.mjs";

export const RECORD_FILE = "record.md";

/** The sections a person writes, in order. `close` refuses while any is empty. */
export const SECTIONS = Object.freeze([
  ["How we found out", "Who noticed or who told us, and what they saw. If a provider told us, name it and paste the time of its message."],
  ["What happened", "The facts in order: what went wrong, how, and the cause if known. Say what is still unknown."],
  ["The personal data involved", "Which kinds of data: email addresses, password hashes, sign-in secrets, debate text, billing records. Say whether it was readable or encrypted, and whether the keys were taken too. Never paste the data itself here."],
  ["Who is affected", "Which accounts or which group of people, and how the numbers below were counted."],
  ["What may happen to them", "The likely consequences for those people: for example someone signing in as them, their private debates being read, a scam email sent to their address."],
  ["Why we rated the risk this way", "The reasons behind the line \"Risk to people\" above, using the test in part 3 of the runbook. Write them even when the answer is \"unlikely\": the reasons for NOT telling anyone are what an authority asks for first."],
  ["What we did to stop it and limit the harm", "Each step with its time: what was closed, which keys or passwords were changed, which sessions were ended."],
  ["What we changed so it does not happen again", "The lasting fix, and the date it went live. Write \"nothing yet\" only while the record is open."]
]);

const NOT_DECIDED = "not decided";
const NOT_SENT = "not sent";
const UNKNOWN = "unknown";
const DASH = "—";

const RISKS = Object.freeze(["unlikely", "risk", "high risk"]);

/** The text of a new record. */
export function newRecordText({ id, title, awareAt, openedAt, practice }) {
  const lines = [
    `# ${id}: ${title}`,
    "",
    ...(practice ? ["**This is a practice run. Nothing in it happened.**", ""] : []),
    "<!-- Fill this in as you go. Lines that start with \"- \" are read by the check: keep the name before the colon,",
    "     change only what comes after it. Times: 2026-11-22 14:05 means Romanian time; add Z or +02:00 for another zone.",
    "     Run `pnpm breach:register status` to see what is still owed. docs/operations/breach-runbook.md says what to do. -->",
    "",
    `- Record: ${id}`,
    "- Status: open",
    `- Opened: ${storedMoment(openedAt)}`,
    `- Aware: ${storedMoment(awareAt)}`,
    `- Happened: ${UNKNOWN}`,
    "<!-- Happened: when the breach itself took place, as a date, a period or your best estimate (\"about 20 November 2026\"). -->",
    `- People affected in all: ${UNKNOWN}`,
    "<!-- A number, or \"about 120\". -->",
    `- Risk to people: ${NOT_DECIDED}`,
    `<!-- One of: ${RISKS.join(" | ")}. Part 3 of the runbook is the test. -->`,
    `- Closed: ${DASH}`,
    `- Keep until: ${DASH}`,
    ""
  ];
  for (const [heading, hint] of SECTIONS) lines.push(`## ${heading}`, "", `<!-- ${hint} -->`, "", "");
  lines.push(
    "## Who we told",
    "",
    "<!-- One block per region. \"People affected here\": a number, \"about 40\", or 0 when nobody there is affected.",
    "     \"Authority\" and \"People\": told 2026-11-23 10:00   or   not required: the reason in one sentence.",
    "     \"Late because\": only when a telling came after the legal time limit. Keep a copy of everything you send",
    "     in this record's folder. -->",
    ""
  );
  for (const clock of BREACH_CLOCKS) {
    lines.push(
      `### ${clock.id}: ${clock.name}`,
      "",
      `- People affected here: ${UNKNOWN}`,
      `- Authority (${clock.authority.name}): ${NOT_DECIDED}`,
      `- People: ${NOT_DECIDED}`,
      ...(clock.finalReport === undefined ? [] : [`- Final report: ${NOT_SENT}`]),
      `- Late because: ${DASH}`,
      ""
    );
  }
  lines.push(
    "## Papers kept with this record",
    "",
    "<!-- The files in this folder: the notification as sent, the authority's receipt, the message to the people,",
    "     a provider's notice, screenshots. One line each. -->",
    ""
  );
  return `${lines.join("\n")}`;
}

/**
 * Text with the hints taken out. Taking one comment out can join the pieces around it into a new one
 * ("<!-<!-- x -->- y -->"), so it repeats until nothing changes: what is left holds no whole comment.
 */
function withoutComments(text) {
  let before;
  let after = text;
  do {
    before = after;
    after = before.replace(/<!--[\s\S]*?-->/gu, "");
  } while (after !== before);
  return after;
}

/** "- Name: value" lines of a block, as a map from the name to the value. A name written twice keeps the first. */
function facts(block) {
  const map = new Map();
  for (const line of block.split("\n")) {
    const match = /^- ([^:]+?):\s*(.*)$/u.exec(line.trimEnd());
    if (match !== null && !map.has(match[1])) map.set(match[1], match[2].trim());
  }
  return map;
}

/** A count of people: a whole number, "about N", or unknown. */
function readCount(value) {
  if (value === undefined || value === "" || value === UNKNOWN) return { known: false, count: null };
  const match = /^(?:about\s+)?(\d{1,9})$/u.exec(value);
  return match === null ? null : { known: true, count: Number(match[1]) };
}

/** "told <moment>", "sent <moment>", "not required: <reason>", or still open. */
function readTelling(value, openWord) {
  if (value === undefined || value === "" || value === openWord) return { state: "open" };
  const told = /^(?:told|sent)\s+(.+?)(?:\s+[—-]\s+.*)?$/u.exec(value);
  if (told !== null) {
    const at = parseMoment(told[1]);
    return at === null ? null : { state: "told", at };
  }
  const not = /^not required:\s*(.+)$/u.exec(value);
  if (not !== null) return { state: "not-required", reason: not[1] };
  return null;
}

/**
 * Reads a record's text. Returns { record, broken }: `broken` lists the lines the check could not read, in words a
 * person can act on. A record with broken lines is still returned as far as it could be read.
 */
export function readRecord(text) {
  const broken = [];
  const clean = withoutComments(text.replace(/\r\n?/gu, "\n"));
  const titleMatch = /^# ([A-Z]+-\d{4}-\d{3}): (.*)$/mu.exec(clean);
  if (titleMatch === null) broken.push("the first line must stay \"# <record number>: <title>\"");
  const firstSection = clean.search(/^## /mu);
  const top = facts(firstSection === -1 ? clean : clean.slice(0, firstSection));

  const moment = (name, optional) => {
    const value = top.get(name);
    if (value === undefined) { broken.push(`the line "- ${name}:" is missing`); return null; }
    if (optional && (value === DASH || value === "")) return null;
    const at = parseMoment(value);
    if (at === null) broken.push(`"- ${name}: ${value}" is not a time; write it like 2026-11-22 14:05`);
    return at;
  };
  const status = top.get("Status");
  if (status !== "open" && status !== "closed") broken.push("\"- Status:\" must be open or closed");
  const awareAt = moment("Aware", false);
  const openedAt = moment("Opened", false);
  const closedAt = moment("Closed", true);
  const people = readCount(top.get("People affected in all"));
  if (people === null) broken.push("\"- People affected in all:\" must be a number, \"about 120\" or unknown");
  const riskValue = top.get("Risk to people");
  const risk = riskValue === undefined || riskValue === NOT_DECIDED || riskValue === "" ? null : riskValue;
  if (risk !== null && !RISKS.includes(risk)) broken.push(`"- Risk to people:" must be one of: ${RISKS.join(", ")}, or ${NOT_DECIDED}`);
  const happenedValue = top.get("Happened");
  const happened = happenedValue === undefined || happenedValue === UNKNOWN || happenedValue === "" ? null : happenedValue;

  // Sections: the text under each "## heading", up to the next heading of the same level.
  const sections = new Map();
  const pieces = clean.split(/^## /mu).slice(1);
  for (const piece of pieces) {
    const newline = piece.indexOf("\n");
    sections.set((newline === -1 ? piece : piece.slice(0, newline)).trim(), newline === -1 ? "" : piece.slice(newline + 1));
  }
  const written = new Map();
  for (const [heading] of SECTIONS) {
    if (!sections.has(heading)) broken.push(`the heading "## ${heading}" is missing`);
    written.set(heading, (sections.get(heading) ?? "").trim());
  }

  const regions = new Map();
  const told = sections.get("Who we told");
  if (told === undefined) broken.push("the heading \"## Who we told\" is missing");
  const blocks = new Map();
  for (const piece of (told ?? "").split(/^### /mu).slice(1)) {
    const newline = piece.indexOf("\n");
    const head = newline === -1 ? piece : piece.slice(0, newline);
    blocks.set(head.split(":")[0].trim(), newline === -1 ? "" : piece.slice(newline + 1));
  }
  for (const clock of BREACH_CLOCKS) {
    const block = blocks.get(clock.id);
    if (block === undefined) { broken.push(`the block "### ${clock.id}: ..." under "Who we told" is missing`); continue; }
    const lines = facts(block);
    const find = (start) => [...lines.entries()].find(([name]) => name === start || name.startsWith(`${start} (`))?.[1];
    const count = readCount(find("People affected here"));
    if (count === null) broken.push(`${clock.id}: "People affected here" must be a number, "about 40" or unknown`);
    const authority = readTelling(find("Authority"), NOT_DECIDED);
    if (authority === null) broken.push(`${clock.id}: "Authority" must be: told 2026-11-23 10:00, or: not required: the reason, or: ${NOT_DECIDED}`);
    const peopleTold = readTelling(find("People"), NOT_DECIDED);
    if (peopleTold === null) broken.push(`${clock.id}: "People" must be: told 2026-11-23 10:00, or: not required: the reason, or: ${NOT_DECIDED}`);
    let finalReport;
    if (clock.finalReport !== undefined) {
      finalReport = readTelling(find("Final report"), NOT_SENT);
      if (finalReport === null) broken.push(`${clock.id}: "Final report" must be: sent 2026-12-20 10:00, or: not required: the reason, or: ${NOT_SENT}`);
    }
    const lateValue = find("Late because");
    regions.set(clock.id, {
      count: count ?? { known: false, count: null },
      authority: authority ?? { state: "open" },
      people: peopleTold ?? { state: "open" },
      finalReport: finalReport ?? (clock.finalReport === undefined ? undefined : { state: "open" }),
      lateBecause: lateValue === undefined || lateValue === DASH ? "" : lateValue
    });
  }

  return {
    record: {
      id: titleMatch?.[1] ?? top.get("Record") ?? "?", title: titleMatch?.[2] ?? "", status: status === "closed" ? "closed" : "open",
      awareAt, openedAt, closedAt, happened, people: people ?? { known: false, count: null }, risk,
      keepUntil: top.get("Keep until") ?? DASH, written, regions
    },
    broken
  };
}

/**
 * What is owed on a record at `now`.
 *  - late:    a time limit has passed and the line is still undecided. Act now.
 *  - next:    time limits still ahead, soonest first.
 *  - toClose: what `close` will ask for.
 * A region counts while its "People affected here" is not 0: an unknown number is treated as "may be affected".
 */
export function owed(record, now) {
  const late = [];
  const next = [];
  const toClose = [];
  if (record.awareAt === null) return { late, next, toClose };
  const target = new Date(record.awareAt.getTime() + WORKING_TARGET_HOURS * HOUR_MS);

  const due = (label, telling, deadline, source) => {
    const at = deadlineMoment(record.awareAt, deadline) ?? target;
    const kind = deadline.kind === "soon" ? `our own ${WORKING_TARGET_HOURS}-hour target; the law says "${deadline.words}"` : `the legal limit: ${deadline.words}`;
    if (telling.state === "open") {
      const line = `${label}: by ${showMoment(at)}, ${distance(now, at)} (${kind}; ${source})`;
      (now > at ? late : next).push({ at, line });
    }
    return at;
  };

  for (const clock of BREACH_CLOCKS) {
    const region = record.regions.get(clock.id);
    if (region === undefined) continue;
    if (!region.count.known) toClose.push(`${clock.id}: write how many people are affected there (0 when none)`);
    if (region.count.known && region.count.count === 0) continue;
    const authorityAt = due(`${clock.id}: decide about, and where required tell, ${clock.authority.name}`, region.authority, clock.authority.deadline, clock.source);
    const peopleAt = due(`${clock.id}: decide about, and where required tell, the people affected`, region.people, clock.people.deadline, clock.source);
    if (region.authority.state === "open") toClose.push(`${clock.id}: "Authority" is ${NOT_DECIDED}`);
    if (region.people.state === "open") toClose.push(`${clock.id}: "People" is ${NOT_DECIDED}`);
    if (clock.finalReport !== undefined && region.finalReport !== undefined) {
      if (region.authority.state === "told") {
        due(`${clock.id}: send the final report to ${clock.authority.name}`, region.finalReport, clock.finalReport.deadline, clock.source);
        if (region.finalReport.state === "open") toClose.push(`${clock.id}: "Final report" is ${NOT_SENT}`);
      }
    }
    const fixed = (deadline) => deadline.kind !== "soon";
    const wasLate = (region.authority.state === "told" && fixed(clock.authority.deadline) && region.authority.at > authorityAt)
      || (region.people.state === "told" && fixed(clock.people.deadline) && region.people.at > peopleAt);
    if (wasLate && region.lateBecause === "") {
      toClose.push(`${clock.id}: a telling came after the legal limit; write why on the line "Late because" (the law asks for the reason)`);
    }
  }

  if (record.happened === null) toClose.push("\"- Happened:\" is unknown; write the date, the period or your best estimate");
  if (!record.people.known) toClose.push("\"- People affected in all:\" is unknown");
  if (record.risk === null) toClose.push(`"- Risk to people:" is ${NOT_DECIDED}`);
  for (const [heading] of SECTIONS) {
    if ((record.written.get(heading) ?? "") === "") toClose.push(`the section "${heading}" is empty`);
  }
  late.sort((a, b) => a.at - b.at);
  next.sort((a, b) => a.at - b.at);
  return { late: late.map((entry) => entry.line), next: next.map((entry) => entry.line), toClose };
}

/** The day a closed record may be thrown away at the earliest: RECORD_KEEP_YEARS after it was closed. */
export function keepUntil(closedAt) {
  const [year, month, day] = ownerTime(closedAt).slice(0, 10).split("-").map(Number);
  // Through Date.UTC, so 29 February plus five years is 1 March and never a day that does not exist.
  return new Date(Date.UTC(year + RECORD_KEEP_YEARS, month - 1, day)).toISOString().slice(0, 10);
}

/** The record's text with its three closing lines set. The rest is left byte for byte as the person wrote it. */
export function closedText(text, closedAt) {
  const set = (source, name, value) => source.replace(new RegExp(`^- ${name}:.*$`, "mu"), `- ${name}: ${value}`);
  return set(set(set(text, "Status", "closed"), "Closed", storedMoment(closedAt)), "Keep until", keepUntil(closedAt));
}

