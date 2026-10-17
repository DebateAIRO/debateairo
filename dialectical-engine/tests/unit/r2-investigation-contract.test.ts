import { describe, expect, it } from "vitest";
import {
  LENGTH_GUIDANCE_START, LENGTH_SENTENCE_WRITING, questionLanguageOf, type PointInvestigationMaterial
} from "@debateai/kernel";
import {
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT, Judge, POINT_INVESTIGATION_ANSWER_FORM, POINT_INVESTIGATION_BASES,
  POINT_INVESTIGATION_CONTRACT_ID, POINT_INVESTIGATION_INSTRUCTIONS, POINT_INVESTIGATION_MATERIAL_FIELDS,
  POINT_INVESTIGATION_OUTCOMES, POINT_INVESTIGATION_PROMPT_CONTRACT, POINT_INVESTIGATION_READING,
  POINT_INVESTIGATION_RESULTS, classifyStructuredArtifact, orderPointInvestigations, pickPointInvestigator,
  pointInvestigationContentIssues, pointInvestigationMaterialFields, pointInvestigationReplySchema,
  pointInvestigationResultOf, pointInvestigationStatus, type PointInvestigationCandidate
} from "@debateai/judgement";
import {
  ProviderContentUnacceptedError, readPromptFrame, type ProviderCallRequest, type ProviderGateway
} from "@debateai/providers";

const STOP = { finishReason: "stop" } as const;
const GUIDE = Object.freeze({ words: 60, languageCode: "en", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord });
const MATERIAL: PointInvestigationMaterial = Object.freeze({
  question: "Should the city build a new tram line?",
  answer: "No, improve the buses instead.",
  point: "Buses cannot match a tram at rush hour.",
  targetPoint: "Better buses do the job for less.",
  targetRelation: "ATTACKS",
  restsOn: null,
  reviewerReason: "No ridership numbers are given."
});
const HOLDS = {
  missing: "Rush-hour ridership on the planned route.",
  found: "Tram lines of this kind usually carry about twice the riders of the bus lines they replace.",
  basis: "established", outcome: "holds",
  reason: "With that ridership the buses would need twice the vehicles, so the point holds."
};
const candidate = (nodeId: string, distanceToAnswer: number, honestScore: number, reviewOrder: number): PointInvestigationCandidate =>
  ({ nodeId, authorMaker: "m-a", reviewerMaker: "m-b", distanceToAnswer, honestScore, reviewOrder });
const SEATS = Object.freeze([
  { maker: "m-a", providerRef: "ref-a" }, { maker: "m-b", providerRef: "ref-b" },
  { maker: "m-c", providerRef: "ref-c" }, { maker: "m-d", providerRef: "ref-d" }, { maker: "m-e", providerRef: "ref-e" }
]);

/** Every number anywhere in a value, by path (as A11's no-number walk, tests/unit/r2-engine-material.test.ts). */
function numbersIn(value: unknown, path = "$"): readonly string[] {
  if (typeof value === "number" || typeof value === "bigint") return [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => numbersIn(item, `${path}[${String(index)}]`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => numbersIn(item, `${path}.${key}`));
  }
  return [];
}

/** A gateway double that reads its reply through the request's own classifier, as the real gateway does. */
function scriptedGateway(content: string, seen: ProviderCallRequest[]): ProviderGateway {
  return {
    async call(request) {
      seen.push(request);
      const verdict = request.classifyContent?.(content, STOP);
      if (verdict !== undefined && verdict.parseStatus !== "PARSED") {
        throw new ProviderContentUnacceptedError(1, verdict.parseStatus, verdict.parseError, "artifact:refused", "ledger:refused");
      }
      return { rawArtifactRef: "artifact:investigate", ledgerEntryRef: "ledger:investigate", content,
        provider: "openai-compatible-http", model: "model-d", maker: "m-d", modelVersion: "model-d" };
    }
  };
}

describe("engine 2: the investigation contract (spec §4.2b, INTERFACE §8)", () => {
  it("is verdict.investigate.v1: the owner's option-1 instruction, the length sentence, the code-owned form", () => {
    expect(POINT_INVESTIGATION_CONTRACT_ID).toBe("verdict.investigate.v1");
    expect(POINT_INVESTIGATION_INSTRUCTIONS).toBe("A reviewer could not tell whether the point below holds. Find out "
      + "exactly what is needed to decide it: name the missing piece, such as a fact, a figure, a definition, a source or "
      + "a step of reasoning. Then try to supply that piece from what is generally known, and say whether it is "
      + "established knowledge or your own assumption. Finally say whether, with that piece, the point holds, fails, or "
      + "still cannot be decided. If it still cannot be decided, say what would decide it. Do not judge which answer to "
      + "the question is right, and state nothing about the person asking that the question does not give.");
    expect(POINT_INVESTIGATION_PROMPT_CONTRACT).toEqual({
      contractId: "verdict.investigate.v1",
      instruction: `${POINT_INVESTIGATION_INSTRUCTIONS} ${LENGTH_SENTENCE_WRITING}`,
      answerForm: POINT_INVESTIGATION_ANSWER_FORM
    });
    expect(POINT_INVESTIGATION_ANSWER_FORM).toBe("Return only one JSON object with exactly this schema and no additional keys:\n"
      + "{\n  \"missing\": non-empty string,\n  \"found\": string,\n  \"basis\": \"established\" | \"assumption\" | \"none\",\n"
      + "  \"outcome\": \"holds\" | \"fails\" | \"dead_end\",\n  \"reason\": non-empty string\n}\n"
      + "found is empty, and basis is \"none\", exactly when you could supply nothing.");
    expect(Object.isFrozen(POINT_INVESTIGATION_PROMPT_CONTRACT)).toBe(true);
  });

  it("never joins the engine-1 judge fingerprint (engine 1 keeps its sealed bytes)", () => {
    expect(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT).not.toContain(POINT_INVESTIGATION_CONTRACT_ID);
  });

  it("names its material fields in order; rests_on only when known; the length field last but the language", () => {
    expect(POINT_INVESTIGATION_MATERIAL_FIELDS).toEqual(["question", "answer", "point", "target_point", "relation",
      "rests_on", "reviewer_reason", "length"]);
    expect(pointInvestigationMaterialFields(MATERIAL, GUIDE)).toEqual([
      { name: "question", content: MATERIAL.question },
      { name: "answer", content: MATERIAL.answer },
      { name: "point", content: MATERIAL.point },
      { name: "target_point", content: MATERIAL.targetPoint },
      { name: "relation", content: "attacks" },
      { name: "reviewer_reason", content: MATERIAL.reviewerReason },
      { name: "length", content: "about 60 words" }
    ]);
    expect(pointInvestigationMaterialFields({ ...MATERIAL, restsOn: "assumption", targetRelation: "SUPPORTS" }, GUIDE)
      .map((field) => [field.name, field.content])).toContainEqual(["rests_on", "assumption"]);
    expect(pointInvestigationMaterialFields({ ...MATERIAL, restsOn: "assumption", targetRelation: "SUPPORTS" }, GUIDE)
      .find((field) => field.name === "relation")?.content).toBe("supports");
  });

  it("reads a reply strictly; found and basis must agree (POINT_INVESTIGATION_BASIS_MISMATCH)", () => {
    expect(POINT_INVESTIGATION_BASES).toEqual(["established", "assumption", "none"]);
    expect(POINT_INVESTIGATION_OUTCOMES).toEqual(["holds", "fails", "dead_end"]);
    expect(pointInvestigationReplySchema.safeParse(HOLDS).success).toBe(true);
    expect(pointInvestigationReplySchema.safeParse({ ...HOLDS, note: "x" }).success).toBe(false);
    expect(pointInvestigationReplySchema.safeParse({ ...HOLDS, reason: " " }).success).toBe(false);
    expect(pointInvestigationReplySchema.safeParse({ ...HOLDS, outcome: "maybe" }).success).toBe(false);
    expect(pointInvestigationContentIssues({ ...HOLDS, basis: "established" } as never)).toEqual([]);
    expect(pointInvestigationContentIssues({ ...HOLDS, found: "", basis: "none", outcome: "dead_end" } as never)).toEqual([]);
    const issue = { code: "POINT_INVESTIGATION_BASIS_MISMATCH", path: ["basis"], message: "POINT_INVESTIGATION_BASIS_MISMATCH" };
    expect(pointInvestigationContentIssues({ ...HOLDS, found: "", basis: "assumption" } as never)).toEqual([issue]);
    expect(pointInvestigationContentIssues({ ...HOLDS, basis: "none" } as never)).toEqual([issue]);
    // Ruling PF-R2a6.1 / pre-flight PF-R2a8.6: `found` is handed back TRIMMED, so what A14 stores is what the reader
    // read, and A10's write check (blank exactly when the basis is "none") agrees with this one.
    const blank = pointInvestigationReplySchema.parse({ ...HOLDS, found: "  ", basis: "none", outcome: "dead_end" });
    expect(blank.found).toBe("");
    expect(pointInvestigationContentIssues(blank)).toEqual([]);
    expect(pointInvestigationReplySchema.parse({ ...HOLDS, found: `  ${HOLDS.found} ` }).found).toBe(HOLDS.found);
  });

  it("classifies through the judge's tolerant reading with LG-A's fixer on", () => {
    expect(POINT_INVESTIGATION_READING).toEqual({ unaskedKeys: true, fixer: {} });
    const read = (content: string) => classifyStructuredArtifact(content, pointInvestigationReplySchema, STOP,
      POINT_INVESTIGATION_READING, pointInvestigationContentIssues);
    expect(read(JSON.stringify(HOLDS))).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(read(JSON.stringify({ ...HOLDS, confidence: "high" })).parseStatus).toBe("PARSED");
    const mismatch = read(JSON.stringify({ ...HOLDS, found: "" }));
    expect(mismatch.parseStatus).toBe("SCHEMA_FAILED");
    expect(mismatch.parseError).toContain("POINT_INVESTIGATION_BASIS_MISMATCH");
    expect(read(JSON.stringify({ ...HOLDS, outcome: undefined })).parseStatus).toBe("SCHEMA_FAILED");
    // pre-flight PF-R2a8.6: a whitespace-only `found` with basis "none" reads (it is "" once trimmed).
    expect(read(JSON.stringify({ ...HOLDS, found: "  ", basis: "none", outcome: "dead_end" })).parseStatus).toBe("PARSED");
  });

  it("orders candidates closest to an answer first, then higher honest score, then review order", () => {
    const ordered = orderPointInvestigations([
      candidate("deep", 2, 0.9, 1), candidate("low", 1, 0.4, 2), candidate("high", 1, 0.8, 4), candidate("tie", 1, 0.8, 3)
    ]);
    expect(ordered.map((entry) => entry.nodeId)).toEqual(["tie", "high", "low", "deep"]);
    expect(() => orderPointInvestigations([candidate("bad", 1, Number.NaN, 1)])).toThrow("POINT_INVESTIGATION_CANDIDATE_INVALID");
  });

  it("picks an investigator of neither the author's nor the reviewer's maker, a non-arguing maker first, in seat rotation", () => {
    const pick = (rotationOffset: number, arguing: readonly string[], seats = SEATS) => pickPointInvestigator({
      seats, authorMaker: "m-a", reviewerMaker: "m-b", arguingMakers: new Set(arguing), rotationOffset });
    expect(pick(0, ["m-a", "m-b", "m-c"])).toBe(SEATS[3]);
    expect(pick(4, ["m-a", "m-b", "m-c"])).toBe(SEATS[4]);
    expect(pick(0, ["m-a", "m-b", "m-c", "m-d", "m-e"])).toBe(SEATS[2]);
    expect(pick(9, ["m-a", "m-b", "m-c", "m-d", "m-e"])).toBe(SEATS[4]);
    expect(pick(0, [], SEATS.slice(0, 2))).toBeNull();
    expect(pick(0, [], [])).toBeNull();
  });

  // R2a final wave, Ruling (A13 Minors) 3: a bad rotation offset is a code defect even when no seat is left.
  it.each([-1, 1.5, Number.NaN])("refuses the rotation offset %s before it looks at the seats, an empty list too", (rotationOffset) => {
    for (const seats of [SEATS, []]) {
      expect(() => pickPointInvestigator({ seats, authorMaker: "m-a", reviewerMaker: "m-b", arguingMakers: new Set(), rotationOffset }))
        .toThrow("POINT_INVESTIGATION_ROTATION_INVALID");
    }
  });

  it("reads each outcome as the review the point lacked, and names its row result", () => {
    expect(pointInvestigationStatus("holds")).toBe("AGREE");
    expect(pointInvestigationStatus("fails")).toBe("DISPUTE");
    expect(pointInvestigationStatus("dead_end")).toBe("CANNOT_ASSESS");
    expect(POINT_INVESTIGATION_RESULTS).toEqual(["HOLDS", "FAILS", "DEAD_END", "INVESTIGATION_UNAVAILABLE",
      "INVESTIGATION_SKIPPED", "INVESTIGATION_CAPPED"]);
    expect(["holds", "fails", "dead_end"].map((outcome) => pointInvestigationResultOf(outcome as never)))
      .toEqual(["HOLDS", "FAILS", "DEAD_END"]);
  });

  it("sends one framed REVIEWER call under the engine seal, with the length guide, and reads the reply", async () => {
    const seen: ProviderCallRequest[] = [];
    const judge = new Judge(scriptedGateway(JSON.stringify(HOLDS), seen));
    const lock = questionLanguageOf("en")!;
    const answered = await judge.investigatePoint({
      runId: "run-1", subjectItemId: "work-1", callSiteKey: "VERDICT:investigate:1", providerRef: "ref-d",
      contractHash: "e".repeat(64), bound: { maxAttempts: 2, tokenCeiling: 4096, deadlineMs: 60000 },
      material: MATERIAL, length: GUIDE, questionLanguage: lock
    });
    expect(answered).toEqual({ reply: HOLDS, provenanceRef: "artifact:investigate", providerLedgerRef: "ledger:investigate",
      model: "model-d", maker: "m-d", parseStrategy: "RAW" });
    const [request] = seen;
    expect(request).toMatchObject({ runId: "run-1", subjectItemId: "work-1", callSiteKey: "VERDICT:investigate:1",
      role: "JUDGE", lane: "served", modelRole: "REVIEWER", providerRef: "ref-d", contractHash: "e".repeat(64), guidedWords: 60 });
    expect(typeof request!.classifyContent).toBe("function");
    expect(typeof request!.buildRepairPacket).toBe("function");
    const frame = readPromptFrame(request!.packet);
    expect(frame.contractId).toBe("verdict.investigate.v1");
    expect(frame.fields.map((field) => field.name)).toEqual(["question", "answer", "point", "target_point", "relation",
      "reviewer_reason", "length", "question_language"]);
    // Spec G1 (controller carry): the investigator reads no score, weight, strength, distance or rank. The material
    // fields carry no number value, and no AI-written field carries a digit (only the length guide does).
    expect(numbersIn(pointInvestigationMaterialFields(MATERIAL, GUIDE))).toEqual([]);
    expect(frame.fields.filter((field) => field.name !== "length" && /\d/u.test(field.content))).toEqual([]);
    // R2a final wave B10 (Ruling (A13 Minors) 1): the same read off the wire. The user message is the fenced block; with
    // the fence lines taken off, its envelope's fields carry no digit and no number word, except the length guide,
    // which names only its own target. (Every packet value is a string, so a walk for number VALUES there proves nothing.)
    const user = request!.packet.messages.find((message) => message.role === "user")!.content;
    const lines = user.split("\n");
    expect(lines[0]).toBe(frame.fence);
    expect(lines.at(-1)).toBe(frame.fence);
    const envelope = JSON.parse(lines.slice(1, -1).join("\n")) as { fields: { name: string; content: string }[] };
    expect(envelope.fields.map((field) => field.name)).toEqual(frame.fields.map((field) => field.name));
    const NUMBER_WORD = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|hundred|thousand|half|percent|score|weight|strength|rank)\b/iu;
    for (const field of envelope.fields) {
      if (field.name === "length") {
        expect(field.content).toBe(`about ${String(GUIDE.words)} words`);
        continue;
      }
      expect(field.content, field.name).not.toMatch(/\d/u);
      expect(field.content, field.name).not.toMatch(NUMBER_WORD);
    }
  });

  it("turns a reply still refused after the gateway's repairs into POINT_INVESTIGATION_SCHEMA_FAILURE", async () => {
    const judge = new Judge(scriptedGateway(JSON.stringify({ ...HOLDS, found: "" }), []));
    await expect(judge.investigatePoint({
      runId: "run-1", subjectItemId: "work-1", callSiteKey: "VERDICT:investigate:1", providerRef: "ref-d",
      contractHash: "e".repeat(64), bound: { maxAttempts: 2, tokenCeiling: 4096, deadlineMs: 60000 },
      material: MATERIAL, length: GUIDE
    })).rejects.toMatchObject({ code: "POINT_INVESTIGATION_SCHEMA_FAILURE" });
  });
});
