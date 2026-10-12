import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { ProviderContentUnacceptedError } from "@debateai/providers";
import {
  SYNTHESIS_WORDING_REFUSALS,
  SYNTHESIZER_ANSWER_FORM,
  SYNTHESIZER_SERVED_NUMBER_SLOT,
  SYNTHESIZER_V2_ANSWER_FORM,
  buildEvaluatorRequest,
  buildSynthesisDigest,
  buildSynthesizerRequest,
  idShapedTokensIn,
  synthesisWordingIndex,
  synthesisWordingRefusalsIn,
  toSynthesisPromptMaterial,
  type DigestSourceNode,
  type SynthesisDigest
} from "@debateai/serve";
import {
  COMPOSED_CITATION_REJECTIONS,
  buildComposedRepairPacket,
  buildSynthesisRolePrompt,
  callSynthesisRole,
  classifyComposedContent,
  composedCitationRejectionOf
} from "../../apps/runner/src/index.js";

/**
 * PRACTICE DEBATE 2 (2026-10-12), PROBLEM 7. The served answer printed the
 * served strength unrounded ("0.9600034199999999") and the engine's words. Two
 * root fixes that move no sealed hash:
 *
 *  · the writer and its checker are shown every strength at four decimals
 *    (`toSynthesisPromptMaterial`), never the raw float;
 *  · the writer's content classifier refuses prose that prints a score the
 *    material shows, or one of its code tokens, so the provider's own repair
 *    re-asks (language-independent: digits and code-shaped tokens only).
 */

const SERVED = "c0ed5605-e948-40c3-9e9c-678d87ab4d9d";
const RIVAL = "7bb599d4-64e7-4ad1-b2ab-9e4b9f19c85b";
const OBJECTION = "6bbdc854-c2f1-4797-812b-ad7fdcbb0956";
const QUESTION = "Should a mid-sized city make its central bus lines free to ride?";

/** The three strengths of practice debate 2, exactly as its material carried them. */
const SERVED_STRENGTH = 0.9600034199999999;
const RIVAL_STRENGTH = 0.9300543760000001;
const MARGIN = 0.02994904399999987;

function sourceNodes(statements: Readonly<Record<string, string>> = {}): readonly DigestSourceNode[] {
  return [
    {
      nodeId: SERVED, statement: statements[SERVED] ?? "Make the central lines free as part of a funded package.",
      finalStrength: SERVED_STRENGTH, wayOfKnowing: "REASONING", marks: ["UNSERVED-MAKER-POSITION"],
      polarityRelations: [], isPosition: true, isSurvivingObjection: false
    },
    {
      nodeId: RIVAL, statement: statements[RIVAL] ?? "Make them free only from a dedicated funding source.",
      finalStrength: RIVAL_STRENGTH, wayOfKnowing: "REASONING", marks: ["UNSERVED-MAKER-POSITION", "DERIVED-STANDING-UNREVIEWED"],
      polarityRelations: [], isPosition: true, isSurvivingObjection: false
    },
    {
      nodeId: OBJECTION, statement: statements[OBJECTION] ?? "Lost fares must be replaced or service falls.",
      finalStrength: 0.9001259752, wayOfKnowing: "LOOKED_UP", marks: [],
      polarityRelations: [{ polarity: "attack", targetNodeId: SERVED }], isPosition: false, isSurvivingObjection: true
    }
  ];
}

function digestOf(nodes: readonly DigestSourceNode[]): SynthesisDigest {
  const outcome = buildSynthesisDigest({ nodes, servedRootNodeId: SERVED, budgetBound: 30_000 });
  if (outcome.kind !== "DIGEST") throw new Error("digest");
  return outcome.digest;
}

const CONTROLS = { synthesizerRoleRef: "provider:writer", evaluatorRoleRef: "provider:checker", evaluatorLoopMaxRounds: 2 };
const CODE_LABEL = {
  verdictLabel: "CONTESTED", servedNodeId: SERVED, servedStrength: SERVED_STRENGTH, margin: MARGIN, registerVersion: 11
};

function writerRequest(nodes: readonly DigestSourceNode[] = sourceNodes()) {
  return buildSynthesizerRequest({ controls: CONTROLS, round: 1, digest: digestOf(nodes), codeLabel: CODE_LABEL, prior: null });
}

function personTextsOf(nodes: readonly DigestSourceNode[], question = QUESTION): readonly string[] {
  return [question, ...nodes.map((node) => node.statement)];
}

describe("P7 · the writer and its checker are shown rounded strengths, never the raw float", () => {
  it("rounds the code label and every digest strength to four decimals; the request keeps the exact values", () => {
    const request = writerRequest();
    const fields = toSynthesisPromptMaterial(request);
    const codeLabel = JSON.parse(fields.find((field) => field.name === "code_label")!.content) as Record<string, unknown>;
    expect(codeLabel).toEqual({ verdictLabel: "CONTESTED", servedNodeId: SERVED, servedStrength: 0.96, margin: 0.0299 });
    const digest = JSON.parse(fields.find((field) => field.name === "digest")!.content) as SynthesisDigest;
    expect(digest.nodes.map((node) => node.finalStrength)).toEqual(
      request.digest.nodes.map((node) => Math.round(node.finalStrength! * 10_000) / 10_000)
    );
    const rendered = fields.map((field) => field.content).join("\n");
    for (const raw of ["0.9600034199999999", "0.9300543760000001", "0.02994904399999987", "0.9001259752"]) {
      expect(rendered).not.toContain(raw);
    }
    // Only the shown digits change: every key, in order, and every other value is the built digest's.
    const built = JSON.parse(JSON.stringify(request.digest)) as SynthesisDigest;
    expect(Object.keys(digest)).toEqual(Object.keys(built));
    expect(digest.nodes.map((node) => ({ ...node, finalStrength: null })))
      .toEqual(built.nodes.map((node) => ({ ...node, finalStrength: null })));
    expect(request.codeLabel.servedStrength).toBe(SERVED_STRENGTH);
    expect(request.digest.nodes.find((node) => node.nodeId === SERVED)!.finalStrength).toBe(SERVED_STRENGTH);
  });

  it("shows the checker the same rounded numbers, and keeps a null margin and a null strength null", () => {
    const nodes = sourceNodes().map((node, index) => index === 2 ? { ...node, finalStrength: null } : node);
    const request = buildEvaluatorRequest({
      controls: CONTROLS, round: 1, digest: digestOf(nodes), codeLabel: { ...CODE_LABEL, margin: null },
      candidateStatement: "A funded package is the better answer."
    });
    const fields = toSynthesisPromptMaterial(request);
    const codeLabel = JSON.parse(fields.find((field) => field.name === "code_label")!.content) as Record<string, unknown>;
    expect(codeLabel.servedStrength).toBe(0.96);
    expect(codeLabel.margin).toBeNull();
    const digest = JSON.parse(fields.find((field) => field.name === "digest")!.content) as SynthesisDigest;
    expect(digest.nodes.find((node) => node.nodeId === OBJECTION)!.finalStrength).toBeNull();
  });
});

describe("P7 · the answer's prose prints no score and no code token from its material", () => {
  const nodes = sourceNodes();
  const request = writerRequest(nodes);
  const index = synthesisWordingIndex({ request, personTexts: personTextsOf(nodes) });

  it("refuses the served strength in every printed form, the margin, and each node's strength", () => {
    for (const text of [
      "The supplied served final strength is 0.9600034199999999, but the digest records counterpositions.",
      "Its strength is 0.96.", "Puterea sa este 0,96.", "Сила — 0,96.",
      "The rival scored 0.93.", "The rival scored 0,9301 in the end.", "A margin of 0.03 separates them.",
      "The margin is 0.0299.", "The objection holds at 0.90."
    ]) expect(synthesisWordingRefusalsIn(text, index), text).toEqual(["COMPOSED_TEXT_PRINTS_A_SCORE"]);
  });

  it("refuses the material's code tokens in any language's sentence", () => {
    for (const text of [
      "The finalStrength of the package is high.", "Laut code_label ist die Frage offen.",
      "Use number:final-strength here.", "This rests on REASONING alone.", "Le verdict est CONTESTED.",
      "It is an UNSERVED-MAKER-POSITION.", "The node_refs show it.", "Its servedStrength is high."
    ]) expect(synthesisWordingRefusalsIn(text, index), text).toEqual(["COMPOSED_TEXT_USES_ENGINE_CODE"]);
    expect(index.engineTokens.has(SYNTHESIZER_SERVED_NUMBER_SLOT)).toBe(true);
    // The slot the code token names is the one the sealed v2 answer form named. serve.synthesizer.v3
    // (practice debate 3) asks for no slot at all, and the check stays exactly as strict: the slot is
    // still refused in an answer's text.
    expect(SYNTHESIZER_V2_ANSWER_FORM).toContain(`The available slot is ${SYNTHESIZER_SERVED_NUMBER_SLOT},`);
    expect(SYNTHESIZER_ANSWER_FORM).not.toContain(SYNTHESIZER_SERVED_NUMBER_SLOT);
    expect(SYNTHESIZER_ANSWER_FORM).toContain("served_number_refs is always [].");
  });

  it("leaves ordinary words, other figures and percentages alone", () => {
    for (const text of [
      "The reasoning is contested, and the margin between the packages is small.",
      "A fare of 10,96 lei is charged today.", "About 96% of riders would benefit.", "Ridership rose by 0,96 % a month.",
      "Lines 1, 2 and 3 carry 0.5 million riders.", "The reasons are equity, simplicity and faster boarding.",
      "Une analyse raisonnée, pas une certitude.", "Ein Paket aus Finanzierung und Takt."
    ]) expect(synthesisWordingRefusalsIn(text, index), text).toEqual([]);
  });

  it("lets the answer repeat a figure or a token the question or a debater's statement states", () => {
    const own = sourceNodes({ [RIVAL]: "A dedicated levy of 0,93 lei per ticket would fund it, as the REASONING memo says." });
    const ownRequest = writerRequest(own);
    const ownIndex = synthesisWordingIndex({
      request: ownRequest,
      personTexts: personTextsOf(own, "Is a fare of 0.96 euro worth keeping on the central lines?")
    });
    expect(synthesisWordingRefusalsIn("Keeping a 0.96 euro fare is not worth it.", ownIndex)).toEqual([]);
    expect(synthesisWordingRefusalsIn("A levy of 0.93 lei per ticket would fund it.", ownIndex)).toEqual([]);
    expect(synthesisWordingRefusalsIn("The REASONING memo agrees.", ownIndex)).toEqual([]);
    // Still refused: a strength nobody stated, and the other code tokens.
    expect(synthesisWordingRefusalsIn("The margin is 0.03.", ownIndex)).toEqual(["COMPOSED_TEXT_PRINTS_A_SCORE"]);
    expect(synthesisWordingRefusalsIn("It is CONTESTED.", ownIndex)).toEqual(["COMPOSED_TEXT_USES_ENGINE_CODE"]);
  });
});

describe("P7 · wired into the writer's classifier, so the provider's own repair re-asks", () => {
  const nodes = sourceNodes();
  const request = writerRequest(nodes);
  const personTexts = personTextsOf(nodes);
  const citation = {
    digest: request.digest,
    servedNodes: nodes,
    exemptTokens: idShapedTokensIn(personTexts),
    wording: synthesisWordingIndex({ request, personTexts })
  };
  const composition = (hypothesis: string, plan = "Measure ridership and costs in a comparable city."): string =>
    JSON.stringify({ segments: [
      { segment_id: "served-hypothesis", text: hypothesis, node_refs: [SERVED, RIVAL], served_number_refs: [] },
      { segment_id: "research-plan", text: plan, node_refs: [SERVED], served_number_refs: [] }
    ] });
  const issuesOf = (classified: ReturnType<typeof classifyComposedContent>): unknown =>
    classified.parseStatus === "PARSED" ? [] : JSON.parse(classified.parseError);

  it("refuses practice debate 2's served sentence and accepts the same finding stated plainly", () => {
    const served = classifyComposedContent(composition(
      "The supplied served final strength is 0.9600034199999999, but the digest records counterpositions, "
      + "so this is not presented as settled."
    ), citation);
    expect(served.parseStatus).toBe("SCHEMA_FAILED");
    expect(issuesOf(served)).toEqual([{ path: ["segments", 0, "text"], message: "COMPOSED_TEXT_PRINTS_A_SCORE" }]);
    expect(composedCitationRejectionOf(served.parseError ?? "")).toBe("COMPOSED_TEXT_PRINTS_A_SCORE");

    const plain = classifyComposedContent(composition(
      "Making the central lines free works best as part of a funded package, but strong alternatives remain, so this is not settled."
    ), citation);
    expect(plain).toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("names each wrong segment by its machine path, and the repair turn carries the code", () => {
    const both = classifyComposedContent(composition("It is CONTESTED.", "Its strength is 0,96."), citation);
    expect(issuesOf(both)).toEqual([
      { path: ["segments", 0, "text"], message: "COMPOSED_TEXT_USES_ENGINE_CODE" },
      { path: ["segments", 1, "text"], message: "COMPOSED_TEXT_PRINTS_A_SCORE" }
    ]);
    expect(composedCitationRejectionOf(both.parseError ?? "")).toBe("COMPOSED_TEXT_USES_ENGINE_CODE");
    expect(COMPOSED_CITATION_REJECTIONS).toEqual(expect.arrayContaining([...SYNTHESIS_WORDING_REFUSALS]));
    const score = classifyComposedContent(composition("Its strength is 0,96."), citation);
    const repair = JSON.stringify(buildComposedRepairPacket(buildSynthesisRolePrompt(request, "English"), {
      parseStatus: score.parseStatus, parseError: score.parseError ?? ""
    }));
    expect(repair).toContain("COMPOSED_TEXT_PRINTS_A_SCORE");
  });

  it("checks node names only when no wording index is passed (the old callers)", () => {
    const withoutWording = { digest: citation.digest, servedNodes: citation.servedNodes, exemptTokens: citation.exemptTokens };
    expect(classifyComposedContent(composition("Its strength is 0.96."), withoutWording))
      .toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("ends the round SYNTHESIS_NO_ARTIFACT, never a FAILED run, when every repair is still refused", async () => {
    for (const code of SYNTHESIS_WORDING_REFUSALS) {
      const refusal = await callSynthesisRole(async () => {
        throw new ProviderContentUnacceptedError(
          2, "SCHEMA_FAILED", JSON.stringify([{ path: ["segments", 0, "text"], message: code }]), "artifact:last", "ledger:last"
        );
      }, { role: "SYNTHESIZER", callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1" }, "COMPOSITION_CONTRACT_ERROR")
        .then(() => null, (error: unknown) => error);
      expect(refusal).toBeInstanceOf(TypedDomainError);
      expect((refusal as TypedDomainError).code).toBe("SYNTHESIS_NO_ARTIFACT");
      expect((refusal as TypedDomainError).message).toContain(code);
    }
  });
});
