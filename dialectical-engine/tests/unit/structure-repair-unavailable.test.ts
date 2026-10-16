// tests/unit/structure-repair-unavailable.test.ts
import { describe, expect, it } from "vitest";
import { RUN_LEVEL_SPEND_STOP_CODES, TypedDomainError } from "@debateai/kernel";
import {
  CONTENT_FOLLOW_UP_SENTENCES, PreviewChargeBookedMax, PreviewGateUnavailable, PreviewGateUnsent, ProviderCallFailedError,
  STRUCTURE_REPAIR_PASSED_STOPS, structureFollowUpFor, withStructureRepair, type ProviderCallRequest, type ProviderGateway
} from "@debateai/providers";
import { seatFailureCause } from "../../apps/runner/src/run-seats.js";
import { createRunSitOutBook } from "../../apps/runner/src/run-sit-out.js";
import { GLM, HAIKU_REF, previewGlmHarness, scriptedRepairGateway } from "../support/lg-a-harness.js";
import { BASE, PATCH_REPLY, SCORE_COPY, WRAPPED_QUALITY, panelRequest, pretty, scoreRequest } from "../support/structure-salvage-shapes.js";

const ROUTE_BOUND = { tokenCeiling: 32768, deadlineMs: 1_260_000 };
const panel = (): ProviderCallRequest => panelRequest(scoreRequest());
/** Haiku's call failing as the preview's own classes reach the wrapper (pre-flight PF-S22: the gate's real refusals as causes). */
const haikuFails = (cause: unknown) => scriptedRepairGateway(new ProviderCallFailedError(cause, 1, "FAILED", "ledger:haiku"));
const haikuDown = () => haikuFails(new PreviewGateUnavailable());
const call = (glm: Readonly<{ gateway: ProviderGateway }>, haiku: ReturnType<typeof scriptedRepairGateway>, request: ProviderCallRequest = panel()) =>
  withStructureRepair(glm.gateway, { providerRef: HAIKU_REF, gateway: haiku.gateway, bound: ROUTE_BOUND }).call(request);
/** The GLM harness's gateway, except that its SECOND call (B) throws `new TypedDomainError(code, code)`. */
function secondCallThrows(code: string) {
  const glm = previewGlmHarness([{ content: WRAPPED_QUALITY }]);
  let calls = 0;
  const gateway: ProviderGateway = { call: async (sent) => {
    calls += 1;
    if (calls === 2) throw new TypedDomainError(code, code);
    return glm.gateway.call(sent);
  } };
  return { gateway, calls: () => calls };
}

describe("Option (iii): a refused or unavailable Haiku goes on to B", () => {
  it("Haiku transport death: the original model gets the short follow-up; its seat is not switched; the sit-out book is unchanged", async () => {
    const glm = previewGlmHarness([{ content: WRAPPED_QUALITY }, { content: PATCH_REPLY }]);
    const book = createRunSitOutBook({ gateOf: () => "deepinfra", modelOf: () => GLM });
    const member = book.gateway("preview:fixture-a", withStructureRepair(glm.gateway, { providerRef: HAIKU_REF,
      gateway: haikuFails(new Error("socket hang up")).gateway, bound: ROUTE_BOUND }));
    const result = await member.call(panel());
    expect(JSON.parse(result.content).evidence).toEqual({ quality: 0.5, relevance: 0.7 });
    expect(result).toMatchObject({ repairForm: "PATCH", model: GLM, ledgerEntryRef: glm.ledger[1]!.attemptId });
    expect(book.reasonOf("preview:fixture-a")).toBeNull();
  });

  it("Anthropic gate halted, Haiku 5xx with no bill, and a billed 5xx: same; Haiku's own row stays Haiku's, never cited", async () => {
    for (const cause of [new PreviewGateUnavailable(), new PreviewGateUnsent(), new PreviewChargeBookedMax()]) {
      const glm = previewGlmHarness([{ content: WRAPPED_QUALITY }, { content: PATCH_REPLY }]);
      const result = await call(glm, haikuFails(cause));
      expect(result).toMatchObject({ repairForm: "PATCH" });
      expect(JSON.stringify(result)).not.toContain("ledger:haiku");
    }
  });

  it("a refused Haiku copy goes on to B too", async () => {
    const glm = previewGlmHarness([{ content: WRAPPED_QUALITY }, { content: PATCH_REPLY }]);
    const result = await call(glm, scriptedRepairGateway(pretty({ ...BASE, evidence: { quality: 0.9, relevance: 0.7 } })));
    expect(result).toMatchObject({ repairForm: "PATCH" });
  });

  it("a real content refusal of B stays PROVIDER_CONTENT_UNACCEPTED with the first reply's facts, and seatFailureCause reads no switch", async () => {
    const glm = previewGlmHarness([{ content: WRAPPED_QUALITY }, { content: "not json" }]);
    const error = await call(glm, haikuDown()).catch((caught: unknown) => caught);
    expect(glm.executions).toHaveLength(2); // B was sent (pre-flight PF-S18: this line fails first)
    expect(error).toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", lastLedgerEntryRef: glm.ledger[0]!.attemptId });
    expect(seatFailureCause(error)).toBeNull();
  });

  it("the original model's own transport death during B is a ProviderCallFailedError naming the original's row", async () => {
    const glm = previewGlmHarness([{ content: WRAPPED_QUALITY }]); // the script runs out: 599 on B
    const error = await call(glm, haikuDown()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderCallFailedError);
    expect((error as ProviderCallFailedError).lastLedgerEntryRef).toBe(glm.ledger.at(-1)!.attemptId);
    expect(seatFailureCause(error)).toBe("TRANSPORT_FAILURE");
  });

  it("an unbilled refusal of B is resent once, then the call ends; never a third billed POST", async () => {
    const glm = previewGlmHarness([{ content: WRAPPED_QUALITY }, { refuse: true }, { refuse: true }]);
    await call(glm, haikuDown()).catch(() => undefined);
    expect(glm.executions).toHaveLength(3);
    expect(glm.ledger.filter((row) => row.outcome !== "REFUSED")).toHaveLength(1);
  });

  it("a money stop, CALL_LANE_STOPPED and RUN_COST_ENVELOPE_ROOM_KEPT on the Haiku call keep their names; B is not sent", async () => {
    for (const code of [RUN_LEVEL_SPEND_STOP_CODES[0]!, ...STRUCTURE_REPAIR_PASSED_STOPS]) {
      const glm = previewGlmHarness([{ content: WRAPPED_QUALITY }, { content: PATCH_REPLY }]);
      await expect(call(glm, scriptedRepairGateway(new TypedDomainError(code, code)))).rejects.toMatchObject({ code });
      expect(glm.executions).toHaveLength(1);
    }
    // The control (pre-flight PF-S18: fails first): any other Haiku failure on the same reply does send B.
    const control = previewGlmHarness([{ content: WRAPPED_QUALITY }, { content: PATCH_REPLY }]);
    await call(control, haikuDown());
    expect(control.executions).toHaveLength(2);
  });

  it("a money stop and CALL_LANE_STOPPED on B keep their names", async () => {
    for (const code of [RUN_LEVEL_SPEND_STOP_CODES[0]!, "CALL_LANE_STOPPED"]) {
      const double = secondCallThrows(code);
      const error = await call(double, haikuDown()).catch((caught: unknown) => caught);
      expect(double.calls()).toBe(2); // B was attempted
      expect(error).toMatchObject({ code });
    }
  });

  it("no B on judge steps when nothing could be read: today's refusal, no second POST", async () => {
    // The plan itself says no B (pre-flight PF-S18: fails first on `structureFollowUpFor`).
    expect(structureFollowUpFor(panel(), { rejected: { rawText: "I rate it fair.", parseStatus: "PARSE_FAILED", parseError: "PARSE_FAILED",
      failureClass: "STRUCTURE" }, rawArtifactRef: "artifact:first", ledgerEntryRef: "ledger:first", materialMarked: false })).toBeNull();
    const glm = previewGlmHarness([{ content: "I rate it fair." }]);
    await expect(call(glm, haikuDown())).rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED" });
    expect(glm.executions).toHaveLength(1);
  });

  it("the answer writer and checker, nothing readable: one full re-ask carrying the owner's sentence", async () => {
    for (const callSiteKey of ["COMPOSER:SYNTHESIZER:INITIAL:1", "POST_COMPOSE_R9:EVALUATOR:1"]) {
      const glm = previewGlmHarness([{ content: "Here is my answer, in prose." }, { content: SCORE_COPY }]);
      const result = await call(glm, haikuDown(), scoreRequest({ callSiteKey }));
      expect(result).toMatchObject({ content: SCORE_COPY, repairForm: "FULL" });
      const sent = (JSON.parse(glm.executions[1]!.requestBody) as { messages: { content: string }[] }).messages.at(-1)!.content;
      expect(sent).toContain(CONTENT_FOLLOW_UP_SENTENCES.STRUCTURE_UNREAD);
      // Task 4 review (carried): B is the same call's second POST, at the original key, recorded as a FULL re-ask, attempt 2.
      expect(glm.artifacts[1]).toMatchObject({ replyForm: "FULL", metadata: { attempt: 2 } });
      expect(glm.ledger.map((row) => [row.callSiteKey, row.outcome])).toEqual([[callSiteKey, "FAILED"], [callSiteKey, "OK"]]);
    }
  });
});
