import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectArgumentLanguage } from "@debateai/kernel";
import {
  OPENINGS_ARMS,
  OPENINGS_QUESTIONS,
  openingsArmsFromFlag,
  openingsQuestionDigests,
  openingsQuestionsFromFlag
} from "../../tools/preview-practice/practice-openings-questions.js";
import {
  OPENINGS_FILE,
  OPENINGS_SCHEMA,
  OpeningsLog,
  openingsReportFromLog,
  parseOpeningsLog,
  readOpeningsLog,
  type OpeningsArmLine,
  type OpeningsCall,
  type OpeningsLogLine
} from "../../tools/preview-practice/practice-openings-log.js";
import { reportMarkdown } from "../../tools/preview-practice/practice-report.js";
import { reportableReplyText } from "../../tools/preview-practice/practice-redaction.js";

const T0 = "2026-10-12T10:00:00.000Z";
const T1 = "2026-10-12T10:00:02.000Z";
const call = (overrides: Partial<OpeningsCall> = {}): OpeningsCall => ({
  arm: "C", questionId: "ro-euro", step: "LIST", callSiteKey: "MAP:list:0", aiRef: "ref-1", model: "m-1", maker: "maker-1",
  gate: "deepinfra", shown: "BLIND", order: 1, startedAt: T0, finishedAt: T1, latencyMs: 1_000, inputTokens: 100, outputTokens: 50,
  reasoningTokens: null, cachedInputTokens: null, costNanoUsd: "1000", status: "ACCEPTED", errorCode: null,
  attempts: [{ callSiteKey: "MAP:list:0", outcome: "OK", parseStatus: "PARSED", latencyMs: 1_000, jsonRepair: null, replyForm: "ORIGINAL" }],
  replyForm: "ORIGINAL", replyText: "REPLY-TEXT-NEVER-IN-MARKDOWN", ...overrides });
const armLine: OpeningsArmLine = { arm: "C", questionId: "ro-euro", startedAt: T0, finishedAt: T1, outcome: "MAP", positions: 0,
  marks: [{ mark: "ANSWERS_FILLED", step: "CHOOSE", detail: "TEMPLATE" }], notes: [{ note: "GAP_STOPPED", step: "GAP", detail: "round 1: 1 new" }], map: null };
type StartLine = Extract<OpeningsLogLine, { kind: "start" }>;
const start: StartLine = { kind: "start", schema: OPENINGS_SCHEMA, mode: "openings", dry: true, startedAt: T0, models: ["m-1", "m-2"],
  questions: ["ro-euro"], questionDigests: [{ id: "ro-euro", sha256: "c8bfeeb3fb29" }], arms: ["C"], busyWaitMs: 0,
  unsentStreakAtStart: { deepinfra: 0, anthropic: 0 }, remainingBefore: { deepinfra: null, anthropic: null } };
const end: OpeningsLogLine = { kind: "end", finishedAt: T1, interrupted: false, remainingAfter: { deepinfra: null, anthropic: null } };
const twoCalls: OpeningsLogLine[] = [start, { kind: "call", call: call() }, { kind: "call", call: call({ model: "m-2", aiRef: "ref-2", order: 2 }) },
  { kind: "arm", arm: armLine }, end];

describe("practice openings: the fixed questions", () => {
  it("has 12 questions: 6 Romanian, 6 English, every kind of question, unique ids", () => {
    expect(OPENINGS_QUESTIONS).toHaveLength(12);
    expect(OPENINGS_QUESTIONS.filter((question) => question.languageTag === "ro")).toHaveLength(6);
    expect(OPENINGS_QUESTIONS.filter((question) => question.languageTag === "en")).toHaveLength(6);
    expect(new Set(OPENINGS_QUESTIONS.map((question) => question.id)).size).toBe(12);
    expect([...new Set(OPENINGS_QUESTIONS.map((question) => question.category))].sort())
      .toEqual(["CONTESTED_FACT", "ETHICS", "HEALTH_PRACTICAL", "PERSONAL_DECISION", "PUBLIC_POLICY"]);
  });

  it("each question is read by the engine's detector as the language it claims", () => {
    for (const question of OPENINGS_QUESTIONS) {
      expect(`${question.id}:${detectArgumentLanguage(question.questionLine).tag}`).toBe(`${question.id}:${question.languageTag}`);
      expect(question.languageName).toBe(question.languageTag === "ro" ? "Romanian" : "English");
    }
  });
});

describe("practice openings: --questions and --arms select, never carry text", () => {
  it("selects fixed questions in their fixed order", () => {
    expect(openingsQuestionsFromFlag(undefined)).toHaveLength(12);
    expect(openingsQuestionsFromFlag("en-rent-caps,ro-euro").map((question) => question.id)).toEqual(["ro-euro", "en-rent-caps"]);
  });

  it("refuses anything that is not a fixed id, without repeating it", () => {
    for (const value of ["Should I lie to my boss?", "ro-euro,ro-euro", "", " , "]) {
      let caught: unknown = null;
      try { openingsQuestionsFromFlag(value); } catch (error) { caught = error; }
      expect((caught as { code?: string }).code).toBe("PRACTICE_FLAG_VALUE_INVALID");
      expect(String((caught as Error).message)).not.toContain("lie to my boss");
    }
  });

  it("selects arms in the order T, A, B, C, and refuses an unknown arm", () => {
    expect(openingsArmsFromFlag(undefined)).toEqual([...OPENINGS_ARMS]);
    expect(openingsArmsFromFlag("C,T")).toEqual(["T", "C"]);
    expect(() => openingsArmsFromFlag("X")).toThrow("PRACTICE_FLAG_VALUE_INVALID");
  });
});

describe("practice openings: openings.jsonl", () => {
  const folders: string[] = [];
  afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
  const fresh = () => { const folder = mkdtempSync(join(tmpdir(), "pp-openings-log-")); folders.push(folder); return folder; };

  it("writes one line per entry, and refuses a folder that already holds a log", () => {
    const folder = fresh();
    const log = OpeningsLog.create(folder);
    for (const line of twoCalls) log.append(line);
    log.close();
    expect(readOpeningsLog(folder).map((line) => line.kind)).toEqual(["start", "call", "call", "arm", "end"]);
    expect(() => OpeningsLog.create(folder)).toThrow("PRACTICE_OUT_ALREADY_HOLDS_OPENINGS");
  });

  it("leaves out a last line cut short, and refuses any other bad line", () => {
    const text = `${twoCalls.map((line) => JSON.stringify(line)).join("\n")}\n{"kind":"ca`;
    expect(parseOpeningsLog(text)).toHaveLength(5);
    expect(() => parseOpeningsLog(`${JSON.stringify(start)}\nnot json\n${JSON.stringify(end)}\n`)).toThrow("PRACTICE_OPENINGS_LOG_INVALID");
    const folder = fresh();
    writeFileSync(join(folder, OPENINGS_FILE), `${JSON.stringify({ kind: "start", schema: "other" })}\n`);
    expect(() => readOpeningsLog(folder)).toThrow("PRACTICE_OPENINGS_LOG_INVALID");
  });

  it("the start line pins each asked question: its id and the first 12 hex characters of the SHA-256 of its question line", () => {
    const folder = fresh();
    const asked = openingsQuestionsFromFlag("en-rent-caps,ro-euro");
    const expected = asked.map((question) => ({
      id: question.id, sha256: createHash("sha256").update(question.questionLine, "utf8").digest("hex").slice(0, 12)
    }));
    expect(openingsQuestionDigests(asked)).toEqual(expected);
    expect(expected.every((digest) => /^[0-9a-f]{12}$/u.test(digest.sha256))).toBe(true);
    // A rewording of a question line changes its digest, so a later run shows it.
    const [euro] = asked;
    expect(openingsQuestionDigests([{ ...euro!, questionLine: `${euro!.questionLine} ` }])[0]!.sha256).not.toBe(expected[0]!.sha256);
    // The fixture's pinned digest is the algorithm's answer for the same line.
    expect(openingsQuestionDigests(openingsQuestionsFromFlag("ro-euro"))).toEqual(start.questionDigests);
    const log = OpeningsLog.create(folder);
    log.append({ ...start, questions: asked.map((question) => question.id), questionDigests: openingsQuestionDigests(asked) });
    log.close();
    const written = readOpeningsLog(folder)[0] as StartLine;
    expect(written).toMatchObject({ kind: "start", questions: ["ro-euro", "en-rent-caps"], questionDigests: expected });
    expect(openingsReportFromLog(readOpeningsLog(folder)).questionDigests).toEqual(expected);
  });

  it("the written reply text is redacted and capped whatever the caller passes; redaction is idempotent", () => {
    const folder = fresh();
    const key = "sk-ant-api03-ABCDEFGH12345678";
    const log = OpeningsLog.create(folder);
    log.append(start);
    log.append({ kind: "call", call: call({ replyText: `answer ${key} end` }) });
    log.append({ kind: "call", call: call({ model: "m-2", replyText: "word ".repeat(40_000) }) });
    log.close();
    const [keyed, long] = readOpeningsLog(folder).flatMap((line) => (line.kind === "call" ? [line.call] : []));
    expect(keyed!.replyText).not.toContain(key);
    expect(keyed!.replyText).toContain("[REDACTED:vendor-key]");
    expect(keyed!.replyText).toContain("answer");
    expect(reportableReplyText(keyed!.replyText!)).toBe(keyed!.replyText);
    expect(Buffer.byteLength(long!.replyText!, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(long!.replyText).toContain("bytes left out");
  });
});

describe("practice openings: the report", () => {
  it("passes when every call was accepted; counts per arm; no reply text in report.md", () => {
    const report = openingsReportFromLog(twoCalls);
    expect([report.verdict, report.exitCode]).toEqual(["PASS", 0]);
    const byArm = report.byArm as readonly Record<string, unknown>[];
    expect(Object.keys(byArm[0]!)).toEqual(["arm", "questions", "calls", "statuses", "byStep", "inputTokens", "outputTokens",
      "reasoningTokens", "costUsd", "wallSeconds", "unavailable", "marks", "notes"]);
    expect(byArm[0]).toMatchObject({ arm: "C", questions: 1, calls: 2, costUsd: "0.000002000", wallSeconds: 2,
      marks: { ANSWERS_FILLED: 1 }, notes: { GAP_STOPPED: 1 } });
    const markdown = reportMarkdown(report);
    expect(markdown).toContain("Openings per arm");
    expect(markdown).not.toContain("REPLY-TEXT-NEVER-IN-MARKDOWN");
  });

  it("fails on a call that never got a reply in the right format (FORMAT_FAILED)", () => {
    const bad = call({ status: "FORMAT_FAILED", errorCode: "PROVIDER_CONTENT_UNACCEPTED", replyForm: null, attempts: [
      { callSiteKey: "MAP:merge", outcome: "FAILED", parseStatus: "SCHEMA_FAILED", latencyMs: 900, jsonRepair: null, replyForm: "ORIGINAL" },
      { callSiteKey: "MAP:merge", outcome: "FAILED", parseStatus: "SCHEMA_FAILED", latencyMs: 900, jsonRepair: null, replyForm: "PATCH" }] });
    const report = openingsReportFromLog([start, { kind: "call", call: call() }, { kind: "call", call: { ...bad, model: "m-2" } }, end]);
    expect([report.verdict, report.exitCode]).toEqual(["FAIL", 20]);
    expect(report.reasons).toContain("FORMAT_FAILED:1");
  });

  it("the failures list keeps reply text only for a format failure; a call failure's text is left out of the report", () => {
    const formatFailed = call({ status: "FORMAT_FAILED", errorCode: "PROVIDER_CONTENT_UNACCEPTED", replyForm: null,
      replyText: "FORMAT-REPLY-TEXT", attempts: [
        { callSiteKey: "MAP:merge", outcome: "FAILED", parseStatus: "SCHEMA_FAILED", latencyMs: 900, jsonRepair: null, replyForm: "ORIGINAL" }] });
    const callFailed = call({ model: "m-2", status: "CALL_FAILED", errorCode: "PROVIDER_CALL_FAILED", replyForm: null,
      replyText: "CALL-FAILED-REPLY-TEXT", attempts: [
        { callSiteKey: "MAP:merge", outcome: "FAILED", parseStatus: null, latencyMs: 900, jsonRepair: null, replyForm: null }] });
    const report = openingsReportFromLog([start, { kind: "call", call: formatFailed }, { kind: "call", call: callFailed }, end]);
    const failures = report.failures as readonly Pick<OpeningsCall, "status" | "replyText">[];
    expect(failures.map((failure) => [failure.status, failure.replyText])).toEqual([["FORMAT_FAILED", "FORMAT-REPLY-TEXT"], ["CALL_FAILED", null]]);
    expect(JSON.stringify(report)).not.toContain("CALL-FAILED-REPLY-TEXT");
  });

  it("the wrong-format count in report.md is true for openings: a repaired slip, a call failure and a format failure count; a clean call does not", () => {
    const repaired = call({ model: "m-2", order: 3, status: "REPAIRED", replyForm: "PATCH", attempts: [
      { callSiteKey: "MAP:list:0", outcome: "FAILED", parseStatus: "SCHEMA_FAILED", latencyMs: 900, jsonRepair: null, replyForm: "ORIGINAL" },
      { callSiteKey: "MAP:list:0", outcome: "OK", parseStatus: "PARSED", latencyMs: 900, jsonRepair: null, replyForm: "PATCH" }] });
    const callFailed = call({ model: "m-1", order: 4, status: "CALL_FAILED", errorCode: "PROVIDER_CALL_FAILED", replyForm: null, replyText: null,
      attempts: [{ callSiteKey: "MAP:list:0", outcome: "FAILED", parseStatus: null, latencyMs: 900, jsonRepair: null, replyForm: null }] });
    const formatFailed = call({ model: "m-2", order: 5, status: "FORMAT_FAILED", errorCode: "PROVIDER_CONTENT_UNACCEPTED", replyForm: null,
      replyText: null, attempts: [{ callSiteKey: "MAP:list:0", outcome: "FAILED", parseStatus: "SCHEMA_FAILED", latencyMs: 900, jsonRepair: null, replyForm: "ORIGINAL" }] });
    const report = openingsReportFromLog([start, { kind: "call", call: call() }, { kind: "call", call: repaired },
      { kind: "call", call: callFailed }, { kind: "call", call: formatFailed }, end]);
    expect((report.failures as readonly unknown[]).length).toBe(3);
    expect(reportMarkdown(report)).toContain("Wrong-format replies, fixed by their call or not: 3");
  });

  it("is ABORTED when the run did not reach its end", () => {
    expect(openingsReportFromLog([start, { kind: "call", call: call() }]).reasons[0]).toBe("ABORTED:PRACTICE_LOG_HAS_NO_END");
    expect(openingsReportFromLog([start], { code: "OPERATOR_SECOND_INTERRUPT", at: new Date(T1) }).exitCode).toBe(50);
  });

  it("keeps the map's short ids through the reply redaction", () => {
    const reply = "{\"key_points\":[{\"key_point_id\":\"k1\",\"claim\":\"Cost\",\"member_item_ids\":[\"pt01\",\"pt12\"]}],\"answers\":[]}";
    expect(reportableReplyText(reply)).toBe(reply);
  });
});
