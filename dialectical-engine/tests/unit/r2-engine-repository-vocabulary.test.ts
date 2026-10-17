// tests/unit/r2-engine-repository-vocabulary.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Pool } from "@debateai/db";
import { ENGINE_ANSWER_LETTERS, ENGINE_QUESTION_KINDS } from "@debateai/kernel";
import {
  POINT_INVESTIGATION_BASES, POINT_INVESTIGATION_RESULTS, VERDICT_VOTE_NOT_COUNTED_REASONS, VerdictVoteRepository,
  type VerdictVoteChoice, type VerdictVoteRecord
} from "@debateai/judgement";
// R2a final wave A2 (Ruling (A10 Minors) 2).
import { PointInvestigationRepository, type PointInvestigationRecord } from "@debateai/judgement";

const sql = readFileSync(new URL("../../migrations/0121_engine_verdict.sql", import.meta.url), "utf8").replace(/\s+/gu, " ");
const listed = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(", ");

/** Engine redesign R2 (INTERFACE §8.5, §9.7): the repository's vocabularies are exactly what migration 0121 admits. */
describe("R2 engine repository: the code's vocabularies are the migration's CHECKs", () => {
  it("lists the six investigation results and the three bases, frozen, as 0121 admits them", () => {
    expect(POINT_INVESTIGATION_RESULTS).toEqual(["HOLDS", "FAILS", "DEAD_END", "INVESTIGATION_UNAVAILABLE",
      "INVESTIGATION_SKIPPED", "INVESTIGATION_CAPPED"]);
    expect(POINT_INVESTIGATION_BASES).toEqual(["established", "assumption", "none"]);
    expect(Object.isFrozen(POINT_INVESTIGATION_RESULTS)).toBe(true);
    expect(Object.isFrozen(POINT_INVESTIGATION_BASES)).toBe(true);
    expect(sql).toContain(`result IN (${listed(POINT_INVESTIGATION_RESULTS)})`);
    expect(sql).toContain(`basis IN (${listed(POINT_INVESTIGATION_BASES)})`);
  });

  it("lists the two reasons a vote is not counted and the six question kinds as 0121 admits them", () => {
    expect(VERDICT_VOTE_NOT_COUNTED_REASONS).toEqual(["OWN_MAKER", "JUDGE_FAILED"]);
    expect(Object.isFrozen(VERDICT_VOTE_NOT_COUNTED_REASONS)).toBe(true);
    expect(sql).toContain(`not_counted_reason IN (${listed(VERDICT_VOTE_NOT_COUNTED_REASONS)})`);
    expect(sql).toContain(`question_kind IN (${listed(ENGINE_QUESTION_KINDS)})`);
  });

  it("letters A to H; at most four groups, each of two to eight letters", () => {
    expect(ENGINE_ANSWER_LETTERS).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(sql).toContain("chosen_letter ~ '^[A-H]$'");
    expect(sql).toContain("jsonb_array_length(same_as) > 4");
    expect(sql).toContain("@.size() < 2 || @.size() > 8");
  });
});

/**
 * Task A9's review: 0121's verdict_vote_same_as_codes CHECK admits a letter repeated inside one group and a letter in
 * two groups, so the repository refuses both itself, typed, before any seal or query (the pool here throws if touched).
 */
describe("R2 engine repository: a judge's same-as groups name each letter once", () => {
  const untouchedPool = new Proxy({}, { get: () => { throw new Error("R2_TEST_POOL_TOUCHED"); } }) as unknown as Pool;
  const votes = new VerdictVoteRepository(untouchedPool);
  const ROOT = "00000000-0000-4000-8000-00000000000a";
  const vote = (sameAs: readonly (readonly string[])[]): VerdictVoteRecord => ({
    runId: "00000000-0000-4000-8000-000000000001", judgeSeat: 1,
    judge: { maker: "maker-1", providerRef: "deepinfra:judge-1", modelId: "vendor/judge-1" },
    rawArtifactRef: "00000000-0000-4000-8000-000000000002", counted: true, notCountedReason: null,
    choice: { letter: "A", rootNodeId: ROOT, conditional: false, questionKind: "general",
      sameAs: sameAs as VerdictVoteChoice["sameAs"],
      reasons: "Answer A survives its strongest objection." }
  });

  it.each([
    ["a letter repeated inside one group", [["A", "A"]], "choice.sameAs[0]"],
    ["a letter repeated inside a later group", [["B", "C"], ["D", "E", "D"]], "choice.sameAs[1]"],
    ["a letter that appears in two groups", [["A", "B"], ["C", "B"]], "choice.sameAs[1]"],
    ["the same group twice", [["A", "C"], ["A", "C"]], "choice.sameAs[1]"]
  ] as const)("refuses %s, naming the group and no AI text", async (_case, sameAs, field) => {
    await expect(votes.recordVerdictVote(vote(sameAs)))
      .rejects.toMatchObject({ code: "ENGINE_RECORD_INVALID", message: `ENGINE_RECORD_INVALID: ${field}` });
  });

  it("checks the groups past the letter bound: a letter outside A to H is still refused as before", async () => {
    await expect(votes.recordVerdictVote(vote([["A", "I"]])))
      .rejects.toMatchObject({ code: "ENGINE_RECORD_INVALID", message: "ENGINE_RECORD_INVALID: choice.sameAs[0]" });
  });
});

/**
 * R2a final wave, Ruling (A10 Minors) 2: a point that was never called (over the cap, or no maker left) has no reply, so a
 * row naming one is refused typed, before any seal or query (0121 refuses it too, untyped); the pool throws if touched.
 */
describe("R2 engine repository: a skipped or capped point names no reply", () => {
  const untouchedPool = new Proxy({}, { get: () => { throw new Error("R2_TEST_POOL_TOUCHED"); } }) as unknown as Pool;
  const investigations = new PointInvestigationRepository(untouchedPool);
  const row = (result: "INVESTIGATION_SKIPPED" | "INVESTIGATION_CAPPED", rawArtifactRef: string | null): PointInvestigationRecord => ({
    runId: "00000000-0000-4000-8000-000000000001", nodeId: "00000000-0000-4000-8000-000000000003", investigationOrder: 2,
    result, basis: null, investigator: null, rawArtifactRef, standings: null, content: null
  });

  it.each(["INVESTIGATION_SKIPPED", "INVESTIGATION_CAPPED"] as const)("refuses %s with a raw artifact", async (result) => {
    await expect(investigations.recordPointInvestigation(row(result, "00000000-0000-4000-8000-000000000002")))
      .rejects.toMatchObject({ code: "ENGINE_RECORD_INVALID", message: "ENGINE_RECORD_INVALID: rawArtifactRef" });
  });

  it.each(["INVESTIGATION_SKIPPED", "INVESTIGATION_CAPPED"] as const)("passes the checks for %s without one (then touches the pool)", async (result) => {
    await expect(investigations.recordPointInvestigation(row(result, null))).rejects.toThrow("R2_TEST_POOL_TOUCHED");
  });
});
