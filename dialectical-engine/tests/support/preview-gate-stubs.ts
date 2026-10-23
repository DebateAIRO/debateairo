// The two preview spending gates as test doubles over real unix sockets, speaking the gate's own local protocol
// (POST /complete answers {status, body} or a 409 {error: CODE}; POST /remaining answers the read-only "what is left
// today"). Factored out of tests/integration/preview-busy-model-run.test.ts so the busy-model run and the preview
// practice tool's integration test (tests/integration/preview-practice-run.test.ts) drive the SAME doubles.
// Every request that reaches a gate is recorded with how the gate answered it. A probe takes the next step of its
// model's script; with `debate` scripts a scripted model refuses every other request unbilled and the DeepInfra gate
// halts at its ceiling of unbilled releases (the run-resilience scenarios, spec
// docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md T1/T2); every other request is answered by its
// contract (a valid reply), a debate-shape map step (stubMapContent) and the fast language check
// (stubQuestionLanguageContent) included, unless the scenario's `override` answers it first. Gate v4 (2026-10-12,
// packages/providers/ops/preview_budget_authority.py): with `debate.coolOffAfter` a model cools off after that many
// unbilled refusals in a row (409 MODEL_COOLING with retry_after, never contacting the vendor), and with
// `debate.deepInfraHaltedAnswer: "AUTHORITY_HALTED"` the halted DeepInfra gate says so itself instead of STOPPED.
// The contract's valid reply is written in the language the request's directive names (stubReplyLanguage): since the
// reply-language check (2026-10-12) a reply in another language than the question's is refused and re-asked.
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { argumentLanguageDirective, detectArgumentLanguage, questionLanguageSentence } from "@debateai/kernel";
import { mapContractNameOf, mapEngineContractNameOf } from "@debateai/map";
import { COMPARING_JUDGE_CONTRACT_ID, POINT_INVESTIGATION_CONTRACT_ID } from "@debateai/judgement";
import { STORY_CHECKER_CONTRACT_ID, STORY_CHECKER_V4_CONTRACT_ID, STORYTELLER_CONTRACT_ID, STORYTELLER_V4_CONTRACT_ID } from "@debateai/story";
import { engineMapScriptedContent } from "./engine-map-script.js";
import { readFramedMaterial, wirePacket } from "./framed-packet.js";
import { reviewArtifact, withRequestDerivedBearings } from "./reviewBearings.js";
import { QUESTION_LANGUAGE_CHECK_CONTRACT_ID } from "../../apps/api/src/question-language/fast-check.js";
import { openingsDryContent } from "../../tools/preview-practice/practice-openings-dry.js";

export type GateProvider = "deepinfra" | "anthropic";
export type GateRequestKind = "PROBE" | "STORYTELLER" | "STORY_CHECKER" | "MAP" | "QUESTION_LANGUAGE" | "PANEL" | "REVIEW" | "JUDGE" | "EVALUATOR" | "COMPOSE"
  | "VERDICT_JUDGE" | "INVESTIGATE";
/** A /complete request as the gate saw it (what a scenario's `override` is handed). */
export type GateRequest = Readonly<{ provider: GateProvider; model: string; kind: GateRequestKind | "UNKNOWN"; body: Readonly<Record<string, unknown>> }>;
/**
 * How the gate answered a /complete request: by its contract or a scenario's content (OK), a gate-proven unbilled
 * vendor 429 (UNBILLED, 409 PROVIDER_REFUSED_UNBILLED), the gate's OWN unbilled refusal (GATE_REFUSED, 409
 * CONCURRENCY_LIMIT_REACHED or PROVIDER_NOT_REACHED: never one of its unbilled releases), a model the gate lets cool
 * off (COOLING, 409 MODEL_COOLING with retry_after: gate v4, nothing reserved, the vendor not contacted), a halted gate
 * (STOPPED, 409 PREVIEW_TEST_AUTHORITY_STOPPED; or HALTED, gate v4's 409 AUTHORITY_HALTED), a vendor error the gate
 * released unbilled and not as "busy" (ERROR_UNBILLED, 409 PROVIDER_ERROR_UNBILLED, review 2026-10-12), a
 * billed vendor error (BILLED_500 for a refused model; VENDOR_ERROR for a scenario's vendor status), a sent call whose
 * vendor connection then failed or timed out, which the gate booked at its whole reservation and stayed active
 * (BOOKED_MAX, 409 PROVIDER_CHARGE_BOOKED_MAX: slow answer, owner ruling 2026-10-12), or a request no contract answers
 * (UNEXPECTED, a billed vendor 500 too). Only OK, UNBILLED, ERROR_UNBILLED, BILLED_500, VENDOR_ERROR, BOOKED_MAX and
 * UNEXPECTED stand for a request that reached the vendor.
 */
export type GateAnswer = "OK" | "UNBILLED" | "ERROR_UNBILLED" | "GATE_REFUSED" | "COOLING" | "STOPPED" | "HALTED" | "BILLED_500" | "VENDOR_ERROR" | "BOOKED_MAX" | "UNEXPECTED";
/** The answers that stand for a request the vendor received (the rest were refused by the gate itself). */
export const GATE_ANSWERS_REACHING_VENDOR: ReadonlySet<GateAnswer> = new Set<GateAnswer>(["OK", "UNBILLED", "ERROR_UNBILLED", "BILLED_500", "VENDOR_ERROR", "BOOKED_MAX", "UNEXPECTED"]);
/** The retry_after a stand-in cool-off names: the real gate's first window (COOL_OFF_FIRST_SECONDS). */
export const STUB_COOL_OFF_RETRY_AFTER_SECONDS = 60;
/** A recorded /complete request: the request and how it was answered, in arrival order. */
export type GateRecord = GateRequest & Readonly<{ answer: GateAnswer }>;
/** One read of a gate's `POST /remaining` (contract A §5), with the state it was answered. */
export type GateRemainingRead = Readonly<{ provider: GateProvider; state: "active" | "halted" }>;
/**
 * The run-resilience scripts (spec 2026-10-12 "Tests", T1/T2 setup).
 *  - `unbilled`: models that passed their claim probe and then refuse every other request: a gate-proven unbilled
 *    vendor 429 (409 PROVIDER_REFUSED_UNBILLED), which the app maps to PreviewUnbilledRefusal
 *    (packages/providers/src/preview-test.ts previewAuthorityRefusal) and withPreviewProviderCallPolicy sends once more
 *    after its 60-second wait.
 *  - `deepInfraHaltAt`: the DeepInfra gate's day ceiling of unbilled releases (the live gate's
 *    `unbilled_release_ceiling`): once it has given this many PROVIDER_REFUSED_UNBILLED answers it HALTS, so every later
 *    DeepInfra /complete is refused 409 PREVIEW_TEST_AUTHORITY_STOPPED before anything is reserved, and its /remaining
 *    answers state "halted" (the window stays open). Absent, it never halts. The Anthropic gate never halts.
 *    (The live gate no longer halts on unbilled refusals since gate v4; this replays the 2026-10-11 incident.)
 *  - `deepInfraHaltedAnswer`: what the halted DeepInfra gate answers a /complete: "STOPPED" (the default, the older gate
 *    and the incident) or gate v4's "AUTHORITY_HALTED" (409 {"error": "AUTHORITY_HALTED"}).
 *  - `coolOffAfter`: gate v4's per-model cool-off. A model that has had this many PROVIDER_REFUSED_UNBILLED answers in
 *    a row (any request, probes included, with no OK of that model in between) cools off: every later request for it
 *    is refused 409 {"error": "MODEL_COOLING", "retry_after": 60} before the vendor is asked, which is never an
 *    unbilled release (it does not count toward `deepInfraHaltAt`). The stand-in has no clock, so a cooling model
 *    never gets the real gate's trial call. Absent, nothing cools off. The live gate's value is 2.
 */
export type GateDebateScripts = Readonly<{
  unbilled: readonly string[];
  deepInfraHaltAt?: number;
  deepInfraHaltedAnswer?: "STOPPED" | "AUTHORITY_HALTED";
  coolOffAfter?: number;
}>;
/**
 * The DeepInfra gate's halt: its count of unbilled releases, the index (in `requests`) of the request whose release
 * reached the ceiling, and the index of the first request it answered STOPPED (or AUTHORITY_HALTED).
 */
export type GateHalt = { unbilledReleases: number; haltedAt: number | null; firstStoppedAt: number | null };
/** What a scenario may answer instead of the contract's valid reply. */
export type GateOverride = Readonly<{ content: string }> | Readonly<{ unbilled: true }> | Readonly<{ vendorStatus: number }>
  /**
   * The gate's own unbilled refusal (review amendment R-d, 2026-10-12): its slots full, or the vendor not reached; or the
   * vendor's error that was not billed and is not "busy" (PROVIDER_ERROR_UNBILLED, review 2026-10-12: Anthropic's
   * 400/404/413/500, released at $0 and counted in the gate's streak).
   */
  | Readonly<{ gateRefuses: "CONCURRENCY_LIMIT_REACHED" | "PROVIDER_NOT_REACHED" | "PROVIDER_ERROR_UNBILLED" }>
  /** Gate v4's own refusals: this model cooling off (COOLING, with retry_after 60), or the gate halted (HALTED). */
  | Readonly<{ gateRefuses: "MODEL_COOLING" | "AUTHORITY_HALTED" }>
  /**
   * Side-by-side spec §9: refused before any reservation, this model (its row is gone from the GO) or this price (the
   * reservation does not match the GO's) is not served by this gate; the app reads either as the model sitting out.
   */
  | Readonly<{ gateRefuses: "MODEL_NOT_ALLOWED" | "RESERVATION_MISMATCH" }>
  /**
   * The gate's STOPPED refusal for this one call while the gate itself stays active (its /remaining says so): the runner
   * reads it as the run's money ceiling, a spend stop (parallel calls, Task 11 fix round 1).
   */
  | Readonly<{ gateRefuses: "PREVIEW_TEST_AUTHORITY_STOPPED" }>
  /**
   * Slow answer (owner ruling 2026-10-12): the call was sent, then its vendor connection failed or ran past the gate's
   * 1,200 s; the gate booked its whole reservation as its charge and stays active (409 PROVIDER_CHARGE_BOOKED_MAX).
   */
  | Readonly<{ gateRefuses: "PROVIDER_CHARGE_BOOKED_MAX" }>;

/* ------------------------------------------------------------------ the doubles' answers */

/**
 * The language of the contract's valid reply. Every step's instruction ends with the argument-language directive, and
 * since the reply-language check (2026-10-12, packages/kernel/src/reply-language.ts) a reply that is not in the
 * question's language is refused as TEXT_NOT_IN_QUESTION_LANGUAGE and re-asked, so the stand-in writes the language
 * the directive names, as a model that follows it: Romanian when told Romanian (the practice debate's default
 * question), else English (the practice's English question, and the busy-model run's label question, which is told
 * "the same language as the question").
 */
export type StubLanguage = "en" | "ro";
/**
 * Romanian, in both forms a request can name it: today's directive, and (question-language spec 2026-10-13, P2L Task 17,
 * pre-flight PF-L52) the locked sentence a shaped run's calls carry instead.
 */
const ROMANIAN_DIRECTIVES = Object.freeze([argumentLanguageDirective("Romanian"), questionLanguageSentence({ code: "ro", name: "Romanian" })]);
export function stubReplyLanguage(chat: string): StubLanguage {
  return wirePacket(chat).messages.some((message) => typeof message.content === "string"
    && ROMANIAN_DIRECTIVES.some((directive) => message.content.includes(directive)))
    ? "ro" : "en";
}

/** The stand-in's prose, the same sentences in each language it writes. */
const STUB_PROSE = Object.freeze({
  en: Object.freeze({
    point: (served: number) => `Practice debate point ${String(served)}.`,
    counter: "Plausible counter.",
    panelAssessment: "Panel member assessment.",
    panelCounter: "Panel member counter.",
    review: (served: number) => `Review ${String(served)} agrees.`,
    verdict: "Congestion pricing on central roads is worth trying.",
    research: "Check an independent source.",
    story: Object.freeze({
      headline: "The positions were argued, and they held up.",
      summary: "You asked a question; the answers were weighed against their strongest objections.",
      confidence: "Fairly sure, until a sourced objection turns up.",
      line: "This position held up.",
      change: "A stronger, sourced objection would change the answer.",
      reason: "The first position held up against its strongest objection.",
      sections: Object.freeze(["What you are deciding", "The verdict", "What would change it"]),
      paragraph: (title: string) => `${title}, in the debate's own terms.`
    })
  }),
  ro: Object.freeze({
    point: (served: number) => `Argumentul ${String(served)} din dezbaterea de exercițiu.`,
    counter: "Un contraargument plauzibil.",
    panelAssessment: "Evaluarea unui membru al juriului.",
    panelCounter: "Contraargumentul unui membru al juriului.",
    review: (served: number) => `Recenzia ${String(served)} este de acord.`,
    verdict: "Taxa de congestie pe drumurile centrale merită încercată.",
    research: "Verificați o sursă independentă.",
    story: Object.freeze({
      headline: "Pozițiile au fost argumentate și au rezistat.",
      summary: "Ați pus o întrebare, iar răspunsurile au fost cântărite față de cele mai puternice obiecții ale lor.",
      confidence: "Destul de sigur, până când apare o obiecție cu sursă.",
      line: "Această poziție a rezistat.",
      change: "O obiecție mai puternică și cu sursă ar schimba răspunsul.",
      reason: "Prima poziție a rezistat în fața celei mai puternice obiecții a sa.",
      sections: Object.freeze(["Ce decideți", "Verdictul", "Ce l-ar schimba"]),
      paragraph: (title: string) => `${title}, în termenii dezbaterii.`
    })
  })
});

export const stubJudgement = (statement: string, language: StubLanguage = "en"): string => JSON.stringify({
  statement, way_of_knowing: "REASONING", locator: null, restatement_text: statement, restatement_status: "PASS",
  value_laden: false, claim_type: "unknown",
  steelman: { summary: statement, fidelity: 0.72 },
  critic: { summary: STUB_PROSE[language].counter, counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.72, relevance: 0.72 }, context: { fit: 0.72, ambiguityFlags: [] },
  fallacy: { severity: 0.28, fatalFlags: [] }
});
/** A panel member's assessment at fidelity 0 (tau 0): it never displaces an author's voice (tests/integration/database.test.ts). */
export const stubPanelAssessment = (language: StubLanguage = "en"): string => JSON.stringify({
  steelman: { summary: STUB_PROSE[language].panelAssessment, fidelity: 0 },
  critic: { summary: STUB_PROSE[language].panelCounter, counterargumentStrength: 1, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0, relevance: 0 }, context: { fit: 0, ambiguityFlags: [] }, fallacy: { severity: 1, fatalFlags: [] }
});
export const STUB_PANEL_ASSESSMENT = stubPanelAssessment();
export const stubComposition = (language: StubLanguage = "en"): string => JSON.stringify({ segments: [
  { segment_id: "segment:verdict", text: STUB_PROSE[language].verdict, node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
  { segment_id: "segment:research", text: STUB_PROSE[language].research, node_refs: [], served_number_refs: [] }
] });
export const STUB_COMPOSITION = stubComposition();
export const STUB_EVALUATOR_SATISFIED = JSON.stringify({ satisfied: true, objection: null, criteria: {
  fairness_to_losers: true, statement_label_agreement: true, no_overstatement: true, restatement: true, citation_tracing: true
} });
export const STUB_STORY_CHECKER_SATISFIED = JSON.stringify({ satisfied: true, objection: null, criteria: {
  faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
  citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
} });
/** Story v4 (R1d): the v4 checker's form carries `misleading`; a satisfied verdict sets it false (Task 12's schema). */
export const STUB_STORY_CHECKER_V4_SATISFIED = JSON.stringify({ satisfied: true, misleading: false, objection: null, criteria: {
  faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
  citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
} });

/** The story checker's satisfied verdict in the form of the request's own contract: v4 with misleading, v3 as today. */
export function stubStoryCheckerFor(chat: string): string {
  return readFramedMaterial(wirePacket(chat)).contractId === STORY_CHECKER_V4_CONTRACT_ID
    ? STUB_STORY_CHECKER_V4_SATISFIED : STUB_STORY_CHECKER_SATISFIED;
}

/**
 * A story with one path per position the storyteller was handed (its `positions` material, refs P1..Pn), in the
 * language the request's directive names. Story v4 (R1d): a v4 request is answered as the v4 form asks, with no
 * shape_id (code sets it) and long last.
 */
export function stubStoryFor(chat: string, defaultShape: string): string {
  const frame = readFramedMaterial(wirePacket(chat));
  const positions = JSON.parse(frame.fields.find((field) => field.name === "positions")?.content ?? "[]") as { id: string }[];
  const refs = positions.length === 0 ? ["P1"] : positions.map((position) => position.id);
  const prose = STUB_PROSE[stubReplyLanguage(chat)].story;
  const paragraph = (text: string) => ({ text, node_refs: [refs[0]!] });
  const short = {
    headline: prose.headline,
    summary: prose.summary,
    confidence: prose.confidence,
    paths: refs.map((ref) => ({ position_ref: ref, fate: "HELD_UP", line: prose.line, node_refs: [ref] })),
    change: paragraph(prose.change)
  };
  const why = { reasons: [paragraph(prose.reason)] };
  const long = { sections: prose.sections.map((title) => ({
    title, paragraphs: [paragraph(prose.paragraph(title))]
  })) };
  if (frame.contractId === STORYTELLER_V4_CONTRACT_ID) return JSON.stringify({ short, why, reviewer_note: null, long });
  return JSON.stringify({ shape_id: defaultShape, short, why, long, reviewer_note: null });
}

/**
 * A valid map reply (debate shape, spec 2026-10-12 §1) for the step the request is: the openings dry script's own
 * answer (tools/preview-practice/practice-openings-dry.ts), in the question's language. The angle planner's reply
 * names the locked language first (`question_language`, P2L Task 15; P2L amendment P2b-5): the primary code of the
 * request's own `question_language` field, so a plain debate records no disagreement. The exception is choose: it names
 * TWO distinct answers, the first two merged answers. They get an OPPOSITE_CASE point against the first, a PRACTICAL
 * point for it, an ASKER_WORRY point for the second, and one more point against it (any point not yet used). So a clean
 * debate needs no answer filling, meets the OPPOSITE_CASE and ASKER_WORRY quotas, and leaves points also raised. The
 * third quota, SINGLE_AI (a point raised by exactly one AI), is met only when a chosen point has one maker; otherwise
 * the chooser fills it with a CHOOSE_QUOTA_FILLED map mark, which never changes the verdict (pre-flight PF-D15).
 */
export function stubMapContent(chat: string, serial: number): string {
  const frame = readFramedMaterial(wirePacket(chat));
  // Engine redesign R3: an engine-2 map contract (map.*.v2, map.check.v1) is answered by the engine script; engine 1's
  // ids (v1 and lengthed) read below exactly as before.
  const engineReply = engineMapScriptedContent(frame.contractId, frame.fields); if (engineReply !== null) return engineReply;
  if (mapContractNameOf(frame.contractId) === "angles") {
    const locked = frame.fields.find((entry) => entry.name === "question_language")?.content;
    const code = locked === undefined ? null : (JSON.parse(locked) as { code?: unknown }).code;
    // No lock in the request: the question's own language, as the kernel's guesser reads it (pre-flight PF-D15).
    const question = frame.fields.find((entry) => entry.name === "question_line")?.content ?? "";
    const planner = (typeof code === "string" ? code : detectArgumentLanguage(question).tag).split("-")[0]!.toLowerCase();
    const angles = JSON.parse(openingsDryContent({ contractId: frame.contractId, fields: frame.fields, serial, slip: false })) as object;
    return JSON.stringify({ question_language: planner, ...angles });
  }
  if (mapContractNameOf(frame.contractId) === "choose") {
    const field = (name: string): string => frame.fields.find((entry) => entry.name === name)?.content ?? "[]";
    const keyPoints = JSON.parse(field("key_points")) as { key_point_id: string; angle_kind: string | null }[];
    const merged = JSON.parse(field("answers")) as { answer_id: string; answer: string }[];
    if (merged.length >= 2 && keyPoints.length >= 4) {
      const used = new Set<string>();
      const take = (kind: string | null): string[] => {
        const found = keyPoints.find((point) => point.angle_kind === kind && !used.has(point.key_point_id))
          ?? keyPoints.find((point) => !used.has(point.key_point_id));
        if (found === undefined) return [];
        used.add(found.key_point_id);
        return [found.key_point_id];
      };
      const againstFirst = take("OPPOSITE_CASE");
      const forFirst = take("PRACTICAL");
      const forSecond = take("ASKER_WORRY");
      const againstSecond = take(null);
      return JSON.stringify({ answers: [
        { answer_id: "a-1", statement: merged[0]!.answer, for: forFirst, against: againstFirst, strongest_rival: "a-2" },
        { answer_id: "a-2", statement: merged[1]!.answer, for: forSecond, against: againstSecond, strongest_rival: "a-1" }
      ] });
    }
  }
  return openingsDryContent({ contractId: frame.contractId, fields: frame.fields, serial, slip: false });
}

/**
 * The fast language check's default answer (P2L Task 5 answer form): one language, no mix, and that language is the
 * question's own as the kernel's guesser reads it (never the site's: an ask without `site_language` checks against
 * English, and a Romanian practice question must still lock Romanian). A scenario that needs another reading answers
 * through its override.
 */
export function stubQuestionLanguageContent(chat: string): string {
  const question = readFramedMaterial(wirePacket(chat)).fields.find((entry) => entry.name === "question_line")?.content ?? "";
  const code = detectArgumentLanguage(question).tag.split("-")[0]!.toLowerCase();
  return JSON.stringify({ main_language: code, languages_seen: [code], is_real_mix: false, proposed_question: null });
}

/** Engine redesign R2 (B12): the answer letters a comparing judge was shown, in ITS rotated order (field `answers`). */
export function comparingJudgeLettersShown(chat: string): readonly string[] {
  const answers = readFramedMaterial(wirePacket(chat)).fields.find((entry) => entry.name === "answers")?.content ?? "[]";
  return (JSON.parse(answers) as { letter: string }[]).map((answer) => answer.letter);
}
/**
 * Engine redesign R2 (B12): the judge's and the investigator's prose, in each language the stand-in writes. Both
 * replies are language-checked (the judge's `reasons`, the investigator's `missing` / `found` / `reason`), so a
 * Romanian practice debate's judge answers in Romanian, as every other stand-in reply does (stubReplyLanguage).
 */
const ENGINE_STUB_PROSE = Object.freeze({
  en: Object.freeze({
    reasons: (best: string) => `Answer ${best} stands up best to the strongest objection raised against it, which its own supporting points answer.`,
    missing: "A reliable figure for the cost the point relies on.",
    found: "The figure is reported in public statistics.",
    deadEnd: "Nothing generally known settles that figure, so the point cannot be decided yet; a published cost study would decide it.",
    holds: "With that figure, the point holds as it is stated.",
    fails: "With that figure, the point does not hold as stated."
  }),
  ro: Object.freeze({
    reasons: (best: string) => `Răspunsul ${best} rezistă cel mai bine în fața celei mai puternice obiecții ridicate împotriva lui, la care răspund chiar argumentele care îl susțin.`,
    missing: "O cifră de încredere pentru costul pe care se sprijină argumentul.",
    found: "Cifra apare în statisticile publice.",
    deadEnd: "Nimic din ce se știe în general nu stabilește această cifră, așa că argumentul nu poate fi încă decis; un studiu publicat despre costuri l-ar decide.",
    holds: "Cu această cifră, argumentul rezistă așa cum este formulat.",
    fails: "Cu această cifră, argumentul nu rezistă așa cum este formulat."
  })
});
/** Engine redesign R2 (B12): a comparing judge's valid reply (INTERFACE §9.2's answer form), English unless told. */
export function stubComparingJudgeVote(best: string, options: Readonly<{
  conditional?: boolean; questionKind?: string; language?: StubLanguage;
}> = {}): string {
  return JSON.stringify({
    best, conditional: options.conditional ?? false, same_as: [],
    reasons: ENGINE_STUB_PROSE[options.language ?? "en"].reasons(best),
    question_kind: options.questionKind ?? "general"
  });
}
/** Engine redesign R2 (B12): a point investigation's valid reply (INTERFACE §8.3's answer form), English unless told. */
export function stubPointInvestigation(outcome: "holds" | "fails" | "dead_end", language: StubLanguage = "en"): string {
  const prose = ENGINE_STUB_PROSE[language];
  return JSON.stringify(outcome === "dead_end"
    ? { missing: prose.missing, found: "", basis: "none", outcome, reason: prose.deadEnd }
    : { missing: prose.missing, found: prose.found, basis: "established", outcome, reason: outcome === "holds" ? prose.holds : prose.fails });
}

/* ------------------------------------------------------------------ reading a request */

/**
 * The argument-language directive names the machine keys below, so it is removed before routing (as database.test.ts).
 * Both of its forms (#154): another language is named "<name>, the language of the question,", English only "English,
 * the language of the question," (an English question, and the fallback for a question the detector cannot name, as
 * these tests' labels are). With only the first form an English directive stayed in, its "fatalFlags" sent every review
 * and checker call to PANEL. Question language (spec 2026-10-13, P2L Task 17, pre-flight PF-L51): a shaped run's calls
 * carry the locked sentence instead, which names "fatalFlags[].type" too — the third alternative removes it WHOLE (both
 * of its sentences), built from the kernel's own sentence exactly as the first two are, never from a fragment.
 */
// The kernel frames only a lock it would accept (Task 13 review, Minor 2: never "\u0000" as a name), so the sentence is
// built with a plain placeholder name, then that one name is marked as the first two forms' is.
const LOCKED_NAME_PLACEHOLDER = "Placeholderish";
const LANGUAGE_DIRECTIVE = new RegExp([argumentLanguageDirective("\u0000"), argumentLanguageDirective(""),
  questionLanguageSentence({ code: "en", name: LOCKED_NAME_PLACEHOLDER }).replace(LOCKED_NAME_PLACEHOLDER, "\u0000")]
  .map((directive) => directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\u0000", "[^.]+?")).join("|"), "gu");
/** The one stripping `classifyGateRequest` applies, under a name a test can call (P2L Task 17, PF-L51). */
export function stripLanguageDirectiveForTest(text: string): string {
  return text.replace(LANGUAGE_DIRECTIVE, "");
}
const PROBE_QUESTION = "Reply exactly: OK";

/**
 * The OpenAI-shaped body the frame reader reads: an Anthropic Messages body carries the system text beside its
 * turns, so it is put back in front of them (the adapter only lifted it out). Prompt caching (2026-10-12): a system
 * sent as the two cache blocks is their texts joined, which is the system text byte for byte. Length guidance L30
 * (LG-B): a first user turn sent as marked text blocks is their texts joined, the turn byte for byte.
 */
export function stubChatBody(provider: GateProvider, body: Readonly<Record<string, unknown>>): string {
  if (provider === "deepinfra") return JSON.stringify(body);
  const joined = (blocks: readonly { text?: unknown }[]): string => blocks.map((block) => typeof block?.text === "string" ? block.text : "").join("");
  // LG-B (L30): a turn sent as text blocks (the marked material) is its blocks' texts joined: today's turn byte for byte.
  const turns = (Array.isArray(body.messages) ? body.messages : []).map((turn: { role?: unknown; content?: unknown }) =>
    Array.isArray(turn?.content) ? { role: turn.role, content: joined(turn.content as { text?: unknown }[]) } : turn);
  const system = typeof body.system === "string" ? body.system
    : Array.isArray(body.system) ? joined(body.system as { text?: unknown }[])
      : undefined;
  return JSON.stringify({ messages: system !== undefined ? [{ role: "system", content: system }, ...turns] : turns });
}

/** Which contract a request is for: the probe by its question, the story by its contract id, the debate by structural keys. */
export function classifyGateRequest(chat: string): GateRequestKind | "UNKNOWN" {
  const messages = wirePacket(chat).messages;
  if (messages.length === 1 && messages[0]!.role === "user" && messages[0]!.content.includes(PROBE_QUESTION)) return "PROBE";
  const contractId = readFramedMaterial(wirePacket(chat)).contractId;
  // Story v4 (R1d, absorbing LG-D): an engine-2 debate asks with story contracts v4.
  if (contractId === STORYTELLER_CONTRACT_ID || contractId === STORYTELLER_V4_CONTRACT_ID) return "STORYTELLER";
  if (contractId === STORY_CHECKER_CONTRACT_ID || contractId === STORY_CHECKER_V4_CONTRACT_ID) return "STORY_CHECKER";
  // Debate shape (plan Task 15): the map's six contracts, by their ids. The new judge contracts stay "JUDGE" below.
  if (mapContractNameOf(contractId) !== null) return "MAP";
  // Engine redesign R3 (controller ruling R3-T14.2): engine 2's map contracts (map.*.v2, map.check.v1) are map requests too;
  // unclassified, each was answered as an unexpected request (a vendor 500), so the map was unavailable.
  if (mapEngineContractNameOf(contractId) !== null) return "MAP";
  if (contractId === QUESTION_LANGUAGE_CHECK_CONTRACT_ID) return "QUESTION_LANGUAGE";
  // Engine redesign R2 (plan Task B12): the comparing judge and the point investigation, by their contract ids, before
  // any instruction sniffing (their instructions name none of the keys below).
  if (contractId === COMPARING_JUDGE_CONTRACT_ID) return "VERDICT_JUDGE";
  if (contractId === POINT_INVESTIGATION_CONTRACT_ID) return "INVESTIGATE";
  const instruction = stripLanguageDirectiveForTest(messages[0]?.content ?? "");
  // The panel's assessment is the judge's schema WITHOUT restatement_text (tests/unit/t03-judge-panel.test.ts).
  if (instruction.includes("fatalFlags") && !instruction.includes("restatement_text")) return "PANEL";
  if (instruction.includes("edge_bearings")) return "REVIEW";
  if (instruction.includes("restatement_text")) return "JUDGE";
  if (instruction.includes("fairness_to_losers")) return "EVALUATOR";
  if (instruction.includes("served_number_refs")) return "COMPOSE";
  return "UNKNOWN";
}

/** The tokens a reply reports by default (100 in, 50 out); a scenario may report others (`startPreviewGateStubs` `usage`). */
export type StubUsage = Readonly<{ input: number; output: number }>;
const STUB_DEFAULT_USAGE: StubUsage = Object.freeze({ input: 100, output: 50 });
/** The vendor's own reply shape: an OpenAI chat completion (DeepInfra) or a Messages reply (Anthropic), with usage. */
export function stubVendorReply(provider: GateProvider, model: string, content: string, id: string, usage: StubUsage = STUB_DEFAULT_USAGE): string {
  return provider === "anthropic"
    ? JSON.stringify({ id: `msg_${id}`, type: "message", role: "assistant", model, content: [{ type: "text", text: content }],
      stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: usage.input, output_tokens: usage.output } })
    : JSON.stringify({ id, model, choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: usage.input, completion_tokens: usage.output } });
}

/* ------------------------------------------------------------------ the gates */

/**
 * When a /complete request reached its gate and when the gate answered it (performance.now() milliseconds), in arrival
 * order: the parallel-calls proof that calls overlap (docs/superpowers/specs/2026-10-12-parallel-calls-design.md §2.1).
 */
export type GateArrival = Readonly<{ provider: GateProvider; model: string; kind: GateRequestKind | "UNKNOWN"; at: number }>
  & { answeredAt: number | null };

/** How many /complete requests the doubles held at once: now, the most ever, and the most per gate and per model. */
export type GateConcurrency = {
  now: number;
  most: number;
  mostByProvider: Record<GateProvider, number>;
  mostByModel: Record<string, number>;
};

export type PreviewGateStubs = Readonly<{
  /** The /complete requests in flight at once (they overlap only when `delayMs` holds them). */
  concurrency: Readonly<GateConcurrency>;
  /** Every /complete request, in the order it was ANSWERED, with how it was answered. */
  requests: GateRecord[];
  /** Every /complete request, in the order it ARRIVED, with when it arrived and when it was answered. */
  arrivals: readonly GateArrival[];
  /** Every /remaining read, in arrival order. */
  remainingReads: GateRemainingRead[];
  /** The DeepInfra gate's halt (only ever moves with `debate.deepInfraHaltAt`). */
  halt: Readonly<GateHalt>;
  /** The models cooling off (only ever filled with `debate.coolOffAfter`), each with its run of unbilled refusals. */
  cooling: ReadonlyMap<string, number>;
  sockets: Readonly<Record<GateProvider, string>>;
  close(): Promise<void>;
}>;

/**
 * Both preview gates over real unix sockets, routed by URL as the gate routes them: `POST /complete` (one model call)
 * and `POST /remaining` (the read-only day figures, contract A §5, read on the same socket as on the preview:
 * createPreviewRemainingRpcPort). Any other path is a 404.
 *  - `probeScripts`: a probe takes the next step of its model's script (OK once spent).
 *  - `refuseModels`: any request for these models is a billed vendor 500 (a test that must never call them fails by
 *    the record).
 *  - `debate`: the run-resilience scripts (GateDebateScripts): scripted models refuse every non-probe request unbilled;
 *    the DeepInfra gate halts at its ceiling.
 *  - `override`: a scenario's own answer for a request, before the contract's valid reply.
 *  - `enabledModels`: what /remaining says each gate serves (default: the five reviewed models by their gate).
 *  - `remainingState`: what /remaining says while the gate has not halted (default "active"); a halted DeepInfra gate
 *    always answers "halted".
 *  - `usage`: the tokens an answered request's reply reports (default 100 in, 50 out).
 * The order of answers: a halted DeepInfra gate (STOPPED or HALTED), a model cooling off (COOLING), a refused model
 * (BILLED_500), an unbilled step (the probe's script, or `debate.unbilled` for any other request), the override, the
 * contract.
 */
export async function startPreviewGateStubs(input: Readonly<{
  storyDefaultShape: string;
  probeScripts?: Readonly<Record<string, readonly ("OK" | "UNBILLED")[]>>;
  refuseModels?: readonly string[];
  debate?: GateDebateScripts;
  override?: (request: GateRequest, chat: string) => GateOverride | null;
  enabledModels?: Readonly<Record<GateProvider, readonly string[]>>;
  remainingState?: "active" | "halted";
  /** Holds each /complete request this long before answering it (a slow vendor), so calls can overlap. */
  delayMs?: (request: GateRequest) => number;
  /**
   * Side-by-side spec §13 (Task S19): the tokens an answered (OK) request's reply reports, so a scenario can make its
   * debates spend; null or absent: the default 100 in, 50 out.
   */
  usage?: (request: GateRequest, chat: string) => StubUsage | null;
}>): Promise<PreviewGateStubs> {
  const concurrency: GateConcurrency = { now: 0, most: 0, mostByProvider: { deepinfra: 0, anthropic: 0 }, mostByModel: {} };
  const holding = { deepinfra: 0, anthropic: 0 } as Record<GateProvider, number>;
  const holdingByModel = new Map<string, number>();
  const requests: GateRecord[] = [];
  const arrivals: GateArrival[] = [];
  const remainingReads: GateRemainingRead[] = [];
  const queues = new Map<string, ("OK" | "UNBILLED")[]>(Object.entries(input.probeScripts ?? {}).map(([model, steps]) => [model, [...steps]]));
  const halt: GateHalt = { unbilledReleases: 0, haltedAt: null, firstStoppedAt: null };
  // Gate v4's cool-off: each model's run of unbilled refusals with no OK in between, and the models cooling off.
  const unbilledRun = new Map<string, number>();
  const cooling = new Map<string, number>();
  const servers: Server[] = [];
  const directories: string[] = [];
  let served = 0;
  const enabled = input.enabledModels ?? {
    deepinfra: ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash"],
    anthropic: ["claude-haiku-5-5"]
  };
  const answerFor = (kind: GateRequestKind | "UNKNOWN", chat: string): string | null => {
    served += 1;
    const language = kind === "UNKNOWN" || kind === "PROBE" ? "en" : stubReplyLanguage(chat);
    switch (kind) {
      case "PROBE": return "OK";
      case "STORYTELLER": return stubStoryFor(chat, input.storyDefaultShape);
      case "STORY_CHECKER": return stubStoryCheckerFor(chat);
      case "PANEL": return stubPanelAssessment(language);
      case "REVIEW": return withRequestDerivedBearings(reviewArtifact("agree", [STUB_PROSE[language].review(served)]), chat);
      case "JUDGE": return stubJudgement(STUB_PROSE[language].point(served), language);
      case "EVALUATOR": return STUB_EVALUATOR_SATISFIED;
      case "COMPOSE": return stubComposition(language);
      case "MAP": return stubMapContent(chat, served);
      case "QUESTION_LANGUAGE": return stubQuestionLanguageContent(chat);
      case "VERDICT_JUDGE": return stubComparingJudgeVote("A", { language });
      case "INVESTIGATE": return stubPointInvestigation("dead_end", language);
      default: return null;
    }
  };
  const socketFor = async (provider: GateProvider): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "pgs-"));
    directories.push(directory);
    const socket = join(directory, "gate.sock");
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const json = (status: number, payload: string) => response.writeHead(status, { "content-type": "application/json" }).end(payload);
        if (request.url === "/remaining") {
          const state = provider === "deepinfra" && halt.haltedAt !== null ? "halted" : input.remainingState ?? "active";
          remainingReads.push(Object.freeze({ provider, state }));
          json(200, JSON.stringify({
            state, window_open: true, remaining_usd: "9.500000000", remaining_calls: 1900,
            max_concurrent_calls: provider === "anthropic" ? 2 : 10, largest_reservation_usd: "0.214016000",
            enabled_models: enabled[provider]
          }));
          return;
        }
        if (request.url !== "/complete") { json(404, JSON.stringify({ error: "NOT_FOUND" })); return; }
        const execution = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { requestBody: string };
        const body = JSON.parse(execution.requestBody) as Record<string, unknown>;
        const model = String(body.model);
        const chat = stubChatBody(provider, body);
        let kind: GateRequestKind | "UNKNOWN";
        try { kind = classifyGateRequest(chat); } catch { kind = "UNKNOWN"; }
        const seen: GateRequest = Object.freeze({ provider, model, kind, body });
        const arrival: GateArrival = { provider, model, kind, at: performance.now(), answeredAt: null };
        arrivals.push(arrival);
        const delay = input.delayMs?.(seen) ?? 0;
        if (delay <= 0) { answer(seen, chat, arrival); return; }
        concurrency.now += 1;
        holding[provider] += 1;
        holdingByModel.set(model, (holdingByModel.get(model) ?? 0) + 1);
        concurrency.most = Math.max(concurrency.most, concurrency.now);
        concurrency.mostByProvider[provider] = Math.max(concurrency.mostByProvider[provider], holding[provider]);
        concurrency.mostByModel[model] = Math.max(concurrency.mostByModel[model] ?? 0, holdingByModel.get(model)!);
        setTimeout(() => {
          concurrency.now -= 1;
          holding[provider] -= 1;
          holdingByModel.set(model, holdingByModel.get(model)! - 1);
          answer(seen, chat, arrival);
        }, delay);
      });
      const answer = (seen: GateRequest, chat: string, arrival: GateArrival): void => {
        // Answered now (at once, or after the scenario's delay); `provider` is this socket's.
        arrival.answeredAt = performance.now();
        const { model, kind } = seen;
        const json = (status: number, payload: string) => response.writeHead(status, { "content-type": "application/json" }).end(payload);
        const record = (answer: GateAnswer): number => {
          // A settled reply of a model ends its run of unbilled refusals (the real gate's clear_cooling).
          if (answer === "OK") unbilledRun.delete(model);
          return requests.push(Object.freeze({ ...seen, answer })) - 1;
        };
        const reply = (status: number, vendorBody: string) => json(200, JSON.stringify({ status, body: vendorBody }));
        const refuse = (code: string) => json(409, JSON.stringify({ error: code }));
        const unbilled = () => {
          const at = record("UNBILLED");
          if (provider === "deepinfra") {
            halt.unbilledReleases += 1;
            const ceiling = input.debate?.deepInfraHaltAt;
            if (ceiling !== undefined && halt.unbilledReleases >= ceiling) halt.haltedAt ??= at;
          }
          const run = (unbilledRun.get(model) ?? 0) + 1;
          unbilledRun.set(model, run);
          const coolOffAfter = input.debate?.coolOffAfter;
          if (coolOffAfter !== undefined && run >= coolOffAfter) cooling.set(model, run);
          refuse("PROVIDER_REFUSED_UNBILLED");
        };
        const coolingRefusal = () => {
          record("COOLING");
          json(409, JSON.stringify({ error: "MODEL_COOLING", retry_after: STUB_COOL_OFF_RETRY_AFTER_SECONDS }));
        };
        if (provider === "deepinfra" && halt.haltedAt !== null) {
          const authorityHalted = input.debate?.deepInfraHaltedAnswer === "AUTHORITY_HALTED";
          const at = record(authorityHalted ? "HALTED" : "STOPPED");
          halt.firstStoppedAt ??= at;
          refuse(authorityHalted ? "AUTHORITY_HALTED" : "PREVIEW_TEST_AUTHORITY_STOPPED");
          return;
        }
        if (cooling.has(model)) { coolingRefusal(); return; }
        if (input.refuseModels?.includes(model) === true) {
          record("BILLED_500");
          reply(500, JSON.stringify({ error: { message: "this model must never be called in this test" } }));
          return;
        }
        const scriptedUnbilled = kind === "PROBE"
          ? queues.get(model)?.shift() === "UNBILLED"
          : input.debate?.unbilled.includes(model) === true;
        if (scriptedUnbilled) { unbilled(); return; }
        const override = input.override?.(seen, chat) ?? null;
        if (override !== null) {
          if ("unbilled" in override) { unbilled(); return; }
          if ("gateRefuses" in override) {
            if (override.gateRefuses === "MODEL_COOLING") { coolingRefusal(); return; }
            if (override.gateRefuses === "AUTHORITY_HALTED") { record("HALTED"); refuse("AUTHORITY_HALTED"); return; }
            if (override.gateRefuses === "PROVIDER_ERROR_UNBILLED") { record("ERROR_UNBILLED"); refuse("PROVIDER_ERROR_UNBILLED"); return; }
            if (override.gateRefuses === "PREVIEW_TEST_AUTHORITY_STOPPED") { record("STOPPED"); refuse("PREVIEW_TEST_AUTHORITY_STOPPED"); return; }
            if (override.gateRefuses === "PROVIDER_CHARGE_BOOKED_MAX") { record("BOOKED_MAX"); refuse("PROVIDER_CHARGE_BOOKED_MAX"); return; }
            record("GATE_REFUSED"); refuse(override.gateRefuses); return;
          }
          if ("vendorStatus" in override) {
            record("VENDOR_ERROR");
            reply(override.vendorStatus, JSON.stringify({ error: { message: "scripted vendor error" } }));
            return;
          }
          served += 1;
          record("OK");
          reply(200, stubVendorReply(provider, model, override.content, `practice-stub-${String(served)}`, input.usage?.(seen, chat) ?? undefined));
          return;
        }
        const content = answerFor(kind, chat);
        if (content === null) { record("UNEXPECTED"); reply(500, JSON.stringify({ error: { message: "unexpected test request" } })); return; }
        record("OK");
        reply(200, stubVendorReply(provider, model, content, `practice-stub-${String(served)}`, input.usage?.(seen, chat) ?? undefined));
      };
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(socket, done));
    return socket;
  };
  const sockets = Object.freeze({ deepinfra: await socketFor("deepinfra"), anthropic: await socketFor("anthropic") });
  return Object.freeze({
    requests,
    arrivals,
    remainingReads,
    halt,
    cooling,
    concurrency,
    sockets,
    async close() {
      await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
      await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
    }
  });
}
