// @vitest-environment jsdom
/**
 * Parallel calls, task 13 (owner ruling 2026-10-12): the /new page no longer has the
 * Concurrency and Branching width controls. A saved phone-completion draft therefore
 * no longer carries `branching` / `concurrency`; a draft saved before the change (it
 * still carries both) keeps parsing, and the two old values are simply ignored.
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
  planTier: "free",
  optionsOpen: true,
  depthMode: "fixed",
  scrutiny: "standard",
  depth: 2,
  maxTokens: 800,
  riskTier: "standard",
  riskTierWasEdited: false,
  budgetTier: "low",
  decisionScope: "City transport policy",
  asOf: "2026-10-12T09:30:00.000Z"
};

const submitted: SubmittedPhoneDraft = {
  topic: form.topic,
  config: {
    plan_tier: "free",
    risk_tier: "standard",
    tier_source: "MACHINE_DEFAULT",
    tier_provenance_ref: "machine:plan-tier-free",
    composition_budget_tier: "low",
    depth: 2,
    decision_scope: "City transport policy",
    as_of: "2026-10-12T09:30:00.000Z",
    steering_presets: [],
    steering_annotations: []
  },
  query: { plan_tier: "free", composition_budget_tier: "low", depth: 2 }
};

function storeRecord(recordForm: Record<string, unknown>): string {
  const now = Date.now();
  const id = "0b7a6c1e-2f3d-4a5b-8c9d-0e1f2a3b4c5d";
  window.sessionStorage.setItem(PHONE_COMPLETION_DRAFT_KEY, JSON.stringify({
    version: 1, id, owner: OWNER, created_at: now, expires_at: now + PHONE_COMPLETION_DRAFT_MS,
    phase: "phone-required", form: recordForm, submitted
  }));
  return id;
}

function storedForm(): Record<string, unknown> {
  const text = window.sessionStorage.getItem(PHONE_COMPLETION_DRAFT_KEY);
  expect(text, "no draft was stored").not.toBeNull();
  return (JSON.parse(text!) as { form: Record<string, unknown> }).form;
}

describe("phone-completion draft without the retired Concurrency and Branching width controls", () => {
  beforeEach(() => clearPhoneCompletionDraft());
  afterEach(() => clearPhoneCompletionDraft());

  it("parses a draft saved before the change, ignoring its branching and concurrency", () => {
    const id = storeRecord({ ...form, branching: 2, concurrency: 3 });
    const draft = phoneCompletionDraftForOwner(OWNER);
    expect(draft?.id).toBe(id);
    expect(draft?.form).toEqual(form);
    expect(draft?.form).not.toHaveProperty("branching");
    expect(draft?.form).not.toHaveProperty("concurrency");
  });

  it("rewrites an old draft in the new shape when it moves on", () => {
    const id = storeRecord({ ...form, branching: 4, concurrency: 6 });
    expect(acknowledgePhoneDraftUpdate(id, OWNER)).toBe(true);
    expect(storedForm()).toEqual(form);
  });

  it("parses a draft in the new shape", () => {
    const id = storeRecord({ ...form });
    expect(phoneCompletionDraftForOwner(OWNER)?.id).toBe(id);
  });

  it("still refuses a draft that carries only one of the two old keys", () => {
    storeRecord({ ...form, branching: 2 });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
  });

  it("saves a new draft with neither branching nor concurrency", async () => {
    expect(await savePhoneCompletionDraft(client, () => form, submitted, () => true)).toBe(true);
    const saved = storedForm();
    expect(saved).toEqual(form);
    expect(saved).not.toHaveProperty("branching");
    expect(saved).not.toHaveProperty("concurrency");
  });

  it("refuses to save a new draft that still carries the old keys", async () => {
    const legacy = { ...form, branching: 2, concurrency: 3 } as unknown as PhoneDraftForm;
    await expect(savePhoneCompletionDraft(client, () => legacy, submitted, () => true)).rejects.toThrow("PHONE_DRAFT_INVALID");
  });
});
