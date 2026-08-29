import { PublicDebateSchema, type Answer } from "@debateai/contract";
import {
  PublicationCipher,
  loadKek,
  MemoryPublicationKeyStore,
  type CryptoEnvelope
} from "../../../../packages/crypto/src/index.js";
import { PostgresPublicationApplication } from "../../../../apps/api/src/publications.js";
import type { PostgresPublicationRepository } from "@debateai/db";
import type { AuthenticatedSession } from "../../../../apps/api/src/sessions.js";

// Mirrors packages/judgement insert: replay_handle = `judgement:${reducedJudgementId}`
// and packages/serve projection: base_provenance_ref = reduced_judgement_id::text
const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPLAY = `judgement:${UUID}`;
const RUN_ID = "11111111-1111-4111-8111-111111111111";

const authenticated = Object.freeze({
  session: Object.freeze({
    asker_id: "owner:44444444-4444-4444-8444-444444444444",
    session_id: "55555555-5555-4555-8555-555555555555",
    caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const,
    provisional_identity_model: false as const
  }),
  userId: "66666666-6666-4666-8666-666666666666",
  ownerRef: "44444444-4444-4444-8444-444444444444",
  tokenHash: "sha256:session",
  csrfTokenHash: "sha256:csrf",
  authKind: "cookie" as const
}) satisfies AuthenticatedSession;

function answer(): Answer {
  const nodeId = "node:prefix";
  return {
    answer_id: "answer:prefix",
    answer_version: 1,
    run_ref: RUN_ID,
    question_line: "prefix?",
    terminal: "SERVED",
    verdict_state: "SUPPORTED",
    verdict_unavailable: null,
    confidence_band: "moderate",
    band_ceiling: {
      label: "TEST",
      basis: { LOOKED_UP: 1, RAN: 0, REASONING: 0 },
      register_row_key: "wayOfKnowingCeiling",
      register_version: 1,
      source_ref: "test",
      lift_path: "test"
    },
    answer_form: { kind: "EMPIRICAL" },
    serve_state: "COMPOSED",
    composed_text: [{ segment_id: "s1", text: "probe", load_bearing: true, served_number_refs: [] }],
    number_slots: [],
    abstention: null,
    shadow_suppressions: [],
    nodes: [{
      node_id: nodeId,
      claim: "probe",
      way_of_knowing: "REASONING",
      base_score: {
        value: 0.5,
        kind: "probability",
        source: "test",
        producer: "judgement",
        provenance_ref: UUID,
        replay_handle: REPLAY
      },
      final_strength: null,
      provenance_ref: "artifact:x",
      maker_lineage: null,
      review: null,
      locator: null,
      stranger_restatement: { check_status: "NOT_SAMPLED" },
      defeater_refs: [],
      defeater_exhaustion_marked: false,
      disagreement: null,
      condition_marks: [],
      abstention: null,
      staleness_state: "FRESH",
      relevant_as_of: "2026-08-24T00:00:00.000Z"
    }],
    edges: [],
    badges: [],
    residual_objections: [],
    value_hinges: [],
    condition_marks: [],
    condition_mark_records: [],
    reversal_point: "contrary",
    builds_on_previous: { value: false, answer_ref: null },
    memory_disclosure: null,
    risk_tier: "standard",
    tier_source: "ASKER",
    tier_provenance_ref: "test",
    cost_envelope: {
      basis: { source_ref: "test" },
      state: "WITHIN",
      consumed_model_attempts: 1,
      protected_core: "NEVER_SKIPPABLE"
    },
    composition_budget_tier: "low",
    conformance_outcome: "PASS",
    ledger_digest_handle: "ledger:private",
    inspection_handle: "inspection:private",
    as_of: "2026-08-24T00:00:00.000Z",
    staleness_state: "FRESH",
    relevant_as_of: "2026-08-24T00:00:00.000Z"
  };
}

async function main() {
  const createdAt = new Date("2026-08-24T00:00:00.000Z");
  const cipher = new PublicationCipher(new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xd2))));
  let storedSnapshot: { publicationRef: string; runId: string; contentCiphertext: CryptoEnvelope; createdAt: Date } | null = null;
  const repository = {
    preflightGrant: async () => true,
    readAuthorPseudonym: async () => "Stable Public Name",
    prepareKeyProvision: async () => true,
    publish: async (input: any) => { storedSnapshot = { publicationRef: input.publicationRef, runId: input.runId, contentCiphertext: input.contentCiphertext, createdAt: input.occurredAt }; return true; },
    abandonKeyProvision: async () => true,
    withContentLease: async <T>(_r: string, use: () => Promise<T>) => use(),
    readPublic: async (publicationRef: string) => storedSnapshot?.publicationRef === publicationRef ? storedSnapshot : null,
    revalidatePublic: async () => true
  } as unknown as PostgresPublicationRepository;
  const application = new PostgresPublicationApplication(repository, cipher, () => createdAt);
  const transition = await application.publish({
    runId: RUN_ID, answer: answer(), authenticated,
    grantToken: "g".repeat(43),
    source: { ip: "192.0.2.1", userAgent: "REV-04", requestId: "r" }
  });
  const read = await application.readPublicDebate(transition!.public_ref);
  const base = read!.answer.nodes![0]!.base_score;
  const reconstructed = `judgement:${base.provenance_ref}`;
  const report = {
    published_replay: base.replay_handle,
    published_provenance: base.provenance_ref,
    reconstructed_equals_original_replay: reconstructed === REPLAY,
    original_replay_absent_from_json: !JSON.stringify(read).includes(REPLAY)
  };
  console.log(JSON.stringify(report, null, 2));
  console.log(report.reconstructed_equals_original_replay ? "VERDICT_SIGNAL: NODE_PREFIX_RECONSTRUCTABLE" : "VERDICT_SIGNAL: NODE_PREFIX_SAFE");
}
main();
