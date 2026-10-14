// @vitest-environment jsdom
/**
 * The phone-completion draft across the /new page's changes:
 * - Parallel calls (owner ruling 2026-10-12) removed Concurrency and Branching width.
 * - Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8) replaced Max tokens with Answer length
 *   and kept two of Depth mode's four values.
 * A draft saved in either older shape keeps parsing in today's shape: the retired values are
 * dropped, Answer length reads as Standard, and a retired depth mode reads as Adaptive. It is
 * never written again in an old shape.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PHONE_COMPLETION_DRAFT_KEY,
  PHONE_COMPLETION_DRAFT_MS,
  acknowledgePhoneDraftUpdate,
  clearPhoneCompletionDraft,
  phoneCompletionDraftForOwner,
  savePhoneCompletionDraft,
  type PhoneDraftForm,
  type SubmittedPhoneDraft
} from "../../apps/ui/lib/phoneCompletionDraft.js";

const OWNER = "asker:draft-owner";
const client = { readSession: async () => ({ asker_id: OWNER }) } as never;

const form: PhoneDraftForm = {
  topic: "Should cities replace private cars with shared transit?",
  planTier: "premium",
  optionsOpen: true,
  depthMode: "fixed",
  scrutiny: "deep",
  depth: 2,
  answerLength: "detailed",
  riskTier: "standard",
  riskTierWasEdited: false,
  budgetTier: "low",
  decisionScope: "City transport policy",
  asOf: "2026-10-12T09:30:00.000Z"
};

/** The form as Project 1 (parallel calls) saved it: Max tokens, no Answer length. */
const { answerLength: _dropped, ...withoutAnswerLength } = form;
const parallelCallsForm = { ...withoutAnswerLength, maxTokens: 800 };
/** ... and as the page saved it before parallel calls: Branching width and Concurrency too. */
const oldestForm = { ...parallelCallsForm, branching: 2, concurrency: 3 };

const legacyConfig = {
  plan_tier: "premium",
  risk_tier: "standard",
  tier_source: "MACHINE_DEFAULT",
  tier_provenance_ref: "machine:plan-tier-free",
  composition_budget_tier: "low",
  depth: 2,
  decision_scope: "City transport policy",
  as_of: "2026-10-12T09:30:00.000Z",
  steering_presets: [],
  steering_annotations: []
};

const choices = { depth_mode: "fixed", scrutiny: "deep", answer_length: "detailed" } as const;
/** The room query as the page sent it before debate shape P2c (and still sends it with no shape row in force). */
const legacyQuery = { plan_tier: "premium", composition_budget_tier: "low", depth: 2 } as const;

const submitted: SubmittedPhoneDraft = {
  topic: form.topic,
  config: { ...legacyConfig, ...choices },
  query: { ...legacyQuery, ...choices }
};

function storeRecord(recordForm: Record<string, unknown>, recordSubmitted: SubmittedPhoneDraft = submitted): string {
  const now = Date.now();
  const id = "0b7a6c1e-2f3d-4a5b-8c9d-0e1f2a3b4c5d";
  window.sessionStorage.setItem(PHONE_COMPLETION_DRAFT_KEY, JSON.stringify({
    version: 1, id, owner: OWNER, created_at: now, expires_at: now + PHONE_COMPLETION_DRAFT_MS,
    phase: "phone-required", form: recordForm, submitted: recordSubmitted
  }));
  return id;
}

function storedForm(): Record<string, unknown> {
  const text = window.sessionStorage.getItem(PHONE_COMPLETION_DRAFT_KEY);
  expect(text, "no draft was stored").not.toBeNull();
  return (JSON.parse(text!) as { form: Record<string, unknown> }).form;
}

describe("phone-completion draft with Answer length and the two depth modes", () => {
  beforeEach(() => clearPhoneCompletionDraft());
  afterEach(() => clearPhoneCompletionDraft());

  it("parses a draft in today's shape", () => {
    const id = storeRecord({ ...form });
    expect(phoneCompletionDraftForOwner(OWNER)?.id).toBe(id);
    expect(phoneCompletionDraftForOwner(OWNER)?.form).toEqual(form);
  });

  it("reads Project 1's shape: Max tokens dropped, Answer length Standard", () => {
    storeRecord(parallelCallsForm);
    expect(phoneCompletionDraftForOwner(OWNER)?.form).toEqual({ ...form, answerLength: "standard" });
  });

  it("reads the oldest shape, and a retired depth mode as Adaptive", () => {
    storeRecord({ ...oldestForm, depthMode: "recommended" });
    const draft = phoneCompletionDraftForOwner(OWNER);
    expect(draft?.form).toEqual({ ...form, depthMode: "adaptive", answerLength: "standard" });
    for (const retired of ["maxTokens", "branching", "concurrency"]) expect(draft?.form).not.toHaveProperty(retired);
  });

  it("rewrites an old draft in today's shape when it moves on", () => {
    const id = storeRecord({ ...oldestForm, depthMode: "manual" });
    expect(acknowledgePhoneDraftUpdate(id, OWNER)).toBe(true);
    expect(storedForm()).toEqual({ ...form, depthMode: "adaptive", answerLength: "standard" });
  });

  it("still refuses a shape that is none of the three", () => {
    storeRecord({ ...parallelCallsForm, branching: 2 });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
    storeRecord({ ...form, depthMode: "manual" });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
    storeRecord({ ...form, answerLength: "epic" });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
  });

  it("accepts a submitted ask with or without the three choices, and refuses an unknown one", () => {
    storeRecord({ ...form }, { ...submitted, config: legacyConfig, query: legacyQuery });
    expect(phoneCompletionDraftForOwner(OWNER)).not.toBeNull();
    // Review M-4: the unknown value sits in BOTH the ask and the room query, so the two still agree and only the
    // schemas can refuse it — never the config-versus-query comparison.
    for (const unknown of [{ scrutiny: "infinite" }, { depth_mode: "manual" }, { answer_length: "epic" }]) {
      const config = { ...submitted.config, ...unknown };
      const query = { ...submitted.query, ...unknown };
      storeRecord({ ...form }, { ...submitted, config, query } as unknown as SubmittedPhoneDraft);
      expect(phoneCompletionDraftForOwner(OWNER), JSON.stringify(unknown)).toBeNull();
    }
  });

  it("compares the room query's three choices with the ask's, as it compares the depth", () => {
    storeRecord({ ...form }, submitted);
    expect(phoneCompletionDraftForOwner(OWNER)).not.toBeNull();
    // A room query whose choice differs from the ask's is refused, like a differing depth.
    storeRecord({ ...form }, { ...submitted, query: { ...submitted.query, scrutiny: "exhaustive" } });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
    // The three on one side only: the page sends them in both or in neither.
    storeRecord({ ...form }, { ...submitted, query: legacyQuery });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
    storeRecord({ ...form }, { ...submitted, config: legacyConfig });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
    // A partial set is not a shape the page sends.
    const { answer_length: _length, ...twoChoices } = choices;
    storeRecord({ ...form }, { ...submitted, query: { ...legacyQuery, ...twoChoices } });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
  });

  it("saves a new draft in today's shape, and refuses to save an old one", async () => {
    expect(await savePhoneCompletionDraft(client, () => form, submitted, () => true)).toBe(true);
    expect(storedForm()).toEqual(form);
    const legacy = parallelCallsForm as unknown as PhoneDraftForm;
    await expect(savePhoneCompletionDraft(client, () => legacy, submitted, () => true)).rejects.toThrow("PHONE_DRAFT_INVALID");
  });
});
