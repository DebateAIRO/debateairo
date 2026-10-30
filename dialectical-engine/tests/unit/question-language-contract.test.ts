import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AskRequestSchema, QUESTION_LANGUAGE_CHOICE_NEEDED, QuestionLanguageChoiceNeededSchema, SITE_LANGUAGE_CODES, contractInventory,
  createContractClient
} from "@debateai/contract";

const SITE_LOCALES = readdirSync(new URL("../../apps/ui/messages/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const ASK = { question_line: "q", risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:test",
  composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "s", as_of: "2026-10-13T00:00:00.000Z",
  steering_presets: [], plan_tier: "free", steering_annotations: [] };
const OFFER = { check_ref: "a.b", main_language: { code: "ro", name: "Romanian" },
  languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed_question: "Q în română?" };
const needed = (offer: unknown) => ({ error: QUESTION_LANGUAGE_CHOICE_NEEDED, message: QUESTION_LANGUAGE_CHOICE_NEEDED, offer });

describe("the ask's question-language fields (question-language spec 2026-10-13)", () => {
  it("the site language is one of the 35 site locales", () => {
    expect([...SITE_LANGUAGE_CODES].sort()).toEqual(SITE_LOCALES);
    expect(AskRequestSchema.safeParse({ ...ASK, site_language: "ro" }).success).toBe(true);
    expect(AskRequestSchema.safeParse({ ...ASK, site_language: "en-US" }).success).toBe(false);
    expect(AskRequestSchema.safeParse(ASK).success).toBe(true);
  });

  it("with both fields absent the ask is today's ask: the same keys in, the same object out, only two optional keys added", () => {
    const parsed = AskRequestSchema.parse(ASK);
    expect(parsed).toEqual(ASK);
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(ASK).sort());
    expect(Object.keys(AskRequestSchema.shape)).toEqual([
      "question_line", "risk_tier", "tier_source", "tier_provenance_ref", "composition_budget_tier", "depth_params",
      "decision_scope", "as_of", "steering_presets", "plan_tier", "model_strength", "steering_annotations",
      "site_language", "question_language_choice",
      // Side-by-side spec §13 (Task S12): the room read's settings version, a later optional key of its own.
      "settings_version",
      // Plan 2026-10-30 W1-6: a dig's parent, a later optional key of its own.
      "parent"
    ]);
    expect(AskRequestSchema.shape.site_language.safeParse(undefined).success).toBe(true);
    expect(AskRequestSchema.shape.question_language_choice.safeParse(undefined).success).toBe(true);
    expect(AskRequestSchema.shape.settings_version.safeParse(undefined).success).toBe(true);
    expect(AskRequestSchema.shape.parent.safeParse(undefined).success).toBe(true);
    // Still strict: an unknown key is refused exactly as before.
    expect(AskRequestSchema.safeParse({ ...ASK, question_language: "ro" }).success).toBe(false);
  });

  it("the choice names a reference and a choice, never a language or a rewrite of its own", () => {
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "a.b", choice: "KEEP_MINE" } }).success).toBe(true);
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "a.b", choice: "USE_REWRITE", original_question_line: "o" } }).success).toBe(true);
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "a.b", choice: "KEEP_MINE", language: "en" } }).success).toBe(false);
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "a.b", choice: "KEEP_MINE", proposed_question: "x" } }).success).toBe(false);
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "a.b", choice: "EDIT" } }).success).toBe(false);
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "", choice: "KEEP_MINE" } }).success).toBe(false);
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "no-dot", choice: "KEEP_MINE" } }).success).toBe(false);
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "a.b", choice: "USE_REWRITE", original_question_line: "  " } }).success).toBe(false);
  });

  it("the 409 offer body is strict", () => {
    expect(QuestionLanguageChoiceNeededSchema.parse(needed(OFFER)).offer).toEqual(OFFER);
    expect(QuestionLanguageChoiceNeededSchema.safeParse(needed({ ...OFFER, languages_seen: [OFFER.main_language] })).success).toBe(false);
    expect(QuestionLanguageChoiceNeededSchema.safeParse({ ...needed(OFFER), extra: 1 }).success).toBe(false);
    expect(QuestionLanguageChoiceNeededSchema.safeParse(needed({ ...OFFER, extra: 1 })).success).toBe(false);
    expect(QuestionLanguageChoiceNeededSchema.safeParse(needed({ ...OFFER, proposed_question: "" })).success).toBe(false);
  });

  it("the offer body is inventoried beside the ask, as the 422 ASK_ALREADY_WAITING body is (P2L Task 18)", () => {
    const resources = contractInventory.resources as unknown as Record<string, unknown>;
    expect(resources.AskAlreadyWaitingSchema).toBeDefined();
    expect(resources.QuestionLanguageChoiceNeededSchema).toBe(QuestionLanguageChoiceNeededSchema);
  });

  it("PF-L19 / L-B64: at most six languages, each once, each name at most 64 bytes", () => {
    const six = ["ro", "en", "fr", "de", "it", "es"].map((code) => ({ code, name: code.toUpperCase() }));
    expect(QuestionLanguageChoiceNeededSchema.safeParse(needed({ ...OFFER, languages_seen: six })).success).toBe(true);
    expect(QuestionLanguageChoiceNeededSchema.safeParse(needed({ ...OFFER, languages_seen: [...six, { code: "pt", name: "PT" }] })).success).toBe(false);
    // The same language twice (the decider keeps each primary code once) is refused, script subtags included.
    expect(QuestionLanguageChoiceNeededSchema.safeParse(needed({ ...OFFER,
      languages_seen: [OFFER.main_language, { code: "ro", name: "Romanian" }] })).success).toBe(false);
    expect(QuestionLanguageChoiceNeededSchema.safeParse(needed({ ...OFFER,
      languages_seen: [{ code: "sr-Latn", name: "Serbian" }, { code: "sr-Cyrl", name: "Serbian" }] })).success).toBe(false);
    // Bytes, not characters: 32 two-byte letters fit, 33 do not, though both are under 64 characters.
    const named = (name: string) => needed({ ...OFFER, languages_seen: [OFFER.main_language, { code: "en", name }] });
    expect(QuestionLanguageChoiceNeededSchema.safeParse(named("ä".repeat(32))).success).toBe(true);
    expect(QuestionLanguageChoiceNeededSchema.safeParse(named("ä".repeat(33))).success).toBe(false);
    expect(QuestionLanguageChoiceNeededSchema.safeParse(named("a".repeat(64))).success).toBe(true);
    expect(QuestionLanguageChoiceNeededSchema.safeParse(named("a".repeat(65))).success).toBe(false);
    expect(QuestionLanguageChoiceNeededSchema.safeParse(needed({ ...OFFER,
      main_language: { code: "ro", name: "ä".repeat(33) } })).success).toBe(false);
    expect(QuestionLanguageChoiceNeededSchema.safeParse(needed({ ...OFFER,
      main_language: { code: "RO", name: "Romanian" } })).success).toBe(false);
  });

  it("the client returns the offer as data on 409, and the accepted ask otherwise", async () => {
    // The real signature (pre-flight PF-L24): createContractClient(baseUrl, fetchImplementation = fetch, auth = { mode: "cookie" }).
    const answering = (status: number, body: unknown) => createContractClient("https://api.test",
      (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch);
    expect(await answering(409, needed(OFFER)).submitAskOrLanguageChoice(ASK as never))
      .toEqual({ kind: "LANGUAGE_CHOICE_NEEDED", offer: OFFER });
    expect(await answering(202, { run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" }).submitAskOrLanguageChoice(ASK as never))
      .toMatchObject({ kind: "ACCEPTED", accepted: { status: "QUEUED" } });
    await expect(answering(409, { error: "QUESTION_LANGUAGE_CHECK_EXPIRED", message: "QUESTION_LANGUAGE_CHECK_EXPIRED" })
      .submitAskOrLanguageChoice(ASK as never)).rejects.toMatchObject({ status: 409, code: "SERVER_FAILURE", serverCode: "QUESTION_LANGUAGE_CHECK_EXPIRED" });
    // An offer the contract refuses is an error the page can read, never a half-read offer.
    await expect(answering(409, needed({ ...OFFER, languages_seen: [OFFER.main_language] }))
      .submitAskOrLanguageChoice(ASK as never)).rejects.toMatchObject({ status: 409, serverCode: QUESTION_LANGUAGE_CHOICE_NEEDED });
    // Any other refusal keeps today's error.
    await expect(answering(422, { error: "ASK_INVALID", message: "ASK_INVALID" })
      .submitAskOrLanguageChoice(ASK as never)).rejects.toMatchObject({ status: 422, code: "UNPROCESSABLE", serverCode: "ASK_INVALID" });
  });
});
