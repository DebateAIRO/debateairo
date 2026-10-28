import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const mainPath = new URL("../../apps/api/src/main.ts", import.meta.url);

async function compositionSource() {
  const text = await readFile(mainPath, "utf8");
  return text;
}

function variable(source: string, name: string): string {
  const marker = `const ${name} = `;
  const start = source.indexOf(marker);
  const end = source.indexOf("\n});", start);
  if (start < 0 || end < 0) throw new Error(`Missing production variable ${name}`);
  return source.slice(start + marker.length, end + 3)
    .replaceAll("new Map<number, string | null>()", "new Map()");
}

function apiOption(source: string, name: string): string {
  const marker = `  ${name}: {`;
  const start = source.indexOf(marker, source.indexOf("const api = buildApi("));
  const end = source.indexOf("\n  },\n  synthesisPublishGate", start);
  if (start < 0 || end < 0) throw new Error(`Missing buildApi option ${name}`);
  return source.slice(start + marker.length - 1, end + 4)
    .replace("pool.query<{ live: boolean }>", "pool.query")
    .replaceAll("new Map<number, string | null>()", "new Map()");
}

function evaluate<T>(expression: string, bindings: Record<string, unknown>): T {
  return new Function(...Object.keys(bindings), `return (${expression});`)(...Object.values(bindings)) as T;
}

describe("publication review production composition", () => {
  it("keeps staff-only reads outside S01's owner-scoped answer window", async () => {
    const text = await compositionSource();
    const start = text.indexOf("const readSynthesisAnswer =");
    const end = text.indexOf("const synthesisCheckWorker =");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(text.slice(start, end)).not.toContain("readOwnerAnswer(");
  });

  it("returns the newest visible covered version with the staff review body", async () => {
    const source = await compositionSource();
    const EmptyReader = class {};
    const deps = evaluate<{ readReviewBody(opened: Record<string, unknown>): Promise<{
      answerVersion: number; body: { renderedVersion: number }
    }> }>(variable(source, "publicationReviewStaff"), {
      createPublicationReviewStaffService: (input: unknown) => input,
      publicationReviewRepository: {},
      application: {
        withContentLease: async (_runId: string, use: () => Promise<unknown>) => use(),
        readAnswer: async () => ({ answer_version: 2, synthesis: "same" })
      },
      ownerSession: () => ({}), synthesisAnswerAccess: {},
      readSynthesisAnswer: async () => ({ answer_version: 1, synthesis: "same" }),
      readOwnerAnswer: async (_deps: unknown, _answerId: string, version: number) =>
        ({ answer_version: version, synthesis: "same" }),
      synthesisTextOf: (answer: { synthesis: string }) => answer.synthesis,
      buildPublicDebateBody: async ({ answer }: { answer: { answer_version: number } }) =>
        ({ renderedVersion: answer.answer_version }),
      RepositoryPublicationStoryReader: EmptyReader,
      PostgresPublicationRepository: EmptyReader,
      storyRepository: {}, pool: {}, auditContextHasher: {}, mapViews: {}
    });

    expect(await deps.readReviewBody({
      runId: "run", answerId: "answer", originVersion: 1, ownerRef: "owner", ownerUserId: "user"
    })).toEqual({ answerVersion: 2, body: { renderedVersion: 2 } });
  });

  it("passes a covered approval through the composed publish gate", async () => {
    const source = await compositionSource();
    const gate = evaluate<{ approvalCovers(input: unknown): Promise<boolean> }>(
      variable(source, "synthesisPublishGate"), {
        createSynthesisPublishGate: (input: unknown) => input,
        synthesisCheckRepository: {},
        publicationReviewRepository: { approvalCovers: async () => true },
        synthesisCheckDeps: {}, publicationCheckPolicy: { deadlineMs: 1 }
      }
    );
    expect(await gate.approvalCovers({ answerId: "approved" })).toBe(true);
  });

  it("refuses an owner read when private run content is gone", async () => {
    const source = await compositionSource();
    const options = evaluate<{ readOwnedAnswer(input: Record<string, unknown>): Promise<unknown> }>(
      apiOption(source, "publicationReviews"), {
        publicationReviewRepository: {},
        pool: { query: async (sql: string) => ({
          // This run has no private content and was not removed by the check.
          rows: [{ live: /\bOR\s+true\b/iu.test(sql) }]
        }) },
        application: {
          withContentLease: async (_runId: string, use: () => Promise<unknown>) => use(),
          readRunAnswer: async () => "exposed"
        }
      }
    );
    expect(await options.readOwnedAnswer({
      runId: "erased", authenticated: { session: {}, ownerRef: "owner" }
    })).toBeNull();
  });

  it("selects the changed synthesis origin rather than every verdict", async () => {
    const source = await compositionSource();
    const { readSynthesisTexts } = await import("../../packages/serve/src/synthesis-check.js");
    const options = evaluate<{ readVerdictOfRecord(input: Record<string, unknown>): Promise<unknown> }>(
      apiOption(source, "publicationReviews"), {
        publicationReviewRepository: {}, pool: {},
        application: { withContentLease: async (_runId: string, use: () => Promise<unknown>) => use() },
        readSynthesisAnswer: async (_runId: string, _answerId: string, version: number) =>
          ({ serve_state: "COMPOSED", composed_text: [{ text: version === 1 ? "old" : "changed" }] }),
        readSynthesisTexts,
        originVersionOf: () => 2,
        synthesisCheckRepository: { readRecords: async () => [
          { originVersion: 1 }, { originVersion: 2 }
        ] },
        verdictOfRecord: (records: Array<{ originVersion: number }>, covers: (version: number) => boolean) =>
          records.find((record) => covers(record.originVersion))
      }
    );
    expect(await options.readVerdictOfRecord({
      runId: "run", authenticated: { ownerRef: "owner" },
      answer: { answer_id: "answer", answer_version: 2 }
    })).toEqual({ originVersion: 2 });
  });

  it("reads the verdict of an answer whose first version is not 1 (its debate's settings version)", async () => {
    const source = await compositionSource();
    const { originVersionOf, readSynthesisTexts, verdictOfRecord } =
      await import("../../packages/serve/src/synthesis-check.js");
    const verdict = { verdict: "FLAGGED", categories: ["TERRORISM"], checkedAt: new Date(0) };
    const options = evaluate<{ readVerdictOfRecord(input: Record<string, unknown>): Promise<unknown> }>(
      apiOption(source, "publicationReviews"), {
        publicationReviewRepository: {}, pool: {},
        application: { withContentLease: async (_runId: string, use: () => Promise<unknown>) => use() },
        // Versions 1-4 were never written: the answer starts at 5.
        readSynthesisAnswer: async (_runId: string, _answerId: string, version: number) => version < 5 ? null
          : { serve_state: "COMPOSED", composed_text: [{ text: version === 5 ? "first" : "changed" }] },
        originVersionOf, readSynthesisTexts, verdictOfRecord,
        synthesisCheckRepository: { readRecords: async () => [
          { synthesisOriginVersion: 5, final: true, outcome: verdict, checkedAt: verdict.checkedAt }
        ] }
      }
    );
    expect(await options.readVerdictOfRecord({
      runId: "run", authenticated: { ownerRef: "owner" },
      answer: { answer_id: "answer", answer_version: 5 }
    })).toMatchObject({ verdict: "FLAGGED", categories: ["TERRORISM"] });
    expect(await options.readVerdictOfRecord({
      runId: "run", authenticated: { ownerRef: "owner" },
      answer: { answer_id: "answer", answer_version: 6 }
    })).toBeNull();
  });
});
