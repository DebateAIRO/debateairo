import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ABSTENTION_KINDS, CONDITION_MARKS } from "@debateai/kernel";
import {
  ContractHttpError,
  EVENT_TYPES,
  createContractClient,
  type Answer,
  type RunEvent,
  type StalenessState
} from "@debateai/contract";
import {
  abstentionKindLabel,
  applyRunEvent,
  conditionMarkLabel,
  createEmptyLiveAnswerState,
  projectAnswerSurface,
  summarizeFreshness
} from "../../web/lib/v3Presentation.js";
import { projectNodeMakerLineage, projectServeEdge } from "@debateai/serve";
import { conditionMarkLabel as v2ConditionMarkLabel } from "../../apps/ui/lib/v3/labels.js";

const labeledNumber = Object.freeze({
  value: 0.75,
  kind: "strength",
  source: "test-layer:FX-PT-D4",
  producer: "test-layer",
  provenance_ref: "provenance:test",
  replay_handle: "replay:test"
});

function answer(overrides: Partial<Answer> = {}): Answer {
  return {
    answer_id: "answer:test",
    answer_version: 1,
    run_ref: "run:test",
    question_line: "What follows?",
    terminal: "SERVED",
    verdict_state: "SUPPORTED",
    verdict_unavailable: null,
    confidence_band: "TEST_LAYER_BAND",
    band_ceiling: {
      label: "TEST_LAYER_CEILING",
      basis: { LOOKED_UP: 1, RAN: 0, REASONING: 0 },
      register_row_key: "wayOfKnowingCeiling",
      register_version: 1,
      source_ref: "test-layer:DR-086",
      lift_path: "test-layer:improve-basis"
    },
    answer_form: { kind: "EMPIRICAL" },
    serve_state: "COMPOSED",
    composed_text: [{ segment_id: "segment:test", text: "A composed answer.", load_bearing: true, served_number_refs: ["number:test"] }],
    number_slots: [{ status: "PRESENT", number: labeledNumber }],
    abstention: null,
    shadow_suppressions: [],
    nodes: [{
      node_id: "node:test",
      claim: "A recorded claim",
      way_of_knowing: "LOOKED_UP",
      base_score: labeledNumber,
      final_strength: labeledNumber,
      provenance_ref: "provenance:test",
      maker_lineage: null,
      review: null,
      locator: "https://example.test/source",
      stranger_restatement: { check_status: "PASS" },
      defeater_refs: [],
      defeater_exhaustion_marked: true,
      disagreement: null,
      condition_marks: [],
      abstention: null,
      staleness_state: "FRESH",
      relevant_as_of: "2026-08-09T00:00:00.000Z"
    }],
    edges: [],
    badges: [],
    residual_objections: [],
    value_hinges: [],
    condition_marks: [],
    condition_mark_records: [],
    reversal_point: "A contrary observation would reverse it.",
    builds_on_previous: { value: false, answer_ref: null },
    memory_disclosure: null,
    risk_tier: "standard",
    tier_source: "ASKER",
    tier_provenance_ref: "asker:test",
    cost_envelope: { basis: { source_ref: "test-layer" }, state: "WITHIN", consumed_model_attempts: 1, protected_core: "NEVER_SKIPPABLE" },
    composition_budget_tier: "low",
    conformance_outcome: "PASS",
    ledger_digest_handle: "ledger:test",
    inspection_handle: "inspection:test",
    as_of: "2026-08-09T00:00:00.000Z",
    staleness_state: "FRESH",
    relevant_as_of: "2026-08-09T00:00:00.000Z",
    ...overrides
  };
}

describe("S14 / W20 / W8-W15 — typed UI projections", () => {
  it("renders composed and components-only answers without parsing prose", () => {
    expect(projectAnswerSurface(answer())).toMatchObject({ mode: "COMPOSED", text: ["A composed answer."], defect: false });
    expect(projectAnswerSurface(answer({
      terminal: "COMPONENTS_ONLY",
      verdict_state: null,
      verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_DEFECT" },
      confidence_band: null,
      band_ceiling: null,
      answer_form: null,
      serve_state: "COMPONENTS_ONLY",
      composed_text: [],
      condition_marks: ["DEFECT"]
    }))).toMatchObject({ mode: "COMPONENTS_ONLY", text: [], defect: true });
  });

  it("has a renderer for every ruled condition mark — including DR-161's unserved-maker disclosure", () => {
    expect(CONDITION_MARKS).toHaveLength(28);
    expect(CONDITION_MARKS).toContain("OWED-CHECK-UNEXECUTED");
    expect(CONDITION_MARKS).toContain("UNSERVED-MAKER-POSITION");
    expect(conditionMarkLabel("UNSERVED-MAKER-POSITION")).toBe("Another maker's position was not served");
    for (const render of [conditionMarkLabel, v2ConditionMarkLabel]) {
      const labels = CONDITION_MARKS.map(render);
      expect(labels.every((label) => label.trim().length > 0)).toBe(true);
      expect(new Set(labels).size).toBe(CONDITION_MARKS.length);
    }
  });

  it("has a renderer for every one of spec section 12.3's five abstention kinds", () => {
    expect(ABSTENTION_KINDS.map(abstentionKindLabel).every((label) => label.trim().length > 0)).toBe(true);
  });

  it("preserves mixed freshness per item instead of inventing an aggregate state", () => {
    expect(summarizeFreshness([
      { subjectRef: "answer:test", state: "FRESH" },
      { subjectRef: "node:test", state: "STALE" }
    ])).toEqual({ kind: "MIXED", items: [
      { subjectRef: "answer:test", state: "FRESH" },
      { subjectRef: "node:test", state: "STALE" }
    ] });
  });

  it("FX-PT-D4 fuzzes aggregate freshness without contradicting any item", () => {
    const states = ["FRESH", "UNDER_REVIEW", "STALE", "ARCHIVED_REVIVED"] as const satisfies readonly StalenessState[];
    fc.assert(fc.property(fc.array(fc.constantFrom(...states), { minLength: 1 }), (generated) => {
      const items = generated.map((state, index) => ({ subjectRef: `test-layer:${index}`, state }));
      const summary = summarizeFreshness(items);
      expect(summary.items).toEqual(items);
      expect(summary.kind).toBe(new Set(generated).size === 1 ? "UNIFORM" : "MIXED");
    }));
  });
});

describe("S14 / W10 — first-class graph edges", () => {
  it("projects measured arrows with labeled replayable strength and unknown arrows without a number", () => {
    const base = {
      edgeId: "edge:test", sourceNodeId: "node:child", sourceChildKind: "support",
      targetKind: "NODE" as const, targetRef: "node:parent", polarity: "support" as const,
      strengthSource: "EVIDENCE_VERIFIER", provenanceRef: "provenance:edge"
    };
    expect(projectServeEdge({ ...base, magnitudeStatus: "MEASURED", strength: 0.6 }).strength).toMatchObject({
      status: "PRESENT", number: { value: 0.6, source: "EVIDENCE_VERIFIER", replay_handle: "provenance:edge" }
    });
    expect(projectServeEdge({ ...base, magnitudeStatus: "UNKNOWN", strength: null }).strength).toEqual({
      status: "UNKNOWN", reason: "NO_JUDGEMENT_OR_MAGNITUDE"
    });
  });
});

describe("UI-02b — recorded per-node maker lineage", () => {
  it("relays a complete ledger identity exactly and maps an unresolved join to typed absence", () => {
    const recorded = {
      maker: "maker:test-layer",
      model_id: "model:test-layer",
      model_version: null,
      provider: "provider-kind:test-layer",
      provider_ref: "provider:test-layer"
    };
    expect(projectNodeMakerLineage(recorded)).toEqual({
      maker: "maker:test-layer",
      model_id: "model:test-layer",
      transport: "provider-kind:test-layer",
      provider_ref: "provider:test-layer"
    });
    expect(projectNodeMakerLineage({ ...recorded, maker: null })).toBeNull();
    expect(projectNodeMakerLineage({ ...recorded, model_id: null })).toBeNull();
    expect(projectNodeMakerLineage({ ...recorded, provider: null })).toBeNull();
    expect(projectNodeMakerLineage({ ...recorded, provider_ref: null })).toBeNull();
  });
});

describe("S14 / W6 / FX-LG-17 — live lifecycle and freshness", () => {
  it("connects a spawned placeholder and renders generating -> being judged -> scored", () => {
    const events: RunEvent[] = [
      { event_id: "1", event_type: "node.spawned", run_ref: "run:test", subject_ref: "node:child", at_sequence: 1, payload: { parent_ref: "node:parent", relation: "support" } },
      { event_id: "2", event_type: "node.generating", run_ref: "run:test", subject_ref: "node:child", at_sequence: 2, payload: {} },
      { event_id: "3", event_type: "node.being_judged", run_ref: "run:test", subject_ref: "node:child", at_sequence: 3, payload: {} },
      { event_id: "4", event_type: "node.scored", run_ref: "run:test", subject_ref: "node:child", at_sequence: 4, payload: {} }
    ];
    const state = events.reduce(applyRunEvent, createEmptyLiveAnswerState());
    expect(state.nodes["node:child"]?.lifecycle).toBe("scored");
    expect(state.placeholderEdges).toEqual([{ from: "node:child", to: "node:parent", relation: "support" }]);
  });

  it("marks a current-answer refresh required after a staleness wake-up", () => {
    const state = applyRunEvent(
      createEmptyLiveAnswerState(),
      { event_id: "wake", event_type: "honesty.staleness_trigger_fired", run_ref: "run:test", at_sequence: 1, payload: {} }
    );
    expect(state.refreshRequired).toBe(true);
  });

  it("observes every member of the closed event vocabulary", () => {
    const state = EVENT_TYPES.reduce((current, event_type, index) => applyRunEvent(current, {
      event_id: `event:${index}`,
      event_type,
      run_ref: "run:test",
      subject_ref: event_type.startsWith("node.") ? "node:test" : null,
      at_sequence: index + 1,
      payload: event_type === "honesty.investigation_gap_opened" ? {
        gap_ref: "gap:test", gap: "A test-layer gap", verdict: "UNINSTRUMENTED",
        why: "Test-layer coverage", effort_grade: "test-layer",
        constructed_prompt: "Test-layer constructed prompt", accepts_user_input: true, model_authored: true
      } : {}
    }), createEmptyLiveAnswerState());
    expect(Object.keys(state.consumedEvents).sort()).toEqual([...EVENT_TYPES].sort());
  });
});

describe("S14 / W4 / FX-LG-13 — generated client error taxonomy", () => {
  it("prefixes browser contract requests with the same-origin /api route", async () => {
    const { createBrowserContractClient } = await import("../../web/lib/api.js");
    const calls: Array<{ input: string; headers: Headers; credentials: RequestCredentials | undefined }> = [];
    const client = createBrowserContractClient(async (input, init) => {
      calls.push({ input: String(input), headers: new Headers(init?.headers), credentials: init?.credentials });
      return new Response(JSON.stringify({
        asker_id: "user:11111111-1111-4111-8111-111111111111",
        session_id: "22222222-2222-4222-8222-222222222222",
        caller_scope: "ASKER",
        ownership_provenance: "server_session",
        provisional_identity_model: false
      }), { status: 200, headers: { "content-type": "application/json" } });
    }, "/api");

    await expect(client.readSession("token:test")).resolves.toMatchObject({
      session_id: "22222222-2222-4222-8222-222222222222"
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("/api/v1/session");
    expect(calls[0]?.headers.get("x-user-dev-token")).toBeNull();
    expect(calls[0]?.credentials).toBe("same-origin");
  });

  it("branches on typed 429 rather than response prose", async () => {
    const client = createContractClient("https://api.example.test", async () => new Response("arbitrary prose", { status: 429 }));
    const request = client.readAnswer("answer:test", "token:test");
    await expect(request).rejects.toBeInstanceOf(ContractHttpError);
    await expect(request).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("FX-WIRE-01 rejects tier-2 raw_text at the wire", async () => {
    const client = createContractClient("https://api.example.test", async () => new Response(JSON.stringify({
      answer_id: "answer:test",
      answer_version: 1,
      conformance: { outcome: "NOT_RUN", coverage_mode: "NOT_RUN", segment_results: [] },
      segment_suppressions: [],
      shadow_suppressions: [],
      raw_text: "must not cross the inspection boundary"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(client.readInspection("answer:test", "token:test")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("parses SSE incrementally through the generated client", async () => {
    const first = JSON.stringify({ event_id: "1", event_type: "run.accepted", run_ref: "run:test", at_sequence: 1, payload: {} });
    const second = JSON.stringify({ event_id: "2", event_type: "run.running", run_ref: "run:test", at_sequence: 2, payload: {} });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${first}\n\nda`));
        controller.enqueue(new TextEncoder().encode(`ta: ${second}\n\n`));
        controller.close();
      }
    });
    const client = createContractClient("https://api.example.test", async () => new Response(body, { status: 200 }));
    const observed: RunEvent[] = [];
    await client.streamEvents("run:test", "token:test", (event) => observed.push(event));
    expect(observed.map((event) => event.event_type)).toEqual(["run.accepted", "run.running"]);
  });
});
