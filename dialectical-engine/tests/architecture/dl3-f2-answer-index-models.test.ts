import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { AnswerSummarySchema } from "@debateai/contract";

const root = new URL("../../", import.meta.url);

const ROW = Object.freeze({
  answer_id: "answer:dl3-f2",
  run_ref: "run:dl3-f2",
  answer_version: 1,
  question_line: "Does the index state its own lineage?",
  verdict_state: "CONTESTED",
  abstention: null,
  serve_state: "COMPOSED",
  staleness_state: "FRESH",
  builds_on_previous: false,
  created_at_sequence: 1
});

/**
 * DL3-F2. The home page used to read the index and then issue one FULL answer
 * read per row — up to 50 sequential, decrypting upstream calls for decorative
 * library metadata. The index query already reads every one of those answer
 * projections to build the row, so the lineage is free at the source; the only
 * thing missing was a field to carry it, exactly as PublicDebateSummarySchema
 * has carried `models` for public debates all along.
 */
describe("DL3-F2 the owned answer index carries its own model lineage", () => {
  it("lets an index row state the models that made it", () => {
    expect(AnswerSummarySchema.parse({ ...ROW, models: ["gpt-5", "claude-opus-5"] }).models)
      .toEqual(["gpt-5", "claude-opus-5"]);
  });

  it("keeps lineage optional so absence stays typed rather than invented", () => {
    expect(AnswerSummarySchema.parse(ROW).models).toBeUndefined();
    expect(AnswerSummarySchema.safeParse({ ...ROW, models: [""] }).success).toBe(false);
    expect(AnswerSummarySchema.safeParse({ ...ROW, models: "gpt-5" }).success).toBe(false);
  });

  it("derives that lineage in the index query, from the projection it already read", async () => {
    const serve = await readFile(new URL("packages/serve/src/index.ts", root), "utf8");
    const readAnswerIndex = serve.slice(serve.indexOf("async readAnswerIndex("));
    const body = readAnswerIndex.slice(0, readAnswerIndex.indexOf("\n  async "));
    expect(body).toContain("DL3-F2");
    expect(body).toMatch(/models:\s*\[\.\.\.new Set\(answer\.nodes\.flatMap\(/);
    expect(body).toContain("maker_lineage");
  });

  it("leaves no per-row answer read in the server-rendered library page", async () => {
    const serverApi = await readFile(new URL("apps/ui/lib/serverApi.ts", root), "utf8");
    const tail = serverApi.slice(serverApi.indexOf("export async function listDebatesPageServer("));
    const listPage = tail.slice(0, tail.indexOf("\nexport ", 1));
    expect(listPage).toContain("readAnswerIndex(");
    expect(listPage).not.toContain("readAnswer(");
  });
});
