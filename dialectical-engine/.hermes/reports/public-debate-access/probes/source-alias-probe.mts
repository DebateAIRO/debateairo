import {
  PublicationCipher, loadKek, MemoryPublicationKeyStore, type CryptoEnvelope
} from "../../../../packages/crypto/src/index.js";
import { PostgresPublicationApplication } from "../../../../apps/api/src/publications.js";
import type { PostgresPublicationRepository } from "@debateai/db";
import type { AuthenticatedSession } from "../../../../apps/api/src/sessions.js";
import { PublicDebateSchema, type Answer } from "@debateai/contract";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "raw-artifact-id-SHARED-BY-node-prov-and-ln-source";
const REDACTED = "REDACTED_OWNER_ONLY";

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
  const nodeId = "node:source-alias";
  return {
    answer_id: "a", answer_version: 1, run_ref: RUN_ID,
    question_line: "source alias?",
    terminal: "SERVED", verdict_state: "SUPPORTED", verdict_unavailable: null,
    confidence_band: "moderate",
    band_ceiling: {
      label: "T", basis: { LOOKED_UP: 1, RAN: 0, REASONING: 0 },
      register_row_key: "wayOfKnowingCeiling", register_version: 1,
      source_ref: "test", lift_path: "test"
    },
    answer_form: { kind: "EMPIRICAL" }, serve_state: "COMPOSED",
    composed_text: [{ segment_id: "s", text: "t", load_bearing: true, served_number_refs: [] }],
    number_slots: [], abstention: null, shadow_suppressions: [],
    nodes: [{
      node_id: nodeId,
      claim: "c",
      way_of_knowing: "REASONING",
      base_score: {
        value: 0.5, kind: "probability",
        // Mirrors judgement.record: source_ref = rawArtifactRef
        source: SECRET,
        producer: "judgement",
        provenance_ref: "reduced-judgement-uuid",
        replay_handle: "judgement:reduced-judgement-uuid"
      },
      final_strength: null,
      // Mirrors serve: node.provenance_ref = raw_artifact_id
      provenance_ref: SECRET,
      maker_lineage: null, review: null, locator: null,
      stranger_restatement: { check_status: "NOT_SAMPLED" },
      defeater_refs: [], defeater_exhaustion_marked: false,
      disagreement: null, condition_marks: [], abstention: null,
      staleness_state: "FRESH", relevant_as_of: "2026-08-24T00:00:00.000Z"
    }],
    edges: [],
    badges: [], residual_objections: [], value_hinges: [], condition_marks: [],
    condition_mark_records: [], reversal_point: "x",
    builds_on_previous: { value: false, answer_ref: null }, memory_disclosure: null,
    risk_tier: "standard", tier_source: "ASKER", tier_provenance_ref: "t",
    cost_envelope: { basis: { source_ref: "t" }, state: "WITHIN", consumed_model_attempts: 1, protected_core: "NEVER_SKIPPABLE" },
    composition_budget_tier: "low", conformance_outcome: "PASS",
    ledger_digest_handle: "L", inspection_handle: "I",
    as_of: "2026-08-24T00:00:00.000Z", staleness_state: "FRESH",
    relevant_as_of: "2026-08-24T00:00:00.000Z"
  };
}

async function main() {
  const createdAt = new Date("2026-08-24T00:00:00.000Z");
  const cipher = new PublicationCipher(new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xd2))));
  let stored: any = null;
  const repository = {
    preflightGrant: async () => true,
    readAuthorPseudonym: async () => "Stable Public Name",
    prepareKeyProvision: async () => true,
    publish: async (input: any) => { stored = { publicationRef: input.publicationRef, runId: input.runId, contentCiphertext: input.contentCiphertext, createdAt: input.occurredAt }; return true; },
    abandonKeyProvision: async () => true,
    withContentLease: async <T>(_r: string, use: () => Promise<T>) => use(),
    readPublic: async (r: string) => stored?.publicationRef === r ? stored : null,
    revalidatePublic: async () => true
  } as unknown as PostgresPublicationRepository;
  const app = new PostgresPublicationApplication(repository, cipher, () => createdAt);
  const transition = await app.publish({
    runId: RUN_ID, answer: answer(), authenticated,
    grantToken: "g".repeat(43),
    source: { ip: "192.0.2.1", userAgent: "REV-04", requestId: "r" }
  });
  const read = await app.readPublicDebate(transition!.public_ref);
  const node = read!.answer.nodes![0]!;
  const json = JSON.stringify(read);
  const report = {
    node_provenance_ref: node.provenance_ref,
    base_score_source: node.base_score.source,
    base_score_provenance_ref: node.base_score.provenance_ref,
    base_score_replay_handle: node.base_score.replay_handle,
    secret_still_in_json: json.includes(SECRET),
    node_prov_redacted: node.provenance_ref === REDACTED,
    // THE CLAIM under architecture's value-provenance rule:
    // raw_artifact_id was redacted on node.provenance_ref but survives on base_score.source
    owner_only_value_reached_via_source:
      node.provenance_ref === REDACTED && node.base_score.source === SECRET
  };
  console.log(JSON.stringify(report, null, 2));
  console.log(report.owner_only_value_reached_via_source
    ? "VERDICT_SIGNAL: SOURCE_ALIAS_LEAK"
    : "VERDICT_SIGNAL: SOURCE_ALIAS_SAFE");
}
main();
