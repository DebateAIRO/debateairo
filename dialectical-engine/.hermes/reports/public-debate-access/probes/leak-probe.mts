/**
 * REV-04 blind probe: can an owner-only replay_handle VALUE reach an anonymous
 * reader via provenance_ref when the fixture mirrors projectServeEdge
 * (packages/serve/src/index.ts:173-177), which sets both fields to the same
 * row.provenanceRef?
 */
import { randomUUID } from "node:crypto";
import { PublicDebateSchema, type Answer } from "@debateai/contract";
import {
  PublicationCipher,
  loadKek,
  type CryptoEnvelope
} from "../../../../packages/crypto/src/index.js";
import { PostgresPublicationApplication } from "../../../../apps/api/src/publications.js";
import type { PostgresPublicationRepository } from "@debateai/db";
import type { AuthenticatedSession } from "../../../../apps/api/src/sessions.js";

const SECRET = "edge-prov-alias-HANDLE-9f2a-SHOULD-NOT-LEAK";
const REDACTED = "REDACTED_OWNER_ONLY";
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

function labeled(handle: string, provenance: string) {
  return {
    value: 0.75,
    kind: "edge-strength",
    source: "test",
    producer: "graph",
    provenance_ref: provenance,
    replay_handle: handle
  };
}

function answerMirroringProjectServeEdge(): Answer {
  const nodeId = "node:alias-probe";
  return {
    answer_id: "answer:alias",
    answer_version: 1,
    run_ref: RUN_ID,
    question_line: "Does provenance_ref alias leak the replay handle?",
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
    composed_text: [{
      segment_id: "s1",
      text: "probe",
      load_bearing: true,
      served_number_refs: []
    }],
    number_slots: [],
    abstention: null,
    shadow_suppressions: [],
    nodes: [{
      node_id: nodeId,
      claim: "probe node",
      way_of_knowing: "REASONING",
      base_score: labeled("node-base-handle", "node-base-prov"),
      final_strength: null,
      provenance_ref: "node-prov",
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
    edges: [{
      edge_id: "edge:alias",
      from_node_ref: nodeId,
      target_kind: "NODE",
      target_ref: nodeId,
      relation: "support",
      // Mirrors projectServeEdge: BOTH fields get the same provenanceRef.
      strength: {
        status: "PRESENT",
        number: labeled(SECRET, SECRET)
      },
      provenance_ref: SECRET,
      placeholder: false
    }],
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
  const cipher = new PublicationCipher(
    // @ts-expect-error memory store shape matches production harness
    new (await import("../../../../packages/crypto/src/index.js")).MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xd2)))
  );
  let storedSnapshot: {
    publicationRef: string;
    runId: string;
    contentCiphertext: CryptoEnvelope;
    createdAt: Date;
  } | null = null;

  const repository = {
    preflightGrant: async () => true,
    readAuthorPseudonym: async () => "Stable Public Name",
    prepareKeyProvision: async () => true,
    publish: async (input: {
      publicationRef: string;
      runId: string;
      contentCiphertext: CryptoEnvelope;
      occurredAt: Date;
    }) => {
      storedSnapshot = {
        publicationRef: input.publicationRef,
        runId: input.runId,
        contentCiphertext: input.contentCiphertext,
        createdAt: input.occurredAt
      };
      return true;
    },
    abandonKeyProvision: async () => true,
    withContentLease: async <T>(_r: string, use: () => Promise<T>) => use(),
    readPublic: async (publicationRef: string) =>
      storedSnapshot?.publicationRef === publicationRef ? storedSnapshot : null,
    revalidatePublic: async () => true
  } as unknown as PostgresPublicationRepository;

  const application = new PostgresPublicationApplication(
    repository,
    cipher,
    () => createdAt
  );

  const answer = answerMirroringProjectServeEdge();
  const transition = await application.publish({
    runId: answer.run_ref,
    answer,
    authenticated,
    grantToken: "g".repeat(43),
    source: { ip: "192.0.2.1", userAgent: "REV-04", requestId: "request:rev04" }
  });
  if (transition === null) throw new Error("publish failed");

  const read = await application.readPublicDebate(transition.public_ref);
  if (read === null) throw new Error("read failed");

  const edge = read.answer.edges?.[0];
  const serialized = JSON.stringify(read);
  const number = edge?.strength.status === "PRESENT" ? edge.strength.number : null;

  const report = {
    publish_ok: true,
    schema_ok: PublicDebateSchema.safeParse(read).success,
    replay_handle_after: number?.replay_handle ?? null,
    number_provenance_ref_after: number?.provenance_ref ?? null,
    edge_provenance_ref_after: edge?.provenance_ref ?? null,
    secret_still_in_json: serialized.includes(SECRET),
    replay_field_redacted: number?.replay_handle === REDACTED,
    // THE CLAIM: owner-only VALUE reaches anonymous reader despite projection
    owner_only_value_reached_anonymous_reader:
      serialized.includes(SECRET) && number?.replay_handle === REDACTED
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.owner_only_value_reached_anonymous_reader) {
    console.log("VERDICT_SIGNAL: LEAK_REPRODUCED");
    process.exit(2);
  }
  console.log("VERDICT_SIGNAL: NO_ALIAS_LEAK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
