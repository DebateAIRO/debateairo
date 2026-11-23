import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW, countryPolicyFromValue } from "@debateai/register";
import { run } from "../../tools/breach-register/cli.mjs";
import { BREACH_CLOCKS, RECORD_KEEP_YEARS, WORKING_TARGET_HOURS, deadlineMoment } from "../../tools/breach-register/clocks.mjs";
import { RECORD_FILE, SECTIONS, readRecord } from "../../tools/breach-register/record.mjs";
import { parseMoment, showMoment, storedMoment } from "../../tools/breach-register/time.mjs";

// The breach register's tool (docs/operations/breach-runbook.md). Three things are held here:
//  - the clocks cover every country the site lets sign up, and the table a person reads says the same as the tool;
//  - a time is read and counted the same way every time, across a clock change too;
//  - a record cannot be closed while something the law asks for is missing, and a hint never counts as an answer.
// Every run uses a scratch register in the system's temporary folder: no record of a real breach is ever in this repository.

const CLOCKS_DOC = "docs/legal-research/assessments/breach-clocks.md";
const RUNBOOK = "docs/operations/breach-runbook.md";

let register: string;

beforeEach(() => { register = mkdtempSync(join(tmpdir(), "breach-register-")); });
afterEach(() => { rmSync(register, { recursive: true, force: true }); });

type Result = Readonly<{ code: number; text: string }>;

function tool(args: readonly string[], env: Record<string, string | undefined> = {}): Result {
  const lines: string[] = [];
  const code = run(args, { env, now: () => new Date("2026-11-22T13:00:00Z"), out: (...text) => { lines.push(...text); } });
  return { code, text: lines.join("\n") };
}

const open = (aware = "2026-11-22 14:05", extra: readonly string[] = []): Result =>
  tool(["open", "--register", register, "--aware", aware, "--title", "A made-up breach", ...extra]);

const recordPath = (id: string): string => join(register, id, RECORD_FILE);

/** Rewrites one "- Name: value" line of a record; the block is named for the lines that repeat per region. */
function setLine(id: string, name: string, value: string, block?: string): void {
  const text = readFileSync(recordPath(id), "utf8");
  const from = block === undefined ? 0 : text.indexOf(`### ${block}:`);
  expect(from, `block ${block ?? "(top)"}`).toBeGreaterThanOrEqual(0);
  const rest = text.slice(from);
  const pattern = new RegExp(`^- ${name}(?: \\(.*?\\))?:.*$`, "mu");
  expect(pattern.test(rest), `line "- ${name}:"`).toBe(true);
  writeFileSync(recordPath(id), text.slice(0, from) + rest.replace(pattern, (line) => `${line.slice(0, line.indexOf(":"))}: ${value}`));
}

/** Writes a sentence under every section a person must fill in. */
function writeSections(id: string): void {
  let text = readFileSync(recordPath(id), "utf8");
  for (const [heading] of SECTIONS) text = text.replace(`## ${heading}\n`, `## ${heading}\n\nA made-up sentence for the test.\n`);
  writeFileSync(recordPath(id), text);
}

/** A record with nobody affected anywhere but the EEA, everything decided, ready to close. */
function completeRecord(id: string, authority: string): void {
  writeSections(id);
  setLine(id, "Happened", "about 20 November 2026");
  setLine(id, "People affected in all", "about 12");
  setLine(id, "Risk to people", "risk");
  for (const clock of BREACH_CLOCKS) setLine(id, "People affected here", clock.id === "EEA" ? "12" : "0", clock.id);
  setLine(id, "Authority", authority, "EEA");
  setLine(id, "People", "not required: the risk is not high, because the data was encrypted and the keys were not taken", "EEA");
}

describe("the clocks", () => {
  const policy = countryPolicyFromValue(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value, COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef);
  const open_ = Object.entries(policy.countries).filter(([, rule]) => rule.signup).map(([code]) => code).sort();
  const covered = BREACH_CLOCKS.flatMap((clock) => [...clock.countries]);

  it("cover every country the country policy lets sign up", () => {
    expect(policy.defaultRule.signup).toBe(false);
    expect(open_.length).toBeGreaterThan(30);
    expect(open_.filter((code) => !covered.includes(code))).toEqual([]);
  });

  it("name no country that is closed, so a clock is never kept for a place we do not serve", () => {
    expect([...new Set(covered)].filter((code) => !open_.includes(code))).toEqual([]);
  });

  it("have one id each, and a time limit that is a number or the law's own words", () => {
    expect(new Set(BREACH_CLOCKS.map((clock) => clock.id)).size).toBe(BREACH_CLOCKS.length);
    for (const clock of BREACH_CLOCKS) {
      for (const deadline of [clock.authority.deadline, clock.people.deadline, ...(clock.finalReport === undefined ? [] : [clock.finalReport.deadline])]) {
        expect(deadline.words.length, clock.id).toBeGreaterThan(5);
        if (deadline.kind !== "soon") expect(deadline.amount, clock.id).toBeGreaterThan(0);
      }
    }
  });

  it("are each a row of the table a person reads, with the same number in it", () => {
    const rows = readFileSync(CLOCKS_DOC, "utf8").split("\n").filter((line) => line.startsWith("|"));
    for (const clock of BREACH_CLOCKS) {
      const row = rows.find((line) => line.includes(`\`${clock.id}\``));
      expect(row, `a row holding \`${clock.id}\` in ${CLOCKS_DOC}`).toBeDefined();
      for (const deadline of [clock.authority.deadline, clock.people.deadline, ...(clock.finalReport === undefined ? [] : [clock.finalReport.deadline])]) {
        if (deadline.kind !== "soon") expect(row, `${clock.id}: ${deadline.amount} ${deadline.kind}`).toContain(`${deadline.amount} ${deadline.kind}`);
      }
    }
  });

  it("count a fixed limit from the moment of awareness, and give no date where the law gives only words", () => {
    const aware = new Date("2026-11-22T12:05:00Z");
    expect(deadlineMoment(aware, { kind: "hours", amount: 72, words: "72 hours" })?.toISOString()).toBe("2026-11-25T12:05:00.000Z");
    expect(deadlineMoment(aware, { kind: "days", amount: 30, words: "30 days" })?.toISOString()).toBe("2026-12-22T12:05:00.000Z");
    expect(deadlineMoment(aware, { kind: "soon", words: "as soon as feasible" })).toBeNull();
  });
});

describe("a time", () => {
  it("without a zone is Romanian time, in winter and in summer", () => {
    expect(parseMoment("2026-11-22 14:05")?.toISOString()).toBe("2026-11-22T12:05:00.000Z");
    expect(parseMoment("2026-07-01T14:05")?.toISOString()).toBe("2026-07-01T11:05:00.000Z");
  });

  it("with a zone is taken as written", () => {
    expect(parseMoment("2026-11-22 14:05Z")?.toISOString()).toBe("2026-11-22T14:05:00.000Z");
    expect(parseMoment("2026-11-22T14:05:30-05:00")?.toISOString()).toBe("2026-11-22T19:05:30.000Z");
  });

  it("is refused when it is not a moment", () => {
    for (const text of ["", "yesterday", "2026-02-30 10:00", "2026-13-01 10:00", "2026-11-22", "2026-11-22 25:00", "22.11.2026 14:05"]) {
      expect(parseMoment(text), text).toBeNull();
    }
  });

  it("is stored with its offset and read back as the same instant, across the October clock change", () => {
    for (const iso of ["2026-10-24T23:30:00Z", "2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z", "2026-03-29T00:59:00Z", "2026-03-29T01:00:00Z"]) {
      const at = new Date(iso);
      expect(parseMoment(storedMoment(at))?.toISOString(), storedMoment(at)).toBe(at.toISOString());
    }
    expect(showMoment(new Date("2026-11-22T12:05:00Z"))).toBe("2026-11-22 14:05 Romanian time (2026-11-22 12:05 UTC)");
  });
});

describe("open", () => {
  it("writes a numbered record with every region's block, and numbers the next one after it", () => {
    const first = open();
    expect(first.code, first.text).toBe(0);
    expect(first.text).toContain("Opened BR-2026-001");
    expect(open().text).toContain("Opened BR-2026-002");
    const { record, broken } = readRecord(readFileSync(recordPath("BR-2026-001"), "utf8"));
    expect(broken).toEqual([]);
    expect(record.status).toBe("open");
    expect(record.awareAt?.toISOString()).toBe("2026-11-22T12:05:00.000Z");
    expect([...record.regions.keys()]).toEqual(BREACH_CLOCKS.map((clock) => clock.id));
  });

  it("numbers by the year we became aware, and keeps practice runs in a series of their own", () => {
    expect(open("2025-12-31 23:50").text).toContain("Opened BR-2025-001");
    const drill = open("2026-11-22 14:05", ["--practice"]);
    expect(drill.text).toContain("Opened DRILL-2026-001");
    expect(readFileSync(recordPath("DRILL-2026-001"), "utf8")).toContain("This is a practice run");
    expect(open().text).toContain("Opened BR-2026-001");
  });

  it("prints the fixed 72-hour limit as a date in Romanian time and in UTC", () => {
    expect(open().text).toContain("2026-11-25 14:05 Romanian time (2026-11-25 12:05 UTC)");
  });

  it("refuses a register inside a Git repository, so a record is never committed", () => {
    const inRepo = tool(["open", "--register", "docs", "--aware", "2026-11-22 14:05", "--title", "x"]);
    expect(inRepo.code).toBe(2);
    expect(inRepo.text).toContain("inside a Git repository");
    mkdirSync(join(register, "papers", ".git"), { recursive: true });
    mkdirSync(join(register, "papers", "breaches"));
    const nested = tool(["open", "--register", join(register, "papers", "breaches"), "--aware", "2026-11-22 14:05", "--title", "x"]);
    expect(nested.code).toBe(2);
    expect(readdirSync(join(register, "papers", "breaches"))).toEqual([]);
  });

  it("refuses a folder that does not exist, a register that is not named, a future time and a mistyped option", () => {
    expect(tool(["open", "--register", join(register, "typo"), "--aware", "2026-11-22 14:05", "--title", "x"]).text).toContain("does not exist");
    expect(existsSync(join(register, "typo"))).toBe(false);
    expect(tool(["open", "--aware", "2026-11-22 14:05", "--title", "x"]).text).toContain("Name the register's folder");
    expect(tool(["open", "--aware", "2026-11-22 14:05", "--title", "x"], { BREACH_REGISTER_DIR: register }).code).toBe(0);
    expect(open("2026-11-23 14:05").text).toContain("in the future");
    expect(open("2026-11-22 14:05", ["--aware", "2026-11-22 14:06"]).code).toBe(2);
    expect(tool(["open", "--register", register, "--awre", "2026-11-22 14:05", "--title", "x"]).code).toBe(2);
    expect(tool(["open", "--register", register, "--aware", "22.11.2026", "--title", "x"]).text).toContain("is not a time");
    expect(tool([]).code).toBe(2);
  });
});

describe("status", () => {
  const at = (now: string, ...extra: string[]): Result => tool(["status", "--register", register, "--now", now, ...extra]);

  it("lists what comes next while the limits are ahead, and exits 0", () => {
    open();
    const result = at("2026-11-23 09:00");
    expect(result.code, result.text).toBe(0);
    expect(result.text).toContain("Next:");
    expect(result.text).not.toContain("LATE");
    expect(result.text).toContain("1 open, 0 closed");
  });

  it("says LATE and exits 1 once a limit has passed with the line still undecided", () => {
    open();
    const result = at("2026-11-25 14:06");
    expect(result.code).toBe(1);
    expect(result.text).toContain("LATE");
    expect(result.text).toMatch(/EEA: decide about, and where required tell, ANSPDCP.*the legal limit/u);
  });

  it("calls a limit the law gives only in words our own target, never the legal limit", () => {
    open();
    const line = at("2026-11-23 09:00").text.split("\n").find((text) => text.includes("EEA: decide about, and where required tell, the people affected"));
    expect(line).toContain(`our own ${WORKING_TARGET_HOURS}-hour target`);
    expect(line).toContain("without undue delay");
  });

  it("drops a region once nobody there is affected, and a decided line is no longer owed", () => {
    open();
    for (const clock of BREACH_CLOCKS) setLine("BR-2026-001", "People affected here", clock.id === "EEA" ? "about 12" : "0", clock.id);
    setLine("BR-2026-001", "Authority", "told 2026-11-23 10:00", "EEA");
    setLine("BR-2026-001", "People", "not required: the risk is not high", "EEA");
    const result = at("2026-11-27 09:00");
    expect(result.code, result.text).toBe(0);
    expect(result.text).not.toContain("LATE");
    expect(result.text).not.toContain("Next:");
  });

  it("reports a line it cannot read in words, and exits 1", () => {
    open();
    setLine("BR-2026-001", "Authority", "told on Monday", "EEA");
    setLine("BR-2026-001", "Risk to people", "medium");
    setLine("BR-2026-001", "People affected in all", "a few");
    const result = at("2026-11-23 09:00");
    expect(result.code).toBe(1);
    expect(result.text).toContain("CANNOT READ");
    expect(result.text).toContain("EEA: \"Authority\" must be");
    expect(result.text).toContain("\"- Risk to people:\" must be one of");
    expect(result.text).toContain("\"- People affected in all:\" must be a number");
  });

  it("reports a record folder whose page is gone", () => {
    open();
    rmSync(recordPath("BR-2026-001"));
    const result = at("2026-11-23 09:00");
    expect(result.code).toBe(1);
    expect(result.text).toContain("record.md is missing");
  });
});

describe("close", () => {
  const close = (now = "2026-11-30 10:00"): Result => tool(["close", "--register", register, "--id", "BR-2026-001", "--now", now]);

  it("refuses a fresh record and names every missing thing; a hint is not an answer", () => {
    open();
    const result = close();
    expect(result.code).toBe(1);
    for (const [heading] of SECTIONS) expect(result.text).toContain(`the section "${heading}" is empty`);
    expect(result.text).toContain("\"- Risk to people:\" is not decided");
    expect(result.text).toContain("\"- Happened:\" is unknown");
    expect(readFileSync(recordPath("BR-2026-001"), "utf8")).toContain("- Status: open");
  });

  it("does not take a hint for an answer when one comment is wrapped around another", () => {
    open();
    const text = readFileSync(recordPath("BR-2026-001"), "utf8");
    writeFileSync(recordPath("BR-2026-001"), text.replace("## What happened\n", "## What happened\n\n<!-<!-- inner -->- outer -->\n"));
    const { record } = readRecord(readFileSync(recordPath("BR-2026-001"), "utf8"));
    expect(record.written.get("What happened")).toBe("");
    expect(close().text).toContain("the section \"What happened\" is empty");
  });

  it("refuses while a region's number of people is unknown", () => {
    open();
    completeRecord("BR-2026-001", "told 2026-11-23 10:00");
    setLine("BR-2026-001", "People affected here", "unknown", BREACH_CLOCKS.at(-1)!.id);
    const result = close();
    expect(result.code).toBe(1);
    expect(result.text).toContain(`${BREACH_CLOCKS.at(-1)!.id}: write how many people are affected there`);
  });

  it("closes a complete record: status, the closing time and keep-until change, and nothing else", () => {
    open();
    completeRecord("BR-2026-001", "told 2026-11-23 10:00");
    const before = readFileSync(recordPath("BR-2026-001"), "utf8");
    const result = close();
    expect(result.code, result.text).toBe(0);
    const after = readFileSync(recordPath("BR-2026-001"), "utf8");
    expect(after).toContain("- Status: closed");
    expect(after).toContain("- Closed: 2026-11-30T10:00+02:00");
    expect(after).toContain(`- Keep until: ${2026 + RECORD_KEEP_YEARS}-11-30`);
    const changed = after.split("\n").filter((line, index) => line !== before.split("\n")[index]);
    expect(changed.map((line) => line.split(":")[0])).toEqual(["- Status", "- Closed", "- Keep until"]);
    expect(close().text).toContain("already closed");
    const status = tool(["status", "--register", register, "--now", "2026-12-01 10:00"]);
    expect(status.code).toBe(0);
    expect(status.text).toContain("0 open, 1 closed");
  });

  it("asks for the reason when an authority was told after its legal limit, and closes once it is written", () => {
    open();
    completeRecord("BR-2026-001", "told 2026-11-26 10:00");
    const refused = close();
    expect(refused.code).toBe(1);
    expect(refused.text).toContain("EEA: a telling came after the legal limit");
    setLine("BR-2026-001", "Late because", "the hosting company confirmed which accounts were read only on 26 November", "EEA");
    expect(close().code).toBe(0);
  });

  it("does not ask for a reason when the people were told after our own target, which is not a legal limit", () => {
    open();
    completeRecord("BR-2026-001", "told 2026-11-23 10:00");
    setLine("BR-2026-001", "People", "told 2026-11-27 10:00", "EEA");
    expect(close().code).toBe(0);
  });

  it("refuses a record that is not there", () => {
    expect(tool(["close", "--register", register, "--id", "BR-2026-009"]).code).toBe(2);
    expect(tool(["close", "--register", register, "--id", "../x"]).code).toBe(2);
  });
});

describe("the runbook and the command", () => {
  it("the runbook names every section of a record, so its law table and the record cannot drift apart", () => {
    const runbook = readFileSync(RUNBOOK, "utf8");
    for (const [heading] of SECTIONS) expect(runbook, heading).toContain(heading);
    for (const clock of BREACH_CLOCKS) expect(runbook, clock.id).toContain(`\`${clock.id}\``);
  });

  it("runs as `pnpm breach:register`, and as plain node with nothing installed", () => {
    const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["breach:register"]).toBe("node tools/breach-register/cli.mjs");
    const out = execFileSync(process.execPath, ["tools/breach-register/cli.mjs", "clocks", "--aware", "2026-11-22 14:05"], { encoding: "utf8" });
    for (const clock of BREACH_CLOCKS) expect(out).toContain(`${clock.id}: ${clock.name}`);
    for (const file of readdirSync("tools/breach-register").filter((name) => name.endsWith(".mjs"))) {
      const imports = [...readFileSync(join("tools/breach-register", file), "utf8").matchAll(/^import .* from "([^"]+)";$/gmu)].map((match) => match[1]!);
      expect(imports.filter((name) => !name.startsWith("node:") && !name.startsWith("./")), file).toEqual([]);
    }
  });
});
