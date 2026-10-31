// tests/unit/investigation-close.test.ts
// W5-1: "Write my report" — the closing over the dossier: the answer (Haiku) and its check (GLM), the story and its check,
// at most 2 rounds each (Free's slim report 1), output caps 16K / 80K, one fence for the whole closing (F5), every Haiku
// call under 100K tokens, the cost by the engine's own counting inside the plan's reserve (20 cents paid, 5 Free; the
// owner's 10-20 cent cap), the wait for running digs and their rewrites (F7 A), versions (the later one reads the earlier
// answer, F8 A), the newest rewrite covered, and the "paths changed since your report" count 0 right after a report and 1
// after the next rewrite. The wipe on close is 0133's, in the same transaction as the close (the integration test).
import { describe, expect, it } from "vitest";
import { InvestigationReportStorySchema } from "@debateai/contract";
import type { PathRewriteEntry } from "@debateai/db";
import { previewThinkingStepOf, readPromptFrame } from "@debateai/providers";
import { INVESTIGATION_REPORT_POLICY } from "@debateai/register";
import { INVESTIGATION_REPORT_SEAM_CEILING_MICROS } from "@debateai/budget";
import { engineContractHash, ENGINE_SEALED_CONTRACT_IDS } from "../../apps/runner/src/engine-contracts.js";
import {
  closeInvestigation, closingRandomBytes, investigationReportIdOf, type InvestigationReportContent
} from "../../apps/runner/src/investigation-close.js";
import { pathRewriteBodyBytes, pathRewriteBodyFits } from "../../apps/runner/src/path-rewrite-material.js";
import { latestWrittenReportOf, servePathRewrites, type RewriteTurn } from "../../packages/serve/src/path-rewrites.js";
import {
  DIG_FAILED, DIG_NESTED, DIG_READY, INVESTIGATION, OBJECTION, ROOT, STORY_OBJECTION, closingOf, contractOf, deepChain, fieldsOf,
  investigationInput, memoryReports, settingsOver, team
} from "../support/investigation-close-world.js";

const PAID_RESERVE = INVESTIGATION_REPORT_POLICY.reserveMicros.paid;
const FREE_RESERVE = INVESTIGATION_REPORT_POLICY.reserveMicros.free;

describe("W5-1 Write my report: the closing", () => {
  it("writes the answer, its check, the story and its check, and stores one version sealed under the root's key", async () => {
    const store = memoryReports();
    const vendors = team();
    expect(await closeInvestigation(settingsOver({ store, vendors }), closingOf())).toBe("RECORDED");

    const record = store.records[0]!;
    expect(record).toMatchObject({ investigationId: INVESTIGATION, reportVersion: 1, reportId: investigationReportIdOf(INVESTIGATION, 1),
      outcome: "READY", storyOutcome: "READY", failureCode: null, ladderStep: 1, leftOut: 0, answerRounds: 1, storyRounds: 1,
      coveredRewrite: { rewriteId: "88888888-8888-4888-8888-888888888888", recordedAt: "2026-10-31T12:05:00.000Z" } });
    expect(record.writerLineage).toMatchObject({ maker: "Anthropic", provider_ref: "ref-haiku" });
    expect(record.checkerLineage).toMatchObject({ maker: "Z.AI", provider_ref: "ref-glm" });
    expect(record.content?.envelope).toEqual({ sealedFor: ROOT, key: record.reportId });
    const content = store.contents.get(record.reportId) as InvestigationReportContent;
    expect(content.answer.segments).toEqual(["Build the pier for rush hour; winter crowds do not need it, so expect it half empty from November."]);
    // The story's cards are turned back into the digs' runs; refs never reach the person.
    expect(InvestigationReportStorySchema.parse(content.story).how_it_went.map((entry) => entry.dig_run_id)).toEqual([DIG_READY, DIG_NESTED, DIG_FAILED]);
    expect(JSON.stringify(content)).not.toMatch(/\b[AGPW][0-9]+\b/u);
    expect(content.shortened).toBe(false);
    expect(content.sources.every((source) => Array.from(source.quote).length <= 120)).toBe(true);

    // The four calls: Haiku writes, GLM checks, on the story lane at the report's own sites, under the engine seal, root run.
    expect(vendors.haiku.requests.map((request) => [request.callSiteKey, request.role, request.lane, contractOf(request.packet)])).toEqual([
      ["INVESTIGATION_REPORT:ANSWER:1", "SYNTHESIZER", "story", "report.answer.v1"],
      ["INVESTIGATION_REPORT:STORY:1", "SYNTHESIZER", "story", "report.story.v1"]]);
    expect(vendors.glm.requests.map((request) => [request.callSiteKey, request.role, contractOf(request.packet)])).toEqual([
      ["INVESTIGATION_REPORT:ANSWER_CHECK:1", "EVALUATOR", "report.answer-check.v1"],
      ["INVESTIGATION_REPORT:STORY_CHECK:1", "EVALUATOR", "report.story-check.v1"]]);
    for (const request of [...vendors.haiku.requests, ...vendors.glm.requests]) {
      expect(request.runId).toBe(ROOT);
      expect(request.contractHash).toBe(engineContractHash());
      expect(request.subjectItemId).toBe(`investigation-report:${record.reportId}`);
    }
    // F3: the output caps.
    expect(vendors.haiku.requests.map((request) => request.bound.tokenCeiling)).toEqual([16_384, 81_920]);
    // The story reads the checked answer; the checker reads the candidate after the dossier.
    expect(JSON.parse(fieldsOf(vendors.haiku.requests[1]!.packet).get("answer")!)).toEqual(content.answer.segments);
    expect([...fieldsOf(vendors.glm.requests[0]!.packet).keys()]).toEqual(["question", "first_debate", "follow_ups", "views", "sources",
      "answer_length", "candidate_answer", "length"]);
  });

  it("each site runs at the owner's final-step thinking row", () => {
    expect(["ANSWER", "ANSWER_CHECK", "STORY", "STORY_CHECK"].map((site) =>
      previewThinkingStepOf({ callSiteKey: `INVESTIGATION_REPORT:${site}:1`, lane: "story" }))).toEqual(["answer_writer", "answer_checker", "story_writer", "story_checker"]);
    expect(previewThinkingStepOf({ callSiteKey: "INVESTIGATION_REPORT:ANSWER:1", lane: "served" })).not.toBe("answer_writer");
  });

  it("the five report contracts are sealed by the engine hash, appended last", () => {
    expect(ENGINE_SEALED_CONTRACT_IDS.slice(-5)).toEqual(["report.answer.v1", "report.answer.later.v1", "report.answer-check.v1",
      "report.story.v1", "report.story-check.v1"]);
  });

  it("F5: one fence and canary for the whole closing, so a step's second round opens with its first round's bytes", async () => {
    const store = memoryReports();
    let checks = 0;
    const vendors = team({ glm: (packet) => (contractOf(packet) === "report.answer-check.v1" && (checks += 1) === 1 ? OBJECTION
      : contractOf(packet) === "report.story-check.v1" ? JSON.stringify({ satisfied: true, problem: null, part: null, misleading: false })
        : JSON.stringify({ satisfied: true, problem: null, part: null })) });
    await closeInvestigation(settingsOver({ store, vendors }), closingOf());
    const [first, second] = vendors.haiku.requests;
    expect(second!.callSiteKey).toBe("INVESTIGATION_REPORT:ANSWER:2");
    expect(second!.packet.messages[0]!.content).toBe(first!.packet.messages[0]!.content);
    expect(second!.packet.messages[1]!.content).toBe(first!.packet.messages[1]!.content);
    const frames = [...vendors.haiku.requests, ...vendors.glm.requests].map((request) => readPromptFrame({ messages: request.packet.messages.slice(0, 2) }));
    expect(new Set(frames.map((frame) => frame.fence)).size).toBe(1);
    expect(new Set(frames.map((frame) => frame.canary)).size).toBe(1);
    // Another closing (another seed) has another fence.
    expect(closingRandomBytes(Buffer.alloc(32, 1))(16).equals(closingRandomBytes(Buffer.alloc(32, 2))(16))).toBe(false);
  });

  it("every Haiku call reads under 100K tokens, also on a level-10 investigation fitted by the ladder", async () => {
    for (const dossier of [investigationInput(), investigationInput({ digs: deepChain(10) })]) {
      const store = memoryReports();
      const vendors = team({ glm: (packet) => (contractOf(packet) === "report.story-check.v1" ? STORY_OBJECTION : OBJECTION) });
      await closeInvestigation(settingsOver({ store, vendors, dossier }), closingOf());
      for (const request of vendors.haiku.requests) expect(pathRewriteBodyFits(pathRewriteBodyBytes(request.packet))).toBe(true);
      expect(store.records[0]!.outcome).not.toBe("FAILED");
    }
  });

  it("the cost, by the engine's own counting, stays inside the 10-20 cent cap; the worst case is stopped by the reserve", async () => {
    // Typical: one round each, every call charged at its full projection (bytes / 2 in, the output cap out).
    const typical = memoryReports();
    await closeInvestigation(settingsOver({ store: typical, vendors: team() }), closingOf());
    expect(typical.charged).toBeLessThanOrEqual(PAID_RESERVE);
    expect(typical.charged).toBeGreaterThan(0);
    // Worst: every check objects, so every step asks for its second round; the closing admits each call against the 20
    // cents and serves the last checked draft when the next would not fit.
    const worst = memoryReports();
    const logged: Array<{ event: string; detail: Record<string, unknown> }> = [];
    await closeInvestigation(settingsOver({ store: worst, logged, dossier: investigationInput({ digs: deepChain(10) }),
      vendors: team({ glm: (packet) => (contractOf(packet) === "report.story-check.v1" ? STORY_OBJECTION : OBJECTION) }) }), closingOf());
    expect(worst.charged).toBeLessThanOrEqual(PAID_RESERVE);
    expect(worst.charged).toBeGreaterThanOrEqual(100_000);
    expect(worst.records[0]).toMatchObject({ outcome: "READY_WITH_RESERVATION" });
    expect(worst.records[0]!.spentMicros).toBe(worst.charged);
    // The gateway's seam is the same 20 cents, the register's.
    expect(INVESTIGATION_REPORT_SEAM_CEILING_MICROS).toBe(INVESTIGATION_REPORT_POLICY.ceilingMicros);
    expect(INVESTIGATION_REPORT_POLICY.ceilingMicros).toBe(PAID_RESERVE);
  });

  it("Free's slim report: one round of each, the slim story cap, and never more than its 5-cent reserve", async () => {
    const store = memoryReports();
    const vendors = team({ glm: (packet) => (contractOf(packet) === "report.story-check.v1" ? STORY_OBJECTION : OBJECTION) });
    await closeInvestigation(settingsOver({ store, vendors, free: true }), closingOf());
    expect(vendors.haiku.requests.map((request) => [request.callSiteKey, request.bound.tokenCeiling])).toEqual([
      ["INVESTIGATION_REPORT:ANSWER:1", 16_384], ["INVESTIGATION_REPORT:STORY:1", 16_384]]);
    expect(store.records[0]).toMatchObject({ outcome: "READY_WITH_RESERVATION", answerRounds: 1, storyRounds: 1 });
    expect(store.charged).toBeLessThanOrEqual(FREE_RESERVE);
  });

  it("waits while a dig or its rewrite is still running (F7 A), then writes; after the give-up time it goes on", async () => {
    const store = memoryReports();
    store.waiting.push(DIG_READY);
    const vendors = team();
    expect(await closeInvestigation(settingsOver({ store, vendors }), closingOf())).toBe("WAITING");
    expect(vendors.haiku.requests).toHaveLength(0);
    expect(store.records).toHaveLength(0);
    // Six hours on, it goes on with what is settled.
    expect(await closeInvestigation(settingsOver({ store, vendors, now: "2026-10-31T19:00:01.000Z" }), closingOf())).toBe("RECORDED");
    store.waiting.length = 0;
    const second = memoryReports();
    expect(await closeInvestigation(settingsOver({ store: second, vendors: team() }), closingOf())).toBe("RECORDED");
  });

  it("versions: closing again writes version 2, which reads version 1's answer; version 1 stays", async () => {
    const store = memoryReports();
    await closeInvestigation(settingsOver({ store, vendors: team() }), closingOf(1));
    const vendors = team();
    expect(await closeInvestigation(settingsOver({ store, vendors }), closingOf(2, "2026-10-31T15:00:00.000Z"))).toBe("RECORDED");
    expect(store.records.map((record) => [record.reportVersion, record.outcome])).toEqual([[1, "READY"], [2, "READY"]]);
    expect(store.records[1]!.reportId).not.toBe(store.records[0]!.reportId);
    expect(contractOf(vendors.haiku.requests[0]!.packet)).toBe("report.answer.later.v1");
    expect(JSON.parse(fieldsOf(vendors.haiku.requests[0]!.packet).get("earlier_report")!)).toMatchObject({ version: 1 });
    // A second write of the same closing changes nothing.
    expect(await closeInvestigation(settingsOver({ store, vendors: team() }), closingOf(2))).toBe("ALREADY");
  });

  it("no answer after every round: a FAILED version with no text; a story that fails keeps the answer alone (N14)", async () => {
    const failed = memoryReports();
    await closeInvestigation(settingsOver({ store: failed, vendors: team({ haiku: () => "not json at all" }) }), closingOf());
    expect(failed.records[0]).toMatchObject({ outcome: "FAILED", content: null, storyOutcome: null });
    expect(failed.records[0]!.failureCode).toMatch(/^INVESTIGATION_REPORT_/u);
    const noStory = memoryReports();
    await closeInvestigation(settingsOver({ store: noStory, vendors: team({ haiku: (packet) =>
      contractOf(packet).startsWith("report.story") ? "{}" : JSON.stringify({ segments: [{ text: "Build it for rush hour.", rests_on: ["A1"] }] }) }) }),
    closingOf());
    expect(noStory.records[0]).toMatchObject({ outcome: "READY", storyOutcome: "FAILED" });
    expect((noStory.contents.get(noStory.records[0]!.reportId) as InvestigationReportContent).story).toBeNull();
  });

  it("an answer resting on a ref the dossier does not give is refused and asked again (code's check)", async () => {
    const store = memoryReports();
    let calls = 0;
    const vendors = team({ haiku: (packet) => {
      if (contractOf(packet).startsWith("report.story")) return JSON.stringify({ short_answer: "Yes.", what_would_change: "Less ridership.", how_it_went: [], still_open: [] });
      calls += 1;
      return JSON.stringify({ segments: [{ text: "Build it.", rests_on: [calls === 1 ? "Z9" : "A1"] }] });
    } });
    await closeInvestigation(settingsOver({ store, vendors }), closingOf());
    expect(store.records[0]!.outcome).toBe("READY");
    expect(calls).toBe(2);
  });
});

describe("W5-1 'paths changed since your report' counts from the newest rewrite the report covered", () => {
  const entry = (n: number, recordedAt: string): PathRewriteEntry => ({
    run_id: `d${String(n)}000000-0000-4000-8000-00000000000${String(n)}`, parent_run_id: ROOT, position_ref: "pos-a", path_seq: n,
    taken_at: recordedAt, state: "READY", rewrite_id: `a${String(n)}000000-0000-4000-8000-00000000000${String(n)}`, parent_answer_version: 1,
    based_on_rewrite_id: n === 1 ? null : `a${String(n - 1)}000000-0000-4000-8000-00000000000${String(n - 1)}`, failure_code: null,
    fate_before: "HELD_UP", fate_after: "HELD_UP", verdict_outcome: null, verdict_scope: null, writer_lineage: {}, checker_lineage: {},
    rounds: 1, artifact_refs: [], recorded_at: recordedAt, content: {}
  });
  const opened = (n: number) => ({ text: { line: `Line ${String(n)}.`, summary: `Summary ${String(n)}.`, fate: "HELD_UP" },
    what_changed: [`Dig ${String(n)} changed it.`], view_reason: null, dig_paths: [] });
  const turn = (n: number, at: string): RewriteTurn => ({ entry: entry(n, at), opened: opened(n), ownWords: [] });
  const serve = (turns: readonly RewriteTurn[], covered: string | null, writtenAt: string) => servePathRewrites({
    turns, levelOf: () => 1, storyLines: new Map([["pos-a", "The story's line."]]), changedBelow: new Set(),
    report: latestWrittenReportOf([{ report_version: 1, report_written_at: writtenAt }], new Map([[1, covered]]))
  })!.changed_since;

  it("is 0 right after a report and 1 after the next rewrite, even for a rewrite stored while the report was written", () => {
    const first = turn(1, "2026-10-31T10:00:00.000Z");
    // The report read rewrite 1 and was written at 11:00.
    expect(serve([first], "2026-10-31T10:00:00.000Z", "2026-10-31T11:00:00.000Z")).toEqual({ count: 0, since_report_version: 1 });
    // Rewrite 2 landed at 10:30, after the dossier was read but before the report was stored: it was not covered, so it counts.
    const during = turn(2, "2026-10-31T10:30:00.000Z");
    expect(serve([first, during], "2026-10-31T10:00:00.000Z", "2026-10-31T11:00:00.000Z")).toEqual({ count: 1, since_report_version: 1 });
    // A report that covered no rewrite counts every rewrite; an unknown cut-off falls back to the written time.
    expect(serve([first], null, "2026-10-31T11:00:00.000Z").count).toBe(1);
    expect(servePathRewrites({ turns: [first, during], levelOf: () => 1, storyLines: new Map(), changedBelow: new Set(),
      report: latestWrittenReportOf([{ report_version: 1, report_written_at: "2026-10-31T11:00:00.000Z" }]) })!.changed_since.count).toBe(0);
  });
});
