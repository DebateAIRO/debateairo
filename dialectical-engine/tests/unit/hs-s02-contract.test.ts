import { describe, expect, it } from "vitest";
import * as contract from "../../packages/contract/src/index.js";
import { ContractHttpError, createContractClient } from "../../packages/contract/src/client.js";

const refusal = {
  error: "PUBLICATION_CONTENT_REFUSED",
  message: "The content check refused to publish this debate. It stays private.",
  statement: {
    outcome: "BLOCK",
    parts: ["QUESTION", "ARGUMENTS"],
    ground: "TERMS_AND_POSSIBLY_ILLEGAL",
    automated: true,
    visibility: "PRIVATE"
  }
};

describe("statement schema", () => {
  // Property: the exact public envelope round-trips without dropping facts.
  it("parses the exact refusal body", () => {
    expect(contract.PublicationContentRefusalSchema?.safeParse(refusal)).toEqual({ success: true, data: refusal });
  });

  // Property: all five parts in order and an uncertain Terms-only refusal are valid.
  it.each([
    { ...refusal.statement, parts: ["QUESTION", "SUMMARY", "ARGUMENTS", "REVIEWS", "STORY"] },
    { ...refusal.statement, outcome: "UNSURE", ground: "TERMS", parts: ["STORY"] },
    { ...refusal.statement, ground: "TERMS" }
  ])("accepts the valid statement %j", (statement) => {
    expect(contract.PublicationRefusalStatementSchema?.safeParse(statement)).toEqual({ success: true, data: statement });
  });

  // Property: closed statements cannot carry empty/duplicate/unordered parts or ungrounded claims.
  it.each([
    ["empty parts", { parts: [] }],
    ["unordered parts", { parts: ["ARGUMENTS", "QUESTION"] }],
    ["duplicate parts", { parts: ["QUESTION", "QUESTION"] }],
    ["unknown part", { parts: ["TITLE"] }],
    ["uncertain illegality", { outcome: "UNSURE", ground: "TERMS_AND_POSSIBLY_ILLEGAL" }],
    ["unknown outcome", { outcome: "ALLOW" }],
    ["unknown ground", { ground: "LAW" }],
    ["human decision", { automated: false }],
    ["public visibility", { visibility: "PUBLISHED" }],
    ["free text", { reason: "untrusted text" }]
  ])("rejects %s", (_name, patch) => {
    expect(contract.PublicationRefusalStatementSchema?.safeParse({ ...refusal.statement, ...patch }).success).toBe(false);
  });

  // Property: the envelope admits neither a different code/message nor extra text.
  it.each([
    { error: "OTHER_ERROR" },
    { message: "untrusted text" },
    { reason: "untrusted text" }
  ])("rejects the invalid envelope %j", (patch) => {
    expect(contract.PublicationContentRefusalSchema?.safeParse({ ...refusal, ...patch }).success).toBe(false);
  });
});

describe("client exposes the statement", () => {
  // Property: only a valid 409 envelope becomes a typed statement; other errors keep their status and code.
  it.each([
    ["valid refusal", 409, refusal, refusal.statement, "PUBLICATION_CONTENT_REFUSED", "SERVER_FAILURE"],
    ["invalid parts", 409, { ...refusal, statement: { ...refusal.statement, parts: [] } }, null, "PUBLICATION_CONTENT_REFUSED", "SERVER_FAILURE"],
    ["extra envelope text", 409, { ...refusal, reason: "untrusted" }, null, "PUBLICATION_CONTENT_REFUSED", "SERVER_FAILURE"],
    ["wrong status", 503, refusal, null, "PUBLICATION_CONTENT_REFUSED", "SERVER_FAILURE"],
    ["unavailable", 503, { error: "PUBLICATION_CHECK_UNAVAILABLE", message: "PUBLICATION_CHECK_UNAVAILABLE" }, null, "PUBLICATION_CHECK_UNAVAILABLE", "SERVER_FAILURE"],
    ["not found", 404, { error: "RUN_NOT_FOUND" }, null, "RUN_NOT_FOUND", "NOT_FOUND"]
  ] as const)("preserves %s", async (_name, status, body, statement, serverCode, code) => {
    const client = createContractClient("https://contract.invalid", async () =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
    const error: unknown = await client.publishRun("run-test", "a".repeat(43)).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(ContractHttpError);
    expect(error).toMatchObject({ statement, serverCode, status, code });
  });
});
