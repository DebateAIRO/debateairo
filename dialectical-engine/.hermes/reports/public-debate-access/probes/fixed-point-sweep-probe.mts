/**
 * REV-04 second re-review: one more pass of the recursive value-provenance rule
 * against the CONVERGED redacted set. If any COPIED field still carries a value
 * identical to a redacted source, that is a third member / fixed-point miss.
 */
import {
  PublicationCipher, loadKek, MemoryPublicationKeyStore, type CryptoEnvelope
} from "../../../../packages/crypto/src/index.js";
import { PostgresPublicationApplication } from "../../../../apps/api/src/publications.js";
import type { PostgresPublicationRepository } from "@debateai/db";
import type { AuthenticatedSession } from "../../../../apps/api/src/sessions.js";
import { PublicDebateSchema, type Answer } from "@debateai/contract";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const REDACTED = "REDACTED_OWNER_ONLY";

// Converged redacted SOURCE VALUES (the underlying secrets, not the constant)
const SECRETS = {
  raw_artifact: "RAW-ARTIFACT-ID-secret",
  reduced_judgement: "REDUCED-JUDGEMENT-ID-secret",
  judgement_replay: "judgement:REDUCED-JUDGEMENT-ID-secret",
  propagation: "PROPAGATION-RUN-ID-secret",
  strength_replay: "STRENGTH-REPLAY-HANDLE-secret",
  edge_prov: "EDGE-PROVENANCE-REF-secret",
  review_raw: "REVIEW-RAW-ARTIFACT-ID-secret",
  ledger_unknown: "LEDGER-UNKNOWN-REF-secret",
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
  const nodeId = "node:fp";
  return {
    answer_id: "a", answer_version: 1, run_ref: RUN_ID,
    question_line: "fixed point?",
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
      claim: "public claim text",
      way_of_knowing: "REASONING",
      base_score: {
        value: 0.5, kind: "probability",
        source: SECRETS.raw_artifact, // production alias — must redact
        producer: "judgement", // COPIED — must NOT equal a secret
        provenance_ref: SECRETS.reduced_judgement,
        replay_handle: SECRETS.judgement_replay
      },
      final_strength: {
        value: 0.6, kind: "probability",
        source: SECRETS.raw_artifact, // production alias via runner — must redact
        producer: "graph",
        provenance_ref: SECRETS.propagation,
        replay_handle: SECRETS.strength_replay
      },
      provenance_ref: SECRETS.raw_artifact,
      maker_lineage: {
        maker: "openai",
        model_id: "model-not-a-secret",
        transport: "https",
        provider_ref: "development:provider" // COPIED-VERIFIED config
      },
      review: {
        outcome: "agree",
        reasons: ["reason text without secrets"],
        provenance_ref: SECRETS.review_raw,
        reviewer_lineage: {
          maker: "reviewer", model_id: "r1", transport: "https",
          provider_ref: "development:review-provider"
        }
      },
      locator: "https://example.com/citation",
      stranger_restatement: { check_status: "PASS", bag: "should-strip" },
      defeater_refs: ["node:other"],
      defeater_exhaustion_marked: true,
      disagreement: { x: "should-null" },
      condition_marks: [],
      abstention: {
        kind: "not searched", question_class: "empirical", risk_tier: "standard",
        price: 0.5,
        register_row_key: "abstentionPolicy",
        register_version: 1,
        register_source_ref: "register:policy",
        unlock_condition: "Search sources.",
        ledger_unknown_ref: SECRETS.ledger_unknown
      },
      staleness_state: "FRESH",
      relevant_as_of: "2026-08-24T00:00:00.000Z"
    }],
    edges: [{
      edge_id: "e", from_node_ref: nodeId, target_kind: "NODE", target_ref: nodeId,
      relation: "support",
      strength: {
        status: "PRESENT",
        number: {
          value: 0.7, kind: "edge-strength",
          source: "EVIDENCE_VERIFIER", // COPIED enum — must survive
          producer: "graph",
          provenance_ref: SECRETS.edge_prov,
          replay_handle: SECRETS.edge_prov
        }
      },
      provenance_ref: SECRETS.edge_prov,
      placeholder: false
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

function collectStringLeaves(value: unknown, path: string, out: Array<{ path: string; value: string }>) {
  if (typeof value === "string") { out.push({ path, value }); return; }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectStringLeaves(v, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectStringLeaves(v, path ? `${path}.${k}` : k, out);
  }
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
  const leaves: Array<{ path: string; value: string }> = [];
  collectStringLeaves(read, "", leaves);

  const secretValues = Object.values(SECRETS);
  const leaks = leaves.filter((l) => secretValues.includes(l.value));
  const edgeSource = read!.answer.edges![0]!.strength.status === "PRESENT"
    ? read!.answer.edges![0]!.strength.number.source
    : null;
  const node = read!.answer.nodes![0]!;

  // Hostile: try planting each secret into each COPIED field one at a time
  // (producer-illegal but tests whether projection would pass it through if a
  // future producer started aliasing).
  const copiedPlantPaths = [
    "claim", "maker_lineage.provider_ref", "maker_lineage.model_id",
    "review.reasons[0]", "review.reviewer_lineage.provider_ref",
    "locator", "defeater_refs[0]", "abstention.register_row_key",
    "abstention.register_source_ref", "abstention.unlock_condition",
    "base_score.producer", "base_score.kind", "edge.strength.number.producer"
  ] as const;

  const plantLeaks: Array<{ path: string; secret: string }> = [];
  for (const plantPath of copiedPlantPaths) {
    for (const [secretName, secret] of Object.entries(SECRETS)) {
      const a = answer();
      const n = a.nodes[0]!;
      const e = a.edges[0]!;
      if (plantPath === "claim") n.claim = secret;
      else if (plantPath === "maker_lineage.provider_ref") n.maker_lineage!.provider_ref = secret;
      else if (plantPath === "maker_lineage.model_id") n.maker_lineage!.model_id = secret;
      else if (plantPath === "review.reasons[0]") n.review!.reasons = [secret];
      else if (plantPath === "review.reviewer_lineage.provider_ref") n.review!.reviewer_lineage.provider_ref = secret;
      else if (plantPath === "locator") n.locator = secret;
      else if (plantPath === "defeater_refs[0]") n.defeater_refs = [secret];
      else if (plantPath === "abstention.register_row_key") n.abstention!.register_row_key = secret;
      else if (plantPath === "abstention.register_source_ref") n.abstention!.register_source_ref = secret;
      else if (plantPath === "abstention.unlock_condition") n.abstention!.unlock_condition = secret;
      else if (plantPath === "base_score.producer") n.base_score.producer = secret;
      else if (plantPath === "base_score.kind") n.base_score.kind = secret;
      else if (plantPath === "edge.strength.number.producer" && e.strength.status === "PRESENT") e.strength.number.producer = secret;

      stored = null;
      const t = await app.publish({
        runId: RUN_ID, answer: a, authenticated,
        grantToken: "g".repeat(43),
        source: { ip: "192.0.2.1", userAgent: "REV-04", requestId: "r" }
      });
      const r = await app.readPublicDebate(t!.public_ref);
      const json = JSON.stringify(r);
      // Only count as fixed-point MISS if a CURRENT PRODUCER assigns this.
      // Planting into COPIED fields shows pass-through risk, not a rule miss,
      // unless the producer actually does it. Record separately.
      if (json.includes(secret) && r!.answer.nodes![0]!.provenance_ref === REDACTED) {
        // surviving on a copied path after redaction of the canonical field
        plantLeaks.push({ path: plantPath, secret: secretName });
      }
    }
  }

  const report = {
    schema_ok: PublicDebateSchema.safeParse(read).success,
    production_shaped_secret_leaves: leaks,
    edge_source_preserved: edgeSource === "EVIDENCE_VERIFIER",
    base_source_redacted: node.base_score.source === REDACTED,
    final_source_redacted: node.final_strength?.source === REDACTED,
    node_prov_redacted: node.provenance_ref === REDACTED,
    // plantLeaks are COPIED pass-through of planted secrets — expected for
    // free-text/config fields; NOT automatic fixed-point failures.
    planted_secret_survivals_on_copied_fields: plantLeaks.length,
    planted_unique_paths: [...new Set(plantLeaks.map((p) => p.path))],
  };
  console.log(JSON.stringify(report, null, 2));
  const thirdMember = leaks.length > 0;
  console.log(thirdMember
    ? "VERDICT_SIGNAL: FIXED_POINT_MISS_THIRD_MEMBER"
    : "VERDICT_SIGNAL: FIXED_POINT_HOLDS");
  console.log(report.edge_source_preserved
    ? "VERDICT_SIGNAL: EDGE_SOURCE_COPIED"
    : "VERDICT_SIGNAL: EDGE_SOURCE_OVER_REDACTED");
}
main();
