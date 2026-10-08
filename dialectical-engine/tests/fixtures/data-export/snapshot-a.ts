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
  nodes: [1, 2, 3].map((i) => ({ claim: `MARK-NODE${n}${String.fromCharCode(96 + i)}-v${version}` })),
  composed_text: [{ text: `MARK-ANSWER${n}-v${version}` }]
});
const readable = (n: number, created_at: string, verdict_state: string): DebateEntry => ({
  reference: uuid(n), content_status: "READABLE", created_at, deleted_at: null,
  tier: "STANDARD", depth: "FULL", plan_tier: "STANDARD", state: "COMPLETE",
  visibility_history: [{ state: n === 1 ? "PUBLIC" : "PRIVATE", at: created_at }],
  question: `MARK-Q${n}`, run: { phase: "COMPLETE" }, run_answer: { verdict_state, fixture_marker: `MARK-VERDICT${n}` },
  answers: [{ answer_id: uuid(n + 10), ledger_digest: {}, story: story(n), disclosure: {},
    versions: [1, 2].map((version) => ({ version, answer: answer(n, version), inspection: {}, nodes: {} })) }]
});

export const snapshotA: ExportSnapshot = {
  exportId: uuid(90), userId: uuid(91), locale: "en",
  requestedAt: new Date("2026-10-08T23:59:59.000Z"), generatedAt: new Date("2026-10-09T00:15:00.000Z"),
  account: { account: { pseudonym: "Ada", email: "ada@example.test", created_at: "2024-01-02T00:00:00.000Z" },
    channels: [{ kind: "EMAIL" }], registration_region: { country_code: "RO" },
    age_checks: [{ country_code: "RO" }], erasure_requests: [{ state: "CANCELLED" }] },
  security: { mfa_factors: [{ kind: "TOTP" }], passkeys: [{ label: "Laptop" }], recovery_codes: { count: 4 },
    sessions: [{ device: "Browser" }], social_identities: [{ provider: "Example" }],
    email_changes: [{ state: "COMPLETE" }], recovery_email_changes: [{ state: "COMPLETE" }],
    recovery_requests: [{ state: "COMPLETE" }] },
  consents: { legal_acceptances: [{ policy: "PRIVACY" }], sensitive_data_consents: [{ state: "GRANTED" }] },
  debates: { debates: [readable(1, "2026-10-08T09:00:00.000Z", "SUPPORTED"),
    readable(2, "2026-10-09T09:00:00.000Z", "CONTESTED"),
    { reference: uuid(3), content_status: "UNRECOVERABLE", created_at: "2025-01-01T00:00:00.000Z",
      deleted_at: "2026-01-01T00:00:00.000Z", tier: "STANDARD", depth: "FULL", plan_tier: "STANDARD",
      state: "DELETED", visibility_history: [{ state: "PRIVATE", at: "2025-01-01T00:00:00.000Z" }] }] },
  billing: { customers: [], customer_xmoney: [], customer_profile_events: [], quotes: [], subscription_events: [],
    entitlement_events: [], run_charge_scopes: [], charges: [], internal_grants: [], withdrawal_owner_settlements: [],
    charge_events: [], quote_uses: [], invoice_intents: [], invoices: [], location_evidence: [] },
  support: { sessions: [], cases: [] },
  activity: { events: [{ type: "signed_in", at: "2026-10-08T00:00:00.000Z" }] },
  recipient: "ada@example.test"
};
