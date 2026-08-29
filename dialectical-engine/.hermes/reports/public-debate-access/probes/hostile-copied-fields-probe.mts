import {
  PublicationCipher,
  loadKek,
  MemoryPublicationKeyStore,
  type CryptoEnvelope
} from "../../../../packages/crypto/src/index.js";
import { PostgresPublicationApplication } from "../../../../apps/api/src/publications.js";
import type { PostgresPublicationRepository } from "@debateai/db";
import type { AuthenticatedSession } from "../../../../apps/api/src/sessions.js";
import { PublicDebateSchema, type Answer, type Node } from "@debateai/contract";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const SECRETS = {
  ln_source: "SECRET-LN-SOURCE-as-raw-artifact",
  ln_producer: "SECRET-LN-PRODUCER",
  maker_provider: "SECRET-MAKER-PROVIDER-REF-ledgerish",
  register_source: "SECRET-REGISTER-SOURCE-REF",
  register_row: "SECRET-REGISTER-ROW",
  locator: "SECRET-LOCATOR-internal-path",
  reason: "SECRET-REVIEW-REASON-contains-handle judgement:deadbeef",
  claim: "plain claim",
  unlock: "SECRET-UNLOCK"
};

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
  const nodeId = "node:hostile";
  const node: Node = {
    node_id: nodeId,
    claim: SECRETS.claim,
    way_of_knowing: "LOOKED_UP",
    base_score: {
      value: 0.5,
      kind: "probability",
      source: SECRETS.ln_source,
      producer: SECRETS.ln_producer,
      provenance_ref: "prov-base",
      replay_handle: "judgement:prov-base"
    },
    final_strength: {
      value: 0.6,
      kind: "probability",
      source: "final-source",
      producer: "graph",
      provenance_ref: "propagation-uuid-SHOULD-REDACT",
      replay_handle: "strength-replay-SHOULD-REDACT"
    },
    provenance_ref: "node-raw-SHOULD-REDACT",
    maker_lineage: {
      maker: "openai",
      model_id: "gpt-test",
      transport: "https",
      provider_ref: SECRETS.maker_provider
    },
    review: {
      outcome: "agree",
      reasons: [SECRETS.reason],
      provenance_ref: "review-raw-SHOULD-REDACT",
      reviewer_lineage: {
        maker: "reviewer",
        model_id: "r1",
        transport: "https",
        provider_ref: "development:review-provider"
      }
    },
    locator: SECRETS.locator,
    stranger_restatement: { check_status: "PASS", secret_extra: "NOPE" },
    defeater_refs: ["node:other"],
    defeater_exhaustion_marked: true,
    disagreement: { leak: "NOPE-DISAGREE" },
    condition_marks: [],
    abstention: {
      kind: "not searched",
      question_class: "empirical",
      risk_tier: "standard",
      price: 0.5,
      register_row_key: SECRETS.register_row,
      register_version: 1,
      register_source_ref: SECRETS.register_source,
      unlock_condition: SECRETS.unlock,
      ledger_unknown_ref: "ledger-ptr-SHOULD-REDACT"
    },
    staleness_state: "FRESH",
    relevant_as_of: "2026-08-24T00:00:00.000Z"
  };
  return {
    answer_id: "a", answer_version: 1, run_ref: RUN_ID,
    question_line: "hostile?",
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
    nodes: [node],
    edges: [{
      edge_id: "e", from_node_ref: nodeId, target_kind: "NODE", target_ref: nodeId,
      relation: "support",
      strength: { status: "PRESENT", number: {
        value: 0.7, kind: "edge-strength", source: "s", producer: "graph",
        provenance_ref: "EDGESECRET", replay_handle: "EDGESECRET"
      }},
      provenance_ref: "EDGESECRET", placeholder: false
    }],
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
  const json = JSON.stringify(read);
  const mustRedact = [
    "prov-base", "judgement:prov-base", "propagation-uuid-SHOULD-REDACT",
    "strength-replay-SHOULD-REDACT", "node-raw-SHOULD-REDACT",
    "review-raw-SHOULD-REDACT", "ledger-ptr-SHOULD-REDACT", "EDGESECRET",
    "NOPE", "NOPE-DISAGREE"
  ];
  const copiedByDesign = SECRETS; // architecture says these are COPIED
  const report = {
    schema_ok: PublicDebateSchema.safeParse(read).success,
    redacted_absent: Object.fromEntries(mustRedact.map(s => [s, !json.includes(s)])),
    copied_still_present: Object.fromEntries(Object.entries(copiedByDesign).map(([k,v]) => [k, json.includes(v)])),
    published_node_keys: Object.keys(read!.answer.nodes![0]!),
    published_ln_keys: Object.keys(read!.answer.nodes![0]!.base_score),
    maker_lineage: read!.answer.nodes![0]!.maker_lineage,
    abstention_register: {
      row: read!.answer.nodes![0]!.abstention?.register_row_key,
      source: read!.answer.nodes![0]!.abstention?.register_source_ref
    }
  };
  console.log(JSON.stringify(report, null, 2));
  const anyMustLeak = mustRedact.some(s => json.includes(s));
  console.log(anyMustLeak ? "VERDICT_SIGNAL: MUST_REDACT_LEAKED" : "VERDICT_SIGNAL: MUST_REDACT_CLEAN");
}
main();
