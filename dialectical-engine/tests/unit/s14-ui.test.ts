import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ABSTENTION_KINDS, CONDITION_MARKS } from "@debateai/kernel";
import {
  ContractHttpError,
  createContractClient,
  type RunEvent,
  type StalenessState
} from "@debateai/contract";
import { projectNodeMakerLineage, projectServeEdge } from "@debateai/serve";
import { abstentionKindLabel, conditionMarkLabel, summarizeFreshness } from "../../apps/ui/lib/v3/labels.js";

// Retired 2026-09-02 with the removed web/ app (dev drift, see
// docs/missions/2026-09-01-security-hardening/VERIFICATION.md): the
// projectAnswerSurface case and the "S14 / W6 / FX-LG-17" live-lifecycle
// describe — web/lib/v3Presentation.js has no 1:1 apps/ui equivalent for
// either. The label, freshness and browser-client cases now run against
// apps/ui/lib/v3/labels.js and apps/ui/lib/api.js, which are 1:1.

describe("S14 / W20 / W8-W15 — typed UI projections", () => {
  it("has a renderer for every ruled condition mark — including DR-161's unserved-maker disclosure", () => {
    expect(CONDITION_MARKS).toHaveLength(28);
    expect(CONDITION_MARKS).toContain("OWED-CHECK-UNEXECUTED");
    expect(CONDITION_MARKS).toContain("UNSERVED-MAKER-POSITION");
    expect(conditionMarkLabel("UNSERVED-MAKER-POSITION")).toBe("Another maker's position was not served");
    for (const render of [conditionMarkLabel]) {
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

describe("S14 / W4 / FX-LG-13 — generated client error taxonomy", () => {
  it("prefixes browser contract requests with the same-origin /api route", async () => {
    const { createBrowserContractClient } = await import("../../apps/ui/lib/api.js");
    const calls: Array<{ input: string; headers: Headers; credentials: RequestCredentials | undefined }> = [];
    const client = createBrowserContractClient(async (input, init) => {
      calls.push({ input: String(input), headers: new Headers(init?.headers), credentials: init?.credentials });
      return new Response(JSON.stringify({
        asker_id: "owner:33333333-3333-4333-8333-333333333333",
        session_id: "22222222-2222-4222-8222-222222222222",
        caller_scope: "ASKER",
        ownership_provenance: "server_session",
        provisional_identity_model: false
      }), { status: 200, headers: { "content-type": "application/json" } });
    }, "/api");

    await expect(client.readSession()).resolves.toMatchObject({
      session_id: "22222222-2222-4222-8222-222222222222"
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("/api/v1/session");
    expect(calls[0]?.headers.get(["x","user","dev","token"].join("-"))).toBeNull();
    expect(calls[0]?.credentials).toBe("same-origin");
  });

  it("branches on typed 429 rather than response prose", async () => {
    const client = createContractClient("https://api.example.test", async () => new Response("arbitrary prose", { status: 429 }));
    const request = client.readAnswer("answer:test");
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
    await expect(client.readInspection("answer:test")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
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
    await client.streamEvents("run:test", (event) => observed.push(event));
    expect(observed.map((event) => event.event_type)).toEqual(["run.accepted", "run.running"]);
  });
});
