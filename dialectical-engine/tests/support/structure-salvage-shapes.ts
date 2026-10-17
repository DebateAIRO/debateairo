// tests/support/structure-salvage-shapes.ts — synthetic text only, shaped like the three real cases.
import { z } from "zod";
import { JUDGE_ARTIFACT_READING, PANEL_PROMPT_CONTRACT, classifyStructuredArtifact, judgeAssessmentSchema } from "@debateai/judgement";
import {
  buildFramedPrompt, buildFramedRepairPrompt, schemaFailureLocator,
  type ContentClassification, type ModelReplyFacts, type ProviderCallRequest
} from "@debateai/providers";

export const SM = "The strongest form says fares cover costs on the central lines";
export const CS = "A plausible counter is that riders on the outer lines pay for it";
export const NOTE = "A note the model added about its own reading";
export const LOOSE = "the statement cites no figures, so its evidence is moderate";
export const BASE = { steelman: { summary: SM, fidelity: 0.8 }, critic: { summary: CS, counterargumentStrength: 0.6, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.5, relevance: 0.7 }, context: { fit: 0.6, ambiguityFlags: ["free for whom is unclear", "central lines undefined"] },
  fallacy: { severity: 0.35, fatalFlags: [] as unknown[] } };
export const pretty = (value: unknown) => JSON.stringify(value, null, 2);
export const QUALITY = "\"quality\": 0.5,";
export const PANEL_KEY = "PANEL:JUDGE:cross-root:2->3:preview:fixture-a";
/** Shaped like try2 seq 217: an inner fallacy echoing the outer severity. */
export const ECHO = pretty({ ...BASE, fallacy: { ...BASE.fallacy, fallacy: { severity: 0.35 } } });
/** Shaped like today seq 344: a key written twice with one value, an inner echo with a notes text. */
export const ECHO_NOTES = pretty({ ...BASE, fallacy: { ...BASE.fallacy, fallacy: { severity: 0.35, fatalFlags: [], notes: NOTE } } })
  .replace(QUALITY, `${QUALITY}\n    ${QUALITY}`);
/** Shaped like try2 seq 475: a sentence with no key inside evidence, and fallacy.description. */
export const KEYLESS = pretty({ ...BASE, fallacy: { ...BASE.fallacy, description: NOTE } }).replace(QUALITY, `${QUALITY}\n    "${LOOSE}",`);
/**
 * A form-only fault A cannot finish (class STRUCTURE: a container holding the asked number at a place the form states as a
 * scalar). A keeps the wrapper exactly as written (pre-flight PF-S1), so the step's refusal names `evidence.quality` and B
 * asks for it. A reply MISSING a member would be class CONTENT and get today's PATCH, never this route.
 */
export const WRAPPED = { ...BASE, evidence: { quality: { value: 0.5 }, relevance: 0.7 } };
export const WRAPPED_QUALITY = pretty(WRAPPED);
/**
 * The same plus an echo A drops. Today's patch plan (on the decoded reply, echo kept) names `evidence.quality` and
 * `fallacy` and cannot finish it (the echo stays and the step refuses the merge); A's base can (pre-flight PF-S2).
 */
export const WRAPPED_ECHO = pretty({ ...WRAPPED, fallacy: { ...BASE.fallacy, fallacy: { severity: 0.35 } } });
/** B's short follow-up for `evidence.quality`, the original AI's own number. */
export const PATCH_REPLY = "{\"evidence.quality\": 0.5}";

/** The panel step, one copy for every later task (pre-flight PF-S21). */
export const panelFramed = buildFramedPrompt({ contract: PANEL_PROMPT_CONTRACT, material: [{ name: "statement", content: "The statement." }] });
export const classifyPanel = (content: string, reply?: ModelReplyFacts): ContentClassification =>
  classifyStructuredArtifact(content, judgeAssessmentSchema, reply, JUDGE_ARTIFACT_READING);
/** `base` made the panel's call: its key, frame, classifier and full re-ask packet. */
export const panelRequest = (base: ProviderCallRequest): ProviderCallRequest => ({ ...base, callSiteKey: PANEL_KEY,
  packet: panelFramed.packet, modelRole: "JUDGE", classifyContent: classifyPanel,
  buildRepairPacket: (rejected) => buildFramedRepairPrompt(panelFramed, schemaFailureLocator(rejected)) });

/** The one-sentence answer-and-score step (the bytes of tests/unit/lg-a-structure-repair.test.ts:14-31). */
export const SCORE_FORM = "Return only JSON {\"answer\": string, \"score\": number}.";
export const SCORE_SCHEMA = z.object({ answer: z.string().min(1), score: z.number() }).strict();
export const scoreFramed = buildFramedPrompt({ contract: { contractId: "test.lg-a.v1", instruction: "Answer the question in one sentence.",
  answerForm: SCORE_FORM }, material: [{ name: "question", content: "Is it so?" }] });
export function scoreRequest(extra: Partial<ProviderCallRequest> = {}): ProviderCallRequest {
  return { runId: "run:lg-a", subjectItemId: "node:lg-a", callSiteKey: "JUDGE", role: "JUDGE", lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 }, contractHash: "contract:lg-a", providerRef: "preview:fixture-a",
    packet: scoreFramed.packet, modelRole: "POSITION",
    classifyContent: (content, reply) => classifyStructuredArtifact(content, SCORE_SCHEMA, reply, { fixer: {} }),
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(scoreFramed, schemaFailureLocator(rejected)), ...extra };
}
/** A missing comma after a text: the Haiku path's own shape in the existing suites. */
export const SCORE_BROKEN = "{\"answer\": \"It is so, by the city's own figures\" \"score\": 0.5}";
export const SCORE_COPY = "{\"answer\": \"It is so, by the city's own figures\", \"score\": 0.5}";
