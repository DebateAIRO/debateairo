import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { auditOrphans } from "../../tools/orphan-audit/src/index.js";

describe("S13 / cross-run memory architecture", () => {
  it("lands append-only memory carriers without a closure job or embedding dependency", async () => {
    const [migration, memory, drizzle] = await Promise.all([
      readFile(new URL("../../migrations/0016_s13.sql", import.meta.url), "utf8"),
      readFile(new URL("../../packages/memory/src/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../packages/db/src/schema.ts", import.meta.url), "utf8")
    ]);
    for (const table of ["memory.question_key", "memory.memory_link", "memory.memory_link_event", "memory.alias_row", "memory.alias_revocation", "memory.pull_record", "memory.candidate_record"])
      expect(migration).toContain(table);
    expect(migration).toContain("reject_mutation");
    expect(memory).not.toMatch(/embedding|cosine|vector/i);
    expect(memory).not.toContain("transitiveClosure");

    const matcher = memory.slice(
      memory.indexOf("export function matchQuestionKeys"),
      memory.indexOf("export interface PinnedMemoryPull")
    );
    const rank = memory.slice(
      memory.indexOf("const MEMORY_MATCH_RANK"),
      memory.indexOf("function ownershipFromMemoryScope")
    );
    expect(matcher).toContain("const tier: MemoryMatchTier | null");
    expect(rank).toContain("function prefersCandidate");
    for (const tier of ["EXACT_QUESTION", "SAME_BINDING", "PARTIAL_BINDING", "TERM_OVERLAP"])
      expect(rank).toContain(`${tier}:`);
    expect(matcher).toContain('Object.freeze(["termOverlap"])');
    expect(memory).toContain('field.startsWith("binding:") ? "binding" : field');
    expect(memory).not.toContain("sharedTermCount");

    const record = memory.slice(
      memory.indexOf("async recordQuestionAndMatch"),
      memory.indexOf("async #ownerScopedCandidateRefs")
    );
    const candidateRefs = memory.slice(
      memory.indexOf("async #ownerScopedCandidateRefs"),
      memory.indexOf("async #evaluateCandidate")
    );
    const evaluate = memory.slice(
      memory.indexOf("async #evaluateCandidate"),
      memory.indexOf("async #recordAnswerPull")
    );
    const answerPull = memory.slice(
      memory.indexOf("async #recordAnswerPull"),
      memory.indexOf("async readDisclosure")
    );
    const contradiction = memory.slice(memory.indexOf("async observeAnswerContradiction"));

    expect(candidateRefs).toContain("SELECT key.question_key_id, key.run_id, key.at_seq");
    expect(candidateRefs).toContain("key_owner.owner_ref=$2::uuid");
    expect(candidateRefs).not.toContain("canonical_question_text");
    expect(candidateRefs).not.toContain("normalized_binding");
    expect(candidateRefs).not.toContain("frozen_terms");
    expect(record).toMatch(/for \(const candidateRef of candidateRefs\) \{\s*const evaluated = await this\.#evaluateCandidate/);

    const candidatePrepare = evaluate.indexOf("prepareLeasedContentEncryptionForRun");
    const candidateTransaction = evaluate.indexOf("withWriteTransaction");
    // pin updated 2026-09-02: the inline FOR UPDATE candidate lock became core.lock_owned_live_runs (migration 0040, FOR UPDATE inside the function) (dev drift, see docs/missions/2026-09-01-security-hardening/VERIFICATION.md)
    const candidateLock = evaluate.indexOf("core.lock_owned_live_runs", candidateTransaction);
    const candidateOwner = evaluate.indexOf("core.run_is_owned_by", candidateLock);
    const candidateFetch = evaluate.indexOf("const candidateRows = await client.query", candidateOwner);
    const candidateDecrypt = evaluate.indexOf("decryptLeasedContentForRun", candidateFetch);
    const candidateMatch = evaluate.indexOf("matchQuestionKeys", candidateDecrypt);
    expect(candidatePrepare).toBeGreaterThan(-1);
    expect(candidatePrepare).toBeLessThan(candidateTransaction);
    expect(evaluate.match(/prepareLeasedContentEncryptionForRun/g)).toHaveLength(1);
    expect(candidateTransaction).toBeLessThan(candidateLock);
    expect(candidateLock).toBeLessThan(candidateOwner);
    expect(candidateOwner).toBeLessThan(candidateFetch);
    expect(candidateFetch).toBeLessThan(candidateDecrypt);
    expect(candidateDecrypt).toBeLessThan(candidateMatch);

    const finalTransaction = record.indexOf("await withWriteTransaction");
    const finalCallback = record.indexOf("async (client) =>", finalTransaction);
    const sortedRunIds = record.indexOf("[input.key.runId, selected.priorRunId].sort()", finalCallback);
    // pin updated 2026-09-02: the final sorted-run lock is core.lock_owned_live_runs (ORDER BY run_id FOR UPDATE inside the function) (dev drift, see docs/missions/2026-09-01-security-hardening/VERIFICATION.md)
    const finalLock = record.indexOf("core.lock_owned_live_runs", sortedRunIds);
    const sourceOwner = record.indexOf("core.run_is_owned_by", finalLock);
    const selectedOwner = record.indexOf("core.run_is_owned_by", sourceOwner + 1);
    const firstWrite = record.indexOf("INSERT INTO memory.question_key", selectedOwner);
    expect(finalCallback).toBeGreaterThan(finalTransaction);
    expect(sortedRunIds).toBeGreaterThan(finalCallback);
    expect(finalLock).toBeGreaterThan(sortedRunIds);
    expect(sourceOwner).toBeGreaterThan(finalLock);
    expect(selectedOwner).toBeGreaterThan(sourceOwner);
    expect(firstWrite).toBeGreaterThan(selectedOwner);

    expect(record).toContain("normalizedBinding: input.key.normalizedBinding");
    expect(record).toContain("frozenTerms: input.key.frozenTerms");
    expect(record).toContain("const storedBinding = questionContent === null ? input.key.normalizedBinding : {};");
    expect(record).toContain("const storedTerms = questionContent === null ? input.key.frozenTerms : [];");
    expect(answerPull).not.toContain("this.pool");
    expect(answerPull).toContain("decryptLeasedContentForRun");
    expect(answerPull).toContain("encryptAttestedLeasedContentForRun");

    for (const [name, method, transaction] of [
      ["recordQuestionAndMatch", record, finalTransaction],
      ["evaluateCandidate", evaluate, candidateTransaction],
      ["observeAnswerContradiction", contradiction, contradiction.indexOf("withWriteTransaction")]
    ] as const) {
      expect(transaction, name).toBeGreaterThan(-1);
      const callback = method.indexOf("async (client) =>", transaction);
      expect(callback, name).toBeGreaterThan(transaction);
      const callbackAndCleanup = method.slice(callback);
      expect(callbackAndCleanup, name).not.toContain("this.pool");
      expect(callbackAndCleanup, name).not.toContain("prepareContentEncryptionForRun");
      expect(callbackAndCleanup, name).not.toContain("encryptContentForRun");
      expect(callbackAndCleanup, name).not.toContain("decryptContentForRun");
    }

    expect(memory).not.toContain("jsonb_object_length");
    for (const mirror of ["memoryQuestionKey", "memoryLink", "memoryLinkEvent", "memoryAliasRow", "memoryAliasRevocation", "memoryPullRecord", "memoryCandidateRecord"])
      expect(drizzle).toContain(`export const ${mirror}`);
  });

  it("derives matcher, disclosure, persistence, and unlink attachment from production roots", async () => {
    const report = await auditOrphans();
    expect(report.s13Surface).toEqual(expect.arrayContaining([
      expect.objectContaining({ package: "packages/memory.matchQuestionKeys", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/memory.MemoryRepository.recordQuestionAndMatch", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/memory.MemoryRepository.readDisclosure", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/memory.validateMemorySentence", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/memory.MemoryRepository.unlinkForAnswer", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/memory.MemoryRepository.observeAnswerContradiction", attachment: "ATTACHED" })
    ]));
  });

  it("routes the database fixture through the single terminal-run support path", async () => {
    const fixture = await readFile(new URL("../integration/memory-database.test.ts", import.meta.url), "utf8");
    expect(fixture).toContain('import { persistTerminalRun } from "../support/settledRun.js"');
    expect(fixture).not.toMatch(/INSERT INTO core\.run_progress_event/);
  });
});
