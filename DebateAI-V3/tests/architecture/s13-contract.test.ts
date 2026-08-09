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
    expect(memory).toContain("CROSS JOIN LATERAL");
    for (const tier of ["EXACT_QUESTION", "SAME_BINDING", "PARTIAL_BINDING", "TERM_OVERLAP"])
      expect(memory).toContain(`THEN '${tier}'`);
    expect(memory).toContain("MEMORY_MATCH_PREDICATE_DRIFT");
    expect(memory).not.toContain("jsonb_object_length");
    expect(memory).toContain("current.normalized_binding<>'{}'::jsonb");
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
