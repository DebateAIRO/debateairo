import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  EdgeSchema,
  NodeSchema,
  PublicDebateSchema,
  type Answer,
  type Node,
  type PublicDebate
} from "@debateai/contract";
import type { PublicationCipher } from "@debateai/crypto";
import type { PostgresPublicationRepository } from "@debateai/db";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";

const FORBIDDEN_IDENTITY_CARRIERS = Object.freeze([
  "asker_id",
  "owner_ref",
  "user_id",
  "run_ref",
  "answer_id",
  "memory_disclosure",
  "ledger_digest_handle",
  "inspection_handle",
  "cost_envelope",
  "tier_provenance_ref"
] as const);

const PUBLICATION_RUN_ID = "11111111-1111-4111-8111-111111111111";
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

function collectObjectKeys(
  schema: z.core.$ZodType,
  seen: Set<z.core.$ZodType> = new Set()
): string[] {
  if (seen.has(schema)) return [];
  seen.add(schema);

  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).flatMap(([key, child]) => [
      key,
      ...collectObjectKeys(child, seen)
    ]);
  }
  if (schema instanceof z.ZodArray) {
    return collectObjectKeys(schema.element, seen);
  }
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) {
    return collectObjectKeys(schema.unwrap(), seen);
  }
  if (schema instanceof z.ZodUnion) {
    return schema.options.flatMap((option) => collectObjectKeys(option, seen));
  }
  if (schema instanceof z.ZodRecord) {
    return collectObjectKeys(schema.valueType, seen);
  }
  return [];
}

function ownerNode(
  nodeId: string,
  claim: string,
  disagreement: Record<string, unknown> | null
): Node {
  return {
    node_id: nodeId,
    claim,
    way_of_knowing: "REASONING",
    base_score: {
      value: 0.75,
      kind: "probability",
      source: "owner-only source",
      producer: "test",
      provenance_ref: "owner-only labeled-number provenance",
      replay_handle: "owner-only replay handle"
    },
    final_strength: null,
    provenance_ref: "owner-only node provenance",
    maker_lineage: {
      maker: "agent",
      model_id: "test-model",
      transport: "test",
      provider_ref: "provider:test"
    },
    review: null,
    locator: null,
    stranger_restatement: { check_status: "NOT_SAMPLED" },
    defeater_refs: [],
    defeater_exhaustion_marked: false,
    disagreement,
    condition_marks: [],
    abstention: null,
    staleness_state: "FRESH",
    relevant_as_of: "2026-08-24T00:00:00.000Z"
  };
}

function answerWithDisagreement(disagreement: Record<string, unknown>): Answer {
  const firstNode = ownerNode(
    "node:owner-1",
    "The first public claim.",
    disagreement
  );
  return {
    answer_id: "answer:owner-only",
    answer_version: 1,
    run_ref: PUBLICATION_RUN_ID,
    question_line: "Should this debate be public?",
    terminal: "SERVED",
    verdict_state: "SUPPORTED",
    verdict_unavailable: null,
    confidence_band: "moderate",
    band_ceiling: {
      label: "TEST_LAYER_CEILING",
      basis: { LOOKED_UP: 0, RAN: 0, REASONING: 1 },
      register_row_key: "wayOfKnowingCeiling",
      register_version: 1,
      source_ref: "test:S04",
      lift_path: "test:public"
    },
    answer_form: { kind: "EMPIRICAL" },
    serve_state: "COMPOSED",
    composed_text: [{
      segment_id: "segment:s04",
      text: "The published answer includes its tree.",
      load_bearing: true,
      served_number_refs: []
    }],
    number_slots: [],
    abstention: null,
    shadow_suppressions: [],
    nodes: [
      firstNode,
      ownerNode("node:owner-2", "The second public claim.", disagreement)
    ],
    edges: [{
      edge_id: "edge:owner-1",
      from_node_ref: firstNode.node_id,
      target_kind: "NODE",
      target_ref: "node:owner-2",
      relation: "support",
      strength: {
        status: "UNKNOWN",
        reason: "NO_JUDGEMENT_OR_MAGNITUDE"
      },
      provenance_ref: "owner-only edge provenance",
      placeholder: false
    }],
    badges: [],
    residual_objections: [],
    value_hinges: [],
    condition_marks: [],
    condition_mark_records: [],
    reversal_point: "Contrary public evidence.",
    builds_on_previous: { value: false, answer_ref: null },
    memory_disclosure: null,
    risk_tier: "standard",
    tier_source: "ASKER",
    tier_provenance_ref: "owner-only tier provenance",
    cost_envelope: {
      basis: { source_ref: "test:S04" },
      state: "WITHIN",
      consumed_model_attempts: 1,
      protected_core: "NEVER_SKIPPABLE"
    },
    composition_budget_tier: "low",
    conformance_outcome: "PASS",
    ledger_digest_handle: "owner-only ledger digest",
    inspection_handle: "owner-only inspection handle",
    as_of: "2026-08-24T00:00:00.000Z",
    staleness_state: "FRESH",
    relevant_as_of: "2026-08-24T00:00:00.000Z"
  };
}

async function publishThroughProduct(answer: Answer): Promise<PublicDebate> {
  const projectedDebates: PublicDebate[] = [];
  const repository = {
    preflightGrant: async () => true,
    readAuthorPseudonym: async () => "Stable Public Name",
    prepareKeyProvision: async () => true,
    publish: async () => true,
    abandonKeyProvision: async () => true
  } as unknown as PostgresPublicationRepository;
  const cipher = {
    create: async () => ({
      encrypt(candidate: unknown) {
        projectedDebates.push(PublicDebateSchema.parse(candidate));
        return {};
      },
      close() {}
    })
  } as unknown as PublicationCipher;
  const application = new PostgresPublicationApplication(
    repository,
    cipher,
    () => new Date("2026-08-24T00:00:00.000Z")
  );

  const transition = await application.publish({
    runId: answer.run_ref,
    answer,
    authenticated,
    grantToken: "g".repeat(43),
    source: {
      ip: "192.0.2.1",
      userAgent: "S04 node-carrier audit",
      requestId: "request:S04"
    }
  });
  if (transition === null) throw new TypeError("S04_TEST_PUBLICATION_FAILED");
  const [projected] = projectedDebates;
  if (projected === undefined) throw new TypeError("S04_TEST_PROJECTION_MISSING");
  return projected;
}

describe("S04 public node carrier audit", () => {
  it("finds no forbidden identity-carrier key in the node or edge schema graph", () => {
    const reachableKeys = [
      ...collectObjectKeys(NodeSchema),
      ...collectObjectKeys(EdgeSchema)
    ];

    expect(
      reachableKeys.filter((key) => FORBIDDEN_IDENTITY_CARRIERS.includes(
        key as (typeof FORBIDDEN_IDENTITY_CARRIERS)[number]
      ))
    ).toEqual([]);
  });

  it("real publish projection removes forbidden keys smuggled through node disagreement", async () => {
    // Property: publish erases the open disagreement bag from every projected
    // fixture node. This test does not classify identity-like values stored
    // under allowed, copied field names.
    const disagreement = Object.fromEntries(FORBIDDEN_IDENTITY_CARRIERS.map(
      (key) => [key, `private-disagreement-value:${key}`]
    ));
    const debate = await publishThroughProduct(answerWithDisagreement(disagreement));
    const serialized = JSON.stringify(debate);

    expect(debate.answer.nodes).toHaveLength(2);
    for (const node of debate.answer.nodes ?? []) {
      expect.soft(node.disagreement).toBeNull();
    }
    for (const forbiddenKey of FORBIDDEN_IDENTITY_CARRIERS) {
      expect.soft(serialized).not.toContain(JSON.stringify(forbiddenKey));
      expect.soft(serialized).not.toContain(`private-disagreement-value:${forbiddenKey}`);
    }
  });
});
