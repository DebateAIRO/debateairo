import type { ExportSnapshot, DebateEntry } from "../../../apps/api/src/data-export/types.js";

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const story = (n: number) => ({ story: {
  short: { headline: `MARK-STORY-headline-${n}`, summary: `MARK-STORY-summary-${n}`,
    confidence: `MARK-STORY-confidence-${n}`, paths: [{ line: `MARK-STORY-paths.line-${n}` }],
    change: { text: `MARK-STORY-change.text-${n}` } },
  why: { reasons: [{ text: `MARK-STORY-why.reasons.text-${n}` }] },
  long: { sections: [{ title: `MARK-STORY-long.sections.title-${n}`,
    paragraphs: [{ text: `MARK-STORY-long.sections.paragraphs.text-${n}` }] }] },
  reviewer_note: { text: `MARK-STORY-reviewer_note.text-${n}` }
} });
const answer = (n: number, version: number) => ({
  nodes: [1, 2, 3].map((i) => ({ node_id: uuid(n * 100 + i), claim: `MARK-NODE${n}${String.fromCharCode(96 + i)}-v${version}` })),
  composed_text: [{ text: `MARK-ANSWER${n}-v${version}` }]
});
// SPEC-v11 row C7 (V-42): debate 1 rotated, debate 2 not (null), the unrecoverable debate 3 rotated (R25 keeps it).
export const rotationA = (t: string, created_at: string) => ({ rule: "LEAST_SHARE_SEEDED_TIE_V1",
  writer: { provider_ref: `p:${t}:w`, model_id: `${t}-writer-model`, maker: "Maker A" },
  checker: { provider_ref: `p:${t}:c`, model_id: `${t}-checker-model`, maker: "Maker B" },
  storyteller: { provider_ref: `p:${t}:s`, model_id: `${t}-storyteller-model`, maker: "Maker C" },
  story_checker: { provider_ref: `p:${t}:sc`, model_id: `${t}-story-checker-model`, maker: "Maker D" },
  eligible_model_ids: [`${t}-writer-model`, `${t}-checker-model`, `${t}-storyteller-model`, `${t}-story-checker-model`], created_at });
const readable = (n: number, created_at: string, verdict_state: string): DebateEntry => ({
  reference: uuid(n), content_status: "READABLE", created_at, deleted_at: null,
  tier: "STANDARD", depth: {}, plan_tier: "STANDARD", state: "COMPLETE",
  visibility_history: [{ state: n === 1 ? "PUBLISHED" : "PRIVATE", at: created_at }],
  role_rotation: n === 1 ? rotationA("MARK-ROT1", created_at) : null,
  question: `MARK-Q${n}`, run: { state: "COMPLETE", question_line: `MARK-Q${n}` },
  run_answer: { answer_id: uuid(n + 10), answer_version: 2, verdict_state, fixture_marker: `MARK-VERDICT${n}` },
  answers: [{ answer_id: uuid(n + 10), ledger_digest: {}, story: story(n), disclosure: {},
    versions: [1, 2].map((version) => ({ version, answer: answer(n, version), inspection: {},
      nodes: Object.fromEntries([1, 2, 3].map((i) => [uuid(n * 100 + i), { claim: `MARK-NODE${n}${String.fromCharCode(96 + i)}-v${version}` }])) })) }]
});

export const snapshotA: ExportSnapshot = {
  exportId: uuid(90), userId: uuid(91), locale: "en",
  requestedAt: new Date("2026-10-08T23:59:59.000Z"), generatedAt: new Date("2026-10-09T00:15:00.000Z"),
  account: { account: { pseudonym: "Ada", recovery_email: null, phone: null, phone_source: null,
      phone_verification_status: null, state: "active", created_at: "2024-01-02T00:00:00.000Z",
      adult_affirmed_at: "2024-01-02T00:00:00.000Z", email: "ada@example.test" },
    channels: [], registration_region: { country_code: "RO", us_state: null },
    age_checks: [], erasure_requests: [], kept_questions: [] },
  security: { mfa_factors: [], passkeys: [], recovery_codes: { unused_count: 4, generated_at: "2024-01-02T00:00:00.000Z" },
    sessions: [], social_identities: [], email_changes: [], recovery_email_changes: [], recovery_requests: [] },
  consents: { legal_acceptances: [], sensitive_data_consents: [] },
  debates: { debates: [readable(1, "2026-10-08T09:00:00.000Z", "SUPPORTED"),
    readable(2, "2026-10-09T09:00:00.000Z", "CONTESTED"),
    { reference: uuid(3), content_status: "UNRECOVERABLE", created_at: "2025-01-01T00:00:00.000Z",
      deleted_at: "2026-01-01T00:00:00.000Z", tier: "STANDARD", depth: {}, plan_tier: "STANDARD",
      state: null, visibility_history: [{ state: "PRIVATE", at: "2025-01-01T00:00:00.000Z" }],
      role_rotation: rotationA("MARK-ROT3", "2025-01-01T00:00:00.000Z") }] },
  billing: { customers: [], customer_xmoney: [], customer_profile_events: [], quotes: [], subscription_events: [],
    entitlement_events: [], run_charge_scopes: [], charges: [], internal_grants: [], withdrawal_owner_settlements: [],
    charge_events: [], quote_uses: [], invoice_intents: [], invoices: [], location_evidence: [] },
  support: { sessions: [], cases: [] },
  activity: { events: [] },
  recipient: "ada@example.test"
};
