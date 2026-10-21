import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Judge, PanelMemberFailure } from "@debateai/judgement";
import { TEXT_NOT_IN_QUESTION_LANGUAGE, replyLanguageCheck } from "@debateai/kernel";
import {
  OpenAICompatibleProviderGateway,
  createPreviewGuardedFetch,
  parsePreviewProviderTestConfig,
  previewTargetGatewayControls,
  readPromptFrame,
  withPreviewProviderCallPolicy,
  type ContentClassification,
  type PreviewBudgetExecution,
  type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import { STORY_BODY_PROSE, STORY_CHECKER_PROSE, STORY_ENGINE_TOKENS, classifyCheckerContent, classifyStoryContent, type StoryMaterialIndex } from "@debateai/story";
import type { SynthesisDigest } from "@debateai/serve";
import { classifyComposedContent, classifyEvaluatorContent } from "../../apps/runner/src/index.js";

/**
 * REPLY LANGUAGE through the repair the engine already has (2026-10-12): a reply that is not in the question's language
 * is refused under its own code, TEXT_NOT_IN_QUESTION_LANGUAGE; the short follow-up hands the model its own answer and
 * asks only for the refused members; a follow-up that is still in another language gets the full re-ask; a call whose
 * every try is in another language fails. Nothing is ever translated or accepted silently. The first replies are
 * MiMo-V2.6-Pro's own, verbatim, from the 2026-10-12 practice debates; the wire is the preview's DeepInfra gate.
 */
interface PracticeReply { readonly source: string; readonly content: string }
const PRACTICE = JSON.parse(readFileSync(new URL("../support/fixtures/reply-language/practice-2026-10-12-replies.json", import.meta.url), "utf8")) as {
  readonly question: string;
  readonly replies: readonly PracticeReply[];
};
const reply = (source: string): string => {
  const found = PRACTICE.replies.find((entry) => entry.source === source);
  if (found === undefined) throw new Error(`no fixture ${source}`);
  return found.content;
};
const STRAY = JSON.parse(readFileSync(new URL("../support/fixtures/reply-language/stray-script-2026-10.json", import.meta.url), "utf8")) as {
  readonly cases: readonly { question: string; text: string }[];
};
const QUESTION = PRACTICE.question;
const FRENCH_REVIEW = reply("debate-3c#288");
const GERMAN_ATTACK = reply("debate-3c#241");
const CHINESE_FLAGS = reply("debate-3c#116");
const POLISH_PANEL = reply("debate-3c#219");
const ENGLISH_REASONS = [
  "The node disputes the target on its own ground: universal free fares subsidise riders who would pay anyway.",
  "It names the cheaper alternative it prefers, targeted passes, and says why they reach the riders deterred by price.",
  "Its claim that the lost fare revenue is a certain cost is fair, though the size of that cost is asserted rather than shown.",
  "The bearing is strong because the attack engages the target's funding premise directly."
];

// The wire is the patch follow-up tests' own (GLM on the preview's DeepInfra gate); the replies are MiMo's.
const GLM = "zai-org/GLM-5.3-Flash";
const ENDPOINT = "https://api.deepinfra.com/v1/openai";
const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "preview-reply-language-fixture",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
  free_model_ids: [GLM], premium_model_ids: [GLM]
}))!;

function deepInfraHarness(script: string[]) {
  const executions: PreviewBudgetExecution[] = [];
  const artifacts: RawArtifactInput[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const fetcher = createPreviewGuardedFetch({ execute: async (input) => {
    executions.push(input);
    const next = script.shift();
    if (next === undefined) return { status: 599, body: JSON.stringify({ error: "script_exhausted" }) };
    return { status: 200, body: JSON.stringify({ id: `fixture-${executions.length}`, model: GLM,
      choices: [{ message: { content: next }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
  } });
  const native = new OpenAICompatibleProviderGateway({
    endpoint: ENDPOINT, model: GLM, maker: "Z.AI",
    thinking: { parameter: "reasoning_effort", levels: ["high"] }, fetchImplementation: fetcher,
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return entry.attemptId; },
    supportsJsonObjectResponse: true,
    ...previewTargetGatewayControls(CONFIG, { model: GLM })
  });
  const gateway = withPreviewProviderCallPolicy(native, CONFIG, { model: GLM }, { sleep: async () => undefined });
  return { gateway, executions, artifacts, ledger };
}
const bodyOf = (execution: PreviewBudgetExecution) => JSON.parse(execution.requestBody) as { messages: { role: string; content: string }[] };
const machineFields = (execution: PreviewBudgetExecution) =>
  readPromptFrame({ messages: bodyOf(execution).messages as never }).fields.filter((field) => field.name.startsWith("machine_"));

const subject = {
  runId: "run:synthetic", subjectItemId: "node:synthetic", questionLine: QUESTION, argumentLanguageName: "English",
  statement: "Free central lines buy little: most new riders would have walked or already ride, so the money is better spent on frequency.",
  authorMaker: "practice-other-maker", providerRef: "preview:fixture-a", contractHash: "contract:synthetic",
  bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 }
} as const;
const reviewInput = () => ({ ...subject, callSiteKey: "JUDGE:review:synthetic",
  edges: [{ edgeId: "edge:synthetic", polarity: "attack" as const, targetStatement: "A mid-sized city should make its central bus lines free." }] });

describe("a review in French (the real MiMo reply): the short follow-up asks for the reasons in the question's language", () => {
  it("one patch POST naming the language code and the reasons; the English reasons are merged and accepted", async () => {
    const { gateway, executions, artifacts, ledger } = deepInfraHarness([FRENCH_REVIEW, JSON.stringify({ reasons: ENGLISH_REASONS })]);
    const reviewed = await new Judge(gateway).review(reviewInput());
    expect(executions).toHaveLength(2);
    expect(reviewed.reasons).toEqual(ENGLISH_REASONS);
    // Everything else is the model's first answer, unchanged.
    expect(reviewed.outcome).toBe("dispute");
    expect(reviewed.edgeMeasurements.map((edge) => edge.bearing)).toEqual([0.9]);
    // The follow-up: the first call's messages byte for byte, the model's own answer, then the machine block.
    const [first, second] = [bodyOf(executions[0]!), bodyOf(executions[1]!)];
    expect(second.messages.slice(0, 2)).toEqual(first.messages);
    expect(second.messages[2]).toEqual({ role: "assistant", content: FRENCH_REVIEW });
    expect(machineFields(executions[1]!)).toEqual([
      { name: "machine_rejection_code", content: TEXT_NOT_IN_QUESTION_LANGUAGE },
      { name: "machine_rejection_paths", content: "reasons" },
      { name: "machine_reply_form", content: "PATCH" }
    ]);
    // The refusal is recorded under its own issue code, never the model's words.
    expect(artifacts[0]!.parseStatus).toBe("SCHEMA_FAILED");
    expect(JSON.parse(artifacts[0]!.parseError!)).toEqual([
      { code: TEXT_NOT_IN_QUESTION_LANGUAGE, path: ["reasons"], message: TEXT_NOT_IN_QUESTION_LANGUAGE }
    ]);
    expect(artifacts[1]!.parseStatus).toBe("PARSED");
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "OK"]);
  });

  it("a follow-up still in French gets the full re-ask under the language code; its English answer is accepted", async () => {
    const french = (JSON.parse(FRENCH_REVIEW) as { reasons: string[] }).reasons;
    const english = JSON.stringify({ ...JSON.parse(FRENCH_REVIEW), reasons: ENGLISH_REASONS });
    const { gateway, executions, artifacts } = deepInfraHarness([FRENCH_REVIEW, JSON.stringify({ reasons: french }), english]);
    const reviewed = await new Judge(gateway).review(reviewInput());
    expect(executions).toHaveLength(3);
    expect(reviewed.reasons).toEqual(ENGLISH_REASONS);
    expect(bodyOf(executions[2]!).messages.map((message) => message.role)).toEqual(["system", "user", "user"]);
    expect(machineFields(executions[2]!)).toEqual([
      { name: "machine_rejection_code", content: TEXT_NOT_IN_QUESTION_LANGUAGE },
      { name: "machine_rejection_path", content: "reasons" }
    ]);
    expect(artifacts.map((artifact) => artifact.parseStatus)).toEqual(["SCHEMA_FAILED", "SCHEMA_FAILED", "PARSED"]);
  });

  it("every try in French: the call fails, and nothing in French is accepted", async () => {
    const { gateway, executions, ledger } = deepInfraHarness([FRENCH_REVIEW, JSON.stringify({ reasons: ["Toujours en français, la cible reste contestée sur son financement et sa fréquence."] }), FRENCH_REVIEW]);
    await expect(new Judge(gateway).review(reviewInput())).rejects.toMatchObject({ code: "NODE_REVIEW_SCHEMA_FAILURE" });
    expect(executions).toHaveLength(3);
    expect(ledger.map((entry) => entry.outcome)).toEqual(["FAILED", "FAILED", "FAILED"]);
  });
});

describe("an attack written in German (the real MiMo full re-ask that was accepted)", () => {
  it("the follow-up asks for the statement, restatement, summaries and flags; the English answer is accepted", async () => {
    const german = JSON.parse(GERMAN_ATTACK) as Record<string, unknown>;
    const patch = {
      statement: "Even with replacement funding and a frequency guarantee, fare-free central lines are a blunt subsidy: the same money buys more for riders as frequency or targeted passes.",
      restatement_text: "The question asks whether a mid-sized city should make its central bus lines free to ride.",
      "steelman.summary": "The strongest version: free fares spend scarce public money on riders who would pay anyway, while frequency reaches every rider.",
      "critic.summary": "A plausible counter: targeted passes carry enrolment friction and stigma, so universal fares may reach deterred riders better.",
      "context.ambiguityFlags": ["The size of the city's budget is not given.", "How much fare revenue the central lines raise is not given."]
    };
    const { gateway, executions } = deepInfraHarness([GERMAN_ATTACK, JSON.stringify(patch)]);
    const judged = await new Judge(gateway).judge({ ...subject, callSiteKey: "JUDGE:critic:synthetic",
      leg: { kind: "attack", positionUnderDebate: "A mid-sized city should make its central bus lines free." } });
    expect(executions).toHaveLength(2);
    expect(machineFields(executions[1]!)).toEqual([
      { name: "machine_rejection_code", content: TEXT_NOT_IN_QUESTION_LANGUAGE },
      { name: "machine_rejection_paths", content: "statement,restatement_text,steelman.summary,critic.summary,context.ambiguityFlags" },
      { name: "machine_reply_form", content: "PATCH" }
    ]);
    expect(judged.statement).toBe(patch.statement);
    expect(judged.assessment.context.ambiguityFlags).toEqual(patch["context.ambiguityFlags"]);
    // The scores are the model's first answer's.
    expect(judged.assessment.critic.counterargumentStrength).toBe((german.critic as { counterargumentStrength: number }).counterargumentStrength);
  });
});

describe("a panel assessment with its ambiguity flags in Chinese (the real MiMo reply, English otherwise)", () => {
  it("only the flags are asked for again", async () => {
    const flags = ["The population and budget of a 'mid-sized city' are not defined.", "The extent of the 'central bus lines' is not defined."];
    const { gateway, executions } = deepInfraHarness([CHINESE_FLAGS, JSON.stringify({ "context.ambiguityFlags": flags })]);
    const assessed = await new Judge(gateway).assess({ ...subject, callSiteKey: "PANEL:root:synthetic" });
    expect(machineFields(executions[1]!)).toEqual([
      { name: "machine_rejection_code", content: TEXT_NOT_IN_QUESTION_LANGUAGE },
      { name: "machine_rejection_paths", content: "context.ambiguityFlags" },
      { name: "machine_reply_form", content: "PATCH" }
    ]);
    expect(assessed.assessment.context.ambiguityFlags).toEqual(flags);
    expect(assessed.assessment.steelman.summary).toBe((JSON.parse(CHINESE_FLAGS) as { steelman: { summary: string } }).steelman.summary);
  });

  it("a panel member whose every try is in Polish is a SCHEMA_FAILURE of that member, not an accepted assessment", async () => {
    const { gateway } = deepInfraHarness([POLISH_PANEL, "{\"steelman.summary\": \"Pozycja argumentuje, że bezpłatne linie są uzasadnione tylko przy stabilnym finansowaniu.\"}", POLISH_PANEL]);
    const failure = await new Judge(gateway).assess({ ...subject, callSiteKey: "PANEL:critic:synthetic" }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PanelMemberFailure);
    expect(failure).toMatchObject({ failureKind: "SCHEMA_FAILURE" });
    expect(String((failure as PanelMemberFailure).message)).toContain(TEXT_NOT_IN_QUESTION_LANGUAGE);
  });
});

/** The story, the answer and their checkers: the same refusal, from each step's own classifier. */
const STOP = { finishReason: "stop" } as const;
const POLISH = (JSON.parse(POLISH_PANEL) as { steelman: { summary: string } }).steelman.summary;
const refusedPaths = (classified: ContentClassification): string[] => {
  if (classified.parseStatus === "PARSED") throw new Error("expected a refusal");
  return (JSON.parse(classified.parseError) as { code: string; path: (string | number)[] }[]).map((issue) => {
    expect(issue.code).toBe(TEXT_NOT_IN_QUESTION_LANGUAGE);
    return issue.path.join(".");
  });
};

describe("the story and its checker", () => {
  const INDEX: StoryMaterialIndex = {
    nodeIds: new Set(["P1", "P2", "P3"]), positionIds: new Set(["P1", "P2"]), positionOrder: ["P1", "P2"],
    shapeIds: new Set(["general"]), pathCap: 8, scoreTexts: new Set(), engineTokens: new Set(STORY_ENGINE_TOKENS)
  };
  const story = (summary: string) => JSON.stringify({
    shape_id: "general",
    short: {
      headline: "Make the central lines free only where the lost fares are replaced from a stable source.",
      summary,
      confidence: "Fairly sure, as long as the replacement funding holds.",
      paths: [
        { position_ref: "P1", fate: "HELD_UP", line: "Free with stable funding: it held up.", node_refs: ["P1", "P3"] },
        { position_ref: "P2", fate: "FELL", line: "Targeted passes instead: the reach objection stood.", node_refs: ["P2"] }
      ],
      change: { text: "A city that cannot replace the fare revenue should keep the fares.", node_refs: ["P3"] }
    },
    why: { reasons: [{ text: "The funding condition decided it: without it, service would be cut.", node_refs: ["P1", "P3"] }] },
    long: { sections: [
      { title: "What you are deciding", paragraphs: [{ text: "Whether free central buses are worth their cost to the city.", node_refs: [] }] },
      { title: "The verdict", paragraphs: [{ text: "Free central lines, but only with stable replacement funding.", node_refs: ["P1"] }] },
      { title: "The paths explored", paragraphs: [{ text: "The funded version held up; the targeted version fell.", node_refs: ["P1", "P2"] }] }
    ] },
    reviewer_note: null
  });
  const english = "Our reading: whether a mid-sized city should drop fares on its central bus lines. Our answer: only where the lost fare revenue is replaced from a stable source.";

  it("a story with a Polish summary is refused at the summary; the English story is accepted", () => {
    const check = replyLanguageCheck(QUESTION, STORY_BODY_PROSE);
    expect(classifyStoryContent(story(english), INDEX, STOP, check)).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(refusedPaths(classifyStoryContent(story(POLISH), INDEX, STOP, check))).toEqual(["short.summary"]);
    // Without the check (every caller before this change) the classifier is unchanged.
    expect(classifyStoryContent(story(POLISH), INDEX, STOP)).toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("R19: a long paragraph with Chinese characters inside an English sentence is refused at that paragraph; in English it is accepted", () => {
    const r19 = STRAY.cases[3]!;
    const check = replyLanguageCheck(r19.question, STORY_BODY_PROSE);
    const withParagraph = (text: string) => {
      const value = JSON.parse(story(english)) as { long: { sections: { paragraphs: { text: string }[] }[] } };
      value.long.sections[2]!.paragraphs[0]!.text = text;
      return JSON.stringify(value);
    };
    expect(refusedPaths(classifyStoryContent(withParagraph(r19.text), INDEX, STOP, check))).toEqual(["long.sections.2.paragraphs.0.text"]);
    expect(classifyStoryContent(withParagraph(r19.text.replace("are大于 the", "are greater than the")), INDEX, STOP, check))
      .toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("a checker objection in Polish is refused; no objection, or an English one, is accepted", () => {
    const check = replyLanguageCheck(QUESTION, STORY_CHECKER_PROSE);
    const criteria = { faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: false,
      citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true };
    const verdict = (objection: string | null) => JSON.stringify({ satisfied: objection === null, objection,
      criteria: objection === null ? { ...criteria, no_overstatement: true } : criteria });
    expect(classifyCheckerContent(verdict(null), STOP, check).parseStatus).toBe("PARSED");
    expect(classifyCheckerContent(verdict("The summary overstates how sure the debate was about the funding source."), STOP, check).parseStatus).toBe("PARSED");
    expect(refusedPaths(classifyCheckerContent(verdict(POLISH), STOP, check))).toEqual(["objection"]);
  });

  it("the writer gives both its calls the question's language check", () => {
    const writer = readFileSync(new URL("../../packages/story/src/writer.ts", import.meta.url), "utf8");
    // P2L Task 16: the check is the locked one when the run is locked, today's replyLanguageCheck otherwise.
    expect(writer).toContain("const storyInQuestionLanguage = replyLanguageCheckFor(input.questionLine, lock, STORY_BODY_PROSE);");
    expect(writer).toContain("const checkerInQuestionLanguage = replyLanguageCheckFor(input.questionLine, lock, STORY_CHECKER_PROSE);");
    expect(writer).toContain("classifyStoryContent(content, built.index, reply, storyInQuestionLanguage)");
    expect(writer).toContain("classifyCheckerContent(content, reply, checkerInQuestionLanguage)");
  });
});

describe("the answer writer and its checker", () => {
  const NODE = "3f2a9c1e-7b4d-4e8f-9a01-5c6d7e8f9a0b";
  const citation = {
    digest: { nodes: [{ nodeId: NODE }], emphasis: {}, compressionLevel: 0, summaryCharacterCap: null, byteSize: 0 } as unknown as SynthesisDigest,
    servedNodes: [{ nodeId: NODE }],
    exemptTokens: new Set<string>(),
    questionLine: QUESTION
  };
  const composition = (...texts: string[]) => JSON.stringify({ segments: texts.map((text, index) =>
    ({ segment_id: `segment:${index}`, text, node_refs: ["primary"], served_number_refs: [] })) });

  it("a segment in Polish is refused at its text; an English answer is accepted", () => {
    const englishText = "A mid-sized city should make its central lines free only where it can replace the lost fares from a stable source.";
    expect(classifyComposedContent(composition(englishText), citation, STOP)).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(refusedPaths(classifyComposedContent(composition(englishText, POLISH), citation, STOP))).toEqual(["segments.1.text"]);
    const { questionLine: _omitted, ...withoutQuestion } = citation;
    expect(classifyComposedContent(composition(englishText, POLISH), withoutQuestion, STOP).parseStatus).toBe("PARSED");
  });

  it("a segment with Chinese characters inside an English sentence is refused at its text", () => {
    const englishText = "A mid-sized city should make its central lines free only where it can replace the lost fares from a stable source.";
    const slipped = "The hidden system costs of free fares are大于 the city admits, so the funding must be found first.";
    expect(refusedPaths(classifyComposedContent(composition(englishText, slipped), citation, STOP))).toEqual(["segments.1.text"]);
  });

  it("an objection in Polish is refused; with no question the checker is read as before", () => {
    const verdict = (objection: string | null) => JSON.stringify({ satisfied: objection === null, objection, criteria: {
      fairness_to_losers: true, statement_label_agreement: true, no_overstatement: objection === null, restatement: true, citation_tracing: true } });
    expect(classifyEvaluatorContent(verdict(null), STOP, QUESTION).parseStatus).toBe("PARSED");
    expect(refusedPaths(classifyEvaluatorContent(verdict(POLISH), STOP, QUESTION))).toEqual(["objection"]);
    expect(classifyEvaluatorContent(verdict(POLISH), STOP).parseStatus).toBe("PARSED");
  });
});
