import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileCrisisPattern, detectCrisis, normalizeForCrisisCheck, normalizeKeepingAccents } from "@debateai/contract";
import { CRISIS_LEXICONS } from "../../packages/contract/src/crisis-lexicon/index.js";

/* Crisis check, detection baseline (NV-28, NV-29): which patterns match every fixture question
   and every practice reply, and what detectCrisis answers, recorded once from the unchanged
   lexicons. A lexicon edit that only bounds a repetition, respells a range or drops a redundant
   alternative must leave every row as it was. A failure here is a detection change: fix the
   lexicon edit, never the baseline. */

type Fixture = Readonly<{ language: string; positive: readonly string[]; negative: readonly string[] }>;
type Row = readonly [sha: string, detect: string | null, matches: readonly string[]];
type Baseline = Readonly<{ patterns: number; rows: Readonly<Record<string, Row>> }>;

const BASELINE = new URL("./fixtures/crisis-detection-baseline.json", import.meta.url);
const FIXTURE_DIRECTORY = new URL("./crisis-check-fixtures/", import.meta.url);
const PRACTICE_REPLIES = new URL("../support/fixtures/reply-language/practice-2026-10-12-replies.json", import.meta.url);
const UPDATE = process.env.CRISIS_DETECTION_BASELINE_UPDATE === "1";

const fixtures: readonly Fixture[] = readdirSync(FIXTURE_DIRECTORY)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(new URL(name, FIXTURE_DIRECTORY), "utf8")) as Fixture);

const practiceReplies: readonly string[] = (JSON.parse(readFileSync(PRACTICE_REPLIES, "utf8")) as {
  replies: readonly { content: string }[];
}).replies.map((reply) => reply.content);

function textsOf(group: string): readonly (readonly [key: string, text: string])[] {
  if (group === "practice") return practiceReplies.map((text, i) => [`practice.${i}`, text] as const);
  const fixture = fixtures.find((candidate) => candidate.language === group)!;
  return [
    ...fixture.positive.map((text, i) => [`${group}.positive.${i}`, text] as const),
    ...fixture.negative.map((text, i) => [`${group}.negative.${i}`, text] as const)
  ];
}

const groups = (): readonly string[] => [...fixtures.map((fixture) => fixture.language), "practice"];

let compiled: readonly { key: string; pattern: RegExp; keepAccents: boolean }[] | undefined;
function patterns(): NonNullable<typeof compiled> {
  compiled ??= CRISIS_LEXICONS.flatMap((lexicon) => lexicon.patterns.map((entry, index) => ({
    key: `${lexicon.language}#${index}`,
    pattern: compileCrisisPattern(entry.pattern, entry.accents),
    keepAccents: entry.accents === "keep"
  })));
  return compiled;
}

function rowOf(text: string): Row {
  const normalized = normalizeForCrisisCheck(text);
  const accented = normalizeKeepingAccents(text);
  const check = detectCrisis(text);
  return [
    createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16),
    check.crisis ? `${check.signal}/${check.language}` : null,
    patterns().filter((entry) => entry.pattern.test(entry.keepAccents ? accented : normalized)).map((entry) => entry.key)
  ];
}

function rowsOf(group: string): Record<string, Row> {
  return Object.fromEntries(textsOf(group).map(([key, text]) => [key, rowOf(text)]));
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function readBaseline(): Baseline {
  if (!existsSync(BASELINE)) {
    throw new Error("tests/unit/fixtures/crisis-detection-baseline.json is missing: it is generated once, from the "
      + "unchanged lexicons, with CRISIS_DETECTION_BASELINE_UPDATE=1 (NV-28 Step 1)");
  }
  return JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
}

describe("crisis check — detection baseline (NV-28, NV-29)", () => {
  if (UPDATE) {
    it("writes the baseline once, from the unchanged lexicons", () => {
      if (existsSync(BASELINE)) throw new Error("baseline exists: compare, never regenerate (NV-28 Step 1)");
      const rows = Object.assign({}, ...groups().map(rowsOf)) as Record<string, Row>;
      const baseline: Baseline = { patterns: patterns().length, rows };
      // "wx": never overwrites, even if the file appeared since the check above.
      writeFileSync(BASELINE, `${JSON.stringify(sortedKeys(baseline), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    }, 600_000);
    return;
  }

  it("records 2,118 texts over 1,569 patterns, each detected exactly when some pattern matches", () => {
    const baseline = readBaseline();
    const rows = Object.values(baseline.rows);
    expect(rows.length).toBe(2_118);
    expect(groups().reduce((sum, group) => sum + textsOf(group).length, 0)).toBe(2_118);
    expect(baseline.patterns).toBe(1_569);
    expect(patterns().length).toBe(baseline.patterns);
    expect(Object.entries(baseline.rows)
      .filter(([, [, detect, matches]]) => (detect === null) !== (matches.length === 0))
      .map(([key]) => key)).toEqual([]);
  });

  for (const group of groups()) {
    it(`${group}: every text matches the same patterns and gets the same answer`, () => {
      const baseline = readBaseline();
      const expected = Object.fromEntries(Object.entries(baseline.rows).filter(([key]) => key.startsWith(`${group}.`)));
      expect(rowsOf(group)).toEqual(expected);
    });
  }
});
