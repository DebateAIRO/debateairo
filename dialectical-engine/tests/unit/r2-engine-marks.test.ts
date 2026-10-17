import { readdirSync, readFileSync } from "node:fs";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { ConditionMarkRecordSchema, ConditionMarkSchema } from "@debateai/contract";
import { CONDITION_MARKS, ENGINE_MARKS } from "@debateai/kernel";
import { assertRequiredConditionMarkRecords, resolveTrueUnjudgedReasons, type ConditionMarkRecord } from "@debateai/serve";
import { conditionMarkLabel } from "../../apps/ui/lib/v3/labels.js";

/** The 46 marks before R2, in their order (engine 1's vocabulary, unchanged by R2 apart from the four insertions). */
const BEFORE_R2 = ["UNINSTRUMENTED", "UNFALSIFIED-AFTER-ROTATION", "SKIPPED-BY-BUDGET", "ENVELOPE_EXHAUSTED", "LEVERAGE_UNRESOLVED",
  "BRANCH-FROZEN-LOW-LEVERAGE", "DEGRADED-DIVERSITY", "BACKUP-MODEL-USED", "SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE", "PANEL-PARTIAL",
  "PANEL-DEGRADED-SINGLE-VOICE", "MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK", "MAP_UNAVAILABLE_TODAYS_OPENING",
  "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED", "PANEL-CLOSE-CALL-EXTENDED", "SCRUTINY-EXTENDED", "AMBIGUOUS_ATTRIBUTION", "STALE",
  "UNDER-REVIEW", "UNDER-EXPLORED", "UNRESOLVED-TYPE-FALLBACK", "DEFECT", "UNPRICED", "UNADJUDICATED", "UNCOVERED-SCOPE",
  "UNSERVED-MAKER-POSITION", "NON-COMPARABLE", "NOT_SAMPLED", "OFF-SUBJECT-DOWNGRADE", "WAY-OF-KNOWING-DOWNGRADED", "AMENDED-SEARCH",
  "MISSING-NUMBER", "LABEL-BASIS-INCOMPLETE", "OWED-CHECK-UNEXECUTED", "SYNTHESIS-OBJECTION-STANDING", "DIGEST-COMPRESSED",
  "DIGEST-CANNOT-EXIST", "PROTECTED-CORE-GUARD-RETIRED", "HIDDEN-UNJUDGEABLE", "DERIVED-STANDING-UNREVIEWED", "HIDDEN-LOW-SCORE",
  "UNAUTHORED-BRANCH-HALTED"];
const KEYS = ["debateChrome.condition.verdictJudgeMissing", "debateChrome.condition.verdictJudgesUnavailable",
  "debateChrome.condition.verdictVotesIgnored", "debateChrome.condition.unassessedAtReducedWeight"] as const;
// pre-flight PF-R2a3.8: folders only, so a Finder `.DS_Store` never reads as a locale.
const LOCALES = readdirSync("apps/ui/messages", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const chrome = (locale: string) =>
  JSON.parse(readFileSync(`apps/ui/messages/${locale}/debateChrome.json`, "utf8")) as Record<string, string>;
const unassessed = (more: Partial<ConditionMarkRecord> = {}): ConditionMarkRecord => ({
  mark: "UNASSESSED-AT-REDUCED-WEIGHT", scope: "node", subjectRef: "node-p", reason: "UNASSESSED_AT_REDUCED_WEIGHT:0.66",
  liftPath: null, servedRootRule: null, affectedNodeIds: ["node-p"], reviewOutcome: "cannot-assess", ...more
});
/** A TypedDomainError carries its code on `code`, not in its message. */
const code = (value: string) => expect.objectContaining({ code: value });
/** A ledger that holds one review for `node-p`, with the given outcome. */
const ledgerWith = (outcome: string): Pool => ({
  query: async () => ({ rows: [{ node_review_id: "review-1", node_id: "node-p", outcome }] })
}) as unknown as Pool;

describe("R2: the four engine marks (spec §4.7, §4.2a; INTERFACE §13)", () => {
  it("sit mid-list right before PANEL-PARTIAL, in ENGINE_MARKS order; the DR-176 tail is untouched", () => {
    expect(ENGINE_MARKS).toEqual(["VERDICT-JUDGE-MISSING", "VERDICT-JUDGES-UNAVAILABLE", "VERDICT-VOTES-IGNORED", "UNASSESSED-AT-REDUCED-WEIGHT"]);
    expect(Object.isFrozen(ENGINE_MARKS)).toBe(true);
    const at = CONDITION_MARKS.indexOf("PANEL-PARTIAL");
    expect(CONDITION_MARKS.slice(at - ENGINE_MARKS.length, at)).toEqual([...ENGINE_MARKS]);
    expect(CONDITION_MARKS.slice(-4)).toEqual(["HIDDEN-UNJUDGEABLE", "DERIVED-STANDING-UNREVIEWED", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"]);
    expect(CONDITION_MARKS).toHaveLength(50);
  });

  it("engine 1 pin: every mark from before R2 keeps its relative order", () => {
    expect(CONDITION_MARKS.filter((mark) => !(ENGINE_MARKS as readonly string[]).includes(mark))).toEqual(BEFORE_R2);
  });

  it("are wire vocabulary", () => {
    for (const mark of ENGINE_MARKS) expect(ConditionMarkSchema.parse(mark)).toBe(mark);
  });

  it.each(ENGINE_MARKS)("%s needs its typed record on the answer", (mark) => {
    expect(() => assertRequiredConditionMarkRecords([mark], [])).toThrowError(code("CONDITION_MARK_RECORD_REQUIRED"));
  });

  // R2a final wave B5 (Ruling (A7 Minors) 2): each of the three verdict marks, not only the first.
  it.each(["VERDICT-JUDGE-MISSING", "VERDICT-JUDGES-UNAVAILABLE", "VERDICT-VOTES-IGNORED"] as const)("accepts an answer-scope %s record", (mark) => {
    const record: ConditionMarkRecord = { mark, scope: "answer", subjectRef: "root-a",
      reason: `${mark.replaceAll("-", "_")}:1`, liftPath: null, servedRootRule: null, affectedNodeIds: ["root-a"] };
    expect(() => assertRequiredConditionMarkRecords([mark], [record])).not.toThrow();
    // The record is what satisfies the mark: without it the same mark is refused (the row above).
    expect(() => assertRequiredConditionMarkRecords([mark], [])).toThrowError(code("CONDITION_MARK_RECORD_REQUIRED"));
  });

  it("binds the reduced-weight record to its cannot-assess review, and to nothing else", () => {
    expect(() => assertRequiredConditionMarkRecords(["UNASSESSED-AT-REDUCED-WEIGHT"], [unassessed()])).not.toThrow();
    for (const broken of [{ reviewOutcome: null }, { terminalTransportOutcome: "FAILED" as const }, { callSiteKey: "JUDGE:review:x" },
      { excludedFromServedNumber: false }, { judgedBasisCount: 1 }]) {
      expect(() => assertRequiredConditionMarkRecords(["UNASSESSED-AT-REDUCED-WEIGHT"], [unassessed(broken)]), JSON.stringify(broken))
        .toThrowError(code("UNASSESSED_CONDITION_MARK_RECORD_INVALID"));
    }
  });

  // R2a A7 review Minor 3, carried to R2b B4: the read side refuses what serve's write side refuses
  // (UNASSESSED_CONDITION_MARK_RECORD_INVALID), so a stored or projected record cannot slip past the contract.
  it("the contract reads the reduced-weight record by the same rule serve writes it", () => {
    const wire = (more: Record<string, unknown> = {}) => ({
      mark: "UNASSESSED-AT-REDUCED-WEIGHT", scope: "node", subject_ref: "node-p", reason: "UNASSESSED_AT_REDUCED_WEIGHT:0.66",
      lift_path: null, served_root_rule: null, affected_node_ids: ["node-p"], review_outcome: "cannot-assess", ...more
    });
    expect(ConditionMarkRecordSchema.safeParse(wire()).success).toBe(true);
    for (const broken of [{ review_outcome: null }, { terminal_transport_outcome: "FAILED" }, { call_site_key: "JUDGE:review:x" },
      { excluded_from_served_number: false }, { judged_basis_count: 1 }]) {
      expect([broken, ConditionMarkRecordSchema.safeParse(wire(broken)).success]).toEqual([broken, false]);
    }
  });

  it("resolves the record's review from the ledger, and refuses a review that said something else", async () => {
    await expect(resolveTrueUnjudgedReasons(ledgerWith("cannot-assess"), "run-1", [unassessed()]))
      .resolves.toEqual([{ reviewRef: "review-1", reviewNodeRef: "node-p" }]);
    await expect(resolveTrueUnjudgedReasons(ledgerWith("agree"), "run-1", [unassessed()]))
      .rejects.toMatchObject({ code: "CONDITION_MARK_REVIEW_REASON_UNTRUE" });
  });

  it("each has its own plain label (option 1), with no engine words", () => {
    expect(ENGINE_MARKS.map((mark) => conditionMarkLabel(mark))).toEqual([
      "One of the AI models comparing the answers could not give its view",
      "No AI model could compare the answers, so the verdict rests on the arguments alone",
      "Each AI model that compared the answers chose one argued by its own maker, so those choices were not counted",
      "A second AI model could not check this point, so it counts for less"
    ]);
    const labels = CONDITION_MARKS.map((mark) => conditionMarkLabel(mark));
    expect(new Set(labels).size).toBe(CONDITION_MARKS.length);
    for (const mark of ENGINE_MARKS) {
      for (const word of ["judge", "vote", "score", "weight", "node", "engine", "assess"]) {
        expect(conditionMarkLabel(mark).toLowerCase()).not.toContain(word);
      }
    }
  });

  it("are worded in all 35 languages, each different from English and from each other", () => {
    expect(LOCALES).toHaveLength(35);
    const english = chrome("en");
    for (const locale of LOCALES) {
      const words = KEYS.map((key) => chrome(locale)[key]);
      for (const [index, key] of KEYS.entries()) {
        const text = words[index];
        expect(typeof text === "string" && text.trim().length > 0, `${locale} ${key}`).toBe(true);
        if (locale !== "en") expect(text, `${locale} ${key}`).not.toBe(english[key]);
      }
      expect(new Set(words).size, locale).toBe(KEYS.length);
    }
  });
});
